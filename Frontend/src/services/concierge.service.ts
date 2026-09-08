import type { ApiResponse } from "@/interfaces/api";
import type { AgentWorkflowProgress, ConciergeQueryData, ConciergeStreamChunk } from "@/interfaces/concierge";
import { ConciergeOperations } from "@/interfaces/concierge";
import type { CatalogQueryPlanV1 } from "@/interfaces/search";
import { ApiClientError, normalizeApiError, postApi } from "./apiClient.service";

const payload = (prompt: string, previousPlan?: CatalogQueryPlanV1 | null, sceneId?: string | null) => ({
  operation: ConciergeOperations.QueryCatalogue,
  prompt,
  previousPlan: previousPlan ?? null,
  ...(sceneId ? { sceneId } : {}),
});

const queryConciergeStream = async (prompt: string, previousPlan: CatalogQueryPlanV1 | null | undefined, sceneId: string | null | undefined, onProgress: (progress: AgentWorkflowProgress) => void, signal?: AbortSignal) => {
  const response = await fetch("/api/concierge", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(payload(prompt, previousPlan, sceneId)),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiResponse<null> | null;
    throw new ApiClientError(body?.message || "The request could not be completed.", response.status, body?.requestId || null);
  }
  if (!response.body) throw new ApiClientError("The workflow stream was unavailable.", 0, null);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ConciergeQueryData | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as ConciergeStreamChunk;
    if (chunk.type === "progress") onProgress(chunk.data);
    if (chunk.type === "result") result = chunk.data;
    if (chunk.type === "error") throw new ApiClientError(chunk.message, 503, chunk.requestId);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffer);
  if (!result) throw new ApiClientError("The workflow ended before returning results.", 0, null);
  return result;
};

export const queryConcierge = async (prompt: string, previousPlan?: CatalogQueryPlanV1 | null, onProgress?: (progress: AgentWorkflowProgress) => void, signal?: AbortSignal, sceneId?: string | null) => {
  try {
    if (onProgress) return await queryConciergeStream(prompt, previousPlan, sceneId, onProgress, signal);
    return await postApi<ConciergeQueryData>("/api/concierge", payload(prompt, previousPlan, sceneId), signal);
  } catch (error) {
    throw normalizeApiError(error, "The catalogue concierge is temporarily unavailable.");
  }
};
