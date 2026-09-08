import "server-only";
import crypto from "node:crypto";
import Replicate from "replicate";
import sharp from "sharp";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { CATEGORY_IDS, PRODUCT_TYPE_IDS, type Product } from "@/interfaces/catalog";
import { SceneGenerationStatus, type RoomSceneAnalysis, type SceneAnalysisData, type SceneGenerationData, type SceneVerification, type SceneWorkflowContext } from "@/interfaces/scene";
import type { CatalogQueryPlanV1 } from "@/interfaces/search";
import { getOpenAI } from "../config/openai";
import { getAdminBucket, getAdminDb } from "../config/firebaseAdmin";
import { getCatalogProducts } from "./catalog.repository";

const MAX_BYTES = 10_000_000;
const MAX_PIXELS = 20_000_000;
const EXPIRES_MS = 24 * 60 * 60_000;
const REFERENCE_LIMIT = 8;
const SCENE_MODEL = "gpt-5.6-luna" as const;
const IMAGE_MODEL = "google/nano-banana-2" as const;
const projectTypes = [...PRODUCT_TYPE_IDS];

const analysisSchema = z.object({
  validRoomScene: z.boolean(), containsIdentifiablePeople: z.boolean(), roomType: z.string().nullable(), confidence: z.number().min(0).max(1),
  existingProductTypes: z.array(z.enum(projectTypes as [typeof projectTypes[number], ...typeof projectTypes])),
  missingProductTypes: z.array(z.enum(projectTypes as [typeof projectTypes[number], ...typeof projectTypes])),
  suggestedCategories: z.array(z.enum(CATEGORY_IDS)), styles: z.array(z.string().max(60)).max(8), colors: z.array(z.string().max(40)).max(8), materials: z.array(z.string().max(40)).max(8),
  lighting: z.array(z.string().max(80)).max(6), useCases: z.array(z.string().max(80)).max(6),
  usableZones: z.array(z.object({ label: z.string().max(60), placement: z.string().max(160), suitableProductTypes: z.array(z.enum(projectTypes as [typeof projectTypes[number], ...typeof projectTypes])) })).max(8),
  retainElements: z.array(z.string().max(120)).max(12), placementConstraints: z.array(z.string().max(160)).max(12),
});

const verificationSchema = z.object({
  scenePreserved: z.boolean(), selectedProductsRepresented: z.boolean(), architectureChanged: z.boolean(), substitutionsDetected: z.boolean(), extraObjectsIntroduced: z.boolean(), confidence: z.number().min(0).max(1), notes: z.array(z.string().max(180)).max(8),
});

interface SceneRecord extends SceneAnalysisData {
  normalizedImage: Buffer | null;
  storagePath: string | null;
  authorizedWorkflows: Record<string, { productIds: string[]; plan: CatalogQueryPlanV1 }>;
}
interface GenerationRecord extends SceneGenerationData { predictionId: string; selectedProductIds: string[]; }

