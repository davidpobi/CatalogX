import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SceneGenerationStatus } from "@/interfaces/scene";

const analysis = {
  sceneId: "0f62b7cc-2738-4ebb-a12a-340a19dce0d7", previewUrl: "data:image/jpeg;base64,preview", expiresAt: "2026-09-08T00:00:00.000Z",
  analysis: { validRoomScene: true, containsIdentifiablePeople: false, roomType: "living room", confidence: 0.95, existingProductTypes: [], missingProductTypes: ["armchair"], suggestedCategories: ["seating"], styles: [], colors: [], materials: [], lighting: [], useCases: [], usableZones: [], retainElements: [], placementConstraints: [] },
};
const generation = { generationId: "73660e90-8f9e-4d20-a030-d4ca72e9ba18", sceneId: analysis.sceneId, workflowId: "23b5eeaa-30d8-48a4-a9a6-0153beff4ac7", status: SceneGenerationStatus.Generating, outputUrl: null, expiresAt: analysis.expiresAt, attempt: 1, illustrative: false, verification: null, error: null };

vi.mock("../../src/app/api/services/scene.service", () => ({
  analyzeRoomScene: vi.fn(async () => analysis),
  startSceneGeneration: vi.fn(async () => generation),
  refreshSceneGeneration: vi.fn(async () => ({ ...generation, status: SceneGenerationStatus.Completed, outputUrl: "data:image/jpeg;base64,result" })),
}));

import { POST } from "@/app/api/(routes)/scene/route";

const jsonRequest = (body: unknown) => new NextRequest("http://localhost/api/scene", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 150) + 1}` } });

describe("scene route", () => {
  afterEach(() => vi.clearAllMocks());

  it("analyzes a bounded room upload", async () => {
    const form = new FormData(); form.set("operation", "analyzeScene"); form.set("image", new File([new Uint8Array([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));
    const response = await POST(new NextRequest("http://localhost/api/scene", { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.201" } }));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ success: true, data: { sceneId: analysis.sceneId, analysis: { roomType: "living room" } } });
  });

  it("starts and retrieves an authorized asynchronous generation", async () => {
    const start = await POST(jsonRequest({ operation: "generateScene", sceneId: analysis.sceneId, workflowId: generation.workflowId, selectedProductIds: ["cx-seating-01"] }));
    expect(start.status).toBe(202);
    const status = await POST(jsonRequest({ operation: "getSceneGeneration", generationId: generation.generationId }));
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ data: { status: "completed" } });
  });

  it("rejects malformed and unknown operations", async () => {
    expect((await POST(jsonRequest({ operation: "unknown" }))).status).toBe(400);
    expect((await POST(jsonRequest({ operation: "generateScene", sceneId: "bad" }))).status).toBe(422);
  });
});
