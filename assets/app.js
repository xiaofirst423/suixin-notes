(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function normalizePath(value) {
    let path = String(value || '').replace(/\\/g, '/').trim();
    try { path = decodeURIComponent(path); } catch (_) { /* Literal malformed percent signs are valid filenames. */ }
    return path.replace(/^\.\//, '').replace(/\.md$/i, '').normalize('NFC');
  }

  function createNoteIndex(notes) {
    const byPath = new Map();
    const byName = new Map();
    notes.forEach((note) => {
      const path = normalizePath(note.path || note.title);
      byPath.set(path, note);
      const name = path.split('/').pop();
      if (!byName.has(name)) byName.set(name, note);
      else byName.set(name, null); // A repeated basename is not a unique link target.
    });
    return { byPath, byName };
  }

  function resolveNote(target, index, currentNote, relative = false) {
    const path = normalizePath(target).replace(/^随心\//, '');
    if (!path || path.startsWith('/') || /^[a-z]+:/i.test(path)) return null;
    if (!path.includes('/')) return index.byPath.get(path) || index.byName.get(path) || null;
    if (relative && currentNote) {
      const parts = normalizePath(currentNote.path || currentNote.title).split('/').slice(0, -1);
      for (const part of path.split('/')) {
        if (part === '..') { if (!parts.length) return null; parts.pop(); }
        else if (part !== '.' && part) parts.push(part);
      }
      return index.byPath.get(parts.join('/')) || null;
    }
    if (path.split('/').some((part) => part === '..' || part === '.')) return null;
    return index.byPath.get(path) || null;
  }

  function noteHref(id, heading = '') {
    const route = new URLSearchParams({ note: id });
    if (heading) route.set('heading', heading);
    return '#' + route.toString();
  }

  function parseRoute(hash) {
    const route = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    return { id: route.get('note') || '', heading: route.get('heading') || '' };
  }

  function searchNotes(notes, query) {
    const words = String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return notes.filter((note) => {
      const haystack = (note.title + '\n' + note.markdown).normalize('NFKC').toLocaleLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }

  function validateNotes(data) {
    if (!data || !Array.isArray(data.notes)) throw new Error('Invalid notes data');
    const ids = new Set();
    for (const note of data.notes) {
      if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) ||
          typeof note.title !== 'string' || typeof note.markdown !== 'string' ||
          typeof note.path !== 'string') throw new Error('Invalid notes data');
      ids.add(note.id);
    }
    return data;
  }

  function createMarkdownParser(index, currentNote) {
    const parser = new marked.Marked({ gfm: true, breaks: true });
    parser.use({
      extensions: [{
        name: 'wikilink', level: 'inline',
        start(source) { const offset = source.search(/!?\[\[/); return offset < 0 ? undefined : offset; },
        tokenizer(source) {
          const match = /^(!?)\[\[([^\]\n]+)\]\]/.exec(source);
          if (!match) return undefined;
          const [target, ...alias] = match[2].split('|');
          const [path, ...heading] = target.split('#');
          return { type: 'wikilink', raw: match[0], embed: !!match[1], target: path.trim(), heading: heading.join('#').trim(),
            text: alias.join('|').trim() || normalizePath(path).split('/').pop() || heading.join('#') };
        },
        renderer(token) {
          if (token.embed) return '<span class="attachment-note">' + escapeHtml(token.text) + '（附件未同步）</span>';
          const note = token.target ? resolveNote(token.target, index, currentNote) : currentNote;
          if (!note) return '<span class="unavailable-link" title="这篇笔记未收录在随心中">' + escapeHtml(token.text) + '</span>';
          return '<a href="' + escapeHtml(noteHref(note.id, token.heading)) + '">' + escapeHtml(token.text) + '</a>';
        }
      }],
      renderer: {
        image({ text }) { return '<span class="attachment-note">' + escapeHtml(text || '图片') + '（附件未同步）</span>'; }
      }
    });
    return parser;
  }

  // Exposed only for local checks; no password or decrypted state is included.
  globalThis.SuixinCore = { escapeHtml, normalizePath, createNoteIndex, resolveNote, noteHref, parseRoute, searchNotes, validateNotes, createMarkdownParser };
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);
  const state = { data: null, index: null, activeId: '', busy: false, drawerOpen: false, archiveExpanded: false };
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' });
  const mobile = window.matchMedia('(max-width: 760px)');
  let drawerReturnFocus = null;

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '';
  }

  function setDrawer(open) {
    if (open && !mobile.matches) return;
    state.drawerOpen = open;
    document.body.classList.toggle('drawer-open', open);
    $('drawer-backdrop').hidden = !open;
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('sidebar').inert = mobile.matches && !open;
    $('reading-pane').inert = open;
    if (open) { drawerReturnFocus = document.activeElement; $('drawer-close').focus(); }
    else if (drawerReturnFocus) { drawerReturnFocus.focus(); drawerReturnFocus = null; }
  }

  function renderList() {
    const notes = searchNotes(state.data.notes, $('search').value);
    $('note-count').textContent = notes.length + ' 篇';
    $('search-empty').hidden = notes.length > 0;
    $('note-list').replaceChildren();
    for (const note of notes) {
      const link = document.createElement('a');
      link.className = 'note-link';
      link.href = noteHref(note.id);
      if (note.id === state.activeId) link.setAttribute('aria-current', 'page');
      const title = document.createElement('span');
      title.className = 'note-link-title'; title.textContent = note.title;
      const excerpt = document.createElement('span');
      excerpt.className = 'note-link-excerpt'; excerpt.textContent = note.excerpt || '';
      link.append(title, excerpt); $('note-list').append(link);
    }
  }

  function renderLanding() {
    const allNotes = state.data.notes;
    const query = $('archive-search').value.trim();
    const notes = searchNotes(allNotes, query);
    const first = allNotes[0];
    const destination = first ? noteHref(first.id) : '#notes';
    for (const id of ['nav-read', 'latest-note', 'closing-read']) $(id).href = destination;
    $('archive-info').textContent = query ? '找到 ' + notes.length + ' 篇随笔' : '共 ' + allNotes.length + ' 篇随笔 · 持续记录中';
    const expand = $('all-notes');
    expand.hidden = !!query || notes.length <= 3;
    expand.setAttribute('aria-expanded', String(state.archiveExpanded));
    expand.replaceChildren(document.createTextNode(state.archiveExpanded ? '收起随笔' : '展开全部 ' + notes.length + ' 篇随笔'));
    const expandArrow = document.createElement('span');
    expandArrow.setAttribute('aria-hidden', 'true');
    expandArrow.textContent = state.archiveExpanded ? '↑' : '↓';
    expand.append(expandArrow);
    $('story-list').replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'story-empty';
      empty.textContent = query ? '暂时没有找到，换个关键词试试。' : '第一篇随笔，正在来的路上。';
      $('story-list').append(empty);
      return;
    }
    const visibleNotes = query || state.archiveExpanded ? notes : notes.slice(0, 3);
    visibleNotes.forEach((note) => {
      const link = document.createElement('a');
      link.className = 'story-link';
      link.href = noteHref(note.id);
      const number = document.createElement('span');
      number.className = 'story-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(allNotes.indexOf(note) + 1).padStart(2, '0');
      const copy = document.createElement('span');
      copy.className = 'story-copy';
      const title = document.createElement('span');
      title.className = 'story-title';
      title.textContent = note.title;
      copy.append(title);
      if (note.excerpt) {
        const excerpt = document.createElement('span');
        excerpt.className = 'story-excerpt';
        excerpt.textContent = note.excerpt;
        copy.append(excerpt);
      }
      const date = document.createElement('time');
      date.className = 'story-date';
      date.textContent = formatDate(note.updatedAt);
      if (date.textContent) date.dateTime = new Date(note.updatedAt).toISOString();
      const arrow = document.createElement('span');
      arrow.className = 'story-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      link.append(number, copy, date, arrow);
      $('story-list').append(link);
    });
  }

  function sanitizeMarkdown(markdown, note) {
    const parser = createMarkdownParser(state.index, note);
    const dirty = parser.parse(markdown.replace(/^\uFEFF/, ''));
    const fragment = DOMPurify.sanitize(dirty, {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 's', 'blockquote', 'ul', 'ol', 'li',
        'pre', 'code', 'a', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'details', 'summary', 'sub', 'sup', 'mark'],
      ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'type', 'checked', 'disabled', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
    });
    for (const input of fragment.querySelectorAll('input')) {
      if (input.type !== 'checkbox') { input.remove(); continue; }
      input.disabled = true;
    }
    for (const anchor of fragment.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('#note=')) {
        if (!state.data.notes.some((entry) => entry.id === parseRoute(href).id)) replaceUnavailable(anchor);
      } else if (href.startsWith('#')) {
        anchor.href = noteHref(note.id, href.slice(1));
      } else if (/^(https?:|mailto:)/i.test(href)) {
        anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.referrerPolicy = 'no-referrer';
      } else {
        const [path, heading = ''] = href.split('#');
        const destination = resolveNote(path, state.index, note, true);
        if (destination) anchor.href = noteHref(destination.id, heading);
        else replaceUnavailable(anchor);
      }
    }
    const headingCounts = new Map();
    for (const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const text = heading.textContent.trim();
      const count = headingCounts.get(text) || 0;
      headingCounts.set(text, count + 1);
      heading.id = 'section-' + encodeURIComponent(text) + (count ? '-' + count : '');
      heading.dataset.heading = text;
    }
    return fragment;
  }

  function replaceUnavailable(anchor) {
    const span = document.createElement('span');
    span.className = 'unavailable-link'; span.title = '这篇笔记或附件未收录在随心中';
    span.textContent = anchor.textContent; anchor.replaceWith(span);
  }

  function renderArticle(route = parseRoute(location.hash)) {
    if (!state.data) return;
    const isLanding = !route.id;
    const wasReading = !$('reading-view').hidden;
    $('landing').hidden = !isLanding;
    $('reading-view').hidden = isLanding;
    $('app-shell').classList.toggle('landing-view', isLanding);
    document.querySelector('.landing-skip').hidden = !isLanding;
    if (isLanding) {
      setDrawer(false);
      document.title = '随心';
      $('back-to-top').hidden = true;
      if (wasReading && (!location.hash || location.hash === '#')) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        $('landing').querySelector('.site-brand').focus({ preventScroll: true });
      }
      return;
    }
    const notes = state.data.notes;
    const note = route.id ? notes.find((item) => item.id === route.id) : notes[0];
    $('article-navigation').replaceChildren();
    $('article-body').replaceChildren();
    $('article-date').textContent = '';
    $('reading-time').textContent = '';
    if (!note) {
      state.activeId = '';
      $('article-title').textContent = notes.length ? '这篇笔记未找到' : '还没有笔记';
      const paragraph = document.createElement('p');
      paragraph.textContent = notes.length ? '从目录中选择一篇笔记继续阅读。' : '下一次同步后，随心文件夹中的笔记会出现在这里。';
      $('article-body').append(paragraph);
      $('reading-progress').textContent = '';
      document.title = '随心'; renderList(); setDrawer(false); updateReadingProgress(); return;
    }
    state.activeId = note.id;
    $('article-title').textContent = note.title;
    const updated = formatDate(note.updatedAt);
    $('article-date').textContent = updated ? '更新于 ' + updated : '';
    const minutes = Math.max(1, Math.ceil(Array.from(note.markdown.replace(/\s/g, '')).length / 400));
    $('reading-time').textContent = '约 ' + minutes + ' 分钟阅读';
    $('article-body').append(sanitizeMarkdown(note.markdown, note));
    const position = notes.indexOf(note);
    $('reading-progress').textContent = (position + 1) + ' / ' + notes.length;
    for (const [entry, label] of [[notes[position - 1], '上一篇'], [notes[position + 1], '下一篇']]) {
      if (!entry) continue;
      const link = document.createElement('a'); link.href = noteHref(entry.id);
      link.className = label === '下一篇' ? 'article-next' : 'article-previous';
      const small = document.createElement('small'); small.textContent = label;
      const title = document.createElement('span'); title.textContent = entry.title;
      link.append(small, title); $('article-navigation').append(link);
    }
    document.title = note.title + ' · 随心';
    $('reading-status').textContent = '已打开 ' + note.title;
    renderList(); setDrawer(false);
    if (route.heading) {
      let name = route.heading;
      try { name = decodeURIComponent(name); } catch (_) { /* Keep literal names. */ }
      const heading = Array.from($('article-body').querySelectorAll('[data-heading]')).find((element) =>
        element.dataset.heading === name || element.dataset.heading.toLocaleLowerCase().replace(/\s+/g, '-') === name);
      if (heading) { heading.scrollIntoView({ block: 'start', behavior: 'instant' }); updateReadingProgress(); return; }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('article').focus({ preventScroll: true });
    updateReadingProgress();
  }

  let progressFrame = 0;
  function updateReadingProgress() {
    progressFrame = 0;
    if ($('reading-view').hidden) return;
    const article = $('article');
    const start = article.getBoundingClientRect().top + window.scrollY;
    const distance = start + article.offsetHeight - window.innerHeight;
    const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 1;
    $('reading-track-fill').style.transform = 'scaleX(' + progress.toFixed(4) + ')';
    $('back-to-top').hidden = window.scrollY < 500;
  }
  function scheduleProgress() {
    if (!progressFrame) progressFrame = requestAnimationFrame(updateReadingProgress);
  }
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', scheduleProgress, { passive: true });
  $('back-to-top').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('article').focus({ preventScroll: true });
  });

  async function loadNotes() {
    if (state.busy) return;
    state.busy = true;
    $('load-retry').hidden = true;
    $('load-status').textContent = '正在加载笔记…';
    try {
      const response = await fetch('./notes.json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Notes unavailable');
      state.data = validateNotes(await response.json());
      state.index = createNoteIndex(state.data.notes);
      const updated = formatDate(state.data.updatedAt);
      $('site-updated').textContent = updated ? '同步于 ' + updated : '';
      $('load-screen').hidden = true;
      $('app-shell').hidden = false;
      $('sidebar').inert = mobile.matches;
      renderList();
      renderLanding();
      renderArticle();
      requestAnimationFrame(() => $('app-shell').classList.add('is-ready'));
    } catch (_) {
      state.data = null;
      $('load-status').textContent = '笔记暂时无法加载，请稍后重试。';
      $('load-retry').hidden = false;
      if (!parseRoute(location.hash).id) {
        const message = document.createElement('p');
        message.className = 'story-empty';
        message.textContent = '随笔暂时无法加载。';
        const retry = document.createElement('button');
        retry.className = 'text-link';
        retry.type = 'button';
        retry.textContent = '重新加载 ↗';
        retry.addEventListener('click', loadNotes);
        $('story-list').replaceChildren(message, retry);
      }
    } finally { state.busy = false; }
  }
  $('load-retry').addEventListener('click', loadNotes);
  $('mobile-home').addEventListener('click', () => { location.hash = ''; });

  $('search').addEventListener('input', () => { if (state.data) renderList(); });
  $('archive-search').addEventListener('input', () => { if (state.data) renderLanding(); });
  $('all-notes').addEventListener('click', () => {
    state.archiveExpanded = !state.archiveExpanded;
    renderLanding();
    if (!state.archiveExpanded) $('story-list').scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  $('menu-toggle').addEventListener('click', () => setDrawer(!state.drawerOpen));
  $('drawer-close').addEventListener('click', () => setDrawer(false));
  $('drawer-backdrop').addEventListener('click', () => setDrawer(false));
  $('home-link').addEventListener('click', (event) => {
    event.preventDefault();
    location.hash = '';
    setDrawer(false);
  });
  $('note-list').addEventListener('click', (event) => {
    if (event.target.closest('a')) setDrawer(false);
  });
  window.addEventListener('hashchange', () => renderArticle());
  mobile.addEventListener('change', () => { setDrawer(false); $('sidebar').inert = mobile.matches; });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        !event.target.closest('input,textarea,select,[contenteditable="true"]')) {
      event.preventDefault();
      if (!$('reading-view').hidden && mobile.matches) setDrawer(true);
      const input = $('reading-view').hidden ? $('archive-search') : $('search');
      input.focus();
      return;
    }
    if (!state.drawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
    if (event.key === 'Tab') {
      const elements = Array.from($('sidebar').querySelectorAll('a[href],button,input')).filter((element) => !element.disabled && element.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('sidebar').inert = mobile.matches;
  if (!parseRoute(location.hash).id) {
    $('load-screen').hidden = true;
    $('app-shell').hidden = false;
    requestAnimationFrame(() => $('app-shell').classList.add('is-ready'));
  }
  loadNotes();
})();
