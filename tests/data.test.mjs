import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { buildLibrary, normalizeDate, parseIndex, parseNotes, parsePoem } from '../scripts/build-data.mjs';

const ROOT = new URL('../', import.meta.url);
const library = await buildLibrary();
const byId = new Map(library.poems.map(poem => [poem.id, poem]));
const index = await readFile(new URL('data/诗词/index.md', ROOT), 'utf8');
const documents = new Map(await Promise.all(library.poems.map(async poem => [poem.id, await readFile(new URL(poem.path, ROOT), 'utf8')])));
const poemFields = ['id', 'title', 'form', 'subject', 'collection', 'date', 'year', 'body', 'preface', 'notes', 'versions', 'path'];
const kinds = ['注释', '题解', '赏析', '编者说明'];

function note(id, source, kind) {
  return byId.get(id).notes.find(item => item.source === source && item.kind === kind);
}

test('索引的 96 个唯一编号和路径逐条保留，主目 63 + 补编 33', () => {
  assert.deepEqual(library.counts, { total: 96, main: 63, supplement: 33, 正编: 39, 副编: 24, 补编: 33 });
  assert.equal(new Set(library.poems.map(poem => poem.id)).size, 96);
  assert.equal(new Set(library.poems.map(poem => poem.path)).size, 96);
  const rows = [...index.matchAll(/^\|\s*([\d-]+)\s*\|\s*\[([^\]]+)\]\(<([^>]+)>\)/gm)];
  assert.equal(rows.length, 96);
  rows.forEach(([, id, title, path], position) => {
    assert.equal(library.poems[position].id, id);
    assert.equal(library.poems[position].title, title);
    assert.equal(library.poems[position].path, `data/诗词/${path}`);
    assert.ok(documents.get(id).startsWith('# '));
  });
});

test('所有条目严格遵循字段类型，正文非空且不混入 Markdown 标题、编者说明和注释', () => {
  for (const poem of library.poems) {
    assert.deepEqual(Object.keys(poem), poemFields, poem.id);
    for (const field of ['id', 'title', 'form', 'subject', 'date', 'preface', 'path']) assert.equal(typeof poem[field], 'string', `${poem.id} ${field}`);
    assert.ok(['正编', '副编', '补编'].includes(poem.collection));
    assert.ok(poem.year === null || Number.isInteger(poem.year));
    assert.ok(poem.body.length > 0, poem.id);
    for (const line of poem.body) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim(), poem.id);
      assert.doesNotMatch(line, /^(?:#{1,6}\s|>|[-*]\s|[\[【［]\s*(?:注释|题解|赏析)|〔|(?:注释|题解|赏析)$)/, poem.id);
      assert.ok(documents.get(poem.id).split('\n').some(raw => raw.trim() === line), `${poem.id} 未改写诗行：${line}`);
    }
    for (const item of poem.notes) {
      assert.deepEqual(Object.keys(item), ['kind', 'source', 'text']);
      assert.ok(kinds.includes(item.kind));
      assert.equal(typeof item.source, 'string');
      assert.ok(item.text.trim());
    }
    for (const version of poem.versions) {
      assert.deepEqual(Object.keys(version), ['source', 'text']);
      assert.ok(['初始文本', '品读版'].includes(version.source));
      assert.ok(version.text.trim());
    }
  }
});

test('标题来自索引而非原文件简称，并按中点分题材', () => {
  assert.equal(byId.get('54').title, '七绝·观潮');
  assert.equal(byId.get('54').form, '七绝');
  assert.equal(byId.get('54').subject, '观潮');
  assert.equal(byId.get('51').title, '五律·看山');
  assert.equal(byId.get('55').title, '七绝·刘蕡');
  assert.equal(byId.get('63').title, '七律·咏贾谊');
  assert.equal(byId.get('87').title, '七绝·豫章西望（1971年9月以后）');
  assert.equal(byId.get('88').title, '七绝·群山万壑（1971年9月以后）');
  assert.equal(byId.get('14').form, '十六字令');
  assert.equal(byId.get('14').subject, '十六字令三首');
  assert.equal(byId.get('69').form, '五律');
  assert.equal(byId.get('69').subject, '五律（1915年5月）');
});

