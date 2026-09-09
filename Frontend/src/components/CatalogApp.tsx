"use client";

import { Bookmark, Heart, ImagePlus, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CATEGORY_IDS, CATEGORY_LABELS, type Product, type RankedProduct } from "@/interfaces/catalog";
import { resetAIState, setAIDraft, setAIPlan } from "@/redux/slices/aiSlice";
import {
  consumePendingSearchAction,
  executePlanAction,
  executeSuggestionAction,
  hydrateLocalDataAction,
  initializeCatalogAction,
  loadNextCatalogPageAction,
  removeChipAction,
  replaceBundleItemAction,
  submitSearchAction,
  analyzeSceneAction,
  generateSceneAction,
  transcribeAndSearchAction,
} from "@/redux/catalogThunks";
import { setLikeAction } from "@/redux/accountThunks";
import { authPendingLike } from "@/redux/slices/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import {
  selectActiveBundle,
  selectAIDraft,
  selectAIInterpretation,
  selectAIPlan,
  selectCatalogFacets,
  selectCatalogueProducts,
  selectCatalogueStatus,
  selectCatalogueNextCursor,
  selectCataloguePageStatus,
  selectConciergePresentation,
  selectCompletedWorkflowSteps,
  selectMatchedResultTotal,
  selectWorkflowProgress,
  selectSavedProductIds,
  selectSearchSuggestions,
  selectStoreBusy,
  selectStoreError,
  selectVisibleResults,
  selectSceneAnalysis,
  selectSceneAuthorizedProductIds,
  selectSceneAuthorizedWorkflowId,
  selectSceneBusy,
  selectSceneError,
  selectSceneGeneration,
} from "@/redux/selectors";
import { SceneGenerationStatus } from "@/interfaces/scene";
import { clearScene } from "@/redux/slices/sceneSlice";
import { emptyQueryPlan } from "@/utils/queryPlan";
import { agentWorkflowProgressCopy } from "@/utils/agentWorkflowProgress";
import { compatibleCatalogAlternatives } from "@/utils/catalogQuery";
import { AppHeader } from "./AppHeader";
import { ProductVisual } from "./ProductVisual";
import { SearchComposer } from "./SearchComposer";
import { ProductContextPanel } from "./ProductContextPanel";
import { productPath, productUrl } from "@/utils/catalogUrl";
import { Button, Chip, IconButton } from "./primitives";
import dynamic from "next/dynamic";

const AgentDecorShader = dynamic(() => import("./AgentDecorShader").then((module) => module.AgentDecorShader), { ssr: false });

const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
let pendingReturnFocusProductId: string | null = null;
let pendingPanelFocusSlug: string | null = null;
let expansionAnchorProductId: string | null = null;
const PRODUCT_DETAIL_MODE_KEY = "catalogx-product-detail-mode";
const PRODUCT_DETAIL_MODE_EVENT = "catalogx-product-detail-mode-change";

