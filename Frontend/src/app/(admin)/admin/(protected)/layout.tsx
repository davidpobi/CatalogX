import type { ReactNode } from "react";
import { requireAdminSession } from "@/app/api/utils/authUtils";
export default async function AdminLayout({ children }: { children: ReactNode }) { await requireAdminSession(); return children; }
