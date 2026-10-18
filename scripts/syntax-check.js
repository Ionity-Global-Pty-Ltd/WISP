// WISP - syntax check every JS file (CI gate). Policy 986 AED
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error('x', path.relative(root, f), '\n', String(e.stderr)); }
}
console.log(`${files.length - bad}/${files.length} files OK`);
process.exit(bad ? 1 : 0);
