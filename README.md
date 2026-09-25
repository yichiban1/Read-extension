# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support. The original webpage remains the reading surface. A small Reading Spine and temporary margin labels connect AI structure back to its live passages; selected-text Explain remains available on the page.

## Current prototype

- A thin Reading Spine appears near the right edge on ordinary `http` and `https` pages. It first shows up to six real source positions from the page, so reading can begin without an AI request.
- Hovering or keyboard-focusing a point lightly outlines its live source and shows a short contextual label. If the source is outside the viewport, the label indicates whether it is above or below and uses real nearby page text.
- Opening Reading Atlas requests the existing AI Page Map once for the current Source Map. Source-linked points and short labels appear around the article in the available margins, arranged by article order and source position. The webpage stays visible and usable. Narrow layouts keep small points; focus or hover still spots the source, with a short direction label when it is offscreen.
- Selecting a point collapses Atlas, follows its Source ID, applies Source Spotlight, and leaves a small margin trace. The trace reveals a short excerpt on hover or focus and can expand or be dismissed. It hides when its source leaves the viewport.
- Source Mapping is initialized when the content script starts and refreshed before Explain after observed page changes. Explain requests include the available Source ID as reference metadata without requiring the Atlas to be opened first.
- Selecting readable text shows an `Explain` action, including text outside the mapped reading region. The response appears beside the selection and contains plain-language meaning, context, and an optional analogy.
- The service worker sends structured-output requests to Gemini using `gemini-3.5-flash-lite`. Missing keys, API failures, invalid responses, and rate limits show an error instead of fabricated content.
- The Atlas reuses the existing source collection, AI Page Map, ID validation, and live-source fallback. ID validation ensures the target exists; it does not prove that a generated label is semantically supported by the cited passage.
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

After changing the file, reload the unpacked extension in `chrome://extensions`. Without a key, Explain and Page Map show a missing-key state and do not fabricate output. The model is fixed in `background.js` for this prototype.

## Run and test in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository folder, the one containing `manifest.json`.
3. Open an ordinary article or documentation page. Confirm the page remains unobscured and a thin Reading Spine with source points appears at the right edge.
4. Before opening Atlas, focus or hover a spine point. Confirm the associated original passage is outlined when visible and a small source label appears. Scroll the page and check that the active point changes.
5. Open Atlas from the small **D** launcher. The initial live-source points remain usable while the AI Page Map loads. Confirm AI labels later replace them without a scrim, panel, or card grid.
6. Focus or hover an Atlas point, then select it. Atlas should recede; the page should scroll to and highlight its real source, leaving a small margin trace. Hover, expand, dismiss, and scroll past the trace.
7. Select text on the original webpage without opening Atlas and choose **Explain**. Confirm the explanation appears near the selection and includes the available Source ID in its request.
8. Repeat with a narrow Chrome window and a second ordinary HTML page. If testing failure states, temporarily invalidate the local key, reload the extension, and confirm a clear error with live-source points instead of invented AI nodes. Restore the key afterward.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Small toolbar popup that expands the source map. |
| `content.js`, `content.css` | Reading Spine, X-Ray peek, light Atlas, Explain, source navigation, and margin trace. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
