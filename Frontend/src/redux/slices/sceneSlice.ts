import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SceneAnalysisData, SceneGenerationData } from "@/interfaces/scene";
import type { SceneState } from "@/interfaces/state";

export const initialSceneState: SceneState = {
  analysis: null,
  generation: null,
  authorizedWorkflowId: null,
  authorizedProductIds: [],
  uploadStatus: "idle",
  generationStatus: "idle",
  activeRequestId: null,
  error: null,
};

const slice = createSlice({
  name: "scene",
  initialState: initialSceneState,
  reducers: {
    sceneUploadStarted(state, action: PayloadAction<string>) { state.uploadStatus = "loading"; state.activeRequestId = action.payload; state.error = null; state.generation = null; state.authorizedWorkflowId = null; state.authorizedProductIds = []; },
    sceneUploadCompleted(state, action: PayloadAction<{ requestId: string; data: SceneAnalysisData }>) { if (state.activeRequestId !== action.payload.requestId) return; state.analysis = action.payload.data; state.uploadStatus = "succeeded"; state.activeRequestId = null; },
    sceneUploadFailed(state, action: PayloadAction<{ requestId: string; error: string }>) { if (state.activeRequestId !== action.payload.requestId) return; state.uploadStatus = "failed"; state.activeRequestId = null; state.error = action.payload.error; },
    sceneGenerationStarted(state, action: PayloadAction<{ requestId: string; data: SceneGenerationData }>) { state.activeRequestId = action.payload.requestId; state.generation = action.payload.data; state.generationStatus = "loading"; state.error = null; },
    sceneGenerationProgressed(state, action: PayloadAction<SceneGenerationData>) { if (state.generation?.generationId !== action.payload.generationId) return; state.generation = action.payload; },
    sceneGenerationCompleted(state, action: PayloadAction<SceneGenerationData>) { if (state.generation?.generationId !== action.payload.generationId) return; state.generation = action.payload; state.generationStatus = "succeeded"; state.activeRequestId = null; },
    sceneGenerationFailed(state, action: PayloadAction<{ generationId?: string; error: string }>) { if (action.payload.generationId && state.generation?.generationId !== action.payload.generationId) return; state.generationStatus = "failed"; state.activeRequestId = null; state.error = action.payload.error; },
    sceneWorkflowAuthorized(state, action: PayloadAction<{ sceneId: string; workflowId: string; productIds: string[] }>) {
      if (state.analysis?.sceneId !== action.payload.sceneId) return;
      state.authorizedWorkflowId = action.payload.workflowId;
      state.authorizedProductIds = [...new Set(action.payload.productIds)];
      state.generation = null;
      state.generationStatus = "idle";
      state.error = null;
    },
    clearScene() { return initialSceneState; },
    invalidateSceneWorkflow(state) { state.authorizedWorkflowId = null; state.authorizedProductIds = []; state.generation = null; state.generationStatus = "idle"; state.error = null; },
  },
});

export const { clearScene, invalidateSceneWorkflow, sceneGenerationCompleted, sceneGenerationFailed, sceneGenerationProgressed, sceneGenerationStarted, sceneUploadCompleted, sceneUploadFailed, sceneUploadStarted, sceneWorkflowAuthorized } = slice.actions;
export default slice.reducer;
