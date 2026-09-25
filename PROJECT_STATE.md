# DeepRead Project State

Updated: 2026-09-25

## Product direction

The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Smart Lens, Source X-Ray, Select Text → Explain, and the session-local Reading Trail form one source-linked assistance layer. The fullscreen editorial Atlas in `40c4e42` was rejected after Chrome testing; this iteration keeps the later lightweight design.

## Current implementation

- Source Mapping builds live `deepread-source-<number>` IDs. The Reading Spine initially shows up to six real page-source positions and tracks the current reading area without an AI request. Spatial Atlas uses the existing Page Map, keeps the article visible, and navigates to cited passages with Source Spotlight.
- Smart Lens is one on-demand Gemini comprehension analysis for the current Source Map. Its control now distinguishes inactive, analysing, active with a visible finding count, and active with zero findings. A compact overview lists each finding and semantic type immediately after analysis and can be reopened from the same control. Its items, distinct ✦ points on the Reading Spine, and contextual margin markers all navigate to the same cited Source ID. Spine points remain visible for findings outside the current viewport. Focus or hover uses Source X-Ray to identify the source and type.
- The Smart Lens result is cached in content-script memory for the current Source Map. Closing and reopening its overview or turning the Lens off and back on does not request Gemini again. A zero-result response creates no markers and presents an explicit empty state. The Gemini instructions now prefer useful technical, domain, historical, or abstract-concept context over trivial vocabulary and ask for a direct, concise hint. Results are still limited to five, the four comprehension categories, and IDs sent with the request.
- The Reading Trail can hold at most five session-local traces from Atlas, Smart Lens, and Explain. Explain still works without opening Atlas. A mapped explanation can collapse to an Explained trace whose cached content reopens without another Gemini request.
- The small DeepRead surfaces now use a shared opaque light surface with high-contrast text. Small labels and hints use system fonts. The white text shadow on Atlas labels is removed; larger editorial titles retain the serif style. This is a readability change, not a theme or replacement reader.

## Verification performed

- Static: `node --check` on `content.js` and `background.js` passed. Manifest parsing and `git diff --check` were also run.
- Real Gemini: a synthetic technical article returned three Smart Reading results with IDs in the supplied set using the current local configuration. This checks the request path after the prompt adjustment, not result quality on a particular real article.
- Local browser fixture, with mocked extension messages: on a long light article, the Smart Lens showed an analysing state, then a persistent count of three, a clickable compact overview, and three global Spine positions. Choosing the second overview item navigated to its original passage, applied Source Spotlight, and opened a Smart trace. Keyboard focus on a Spine point activated the corresponding X-Ray response.
- On a near-black version of the same fixture, the Spine, Atlas labels, Smart overview, and source marker remained visually crisp without a white text glow. Reopening the overview and turning the Lens off and back on kept the fixture's Smart request counter at one. A zero-result fixture displayed an empty state and no Smart Spine markers. Existing Atlas, Explain, and Reading Trail flows were exercised in the previous iteration's local fixture.
- This browser fixture renders the content scripts on an ordinary HTML page but mocks the extension messaging. The modified extension has **not yet been reloaded and manually checked in Chrome**. Chrome content-script injection, service-worker lifecycle, narrow pages, and interactions with real site styles remain acceptance work.

## Known limitations

- A valid Source ID proves a cited passage exists; it does not prove the AI label or hint is semantically supported by that passage. Page Map has the same limitation. No new grounding architecture was added.
- Smart Lens samples at most 36 substantial truncated source blocks, so a long article may have relevant passages outside the sample. Gemini may return zero results or weak suggestions; the UI does not create filler.
- The compact overview may overlap article text when a page has very little side space. Narrow-window placement needs direct Chrome review. Dark readability was visually checked only in the local fixture, not across real sites with conflicting styles.
- Each fresh Smart Lens analysis sends sampled page text to Gemini after the user presses the control. The key is in ignored `config.local.js`; do not include it in reports, screenshots, or logs.

## Recommended next UI/UX iteration

Reload the unpacked extension in Chrome and perform a full reading pass on two ordinary long articles, including a dark-background page and a narrow window. Check whether users immediately understand the count, finding names, and article positions; whether Smart points and Atlas remain distinct; and whether overview placement stays out of the reading path. Refine placement and wording from that observation before adding another capability. Keep Critical Reading deferred.

For failures, record the page URL, viewport width, Source ID, sanitized page/service-worker console error, and a screenshot. Redact credentials and private page text before sharing.

## Git state

- Branch: `main`; base commit before this iteration: `b94691f`.
- This iteration is uncommitted. No reset, cleanup, or commit was performed.
- `config.local.js` remains ignored and local-only.
