import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CustomerLibraryData, CustomerState } from "@/interfaces/customer";
const initialState: CustomerState = { likedProductIds: [], collections: [], status: "idle", error: null };
const slice = createSlice({ name: "customer", initialState, reducers: {
  customerStarted(state) { state.status = "loading"; state.error = null; },
  customerCompleted(state, action: PayloadAction<CustomerLibraryData>) { Object.assign(state, action.payload); state.status = "succeeded"; state.error = null; },
  customerFailed(state, action: PayloadAction<string>) { state.status = "failed"; state.error = action.payload; },
  customerCleared() { return initialState; },
} });
export const { customerCleared, customerCompleted, customerFailed, customerStarted } = slice.actions;
export default slice.reducer;