const scenes = new Map<string, SceneRecord>();
const generations = new Map<string, GenerationRecord>();
const publicGeneration = (record: GenerationRecord): SceneGenerationData => ({
  generationId: record.generationId, sceneId: record.sceneId, workflowId: record.workflowId,
  status: record.status, outputUrl: record.outputUrl, expiresAt: record.expiresAt,
  attempt: record.attempt, illustrative: record.illustrative, verification: record.verification, error: record.error,
});
const isProductionStorage = () => process.env.NODE_ENV === "production" && Boolean(process.env.NEXT_PUBLIC_FIREBASE_PUBLIC_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
const sceneDocument = (id: string) => getAdminDb().collection("projects").doc("CatalogX").collection("scenes").doc(id);
const generationDocument = (id: string) => getAdminDb().collection("projects").doc("CatalogX").collection("sceneGenerations").doc(id);
const dataUrl = (bytes: Buffer) => `data:image/jpeg;base64,${bytes.toString("base64")}`;
const logSceneEvent = (event: string, details: Record<string, string | number | boolean | null>) => console.info(JSON.stringify({ source: "catalogx-scene-workflow", event, timestamp: new Date().toISOString(), ...details }));
const isoDate = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : "";

const persistScene = async (record: SceneRecord) => {
  scenes.set(record.sceneId, record);
  if (!isProductionStorage()) return;
  await sceneDocument(record.sceneId).set({ ...record, normalizedImage: null, expiresAt: new Date(record.expiresAt), updatedAt: new Date() });
};
const persistGeneration = async (record: GenerationRecord) => {
  generations.set(record.generationId, record);
  if (isProductionStorage()) await generationDocument(record.generationId).set({ ...record, expiresAt: new Date(record.expiresAt), updatedAt: new Date() });
};

const getScene = async (sceneId: string): Promise<SceneRecord | null> => {
  let record = scenes.get(sceneId) ?? null;
  if (!record && isProductionStorage()) {
    const snapshot = await sceneDocument(sceneId).get();
    if (snapshot.exists) { const data = snapshot.data() as Omit<SceneRecord, "normalizedImage">; record = { ...data, expiresAt: isoDate(data.expiresAt), normalizedImage: null } as SceneRecord; }
  }
  if (!record || Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
};
const getGeneration = async (generationId: string): Promise<GenerationRecord | null> => {
  let record = generations.get(generationId) ?? null;
  if (!record && isProductionStorage()) {
    const snapshot = await generationDocument(generationId).get();
    if (snapshot.exists) { const data = snapshot.data() as GenerationRecord; record = { ...data, expiresAt: isoDate(data.expiresAt) }; }
  }
  if (!record || Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
};
const privateImageUrl = async (record: SceneRecord) => {
  if (record.normalizedImage) return dataUrl(record.normalizedImage);
  if (!record.storagePath) throw new Error("Scene image is unavailable.");
  const [url] = await getAdminBucket().file(record.storagePath).getSignedUrl({ action: "read", expires: record.expiresAt });
  return url;
};

export const analyzeRoomScene = async (image: Blob, prompt = ""): Promise<SceneAnalysisData> => {
  if (image.size < 1 || image.size > MAX_BYTES) throw new Error("Upload a room image smaller than 10 MB.");
  const source = Buffer.from(await image.arrayBuffer());
  const metadata = await sharp(source, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Upload a valid JPEG, PNG, or WebP room image up to 20 megapixels.");
  const normalized = await sharp(source).rotate().flatten({ background: "#f7f2e8" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const imageData = dataUrl(normalized);
  const moderation = await getOpenAI().moderations.create({ model: "omni-moderation-latest", input: [{ type: "image_url", image_url: { url: imageData } }] });
  if (moderation.results.some((result) => result.flagged)) throw new Error("This image cannot be used for a room visualization.");
  const response = await getOpenAI().responses.parse({
    model: SCENE_MODEL, store: false, reasoning: { effort: "low" },
    instructions: "Validate and annotate a customer room photograph for furniture discovery. Reject non-room images and images with identifiable people. Use only the supplied product types and categories. Describe visible evidence conservatively. Do not infer exact measurements. Missing product types should be useful additions, not every absent object.",
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ customerGoal: prompt.slice(0, 800), allowedProductTypes: PRODUCT_TYPE_IDS, allowedCategories: CATEGORY_IDS }) }, { type: "input_image", image_url: imageData, detail: "high" }] }],
    text: { format: zodTextFormat(analysisSchema, "room_scene_analysis") },
  });
  const analysis = response.output_parsed as RoomSceneAnalysis | null;
  if (!analysis?.validRoomScene) throw new Error("Upload a clear photograph of a room or home space.");
  if (analysis.containsIdentifiablePeople) throw new Error("For privacy, upload a room photograph without people.");
  const sceneId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString();
  let storagePath: string | null = null;
  let previewUrl = imageData;
  let normalizedImage: Buffer | null = normalized;
  if (isProductionStorage()) {
    storagePath = `projects/CatalogX/scenes/${sceneId}/source.jpg`;
    await getAdminBucket().file(storagePath).save(normalized, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=900" } });
    [previewUrl] = await getAdminBucket().file(storagePath).getSignedUrl({ action: "read", expires: expiresAt });
    normalizedImage = null;
  }
  const record: SceneRecord = { sceneId, previewUrl, expiresAt, analysis, normalizedImage, storagePath, authorizedWorkflows: {} };
  await persistScene(record);
  logSceneEvent("scene.analyzed", { sceneId, roomType: analysis.roomType, confidence: analysis.confidence });
  return { sceneId, previewUrl, expiresAt, analysis };
};

export const getSceneWorkflowContext = async (sceneId: string): Promise<SceneWorkflowContext | null> => {
  const record = await getScene(sceneId);
  return record ? { sceneId, analysis: record.analysis, imageUrl: await privateImageUrl(record) } : null;
};

export const authorizeSceneWorkflow = async (sceneId: string, workflowId: string, productIds: string[], plan: CatalogQueryPlanV1) => {
  const record = await getScene(sceneId);
  if (!record) throw new Error("The uploaded scene has expired.");
  record.authorizedWorkflows[workflowId] = { productIds: [...new Set(productIds)].slice(0, REFERENCE_LIMIT), plan };
  await persistScene(record);
};

const safeSelectedProducts = async (record: SceneRecord, workflowId: string, requestedIds: string[]) => {
  const authorization = record.authorizedWorkflows[workflowId];
  if (!authorization) throw new Error("The scene is not associated with this search.");
  const catalogue = await getCatalogProducts();
  const byId = new Map(catalogue.map((product) => [product.id, product]));
  const selected = [...new Set(requestedIds)].map((id) => byId.get(id)).filter((product): product is Product => Boolean(product));
  if (!selected.length || selected.length > REFERENCE_LIMIT || selected.length !== new Set(requestedIds).size) throw new Error("Select between one and eight valid catalogue products.");
  const required = new Set(authorization.plan.bundle?.requiredCategories ?? authorization.plan.categories);
  if (required.size && selected.some((product) => !required.has(product.category))) throw new Error("A selected product is outside the reviewed composition.");
  if (selected.some((product) => !authorization.productIds.includes(product.id))) throw new Error("A selected product is outside the reviewed composition.");
  if (authorization.plan.bundle?.budget !== null && authorization.plan.bundle?.budget !== undefined && selected.reduce((sum, product) => sum + product.currentPrice, 0) > authorization.plan.bundle.budget) throw new Error("The selected composition exceeds its budget.");
  return selected;
};

const generationPrompt = (record: SceneRecord, products: Product[]) => `Edit the first image, which is the customer's room. Furnish it using only the exact catalogue products shown in the following reference images. Preserve camera position, perspective, walls, floors, ceiling, windows, doors, permanent fixtures, lighting direction, and retained elements. Do not redesign the architecture or add unselected furniture. Place products at plausible scale using their supplied dimensions. Product facts: ${JSON.stringify(products.map((product, index) => ({ reference: index + 2, id: product.id, name: product.name, type: product.productType, colors: product.colors, materials: product.materials, dimensions: product.dimensions })))}. Scene constraints: ${JSON.stringify({ zones: record.analysis.usableZones, retain: record.analysis.retainElements, constraints: record.analysis.placementConstraints })}. Return one photorealistic furnished view with no text or labels.`;

const replicateClient = () => {
  if (!process.env.REPLICATE_API_TOKEN) throw new Error("Room visualization is not configured.");
  return new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
};

export const startSceneGeneration = async (sceneId: string, workflowId: string, selectedProductIds: string[]): Promise<SceneGenerationData> => {
  const record = await getScene(sceneId);
  if (!record) throw new Error("The uploaded scene has expired.");
  const products = await safeSelectedProducts(record, workflowId, selectedProductIds);
  const prediction = await replicateClient().predictions.create({ model: IMAGE_MODEL, input: { prompt: generationPrompt(record, products), image_input: [await privateImageUrl(record), ...products.map((product) => product.image.heroUrl).filter((url): url is string => Boolean(url))], aspect_ratio: "match_input_image", resolution: "2K", output_format: "jpg" } });
  const generation: GenerationRecord = { generationId: crypto.randomUUID(), sceneId, workflowId, status: SceneGenerationStatus.Generating, outputUrl: null, expiresAt: record.expiresAt, attempt: 1, illustrative: false, verification: null, error: null, predictionId: prediction.id, selectedProductIds: products.map((product) => product.id) };
  await persistGeneration(generation);
  logSceneEvent("generation.started", { sceneId, generationId: generation.generationId, workflowId, productCount: products.length, attempt: 1 });
  return publicGeneration(generation);
};

const outputUrl = (output: unknown): string | null => typeof output === "string" ? output : Array.isArray(output) && typeof output[0] === "string" ? output[0] : output && typeof output === "object" && "url" in output && typeof (output as { url: unknown }).url === "function" ? String((output as { url: () => URL }).url()) : null;

const verifyGeneration = async (record: SceneRecord, generation: GenerationRecord, generatedUrl: string, products: Product[]): Promise<SceneVerification> => {
  const response = await getOpenAI().responses.parse({
    model: SCENE_MODEL, store: false, reasoning: { effort: "low" },
    instructions: "Compare the original room, generated furnished view, and catalogue product references. Pass only when room architecture and camera framing are preserved and the selected products are recognizably represented without substitutions or unrelated added furniture.",
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ selectedProducts: products.map((product) => ({ id: product.id, name: product.name, type: product.productType })) }) }, { type: "input_image", image_url: await privateImageUrl(record), detail: "low" }, { type: "input_image", image_url: generatedUrl, detail: "high" }, ...products.map((product) => ({ type: "input_image" as const, image_url: product.image.heroUrl!, detail: "low" as const }))] }],
    text: { format: zodTextFormat(verificationSchema, "scene_generation_verification") },
  });
  const value = response.output_parsed;
  if (!value) throw new Error("Visualization verification failed.");
  return { ...value, passed: value.scenePreserved && value.selectedProductsRepresented && !value.architectureChanged && !value.substitutionsDetected };
};

