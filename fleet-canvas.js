/* Alto Fleet — scroll-driven EV canvas background.
   Vehicles ride curvy "map" routes (polylines smoothed with quadratic
   curves) rather than straight lanes. Speed tracks scroll velocity;
   soft blue halo on each car; charging icons trigger green pulse +
   brief pause. Vehicles rotate to follow their path heading.
   Mobile reduces to fewer routes + vehicles. Pauses when offscreen.
*/
(() => {
  const canvas = document.getElementById('fleet-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Sizing ──────────────────────────────────────────────────────
  let W = 0, H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildLanes();
  }

  // ── Routes ──────────────────────────────────────────────────────
  // Each route is a polyline of nodes spread across the canvas with
  // a sinusoidal vertical wave. Sampling returns position + heading
  // for a given cumulative distance along the path.
  let lanes = [];
  function buildLanes() {
    const count = isMobile ? 3 : 5;
    lanes = [];
    for (let i = 0; i < count; i++) {
      const yBase = ((i + 1) / (count + 1)) * H;
      // Mix two sines for more organic shapes
      const amp1 = 28 + (i * 9) % 36;
      const amp2 = 14 + (i * 7) % 22;
      const freq1 = 1.4 + (i * 0.31) % 0.9;
      const freq2 = 2.7 + (i * 0.47) % 1.3;
      const phase = i * 1.7;

      // Build polyline from off-left to off-right
      const nodes = [];
      const span = W + 240;
      const segments = Math.max(14, Math.floor(span / 90));
      for (let s = 0; s <= segments; s++) {
        const u = s / segments;
        const x = -120 + u * span;
        const y = yBase
          + Math.sin(u * Math.PI * freq1 + phase) * amp1
          + Math.sin(u * Math.PI * freq2 + phase * 1.7) * amp2;
        nodes.push({ x, y });
      }

      // Cumulative distance table
      const dists = [0];
      let total = 0;
      for (let k = 1; k < nodes.length; k++) {
        total += Math.hypot(nodes[k].x - nodes[k - 1].x, nodes[k].y - nodes[k - 1].y);
        dists.push(total);
      }

      function sampleAt(d) {
        if (total <= 0) return { x: 0, y: 0, angle: 0 };
        d = ((d % total) + total) % total;
        // binary search for segment
        let lo = 0, hi = dists.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (dists[mid] <= d) lo = mid; else hi = mid;
        }
        const segLen = dists[hi] - dists[lo];
        const t = segLen > 0 ? (d - dists[lo]) / segLen : 0;
        const a = nodes[lo], b = nodes[hi];
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          angle: Math.atan2(b.y - a.y, b.x - a.x),
        };
      }

      // Chargers placed at fractional distances along the path
      const chargers = [];
      const numChargers = 2 + (i % 2);
      for (let k = 0; k < numChargers; k++) {
        const d = ((k + 0.5 + 0.1 * i) / numChargers) * total;
        const p = sampleAt(d);
        chargers.push({ d, x: p.x, y: p.y });
      }

      lanes.push({
        nodes, dists, total, sampleAt, chargers,
        dashOffset: i * 23,
      });
    }
  }

  // ── Vehicles ────────────────────────────────────────────────────
  const VEHICLES = [];
  // Three vehicle types (delivery / van / truck) for visual variety.
  // Each lane is assigned one type so vehicles within a lane match,
  // like a real fleet running a corridor.
  const TYPES = ['delivery', 'van', 'truck'];
  function spawnVehicles() {
    VEHICLES.length = 0;
    const total = isMobile ? 4 : 8;
    // Pre-assign one type per lane
    for (let li = 0; li < lanes.length; li++) {
      lanes[li]._type = TYPES[li % TYPES.length];
    }
    for (let i = 0; i < total; i++) {
      const lane = lanes[i % lanes.length];
      // Trucks slowest, delivery fastest
      const speedBoost = lane._type === 'delivery' ? 1.35
                       : lane._type === 'van' ? 1.0
                       : 0.72;
      VEHICLES.push({
        lane,
        type: lane._type,
        d: (i / total) * (lane.total || W) + Math.random() * 200,
        baseSpeed: (18 + Math.random() * 14) * speedBoost,
        pauseUntil: 0,
        trail: [],
      });
    }
  }

  // ── Scroll velocity ─────────────────────────────────────────────
  let lastScrollY = window.scrollY;
  let lastScrollT = performance.now();
  let scrollV = 0;
  window.addEventListener('scroll', () => {
    const now = performance.now();
    const dy = window.scrollY - lastScrollY;
    const dt = Math.max(1, now - lastScrollT);
    const v = Math.abs(dy) / dt * 1000;
    scrollV = scrollV * 0.5 + v * 0.5;
    lastScrollY = window.scrollY;
    lastScrollT = now;
  }, { passive: true });

  function decayScroll(dt) {
    scrollV *= Math.pow(0.0008, dt);
    if (scrollV < 0.5) scrollV = 0;
  }

  // ── Mouse tracking (minimum, ambient) ────────────────
  // Smooth pointer position used for a soft spotlight and a barely
  // perceptible parallax shift of routes/vehicles.
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, has: false };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    mouse.has = true;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { mouse.has = false; });
  function easeMouse() {
    if (!mouse.has) return;
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;
  }

  // ── Visibility gate ─────────────────────────────────────────────
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '100px' }).observe(canvas);
  }

  // ── Drawing ─────────────────────────────────────────────────────
  function drawRoute(lane) {
    if (lane.nodes.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.11)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = lane.dashOffset;
    ctx.beginPath();
    const n = lane.nodes;
    ctx.moveTo(n[0].x, n[0].y);
    // Smooth via quadratic curves between midpoints
    for (let i = 1; i < n.length - 1; i++) {
      const mx = (n[i].x + n[i + 1].x) / 2;
      const my = (n[i].y + n[i + 1].y) / 2;
      ctx.quadraticCurveTo(n[i].x, n[i].y, mx, my);
    }
    ctx.lineTo(n[n.length - 1].x, n[n.length - 1].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCharger(c, pulsePhase) {
    const x = c.x, y = c.y;
    ctx.save();
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 30);
    grad.addColorStop(0, `rgba(16, 185, 129, ${0.20 + 0.12 * Math.sin(pulsePhase)})`);
    grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.moveTo(x - 1.5, y - 4.5);
    ctx.lineTo(x + 2.2, y - 0.5);
    ctx.lineTo(x - 0.5, y - 0.5);
    ctx.lineTo(x + 1.7, y + 4.5);
    ctx.lineTo(x - 2.2, y + 0.5);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawVehicle(v, t) {
    const p = v.lane.sampleAt(v.d);
    const x = p.x, y = p.y, angle = p.angle;
    const charging = t < v.pauseUntil;

    // Near-charger check using path distance, with cyclic wrap
    let nearCharger = false;
    for (const c of v.lane.chargers) {
      let dd = Math.abs(c.d - v.d) % v.lane.total;
      if (dd > v.lane.total / 2) dd = v.lane.total - dd;
      if (dd < 26) { nearCharger = true; break; }
    }

    // Trail
    for (let i = 0; i < v.trail.length; i++) {
      const tp = v.trail[i];
      const alpha = (i / v.trail.length) * 0.20;
      ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Halo + body — rotated to face heading
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const haloColor = charging || nearCharger
      ? `rgba(16, 185, 129, ${0.30 + 0.12 * Math.sin(t / 200)})`
      : 'rgba(59, 130, 246, 0.28)';
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    halo.addColorStop(0, haloColor);
    halo.addColorStop(1, haloColor.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // Body — shape varies by vehicle type
    ctx.fillStyle = '#0F172A';
    drawBody(v.type);
    // Cabin glass / windshield glint
    ctx.fillStyle = 'rgba(147, 197, 253, 0.65)';
    drawWindshield(v.type);
    // Wheels
    ctx.fillStyle = '#0F172A';
    drawWheels(v.type);
    // Headlight glint pointing forward
    ctx.fillStyle = 'rgba(252, 252, 252, 0.85)';
    ctx.beginPath();
    ctx.arc(bodyHalfWidth(v.type) - 0.8, -1, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Charging spark (drawn in world space, upright)
    if (charging) {
      ctx.fillStyle = '#10B981';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText('⚡', x + 10, y - 6);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Vehicle body silhouettes ──────────────────────────────────
  // Drawn in vehicle-local space (origin at center of body, +x is
  // the direction of travel). The car will be rotated by sampleAt.
  function bodyHalfWidth(type) {
    return type === 'truck' ? 14 : type === 'van' ? 9 : 9;
  }
  function drawBody(type) {
    if (type === 'truck') {
      // Tractor + trailer
      // trailer (rear)
      roundRect(ctx, -14, -3.5, 18, 6.5, 1);
      ctx.fill();
      // cab (front)
      roundRect(ctx, 4, -2, 10, 5, 1.2);
      ctx.fill();
    } else if (type === 'van') {
      // Tall sloped box van
      ctx.beginPath();
      ctx.moveTo(-9, 3);
      ctx.lineTo(-9, -3);
      ctx.lineTo(5, -3.5);
      ctx.lineTo(9, -1.5);
      ctx.lineTo(9, 3);
      ctx.closePath();
      ctx.fill();
    } else {
      // Delivery / small EV — pickup-ish
      roundRect(ctx, -9, -3, 18, 6, 1.5);
      ctx.fill();
      // raised cabin on the rear
      roundRect(ctx, -7, -5.5, 9, 3, 1);
      ctx.fill();
    }
  }
  function drawWindshield(type) {
    if (type === 'truck') {
      roundRect(ctx, 6, -1.4, 5, 2, 0.4);
      ctx.fill();
    } else if (type === 'van') {
      ctx.beginPath();
      ctx.moveTo(2, -2.8);
      ctx.lineTo(8, -1.4);
      ctx.lineTo(8, 0.4);
      ctx.lineTo(2, 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      roundRect(ctx, -6, -4.8, 7, 2.3, 0.6);
      ctx.fill();
    }
  }
  function drawWheels(type) {
    ctx.beginPath();
    if (type === 'truck') {
      ctx.arc(-10, 3.2, 1.6, 0, Math.PI * 2);
      ctx.arc(-1, 3.2, 1.6, 0, Math.PI * 2);
      ctx.arc(10, 3.2, 1.6, 0, Math.PI * 2);
    } else if (type === 'van') {
      ctx.arc(-5, 3.2, 1.7, 0, Math.PI * 2);
      ctx.arc(6, 3.2, 1.7, 0, Math.PI * 2);
    } else {
      ctx.arc(-5, 2.8, 1.7, 0, Math.PI * 2);
      ctx.arc(5, 2.8, 1.7, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // ── Loop ────────────────────────────────────────────────────────
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - lastT) / 1000;
    lastT = now;
    decayScroll(dt * 1000);

    if (!visible) {
      requestAnimationFrame(frame);
      return;
    }

    ctx.clearRect(0, 0, W, H);
    easeMouse();

    // Subtle parallax shift toward the cursor (max ~8px)
    let px = 0, py = 0;
    if (mouse.has) {
      px = ((mouse.x - W / 2) / W) * 14;
      py = ((mouse.y - H / 2) / H) * 8;
    }
    ctx.save();
    ctx.translate(px, py);

    for (const lane of lanes) drawRoute(lane);
    for (const lane of lanes) {
      for (const c of lane.chargers) drawCharger(c, now / 600);
    }

    const boost = prefersReduced ? 0 : Math.min(scrollV / 60, 14);
    const mult = 1 + boost;

    for (const v of VEHICLES) {
      const charging = now < v.pauseUntil;
      if (!charging) {
        const step = v.baseSpeed * mult * dt;
        v.d += step;
        if (v.lane.total > 0) v.d %= v.lane.total;

        // Chance to pause at a charger when crossing one
        for (const c of v.lane.chargers) {
          let dd = (c.d - v.d) % v.lane.total;
          if (dd < 0) dd += v.lane.total;
          // Within a couple of px AND we just crossed it this frame
          if (dd > v.lane.total - step - 1 && Math.random() < 0.55) {
            v.pauseUntil = now + 900 + Math.random() * 700;
            break;
          }
        }

        // Trail — store world position
        const p = v.lane.sampleAt(v.d - 9);
        v.trail.push({ x: p.x, y: p.y });
        if (v.trail.length > 22) v.trail.shift();
      }
      drawVehicle(v, now);
    }

    ctx.restore();

    // Minimum ambient spotlight that follows the cursor.
    // (Canvas-level — only visible over hero / where sections are
    // transparent. A second DOM spotlight handles content areas.)
    if (mouse.has) {
      const r = 320;
      const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, r);
      g.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
      g.addColorStop(0.4, 'rgba(59, 130, 246, 0.08)');
      g.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(mouse.x - r, mouse.y - r, r * 2, r * 2);
    }

    requestAnimationFrame(frame);
  }

  // ── Boot ────────────────────────────────────────────────────────
  resize();
  spawnVehicles();
  window.addEventListener('resize', () => {
    resize();
    spawnVehicles();
  });
  requestAnimationFrame(frame);
})();
