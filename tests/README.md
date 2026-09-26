# Reading-layer QA

Tests load the real UI and source mapping with a test-only extension runtime. They do not read `config.local.js`, call Gemini, or prove Chrome content-script/service-worker behaviour.

Run from the repository directory:

```powershell
node tests/critical-reading.test.cjs
python tests/preview-server.py
```

The server binds to `127.0.0.1:8765` and serves an explicit allowlist. Stop it with Ctrl+C when finished.

| URL | Check |
| --- | --- |
| `http://127.0.0.1:8765/?view=light&autorun=1` | Light article, 21 interaction checks |
| `http://127.0.0.1:8765/?view=dark&autorun=1` | Dark host, same checks |
| `http://127.0.0.1:8765/?view=docs&autorun=1` | Wider documentation layout, same checks |
| `http://127.0.0.1:8765/narrow` | Dark article in a 520 × 360 child viewport, same checks |
| `http://127.0.0.1:8765/?view=zero&autorun=1` | Valid empty Smart/Critical responses, ten checks |
| `http://127.0.0.1:8765/?view=dark&demo=1` | Open Smart/Critical demo for visual inspection |

Each suite starts from a fresh page. Reload before rerunning; omit `autorun` to use D / ✦ / ◇ manually. The fixture's generated questions and aids are deliberately mocked, not model-quality evidence. The service-worker test separately covers response validation and runtime handling with a mocked fetch.

2026-09-26: suites passed in the Codex in-app browser, and screenshots were inspected. No unpacked-extension Chrome reload or real-site acceptance was completed: native Computer Use was stopped by URL-identification safety enforcement. Follow the main README's Chrome checklist before treating this stage as fully accepted.
