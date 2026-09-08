# CatalogX

CatalogX is an AI-native home catalogue. It converts typed or spoken shopping requests into validated query plans, then executes those plans deterministically against 100 fictional products.

The model interprets language; TypeScript owns filtering, ranking, budgets, bundles, and replacements. No model-generated database expressions are executed.

## Features

- Exactly 100 fictional home products across ten categories
- Typed operation-based API with thin route switches and adjacent helpers
- OpenAI Structured Outputs using Terra with a deterministic offline fallback
- Bounded Terra search, visual review, and concierge specialists with one controlled retry
- Versioned store, assortment, product-type, and lifestyle context for intent compilation
- Result-aware deterministic refinements verified against the live catalogue
- Completed-file voice transcription with `gpt-transcribe`, limited to 30 seconds
- Deterministic filters, weighted preferences, room bundles, and replacements
- Private room uploads, Luna scene understanding, catalogue-grounded furnishing, and Nano Banana 2 visualization
- Night-first neutral interface, editable interpretation chips, quick view, saved products, and recent searches
- JSON and Firestore repositories behind one interface
- Safe Firestore seed and approval-gated final-image tooling

## Local setup

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works with the canonical JSON catalogue without Firebase Admin. OpenAI-backed natural-language search requires `OPENAI_API_KEY`; when unavailable, the complete concierge route falls back to deterministic keyword compilation, querying, and suggestions.

“Upload your space” requires OpenAI for multimodal moderation and Luna scene analysis. Furnished visualization additionally requires `REPLICATE_API_TOKEN`. Production stores normalized uploads and generated scenes privately in Firebase Storage with an `expiresAt` field for 24-hour cleanup; configure Firestore TTL for scene metadata and a matching scheduled Storage cleanup policy. Search remains available when these providers are not configured.

For Firestore catalogue reads, set `CATALOG_REPOSITORY=firestore` and provide the browser-safe Firebase variables plus server-only `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` values. The initializer uses `NEXT_PUBLIC_FIREBASE_PUBLIC_PROJECT_ID` as the service-account project ID and validates the email and PEM key before initialization. Rate-limit persistence is configured independently with `RATE_LIMIT_REPOSITORY`; it defaults to Firestore in production and memory outside production.

## Architecture

The root `StoreProvider` creates one Redux Toolkit store for the browser application lifetime. `dataSlice` caches the catalogue, facets, results, bundles, result assessments, verified suggestions, saved IDs, and recent searches; `aiSlice` owns the draft, query plan, interpretation, and landing-to-store submission. Client navigation between `/` and `/store` reuses loaded catalogue data. A hard refresh intentionally creates a fresh in-memory cache. Components dispatch typed actions and thunks; only client services know API URLs and wire formats.

The dependency direction is:

```text
components → Redux thunks → client services → operation routes → adjacent helpers → provider services
```

- `src/interfaces`: shared operations, models, and request/response contracts
- `src/utils`: pure catalogue and query-plan logic
- `src/services`: browser API, persistence, and analytics services
- `src/app/api/(routes)`: bounded operation-switch routes and adjacent orchestration
- `src/app/api/services`: server-only repositories and providers

See [Architecture](docs/ARCHITECTURE.md) and [API](docs/API.md).

## Commands

```bash
npm run catalog:validate   # validate count, category balance, schema, and source hashes
npm run catalog:seed       # remote diff only; no writes
npm run catalog:seed -- --apply
npm run catalog:seed -- --apply --prune  # explicit remote deletion
npm run benchmark          # fixed 50-query deterministic benchmark
npm test
npm run test:e2e
npm run check
```

## Image approval gates

Category placeholder prompts live in `src/data/placeholderPrompts.ts`. Final product generation must not begin until the complete canonical catalogue is reviewed.

After explicit dataset approval:

```bash
npm run images:generate -- --approved-dataset --sample
npm run images:assess
npm run images:contact-sheet
npm run images:generate -- --approved-dataset
npm run images:assess
npm run images:contact-sheet
```

Review all four contact sheets, put all accepted product IDs in `artifacts/replicate/approved.json`, then—only after explicit visual approval—run:

```bash
npm run images:install -- --approved-images
```

The installer uploads approved images beneath `projects/CatalogX/assets/products/` and batch-writes products to the Firestore subcollection `projects/CatalogX/products`. Reruns preserve existing Firebase download tokens, so installed URLs remain stable. Replicate output URLs are temporary and are never installed into the catalogue.

Generation uses `google/nano-banana-2-lite`, concurrency three, two retries, and resumable checkpoints. Generated assets and checkpoints are ignored by Git.

## Privacy and security

- Responses API calls set `store: false`.
- Uploaded audio is transcribed in memory and is not retained.
- Room uploads are normalized, stripped of metadata, kept private, rejected when people are visible, and expire after 24 hours.
- Analytics contain event type, catalogue mode, category, and coarse result counts only—never prompts or transcripts.
- Provider credentials are server-only.
- Public AI endpoints use hashed client identifiers and fixed-window rate limits.
- Agent traces exclude sensitive input and tool payloads; structured workflow logs omit prompts, products, and image URLs.

## License

[MIT](LICENSE) © 2026 BashBash Labs.
