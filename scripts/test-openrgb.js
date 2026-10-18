// WISP - OpenRGB client test against a mock SDK server (protocol v3). Policy 986 AED
const net = require('net');
const assert = require('assert');
const { RgbSync } = require('../src/main/rgb');

const str = s => { const b = Buffer.from(s + '\0', 'utf8'); const l = Buffer.alloc(2); l.writeUInt16LE(b.length); return Buffer.concat([l, b]); };
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };

function controller(name, ledCount, zoneSplit) {
  const mode = Buffer.concat([str('Direct'), i32(0), u32(0), u32(0), u32(0), u32(0), u32(100), u32(0), u32(0), u32(0), u32(100), u32(0), u32(1), u16(1), u32(0x0000ff)]);
  const zones = zoneSplit.map((n, i) => Buffer.concat([str('Zone ' + i), i32(1), u32(n), u32(n), u32(n), u16(0)]));
  const leds = []; for (let i = 0; i < ledCount; i++) leds.push(Buffer.concat([str('LED ' + i), u32(i)]));
  const colors = []; for (let i = 0; i < ledCount; i++) colors.push(u32(0));
  const body = Buffer.concat([i32(0), str(name), str('Ionity'), str('desc'), str('1.0'), str('SN'), str('HID'),
    u16(2), i32(0), mode, mode, u16(zones.length), ...zones, u16(ledCount), ...leds, u16(ledCount), ...colors]);
  return Buffer.concat([u32(body.length + 4), body]);
}

const DEVICES = [controller('ASUS Aura Motherboard', 12, [8, 4]), controller('ARGB Fan Hub', 30, [10, 10, 10])];
const got = { updates: {}, custom: 0, name: '' };

const server = net.createServer(sock => {
  let buf = Buffer.alloc(0);
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 16) {
      assert.strictEqual(buf.toString('ascii', 0, 4), 'ORGB');
      const dev = buf.readUInt32LE(4), id = buf.readUInt32LE(8), size = buf.readUInt32LE(12);
      if (buf.length < 16 + size) return;
      const data = buf.subarray(16, 16 + size); buf = buf.subarray(16 + size);
      const reply = (pid, payload, devIdx = 0) => {
        const h = Buffer.alloc(16); h.write('ORGB'); h.writeUInt32LE(devIdx, 4); h.writeUInt32LE(pid, 8); h.writeUInt32LE(payload.length, 12);
        sock.write(Buffer.concat([h, payload]));
      };
      if (id === 40) reply(40, u32(4));
      else if (id === 150) reply(150, Buffer.concat([u32(0), u16(1), str('Ionity Default')]));
      else if (id === 50) got.name = data.toString('utf8').replace(/\0+$/, '');
      else if (id === 0) reply(0, u32(DEVICES.length));
      else if (id === 1) { assert.strictEqual(data.readUInt32LE(0), 3, 'client asks for protocol 3'); reply(1, DEVICES[dev], dev); }
      else if (id === 1100) got.custom++;
      else if (id === 1050) {
        const n = data.readUInt16LE(4);
        assert.strictEqual(data.readUInt32LE(0), data.length);
        assert.strictEqual(data.length, 6 + n * 4);
        got.updates[dev] = { n, first: [data[6], data[7], data[8]], count: (got.updates[dev] ? got.updates[dev].count : 0) + 1 };
      }
    }
  });
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const rgb = new RgbSync({ log: m => console.log('  ', m) });
  const base = { enabled: true, color: '#3366FF', special: null, style: 'flow', speed: 50, rgbSync: true, rgbMode: 'effects', rgbBrightness: 100, rgbHost: '127.0.0.1', rgbPort: port };
  rgb.apply(base);
  await new Promise(r => setTimeout(r, 700));
  const st = rgb.status();
  assert.strictEqual(st.state, 'connected');
  assert.deepStrictEqual(st.devices.map(d => d.leds), [12, 30]);
  assert.strictEqual(got.name, 'WISP - Aura Wisp');
  assert.deepStrictEqual(st.profiles, ['Ionity Default']);
  assert.strictEqual(got.custom, 2, 'direct mode set on both devices');
  assert.strictEqual(got.updates[0].n, 12);
  assert.strictEqual(got.updates[1].n, 30);
  assert.ok(got.updates[1].count > 5, 'flow streams frames');

  // static colour in match mode
  rgb.apply(Object.assign({}, base, { rgbMode: 'match', style: 'aura', color: '#FF8A00' }));
  await new Promise(r => setTimeout(r, 200));
  assert.deepStrictEqual(got.updates[0].first, [0xff, 0x8a, 0x00]);

  rgb.apply(Object.assign({}, base, { rgbSync: false }));
  await new Promise(r => setTimeout(r, 300));
  assert.deepStrictEqual(got.updates[0].first, [0x33, 0x66, 0xff], 'static aura colour on stop');
  console.log('openrgb: all tests passed', JSON.stringify(st.devices));
  server.close();
  process.exit(0);
});
setTimeout(() => { console.error('timeout'); process.exit(1); }, 8000);
