import type { CatalogFacets, CatalogQueryData, Product, RankedProduct } from "./catalog";
import type { SearchSuggestion } from "./intelligence";
import type { CatalogQueryPlanV1, SearchInterpretation } from "./search";
import type { AgentWorkflowProgress, AgentWorkflowProgressStep, AgentWorkflowStatus, ConciergePresentation } from "./concierge";
import type { SceneAnalysisData, SceneGenerationData } from "./scene";
export interface RecentSearch { id: string; prompt: string; createdAt: string; productIds: string[] }

export type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

export interface PendingSearchSubmission {
  id: string;
  prompt: string;
  consumed: boolean;
}

export interface AIState {
  draft: string;
  plan: CatalogQueryPlanV1;
  interpretation: SearchInterpretation | null;
  conciergePresentation: ConciergePresentation | null;
  workflowId: string | null;
  workflowStatus: AgentWorkflowStatus | null;
  workflowProgress: AgentWorkflowProgress | null;
  completedWorkflowSteps: AgentWorkflowProgressStep[];
  status: RequestStatus;
  pendingSubmission: PendingSearchSubmission | null;
  activeRequestId: string | null;
  error: string | null;
}

export interface SceneState {
  analysis: SceneAnalysisData | null;
  generation: SceneGenerationData | null;
  authorizedWorkflowId: string | null;
  authorizedProductIds: string[];
  uploadStatus: RequestStatus;
  generationStatus: RequestStatus;
  activeRequestId: string | null;
  error: string | null;
}

export interface CatalogDataState {
  catalogueProducts: Product[];
  facets: CatalogFacets | null;
  catalogueVersion: string | null;
  catalogueStatus: RequestStatus;
  queryStatus: RequestStatus;
  total: number;
  results: RankedProduct[];
  bundle: CatalogQueryData["bundle"];
  suggestions: SearchSuggestion[];
  assessment: CatalogQueryData["assessment"] | null;
  activeRequestId: string | null;
  error: string | null;
  savedProductIds: string[];
  recentSearches: RecentSearch[];
  localStateHydrated: boolean;
}