function ProductCard({
  item,
  saved,
  onSave,
  onOpen,
  priority,
  selected,
  openButtonRef,
}: {
  item: RankedProduct;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  priority?: boolean;
  selected?: boolean;
  openButtonRef?: (node: HTMLButtonElement | null) => void;
}) {
  const { product } = item;
  return (
    <article className={`product-card ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <button ref={openButtonRef} className="product-open" onClick={onOpen} aria-label={`View ${product.name}`}>
        <ProductVisual product={product} priority={priority} />
      </button>
      <IconButton
        label={saved ? `Remove ${product.name} from saved products` : `Save ${product.name}`}
        className={`save-button ${saved ? "saved" : ""}`}
        onClick={onSave}
      >
        <Heart size={17} fill={saved ? "currentColor" : "none"} />
      </IconButton>
      <button className="product-copy" onClick={onOpen}>
        <span className="product-kicker">{CATEGORY_LABELS[product.category]}</span>
        <h3>{product.name}</h3>
        <span className="product-price">
          {price.format(product.currentPrice)}
          {product.discountPercent > 0 && (
            <>
              <del>{price.format(product.originalPrice)}</del>
              <em>−{product.discountPercent}%</em>
            </>
          )}
        </span>
        <span className="product-meta">
          {product.colors[0]} · {product.materials[0]}
        </span>
      </button>
    </article>
  );
}

function ProductContextModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog
    ref={dialogRef}
    className="product-context-modal"
    aria-labelledby="product-context-heading"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onMouseDown={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
  >{children}</dialog>;
}

const subscribeToViewport = (callback: () => void) => {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
};
const viewportColumns = () => window.innerWidth <= 720 ? 2 : window.innerWidth <= 1050 ? 3 : 4;
const serverColumns = () => 4;
const subscribeToDetailMode = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(PRODUCT_DETAIL_MODE_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(PRODUCT_DETAIL_MODE_EVENT, callback); };
};
const detailModeSnapshot = () => localStorage.getItem(PRODUCT_DETAIL_MODE_KEY) === "modal";
const detailModeServerSnapshot = () => false;

export function CatalogApp({ initialProduct = null }: { initialProduct?: Product | null }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const products = useAppSelector(selectVisibleResults);
  const catalogueProducts = useAppSelector(selectCatalogueProducts);
  const facets = useAppSelector(selectCatalogFacets);
  const catalogueStatus = useAppSelector(selectCatalogueStatus);
  const catalogueNextCursor = useAppSelector(selectCatalogueNextCursor);
  const cataloguePageStatus = useAppSelector(selectCataloguePageStatus);
  const plan = useAppSelector(selectAIPlan);
  const interpretation = useAppSelector(selectAIInterpretation);
  const conciergePresentation = useAppSelector(selectConciergePresentation);
  const workflowProgress = useAppSelector(selectWorkflowProgress);
  const completedWorkflowSteps = useAppSelector(selectCompletedWorkflowSteps);
  const matchedTotal = useAppSelector(selectMatchedResultTotal);
  const suggestions = useAppSelector(selectSearchSuggestions);
  const prompt = useAppSelector(selectAIDraft);
  const busy = useAppSelector(selectStoreBusy);
  const error = useAppSelector(selectStoreError);
  const saved = useAppSelector(selectSavedProductIds);
  const session = useAppSelector((state) => state.auth.session);
  const bundle = useAppSelector(selectActiveBundle);
  const scene = useAppSelector(selectSceneAnalysis);
  const sceneAuthorizedWorkflowId = useAppSelector(selectSceneAuthorizedWorkflowId);
  const sceneAuthorizedProductIds = useAppSelector(selectSceneAuthorizedProductIds);
  const sceneGeneration = useAppSelector(selectSceneGeneration);
  const sceneBusy = useAppSelector(selectSceneBusy);
  const sceneError = useAppSelector(selectSceneError);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState({ slug: "", message: "" });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const modalMode = useSyncExternalStore(subscribeToDetailMode, detailModeSnapshot, detailModeServerSnapshot);
  const columns = useSyncExternalStore(subscribeToViewport, viewportColumns, serverColumns);
  const handledLinkedCategory = useRef<string | null>(null);
  const productHeadingRef = useRef<HTMLHeadingElement>(null);
  const productButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedSlug = selectedProduct?.slug ?? null;
  const linkedCategory = CATEGORY_IDS.find((category) => category === searchParams.get("category")) || null;
  const selectedRanked = selectedProduct ? [...products, ...(bundle?.products ?? [])].find((item) => item.product.id === selectedProduct.id) : null;
  const activeRationale = selectedProduct
    ? conciergePresentation?.productRationales.find((item) => item.productId === selectedProduct.id)?.rationale
    : null;
  const activeConstraints = interpretation?.chips.map((chip) => chip.label) ?? [];
  const alternatives = useMemo(() => selectedProduct ? compatibleCatalogAlternatives(catalogueProducts, selectedProduct, plan) : [], [catalogueProducts, plan, selectedProduct]);
  const selectedResultIndex = selectedProduct ? products.findIndex((item) => item.product.id === selectedProduct.id) : -1;
  const anchoredResultIndex = expansionAnchorProductId ? products.findIndex((item) => item.product.id === expansionAnchorProductId) : -1;
  const expansionResultIndex = anchoredResultIndex >= 0 ? anchoredResultIndex : selectedResultIndex;
  const panelBeforeIndex = expansionResultIndex < 0 ? -1 : Math.floor(expansionResultIndex / columns) * columns;
  const activeProgressCopy = agentWorkflowProgressCopy(workflowProgress);

  useEffect(() => {
    void dispatch(initializeCatalogAction());
    dispatch(hydrateLocalDataAction());
    void dispatch(consumePendingSearchAction());
  }, [dispatch]);
  useEffect(() => {
    if (catalogueStatus !== "succeeded" || !linkedCategory || handledLinkedCategory.current === linkedCategory) return;
    handledLinkedCategory.current = linkedCategory;
    const next = { ...plan, mode: "products" as const, categories: [linkedCategory], bundle: null };
    void dispatch(executePlanAction(next));
    router.replace("/store", { scroll: false });
  }, [catalogueStatus, dispatch, linkedCategory, plan, router]);
  useEffect(() => {
    if (selectedProduct && pendingPanelFocusSlug === selectedProduct.slug) {
      pendingPanelFocusSlug = null;
      requestAnimationFrame(() => productHeadingRef.current?.focus({ preventScroll: true }));
    }
    if (!selectedProduct && pendingReturnFocusProductId && catalogueStatus === "succeeded") {
      const productId = pendingReturnFocusProductId;
      requestAnimationFrame(() => {
        const button = productButtonRefs.current.get(productId);
        if (button) { button.focus({ preventScroll: true }); pendingReturnFocusProductId = null; }
      });
    }
    if (!selectedProduct) expansionAnchorProductId = null;
  }, [catalogueStatus, modalMode, selectedProduct]);
  const openProduct = (product: Product, preserveOrigin = false) => {
    if (!preserveOrigin) {
      pendingReturnFocusProductId = product.id;
      expansionAnchorProductId = product.id;
    }
    pendingPanelFocusSlug = product.slug;
    window.history.replaceState(window.history.state, "", productPath(product.slug));
    setSelectedProduct(product);
  };
  const closeProduct = () => {
    window.history.replaceState(window.history.state, "", "/store");
    setSelectedProduct(null);
  };
  const shareProduct = async (product: Product) => {
    const url = productUrl(product.slug);
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: product.description, url });
      else { await navigator.clipboard.writeText(url); setShareNotice({ slug: product.slug, message: "Link copied" }); }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
      try { await navigator.clipboard.writeText(url); setShareNotice({ slug: product.slug, message: "Link copied" }); }
      catch { setShareNotice({ slug: product.slug, message: "Unable to share this link" }); }
    }
  };
  const saveProduct = (product: Product) => {
    if (!session) {
      dispatch(authPendingLike(product.id));
      router.push(`/sign-in?next=${encodeURIComponent(selectedSlug ? `/store/${selectedSlug}` : "/store")}`);
      return;
    }
    void dispatch(setLikeAction(product.id, !saved.includes(product.id)));
  };
  const contextPanel = selectedProduct ? <ProductContextPanel
    product={selectedProduct}
    rationale={activeRationale ?? null}
    reasons={selectedRanked?.reasons ?? []}
    constraints={activeConstraints}
    saved={saved.includes(selectedProduct.id)}
    alternatives={alternatives}
    inBundle={Boolean(bundle?.products.some((item) => item.product.id === selectedProduct.id))}
    sceneAuthorized={sceneAuthorizedProductIds.includes(selectedProduct.id)}
    modalMode={modalMode}
    headingRef={productHeadingRef}
    shareStatus={shareNotice.slug === selectedProduct.slug ? shareNotice.message : ""}
    onClose={closeProduct}
    onSave={() => saveProduct(selectedProduct)}
    onShare={() => void shareProduct(selectedProduct)}
    onToggleMode={() => {
      const nextMode = !modalMode;
      localStorage.setItem(PRODUCT_DETAIL_MODE_KEY, nextMode ? "modal" : "inline");
      pendingPanelFocusSlug = selectedProduct.slug;
      window.dispatchEvent(new Event(PRODUCT_DETAIL_MODE_EVENT));
    }}
    onBuildAround={() => dispatch(setAIDraft(`Build a room around ${selectedProduct.name}`))}
    onReplace={() => { void dispatch(replaceBundleItemAction(selectedProduct.id)); closeProduct(); }}
    onVisualize={() => void dispatch(generateSceneAction())}
    onAlternative={(product) => openProduct(product, true)}
  /> : null;
  const submit = (override?: string) => {
    if (selectedSlug) closeProduct();
    void dispatch(submitSearchAction(override));
  };
  const setCategory = (category: (typeof CATEGORY_IDS)[number] | null) => {
    if (selectedSlug) closeProduct();
    const next = { ...plan, mode: "products" as const, categories: category ? [category] : [], bundle: null };
    void dispatch(executePlanAction(next));
  };
  const countLabel = useMemo(
    () => matchedTotal > products.length
      ? `${products.length} reviewed · ${matchedTotal} matches`
      : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`,
    [matchedTotal, products.length],
  );

  return (
    <main className="catalog-app store-page">
      <AppHeader onRecent={submit} />
      <div className="store-intro">
        <div>
          <span className="eyebrow">Our catalogue</span>
          <h1>Pieces for your space.</h1>
        </div>
        <p>Describe it below, browse by category, or tune your vision with precise filters.</p>
      </div>
      <nav className="category-nav" aria-label="Product categories">
        <button className={!plan.categories.length ? "active" : ""} onClick={() => setCategory(null)}>
          All
        </button>
        {CATEGORY_IDS.map((category) => (
          <button
            key={category}
            className={plan.categories.includes(category) ? "active" : ""}
            onClick={() => setCategory(category)}
          >
            {CATEGORY_LABELS[category]}
          </button>
        ))}
      </nav>
      <section className="results-section">
        <div className="results-toolbar">
          <div>
            <span className="eyebrow">Curated catalogue</span>
            <h2>{bundle ? `${bundle.room} collection` : "Selected for you"}</h2>
          </div>
          <div className="result-actions">
            <span>{countLabel}</span>
            <Button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen((value) => !value)}>
              <SlidersHorizontal size={16} /> Filters
            </Button>
          </div>
        </div>
        {scene && (
          <section className="scene-workspace" aria-label="Uploaded space visualization">
            <div className="scene-source">
              {/* The URL is private and short lived in production. */}
              <Image unoptimized width={184} height={136} src={scene.previewUrl} alt={`Uploaded ${scene.analysis.roomType ?? "room"}`} />
              <div><span className="eyebrow">Your space</span><strong>{scene.analysis.roomType ?? "Room detected"}</strong><small>{Math.round(scene.analysis.confidence * 100)}% scene confidence · expires in 24 hours</small></div>
              <Button className="scene-remove" onClick={() => dispatch(clearScene())}>Remove</Button>
            </div>
            {sceneGeneration?.outputUrl ? (
              <figure className="scene-result">
                <Image unoptimized width={1600} height={1200} src={sceneGeneration.outputUrl} alt="AI furnished visualization of the uploaded room" />
                <figcaption>{sceneGeneration.illustrative ? "Illustrative visualization. Product scale, colour, fit, and appearance may vary." : "Verified furnished visualization using the selected catalogue pieces."}</figcaption>
              </figure>
            ) : (
              <div className="scene-generate">
                <ImagePlus size={24} />
                <div><strong>{sceneBusy ? sceneGeneration?.status === SceneGenerationStatus.Verifying ? "Verifying the result" : "Furnishing your space" : "See these pieces in your room"}</strong><p>We will preserve the room and compose it with the reviewed catalogue pieces.</p></div>
                <Button disabled={sceneBusy || !sceneAuthorizedWorkflowId || !sceneAuthorizedProductIds.length} onClick={() => void dispatch(generateSceneAction())}>{sceneBusy ? <span className="spinner" /> : "Furnish my space"}</Button>
              </div>
            )}
            {(sceneError || sceneGeneration?.error) && <p role="alert" className="error-note">{sceneError || sceneGeneration?.error}</p>}
          </section>
        )}
        {filtersOpen && facets && (
          <div className="filter-panel">
            <label>
              Room
              <select
                value={plan.filters.rooms[0] || ""}
                onChange={(event) =>
                  dispatch(
                    setAIPlan({
                      ...plan,
                      filters: { ...plan.filters, rooms: event.target.value ? [event.target.value] : [] },
                    }),
                  )
                }
              >
                <option value="">Any room</option>
                {facets.rooms.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Style
              <select
                value={plan.filters.styles[0] || ""}
                onChange={(event) =>
                  dispatch(
                    setAIPlan({
                      ...plan,
                      filters: { ...plan.filters, styles: event.target.value ? [event.target.value] : [] },
                    }),
                  )
                }
              >
                <option value="">Any style</option>
                {facets.styles.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Material
              <select
                value={plan.filters.materials[0] || ""}
                onChange={(event) =>
                  dispatch(
                    setAIPlan({
                      ...plan,
                      filters: { ...plan.filters, materials: event.target.value ? [event.target.value] : [] },
                    }),
                  )
                }
              >
                <option value="">Any material</option>
                {facets.materials.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Maximum price
              <input
                type="number"
                min={0}
                placeholder="No limit"
                value={plan.filters.price.max ?? ""}
                onChange={(event) =>
                  dispatch(
                    setAIPlan({
                      ...plan,
                      filters: {
                        ...plan.filters,
                        price: { ...plan.filters.price, max: event.target.value ? Number(event.target.value) : null },
                      },
                    }),
                  )
                }
              />
            </label>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={plan.filters.discountOnly}
                onChange={(event) =>
                  dispatch(setAIPlan({ ...plan, filters: { ...plan.filters, discountOnly: event.target.checked } }))
                }
              />{" "}
              On sale only
            </label>
            <Button className="apply-filter" onClick={() => { closeProduct(); void dispatch(executePlanAction(plan)); }}>
              Apply filters
            </Button>
          </div>
        )}
        {bundle && (
          <section className="bundle-card">
            <div className="bundle-heading">
              <div>
                <span className="eyebrow">Room bundle</span>
                <h3>{bundle.room}, composed</h3>
              </div>
              <div>
                <strong>{price.format(bundle.combinedPrice)}</strong>
                {bundle.budget && <span>of {price.format(bundle.budget)} budget</span>}
              </div>
            </div>
            <div className="bundle-items">
              {bundle.products.map((item) => (
                <article
                  key={item.product.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`View ${item.product.name}`}
                  onClick={() => openProduct(item.product)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openProduct(item.product);
                    }
                  }}
                >
                  <ProductVisual product={item.product} />
                  <div>
                    <span>{CATEGORY_LABELS[item.product.category]}</span>
                    <strong>{item.product.name}</strong>
                    <small>{price.format(item.product.currentPrice)}</small>
                    <button
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void dispatch(replaceBundleItemAction(item.product.id));
                      }}
                    >
                      Replace
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {catalogueStatus !== "succeeded" ? (
          <><div className="product-grid" aria-label="Loading catalogue">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="product-skeleton" key={index}>
                <span />
                <i />
                <i />
              </div>
            ))}
          </div>{contextPanel && !modalMode && <div className="direct-product-context">{contextPanel}</div>}</>
        ) : !products.length && !busy ? (
          <div className="empty-state">
            <Bookmark size={28} />
            <h3>No exact matches yet</h3>
            <p>Remove a chip or widen the budget to explore more of the catalogue.</p>
            <Button
              onClick={() => {
                closeProduct();
                const reset = emptyQueryPlan();
                dispatch(resetAIState());
                void dispatch(executePlanAction(reset));
              }}
            >
              Reset search
            </Button>
          </div>
        ) : (
          <div className={`product-grid ${busy ? "loading" : ""}`} aria-busy={busy}>
            {products.map((item, index) => <Fragment key={item.product.id}>
              {index === panelBeforeIndex && !modalMode && contextPanel}
              <ProductCard item={item} saved={saved.includes(item.product.id)} selected={selectedProduct?.id === item.product.id}
                openButtonRef={(node) => node ? productButtonRefs.current.set(item.product.id, node) : productButtonRefs.current.delete(item.product.id)}
                onSave={() => saveProduct(item.product)} onOpen={() => openProduct(item.product)} priority={index < 4} />
            </Fragment>)}
            {selectedProduct && !products.some((item) => item.product.id === selectedProduct.id) && !modalMode && contextPanel}
          </div>
        )}
        {catalogueNextCursor && catalogueStatus === "succeeded" && !bundle && (
          <div className="catalog-load-more">
            <Button
              disabled={cataloguePageStatus === "loading"}
              onClick={() => void dispatch(loadNextCatalogPageAction())}
            >
              {cataloguePageStatus === "loading" ? "Loading pieces…" : "Load more pieces"}
            </Button>
          </div>
        )}
      </section>
      {selectedProduct && modalMode && <ProductContextModal onClose={closeProduct}>{contextPanel}</ProductContextModal>}
      <footer>
        <span>CatalogX by BashBash Labs</span>
        <span>100 fictional pieces · deterministic results</span>
      </footer>
      <aside className="store-composer-dock" aria-label="AI catalogue assistant">
        {(busy || sceneBusy || interpretation || error || sceneError) && (
          <div className="store-interpretation">
            {(error || sceneError) && (
              <p role="alert" className="global-error">
                <X size={15} />
                {error || sceneError}
              </p>
            )}
            {busy ? (
              <div className="workflow-progress agent-workflow-progress" aria-live="polite" aria-atomic="true">
                {workflowProgress && <AgentDecorShader progress={workflowProgress} />}
                <div className="workflow-copy">
                  <strong>{activeProgressCopy.task}</strong>
                  <small>{activeProgressCopy.agentLabel}</small>
                </div>
                <div className="workflow-markers" aria-label={`${completedWorkflowSteps.length} workflow steps completed`}>
                  {completedWorkflowSteps.map((step) => <span key={step} title={step.replaceAll("_", " ")} />)}
                </div>
              </div>
            ) : sceneBusy ? (
              <div className="workflow-progress" aria-live="polite" aria-atomic="true">
                <span className="workflow-pulse" aria-hidden="true" />
                <div>
                  <strong>{sceneGeneration ? sceneGeneration.status === SceneGenerationStatus.Verifying ? "Verifying the result" : "Furnishing your space" : "Checking your space"}</strong>
                  <small>{sceneGeneration ? sceneGeneration.status === SceneGenerationStatus.Verifying ? "Luna verification working" : "Nano Banana 2 working" : "Scene analyst working"}</small>
                </div>
              </div>
            ) : interpretation && (
              <>
                <div className="interpretation-copy">
                  <span className="interpretation-label">Understood</span>
                  <p>{interpretation.summary}</p>
                </div>
                {conciergePresentation?.guidance && <p className="concierge-guidance">{conciergePresentation.guidance}</p>}
                {interpretation.chips.length > 0 && (
                  <div className="chip-row">
                    {interpretation.chips.map((chip) => (
                      <Chip key={chip.id} onRemove={() => void dispatch(removeChipAction(chip))}>
                        {chip.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <SearchComposer
          prompt={prompt}
          setPrompt={(value) => dispatch(setAIDraft(value))}
          onSubmit={submit}
          onAudio={(audio) => { closeProduct(); return dispatch(transcribeAndSearchAction(audio)); }}
          onScene={(file) => void dispatch(analyzeSceneAction(file))}
          sceneBusy={sceneBusy}
          busy={busy}
          suggestions={suggestions}
          onSuggestion={(suggestion) => { closeProduct(); void dispatch(executeSuggestionAction(suggestion)); }}
          autoFocus
        />
      </aside>
    </main>
  );
}
