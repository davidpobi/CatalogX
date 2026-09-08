import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AdminDashboardData, AdminState } from "@/interfaces/admin";
const initialState: AdminState = { applications: [], listings: [], status: "idle", error: null };
const slice = createSlice({ name: "admin", initialState, reducers: {
  adminStarted(state) { state.status = "loading"; state.error = null; },
  adminCompleted(state, action: PayloadAction<AdminDashboardData>) { Object.assign(state, action.payload); state.status = "succeeded"; },
  adminFailed(state, action: PayloadAction<string>) { state.status = "failed"; state.error = action.payload; },
} });
export const { adminCompleted, adminFailed, adminStarted } = slice.actions;
export default slice.reducer;
