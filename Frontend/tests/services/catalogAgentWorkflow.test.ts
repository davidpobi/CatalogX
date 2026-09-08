import { afterEach, describe, expect, it, vi } from "vitest";
import { Runner } from "@openai/agents";
import catalogue from "@/data/catalog.json";
import type { Product } from "@/interfaces/catalog";
import { AgentWorkflowProgressStep, AgentWorkflowStatus, ReviewReason, type AgentWorkflowProgress } from "@/interfaces/concierge";
import { getCatalogIntelligenceContext } from "@/app/api/services/catalogIntelligence.service";
import {
  preserveHardConstraints,
  runCatalogAgentWorkflow,
  resultReviewOutputSchema,
  selectReviewCandidates,
  softenInferredBundleProductTypes,
  buildGroundedConciergePresentation,
  validateResultReview,
} from "@/app/api/services/catalogAgentWorkflow.service";
import { executeCatalogQuery } from "@/utils/catalogQuery";
import { emptyQueryPlan } from "@/utils/queryPlan";
import { buildSearchVocabulary, normalizeCompiledSearch } from "@/utils/searchVocabulary";

const products = catalogue as Product[];
const interpretation = { summary: "Oak seating under $300.", chips: [], assumptions: [] };
type MockSearchContext = {
  products: Product[];
  result: ReturnType<typeof executeCatalogQuery> | null;
  plan: ReturnType<typeof emptyQueryPlan> | null;
  toolCalls: number;
  preserveHardConstraintsFrom?: ReturnType<typeof emptyQueryPlan> | null;
};

const installRunnerSequence = (steps: Array<(options: { context?: MockSearchContext }) => unknown>) => {
  let index = 0;
  return vi.spyOn(Runner.prototype, "run").mockImplementation((async (...args: unknown[]) => {
    const step = steps[index++];
    if (!step) throw new Error("Unexpected agent run.");
    return { finalOutput: step((args[2] ?? {}) as { context?: MockSearchContext }) };
  }) as never);
};

const searchStep = (plan: ReturnType<typeof emptyQueryPlan>) => (options: { context?: MockSearchContext }) => {
  if (!options.context) throw new Error("Missing search context.");
  const normalizedPlan = normalizeCompiledSearch({ plan, interpretation, compiler: "fallback" }, buildSearchVocabulary(options.context.products)).plan;
  const authoritativePlan = options.context.preserveHardConstraintsFrom
    ? preserveHardConstraints(options.context.preserveHardConstraintsFrom, normalizedPlan)
    : normalizedPlan;
  options.context.toolCalls = 1;
  options.context.plan = authoritativePlan;
  (options.context as MockSearchContext & { onCatalogueQuery?: () => void }).onCatalogueQuery?.();
  options.context.result = executeCatalogQuery(options.context.products, authoritativePlan);
  return { plan, interpretation };
};

