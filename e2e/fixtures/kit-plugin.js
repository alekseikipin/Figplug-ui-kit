// ---- Your plugin starts here ----
// The kit fixture's main thread. e2e/helpers.mjs (useKitFixture) serves it as code.js right after
// the repo's own kit:window block, cut from the real code.js, so the kit-level specs run the real
// installKitWindow against e2e/fixtures/kit-ui.html and never the starter's demo. It opens the
// window as the starter does and answers one host message, so specs can check that host messages
// pass next to the kit's.
installKitWindow({ mode: 'fit-content' });

figma.ui.on('message', (msg) => {
  if (msg && typeof msg === 'object' && msg.type === 'fixture-ping') figma.ui.postMessage({ type: 'fixture-pong', n: msg.n });
});
