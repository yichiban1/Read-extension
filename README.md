# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support. The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Context Lens, Critical Lens, Explain, and the session-local Reading Trail all connect assistance back to live passages.

## Current prototype

- The Reading Spine stays near the viewport's right edge using `clamp(16px, 2vw, 28px)`. Article width controls available annotation space, not the rail position. Up to six live structural positions are usable before any AI request.
- Only **Atlas** and **Lens** remain as persistent controls. Atlas labels grow inward from the same rail. Narrow layouts shed labels and keep navigable points instead of forcing cards into the article.
- One compact Lens surface contains **Context | Critical**. Context clarifies concepts, terms and background using the existing Smart Reading backend (0–5 aids). Critical raises questions about evidence, assumptions, causality, uncertainty, counterpoints and values (0–3 findings); it is not a fact checker. Only one mode is visible. Each retains its own current-map cache, including zero results. Switching modes or reopening the panel does not repeat a request. Delayed responses cannot reactivate a hidden mode.
- Small green ticks and purple diamonds sit at original passage edges. Focus or hover previews the label and hint/question with Source X-Ray; clicking follows the source and opens its trace. Paragraphs are not permanently highlighted or rewritten.
- Annotations occupy the article-to-Spine gap when space permits and collapse to source-linked markers when it does not. Atlas, Lens overview, expanded trace and Explain share one major-detail priority. On narrow pages, explicitly opened details can still temporarily overlap the article.
- Select Text → Explain remains user-driven, including when Atlas is closed. Completed responses can be reopened from a saved trace without another request. Reading Trail holds at most five entries in content-script memory; the latest/active entry has priority and older entries become quieter markers. Reloads or genuine Source Map rebuilds clear them.
- Source Mapping keeps semantic/density/body selection, generic text fallback and `deepread-source-<number>` IDs. It additionally maps `td`, `th`, `dt`, `dd` and `figcaption`. An insufficient small region may expand to a coherent ancestor under existing exclusions and conservative density checks. Navigation, comments and excluded UI remain filtered. Ordinary hash navigation preserves caches; readable-content changes and route changes refresh them.
- Metadata, compact labels and reading details have clearer type sizes and spacing. Opaque surfaces remain readable on dark pages; source glyphs have a fine white edge. Motion is brief and respects `prefers-reduced-motion`.
- All four existing AI request paths, structured validation, source navigation, popup interaction and the single `gemini-3.5-flash-lite` provider remain. Valid Source IDs prove navigability, not semantic support. Errors and missing keys show explicit states instead of fabricated output.

No translation, chat, notes, accounts, multiple providers, PDF/OCR, dashboards or other primary features were added. Optional AI actions send sampled page text to Gemini only after activation.

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

1. Reload the unpacked extension in `chrome://extensions`, loading this inner directory containing `manifest.json`. Refresh the target webpage so its content scripts are updated.
2. Test a light article, dark article, GitHub README, documentation page, a wide page, a short readable page and a narrow window. Confirm the rail stays at the viewport right edge and normal reading is unobscured. Check sticky headers and zoom.
3. Open Atlas; hover/focus a position, navigate to its original passage and reopen Atlas. Confirm its cached map is reused and labels grow inward.
4. Open Lens and choose Context, then Critical, then Context again. Only the selected mode's ticks/points should remain. Counts and cached results should survive switching, off/on and anchor jumps. Test rapid switching while one analysis is pending and a valid zero-result page.
5. Focus a source tick, open its trace and follow additional Critical citations. Open several findings: only one detail should expand, the latest trace should dominate and the Trail must stay at five.
6. Select text and Explain with Atlas closed and each Lens active. Dismiss/reopen the Explained trace; confirm no repeated request. Check Escape/focus return, scrolling, tab/arrow navigation and reduced motion.
7. On a SPA or changing document, confirm changed content refreshes source-linked results. Check returned AI text against each cited passage. For failures, record URL, viewport, Source ID, sanitized console/service-worker error and screenshot; never include the key or private page text.

**Verification boundary, 2026-09-26:** syntax checks and mocked service-worker contract tests passed. Actual UI/source scripts passed 404 assertions across 11 synthetic browser-fixture scenarios. Extension messaging and Gemini were mocked. No unpacked-extension reload, external-site Chrome acceptance or real Gemini request was completed in this consolidation pass. Native Chrome control previously stopped at URL-identification safety enforcement; fixture success does not substitute for the manual checks above.

## Reproducible local QA

From this repository directory:

```powershell
node tests/critical-reading.test.cjs
python tests/preview-server.py
```

Open `http://127.0.0.1:8765/?view=light&autorun=1`, then use `view=dark`, `view=docs`, `view=wide`, `view=slim`, `view=short`, `view=sticky`, `view=table`, `view=fallback`, or `view=zero` for other modes. `/narrow` embeds the dark fixture in a 520 × 360 child viewport. The page reports PASS/FAIL and mock request counts. Reload before rerunning a suite; manual exploration uses the ordinary controls. Tests do not contact Gemini or read the local key. The loopback server serves only an explicit list of fixture/UI assets. See `tests/README.md` for the verification boundary.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Small toolbar popup that expands the source map. |
| `content.js`, `content.css` | Reading Spine, X-Ray peek, light Atlas, shared Context/Critical Lens, source ticks, Explain, source navigation, and session Reading Trail. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
