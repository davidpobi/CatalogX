import "server-only";
import { Agent, Runner, tool, withTrace, type AgentInputItem } from "@openai/agents";
import { z } from "zod";
import { PRODUCT_TYPE_IDS, type CatalogQueryData, type CategoryId, type Product, type RankedProduct } from "@/interfaces/catalog";
import {
  AgentWorkflowStatus,
  AgentWorkflowStep,
  AgentWorkflowProgressStep,
  ReviewReason,
  type AgentWorkflowProgress,
  type ConciergePresentation,
  type ConciergeQueryData,
  type ResultReview,
  type SearchAgentResult,
} from "@/interfaces/concierge";
import type { CatalogIntelligenceContextV1 } from "@/interfaces/intelligence";
import type { SearchSuggestion } from "@/interfaces/intelligence";
import type { CatalogQueryPlanV1, CompileSearchData } from "@/interfaces/search";
import type { SceneWorkflowContext } from "@/interfaces/scene";
import { PRODUCT_TYPE_ALIASES } from "@/config/catalogIntelligence";
import { executeCatalogQuery } from "@/utils/catalogQuery";
import { agentWorkflowProgressCopy } from "@/utils/agentWorkflowProgress";
import { interpretationSchema, isPlanConstraintActive, queryPlanSchema } from "@/utils/queryPlan";
import { compileFallbackQuery, isRefinementPrompt } from "@/utils/searchFallback";
import { buildSearchVocabulary, normalizeCompiledSearch } from "@/utils/searchVocabulary";
import { logAgentWorkflowEvent } from "./agentWorkflowLog.service";

const MODEL = "gpt-5.6-terra" as const;
const REVIEW_LIMIT = 8;
const MIN_ACCEPTED_RESULTS = 4;

const searchOutputSchema = z.object({ plan: queryPlanSchema, interpretation: interpretationSchema });
const reviewReasonSchema = z.enum(ReviewReason);
export const resultReviewOutputSchema = z.object({
  acceptedProductIds: z.array(z.string().min(1).max(100)).max(REVIEW_LIMIT),
  rejected: z.array(z.object({
    productId: z.string().min(1).max(100),
    reasons: z.array(reviewReasonSchema).min(1).max(4),
  })).max(REVIEW_LIMIT),
  missingRequirements: z.array(z.string().min(1).max(160)).max(10),
  retryRecommended: z.boolean(),
});
export const conciergePresentationOutputSchema = z.object({
  productRationales: z.array(z.object({
    productId: z.string().min(1).max(100),
    reasonIndex: z.number().int().min(0).max(2),
  })).max(REVIEW_LIMIT),
  suggestionIds: z.array(z.string().min(1).max(100)).max(2),
});

interface SearchRunContext {
  products: Product[];
  result: CatalogQueryData | null;
  plan: CatalogQueryPlanV1 | null;
  toolCalls: number;
  preserveHardConstraintsFrom: CatalogQueryPlanV1 | null;
  onCatalogueQuery?: (plan?: CatalogQueryPlanV1, result?: CatalogQueryData) => void;
  prompt: string;
  scene: SceneWorkflowContext | null;
}

const applyScenePlan = (plan: CatalogQueryPlanV1, prompt: string, scene: SceneWorkflowContext | null): CatalogQueryPlanV1 => {
  if (!scene) return plan;
  const explicitProduct = PRODUCT_TYPE_IDS.some((type) => new RegExp(`\\b${type.replaceAll("-", "[ -]")}s?\\b`, "i").test(prompt));
  const next = structuredClone(plan);
  if (!next.filters.rooms.length && scene.analysis.roomType) next.filters.rooms = [scene.analysis.roomType];
  if (!explicitProduct && next.mode !== "bundle") {
    const categories = scene.analysis.suggestedCategories.slice(0, 5);
    if (categories.length) {
      next.mode = "bundle";
      next.bundle = { room: scene.analysis.roomType ?? "uploaded space", budget: next.filters.price.max, requiredCategories: categories, itemCount: categories.length };
      next.filters.price.max = null;
    }
  }
  return next;
};

