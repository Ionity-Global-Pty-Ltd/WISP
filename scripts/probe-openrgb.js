// WISP - read-only probe of a real OpenRGB SDK server: lists devices and LED counts
// without changing any lighting.   node scripts/probe-openrgb.js [host] [port]
const { OpenRGB, parseController } = require('../src/main/rgb');
(async () => {
  const c = new OpenRGB({ log: console.log });
  c.refresh = async function () {
    const r = await this._request(0, 0, Buffer.alloc(0));
    const n = r ? r.readUInt32LE(0) : 0;
    const b = Buffer.alloc(4); b.writeUInt32LE(this.proto);
    for (let i = 0; i < n; i++) {
      const d = await this._request(i, 1, this.proto ? b : Buffer.alloc(0));
      try { const info = parseController(d, this.proto); console.log(`#${i} ${info.name} | ${info.vendor} | ${info.leds} LEDs | zones: ${info.zones.map(z => z.name + ':' + z.leds).join(', ')} | exact=${info.exact} ${info.consumed}/${info.size}`); }
      catch (e) { console.log(`#${i} parse error: ${e.message}`); }
    }
  };
  const ok = await c.connect(process.argv[2] || '127.0.0.1', Number(process.argv[3]) || 6742);
  console.log('connected:', ok, 'protocol', c.proto, c.error || '');
  console.log('profiles:', JSON.stringify(c.profiles));
  c.close(); process.exit(ok ? 0 : 1);
})();
