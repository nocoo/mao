import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { buildLibrary, normalizeDate } from '../scripts/build-data.mjs';
import { createLibraryViewModel, parseAnnotations } from '../src/view-model.js';

const ROOT = new URL('../', import.meta.url);
const library = await buildLibrary();
const manifest = JSON.parse(await readFile(new URL('audio/manifest.json', ROOT), 'utf8'));
const analysisFiles = (await readdir(new URL('data/analysis/', ROOT))).filter(name => name.endsWith('.json'));
const analyses = Object.fromEntries(await Promise.all(analysisFiles.map(async name => [name.slice(0, -5), JSON.parse(await readFile(new URL(`data/analysis/${name}`, ROOT), 'utf8'))])));
const analysis16 = analyses['16'];
const viewModel = createLibraryViewModel(library, manifest, analyses);
const byId = new Map(viewModel.map(poem => [poem.id, poem]));
const fields = [
  'id', 'title', 'form', 'subject', 'collection', 'date', 'year', 'body',
  'preface', 'path', 'versions', 'audio', 'annotations', 'context', 'appreciation', 'remarks',
  'structure', 'inlineAnnotations',
];

function payload(line) {
  const bracket = line.match(/^[①-⑳]?\s*〔([^〕]+)〕\s*(.*)$/);
  if (bracket) return bracket[1] + bracket[2];
  const numbered = line.match(/^（\d+）\s*(.*)$/);
  const content = numbered ? numbered[1] : line;
  const plain = content.match(/^([^。！？；…]{1,40}?)[：:∶；;]\s*(.*)$/);
  return plain ? plain[1] + plain[2] : content;
}

test('View Model 保留 100 个编号及构建数据中的基础字段', () => {
  assert.equal(viewModel.length, 100);
  assert.deepEqual(viewModel.map(poem => poem.id), library.poems.map(poem => poem.id));
  assert.equal(new Set(viewModel.map(poem => poem.id)).size, 100);

  for (const [index, poem] of viewModel.entries()) {
    assert.deepEqual(Object.keys(poem), fields, poem.id);
    assert.deepEqual(pick(poem, fields.slice(0, 9).concat('path')), pick(library.poems[index], fields.slice(0, 9).filter(field => field !== 'path').concat('path')));
    assert.deepEqual(poem.versions, library.poems[index].versions);
  }
});

function pick(object, keys) {
  return Object.fromEntries(keys.map(key => [key, object[key]]));
}

test('日期、正文逐行文字和长诗内容原样进入 View Model', () => {
  assert.equal(byId.get('34').date, '1962年12月26日');
  assert.equal(byId.get('34').year, 1962);
  assert.equal(byId.get('51').date, '1955年，具体月份不详。');
  assert.equal(byId.get('51').year, 1955);
  assert.equal(byId.get('62').year, null);
  assert.deepEqual(byId.get('40').body, library.poems.find(poem => poem.id === '40').body);
  assert.equal(byId.get('40').body.length, 40);
  assert.deepEqual(byId.get('70').body, ['自信人生二百年， 会当水击三千里。']);
  assert.deepEqual(
    viewModel.map(poem => ({ id: poem.id, body: poem.body })),
    library.poems.map(poem => ({ id: poem.id, body: poem.body })),
  );
});

test('每篇分析完整覆盖其正文并按体例分组', () => {
  assert.equal(analysisFiles.length, library.poems.length);
  assert.deepEqual(Object.keys(analyses).sort(), library.poems.map(poem => poem.id).sort());
  for (const poem of viewModel) {
    assert.equal(analyses[poem.id].id, poem.id);
    assert.ok(poem.structure.formLabel);
    assert.deepEqual(poem.structure.stanzas.flatMap(part => part.lineIndexes), poem.body.map((_, index) => index), poem.id);
    assert.equal(poem.inlineAnnotations.length, analyses[poem.id].inlineTerms.length, poem.id);
    for (const [index, term] of analyses[poem.id].inlineTerms.entries()) {
      assert.ok(poem.body.some(line => line.includes(term.key)), `${poem.id}：${term.key}`);
      const source = poem.annotations.find(item => item.source === term.source && item.key === term.sourceKey);
      assert.ok(source, `${poem.id}：${term.sourceKey}`);
      assert.deepEqual(poem.inlineAnnotations[index], { key: term.key, source: source.source, text: source.text });
    }
  }
  const labels = id => byId.get(id).structure.stanzas.map(part => part.label);
  for (const id of ['02', '19', '33', '49', '59', '86', '94']) assert.deepEqual(labels(id), ['上阕', '下阕'], id);
  for (const id of ['16', '20', '47', '48', '63', '81']) assert.deepEqual(labels(id), ['首联', '颔联', '颈联', '尾联'], id);
  for (const id of ['07', '14-1', '29', '40', '58', '65', '68', '75', '78']) assert.ok(!labels(id).some(label => ['首联', '颔联', '颈联', '尾联', '上阕', '下阕'].includes(label)), id);
  assert.deepEqual(labels('76'), ['正文', '署名']);
  assert.equal(byId.get('79').structure.formLabel, '诗 · 四言诗');
  for (const id of ['70', '72', '74']) assert.deepEqual(labels(id), ['残句']);
});

