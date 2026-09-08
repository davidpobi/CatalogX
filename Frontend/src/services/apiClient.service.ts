import type { ApiResponse } from "@/interfaces/api";

export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly requestId: string | null) { super(message); }
}

export const normalizeApiError = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error : new ApiClientError(fallback, 0, null);

const handleResponse = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok || !body?.success || body.data === null) throw new ApiClientError(body?.message || "The request could not be completed.", response.status, body?.requestId || null);
  return body.data;
};

export const postApi = async <T>(path: string, payload: Record<string, unknown>, signal?: AbortSignal) => {
  try {
    return await handleResponse<T>(await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }));
  } catch (error) {
    throw normalizeApiError(error, "The request could not be completed.");
  }
};

export const postFormApi = async <T>(path: string, form: FormData, signal?: AbortSignal) => {
  try {
    return await handleResponse<T>(await fetch(path, { method: "POST", body: form, signal }));
  } catch (error) {
    throw normalizeApiError(error, "The request could not be completed.");
  }
};
