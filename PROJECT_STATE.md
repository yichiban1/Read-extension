# DeepRead Project State

Updated: 2026-09-27 — product hierarchy, lazy activation and scoped invalidation

## Baseline and scope

Fetched origin/main before editing. Clean local main and origin/main both matched `16c783a9b0b86ec8ae38b885eaed5fa58fd4d676`. This pass remains uncommitted and unpushed. Manifest, service worker, Gemini provider/model, four request types and structured output validation are unchanged. No new dependencies or permissions.

## Product hierarchy

The persistent viewport-right rail has two controls: Atlas and Lens. Atlas says Navigate and contains the restrained warm `Start Guided Read →` action. Guided Read follows Atlas's existing Page Map cache or pending promise, with no fifth request type. Its Follow Atlas controls retain Previous/Next, progress, real-passage spotlight, Stop, return to Atlas, Escape and resume. Explain temporarily takes detail priority without destroying the sequence.

Atlas remains deterministic navigation: every local heading and its level/order/label is available immediately, before a provider response. Weak-heading pages retain local passage anchors. AI adds section roles or explicitly inferred ranges and guided choices. Failure leaves original headings and local navigation intact; AI is required for generated guided choices and Lens/Explain output.

Context clarifies concepts, terms and background. Selecting it closes the chooser and adds subtle green source-edge ticks, with no global Context findings rail or forced overview. Hover or keyboard focus immediately shows the comprehension aid without a heavy passage outline. Click opens a source-linked detail. Reopening Lens offers optional Browse context and Turn off Lens. Critical uses purple markers, a pause-to-examine hover cue and a click to open the actual open-ended question. Its overview explicitly describes interpretation of supplied passages, not fact checking. Both retain independent caches and support zero results.

## Dormant / active lifecycle

Before activation: load script definitions and CSS, create one tiny D launcher, register its click handler and the existing runtime toggle listener. No Source Map, Atlas/Lens/Guided UI, reading observers, scroll/resize/selection handlers, Explain or AI request.

First activation: create reading UI once, build Source Map/local Atlas, attach named reading handlers, a scoped content MutationObserver, shallow ancestor replacement observer and Atlas IntersectionObserver. Activation alone sends no AI request.

Exit: make controls inert; close details; remove Lens ticks, guided state/spotlight and selection/Explain UI; cancel late Explain via request token; remove reading handlers; disconnect all reading observers; cancel scheduled dynamic/layout work. Existing safe Page Map/Lens caches remain in memory. Already sent requests may finish and cache their result, but cannot reveal dormant reading UI or restart reading observers.

Reactivation: compare path/search and validate connected elements, normalized source text and heading levels within the cached reading region. This skips body-wide scoring/coverage when unchanged. Otherwise perform a full build and invalidate caches only if map identity actually changes. A pending meaningful edit forces full checking. Repeated activation cannot duplicate UI or listeners.

## Invalidation and diagnostics

- Observe text/child changes only within the chosen reading region and its readable open/nested shadow roots. Body fallback necessarily has a wider scope.
- Shallow child-list observation on ancestors catches disconnected/replaced article/main/host roots. Unrelated sibling updates do not trigger a map build.
- Meaningful text edits, readable additions/removals and heading/visibility/slot attributes schedule one 900 ms debounced check. Whitespace-only changes in ordinary prose are ignored; whitespace within preformatted code is meaningful. Shrinking a mapped generic block still invalidates it. A genuine rebuild also dismisses the pending selected-text request so a late Explain cannot attach its old source ID to a changed map.
- Class/style changes, excluded page UI, buttons, clocks and explicit live status/timer regions are ignored during active observation. Numerical prose and table values remain meaningful.
- Hash-only navigation retains caches. Popstate path/search changes request validation. SPA pushState changes accompanied by substantive content/root replacement are caught by content observers; history APIs are not monkey-patched.
- Coverage selection and extraction thresholds are unchanged. Source IDs, deduplication, composed order and real element anchors remain. Open-root inventory is now scoped to the reading region.
- Explicit developer call `DeepReadDebug.snapshot()` in the content-script execution context returns aggregate build/validation durations and counts, source count, coverage estimate, fallback reason, active/observer state, observed shadow-root count and last rebuild reason. It emits no automatic logs and includes no page text/title/URL/key.

## Verification and limits

Syntax/manifest/whitespace checks and both existing mocked worker contract suites pass. The in-app browser matrix passed all 20 existing scenarios after lifecycle and hierarchy updates; runtime/Gemini responses are mocked. Targeted provider-failure fixture also passed: immediate local headings, preserved anchors after failure and working source navigation. Lifecycle checks verified zero rebuilds for dormant edits and unrelated/UI/style churn, one debounced build for a burst of substantive edits, dormant revision validation, reading-root replacement, route/hash separation and late Explain cancellation. A final targeted race inserts a paragraph before the pending selection, renumbers sources and confirms that the old Explain response cannot attach to the rebuilt map. These are synthetic browser observations, not real-site performance measurements.

One small 19-source light fixture reported a last Source Map build of 2.2 ms and region validation of 1.2 ms, coverage estimate 1, no fallback, and zero observers after exit. Build timing measures source extraction/scoring, not the full UI lifecycle. This is a single development sample; it is not a large-page benchmark, comparison with the previous version or cross-site latency guarantee.

Unpacked Chrome and real external-site extension acceptance were not performed: only the Codex in-app browser was available and native computer APIs were disabled. No real Gemini request was made in this pass; the successful provider smoke documented at baseline belongs to the earlier pass and does not verify this UI iteration. See tests/README.md for reproducible QA.

## Five biggest remaining weaknesses

1. Real Chrome injection, worker lifetime, extension reload, host CSS/SPA integration and real cross-site responsiveness remain unverified.
2. Extraction/coverage are heuristics. Initial scoring still traverses safe body content; very large regions and body fallback may be expensive. Coverage 1 is an estimate, not semantic completeness. Class/style-only visibility changes and a newly attached shadow root without an observable content change may be missed while active. New useful siblings outside an unchanged selected region wait for another full build.
3. Gemini sees at most 36 sampled blocks of 700 characters. Valid citations prove anchors exist, not correct roles, representative guided choices or useful questions. Current Lens differentiation was exercised with mocks, not a broad real-model quality sample.
4. Expanded details can still cover text on wide articles, very narrow/short windows, tall passages, columns or sticky overlays. Guided controls avoid the current passage only when space permits.
5. Real screen-reader/high-zoom acceptance, production credential protection and durable state are absent. The ignored local key is still accessible to someone with the extension build. Trail/caches are session-local; closed shadow roots, canvas/WebGL and inaccessible cross-origin frames remain unsupported.

## Manual acceptance

Reload the unpacked extension from `E:\Deepread-extension\Read extension`, then refresh target pages. Use README's real-Chrome checklist and record only sanitized diagnostics. Do not infer semantic quality from successful citation validation or fixture assertion totals. No commit or push was made.
