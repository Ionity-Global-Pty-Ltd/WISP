// WISP - geometry unit tests (no Electron needed). Policy 986 AED
const assert = require('assert');
const G = require('../src/overlay/geometry');

// perimeter of a plain rectangle
let p = G.perimeter(0, 0, 100, 50, 0);
assert.ok(Math.abs(p.length - 300) < 1e-6, 'rect perimeter');
let q = p.at(0); assert.deepStrictEqual([q.x, q.y, q.nx, q.ny], [0, 0, 0, -1]);
q = p.at(100 / 300); assert.ok(Math.abs(q.x - 100) < 1e-6 && Math.abs(q.y) < 1e-6, 'top-right corner');
q = p.at(0.5); assert.ok(Math.abs(q.x - 100) < 1e-6 && Math.abs(q.y - 50) < 1e-6, 'bottom-right');

// rounded rectangle: length = straight parts + full circle
p = G.perimeter(10, 10, 200, 100, 20);
assert.ok(Math.abs(p.length - (2 * 160 + 2 * 60 + 2 * Math.PI * 20)) < 1e-6, 'rounded perimeter');
for (let i = 0; i < 400; i++) {
  const a = p.at(i / 400);
  assert.ok(a.x >= 10 - 1e-6 && a.x <= 210 + 1e-6 && a.y >= 10 - 1e-6 && a.y <= 110 + 1e-6, 'point inside bounds');
  assert.ok(Math.abs(Math.hypot(a.nx, a.ny) - 1) < 1e-6, 'unit normal');
}
// wrap-around
assert.deepStrictEqual(p.at(1.25), p.at(0.25));
assert.deepStrictEqual(p.at(-0.75), p.at(0.25));

// nearest point
p = G.perimeter(0, 0, 100, 100, 0);
const s = G.nearestS(p, 150, 50); const n = p.at(s);
assert.ok(Math.abs(n.x - 100) < 1e-6, 'nearest on right edge');

// clamp a maximised window to the view
const v = { x: 0, y: 0, width: 1920, height: 1080 };
const c = G.clampToView({ x: -8, y: -8, width: 1936, height: 1048 }, v, 2);
assert.deepStrictEqual(c, { x: 2, y: 2, width: 1916, height: 1038 });

// overlap / intersects
assert.strictEqual(G.overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), 25);
assert.ok(!G.intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }));
assert.ok(G.intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }, 12));

// spring converges
let pos = 0, vel = 0;
for (let i = 0; i < 600; i++) [pos, vel] = G.spring(pos, vel, 100, 180, 2 * Math.sqrt(180), 1 / 120);
assert.ok(Math.abs(pos - 100) < 0.01, 'spring settles');

// colours
assert.strictEqual(G.hslToHex(0, 100, 50), '#ff0000');
assert.deepStrictEqual(G.hexToRgb('#3366FF'), [0x33, 0x66, 0xff]);

console.log('geometry: all tests passed');
