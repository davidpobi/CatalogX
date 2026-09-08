import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import { ConciergeOperations, type AgentWorkflowProgress, type ConciergeQueryData } from "@/interfaces/concierge";
import { queryPlanSchema } from "@/utils/queryPlan";
import { getCatalogProducts } from "../../services/catalog.repository";
import { getCatalogIntelligenceContext } from "../../services/catalogIntelligence.service";
import { runCatalogAgentWorkflow } from "../../services/catalogAgentWorkflow.service";
import { authorizeSceneWorkflow, getSceneWorkflowContext } from "../../services/scene.service";
import { failure } from "../../utils/http";

export const conciergeRequestSchema = z.object({
  operation: z.literal(ConciergeOperations.QueryCatalogue),
  prompt: z.string().trim().min(2).max(800),
  previousPlan: queryPlanSchema.nullish(),
  sceneId: z.string().uuid().nullish(),
});

export const queryCatalogue = async (body: unknown, requestId: string, onProgress?: (progress: AgentWorkflowProgress) => void): Promise<ApiRouteResult<ConciergeQueryData>> => {
  const parsed = conciergeRequestSchema.safeParse(body);
  if (!parsed.success) return failure(422, "Enter a catalogue request between 2 and 800 characters.");
  const products = await getCatalogProducts();
  const scene = parsed.data.sceneId ? await getSceneWorkflowContext(parsed.data.sceneId) : null;
  if (parsed.data.sceneId && !scene) return failure(422, "The uploaded scene is unavailable or has expired.");
  const data = await runCatalogAgentWorkflow({
    prompt: parsed.data.prompt,
    previousPlan: parsed.data.previousPlan ?? null,
    products,
    context: getCatalogIntelligenceContext(products),
    requestId,
    onProgress,
    scene,
  });
  if (scene) {
    const productIds = (data.catalog.bundle?.products ?? data.catalog.products).map((item) => item.product.id);
    await authorizeSceneWorkflow(scene.sceneId, data.workflowId, productIds, data.plan);
  }
  return {
    status: 200,
    data: { ...data, ...(scene ? { sceneId: scene.sceneId } : {}) },
  };
};
