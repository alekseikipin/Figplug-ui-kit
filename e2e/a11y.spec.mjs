// Accessibility checks. axe-core runs every WCAG 2.0 and 2.1 A/AA rule on the gallery, on the kit
// fixture's window (useKitFixture) and on your own ui.html's window, in light, dark and FigJam,
// except 'color-contrast': the kit keeps Figma's own token colours, some of which are below AA at
// 11px, so contrast is reported instead of failed (decision and numbers: docs/accessibility.md).
// The report test computes the ratios for the token pairs the kit actually paints, from
// tokens.figma-fallback.css: the palette captured from a running plugin in Figma (tools/probe,
// 2026-10-14), so re-run it after each recapture. The demo's own error state is checked in
// e2e/demo.spec.mjs.

import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, openPreview, pluginFrame, useKitFixture } from './helpers.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const THEMES = ['light', 'dark', 'figjam'];

const axe = (page) => new AxeBuilder({ page }).withTags(TAGS).disableRules(['color-contrast']);
const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

for (const theme of THEMES) {
  test(`axe: the gallery has no WCAG 2.1 A/AA violations (${theme})`, async ({ page }) => {
    await openPreview(page, { theme });
    const { violations } = await axe(page).include('#gallery').analyze();
    expect(summary(violations)).toEqual([]);
  });

  test(`axe: the kit fixture's window has no WCAG 2.1 A/AA violations, resting and in its error state (${theme})`, async ({ page }) => {
    await useKitFixture(page);
    await openPreview(page, { theme });
    let { violations } = await axe(page).include('#live-frame').analyze();
    expect(summary(violations)).toEqual([]);
    // The error state: aria-invalid plus the help text it points at.
    await pluginFrame(page).locator('#fixture-name').evaluate((input) => input.setAttribute('aria-invalid', 'true'));
    ({ violations } = await axe(page).include('#live-frame').analyze());
    expect(summary(violations)).toEqual([]);
  });

  test(`axe: your ui.html's window has no WCAG 2.1 A/AA violations (${theme})`, async ({ page }) => {
    await openPreview(page, { theme });
    const { violations } = await axe(page).include('#live-frame').analyze();
    expect(summary(violations)).toEqual([]);
  });
}

test('axe: the whole preview page (toolbar, live panel, gallery, plugin) is clean', async ({ page }) => {
  await openPreview(page);
  const { violations } = await axe(page).analyze();
  expect(summary(violations)).toEqual([]);
});

