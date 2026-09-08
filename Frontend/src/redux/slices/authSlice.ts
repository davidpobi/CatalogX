import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthSession, AuthState } from "@/interfaces/auth";
const initialState: AuthState = { session: null, status: "idle", pendingAction: null, error: null };
const slice = createSlice({ name: "auth", initialState, reducers: {
  authStarted(state) { state.status = "loading"; state.error = null; },
  authCompleted(state, action: PayloadAction<AuthSession>) { state.session = action.payload; state.status = "authenticated"; state.error = null; },
  authAnonymous(state) { state.session = null; state.status = "anonymous"; },
  authFailed(state, action: PayloadAction<string>) { state.status = "failed"; state.error = action.payload; },
  authSignedOut(state) { state.session = null; state.status = "anonymous"; state.pendingAction = null; },
  authPendingLike(state, action: PayloadAction<string>) { state.pendingAction = { type: "like", productId: action.payload }; },
  authPendingActionCleared(state) { state.pendingAction = null; },
} });
export const { authAnonymous, authCompleted, authFailed, authPendingActionCleared, authPendingLike, authSignedOut, authStarted } = slice.actions;
export default slice.reducer;
