// kit probe: measures undocumented plugin-host behaviour that the kit relies on.
// Plain JS on purpose (no build step, no kit code): a probe must not depend on what it measures.
// Run it from Plugins > Development, wait for "done", press "Copy report", paste into docs/surfaces.md.

const t0 = Date.now();
const report = {
  probe: 1,
  editorType: figma.editorType,
  mode: figma.mode,
  apiVersion: figma.apiVersion,
  earlyMessage: null,
  coexistence: {},
  resize: {},
  storage: {},
  ui: null,
  errors: [],
};

function note(err, where) {
  report.errors.push(where + ': ' + (err && err.message ? err.message : String(err)));
}

// 1. Is a message posted before the UI loads delivered (queued) or dropped?
figma.showUI(__html__, { width: 360, height: 520, themeColors: true, visible: false, title: 'kit probe' });
figma.ui.postMessage({ type: 'probe:early', sentAt: Date.now() - t0 });
let shown = false;
function show() { if (!shown) { shown = true; figma.ui.show(); } }
setTimeout(show, 1500);

// 2. Coexistence of figma.ui.on('message') and figma.ui.onmessage =.
// Every listener records hits by ping id; routing is idempotent so the probe survives either outcome.
const hits = {};
const handled = {};
function hit(name, msg) {
  if (!msg || msg.type !== 'probe:ping') return;
  (hits[msg.id] = hits[msg.id] || []).push(name);
}
function route(msg) {
  if (!msg || typeof msg.type !== 'string' || msg.type === 'probe:ping') return;
  const key = msg.type + ':' + (msg.seq || 0);
  if (handled[key]) return;
  handled[key] = true;
  onUiMessage(msg).catch(function (e) { note(e, 'route ' + msg.type); });
}
const listenerA = function (msg) { hit('on:A', msg); route(msg); };
figma.ui.on('message', listenerA);
figma.ui.onmessage = function (msg) { hit('assign:B', msg); route(msg); };

let pingSeq = 0;
function ping(label) {
  pingSeq += 1;
  const id = label + '#' + pingSeq;
  return new Promise(function (resolve) {
    pending[id] = resolve;
    figma.ui.postMessage({ type: 'probe:ping-request', id: id });
    // If a step silently removed every listener, the pong never routes; report what fired anyway.
    setTimeout(function () {
      if (pending[id]) { delete pending[id]; resolve((hits[id] || []).concat(['(timeout: pong not routed)'])); }
    }, 1500);
  });
}
const pending = {};

async function onUiMessage(msg) {
  if (msg.type === 'probe:pong') {
    // The UI sends the ping right before the pong; give listeners a tick to run.
    await wait(50);
    const resolve = pending[msg.id];
    if (resolve) { delete pending[msg.id]; resolve(hits[msg.id] || []); }
    return;
  }
  if (msg.type === 'probe:early-result') { report.earlyMessage = msg.result; return; }
  if (msg.type === 'probe:ready') { show(); runAll().catch(function (e) { note(e, 'runAll'); }); return; }
  if (msg.type === 'probe:size') { const r = sizeWaiters.shift(); if (r) r({ width: msg.width, height: msg.height }); return; }
  if (msg.type === 'probe:ui-report') { report.ui = msg.report; return; }
  if (msg.type === 'probe:close') { figma.closePlugin(); return; }
}

const sizeWaiters = [];
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// Run a window action, let the host settle, then ask the UI what size it actually got.
async function measureAfter(fn) {
  let threw = null;
  try { fn(); } catch (e) { threw = e && e.message ? e.message : String(e); }
  await wait(300);
  const size = await new Promise(function (resolve) {
    sizeWaiters.push(resolve);
    figma.ui.postMessage({ type: 'probe:measure' });
  });
  if (threw) size.threw = threw;
  return size;
}

async function runAll() {
  // Coexistence sequence.
  report.coexistence.onThenAssign = await ping('onThenAssign'); // expect on:A and assign:B?
  figma.ui.onmessage = undefined;
  report.coexistence.afterAssignUndefined = await ping('afterUndefined');
  figma.ui.onmessage = function (msg) { hit('assign:C', msg); route(msg); };
  const listenerD = function (msg) { hit('on:D', msg); route(msg); };
  figma.ui.on('message', listenerD);
  report.coexistence.assignThenOn = await ping('assignThenOn');
  figma.ui.off('message', listenerD);
  report.coexistence.afterOffD = await ping('afterOffD');
  const listenerE = function (msg) { hit('once:E', msg); route(msg); };
  figma.ui.once('message', listenerE);
  report.coexistence.once1 = await ping('once1');
  report.coexistence.once2 = await ping('once2');
  // Assigning again with no clear between: does the new handler replace C, as a property would?
  figma.ui.onmessage = function (msg) { hit('assign:F', msg); route(msg); };
  report.coexistence.assignAgain = await ping('assignAgain'); // expect on:A and assign:F, no assign:C

  // Window size behaviour on this surface.
  report.resize.initial = await measureAfter(function () {});
  report.resize.to400x300 = await measureAfter(function () { figma.ui.resize(400, 300); });
  report.resize.to10x10 = await measureAfter(function () { figma.ui.resize(10, 10); });
  report.resize.to70x0 = await measureAfter(function () { figma.ui.resize(70, 0); });
  report.resize.to4000x4000 = await measureAfter(function () { figma.ui.resize(4000, 4000); });
  report.resize.nan = await measureAfter(function () { figma.ui.resize(NaN, 300); });
  report.resize.fractional = await measureAfter(function () { figma.ui.resize(333.6, 401.4); });
  report.resize.restored = await measureAfter(function () { figma.ui.resize(360, 520); });

  // clientStorage round trip and value shapes.
  try {
    await figma.clientStorage.setAsync('kit-probe', { v: 1, width: 360, height: 520 });
    report.storage.roundTrip = await figma.clientStorage.getAsync('kit-probe');
    report.storage.keys = await figma.clientStorage.keysAsync();
    await figma.clientStorage.deleteAsync('kit-probe');
    report.storage.afterDelete = (await figma.clientStorage.getAsync('kit-probe')) === undefined ? 'undefined' : 'present';
  } catch (e) { note(e, 'storage'); }

  // Sync getters under dynamic-page: which throw?
  report.dynamicPage = {};
  try { report.dynamicPage.selectionLength = figma.currentPage.selection.length; } catch (e) { report.dynamicPage.selection = 'threw: ' + e.message; }
  try { figma.getNodeById('0:1'); report.dynamicPage.getNodeById = 'ok'; } catch (e) { report.dynamicPage.getNodeById = 'threw: ' + e.message; }
  try { report.dynamicPage.pagesCount = figma.root.children.length; } catch (e) { report.dynamicPage.rootChildren = 'threw: ' + e.message; }

  report.elapsedMs = Date.now() - t0;
  figma.ui.postMessage({ type: 'probe:report', report: report });
}
