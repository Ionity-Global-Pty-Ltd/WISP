'use strict';
/*
 * WISP - case RGB sync through the OpenRGB SDK (TCP, default 127.0.0.1:6742).
 * OpenRGB drives almost every RGB ecosystem (ASUS Aura, MSI Mystic Light,
 * Gigabyte RGB Fusion, Corsair, Razer, NZXT, Lian Li, G.Skill/Kingston RAM,
 * ARGB headers ...), so one small client lights the whole case. FANZi IO-nity
 * already runs the OpenRGB SDK server on Ionity machines.
 *
 * Protocol (little-endian): header 'ORGB' | u32 device | u32 packet id | u32 size.
 * We speak protocol version 3 so controller data has a fixed, known layout.
 *
 * Ionity (Pty) Ltd | AEDI | Policy 986 AED
 */
const net = require('net');

const PKT = {
  REQUEST_CONTROLLER_COUNT: 0,
  REQUEST_CONTROLLER_DATA: 1,
  REQUEST_PROTOCOL_VERSION: 40,
  SET_CLIENT_NAME: 50,
  DEVICE_LIST_UPDATED: 100,
  REQUEST_PROFILE_LIST: 150,
  REQUEST_LOAD_PROFILE: 152,
  UPDATELEDS: 1050,
  SETCUSTOMMODE: 1100
};
const PROTOCOL = 3;

function header(device, id, size) {
  const b = Buffer.alloc(16);
  b.write('ORGB', 0, 'ascii');
  b.writeUInt32LE(device >>> 0, 4);
  b.writeUInt32LE(id >>> 0, 8);
  b.writeUInt32LE(size >>> 0, 12);
  return b;
}

/** Parse just enough of a v3 controller blob to know its name and LED count. */
function parseController(buf, proto) {
  let o = 4; // data_size
  const u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; };
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const str = () => { const n = u16(); const s = buf.toString('utf8', o, o + Math.max(0, n - 1)); o += n; return s; };
  const type = i32();
  const name = str();
  const vendor = proto >= 1 ? str() : '';
  str(); str(); str(); str(); // description, version, serial, location
  const numModes = u16();
  i32(); // active mode
  for (let m = 0; m < numModes; m++) {
    str(); i32(); u32(); u32(); u32();           // name, value, flags, speed min/max
    if (proto >= 3) { u32(); u32(); }            // brightness min/max
    u32(); u32(); u32();                         // colors min/max, speed
    if (proto >= 3) u32();                       // brightness
    u32(); u32();                                // direction, color mode
    const nc = u16(); o += nc * 4;
  }
  const numZones = u16();
  const zones = [];
  for (let z = 0; z < numZones; z++) {
    const zn = str(); i32(); u32(); u32();
    const count = u32();
    const mlen = u16(); o += mlen;
    zones.push({ name: zn, leds: count });
  }
  const numLeds = u16();
  for (let l = 0; l < numLeds; l++) { str(); u32(); }
  const numColors = u16();
  o += numColors * 4;
  // the blob must be consumed exactly - otherwise the layout is not what we think,
  // and we would rather leave the device alone than send it garbage
  const exact = o === buf.length && numColors === numLeds && zones.reduce((a, z) => a + z.leds, 0) === numLeds;
  return { type, name, vendor, leds: numLeds, zones, exact, consumed: o, size: buf.length };
}

class OpenRGB {
  constructor({ log }) {
    this.log = log;
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.pending = [];       // [{id, resolve}]
    this.devices = [];
    this.profiles = [];
    this.state = 'off';      // off | connecting | connected | error
    this.error = '';
    this.proto = PROTOCOL;
    this.onChange = () => {};
  }

  connect(host, port) {
    this.close();
    this.state = 'connecting'; this.error = ''; this.onChange();
    return new Promise(resolve => {
      const s = net.createConnection({ host, port, timeout: 2500 });
      this.sock = s;
      s.setNoDelay(true);
      s.on('timeout', () => s.destroy(new Error('timed out')));
      s.on('data', d => this._data(d));
      s.on('error', e => { this.error = e.code === 'ECONNREFUSED' ? 'OpenRGB SDK server not running' : e.message; });
      s.on('close', () => {
        const was = this.state;
        this.sock = null; this.devices = [];
        for (const p of this.pending) p.resolve(null);
        this.pending = [];
        this.state = this.error ? 'error' : 'off';
        if (was !== this.state) this.onChange();
        resolve(false);
      });
      s.on('connect', async () => {
        s.setTimeout(0);
        try {
          const v = await this._request(0, PKT.REQUEST_PROTOCOL_VERSION, u32buf(PROTOCOL), 1500);
          this.proto = v ? Math.min(PROTOCOL, v.readUInt32LE(0)) : 0;
          const name = Buffer.from('WISP - Aura Wisp\0', 'utf8');
          this._send(0, PKT.SET_CLIENT_NAME, name);
          await this.refresh();
          await this.loadProfiles();
          this.state = 'connected'; this.onChange();
          resolve(true);
        } catch (e) {
          this.error = e.message; s.destroy();
        }
      });
    });
  }

