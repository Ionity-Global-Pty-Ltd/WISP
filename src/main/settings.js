'use strict';
/*
 * WISP - settings store.
 * A small JSON file. In the portable Windows build it lives next to the .exe
 * (WISP-data\settings.json) so the whole app travels on a USB stick; otherwise
 * it lives in the OS user-data folder.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DEFAULTS, PRESETS, STYLES, isHex } = require('../shared/presets');

function dataDir() {
  const portable = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portable) {
    const dir = path.join(portable, 'WISP-data');
    try { fs.mkdirSync(dir, { recursive: true }); return dir; } catch (_) { /* read-only media: fall through */ }
  }
  return app.getPath('userData');
}

const clamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

function sanitize(raw) {
  const s = Object.assign({}, DEFAULTS, raw || {});
  s.enabled = !!s.enabled;
  s.windowAura = !!s.windowAura;
  s.screenAura = !!s.screenAura;
  s.wisps = !!s.wisps;
  s.puller = !!s.puller;
  s.hideOnFullscreen = !!s.hideOnFullscreen;
  s.launchAtLogin = !!s.launchAtLogin;
  s.firstRun = !!s.firstRun;
  s.rgbSync = !!s.rgbSync;
  s.ssEnabled = !!s.ssEnabled;
  s.ssClock = !!s.ssClock;
  s.ssRespectMedia = !!s.ssRespectMedia;
  s.ssIdleMinutes = Math.round(clamp(s.ssIdleMinutes, 1, 120, DEFAULTS.ssIdleMinutes));
  s.ssFps = Math.round(clamp(s.ssFps, 15, 60, DEFAULTS.ssFps));
  if (s.ssScene !== 'auto') s.ssScene = String(Math.round(clamp(s.ssScene, 0, 4, 1)));
  if (s.ssDismiss !== 'click' && s.ssDismiss !== 'move') s.ssDismiss = 'click';
  if (s.rgbMode !== 'match' && s.rgbMode !== 'effects') s.rgbMode = 'effects';
  s.rgbBrightness = clamp(s.rgbBrightness, 0, 100, DEFAULTS.rgbBrightness);
  if (typeof s.rgbRestoreProfile !== 'string') s.rgbRestoreProfile = '';
  s.rgbPort = Math.round(clamp(s.rgbPort, 1, 65535, DEFAULTS.rgbPort));
  if (typeof s.rgbHost !== 'string' || !/^[a-z0-9.\-:]{1,253}$/i.test(s.rgbHost)) s.rgbHost = DEFAULTS.rgbHost;
  if (!isHex(s.color)) s.color = DEFAULTS.color;
  s.color = s.color.toUpperCase();
  if (s.presetId !== 'custom' && !PRESETS.some(p => p.id === s.presetId)) s.presetId = 'custom';
  if (!STYLES.some(t => t.id === s.style)) s.style = DEFAULTS.style;
  s.thickness = clamp(s.thickness, 1, 16, DEFAULTS.thickness);
  s.glow = clamp(s.glow, 0, 100, DEFAULTS.glow);
  s.intensity = clamp(s.intensity, 5, 100, DEFAULTS.intensity);
  s.screenIntensity = clamp(s.screenIntensity, 0, 100, DEFAULTS.screenIntensity);
  s.speed = clamp(s.speed, 0, 100, DEFAULTS.speed);
  s.padding = clamp(s.padding, -8, 24, DEFAULTS.padding);
  s.radius = clamp(s.radius, -1, 40, DEFAULTS.radius);
  s.fps = clamp(s.fps, 15, 144, DEFAULTS.fps);
  if (typeof s.hotkeyToggle !== 'string') s.hotkeyToggle = DEFAULTS.hotkeyToggle;
  if (typeof s.hotkeyCycle !== 'string') s.hotkeyCycle = DEFAULTS.hotkeyCycle;
  return s;
}

class Settings {
  constructor() {
    this.file = path.join(dataDir(), 'settings.json');
    this.listeners = new Set();
    this.timer = null;
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) { /* first run */ }
    this.data = sanitize(raw);
  }
  get() { return Object.assign({}, this.data); }
  set(patch) {
    this.data = sanitize(Object.assign({}, this.data, patch));
    this.save();
    for (const fn of this.listeners) { try { fn(this.get()); } catch (e) { console.error(e); } }
    return this.get();
  }
  reset() { return this.set(Object.assign({}, DEFAULTS, { firstRun: false })); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }
  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('[wisp] could not save settings:', e.message); }
  }
}

module.exports = { Settings, sanitize };