test('长征保留原型结构与已有词注', () => {
  const poem = byId.get('16');
  assert.deepEqual(poem.structure, analysis16.structure);
  assert.equal(poem.structure.formLabel, '诗 · 七言律诗五十六字');
  assert.equal(poem.structure.displayDate, '一九三五年十月');
  assert.equal(normalizeDate(poem.structure.displayDate), poem.date);
  assert.deepEqual(poem.structure.stanzas, [
    { label: '首联', lineIndexes: [0, 1] },
    { label: '颔联', lineIndexes: [2, 3] },
    { label: '颈联', lineIndexes: [4, 5] },
    { label: '尾联', lineIndexes: [6, 7] },
  ]);
  assert.deepEqual(poem.structure.rhymeMarks.map(mark => mark.character), ['难', '闲', '丸', '寒', '颜']);
  assert.equal(poem.annotations.length, 12);
  assert.deepEqual(poem.inlineAnnotations.map(item => item.key), analysis16.inlineTerms.map(item => item.key));
  for (const [index, term] of analysis16.inlineTerms.entries()) {
    assert.ok(poem.body.some(line => line.includes(term.key)), term.key);
    const source = poem.annotations.find(item => item.key === term.sourceKey && item.source === term.source);
    assert.ok(source, `${term.source}：${term.sourceKey}`);
    assert.deepEqual(poem.inlineAnnotations[index], { key: term.key, text: source.text, source: term.source });
  }
  assert.equal(poem.inlineAnnotations.length, 14);
});

test('分析数据必须完整覆盖正文并唯一引用可见词项', () => {
  const missingLine = structuredClone(analysis16);
  missingLine.structure.stanzas[3].lineIndexes.pop();
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: missingLine }), /stanzas 必须按顺序完整覆盖正文/);

  const wrongRhyme = structuredClone(analysis16);
  wrongRhyme.structure.rhymeMarks[0].character = '错';
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: wrongRhyme }), /韵脚位置与正文不符/);

  const duplicateRhyme = structuredClone(analysis16);
  duplicateRhyme.structure.rhymeMarks.splice(1, 0, duplicateRhyme.structure.rhymeMarks[0]);
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: duplicateRhyme }), /韵脚必须按正文顺序且不重复/);

  const wrongSource = structuredClone(analysis16);
  wrongSource.inlineTerms[0].sourceKey = '不存在的注释';
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: wrongSource }), /必须唯一引用/);

  const hiddenTerm = structuredClone(analysis16);
  hiddenTerm.inlineTerms[0].key = '不存在的词项';
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: hiddenTerm }), /不在正文中/);

  const missingTerms = structuredClone(analysis16);
  delete missingTerms.inlineTerms;
  assert.throws(() => createLibraryViewModel(library, manifest, { ...analyses, 16: missingTerms }), /inlineTerms 必须是数组/);

  const missingAnalysis = { ...analyses };
  delete missingAnalysis['19'];
  assert.throws(() => createLibraryViewModel(library, manifest, missingAnalysis), /分析 19 缺失/);
});

