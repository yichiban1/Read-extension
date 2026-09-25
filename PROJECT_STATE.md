# DeepRead Project State

Updated: 2026-09-25

## Product direction

The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Smart Lens, Critical Lens, Source X-Ray, Select Text → Explain, and the session-local Reading Trail form one source-linked assistance layer. Atlas shows structure; Smart helps comprehension; Critical raises focused reading questions; Explain responds to a passage the reader selects.

## Current implementation

- Source Mapping builds live `deepread-source-<number>` IDs. The Spine initially shows real page-source positions without AI. Atlas requests the existing Page Map on demand, keeps the article visible, and navigates to live passages with Source Spotlight.
- Smart Lens remains an independent on-demand Gemini comprehension request, with cached 0–5 results for the current Source Map. Its overview, ✦ Spine points, and margin markers link to cited passages.
- Critical Lens adds one on-demand Gemini structured-output request. It asks for 0–3 useful questions in `evidence`, `assumption`, `causal`, `uncertainty`, `counterpoint`, or `value`. Each item carries one or more supplied Source IDs. The service worker filters unknown IDs and invalid types; the content script checks links again before display. An empty result is valid and shows no invented markers.
- Critical has its own cached overview, ◇ global Spine positions, Source X-Ray, source navigation, and Critical Reading Trail trace. Turning it off and back on, or reopening the overview, reuses results for the unchanged Source Map. Smart and Critical can remain active together without rerunning each other.
- Atlas, Smart, Critical, and Explained traces share the five-item session-local Reading Trail. Lens points share one collision-aware positioning lane. Margin items stack within the viewport; items that cannot fit are temporarily hidden until their sources move. Open trace details recede when another trace or Explain takes focus.
- The three small controls now form one vertical cluster. Semantic accents distinguish Atlas/navigation, Smart, Critical, and Explained traces. DeepRead surfaces remain opaque and light for contrast on dark host pages. Spine points gain a restrained visited state.

## Verification performed

- Static: `node --check` passed for `content.js` and `background.js`; `git diff --check` passed. No new framework or provider was added.
- Real Gemini: one synthetic Critical Lens request using the existing local Gemini configuration returned three validated findings citing IDs supplied in that request. This verifies the request/response path, not critical-reading quality on real articles.
- Codex in-app browser, local HTML fixture with mocked extension messaging: checked a light article, a dark article, and a documentation-style layout. The normal page stayed visible; Smart and Critical markers were distinguishable; Critical count, overview, source navigation, Source Spotlight, X-Ray via keyboard focus, and a Critical trace appeared. A zero-result fixture showed `0`, an empty overview, and no Critical markers. Turning Critical off and back on kept its fixture request count at one.
- In the same fixture, Explain still opened from selected original text while Critical was active. A collision between its card and an expanded Critical trace was observed and corrected by collapsing the open trace detail. A 520 px viewport check showed the compact controls and overview within viewport bounds; the small overview can still cover part of article text while open.
- **Chrome extension manual verification has not been performed in this iteration.** The computer-use environment exposed only Codex's in-app browser, not a controllable Chrome window. The fixture mocks extension messaging and does not test unpacked-extension reload, service-worker lifecycle, or real-site CSS conflicts.

## Known limitations

- A valid Source ID establishes location, not semantic support. Neither Page Map nor Critical Lens can prove that a generated label or question is justified by its cited paragraph. Critical copy is framed as a question, not a verdict; readers must inspect the original passage.
- Smart and Critical each sample at most 36 substantial source blocks, truncated per block. A long page may have relevant passages outside that sample. Their caches are tied to the current in-memory Source Map and reset on rebuild.
- On narrow pages, an open overview may temporarily overlay article text. Dense source-adjacent markers may hide when they cannot be stacked within the viewport. Real Chrome checks should evaluate this on varied pages.
- Each fresh Lens analysis sends sampled page text to Gemini only after the reader activates it. The key remains in ignored `config.local.js`; do not put it in logs, screenshots, or reports.

## Next recommended stage

Reload the unpacked extension in Chrome and manually check a light article, a dark article, a documentation/GitHub-style page, and a narrow window. Exercise Atlas, Smart, Critical, Explain, caching, X-Ray, source navigation, and multiple traces. Review whether each Critical question is genuinely prompted by its cited passage, including a page where zero findings is appropriate. Fix observed issues before adding more AI features.

For failures, record the page URL, viewport width, relevant Source ID, sanitized page/service-worker console error, and screenshot. Redact credentials and private page text before sharing.

## Git state

- Branch: `main`; base commit before this iteration: `df48395`.
- This Critical Lens iteration is uncommitted. No reset, cleanup, or commit was performed.
- `config.local.js` remains ignored and local-only.
