import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import { SceneOperations, type SceneAnalysisData, type SceneGenerationData } from "@/interfaces/scene";
import { analyzeRoomScene, refreshSceneGeneration, startSceneGeneration } from "../../services/scene.service";
import { failure } from "../../utils/http";

const id = z.string().uuid();
const publicSceneError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  const safe = ["Upload ", "For privacy", "This image", "The uploaded scene", "The scene is not", "Select between", "A selected product", "A selected replacement", "The selected composition", "Room visualization is not configured"];
  return safe.some((prefix) => message.startsWith(prefix)) ? message : fallback;
};
export const generationRequestSchema = z.object({ operation: z.literal(SceneOperations.GenerateScene), sceneId: id, workflowId: id, selectedProductIds: z.array(z.string().min(1).max(100)).min(1).max(8) });
export const generationStatusSchema = z.object({ operation: z.literal(SceneOperations.GetSceneGeneration), generationId: id });

export const analyzeScene = async (form: FormData): Promise<ApiRouteResult<SceneAnalysisData>> => {
  const image = form.get("image");
  if (!image || typeof image !== "object" || !("arrayBuffer" in image) || !("size" in image) || typeof (image as File).name !== "string") return failure(422, "Choose a valid room image.");
  const prompt = typeof form.get("prompt") === "string" ? String(form.get("prompt")) : "";
  try { return { status: 200, data: await analyzeRoomScene(image as Blob, prompt) }; }
  catch (error) { return failure(422, publicSceneError(error, "This room image could not be analyzed.")); }
};
export const generateScene = async (body: unknown): Promise<ApiRouteResult<SceneGenerationData>> => {
  const parsed = generationRequestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "A valid scene, workflow, and product selection are required.");
  try { return { status: 202, data: await startSceneGeneration(parsed.data.sceneId, parsed.data.workflowId, parsed.data.selectedProductIds) }; }
  catch (error) { return failure(422, publicSceneError(error, "The room visualization could not be started.")); }
};
export const getSceneGeneration = async (body: unknown): Promise<ApiRouteResult<SceneGenerationData>> => {
  const parsed = generationStatusSchema.safeParse(body);
  if (!parsed.success) return failure(422, "A valid generation ID is required.");
  try { return { status: 200, data: await refreshSceneGeneration(parsed.data.generationId) }; }
  catch (error) { return failure(422, publicSceneError(error, "The room visualization is unavailable.")); }
};
