import type { CatalogFacets, CatalogQueryData, Product, RankedProduct } from "@/interfaces/catalog";
import type { QueryPlanPatch, QueryResultAssessment, SearchSuggestion } from "@/interfaces/intelligence";
import type { CatalogQueryPlanV1 } from "@/interfaces/search";
import { applyQueryPlanPatch } from "./queryPlan";

type CoreQueryData = Omit<CatalogQueryData, "assessment" | "suggestions">;

const normalized = (value: string) => value.trim().toLowerCase();
const includesAny = (values: string[], requested: string[]) => requested.length === 0 || requested.some((request) => values.some((value) => normalized(value) === normalized(request)));

export const buildFacets = (products: Product[]): CatalogFacets => {
  const unique = <T extends string>(values: T[]): T[] => [...new Set(values)].sort();
  return {
    categories: [...new Set(products.map((product) => product.category))].sort(),
    productTypes: unique(products.map((product) => product.productType)),
    rooms: unique(products.flatMap((product) => product.rooms)),
    styles: unique(products.flatMap((product) => product.styles)),
    colors: unique(products.flatMap((product) => product.colors)),
    materials: unique(products.flatMap((product) => product.materials)),
    availability: [...new Set(products.map((product) => product.availability))].sort(),
    price: products.length ? { min: Math.min(...products.map((product) => product.currentPrice)), max: Math.max(...products.map((product) => product.currentPrice)) } : { min: 0, max: 0 },
  };
};

export const productMatchesPlan = (product: Product, plan: CatalogQueryPlanV1) => {
  const { filters } = plan;
  if (plan.categories.length && !plan.categories.includes(product.category)) return false;
  if (filters.productTypes.length && !filters.productTypes.includes(product.productType)) return false;
  if (!includesAny(product.rooms, filters.rooms) || !includesAny(product.styles, filters.styles) || !includesAny(product.colors, filters.colors) || !includesAny(product.materials, filters.materials)) return false;
  if (filters.availability.length && !filters.availability.includes(product.availability)) return false;
  if (filters.price.min !== null && product.currentPrice < filters.price.min) return false;
  if (filters.price.max !== null && product.currentPrice > filters.price.max) return false;
  if (filters.discountOnly && product.discountPercent <= 0) return false;
  if (filters.maxDeliveryDays !== null && product.deliveryDays > filters.maxDeliveryDays) return false;
  if (filters.dimensions.maxWidth !== null && product.dimensions.width > filters.dimensions.maxWidth) return false;
  if (filters.dimensions.maxHeight !== null && product.dimensions.height > filters.dimensions.maxHeight) return false;
  if (filters.dimensions.maxDepth !== null && product.dimensions.depth > filters.dimensions.maxDepth) return false;
  if (plan.exclusions.productTypes.includes(product.productType)) return false;
  if (plan.exclusions.colors.some((value) => product.colors.some((color) => normalized(color) === normalized(value)))) return false;
  if (plan.exclusions.materials.some((value) => product.materials.some((material) => normalized(material) === normalized(value)))) return false;
  if (plan.exclusions.tags.some((value) => product.tags.some((tag) => normalized(tag) === normalized(value)))) return false;
  return true;
};

export const compatibleCatalogAlternatives = (products: Product[], selected: Product, plan: CatalogQueryPlanV1, limit = 3) => products
  .filter((product) => product.id !== selected.id && product.category === selected.category && product.availability !== "out_of_stock" && productMatchesPlan(product, plan))
  .sort((left, right) => Number(right.rooms.some((room) => selected.rooms.includes(room))) - Number(left.rooms.some((room) => selected.rooms.includes(room))) || left.id.localeCompare(right.id))
  .slice(0, limit);