test('23 短词与 40 长诗保留逐行边界，不截尾、不附注释', () => {
  assert.equal(byId.get('23').body.length, 10);
  assert.equal(byId.get('23').body[0], '大雨落幽燕，');
  assert.equal(byId.get('23').body.at(-1), '换了人间。');
  assert.equal(byId.get('40').body.length, 40);
  assert.equal(byId.get('40').body[0], '去去思君深，');
  assert.equal(byId.get('40').body.at(-1), '江天水一泓。');
  assert.equal(byId.get('44').body.length, 2);
  assert.equal(byId.get('44').body.at(-1), '谁敢横刀立马？惟我彭大将军！');
});

test('优先校订正文，但不更正原始资料字词、标点或组诗', () => {
  assert.ok(byId.get('26').body.includes('巡天遥看一千河。'));
  assert.match(byId.get('26').versions.find(item => item.source === '初始文本').text, /巡天遥看一天河。/);
  assert.ok(byId.get('17').body.includes('搅得周天寒彻。'));
  assert.match(byId.get('17').versions.find(item => item.source === '初始文本').text, /搅得周天寒澈。/);
  assert.equal(byId.get('14').body.at(-1), '天欲堕，赖以拄其间。');
  assert.ok(byId.get('27').body.includes('敢教日月换新天。'));
  assert.equal(byId.get('02').body[0], '独立寒秋,');
  assert.equal(byId.get('57').body[6], '剑南歌接秋风呤，');
  assert.equal(byId.get('14').body.length, 6);
  assert.equal(byId.get('26').body.length, 16);
  assert.equal(byId.get('57').body.length, 8);
  assert.match(byId.get('14').versions[0].text, /其三/);
});

test('三组作品保留每首正文和来源差异，不再拆分目录', () => {
  assert.deepEqual(byId.get('14').body, [
    '山，快马加鞭未下鞍。', '惊回首，离天三尺三。',
    '山，倒海翻江卷巨澜。', '奔腾急，万马战犹酣。',
    '山，刺破青天锷未残。', '天欲堕，赖以拄其间。',
  ]);
  assert.deepEqual(byId.get('26').body, [
    '绿水青山枉自多，', '华佗无奈小虫何！', '千村薜荔人遗矢，', '万户萧疏鬼唱歌。',
    '坐地日行八万里，', '巡天遥看一千河。', '牛郎欲问瘟神事，', '一样悲欢逐逝波。',
    '春风杨柳万千条，', '六亿神州尽舜尧。', '红雨随心翻作浪，', '青山着意化为桥。',
    '天连五岭银锄落，', '地动三河铁臂摇。', '借问瘟君欲何往，', '纸船明烛照天烧。',
  ]);
  assert.deepEqual(byId.get('57').body, [
    '博大胆识铁石坚，', '刀光剑影任翔旋。', '龙华喋血不眠夜，', '犹制小诗赋管弦。',
    '鉴湖越台名士乡，', '忧忡为国痛断肠。', '剑南歌接秋风呤，', '一例氤氲入诗囊。',
  ]);
  for (const id of ['14-1', '14-2', '14-3', '26-1', '26-2', '57-1', '57-2']) assert.equal(byId.has(id), false, id);
  assert.match(byId.get('14').notes.map(item => item.text).join('\n'), /天欲堕/);
  assert.match(byId.get('57').notes.map(item => item.text).join('\n'), /秋风呤/);
});

test('补编 81 的正文不混入 96，原始版本仍完整保留附诗', () => {
  const poem = byId.get('81');
  assert.equal(poem.body.length, 8);
  assert.equal(poem.body[0], '有田有地皆吾主，');
  assert.equal(poem.body.at(-1), '无非一念救苍生。');
  assert.doesNotMatch(poem.body.join('\n'), /五言韵语|军队向前进|革命无不胜/);
  assert.match(poem.versions.find(item => item.source === '品读版').text, /五言韵语1945年10月[\s\S]*革命无不胜。/);
  assert.deepEqual(byId.get('96').body, ['军队向前进，', '生产长一寸。', '加强纪律性，', '革命无不胜。']);
  assert.equal(poem.year, 1942);
  assert.match(note('81', '整理说明', '编者说明').text, /重庆谈判发生于 1945 年/);
});

