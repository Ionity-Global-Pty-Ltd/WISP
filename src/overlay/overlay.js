/* WISP - per-display overlay: wires the aura engine to the main process. Policy 986 AED */
(function () {
  'use strict';
  const aura = window.WispAura.create({
    host: document.body,
    screenEl: document.getElementById('screen'),
    frameEl: document.getElementById('frame'),
    canvas: document.getElementById('fx'),
    size: () => ({ width: window.innerWidth, height: window.innerHeight })
  });
  window.wisp.onSettings(s => aura.setSettings(s));
  window.wisp.onState(m => aura.setState(m));
})();