// ---- Contrast report ---------------------------------------------------------------------------

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FALLBACK = read('../tokens.figma-fallback.css').replace(/\/\*[\s\S]*?\*\//g, '');
const UI = read('../ui.html');
const COMPONENTS = UI.slice(UI.indexOf('<style data-kit="components">'), UI.indexOf('</style>', UI.indexOf('<style data-kit="components">')));

const SELECTORS = { light: ':where(:root)', dark: ':where(:root.figma-dark)', figjam: ':where(:root[data-kit-surface="figjam"])' };
function palette(theme) {
  const tokens = new Map();
  // FigJam inherits nothing it doesn't declare, but every block declares all 174 names.
  for (const m of FALLBACK.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim() !== SELECTORS[theme]) continue;
    for (const d of m[2].matchAll(/(--figma-color-[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens.set(d[1], d[2].trim());
  }
  return tokens;
}

function parse(value) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  throw new Error(`cannot parse colour ${value}`);
}
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const channel = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
function ratio(tokens, fgName, bgName) {
  const panel = parse(tokens.get('--figma-color-bg'));
  const bg = over(parse(tokens.get(bgName)), panel); // translucent fills sit on the panel
  const fg = over(parse(tokens.get(fgName)), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// [what, foreground token, background token, WCAG AA minimum (null: not required), where the kit uses it]
const PAIRS = [
  ['Body text', 'text', 'bg', 4.5, 'body, .kit-heading, input values'],
  ['Label and help text', 'text-secondary', 'bg', 4.5, '.kit-label, .kit-help'],
  ['Input text', 'text', 'bg-secondary', 4.5, '.kit-input'],
  ['Placeholder', 'text-tertiary', 'bg-secondary', 4.5, '.kit-input::placeholder'],
  ['Error help text', 'text-danger', 'bg', 4.5, '.kit-field:has([aria-invalid]) .kit-help'],
  ['Primary button label', 'text-onbrand', 'bg-brand', 4.5, '.kit-button-primary'],
  ['Primary button, hover', 'text-onbrand', 'bg-brand-hover', 4.5, '.kit-button-primary:hover'],
  ['Danger button label', 'text-ondanger', 'bg-danger', 4.5, '.kit-button-danger'],
  ['Selected toggle label', 'text-brand', 'bg-selected', 4.5, '.kit-button[aria-pressed="true"]'],
  ['Resize grip', 'icon-secondary', 'bg', 3, '.kit-resize-handle (non-text, 1.4.11)'],
  ['Resize grip, hover / drag', 'icon', 'bg', 3, '.kit-resize-handle:hover'],
  ['Select caret, input icon', 'icon-secondary', 'bg', 3, '.kit-select::after, .kit-input-icon'],
  ['Focus ring', 'border-selected', 'bg', 3, ':focus-visible outlines (non-text)'],
  ['Error ring', 'border-danger-strong', 'bg', 3, '[aria-invalid="true"] outline'],
  // Phase 2 and 3 components.
  ['Tab, hover', 'text-secondary-hover', 'bg', 4.5, '.kit-tab:hover'],
  ['Number prefix', 'text-secondary', 'bg-secondary', 4.5, '.kit-number-prefix'],
  ['Checkbox and radio border', 'border-strong', 'bg', 3, ':is(.kit-checkbox, .kit-radio) > input (non-text, 1.4.11)'],
  ['Checked box against the panel', 'bg-brand', 'bg', 3, ':is(.kit-checkbox, .kit-radio) > input:checked (non-text)'],
  ['Tick and radio dot', 'icon-onbrand', 'bg-brand', 3, ':is(.kit-checkbox, .kit-radio) > input:checked mark (non-text)'],
  ['Selected icon button', 'icon-brand', 'bg-selected', 3, '.kit-icon-button[aria-pressed="true"], [aria-expanded="true"]'],
  ['Selected list row', 'text-onselected', 'bg-selected', 4.5, '.kit-list-row[aria-selected="true"], [aria-current="true"]'],
  ['Selected list row, meta', 'text-onselected-secondary', 'bg-selected', 4.5, '.kit-list-row-meta in a selected row'],
  ['Selected list row, icon', 'icon-onselected', 'bg-selected', 3, '.kit-list-row-icon in a selected row'],
  ['Notice text, info', 'text', 'bg-brand-tertiary', 4.5, '.kit-notice[data-kit-tone="info"]'],
  ['Notice text, success', 'text', 'bg-success-tertiary', 4.5, '.kit-notice[data-kit-tone="success"]'],
  ['Notice text, warning', 'text', 'bg-warning-tertiary', 4.5, '.kit-notice[data-kit-tone="warning"]'],
  ['Notice text, danger', 'text', 'bg-danger-tertiary', 4.5, '.kit-notice[data-kit-tone="danger"]'],
  ['Notice icon, info', 'icon-brand', 'bg-brand-tertiary', 3, '.kit-notice[data-kit-tone="info"] > .kit-icon'],
  ['Notice icon, success', 'icon-success', 'bg-success-tertiary', 3, '.kit-notice[data-kit-tone="success"] > .kit-icon'],
  ['Notice icon, warning', 'icon-warning', 'bg-warning-tertiary', 3, '.kit-notice[data-kit-tone="warning"] > .kit-icon'],
  ['Notice icon, danger', 'icon-danger', 'bg-danger-tertiary', 3, '.kit-notice[data-kit-tone="danger"] > .kit-icon'],
  ['Tooltip and toast text', 'text-oninverse', 'bg-inverse', 4.5, '.kit-tooltip, .kit-toast and its buttons'],
  ['Toast icon (no tone, info, warning)', 'icon-oninverse', 'bg-inverse', 3, '.kit-toast > .kit-icon'],
  ['Toast icon, success', 'bg-success', 'bg-inverse', 3, '.kit-toast[data-kit-tone="success"] > .kit-icon'],
  ['Toast icon, danger', 'bg-danger', 'bg-inverse', 3, '.kit-toast[data-kit-tone="danger"] > .kit-icon'],
  ['Disabled text', 'text-disabled', 'bg', null, ':disabled (exempt: inactive control)'],
  ['Disabled filled button', 'text-ondisabled', 'bg-disabled', null, 'primary/danger :disabled (exempt)'],
  ['Secondary button ring', 'border', 'bg', null, '.kit-button ring (decorative: the label identifies it)'],
  ['Input fill against the panel', 'bg-secondary', 'bg', null, '.kit-input fill (decorative)'],
];

test('contrast report: WCAG ratios of the token pairs the kit paints, per theme', async ({}, testInfo) => {
  const themes = Object.fromEntries(THEMES.map((t) => [t, palette(t)]));
  for (const t of THEMES) expect(themes[t].size, `${t} palette`).toBe(174);
  for (const [, fg, bg] of PAIRS) {
    for (const name of [fg, bg]) {
      if (name === 'bg') continue;
      expect(COMPONENTS, `ui.html's components block uses --figma-color-${name}`).toContain(`--figma-color-${name})`);
    }
  }
  const cell = (r, min) => `${r.toFixed(2)}:1${min === null ? '' : r >= min ? '' : ' (below)'}`;
  const rows = PAIRS.map(([what, fg, bg, min, where]) => {
    const values = THEMES.map((t) => cell(ratio(themes[t], `--figma-color-${fg}`, `--figma-color-${bg}`), min));
    return `| ${what} | \`${fg}\` on \`${bg}\` | ${values.join(' | ')} | ${min === null ? 'not required' : `${min}:1`} | ${where} |`;
  });
  const table = [
    '| Pair | Tokens | Light | Dark | FigJam | WCAG AA | Used by |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
  console.log(`\nContrast report (tokens.figma-fallback.css, the palette captured in Figma; 11px text counts as normal text)\n${table}\n`);
  await testInfo.attach('contrast-report.md', { body: table, contentType: 'text/markdown' });
  expect(rows).toHaveLength(PAIRS.length);
});
