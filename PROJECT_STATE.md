# DeepRead Project State

Updated: 2026-09-26 — one-click entry, structural Atlas, coverage and Focus Path

## Baseline

Fetched origin/main before edits. Clean local main and origin/main both matched `8abd54cbb18af77b682d3f3089322413f18f07ee`. Work remains uncommitted and unpushed on main. No new dependencies, broad permissions, providers or search.

## What changed and why

The Chrome action no longer declares `default_popup`. Its service-worker click handler sends the existing toggle message directly to the active tab. A badge/title explains restricted pages or missing receivers; successful activation clears the feedback. The optional action shortcut follows the same route. This removes the unnecessary toolbar → popup → second-click sequence.

Dormant mode exposes only the tiny right-edge D. Activation reveals the viewport-right Spine and Atlas/Lens/Focus controls without requesting AI. Exit makes the Spine inert, closes major surfaces, turns off the visible Lens without deleting its cache and clears the guided path.

Atlas is now document architecture/navigation. The deterministic local outline preserves every mapped heading, its real level, document order and source ID. Depth follows a heading stack rather than a flat sample; skipped levels do not create fictional parents. A compact scrolling tree uses indentation and rules, and retains current-location/visited feedback. Only the global Spine is sampled (at most twelve structural positions). AI adds roles while retaining original heading labels and hierarchy. Weak-heading pages receive ordered, non-overlapping inferred ranges; invalid citations/ranges are rejected and local anchors remain available if enrichment fails.

The Page Map payload samples across the document instead of truncating its beginning, and includes heading levels. Its existing structured Gemini response now includes `focusPath`, so Atlas and guided reading share one request, pending promise and current-map cache. The output budget increases from 700 to 1400 tokens; Focus introduces no fifth request type.

Focus follows up to five distinct original passages in document order. Previous/Next updates one persistent source spotlight, role, short label and progress. An older usable section-anchored Page Map can supply the following real passage within that section. No generated summary replaces the article. Stop removes the spotlight; Escape closes the surface and retains progress. Explain/Atlas/Lens/traces take major-detail priority, and Focus resumes from its existing sequence. Controls avoid the active passage above/below where vertical space permits. A late response cannot reactivate dismissed guidance.

Coverage compares candidate captured text with safe readable body candidates. Below 60%, safe ancestors and, when needed, a broader body strategy are evaluated under existing density, link density and substantial-text gates. It is an estimate, not a measured recall guarantee. Exclusions, semantic/density selection, generic fallback and table/dt/dd/figcaption support remain.

Open Shadow DOM and nested roots are collected recursively in composed order, including assigned slots without duplicate anchors. The map retains actual connected Elements. Host ancestry carries exclusions across roots; source spotlight styles and mutation observation also reach open roots. Closed roots, canvas text and inaccessible cross-origin frames are documented limitations.

Map identity now survives unrelated DOM/anchor changes. Real text/level/element/region changes centrally invalidate all Page Map and Lens state, discard in-flight responses and stop Focus. Open-root observation and sanitized coverage metadata refresh even when the sources remain identical.

## Architecture preserved

Manifest V3, activeTab permission, one configured Gemini model/provider, four AI message types, structured validation, live source IDs, source navigation, selected-text Explain, independent Context/Critical caches, zero-result handling, five-entry session Trail, fixed viewport-right rail and reduced-motion support. Critical analyses supplied page sources; it performs no live web search.

## Verification

- JavaScript syntax, manifest parsing and git diff whitespace checks: PASS.
- Existing Critical worker contract and new entry/structure worker contract: PASS with Chrome/config/network mocks.
- Synthetic browser matrix: PASS: 20 scenarios, 1,037 assertions in the Codex in-app browser. Actual source-mapping/content scripts and CSS; extension messaging and provider output are mocked. Families: article light/dark, docs, wide, slim, short, sticky header, table, small-region fallback, zero findings, nested hierarchy, README-like, Wikipedia-like, two-column, cards, inferred sections, low coverage, open/nested/slotted Shadow DOM, 520 × 360 viewport, pending-response races. Checks include existing Lens/Explain/Trail regressions, complete local headings, inferred range validation, Focus sequence/Previous/Next, cache/promise reuse, anchor navigation, Explain coexistence, Escape, unrelated updates and genuine map reset.
- Visual inspection: dormant launcher, hierarchical Atlas and Focus on synthetic pages. Explicitly expanded surfaces can overlap other text when the article reaches the rail.
- Unpacked Chrome tests: NOT PERFORMED. Only the Codex in-app browser was exposed; native app APIs were disabled and no real Chrome browser was available for control.
- Real external website extension tests: NOT PERFORMED. Synthetic README/wiki/docs families are not actual GitHub/Wikipedia/documentation-site acceptance.
- Real Gemini: one successful request via actual background.js request/validation functions in Node, using the public synthetic river article. Returned 6 valid structural nodes and 4 valid guided passages in about 3 seconds. This was not an extension service-worker lifecycle test. Roles/path choices are plausible for those cited passages; one response does not establish general reading quality. No key, private page text or request URL was logged.

## Five biggest remaining weaknesses

1. Actual Chrome injection, restricted-page feedback, extension reload/service-worker lifecycle and real host-site CSS/SPA behaviour remain unverified. Fixture success does not substitute for them.
2. Coverage is heuristic. Broadening can capture incidental readable text, and exclusions can omit meaningful material. Whole-body rescoring on busy/large pages may be costly; no large-site performance benchmark was completed.
3. AI sees at most 36 sampled blocks of 700 characters. Valid citations prove an anchor exists, not that section roles or the guided selection represent the complete argument. Long documents may lose important context; this pass has only one real provider example.
4. Very narrow/short windows, tall passages, wide articles and sticky overlays can still force detail/source overlap. Long outlines also compress global Spine targets. More robust cross-site geometry is needed.
5. Keyboard basics are covered, but real screen-reader/high-zoom acceptance and persistent across-reload progress are absent. Session caches and Trail intentionally reset on reload; closed roots, canvas and inaccessible frames remain unsupported.

## Manual acceptance

Follow README's Chrome checklist. Reload the extension from `E:\Deepread-extension\Read extension`, refresh each target page, compare generated labels/path steps against originals and record only sanitized diagnostics. No commit or push has been made.