const scoreProduct = (product: Product, plan: CatalogQueryPlanV1): RankedProduct => {
  let score = product.rating * 2 + Math.log10(product.reviewCount + 1);
  const reasons: string[] = [];
  const haystack = [product.name, product.description, product.category, ...product.tags, ...product.features, ...product.useCases].join(" ").toLowerCase();
  const words = normalized(plan.searchText).split(/\s+/).filter((word) => word.length > 2);
  const keywordMatches = words.filter((word) => haystack.includes(word)).length;
  if (keywordMatches) { score += keywordMatches * 2; reasons.push(`${keywordMatches} search match${keywordMatches === 1 ? "" : "es"}`); }
  for (const preference of plan.preferences) {
    const values = preference.field === "style" ? product.styles
      : preference.field === "color" ? product.colors
        : preference.field === "material" ? product.materials
          : preference.field === "room" ? product.rooms
            : preference.field === "productType" ? [product.productType]
              : preference.field === "useCase" ? product.useCases
                : preference.field === "feature" ? product.features
                  : product.tags;
    if (values.some((value) => normalized(value) === normalized(preference.value))) {
      score += preference.weight * 10;
      reasons.push(`${preference.value} preference`);
    }
  }
  if (product.availability === "in_stock") { score += 1; reasons.push("In stock"); }
  if (product.discountPercent > 0) score += product.discountPercent / 20;
  return { product, score: Number(score.toFixed(3)), reasons: reasons.slice(0, 3) };
};

const sortRanked = (products: RankedProduct[], plan: CatalogQueryPlanV1) => [...products].sort((left, right) => {
  const direction = plan.sort.direction === "asc" ? 1 : -1;
  const leftValue = plan.sort.field === "price" ? left.product.currentPrice : plan.sort.field === "rating" ? left.product.rating : plan.sort.field === "discount" ? left.product.discountPercent : left.score;
  const rightValue = plan.sort.field === "price" ? right.product.currentPrice : plan.sort.field === "rating" ? right.product.rating : plan.sort.field === "discount" ? right.product.discountPercent : right.score;
  return (leftValue - rightValue) * direction || left.product.id.localeCompare(right.product.id);
});

const executeCatalogQueryCore = (products: Product[], plan: CatalogQueryPlanV1, excludedProductIds: string[] = []): CoreQueryData => {
  const excluded = new Set(excludedProductIds);
  const matching = sortRanked(products.filter((product) => !excluded.has(product.id) && productMatchesPlan(product, plan)).map((product) => scoreProduct(product, plan)), plan);
  if (plan.mode !== "bundle" || !plan.bundle) {
    return { mode: "products", products: matching.slice(0, plan.limit), bundle: null, total: matching.length, facets: buildFacets(products) };
  }

  const selected: RankedProduct[] = [];
  let remainingBudget = plan.bundle.budget ?? Number.POSITIVE_INFINITY;
  const categories = plan.bundle.requiredCategories.slice(0, plan.bundle.itemCount);
  for (const category of categories) {
    const candidates = matching.filter((candidate) => candidate.product.category === category && !selected.some((item) => item.product.id === candidate.product.id));
    const fitting = candidates.filter((candidate) => candidate.product.currentPrice <= remainingBudget);
    const choice = fitting[0];
    if (choice) { selected.push(choice); remainingBudget -= choice.product.currentPrice; }
  }
  for (const candidate of matching) {
    if (selected.length >= plan.bundle.itemCount) break;
    if (selected.some((item) => item.product.id === candidate.product.id) || candidate.product.currentPrice > remainingBudget) continue;
    selected.push(candidate);
    remainingBudget -= candidate.product.currentPrice;
  }
  const combinedPrice = Number(selected.reduce((sum, item) => sum + item.product.currentPrice, 0).toFixed(2));
  return {
    mode: "bundle",
    products: matching.slice(0, plan.limit),
    bundle: { room: plan.bundle.room, products: selected, combinedPrice, budget: plan.bundle.budget },
    total: matching.length,
    facets: buildFacets(products),
  };
};

