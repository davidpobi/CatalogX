import type { AuthSession } from "@/interfaces/auth";

/** Client-side display guard. Server routes and layouts are authoritative. */
export const isAdmin = (session: AuthSession | null) =>
  Boolean(session?.user.capabilities.admin && session.user.signInProvider === "password");
