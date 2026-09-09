import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AuthSession } from "@/interfaces/auth";
import { AdminOperations } from "@/interfaces/admin";

const { sessionFromRequest } = vi.hoisted(() => ({ sessionFromRequest: vi.fn() }));

vi.mock("@/app/api/utils/authUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/utils/authUtils")>()),
  sessionFromRequest,
}));

import { POST } from "@/app/api/(routes)/admin/route";

const request = () => new NextRequest("http://localhost/api/admin", {
  method: "POST",
  body: JSON.stringify({ operation: AdminOperations.ListMerchantApplications }),
  headers: { "content-type": "application/json", origin: "http://localhost" },
});

const session: AuthSession = {
  user: { uid: "not-the-admin", email: "other@example.com", displayName: "Other", photoUrl: null, signInProvider: "password", capabilities: { customer: true, merchantApplicant: false, merchant: false, admin: true } },
  expiresAt: "2026-09-10T00:00:00.000Z",
};

describe("admin route authorization", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_ID", "configured-admin");
    sessionFromRequest.mockResolvedValue(session);
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("rejects an enabled password session whose UID is not ADMIN_ID before any admin operation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, message: "Admin access is required." });
  });
});
