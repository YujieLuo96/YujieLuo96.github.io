import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = realpathSync(resolve(scriptDir, '..', '..'));
const configPath = resolve(repoRoot, 'gptbot', 'corpus.config.json');
const outputPath = resolve(repoRoot, 'gptbot', 'corpus.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const checkOnly = process.argv.includes('--check');

function git(...args) {
  return execFileSync('git', ['-c', `safe.directory=${repoRoot.replace(/\\/g, '/')}`, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function hash(value, length = 64) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function assertSafeTrackedPath(path, tracked) {
  if (!path || isAbsolute(path) || path.split(/[\\/]+/).includes('..')) {
    throw new Error(`Unsafe corpus path: ${path}`);
  }
  const normalized = path.replace(/\\/g, '/');
  if (!tracked.has(normalized)) throw new Error(`Corpus source is not tracked by Git: ${normalized}`);
  const absolute = resolve(repoRoot, normalized);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the corpus: ${normalized}`);
  const real = realpathSync(absolute);
  const rel = relative(repoRoot, real);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new Error(`Corpus path escapes the repository: ${normalized}`);
  }
  return { absolute: real, normalized };
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? `&${entity};`;
    const point = entity[1].toLowerCase() === 'x'
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : '';
  });
}

function cleanWhitespace(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html) {
  let value = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  value = decodeEntities(value);
  return cleanWhitespace(value);
}

function extractHtmlSections(html, source) {
  const units = [];
  for (const section of source.sections) {
    const expression = new RegExp(`<section\\s+[^>]*id=["']${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([\\s\\S]*?)<\\/section>`, 'i');
    const match = html.match(expression);
    if (!match) throw new Error(`Missing #${section} in ${source.path}`);
    const heading = match[1].match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
    units.push({
      section,
      anchor: section,
      title: heading ? htmlToText(heading[1]) : section,
      text: htmlToText(match[1])
    });
  }
  return units;
}

function removeLatexComments(value) {
  return value.split(/\r?\n/).map((line) => {
    let slashCount = 0;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '\\') {
        slashCount += 1;
        continue;
      }
      if (char === '%' && slashCount % 2 === 0) return line.slice(0, index);
      slashCount = 0;
    }
    return line;
  }).join('\n');
}

function unwrapLatexCommands(value) {
  let output = value;
  const twoArgCommands = ['href'];
  for (const command of twoArgCommands) {
    const pattern = new RegExp(`\\\\${command}\\s*\\{[^{}]*\\}\\s*\\{([^{}]*)\\}`, 'g');
    output = output.replace(pattern, '$1');
  }
  for (let pass = 0; pass < 8; pass += 1) {
    const next = output.replace(/\\(?:textbf|textit|emph|underline|section\*?|subsection\*?|subsubsection\*?|url|mbox|mathrm|mathbf|mathcal)\s*\{([^{}]*)\}/g, '$1');
    if (next === output) break;
    output = next;
  }
  return output;
}

function latexToText(latex) {
  let value = removeLatexComments(latex);
  value = value
    .replace(/\\begin\{[^}]+\}/g, '\n')
    .replace(/\\end\{[^}]+\}/g, '\n')
    .replace(/\\item(?:\[[^\]]*\])?/g, '\n- ')
    .replace(/\\(?:section|subsection|subsubsection)\*?\s*\{/g, '\n')
    .replace(/\\\\(?:\[[^\]]*\])?/g, '\n');
  value = unwrapLatexCommands(value)
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/~+/g, ' ')
    .replace(/\\([%&_#$])/g, '$1');
  return cleanWhitespace(value);
}

function markdownToUnits(markdown, source) {
  const text = markdown
    .replace(/^---\s*[\s\S]*?\n---\s*/m, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');
  const lines = text.split(/\r?\n/);
  const units = [];
  let current = { section: source.section, anchor: source.section, title: source.title, lines: [] };
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading && current.lines.some((item) => item.trim())) {
      units.push({ ...current, text: cleanWhitespace(current.lines.join('\n')) });
      const slug = heading[1].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      current = { section: slug || source.section, anchor: slug || source.section, title: heading[1].trim(), lines: [] };
    } else if (heading) {
      current.title = heading[1].trim();
      current.section = current.section || source.section;
      current.anchor = current.anchor || source.section;
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((item) => item.trim())) units.push({ ...current, text: cleanWhitespace(current.lines.join('\n')) });
  return units.filter((unit) => unit.text);
}

function splitIntoChunks(text, maxChars, overlapChars) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= maxChars) return [paragraph];
    const pieces = [];
    for (let cursor = 0; cursor < paragraph.length; cursor += Math.max(1, maxChars - overlapChars)) {
      pieces.push(paragraph.slice(cursor, cursor + maxChars));
    }
    return pieces;
  });
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    const overlap = current.slice(Math.max(0, current.length - overlapChars));
    current = overlap ? `${overlap}\n\n${paragraph}`.slice(0, maxChars) : paragraph.slice(0, maxChars);
  }
  if (current) chunks.push(current);
  return chunks.map(cleanWhitespace).filter(Boolean);
}

