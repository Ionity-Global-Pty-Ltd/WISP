# Changelog - WISP (Aura Wisp)

Ionity (Pty) Ltd | AEDI | Policy 986 AED

## 1.2.0 - 2026-10-18

- **Case RGB sync.** WISP drives your PC lighting through the OpenRGB SDK server (fans, RAM, GPU, motherboard, strips, even monitors). *Mirror effects* makes Pulse breathe and Flow race around the LEDs, and every window switch sends a wisp sweeping through the case; *Match colour* holds the aura colour (Ionity Flow and Spectrum spread across the LEDs). Brightness, host/port and an OpenRGB profile to restore when sync stops. New **Case RGB** page with live strip preview and device list; tray toggle. Verified against a real OpenRGB server (ENE, ZOTAC RTX 3080, ViewSonic XG270QG).
- **Gradient screen aura.** The active screen now glows with a slowly turning aurora in the aura's colour family, a hairline gradient bezel, colour pools in the corners and a bloom that gathers on the side of the screen where your focused window is. Every display gets its own phase.
- **Microsoft Store ready.** `npm run dist:store` builds MSIX packages; see `docs/MICROSOFT-STORE.md`.

## 1.1.0 - 2026-10-18

- **Smoother puller.** Switching windows now glides on a smootherstep curve (no snap, no overshoot) timed to the distance travelled, and the outline dissolves into a stream of ~44 wisp particles that fly across on curved paths and re-form the new outline, led by the comet.
- **New settings app.** Sidebar navigation (Live preview, Colour, Style, Light & shape, Layers, Displays, Behaviour, About), native-looking title bar, and a realistic live preview desktop for your OS (Windows taskbar, macOS menu bar and dock, GNOME top bar) with browser, editor and terminal windows - click or drag them and the *real* aura engine follows.
- **Live focus card** shows which window and display WISP is following right now; **Displays** page draws your real monitor layout with the active screen and window glowing.
- Colour page: hex values, hue strip and live tray-icon preview. Style page: animated thumbnails.
- Aura engine refactored into `src/overlay/aura.js`, shared by the overlays and the preview.

## 1.0.0 - 2026-10-18

First release.

- Active window aura on Windows 10/11 (DWM frame bounds, per-monitor DPI), macOS (CoreGraphics, no permissions needed) and Linux X11/XWayland (EWMH frame extents).
- Active screen aura for multi-monitor setups; pointer-following fallback on pure Wayland.
- Puller: spring-animated glide between windows with a comet and arrival sparks.
- Wisps orbiting the frame; Flow style with two chasing comets.
- 12 colour presets incl. Ionity Flow brand gradient and Spectrum, plus custom colours; four styles (Aura, Pulse, Flow, Wire).
- Tray menu with live colour icon; branded settings window with live preview.
- Hide over full-screen apps, global hotkeys, start with computer, portable mode (settings beside the .exe).
- Packages: Windows NSIS x64/arm64 + portable, macOS dmg/zip arm64/x64, Linux AppImage/deb/rpm; SHA256.txt per release.
