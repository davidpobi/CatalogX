import "server-only";
import type { AgentWorkflowEvent } from "@/interfaces/concierge";

export const logAgentWorkflowEvent = (event: AgentWorkflowEvent) => {
  console.info(JSON.stringify({ source: "catalogx-agent-workflow", ...event }));
};
