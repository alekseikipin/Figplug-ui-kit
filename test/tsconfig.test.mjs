// tsconfig.json keeps code.ts DOM-free. With "skipLibCheck": true, adding "dom" to "lib" (or
// dropping "lib", whose default includes the DOM) still builds: the clash with Figma's own console
// and fetch typings sits in a .d.ts and is skipped, and document or window then type-check in
// code.ts and throw in Figma. So this test, not the build, is what notices (docs/pitfalls.md #3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(readFileSync(fileURLToPath(new URL('../tsconfig.json', import.meta.url)), 'utf8'));
const options = config.compilerOptions ?? {};

test('tsconfig.json: "lib" is exactly ["es2020"], so the DOM never reaches code.ts', () => {
  assert.deepEqual(options.lib?.map((l) => l.toLowerCase()), ['es2020'],
    'keep "lib": ["es2020"]; "Cannot find name \'document\'" in code.ts means the code belongs in ui.html');
  assert.notEqual(options.noLib, true);
});

test('tsconfig.json: Figma\'s typings load through "types", and the build reads code.ts and kit.d.ts', () => {
  assert.ok(options.types?.includes('@figma/plugin-typings'), '"types" must list "@figma/plugin-typings" (TypeScript 6 loads none by default)');
  assert.ok(!options.types?.some((t) => /^(?:node|dom)$/i.test(t)), 'no browser or Node types in code.ts');
  for (const file of ['code.ts', 'kit.d.ts']) assert.ok(config.files?.includes(file), `"files" must list ${file}`);
});
