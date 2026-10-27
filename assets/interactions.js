(function () {
  'use strict';

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const landing = document.getElementById('landing');
  const hero = document.querySelector('.hero');
  let scrollFrame = 0;

  function updateScroll() {
    scrollFrame = 0;
    if (landing.hidden || reducedMotion.matches) {
      hero.style.removeProperty('--hero-progress');
      return;
    }
    const progress = Math.min(Math.max(scrollY / Math.max(innerHeight, 1), 0), 1);
    hero.style.setProperty('--hero-progress', progress.toFixed(4));
  }

  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  new MutationObserver(updateScroll).observe(landing, { attributes: true, attributeFilter: ['hidden'] });
  reducedMotion.addEventListener('change', updateScroll);

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -24px 0px', threshold: 0.05 }) : null;
  if (revealObserver) document.documentElement.classList.add('motion-ready');

  function observeReveals() {
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((element) => revealObserver?.observe(element));
  }
  new MutationObserver(observeReveals).observe(document.getElementById('story-list'), { childList: true });
  observeReveals();

  function magnetic(element) {
    let frame = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    let vx = 0;
    let vy = 0;

    function tick() {
      vx = (vx + (targetX - x) * 0.16) * 0.68;
      vy = (vy + (targetY - y) * 0.16) * 0.68;
      x += vx;
      y += vy;
      element.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      if (Math.abs(x - targetX) + Math.abs(y - targetY) + Math.abs(vx) + Math.abs(vy) > 0.04) frame = requestAnimationFrame(tick);
      else { frame = 0; if (!targetX && !targetY) element.style.removeProperty('transform'); }
    }

    function start() { if (!frame) frame = requestAnimationFrame(tick); }
    element.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = element.getBoundingClientRect();
      targetX = (event.clientX - rect.left - rect.width / 2) * 0.1;
      targetY = (event.clientY - rect.top - rect.height / 2) * 0.12;
      start();
    });
    element.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; start(); });
    element.addEventListener('blur', () => { targetX = 0; targetY = 0; start(); });
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      cancelAnimationFrame(frame);
      frame = 0;
      x = y = targetX = targetY = vx = vy = 0;
      element.style.removeProperty('transform');
    });
  }

  document.querySelectorAll('.magnetic').forEach(magnetic);
})();
