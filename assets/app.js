(function () {
  'use strict';
  const { parseRoute, sortNotes, validateNotes, createNoteIndex, searchNotes, noteHref, exhibitHref, sceneVariant, excerptText, sanitizeMarkdown } = globalThis.SuixinCore;
  const $ = id => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'});
  const initial = history.state && history.state.suixin && history.state.hash === location.hash ? history.state : {};
  const state = { data:null, notes:[], index:null, loading:false, failed:false, hash:location.hash,
    query:initial.query || '', galleryHash:initial.galleryHash || (parseRoute(location.hash).kind === 'reading' ? exhibitHref(parseRoute(location.hash).id) : '#'),
    readerOrigin:initial.readerOrigin || null, position:0, version:0, progressFrame:0 };
  history.scrollRestoration = 'manual';

  function dateText(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '';
  }
  function number(value) { return String(value).padStart(2,'0'); }
  function setLink(element, href, label, arrow) {
    element.href = href;
    element.replaceChildren(document.createTextNode(label));
    if (arrow) { const span = document.createElement('span'); span.setAttribute('aria-hidden','true'); span.textContent = arrow; element.append(span); }
  }
  function historyEntry(extra = {}) {
    return {suixin:true,hash:location.hash,query:state.query,galleryHash:state.galleryHash,readerOrigin:state.readerOrigin,
      scroll:scrollY,focusId:document.activeElement?.id || '',...extra};
  }
  function savePosition() { history.replaceState(historyEntry(),'',location.href); }
  function galleryHref(position) {
    if (position <= 0) return '#';
    if (position > state.notes.length) return '#end';
    return exhibitHref(state.notes[position - 1].id);
  }
  function originForReading(route) {
    const from = parseRoute(location.hash);
    if (from.kind === 'reading') return state.readerOrigin || {hash:exhibitHref(route.id),scroll:0,focusId:'chapter-open'};
    if (from.kind === 'index') return {hash:'#index',query:state.query,scroll:scrollY,focusId:'index-note-' + route.id};
    if (['entrance','exhibit','end'].includes(from.kind)) return {hash:location.hash || '#',scroll:scrollY,focusId:'chapter-open'};
    return {hash:exhibitHref(route.id),scroll:0,focusId:'chapter-open'};
  }
  function navigate(hash, options = {}) {
    if (hash === location.hash || (hash === '#' && !location.hash)) {
      if (options.search) $('search').focus();
      return;
    }
    const route = parseRoute(hash);
    const origin = route.kind === 'reading' ? originForReading(route) : null;
    savePosition();
    if (route.kind === 'reading') state.readerOrigin = origin;
    const restored = options.restore || {};
    if (typeof restored.query === 'string') state.query = restored.query;
    history.pushState(historyEntry({hash,scroll:restored.scroll || 0,focusId:restored.focusId || '',...restored}),'',hash);
    render({restore:options.restore,search:options.search});
  }
  function returnFromReading() {
    const route = parseRoute(location.hash);
    const origin = state.readerOrigin || {hash:exhibitHref(route.id),scroll:0,focusId:'chapter-open'};
    navigate(origin.hash,{restore:origin});
  }
  function view(kind) {
    document.body.dataset.view = kind;
    $('gallery-view').hidden = kind !== 'gallery';
    $('index-view').hidden = kind !== 'index';
    $('reading-view').hidden = kind !== 'reading';
    $('message-view').hidden = kind !== 'message';
    $('scene-atmosphere').hidden = kind !== 'gallery';
    $('back-to-top').hidden = true;
    const destinations = {gallery:'#chapter-title',index:'#index-title',reading:'#article',message:'#message-title'};
    $('skip-link').href = destinations[kind];
    if (kind === 'index') setLink($('header-index'),state.galleryHash,'返回展馆','↗');
    else setLink($('header-index'),'#index','作品索引','↗');
  }
  function setArt(name) {
    const target = './assets/gallery/' + name + '.webp';
    if ($('scene-image').getAttribute('src') === target) return;
    $('scene-atmosphere').classList.remove('asset-missing');
    $('scene-source').srcset = './assets/gallery/' + name + '-small.webp';
    $('scene-image').src = target;
  }
  $('scene-image').addEventListener('error',() => $('scene-atmosphere').classList.add('asset-missing'));
  $('scene-image').addEventListener('load',() => $('scene-atmosphere').classList.remove('asset-missing'));

  function renderChapter(route) {
    const n = state.notes.length;
    let position = route.kind === 'end' ? n + 1 : route.kind === 'exhibit' ? state.notes.findIndex(note => note.id === route.id) + 1 : 0;
    if (route.kind === 'exhibit' && !position) return renderMessage('这件展品暂未收录','它可能已被移动或移除。可以从作品索引继续浏览。');
    view('gallery');
    state.position = position;
    state.galleryHash = location.hash || '#';
    const entrance = position === 0, ending = route.kind === 'end';
    const note = !entrance && !ending ? state.notes[position - 1] : null;
    const variant = note ? sceneVariant(note.id) : 0;
    $('chapter').className = 'chapter' + (entrance ? ' entrance-chapter' : ending ? ' ending-chapter' : ' exhibit-chapter');
    $('chapter').dataset.variant = String(variant);
    setArt(note ? ['door','wall','paper'][variant] : ending ? 'paper' : 'door');
    $('chapter-title').textContent = entrance ? '随心' : ending ? '灯还亮着，\n下次再来。' : note.title;
    $('chapter-label').textContent = entrance ? 'SUIXIN · 私人文字展馆' : ending ? 'UNTIL NEXT TIME / 尾声' : 'COLLECTION ' + number(position) + ' / 文字收藏';
    $('chapter-subtitle').hidden = !entrance;
    $('chapter-subtitle').textContent = '给片刻，一个停留的地方。';
    $('chapter-description').textContent = entrance ? '一些片刻，一些故事。\n在这里，慢慢看，轻轻读。' : ending ? '把日子写成故事，把故事留给自己。\n谢谢你，在这些文字里停留。' : excerptText(note);
    $('chapter-description').hidden = !!note && !excerptText(note);
    const updated = note ? dateText(note.updatedAt) : '';
    $('chapter-date').hidden = !updated;
    $('chapter-date').textContent = updated ? '最近更新 ' + updated : '';
    setLink($('chapter-open'), note ? noteHref(note.id) : ending ? '#' : n ? exhibitHref(state.notes[0].id) : '#index',
      note ? '阅读全文' : ending ? '重新逛展' : n || !state.data ? '进入展馆' : '作品索引','↗');
    $('chapter-index').hidden = !!note;
    $('chapter-index').textContent = ending ? '查看全部作品' : '作品索引';
    $('chapter-prev').disabled = entrance;
    $('chapter-next').disabled = ending || !n;
    $('chapter-next-label').textContent = entrance ? '开始看展' : position === n ? '走向尾声' : '下一幕';
    $('chapter-current').textContent = ending ? '终' : number(position);
    $('chapter-total').textContent = state.data ? number(n) : '—';
    $('position-label').textContent = entrance ? '序 · 入馆' : ending ? '尾声 · 再会' : '一篇文字，一处停留';
    $('scene-caption-label').textContent = entrance ? 'THE QUIET HOURS' : ending ? 'THE LIGHT STAYS ON' : 'A MOMENT, IN WORDS';
    $('scene-caption-copy').textContent = entrance ? '此刻，留一盏灯。' : ending ? '文字一直在这里。' : '把目光，留给文字。';
    $('load-feedback').hidden = !entrance || (!!state.data && n > 0);
    $('load-status').textContent = state.loading ? '正在整理文字…' : state.failed ? '文字暂时无法加载。' : !n ? '第一篇文字，正在来的路上。' : '';
    $('load-retry').hidden = !state.failed;
    document.title = note ? note.title + ' · 随心展馆' : ending ? '尾声 · 随心' : '随心 · 私人文字展馆';
    return 'chapter-title';
  }

  function renderList() {
    const notes = searchNotes(state.notes,state.query);
    $('search').value = state.query;
    $('clear-search').hidden = !state.query;
    $('result-count').textContent = state.query.trim() ? '找到 ' + notes.length + ' 篇文字' : '共 ' + notes.length + ' 篇 · 最近更新排序';
    $('note-list').replaceChildren();
    $('search-empty').hidden = notes.length > 0;
    $('search-empty').querySelector('p').textContent = state.notes.length ? '暂时没有找到这段文字。' : '第一篇文字，正在来的路上。';
    $('empty-clear').hidden = !state.query;
    const fragment = document.createDocumentFragment();
    for (const note of notes) {
      const item = document.createElement('li');
      const link = document.createElement('a'); link.className = 'note-row'; link.id = 'index-note-' + note.id; link.href = noteHref(note.id);
      const num = document.createElement('span'); num.className = 'note-number'; num.textContent = number(state.notes.indexOf(note) + 1); num.setAttribute('aria-hidden','true');
      const copy = document.createElement('span'); copy.className = 'note-copy';
      const title = document.createElement('span'); title.className = 'note-title'; title.textContent = note.title;
      const excerpt = document.createElement('span'); excerpt.className = 'note-excerpt'; excerpt.textContent = note.excerpt || '';
      copy.append(title,excerpt);
      const date = document.createElement('time'); date.className = 'note-date'; date.textContent = dateText(note.updatedAt);
      if (date.textContent) { date.dateTime = new Date(note.updatedAt).toISOString(); date.setAttribute('aria-label','最近更新 ' + date.textContent); }
      const arrow = document.createElement('span'); arrow.className = 'note-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
      link.append(num,copy,date,arrow); item.append(link); fragment.append(item);
    }
    $('note-list').append(fragment);
  }
  function renderIndex() {
    view('index');
    renderList();
    $('collection-meta').textContent = state.notes.length + ' 篇文字 · 持续记录中';
    $('index-return').href = state.galleryHash;
    document.title = '作品索引 · 随心';
    return 'index-title';
  }
  function renderMessage(title,copy,retry = false) {
    view('message');
    $('message-title').textContent = title;
    $('message-copy').textContent = copy;
    $('message-retry').hidden = !retry;
    $('message-index').hidden = parseRoute(location.hash).kind === 'index';
    document.title = title + ' · 随心';
    return 'message-title';
  }
  function renderReading(route) {
    const note = state.notes.find(item => item.id === route.id);
    if (!note) return renderMessage('这篇文字暂未收录','它可能已被移动或移除。可以从作品索引继续阅读。');
    view('reading');
    $('article-title').textContent = note.title;
    const updated = dateText(note.updatedAt);
    $('article-date').textContent = updated ? '最近更新 ' + updated : '';
    const length = Array.from(note.markdown.replace(/\s/g,'')).length;
    $('reading-time').textContent = length < 400 ? '不到 1 分钟阅读' : '约 ' + Math.ceil(length/400) + ' 分钟阅读';
    $('article-body').replaceChildren(sanitizeMarkdown(note.markdown,note,state.index,state.notes));
    const position = state.notes.indexOf(note);
    $('reading-position').textContent = number(position+1) + ' / ' + number(state.notes.length);
    const origin = state.readerOrigin || {hash:exhibitHref(note.id),scroll:0,focusId:'chapter-open'};
    for (const id of ['reader-back','reader-return']) {
      $(id).href = origin.hash;
      $(id).textContent = origin.hash === '#index' ? '← 返回作品索引' : '← 回到展馆';
    }
    $('article-navigation').replaceChildren();
    for (const [entry,label,kind] of [[state.notes[position-1],'上一篇','article-previous'],[state.notes[position+1],'下一篇','article-next']]) {
      if (!entry) continue;
      const link = document.createElement('a'); link.href = noteHref(entry.id); link.className = kind;
      const small = document.createElement('small'); small.textContent = label;
      const title = document.createElement('span'); title.textContent = entry.title;
      link.append(small,title); $('article-navigation').append(link);
    }
    document.title = note.title + ' · 随心';
    return 'article';
  }
  function render(options = {}) {
    const version = ++state.version;
    const route = parseRoute(location.hash);
    const previousView = document.body.dataset.view;
    let focusId;
    if (route.kind === 'entrance') focusId = renderChapter(route);
    else if (!state.data) focusId = renderMessage(state.failed ? '文字暂时无法加载' : '正在整理文字…',
      state.failed ? '连接暂时中断，请重试。' : '请稍等片刻。',state.failed);
    else if (route.kind === 'reading') focusId = renderReading(route);
    else if (route.kind === 'index') focusId = renderIndex();
    else focusId = renderChapter(route);
    state.hash = location.hash;
    history.replaceState(historyEntry({scroll:options.restore?.scroll || 0,focusId:options.restore?.focusId || focusId}),'',location.href);
    const currentView = document.body.dataset.view;
    document.dispatchEvent(new CustomEvent('suixin:navigate',{detail:{from:previousView,to:currentView}}));
    requestAnimationFrame(() => {
      if (version !== state.version) return;
      let heading = null;
      if (route.kind === 'reading' && route.heading && currentView === 'reading') {
        heading = Array.from($('article-body').querySelectorAll('[data-heading]')).find(el =>
          el.dataset.heading === route.heading || el.dataset.heading.toLocaleLowerCase().replace(/\s+/g,'-') === route.heading);
      }
      if (heading && !options.restore) { heading.tabIndex = -1; heading.focus({preventScroll:true}); heading.scrollIntoView({block:'start',behavior:'instant'}); }
      else {
        window.scrollTo({top:options.restore?.scroll || 0,behavior:'instant'});
        const target = options.search && currentView === 'index' ? $('search') : $(options.restore?.focusId || focusId);
        if (!options.initial) target?.focus({preventScroll:true});
      }
      updateProgress();
      $('navigation-status').textContent = currentView === 'gallery' ? $('position-label').textContent + '，' + $('chapter-current').textContent + ' / ' + $('chapter-total').textContent : currentView === 'reading' ? '已打开全文' : currentView === 'index' ? '已打开作品索引' : $('message-title').textContent;
    });
  }
  function updateProgress() {
    state.progressFrame = 0;
    if (document.body.dataset.view !== 'reading') return;
    const start = $('article').getBoundingClientRect().top + scrollY;
    const distance = Math.max(0,start + $('article').offsetHeight - innerHeight);
    const progress = distance ? Math.min(1,Math.max(0,scrollY/distance)) : 1;
    $('reading-track-fill').style.transform = 'scaleX(' + progress.toFixed(4) + ')';
    $('back-to-top').hidden = scrollY < 500;
  }
  function step(delta) {
    if (document.body.dataset.view !== 'gallery' || !state.data || !state.notes.length) return;
    const next = state.position + delta;
    if (next < 0 || next > state.notes.length + 1) return;
    navigate(galleryHref(next));
  }
  function restoreHistory() {
    if (location.hash === state.hash) return;
    const entry = history.state?.suixin && history.state.hash === location.hash ? history.state : {};
    state.query = entry.query ?? state.query;
    state.galleryHash = entry.galleryHash || state.galleryHash;
    state.readerOrigin = entry.readerOrigin || null;
    render({restore:entry.suixin ? entry : undefined});
  }
  document.addEventListener('click',event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const href = link.getAttribute('href');
    if (!href?.startsWith('#')) return;
    event.preventDefault();
    if (link.id === 'skip-link') {
      const target = $(href.slice(1)); target?.focus({preventScroll:true}); target?.scrollIntoView({block:'start'}); return;
    }
    if (link.id === 'reader-back' || link.id === 'reader-return') return returnFromReading();
    navigate(href);
  });
  $('chapter-prev').addEventListener('click',() => step(-1));
  $('chapter-next').addEventListener('click',() => step(1));
  $('search').addEventListener('input',() => { state.query = $('search').value; renderList(); savePosition(); });
  function clearSearch() { state.query = ''; renderList(); $('search').focus(); savePosition(); }
  $('clear-search').addEventListener('click',clearSearch);
  $('empty-clear').addEventListener('click',clearSearch);
  $('back-to-top').addEventListener('click',() => {
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    $('article').focus({preventScroll:true});
  });
  document.addEventListener('keydown',event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (event.key === '/') { event.preventDefault(); navigate('#index',{search:true}); return; }
    if (document.body.dataset.view !== 'gallery' || (getSelection()?.toString() || '')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); }
  });
  let touchStart = null;
  $('chapter').addEventListener('touchstart',event => {
    if (event.touches.length !== 1 || event.target.closest('a,button,input') || getSelection()?.toString()) { touchStart = null; return; }
    const touch = event.touches[0]; touchStart = {x:touch.clientX,y:touch.clientY,time:Date.now()};
  },{passive:true});
  $('chapter').addEventListener('touchmove',event => { if (event.touches.length !== 1) touchStart = null; },{passive:true});
  $('chapter').addEventListener('touchcancel',() => { touchStart = null; },{passive:true});
  $('chapter').addEventListener('touchend',event => {
    if (!touchStart || event.touches.length || getSelection()?.toString()) { touchStart = null; return; }
    const touch = event.changedTouches[0], dx = touch.clientX-touchStart.x, dy = touch.clientY-touchStart.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)*1.8 && Date.now()-touchStart.time < 900) step(dx < 0 ? 1 : -1);
    touchStart = null;
  },{passive:true});
  window.addEventListener('popstate',restoreHistory);
  window.addEventListener('hashchange',restoreHistory);
  window.addEventListener('scroll',() => {
    if (!state.progressFrame) state.progressFrame = requestAnimationFrame(() => {
      updateProgress();
      if (state.hash === location.hash) savePosition();
    });
  },{passive:true});
  window.addEventListener('resize',() => { if (!state.progressFrame) state.progressFrame = requestAnimationFrame(updateProgress); });
  window.addEventListener('pagehide',savePosition);

  async function loadNotes() {
    if (state.loading) return;
    const requestedHash = location.hash;
    const entry = history.state?.suixin ? history.state : {};
    const restore = entry.scroll > 0 || entry.focusId === 'search' || entry.focusId?.startsWith('index-note-') ? entry : undefined;
    state.loading = true; state.failed = false;
    render({initial:true,restore});
    try {
      const response = await fetch('./notes.json',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Notes unavailable');
      state.data = validateNotes(await response.json());
      state.notes = sortNotes(state.data.notes); state.index = createNoteIndex(state.notes);
    } catch (_) { state.failed = true; state.data = null; state.notes = []; state.index = null; }
    state.loading = false;
    render({initial:true,restore:requestedHash === location.hash ? restore : undefined});
  }
  $('load-retry').addEventListener('click',loadNotes);
  $('message-retry').addEventListener('click',loadNotes);
  history.replaceState(historyEntry({...initial}),'',location.href);
  loadNotes();
})();
