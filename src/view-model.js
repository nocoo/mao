const BRACKET_ANNOTATION = /^〔([^〕]+)〕\s*(.*)$/;
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
    file: recording.file,
    seconds: recording.seconds,
    status: recording.status,
    priorityReview: recording.priority_review,
  };
}

export function createLibraryViewModel(library, manifest) {
  const recordings = new Map((manifest?.poems ?? []).map(poem => [poem.id, poem]));
  return (library?.poems ?? []).map(poem => ({
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
    annotations: notesOfType(poem, '注释', true),
    context: notesOfType(poem, '题解'),
    appreciation: notesOfType(poem, '赏析'),
    remarks: notesOfType(poem, '编者说明'),
  }));
}
