import './assets/poems.js';
import manifest from './audio/manifest.json';
import illustrations from './data/illustrations.json';
import { version } from './package.json';
import { createLibraryViewModel } from './src/view-model.js';
import { createPlayer } from './src/player.js';
import { artwork } from './src/art.js';

const $ = selector => document.querySelector(selector);
const analysisFiles = import.meta.glob('./data/analysis/*.json', { eager: true, import: 'default' });
const analyses = Object.fromEntries(Object.values(analysisFiles).map(analysis => [analysis.id, analysis]));
const library = createLibraryViewModel(window.POEM_LIBRARY, manifest, analyses);
const byId = new Map(library.map(poem => [poem.id, poem]));
const groups = ['正编', '副编', '补编'];
const app = $('#app');
const scroll = $('#scroll');
const poemNode = $('#poem');
const matrix = $('#matrix');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current;
let pending;
let swapTimer;
let filter = '全部';
let notesVisible = true;
let vertical = false;
let activeNote = -1;
let activeNoteType = 'inline';
let noteAnchor;
let notePosition;
let matrixFocus;
let layoutAnimations = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setIndex(open) {
  app.dataset.index = open ? '1' : '0';
  $('#tIndex').setAttribute('aria-pressed', String(open));
  $('#index').inert = !open;
}

function setMatrix(open) {
  if (open) {
    closeNote();
    matrixFocus = document.activeElement;
  }
  matrix.classList.toggle('in', open);
  matrix.inert = !open;
  matrix.setAttribute('aria-hidden', String(!open));
  if (open) $('#mxX').focus();
  else matrixFocus?.focus();
}

function searchText(text) {
  return text.toLowerCase().replace(/[\s·，。；、：?!？！:;,.]/g, '');
}

function renderIndex() {
  const q = searchText($('#q').value.trim());
  const matches = library.filter(p => (filter === '全部' || p.collection === filter) && (!q || searchText(`${p.id} ${p.title} ${p.date} ${p.body.join('')}`).includes(q)));
  const chips = $('#chips');
  chips.replaceChildren();
  for (const name of ['全部', ...groups]) {
    const button = el('button', 'chip', name);
    button.dataset.filter = name;
    button.setAttribute('aria-pressed', String(filter === name));
    button.append(el('b', '', String(name === '全部' ? library.length : library.filter(p => p.collection === name).length)));
    chips.append(button);
  }
  const list = $('#list');
  list.replaceChildren();
  for (const group of groups) {
    const records = matches.filter(p => p.collection === group);
    if (!records.length) continue;
    const heading = el('div', 'grp-h');
    heading.append(el('span', '', group), el('i'), el('b', '', String(records.length)));
    list.append(heading);
    for (const p of records) {
      const button = el('button', `row${p.audio ? ' open' : ' off'}`);
      button.dataset.id = p.id;
      if (p.id === current?.id) button.setAttribute('aria-current', 'true');
      const name = el('span', 'nm');
      if (p.title.includes('·')) name.append(el('em', '', p.form), el('strong', '', p.subject));
      else name.append(el('strong', '', p.title));
      button.append(el('span', 'no', p.id), name, el('span', 'yr', p.year ? String(p.year) : '未详'));
      list.append(button);
    }
  }
  if (!matches.length) list.append(el('div', 'ix-empty', '没有匹配的篇目'));
}

function renderMatrix() {
  const cells = $('#cells');
  cells.replaceChildren();
  library.forEach((p, index) => {
    const button = el('button', `cell${p.audio ? ' open' : ''}${p.id === current?.id ? ' cur' : ''}`);
    button.dataset.id = p.id;
    button.style.setProperty('--i', Math.min(index, 50));
    button.setAttribute('aria-label', `${p.id} ${p.title}，${p.audio ? '有录音' : '录音待补'}`);
    button.append(el('span', 'n', p.id), el('span', 't', p.title));
    cells.append(button);
  });
  $('#mxS').textContent = `${library.length} 篇资料 · ${library.filter(p => p.audio).length} 段录音`;
}