const phrasePattern = (phrase: string) => new RegExp(`\\b${phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]+")}s?\\b`, "i");

const explicitlyRequestedProductType = (prompt: string, productType: CatalogQueryPlanV1["filters"]["productTypes"][number]) =>
  [productType.replaceAll("-", " "), ...(PRODUCT_TYPE_ALIASES[productType] ?? [])]
    .some((phrase) => phrasePattern(phrase).test(prompt));

export const softenInferredBundleProductTypes = (plan: CatalogQueryPlanV1, prompt: string): CatalogQueryPlanV1 => {
  if (plan.mode !== "bundle" || !plan.filters.productTypes.length) return plan;
  const next = structuredClone(plan);
  const inferred = next.filters.productTypes.filter((productType) => !explicitlyRequestedProductType(prompt, productType));
  if (!inferred.length) return next;
  next.filters.productTypes = next.filters.productTypes.filter((productType) => !inferred.includes(productType));
  for (const productType of inferred) {
    if (!next.preferences.some((preference) => preference.field === "productType" && preference.value === productType)) {
      next.preferences.push({ field: "productType", value: productType, weight: 0.55 });
    }
  }
  return next;
};

const normalizeWorkflowResult = (compiled: CompileSearchData, products: Product[], prompt: string, scene: SceneWorkflowContext | null): CompileSearchData => {
  const vocabulary = buildSearchVocabulary(products);
  const normalized = normalizeCompiledSearch(compiled, vocabulary);
  const plan = applyScenePlan(softenInferredBundleProductTypes(normalized.plan, prompt), prompt, scene);
  return {
    ...normalized,
    plan,
    interpretation: {
      ...normalized.interpretation,
      chips: normalized.interpretation.chips.filter((chip) => isPlanConstraintActive(plan, chip)),
    },
  };
};

const queryCatalogueParameters = z.object({ plan: queryPlanSchema });

const queryCatalogueTool = tool<typeof queryCatalogueParameters, SearchRunContext>({
  name: "query_catalogue",
  description: "Run CatalogX's deterministic filtering, ranking, bundle construction, assessment, and feasible suggestion engine for a complete query plan. Call this exactly once before returning.",
  parameters: queryCatalogueParameters,
  execute: ({ plan }, runContext) => {
    if (!runContext) throw new Error("Catalogue context is unavailable.");
    runContext.context.toolCalls += 1;
    if (runContext.context.toolCalls > 1) throw new Error("The catalogue tool may be called only once.");
    const normalizedPlan = normalizeWorkflowResult({
      plan,
      compiler: "fallback",
      interpretation: { summary: "Catalogue query", chips: [], assumptions: [] },
    }, runContext.context.products, runContext.context.prompt, runContext.context.scene).plan;
    const authoritativePlanBase = runContext.context.preserveHardConstraintsFrom
      ? preserveHardConstraints(runContext.context.preserveHardConstraintsFrom, normalizedPlan)
      : normalizedPlan;
    const authoritativePlan = applyScenePlan(authoritativePlanBase, runContext.context.prompt, runContext.context.scene);
    const result = executeCatalogQuery(runContext.context.products, authoritativePlan);
    runContext.context.plan = authoritativePlan;
    runContext.context.result = result;
    runContext.context.onCatalogueQuery?.(authoritativePlan, result);
    return {
      mode: result.mode,
      total: result.total,
      productIds: result.products.slice(0, REVIEW_LIMIT).map((item) => item.product.id),
      bundleProductIds: result.bundle?.products.map((item) => item.product.id) ?? [],
      assessment: result.assessment,
    };
  },
});