function buildCorpus() {
  const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean).map((path) => path.replace(/\\/g, '/')));
  // Use the newest commit that touched an allowlisted source instead of HEAD.
  // This avoids a self-referential corpus.json that becomes stale merely when
  // the generated assistant module itself is committed.
  const sourcePaths = config.sources.map((source) => source.path.replace(/\\/g, '/'));
  const commit = git('log', '-1', '--format=%H', '--', ...sourcePaths) || git('rev-parse', 'HEAD');
  const generatedAt = git('show', '-s', '--format=%cI', commit);
  const documents = [];
  const chunks = [];

  for (const source of config.sources) {
    const { absolute, normalized } = assertSafeTrackedPath(source.path, tracked);
    const raw = readFileSync(absolute, 'utf8');
    let units;
    if (source.kind === 'html-sections') units = extractHtmlSections(raw, source);
    else if (source.kind === 'html-document') units = [{ section: source.section, anchor: source.section, title: source.title, text: htmlToText(raw) }];
    else if (source.kind === 'latex') units = [{ section: source.section, anchor: source.section, title: source.title, text: latexToText(raw) }];
    else if (source.kind === 'markdown') units = markdownToUnits(raw, source);
    else throw new Error(`Unsupported corpus source kind: ${source.kind}`);

    const documentId = `doc_${hash(normalized, 16)}`;
    const usableUnits = units.filter((unit) => unit.text && unit.text.length >= 20);
    documents.push({
      id: documentId,
      path: normalized,
      kind: source.kind,
      title: source.title,
      sha256: hash(raw),
      sections: usableUnits.map((unit) => unit.section)
    });

    usableUnits.forEach((unit) => {
      splitIntoChunks(unit.text, config.chunking.maxChars, config.chunking.overlapChars).forEach((text, index) => {
        const identity = `${normalized}\0${unit.section}\0${index}\0${text}`;
        chunks.push({
          id: `chunk_${hash(identity, 20)}`,
          documentId,
          path: normalized,
          title: unit.title || source.title,
          section: unit.section,
          anchor: normalized === 'index.html' ? unit.anchor : '',
          index,
          text,
          sha256: hash(text)
        });
      });
    });
  }

  const corpus = {
    version: config.version,
    commit,
    generatedAt,
    stats: {
      documents: documents.length,
      chunks: chunks.length,
      characters: chunks.reduce((total, chunk) => total + chunk.text.length, 0)
    },
    documents,
    chunks
  };
  return `${JSON.stringify(corpus, null, 2)}\n`;
}

const output = buildCorpus();
if (checkOnly) {
  const existing = readFileSync(outputPath, 'utf8');
  if (existing !== output) {
    console.error('gptbot/corpus.json is stale. Run: node gptbot/scripts/build-corpus.mjs');
    process.exitCode = 1;
  } else {
    console.log('gptbot/corpus.json is up to date.');
  }
} else {
  writeFileSync(outputPath, output, 'utf8');
  const parsed = JSON.parse(output);
  console.log(`Wrote gptbot/corpus.json (${parsed.stats.documents} documents, ${parsed.stats.chunks} chunks).`);
}