function linesForDisplay(body) {
  const lines = [];
  let line = '';
  for (const part of body) {
    const next = part.replace(/,/g, '，').replace(/\./g, '。').trim();
    if (line && [...line + next].length > 24) { lines.push(line); line = ''; }
    line += next;
    if (/[。！？!?；;）]$/.test(line) || [...line].length >= 20) { lines.push(line); line = ''; }
  }
  if (line) lines.push(line);
  return lines;
}

const punctuation = /[，。；、：？！“”《》—·]/;
const clauseBreak = /[，。；：？！]/;

function renderLine(text, annotations, used, rhymeOffsets, lineNumber) {
  const line = el('p', 'ln');
  let clause = el('span', 'cl');
  line.append(clause);
  function append(textPart, start, term = null) {
    for (let i = 0; i < textPart.length;) {
      const character = String.fromCodePoint(textPart.codePointAt(i));
      const glyph = el('span', `c${punctuation.test(character) ? ' pu' : ''}${rhymeOffsets.has(start + i) ? ' rh' : ''}`, character);
      glyph.style.setProperty('--d', Math.min(lineNumber * 85 + (start + i) * 17, 1500));
      (term || clause).append(glyph);
      i += character.length;
      if (!term && clauseBreak.test(character) && start + i < text.length && !punctuation.test(text[start + i])) {
        clause = el('span', 'cl');
        line.append(clause);
      }
    }
  }
  let pos = 0;
  while (pos < text.length) {
    let match;
    annotations.forEach((note, index) => {
      if (!note.key || used.has(index)) return;
      const at = text.indexOf(note.key, pos);
      if (at >= 0 && (!match || at < match.at || (at === match.at && note.key.length > match.key.length))) match = { at, key: note.key, index };
    });
    if (!match) { append(text.slice(pos), pos); break; }
    append(text.slice(pos, match.at), pos);
    const term = el('button', 'term');
    term.dataset.note = String(match.index);
    term.disabled = !notesVisible;
    term.dataset.k = String(match.index + 1);
    term.setAttribute('aria-label', `注释 ${match.index + 1}：${match.key}`);
    clause.append(term);
    append(match.key, match.at, term);
    used.add(match.index);
    pos = match.at + match.key.length;
  }
  return line;
}

function renderBody(p) {
  poemNode.replaceChildren();
  poemNode.style.setProperty('--sg', p.structure.stanzas.some(part => part.label === '首联') ? '.42em' : '.7em');
  if (p.preface) poemNode.append(el('p', 'pre', p.preface));
  const annotations = p.inlineAnnotations;
  const used = new Set();
  let lineNumber = 0;
  const rhymeMarks = new Map();
  for (const mark of p.structure.rhymeMarks) {
    if (!rhymeMarks.has(mark.lineIndex)) rhymeMarks.set(mark.lineIndex, []);
    rhymeMarks.get(mark.lineIndex).push(mark.offset);
  }
  for (const part of p.structure.stanzas) {
    const stanza = el('div', 'st');
    stanza.dataset.l = part.label;
    stanza.setAttribute('role', 'group');
    stanza.setAttribute('aria-label', part.label);
    let text = '';
    let rhymeOffsets = new Set();
    function flush() {
      if (!text) return;
      stanza.append(renderLine(text, annotations, used, rhymeOffsets, lineNumber++));
      text = '';
      rhymeOffsets = new Set();
    }
    for (const index of part.lineIndexes) {
      const verse = p.body[index].replace(/,/g, '，').replace(/\./g, '。').trim();
      const offsets = rhymeMarks.get(index) || [];
      const pieces = verse.length > 24 ? [...verse.matchAll(/.+?[，。；？！!?;]|.+$/g)] : [{ 0: verse, index: 0 }];
      for (const piece of pieces) {
        if (text && [...text + piece[0]].length > 24) flush();
        for (const offset of offsets) {
          if (offset >= piece.index && offset < piece.index + piece[0].length) {
            rhymeOffsets.add(text.length + offset - piece.index);
          }
        }
        text += piece[0];
        if (/[。！？!?；;）]$/.test(text) || [...text].length >= 20) flush();
      }
    }
    flush();
    poemNode.append(stanza);
  }
  poemNode.classList.toggle('no-notes', !notesVisible);
  poemNode.classList.remove('show-rhyme');
  $('#aRhyme').disabled = !p.structure.rhymeMarks.length;
  $('#aRhyme').title = p.structure.rhymeMarks.length ? p.structure.rhymeNote || '显示或隐藏韵脚' : '韵脚暂未核定';
  $('#aRhyme').setAttribute('aria-label', p.structure.rhymeNote ? `韵脚：${p.structure.rhymeNote}` : '显示或隐藏韵脚');
  $('#aRhyme').setAttribute('aria-pressed', 'false');
  $('#aNotesN').textContent = annotations.length;
  $('#aNotes').disabled = !annotations.length;
}

