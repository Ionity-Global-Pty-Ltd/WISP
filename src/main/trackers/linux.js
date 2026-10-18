'use strict';
/*
 * WISP - Linux active-window tracker (X11 / XWayland).
 * Talks to libX11 directly through koffi: reads _NET_ACTIVE_WINDOW from the
 * root window (EWMH, every modern window manager sets it), then the client
 * geometry, adding _NET_FRAME_EXTENTS (server-side decorations) and removing
 * _GTK_FRAME_EXTENTS (client-side shadows) so the aura sits on the visible
 * edge. X errors (a window closing mid-read) are swallowed by a custom error
 * handler instead of killing the process.
 *
 * Pure Wayland sessions do not expose other apps' windows to anyone, so there
 * WISP falls back to the screen aura following the pointer (see cursor.js).
 */

function create({ screen, log }) {
  const koffi = require('koffi');
  const x11 = koffi.load('libX11.so.6');

  const ErrorHandler = koffi.proto('int WispXErrorHandler(void *display, void *event)');
  const XSetErrorHandler = x11.func('void *XSetErrorHandler(WispXErrorHandler *handler)');
  const XOpenDisplay = x11.func('void *XOpenDisplay(const char *name)');
  const XCloseDisplay = x11.func('int XCloseDisplay(void *display)');
  const XDefaultRootWindow = x11.func('unsigned long XDefaultRootWindow(void *display)');
  const XInternAtom = x11.func('unsigned long XInternAtom(void *display, const char *name, int only_if_exists)');
  const XGetWindowProperty = x11.func('int XGetWindowProperty(void *display, unsigned long w, unsigned long prop, long offset, long length, int del, unsigned long req_type, _Out_ unsigned long *actual_type, _Out_ int *actual_format, _Out_ unsigned long *nitems, _Out_ unsigned long *bytes_after, _Out_ void **data)');
  const XFree = x11.func('int XFree(void *data)');
  const XGetGeometry = x11.func('int XGetGeometry(void *display, unsigned long d, _Out_ unsigned long *root, _Out_ int *x, _Out_ int *y, _Out_ unsigned int *w, _Out_ unsigned int *h, _Out_ unsigned int *bw, _Out_ unsigned int *depth)');
  const XTranslateCoordinates = x11.func('int XTranslateCoordinates(void *display, unsigned long src, unsigned long dest, int sx, int sy, _Out_ int *dx, _Out_ int *dy, _Out_ unsigned long *child)');
  const XSync = x11.func('int XSync(void *display, int discard)');

  let xerrors = 0;
  const handler = koffi.register(() => { xerrors++; return 0; }, koffi.pointer(ErrorHandler));
  XSetErrorHandler(handler);

  const dpy = XOpenDisplay(null);
  if (!dpy) throw new Error('cannot open X display');
  const root = XDefaultRootWindow(dpy);
  const atom = name => XInternAtom(dpy, name, 0);
  const A = {
    active: atom('_NET_ACTIVE_WINDOW'),
    frame: atom('_NET_FRAME_EXTENTS'),
    gtkFrame: atom('_GTK_FRAME_EXTENTS'),
    pid: atom('_NET_WM_PID'),
    state: atom('_NET_WM_STATE'),
    hidden: atom('_NET_WM_STATE_HIDDEN'),
    fullscreen: atom('_NET_WM_STATE_FULLSCREEN'),
    maxV: atom('_NET_WM_STATE_MAXIMIZED_VERT'),
    maxH: atom('_NET_WM_STATE_MAXIMIZED_HORZ'),
    type: atom('_NET_WM_WINDOW_TYPE'),
    typeDesktop: atom('_NET_WM_WINDOW_TYPE_DESKTOP'),
    typeDock: atom('_NET_WM_WINDOW_TYPE_DOCK')
  };

  function prop32(win, a, max = 32) {
    const at = [0], af = [0], n = [0], after = [0], data = [null];
    const st = XGetWindowProperty(dpy, win, a, 0, max, 0, 0, at, af, n, after, data);
    if (st !== 0 || !data[0]) return null;
    let vals = null;
    try {
      if (af[0] === 32 && n[0] > 0) vals = koffi.decode(data[0], 'unsigned long', n[0]).map(Number);
    } finally { XFree(data[0]); }
    return vals;
  }

  function sample() {
    const before = xerrors;
    const act = prop32(root, A.active, 1);
    const win = act && act[0];
    if (!win) return { kind: 'none' };
    const id = String(win);

    const type = prop32(win, A.type) || [];
    if (type.includes(A.typeDesktop)) return { kind: 'desktop', id };
    if (type.includes(A.typeDock)) return { kind: 'shell', id };
    const state = prop32(win, A.state) || [];
    if (state.includes(A.hidden)) return { kind: 'none', id };

    const r = [0], gx = [0], gy = [0], w = [0], h = [0], bw = [0], dp = [0];
    if (!XGetGeometry(dpy, win, r, gx, gy, w, h, bw, dp)) return { kind: 'none', id };
    const ax = [0], ay = [0], child = [0];
    if (!XTranslateCoordinates(dpy, win, root, 0, 0, ax, ay, child)) return { kind: 'none', id };
    if (xerrors !== before) return { kind: 'none', id };

    let x = ax[0], y = ay[0], width = w[0], height = h[0];
    const fe = prop32(win, A.frame, 4);
    if (fe && fe.length === 4) { x -= fe[0]; y -= fe[2]; width += fe[0] + fe[1]; height += fe[2] + fe[3]; }
    const ge = prop32(win, A.gtkFrame, 4);
    if (ge && ge.length === 4) { x += ge[0]; y += ge[2]; width -= ge[0] + ge[1]; height -= ge[2] + ge[3]; }
    if (width < 8 || height < 8) return { kind: 'none', id };

    // X11 is in device pixels; Electron on X11 applies one global scale factor.
    const sf = (screen.getPrimaryDisplay().scaleFactor) || 1;
    const pid = prop32(win, A.pid, 1);
    return {
      kind: 'window', id,
      pid: pid ? pid[0] : 0,
      rect: { x: Math.round(x / sf), y: Math.round(y / sf), width: Math.round(width / sf), height: Math.round(height / sf) },
      maximized: state.includes(A.maxV) && state.includes(A.maxH),
      fullscreen: state.includes(A.fullscreen)
    };
  }

  log('linux tracker ready (libX11 / EWMH)');
  return {
    name: 'x11',
    interval: 40,
    cornerRadius: 8,
    sample() {
      try { return sample(); } catch (e) { return { kind: 'none', error: e.message }; }
    },
    stop() { try { XSync(dpy, 0); XCloseDisplay(dpy); } catch (_) {} }
  };
}

module.exports = { create };