const searchAgent = new Agent<SearchRunContext, typeof searchOutputSchema>({
  name: "CatalogX search specialist",
  model: MODEL,
  modelSettings: { reasoning: { effort: "low" }, text: { verbosity: "low" }, store: false, toolChoice: "required", timeoutMs: 12_000 },
  tools: [queryCatalogueTool],
  outputType: searchOutputSchema,
  instructions: `Compile the customer's request into the supplied strict CatalogX query plan, then call query_catalogue exactly once. Store context and allowed values are authoritative. Preserve explicit budgets, availability, delivery, dimensions, categories, product types, and exclusions as hard constraints. Subjective mood and lifestyle language becomes weighted preferences. For a refinement, preserve constraints the customer did not change. For a retry, preserve every supplied hard constraint and adjust only preferences or sorting in response to review feedback. Never invent products, product IDs, services, values, or availability. Return the final plan and a concise interpretation with removable chips and explicit assumptions.`,
});

const reviewAgent = new Agent({
  name: "CatalogX results reviewer",
  model: MODEL,
  modelSettings: { reasoning: { effort: "low" }, text: { verbosity: "low" }, store: false, timeoutMs: 12_000 },
  outputType: resultReviewOutputSchema,
  instructions: `Review only the supplied candidate records and their images. Check hard-constraint coverage, image and product-detail consistency, image availability, visual fit with the customer's stated intent, and bundle coherence. Accept a product unless there is a concrete mismatch. Use only supplied product IDs and the allowed rejection reason codes. Recommend a retry when fewer than four ordinary results are acceptable, or when a requested bundle is incomplete or incoherent. Do not suggest new products or alter constraints.`,
});

const conciergeAgent = new Agent({
  name: "CatalogX concierge",
  model: MODEL,
  modelSettings: { reasoning: { effort: "low" }, text: { verbosity: "low" }, store: false, timeoutMs: 12_000 },
  outputType: conciergePresentationOutputSchema,
  instructions: `Select the most useful supplied deterministic reason for each accepted product and up to two supplied deterministic suggestions. Return only supplied product IDs, a zero-based reasonIndex from each product's reasons array, and supplied suggestion IDs. Do not write customer-facing prose or invent facts. If this is a retry result, productRationales also acts as the final acceptance list, so omit any item that conflicts with the supplied review feedback.`,
});

const runner = () => new Runner({
  model: MODEL,
  modelSettings: { reasoning: { effort: "low" }, text: { verbosity: "low" }, store: false },
  tracingDisabled: process.env.NODE_ENV === "test",
  traceIncludeSensitiveData: false,
});

const workflowEvent = (requestId: string, workflowId: string, event: AgentWorkflowStep, details: Omit<Parameters<typeof logAgentWorkflowEvent>[0], "requestId" | "workflowId" | "event" | "timestamp"> = {}) => {
  logAgentWorkflowEvent({ requestId, workflowId, event, timestamp: new Date().toISOString(), ...details });
};

const hardConstraintsFrom = (plan: CatalogQueryPlanV1) => ({
  mode: plan.mode,
  categories: structuredClone(plan.categories),
  filters: structuredClone(plan.filters),
  exclusions: structuredClone(plan.exclusions),
  bundle: structuredClone(plan.bundle),
  limit: plan.limit,
});

export const preserveHardConstraints = (original: CatalogQueryPlanV1, retry: CatalogQueryPlanV1): CatalogQueryPlanV1 => ({
  ...retry,
  ...hardConstraintsFrom(original),
  searchText: original.searchText,
  preferences: retry.preferences,
  sort: retry.sort,
});

export const selectReviewCandidates = (result: CatalogQueryData) => {
  const candidates: RankedProduct[] = [];
  const seen = new Set<string>();
  for (const item of [...(result.bundle?.products ?? []), ...result.products]) {
    if (seen.has(item.product.id)) continue;
    seen.add(item.product.id);
    candidates.push(item);
    if (candidates.length === REVIEW_LIMIT) break;
  }
  return candidates;
};

