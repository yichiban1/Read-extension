# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support. The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Smart Reading, Explain, and the session-local Reading Trail all connect assistance back to live passages.

## Current prototype

- A thin Reading Spine appears near the article edge when space permits, or near the right viewport edge on narrower layouts. It first shows up to six real source positions from the page, so reading can begin without an AI request.
- Hovering or keyboard-focusing a point lightly outlines its live source and shows a short contextual label. If the source is outside the viewport, the label indicates whether it is above or below and uses real nearby page text.
- Opening Reading Atlas requests the existing AI Page Map once for the current Source Map. Source-linked points and short labels appear around the article in the available margins, arranged by article order and source position. The webpage stays visible and usable. Narrow layouts keep small points; focus or hover still spots the source, with a short direction label when it is offscreen.
- The compact **Smart Lens** control runs one on-demand Gemini Smart Reading analysis for the current Source Map. It shows a clear analysing state, then a persistent count. A small overview lists the findings and links directly to their source passages. The Spine also shows distinct ✦ points at the approximate article positions of all findings, including those outside the viewport. The overview can be reopened and the Lens turned off or back on without another request for the same Source Map.
- Smart Reading can return zero to five comprehension aids (`concept`, `term`, `background`, or `context`), each tied to a validated Source ID from the request. Zero results appear as a clear empty state, without fabricated markers. Aids at visible source passages appear as small margin markers; focus or hover spotlights the original passage and reveals a short hint. Selecting the overview row, Spine point, or marker follows the source and opens its contextual trace.
- Atlas visits, opened Smart aids, and completed Explain interactions can leave up to five Reading Trail traces together. The oldest trace is removed when a sixth is added. Traces are held only in content-script memory and disappear on reload or a Source Map rebuild. They follow their sources while visible, expand on click, and can be dismissed separately.
- Source Mapping is initialized when the content script starts and refreshed before Explain after observed page changes. Explain requests include the available Source ID as reference metadata without requiring the Atlas to be opened first.
- Selecting readable text shows an `Explain` action, including text outside the mapped reading region. The response places the plain-language explanation first, then article context and an optional analogy. It opens beside the mapped passage when margin space permits. Dismissing it or continuing to read collapses it to an Explained trace when a Source ID is available. Reopening that trace uses the saved response and does not request Gemini again.
- The service worker sends structured-output requests to the single Gemini provider using `gemini-3.5-flash-lite`. Missing keys, API failures, invalid responses, and rate limits show an error instead of fabricated content. Smart Reading is optional and sends sampled page text only when the user presses ✦; consider that request when testing private pages or API usage.
- The Atlas reuses the existing source collection, AI Page Map, ID validation, and live-source fallback. ID validation ensures the target exists; it does not prove that a generated label is semantically supported by the cited passage.
- Small DeepRead surfaces use opaque light backgrounds and high-contrast system text so that controls and annotations remain legible on dark webpages. Atlas labels keep their restrained editorial title style without a white text glow.
- The current interaction uses live Source Mapping directly. The old reading-statistics panel and its Readability script are no longer loaded.

This prototype does not include Critical Reading, translation, follow-up chat, multiple providers, accounts, a production backend, PDF/OCR support, or a settings dashboard.

## Local Gemini configuration

The extension reads one Gemini API key from the ignored `config.local.js` file. It is loaded by the extension service worker and is not committed to Git. A local extension build can expose this key to someone with access to that build; use a restricted development key and rotate it after testing.

If the file does not exist, copy `config.example.js` to `config.local.js` and use this format:

```js
globalThis.DEEPREAD_LOCAL_CONFIG = {
  apiKey: "YOUR_GEMINI_API_KEY"
};
```

After changing the file, reload the unpacked extension in `chrome://extensions`. Without a key, Explain, Page Map, and Smart Reading show a missing-key state and do not fabricate output. The model is fixed in `background.js` for this prototype.

## Run and test in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository folder, the one containing `manifest.json`.
3. Open an ordinary article or documentation page. Confirm the page remains unobscured and a thin Reading Spine with source points appears at the right edge.
4. Before opening Atlas, focus or hover a spine point. Confirm the associated original passage is outlined when visible and a small source label appears. Scroll the page and check that the active point changes.
5. Open Atlas from the small **D** launcher. The initial live-source points remain usable while the AI Page Map loads. Confirm AI labels later replace them without a scrim, panel, or card grid.
6. Focus or hover an Atlas point, then select it. Atlas should recede; the page should scroll to and highlight its real source, leaving a small margin trace. Hover, expand, dismiss, and scroll past the trace.
7. Press **Smart Lens**. Confirm it says it is analysing, then keeps the result count visible and opens a small list of names and types. Check the ✦ positions on the Spine even when findings are below the viewport. Focus a point, then click an overview row: the original cited passage should respond, scroll into view, and show a Smart trace. Reopen the overview or turn the Lens off and on; the cached results should return without another Gemini request. A zero-result page should show a clear empty state with no invented markers.
8. Select text on the original webpage without opening Atlas and choose **Explain**. Confirm the explanation appears beside its passage when there is room. Dismiss it, then expand its Explained trace. The same response should return without another Gemini request. Navigate another Atlas point and confirm both traces can coexist.
9. Repeat with a narrow Chrome window, a second ordinary HTML page, and a dark-background article. Check that small DeepRead text remains crisp and readable with no white glow or dark background bleeding into labels. If testing failure states, temporarily invalidate the local key, reload the extension, and confirm a clear error with live-source points instead of invented AI nodes. Restore the key afterward. For failures, record the page URL, viewport width, Source ID, sanitized console/service-worker error, and screenshot; never share the key.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Small toolbar popup that expands the source map. |
| `content.js`, `content.css` | Reading Spine, X-Ray peek, light Atlas, Smart Reading markers, Explain, source navigation, and session Reading Trail. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
