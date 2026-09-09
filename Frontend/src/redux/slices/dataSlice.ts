import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CatalogListData, CatalogQueryData, Product } from "@/interfaces/catalog";
import type { CatalogDataState, RecentSearch } from "@/interfaces/state";

export const initialCatalogDataState: CatalogDataState = {
  catalogueProducts: [], facets: null, catalogueVersion: null, catalogueTotal: 0, catalogueNextCursor: null,
  catalogueStatus: "idle", cataloguePageStatus: "idle",
  queryStatus: "idle", total: 0, results: [], bundle: null, suggestions: [], assessment: null, activeRequestId: null, error: null,
  savedProductIds: [], recentSearches: [], localStateHydrated: false,
};

const slice = createSlice({
  name: "data",
  initialState: initialCatalogDataState,
  reducers: {
    catalogueLoadStarted(state) { state.catalogueStatus = "loading"; state.error = null; },
    catalogueLoadCompleted(state, action: PayloadAction<CatalogListData>) {
      state.catalogueProducts = action.payload.products; state.facets = action.payload.facets;
      state.catalogueVersion = action.payload.catalogueVersion; state.catalogueTotal = action.payload.total;
      state.catalogueNextCursor = action.payload.nextCursor; state.catalogueStatus = "succeeded";
      if (state.queryStatus === "idle") {
        state.results = action.payload.products.map((product) => ({ product, score: product.rating, reasons: [] }));
        state.total = action.payload.total;
      }
    },
    cataloguePageLoadStarted(state) { state.cataloguePageStatus = "loading"; },
    cataloguePageLoadCompleted(state, action: PayloadAction<CatalogListData>) {
      const known = new Set(state.catalogueProducts.map((product) => product.id));
      const products = action.payload.products.filter((product) => !known.has(product.id));
      state.catalogueProducts.push(...products);
      if (state.queryStatus === "idle") state.results.push(...products.map((product) => ({ product, score: product.rating, reasons: [] })));
      state.catalogueTotal = action.payload.total;
      state.catalogueNextCursor = action.payload.nextCursor;
      state.cataloguePageStatus = "succeeded";
    },
    cataloguePageLoadFailed(state, action: PayloadAction<string>) { state.cataloguePageStatus = "failed"; state.error = action.payload; },
    catalogueLoadFailed(state, action: PayloadAction<string>) { state.catalogueStatus = "failed"; state.error = action.payload; },
    queryStarted(state, action: PayloadAction<string>) { state.queryStatus = "loading"; state.activeRequestId = action.payload; state.error = null; },
    queryCompleted(state, action: PayloadAction<{ requestId: string; result: CatalogQueryData }>) {
      if (state.activeRequestId !== action.payload.requestId) return;
      state.results = action.payload.result.products; state.bundle = action.payload.result.bundle; state.facets = action.payload.result.facets;
      state.total = action.payload.result.total;
      state.suggestions = action.payload.result.suggestions; state.assessment = action.payload.result.assessment;
      state.queryStatus = "succeeded"; state.activeRequestId = null; state.error = null;
    },
    queryFailed(state, action: PayloadAction<{ requestId: string; error: string }>) {
      if (state.activeRequestId !== action.payload.requestId) return;
      state.queryStatus = "failed"; state.activeRequestId = null; state.error = action.payload.error;
    },
    localStateHydrated(state, action: PayloadAction<{ savedProductIds: string[]; recentSearches: RecentSearch[] }>) {
      state.savedProductIds = action.payload.savedProductIds; state.recentSearches = action.payload.recentSearches; state.localStateHydrated = true;
    },
    savedProductsChanged(state, action: PayloadAction<string[]>) { state.savedProductIds = action.payload; },
    recentSearchesChanged(state, action: PayloadAction<RecentSearch[]>) { state.recentSearches = action.payload; },
    clearDataError(state) { state.error = null; if (state.catalogueStatus === "failed") state.catalogueStatus = "idle"; if (state.queryStatus === "failed") state.queryStatus = "idle"; },
    productUpdated(state, action: PayloadAction<Product>) {
      const index = state.catalogueProducts.findIndex((product) => product.id === action.payload.id);
      if (index >= 0) state.catalogueProducts[index] = action.payload;
    },
  },
});

export const { catalogueLoadCompleted, catalogueLoadFailed, catalogueLoadStarted, cataloguePageLoadCompleted, cataloguePageLoadFailed, cataloguePageLoadStarted, clearDataError, localStateHydrated, productUpdated, queryCompleted, queryFailed, queryStarted, recentSearchesChanged, savedProductsChanged } = slice.actions;
export default slice.reducer;
