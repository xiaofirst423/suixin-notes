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
    const plain = String(hash || '').replace(/^#/, '');
    const kind = route.has('note') ? 'reading' : route.has('exhibit') ? 'exhibit' : ['index', 'notes'].includes(plain) ? 'index' : ['end', 'about'].includes(plain) ? 'end' : 'entrance';
    return { kind, id: route.get('note') || route.get('exhibit') || '', heading: route.get('heading') || '' };
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

  function sanitizeMarkdown(markdown, note, index, notes) {
    const parser = createMarkdownParser(index, note);
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
        if (!notes.some((entry) => entry.id === parseRoute(href).id)) replaceUnavailable(anchor);
      } else if (href.startsWith('#')) {
        anchor.href = noteHref(note.id, href.slice(1));
      } else if (/^(https?:|mailto:)/i.test(href)) {
        anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.referrerPolicy = 'no-referrer';
      } else {
        const [path, heading = ''] = href.split('#');
        const destination = resolveNote(path, index, note, true);
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


  function sortNotes(notes) {
    const time = note => Number.isFinite(Date.parse(note.updatedAt)) ? Date.parse(note.updatedAt) : 0;
    return [...notes].sort((a,b) => time(b) - time(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  function sceneVariant(id) {
    let hash = 2166136261;
    for (const char of String(id)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    return hash % 3;
  }
  function exhibitHref(id) { return '#' + new URLSearchParams({exhibit:id}); }
  function excerptText(note, maximum = 86) {
    const characters = Array.from(String(note.excerpt || '').replace(/\s+/g,' ').trim());
    return characters.length > maximum ? characters.slice(0,maximum).join('') + '…' : characters.join('');
  }

  globalThis.SuixinCore = { escapeHtml, normalizePath, createNoteIndex, resolveNote, noteHref, exhibitHref, parseRoute, searchNotes, validateNotes, createMarkdownParser, sanitizeMarkdown, sortNotes, sceneVariant, excerptText };
})();
