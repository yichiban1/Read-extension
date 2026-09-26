# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support. The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Context Lens, Critical Lens, Explain, and the session-local Reading Trail all connect assistance back to live passages.

## Current prototype

- One toolbar click toggles DeepRead reading mode through the service worker; there is no action popup. `Alt+Shift+D` invokes the same action if Chrome accepts the shortcut. Restricted pages show a badge and explanatory toolbar title; an unreachable ordinary page asks the reader to refresh.
- Dormant mode shows one small right-edge **D**. Activation reveals the fixed viewport-right Reading Spine with **Atlas**, **Lens** and **Focus Path**. The bottom D exits mode. Activation alone sends no AI request.
- Atlas immediately shows all mapped headings in document order with real H1–H6 depth, indentation, connecting rules and current-location state. Its compact inward outline scrolls independently; the Spine samples at most twelve global positions. AI enriches roles rather than replacing the heading hierarchy. Weak-heading pages use ordered, non-overlapping inferred sections with original source links; local passage anchors remain available on provider errors.
- Focus Path reuses Atlas's current-map cache or its pending request. That same Page Map response now includes a short sequence of original passages. Previous/Next moves one persistent spotlight, updates role/label/progress and respects endpoints. Stop clears it; Escape dismisses the surface while retaining resumable progress. Explain, Atlas, Lens and traces can take detail priority without destroying the path. Where space permits, controls move above/below the guided passage instead of covering it.
- Context and Critical retain their independent caches and one visible mode. Context clarifies concepts and background; Critical asks source-based questions, with no web search or fact-checking claim. Both can return zero findings. Explain and the five-entry session Reading Trail remain source linked.
- Source Mapping retains semantic, density and safe ancestor selection, generic text fallback, table/definition/caption support and `deepread-source-<number>` IDs. Estimated coverage compares the chosen region with safe readable body candidates. Coverage below 60% evaluates broader regions under existing density and link-quality gates; it does not lower all extraction thresholds.
- Open Shadow DOM, nested roots and assigned slots are traversed in composed order, using real connected elements as anchors. Navigation, advertising, comments, newsletters, forms, dialogs and related content remain excluded across host boundaries. Closed roots, canvas text and inaccessible cross-origin frames remain unsupported.
- Ordinary hash navigation and unrelated DOM updates retain map identity and caches. Changed text, heading levels, element identity or region genuinely rebuild the map, invalidate stale requests and safely stop the path. Source ID validity proves navigability, not semantic correctness.
- Manifest V3, one Gemini provider/model, all four AI request types, structured validation, selected-text Explain, reversible source navigation, the fixed rail and reduced-motion handling remain. No search, new Lens, chat, accounts or backend was added. Focus adds output to the existing Page Map call, raising its maximum output budget from 700 to 1400 tokens without adding a separate request.

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
4. Start Focus before Atlas, then open Atlas during the pending request. There should be one Page Map request. Test Previous/Next endpoints, spotlight, Stop, Escape/resume and anchor jumps. Explain a passage mid-path, then resume it.
5. Test Context/Critical switching, delayed responses, zero findings, original-source ticks, additional citations, saved Explain responses and the five-entry Trail. Only one major detail should dominate.
6. Test two-column, card/table-heavy, short, wide, narrow and sticky-header layouts, high zoom and reduced motion. Check whether guidance obstructs the active passage.
7. On a SPA and an open-shadow component, change real text: old guidance must stop and stale responses must not appear. An unrelated DOM update should retain the same map/cache. Compare generated roles and path choices against the cited originals.

**Verification boundary, 2026-09-26:** mocked worker contracts and actual UI/source scripts in synthetic browser fixtures were verified. No controllable real Chrome was exposed in this session, so unpacked-extension reload and external-site injection were not verified. One real Gemini request succeeded through the actual worker request/validation functions in Node using the public synthetic article (6 structural nodes, 4 guided passages, approximately 3 seconds). This verifies one provider contract, not Chrome service-worker lifecycle or general model quality. See `PROJECT_STATE.md` and `tests/README.md` for exact fixture results.

## Reproducible local QA

From this repository directory:

```powershell
node tests/critical-reading.test.cjs
node tests/entry-and-structure.test.cjs
python tests/preview-server.py
```

Open `http://127.0.0.1:8765/matrix` for the twenty-scenario matrix, or `/?view=light&autorun=1` for an individual fixture. Additional families include `hierarchy`, `github`, `wiki`, `columns`, `cards`, `inferred`, `coverage` and `shadow`; `/?view=light&autorun=1&race=1` exercises pending-request reuse and cancellation. `/narrow` embeds a 520 × 360 viewport. Omit autorun for manual exploration. `atlasdemo=1` or `focusdemo=1` opens an explicitly mocked visual state.

Fixture and worker tests never read the local key or contact Gemini. The loopback server serves only allowlisted UI/fixture assets. The optional `node tests/provider-smoke.cjs --real` sends the public synthetic article to the configured Gemini endpoint and reports sanitized labels/citations; without `--real` it does not read config or call the provider.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Legacy files, disconnected from the action; not an entry point. |
| `content.js`, `content.css` | Reading Spine, X-Ray peek, hierarchical Atlas, Focus Path, shared Context/Critical Lens, source ticks, Explain, source navigation, and session Reading Trail. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
