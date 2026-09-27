# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support: **Atlas navigates**, **Lens helps understanding/examination**, and **Select → Explain asks about a passage**. Guided Read follows Atlas. The original webpage remains the reading surface, with a five-entry session Reading Trail.

## Current prototype

- One toolbar click toggles DeepRead reading mode through the service worker; there is no action popup. `Alt+Shift+D` invokes the same action if Chrome accepts the shortcut. Restricted pages show a badge and explanatory toolbar title; an unreachable ordinary page asks the reader to refresh.
- Initial dormant mode creates only the small right-edge **D** and activation listeners. No Source Map, full reading UI, reading observers, selection Explain or AI request. First activation builds local navigation and starts scoped reading handlers/observers. The persistent rail has **Atlas** and **Lens**; the bottom D exits. Activation alone sends no AI request.
- Atlas immediately shows all mapped headings in document order with real H1–H6 depth, indentation, connecting rules and current-location state. Its compact inward outline scrolls independently; the Spine samples at most twelve global positions. AI enriches roles rather than replacing the heading hierarchy. Weak-heading pages use ordered, non-overlapping inferred sections with original source links; local passage anchors remain available on provider errors.
- **Start Guided Read →** lives inside Atlas. It reuses the current Page Map cache/pending request and follows original passages with Previous/Next, spotlight and progress. Stop clears it; Escape preserves resumable progress and returns focus to Atlas. Atlas/Explain/Lens/traces can take detail priority without destroying the sequence. Return through Atlas's Resume action without another request. Controls avoid the current passage where space permits.
- **Context · Understand** is ambient: subtle green source-edge ticks; hover/focus immediately reveals the comprehension aid, click opens detail. It has no global findings rail or forced overview; optional **Browse context** lives in Lens choices. **Critical · Examine** uses purple markers, a pause-to-examine cue, and a click to open an open-ended question. Its overview describes interpretation of supplied sources, not fact checking. Independent caches, one visible mode and valid zero-result states remain.
- Source Mapping retains semantic, density and safe ancestor selection, generic text fallback, table/definition/caption support and `deepread-source-<number>` IDs. Estimated coverage compares the chosen region with safe readable body candidates. Coverage below 60% evaluates broader regions under existing density and link-quality gates; it does not lower all extraction thresholds.
- Open Shadow DOM, nested roots and assigned slots are traversed in composed order, using real connected elements as anchors. Navigation, advertising, comments, newsletters, forms, dialogs and related content remain excluded across host boundaries. Closed roots, canvas text and inaccessible cross-origin frames remain unsupported.
- Exit disconnects reading Mutation/IntersectionObservers, removes reading listeners and scheduled work, clears Lens markers/Guided/Explain, and keeps safe caches. Late Explain cannot reopen dormant UI. Reactivation validates the cached region before reuse; changed content or path/search triggers full checking. No duplicate UI/listeners.
- Active observation is scoped to the reading region and its open roots; shallow ancestor observation catches region replacement. Meaningful source text/structure and heading/visibility/slot changes debounce for 900 ms. Excluded UI, buttons, clocks/live status, class/style churn and unrelated outside-region changes do not rebuild. Hash-only navigation preserves caches. Preformatted code whitespace remains meaningful. See PROJECT_STATE.md for tradeoffs and missed-change limits.
- Developer-only `DeepReadDebug.snapshot()` (content-script execution context) reports aggregate build/validation duration/count, sources, estimated coverage, fallback, observed roots and rebuild reason. No automatic logging, page text/title/URL or keys. Coverage remains heuristic; closed roots, canvas/WebGL and inaccessible cross-origin frames remain unsupported.
- Manifest V3, one Gemini provider/model, four AI request types, structured validation, source IDs, independent caches, session Trail and reduced-motion handling remain. This pass adds no provider calls, model/schema changes, new Lens, chat, accounts or backend.

## Local Gemini configuration

