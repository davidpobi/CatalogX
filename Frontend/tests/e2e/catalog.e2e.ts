import { expect, test, type Page } from "@playwright/test";
import catalogue from "@/data/catalog.json" with { type: "json" };
import type { Product } from "@/interfaces/catalog";
import type { CatalogQueryPlanV1 } from "@/interfaces/search";
import { executeCatalogQuery } from "@/utils/catalogQuery";

const plan = (mode: "products" | "bundle"): CatalogQueryPlanV1 => ({
  version: "1", mode, searchText: mode === "bundle" ? "furnish my living room" : "oak seating under $300",
  categories: mode === "products" ? ["seating"] : [],
  filters: { productTypes: [], rooms: ["living room"], styles: [], colors: [], materials: mode === "products" ? ["oak"] : [], availability: [], price: { min: null, max: mode === "products" ? 300 : null }, discountOnly: false, maxDeliveryDays: null, dimensions: { maxWidth: null, maxHeight: null, maxDepth: null } },
  exclusions: { productTypes: [], colors: [], materials: [], tags: [] },
  preferences: [], sort: { field: "relevance", direction: "desc" }, limit: 24,
  bundle: mode === "bundle" ? { room: "living room", budget: 2000, requiredCategories: ["seating", "tables-desks", "lighting", "rugs-textiles"], itemCount: 4 } : null,
});

const mockConcierge = async (page: Page, mode: "products" | "bundle", sceneId?: string) => {
  const compiledPlan = plan(mode);
  const catalog = executeCatalogQuery(catalogue as Product[], compiledPlan);
  const acceptedProductIds = (catalog.bundle?.products ?? catalog.products).slice(0, 8).map((item) => item.product.id);
  const data = {
      workflowId: "e2e-workflow", ...(sceneId ? { sceneId } : {}), plan: compiledPlan,
      interpretation: { summary: mode === "bundle" ? "A coordinated living room bundle." : "Oak seating under $300.", assumptions: [], chips: mode === "products" ? [
        { id: "material", label: "Oak", field: "filters.materials", value: "oak" },
        { id: "price", label: "Under $300", field: "filters.price.max", value: 300 },
      ] : [] },
      catalog,
      review: { status: "reviewed", reviewedProductIds: acceptedProductIds, acceptedProductIds, rejected: [], missingRequirements: [], retryRecommended: false, attempts: 1 },
      presentation: { summary: mode === "bundle" ? "A coordinated living room bundle." : "Oak seating under $300.", productRationales: [], guidance: "Review these verified matches." },
  };
  await page.route("**/api/concierge", async (route) => route.fulfill({
    status: 200, contentType: "application/x-ndjson",
    body: `${JSON.stringify({ type: "progress", data: { requestId: "e2e", workflowId: "e2e-workflow", step: "understanding", status: "running", agent: "search" } })}\n${JSON.stringify({ type: "result", data, requestId: "e2e" })}\n`,
  }));
};

test("browses, filters, saves, and opens a product", async ({ page }) => {
  await page.goto("/store");
  await expect(page.getByRole("heading", { name: /Pieces for your space/i })).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(100);
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(10);
  const firstProduct = page.locator(".product-card").first();
  await firstProduct.getByRole("button", { name: /View/ }).click();
  await expect(page.getByText("Product details")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Product details")).toBeHidden();
  await firstProduct.getByRole("button", { name: /^Save / }).click();
  await expect(firstProduct.getByRole("button", { name: /^Remove .* from saved products$/ })).toBeVisible();
});

test("persists the day theme", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to day theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-catalogx-theme", "day");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-catalogx-theme", "day");
});

test("landing artwork opens the matching catalogue category", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore lighting" }).click();
  await expect(page).toHaveURL(/\/store$/);
  await expect(page.getByRole("button", { name: "Lighting", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".product-card")).toHaveCount(10);
});