describe("catalogue agent workflow boundaries", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("limits visual review to the top eight valid catalogue candidates", () => {
    const result = executeCatalogQuery(products, emptyQueryPlan("seating"));
    const candidates = selectReviewCandidates(result);
    expect(candidates).toHaveLength(8);
    expect(new Set(candidates.map((item) => item.product.id)).size).toBe(8);
  });

  it("rejects unknown IDs from review and concierge outputs", () => {
    const candidates = selectReviewCandidates(executeCatalogQuery(products, emptyQueryPlan())).slice(0, 2);
    expect(() => validateResultReview({
      acceptedProductIds: ["invented-product"], rejected: candidates.map((item) => ({ productId: item.product.id, reasons: [ReviewReason.ConstraintMismatch] })), missingRequirements: [], retryRecommended: false,
    }, candidates)).toThrow("unknown product ID");
    expect(() => buildGroundedConciergePresentation({
      productRationales: [{ productId: "invented-product", reasonIndex: 0 }], suggestionIds: [],
    }, candidates, [], "products")).toThrow("unknown product ID");
    expect(resultReviewOutputSchema.safeParse({
      acceptedProductIds: [], rejected: [{ productId: candidates[0].product.id, reasons: ["invented_reason"] }],
      missingRequirements: [], retryRecommended: false,
    }).success).toBe(false);
  });

  it("requires review to classify every supplied candidate", () => {
    const candidates = selectReviewCandidates(executeCatalogQuery(products, emptyQueryPlan())).slice(0, 2);
    expect(() => validateResultReview({
      acceptedProductIds: [candidates[0].product.id], rejected: [], missingRequirements: [], retryRecommended: false,
    }, candidates)).toThrow("classify every candidate");
  });

  it("builds concierge copy only from deterministic reasons and suggestions", () => {
    const result = executeCatalogQuery(products, emptyQueryPlan());
    const candidates = selectReviewCandidates(result).slice(0, 2);
    const presentation = buildGroundedConciergePresentation({
      productRationales: candidates.map((item) => ({ productId: item.product.id, reasonIndex: 0 })),
      suggestionIds: result.suggestions.slice(0, 1).map((item) => item.id),
    }, candidates, result.suggestions, "products");
    expect(presentation.productRationales.map((item) => item.rationale)).toEqual(candidates.map((item) => item.reasons[0]));
    expect(presentation.guidance).toBe(result.suggestions[0].label);
  });

  it("preserves every hard constraint during the controlled retry", () => {
    const original = emptyQueryPlan("oak seating under $300 without black");
    original.categories = ["seating"];
    original.filters.materials = ["oak"];
    original.filters.price.max = 300;
    original.exclusions.colors = ["black"];
    const retry = emptyQueryPlan("changed");
    retry.categories = ["lighting"];
    retry.filters.price.max = 900;
    retry.preferences = [{ field: "style", value: "japandi", weight: 0.8 }];
    const preserved = preserveHardConstraints(original, retry);
    expect(preserved.categories).toEqual(original.categories);
    expect(preserved.filters).toEqual(original.filters);
    expect(preserved.exclusions).toEqual(original.exclusions);
    expect(preserved.preferences).toEqual(retry.preferences);
  });

  it("keeps generic bundle roles broad while preserving explicitly named product types", () => {
    const plan = emptyQueryPlan("A compact oak desk and comfortable chair for a small home office");
    plan.mode = "bundle";
    plan.filters.productTypes = ["writing-desk", "desk-chair"];
    plan.bundle = { room: "home office", budget: null, requiredCategories: ["tables-desks", "seating"], itemCount: 2 };

    const generic = softenInferredBundleProductTypes(plan, plan.searchText);
    expect(generic.filters.productTypes).toEqual([]);
    expect(generic.preferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "productType", value: "writing-desk" }),
      expect.objectContaining({ field: "productType", value: "desk-chair" }),
    ]));

    const explicit = softenInferredBundleProductTypes(plan, "I need a writing desk and desk chair");
    expect(explicit.filters.productTypes).toEqual(["writing-desk", "desk-chair"]);
  });

  it("keeps provider-free search functional and application logs sanitized", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const prompt = "private prompt oak seating under $300";
    const output = await runCatalogAgentWorkflow({
      prompt,
      previousPlan: null,
      products,
      context: getCatalogIntelligenceContext(products),
      requestId: "request-test",
    });
    expect(output.catalog.products.length).toBeGreaterThan(0);
    expect(output.review.status).toBe("fallback");
    const logs = info.mock.calls.flat().join("\n");
    expect(logs).toContain("workflow.started");
    expect(logs).toContain("workflow.completed");
    expect(logs).not.toContain(prompt);
    expect(logs).not.toContain("firebasestorage.googleapis.com");
    expect(Object.values(ReviewReason)).toContain(ReviewReason.ConstraintMismatch);
  });

  it("turns scene-led discovery into a deterministic room bundle", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const output = await runCatalogAgentWorkflow({
      prompt: "make this space feel complete",
      previousPlan: null,
      products,
      context: getCatalogIntelligenceContext(products),
      requestId: "scene-search",
      scene: { sceneId: "scene", imageUrl: "data:image/jpeg;base64,room", analysis: { validRoomScene: true, containsIdentifiablePeople: false, roomType: "living room", confidence: 0.92, existingProductTypes: [], missingProductTypes: ["armchair", "coffee-table"], suggestedCategories: ["seating", "tables-desks", "lighting"], styles: ["modern"], colors: ["oat"], materials: ["oak"], lighting: ["natural"], useCases: ["relaxing"], usableZones: [], retainElements: [], placementConstraints: [] } },
    });
    expect(output.plan.mode).toBe("bundle");
    expect(output.plan.bundle).toMatchObject({ room: "living room", requiredCategories: ["seating", "tables-desks", "lighting"], itemCount: 3 });
    expect(output.catalog.bundle?.products.length).toBeGreaterThan(0);
  });

  it("runs search, review, and grounded concierge stages successfully", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plan = emptyQueryPlan("oak seating under $300");
    plan.categories = ["seating"];
    plan.filters.materials = ["oak"];
    plan.filters.price.max = 300;
    const result = executeCatalogQuery(products, plan);
    const candidates = selectReviewCandidates(result);
    installRunnerSequence([
      searchStep(plan),
      () => ({ acceptedProductIds: candidates.map((item) => item.product.id), rejected: [], missingRequirements: [], retryRecommended: false }),
      () => ({ productRationales: candidates.map((item) => ({ productId: item.product.id, reasonIndex: 0 })), suggestionIds: result.suggestions.slice(0, 1).map((item) => item.id) }),
    ]);
    const progress: AgentWorkflowProgress[] = [];
    const output = await runCatalogAgentWorkflow({ prompt: plan.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "success", onProgress: (event) => progress.push(event) });
    expect(output.review.status).toBe(AgentWorkflowStatus.Reviewed);
    expect(output.catalog.products.map((item) => item.product.id)).toEqual(candidates.map((item) => item.product.id));
    expect(output.presentation.productRationales[0].rationale).toBe(candidates[0].reasons[0]);
    expect(progress.map((event) => event.step)).toEqual([
      AgentWorkflowProgressStep.Understanding,
      AgentWorkflowProgressStep.Searching,
      AgentWorkflowProgressStep.Reviewing,
      AgentWorkflowProgressStep.Presenting,
      AgentWorkflowProgressStep.Ready,
    ]);
    expect(progress.find((event) => event.step === AgentWorkflowProgressStep.Reviewing)?.categoryIds)
      .toEqual(candidates.slice(0, 4).map((item) => item.product.category));
    const logs = info.mock.calls.flat().join("\n");
    expect(logs).toContain('"event":"workflow.progress"');
    expect(logs).toContain(`"task":"Reviewing ${candidates.length} matches"`);
    expect(logs).toContain('"agentLabel":"Review agent working"');
    expect(logs).toContain('"task":"Preparing recommendations"');
    expect(logs).toContain('"agentLabel":"Concierge agent working"');
  });

  it("does not retry when every available result passes review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plan = emptyQueryPlan("show these pieces");
    plan.filters.productTypes = ["armchair", "accent-chair"];
    const candidates = selectReviewCandidates(executeCatalogQuery(products, plan));
    expect(candidates).toHaveLength(2);
    const runSpy = installRunnerSequence([
      searchStep(plan),
      () => ({ acceptedProductIds: candidates.map((item) => item.product.id), rejected: [], missingRequirements: [], retryRecommended: true }),
      () => ({ productRationales: candidates.map((item) => ({ productId: item.product.id, reasonIndex: 0 })), suggestionIds: [] }),
    ]);
    const progress: AgentWorkflowProgress[] = [];
    const output = await runCatalogAgentWorkflow({ prompt: plan.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "no-retry", onProgress: (event) => progress.push(event) });
    expect(runSpy).toHaveBeenCalledTimes(3);
    expect(output.review.status).toBe(AgentWorkflowStatus.Reviewed);
    expect(progress.some((event) => event.step === AgentWorkflowProgressStep.Retrying)).toBe(false);
  });

  it("preserves deterministic results when visual review fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plan = emptyQueryPlan("oak seating");
    plan.categories = ["seating"];
    installRunnerSequence([searchStep(plan), () => { throw new Error("review unavailable"); }]);
    const output = await runCatalogAgentWorkflow({ prompt: plan.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "review-failure" });
    expect(output.review.status).toBe(AgentWorkflowStatus.Fallback);
    expect(output.catalog.total).toBeGreaterThan(0);
    expect(output.catalog.products).toHaveLength(Math.min(plan.limit, output.catalog.total));
  });

  it("performs only one retry and keeps hard constraints", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const original = emptyQueryPlan("oak seating under $300");
    original.categories = ["seating"];
    original.filters.materials = ["oak"];
    original.filters.price.max = 300;
    const initialCandidates = selectReviewCandidates(executeCatalogQuery(products, original));
    const retry = structuredClone(original);
    retry.preferences = [{ field: "style", value: "japandi", weight: 0.8 }];
    const retryCandidates = selectReviewCandidates(executeCatalogQuery(products, retry));
    const runSpy = installRunnerSequence([
      searchStep(original),
      () => ({
        acceptedProductIds: initialCandidates.slice(0, 2).map((item) => item.product.id),
        rejected: initialCandidates.slice(2).map((item) => ({ productId: item.product.id, reasons: [ReviewReason.WeakVisualFit] })),
        missingRequirements: [], retryRecommended: true,
      }),
      searchStep(retry),
      () => ({ productRationales: retryCandidates.map((item) => ({ productId: item.product.id, reasonIndex: 0 })), suggestionIds: [] }),
    ]);
    const output = await runCatalogAgentWorkflow({ prompt: original.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "retry" });
    expect(runSpy).toHaveBeenCalledTimes(4);
    expect(output.review.status).toBe(AgentWorkflowStatus.Recovered);
    expect(output.plan.filters).toEqual(original.filters);
    expect(output.review.attempts).toBe(2);
  });

  it("falls back deterministically when the search agent fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    installRunnerSequence([() => { throw new Error("search unavailable"); }]);
    const output = await runCatalogAgentWorkflow({ prompt: "oak seating", previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "search-failure" });
    expect(output.review.status).toBe(AgentWorkflowStatus.Fallback);
    expect(output.catalog.total).toBeGreaterThan(0);
  });

  it("keeps the initial reviewed set when the single retry fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plan = emptyQueryPlan("oak seating");
    plan.categories = ["seating"];
    const result = executeCatalogQuery(products, plan);
    const candidates = selectReviewCandidates(result);
    const accepted = candidates.slice(0, 2);
    const runSpy = installRunnerSequence([
      searchStep(plan),
      () => ({
        acceptedProductIds: accepted.map((item) => item.product.id),
        rejected: candidates.slice(2).map((item) => ({ productId: item.product.id, reasons: [ReviewReason.WeakVisualFit] })),
        missingRequirements: [], retryRecommended: true,
      }),
      () => { throw new Error("retry unavailable"); },
      () => ({ productRationales: accepted.map((item) => ({ productId: item.product.id, reasonIndex: 0 })), suggestionIds: [] }),
    ]);
    const output = await runCatalogAgentWorkflow({ prompt: plan.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "retry-failure" });
    expect(runSpy).toHaveBeenCalledTimes(4);
    expect(output.review.status).toBe(AgentWorkflowStatus.Reviewed);
    expect(output.review.attempts).toBe(2);
    expect(output.catalog.products.map((item) => item.product.id)).toEqual(accepted.map((item) => item.product.id));
  });

  it("uses deterministic presentation when the concierge fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plan = emptyQueryPlan("oak seating");
    plan.categories = ["seating"];
    const result = executeCatalogQuery(products, plan);
    const candidates = selectReviewCandidates(result);
    installRunnerSequence([
      searchStep(plan),
      () => ({ acceptedProductIds: candidates.map((item) => item.product.id), rejected: [], missingRequirements: [], retryRecommended: false }),
      () => { throw new Error("concierge unavailable"); },
    ]);
    const output = await runCatalogAgentWorkflow({ prompt: plan.searchText, previousPlan: null, products, context: getCatalogIntelligenceContext(products), requestId: "concierge-failure" });
    expect(output.review.status).toBe(AgentWorkflowStatus.Reviewed);
    expect(output.presentation.productRationales[0].rationale).toBe(candidates[0].reasons[0]);
  });
});