function updateVerticalHint() {
  if (!vertical) return;
  const wrap = $('#poemWrap');
  $('#verticalHint').textContent = wrap.scrollWidth > wrap.clientWidth + 1 ? '右起竖读 · 横向滑动' : '右起竖读';
}

function block(number, title, className) {
  const article = el('article', `blk ${className} rv in`);
  const heading = el('h3');
  heading.append(el('i', '', number), document.createTextNode(title));
  article.append(heading);
  return article;
}

function addTextBlocks(container, records, empty) {
  if (!records.length) { container.append(el('p', 'empty', empty)); return; }
  for (const record of records) {
    const section = el('div', 'study-source');
    section.append(el('div', 'source-label', record.source));
    for (const text of record.text.split(/\n\s*\n/).filter(Boolean)) section.append(el('p', '', text));
    container.append(section);
  }
}

function displayAnnotation(note) {
  const text = note.text.replace(/\n\s*\n(\d{1,4})\s*$/, '\n\n原文末尾另列数字：$1');
  return `${note.source} · ${text}`;
}

function renderStudy(p) {
  const study = $('#study');
  study.replaceChildren();
  const header = el('header', 'st-h rv in');
  header.append(el('span', 'k', '鉴赏'), el('span', 'e', 'APPRECIATION'), el('i'), el('span', 't', p.title));
  study.append(header);
  const facts = block('01', '档案', 'b-facts');
  const dl = el('dl', 'facts');
  const factsRows = [['编次', p.id], ['编目', p.collection], ['体裁', p.form], ['时间', p.date], ['录音', p.audio ? '合成朗诵' : '待补']];
  if (p.structure.rhymeNote) factsRows.push(['用韵', p.structure.rhymeNote]);
  for (const [label, value] of factsRows) {
    const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); dl.append(row);
  }
  facts.append(dl); study.append(facts);
  const context = block('02', '题解', 'b-bg');
  if (p.preface) addTextBlocks(context, [{ source: '诗前说明', text: p.preface }], '');
  addTextBlocks(context, p.context, p.preface ? '' : '这篇资料未附题解。');
  study.append(context);
  const analysis = block('03', '赏析', 'b-ap');
  const grid = el('div', 'ap-grid');
  const prose = el('div');
  addTextBlocks(prose, p.appreciation, '这篇资料未附赏析。');
  const quote = el('blockquote', 'quote');
  quote.append(el('q', '', linesForDisplay(p.body)[0]), el('cite', '', `${p.title} ／ ${p.date}`));
  grid.append(prose, quote); analysis.append(grid); study.append(analysis);
  const annotations = block('04', '注释', 'b-nt');
  const list = el('ol', 'notes');
  p.annotations.forEach((note, index) => {
    const li = el('li');
    const button = el('button'); button.dataset.note = String(index);
    const text = el('span');
    text.append(el('span', 'k', note.key || '注释'), el('span', 'd', displayAnnotation(note)));
    button.append(el('span', 'n', String(index + 1).padStart(2, '0')), text); li.append(button); list.append(li);
  });
  if (p.annotations.length) annotations.append(list); else annotations.append(el('p', 'empty', '这篇资料未附注释。'));
  study.append(annotations);
  const versions = block('05', '版本与备注', 'b-gl');
  addTextBlocks(versions, p.remarks, '');
  for (const version of p.versions) {
    const details = el('details', 'source-disclosure');
    details.append(el('summary', '', `${version.source} · 完整条目`), el('pre', '', version.text));
    versions.append(details);
  }
  const source = el('a', 'source-link', '打开原始文档 ↗');
  source.href = encodeURI(p.path); source.target = '_blank'; source.rel = 'noopener noreferrer';
  versions.append(source); study.append(versions);
  const footer = el('footer', 'colophon rv in');
  footer.append(el('span', '', `《${p.title}》`), el('i'), el('span', '', `№ ${p.id}`));
  study.append(footer);
}

