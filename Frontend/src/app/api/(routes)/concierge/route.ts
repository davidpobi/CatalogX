import { NextRequest, NextResponse } from "next/server";
import { ConciergeOperations } from "@/interfaces/concierge";
import type { ConciergeStreamChunk } from "@/interfaces/concierge";
import { identifyClient, consumeRateLimit, rateLimitHeaders } from "../../services/rateLimit.service";
import { failure, jsonResult, readBoundedJson, withRouteBoundary } from "../../utils/http";
import { conciergeRequestSchema, queryCatalogue } from "./concierge";

const streamCatalogue = (body: unknown, requestId: string, headers: Record<string, string>) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: ConciergeStreamChunk) => controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      void queryCatalogue(body, requestId, (progress) => send({ type: "progress", data: progress }))
        .then((result) => {
          if (result.status >= 200 && result.status < 300 && result.data) send({ type: "result", data: result.data, requestId });
          else send({ type: "error", message: result.message || "The request could not be completed.", requestId });
        })
        .catch((error) => {
          console.error("[concierge-api] stream_failed", { requestId, error: error instanceof Error ? { name: error.name } : { name: typeof error } });
          send({ type: "error", message: "The request is temporarily unavailable.", requestId });
        })
        .finally(() => controller.close());
    },
  });
  return new NextResponse(stream, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" },
  });
};

const post = async (request: NextRequest, requestId: string) => {
  const body = await readBoundedJson(request, 64_000);
  if (!body) return jsonResult(requestId, failure(422, "A valid bounded JSON request is required."));
  if (body.operation !== ConciergeOperations.QueryCatalogue) return jsonResult(requestId, failure(400, "Invalid operation."));
  if (!conciergeRequestSchema.safeParse(body).success) return jsonResult(requestId, failure(422, "Enter a catalogue request between 2 and 800 characters."));
  const rate = await consumeRateLimit(`concierge:${identifyClient(request)}`, 20, 10 * 60_000);
  if (!rate.allowed) return jsonResult(requestId, { ...failure(429, "Concierge limit reached. Please try again shortly."), headers: rateLimitHeaders(rate) });
  if (request.headers.get("accept")?.includes("application/x-ndjson")) return streamCatalogue(body, requestId, rateLimitHeaders(rate));
  const result = await queryCatalogue(body, requestId);
  return jsonResult(requestId, { ...result, headers: rateLimitHeaders(rate) });
};

export const POST = withRouteBoundary("concierge", post);