test('补编去掉重复题头与日期，但保留残句、下佚及共同署名', () => {
  assert.equal(byId.get('64').body[0], '天井四四方，周围是高墙。');
  assert.equal(byId.get('67').body.at(-1), '（下佚）');
  assert.match(byId.get('67').body.join('\n'), /（萧）/);
  assert.match(byId.get('67').body.join('\n'), /（毛）/);
  assert.equal(byId.get('70').body.length, 1);
  assert.equal(byId.get('70').body[0], '自信人生二百年， 会当水击三千里。');
  assert.match(byId.get('71').body[0], /（毛）[\s\S]*（萧）/);
  assert.deepEqual(byId.get('76').body.slice(-2), ['军 长 朱 德', '党代表 毛泽东']);
  assert.match(note('76', '整理说明', '编者说明').text, /不应简化为毛泽东独立署名/);
  for (const poem of library.poems.filter(item => item.collection === '补编')) {
    assert.doesNotMatch(poem.body[0], /^(?:七律·|七绝\d|五律\d|四言诗\d|五言韵语\d|五言排律·)/, poem.id);
  }
});

test('日期只规范明确的年月日数字，优先校勘、不用典故或资料归属补造年份', () => {
  assert.equal(normalizeDate('一九六二年十二月二十六日'), '1962年12月26日');
  assert.equal(normalizeDate('一九〇一年十一月十七日'), '1901年11月17日');
  assert.equal(normalizeDate('一九○九年十月三十一日'), '1909年10月31日');
  assert.equal(normalizeDate('约一九一六年'), '约1916年');
  assert.equal(normalizeDate('1930 年 1 月'), '1930年1月');
  assert.equal(normalizeDate('1934年1935年'), '1934年—1935年');
  assert.equal(byId.get('14').date, '1934年—1935年');
  assert.equal(byId.get('34').date, '1962年12月26日');
  assert.equal(byId.get('32').date, '1961年11月17日');
  assert.equal(byId.get('07').date, '1930年1月');
  assert.equal(byId.get('51').year, 1955);
  assert.equal(byId.get('52').year, 1955);
  assert.match(byId.get('51').date, /具体月份不详/);
  assert.equal(byId.get('44').date, '1935年10月');
  assert.equal(byId.get('58').date, '1963年8月1日');
  assert.equal(byId.get('87').date, '1971年9月以后');
  for (const id of ['62', '63', '64', '95']) {
    assert.equal(byId.get(id).year, null, id);
    assert.equal(byId.get(id).date, '未标明', id);
  }
});

test('诗前说明、小引、正文中的序语均进入 preface，不与正文混排', () => {
  assert.equal(byId.get('33').preface, '读陆游咏梅词，反其意而用之。');
  assert.match(byId.get('22').preface, /^一九五零年国庆观剧/);
  assert.match(byId.get('27').preface, /^一九五九年六月二十五日到韶山/);
  assert.match(byId.get('26').preface, /^读6月30日人民日报，余江县消灭了血吸虫/);
  assert.equal(byId.get('48').preface, '一九四七年中秋步运河上，闻西北野战军收复蟠龙作。');
  assert.equal(byId.get('48').body[0], '秋风度河上，大野入苍穹。');
  assert.match(byId.get('78').preface, /^中华民国26年4月5日[\s\S]*朱德/);
  assert.equal(byId.get('78').body[0], '赫赫始祖，吾华肇造。');
});

test('多行注释、题解、赏析按来源提取，兼容括号、行内及裸标题', () => {
  assert.match(note('02', '初始文本', '注释').text, /（1）寒秋:[\s\S]*（12）中流/);
  assert.match(note('02', '品读版', '注释').text, /〔长沙〕[\s\S]*\n\n〔击水〕/);
  assert.match(note('02', '品读版', '题解').text, /赵恒惕再次通缉毛泽东/);
  assert.match(note('24', '品读版', '题解').text, /六月一日[\s\S]*四日，第三次/);
  assert.match(note('44', '品读版', '注释').text, /〔六言诗〕[\s\S]*〔给彭德怀同志〕/);
  assert.match(note('26', '品读版', '注释').text, /〔送瘟神〕[\s\S]*〔纸船明烛〕/);
  assert.ok(byId.get('17').notes.some(item => item.source === '品读版' && item.kind === '注释' && item.text.startsWith('原注\n')));
  assert.match(note('34', '品读版', '赏析').text, /^作法\n[\s\S]*四支大韵/);
  assert.match(note('27', '初始文本', '赏析').text, /真情壮采/);
  assert.match(note('51', '整理说明', '编者说明').text, /校勘时间：1955 年[\s\S]*人民网/);
  assert.ok(byId.get('63').notes.some(item => item.kind === '编者说明' && item.text.startsWith('标题差异：')));
  assert.ok(!note('63', '品读版', '注释').text.includes('> 标题差异'));
});

