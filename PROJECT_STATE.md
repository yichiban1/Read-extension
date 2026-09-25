# DeepRead Project State

Updated: 2026-09-25

## Design direction

The original webpage remains the reading surface. Reading Spine, Spatial Atlas, Smart Reading markers, contextual Explain, and the Living Reading Trail are small states of one source-linked layer. The fullscreen editorial Atlas in `40c4e42` was rejected after Chrome testing; this iteration preserves the later lightweight Spine and Atlas design.

## Current implementation

- Source Mapping initializes when the content script starts and produces `deepread-source-<number>` IDs for live page passages. The Reading Spine shows up to six page-source positions before any AI request, follows the reading position, and sits near the detected article edge when the margin permits.
- Atlas uses the existing Gemini Page Map request. Its small source-linked nodes appear around the original article without a scrim, card grid, or replacement reader. Focus or hover gives an X-Ray source response; selecting a point collapses Atlas, scrolls to the cited passage, applies Source Spotlight, and leaves a trace.
- The small ✦ action runs one on-demand Smart Reading request for the current Source Map. The content script samples substantial passages across the article. The single Gemini service worker asks for zero to five comprehension aids and validates that each result is `concept`, `term`, `background`, or `context`, has text, and cites an ID sent in that request. Invalid IDs are discarded. Valid findings appear as small markers beside their real sources; focus or hover spotlights the passage and reveals the hint. Selecting a marker follows the source and opens a Smart trace. A zero-item response is accepted.
- Living Reading Trail is an in-memory array of at most five traces from Atlas, Smart Reading, and Explain. Traces can coexist, follow visible sources, expand to show their already available content, and be dismissed individually. Adding a sixth removes the oldest. They are never stored across reloads; a Source Map rebuild clears them to avoid stale IDs.
- Select Text → Explain works without opening Atlas. It sends the selected text, nearby context, and an available Source ID through the existing Gemini path. Plain meaning appears first, with article context second and analogy only if provided. The explanation opens beside the mapped passage when there is room. Dismissal or continued reading collapses a successful mapped explanation into an Explained trace. Reopening that trace reads its cached response without a new request.
- The implementation still uses one Gemini model and one local configuration file. There is no Critical Reading, chat, persistence, settings, or new framework.

## Verification

- `node --check` on `background.js` and `content.js`, manifest JSON parsing, and `git diff --check` passed for this iteration.
- Real Gemini GenerateContent calls with a synthetic technical article returned three Smart Reading items linked to sent Source IDs. A simpler synthetic article returned zero items. This verifies this request path and zero-result handling with the current local key; it does not verify result quality on arbitrary webpages.
- In a local ordinary-article fixture rendered in Codex's in-app browser at a desktop viewport, the page stayed readable; the Spine and Atlas remained lightweight; three mocked Smart findings appeared at mapped passages; keyboard focus applied source X-Ray; clicking a finding spotlighted its source and opened a trace; Atlas navigation left another trace; a selected-text Explain response appeared beside its mapped passage; dismissing it created an Explained trace; Smart and Explained traces coexisted. A fixture-side request counter stayed at one after reopening the Explain trace. Adding six Atlas visits left exactly five traces. Atlas opening hid existing trace detail and preserved the article view.
- The fixture mocks extension messaging and Gemini results. The modified extension has **not** yet been reloaded and manually checked in Chrome as an unpacked extension. Actual content-script injection, service-worker lifecycle, style collisions on other sites, narrow layouts, and real-page Gemini latency remain pending.

## Known limitations and risks

- A valid Source ID proves only that a passage exists, not that a Gemini label or hint is semantically supported by it. Page Map has the same limitation. No additional grounding architecture was added.
- Smart Reading may return zero aids or may suggest weak aids. Its analysis uses at most 36 sampled, truncated source blocks, so a long page may contain useful passages it never sees.
- Traces are associated with mapped source elements. Explain selections outside the mapped reading region still receive an explanation but cannot leave a source-linked Explained trace.
- On narrow or unusually styled pages, there may be insufficient side space for full labels or the contextual Explain surface. Compact markers and fallback positioning need Chrome validation on several ordinary pages.
- Each fresh Smart Reading analysis is an API request that sends sampled page text to Gemini. It starts only from the explicit ✦ action and is cached for the current Source Map. The local key is in ignored `config.local.js`; do not put it in reports or logs.

## Next UI/UX iteration

Reload the unpacked extension in Chrome and observe a full reading pass on at least two ordinary HTML articles, including a narrow window. Pay attention to whether users notice the small ✦ action, whether Smart hints genuinely help comprehension, and whether several traces remain legible without competing with the article. Refine placement or wording based on those observations. Keep the Page Map semantic-support limitation visible; defer Critical Reading.

For a failure, capture the page URL, viewport width, Source ID, relevant sanitized page/service-worker console error, and screenshot. Redact credentials and private article text before sharing.

## Git state

- Branch: `main`; base commit before this iteration: `494367e`.
- This iteration is uncommitted. No reset, cleanup, or commit was performed.
- `config.local.js` remains ignored and local-only.