  async refresh() {
    const c = await this._request(0, PKT.REQUEST_CONTROLLER_COUNT, Buffer.alloc(0));
    const n = c ? c.readUInt32LE(0) : 0;
    const devs = [];
    for (let i = 0; i < n; i++) {
      const d = await this._request(i, PKT.REQUEST_CONTROLLER_DATA, this.proto ? u32buf(this.proto) : Buffer.alloc(0));
      if (!d) continue;
      try {
        const info = parseController(d, this.proto);
        if (info.leds > 0 && info.exact) devs.push(Object.assign({ index: i }, info));
        else if (!info.exact) this.log(`openrgb: skipped device ${i} (${info.name}) - unexpected data layout`);
      } catch (e) { this.log(`openrgb: could not parse device ${i}: ${e.message}`); }
    }
    this.devices = devs;
    for (const dv of devs) this._send(dv.index, PKT.SETCUSTOMMODE, Buffer.alloc(0)); // direct mode
    this.log(`openrgb: ${devs.length} device(s), ${devs.reduce((a, d) => a + d.leds, 0)} LEDs`);
  }

  async loadProfiles() {
    this.profiles = [];
    if (this.proto < 2) return;
    try {
      const r = await this._request(0, PKT.REQUEST_PROFILE_LIST, Buffer.alloc(0), 1500);
      if (!r) return;
      let o = 4;
      const n = r.readUInt16LE(o); o += 2;
      for (let i = 0; i < n; i++) {
        const l = r.readUInt16LE(o); o += 2;
        this.profiles.push(r.toString('utf8', o, o + Math.max(0, l - 1))); o += l;
      }
    } catch (_) { /* older servers: no profiles */ }
  }

  loadProfile(name) {
    if (!name || !this.sock) return;
    this._send(0, PKT.REQUEST_LOAD_PROFILE, Buffer.from(name + '\0', 'utf8'));
  }

  /** colors: array of [r,g,b] (length = device LED count) */
  setLeds(device, colors) {
    if (!this.sock || this.state !== 'connected') return;
    const n = colors.length;
    const b = Buffer.alloc(4 + 2 + n * 4);
    b.writeUInt32LE(b.length, 0);
    b.writeUInt16LE(n, 4);
    for (let i = 0; i < n; i++) {
      const c = colors[i];
      b[6 + i * 4] = c[0]; b[7 + i * 4] = c[1]; b[8 + i * 4] = c[2];
    }
    this._send(device, PKT.UPDATELEDS, b);
  }

  close() {
    if (this.sock) { try { this.sock.destroy(); } catch (_) {} }
    this.sock = null;
    this.devices = [];
    this.state = 'off';
  }

  // ------------------------------------------------------------ wire
  _send(device, id, data) {
    if (!this.sock) return;
    this.sock.write(Buffer.concat([header(device, id, data.length), data]));
  }
  _request(device, id, data, ms = 3000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { const i = this.pending.indexOf(p); if (i >= 0) this.pending.splice(i, 1); reject(new Error('OpenRGB did not answer')); }, ms);
      const p = { id, resolve: v => { clearTimeout(t); resolve(v); } };
      this.pending.push(p);
      this._send(device, id, data);
    });
  }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 16) {
      if (this.buf.toString('ascii', 0, 4) !== 'ORGB') { this.buf = Buffer.alloc(0); return; }
      const id = this.buf.readUInt32LE(8), size = this.buf.readUInt32LE(12);
      if (this.buf.length < 16 + size) return;
      const body = this.buf.subarray(16, 16 + size);
      this.buf = this.buf.subarray(16 + size);
      if (id === PKT.DEVICE_LIST_UPDATED) { this.refresh().then(() => this.onChange()).catch(() => {}); continue; }
      const i = this.pending.findIndex(p => p.id === id);
      if (i >= 0) this.pending.splice(i, 1)[0].resolve(Buffer.from(body));
    }
  }
}

function u32buf(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }

// ================================================================= effects
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BRAND = ['#5746E3', '#3366FF', '#00D2FF', '#00D4B8'].map(hex);
function hsl(h, s = 0.95, l = 0.5) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
function brandAt(u) {
  u = ((u % 1) + 1) % 1;
  const x = u * BRAND.length, i = Math.floor(x);
  return mix(BRAND[i], BRAND[(i + 1) % BRAND.length], x - i);
}

/**
 * Drives every connected device from the WISP settings.
 *   match   - the aura colour (gradient / spectrum spread across the LEDs)
 *   effects - mirrors the style: Pulse breathes, Flow runs comets round the strip,
 *             and every focus change sends a wisp sweeping through the case.
 */
