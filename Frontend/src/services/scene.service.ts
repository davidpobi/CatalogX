import type { SceneAnalysisData, SceneGenerationData } from "@/interfaces/scene";
import { SceneOperations } from "@/interfaces/scene";
import { normalizeApiError, postApi, postFormApi } from "./apiClient.service";

export const analyzeScene = async (file: File, prompt?: string, signal?: AbortSignal) => {
  try {
    const form = new FormData();
    form.set("operation", SceneOperations.AnalyzeScene);
    form.set("image", file);
    if (prompt?.trim()) form.set("prompt", prompt.trim());
    return await postFormApi<SceneAnalysisData>("/api/scene", form, signal);
  } catch (error) { throw normalizeApiError(error, "This space could not be analyzed."); }
};

export const generateScene = async (sceneId: string, workflowId: string, selectedProductIds: string[], signal?: AbortSignal) => {
  try { return await postApi<SceneGenerationData>("/api/scene", { operation: SceneOperations.GenerateScene, sceneId, workflowId, selectedProductIds }, signal); }
  catch (error) { throw normalizeApiError(error, "The furnished view could not be started."); }
};

export const getSceneGeneration = async (generationId: string, signal?: AbortSignal) => {
  try { return await postApi<SceneGenerationData>("/api/scene", { operation: SceneOperations.GetSceneGeneration, generationId }, signal); }
  catch (error) { throw normalizeApiError(error, "The furnished view status is unavailable."); }
};
