'use strict';
/*
 * WISP - colour presets, styles and default settings.
 * Ionity (Pty) Ltd | AEDI | Policy 986 AED
 *
 * Brand palette (Ionity CSS & Theme, POL-986-AED):
 *   Ionity Blue (logo)  #1858A2   Ionity Blue (web)  #3366FF
 *   Purple (primary)    #5746E3   Teal (secondary)   #00D4B8
 *   Cyan (web)          #00D2FF   Global orange      #FF8A00
 */

const PRESETS = [
  { id: 'ionity-blue',   name: 'Ionity Blue',     color: '#3366FF' },
  { id: 'ionity-cyan',   name: 'Ionity Cyan',     color: '#00D2FF' },
  { id: 'ionity-teal',   name: 'Ionity Teal',     color: '#00D4B8' },
  { id: 'ionity-purple', name: 'Ionity Purple',   color: '#5746E3' },
  { id: 'global-orange', name: 'Global Orange',   color: '#FF8A00' },
  { id: 'emerald',       name: 'Emerald',         color: '#22C55E' },
  { id: 'crimson',       name: 'Crimson',         color: '#EF4444' },
  { id: 'rose',          name: 'Rose',            color: '#EC4899' },
  { id: 'gold',          name: 'Gold',            color: '#FACC15' },
  { id: 'moonlight',     name: 'Moonlight',       color: '#E7EBF2' },
  // Special, animated colour modes
  { id: 'ionity-flow',   name: 'Ionity Flow (brand gradient)', color: '#5746E3', special: 'gradient' },
  { id: 'spectrum',      name: 'Spectrum (rainbow)',           color: '#FF3366', special: 'spectrum' }
];

const STYLES = [
  { id: 'aura',  name: 'Aura - steady glow' },
  { id: 'pulse', name: 'Pulse - breathing glow' },
  { id: 'flow',  name: 'Flow - light running the edge' },
  { id: 'wire',  name: 'Wire - crisp outline, no glow' }
];

const DEFAULTS = Object.freeze({
  version: 1,
  enabled: true,
  presetId: 'ionity-blue',
  color: '#3366FF',
  style: 'flow',
  windowAura: true,
  screenAura: true,
  wisps: true,            // particles that orbit the frame and travel between windows
  puller: true,           // the aura is pulled (spring-animated) from window to window
  thickness: 3,           // px, the crisp line
  glow: 60,               // 0..100, size of the soft halo
  intensity: 85,          // 0..100, overall opacity
  screenIntensity: 45,    // 0..100, edge aura on the active display
  speed: 50,              // 0..100, animation speed
  padding: 2,             // px gap between the window edge and the line
  radius: -1,             // -1 = auto (matches the OS window corners)
  hideOnFullscreen: true, // stay out of the way of games and video
  fps: 60,
  launchAtLogin: false,
  rgbSync: false,         // drive case RGB through the OpenRGB SDK server
  rgbMode: 'effects',     // 'match' (static aura colour) | 'effects' (mirror style + focus sweeps)
  rgbBrightness: 100,
  rgbHost: '127.0.0.1',
  rgbPort: 6742,
  rgbRestoreProfile: '',  // OpenRGB profile to load when sync stops ('' = leave the aura colour)
  hotkeyToggle: 'CommandOrControl+Alt+W',
  hotkeyCycle: 'CommandOrControl+Alt+Shift+W',
  firstRun: true
});

function presetById(id) {
  return PRESETS.find(p => p.id === id) || null;
}

function isHex(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
}

module.exports = { PRESETS, STYLES, DEFAULTS, presetById, isHex };
