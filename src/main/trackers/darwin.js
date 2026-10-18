'use strict';
/*
 * WISP - macOS active-window tracker.
 * One long-lived JavaScript-for-Automation (JXA) process asks CoreGraphics for
 * the on-screen window list and NSWorkspace for the frontmost app, and streams
 * the front window's bounds as JSON lines. Window *bounds* need no Screen
 * Recording or Accessibility permission (only titles would), so WISP works out
 * of the box. Coordinates are global points, top-left origin - exactly what
 * Electron's screen module uses.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const JXA = String.raw`
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run(argv) {
  var ms = Math.max(40, parseInt(argv[0] || '80', 10));
  var out = $.NSFileHandle.fileHandleWithStandardOutput;
  var last = '';
  var beat = 0;
  while (true) {
    var line = '{"kind":"none"}';
    try {
      var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
      var pid = app ? app.processIdentifier : -1;
      var raw = $.CGWindowListCopyWindowInfo(1 | 16, 0); // OnScreenOnly | ExcludeDesktopElements
      var list = ObjC.deepUnwrap(ObjC.castRefToObject(raw)) || [];
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if (w.kCGWindowOwnerPID !== pid || w.kCGWindowLayer !== 0) continue;
        var b = w.kCGWindowBounds;
        if (!b || b.Width < 40 || b.Height < 40) continue;
        if (w.kCGWindowAlpha !== undefined && w.kCGWindowAlpha <= 0.01) continue;
        line = JSON.stringify({ kind: 'window', id: String(w.kCGWindowNumber), pid: pid,
          app: String(w.kCGWindowOwnerName || ''),
          rect: { x: b.X, y: b.Y, width: b.Width, height: b.Height } });
        break;
      }
      if (line === '{"kind":"none"}' && app) {
        var bid = ObjC.unwrap(app.bundleIdentifier) || '';
        if (bid === 'com.apple.finder') line = '{"kind":"desktop"}';
      }
    } catch (e) {
      line = JSON.stringify({ kind: 'none', error: String(e) });
    }
    beat++;
    if (line !== last || beat % 25 === 0) {
      last = line;
      out.writeData($(line + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
    }
    delay(ms / 1000);
  }
}
`;

function create({ app, log }) {
  const file = path.join(app.getPath('temp'), 'wisp-front-window.js');
  fs.writeFileSync(file, JXA);

  let latest = { kind: 'none' };
  let child = null;
  let stopped = false;
  let restarts = 0;
  let buf = '';

  function launch() {
    child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', file, '70'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { latest = JSON.parse(line); } catch (_) { /* partial */ }
        if (latest.error) log('jxa: ' + latest.error);
      }
    });
    child.stderr.on('data', d => log('osascript: ' + String(d).trim()));
    child.on('exit', code => {
      if (stopped) return;
      latest = { kind: 'none' };
      if (restarts++ < 20) {
        log(`osascript exited (${code}), restarting`);
        setTimeout(launch, 1000);
      }
    });
  }
  launch();
  log('darwin tracker ready (JXA + CoreGraphics)');

  return {
    name: 'darwin',
    interval: 40,
    cornerRadius: 10,
    sample: () => latest,
    stop() { stopped = true; try { child && child.kill(); } catch (_) {} }
  };
}

module.exports = { create };
