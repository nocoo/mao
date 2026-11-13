import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATA_PATH = 'data/诗词';
const NOTE_KINDS = { 注释: '注释', 题解: '题解', 赏析: '赏析', 编者说明: '编者说明', 原注: '注释', 作法: '赏析' };
const NOTE_LABELS = Object.keys(NOTE_KINDS).join('|');
const BRACKET_NOTE = new RegExp(`^[\\[【［]\\s*(${NOTE_LABELS})\\s*[\\]】］]\\s*(.*)$`);
const PLAIN_NOTE = new RegExp(`^(${NOTE_LABELS})(?:\\s*[:：]\\s*(.*))?\\s*$`);

export function parseIndex(markdown) {
  const entries = [];
  let collection;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (正编|副编|补编)/);
    if (heading) collection = heading[1];
    if (!/^\|\s*\d/.test(line)) continue;
    const row = line.match(/^\|\s*(\d{2})\s*\|\s*\[([^\]]+)\]\(<([^>]+)>\)\s*\|/);
    if (!row || !collection) throw new Error(`无法解析索引行：${line}`);
    const [, id, title, relativePath] = row;
    if (!relativePath.endsWith('.md') || relativePath.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)|[:\\]/.test(relativePath)) {
      throw new Error(`索引路径必须位于诗词目录内：${relativePath}`);
    }
    entries.push({ id, title, collection, path: posix.join(DATA_PATH, relativePath) });
  }
  if (!entries.length) throw new Error('索引没有诗词条目');
  for (const field of ['id', 'path']) {
    if (new Set(entries.map(entry => entry[field])).size !== entries.length) throw new Error(`索引存在重复 ${field}`);
  }
  return entries;
}

