/* WISP - settings window | Ionity (Pty) Ltd | AEDI | Policy 986 AED
 * The live preview on the right is a miniature desktop driven by the *real*
 * aura engine (../overlay/aura.js), so what you tune here is exactly what the
 * overlay draws on your screens. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement.style;
  const DESK = { width: 1120, height: 700 };

  let P = null;     // payload from main
  let S = null;     // settings
  let live = null;  // live focus info from main
  let scale = 0.5;

  const STYLE_INFO = {
    aura: ['Aura', 'Steady, soft glow'],
    pulse: ['Pulse', 'Breathes slowly in and out'],
    flow: ['Flow', 'Two lights race around the edge'],
    wire: ['Wire', 'A crisp line, no glow']
  };
  const PLAT_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

  // ------------------------------------------------------------ helpers
  const fmt = (k, v) => k === 'thickness' || k === 'padding' ? v + ' px'
    : k === 'radius' ? (v < 0 ? 'auto' : v + ' px') : k === 'fps' ? v + ' fps' : v + '%';
  const NUMERIC = new Set(['rgbPort']);

  function hsl(h, s = 92, l = 60) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    return ('#' + f(0) + f(8) + f(4)).toUpperCase();
  }
  function hueOf(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  const preset = () => P.presets.find(p => p.id === S.presetId);
  const special = () => { const p = preset(); return p && p.special ? p.special : null; };

  let specT = 0;
  function brandColours() {
    const sp = special();
    if (sp === 'gradient') return ['#3366FF', '#00D2FF'];
    if (sp === 'spectrum') return [hsl(specT % 360), hsl((specT + 60) % 360)];
    return [S.color, S.color];
  }
  function paintColours() {
    const [a, b] = brandColours();
    root.setProperty('--c', a);
    root.setProperty('--c2', b);
  }
  setInterval(() => { if (S && special() === 'spectrum') { specT += 5; paintColours(); } }, 80);

  // ------------------------------------------------------------ navigation
  function go(page) {
    const sec = document.querySelector(`.page[data-page="${page}"]`);
    if (!sec) return;
    $$('.page').forEach(p => p.classList.toggle('on', p === sec));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.page === page));
    $('#pageTitle').innerHTML = sec.dataset.title;
    $('#pageSub').innerHTML = sec.dataset.sub;
    $('#pages').scrollTop = 0;
    if (page === 'displays') drawDisplays();
  }
  $$('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
  const ALIAS = { welcome: 'overview', colour: 'colour', about: 'about' };

  // ------------------------------------------------------------ build controls
  function build() {
    const plat = P.platform in PLAT_NAME ? P.platform : 'other';
    document.body.classList.add('plat-' + plat);
    if (plat !== 'win32') $$('.sh .pr').forEach(e => { e.textContent = '~/WISP $'; });
    const outs = { darwin: ['darwin arch=arm64', 'WISP-' + P.version + '-arm64.dmg', 'WISP-' + P.version + '-x64.dmg'],
      linux: ['linux arch=x64', 'WISP-' + P.version + '-x86_64.AppImage', 'wisp_' + P.version + '_amd64.deb'],
      win32: ['win32 arch=x64', 'WISP-Setup-' + P.version + '-x64.exe', 'WISP-Portable-' + P.version + '-x64.exe'] }[plat] || null;
    if (outs) {
      const dims = $$('.sh .dim'), oks = $$('.sh .ok');
      dims[1].textContent = '  \u2022 packaging       platform=' + outs[0];
      oks[0].textContent = '  \u2713 ' + outs[1];
      oks[1].textContent = '  \u2713 ' + outs[2];
    }

    const sw = $('#swatches'); sw.innerHTML = '';
    const qk = $('#quickSwatches'); qk.innerHTML = '';
    for (const p of P.presets) {
      const col = p.special === 'gradient' ? '#3366FF' : p.color;
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.id = p.id; b.style.setProperty('--sc', col);
      b.innerHTML = '<span class="dot"></span><span class="nm"><b></b><small></small></span>';
      b.querySelector('b').textContent = p.name.replace(/ \(.*\)$/, '');
      b.querySelector('small').textContent = p.special === 'gradient' ? 'brand gradient' : p.special === 'spectrum' ? 'rainbow cycle' : p.color;
      b.addEventListener('click', () => set({ presetId: p.id, color: p.color }));
      sw.appendChild(b);
      const q = document.createElement('button');
      q.dataset.id = p.id; q.title = p.name; q.style.setProperty('--sc', col);
      q.addEventListener('click', () => set({ presetId: p.id, color: p.color }));
      qk.appendChild(q);
    }
    const st = $('#styles'); st.innerHTML = '';
    for (const t of P.styles) {
      const [name, hint] = STYLE_INFO[t.id] || [t.id, t.name];
      const b = document.createElement('button');
      b.className = 'stc'; b.dataset.id = t.id;
      b.innerHTML = `<div class="thumb ${t.id}"><div class="tw"></div></div><b></b><small></small>`;
      b.querySelector('b').textContent = name;
      b.querySelector('small').textContent = hint;
      b.addEventListener('click', () => set({ style: t.id }));
      st.appendChild(b);
    }
    const hue = $('#hueRow');
    hue.innerHTML = '<i></i>';
    const pickHue = e => {
      const r = hue.getBoundingClientRect();
      const h = Math.max(0, Math.min(359, ((e.clientX - r.left) / r.width) * 360));
      set({ presetId: 'custom', color: hsl(h, 90, 58) });
    };
    let dragging = false;
    hue.addEventListener('pointerdown', e => { dragging = true; hue.setPointerCapture(e.pointerId); pickHue(e); });
    hue.addEventListener('pointermove', e => { if (dragging) pickHue(e); });
    hue.addEventListener('pointerup', () => { dragging = false; });
  }

  // ------------------------------------------------------------ render
  function render() {
    const mac = P.platform === 'darwin';
    const pretty = a => (a || '').replace('CommandOrControl', mac ? 'Cmd' : 'Ctrl').replace('Alt', mac ? 'Option' : 'Alt');
    $('#ver').textContent = 'v' + P.version;
    $('#aboutVer').textContent = `v${P.version} · ${PLAT_NAME[P.platform] || P.platform} · tracker ${P.tracker} · Electron ${P.electron}${P.portable ? ' · portable' : ''}`;
    $('#k1').textContent = pretty(S.hotkeyToggle) || 'no hotkey';
    $('#k1b').textContent = pretty(S.hotkeyToggle) || 'off';
    $('#k2').textContent = pretty(S.hotkeyCycle) || 'off';

    const lal = document.querySelector('[data-k="launchAtLogin"]'); if (lal) lal.closest('.row').style.display = P.store ? 'none' : '';
    $('#enabled').checked = S.enabled;
    $('#enabledLbl').textContent = S.enabled ? 'Aura on' : 'Aura paused';
    document.body.classList.toggle('off', !S.enabled);

    $$('.swatch, #quickSwatches button').forEach(b => b.classList.toggle('on', b.dataset.id === S.presetId));
    $('#picker').value = S.color.toLowerCase();
    if (document.activeElement !== $('#hex')) $('#hex').value = S.color;
    const hi = $('#hueRow i'); if (hi) hi.style.left = (hueOf(S.color) / 360 * 100) + '%';
    $$('#styles .stc').forEach(b => b.classList.toggle('on', b.dataset.id === S.style));

    $$('[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else if (el.type === 'range') {
        if (document.activeElement !== el) el.value = S[k];
        el.style.setProperty('--fill', ((S[k] - el.min) / (el.max - el.min)) * 100 + '%');
      } else if (document.activeElement !== el) el.value = S[k] || '';
    });
    $$('[data-o]').forEach(o => { o.textContent = fmt(o.dataset.o, S[o.dataset.o]); });

    const p = preset();
    $('#stTracker').textContent = { win32: 'Windows DWM', darwin: 'macOS CoreGraphics', x11: 'X11 / EWMH', cursor: 'Pointer (Wayland)' }[P.tracker] || P.tracker;
    $('#stDisplays').textContent = `${P.displays.length} display${P.displays.length === 1 ? '' : 's'}`;
    $('#stStyle').textContent = (STYLE_INFO[S.style] || [S.style])[0];
    $('#stColour').textContent = p ? p.name.replace(/ \(.*\)$/, '') : S.color;

    if (P.trayIcon) $$('#trayIco, #trayIco2, .tray-ico').forEach(i => { i.src = P.trayIcon; });
    paintColours();
    pushPreviewSettings();
    pushPreviewState();
    drawDisplays();
    renderRgb();
  }

  // ------------------------------------------------------------ case RGB
  const STRIP = 20;
  (function () { const st = $('#rgbStrip'); st.innerHTML = '<i></i>'.repeat(STRIP); })();
  function renderRgb() {
    const r = P.rgb || { state: 'off', devices: [], profiles: [] };
    const box = $('#rgbStatus');
    box.className = 'card rgb-status ' + (S.rgbSync ? r.state : 'off');
    const leds = (r.devices || []).reduce((a, d) => a + d.leds, 0);
    const label = !S.rgbSync ? ['Off', 'Turn sync on to light the case with your aura.']
      : r.state === 'connected' ? ['Synced', `${r.devices.length} device${r.devices.length === 1 ? '' : 's'} \u00b7 ${leds} LEDs follow WISP`]
      : r.state === 'connecting' ? ['Connecting\u2026', `Looking for OpenRGB at ${S.rgbHost}:${S.rgbPort}`]
      : ['Waiting for OpenRGB', (r.error || 'Not reachable') + ` \u2014 retrying every 5 s (${S.rgbHost}:${S.rgbPort})`];
    $('#rgbState').textContent = label[0];
    $('#rgbMsg').textContent = label[1];
    $$('#rgbMode button').forEach(b => b.classList.toggle('on', b.dataset.v === S.rgbMode));
    $('#rgbDevices').innerHTML = (r.devices && r.devices.length)
      ? r.devices.map(d => `<div><span><b>${esc(d.name)}</b>${d.vendor ? ' \u00b7 ' + esc(d.vendor) : ''}</span><span>${d.leds} LED${d.leds === 1 ? '' : 's'}</span></div>`).join('')
      : `<div><span>${S.rgbSync ? 'No devices reported yet' : 'Sync is off'}</span></div>`;
    const sel = $('#rgbProfile');
    const opts = ['', ...(r.profiles || [])];
    if (S.rgbRestoreProfile && !opts.includes(S.rgbRestoreProfile)) opts.push(S.rgbRestoreProfile);
    sel.innerHTML = opts.map(o => `<option value="${esc(o)}">${o ? esc(o) : 'None \u2014 keep the aura colour'}</option>`).join('');
    sel.value = S.rgbRestoreProfile || '';
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // animated strip preview - same maths as the real sync
  let sweepAt = -1e9, lastActive = null;
  setInterval(() => {
    if (!S || !$('.page[data-page="rgb"]').classList.contains('on')) return;
    const t = performance.now() / 1000, k = 0.25 + S.speed / 100 * 1.75;
    const fx = S.rgbMode !== 'match' && S.enabled;
    const sweep = (performance.now() - sweepAt) / 650;
    const [c1, c2] = brandColours();
    const rgbOf = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = rgbOf(c1), b = rgbOf(special() === 'gradient' ? '#00D4B8' : c2);
    $$('#rgbStrip i').forEach((el, i) => {
      const u = i / (STRIP - 1);
      let c = special() === 'spectrum' ? rgbOf(hsl((t * 36 * k + u * 140) % 360)) : special() === 'gradient' ? a.map((v, j) => v + (b[j] - v) * u) : a;
      let L = 1;
      if (fx && S.style === 'pulse') L = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / (3.6 / k)));
      if (fx && S.style === 'flow') { L = 0.32; for (const h of [(t * 0.22 * k) % 1, (t * 0.22 * k + .5) % 1]) { let d = h - u; if (d < 0) d += 1; if (d < .22) L = Math.max(L, Math.pow(1 - d / .22, 1.6)); } }
      if (fx && sweep < 1.05) { const w = Math.exp(-Math.pow((u - (sweep * 1.25 - .1)) / .09, 2)); c = c.map(v => v + (255 - v) * .65 * w); L = Math.max(L, w); }
      L *= (S.rgbBrightness ?? 100) / 100 * (S.rgbSync ? 1 : 0.25);
      const col = `rgb(${Math.round(c[0] * L)},${Math.round(c[1] * L)},${Math.round(c[2] * L)})`;
      el.style.background = col;
      el.style.boxShadow = L > .35 ? `0 0 8px ${col}` : 'none';
    });
  }, 1000 / 30);

  async function set(patch) {
    Object.assign(S, patch);
    render();
    const p = await window.wisp.set(patch);
    P = p; S = p.settings;
    render();
  }

  // inputs
  $('#enabled').addEventListener('change', e => set({ enabled: e.target.checked }));
  $('#picker').addEventListener('input', e => set({ presetId: 'custom', color: e.target.value.toUpperCase() }));
  $('#hex').addEventListener('input', e => {
    let v = e.target.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) set({ presetId: 'custom', color: v.toUpperCase() });
  });
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.addEventListener('change', () => set({ [k]: el.checked }));
    else if (el.type === 'range') el.addEventListener('input', () => set({ [k]: Number(el.value) }));
    else el.addEventListener('change', () => set({ [k]: NUMERIC.has(k) ? Number(el.value) : el.value.trim() }));
  });
  $$('#rgbMode button').forEach(b => b.addEventListener('click', () => set({ rgbMode: b.dataset.v })));
  $('#rgbProfile').addEventListener('change', e => set({ rgbRestoreProfile: e.target.value }));
  $('#reset').addEventListener('click', async () => { const p = await window.wisp.reset(); P = p; S = p.settings; render(); });
  $('#reveal').addEventListener('click', () => window.wisp.revealData());

  // ============================================================ live preview
  const desk = $('#desk');
  const frameBox = $('#paneFrame');
  const aura = window.WispAura.create({
    host: $('#auraHost'),
    screenEl: $('#pScreen'),
    frameEl: $('#pFrame'),
    canvas: $('#pFx'),
    size: () => DESK,
    pixelRatio: () => (window.devicePixelRatio || 1) * Math.max(0.35, scale)
  });

  function fit() {
    const r = frameBox.getBoundingClientRect();
    scale = Math.min(r.width / DESK.width, r.height / DESK.height);
    desk.style.left = ((r.width - DESK.width * scale) / 2) + 'px';
    desk.style.top = ((r.height - DESK.height * scale) / 2) + 'px';
    desk.style.transform = `scale(${scale})`;
    aura.resize();
  }
  new ResizeObserver(fit).observe(frameBox);

  const wins = $$('.desk .win');
  const appFor = { browser: '.a1', code: '.a2', term: '.a3' };
  let active = 'code';
  let z = 10;
  let lastUser = 0;

  function rectOf(id) {
    const w = wins.find(x => x.dataset.id === id);
    return { x: w.offsetLeft, y: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight };
  }
  function activate(id, user) {
    if (user) lastUser = Date.now();
    if (id !== active) sweepAt = performance.now();
    active = id;
    for (const w of wins) {
      const on = w.dataset.id === id;
      w.classList.toggle('active', on);
      if (on) w.style.zIndex = ++z;
    }
    $$('.bar-mid .dapp').forEach(a => a.classList.remove('run'));
    const a = appFor[id] && $('.bar-mid ' + appFor[id]);
    if (a) a.classList.add('run');
    pushPreviewState();
  }

  function pushPreviewSettings() {
    if (!S) return;
    const defRadius = P.platform === 'darwin' ? 10 : 9;
    aura.setSettings(Object.assign({}, S, {
      special: special(),
      cornerRadius: S.radius >= 0 ? S.radius : defRadius
    }));
  }
  function pushPreviewState() {
    if (!S) return;
    const show = S.enabled && S.windowAura;
    aura.setState({
      origin: { x: 0, y: 0, width: DESK.width, height: DESK.height },
      rect: show ? rectOf(active) : null,
      id: active,
      maximized: false,
      screenActive: S.enabled && S.screenAura,
      visible: S.enabled
    });
  }

  // click to focus, drag the title bar to move
  for (const w of wins) {
    w.addEventListener('pointerdown', e => {
      activate(w.dataset.id, true);
      const tb = e.target.closest('.tb');
      if (!tb) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop;
      tb.setPointerCapture(e.pointerId);
      const move = ev => {
        const nx = Math.max(-w.offsetWidth + 80, Math.min(DESK.width - 80, ox + (ev.clientX - sx) / scale));
        const ny = Math.max(0, Math.min(DESK.height - 90, oy + (ev.clientY - sy) / scale));
        w.style.left = nx + 'px'; w.style.top = ny + 'px';
        lastUser = Date.now();
        pushPreviewState();
      };
      const up = () => { tb.removeEventListener('pointermove', move); tb.removeEventListener('pointerup', up); };
      tb.addEventListener('pointermove', move);
      tb.addEventListener('pointerup', up);
    });
  }
  // taskbar / dock icons focus their window
  for (const [id, sel] of Object.entries(appFor)) {
    $$(`.bar-mid ${sel}, .mac-dock ${sel}`).forEach(a => a.addEventListener('click', () => activate(id, true)));
  }

  // auto-switch demo
  const order = ['browser', 'code', 'term'];
  setInterval(() => {
    if (!$('#autoDemo').checked || Date.now() - lastUser < 8000 || document.hidden) return;
    activate(order[(order.indexOf(active) + 1) % order.length], false);
  }, 3400);

  // clock
  function tickClock() {
    const d = new Date();
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dt = d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
    $$('.desk .t').forEach(e => { e.textContent = t; });
    $$('.desk .d').forEach(e => { e.textContent = dt; });
  }
  tickClock(); setInterval(tickClock, 15000);

  // ============================================================ real desktop status
  function liveText() {
    if (!S.enabled) return ['Paused', 'Aura is paused', 'Ctrl+Alt+W to resume'];
    if (!live) return ['Following focus', ' ', ' '];
    const d = P.displays.find(x => x.id === live.activeDisplayId);
    const where = d ? `Display ${d.index}${d.primary ? ' (main)' : ''}` : '';
    if (live.kind === 'window') {
      const r = live.rect;
      return ['Following focus', live.label || 'Focused window', `${where}${r ? ` · ${Math.round(r.width)}×${Math.round(r.height)}` : ''}`];
    }
    if (live.kind === 'desktop') return ['Following focus', 'Desktop', where];
    if (live.kind === 'pointer') return ['Following pointer', 'Screen aura only', where];
    return ['Following focus', 'Taskbar / system', where];
  }
  function renderLive() {
    if (!S) return;
    const [a, b, c] = liveText();
    $('#liveState').textContent = a;
    $('#liveLabel').textContent = b;
    $('#liveMeta').textContent = c;
    drawDisplays();
  }
  window.wisp.onLive(m => { live = m; renderLive(); });

  function drawDisplays() {
    const map = $('#dmap');
    if (!P || !map || !map.offsetParent) return;
    const ds = P.displays;
    const minX = Math.min(...ds.map(d => d.bounds.x)), minY = Math.min(...ds.map(d => d.bounds.y));
    const maxX = Math.max(...ds.map(d => d.bounds.x + d.bounds.width)), maxY = Math.max(...ds.map(d => d.bounds.y + d.bounds.height));
    const W = map.clientWidth - 28, H = map.clientHeight - 28;
    const k = Math.min(W / (maxX - minX), H / (maxY - minY));
    const ox = (map.clientWidth - (maxX - minX) * k) / 2, oy = (map.clientHeight - (maxY - minY) * k) / 2;
    const px = (x, y) => [ox + (x - minX) * k, oy + (y - minY) * k];
    let html = '';
    for (const d of ds) {
      const [x, y] = px(d.bounds.x, d.bounds.y);
      const on = live && live.activeDisplayId === d.id && S.enabled;
      html += `<div class="dmon${on ? ' active' : ''}" style="left:${x + 2}px;top:${y + 2}px;width:${d.bounds.width * k - 4}px;height:${d.bounds.height * k - 4}px">${d.index}</div>`;
    }
    let win = map.querySelector('.dwin');
    map.innerHTML = html;
    if (!win) { win = document.createElement('div'); win.className = 'dwin'; }
    map.appendChild(win);
    if (live && live.rect && S.enabled && S.windowAura) {
      const [x, y] = px(live.rect.x, live.rect.y);
      Object.assign(win.style, { left: x + 'px', top: y + 'px', width: live.rect.width * k + 'px', height: live.rect.height * k + 'px', opacity: 1 });
    } else win.style.opacity = 0;
    $('#dlist').innerHTML = ds.map(d => `<div class="${live && live.activeDisplayId === d.id ? 'active' : ''}"><span><b>Display ${d.index}</b>${d.primary ? ' · main' : ''}${d.label ? ' · ' + d.label.replace(/[<>&]/g, '') : ''}</span><span>${d.bounds.width}×${d.bounds.height} · ${Math.round(d.scaleFactor * 100)}%</span></div>`).join('');
  }
  window.addEventListener('resize', drawDisplays);

  // ============================================================ boot
  window.wisp.onSettings(p => { P = p; S = p.settings; render(); renderLive(); });
  window.wisp.onGoto(sec => go(ALIAS[sec] || sec));

  window.wisp.get().then(p => {
    P = p; S = p.settings;
    build();
    fit();
    render();
    activate('code', false);
    renderLive();
    const h = location.hash.replace('#', '');
    if (h) go(ALIAS[h] || h);
  });
})();
