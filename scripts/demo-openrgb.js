// WISP - live RGB sync demo: runs the sync engine against the local OpenRGB server
// for N seconds (flow style + focus sweeps), then hands the case back.
//   node scripts/demo-openrgb.js [seconds] [#hex] [restoreProfile]
const { RgbSync } = require('../src/main/rgb');
const secs = Number(process.argv[2]) || 8;
const rgb = new RgbSync({ log: m => console.log(m) });
rgb.apply({ enabled: true, color: process.argv[3] || '#3366FF', special: null, style: 'flow', speed: 50,
  rgbSync: true, rgbMode: 'effects', rgbBrightness: 100, rgbHost: '127.0.0.1', rgbPort: 6742, rgbRestoreProfile: process.argv[4] || '' });
const sweep = setInterval(() => rgb.focusChanged(), 2500);
setTimeout(() => {
  clearInterval(sweep);
  console.log(JSON.stringify(rgb.status()));
  rgb.apply(Object.assign({}, rgb.s, { rgbSync: false }));
  setTimeout(() => process.exit(0), 600);
}, secs * 1000);
