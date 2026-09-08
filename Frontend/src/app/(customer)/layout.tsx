import type { ReactNode } from "react";
import { requireCustomerSession } from "@/app/api/utils/authUtils";
export default async function CustomerLayout({ children }: { children: ReactNode }) { await requireCustomerSession(); return children; }
