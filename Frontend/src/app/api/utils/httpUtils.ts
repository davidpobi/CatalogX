import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, ApiRouteResult } from "@/interfaces/api";

export const readBoundedJson = async (request: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null> => {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
};

export const jsonResult = <T>(requestId: string, result: ApiRouteResult<T>) => NextResponse.json<ApiResponse<T>>({
  success: result.status >= 200 && result.status < 300,
  data: result.data,
  ...(result.message ? { message: result.message } : {}),
  requestId,
}, { status: result.status, headers: result.headers });

export const failure = (status: number, message: string): ApiRouteResult<never> => ({ status, data: null, message });

export const withRouteBoundary = (domain: string, handler: (request: NextRequest, requestId: string) => Promise<NextResponse>) => async (request: NextRequest) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    return await handler(request, requestId);
  } catch (error) {
    console.error(`[${domain}-api] request_failed`, {
      requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 300) } : { name: typeof error },
    });
    return jsonResult(requestId, failure(503, "The request is temporarily unavailable."));
  }
};
