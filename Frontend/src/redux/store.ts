import { configureStore, type Action, type ThunkAction } from "@reduxjs/toolkit";
import ai from "./slices/aiSlice";
import data from "./slices/dataSlice";
import scene from "./slices/sceneSlice";
import auth from "./slices/authSlice";
import customer from "./slices/customerSlice";
import merchant from "./slices/merchantSlice";
import admin from "./slices/adminSlice";

export const makeStore = () => configureStore({ reducer: { ai, data, scene, auth, customer, merchant, admin } });
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<Return = void> = ThunkAction<Return, RootState, unknown, Action>;
