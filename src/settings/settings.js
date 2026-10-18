/* WISP - settings window logic | Ionity (Pty) Ltd | Policy 986 AED */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement.style;
  let P = null;          // payload from main
  let S = null;          // settings
  let busy = false;

  const STYLE_HINTS = {
    aura: 'Steady, soft glow',
    pulse: 'Slow breathing light',
    flow: 'Light runs the edge',
    wire: 'Crisp line, no glow'
  };

  function fmt(k, v) {
    if (k === 'thickness' || k === 'padding') return v + ' px';
    if (k === 'radius') return v < 0 ? 'auto' : v + ' px';
    if (k === 'fps') return v + ' fps';
    return v + '%';
  }

  function hslHex(h) {
    const s = .92, l = .6, a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  }

  let specT = 0;
  function paintColours() {
    const preset = P.presets.find(p => p.id === S.presetId);
    const special = preset && preset.special;
    let a = S.color, b = S.color;
    if (special === 'gradient') { a = '#5746E3'; b = '#00D2FF'; }
    if (special === 'spectrum') { a = hslHex(specT % 360); b = hslHex((specT + 60) % 360); }
    root.setProperty('--c', special === 'gradient' ? '#3366FF' : a);
    root.setProperty('--c2', b);
    root.setProperty('--line-bg', special === 'gradient'
      ? 'linear-gradient(135deg,#5746E3,#3366FF 35%,#00D2FF 70%,#00D4B8)'
      : special === 'spectrum' ? `linear-gradient(135deg,${a},${b})` : a);
  }
  setInterval(() => {
    if (S && S.presetId === 'spectrum') { specT += 6; paintColours(); }
  }, 80);

  function render() {
    $('#ver').textContent = P.version;
    $('#aboutVer').textContent = 'v' + P.version;
    $('#aboutPlat').textContent = `${({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' })[P.platform] || P.platform} · tracker: ${P.tracker} · Electron ${P.electron}${P.portable ? ' · portable' : ''}`;
    const mac = P.platform === 'darwin';
    const pretty = a => (a || '').replace('CommandOrControl', mac ? 'Cmd' : 'Ctrl').replace('Alt', mac ? 'Option' : 'Alt');
    $('#k1').textContent = pretty(S.hotkeyToggle) || 'off';
    $('#k2').textContent = pretty(S.hotkeyCycle) || 'off';

    $('#enabled').checked = S.enabled;
    $('#enabledLbl').textContent = S.enabled ? 'On' : 'Paused';

    // swatches
    $$('.swatch').forEach(b => b.classList.toggle('on', b.dataset.id === S.presetId));
    $('#picker').value = S.color.toLowerCase();
    if (document.activeElement !== $('#hex')) $('#hex').value = S.color;

    $$('#styles button').forEach(b => b.classList.toggle('on', b.dataset.id === S.style));

    $$('[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else if (el.type === 'range') {
        if (document.activeElement !== el) el.value = S[k];
        const pct = ((S[k] - el.min) / (el.max - el.min)) * 100;
        el.style.setProperty('--fill', pct + '%');
      } else if (document.activeElement !== el) el.value = S[k] || '';
    });
    $$('[data-o]').forEach(o => { o.textContent = fmt(o.dataset.o, S[o.dataset.o]); });

    // preview
    paintColours();
    root.setProperty('--pt', Math.max(1, S.thickness * 0.7) + 'px');
    root.setProperty('--pg', (3 + S.glow * 0.26) + 'px');
    root.setProperty('--pi', (S.intensity / 100).toFixed(2));
    root.setProperty('--psi', (S.screenIntensity / 100).toFixed(2));
    root.setProperty('--pr', (S.radius >= 0 ? S.radius * 0.7 : 7) + 'px');
    root.setProperty('--flow', (5.5 - S.speed * 0.042).toFixed(2) + 's');
    const body = document.body;
    body.className = 's-' + S.style;
    body.classList.toggle('off', !S.enabled);
    body.classList.toggle('no-window', !S.windowAura);
    body.classList.toggle('no-screen', !S.screenAura);
    $('#pFrame').style.transition = S.puller ? '' : 'none';
  }

  function build() {
    const sw = $('#swatches');
    sw.innerHTML = '';
    for (const p of P.presets) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.dataset.id = p.id;
      b.style.setProperty('--sc', p.special === 'gradient' ? '#3366FF' : p.color);
      b.innerHTML = '<span class="dot"></span><span></span>';
      b.lastChild.textContent = p.name.replace(/ \(.*\)$/, '');
      b.title = p.special ? p.name : `${p.name} ${p.color}`;
      b.addEventListener('click', () => set({ presetId: p.id, color: p.color }));
      sw.appendChild(b);
    }
    const st = $('#styles');
    st.innerHTML = '';
    for (const t of P.styles) {
      const b = document.createElement('button');
      b.dataset.id = t.id;
      b.innerHTML = '<b></b><small></small>';
      b.firstChild.textContent = t.id[0].toUpperCase() + t.id.slice(1);
      b.lastChild.textContent = STYLE_HINTS[t.id] || t.name;
      b.addEventListener('click', () => set({ style: t.id }));
      st.appendChild(b);
    }
  }

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
    else el.addEventListener('change', () => set({ [k]: el.value.trim() }));
  });
  $('#reset').addEventListener('click', async () => { const p = await window.wisp.reset(); P = p; S = p.settings; render(); });
  $('#reveal').addEventListener('click', () => window.wisp.revealData());

  window.wisp.onSettings(p => { P = p; S = p.settings; render(); });
  window.wisp.onGoto(sec => { const el = document.getElementById(sec); if (el) el.scrollIntoView({ behavior: 'smooth' }); });

  // live preview: the aura hops between the mock windows like you switching apps
  const mocks = ['#mock1', '#mock2', '#mock3'];
  let mi = 0;
  function hop() {
    const stage = $('#stage').getBoundingClientRect();
    const m = $(mocks[mi % mocks.length]).getBoundingClientRect();
    const f = $('#pFrame').style;
    const pad = 3;
    f.left = (m.left - stage.left - pad) + 'px';
    f.top = (m.top - stage.top - pad) + 'px';
    f.width = (m.width + pad * 2) + 'px';
    f.height = (m.height + pad * 2) + 'px';
    $$('.mock').forEach((el, i) => { el.style.zIndex = i === mi % mocks.length ? 2 : 1; });
    mi++;
  }
  window.addEventListener('resize', () => { mi = Math.max(0, mi - 1); hop(); });

  window.wisp.get().then(p => {
    P = p; S = p.settings;
    build(); render();
    hop(); setInterval(hop, 2600);
    const h = location.hash.replace('#', '');
    if (h) setTimeout(() => { const el = document.getElementById(h); if (el) el.scrollIntoView(); }, 50);
  });
})();
