(function () {
  'use strict';
  const { parseRoute, sortNotes, validateNotes, createNoteIndex, searchNotes, noteHref, sanitizeMarkdown, excerptText } = globalThis.SuixinCore;
  const $ = id => document.getElementById(id);
  const initial = history.state?.suixin && history.state.hash === location.hash ? history.state : {};
  const state = {
    data: null, notes: [], index: null, loading: false, failed: false, hash: location.hash,
    query: initial.query || '', searchOpen: !!initial.searchOpen,
    readerOrigin: initial.readerOrigin || null, version: 0, scrollFrame: 0, restoring: false
  };
  history.scrollRestoration = 'manual';

  function entry(extra = {}) {
    return { suixin: true, hash: location.hash, query: state.query, searchOpen: state.searchOpen,
      readerOrigin: state.readerOrigin, scroll: scrollY, focusId: document.activeElement?.id || '', ...extra };
  }
  function savePosition() {
    if (!state.restoring && state.hash === location.hash) history.replaceState(entry(), '', location.href);
  }
  function canonical(hash) {
    const route = parseRoute(hash);
    if (route.kind === 'exhibit') return noteHref(route.id, route.heading);
    if (route.kind === 'end') return '#';
    return hash;
  }
  function defaultOrigin() {
    return { hash: '#index', query: state.query, searchOpen: state.searchOpen, scroll: 0, focusId: 'index-title' };
  }
  function navigate(hash, options = {}) {
    hash = canonical(hash);
    const next = parseRoute(hash);
    const current = parseRoute(location.hash);
    const same = hash === location.hash || (hash === '#' && !location.hash);
    if (same && options.search) {
      state.searchOpen = true;
      renderList();
      $('search').focus();
      savePosition();
      return;
    }
    if (same && !options.restore) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const origin = next.kind === 'reading'
      ? current.kind === 'reading' ? state.readerOrigin || defaultOrigin()
        : { hash: location.hash, query: state.query, searchOpen: state.searchOpen, scroll: scrollY, focusId: 'index-note-' + next.id }
      : null;
    savePosition();
    if (origin) state.readerOrigin = origin;
    if (options.restore) {
      state.query = options.restore.query || '';
      state.searchOpen = !!options.restore.searchOpen;
    } else if (next.kind !== 'reading') {
      state.query = '';
      state.searchOpen = !!options.search;
    }
    if (!same) history.pushState(entry({ hash, scroll: options.restore?.scroll || 0, focusId: '' }), '', hash);
    render({ restore: options.restore, search: options.search });
  }
  function returnToList() {
    navigate((state.readerOrigin || defaultOrigin()).hash || '#', { restore: state.readerOrigin || defaultOrigin() });
  }
  function view(kind) {
    document.body.dataset.view = kind;
    $('index-view').hidden = kind !== 'index';
    $('reading-view').hidden = kind !== 'reading';
    $('message-view').hidden = kind !== 'message';
    $('skip-link').href = kind === 'index' ? '#index-title' : kind === 'reading' ? '#article' : '#message-title';
    $('open-search').setAttribute('aria-expanded', String(kind === 'index' && state.searchOpen));
  }
  function renderBreadcrumbs() {
    const kind = document.body.dataset.view;
    const list = $('breadcrumbs');
    list.replaceChildren();
    function add(label, {href, id, current = false} = {}) {
      const item = document.createElement('li');
      const node = document.createElement(href === undefined ? 'span' : 'a');
      node.textContent = label;
      if (href !== undefined) node.href = href;
      if (id) node.id = id;
      if (current) { node.setAttribute('aria-current', 'page'); node.title = label; }
      item.append(node); list.append(item);
    }
    if (kind === 'reading') {
      const origin = state.readerOrigin || defaultOrigin();
      const fromSearch = !!origin.query?.trim();
      add('首页', {href: fromSearch ? '#' : origin.hash || '#', id: fromSearch ? 'breadcrumb-home' : 'reader-back'});
      if (fromSearch) add('搜索结果', {href: origin.hash || '#index', id: 'reader-back'});
      add($('article-title').textContent, {current: true});
    } else if (kind === 'index') {
      if (state.searchOpen) {
        add('首页', {href: '#'});
        add('搜索', {current: true});
      } else add('首页', {current: true});
    } else {
      add('首页', {href: '#'});
      add($('message-title').textContent, {current: true});
    }
  }
  function renderList() {
    const notes = searchNotes(state.notes, state.query);
    $('index-title').textContent = state.searchOpen ? '搜索文章' : '文章';
    $('search').value = state.query;
    $('index-toolbar').hidden = !state.searchOpen;
    $('clear-search').hidden = !state.query;
    $('open-search').setAttribute('aria-expanded', String(state.searchOpen));
    $('result-count').hidden = !state.query.trim();
    $('result-count').textContent = state.query.trim() ? '找到 ' + notes.length + ' 篇文章' : '';
    $('load-feedback').hidden = !!state.data;
    $('load-status').textContent = state.loading ? '正在整理文字…' : '文字暂时无法加载，请重试。';
    $('load-retry').hidden = !state.failed;
    $('search-empty').hidden = !state.data || notes.length > 0;
    $('search-empty').querySelector('p').textContent = state.notes.length ? '暂时没有找到这段文字。' : '第一篇文字，正在来的路上。';
    $('empty-clear').hidden = !state.query;
    const fragment = document.createDocumentFragment();
    for (const note of notes) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'note-row'; link.id = 'index-note-' + note.id; link.href = noteHref(note.id);
      const title = document.createElement('h2');
      title.className = 'note-title'; title.textContent = note.title;
      link.append(title);
      const summary = excerptText(note, 56);
      if (summary) {
        const excerpt = document.createElement('p');
        excerpt.className = 'note-excerpt'; excerpt.textContent = summary;
        link.append(excerpt);
      }
      item.append(link); fragment.append(item);
    }
    $('note-list').replaceChildren(fragment);
    document.title = state.searchOpen ? '搜索 · 随心' : '随心';
    renderBreadcrumbs();
  }
  function renderMessage(title, copy, retry = false) {
    view('message');
    $('message-title').textContent = title;
    $('message-copy').textContent = copy;
    $('message-retry').hidden = !retry;
    document.title = title + ' · 随心';
    return 'message-title';
  }
  function renderReading(route) {
    const note = state.notes.find(item => item.id === route.id);
    if (!note) return renderMessage('这篇文字暂未收录', '它可能已被移动或移除，可以从文章列表继续阅读。');
    view('reading');
    $('article-title').textContent = note.title;
    $('article-body').replaceChildren(sanitizeMarkdown(note.markdown, note, state.index, state.notes));
    $('article-navigation').replaceChildren();
    const position = state.notes.indexOf(note);
    for (const [target, label, className] of [
      [state.notes[position - 1], '上一篇', 'article-previous'],
      [state.notes[position + 1], '下一篇', 'article-next']
    ]) {
      if (!target) continue;
      const link = document.createElement('a'); link.href = noteHref(target.id); link.className = className;
      const labelNode = document.createElement('small'); labelNode.textContent = label;
      const title = document.createElement('span'); title.textContent = target.title;
      link.append(labelNode, title); $('article-navigation').append(link);
    }
    document.title = note.title + ' · 随心';
    return 'article';
  }
  function render(options = {}) {
    const version = ++state.version;
    state.restoring = true;
    const normalized = canonical(location.hash);
    if (normalized !== location.hash) history.replaceState(history.state, '', normalized);
    const route = parseRoute(location.hash);
    const previousView = document.body.dataset.view;
    let focusId;
    if (route.kind === 'reading') {
      focusId = state.data ? renderReading(route)
        : renderMessage(state.failed ? '文字暂时无法加载' : '正在整理文字…', state.failed ? '连接暂时中断，请重试。' : '请稍等片刻。', state.failed);
    } else {
      view('index'); renderList(); focusId = 'index-title';
    }
    state.hash = location.hash;
    const currentView = document.body.dataset.view;
    renderBreadcrumbs();
    history.replaceState(entry({ scroll: options.restore?.scroll || 0, focusId: options.restore?.focusId || focusId }), '', location.href);
    document.dispatchEvent(new CustomEvent('suixin:navigate', { detail: { from: previousView, to: currentView } }));
    requestAnimationFrame(() => {
      if (version !== state.version) return;
      let heading;
      if (route.kind === 'reading' && route.heading && currentView === 'reading' && !options.restore) {
        heading = Array.from($('article-body').querySelectorAll('[data-heading]')).find(el =>
          el.dataset.heading === route.heading || el.dataset.heading.toLocaleLowerCase().replace(/\s+/g, '-') === route.heading);
      }
      if (heading) {
        heading.tabIndex = -1; heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      } else {
        window.scrollTo({ top: options.restore?.scroll || 0, behavior: 'instant' });
        const target = options.search && currentView === 'index' ? $('search') : $(options.restore?.focusId || focusId);
        if (!options.initial || options.restore?.focusId) target?.focus({ preventScroll: true });
        if (options.search) $('search').scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      state.restoring = false;
      $('navigation-status').textContent = currentView === 'index' ? $('index-title').textContent : currentView === 'reading' ? '已打开全文' : $('message-title').textContent;
      savePosition();
    });
  }
  function restoreHistory() {
    if (location.hash === state.hash) return;
    const restored = history.state?.suixin && history.state.hash === location.hash ? history.state : null;
    state.query = restored?.query || '';
    state.searchOpen = !!restored?.searchOpen;
    state.readerOrigin = restored?.readerOrigin || null;
    render({ restore: restored || undefined });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const href = link.getAttribute('href');
    if (!href?.startsWith('#')) return;
    event.preventDefault();
    if (link.id === 'skip-link') {
      const target = $(href.slice(1)); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' }); return;
    }
    if (link.id === 'reader-back') return returnToList();
    navigate(href, { search: link.id === 'open-search' });
  });
  $('search').addEventListener('input', () => {
    state.query = $('search').value;
    renderList(); savePosition();
  });
  function clearSearch() {
    state.query = ''; renderList(); $('search').focus(); savePosition();
  }
  function closeSearch() {
    state.query = ''; state.searchOpen = false; renderList(); $('open-search').focus(); savePosition();
  }
  $('clear-search').addEventListener('click', clearSearch);
  $('empty-clear').addEventListener('click', clearSearch);
  $('close-search').addEventListener('click', closeSearch);
  document.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && document.body.dataset.view === 'index' && state.searchOpen) {
      event.preventDefault(); closeSearch(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (event.key === '/') { event.preventDefault(); navigate('#index', { search: true }); }
  });
  window.addEventListener('popstate', restoreHistory);
  window.addEventListener('hashchange', restoreHistory);
  window.addEventListener('scroll', () => {
    if (state.scrollFrame) return;
    state.scrollFrame = requestAnimationFrame(() => {
      state.scrollFrame = 0;
      if (!state.loading) savePosition();
    });
  }, { passive: true });
  window.addEventListener('pagehide', savePosition);
  async function loadNotes() {
    if (state.loading) return;
    const requestedHash = location.hash;
    const restored = history.state?.suixin ? history.state : null;
    const restore = restored && (restored.scroll > 0 || restored.focusId === 'search' || restored.focusId?.startsWith('index-note-')) ? restored : undefined;
    state.loading = true; state.failed = false; document.body.dataset.loading = 'true';
    render({ initial: true, restore });
    try {
      const response = await fetch('./notes.json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Notes unavailable');
      state.data = validateNotes(await response.json());
      state.notes = sortNotes(state.data.notes); state.index = createNoteIndex(state.notes);
    } catch (_) {
      state.failed = true; state.data = null; state.notes = []; state.index = null;
    }
    state.loading = false; document.body.dataset.loading = 'false';
    render({ initial: true, restore: requestedHash === location.hash ? restore : undefined });
  }
  $('load-retry').addEventListener('click', loadNotes);
  $('message-retry').addEventListener('click', loadNotes);
  history.replaceState(entry({ ...initial }), '', location.href);
  loadNotes();
})();
