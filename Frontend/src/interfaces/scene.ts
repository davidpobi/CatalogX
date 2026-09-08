import type { CategoryId, ProductType } from "./catalog";

export enum SceneOperations {
  AnalyzeScene = "analyzeScene",
  GenerateScene = "generateScene",
  GetSceneGeneration = "getSceneGeneration",
}

export enum SceneGenerationStatus {
  Idle = "idle",
  Queued = "queued",
  Generating = "generating",
  Verifying = "verifying",
  Completed = "completed",
  Failed = "failed",
}

export interface SceneZone {
  label: string;
  placement: string;
  suitableProductTypes: ProductType[];
}

export interface RoomSceneAnalysis {
  validRoomScene: boolean;
  containsIdentifiablePeople: boolean;
  roomType: string | null;
  confidence: number;
  existingProductTypes: ProductType[];
  missingProductTypes: ProductType[];
  suggestedCategories: CategoryId[];
  styles: string[];
  colors: string[];
  materials: string[];
  lighting: string[];
  useCases: string[];
  usableZones: SceneZone[];
  retainElements: string[];
  placementConstraints: string[];
}

export interface SceneAnalysisData {
  sceneId: string;
  previewUrl: string;
  expiresAt: string;
  analysis: RoomSceneAnalysis;
}

export interface SceneVerification {
  scenePreserved: boolean;
  selectedProductsRepresented: boolean;
  architectureChanged: boolean;
  substitutionsDetected: boolean;
  extraObjectsIntroduced: boolean;
  confidence: number;
  notes: string[];
  passed: boolean;
}

export interface SceneGenerationData {
  generationId: string;
  sceneId: string;
  workflowId: string;
  status: SceneGenerationStatus;
  outputUrl: string | null;
  expiresAt: string;
  attempt: number;
  illustrative: boolean;
  verification: SceneVerification | null;
  error: string | null;
}

export interface SceneWorkflowContext {
  sceneId: string;
  analysis: RoomSceneAnalysis;
  imageUrl: string;
}
