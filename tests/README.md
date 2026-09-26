# Reading-layer QA

The browser fixtures load actual source-mapping.js, content.js and content.css. Runtime and Gemini responses are mocked. Fixtures and worker contracts never read config.local.js or contact the provider. Keep these separate from unpacked Chrome and external-site acceptance.

```powershell
node tests/critical-reading.test.cjs
node tests/entry-and-structure.test.cjs
python tests/preview-server.py
```

Open `http://127.0.0.1:8765/matrix` to run twenty scenarios with up to four synthetic frames at a time. Standard frames are 1280 × 800; wide uses 1920 × 800, narrow 520 × 360. Each reports its actual assertion count and PASS/FAIL. This is browser fixture concurrency, not external-site testing.

Individual fixtures use `/?view=<family>&autorun=1`. Families: light, dark, docs, wide, slim, short, sticky, table, fallback, zero, hierarchy, github, wiki, columns, cards, inferred, coverage, shadow. `/narrow` provides a standalone narrow child viewport. The race case is `/?view=light&autorun=1&race=1`. Reload before rerunning; omit autorun for manual exploration. `atlasdemo=1` and `focusdemo=1` show mocked visual states.

The original Lens, Explain, source ticks, X-Ray, related citations, detail priority, Trail limit, hash navigation and content-change checks are retained. New checks exercise dormant/active mode and toolbar messages, complete heading hierarchy, inferred overlapping ranges, coverage recovery, shadow/slotted anchors and mutations, Focus navigation/spotlight/endpoints, cache reuse, shared cold requests, cancellation, late-response invalidation, Explain coexistence and Escape/resume.

2026-09-26 results: PASS: 20 scenarios, 1,037 assertions in the Codex in-app browser. Worker contracts and syntax checks also passed. The available UI browser was Codex's in-app browser; unpacked Chrome and real external-site injection were not performed.

Optional real provider check:

```powershell
node tests/provider-smoke.cjs --real
```

This uses background.js's actual request and response validation, sends only the public synthetic river article, reads the ignored local config only with `--real`, and reports sanitized generated labels/citations. One request succeeded in this iteration: six structural nodes and four guided passages in about three seconds. It does not verify content-script messaging or Chrome worker lifecycle. Without `--real` no credentials are read and no request is made.

The server binds 127.0.0.1:8765 and serves an explicit allowlist, never config.local.js. Stop your preview server when finished. Real Chrome manual acceptance is in the main README; fixture GitHub/wiki/docs variants are synthetic, not real-site evidence.

## Final fixture counts

| Family | Passed assertions |
| --- | ---: |
| light | 55 |
| dark | 55 |
| docs | 55 |
| wide (1920 × 800) | 55 |
| slim | 55 |
| short | 54 |
| sticky | 55 |
| table | 58 |
| fallback | 56 |
| zero | 24 |
| hierarchy | 56 |
| github (synthetic README) | 55 |
| wiki (synthetic article) | 56 |
| columns | 55 |
| cards | 54 |
| inferred | 56 |
| coverage | 57 |
| shadow (nested + slots) | 60 |
| narrow (520 × 360) | 54 |
| race | 12 |
| **Total** | **1,037** |

All twenty final scenarios passed. Assertion counts are regression evidence, not a product-quality score.
