import type { CatalogQueryPlanV1, InterpretationChip } from "@/interfaces/search";
import type { SearchSuggestion } from "@/interfaces/intelligence";
import { listProducts, queryProducts, replaceBundleProduct } from "@/services/catalog.service";
import { queryConcierge } from "@/services/concierge.service";
import { analyzeScene, generateScene, getSceneGeneration } from "@/services/scene.service";
import { SceneGenerationStatus } from "@/interfaces/scene";
import { transcribeSearchAudio } from "@/services/audio.service";
import { trackCatalogEvent } from "@/services/analytics.service";
import { addRecentSearch, clearRecentSearches, getRecentSearches, getSavedProductIds, removeRecentSearch } from "@/services/persistence.service";
import { applyQueryPlanPatch, isPlanConstraintActive, removePlanConstraint } from "@/utils/queryPlan";
import { aiRequestCompleted, aiRequestFailed, aiRequestStarted, aiWorkflowProgressed, clearPendingSubmission, markSubmissionConsumed, removeInterpretationChip, setAIDraft, setAIError, setAIPlan, suggestionApplied } from "./slices/aiSlice";
import { catalogueLoadCompleted, catalogueLoadFailed, catalogueLoadStarted, cataloguePageLoadCompleted, cataloguePageLoadFailed, cataloguePageLoadStarted, localStateHydrated, queryCompleted, queryFailed, queryStarted, recentSearchesChanged } from "./slices/dataSlice";
import { invalidateSceneWorkflow, sceneGenerationCompleted, sceneGenerationFailed, sceneGenerationProgressed, sceneGenerationStarted, sceneUploadCompleted, sceneUploadFailed, sceneUploadStarted, sceneWorkflowAuthorized } from "./slices/sceneSlice";
import type { AppThunk, RootState } from "./store";

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const requestId = () => crypto.randomUUID();

export const initializeCatalogAction = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const status = getState().data.catalogueStatus;
  if (status === "loading" || status === "succeeded") return;
  dispatch(catalogueLoadStarted());
  try { dispatch(catalogueLoadCompleted(await listProducts())); }
  catch (error) { dispatch(catalogueLoadFailed(message(error, "The catalogue could not be loaded."))); }
};

export const loadNextCatalogPageAction = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const { catalogueNextCursor, cataloguePageStatus, queryStatus } = getState().data;
  if (!catalogueNextCursor || cataloguePageStatus === "loading" || queryStatus !== "idle") return;
  dispatch(cataloguePageLoadStarted());
  try { dispatch(cataloguePageLoadCompleted(await listProducts(catalogueNextCursor))); }
  catch (error) { dispatch(cataloguePageLoadFailed(message(error, "More catalogue pieces could not be loaded."))); }
};

export const hydrateLocalDataAction = (): AppThunk => (dispatch, getState) => {
  if (getState().data.localStateHydrated) return;
  dispatch(localStateHydrated({ savedProductIds: getSavedProductIds(), recentSearches: getRecentSearches() }));
};

const executeCompiledSearch = async (dispatch: Parameters<AppThunk>[0], getState: () => RootState, prompt: string) => {
  const id = requestId();
  dispatch(aiRequestStarted({ requestId: id, prompt }));
  dispatch(queryStarted(id));
  try {
    const previousPlan = getState().ai.plan.searchText ? getState().ai.plan : null;
    const concierge = await queryConcierge(prompt, previousPlan, (progress) => dispatch(aiWorkflowProgressed({ requestId: id, progress })), undefined, getState().scene.analysis?.sceneId);
    const result = concierge.catalog;
    if (getState().ai.activeRequestId !== id || getState().data.activeRequestId !== id) return;
    dispatch(aiRequestCompleted({
      requestId: id,
      plan: concierge.plan,
      interpretation: concierge.interpretation,
      conciergePresentation: concierge.presentation,
      workflowId: concierge.workflowId,
      workflowStatus: concierge.review.status,
    }));
    dispatch(queryCompleted({ requestId: id, result }));
    const activeSceneId = getState().scene.analysis?.sceneId;
    if (concierge.sceneId && concierge.sceneId === activeSceneId) {
      dispatch(sceneWorkflowAuthorized({
        sceneId: concierge.sceneId,
        workflowId: concierge.workflowId,
        productIds: (result.bundle?.products ?? result.products).map((item) => item.product.id),
      }));
    }
    dispatch(recentSearchesChanged(addRecentSearch(prompt, (result.bundle?.products || result.products).slice(0, 3).map((item) => item.product.id))));
    void trackCatalogEvent(result.total ? "catalog_search" : "zero_results", { mode: concierge.plan.mode, resultBucket: result.total === 0 ? "0" : result.total < 10 ? "1-9" : "10+" });
  } catch (error) {
    const detail = message(error, "Search is temporarily unavailable.");
    dispatch(aiRequestFailed({ requestId: id, error: detail }));
    dispatch(queryFailed({ requestId: id, error: detail }));
  }
};

export const submitSearchAction = (prompt?: string): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const value = (prompt ?? getState().ai.draft).trim();
  if (value.length < 2) return;
  await executeCompiledSearch(dispatch, getState, value);
};

export const consumePendingSearchAction = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const pending = getState().ai.pendingSubmission;
  if (!pending || pending.consumed) return;
  dispatch(markSubmissionConsumed(pending.id));
  await dispatch(submitSearchAction(pending.prompt));
  dispatch(clearPendingSubmission(pending.id));
};

