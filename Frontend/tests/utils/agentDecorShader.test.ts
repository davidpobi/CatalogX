import { describe, expect, it } from "vitest";
import { AgentWorkflowProgressStep, type AgentWorkflowProgress } from "@/interfaces/concierge";
import { agentDecorVisualState } from "@/utils/agentDecorShader";

const progress = (step: AgentWorkflowProgressStep, values: Partial<AgentWorkflowProgress> = {}): AgentWorkflowProgress => ({
  requestId: "request-1",
  workflowId: "workflow-1",
  step,
  status: "running",
  agent: "search",
  ...values,
});

describe("agentDecorVisualState", () => {
  it("maps workflow steps to distinct motion controls", () => {
    const understanding = agentDecorVisualState(progress(AgentWorkflowProgressStep.Understanding));
    const searching = agentDecorVisualState(progress(AgentWorkflowProgressStep.Searching));
    const reviewing = agentDecorVisualState(progress(AgentWorkflowProgressStep.Reviewing, { reviewedCount: 4 }));

    expect(understanding.speed).toBeLessThan(searching.speed);
    expect(searching.speed).toBeGreaterThan(reviewing.speed);
    expect(reviewing.elementCount).toBe(4);
    expect(understanding.categoryIds).toEqual([]);
  });

  it("uses accepted counts and retry number without receiving catalogue records", () => {
    const state = agentDecorVisualState(progress(AgentWorkflowProgressStep.Retrying, { acceptedCount: 1, retry: 1, categoryIds: ["lighting", "storage"] }));

    expect(state.elementCount).toBe(4);
    expect(state.retry).toBe(1);
    expect(state.phase).toBe(AgentWorkflowProgressStep.Retrying);
    expect(state.categoryIds).toEqual(["lighting", "storage", "lighting", "storage"]);
  });
});