function closeNote() {
  if ($('#pop').contains(document.activeElement) && noteAnchor?.isConnected) noteAnchor.focus({ preventScroll: true });
  activeNote = -1;
  $('#pop').classList.remove('in');
  $('#pop').inert = true;
  $('#pop').setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.term.sel').forEach(node => node.classList.remove('sel'));
}

function openNote(index, anchor, type = 'inline') {
  const notes = type === 'inline' ? current.inlineAnnotations : current.annotations;
  const note = notes[index];
  if (!note || !anchor) return;
  closeNote(); activeNote = index; activeNoteType = type; noteAnchor = anchor;
  anchor.classList.add('sel');
  $('#popN').textContent = String(index + 1).padStart(2, '0');
  $('#popK').textContent = note.key || '注释';
  $('#popT').textContent = displayAnnotation(note);
  $('#popI').textContent = `${index + 1} / ${notes.length}`;
  const pop = $('#pop');
  const rect = anchor.getBoundingClientRect();
  notePosition = { top: rect.top, left: rect.left };
  const width = Math.min(360, innerWidth - 24);
  const x = Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  pop.style.left = `${x}px`;
  pop.style.top = `${Math.max(8, Math.min(innerHeight - pop.offsetHeight - 12, rect.bottom + 14))}px`;
  pop.style.setProperty('--ax', `${Math.max(18, Math.min(width - 18, rect.left + rect.width / 2 - x))}px`);
  pop.inert = false;
  pop.setAttribute('aria-hidden', 'false');
  pop.classList.add('in');
  $('#popX').focus({ preventScroll: true });
}

function render(p) {
  current = p; closeNote();
  document.title = `${p.title} · 毛泽东诗词鉴赏`;
  $('#hero').dataset.poemId = p.id;
  const folio = p.id.padStart(3, '0');
  $('#hudNo').textContent = folio;
  $('#hudForm').textContent = p.structure.formLabel;
  $('#hudPlace').textContent = p.year ? `${p.year} · ${p.collection}` : p.collection;
  $('#bignum').textContent = folio;
  $('#plNo').textContent = folio;
  $('#dt').textContent = p.structure.displayDate || p.date;
  $('#author').textContent = p.collection === '补编' ? '补编资料' : '毛泽东';
  const caption = p.title.includes('·') ? p.form : '诗词选读';
  $('#cp').replaceChildren(...[...caption].map(character => el('span', '', character)));
  const title = p.title.includes('·') ? p.subject : p.title;
  const heading = $('#tt');
  heading.replaceChildren();
  heading.setAttribute('aria-label', p.title);
  heading.dataset.t = title;
  [...title].forEach((character, index) => {
    const wrapper = el('span', 'ch');
    const glyph = el('i', '', character);
    glyph.style.setProperty('--i', index);
    wrapper.append(glyph);
    heading.append(wrapper);
  });
  heading.style.setProperty('--tk', title.length <= 1 ? 1 : title.length <= 2 ? .94 : title.length <= 4 ? .62 : .4);
  renderBody(p);
  updateVerticalHint();
  const illustration = illustrations[p.id];
  const plate = $('#plate');
  const art = $('#plArt');
  plate.classList.toggle('has-generated', Boolean(illustration));
  plate.setAttribute('aria-label', `《${p.title}》配图`);
  if (illustration) {
    const image = el('img', 'pl-img');
    image.alt = `《${p.title}》配图`;
    image.addEventListener('error', () => {
      if (art.contains(image)) art.replaceChildren(el('span', 'pl-error', '配图暂时无法加载'));
    });
    image.src = illustration;
    art.replaceChildren(image);
  } else {
    art.innerHTML = artwork(Math.floor(Math.random() * 3));
  }
  $('#plSlogan').textContent = '';
  $('#plCap').textContent = `《${p.title}》`;
  const ticker = $('#tk'); ticker.replaceChildren();
  const excerpts = linesForDisplay(p.body).slice(0, 4);
  for (let i = 0; i < 6; i++) for (const excerpt of excerpts) ticker.append(el('span', '', excerpt), el('i'));
  renderStudy(p); renderIndex(); renderMatrix();
  player.setPoem(p);
  scroll.scrollTop = 0;
  $('#poemWrap').scrollTop = 0;
  $('#poemWrap').scrollLeft = 0;
  poemNode.scrollTop = 0;
}

