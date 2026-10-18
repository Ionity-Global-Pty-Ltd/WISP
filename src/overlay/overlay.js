/*
 * WISP - aura renderer (one per display).
 * Ionity (Pty) Ltd | AEDI | Policy 986 AED
 *
 * The frame (line + glow) is DOM/CSS so the steady state costs the GPU nothing;
 * motion - the puller spring, flowing light, orbiting wisps, the comet that
 * flies from window to window - is drawn on a canvas only while something is
 * actually moving. Everything is computed in global desktop coordinates, so
 * an aura that spans two monitors (or a comet crossing between them) lines up
 * exactly across the per-display overlays.
 */
(function () {
  'use strict';
  const G = window.WispGeo;
  const $frame = document.getElementById('frame');
  const $screen = document.getElementById('screen');
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  const root = document.documentElement.style;

  // ------------------------------------------------------------------ state
  let S = {
    color: '#3366FF', special: null, style: 'flow', thickness: 3, glow: 60, intensity: 85,
    screenIntensity: 45, speed: 50, padding: 2, cornerRadius: 8, wisps: true, puller: true, fps: 60
  };
  let origin = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  let target = null;          // desired frame rect, global DIP (after padding)
  let targetId = null;
  let maximized = false;
  let cur = null;             // animated rect {x,y,width,height}
  let vel = { x: 0, y: 0, width: 0, height: 0 };
  let alpha = 0, alphaTarget = 0;
  let mode = 'follow';        // 'pull' (new window) | 'follow' (same window moving)
  let lastSeen = null, lastSeenAt = 0;
  let traveler = null;        // comet between windows
  let sparks = [];            // burst on arrival
  let motes = [];             // orbiting wisps
  let flowPhase = Math.random();
  let colorNow = S.color, color2Now = S.color;
  let sprite = null, spriteWhite = null, spriteKey = '';
  let raf = 0, lastT = 0, lastDraw = 0, dpr = window.devicePixelRatio || 1;

  // --------------------------------------------------------------- helpers
  const glowPx = () => 4 + S.glow * 0.4;                    // 4..44 px
  const speedK = () => 0.25 + (S.speed / 100) * 1.75;        // 0.25..2.0
  const view = () => ({ x: origin.x, y: origin.y, width: origin.width, height: origin.height });

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  window.addEventListener('resize', () => { resizeCanvas(); kick(); });
  resizeCanvas();

  function makeSprite(hex, core) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const [r, gg, b] = G.hexToRgb(hex);
    const lift = v => Math.round(v + (255 - v) * (core ? 0.85 : 0.45));
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${lift(r)},${lift(gg)},${lift(b)},1)`);
    grd.addColorStop(0.16, `rgba(${r},${gg},${b},.85)`);
    grd.addColorStop(0.42, `rgba(${r},${gg},${b},.28)`);
    grd.addColorStop(0.7, `rgba(${r},${gg},${b},.07)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function currentColors(now) {
    if (S.special === 'spectrum') {
      const h = (now / 1000 * 36 * speedK()) % 360;
      return [G.hslToHex(h, 92, 60), G.hslToHex((h + 60) % 360, 92, 60)];
    }
    if (S.special === 'gradient') return ['#5746E3', '#00D2FF'];
    return [S.color, S.color];
  }

  function applyColors(now) {
    const [a, b] = currentColors(now);
    if (a !== colorNow || b !== color2Now || !sprite) {
      colorNow = a; color2Now = b;
      root.setProperty('--c', a);
      root.setProperty('--c2', b);
      root.setProperty('--line-bg', S.special === 'gradient'
        ? 'linear-gradient(135deg,#5746E3 0%,#3366FF 35%,#00D2FF 70%,#00D4B8 100%)'
        : (S.special === 'spectrum' ? `linear-gradient(135deg,${a},${b})` : a));
    }
    const key = a + b;
    if (key !== spriteKey) {
      spriteKey = key;
      sprite = makeSprite(S.special === 'gradient' ? '#00D2FF' : a, false);
      spriteWhite = makeSprite(S.special === 'gradient' ? '#8A7DFF' : b, true);
    }
  }

  function applySettings(s) {
    S = Object.assign(S, s);
    const b = document.body;
    b.className = '';
    b.classList.add(S.style || 'aura');
    root.setProperty('--t', S.thickness + 'px');
    root.setProperty('--g', glowPx() + 'px');
    root.setProperty('--i', (S.intensity / 100).toFixed(3));
    root.setProperty('--si', (S.screenIntensity / 100).toFixed(3));
    root.setProperty('--sg', (30 + S.screenIntensity * 1.1) + 'px');
    root.setProperty('--breath', (3.6 / speedK()).toFixed(2) + 's');
    spriteKey = '';
    applyColors(performance.now());
    seedMotes();
    retarget(true);
    kick();
  }

  function seedMotes() {
    const n = S.wisps ? 14 : 0;
    motes = [];
    for (let i = 0; i < n; i++) {
      motes.push({
        s: Math.random(),
        v: (0.006 + Math.random() * 0.018) * (Math.random() < 0.5 ? -1 : 1),
        amp: 0.2 + Math.random() * 0.8,
        ph: Math.random() * Math.PI * 2,
        tw: 0.6 + Math.random() * 1.8,
        size: 0.5 + Math.random() * 0.9
      });
    }
  }

  // ------------------------------------------------------------ state input
  let pendingRaw = null;
  function retarget(fromSettings) {
    const raw = pendingRaw;
    if (!raw) { target = null; alphaTarget = 0; return; }
    const pad = maximized ? 0 : S.padding;
    let r = { x: raw.x - pad, y: raw.y - pad, width: raw.width + pad * 2, height: raw.height + pad * 2 };
    // keep the line visible on screen edges, on the display that owns the window
    const v = view();
    const own = G.overlapArea(r, v) >= (r.width * r.height) / 2;
    if (own) r = G.clampToView(r, v, Math.ceil(S.thickness / 2) + (maximized ? 1 : 0));
    target = r;
    alphaTarget = 1;
  }

  window.wisp.onSettings(applySettings);

  window.wisp.onState(m => {
    origin = m.origin;
    $screen.classList.toggle('on', !!m.screenActive);
    maximized = !!m.maximized;
    const prevId = targetId;
    const now = performance.now();

    if (!m.visible || !m.rect) {
      if (cur) { lastSeen = Object.assign({}, cur); lastSeenAt = now; }
      pendingRaw = null; target = null; alphaTarget = 0; targetId = m.id;
      kick();
      return;
    }

    pendingRaw = m.rect;
    targetId = m.id;
    const before = target ? Object.assign({}, target) : null;
    retarget(false);

    if (!cur) {
      // (re)appear: glide in from where the last window was, or land in place
      if (S.puller && lastSeen && now - lastSeenAt < 4000 && prevId !== m.id) {
        cur = Object.assign({}, lastSeen);
        mode = 'pull';
        launchTraveler(lastSeen, target);
      } else {
        const inflate = 18;
        cur = { x: target.x - inflate, y: target.y - inflate, width: target.width + inflate * 2, height: target.height + inflate * 2 };
        mode = 'pull';
        if (S.wisps) burst(target, 18);
      }
      vel = { x: 0, y: 0, width: 0, height: 0 };
    } else if (prevId !== m.id) {
      mode = 'pull';
      if (S.puller) launchTraveler(before || cur, target);
      else { cur = Object.assign({}, target); if (S.wisps) burst(target, 16); }
    } else {
      mode = 'follow';
    }
    kick();
  });

  // ---------------------------------------------------- comet & sparks
  function center(r) { return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }

  function launchTraveler(from, to) {
    if (!from || !to || !S.wisps) return;
    const pf = G.perimeter(from.x, from.y, from.width, from.height, S.cornerRadius);
    const pt = G.perimeter(to.x, to.y, to.width, to.height, S.cornerRadius);
    const cTo = center(to), cFrom = center(from);
    const a = pf.at(G.nearestS(pf, cTo.x, cTo.y));
    const b = pt.at(G.nearestS(pt, cFrom.x, cFrom.y));
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    // control point: bow the path sideways a little - a wisp never flies straight
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = -(b.y - a.y) / (dist || 1), ny = (b.x - a.x) / (dist || 1);
    const bow = Math.min(220, dist * 0.28) * (Math.random() < 0.5 ? -1 : 1);
    traveler = {
      a, b, c: { x: mx + nx * bow, y: my + ny * bow },
      t0: performance.now(),
      dur: Math.max(260, Math.min(700, 240 + dist * 0.35)) / Math.sqrt(speedK()),
      trail: []
    };
  }

  function burst(r, n) {
    const p = G.perimeter(r.x, r.y, r.width, r.height, S.cornerRadius);
    const now = performance.now();
    const off = Math.random();
    for (let i = 0; i < n; i++) {
      const q = p.at(off + i / n);
      const sp = 40 + Math.random() * 120;
      sparks.push({ x: q.x, y: q.y, vx: q.nx * sp + (Math.random() - .5) * 40, vy: q.ny * sp + (Math.random() - .5) * 40,
        t0: now, life: 450 + Math.random() * 450, size: 0.5 + Math.random() * 0.8 });
    }
  }

  // ------------------------------------------------------------ main loop
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }

  function needsLoop(now) {
    const moving = cur && target && (Math.abs(cur.x - target.x) + Math.abs(cur.y - target.y) +
      Math.abs(cur.width - target.width) + Math.abs(cur.height - target.height) > 0.3 ||
      Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.width) + Math.abs(vel.height) > 0.5);
    const fading = Math.abs(alpha - alphaTarget) > 0.01;
    const onHere = cur && alpha > 0.01 && G.intersects(cur, view(), glowPx() * 2);
    const ambient = onHere && (S.style === 'flow' || (S.wisps && motes.length) || S.special === 'spectrum');
    return moving || fading || traveler || sparks.length || ambient;
  }

  function step(dt, now) {
    // fade
    const fadeRate = alphaTarget > alpha ? 7 : 5;
    alpha += (alphaTarget - alpha) * Math.min(1, dt * fadeRate);
    if (alphaTarget === 0 && alpha < 0.01) { alpha = 0; if (!target) cur = null; }

    // spring the frame toward the target
    if (cur && target) {
      if (!S.puller) { cur = Object.assign({}, target); vel = { x: 0, y: 0, width: 0, height: 0 }; }
      else {
        const k = mode === 'pull' ? 120 * speedK() + 60 : 1400;
        const damp = mode === 'pull' ? 2 * Math.sqrt(k) * 0.78 : 2 * Math.sqrt(k);
        // fixed sub-steps keep the integrator stable even when frames are slow
        const n = Math.max(1, Math.ceil(dt / (1 / 480)));
        const h = dt / n;
        for (const key of ['x', 'y', 'width', 'height']) {
          let p = cur[key], v = vel[key];
          for (let i = 0; i < n; i++) { const r = G.spring(p, v, target[key], k, damp, h); p = r[0]; v = r[1]; }
          if (!Number.isFinite(p)) { p = target[key]; v = 0; }
          cur[key] = p; vel[key] = v;
        }
        if (mode === 'pull' && Math.abs(cur.x - target.x) + Math.abs(cur.y - target.y) +
            Math.abs(cur.width - target.width) + Math.abs(cur.height - target.height) < 0.6 &&
            Math.abs(vel.x) + Math.abs(vel.y) < 2) mode = 'follow';
      }
    }
    flowPhase = (flowPhase + dt * 0.11 * speedK()) % 1;
    for (const m of motes) m.s = (m.s + m.v * dt * speedK()) % 1;
  }

  function placeFrame() {
    if (!cur || alpha <= 0.001) { $frame.style.opacity = '0'; return; }
    const v = view();
    if (!G.intersects(cur, v, glowPx() * 3)) { $frame.style.opacity = '0'; return; }
    const r = maximized ? 0 : S.cornerRadius + Math.max(0, S.padding);
    root.setProperty('--r', r + 'px');
    const st = $frame.style;
    st.left = (cur.x - origin.x).toFixed(1) + 'px';
    st.top = (cur.y - origin.y).toFixed(1) + 'px';
    st.width = Math.max(0, cur.width).toFixed(1) + 'px';
    st.height = Math.max(0, cur.height).toFixed(1) + 'px';
    st.opacity = alpha.toFixed(3);
  }

  function dot(spr, x, y, size, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -origin.x * dpr, -origin.y * dpr);
    ctx.globalCompositeOperation = 'lighter';
    const g = glowPx();
    const I = S.intensity / 100;
    const base = 10 + S.thickness * 3 + g * 0.35;

    if (cur && alpha > 0.01 && G.intersects(cur, view(), g * 3)) {
      const radius = maximized ? 0 : S.cornerRadius + Math.max(0, S.padding);
      const per = G.perimeter(cur.x, cur.y, cur.width, cur.height, radius);

      // flowing light: two comets chasing each other round the edge
      if (S.style === 'flow') {
        const trailLen = Math.min(0.24, 420 / per.length);
        const N = Math.max(24, Math.min(160, Math.round(trailLen * per.length / 2.5)));
        for (const head of [flowPhase, (flowPhase + 0.5) % 1]) {
          for (let i = N; i >= 0; i--) {
            const f = i / N;
            const q = per.at(head - f * trailLen);
            const fall = (1 - f) ** 1.8;
            dot(f < 0.05 ? spriteWhite : sprite, q.x, q.y, base * (0.35 + fall * 0.95), alpha * I * (0.12 + fall * 0.55));
          }
        }
      }
      // wisps: motes drifting around the frame, breathing in and out
      if (S.wisps) {
        for (const m of motes) {
          const q = per.at(m.s);
          const wob = Math.sin(now / 1000 * m.tw + m.ph);
          const off = (0.35 + 0.65 * (wob * 0.5 + 0.5)) * g * 0.55 * m.amp;
          const tw = 0.35 + 0.65 * (Math.sin(now / 1000 * m.tw * 1.7 + m.ph * 2) * 0.5 + 0.5);
          dot(sprite, q.x + q.nx * off, q.y + q.ny * off, base * 0.55 * m.size, alpha * I * tw * 0.8);
        }
      }
    }

    // comet flying from the old window to the new one (the "puller")
    if (traveler) {
      const tr = traveler;
      const t = Math.min(1, (now - tr.t0) / tr.dur);
      const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const u = 1 - e;
      const x = u * u * tr.a.x + 2 * u * e * tr.c.x + e * e * tr.b.x;
      const y = u * u * tr.a.y + 2 * u * e * tr.c.y + e * e * tr.b.y;
      tr.trail.unshift({ x, y });
      if (tr.trail.length > 14) tr.trail.length = 14;
      const pts = tr.trail;
      const total = pts.length;
      for (let i = total - 1; i >= 0; i--) {
        const p0 = pts[i], p1 = pts[Math.max(0, i - 1)];
        const sub = 5;
        for (let k = 0; k < sub; k++) {
          const u2 = k / sub;
          const px = p0.x + (p1.x - p0.x) * u2, py = p0.y + (p1.y - p0.y) * u2;
          const f = 1 - (i - u2) / total;
          dot(i === 0 && k === 0 ? spriteWhite : sprite, px, py, base * 1.6 * (0.3 + f * 0.95), I * (0.08 + 0.6 * f * f));
        }
      }
      dot(spriteWhite, x, y, base * 2.4, I);
      if (t >= 1) {
        traveler = null;
        if (target) burst(target, 22);
      }
    }

    // sparks
    if (sparks.length) {
      const keep = [];
      for (const s of sparks) {
        const age = now - s.t0;
        if (age > s.life) continue;
        const k = age / s.life;
        const dt = age / 1000;
        const x = s.x + s.vx * dt * (1 - k * 0.5), y = s.y + s.vy * dt * (1 - k * 0.5);
        dot(sprite, x, y, base * 0.7 * s.size * (1 - k * 0.6), I * (1 - k) ** 1.4);
        keep.push(s);
      }
      sparks = keep;
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    const minGap = 1000 / Math.max(15, S.fps || 60) - 1;
    if (now - lastDraw < minGap) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
    lastT = now; lastDraw = now;

    if (S.special === 'spectrum') applyColors(now);
    step(dt, now);
    placeFrame();
    draw(now);

    if (needsLoop(now)) raf = requestAnimationFrame(frame);
    else {
      // settle: clear the effects layer once the motion is over
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  applySettings({});
})();
