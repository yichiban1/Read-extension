# Reading-layer QA

The browser fixtures load actual source-mapping.js, content.js and content.css. Runtime and Gemini responses are mocked. Fixtures and worker contracts never read config.local.js or contact the provider. Keep these separate from unpacked Chrome and external-site acceptance.

```powershell
node tests/critical-reading.test.cjs
node tests/entry-and-structure.test.cjs
python tests/preview-server.py
```

Open `http://127.0.0.1:8765/matrix` for 24 scenarios with up to four synthetic frames at once. Standard frames are 1280 × 800; wide uses 1920 × 800, narrow 520 × 360 and narrow320 320 × 480. Each reports PASS/FAIL and its actual check count. Counts are regression evidence, not a product score.

Individual fixtures use `/?view=<family>&autorun=1`. Families: light, dark, docs, wide, slim, short, sticky, table, fallback, zero, hierarchy, github, wiki, columns, cards, inferred, coverage, shadow. `/narrow` provides a narrow child viewport. Add `race=1` to the light fixture for pending-response reuse/cancellation, `explainrace=1` for a pending Explain across a source rebuild, or `aifailure=1` for local Atlas navigation before and after provider failure. Reload before rerunning. Omit autorun for manual exploration; atlasdemo=1, focusdemo=1 and demo=1 show explicitly mocked Atlas, Guided Read and ambient Context states.

Finishing fixtures add tall (full-width long passage), longoutline (50 added headings) and clutter (fixed host sidebars). `guidedrace=1` checks delayed Guided Explain after stepping, Escape, exit/reactivation and source rebuild. `guidederror=1` checks failure/retry through the same request path. The normal flow checks exact mapped passage/Source ID payloads, one request per action, scroll persistence, source navigation, bounded card placement, Close/Escape return, restored keyboard focus and subsequent Previous/Next; existing selected-text Explain still runs separately. Tests select a visible Context tick rather than requiring the first tick to cover occupied host content. Width tests restore the fixture's original width, preserving the tall layout.

The 320 × 480 scenario reproduces a compact Trace detail overflowing its rail boundary because the previous CSS width did not account for scrollbar space. Detail width now clamps to the measured rail boundary before height/position measurement. The same check covers Context/Critical detail and saved Explain/Trail interactions without a separate fixture family.

Existing Lens, Explain, source ticks, related citations, detail priority, Trail, source hierarchy, coverage, shadow/slotted anchors and guided-cache regressions remain. This pass updates hierarchy and adds targeted checks:

- Initial dormant load has only D: no map, full reading UI, observers or AI. Text selection before activation/after exit cannot open Explain.
- First activation initializes local navigation; unchanged reactivation validates the region without rebuilding or duplicating UI.
- Rail has only Atlas/Lens; Guided Read starts/resumes inside Atlas and focuses visible controls. Explain preserves the sequence.
- Context restores ambient ticks without an overview/global findings rail; focus immediately reveals its hint. Critical opens an actual question, with independent caches and one visible mode.
- No expensive builds for outside-region updates, clocks/live counters/buttons or class/style churn. Substantive bursts yield one debounced build. Dormant edits wait for reactivation; disconnected/replaced roots and path/search route events are checked; hash-only events retain caches.
- Mapped generic text shrinking below the threshold and whitespace within preformatted code invalidate correctly.
- Late Page Map and Explain results cannot reactivate dismissed reading surfaces/observers. The targeted explainrace fixture inserts a real paragraph before the selection, renumbers source IDs, and verifies that an old answer cannot attach to the new anchor.

Sanitized fixture diagnostics are stored in `#qa-result`'s `data-diagnostics` attribute after standard completion. The developer helper `DeepReadDebug.snapshot()` is also available in the content-script execution context. It returns only aggregate timings/counts/coverage/fallback/rebuild reason and runtime state. No automatic console output or page text/title/URL/key.

Verification for this finishing pass, 2026-09-27: both mocked worker contracts and the 24-scenario matrix passed. Guided Explain failure/retry and delayed responses after stepping, Escape, exit/reactivation and source rebuild passed. After the explanation focus fix, the full light reading flow passed, including scroll persistence, original source navigation and existing selected Explain/lifecycle/invalidation regressions. Manual in-app clicks verified Explain → Close → Next and focus transfer after the card became visible. Only the Codex in-app browser was available; no unpacked Chrome or real external-site extension acceptance, and no real Gemini call. Geometry point checks are heuristics, not a cross-site performance or obstruction guarantee.

Optional real provider check:

```powershell
node tests/provider-smoke.cjs --real
```

This runs background.js's actual request/validation against the public synthetic river article and reads the ignored config only with --real. Without --real it reads no credentials and makes no provider request. No real Gemini call was made during this pass. The earlier baseline smoke does not validate the current reading UI or Chrome worker lifecycle.

The server binds 127.0.0.1:8765 and serves an explicit allowlist, never config.local.js. Its threaded handler prevents idle browser preconnections from blocking fixture assets; request URL logs are disabled. Geometry checks wait for the existing Atlas transition, and keyboard focus transfer is checked synchronously because concurrent frames share browser focus. Keep the matrix tab active until FINISHED. Keep the server running only while using the local preview. README contains the real-Chrome manual checklist; synthetic GitHub/wiki/docs fixtures are not external-site evidence.