function enterPoem(poem) {
  render(poem);
  const hero = $('#hero');
  hero.classList.remove('enter');
  if (!reducedMotion.matches) {
    void hero.offsetWidth;
    hero.classList.add('enter');
  }
}

function select(id, history = true) {
  const poem = byId.get(id);
  if (!poem || poem.id === (pending || current)?.id) return;
  if (history) window.history.pushState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
  closeNote();
  $('#audio').pause();
  clearTimeout(swapTimer);
  pending = poem;
  const curtain = $('#curtain');
  curtain.classList.remove('loading', 'boot', 'run');
  $('#hero').classList.remove('enter');
  $('#curNo').textContent = poem.id.padStart(3, '0');
  if (reducedMotion.matches) {
    pending = undefined;
    enterPoem(poem);
    return;
  }
  void curtain.offsetWidth;
  curtain.classList.add('run');
  swapTimer = setTimeout(() => {
    if (pending !== poem) return;
    pending = undefined;
    enterPoem(poem);
  }, 480);
}

function step(delta) {
  const index = library.findIndex(poem => poem.id === (pending || current).id);
  select(library[(index + delta + library.length) % library.length].id);
}

const player = createPlayer({ onPrevious: () => step(-1), onNext: () => step(1) });
$('#chips').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { filter = button.dataset.filter; renderIndex(); } });
$('#q').addEventListener('input', renderIndex);
$('#list').addEventListener('click', event => { const button = event.target.closest('[data-id]'); if (button) { select(button.dataset.id); if (matchMedia('(max-width:1180px)').matches) setIndex(false); } });
$('#cells').addEventListener('click', event => { const button = event.target.closest('[data-id]'); if (button) { setMatrix(false); select(button.dataset.id); } });
$('#tIndex').addEventListener('click', () => setIndex(app.dataset.index !== '1'));
$('#tMatrix').addEventListener('click', () => setMatrix(true));
$('#mxBtn').addEventListener('click', () => setMatrix(true));
$('#mxX').addEventListener('click', () => setMatrix(false));
matrix.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const buttons = [...matrix.querySelectorAll('button:not(:disabled)')];
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
});
$('#tTheme').addEventListener('click', () => {
  const currentTheme = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper');
  const theme = currentTheme === 'night' ? 'paper' : 'night';
  document.documentElement.dataset.theme = theme;
  $('#tTheme').textContent = theme === 'night' ? '昼' : '夜';
});
$('#aVert').addEventListener('click', () => {
  closeNote();
  const plate = document.querySelector('.plate-col');
  const sheet = document.querySelector('.sheet');
  const from = plate.getBoundingClientRect();
  layoutAnimations.forEach(animation => animation.cancel());
  layoutAnimations = [];
  vertical = !vertical;
  $('#hero').classList.toggle('vertical-layout', vertical);
  poemNode.classList.toggle('vertical', vertical);
  const wrap = $('#poemWrap');
  wrap.classList.toggle('vertical-reading', vertical);
  wrap.setAttribute('aria-label', vertical ? '诗词正文，从右向左阅读，可横向滚动' : '诗词正文，可滚动阅读');
  $('#verticalHint').hidden = !vertical;
  $('#tVert').hidden = !vertical;
  scroll.scrollTop = 0;
  wrap.scrollLeft = 0;
  $('#aVert').setAttribute('aria-pressed', String(vertical));
  updateVerticalHint();
  if (!reducedMotion.matches) {
    const to = plate.getBoundingClientRect();
    const x = from.left - to.left;
    const y = from.top - to.top;
    layoutAnimations = [
      plate.animate([
        { transform: `translate(${x}px, ${y}px)`, opacity: 1 },
        { transform: `translate(${x * .8}px, ${y * .8}px)`, opacity: .15, offset: .2 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ], { duration: 520, easing: 'cubic-bezier(.16, 1, .3, 1)' }),
      sheet.animate([{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }], { duration: 520 }),
    ];
  }
});
$('#tVert').addEventListener('click', () => {
  $('#aVert').click();
  $('#tIndex').focus({ preventScroll: true });
});
$('#aNotes').addEventListener('click', () => {
  notesVisible = !notesVisible;
  poemNode.classList.toggle('no-notes', !notesVisible);
  poemNode.querySelectorAll('.term').forEach(term => { term.disabled = !notesVisible; });
  $('#aNotes').setAttribute('aria-pressed', String(notesVisible));
  updateVerticalHint();
  closeNote();
});
$('#aRhyme').addEventListener('click', () => {
  const visible = poemNode.classList.toggle('show-rhyme');
  $('#aRhyme').setAttribute('aria-pressed', String(visible));
});
$('#aStudy').addEventListener('click', () => $('#study').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }));
poemNode.addEventListener('click', event => { const term = event.target.closest('[data-note]'); if (term && notesVisible) openNote(Number(term.dataset.note), term); });
$('#study').addEventListener('click', event => { const button = event.target.closest('[data-note]'); if (button) openNote(Number(button.dataset.note), button, 'source'); });
$('#popX').addEventListener('click', closeNote);
function stepNote(delta) {
  const notes = activeNoteType === 'inline' ? current.inlineAnnotations : current.annotations;
  const index = (activeNote + delta + notes.length) % notes.length;
  const anchor = activeNoteType === 'inline'
    ? poemNode.querySelector(`[data-note="${index}"]`)
    : document.querySelector(`#study [data-note="${index}"]`);
  openNote(index, anchor, activeNoteType);
}
$('#popPrev').addEventListener('click', () => stepNote(-1));
$('#popNext').addEventListener('click', () => stepNote(1));
document.addEventListener('click', event => { if (activeNote >= 0 && !event.target.closest('#pop, [data-note]')) closeNote(); });
function closeMovedNote() {
  if (activeNote < 0 || !noteAnchor?.isConnected) return;
  const rect = noteAnchor.getBoundingClientRect();
  if (Math.abs(rect.top - notePosition.top) > 1 || Math.abs(rect.left - notePosition.left) > 1) closeNote();
}
scroll.addEventListener('scroll', closeMovedNote, { passive: true });
$('#poemWrap').addEventListener('scroll', closeMovedNote, { passive: true });
window.addEventListener('popstate', () => { const id = new URLSearchParams(location.hash.slice(1)).get('poem'); if (byId.has(id)) select(id, false); });
window.addEventListener('hashchange', () => { const id = new URLSearchParams(location.hash.slice(1)).get('poem'); if (byId.has(id)) select(id, false); });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (!matrix.inert) setMatrix(false); else closeNote(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !matrix.inert) return;
  if (document.activeElement.closest('#poemWrap') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
  const key = event.key.toLowerCase();
  if (key === ' ' && !document.activeElement.closest('button, a, summary')) { event.preventDefault(); player.toggle(); }
  else if (key === '/') { event.preventDefault(); setIndex(true); $('#q').focus(); }
  else if (key === 'arrowdown' || key === 'j') { event.preventDefault(); step(1); }
  else if (key === 'arrowup' || key === 'k') { event.preventDefault(); step(-1); }
  else if (key === 'arrowleft') { event.preventDefault(); player.seekBy(-5); }
  else if (key === 'arrowright') { event.preventDefault(); player.seekBy(5); }
  else if (key === 'l') $('#tIndex').click();
  else if (key === 'm') setMatrix(true);
  else if (key === 't') $('#tTheme').click();
  else if (key === 'v') $('#aVert').click();
  else if (key === 'n' && !$('#aNotes').disabled) $('#aNotes').click();
});

