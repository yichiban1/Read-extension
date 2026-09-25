# DeepRead Project State

Updated: 2026-09-24

## Design decision

The fullscreen editorial Reading Atlas in commit `40c4e42` was tested in Chrome and rejected by the user: its scrim, large panel, and cards made DeepRead feel like a replacement reader. The current uncommitted iteration makes the original article the main reading surface. Reading Spine, X-Ray, expanded Spatial Atlas, and Living Margin trace are states of the same source-linked interaction.

## Current implementation

- On an ordinary HTTP/HTTPS page, Source Mapping initializes at content-script startup. A small Reading Spine appears near the right viewport edge with up to six live heading or passage points. Scroll position updates the active point. This immediate outline does not require an AI request.
- Hovering or keyboard-focusing a point outlines its actual source element and shows a small label beside the passage when space allows. An offscreen source is marked as above or below. Preview text comes from the cited element or a clearly identified following paragraph.
- Expanding Atlas keeps the webpage visible and interactive. Where both margins have room, its small nodes appear on alternating sides of the article. It uses the existing Gemini Page Map request and validated Source IDs. While loading or if the request fails, live-source points remain usable. Valid AI points replace the fallback for the current Source Map.
- Selecting a point collapses Atlas, scrolls to the first cited source, applies Source Spotlight, and leaves a small margin trace. The trace follows the source while visible, reveals a live excerpt on hover or focus, expands on click, and can be dismissed.
- Select Text → Explain is independent of opening Atlas. It captures selected text, nearby context, and an available `deepread-source-<number>` ID, then uses the existing Gemini request path. The response is placed near the original selection.
- The old Atlas scrim, fullscreen panel, editorial card grid, reading statistics, and loaded Readability script have been removed from the current interaction.

## Verification and limits

- Earlier work confirmed real Gemini GenerateContent calls with synthetic content for Explain and Page Map. Those calls do not prove the current Chrome UI or a particular real webpage works. The local development key remains in ignored `config.local.js`; do not copy it into reports, screenshots, or logs.
- In a local synthetic article rendered in Codex's in-app browser, the new layer left the article readable at a 1280×720 viewport. Six spine points appeared. Expanding Atlas showed six small nodes split between the article margins without a scrim or card grid. Keyboard focus outlined the cited heading; a collapsed-spine focus showed an X-Ray label. Selecting a point collapsed Atlas, scrolled to the source, activated the matching spine point, and showed a small trace with following original text. Selecting text before opening Atlas produced an Explain action with a valid Source ID and a mocked explanation response. This fixture uses a local mock for extension messaging; it does not call Gemini.
- The current iteration has **not** been loaded and checked as an unpacked extension in Chrome. In particular, real host-page style collisions, browser permissions, service-worker behavior, and live Gemini latency still require a Chrome pass.
- Page Map validation establishes that a cited Source ID exists. It does not establish that an AI-generated label or summary is truly supported by the passage. Keep this limitation visible without adding a new verification architecture in this iteration.
- A Page Map node can contain several Source IDs; the visual preview and navigation currently use its first cited source. The AI request is made when Atlas is expanded, so the initial spine reflects live page structure rather than AI concepts until a Page Map response arrives.
- Narrow pages compress Atlas to points and may have less space for labels or traces. The local preview is not a substitute for testing several ordinary Chrome pages.

## Next manual Chrome pass

1. Reload the unpacked extension from this folder in `chrome://extensions` and open a normal article. Confirm the page stays readable and only the small Reading Spine appears before Atlas is opened.
2. Hover or focus a spine point, scroll, and confirm its real source responds and the active point follows the reading position.
3. Expand Atlas; confirm the article stays visible during Page Map loading and after the AI response. Compare each AI label with its cited live excerpt, recording unsupported labels.
4. Select an Atlas point; confirm collapse, smooth navigation, visible Source Spotlight, and a small margin trace. Hover, focus, expand, and dismiss the trace.
5. On a fresh page, select text and run Explain before opening Atlas. Confirm the selected text, nearby context, and available Source ID are sent; check both success and an error state without exposing the API key.
6. Repeat on a second ordinary HTML page and at a narrow window width. Note the page URL, viewport size, selected Source ID, console/service-worker error text, and a screenshot for any failure. Redact credentials and private page content before sharing diagnostics.

## Git state

- Branch: `main`; base commit before this iteration: `40c4e42`.
- This iteration is uncommitted. No reset or cleanup of repository changes was performed.
- `config.local.js` is ignored and local-only.
