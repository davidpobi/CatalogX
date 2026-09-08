"use client";

import { logEvent } from "firebase/analytics";
import { getFirebaseAnalytics } from "@/config/firebase";
import type { CatalogAnalyticsEvent } from "@/interfaces/analytics";

export type { CatalogAnalyticsEvent } from "@/interfaces/analytics";

export const trackCatalogEvent = async (event: CatalogAnalyticsEvent, metadata: { category?: string; mode?: string; resultBucket?: string } = {}) => {
  const analytics = await getFirebaseAnalytics();
  if (analytics) logEvent(analytics, event, metadata);
};