const points = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5;
  const radius = i % 2 ? 38.2 : 100;
  return `${(Math.cos(a) * radius).toFixed(2)},${(Math.sin(a) * radius).toFixed(2)}`;
}).join(' ');
const starPoint = (radius, degrees) => {
  const angle = degrees * Math.PI / 180;
  return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
};
let facets = '', glints = '';
for (let i = 0; i < 5; i++) {
  const tip = starPoint(100, -90 + 72 * i);
  const left = starPoint(38.2, -126 + 72 * i);
  const right = starPoint(38.2, -54 + 72 * i);
  facets += `<polygon class="a" points="0,0 ${left} ${tip}"/><polygon class="b" points="0,0 ${tip} ${right}"/>`;
  glints += `<polygon style="--i:${i * 2}" points="0,0 ${left} ${tip}"/><polygon style="--i:${i * 2 + 1}" points="0,0 ${tip} ${right}"/>`;
}
const echoes = [0, 1, 2].map(i => `<polygon class="echo" style="--i:${i}" points="${points}"/>`).join('');
$('#beacon').innerHTML = `<div class="beams"></div><svg class="bstar" viewBox="-100 -100 200 200">${echoes}<polygon class="b-under" points="${points}"/><g class="b-facets">${facets}</g><g class="b-glints">${glints}</g><polygon class="b-edge" points="${points}"/></svg>`;
for (let i = 0; i < 90; i++) {
  const bar = el('i');
  bar.style.setProperty('--h', String(.25 + ((i * 37) % 75) / 100));
  bar.style.setProperty('--t', `${.34 + ((i * 17) % 50) / 100}s`);
  $('#bars').append(bar);
}
$('#ixCnt').textContent = String(library.length);
$('#appVersion').textContent = `v${version}`;
$('#tTheme').textContent = matchMedia('(prefers-color-scheme: dark)').matches ? '昼' : '夜';
setIndex(!matchMedia('(max-width:1180px)').matches);
new ResizeObserver(updateVerticalHint).observe($('#poemWrap'));
document.fonts.ready.then(updateVerticalHint);
const initial = new URLSearchParams(location.hash.slice(1)).get('poem');
const first = byId.get(initial) || byId.get('19') || library[0];
$('#curNo').textContent = first.id.padStart(3, '0');
enterPoem(first);
const curtain = $('#curtain');
curtain.classList.remove('loading');
$('#loadError').hidden = true;
if (!reducedMotion.matches) {
  void curtain.offsetWidth;
  curtain.classList.add('boot');
}
if (!byId.has(initial)) history.replaceState(null, '', `#poem=${encodeURIComponent(current.id)}`);
reducedMotion.addEventListener('change', event => {
  if (!event.matches) return;
  clearTimeout(swapTimer);
  curtain.classList.remove('loading', 'boot', 'run');
  $('#hero').classList.remove('enter');
  layoutAnimations.forEach(animation => animation.cancel());
  layoutAnimations = [];
  if (pending) {
    const poem = pending;
    pending = undefined;
    enterPoem(poem);
  }
});