The extension reads one Gemini API key from the ignored `config.local.js` file. It is loaded by the extension service worker and is not committed to Git. A local extension build can expose this key to someone with access to that build; use a restricted development key and rotate it after testing.

If the file does not exist, copy `config.example.js` to `config.local.js` and use this format:

```js
globalThis.DEEPREAD_LOCAL_CONFIG = {
  apiKey: "YOUR_GEMINI_API_KEY"
};
```

After changing the file, reload the unpacked extension in `chrome://extensions`. Without a key, Explain, Page Map, Context Lens, and Critical Lens show a missing-key state and do not fabricate output. The model is fixed in `background.js` for this prototype.

## Run and test in Chrome

1. Reload the unpacked extension from the inner directory containing `manifest.json`, then refresh the target page.
2. Confirm only the tiny D appears initially. Click the Chrome toolbar icon once: Spine and controls appear without a popup. Click again to exit. Test D and the optional shortcut. On `chrome://` and Chrome Web Store pages, check the explanatory badge/title rather than expecting injection.
3. Open Atlas on an article, README, documentation, Wikipedia-like document and weak-heading page. Check complete H1/H2/H3 structure, current location and original-source navigation; reopen without repeating requests.
4. Start Guided Read inside Atlas while enrichment is pending: there should be one Page Map request. Test Previous/Next, spotlight, Stop, return to Atlas, Escape/resume and anchor jumps. Explain a passage mid-path, then resume through Atlas.
5. Context should return to reading with ambient ticks: hover/focus gives useful help immediately, click opens detail; Browse context is optional. Critical should invite deliberate questioning. Test switching, delayed responses, zero results, additional citations, saved Explain and the five-entry Trail. Only one major detail should dominate.
6. Test two-column, card/table-heavy, short, wide, narrow and sticky-header layouts, high zoom and reduced motion. Check whether guidance obstructs the active passage.
7. Before activation and after exit, select text: no Explain should appear. Check diagnostics for zero initial builds and no dormant observers. Revise content while dormant, reactivate and confirm current anchors without duplicate controls. Exit during a pending Explain: its response must not reopen UI.
8. On a SPA/open-shadow component, change actual text or replace the reading root: stale guidance must stop. Counters, clocks, buttons, class/style churn and outside-region updates should trigger no build. Record sanitized diagnostics and compare generated roles/path/questions against original passages. Do not record private page text or credentials.

**Verification boundary, 2026-09-27:** syntax, existing mocked worker contracts, actual UI/source scripts in synthetic browser fixtures and provider-failure fallback were verified. No controllable real Chrome was exposed, so unpacked-extension reload and external-site injection were not verified. No real Gemini call was made in this pass; the earlier successful smoke belongs to the baseline. Fixture success is not evidence of real-site responsiveness or model quality. See PROJECT_STATE.md and tests/README.md.

## Reproducible local QA

From this repository directory:

```powershell
node tests/critical-reading.test.cjs
node tests/entry-and-structure.test.cjs
python tests/preview-server.py
```

Open `http://127.0.0.1:8765/matrix` for the twenty-scenario matrix, or `/?view=light&autorun=1` for an individual fixture. Existing families include hierarchy, github, wiki, columns, cards, inferred, coverage and shadow. Add `race=1` for pending-request reuse/cancellation or `aifailure=1` for failed-provider local navigation. `/narrow` embeds a 520 × 360 viewport. Omit autorun for manual exploration. `atlasdemo=1` or `focusdemo=1` opens an explicitly mocked visual state.

Fixture and worker tests never read the local key or contact Gemini. The loopback server serves only allowlisted UI/fixture assets. The optional `node tests/provider-smoke.cjs --real` sends the public synthetic article to the configured Gemini endpoint and reports sanitized labels/citations; without `--real` it does not read config or call the provider.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Legacy files, disconnected from the action; not an entry point. |
| `content.js`, `content.css` | Lazy reading lifecycle, Atlas/Guided Read, Context/Critical Lens, source ticks, Explain, detail priority and session Reading Trail. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