test('韵脚依据词体、原注及合行文本逐字定位', () => {
  const rhymes = id => byId.get(id).structure.rhymeMarks.map(mark => mark.character).join('');
  assert.equal(rhymes('03'), '国北苍江去处滔高');
  assert.equal(rhymes('14-1'), '山鞍三');
  assert.equal(rhymes('17'), '色彻鳖说雪截国热');
  assert.equal(rhymes('23'), '燕天船边年鞭篇间');
  assert.equal(rhymes('25'), '柳九有酒袖舞虎雨');
  assert.equal(rhymes('34'), '飞稀吹罴奇');
  assert.equal(rhymes('35'), '壁泣易镝急迫夕激敌');
  assert.equal(rhymes('43'), '头留进仇愁动');
  assert.equal(rhymes('49'), '前边元联妍');
  assert.equal(rhymes('63'), '才哀台猜埃');
  assert.equal(rhymes('64'), '方墙央长');
  assert.equal(rhymes('66'), '关还山');
  assert.equal(rhymes('86'), '前残烦年');
  assert.deepEqual(byId.get('13').structure.rhymeMarks.map(mark => mark.character), ['晓', '早', '老', '好']);
  assert.match(byId.get('13').structure.rhymeNote, /下阕.*待核/);
  assert.match(byId.get('34').structure.rhymeNote, /借韵/);
});

test('音频用作品编号和内容哈希关联 CDN，并保留展示字段', () => {
  const recording = manifest.poems.find(poem => poem.id === '01');
  assert.deepEqual(byId.get('01').audio, {
    url: `https://m.no.mt/audio/01-${recording.sha256.slice(0, 16)}.mp3`,
    seconds: recording.seconds,
    status: recording.status,
    priorityReview: recording.priority_review,
  });

  for (const id of ['39', '51', '78']) assert.equal(byId.get(id).audio, null, id);
  assert.deepEqual(viewModel.filter(poem => poem.audio === null).map(poem => poem.id), ['39', '51', '78']);
});

test('典型注释保留两个来源的全部条目且不会合并', () => {
  const annotations = byId.get('02').annotations;
  assert.equal(annotations.filter(item => item.source === '初始文本').length, 12);
  assert.equal(annotations.filter(item => item.source === '品读版').length, 10);
  assert.ok(annotations.some(item => item.source === '初始文本' && item.key === '寒秋' && item.text === '深秋,晚秋。'));
  assert.ok(annotations.some(item => item.source === '品读版' && item.key === '长沙' && item.text.startsWith('作者的青年时代')));
  assert.equal(byId.get('64').annotations.length, 0);
  assert.equal(byId.get('95').annotations.length, 0);
});

test('题解、赏析和编者说明保持原文及来源', () => {
  for (const poem of viewModel) {
    const source = library.poems.find(item => item.id === poem.id);
    assert.deepEqual(poem.context, source.notes.filter(note => note.kind === '题解').map(({ text, source }) => ({ text, source })));
    assert.deepEqual(poem.appreciation, source.notes.filter(note => note.kind === '赏析').map(({ text, source }) => ({ text, source })));
    assert.deepEqual(poem.remarks, source.notes.filter(note => note.kind === '编者说明').map(({ text, source }) => ({ text, source })));
  }
});

test('所有实际注释的非结构内容都能在 View Model 中找到', () => {
  for (const sourcePoem of library.poems) {
    const poem = byId.get(sourcePoem.id);
    const parsed = poem.annotations.map(item => item.key + item.text).join('\n');
    for (const note of sourcePoem.notes.filter(item => item.kind === '注释')) {
      for (const line of note.text.split('\n').filter(Boolean)) {
        assert.ok(parsed.includes(payload(line)), `${poem.id} 丢失注释内容：${line}`);
      }
    }
  }
});

test('正文词语引用保留作品中的具体指代', () => {
  const flyingGeneral = byId.get('11').inlineAnnotations.find(item => item.key === '飞将军');
  assert.equal(flyingGeneral.source, '品读版');
  assert.match(flyingGeneral.text, /称赞.*红军/);
  const jadeDragons = byId.get('17').inlineAnnotations.find(item => item.key === '玉龙');
  assert.equal(jadeDragons.source, '品读版');
  assert.match(jadeDragons.text, /昆仑山脉/);
});

test('带圈号的注释仍保留原始词条和来源', () => {
  const poem = byId.get('49');
  const term = poem.inlineAnnotations.find(item => item.key === '颜斶');
  assert.ok(term);
  assert.equal(term.source, '品读版');
  assert.match(term.text, /战国时齐国人/);
});

test('无法安全解析的 Markdown 只作为文本整体保留', () => {
  assert.deepEqual(parseAnnotations('无法拆分的文本\n\n<script>alert(1)</script>', '测试'), [{
    key: '',
    text: '无法拆分的文本\n\n<script>alert(1)</script>',
    source: '测试',
  }]);
});
