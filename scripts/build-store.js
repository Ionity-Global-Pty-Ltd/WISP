// WISP - build Microsoft Store (MSIX/appx) packages with the Partner Center identity.
//   set WISP_STORE_IDENTITY  = Package/Identity/Name       (e.g. IonityPtyLtd.WISP)
//   set WISP_STORE_PUBLISHER = Package/Identity/Publisher  (e.g. CN=XXXXXXXX-XXXX-...)
//   npm run dist:store            (add --test to build with placeholder identity)
// Ionity (Pty) Ltd | Policy 986 AED
const { spawnSync } = require('child_process');
const test = process.argv.includes('--test');
const id = process.env.WISP_STORE_IDENTITY || (test ? 'IonityPtyLtd.WISP' : '');
const pub = process.env.WISP_STORE_PUBLISHER || (test ? 'CN=00000000-0000-0000-0000-000000000000' : '');
if (!id || !pub) {
  console.error('Set WISP_STORE_IDENTITY and WISP_STORE_PUBLISHER from Partner Center > Product identity (see docs/MICROSOFT-STORE.md), or pass --test.');
  process.exit(1);
}
if (!/^[A-Za-z0-9.-]{3,50}$/.test(id)) { console.error('WISP_STORE_IDENTITY looks wrong: ' + id); process.exit(1); }
if (!/^CN=/.test(pub)) { console.error('WISP_STORE_PUBLISHER must start with CN=: ' + pub); process.exit(1); }
const archs = process.argv.includes('--x64-only') ? ['--x64'] : ['--x64', '--arm64'];
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron-builder', '--win', 'appx', ...archs, '--publish', 'never', `-c.appx.identityName=${id}`, `-c.appx.publisher=${pub}`],
  { stdio: 'inherit', shell: process.platform === 'win32', env: Object.assign({}, process.env, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }) });
process.exit(r.status || 0);