function splitSections(markdown) {
  const text = markdown.replace(/\r\n?/g, '\n');
  const headings = [...text.matchAll(/^##[ \t]+(.+)$/gm)];
  return {
    header: text.slice(0, headings[0]?.index ?? text.length),
    sections: headings.map((heading, index) => ({
      heading: heading[1].trim(),
      text: text.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length).trim(),
    })),
  };
}

function noteMarker(line) {
  const text = line.trim().replace(/^#{1,6}\s+/, '');
  const match = text.match(BRACKET_NOTE) || text.match(PLAIN_NOTE);
  return match && { label: match[1], kind: NOTE_KINDS[match[1]], inline: match[2] || '' };
}

export function parseNotes(text, source) {
  const notes = [];
  let current;
  const flush = () => {
    if (!current) return;
    const content = current.lines.join('\n').trim();
    if (content) notes.push({ kind: current.kind, source, text: content });
    current = undefined;
  };
  for (const line of text.split('\n')) {
    const marker = noteMarker(line);
    if (marker) {
      flush();
      const label = marker.label === marker.kind ? '' : `${marker.label}\n`;
      current = { kind: marker.kind, lines: [label + marker.inline] };
    } else if (/^\s*#/.test(line)) {
      flush();
    } else if (current && !/^\s*>/.test(line)) {
      current.lines.push(line.trimEnd());
    }
  }
  flush();
  return notes;
}

function chineseNumber(text) {
  const digits = { '零': 0, '〇': 0, '○': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (!/[十百千]/.test(text)) return Number([...text].map(char => digits[char]).join(''));
  let result = 0;
  let digit = 0;
  for (const char of text) {
    const unit = { 十: 10, 百: 100, 千: 1000 }[char];
    if (unit) {
      result += (digit || 1) * unit;
      digit = 0;
    } else digit = digits[char];
  }
  return result + digit;
}

export function normalizeDate(text) {
  return text.trim()
    .replace(/[零〇○一二两三四五六七八九十百千]+(?=\s*[年月日])/g, chineseNumber)
    .replace(/(\d)\s+(?=[年月日])/g, '$1')
    .replace(/([年月])\s+(?=\d)/g, '$1')
    .replace(/(\d{4}年)(?=\d{4}年)/g, '$1—');
}

function metadata(header, label) {
  return header.match(new RegExp(`^- ${label}：(.+)$`, 'm'))?.[1].trim();
}

function verseLines(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^###\s+其[一二三]$/.test(line)) continue;
    if (noteMarker(line) || /^#/.test(line)) break;
    if (line && !line.startsWith('>')) lines.push(line);
  }
  return lines;
}

function titleWithoutDate(text) {
  return normalizeDate(text).replace(/[（(]?\d{4}年.*$/, '').replace(/\s/g, '');
}

function isDateLine(line) {
  return /^(?:(?:约)?\d{4}年[\d年月日春夏秋冬底初末至—－\-、（）()以之後后前\s]*|未标明|时间待考)$/.test(normalizeDate(line));
}

// shortcut: 这里只识别当前资料中已核对的小引开头；新增散文小引须补充边界测试。
function isPreface(line) {
  return /^(?:读(?:陆游咏梅词|6月30日人民日报)|一九四七年中秋步运河上|中华民国26年4月5日)/.test(line);
}

export function parsePoem(entry, markdown) {
  const { header, sections } = splitSections(markdown);
  const versions = sections.filter(section => /^(?:初始文本|品读版原始)/.test(section.heading))
    .map(section => ({ source: section.heading.startsWith('初始') ? '初始文本' : '品读版', text: section.text }));
  if (!versions.length) throw new Error(`${entry.id} 缺少原始条目`);
  const reading = versions.find(version => version.source === '品读版');
  const readingLines = reading ? verseLines(reading.text) : [];
  const bodySection = sections.find(section => section.heading.startsWith('正文'));
  let body;
  if (bodySection) {
    body = verseLines(bodySection.text);
  } else {
    if (!reading) throw new Error(`${entry.id} 缺少正文和品读版`);
    body = [...readingLines];
    const fileTitle = header.match(/^# (.+)$/m)?.[1] || entry.title;
    if (![fileTitle, entry.title].some(title => titleWithoutDate(title) === titleWithoutDate(body[0] || ''))) {
      throw new Error(`${entry.id} 无法识别品读版开头的标题`);
    }
    body.shift();
    while (body.length && isDateLine(body[0])) body.shift();
    // 第 81 项的品读原文附有第 96 项；仅截阅读正文，versions 不截。
    if (entry.id === '81') {
      const appended = body.findIndex(line => line === '五言韵语1945年10月');
      if (appended !== -1) body = body.slice(0, appended);
    }
  }

  const explicitPreface = sections.filter(section => /^(?:小引|小序|诗前说明|序言)$/.test(section.heading))
    .map(section => section.text).join('\n\n');
  const embeddedPreface = [];
  while (body.length && isPreface(body[0])) embeddedPreface.push(body.shift());
  const preface = explicitPreface || embeddedPreface.join('\n\n') || readingLines.slice(1).filter(isPreface).join('\n\n');
  if (!body.length) throw new Error(`${entry.id} 正文为空`);

  const notes = [];
  const remarks = header.split('\n').filter(line => !/^# /.test(line)).map(line => line.replace(/^> ?/, '')).join('\n').trim();
  if (remarks) notes.push({ kind: '编者说明', source: '整理说明', text: remarks });
  for (const version of versions) {
    notes.push(...parseNotes(version.text, version.source));
    for (const quote of version.text.matchAll(/^>.*(?:\n>.*)*/gm)) {
      if (/^> (?:按原文件保留其题解|保留该条目的正文)/.test(quote[0])) continue;
      notes.push({ kind: '编者说明', source: '整理说明', text: quote[0].replace(/^> ?/gm, '').trim() });
    }
  }

  // 只读元数据或原始条目的题头，绝不从注释的人物生卒年推断创作时间。
  const rawDate = metadata(header, '校勘时间') || metadata(header, '原文件所标时间') || metadata(header, '品读版所标时间')
    || normalizeDate(readingLines[0] || '').match(/(?:约)?\d{4}年.*$/)?.[0]
    || (readingLines[1] && isDateLine(readingLines[1]) ? readingLines[1] : '未标明');
  const date = normalizeDate(rawDate).split(/[；;]/)[0];
  const yearMatch = date.match(/(\d{4})年/);
  const middleDot = entry.title.indexOf('·');
  const form = middleDot === -1 ? entry.title.match(/^[^（(]+/)?.[0].replace(/三首$/, '') || '' : entry.title.slice(0, middleDot);
  const subject = middleDot === -1 ? entry.title : entry.title.slice(middleDot + 1);
  const poem = {
    id: entry.id,
    title: entry.title,
    form,
    subject,
    collection: entry.collection,
    date,
    year: yearMatch ? Number(yearMatch[1]) : null,
    body,
    preface,
    notes,
    versions,
    path: entry.path,
  };
  return poem;
}

export async function buildLibrary(root = ROOT) {
  const index = await readFile(join(root, DATA_PATH, 'index.md'), 'utf8');
  const entries = parseIndex(index);
  const poems = await Promise.all(entries.map(async entry => parsePoem(entry, await readFile(join(root, entry.path), 'utf8'))));
  const groups = Object.fromEntries(['正编', '副编', '补编'].map(group => [group, poems.filter(poem => poem.collection === group).length]));
  return { poems, counts: { total: poems.length, main: groups.正编 + groups.副编, supplement: groups.补编, ...groups } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const library = await buildLibrary();
  const output = join(ROOT, 'assets/poems.js');
  await mkdir(dirname(output), { recursive: true });
  const json = JSON.stringify(library, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  await writeFile(output, `window.POEM_LIBRARY = ${json};\n`, 'utf8');
  console.log(`已生成 ${library.counts.total} 条诗词（主目 ${library.counts.main}，补编 ${library.counts.supplement}）：assets/poems.js`);
}
