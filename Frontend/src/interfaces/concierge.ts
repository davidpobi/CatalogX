import type { CatalogQueryData, Product } from "./catalog";
import type { CatalogQueryPlanV1, SearchInterpretation } from "./search";

export enum ConciergeOperations {
  QueryCatalogue = "queryCatalogue",
}

export enum ReviewReason {
  ConstraintMismatch = "constraint_mismatch",
  ImageMismatch = "image_mismatch",
  ImageUnavailable = "image_unavailable",
  WeakVisualFit = "weak_visual_fit",
  BundleIncoherent = "bundle_incoherent",
  MissingBundleRole = "missing_bundle_role",
}

export enum AgentWorkflowStatus {
  Reviewed = "reviewed",
  Recovered = "recovered",
  NotRequired = "not_required",
  Fallback = "fallback",
}

export enum AgentWorkflowStep {
  WorkflowProgress = "workflow.progress",
  WorkflowStarted = "workflow.started",
  IntentCompiled = "intent.compiled",
  CatalogueQueried = "catalogue.queried",
  ResultsReviewed = "results.reviewed",
  SearchRetryRequested = "search.retry_requested",
  ConciergeCompleted = "concierge.completed",
  WorkflowCompleted = "workflow.completed",
  WorkflowFailed = "workflow.failed",
}

export enum AgentWorkflowProgressStep {
  Understanding = "understanding",
  Searching = "searching",
  Reviewing = "reviewing",
  Retrying = "retrying",
  Presenting = "presenting",
  Ready = "ready",
  Fallback = "fallback",
}

export type AgentWorkflowProgressStatus = "running" | "completed" | "fallback";
export type AgentWorkflowProgressAgent = "search" | "review" | "concierge" | "catalogue";

export interface AgentWorkflowProgress {
  requestId: string;
  workflowId: string;
  step: AgentWorkflowProgressStep;
  status: AgentWorkflowProgressStatus;
  agent: AgentWorkflowProgressAgent;
  resultCount?: number;
  reviewedCount?: number;
  acceptedCount?: number;
  retry?: number;
  categoryIds?: import("./catalog").CategoryId[];
}

export type ConciergeStreamChunk =
  | { type: "progress"; data: AgentWorkflowProgress }
  | { type: "result"; data: ConciergeQueryData; requestId: string }
  | { type: "error"; message: string; requestId: string };

export interface SearchAgentResult {
  plan: CatalogQueryPlanV1;
  interpretation: SearchInterpretation;
  compiler: "gpt-5.6-terra" | "fallback";
}

export interface RejectedProductReview {
  productId: string;
  reasons: ReviewReason[];
}

export interface ResultReview {
  status: AgentWorkflowStatus;
  reviewedProductIds: string[];
  acceptedProductIds: string[];
  rejected: RejectedProductReview[];
  missingRequirements: string[];
  retryRecommended: boolean;
  attempts: number;
}

export interface ConciergeProductRationale {
  productId: string;
  rationale: string;
}

export interface ConciergePresentation {
  summary: string;
  productRationales: ConciergeProductRationale[];
  guidance: string;
}

export interface ConciergeQueryData {
  workflowId: string;
  plan: CatalogQueryPlanV1;
  interpretation: SearchInterpretation;
  catalog: CatalogQueryData;
  review: ResultReview;
  presentation: ConciergePresentation;
  sceneId?: string;
}

export interface AgentWorkflowEvent {
  event: AgentWorkflowStep;
  requestId: string;
  workflowId: string;
  timestamp: string;
  durationMs?: number;
  catalogueVersion?: string;
  agent?: "search" | "review" | "concierge" | "workflow";
  compiler?: SearchAgentResult["compiler"];
  resultCount?: number;
  reviewedCount?: number;
  acceptedCount?: number;
  retry?: number;
  reviewStatus?: AgentWorkflowStatus;
  rejectionReasons?: ReviewReason[];
  errorName?: string;
  progressStep?: AgentWorkflowProgressStep;
  progressStatus?: AgentWorkflowProgressStatus;
  task?: string;
  agentLabel?: string;
}

export interface ConciergeReviewCandidate {
  product: Product;
  rank: number;
  reasons: string[];
}
