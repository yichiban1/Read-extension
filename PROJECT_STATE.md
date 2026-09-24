# DeepRead Project State

Updated: 2026-09-23

## Experiment

Reading Atlas explores a spatial, source-linked overview in place of the conventional Page Guide sidebar. The original webpage remains visible beneath the Atlas. The implementation reuses the existing Gemini Page Map response, live Source IDs, Source Spotlight, and Explain flow.

## Current implementation

- The collapsed Atlas launcher is injected on ordinary HTTP/HTTPS pages.
- Opening it builds a fresh Source Map and requests the existing AI Page Map. Nodes use an asymmetric responsive editorial grid; hover and keyboard focus reveal a preview taken from the first cited live source.
- Selecting a node closes the Atlas, navigates to the first cited source, applies the existing temporary Source Spotlight, and displays a dismissible annotation containing the node label and actual source excerpt. The annotation expands to show more of the passage and follows the source while it is visible.
- Page Map loading, unavailable, insufficient-content, and live-source fallback states remain explicit.
- Explain remains a separate selection-first action. Source Mapping is initialized at page startup and refreshed before selection when observed page changes have made the map stale. A valid Source ID is included in the Gemini request as reference metadata.
- Source Spotlight uses instant scrolling when the user requests reduced motion.
- A Node harness loaded the actual `background.js` and ignored local config, then made real Gemini calls with synthetic content: Explain succeeded with a valid Source ID present in the request; Page Map returned two nodes citing only the two supplied IDs. Each request took about 43–44 seconds, so the request timeout was increased from 45 to 75 seconds.

## Outstanding issues and limits

- Browser interaction has not yet been visually checked in this environment. Chrome is not available in the checked executable locations. Edge is installed, but the environment command policy rejected launching an isolated browser profile, so no browser interaction is claimed as verified. Verify Atlas layering, hover/focus previews, note placement, focus trapping, narrow layouts, and interaction with real host-page styles in Chrome.
- Source ID validation confirms that a cited target exists. It cannot prove that an AI-generated label is semantically supported by the cited passage. Keep comparing labels with their displayed source excerpts; do not add another model or validation architecture in this iteration.
- A node with several Source IDs previews and navigates to its first source. The other IDs remain visible as a citation count but do not yet have individual previews.
- On pages without enough side margin, the annotation collapses to a small source marker. Opening it overlays the page by design; confirm that this remains practical on narrow screens.
- The Gemini key is stored in the ignored local config for this prototype. Do not commit that file or copy its value into reports, screenshots, or request logs.
- Gemini GenerateContent was confirmed with synthetic requests in the local harness; Chrome's service worker lifecycle, browser permissions, and host-page integration still need manual verification.

## Recommended next iteration

1. Load the unpacked extension from this directory in Chrome and test an article plus a general documentation page.
2. Confirm direct Explain works before opening Atlas and that the request includes the selected passage, nearby context, and available Source ID.
3. Check Page Map loading/error/fallback behavior, node previews, Atlas close-on-select, source scroll and spotlight, and annotation placement/expand/dismiss/scroll behavior.
4. Repeat keyboard navigation, reduced-motion, and narrow-window checks. Record any Page Map label that does not match its cited excerpt.
5. Keep Critical Reading out of scope until Page Guide/Atlas and Explain have passed these checks.

## Git state

- Branch: `main`
- Base commit: `6a10924` (`origin/main` points to the same commit at the start of this experiment)
- The experiment changes are currently uncommitted. No commit was created for this iteration. The working tree already contained uncommitted Gemini migration changes in `README.md`, `background.js`, `config.example.js`, and `manifest.json` before this experiment; those remain mixed with the current edits in the same files.
- `config.local.js` is ignored by Git and is local-only.