export const transcribePromptAction = (audio: Blob): AppThunk<Promise<string | null>> => async (dispatch) => {
  try {
    const { transcript } = await transcribeSearchAudio(audio);
    dispatch(setAIDraft(transcript));
    return transcript;
  } catch (error) { dispatch(setAIError(message(error, "Voice search is temporarily unavailable."))); return null; }
};

export const transcribeAndSearchAction = (audio: Blob): AppThunk<Promise<void>> => async (dispatch) => {
  const transcript = await dispatch(transcribePromptAction(audio));
  if (transcript) await dispatch(submitSearchAction(transcript));
};

export const executePlanAction = (plan: CatalogQueryPlanV1): AppThunk<Promise<void>> => async (dispatch) => {
  const id = requestId();
  dispatch(setAIPlan(plan)); dispatch(invalidateSceneWorkflow()); dispatch(queryStarted(id));
  try { dispatch(queryCompleted({ requestId: id, result: await queryProducts(plan) })); }
  catch (error) { dispatch(queryFailed({ requestId: id, error: message(error, "The catalogue could not be searched.") })); }
};

export const executeSuggestionAction = (suggestion: SearchSuggestion): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const state = getState();
  const next = suggestion.patch.reduce(applyQueryPlanPatch, state.ai.plan);
  const chipFields = new Set<InterpretationChip["field"]>([
    "categories", "filters.productTypes", "filters.rooms", "filters.styles", "filters.colors",
    "filters.materials", "filters.availability", "filters.price.max", "filters.discountOnly",
    "exclusions.productTypes", "exclusions.colors", "exclusions.materials", "exclusions.tags",
  ]);
  const retained = (state.ai.interpretation?.chips ?? []).filter((chip) => isPlanConstraintActive(next, chip));
  const added = suggestion.patch.flatMap<InterpretationChip>((patch, index) => {
    if (patch.operation === "remove" || patch.value === null || patch.value === false || !chipFields.has(patch.field as InterpretationChip["field"])) return [];
    const value = patch.value;
    const plainLabel = String(value).replaceAll("_", " ").replaceAll("-", " ");
    const label = patch.field === "filters.price.max" ? `Under $${value}`
      : patch.field.startsWith("exclusions.") ? `No ${plainLabel}`
      : plainLabel;
    return [{ id: `suggestion-${suggestion.id}-${index}`, field: patch.field as InterpretationChip["field"], value, label }];
  });
  const chips = [...retained, ...added.filter((chip) => !retained.some((item) => item.field === chip.field && item.value === chip.value))];
  dispatch(suggestionApplied({ plan: next, prompt: suggestion.prompt, summary: suggestion.reason, chips }));
  await dispatch(executePlanAction(next));
};

export const removeChipAction = (chip: Pick<InterpretationChip, "field" | "value">): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const next = removePlanConstraint(getState().ai.plan, chip.field, chip.value);
  dispatch(removeInterpretationChip(chip));
  await dispatch(executePlanAction(next));
};

export const replaceBundleItemAction = (targetProductId: string): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const bundle = getState().data.bundle;
  if (!bundle) return;
  const id = requestId(); dispatch(queryStarted(id));
  try {
    const currentProductIds = bundle.products.map((item) => item.product.id);
    dispatch(queryCompleted({ requestId: id, result: await replaceBundleProduct(getState().ai.plan, currentProductIds, targetProductId) }));
    dispatch(invalidateSceneWorkflow());
    void trackCatalogEvent("bundle_replace", { mode: "bundle" });
  } catch (error) { dispatch(queryFailed({ requestId: id, error: message(error, "A replacement could not be found.") })); }
};

export const analyzeSceneAction = (file: File): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const id = requestId(); dispatch(sceneUploadStarted(id));
  try {
    const data = await analyzeScene(file, getState().ai.draft);
    dispatch(sceneUploadCompleted({ requestId: id, data }));
    if (!getState().ai.draft.trim()) dispatch(setAIDraft("Furnish this space"));
  } catch (error) { dispatch(sceneUploadFailed({ requestId: id, error: message(error, "This space could not be analyzed.") })); }
};

export const generateSceneAction = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  const scene = getState().scene.analysis;
  const workflowId = getState().scene.authorizedWorkflowId;
  const selected = getState().scene.authorizedProductIds.slice(0, 8);
  if (!scene || !workflowId || !selected.length) return;
  const id = requestId();
  try {
    let generation = await generateScene(scene.sceneId, workflowId, selected);
    dispatch(sceneGenerationStarted({ requestId: id, data: generation }));
    for (let attempt = 0; attempt < 60 && ![SceneGenerationStatus.Completed, SceneGenerationStatus.Failed].includes(generation.status); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      generation = await getSceneGeneration(generation.generationId);
      dispatch(sceneGenerationProgressed(generation));
    }
    if (generation.status === SceneGenerationStatus.Completed) dispatch(sceneGenerationCompleted(generation));
    else dispatch(sceneGenerationFailed({ generationId: generation.generationId, error: generation.error ?? "The furnished view timed out." }));
  } catch (error) { dispatch(sceneGenerationFailed({ error: message(error, "The furnished view could not be generated.") })); }
};

export const removeRecentSearchAction = (id: string): AppThunk => (dispatch) => {
  dispatch(recentSearchesChanged(removeRecentSearch(id)));
};

export const clearRecentSearchesAction = (): AppThunk => (dispatch) => {
  dispatch(recentSearchesChanged(clearRecentSearches()));
};