export const refreshSceneGeneration = async (generationId: string): Promise<SceneGenerationData> => {
  const generation = await getGeneration(generationId);
  if (!generation) throw new Error("The room visualization has expired.");
  if ([SceneGenerationStatus.Completed, SceneGenerationStatus.Failed].includes(generation.status)) return publicGeneration(generation);
  const prediction = await replicateClient().predictions.get(generation.predictionId);
  if (["starting", "processing"].includes(prediction.status)) return publicGeneration(generation);
  if (prediction.status !== "succeeded") {
    const failed = { ...generation, status: SceneGenerationStatus.Failed, error: "The room visualization could not be generated." };
    await persistGeneration(failed); return publicGeneration(failed);
  }
  const generatedUrl = outputUrl(prediction.output);
  if (!generatedUrl) throw new Error("The image provider returned no visualization.");
  const scene = await getScene(generation.sceneId);
  if (!scene) throw new Error("The uploaded scene has expired.");
  const catalogue = await getCatalogProducts();
  const products = generation.selectedProductIds.map((id) => catalogue.find((product) => product.id === id)).filter((product): product is Product => Boolean(product));
  generation.status = SceneGenerationStatus.Verifying; await persistGeneration(generation);
  let verification: SceneVerification;
  try { verification = await verifyGeneration(scene, generation, generatedUrl, products); }
  catch { verification = { scenePreserved: false, selectedProductsRepresented: false, architectureChanged: false, substitutionsDetected: false, extraObjectsIntroduced: false, confidence: 0, notes: ["Automated verification was unavailable."], passed: false }; }
  if (!verification.passed && generation.attempt === 1) {
    const retry = await replicateClient().predictions.create({ model: IMAGE_MODEL, input: { prompt: `${generationPrompt(scene, products)} Previous verification failed: ${verification.notes.join(" ")}. Correct these issues while preserving the original room.`, image_input: [await privateImageUrl(scene), ...products.map((product) => product.image.heroUrl).filter((url): url is string => Boolean(url))], aspect_ratio: "match_input_image", resolution: "2K", output_format: "jpg" } });
    const next = { ...generation, status: SceneGenerationStatus.Generating, attempt: 2, predictionId: retry.id, verification };
    logSceneEvent("generation.retry_requested", { sceneId: scene.sceneId, generationId, attempt: 2, confidence: verification.confidence });
    await persistGeneration(next); return publicGeneration(next);
  }
  const generatedResponse = await fetch(generatedUrl);
  if (!generatedResponse.ok) throw new Error("The generated image could not be stored.");
  const generatedBytes = Buffer.from(await generatedResponse.arrayBuffer());
  let finalUrl = dataUrl(generatedBytes);
  if (isProductionStorage()) {
    const path = `projects/CatalogX/scenes/${scene.sceneId}/generations/${generation.generationId}.jpg`;
    await getAdminBucket().file(path).save(generatedBytes, { contentType: "image/jpeg", resumable: false, metadata: { cacheControl: "private, max-age=900" } });
    [finalUrl] = await getAdminBucket().file(path).getSignedUrl({ action: "read", expires: scene.expiresAt });
  }
  const completed = { ...generation, status: SceneGenerationStatus.Completed, outputUrl: finalUrl, verification, illustrative: !verification.passed, error: null };
  logSceneEvent("generation.completed", { sceneId: scene.sceneId, generationId, attempt: generation.attempt, verified: verification.passed, illustrative: !verification.passed });
  await persistGeneration(completed); return publicGeneration(completed);
};
