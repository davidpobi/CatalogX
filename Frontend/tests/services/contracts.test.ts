import { afterEach, describe, expect, it, vi } from "vitest";
import { listProducts, queryProducts, replaceBundleProduct } from "@/services/catalog.service";
import { compileSearch } from "@/services/search.service";
import { queryConcierge } from "@/services/concierge.service";
import { emptyQueryPlan } from "@/utils/queryPlan";

describe("client service contracts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends list and query operations through the catalogue endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { products: [], facets: {}, catalogueVersion: "test" }, requestId: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listProducts();
    expect(fetchMock).toHaveBeenCalledWith("/api/catalog", expect.objectContaining({ body: JSON.stringify({ operation: "listProducts", cursor: null, limit: 24 }) }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { mode: "products", products: [], bundle: null, total: 0, facets: {} }, requestId: "2" }), { status: 200 }));
    await queryProducts(emptyQueryPlan());
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ operation: "queryProducts" });
  });

  it("sends a targeted bundle replacement contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {}, requestId: "4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await replaceBundleProduct(emptyQueryPlan(), ["one", "two"], "one");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ operation: "replaceBundleProduct", currentProductIds: ["one", "two"], targetProductId: "one" });
  });

  it("sends compile operations through the search endpoint", async () => {
    const plan = emptyQueryPlan("desk");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { plan, interpretation: {}, compiler: "fallback" }, requestId: "3" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await compileSearch("desk");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ operation: "compileQuery", prompt: "desk" });
  });

  it("sends natural-language searches through the concierge endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {}, requestId: "5" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queryConcierge("calm oak seating");
    expect(fetchMock).toHaveBeenCalledWith("/api/concierge", expect.objectContaining({
      body: JSON.stringify({ operation: "queryCatalogue", prompt: "calm oak seating", previousPlan: null }),
    }));
  });

  it("parses streamed concierge progress and its final result", async () => {
    const progress = { requestId: "request", workflowId: "workflow", step: "understanding", status: "running", agent: "search" };
    const result = { workflowId: "workflow", plan: emptyQueryPlan(), interpretation: {}, catalog: {}, review: {}, presentation: {} };
    const encoded = new TextEncoder().encode(`${JSON.stringify({ type: "progress", data: progress })}\n${JSON.stringify({ type: "result", data: result, requestId: "request" })}\n`);
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(encoded.slice(0, 23)); controller.enqueue(encoded.slice(23)); controller.close(); } }), {
      status: 200, headers: { "content-type": "application/x-ndjson" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const received: unknown[] = [];
    const output = await queryConcierge("oak seating", null, (event) => received.push(event));
    expect(received).toEqual([progress]);
    expect(output).toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("/api/concierge", expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/x-ndjson" }) }));
  });
});
