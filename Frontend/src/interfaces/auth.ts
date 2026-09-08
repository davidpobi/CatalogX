export enum AuthOperations {
  CreateSession = "createSession",
  GetSession = "getSession",
  RevokeSession = "revokeSession",
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous" | "failed";

export interface AccountCapabilities {
  customer: boolean;
  merchantApplicant: boolean;
  merchant: boolean;
  admin: boolean;
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  signInProvider?: string | null;
  capabilities: AccountCapabilities;
}

export interface AuthSession {
  user: AuthenticatedUser;
  expiresAt: string;
}

export interface AuthState {
  session: AuthSession | null;
  status: AuthStatus;
  pendingAction: { type: "like"; productId: string } | null;
  error: string | null;
}
