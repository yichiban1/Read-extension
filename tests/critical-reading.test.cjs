// Service-worker contract checks. No local config, credentials, or network calls.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let listener;
let calls = 0;
let output = { items: [] };
const sandbox = {
  importScripts() {}, console, AbortController, setTimeout, clearTimeout,
  DEEPREAD_LOCAL_CONFIG: { apiKey: 'test-only-placeholder' },
  chrome: { runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(fn) { listener = fn; } }
  } },
  async fetch() {
    calls++;
    return { ok: true, json: async () => ({ candidates: [{ content: {
      parts: [{ text: JSON.stringify(output) }]
    } }] }) };
  }
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(__dirname, '..', 'background.js'), 'utf8'), sandbox);
const ids = ['deepread-source-1', 'deepread-source-2'];
const finding = { label: 'Conditions for the outcome', type: 'causal',
  sourceIds: ids, prompt: 'Consider which conditions support this outcome?' };
const validate = items => JSON.parse(JSON.stringify(sandbox.validateCriticalReadingData({ items }, ids)));
assert.deepEqual(validate([]), []);
assert.deepEqual(validate([finding]), [finding]);
assert.deepEqual(validate([{ ...finding, sourceIds: [ids[0], 'deepread-source-999'] }]), [],
  'Do not silently discard a bad citation and retain its finding');
assert.deepEqual(validate([{ ...finding, type: 'fact-check' }]), []);
assert.deepEqual(validate([{ ...finding, prompt: 'This argument is invalid.' }]), []);
assert.equal(validate([finding, finding]).length, 1);
assert.equal(validate(Array.from({ length: 5 }, (_, i) => ({ ...finding, label: `Question ${i}` }))).length, 3);
const payload = { page: { title: 'Public test article', hostname: 'localhost' },
  sources: ids.map(id => ({ id, tag: 'p', text: 'A public synthetic claim with conditions and uncertainty. '.repeat(4) })) };
const send = () => new Promise(resolve => {
  assert.equal(listener({ type: 'DEEPREAD_CRITICAL_READING', payload }, {}, resolve), true);
});
(async () => {
  assert.deepEqual(JSON.parse(JSON.stringify(await send())), { ok: true, criticalReading: { items: [] } });
  output = { items: [finding] };
  assert.equal((await send()).criticalReading.items.length, 1);
  output = { items: [{ ...finding, sourceIds: ['deepread-source-999'] }] };
  assert.equal((await send()).code, 'INVALID_PROVIDER_RESPONSE');
  output = {};
  assert.equal((await send()).code, 'INVALID_PROVIDER_RESPONSE');
  assert.equal(calls, 4);
  console.log('PASS: Critical citations, zero results, types, verdict guard, deduplication, limit, runtime responses. Network mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
