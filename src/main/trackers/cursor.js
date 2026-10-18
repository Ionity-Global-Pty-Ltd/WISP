'use strict';
/*
 * WISP - fallback tracker. Used where no platform API can name the active
 * window (pure Wayland sessions, locked-down systems). The screen aura follows
 * the display under the pointer; the window aura stays off.
 */
function create({ screen, log }) {
  log('cursor fallback tracker active - screen aura follows the pointer');
  return {
    name: 'cursor',
    interval: 120,
    cornerRadius: 8,
    sample() {
      const p = screen.getCursorScreenPoint();
      return { kind: 'pointer', point: p };
    },
    stop() {}
  };
}
module.exports = { create };
