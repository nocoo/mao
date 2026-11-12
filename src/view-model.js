import { audioUrl } from './media.js';

const BRACKET_ANNOTATION = /^[①-⑳]?\s*〔([^〕]+)〕\s*(.*)$/;
const NUMBERED_ANNOTATION = /^[（(](\d+)[)）]\s*(.*)$/;
const PLAIN_ANNOTATION = /^([^。！？；…\n]{1,40}?)[：:∶；;]\s*(.*)$/;

function marker(line) {
  const bracket = line.match(BRACKET_ANNOTATION);
  if (bracket) return { key: bracket[1].trim(), text: bracket[2] };

  const numbered = line.match(NUMBERED_ANNOTATION);
  if (numbered) {
    const item = numbered[2].match(PLAIN_ANNOTATION);
    return item ? { key: item[1].trim(), text: item[2] } : { key: '', text: line };
  }

  const plain = line.match(PLAIN_ANNOTATION);
  return plain ? { key: plain[1].trim(), text: plain[2] } : null;
}

export function parseAnnotations(noteText, source) {
  const annotations = [];
  let current;

  const flush = () => {
    if (!current) return;
    annotations.push({ key: current.key, text: current.text, source });
    current = undefined;
  };

  for (const line of noteText.split('\n')) {
    const item = marker(line);
    if (item) {
      flush();
      current = item;
    } else if (current) {
      current.text += `${current.text ? '\n' : ''}${line}`;
    } else {
      current = { key: '', text: line };
    }
  }
  flush();

  return annotations;
}

function notesOfType(poem, kind, withKeys = false) {
  const notes = poem.notes.filter(note => note.kind === kind);
  if (withKeys) return notes.flatMap(note => parseAnnotations(note.text, note.source));
  return notes.map(note => ({ text: note.text, source: note.source }));
}

