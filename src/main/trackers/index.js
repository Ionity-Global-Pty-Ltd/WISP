'use strict';
/* WISP - picks the best active-window tracker for this platform. */

function createTracker(ctx) {
  const tries = [];
  if (process.platform === 'win32') tries.push(['win32', () => require('./win32').create(ctx)]);
  else if (process.platform === 'darwin') tries.push(['darwin', () => require('./darwin').create(ctx)]);
  else if (process.env.DISPLAY) tries.push(['x11', () => require('./linux').create(ctx)]);
  tries.push(['cursor', () => require('./cursor').create(ctx)]);

  for (const [name, make] of tries) {
    try { return make(); } catch (e) { ctx.log(`tracker ${name} unavailable: ${e.message}`); }
  }
  return null;
}

module.exports = { createTracker };
