# DeepRead

DeepRead is a small Chrome Manifest V3 prototype for source-linked reading support. The original webpage stays as the primary reading surface; DeepRead adds a compact rail, a floating Page Guide, and a contextual selection action.

## Current prototype

- The toolbar popup opens and closes a compact DeepRead rail. The rail expands into a floating Page Guide without covering the whole page.
- `source-mapping.js` identifies a meaningful live reading region, preferring a substantial `article`, then `main` or `[role="main"]`, then a simple text-density fallback.
- The mapper uses real headings, paragraphs, list items, quotations, code blocks, ARIA headings, and conservative generic `div`/`span` text blocks. It excludes common navigation, utility, ads, cookie, comment, recommendation, form, and DeepRead UI regions.
- Mapped sources receive deterministic `data-deepread-source-id` attributes in live DOM reading order. Each Page Guide item keeps its source ID.
- The Page Guide prefers real headings and falls back to real mapped reading points when a page has too few headings. Clicking an item smoothly scrolls to the original live element and temporarily highlights it. The current page position can also activate a corresponding item.
- Selecting meaningful text inside a mapped source shows an `Explain` action beside the selection. Clicking it intentionally shows `AI explanation not connected yet`; no explanation is fabricated and no provider is connected.
- Mozilla Readability remains a local extraction aid for secondary page statistics only. No page content is sent anywhere.

Translation, chatbot features, dashboards, settings systems, provider abstractions, follow-up chat, and critical-reading analysis are not implemented in this stage.

## Run in Chrome

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this folder.
3. Open a normal `http` or `https` text-heavy webpage. Chrome internal pages and the Web Store are not supported.
4. Click the DeepRead toolbar icon and choose **Open Page Guide**.
5. Use the rail to collapse or reopen the guide. Click a page-map item to jump to its live source.
6. Select a meaningful passage on the original page to test the contextual `Explain` action.

After changing extension files, use **Reload** on the extension card before testing again.

## Main files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration and content-script order. |
| `popup.html`, `popup.css`, `popup.js` | Toolbar popup that toggles the Page Guide. |
| `content.js`, `content.css` | Floating guide, page map, source navigation, selection action, and styling. |
| `source-mapping.js` | Live reading-region selection, source IDs, source data, and scroll/highlight navigation. |
| `vendor/readability.js` | Browser copy of Mozilla Readability used only for local extraction. |
| `background.js` | Minimal extension service worker. |
