import type { ReactNode } from "react";
import { requireMerchantSession } from "@/app/api/utils/authUtils";
export default async function ApprovedMerchantLayout({ children }: { children: ReactNode }) { await requireMerchantSession(); return children; }
