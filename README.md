# DeepRead

DeepRead is a small Chrome Manifest V3 prototype that keeps the original webpage as the main reading surface. It adds a reversible source guide beside the page instead of opening a separate chatbot or reader.

## Current prototype

- The popup opens and closes a right-side Reading Guide.
- Mozilla Readability is used only as a local extraction aid for page statistics and metadata.
- `source-mapping.js` finds a meaningful live reading region and maps real headings, paragraphs, list items, quotations and code blocks.
- Mapped elements receive deterministic `data-deepread-source-id` attributes for the current page state.
- The Page Guide prefers real `h1`–`h6` headings. Pages without enough headings show real mapped passages instead.
- Clicking a guide item smoothly scrolls the original webpage to its live source and temporarily highlights it.
- Word count, reading time and extraction mode remain as secondary local page statistics.

There is no LLM provider, backend, chat UI, text explanation flow or critical-reading analysis in this prototype yet. No page content is sent anywhere.

## Run in Chrome

1. Open this folder in VS Code or Explorer.
2. Open `chrome://extensions` in Chrome and enable Developer mode.
3. Choose **Load unpacked** and select this folder.
4. Open a normal `http` or `https` text-heavy webpage. Chrome internal pages and the Web Store are not supported.
5. Click the DeepRead toolbar icon, then choose **Open Reading Guide**.
6. Click a heading or reading point in the guide to jump to its real passage on the page.

After changing extension files, use **Reload** on the extension card before testing again.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and content-script order. |
| `popup.html`, `popup.css`, `popup.js` | Small toolbar popup that toggles the guide. |
| `content.js`, `content.css` | Guide UI, local page statistics, source-linked structure interaction and styling. |
| `source-mapping.js` | Live reading-region selection, source IDs, source data and scroll/highlight navigation. |
| `vendor/readability.js` | Browser copy of Mozilla Readability. |
| `background.js` | Minimal extension service worker. |
