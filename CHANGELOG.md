# Changelog - WISP (Aura Wisp)

Ionity (Pty) Ltd | AEDI | Policy 986 AED

## 1.3.0 - 2026-10-23

- **Screensaver.** After 1 minute idle (adjustable 1-60 min) the Ionity fluid backdrop pops up across every screen, one display after the other, each in its own scene: Forge Obsidian, IONITY Cobalt Plasma, Aether Singularity, Bioluminescent Abyss, Kintsugi Gold - or one scene everywhere. Moving the mouse stirs the fluid, a click or any key returns, keys 1-5 change scenes. Clock and date in the corner, IONITY mark, rendered at half resolution and 30 fps to stay cool.
- Never starts over full-screen apps, while a video, call or music is playing (Windows: Core Audio peak meter; macOS: display-sleep power assertions) or when the session is locked. It is a screensaver, not a lock.
- Built on the Ionity Interactive Fluid Backdrop; the Bioluminescent Abyss scene was retuned to deep-sea navy and teal (the original palette rendered red/green).
- New **Screensaver** settings page (scene cards, preview, dismiss mode, clock, media guard, frame rate) and tray items *Screensaver* / *Start screensaver now*. The window aura steps aside while it runs.

## 1.2.2 - 2026-10-18

- **More transparent, lighter aura.** The active-screen glow is about half as opaque at the default setting (~0.34), sits in a shallower band along the bezel, and its focus bloom is softer; the window halo is more see-through. Slide *Screen aura* / *Intensity* up for the old strength.

## 1.2.1 - 2026-10-18

- **Realistic screen borders.** The active-screen light now falls off from the bezel like real ambient light: a feathered, gaussian-blurred rounded frame (two passes for a soft tail) replaces the hard edge band - no straight lines, no corner seams, no hairline rim. The aurora colours blend through intermediate tones, and a faint dither prevents gradient banding.

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