const activeConstraints = (plan: CatalogQueryPlanV1) => {
  const values: Array<{ label: string; patch: QueryPlanPatch }> = [];
  const arrays: Array<[QueryPlanPatch["field"], string, string[]]> = [
    ["categories", "category", plan.categories], ["filters.productTypes", "product type", plan.filters.productTypes],
    ["filters.rooms", "room", plan.filters.rooms], ["filters.styles", "style", plan.filters.styles],
    ["filters.colors", "colour", plan.filters.colors], ["filters.materials", "material", plan.filters.materials],
    ["filters.availability", "availability", plan.filters.availability],
    ["exclusions.productTypes", "excluded product type", plan.exclusions.productTypes],
    ["exclusions.colors", "excluded colour", plan.exclusions.colors],
    ["exclusions.materials", "excluded material", plan.exclusions.materials],
    ["exclusions.tags", "excluded tag", plan.exclusions.tags],
  ];
  for (const [field, name, entries] of arrays) for (const value of entries) values.push({ label: `${name}: ${value}`, patch: { operation: "remove", field, value } });
  if (plan.filters.price.min !== null) values.push({ label: `price from $${Math.round(plan.filters.price.min)}`, patch: { operation: "set", field: "filters.price.min", value: null } });
  if (plan.filters.price.max !== null) values.push({ label: `price up to $${Math.round(plan.filters.price.max)}`, patch: { operation: "set", field: "filters.price.max", value: null } });
  if (plan.filters.discountOnly) values.push({ label: "discounted products", patch: { operation: "set", field: "filters.discountOnly", value: false } });
  if (plan.filters.maxDeliveryDays !== null) values.push({ label: `delivery within ${plan.filters.maxDeliveryDays} days`, patch: { operation: "set", field: "filters.maxDeliveryDays", value: null } });
  if (plan.filters.dimensions.maxWidth !== null) values.push({ label: `width up to ${plan.filters.dimensions.maxWidth} in`, patch: { operation: "set", field: "filters.dimensions.maxWidth", value: null } });
  if (plan.filters.dimensions.maxHeight !== null) values.push({ label: `height up to ${plan.filters.dimensions.maxHeight} in`, patch: { operation: "set", field: "filters.dimensions.maxHeight", value: null } });
  if (plan.filters.dimensions.maxDepth !== null) values.push({ label: `depth up to ${plan.filters.dimensions.maxDepth} in`, patch: { operation: "set", field: "filters.dimensions.maxDepth", value: null } });
  return values;
};

const applyPatches = (plan: CatalogQueryPlanV1, patches: QueryPlanPatch[]) => patches.reduce(applyQueryPlanPatch, plan);

const assessQueryResult = (products: Product[], plan: CatalogQueryPlanV1, result: CoreQueryData): QueryResultAssessment => {
  const active = activeConstraints(plan);
  const candidateRelaxations = active
    .filter(({ patch }) => executeCatalogQueryCore(products, applyQueryPlanPatch(plan, patch)).total > result.total)
    .map(({ patch }) => patch);
  const selectedCategories = new Set(result.bundle?.products.map((item) => item.product.category) || []);
  const missingBundleCategories = plan.bundle?.requiredCategories.filter((category) => !selectedCategories.has(category)) || [];
  const bundleComplete = !plan.bundle || (missingBundleCategories.length === 0 && (result.bundle?.products.length || 0) >= plan.bundle.itemCount);
  const remainingBudget = plan.bundle?.budget === null || plan.bundle?.budget === undefined || !result.bundle
    ? null
    : Number((plan.bundle.budget - result.bundle.combinedPrice).toFixed(2));
  return {
    resultCount: result.total,
    constraintsSatisfied: result.total > 0 ? active.map(({ label }) => label) : [],
    constraintsWithoutCoverage: result.total === 0 ? active.map(({ label }) => label) : [],
    bundleComplete,
    missingBundleCategories,
    remainingBudget,
    candidateRelaxations,
  };
};

