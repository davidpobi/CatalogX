import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/interfaces/auth";
import { isAdmin as isApiAdmin } from "@/app/api/utils/authUtils";
import { isAdmin as isUiAdmin } from "@/utils/authUtils";

const session = (overrides: Partial<AuthSession["user"]> = {}): AuthSession => ({
  user: {
    uid: "admin-uid",
    email: "admin@example.com",
    displayName: "Admin",
    photoUrl: null,
    signInProvider: "password",
    capabilities: { customer: true, merchantApplicant: false, merchant: false, admin: true },
    ...overrides,
  },
  expiresAt: "2026-09-10T00:00:00.000Z",
});

describe("admin authorization helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires the configured UID, password provider, and enabled capability on the API", () => {
    vi.stubEnv("ADMIN_ID", "admin-uid");
    expect(isApiAdmin(session())).toBe(true);
    expect(isApiAdmin(session({ uid: "other-admin" }))).toBe(false);
    expect(isApiAdmin(session({ signInProvider: "google.com" }))).toBe(false);
    expect(isApiAdmin(session({ capabilities: { customer: true, merchantApplicant: false, merchant: false, admin: false } }))).toBe(false);
  });

  it("fails closed when ADMIN_ID is missing or blank", () => {
    vi.stubEnv("ADMIN_ID", "");
    expect(isApiAdmin(session())).toBe(false);
    vi.stubEnv("ADMIN_ID", undefined);
    expect(isApiAdmin(session())).toBe(false);
  });

  it("uses the server-filtered session capability for browser UI decisions", () => {
    expect(isUiAdmin(session())).toBe(true);
    expect(isUiAdmin(session({ signInProvider: "google.com" }))).toBe(false);
    expect(isUiAdmin(session({ capabilities: { customer: true, merchantApplicant: false, merchant: false, admin: false } }))).toBe(false);
  });
});