const resultCategoryIds = (items: RankedProduct[]): CategoryId[] => items.slice(0, 4).map((item) => item.product.category);

const planCategoryIds = (plan: CatalogQueryPlanV1): CategoryId[] => [...new Set([
  ...plan.categories,
  ...(plan.bundle?.requiredCategories ?? []),
])].slice(0, 4);

const visualInput = (text: unknown, candidates: RankedProduct[], sceneImage?: string): AgentInputItem[] => [{
  role: "user",
  content: [
    { type: "input_text", text: JSON.stringify(text) },
    ...(sceneImage ? [{ type: "input_image" as const, image: sceneImage, detail: "low" as const }] : []),
    ...candidates.flatMap((item) => item.product.image.heroUrl ? [
      { type: "input_text" as const, text: `Image for product ${item.product.id}` },
      { type: "input_image" as const, image: item.product.image.heroUrl, detail: "low" },
    ] : []),
  ],
}];

export const validateResultReview = (output: z.infer<typeof resultReviewOutputSchema>, candidates: RankedProduct[]): z.infer<typeof resultReviewOutputSchema> => {
  const allowed = new Set(candidates.map((item) => item.product.id));
  const referenced = [...output.acceptedProductIds, ...output.rejected.map((item) => item.productId)];
  if (referenced.some((id) => !allowed.has(id))) throw new Error("Review referenced an unknown product ID.");
  const accepted = new Set(output.acceptedProductIds);
  if (output.rejected.some((item) => accepted.has(item.productId))) throw new Error("Review both accepted and rejected a product.");
  const classified = new Set(referenced);
  if (classified.size !== candidates.length || candidates.some((item) => !classified.has(item.product.id))) {
    throw new Error("Review must classify every candidate.");
  }
  return { ...output, acceptedProductIds: [...accepted] };
};

export const buildGroundedConciergePresentation = (
  output: z.infer<typeof conciergePresentationOutputSchema>,
  candidates: RankedProduct[],
  suggestions: SearchSuggestion[],
  mode: CatalogQueryPlanV1["mode"],
): ConciergePresentation => {
  const allowed = new Set(candidates.map((item) => item.product.id));
  if (output.productRationales.some((item) => !allowed.has(item.productId))) throw new Error("Concierge referenced an unknown product ID.");
  const suggestionsById = new Map(suggestions.map((item) => [item.id, item]));
  if (output.suggestionIds.some((id) => !suggestionsById.has(id))) throw new Error("Concierge referenced an unknown suggestion ID.");
  const uniqueSelections = [...new Map(output.productRationales.map((item) => [item.productId, item])).values()];
  const productsById = new Map(candidates.map((item) => [item.product.id, item]));
  return {
    summary: mode === "bundle"
      ? `A reviewed room edit with ${uniqueSelections.length} compatible pieces.`
      : `${uniqueSelections.length} reviewed catalogue ${uniqueSelections.length === 1 ? "match" : "matches"} for your request.`,
    productRationales: uniqueSelections.map((selection) => {
      const item = productsById.get(selection.productId)!;
      return {
        productId: selection.productId,
        rationale: item.reasons[selection.reasonIndex] ?? item.reasons[0] ?? `${item.product.name} satisfies the active catalogue constraints.`,
      };
    }),
    guidance: output.suggestionIds.map((id) => suggestionsById.get(id)!.label).join(" or ")
      || suggestions.slice(0, 2).map((item) => item.label).join(" or ")
      || "Adjust a filter to refine these results.",
  };
};

const reviewedCatalog = (result: CatalogQueryData, acceptedIds: string[]): CatalogQueryData => {
  const accepted = new Set(acceptedIds);
  return {
    ...result,
    products: result.products.filter((item) => accepted.has(item.product.id)),
    bundle: result.bundle ? { ...result.bundle, products: result.bundle.products.filter((item) => accepted.has(item.product.id)) } : null,
  };
};

