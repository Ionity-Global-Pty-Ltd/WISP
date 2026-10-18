'use strict';
/*
 * ============================================================================
 *  WISP - Aura Wisp  |  v1.x
 *  A living light that follows your focus.
 *
 *  Author : Johan Wilhelm van Antwerp
 *  Company: Ionity (Pty) Ltd - formerly Antwerp Designs - AEDI
 *  Web    : https://www.ionity.today | https://ionity.digital | ref https://www.ionity.co.za
 *  Govern : Policy 986 AED | License AED 900 | CC BY-NC-SA 4.0 where stated
 *  (c) 2018-2026 Antwerp Designs | Ionity (Pty) Ltd - All Rights Reserved - TM2
 *  Building Tomorrow, Today.
 * ============================================================================
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, screen, ipcMain, shell,
  globalShortcut, nativeTheme, powerMonitor, Notification, dialog
} = require('electron');

const { Settings } = require('./settings');
const { Overlays } = require('./overlays');
const { createTracker } = require('./trackers');
const { trayImage } = require('./trayIcon');
const { RgbSync } = require('./rgb');
const { PRESETS, STYLES, presetById } = require('../shared/presets');

const DEBUG = process.argv.includes('--wisp-debug') || process.env.WISP_DEBUG === '1';
const log = (...a) => { if (DEBUG || /error|unavailable|fallback/i.test(a.join(' '))) console.log('[wisp]', ...a); };

// ---------------------------------------------------------------- platform prep
if (process.platform === 'linux') {
  // Overlays must be positioned globally and kept on top: that needs X11
  // (XWayland on Wayland desktops). Transparent visuals for the aura.
  if (!process.argv.some(a => a.startsWith('--ozone-platform'))) app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('enable-transparent-visuals');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setAppUserModelId('com.ionity.wisp');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let settings, overlays, tracker, tray, settingsWin = null, rgb = null;
let lastFocusId = null;
let tickTimer = null, raiseTimer = null, lastTrackerError = '';
const VERSION = app.getVersion();

// ------------------------------------------------------------------ geometry
const covers = (r, b, tol = 2) => !!r && !!b &&
  r.x <= b.x + tol && r.y <= b.y + tol &&
  r.x + r.width >= b.x + b.width - tol && r.y + r.height >= b.y + b.height - tol;

function computeState(info, s) {
  let rect = null;
  let display;
  if (info && info.kind === 'window' && info.rect) {
    rect = info.rect;
    display = screen.getDisplayMatching(rect);
  } else if (info && info.kind === 'pointer' && info.point) {
    display = screen.getDisplayNearestPoint(info.point);
  } else {
    display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }
  const fullscreen = !!rect && (info.fullscreen || covers(rect, display.bounds));
  const hide = fullscreen && s.hideOnFullscreen;
  const on = s.enabled && !hide;
  return {
    visible: on,
    rect: on && s.windowAura && rect ? rect : null,
    id: info && info.id,
    maximized: !!rect && (info.maximized || covers(rect, display.workArea, 4)),
    activeDisplayId: display.id,
    screenAura: on && s.screenAura,
    title: info && info.title,
    kind: info ? info.kind : 'none'
  };
}

// --------------------------------------------------------------------- engine
let lastLogged = '';
function tick() {
  if (!tracker || !overlays) return;
  let info;
  try { info = tracker.sample(); } catch (e) {
    if (e.message !== lastTrackerError) { lastTrackerError = e.message; log('tracker error: ' + e.message); }
    info = { kind: 'none' };
  }
  const state = computeState(info, settings.data);
  if (info && info.kind === 'window' && info.id !== lastFocusId) {
    if (lastFocusId !== null && rgb) rgb.focusChanged();
    lastFocusId = info.id;
  }
  if (DEBUG) {
    const k = JSON.stringify([info.kind, info.id, state.rect]);
    if (k !== lastLogged) { lastLogged = k; log('active', info.kind, info.id || '', JSON.stringify(state.rect), info.title || info.app || ''); }
  }
  overlays.push(state);
  pushLive(info, state);
}

// live status for the settings window: which window / display has focus right now
let lastLive = '', lastLiveAt = 0;
function pushLive(info, state) {
  if (!settingsWin || settingsWin.isDestroyed() || !settingsWin.isVisible()) return;
  const now = Date.now();
  if (now - lastLiveAt < 200) return;
  const msg = {
    kind: info ? info.kind : 'none',
    rect: info && info.kind === 'window' ? info.rect : null,
    label: info ? (info.title || info.app || '') : '',
    activeDisplayId: state.activeDisplayId,
    visible: state.visible
  };
  const key = JSON.stringify(msg);
  if (key === lastLive) return;
  lastLive = key; lastLiveAt = now;
  settingsWin.webContents.send('wisp:live', msg);
}

function displaysPayload() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, index: i + 1, bounds: d.bounds, scaleFactor: d.scaleFactor,
    primary: d.id === primary, label: d.label || ''
  }));
}

function startEngine() {
  stopEngine();
  const ms = (tracker && tracker.interval) || 50;
  tickTimer = setInterval(tick, ms);
  raiseTimer = setInterval(() => overlays && overlays.raise(), 3000);
  tick();
}
function stopEngine() {
  clearInterval(tickTimer); clearInterval(raiseTimer);
  tickTimer = raiseTimer = null;
}

// ---------------------------------------------------------- settings helpers
function effectiveSettings() {
  const s = settings.get();
  const p = presetById(s.presetId);
  return Object.assign(s, {
    special: p && p.special ? p.special : null,
    cornerRadius: s.radius >= 0 ? s.radius : ((tracker && tracker.cornerRadius) || 8),
    platform: process.platform
  });
}

function applySettings() {
  const eff = effectiveSettings();
  overlays.setSettings(eff);
  if (rgb) rgb.apply(eff);
  updateTray();
  registerHotkeys();
  applyLoginItem();
  broadcastToSettings();
}

function setPreset(id) {
  const p = presetById(id);
  if (p) settings.set({ presetId: p.id, color: p.color });
}

function cyclePreset() {
  const i = PRESETS.findIndex(p => p.id === settings.data.presetId);
  setPreset(PRESETS[(i + 1) % PRESETS.length].id);
}

// --------------------------------------------------------------------- hotkeys
let registered = [];
function registerHotkeys() {
  const want = [settings.data.hotkeyToggle, settings.data.hotkeyCycle].join('|');
  if (registered.join('|') === want) return;
  globalShortcut.unregisterAll();
  registered = [];
  const reg = (acc, fn) => {
    if (!acc) return;
    try { if (globalShortcut.register(acc, fn)) registered.push(acc); else log('hotkey unavailable: ' + acc); }
    catch (e) { log('hotkey error: ' + acc + ' ' + e.message); }
  };
  reg(settings.data.hotkeyToggle, () => settings.set({ enabled: !settings.data.enabled }));
  reg(settings.data.hotkeyCycle, cyclePreset);
  registered = [settings.data.hotkeyToggle, settings.data.hotkeyCycle];
}

// ------------------------------------------------------------- launch at login
function applyLoginItem() {
  const want = settings.data.launchAtLogin;
  try {
    if (process.platform === 'linux') {
      const dir = path.join(os.homedir(), '.config', 'autostart');
      const file = path.join(dir, 'wisp.desktop');
      if (want) {
        const exec = process.env.APPIMAGE || process.execPath;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, [
          '[Desktop Entry]', 'Type=Application', 'Name=WISP',
          'Comment=Aura Wisp by Ionity - glow around the active window',
          `Exec="${exec}" --hidden`, 'Icon=wisp', 'X-GNOME-Autostart-enabled=true', 'Terminal=false', ''
        ].join('\n'));
      } else if (fs.existsSync(file)) fs.unlinkSync(file);
      return;
    }
    if (!app.isPackaged) return; // never register the dev electron binary
    if (process.windowsStore) return; // MSIX: Windows manages start-up apps (Settings > Apps > Startup)
    const opts = { openAtLogin: want, openAsHidden: true, args: ['--hidden'] };
    if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
    app.setLoginItemSettings(opts);
  } catch (e) { log('login item error: ' + e.message); }
}

// ------------------------------------------------------------------------ tray
function trayTooltip() {
  const s = settings.data;
  const p = presetById(s.presetId);
  return `WISP ${VERSION} - ${s.enabled ? 'on' : 'paused'} - ${p ? p.name : s.color}`;
}

function updateTray() {
  if (!tray) return;
  const s = settings.data;
  const p = presetById(s.presetId);
  tray.setImage(trayImage({ color: s.color, special: p && p.special, enabled: s.enabled }));
  tray.setToolTip(trayTooltip());
  tray.setContextMenu(buildMenu());
}

function buildMenu() {
  const s = settings.data;
  const check = (label, key, extra = {}) => Object.assign({
    label, type: 'checkbox', checked: !!s[key], click: () => settings.set({ [key]: !s[key] })
  }, extra);
  return Menu.buildFromTemplate([
    { label: `WISP ${VERSION}  -  Aura Wisp by Ionity`, enabled: false },
    { type: 'separator' },
    { label: s.enabled ? 'Pause aura' : 'Resume aura', accelerator: s.hotkeyToggle, click: () => settings.set({ enabled: !s.enabled }) },
    { type: 'separator' },
    {
      label: 'Colour',
      submenu: [
        ...PRESETS.map(p => ({ label: p.name, type: 'radio', checked: s.presetId === p.id, click: () => setPreset(p.id) })),
        { type: 'separator' },
        { label: s.presetId === 'custom' ? `Custom  ${s.color}` : 'Custom colour...', type: 'radio', checked: s.presetId === 'custom', click: () => openSettings('colour') },
        { label: 'Next colour', accelerator: s.hotkeyCycle, click: cyclePreset }
      ]
    },
    {
      label: 'Style',
      submenu: STYLES.map(t => ({ label: t.name, type: 'radio', checked: s.style === t.id, click: () => settings.set({ style: t.id }) }))
    },
    {
      label: 'Glow',
      submenu: [['Subtle', 25], ['Soft', 45], ['Balanced', 60], ['Bright', 80], ['Blazing', 100]].map(([n, v]) => ({
        label: n, type: 'radio', checked: Math.abs(s.glow - v) < 8, click: () => settings.set({ glow: v })
      }))
    },
    {
      label: 'Thickness',
      submenu: [1, 2, 3, 4, 6, 8, 12].map(v => ({ label: `${v} px`, type: 'radio', checked: s.thickness === v, click: () => settings.set({ thickness: v }) }))
    },
    { type: 'separator' },
    check('Active window aura', 'windowAura'),
    check('Active screen aura', 'screenAura'),
    check('Wisps (orbiting light)', 'wisps'),
    check('Puller (glide between windows)', 'puller'),
    check('Hide over full-screen apps', 'hideOnFullscreen'),
    check('Sync case RGB (OpenRGB)', 'rgbSync'),
    { type: 'separator' },
    { label: 'Settings...', click: () => openSettings() },
    check('Start with my computer', 'launchAtLogin'),
    { type: 'separator' },
    { label: 'About WISP', click: () => openSettings('about') },
    { label: 'ionity.digital', click: () => shell.openExternal('https://ionity.digital/#wisp') },
    { label: 'Source on GitHub', click: () => shell.openExternal('https://github.com/Ionity-Global-Pty-Ltd/WISP') },
    { type: 'separator' },
    { label: 'Quit WISP', click: () => app.quit() }
  ]);
}

function createTray() {
  const s = settings.data;
  const p = presetById(s.presetId);
  tray = new Tray(trayImage({ color: s.color, special: p && p.special, enabled: s.enabled }));
  tray.setToolTip(trayTooltip());
  tray.setContextMenu(buildMenu());
  if (process.platform === 'win32') {
    tray.on('click', () => openSettings());
    tray.on('double-click', () => settings.set({ enabled: !settings.data.enabled }));
  }
}

// ------------------------------------------------------------ settings window
function openSettings(section) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (section) settingsWin.webContents.send('wisp:goto', section);
    settingsWin.show(); settingsWin.focus();
    return;
  }
  const chrome = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } }
    : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0B0D12', symbolColor: '#C9D0DD', height: 46 } };
  settingsWin = new BrowserWindow(Object.assign({
    width: 1240, height: 820, minWidth: 980, minHeight: 640,
    show: false,
    title: 'WISP - Settings',
    backgroundColor: '#0B0D12',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'settings', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  }, chrome));
  settingsWin.removeMenu();
  settingsWin.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'), { hash: section || '' });
  settingsWin.once('ready-to-show', () => { settingsWin.show(); if (process.platform === 'darwin') app.focus({ steal: true }); });
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  settingsWin.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
  });
}

function settingsPayload() {
  return {
    settings: settings.get(),
    presets: PRESETS,
    styles: STYLES,
    version: VERSION,
    platform: process.platform,
    tracker: tracker ? tracker.name : 'none',
    electron: process.versions.electron,
    dataFile: settings.file,
    displays: displaysPayload(),
    trayIcon: trayIconData(),
    rgb: rgb ? rgb.status() : { state: 'off', devices: [] },
    portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
    store: !!process.windowsStore
  };
}

function broadcastToSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('wisp:settings', settingsPayload());
}

function trayIconData() {
  const s = settings.data;
  const p = presetById(s.presetId);
  try { return trayImage({ color: s.color, special: p && p.special, enabled: s.enabled }).toDataURL({ scaleFactor: 2 }); }
  catch (_) { return ''; }
}

ipcMain.handle('wisp:get', () => settingsPayload());
ipcMain.handle('wisp:set', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return settingsPayload();
  const allowed = ['enabled', 'presetId', 'color', 'style', 'windowAura', 'screenAura', 'wisps', 'puller', 'thickness',
    'glow', 'intensity', 'screenIntensity', 'speed', 'padding', 'radius', 'hideOnFullscreen', 'fps', 'launchAtLogin',
    'hotkeyToggle', 'hotkeyCycle', 'rgbSync', 'rgbMode', 'rgbBrightness', 'rgbHost', 'rgbPort', 'rgbRestoreProfile'];
  const clean = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  if (clean.presetId && clean.presetId !== 'custom') {
    const p = presetById(clean.presetId);
    if (p && !('color' in clean)) clean.color = p.color;
  }
  settings.set(clean);
  return settingsPayload();
});
ipcMain.handle('wisp:reset', () => { settings.reset(); return settingsPayload(); });
ipcMain.handle('wisp:open', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\/[a-z0-9.-]+(\/|$)/i.test(url)) shell.openExternal(url);
});
ipcMain.handle('wisp:reveal-data', () => shell.showItemInFolder(settings.file));

// ------------------------------------------------------------------- lifecycle
app.on('second-instance', () => openSettings());
app.on('window-all-closed', e => { /* tray app: keep running */ });

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  nativeTheme.themeSource = 'dark';

  settings = new Settings();
  overlays = new Overlays({ log, debug: DEBUG });

  // command-line conveniences:  --color=#00D2FF  --style=pulse  --paused
  const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
  const patch = {};
  if (arg('color') && /^#?[0-9a-f]{6}$/i.test(arg('color'))) { patch.color = '#' + arg('color').replace('#', ''); patch.presetId = 'custom'; }
  if (arg('preset') && presetById(arg('preset'))) { patch.presetId = arg('preset'); patch.color = presetById(arg('preset')).color; }
  if (arg('style')) patch.style = arg('style');
  if (process.argv.includes('--paused')) patch.enabled = false;
  if (Object.keys(patch).length) settings.set(patch);

  tracker = createTracker({ app, screen, log });
  rgb = new RgbSync({ log });
  rgb.onStatus = () => { broadcastToSettings(); };
  overlays.settings = effectiveSettings();
  overlays.rebuild();
  createTray();
  applySettings();
  settings.onChange(applySettings);

  let rebuildT = null;
  const rebuildSoon = () => { clearTimeout(rebuildT); rebuildT = setTimeout(() => { overlays.rebuild(); broadcastToSettings(); }, 400); };
  screen.on('display-added', rebuildSoon);
  screen.on('display-removed', rebuildSoon);
  screen.on('display-metrics-changed', rebuildSoon);
  powerMonitor.on('resume', rebuildSoon);
  powerMonitor.on('unlock-screen', rebuildSoon);

  startEngine();

  if (settings.data.firstRun && !process.argv.includes('--hidden')) {
    settings.set({ firstRun: false });
    openSettings('welcome');
    if (Notification.isSupported()) {
      new Notification({
        title: 'WISP is running',
        body: 'Your aura lives in the tray. Ctrl+Alt+W pauses it; Ctrl+Alt+Shift+W cycles colours.',
        silent: true
      }).show();
    }
  }
  log(`WISP ${VERSION} ready - tracker: ${tracker ? tracker.name : 'none'} - data: ${settings.file}`);
});

app.on('will-quit', () => {
  stopEngine();
  globalShortcut.unregisterAll();
  try { tracker && tracker.stop(); } catch (_) {}
  try { rgb && rgb.dispose(); } catch (_) {}
  try { settings && settings.flush(); } catch (_) {}
  try { overlays && overlays.destroy(); } catch (_) {}
});

let shownError = false;
process.on('uncaughtException', e => {
  console.error('[wisp] uncaught', e);
  if (shownError) return;
  shownError = true;
  try { dialog.showErrorBox('WISP hit a problem', String(e && e.stack || e) + '\n\nPlease report it at https://github.com/Ionity-Global-Pty-Ltd/WISP/issues'); } catch (_) {}
});
