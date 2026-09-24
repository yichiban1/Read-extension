# DeepRead

DeepRead is a Chrome Manifest V3 prototype for source-linked reading support. The original webpage remains the primary reading surface. A quiet launcher opens an experimental spatial Reading Atlas; selected-text Explain remains available on the page.

## Current prototype

- A DeepRead rail appears automatically on ordinary `http` and `https` pages and stays collapsed until opened.
- Reading Atlas arranges existing AI Page Map nodes in an editorial layout over a subdued view of the original page. Hovering or keyboard-focusing a node previews an excerpt from its first cited live source.
- Selecting a node closes the Atlas, follows its Source ID, applies the existing Source Spotlight, and shows a small annotation with the node title and real source excerpt. The note can expand or be dismissed and hides while its source is out of view.
- Source Mapping is initialized when the content script starts and refreshed before Explain after observed page changes. Explain requests include the available Source ID as reference metadata without requiring the Atlas to be opened first.
- Selecting readable text shows an `Explain` action, including text outside the mapped reading region. The response appears beside the selection and contains plain-language meaning, context, and an optional analogy.
- The service worker sends structured-output requests to Gemini using `gemini-3.5-flash-lite`. Missing keys, API failures, invalid responses, and rate limits show an error instead of fabricated content.
- The Atlas reuses the existing source collection, AI Page Map, ID validation, and live-source fallback. ID validation ensures the target exists; it does not prove that a generated label is semantically supported by the cited passage.
- Mozilla Readability remains a local extraction aid for secondary reading statistics, not a navigation target.

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
3. Open an article, documentation page, forum, or another ordinary webpage. Confirm the collapsed DeepRead rail appears.
4. Before opening the Atlas, select a paragraph and choose **Explain**. Confirm the request succeeds and includes the available Source ID.
5. Open Reading Atlas and wait for the AI Page Map. Hover or keyboard-focus a node to preview its cited passage.
6. Select a node. The Atlas should close, the page should scroll to and highlight its source, and a source annotation should appear beside it. Expand and dismiss the annotation, then continue scrolling.
7. If testing failure states, temporarily remove or invalidate the local key, reload the extension, and confirm an explicit error or live-source fallback appears instead of fabricated content. Restore the key after testing.

The repository root in this workspace is `Read extension` inside the outer `Deepread-extension` folder. Load the inner directory containing `manifest.json`, not the parent workspace folder.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and Gemini host permission. |
| `background.js` | Single Gemini request path, structured-output schemas, source ID validation, timeout, and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Small toolbar popup that opens Reading Atlas. |
| `content.js`, `content.css` | Automatic rail, Reading Atlas, Explain flow, source navigation, and annotation. |
| `source-mapping.js` | Live reading-region selection, Source IDs, and scroll/highlight navigation. |
| `vendor/readability.js` | Browser copy of Mozilla Readability for local extraction only. |
| `PROJECT_STATE.md` | Experiment summary, implementation status, limitations, and next iteration. |
