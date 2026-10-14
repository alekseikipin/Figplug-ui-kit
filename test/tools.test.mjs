// The probe ships twice (tools/probe and tools/probe/dev-mode) because Dev Mode needs its own
// manifest. Keep the two copies identical so both measure the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

for (const file of ['code.js', 'ui.html']) {
  test(`tools/probe/dev-mode/${file} is a byte copy of tools/probe/${file}`, () => {
    assert.equal(read(`tools/probe/dev-mode/${file}`), read(`tools/probe/${file}`));
  });
}

test('the probe manifests differ only where Dev Mode needs them to', () => {
  const main = JSON.parse(read('tools/probe/manifest.json'));
  const dev = JSON.parse(read('tools/probe/dev-mode/manifest.json'));
  assert.deepEqual(dev.editorType, ['figma', 'dev']);
  assert.deepEqual(dev.capabilities, ['inspect']);
  assert.ok(!main.editorType.includes('dev'));
  assert.notEqual(main.id, dev.id);
  for (const m of [main, dev]) {
    assert.equal(m.documentAccess, 'dynamic-page');
    assert.deepEqual(m.networkAccess, { allowedDomains: ['none'] });
  }
});
