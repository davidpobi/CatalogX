import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AIState } from "@/interfaces/state";
import type { AgentWorkflowProgress } from "@/interfaces/concierge";
import type { CatalogQueryPlanV1, InterpretationChip, SearchInterpretation } from "@/interfaces/search";
import { emptyQueryPlan } from "@/utils/queryPlan";

export const initialAIState: AIState = {
  draft: "",
  plan: emptyQueryPlan(),
  interpretation: null,
  conciergePresentation: null,
  workflowId: null,
  workflowStatus: null,
  workflowProgress: null,
  completedWorkflowSteps: [],
  status: "idle",
  pendingSubmission: null,
  activeRequestId: null,
  error: null,
};

const slice = createSlice({
  name: "ai",
  initialState: initialAIState,
  reducers: {
    setAIDraft(state, action: PayloadAction<string>) { state.draft = action.payload.slice(0, 800); },
    queueSearchSubmission: {
      reducer(state, action: PayloadAction<{ id: string; prompt: string }>) {
        state.draft = action.payload.prompt.slice(0, 800);
        state.pendingSubmission = { ...action.payload, consumed: false };
      },
      prepare(prompt: string) { return { payload: { id: crypto.randomUUID(), prompt: prompt.trim().slice(0, 800) } }; },
    },
    markSubmissionConsumed(state, action: PayloadAction<string>) {
      if (state.pendingSubmission?.id === action.payload) state.pendingSubmission.consumed = true;
    },
    clearPendingSubmission(state, action: PayloadAction<string>) {
      if (state.pendingSubmission?.id === action.payload) state.pendingSubmission = null;
    },
    aiRequestStarted(state, action: PayloadAction<{ requestId: string; prompt: string }>) {
      state.activeRequestId = action.payload.requestId; state.draft = action.payload.prompt;
      state.status = "loading"; state.error = null; state.conciergePresentation = null;
      state.workflowId = null; state.workflowStatus = null;
      state.workflowProgress = null; state.completedWorkflowSteps = [];
    },
    aiWorkflowProgressed(state, action: PayloadAction<{ requestId: string; progress: AgentWorkflowProgress }>) {
      if (state.activeRequestId !== action.payload.requestId) return;
      const previous = state.workflowProgress?.step;
      if (previous && previous !== action.payload.progress.step && previous !== "ready") {
        state.completedWorkflowSteps = [...new Set([...state.completedWorkflowSteps, previous])];
      }
      state.workflowProgress = action.payload.progress;
      state.workflowId = action.payload.progress.workflowId;
    },
    aiRequestCompleted(state, action: PayloadAction<{ requestId: string; plan: CatalogQueryPlanV1; interpretation: SearchInterpretation; conciergePresentation?: AIState["conciergePresentation"]; workflowId?: string; workflowStatus?: AIState["workflowStatus"] }>) {
      if (state.activeRequestId !== action.payload.requestId) return;
      state.plan = action.payload.plan; state.interpretation = action.payload.interpretation;
      state.conciergePresentation = action.payload.conciergePresentation ?? null;
      state.workflowId = action.payload.workflowId ?? null;
      state.workflowStatus = action.payload.workflowStatus ?? null;
      state.status = "succeeded"; state.activeRequestId = null; state.error = null;
    },
    aiRequestFailed(state, action: PayloadAction<{ requestId: string; error: string }>) {
      if (state.activeRequestId !== action.payload.requestId) return;
      state.status = "failed"; state.activeRequestId = null; state.error = action.payload.error;
    },
    setAIError(state, action: PayloadAction<string>) { state.status = "failed"; state.error = action.payload; },
    setAIPlan(state, action: PayloadAction<CatalogQueryPlanV1>) {
      state.plan = action.payload; state.conciergePresentation = null; state.workflowId = null; state.workflowStatus = null;
      state.workflowProgress = null; state.completedWorkflowSteps = [];
    },
    suggestionApplied(state, action: PayloadAction<{ plan: CatalogQueryPlanV1; prompt: string; summary: string; chips: InterpretationChip[] }>) {
      state.plan = action.payload.plan;
      state.draft = action.payload.prompt.slice(0, 800);
      state.interpretation = {
        summary: action.payload.summary,
        chips: action.payload.chips,
        assumptions: state.interpretation?.assumptions ?? [],
      };
      state.conciergePresentation = null; state.workflowId = null; state.workflowStatus = null;
      state.workflowProgress = null; state.completedWorkflowSteps = [];
    },
    removeInterpretationChip(state, action: PayloadAction<{ field: string; value: string | number | boolean }>) {
      if (state.interpretation) state.interpretation.chips = state.interpretation.chips.filter((chip) => !(chip.field === action.payload.field && chip.value === action.payload.value));
    },
    clearAIError(state) { state.error = null; if (state.status === "failed") state.status = "idle"; },
    resetAIState() { return initialAIState; },
  },
});

export const { aiRequestCompleted, aiRequestFailed, aiRequestStarted, aiWorkflowProgressed, clearAIError, clearPendingSubmission, markSubmissionConsumed, queueSearchSubmission, removeInterpretationChip, resetAIState, setAIDraft, setAIError, setAIPlan, suggestionApplied } = slice.actions;
export default slice.reducer;
