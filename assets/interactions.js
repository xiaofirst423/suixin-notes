(function () {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  function cancel() { for (const animation of active) animation.cancel(); active.clear(); }
  document.addEventListener('suixin:navigate',event => {
    cancel();
    if (reduced.matches || typeof Element.prototype.animate !== 'function') return;
    const view = event.detail.to;
    const target = document.getElementById(view === 'gallery' ? 'chapter-copy' : view === 'reading' ? 'article' : view === 'index' ? 'index-view' : 'message-view');
    if (!target) return;
    const animation = target.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:450,easing:'cubic-bezier(.22,.61,.36,1)'});
    active.add(animation);
    animation.finished.then(() => active.delete(animation),() => active.delete(animation));
  });
  reduced.addEventListener('change',() => { if (reduced.matches) cancel(); });
  document.addEventListener('visibilitychange',() => { if (document.hidden) cancel(); });
})();