class RgbSync {
  constructor({ log }) {
    this.log = log;
    this.client = new OpenRGB({ log });
    this.s = null;
    this.timer = null;
    this.retry = null;
    this.sweepAt = -1e9;
    this.t0 = Date.now();
    this.lastStatic = '';
    this.onStatus = () => {};
    this.client.onChange = () => this.onStatus(this.status());
  }

  status() {
    return {
      state: this.client.state,
      error: this.client.error,
      devices: this.client.devices.map(d => ({ name: d.name, vendor: d.vendor, leds: d.leds })),
      profiles: this.client.profiles.slice()
    };
  }

  apply(s) {
    const was = this.s;
    this.s = s;
    const want = s.rgbSync;
    const endpointChanged = was && (was.rgbHost !== s.rgbHost || was.rgbPort !== s.rgbPort);
    if (!want) { this.stop(); return; }
    if (this.client.state === 'off' || this.client.state === 'error' || endpointChanged) this.start();
    this.lastStatic = '';
  }

  async start() {
    clearTimeout(this.retry);
    this.retry = null;
    clearInterval(this.timer);
    const ok = await this.client.connect(this.s.rgbHost || '127.0.0.1', Number(this.s.rgbPort) || 6742);
    if (!this.s || !this.s.rgbSync) { this.client.close(); return; }
    if (!ok) { this.retry = setTimeout(() => this.start(), 5000); return; }
    this.timer = setInterval(() => this.frame(), 1000 / 30);
  }

  stop() {
    clearTimeout(this.retry); clearInterval(this.timer);
    this.retry = null; this.timer = null;
    if (this.client.state === 'connected') {
      // hand the case back: the chosen OpenRGB profile, or a calm static aura colour
      if (this.s && this.s.rgbRestoreProfile && this.client.profiles.includes(this.s.rgbRestoreProfile)) this.client.loadProfile(this.s.rgbRestoreProfile);
      else if (this.s) {
        const c = this.s.special === 'gradient' ? hex('#3366FF') : hex(this.s.color);
        for (const d of this.client.devices) this.client.setLeds(d.index, new Array(d.leds).fill(c));
      }
    }
    setTimeout(() => { this.client.close(); this.onStatus(this.status()); }, 150);
  }

  focusChanged() { this.sweepAt = Date.now(); }

  frame() {
    const s = this.s;
    if (!s || this.client.state !== 'connected') {
      if (this.client.state !== 'connected' && s && s.rgbSync && !this.retry) { clearInterval(this.timer); this.timer = null; this.retry = setTimeout(() => { this.retry = null; this.start(); }, 5000); }
      return;
    }
    const now = Date.now();
    const t = (now - this.t0) / 1000;
    const k = 0.25 + (s.speed / 100) * 1.75;
    const bright = (s.rgbBrightness == null ? 100 : s.rgbBrightness) / 100;
    const effects = s.rgbMode !== 'match' && s.enabled;
    const sweep = effects ? (now - this.sweepAt) / 650 : 2;

    // static colours need no 30 fps stream - send on change and refresh every 2 s
    const animated = s.special === 'spectrum' || s.special === 'gradient' || (effects && (s.style === 'pulse' || s.style === 'flow' || sweep < 1.05));
    if (!animated) {
      const key = [s.color, bright, s.enabled].join('|');
      if (key === this.lastStatic && now % 2000 > 40) return;
      this.lastStatic = key;
    }

    for (const d of this.client.devices) {
      const n = d.leds;
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : 0;
        let c;
        if (s.special === 'spectrum') c = hsl((t * 36 * k + u * 140) % 360);
        else if (s.special === 'gradient') c = brandAt(u * 0.75 + t * 0.05 * k);
        else c = hex(s.color);
        let level = 1;
        if (effects && s.style === 'pulse') level = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / (3.6 / k)));
        if (effects && s.style === 'flow') {
          level = 0.32;
          for (const head of [(t * 0.22 * k) % 1, (t * 0.22 * k + 0.5) % 1]) {
            let dd = head - u; if (dd < 0) dd += 1;           // distance behind the head
            if (dd < 0.22) level = Math.max(level, Math.pow(1 - dd / 0.22, 1.6));
          }
        }
        if (sweep < 1.05) {
          const front = sweep * 1.25 - 0.1;
          const w = Math.exp(-Math.pow((u - front) / 0.09, 2));
          c = mix(c, [255, 255, 255], 0.65 * w);
          level = Math.max(level, w);
        }
        const L = level * bright;
        out[i] = [Math.round(c[0] * L), Math.round(c[1] * L), Math.round(c[2] * L)];
      }
      this.client.setLeds(d.index, out);
    }
  }

  dispose() { this.stop(); }
}

module.exports = { RgbSync, OpenRGB, parseController };
