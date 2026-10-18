'use strict';
/*
 * WISP - overlay windows.
 * One transparent, click-through, always-on-top window per display. Each one
 * draws only its share of the aura; together they cover every screen. They
 * can never take focus, never show in the taskbar / Alt-Tab / Mission Control,
 * and pass every mouse event to the windows underneath.
 */
const path = require('path');
const { BrowserWindow, screen } = require('electron');

class Overlays {
  constructor({ log, debug }) {
    this.log = log;
    this.debug = debug;
    this.wins = new Map(); // displayId -> { win, display, last }
    this.lastState = null;
    this.settings = null;
  }

  boundsFor(display) {
    const b = Object.assign({}, display.bounds);
    // Windows treats a top-most window that exactly covers a monitor as a
    // "full-screen app" (taskbar hides, notifications go quiet). One pixel
    // short of full height avoids that without any visible difference.
    if (process.platform === 'win32') b.height -= 1;
    return b;
  }

  create(display) {
    const b = this.boundsFor(display);
    const win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      title: 'WISP aura',
      type: process.platform === 'darwin' ? 'panel' : undefined,
      webPreferences: {
        preload: path.join(__dirname, '..', 'overlay', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        spellcheck: false
      }
    });
    win.setIgnoreMouseEvents(true, { forward: false });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      win.setHiddenInMissionControl && win.setHiddenInMissionControl(true);
    } else {
      win.setVisibleOnAllWorkspaces(true);
    }
    win.setContentProtection(false);
    win.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'), { query: { display: String(display.id) } });
    const entry = { win, display, last: '' , ready: false };
    win.webContents.once('did-finish-load', () => {
      entry.ready = true;
      win.setBounds(b);
      win.showInactive();
      if (this.settings) win.webContents.send('wisp:settings', this.settingsFor(display));
      if (this.lastState) this.pushOne(entry, this.lastState, true);
    });
    win.on('closed', () => { if (this.wins.get(display.id) === entry) this.wins.delete(display.id); });
    if (this.debug) win.webContents.on('console-message', (_e, _l, msg) => this.log(`[overlay ${display.id}] ${msg}`));
    this.wins.set(display.id, entry);
  }

  rebuild() {
    const displays = screen.getAllDisplays();
    const keep = new Set(displays.map(d => d.id));
    for (const [id, e] of this.wins) {
      if (!keep.has(id)) { e.win.destroy(); this.wins.delete(id); }
    }
    for (const d of displays) {
      const e = this.wins.get(d.id);
      if (!e) this.create(d);
      else {
        e.display = d;
        e.win.setBounds(this.boundsFor(d));
        e.last = '';
        if (this.settings) e.win.webContents.send('wisp:settings', this.settingsFor(d));
      }
    }
    if (this.lastState) this.push(this.lastState, true);
    this.log(`overlays: ${displays.length} display(s)`);
  }

  settingsFor(display) {
    return Object.assign({}, this.settings, { scaleFactor: display.scaleFactor });
  }

  setSettings(s) {
    this.settings = s;
    for (const e of this.wins.values()) {
      if (e.ready) e.win.webContents.send('wisp:settings', this.settingsFor(e.display));
      e.last = '';
    }
    if (this.lastState) this.push(this.lastState, true);
  }

  /** state: { rect (global DIP) | null, id, activeDisplayId, screenAura:boolean, maximized } */
  push(state, force) {
    this.lastState = state;
    for (const e of this.wins.values()) this.pushOne(e, state, force);
  }

  pushOne(e, state, force) {
    if (!e.ready) return;
    const b = e.display.bounds;
    const msg = {
      origin: { x: b.x, y: b.y, width: b.width, height: b.height },
      rect: state.rect,
      id: state.id || null,
      maximized: !!state.maximized,
      screenActive: !!state.screenAura && state.activeDisplayId === e.display.id,
      visible: !!state.visible
    };
    const key = JSON.stringify(msg);
    if (!force && key === e.last) return;
    e.last = key;
    e.win.webContents.send('wisp:state', msg);
  }

  /** Re-assert top-most z-order (other top-most apps can climb above us). */
  raise() {
    for (const e of this.wins.values()) {
      if (e.win.isDestroyed()) continue;
      e.win.setAlwaysOnTop(true, 'screen-saver');
    }
  }

  setVisible(v) {
    for (const e of this.wins.values()) {
      if (e.win.isDestroyed()) continue;
      if (v) e.win.showInactive(); else e.win.hide();
    }
  }

  ownIds() {
    return [...this.wins.values()].map(e => e.win.id);
  }

  destroy() {
    for (const e of this.wins.values()) if (!e.win.isDestroyed()) e.win.destroy();
    this.wins.clear();
  }
}

module.exports = { Overlays };
