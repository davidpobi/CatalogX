import { configureStore, type Action, type ThunkAction } from "@reduxjs/toolkit";
import ai from "./slices/aiSlice";
import data from "./slices/dataSlice";
import scene from "./slices/sceneSlice";

export const makeStore = () => configureStore({ reducer: { ai, data, scene } });
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<Return = void> = ThunkAction<Return, RootState, unknown, Action>;
