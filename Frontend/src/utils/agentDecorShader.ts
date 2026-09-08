import { AgentWorkflowProgressStep, type AgentWorkflowProgress } from "@/interfaces/concierge";
import type { CategoryId } from "@/interfaces/catalog";

type AgentDecorVisualState = {
  phase: AgentWorkflowProgressStep;
  speed: number;
  intensity: number;
  elementCount: number;
  retry: number;
  categoryIds: CategoryId[];
};

/** Maps sanitized workflow progress to decorative shader controls only. */
export function agentDecorVisualState(progress: AgentWorkflowProgress): AgentDecorVisualState {
  const elementCount = 4;
  const suppliedCategories = progress.categoryIds?.slice(0, elementCount) ?? [];
  const categoryIds = suppliedCategories.length
    ? Array.from({ length: elementCount }, (_, index) => suppliedCategories[index % suppliedCategories.length])
    : [];

  switch (progress.step) {
    case AgentWorkflowProgressStep.Understanding:
      return { phase: progress.step, speed: 0.45, intensity: 0.7, elementCount, retry: 0, categoryIds };
    case AgentWorkflowProgressStep.Searching:
      return { phase: progress.step, speed: 1.3, intensity: 0.9, elementCount, retry: 0, categoryIds };
    case AgentWorkflowProgressStep.Reviewing:
      return { phase: progress.step, speed: 0.7, intensity: 0.8, elementCount, retry: 0, categoryIds };
    case AgentWorkflowProgressStep.Retrying:
      return { phase: progress.step, speed: 1.15, intensity: 1, elementCount, retry: progress.retry ?? 1, categoryIds };
    case AgentWorkflowProgressStep.Presenting:
      return { phase: progress.step, speed: 0.3, intensity: 0.65, elementCount, retry: 0, categoryIds };
    default:
      return { phase: progress.step, speed: 0.2, intensity: 0.55, elementCount, retry: 0, categoryIds };
  }
}
