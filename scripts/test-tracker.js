// WISP - exercise the platform tracker outside Electron (CI + field diagnostics).
//   node scripts/test-tracker.js [samples] [--strict]
// --strict fails when the native tracker cannot load or reports an error.
// Ionity (Pty) Ltd | Policy 986 AED
const os = require('os');
const { createTracker } = require('../src/main/trackers');
const strict = process.argv.includes('--strict');
const count = Number(process.argv.find(a => /^\d+$/.test(a)) || 6);
const ctx = {
  screen: {
    screenToDipRect: (_w, r) => r,
    getPrimaryDisplay: () => ({ scaleFactor: 1 }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 })
  },
  app: { getPath: () => os.tmpdir() },
  log: m => console.log('[tracker]', m)
};
const t = createTracker(ctx);
if (!t) { console.error('no tracker'); process.exit(1); }
console.log('tracker:', t.name, 'interval', t.interval, 'corner', t.cornerRadius);
if (strict && t.name === 'cursor') { console.error('native tracker unavailable'); process.exit(1); }
let n = 0, errors = 0, seen = 0;
const iv = setInterval(() => {
  const s = t.sample();
  if (s.error) errors++;
  if (s.kind === 'window') seen++;
  console.log(JSON.stringify(s));
  if (++n >= count) {
    clearInterval(iv); t.stop();
    console.log(`samples=${n} windows=${seen} errors=${errors}`);
    process.exit(strict && errors ? 1 : 0);
  }
}, 500);