test('notes 段落不会在空行处截断，下一类别不会串入上一类别', () => {
  assert.deepEqual(parseNotes('[题解]\n第一段。\n\n第二段。\n\n### 注释\n甲。\n\n乙。\n【赏析】同行内容。\n续段。', '初始文本'), [
    { kind: '题解', source: '初始文本', text: '第一段。\n\n第二段。' },
    { kind: '注释', source: '初始文本', text: '甲。\n\n乙。' },
    { kind: '赏析', source: '初始文本', text: '同行内容。\n续段。' },
  ]);
});

test('versions 全量保留每份原始条目和组诗，缺失初始资料不伪造第二份', () => {
  let mainWithTwo = 0;
  let supplementWithTwo = 0;
  for (const poem of library.poems) {
    const expected = documents.get(poem.id).split(/^## /m).slice(1).flatMap(block => {
      const [heading, ...lines] = block.split('\n');
      if (!/^(?:初始文本|品读版原始)/.test(heading)) return [];
      return [{ source: heading.startsWith('初始') ? '初始文本' : '品读版', text: lines.join('\n').trim() }];
    });
    assert.deepEqual(poem.versions, expected, poem.id);
    if (poem.versions.length === 2) {
      if (poem.collection === '补编') supplementWithTwo++;
      else mainWithTwo++;
    }
  }
  assert.equal(mainWithTwo, 53);
  assert.equal(supplementWithTwo, 15);
  assert.equal(byId.get('44').versions.length, 1);
  assert.match(byId.get('55').versions[0].text, /七绝·刘菁蕡1958年[\s\S]*刘口/);
});

test('解析器只选择第一个正文，拒绝无正文及不安全或重复索引', () => {
  const entry = { id: '00', title: '七绝·示例', collection: '正编', path: 'data/诗词/00-示例.md' };
  const poem = parsePoem(entry, '# 示例\n\n## 正文（校订阅读版）\n\n> 编者提醒\n第一诗行。\n\n【注释 】\n不是诗行。\n\n## 正文（其他）\n不要第二正文。\n\n## 品读版原始条目\n七绝·示例\n第一诗行。\n\n【注释 】\n不是诗行。');
  assert.deepEqual(poem.body, ['第一诗行。']);
  assert.equal(poem.year, null);
  assert.throws(() => parsePoem(entry, '# 示例\n## 正文\n\n## 品读版原始条目\n七绝·示例'), /正文为空/);
  assert.throws(() => parseIndex('## 正编\n| 01 | [示例](<../outside.md>) |'), /路径/);
  assert.throws(() => parseIndex('## 正编\n| 01 | [示例](<a.md>) |\n| 01 | [示例](<b.md>) |'), /重复 id/);
  assert.throws(() => parseIndex('## 正编\n| 01 | [示例](<a.md>) |\n| 02 | [示例](<a.md>) |'), /重复 path/);
  assert.throws(() => parseIndex('## 正编\n| 01 | 无链接 |'), /无法解析/);
  assert.throws(() => parseIndex('## 正编\n| 14-1 | [旧编号](<a.md>) |'), /无法解析/);
});

test('组诗正文保留分首标题，但不会把标题和注释当作诗句', () => {
  const entry = { id: '00', title: '组诗', collection: '正编', path: 'data/诗词/00-组诗.md' };
  const poem = parsePoem(entry, '# 组诗\n\n## 正文\n\n### 其一\n第一首。\n\n### 其二\n第二首。\n\n### 注释\n不能进入正文。\n\n## 品读版原始条目\n组诗\n第一首。\n第二首。');
  assert.deepEqual(poem.body, ['第一首。', '第二首。']);
});

test('生成数据可直接作为经典脚本执行，与当前 Markdown 构建结果一致', async () => {
  const script = await readFile(new URL('assets/poems.js', ROOT), 'utf8');
  assert.ok(script.startsWith('window.POEM_LIBRARY = '));
  assert.ok(script.endsWith(';\n'));
  const context = { window: {} };
  vm.runInNewContext(script, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.POEM_LIBRARY)), library);
});

test('import 构建模块没有写入或 console 副作用', async () => {
  const output = new URL('assets/poems.js', ROOT);
  const before = await stat(output);
  const script = `await import(${JSON.stringify(new URL('scripts/build-data.mjs', ROOT).href)})`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: fileURLToPath(ROOT), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal((await stat(output)).mtimeMs, before.mtimeMs);
});
