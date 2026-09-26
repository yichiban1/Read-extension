# Reading-layer QA

The fixture loads actual content.js, content.css and source-mapping.js with a test-only extension runtime. It never reads config.local.js or contacts Gemini. Service-worker tests separately mock fetch/config and validate response contracts.

Run from this repository directory:

```powershell
node tests/critical-reading.test.cjs
python tests/preview-server.py
```

The loopback server binds 127.0.0.1:8765 and serves an explicit asset allowlist. Stop it with Ctrl+C when finished.

| URL / query | Assertions |
| --- | --- |
| `http://127.0.0.1:8765/?view=light&autorun=1` | 38 |
| `view=dark`, `docs`, `wide`, `slim`, `short`, `sticky` with `autorun=1` | 38 each |
| `http://127.0.0.1:8765/narrow` — dark 520 × 360 child viewport | 38 |
| `view=table&autorun=1` — cells, definitions, captions, nested duplication | 41 |
| `view=fallback&autorun=1` — small article to coherent main; excluded UI | 40 |
| `view=zero&autorun=1` — valid empty responses and cached toggles | 19 |
| `view=dark&demo=1` | Context source-edge marks; manual visual inspection |

2026-09-26: all 11 scenarios pass, 404 assertions total, in the Codex in-app browser. Each nonzero suite records one request per Lens and Atlas while switching/reopening/hash navigating. A deliberate text mutation then makes a second request for each changed map. Explain stays at one request despite saved-trace reopening. Context response is delayed longer than Critical to exercise stale visibility races.

Checks cover viewport-based rail position through article resizing, two persistent controls, Lens tab focus, independent caches/one visible mode, empty state, inward panel/Atlas/detail geometry, collision spacing, source-edge placement, X-Ray, source navigation, additional citations, Explain priority, Trail hierarchy/limit, Escape/focus return, scroll dismissal and dynamic source updates.

Reload before rerunning a suite. Omit autorun for manual Atlas/Lens exploration. Mock aids/questions are not evidence of Gemini quality. Fixture tests do not prove unpacked Chrome injection, host-site CSS compatibility, real GitHub/SPA behaviour, service-worker lifecycle or screen-reader acceptance. No real Gemini request or unpacked-extension acceptance happened in this pass. Follow the main README manual checklist.
