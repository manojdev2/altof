/* Alto Fleet — scroll-driven reveals & per-section animations.
   - [data-reveal] fades+rises into view on first intersect
   - [data-count] counts up from 0 to a target value
   - [data-fill] animates an inline `width` from 0 → target
   - [data-draw] animates an SVG path stroke-dashoffset 0
   - [data-grow] animates an SVG element's transform scale 0→1
   Stagger children with [data-reveal-delay="1..6"].
*/
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Initial hidden states (so first paint isn't full) ──────────
  function setupInitialStates() {
    document.querySelectorAll('[data-draw]').forEach(path => {
      try {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
      } catch (_) { /* not a path */ }
    });

    document.querySelectorAll('[data-count]').forEach(el => {
      el.dataset.target = el.dataset.count;
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      el.textContent = (0).toFixed(decimals);
    });

    document.querySelectorAll('[data-fill]').forEach(el => {
      el.dataset.target = el.dataset.fill;
      el.style.width = '0%';
    });

    document.querySelectorAll('[data-grow]').forEach(el => {
      el.style.transformOrigin = el.dataset.growOrigin || 'center';
      el.style.transform = 'scale(0)';
      el.style.opacity = '0';
    });
  }

  if (reduced) {
    // Skip animations — let things just appear
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-visible'));
    return;
  }

  setupInitialStates();

  // ── Intersection-based reveal ─────────────────────────────────
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('is-visible');
      runAnims(el);
      obs.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

  document.querySelectorAll('[data-reveal]').forEach(el => obs.observe(el));

  // Also create an observer just for animation triggers — so things
  // inside non-revealed containers still animate when scrolled into view.
  const animObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      runAnimSingle(e.target);
      animObs.unobserve(e.target);
    });
  }, { threshold: 0.4 });

  document.querySelectorAll('[data-count], [data-fill], [data-draw], [data-grow]').forEach(el => {
    // Only auto-observe nodes not inside a [data-reveal] (those are handled by reveal)
    if (!el.closest('[data-reveal]')) animObs.observe(el);
  });

  function runAnims(root) {
    root.querySelectorAll('[data-count], [data-fill], [data-draw], [data-grow]')
      .forEach(runAnimSingle);
    // also the root itself
    if (root.matches('[data-count], [data-fill], [data-draw], [data-grow]')) {
      runAnimSingle(root);
    }
  }

  function runAnimSingle(el) {
    if (el.dataset._ran) return;
    el.dataset._ran = '1';
    if (el.hasAttribute('data-count')) animCount(el);
    if (el.hasAttribute('data-fill')) animFill(el);
    if (el.hasAttribute('data-draw')) animDraw(el);
    if (el.hasAttribute('data-grow')) animGrow(el);
  }

  // ── Counter ───────────────────────────────────────────────────
  function animCount(el) {
    const target = parseFloat(el.dataset.target);
    const duration = parseInt(el.dataset.duration || '1400', 10);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const delay = parseInt(el.dataset.delay || '0', 10);
    setTimeout(() => {
      const start = performance.now();
      function tick(t) {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const val = target * eased;
        el.textContent = prefix + val.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);
  }

  // ── Bar fill ──────────────────────────────────────────────────
  function animFill(el) {
    const target = el.dataset.target;
    const delay = parseInt(el.dataset.delay || '0', 10);
    setTimeout(() => {
      el.style.transition = 'width 1.4s cubic-bezier(.2,0,0,1)';
      el.style.width = target;
    }, delay);
  }

  // ── SVG path draw ─────────────────────────────────────────────
  function animDraw(el) {
    const duration = parseInt(el.dataset.duration || '1800', 10);
    const delay = parseInt(el.dataset.delay || '0', 10);
    setTimeout(() => {
      el.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.2,0,0,1)`;
      el.style.strokeDashoffset = '0';
    }, delay);
  }

  // ── SVG/HTML grow-in ──────────────────────────────────────────
  function animGrow(el) {
    const delay = parseInt(el.dataset.delay || '0', 10);
    setTimeout(() => {
      el.style.transition = 'transform 700ms cubic-bezier(.34,1.56,.64,1), opacity 500ms ease-out';
      el.style.transform = 'scale(1)';
      el.style.opacity = '1';
    }, delay);
  }
})();
