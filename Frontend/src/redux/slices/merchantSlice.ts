import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { MerchantApplication, MerchantListing, MerchantProfile } from "@/interfaces/merchant";
const initialState = { application: null as MerchantApplication | null, profile: null as MerchantProfile | null, listings: [] as MerchantListing[], status: "idle" as "idle" | "loading" | "succeeded" | "failed", error: null as string | null };
const slice = createSlice({ name: "merchant", initialState, reducers: {
  merchantStarted(state) { state.status = "loading"; state.error = null; },
  merchantDashboardCompleted(state, action: PayloadAction<{ application: MerchantApplication | null; profile: MerchantProfile | null; listings: MerchantListing[] }>) { Object.assign(state, action.payload); state.status = "succeeded"; },
  merchantListingCompleted(state, action: PayloadAction<MerchantListing>) { const index = state.listings.findIndex((listing) => listing.id === action.payload.id); if (index >= 0) state.listings[index] = action.payload; else state.listings.unshift(action.payload); state.status = "succeeded"; },
  merchantFailed(state, action: PayloadAction<string>) { state.status = "failed"; state.error = action.payload; },
} });
export const { merchantDashboardCompleted, merchantFailed, merchantListingCompleted, merchantStarted } = slice.actions;
export default slice.reducer;
