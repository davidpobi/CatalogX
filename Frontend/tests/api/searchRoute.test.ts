import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/(routes)/search/route";

describe("search route", () => {
  it("rejects unknown operations before calling a provider", async () => {
    const request = new NextRequest("http://localhost/api/search", { method: "POST", body: JSON.stringify({ operation: "unknown" }), headers: { "content-type": "application/json" } });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects prompts over 800 characters", async () => {
    const request = new NextRequest("http://localhost/api/search", { method: "POST", body: JSON.stringify({ operation: "compileQuery", prompt: "x".repeat(801) }), headers: { "content-type": "application/json" } });
    const response = await POST(request);
    expect(response.status).toBe(422);
  });
});