test("AI bar compiles, searches, and removes the underlying chip filter", async ({ page }) => {
  await mockConcierge(page, "products");
  const catalogBodies: Array<{ plan: { filters: { materials: string[] } } }> = [];
  let listRequests = 0;
  page.on("request", (request) => {
    const body = request.postDataJSON() as { operation?: string; plan: { filters: { materials: string[] } } } | null;
    if (request.url().endsWith("/api/catalog") && body?.operation === "listProducts") listRequests += 1;
    if (request.url().endsWith("/api/catalog") && body?.operation === "queryProducts") catalogBodies.push(body);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Furnish the feeling/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Shop the way you actually think." })).toBeVisible();
  await page.getByLabel("Describe what you need").fill("oak seating under $300");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await expect(page).toHaveURL(/\/store$/);
  await expect(page.getByText("Oak seating under $300.")).toBeVisible();
  await page.locator(".recent-menu summary").click();
  await expect(page.locator(".recent-search")).toHaveCount(1);
  await expect(page.locator(".recent-search .recent-preview")).toHaveCount(3);
  await expect(page.locator(".recent-copy")).toHaveCSS("white-space", "normal");
  await expect(page.getByRole("button", { name: "Remove Oak" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Oak" }).click();
  await expect.poll(() => catalogBodies.at(-1)?.plan.filters.materials).toEqual([]);
  await expect(page.getByRole("button", { name: "Remove Oak" })).toHaveCount(0);
  await page.getByRole("link", { name: "CatalogX home" }).click();
  await page.getByRole("link", { name: /Enter the catalogue/ }).click();
  await expect(page).toHaveURL(/\/store$/);
  expect(listRequests).toBe(1);
});

test("shows truthful streamed agent workflow states", async ({ page }) => {
  const compiledPlan = plan("products");
  const catalog = executeCatalogQuery(catalogue as Product[], compiledPlan);
  const acceptedProductIds = catalog.products.slice(0, 8).map((item) => item.product.id);
  const data = {
    workflowId: "progress-workflow", plan: compiledPlan,
    interpretation: { summary: "Reviewed matches.", assumptions: [], chips: [] },
    catalog,
    review: { status: "recovered", reviewedProductIds: acceptedProductIds, acceptedProductIds, rejected: [], missingRequirements: [], retryRecommended: false, attempts: 2 },
    presentation: { summary: "Reviewed matches.", productRationales: [], guidance: "Review these matches." },
  };
  const chunks = [
    { type: "progress", data: { requestId: "progress", workflowId: "progress-workflow", step: "understanding", status: "running", agent: "search" } },
    { type: "progress", data: { requestId: "progress", workflowId: "progress-workflow", step: "searching", status: "running", agent: "search" } },
    { type: "progress", data: { requestId: "progress", workflowId: "progress-workflow", step: "reviewing", status: "running", agent: "review", reviewedCount: 2 } },
    { type: "progress", data: { requestId: "progress", workflowId: "progress-workflow", step: "retrying", status: "running", agent: "search", retry: 1, acceptedCount: 2 } },
    { type: "progress", data: { requestId: "progress", workflowId: "progress-workflow", step: "presenting", status: "running", agent: "concierge", acceptedCount: 2 } },
    { type: "result", data, requestId: "progress" },
  ];
  await page.addInitScript(({ streamChunks }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/concierge")) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          streamChunks.forEach((chunk, index) => setTimeout(() => controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`)), index * 650));
          setTimeout(() => controller.close(), streamChunks.length * 650);
        },
      }), { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    };
  }, { streamChunks: chunks });
  await page.goto("/store");
  await page.getByLabel("Describe what you need").fill("oak seating under $300");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await expect(page.getByText("Understanding your request")).toBeVisible();
  await expect(page.getByText("Searching the catalogue")).toBeVisible();
  await expect(page.getByText("Reviewing 2 matches")).toBeVisible();
  await expect(page.getByText("Review agent working")).toBeVisible();
  await expect(page.getByText("Checking better alternatives")).toBeVisible();
  await expect(page.getByText("Preparing recommendations")).toBeVisible();
  await expect(page.getByText("Concierge agent working")).toBeVisible();
  await expect(page.getByText("Reviewed matches.")).toBeVisible();
});

test("uploads a room, searches with scene context, and generates a furnished view", async ({ page }) => {
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const sceneId = "0f62b7cc-2738-4ebb-a12a-340a19dce0d7";
  const generationId = "73660e90-8f9e-4d20-a030-d4ca72e9ba18";
  await page.route("**/api/scene", async (route) => {
    if (route.request().headers()["content-type"]?.includes("multipart/form-data")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, requestId: "scene", data: { sceneId, previewUrl: pixel, expiresAt: "2026-09-08T00:00:00Z", analysis: { validRoomScene: true, containsIdentifiablePeople: false, roomType: "living room", confidence: 0.94, existingProductTypes: [], missingProductTypes: ["armchair"], suggestedCategories: ["seating", "tables-desks", "lighting"], styles: [], colors: [], materials: [], lighting: [], useCases: [], usableZones: [], retainElements: [], placementConstraints: [] } } }) });
    const body = route.request().postDataJSON() as { operation: string };
    const completed = body.operation === "getSceneGeneration";
    return route.fulfill({ status: completed ? 200 : 202, contentType: "application/json", body: JSON.stringify({ success: true, requestId: "generation", data: { generationId, sceneId, workflowId: "e2e-workflow", status: completed ? "completed" : "generating", outputUrl: completed ? pixel : null, expiresAt: "2026-09-08T00:00:00Z", attempt: 1, illustrative: false, verification: completed ? { scenePreserved: true, selectedProductsRepresented: true, architectureChanged: false, substitutionsDetected: false, extraObjectsIntroduced: false, confidence: 0.94, notes: [], passed: true } : null, error: null } }) });
  });
  await mockConcierge(page, "bundle", sceneId);
  await page.goto("/store");
  await page.locator('input[type="file"]').setInputFiles({ name: "living-room.png", mimeType: "image/png", buffer: Buffer.from("room") });
  await expect(page.getByText("Your space", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Describe what you need")).toHaveValue("Furnish this space");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await expect(page.getByRole("button", { name: "Furnish my space" })).toBeEnabled();
  await page.getByRole("button", { name: "Furnish my space" }).click();
  await expect(page.getByAltText("AI furnished visualization of the uploaded room")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Verified furnished visualization using the selected catalogue pieces.")).toBeVisible();
});

test("bundle Replace changes only the selected item", async ({ page }) => {
  await mockConcierge(page, "bundle");
  await page.goto("/store");
  await page.getByLabel("Describe what you need").fill("furnish my living room");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  const names = page.locator(".bundle-items article strong");
  await expect(names).toHaveCount(4);
  const before = await names.allTextContents();
  await page.locator(".bundle-items article").first().getByRole("button", { name: "Replace" }).click();
  await expect.poll(async () => (await names.allTextContents())[0]).not.toBe(before[0]);
  const after = await names.allTextContents();
  expect(after.slice(1)).toEqual(before.slice(1));
});

test("removes individual and all recent searches", async ({ page }) => {
  await mockConcierge(page, "products");
  await page.goto("/");
  await page.getByLabel("Describe what you need").fill("oak seating under $300");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await expect(page.getByText("Oak seating under $300.")).toBeVisible();
  await page.locator(".recent-menu summary").click();
  await page.getByRole("button", { name: /Remove recent search/ }).click();
  await expect(page.getByText("Your recent searches will appear here.")).toBeVisible();
  await page.locator(".recent-menu summary").click();
  await page.getByLabel("Describe what you need").fill("another oak seating search");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await expect(page.getByText("Oak seating under $300.")).toBeVisible();
  await page.locator(".recent-menu summary").click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("Your recent searches will appear here.")).toBeVisible();
});
