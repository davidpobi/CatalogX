"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/redux/store";
import { initializeAuthAction } from "@/redux/accountThunks";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState<AppStore>(() => makeStore());
  useEffect(() => { void store.dispatch(initializeAuthAction()); }, [store]);
  return <Provider store={store}>{children}</Provider>;
}