const fallbackPresentation = (compiled: CompileSearchData, result: CatalogQueryData): ConciergePresentation => {
  const candidates = selectReviewCandidates(result);
  return {
    summary: compiled.interpretation.summary,
    productRationales: candidates.map((item) => ({
      productId: item.product.id,
      rationale: item.reasons[0] || item.product.description,
    })),
    guidance: result.suggestions.map((suggestion) => suggestion.label).join(" or ") || "Adjust a filter to refine these results.",
  };
};

const searchInput = (prompt: string, context: CatalogIntelligenceContextV1, previousPlan: CatalogQueryPlanV1 | null, reviewFeedback?: ResultReview, scene?: SceneWorkflowContext | null) => JSON.stringify({
  prompt,
  requestMode: isRefinementPrompt(prompt, previousPlan, context) ? "refinement" : "new",
  previousPlan,
  reviewFeedback: reviewFeedback ?? null,
  storeContext: context.store,
  lifestyle: context.lifestyle,
  assortment: context.assortment,
  allowedValues: {
    categories: context.assortment.categories.map((item) => item.id),
    productTypes: context.assortment.productTypes.map((item) => item.id),
    rooms: context.lifestyle.rooms,
    styles: context.lifestyle.styles,
    colors: context.lifestyle.colors,
    materials: context.lifestyle.materials,
    features: context.lifestyle.features,
    useCases: context.lifestyle.useCases,
    tags: context.lifestyle.tags,
  },
  scene: scene ? { analysis: scene.analysis, instruction: "Use scene observations as soft context. Customer text is authoritative. Compose a bundle unless the customer explicitly requests one product type." } : null,
});

