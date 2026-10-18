'use strict';
/*
 * WISP - Windows active-window tracker.
 * Direct user32 / dwmapi calls through koffi (no PowerShell, no native build):
 *   GetForegroundWindow -> DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)
 * The DWM "extended frame bounds" are the visible edges of the window, without
 * the invisible resize borders and drop shadow that GetWindowRect includes on
 * Windows 10/11 - so the aura hugs the real window.
 * Coordinates come back in physical pixels and are converted to Electron DIPs.
 */
const os = require('os');

const SHELL_CLASSES = new Set([
  'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow',
  'TopLevelWindowForOverflowXamlIsland', 'Windows.UI.Core.CoreWindow',
  'XamlExplorerHostIslandWindow', 'ForegroundStaging', 'MultitaskingViewFrame',
  'TaskListThumbnailWnd', 'Shell_InputSwitchTopLevelWindow', 'LauncherTipWnd',
  'NativeHWNDHost', 'ApplicationManager_ImmersiveShellWindow'
]);
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW']);

function create({ screen, log }) {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const dwmapi = koffi.load('dwmapi.dll');

  const RECT = koffi.struct('WISP_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const HWND = koffi.pointer('WISP_HWND', koffi.opaque());

  const GetForegroundWindow = user32.func('WISP_HWND __stdcall GetForegroundWindow()');
  const GetWindowRect = user32.func('bool __stdcall GetWindowRect(WISP_HWND hWnd, _Out_ WISP_RECT *lpRect)');
  const IsIconic = user32.func('bool __stdcall IsIconic(WISP_HWND hWnd)');
  const IsZoomed = user32.func('bool __stdcall IsZoomed(WISP_HWND hWnd)');
  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(WISP_HWND hWnd)');
  const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(WISP_HWND hWnd, _Out_ uint32 *pid)');
  const GetClassNameW = user32.func('int __stdcall GetClassNameW(WISP_HWND hWnd, _Out_ void *buf, int max)');
  const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(WISP_HWND hWnd, _Out_ void *buf, int max)');
  const DwmRect = dwmapi.func('long __stdcall DwmGetWindowAttribute(WISP_HWND hwnd, uint32 attr, _Out_ WISP_RECT *out, uint32 size)');
  const DwmInt = dwmapi.func('long __stdcall DwmGetWindowAttribute(WISP_HWND hwnd, uint32 attr, _Out_ int32 *out, uint32 size)');

  const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const DWMWA_CLOAKED = 14;
  const classBuf = Buffer.alloc(512);
  const titleBuf = Buffer.alloc(1024);
  const build = Number((os.release().split('.')[2]) || 0);
  const isWin11 = build >= 22000;

  function className(h) {
    const n = GetClassNameW(h, classBuf, 256);
    return n > 0 ? classBuf.toString('utf16le', 0, n * 2) : '';
  }
  function title(h) {
    const n = GetWindowTextW(h, titleBuf, 512);
    return n > 0 ? titleBuf.toString('utf16le', 0, n * 2) : '';
  }

  function sample() {
    const h = GetForegroundWindow();
    if (!h) return { kind: 'none' };
    const id = String(koffi.address(h));
    const cls = className(h);
    if (DESKTOP_CLASSES.has(cls)) return { kind: 'desktop', id };
    if (SHELL_CLASSES.has(cls)) return { kind: 'shell', id };
    if (!IsWindowVisible(h) || IsIconic(h)) return { kind: 'none', id };

    const cloaked = [0];
    if (DwmInt(h, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0]) return { kind: 'none', id };

    const r = {};
    if (DwmRect(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0) {
      if (!GetWindowRect(h, r)) return { kind: 'none', id };
    }
    const phys = { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
    if (phys.width < 8 || phys.height < 8) return { kind: 'none', id };

    let rect = phys;
    try { rect = screen.screenToDipRect(null, phys); } catch (_) { /* older Electron: assume 1:1 */ }

    const pid = [0];
    GetWindowThreadProcessId(h, pid);
    return {
      kind: 'window', id, rect, pid: pid[0], cls,
      title: title(h),
      maximized: !!IsZoomed(h)
    };
  }

  log(`win32 tracker ready (build ${build}, ${isWin11 ? 'Windows 11' : 'Windows 10'} corners)`);
  return {
    name: 'win32',
    interval: 33,
    cornerRadius: isWin11 ? 8 : 0,
    sample,
    stop() {}
  };
}

module.exports = { create };
