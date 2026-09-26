# DeepRead Project State

Updated: 2026-09-26 — Spatial + Lens + Visual Consolidation

## Current interaction

The webpage remains primary. A viewport-right Spine owns two persistent controls, Atlas and Lens. Atlas grows inward; annotation labels use the article-to-rail gap and recede to compact markers when space is tight. Article geometry no longer sets the rail position.

Context Lens is the visible name for the unchanged Smart Reading behaviour. Context and Critical share a small tabbed panel, one visible mode and independent current-map caches. Switching, off/on and ordinary hash navigation reuse results. Pending responses cache their results without reactivating hidden modes or reopening a dismissed panel. Existing request tokens still protect Source Map changes.

Green source-edge ticks and purple diamonds connect results to original passages. Hover/focus shows Source X-Ray with the hint/question; click opens a source-attached trace. Atlas, Lens overview, expanded trace and Explain share a detail priority. The five-entry session Trail gives the latest/active interaction priority; older traces become quieter markers. Explain remains selected-text driven and saved responses reopen without new requests.

Shared layout helpers place the Lens panel, source ticks, Atlas and traces relative to the same rail. Structural and active Lens positions share one collision lane. Labels wrap, metadata is generally 10 px, compact reading labels 12 px, and opaque surfaces remain legible over dark pages. Motion respects reduced motion.

Source Mapping preserves its architecture and IDs, adds td/th/dt/dd/figcaption and tries up to four safe ancestors when a small selected region lacks coherent content. It requires substantial passages, conservative text/link density and existing exclusions. The map exposes fallbackReason for diagnostics; no navigation/comment inclusion or globally reduced thresholds were introduced.

## Scope preserved

Manifest V3, popup interaction, the four AI request paths, single Gemini provider/model, structured-output validation, source navigation and session-only storage remain. background.js changes only two user-facing Smart error messages to Context Lens. No unrelated features, new dependencies, commit or push.

## Verification

- Started from clean latest main at 1a18b63; fetch confirmed origin/main matched.
- Syntax checks: content.js, content.css via browser loading, background.js, source-mapping.js and tests/reading-layer.js. Manifest JSON parses; git diff --check passes.
- Service-worker contract: tests/critical-reading.test.cjs passes with mocked network/config. Covers zero, valid and malformed results, unknown citations, types, verdict guard, deduplication, item limit and runtime errors.
- Actual UI/source scripts in the Codex in-app browser: 404 passing assertions across 11 synthetic fixture scenarios. Light, dark, documentation, wide, slim, short, sticky-header and 520 × 360 child viewport each pass 38; table passes 41; broader-region fallback 40; zero results 19.
- Tests cover fixed rail across article widths, inward Atlas/panel/trace bounds, tab focus, rapid mode switching with a late response, zero state, independent caches, Escape/focus return, hash navigation, source-edge ticks, X-Ray, citation navigation, Explain, saved response reuse, Trail hierarchy/limit, scroll dismissal and content-mutation cache invalidation. Screenshots inspected on light/dark/wide/short/narrow layouts and the shared Lens panel.
- **Unpacked Chrome acceptance was not completed.** Previous native Chrome control stopped at URL-identification safety enforcement. No external-site injection, service-worker lifecycle, real GitHub behaviour or screen-reader acceptance is claimed by these fixtures.
- **No real Gemini request in this pass.** Fixture copy is mocked and cannot demonstrate model quality. Earlier provider evidence is historical, not a new result.

## Remaining weaknesses

1. Host CSS, transformed ancestors, sticky overlays, Chrome injection and SPA lifecycle still need real-site acceptance. Synthetic fixtures cannot reproduce every website.
2. Explicitly expanded details still temporarily cover text in very narrow windows; tiny heights compress global navigation targets. Labels recede, but all spatial conflicts cannot be eliminated.
3. Region selection remains heuristic. Tables and expanded ancestors can include incidental content or omit meaningful blocks; fallback quality requires checking actual page text.
4. Valid IDs prove navigability, not semantic support. Lens sampling is limited to 36 substantial blocks, at most 700 characters each; questions may miss context and zero results are not endorsement.
5. Keyboard/focus states are checked; screen-reader behaviour and target sizes at high zoom need actual Chrome testing.

## Manual acceptance

Reload the extension from this inner folder and refresh target pages. Test light/dark articles, GitHub README, docs, wide, short and narrow layouts. Exercise Atlas, both Lens modes (including rapid switching and zero output), source ticks, related citations, five traces, Explain, Escape/tab/arrow focus, hash navigation and real content changes. Check each AI finding against its cited text and inspect sanitized service-worker errors. Never include local keys or private page text in diagnostics.

See README.md and tests/README.md. Current changes are reviewable and uncommitted on main.
