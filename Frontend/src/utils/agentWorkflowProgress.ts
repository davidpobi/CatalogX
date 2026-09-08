import { AgentWorkflowProgressStep, type AgentWorkflowProgress } from "@/interfaces/concierge";

export const agentWorkflowProgressCopy = (progress: AgentWorkflowProgress | null) => {
  if (!progress) return { task: "Starting your search", agentLabel: "Catalogue workflow working" };
  switch (progress.step) {
    case AgentWorkflowProgressStep.Understanding: return { task: "Understanding your request", agentLabel: "Search agent working" };
    case AgentWorkflowProgressStep.Searching: return { task: "Searching the catalogue", agentLabel: "Search agent working" };
    case AgentWorkflowProgressStep.Reviewing: return { task: `Reviewing ${progress.reviewedCount ?? progress.resultCount ?? 0} matches`, agentLabel: "Review agent working" };
    case AgentWorkflowProgressStep.Retrying: return { task: "Checking better alternatives", agentLabel: `Search agent working · Retry ${progress.retry ?? 1}` };
    case AgentWorkflowProgressStep.Presenting: return { task: "Preparing recommendations", agentLabel: "Concierge agent working" };
    case AgentWorkflowProgressStep.Fallback: return { task: "Using catalogue search", agentLabel: "Deterministic fallback working" };
    case AgentWorkflowProgressStep.Ready: return { task: "Ready", agentLabel: "Catalogue workflow complete" };
  }
};
