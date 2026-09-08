import { AdminOperations, type AdminDashboardData } from "@/interfaces/admin";
import { postApi } from "./apiClient.service";
const call = (operation: AdminOperations, payload: Record<string, unknown> = {}) => postApi<AdminDashboardData>("/api/admin", { operation, ...payload });
export const getAdminDashboard = () => call(AdminOperations.ListMerchantApplications);
export const reviewRemoteMerchant = (targetId: string, decision: "approve" | "reject", reason: string | null) => call(AdminOperations.ReviewMerchantApplication, { targetId, review: { decision, reason } });
export const reviewRemoteListing = (targetId: string, decision: "approve" | "reject", reason: string | null) => call(AdminOperations.ReviewListing, { targetId, review: { decision, reason } });
export const unpublishRemoteListing = (targetId: string, reason: string | null) => call(AdminOperations.UnpublishListing, { targetId, reason });