const generateSuggestions = (products: Product[], plan: CatalogQueryPlanV1, result: CoreQueryData, assessment: QueryResultAssessment): SearchSuggestion[] => {
  const suggestions: SearchSuggestion[] = [];
  const seen = new Set<string>();
  const constraints = activeConstraints(plan);
  const patchLabel = (patch: QueryPlanPatch) => constraints.find((constraint) => constraint.patch.field === patch.field
    && constraint.patch.operation === patch.operation
    && constraint.patch.value === patch.value)?.label ?? patch.field.replaceAll(".", " ");
  const offer = (suggestion: SearchSuggestion, improvement: (next: CoreQueryData) => boolean = (next) => next.total > 0) => {
    if (suggestion.patch.length === 0) return;
    const nextPlan = applyPatches(plan, suggestion.patch);
    const key = JSON.stringify(nextPlan);
    if (seen.has(key)) return;
    const next = executeCatalogQueryCore(products, nextPlan);
    if (JSON.stringify(nextPlan) === JSON.stringify(plan) || !improvement(next)) return;
    seen.add(key); suggestions.push(suggestion);
  };

  if (result.total === 0) {
    for (const patch of assessment.candidateRelaxations) {
      const label = patchLabel(patch);
      offer({ id: `relax-${patch.field}`, label: `Relax ${label}`, prompt: `Broaden the search by relaxing ${label}`, patch: [patch], reason: "This constraint prevents the current catalogue from returning a match." });
    }
    if (suggestions.length < 2) {
      const patches = constraints.map(({ patch }) => patch);
      offer({ id: "broaden-all", label: "Broaden the search", prompt: "Show the closest available catalogue options", patch: patches, reason: "Removing the active hard constraints restores feasible catalogue matches." });
      offer({ id: "broaden-lowest-price", label: "Broaden by lowest price", prompt: "Show the closest available options from lowest price", patch: [...patches, { operation: "set", field: "sort.field", value: "price" }, { operation: "set", field: "sort.direction", value: "asc" }], reason: "Removing conflicting constraints and sorting by price provides another feasible route into the catalogue." });
    }
  }

  if (plan.bundle && result.bundle && !assessment.bundleComplete && plan.bundle.budget !== null) {
    const minimumMissing = assessment.missingBundleCategories.reduce((total, category) => {
      const candidates = products.filter((product) => product.category === category && productMatchesPlan(product, { ...plan, bundle: null, mode: "products" }));
      return total + (candidates.length ? Math.min(...candidates.map((product) => product.currentPrice)) : 0);
    }, 0);
    const budget = Math.ceil((result.bundle.combinedPrice + minimumMissing) / 25) * 25;
    if (budget > plan.bundle.budget) offer({ id: "complete-bundle-budget", label: `Raise budget to $${budget}`, prompt: `Complete the room bundle with a budget of $${budget}`, patch: [{ operation: "set", field: "bundle.budget", value: budget }], reason: "The higher budget can cover the missing bundle roles." }, (next) => (next.bundle?.products.length || 0) > result.bundle!.products.length);
  }

  if (plan.bundle && result.bundle && !assessment.bundleComplete) {
    const currentCount = result.bundle.products.length;
    const currentMissing = assessment.missingBundleCategories.length;
    const improvesBundle = (next: CoreQueryData) => {
      const selectedCategories = new Set(next.bundle?.products.map((item) => item.product.category) ?? []);
      const missing = plan.bundle!.requiredCategories.filter((category) => !selectedCategories.has(category)).length;
      return (next.bundle?.products.length ?? 0) > currentCount || missing < currentMissing;
    };
    const usefulRelaxations = constraints.filter(({ patch }) => improvesBundle(executeCatalogQueryCore(products, applyQueryPlanPatch(plan, patch))));
    for (const { label, patch } of usefulRelaxations) {
      offer({ id: `complete-bundle-${patch.field}`, label: `Relax ${label}`, prompt: `Complete the bundle by relaxing ${label}`, patch: [patch], reason: "Relaxing this constraint adds a missing room role." }, improvesBundle);
    }
    if (suggestions.length < 2 && usefulRelaxations.length) {
      const patches = usefulRelaxations.map(({ patch }) => patch);
      offer({ id: "complete-bundle-broaden", label: "Broaden bundle options", prompt: "Broaden the constraints to complete this room", patch: patches, reason: "The broader compatible set fills more of the requested room roles." }, improvesBundle);
    }
    if (suggestions.length < 2 && suggestions[0]) {
      for (const sort of [{ field: "price", direction: "asc" }, { field: "rating", direction: "desc" }] as const) {
        offer({ id: `complete-bundle-${sort.field}`, label: sort.field === "price" ? "Complete with lower prices" : "Complete with highest rated", prompt: sort.field === "price" ? "Complete the room using lower-priced compatible pieces" : "Complete the room using highly rated compatible pieces", patch: [...suggestions[0].patch, { operation: "set", field: "sort.field", value: sort.field }, { operation: "set", field: "sort.direction", value: sort.direction }], reason: "This keeps the feasible recovery while changing how compatible pieces are prioritized." }, improvesBundle);
      }
    }
    return suggestions.slice(0, 2);
  }

  const rankedProducts = result.products.map((item) => item.product);
  if (result.total > plan.limit && plan.filters.productTypes.length === 0) {
    const counts = new Map<string, number>();
    for (const product of rankedProducts) counts.set(product.productType, (counts.get(product.productType) || 0) + 1);
    const productType = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (productType) offer({ id: `narrow-${productType}`, label: `Focus on ${productType.replaceAll("-", " ")}`, prompt: `Only show ${productType.replaceAll("-", " ")}`, patch: [{ operation: "add", field: "filters.productTypes", value: productType }], reason: "This available product type meaningfully narrows the result set." }, (next) => next.total > 0 && next.total < result.total);
  }

  if (!plan.filters.availability.includes("in_stock")) offer({ id: "in-stock", label: "Only show in-stock", prompt: "Only show pieces that are in stock", patch: [{ operation: "add", field: "filters.availability", value: "in_stock" }], reason: "In-stock products are available in the current result set." }, (next) => next.total > 0 && next.total <= result.total);
  if (!plan.filters.discountOnly) offer({ id: "discounted", label: "Show discounted options", prompt: "Only show discounted pieces", patch: [{ operation: "set", field: "filters.discountOnly", value: true }], reason: "Discounted products are available under the active constraints." }, (next) => next.total > 0 && next.total <= result.total);
  if (plan.sort.field !== "price" || plan.sort.direction !== "asc") offer({ id: "lowest-price", label: "Lowest price first", prompt: "Sort these options by lowest price", patch: [{ operation: "set", field: "sort.field", value: "price" }, { operation: "set", field: "sort.direction", value: "asc" }], reason: "The same feasible matches can be compared from lowest price." });
  if (plan.sort.field !== "rating" || plan.sort.direction !== "desc") offer({ id: "highest-rated", label: "Highest rated first", prompt: "Sort these options by highest rating", patch: [{ operation: "set", field: "sort.field", value: "rating" }, { operation: "set", field: "sort.direction", value: "desc" }], reason: "The same feasible matches can be compared by rating." });
  if (plan.sort.field !== "discount" || plan.sort.direction !== "desc") offer({ id: "largest-discount", label: "Largest discount first", prompt: "Sort these options by largest discount", patch: [{ operation: "set", field: "sort.field", value: "discount" }, { operation: "set", field: "sort.direction", value: "desc" }], reason: "The same feasible matches can be compared by discount." });
  if (plan.sort.field !== "relevance" || plan.sort.direction !== "desc") offer({ id: "most-relevant", label: "Most relevant first", prompt: "Sort these options by relevance", patch: [{ operation: "set", field: "sort.field", value: "relevance" }, { operation: "set", field: "sort.direction", value: "desc" }], reason: "The same feasible matches can be restored to deterministic relevance order." });
  return suggestions.slice(0, 2);
};

