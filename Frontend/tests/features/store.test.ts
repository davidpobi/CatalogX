import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@/redux/store";
import { queueSearchSubmission, aiRequestCompleted, aiRequestStarted, aiWorkflowProgressed, setAIPlan } from "@/redux/slices/aiSlice";
import { analyzeSceneAction, consumePendingSearchAction, executeSuggestionAction, initializeCatalogAction } from "@/redux/catalogThunks";
import { listProducts, queryProducts } from "@/services/catalog.service";
import { queryConcierge } from "@/services/concierge.service";
import { analyzeScene } from "@/services/scene.service";
import { AgentWorkflowProgressStep, AgentWorkflowStatus } from "@/interfaces/concierge";
import { emptyQueryPlan } from "@/utils/queryPlan";

vi.mock("@/services/catalog.service", () => ({ listProducts: vi.fn(), queryProducts: vi.fn(), replaceBundleProduct: vi.fn() }));
vi.mock("@/services/concierge.service", () => ({ queryConcierge: vi.fn() }));
vi.mock("@/services/audio.service", () => ({ transcribeSearchAudio: vi.fn() }));
vi.mock("@/services/scene.service", () => ({ analyzeScene: vi.fn(), generateScene: vi.fn(), getSceneGeneration: vi.fn() }));
vi.mock("@/services/analytics.service", () => ({ trackCatalogEvent: vi.fn() }));
vi.mock("@/services/persistence.service", () => ({ addRecentSearch: vi.fn(() => []), clearRecentSearches: vi.fn(() => []), getRecentSearches: vi.fn(() => []), getSavedProductIds: vi.fn(() => []), removeRecentSearch: vi.fn(() => []), toggleSavedProduct: vi.fn(() => []) }));

const facets = { categories: [], productTypes: [], rooms: [], styles: [], colors: [], materials: [], availability: [], price: { min: 0, max: 0 } };
const interpretation = { summary: "Understood", chips: [], assumptions: [] };
const assessment = { resultCount: 0, constraintsSatisfied: [], constraintsWithoutCoverage: [], bundleComplete: true, missingBundleCategories: [], remainingBudget: null, candidateRelaxations: [] };
const conciergeResult = (plan = emptyQueryPlan("oak chair")) => ({
  workflowId: "workflow-1", plan, interpretation,
  catalog: { mode: "products" as const, products: [], bundle: null, total: 0, facets, assessment, suggestions: [] },
  review: { status: AgentWorkflowStatus.Fallback, reviewedProductIds: [], acceptedProductIds: [], rejected: [], missingRequirements: [], retryRecommended: false, attempts: 0 },
  presentation: { summary: "Understood", productRationales: [], guidance: "Try another room." },
});

describe("Redux application state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the catalogue once for the store lifetime", async () => {
    vi.mocked(listProducts).mockResolvedValue({ products: [], facets, catalogueVersion: "v1", total: 0, nextCursor: null });
    const store = makeStore();
    await store.dispatch(initializeCatalogAction());
    await store.dispatch(initializeCatalogAction());
    expect(listProducts).toHaveBeenCalledTimes(1);
    expect(store.getState().data.catalogueStatus).toBe("succeeded");
  });

  it("stores a validated room analysis and supplies a default furnishing prompt", async () => {
    vi.mocked(analyzeScene).mockResolvedValue({ sceneId: "scene", previewUrl: "data:image/jpeg;base64,x", expiresAt: "2026-09-08T00:00:00Z", analysis: { validRoomScene: true, containsIdentifiablePeople: false, roomType: "living room", confidence: 0.9, existingProductTypes: [], missingProductTypes: [], suggestedCategories: ["seating"], styles: [], colors: [], materials: [], lighting: [], useCases: [], usableZones: [], retainElements: [], placementConstraints: [] } });
    const store = makeStore();
    await store.dispatch(analyzeSceneAction(new File(["room"], "room.jpg", { type: "image/jpeg" })));
    expect(store.getState().scene.analysis?.analysis.roomType).toBe("living room");
    expect(store.getState().ai.draft).toBe("Furnish this space");
  });

  it("consumes a landing submission exactly once", async () => {
    const plan = emptyQueryPlan("oak chair");
    vi.mocked(queryConcierge).mockResolvedValue(conciergeResult(plan));
    const store = makeStore();
    store.dispatch(queueSearchSubmission("oak chair"));
    await Promise.all([store.dispatch(consumePendingSearchAction()), store.dispatch(consumePendingSearchAction())]);
    expect(queryConcierge).toHaveBeenCalledTimes(1);
    expect(store.getState().ai.pendingSubmission).toBeNull();
  });

  it("records live workflow progress and ignores stale events", async () => {
    const plan = emptyQueryPlan("oak chair");
    vi.mocked(queryConcierge).mockImplementation(async (_prompt, _previousPlan, onProgress) => {
      onProgress?.({ requestId: "server-request", workflowId: "workflow-1", step: AgentWorkflowProgressStep.Understanding, status: "running", agent: "search" });
      onProgress?.({ requestId: "server-request", workflowId: "workflow-1", step: AgentWorkflowProgressStep.Reviewing, status: "running", agent: "review", reviewedCount: 2 });
      return conciergeResult(plan);
    });
    const store = makeStore();
    store.dispatch(queueSearchSubmission("oak chair"));
    await store.dispatch(consumePendingSearchAction());
    store.dispatch(aiWorkflowProgressed({ requestId: "stale", progress: { requestId: "stale", workflowId: "stale", step: AgentWorkflowProgressStep.Retrying, status: "running", agent: "search", retry: 1 } }));
    expect(store.getState().ai.completedWorkflowSteps).toContain(AgentWorkflowProgressStep.Understanding);
    expect(store.getState().ai.workflowProgress?.step).toBe(AgentWorkflowProgressStep.Reviewing);
    expect(store.getState().ai.workflowId).toBe("workflow-1");
  });

  it("ignores completion from a stale AI request", () => {
    const store = makeStore();
    store.dispatch(aiRequestStarted({ requestId: "old", prompt: "old" }));
    store.dispatch(aiRequestStarted({ requestId: "new", prompt: "new" }));
    store.dispatch(aiRequestCompleted({ requestId: "old", plan: emptyQueryPlan("old"), interpretation }));
    expect(store.getState().ai.status).toBe("loading");
    store.dispatch(aiRequestCompleted({ requestId: "new", plan: emptyQueryPlan("new"), interpretation }));
    expect(store.getState().ai.plan.searchText).toBe("new");
  });

  it("executes verified suggestion patches without recompiling", async () => {
    const store = makeStore();
    const plan = emptyQueryPlan("chairs");
    store.dispatch(setAIPlan(plan));
    vi.mocked(queryProducts).mockResolvedValue({ mode: "products", products: [], bundle: null, total: 0, facets, assessment, suggestions: [] });
    await store.dispatch(executeSuggestionAction({
      id: "in-stock", label: "Only show in-stock", prompt: "Only show pieces that are in stock",
      patch: [{ operation: "add", field: "filters.availability", value: "in_stock" }], reason: "Available now.",
    }));
    expect(queryConcierge).not.toHaveBeenCalled();
    expect(vi.mocked(queryProducts).mock.calls[0][0].filters.availability).toEqual(["in_stock"]);
    expect(store.getState().ai.draft).toBe("Only show pieces that are in stock");
    expect(store.getState().ai.interpretation?.chips).toEqual([
      expect.objectContaining({ field: "filters.availability", value: "in_stock" }),
    ]);
  });
});
