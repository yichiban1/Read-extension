# DeepRead

DeepRead is a small Chrome Manifest V3 prototype for source-linked AI reading support. The original webpage remains the primary reading surface. DeepRead adds a quiet launcher, a floating Page Guide, and a contextual Explain response beside the selected passage.

## Current prototype

- A small DeepRead rail is injected automatically on normal `http` and `https` pages. It stays collapsed until opened.
- Selecting meaningful readable text shows an `Explain` action even when the text is outside the current Page Guide reading region. The request includes the selection, nearby context, page title/hostname, and a source ID when one exists.
- Explain requests go through the extension service worker to one OpenAI Responses API endpoint. Successful responses show plain-language meaning, context, and an optional analogy beside the selected text. Missing keys, provider failures, invalid responses, and rate limits are shown as errors; no fake answer is displayed.
- The Page Guide sends real mapped source blocks and their DeepRead IDs to the model. It renders a small AI Page Map only after validating that every returned node cites a real current source ID. Clicking a node jumps to and highlights its live source.
- If the page is not coherent enough for an AI map, or the AI request fails, the guide labels the state clearly and can show a live-source fallback instead of inventing structure.
- Mozilla Readability remains a local extraction aid for secondary page statistics. It is not used as a navigation target.

This stage does not add follow-up chat, translation, multiple providers, accounts, a production backend, PDF/OCR support, Critical Reading, or a settings dashboard.

## Local OpenAI configuration

The demo uses one OpenAI API key from a local file. The key is not committed to Git, but a browser extension key is still exposed to anyone who can inspect the local extension and is suitable only for a controlled university prototype.

1. Copy `config.example.js` to `config.local.js`.
2. Replace `PASTE_YOUR_OPENAI_API_KEY_HERE` with your key.
3. Optionally change the model in that local file; the default is `gpt-5-mini`.
4. Reload the unpacked extension in `chrome://extensions`.

`config.local.js` is ignored by Git. Without it, Explain and AI Page Map show a clear missing-key state and do not fabricate output.

## Run and test in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this folder.
3. Open a normal webpage such as an article, documentation page, GitHub page, forum, or search-results page.
4. Confirm the quiet DeepRead rail appears without opening the full guide.
5. Select a readable passage, choose **Explain**, and wait for the response beside the selection.
6. Open the rail and confirm that the Page Guide builds an AI Page Map from live sources. Click a node to navigate to its supporting passage.
7. Remove or invalidate the local key, reload the extension, and confirm a clear error appears instead of fabricated AI content.

After changing extension files or `config.local.js`, use **Reload** on the extension card before testing again.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and OpenAI host permission. |
| `background.js` | Single OpenAI request path, validation, timeout and error handling. |
| `config.example.js` | Safe template for the ignored local API-key file. |
| `popup.html`, `popup.css`, `popup.js` | Optional toolbar popup that opens the Page Guide. |
| `content.js`, `content.css` | Automatic rail, selection Explain flow, AI Page Map, source navigation and UI. |
| `source-mapping.js` | Live reading-region selection, source IDs and scroll/highlight navigation. |
| `vendor/readability.js` | Browser copy of Mozilla Readability for local extraction only. |