export const executeCatalogQuery = (products: Product[], plan: CatalogQueryPlanV1, excludedProductIds: string[] = []): CatalogQueryData => {
  const core = executeCatalogQueryCore(products, plan, excludedProductIds);
  const assessment = assessQueryResult(products, plan, core);
  return { ...core, assessment, suggestions: generateSuggestions(products, plan, core, assessment) };
};

export const replaceCatalogBundleProduct = (products: Product[], plan: CatalogQueryPlanV1, currentProductIds: string[], targetProductId: string): CatalogQueryData | null => {
  if (plan.mode !== "bundle" || !plan.bundle || !currentProductIds.includes(targetProductId)) return null;
  const byId = new Map(products.map((product) => [product.id, product]));
  const current = currentProductIds.map((id) => byId.get(id));
  const target = byId.get(targetProductId);
  if (!target || current.some((product) => !product)) return null;
  const retained = current.filter((product): product is Product => Boolean(product) && product!.id !== targetProductId);
  const remainingBudget = plan.bundle.budget === null ? Number.POSITIVE_INFINITY : plan.bundle.budget - retained.reduce((sum, product) => sum + product.currentPrice, 0);
  const excluded = new Set(currentProductIds);
  const candidate = sortRanked(products.filter((product) => !excluded.has(product.id) && product.category === target.category && productMatchesPlan(product, plan) && product.currentPrice <= remainingBudget).map((product) => scoreProduct(product, plan)), plan)[0];
  if (!candidate) return null;
  const selected = currentProductIds.map((id) => id === targetProductId ? candidate : scoreProduct(byId.get(id)!, plan));
  const core = executeCatalogQueryCore(products, plan);
  const replaced: CoreQueryData = {
    ...core,
    bundle: { room: plan.bundle.room, products: selected, combinedPrice: Number(selected.reduce((sum, item) => sum + item.product.currentPrice, 0).toFixed(2)), budget: plan.bundle.budget },
  };
  const assessment = assessQueryResult(products, plan, replaced);
  return { ...replaced, assessment, suggestions: generateSuggestions(products, plan, replaced, assessment) };
};
