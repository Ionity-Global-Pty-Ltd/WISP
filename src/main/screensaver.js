'use strict';
/*
 * WISP - screensaver.
 * After the computer has been idle for N minutes (default 1) the Ionity fluid
 * backdrop pops up across every screen, one display after the other, each in
 * its own scene. Moving the mouse stirs the fluid; a click or any key returns
 * (1-5 switch scenes). It never starts over a full-screen app, while a video
 * or call is playing, or when the session is locked - and it is only a
 * screensaver, not a lock: Windows' own lock / sleep settings are untouched.
 *
 * Ionity (Pty) Ltd | AEDI | Policy 986 AED
 */
const path = require('path');
const { execFile } = require('child_process');
const { BrowserWindow, screen, powerMonitor, ipcMain, globalShortcut } = require('electron');

const SCENES = [
  { id: 0, name: 'Forge Obsidian' },
  { id: 1, name: 'IONITY Cobalt Plasma' },
  { id: 2, name: 'Aether Singularity' },
  { id: 3, name: 'Bioluminescent Abyss' },
  { id: 4, name: 'Kintsugi Gold' }
];
const AUTO_ORDER = [1, 3, 2, 0, 4];   // what each screen shows in "a different scene per screen"

/** Is something (a video, a call, music, a presentation) going on? */
function makeMediaProbe(log) {
  if (process.platform === 'win32') {
    // something audible on the default output = a video, call or music is playing
    try {
      const peak = require('./audioPeak').create();
      return async () => { const p = await peak(700); return p != null && p > 0.01; };
    } catch (e) { log('screensaver: media probe unavailable: ' + e.message); }
  }
  if (process.platform === 'darwin') {
    return () => new Promise(res => execFile('/usr/bin/pmset', ['-g', 'assertions'], { timeout: 1500 }, (err, out) => {
      if (err) return res(false);
      const m = /PreventUserIdleDisplaySleep\s+(\d+)/.exec(out || '');
      res(!!m && Number(m[1]) > 0);
    }));
  }
  return async () => false;
}

class Screensaver {
  constructor({ log, overlays, isFullscreen }) {
    this.log = log;
    this.overlays = overlays;
    this.isFullscreen = isFullscreen || (() => false);
    this.s = null;
    this.wins = [];
    this.timer = null;
    this.armedAfter = 0;      // ignore idle until the user has been active again after an exit
    this.mediaBusy = makeMediaProbe(log);
    this.onChange = () => {};
    ipcMain.on('wisp:saver-exit', () => this.hide());
    this.watch = null;
    this.keys = [];
    this.onKeysReleased = () => {};
  }

  apply(s) {
    this.s = s;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), 2000);
  }

  get active() { return this.wins.length > 0; }

  async check() {
    const s = this.s;
    if (!s || !s.ssEnabled || this.active) return;
    const idle = powerMonitor.getSystemIdleTime();          // seconds since the last input
    if (idle < this.armedAfter) return;
    this.armedAfter = 0;
    if (idle < s.ssIdleMinutes * 60) return;
    if (powerMonitor.getSystemIdleState(1) === 'locked') return;
    if (this.isFullscreen()) return;                        // games, full-screen video, presentations
    if (s.ssRespectMedia && await this.mediaBusy()) return; // a video or call keeps the display awake
    this.show(false);
  }

  show(preview) {
    if (this.active) return;
    const s = this.s || {};
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    const primary = screen.getPrimaryDisplay().id;
    this.overlays && this.overlays.setVisible(false);
    displays.forEach((d, i) => {
      const scene = s.ssScene === 'auto' ? AUTO_ORDER[i % AUTO_ORDER.length] : Number(s.ssScene) || 0;
      const win = new BrowserWindow({
        x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
        show: false, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
        fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
        enableLargerThanScreen: true, backgroundColor: '#04060a', title: 'WISP Screensaver',
        type: process.platform === 'darwin' ? 'panel' : undefined,
        webPreferences: {
          preload: path.join(__dirname, '..', 'screensaver', 'preload.js'),
          contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false
        }
      });
      win.setAlwaysOnTop(true, 'screen-saver', 2);
      if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.loadFile(path.join(__dirname, '..', 'screensaver', 'screensaver.html'), {
        query: {
          variant: String(scene),
          delay: String(i * 180),                         // pops up screen after screen
          clock: s.ssClock === false ? '0' : '1',
          dismiss: s.ssDismiss || 'click',
          fps: String(s.ssFps || 30),
          preview: preview ? '1' : '0'
        }
      });
      win.once('ready-to-show', () => {
        win.setBounds(d.bounds);
        if (d.id === primary) { win.show(); win.focus(); } else win.showInactive();
      });
      win.on('closed', () => { this.wins = this.wins.filter(w => w !== win); if (!this.wins.length) this.restore(); });
      this.wins.push(win);
    });
    this.startWatch();
    this.log(`screensaver: on (${displays.length} screen${displays.length === 1 ? '' : 's'}${preview ? ', preview' : ''})`);
    this.onChange();
  }

  /*
   * Windows (and some Linux WMs) refuse to hand keyboard focus to a window that
   * pops up while the user is away, so keys are caught two ways: a few global
   * shortcuts while the saver is up, and the system idle counter - if it resets
   * while the pointer hasn't moved, a key was pressed somewhere.
   */
  startWatch() {
    const s = this.s || {};
    const send = n => { for (const w of this.wins) if (!w.isDestroyed()) w.webContents.send('wisp:saver-scene', n); };
    const reg = (acc, fn) => { try { if (globalShortcut.register(acc, fn)) this.keys.push(acc); } catch (_) {} };
    for (const k of ['Escape', 'Enter', 'Space', 'Backspace']) reg(k, () => this.hide());
    let sceneKeyAt = 0;
    for (let i = 1; i <= 5; i++) reg(String(i), () => { sceneKeyAt = Date.now(); send(i - 1); });
    let lastIdle = powerMonitor.getSystemIdleTime();
    let lastPt = screen.getCursorScreenPoint();
    const started = Date.now();
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      const idle = powerMonitor.getSystemIdleTime();
      const pt = screen.getCursorScreenPoint();
      const moved = pt.x !== lastPt.x || pt.y !== lastPt.y;
      const input = idle < lastIdle;                    // the idle counter dropped: there was input
      if (Date.now() - started > 800 && input && Date.now() - sceneKeyAt > 900) {
        if (s.ssDismiss === 'move' || !moved) { this.hide(); return; }   // classic: anything; stir: keys only
      }
      lastIdle = idle; lastPt = pt;
    }, 250);
  }

  stopWatch() {
    clearInterval(this.watch); this.watch = null;
    for (const k of this.keys) { try { globalShortcut.unregister(k); } catch (_) {} }
    this.keys = [];
    this.onKeysReleased();
  }

  hide() {
    this.stopWatch();
    const wins = this.wins.slice();
    this.wins = [];
    for (const w of wins) if (!w.isDestroyed()) w.destroy();
    this.restore();
  }

  restore() {
    // don't pop straight back up: wait until the user has been active and then idle again
    this.armedAfter = Math.max(5, powerMonitor.getSystemIdleTime() + 5);
    this.overlays && this.overlays.setVisible(true);
    this.onChange();
  }

  dispose() { clearInterval(this.timer); this.hide(); }
}

module.exports = { Screensaver, SCENES };