function audioFor(id, recordings) {
  const recording = recordings.get(id);
  if (!recording || recording.status === 'failed' || typeof recording.file !== 'string' || !Number.isFinite(recording.seconds)) {
    return null;
  }
  return {
    url: audioUrl(id, recording.sha256),
    seconds: recording.seconds,
    status: recording.status,
    priorityReview: recording.priority_review,
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateAnalyses(poems, analyses) {
  if (!isRecord(analyses)) throw new TypeError('analyses 必须是以编号为键的对象');
  const ids = new Set(poems.map(poem => poem.id));
  for (const [id, analysis] of Object.entries(analyses)) {
    if (!ids.has(id)) throw new Error(`分析编号 ${id} 不在 library 中`);
    if (!isRecord(analysis)) throw new TypeError(`分析 ${id} 必须是对象`);
    if (analysis.id !== id) throw new Error(`分析 ${id} 的 id 必须与编号键一致`);
  }
  for (const id of ids) {
    if (!Object.hasOwn(analyses, id)) throw new Error(`分析 ${id} 缺失`);
  }
}

function structureFor(poem, analysis) {
  const { structure } = analysis;
  if (!isRecord(structure)) throw new TypeError(`分析 ${poem.id} 缺少 structure 对象`);
  if (typeof structure.formLabel !== 'string' || !structure.formLabel.trim()) {
    throw new TypeError(`分析 ${poem.id} 的 formLabel 必须是非空字符串`);
  }
  if (structure.displayDate !== undefined && (typeof structure.displayDate !== 'string' || !structure.displayDate.trim())) {
    throw new TypeError(`分析 ${poem.id} 的 displayDate 必须是非空字符串`);
  }
  if (!Array.isArray(structure.stanzas) || !structure.stanzas.length) {
    throw new TypeError(`分析 ${poem.id} 的 stanzas 必须是非空数组`);
  }

  const lineIndexes = [];
  const labels = new Set();
  const stanzas = structure.stanzas.map((stanza, index) => {
    if (!isRecord(stanza) || typeof stanza.label !== 'string' || !stanza.label.trim()) {
      throw new TypeError(`分析 ${poem.id} 的 stanza ${index} 缺少 label`);
    }
    if (labels.has(stanza.label)) throw new Error(`分析 ${poem.id} 的 stanza label ${stanza.label} 重复`);
    labels.add(stanza.label);
    if (!Array.isArray(stanza.lineIndexes) || !stanza.lineIndexes.length) {
      throw new TypeError(`分析 ${poem.id} 的 stanza ${index} 缺少行索引`);
    }
    for (const lineIndex of stanza.lineIndexes) {
      if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= poem.body.length) {
        throw new RangeError(`分析 ${poem.id} 的行索引 ${lineIndex} 超出正文范围`);
      }
      lineIndexes.push(lineIndex);
    }
    return { label: stanza.label, lineIndexes: [...stanza.lineIndexes] };
  });
  const expectedIndexes = poem.body.map((_, index) => index);
  if (lineIndexes.length !== expectedIndexes.length || lineIndexes.some((value, index) => value !== expectedIndexes[index])) {
    throw new Error(`分析 ${poem.id} 的 stanzas 必须按顺序完整覆盖正文`);
  }

  if (!Array.isArray(structure.rhymeMarks)) {
    throw new TypeError(`分析 ${poem.id} 的 rhymeMarks 必须是数组`);
  }
  if (structure.rhymeNote !== undefined && (typeof structure.rhymeNote !== 'string' || !structure.rhymeNote.trim())) {
    throw new TypeError(`分析 ${poem.id} 的 rhymeNote 必须是非空字符串`);
  }
  let previousLine = -1;
  let previousOffset = -1;
  const rhymeMarks = structure.rhymeMarks.map(mark => {
    if (!isRecord(mark) || !Number.isInteger(mark.lineIndex) || !Number.isInteger(mark.offset)
      || mark.lineIndex < 0 || mark.lineIndex >= poem.body.length
      || mark.offset < 0 || mark.offset >= poem.body[mark.lineIndex].length
      || typeof mark.character !== 'string' || !/^\p{Script=Han}$/u.test(mark.character)
      || poem.body[mark.lineIndex].slice(mark.offset, mark.offset + mark.character.length) !== mark.character) {
      throw new RangeError(`分析 ${poem.id} 的韵脚位置与正文不符`);
    }
    if (mark.lineIndex < previousLine || (mark.lineIndex === previousLine && mark.offset <= previousOffset)) {
      throw new RangeError(`分析 ${poem.id} 的韵脚必须按正文顺序且不重复`);
    }
    const next = poem.body[mark.lineIndex].slice(mark.offset + mark.character.length);
    if (next && !/^\s*[，。；、：？！“”《》—·,.!?;]/.test(next)) {
      throw new RangeError(`分析 ${poem.id} 的韵脚必须位于句末`);
    }
    previousLine = mark.lineIndex;
    previousOffset = mark.offset;
    return { lineIndex: mark.lineIndex, offset: mark.offset, character: mark.character };
  });

  return {
    formLabel: structure.formLabel,
    ...(structure.displayDate === undefined ? {} : { displayDate: structure.displayDate }),
    ...(structure.rhymeNote === undefined ? {} : { rhymeNote: structure.rhymeNote }),
    stanzas,
    rhymeMarks,
  };
}

function inlineAnnotationsFor(poem, analysis, annotations) {
  if (!Array.isArray(analysis.inlineTerms)) throw new TypeError(`分析 ${poem.id} 的 inlineTerms 必须是数组`);
  const body = poem.body.join('\n');
  const keys = new Set();
  return analysis.inlineTerms.map((term, index) => {
    if (!isRecord(term)
      || typeof term.key !== 'string' || !term.key.trim()
      || typeof term.source !== 'string' || !term.source.trim()
      || typeof term.sourceKey !== 'string' || !term.sourceKey.trim()) {
      throw new TypeError(`分析 ${poem.id} 的 inlineTerms ${index} 缺少 key、source 或 sourceKey`);
    }
    if (!body.includes(term.key)) throw new Error(`分析 ${poem.id} 的词项 ${term.key} 不在正文中`);
    if (keys.has(term.key)) throw new Error(`分析 ${poem.id} 的词项 ${term.key} 重复`);
    keys.add(term.key);
    const matches = annotations.filter(annotation => annotation.source === term.source && annotation.key === term.sourceKey);
    if (matches.length !== 1) {
      throw new Error(`分析 ${poem.id} 的词项 ${term.key} 必须唯一引用 ${term.source}：${term.sourceKey}`);
    }
    return { key: term.key, text: matches[0].text, source: matches[0].source };
  });
}

export function createLibraryViewModel(library, manifest, analyses) {
  const poems = library?.poems ?? [];
  const recordings = new Map((manifest?.poems ?? []).map(poem => [poem.id, poem]));
  validateAnalyses(poems, analyses);
  return poems.map(poem => {
    const annotations = notesOfType(poem, '注释', true);
    const analysis = analyses[poem.id];
    return {
      id: poem.id,
      title: poem.title,
      form: poem.form,
      subject: poem.subject,
      collection: poem.collection,
      date: poem.date,
      year: poem.year,
      body: [...poem.body],
      preface: poem.preface,
      path: poem.path,
      versions: poem.versions.map(version => ({ source: version.source, text: version.text })),
      audio: audioFor(poem.id, recordings),
      annotations,
      context: notesOfType(poem, '题解'),
      appreciation: notesOfType(poem, '赏析'),
      remarks: notesOfType(poem, '编者说明'),
      structure: structureFor(poem, analysis),
      inlineAnnotations: inlineAnnotationsFor(poem, analysis, annotations),
    };
  });
}
