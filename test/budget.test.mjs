// The kit's own size budget (PLAN.md §5 item 2): the starter shell, the root ui.html with the
// kit blocks and the Create-shapes demo, stays under 64 KB (65,536 bytes) and 1,600 lines, so the
// kit plus a real plugin is still small for an agent to read whole. It is a test of the kit, not an
// audit rule: once a plugin replaces the demo its own code may take the file past it, so the two
// shell tests skip then, and the audit's `budget` warning (docs/pitfalls.md, "The size budget") only
// looks at the kit blocks (over 60 KB) and at the whole file (over 128 KB or 3,200 lines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ui = read('ui.html');
const bytes = Buffer.byteLength(ui);
const lines = ui.split('\n').length - (ui.endsWith('\n') ? 1 : 0);
const HAS_DEMO = read('code.js').includes("'create-shapes'") && ui.includes('id="count"');
const SHELL = { skip: HAS_DEMO ? false : "the starter's Create-shapes demo has been replaced by a plugin, whose code is its own budget" };

test('the starter ui.html is under 64 KB (65,536 bytes)', SHELL, () => {
  assert.ok(bytes < 65_536, `ui.html is ${bytes.toLocaleString('en')} bytes, ${(bytes - 65_535).toLocaleString('en')} over: trim the kit blocks or the demo`);
});

test('the starter ui.html is under 1,600 lines', SHELL, () => {
  assert.ok(lines < 1600, `ui.html is ${lines.toLocaleString('en')} lines, ${lines - 1599} over: trim the kit blocks or the demo`);
});

test("the three data-kit blocks stay within the audit's 60 KB, so a fresh paste never warns", () => {
  const kit = [...ui.matchAll(/<(style|script) data-kit="(?:tokens|components|runtime)">([\s\S]*?)<\/\1>/g)];
  assert.equal(kit.length, 3);
  const total = kit.reduce((n, m) => n + Buffer.byteLength(m[2]), 0);
  assert.ok(total <= 60 * 1024, `the kit blocks are ${total.toLocaleString('en')} bytes; scripts/audit.mjs warns above ${(60 * 1024).toLocaleString('en')}`);
});

// PLAN.md section 9's context metric (docs/release-checklist.md, "Success metrics"), as bytes / 4:
// a rough token estimate. Printed on every run so each release can log it. It fails only when the
// fixed instructions (AGENTS.md and the kit-ui skill) pass 15k, the reading that is met today;
// whether the starter ui.html counts too is the owner's open decision, so it is printed, not asserted.
const CONTEXT = ['AGENTS.md', '.claude/skills/kit-ui/SKILL.md', 'ui.html'];
const HAS_CONTEXT = CONTEXT.every((file) => existsSync(new URL(`../${file}`, import.meta.url)));
test('the agent context (PLAN.md section 9): AGENTS.md and the kit-ui skill stay under ~15k tokens', { skip: HAS_CONTEXT ? false : 'AGENTS.md or the kit-ui skill has been removed' }, (t) => {
  const size = Object.fromEntries(CONTEXT.map((file) => [file, Buffer.byteLength(read(file))]));
  const k = (n) => `~${(n / 4 / 1000).toFixed(1)}k tokens`;
  for (const file of CONTEXT) t.diagnostic(`${file}: ${size[file].toLocaleString('en')} bytes, ${k(size[file])}`);
  const fixed = size['AGENTS.md'] + size['.claude/skills/kit-ui/SKILL.md'];
  t.diagnostic(`AGENTS.md + the kit-ui skill: ${k(fixed)}; with ui.html: ${k(fixed + size['ui.html'])}`);
  assert.ok(fixed / 4 < 15_000, `AGENTS.md and the kit-ui skill are ${fixed.toLocaleString('en')} bytes (${k(fixed)}), over PLAN.md's 15k: move detail into docs/ and link to it`);
});

test('AGENTS.md stays under 150 lines (PLAN.md section 4, item 5)', { skip: HAS_CONTEXT ? false : 'AGENTS.md or the kit-ui skill has been removed' }, () => {
  const text = read('AGENTS.md');
  const count = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  assert.ok(count < 150, `AGENTS.md is ${count} lines; PLAN.md asks for under 150: move detail into docs/ and link to it`);
});
