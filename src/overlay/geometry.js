/* WISP - geometry helpers (shared by the overlay and the tests). Policy 986 AED */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WispGeo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Rounded-rectangle perimeter walker.
   * Returns { length, at(s) } where at(s) for s in [0,1) gives the point on the
   * outline and its outward unit normal, travelling clockwise from the top-left
   * end of the top edge.
   */
  function perimeter(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const sw = Math.max(0, w - 2 * r), sh = Math.max(0, h - 2 * r), arc = Math.PI * r / 2;
    const segs = [
      { len: sw, f: t => [x + r + t * sw, y, 0, -1] },
      { len: arc, f: t => corner(x + w - r, y + r, -Math.PI / 2 + t * Math.PI / 2) },
      { len: sh, f: t => [x + w, y + r + t * sh, 1, 0] },
      { len: arc, f: t => corner(x + w - r, y + h - r, t * Math.PI / 2) },
      { len: sw, f: t => [x + w - r - t * sw, y + h, 0, 1] },
      { len: arc, f: t => corner(x + r, y + h - r, Math.PI / 2 + t * Math.PI / 2) },
      { len: sh, f: t => [x, y + h - r - t * sh, -1, 0] },
      { len: arc, f: t => corner(x + r, y + r, Math.PI + t * Math.PI / 2) }
    ];
    function corner(cx, cy, a) {
      const nx = Math.cos(a), ny = Math.sin(a);
      return [cx + nx * r, cy + ny * r, nx, ny];
    }
    const length = segs.reduce((a, s) => a + s.len, 0) || 1;
    function at(s) {
      s = ((s % 1) + 1) % 1;
      let d = s * length;
      for (const seg of segs) {
        if (d <= seg.len || seg === segs[segs.length - 1]) {
          const p = seg.f(seg.len ? Math.min(1, d / seg.len) : 0);
          return { x: p[0], y: p[1], nx: p[2], ny: p[3] };
        }
        d -= seg.len;
      }
      return { x, y, nx: 0, ny: -1 };
    }
    return { length, at };
  }

  /** Parameter s of the outline point nearest to (px,py) - coarse search. */
  function nearestS(per, px, py, steps = 96) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < steps; i++) {
      const p = per.at(i / steps);
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bd) { bd = d; best = i / steps; }
    }
    return best;
  }

  function intersects(a, b, margin = 0) {
    return a.x - margin < b.x + b.width && a.x + a.width + margin > b.x &&
           a.y - margin < b.y + b.height && a.y + a.height + margin > b.y;
  }

  function overlapArea(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /**
   * Keep the outline visible when the window touches the display edge
   * (maximised windows, snapped windows). Only applied on the display that
   * holds most of the window, so a window spanning two screens is not cut in
   * the middle.
   */
  function clampToView(r, view, inset) {
    const x1 = Math.max(r.x, view.x + inset);
    const y1 = Math.max(r.y, view.y + inset);
    const x2 = Math.min(r.x + r.width, view.x + view.width - inset);
    const y2 = Math.min(r.y + r.height, view.y + view.height - inset);
    if (x2 - x1 < 4 || y2 - y1 < 4) return r;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  /** Critically-damped-ish spring step for one scalar. */
  function spring(pos, vel, target, k, damping, dt) {
    const a = -k * (pos - target) - damping * vel;
    vel += a * dt;
    pos += vel * dt;
    return [pos, vel];
  }

  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function hslToHex(hue, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + hue / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }

  return { perimeter, nearestS, intersects, overlapArea, clampToView, spring, hexToRgb, hslToHex };
});