export const runCatalogAgentWorkflow = async ({
  prompt,
  previousPlan,
  products,
  context,
  requestId,
  onProgress,
  scene = null,
}: {
  prompt: string;
  previousPlan: CatalogQueryPlanV1 | null;
  products: Product[];
  context: CatalogIntelligenceContextV1;
  requestId: string;
  onProgress?: (progress: AgentWorkflowProgress) => void;
  scene?: SceneWorkflowContext | null;
}): Promise<ConciergeQueryData> => {
  const workflowId = crypto.randomUUID();
  const startedAt = Date.now();
  const progress = (step: AgentWorkflowProgressStep, status: AgentWorkflowProgress["status"], agent: AgentWorkflowProgress["agent"], details: Pick<AgentWorkflowProgress, "resultCount" | "reviewedCount" | "acceptedCount" | "retry" | "categoryIds"> = {}) => {
    const event: AgentWorkflowProgress = { requestId, workflowId, step, status, agent, ...details };
    const copy = agentWorkflowProgressCopy(event);
    workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowProgress, {
      agent: agent === "catalogue" ? "workflow" : agent,
      progressStep: step,
      progressStatus: status,
      task: copy.task,
      agentLabel: copy.agentLabel,
      ...details,
    });
    onProgress?.(event);
  };
  workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowStarted, { agent: "workflow", catalogueVersion: context.catalogueVersion });
  progress(AgentWorkflowProgressStep.Understanding, "running", "search");

  const deterministicFallback = (error?: unknown): ConciergeQueryData => {
    progress(AgentWorkflowProgressStep.Fallback, "fallback", "catalogue");
    const compiled = compileFallbackQuery(prompt, previousPlan, context);
    const normalized = normalizeWorkflowResult(compiled, products, prompt, scene);
    const catalog = executeCatalogQuery(products, normalized.plan);
    const candidateIds = selectReviewCandidates(catalog).map((item) => item.product.id);
    if (error) workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowFailed, { agent: "workflow", errorName: error instanceof Error ? error.name : typeof error });
    const output: ConciergeQueryData = {
      workflowId,
      plan: normalized.plan,
      interpretation: normalized.interpretation,
      catalog,
      review: {
        status: AgentWorkflowStatus.Fallback,
        reviewedProductIds: [],
        acceptedProductIds: candidateIds,
        rejected: [],
        missingRequirements: [],
        retryRecommended: false,
        attempts: 0,
      },
      presentation: fallbackPresentation(normalized, catalog),
    };
    workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowCompleted, { agent: "workflow", compiler: "fallback", resultCount: catalog.total, reviewStatus: AgentWorkflowStatus.Fallback, durationMs: Date.now() - startedAt });
    progress(AgentWorkflowProgressStep.Ready, "completed", "catalogue", { resultCount: catalog.total, acceptedCount: candidateIds.length });
    return output;
  };

  if (!process.env.OPENAI_API_KEY) return deterministicFallback();

  try {
    return await withTrace("CatalogX concierge", async () => {
      const agentRunner = runner();
      const initialSearchContext: SearchRunContext = {
        products, result: null, plan: null, toolCalls: 0, preserveHardConstraintsFrom: null,
        onCatalogueQuery: (plan, result) => {
          const foundCategories = result ? resultCategoryIds(selectReviewCandidates(result)) : [];
          progress(AgentWorkflowProgressStep.Searching, "running", "search", {
            resultCount: result?.total,
            categoryIds: foundCategories.length ? foundCategories : plan ? planCategoryIds(plan) : undefined,
          });
        },
        prompt, scene,
      };
      const searchStarted = Date.now();
      const searchRun = await agentRunner.run(searchAgent, searchInput(prompt, context, previousPlan, undefined, scene), { context: initialSearchContext, maxTurns: 3 });
      if (!searchRun.finalOutput) throw new Error("Search agent returned no output.");
      let compiled: SearchAgentResult = normalizeWorkflowResult({ ...searchRun.finalOutput, compiler: MODEL }, products, prompt, scene);
      if (initialSearchContext.toolCalls !== 1 || !initialSearchContext.plan || !initialSearchContext.result) {
        throw new Error("Search agent did not execute exactly one authoritative catalogue query.");
      }
      if (JSON.stringify(compiled.plan) !== JSON.stringify(initialSearchContext.plan)) {
        throw new Error("Search agent output did not match its catalogue tool query.");
      }
      let catalog = initialSearchContext.result;
      workflowEvent(requestId, workflowId, AgentWorkflowStep.IntentCompiled, { agent: "search", compiler: MODEL, durationMs: Date.now() - searchStarted });
      workflowEvent(requestId, workflowId, AgentWorkflowStep.CatalogueQueried, { agent: "search", resultCount: catalog.total });

      let candidates = selectReviewCandidates(catalog);
      if (!candidates.length) {
        const review: ResultReview = { status: AgentWorkflowStatus.NotRequired, reviewedProductIds: [], acceptedProductIds: [], rejected: [], missingRequirements: [], retryRecommended: false, attempts: 0 };
        const presentation = fallbackPresentation(compiled, catalog);
        workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowCompleted, { agent: "workflow", compiler: MODEL, resultCount: 0, reviewStatus: review.status, durationMs: Date.now() - startedAt });
        progress(AgentWorkflowProgressStep.Ready, "completed", "catalogue", { resultCount: 0, acceptedCount: 0 });
        return { workflowId, plan: compiled.plan, interpretation: compiled.interpretation, catalog, review, presentation };
      }

      const reviewStarted = Date.now();
      progress(AgentWorkflowProgressStep.Reviewing, "running", "review", { resultCount: catalog.total, reviewedCount: candidates.length, categoryIds: resultCategoryIds(candidates) });
      let reviewOutput: z.infer<typeof resultReviewOutputSchema>;
      try {
        const reviewInput = visualInput({
          prompt,
          scene: scene?.analysis ?? null,
          plan: compiled.plan,
          assessment: catalog.assessment,
          candidates: candidates.map((item, rank) => ({ product: item.product, rank: rank + 1, reasons: item.reasons })),
        }, candidates, scene?.imageUrl);
        const reviewRun = await agentRunner.run(reviewAgent, reviewInput, { maxTurns: 1 });
        if (!reviewRun.finalOutput) throw new Error("Review agent returned no output.");
        reviewOutput = validateResultReview(reviewRun.finalOutput, candidates);
      } catch (error) {
        const acceptedProductIds = candidates.map((item) => item.product.id);
        const review: ResultReview = {
          status: AgentWorkflowStatus.Fallback,
          reviewedProductIds: [],
          acceptedProductIds,
          rejected: [],
          missingRequirements: [],
          retryRecommended: false,
          attempts: 1,
        };
        const presentation = fallbackPresentation(compiled, catalog);
        workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowFailed, { agent: "review", errorName: error instanceof Error ? error.name : typeof error });
        workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowCompleted, { agent: "workflow", compiler: MODEL, resultCount: catalog.total, acceptedCount: acceptedProductIds.length, reviewStatus: review.status, durationMs: Date.now() - startedAt });
        progress(AgentWorkflowProgressStep.Ready, "completed", "catalogue", { resultCount: catalog.total, acceptedCount: acceptedProductIds.length });
        return { workflowId, plan: compiled.plan, interpretation: compiled.interpretation, catalog, review, presentation };
      }
      let review: ResultReview = {
        status: AgentWorkflowStatus.Reviewed,
        reviewedProductIds: candidates.map((item) => item.product.id),
        acceptedProductIds: reviewOutput.acceptedProductIds,
        rejected: reviewOutput.rejected,
        missingRequirements: reviewOutput.missingRequirements,
        retryRecommended: reviewOutput.retryRecommended,
        attempts: 1,
      };
      workflowEvent(requestId, workflowId, AgentWorkflowStep.ResultsReviewed, {
        agent: "review", reviewedCount: candidates.length, acceptedCount: review.acceptedProductIds.length,
        rejectionReasons: [...new Set(review.rejected.flatMap((item) => item.reasons))], durationMs: Date.now() - reviewStarted,
      });

      const ordinaryRetry = compiled.plan.mode === "products"
        && review.acceptedProductIds.length < MIN_ACCEPTED_RESULTS
        && (review.rejected.length > 0 || review.missingRequirements.length > 0);
      const bundleRetry = compiled.plan.mode === "bundle"
        && !catalog.assessment.bundleComplete
        && (catalog.assessment.candidateRelaxations.length > 0 || catalog.suggestions.length > 0);
      const supportedReviewRetry = review.retryRecommended
        && (review.rejected.length > 0 || review.missingRequirements.length > 0);
      const needsRetry = supportedReviewRetry || ordinaryRetry || bundleRetry;
      if (needsRetry) {
        workflowEvent(requestId, workflowId, AgentWorkflowStep.SearchRetryRequested, { agent: "search", retry: 1, acceptedCount: review.acceptedProductIds.length });
        progress(AgentWorkflowProgressStep.Retrying, "running", "search", { retry: 1, acceptedCount: review.acceptedProductIds.length, categoryIds: resultCategoryIds(candidates.filter((item) => review.acceptedProductIds.includes(item.product.id))) });
        try {
          const retryContext: SearchRunContext = {
            products, result: null, plan: null, toolCalls: 0, preserveHardConstraintsFrom: compiled.plan, prompt, scene,
            onCatalogueQuery: (_plan, result) => progress(AgentWorkflowProgressStep.Retrying, "running", "search", {
              retry: 1,
              resultCount: result?.total,
              categoryIds: result ? resultCategoryIds(selectReviewCandidates(result)) : undefined,
            }),
          };
          const retryRun = await agentRunner.run(searchAgent, searchInput(prompt, context, compiled.plan, review, scene), { context: retryContext, maxTurns: 3 });
          if (!retryRun.finalOutput) throw new Error("Retry search agent returned no output.");
          const retryCompiled = normalizeWorkflowResult({ ...retryRun.finalOutput, compiler: MODEL }, products, prompt, scene);
          const retryPlan = preserveHardConstraints(compiled.plan, retryCompiled.plan);
          if (retryContext.toolCalls !== 1 || !retryContext.plan || !retryContext.result) {
            throw new Error("Retry search did not execute exactly one authoritative catalogue query.");
          }
          if (JSON.stringify(retryPlan) !== JSON.stringify(retryContext.plan)) {
            throw new Error("Retry search output did not match its catalogue tool query.");
          }
          compiled = { ...retryCompiled, plan: retryPlan };
          catalog = retryContext.result;
          candidates = selectReviewCandidates(catalog);
          review = {
            ...review,
            status: AgentWorkflowStatus.Recovered,
            reviewedProductIds: candidates.map((item) => item.product.id),
            acceptedProductIds: candidates.map((item) => item.product.id),
            retryRecommended: false,
            attempts: 2,
          };
          workflowEvent(requestId, workflowId, AgentWorkflowStep.CatalogueQueried, { agent: "search", retry: 1, resultCount: catalog.total });
        } catch (error) {
          review = { ...review, retryRecommended: false, attempts: 2 };
          workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowFailed, { agent: "search", retry: 1, errorName: error instanceof Error ? error.name : typeof error });
        }
      }

      const acceptedCandidates = candidates.filter((item) => review.acceptedProductIds.includes(item.product.id));
      progress(AgentWorkflowProgressStep.Presenting, "running", "concierge", { resultCount: catalog.total, acceptedCount: acceptedCandidates.length, categoryIds: resultCategoryIds(acceptedCandidates) });
      const conciergeInput = visualInput({
        prompt,
        interpretation: compiled.interpretation,
        review,
        products: acceptedCandidates.map((item) => ({ product: item.product, reasons: item.reasons })),
        assessment: catalog.assessment,
        suggestions: catalog.suggestions,
      }, review.status === AgentWorkflowStatus.Recovered ? acceptedCandidates : []);
      let presentation: ConciergePresentation;
      try {
        const conciergeStarted = Date.now();
        const conciergeRun = await agentRunner.run(conciergeAgent, conciergeInput, { maxTurns: 1 });
        if (!conciergeRun.finalOutput) throw new Error("Concierge returned no output.");
        presentation = buildGroundedConciergePresentation(conciergeRun.finalOutput, acceptedCandidates, catalog.suggestions, compiled.plan.mode);
        if (review.status === AgentWorkflowStatus.Recovered) {
          const finalAccepted = presentation.productRationales.map((item) => item.productId);
          review = { ...review, acceptedProductIds: finalAccepted };
        }
        workflowEvent(requestId, workflowId, AgentWorkflowStep.ConciergeCompleted, { agent: "concierge", acceptedCount: review.acceptedProductIds.length, durationMs: Date.now() - conciergeStarted });
      } catch (error) {
        presentation = fallbackPresentation(compiled, reviewedCatalog(catalog, review.acceptedProductIds));
        workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowFailed, { agent: "concierge", errorName: error instanceof Error ? error.name : typeof error });
      }

      const reviewedResult = reviewedCatalog(catalog, review.acceptedProductIds);
      workflowEvent(requestId, workflowId, AgentWorkflowStep.WorkflowCompleted, { agent: "workflow", compiler: MODEL, resultCount: catalog.total, acceptedCount: review.acceptedProductIds.length, reviewStatus: review.status, durationMs: Date.now() - startedAt });
      progress(AgentWorkflowProgressStep.Ready, "completed", "concierge", { resultCount: catalog.total, acceptedCount: review.acceptedProductIds.length });
      return { workflowId, plan: compiled.plan, interpretation: { ...compiled.interpretation, summary: presentation.summary }, catalog: reviewedResult, review, presentation };
    }, { groupId: requestId, metadata: { requestId, workflowId, catalogueVersion: context.catalogueVersion } });
  } catch (error) {
    return deterministicFallback(error);
  }
};
