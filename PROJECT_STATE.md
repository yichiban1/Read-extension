# DeepRead Project State

Updated: 2026-09-26

## Product direction

The original webpage remains the reading surface. Atlas shows structure; Smart Lens helps comprehension; Critical Lens raises focused reading questions; Explain responds to selected text. Reading Spine, X-Ray, Spotlight and the five-item session-local Reading Trail connect these behaviours. No extra primary behaviour or provider was added.

## Critical Lens implementation

The latest checkout already included Critical Lens before this pass: one independent structured Gemini request, 0–3 findings in evidence, assumption, causal, uncertainty, counterpoint or value, and supplied deepread-source-<number> IDs. Questions are framed for examination rather than as fact-checking verdicts. Zero findings is valid. The ◇ control, cached overview, global Spine positions, X-Ray, source navigation and Critical traces coexist with Smart Lens. Reopening or toggling either Lens reuses its result for the unchanged Source Map.

This pass strengthens validation: any unknown cited ID rejects the entire finding instead of silently dropping that citation. Invalid types, empty copy, duplicate findings and several categorical verdict phrases are also rejected. This limited copy guard is not proof of semantic support or an exhaustive verdict-language classifier.

## Shared interaction polish

- Short-window layouts reserve top space for D, ✦ and ◇. Smart/Critical Spine targets are 20 px, with a shared collision lane and 22 px spacing where space permits. The article-edge offset accounts for the additional lane.
- Margin markers reserve the Spine/control lane, use remaining right/left margin space, or recede to compact source-linked markers. Expanded trace details stay inside the viewport and scroll internally if long. The five-item limit and session-only storage remain.
- Both overviews close on scroll, restore focus from a hidden overview to its control, and clear X-Ray on dismissal. Result labels wrap. Controls expose analysing state with aria-busy.
- Ordinary fragment navigation no longer rebuilds the map and erases Page Map/Smart/Critical caches. Route changes and observed content mutations still refresh the map.
- Additional Critical citations have related-passage navigation buttons. Distinct Smart/Critical findings at the same passage can retain distinct traces. Trace focus accents follow their type. Lens Spine focus retains its type/label peek in compact layouts.
- Atlas, Smart, Critical and Explained traces remain source-attached. No broad architecture rewrite was performed.

## Verification performed in this pass

- Syntax: node --check passed for content.js, background.js, source-mapping.js and tests/reading-layer.js. git diff --check passed.
- Service-worker contract: node tests/critical-reading.test.cjs passed zero output, valid output, mixed valid/unknown citations, invalid types, verdict guard, deduplication, three-item limit and malformed/runtime response handling. Network and local configuration were mocked; no real Gemini call was made in this pass.
- Codex in-app browser: actual source-mapping.js, content.js and content.css loaded against synthetic articles with mocked extension messages. All 21 interaction checks passed on light, dark, documentation and a 520 × 360 dark child viewport. A zero-result fixture passed its ten applicable checks. Each nonzero suite recorded one Page Map, one Smart, one Critical and one Explain mock request despite cache reopening and anchor navigation.
- Checks cover initial non-AI Spine, Atlas caching/navigation, concurrent Lenses, counts, marker spacing, control bounds, Escape focus restoration, fragment caching, toggle caching, source spotlight, trace bounds, related citation navigation, selected-text Explain, saved response reopening, four trace kinds together, keyboard X-Ray, scrolling, five-item Trail size and margin clearance from the Spine. Screenshots were inspected for light, dark, documentation and narrow layouts.
- **Real Chrome manual acceptance remains incomplete.** Native Chrome was found, including an extension-management page, but Computer Use stopped before interaction because it could not confidently identify the browser URL. No unpacked extension reload, service-worker lifecycle or real-site CSS acceptance is claimed. Prior project notes describe a synthetic real-Gemini check from the earlier iteration; that is historical evidence, not a new result from this pass.

## Known limitations

- Valid Source IDs prove navigation targets exist, not that questions are justified. Review real Gemini output against original text during Chrome acceptance.
- Smart/Critical sample at most 36 substantial blocks, truncated to 700 characters each. Questions may miss unsampled context; empty output is not an endorsement of an article.
- Open overviews or expanded compact traces can temporarily cover article text on narrow pages. Dense margin items may hide until their source or available space changes. Extremely short viewports below the tested 360 px height can still crowd global Spine points.
- Dynamic readable-content changes intentionally rebuild the map and clear session traces/caches. Sticky headers, host CSS, SPA behaviour and extension lifecycle remain real-site verification work.
- Activation sends sampled page text to Gemini. config.local.js remains ignored and must not appear in test assets, screenshots or reports. Local QA uses an allowlisted loopback server and never reads it.

## Next recommended stage

Reload the unpacked extension from this inner directory in Chrome. Test an external light article, dark article, documentation/GitHub-style page and narrow window. Exercise all four behaviours, keyboard/escape, marker/trace density, result caching, real Gemini zero results, and each finding's relationship to its cited passage. Fix observed issues before adding more AI features.

See tests/README.md for fixtures and README.md for the Chrome checklist. Record URL, viewport, Source ID, sanitized console/service-worker error and screenshot for failures; never include credentials or private text.

## Git state

- Branch: main; starting commit for this polish pass: 99f2384.
- This pass is uncommitted. No reset, cleanup, commit or push was performed.
- Existing Critical Lens was preserved. Implementation, documentation and test fixtures are reviewable in the working tree.
