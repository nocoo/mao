import './assets/poems.js';

const $ = (id) => document.getElementById(id);
const library = window.POEM_LIBRARY;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialogs = [...document.querySelectorAll('dialog')];
const previousFocus = new WeakMap();
const closingDialogs = new WeakSet();
let toastTimer;

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

function openDialog(dialog, focusElement) {
  if (dialog.open || closingDialogs.has(dialog)) return;
  previousFocus.set(dialog, document.activeElement);
  dialog.showModal();
  if (!reducedMotion.matches) {
    dialog.animate([
      { opacity: 0, transform: 'translateX(32px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
  (focusElement || dialog.querySelector('[data-close]')).focus({ preventScroll: true });
}

async function closeDialog(dialog, restoreFocus = true) {
  if (!dialog.open || closingDialogs.has(dialog)) return;
  closingDialogs.add(dialog);
  if (!reducedMotion.matches) {
    await dialog.animate([
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: 'translateX(24px)' },
    ], { duration: 180, easing: 'ease-out' }).finished.catch(() => {});
  }
  dialog.close();
  closingDialogs.delete(dialog);
  if (restoreFocus && previousFocus.get(dialog)?.isConnected) {
    previousFocus.get(dialog).focus({ preventScroll: true });
  }
}

for (const dialog of dialogs) {
  dialog.querySelector('[data-close]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
}
$('open-about').addEventListener('click', () => openDialog($('about-dialog')));

if (!Array.isArray(library?.poems) || !library.poems.length) {
  $('reader-error').hidden = false;
  $('reader-error').textContent = '诗词资料未能载入。请运行 pnpm build:data 后刷新页面。';
  $('poem-page').setAttribute('aria-busy', 'false');
  document.querySelectorAll('.reading-actions button, #open-catalog, #quick-catalog, #open-notes, #copy-poem').forEach(button => { button.disabled = true; });
} else {
  const poems = library.poems;
  const byId = new Map(poems.map((poem, index) => [poem.id, index]));
  const randomIndices = poems.map((_, index) => index);
  const groups = ['正编', '副编', '补编'];
  let currentIndex = -1;
  let shuffleBag = [];
  let selectionSerial = 0;
  let activeTransition;
  let collection = '全部';
  let selectedTab = '注释';

  document.querySelectorAll('[data-count="total"]').forEach(node => { node.textContent = poems.length; });
  document.querySelectorAll('[data-collection]').forEach(button => {
    button.querySelector('span').textContent = button.dataset.collection === '全部' ? poems.length : poems.filter(poem => poem.collection === button.dataset.collection).length;
  });

  function randomIndex() {
    if (!shuffleBag.length) {
      shuffleBag = [...randomIndices];
      for (let i = shuffleBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
      }
    }
    if (shuffleBag.at(-1) === currentIndex && shuffleBag.length > 1) {
      [shuffleBag[0], shuffleBag[shuffleBag.length - 1]] = [shuffleBag.at(-1), shuffleBag[0]];
    }
    const index = shuffleBag.pop();
    return index === currentIndex && randomIndices.length > 1 ? randomIndex() : index;
  }

  function hashIndex() {
    const id = new URLSearchParams(location.hash.slice(1)).get('poem');
    return id !== null && byId.has(id) ? byId.get(id) : null;
  }

  // Join short typographic lines into phrases; do not rewrite any Chinese characters.
  function displayLines(body) {
    const phrases = [];
    let pending = '';
    for (const original of body) {
      const line = original.replace(/,/g, '，').replace(/\./g, '。').trim();
      if (pending && [...pending + line].length > 27) {
        phrases.push(pending);
        pending = '';
      }
      pending += line;
      if (/[。！？!?；;）]$/.test(pending) || [...pending].length >= 24) {
        phrases.push(pending);
        pending = '';
      }
    }
    if (pending) phrases.push(pending);
    return phrases;
  }

  function renderPoem(index, mode) {
    const poem = poems[index];
    currentIndex = index;
    const hasSubject = poem.title.includes('·');
    const heading = hasSubject ? poem.subject : poem.title;
    $('poem-title').textContent = heading;
    $('poem-title').classList.toggle('long-title', [...heading].length > 12);
    $('poem-form').textContent = hasSubject ? poem.form : '诗词选读';
    $('poem-author').textContent = poem.collection === '补编' ? '补编资料' : '毛泽东';
    $('poem-date').textContent = poem.date === '未标明' ? '原文未标年代' : poem.date.replace(/，.*$/, '');
    $('poem-id').textContent = poem.id;
    $('poem-collection').textContent = poem.collection;
    $('reading-mode').textContent = mode === 'random' ? '今日偶读' : mode === 'catalog' ? '目录选读' : '顺卷阅览';
    $('poem-page').setAttribute('aria-busy', 'false');
    $('poem-page').dataset.poemId = poem.id;
    $('poem-body').classList.toggle('is-long', poem.body.join('').length > 280);
    const lines = displayLines(poem.body);
    const fragment = document.createDocumentFragment();
    lines.forEach((text, i) => {
      const p = element('p', 'verse-line', text);
      if (i > 0 && lines.length > 6 && i === Math.ceil(lines.length / 2)) p.classList.add('verse-gap');
      fragment.append(p);
    });
    $('poem-body').replaceChildren(fragment);
    $('poem-page').scrollTop = 0;
    // Prefaces and all explanatory material live in the optional reading sheet.
    $('poem-preface').hidden = true;
    $('source-link').href = encodeURI(poem.path);
    document.title = `${poem.title} · 毛主席诗词 · 山河诗卷`;
    $('reading-announcement').textContent = `${poem.collection}，编号 ${poem.id}，${poem.title}，${poem.date}`;
    $('copy-poem').setAttribute('aria-label', `复制《${poem.title}》`);
    if ($('notes-dialog').open) renderNotes();
    if ($('catalog-dialog').open) renderCatalog();
  }

  function selectPoem(index, { mode = 'sequential', history = true, initial = false } = {}) {
    if (!Number.isInteger(index) || !poems[index]) return;
    if (!initial && index === currentIndex) return;
    const serial = ++selectionSerial;
    activeTransition?.skipTransition();
    currentIndex = index;
    const update = () => { if (serial === selectionSerial) renderPoem(index, mode); };
    if (!initial && !reducedMotion.matches && document.startViewTransition && !dialogs.some(dialog => dialog.open)) {
      activeTransition = document.startViewTransition(update);
      activeTransition.finished.catch(() => {}).finally(() => { if (serial === selectionSerial) activeTransition = null; });
    } else {
      update();
      if (!initial && !reducedMotion.matches) $('poem-page').animate([
        { opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
    if (history) {
      const href = `#poem=${encodeURIComponent(poems[index].id)}`;
      if (initial) window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
    }
  }

  function pickRandom() {
    selectPoem(randomIndex(), { mode: 'random' });
    if (!reducedMotion.matches) {
      $('random-poem').querySelector('.icon').animate([
        { transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' },
      ], { duration: 440, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      document.querySelector('.star-glint').animate([
        { transform: 'translateX(-140%)', opacity: 0 },
        { opacity: .8, offset: .4 },
        { transform: 'translateX(140%)', opacity: 0 },
      ], { duration: 900, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
  }

  $('previous-poem').addEventListener('click', () => selectPoem((currentIndex - 1 + poems.length) % poems.length));
  $('next-poem').addEventListener('click', () => selectPoem((currentIndex + 1) % poems.length));
  $('random-poem').addEventListener('click', pickRandom);
  const restoreHash = () => {
    const index = hashIndex();
    if (index !== null && index !== currentIndex) selectPoem(index, { history: false });
  };
  window.addEventListener('popstate', restoreHash);
  window.addEventListener('hashchange', restoreHash);

  const searchKey = (text) => text.toLowerCase().replace(/[\s·，。；、：?!？！:;,.]/g, '');
  const searchable = poems.map(poem => searchKey(`${poem.id} ${poem.title} ${poem.date} ${poem.body.join('')}`));

  function renderCatalog() {
    const query = searchKey($('poem-search').value.trim());
    const matches = poems.filter((poem, index) => (collection === '全部' || collection === poem.collection) && (!query || searchable[index].includes(query)));
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const groupPoems = matches.filter(poem => poem.collection === group);
      if (!groupPoems.length) continue;
      fragment.append(element('h3', 'catalog-group-title', `${group} / ${groupPoems.length} 篇`));
      for (const poem of groupPoems) {
        const button = element('button', 'catalog-entry');
        button.type = 'button';
        button.dataset.poemId = poem.id;
        button.setAttribute('aria-label', `${poem.id} ${poem.title}${poem.year ? `，${poem.year}年` : ''}`);
        if (poem.id === poems[currentIndex].id) button.setAttribute('aria-current', 'true');
        button.append(element('span', 'catalog-entry-number', poem.id), element('span', 'catalog-entry-name', poem.title), element('span', 'catalog-entry-year', poem.year ?? '未详'), icon('arrow-right'));
        fragment.append(button);
      }
    }
    $('catalog-results').replaceChildren(fragment);
    $('catalog-results').hidden = !matches.length;
    $('catalog-empty').hidden = Boolean(matches.length);
    $('result-count').textContent = query ? `寻到 ${matches.length} 篇` : `共 ${matches.length} 篇`;
  }

  function openCatalog() {
    renderCatalog();
    openDialog($('catalog-dialog'), $('poem-search'));
  }
  $('open-catalog').addEventListener('click', openCatalog);
  $('quick-catalog').addEventListener('click', openCatalog);
  $('poem-search').addEventListener('input', renderCatalog);
  document.querySelectorAll('[data-collection]').forEach(button => {
    button.addEventListener('click', () => {
      collection = button.dataset.collection;
      document.querySelectorAll('[data-collection]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      renderCatalog();
    });
  });
  $('clear-search').addEventListener('click', () => {
    $('poem-search').value = '';
    collection = '全部';
    document.querySelectorAll('[data-collection]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.collection === collection)));
    renderCatalog();
    $('poem-search').focus();
  });
  $('catalog-results').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-poem-id]');
    if (!button) return;
    const index = byId.get(button.dataset.poemId);
    await closeDialog($('catalog-dialog'), false);
    selectPoem(index, { mode: 'catalog' });
    $('poem-title').setAttribute('tabindex', '-1');
    $('poem-title').focus({ preventScroll: true });
  });

  // Only the small Markdown subset used by the source notes is rendered, without innerHTML.
  function appendInline(parent, text) {
    const tokens = /\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))\)|\*\*([^*]+)\*\*/g;
    let position = 0;
    for (const match of text.matchAll(tokens)) {
      parent.append(document.createTextNode(text.slice(position, match.index)));
      if (match[4]) {
        parent.append(element('strong', '', match[4]));
      } else {
        const href = match[2] || match[3];
        let safe = false;
        let url;
        try {
          url = new URL(href, new URL(poems[currentIndex].path, document.baseURI));
          safe = ['https:', 'http:'].includes(url.protocol) || (url.protocol === 'file:' && url.href.startsWith(new URL('.', document.baseURI).href));
        } catch { /* Invalid source links stay legible as plain text. */ }
        if (safe) {
          const link = element('a', '', match[1]);
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          parent.append(link);
        } else parent.append(document.createTextNode(match[1]));
      }
      position = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(position)));
  }

  function renderProse(text) {
    const prose = element('div', 'note-prose');
    const normalized = text.replace(/\r/g, '').replace(/\n(?=(?:〔|（\d+）|\(\d+\)|- ))/g, '\n\n');
    const paragraphs = normalized.split(/\n\s*\n/).filter(part => part.trim());
    for (const raw of paragraphs) {
      const content = raw.trim();
      const heading = content.match(/^#{1,6}\s+(.+)$/);
      const block = element(heading ? 'h3' : content.startsWith('>') ? 'blockquote' : 'p');
      const clean = heading ? heading[1] : content.replace(/^> ?/gm, '').replace(/^[-*] /gm, '');
      const term = clean.match(/^(〔[^〕]+〕|（\d+）[^：:]{1,28}[：:])/);
      if (term) {
        block.append(element('span', 'note-term', term[0]));
        appendInline(block, clean.slice(term[0].length));
      } else appendInline(block, clean);
      prose.append(block);
    }
    return prose;
  }

  function noteBlock(source, text) {
    const section = element('section', 'note-block');
    section.append(element('p', 'note-source', source), renderProse(text));
    return section;
  }

  function renderNotes() {
    const poem = poems[currentIndex];
    $('notes-title').textContent = poem.title;
    $('notes-poem-form').textContent = `${poem.collection} · 编次 ${poem.id} · ${poem.date}`;
    $('source-link').href = encodeURI(poem.path);
    const fragment = document.createDocumentFragment();
    if (selectedTab === '资料') {
      const editorial = poem.notes.filter(note => note.kind === '编者说明');
      for (const note of editorial) fragment.append(noteBlock(note.source, note.text));
      for (const version of [...poem.versions].sort((a, b) => Number(b.source === '品读版') - Number(a.source === '品读版'))) {
        const details = element('details', 'source-disclosure');
        details.append(element('summary', '', `${version.source} · 完整条目`));
        details.addEventListener('toggle', () => {
          if (details.open && details.children.length === 1) details.append(renderProse(version.text));
        });
        fragment.append(details);
      }
    } else {
      const entries = poem.notes.filter(note => note.kind === selectedTab).sort((a, b) => Number(b.source === '品读版') - Number(a.source === '品读版'));
      if (selectedTab === '题解' && poem.preface) fragment.append(noteBlock('诗前说明', poem.preface));
      for (const entry of entries) fragment.append(noteBlock(`${entry.source} · ${entry.kind}`, entry.text));
      if (!entries.length && !(selectedTab === '题解' && poem.preface)) {
        const empty = element('div', 'note-empty');
        empty.append(element('p', '', `这一页，未附${selectedTab}`), element('p', '', '可以继续读诗，或到「版本与备注」查看完整资料。'));
        fragment.append(empty);
      }
    }
    $('notes-panel').replaceChildren(fragment);
    const tab = document.querySelector(`[data-tab="${selectedTab}"]`);
    $('notes-panel').setAttribute('aria-labelledby', tab.id);
  }

  function changeTab(button, focus = false) {
    selectedTab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.setAttribute('aria-selected', String(tab === button));
      tab.tabIndex = tab === button ? 0 : -1;
    });
    renderNotes();
    if (focus) button.focus();
  }

  $('open-notes').addEventListener('click', () => {
    changeTab($('tab-annotations'));
    openDialog($('notes-dialog'));
    $('notes-dialog').scrollTop = 0;
  });
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => changeTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); changeTab(tabs[next], true); }
    });
  });

  $('copy-poem').addEventListener('click', async () => {
    const poem = poems[currentIndex];
    const text = `${poem.title}\n${poem.collection === '补编' ? '补编资料' : '毛泽东'} · ${poem.date}\n\n${displayLines(poem.body).join('\n')}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      notify('诗句已复制');
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($('poem-body'));
      selection.removeAllRanges();
      selection.addRange(range);
      notify('已选中诗句，请按 ⌘C 或 Ctrl+C 复制');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || dialogs.some(dialog => dialog.open)) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === '/') { event.preventDefault(); openCatalog(); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); pickRandom(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); selectPoem((currentIndex - 1 + poems.length) % poems.length); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); selectPoem((currentIndex + 1) % poems.length); }
  });

  const first = hashIndex();
  selectPoem(first ?? randomIndex(), { mode: first === null ? 'random' : 'catalog', initial: true });
}
