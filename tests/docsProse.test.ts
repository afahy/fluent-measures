import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

type ProseBlock = {
  /** Prose with inline <code> spans kept for word-count and readability checks. */
  fullText: string;
  /** Prose with inline <code> spans replaced by a neutral token, so code literals are not flagged. */
  proseOnly: string;
};

type Sentence = {
  fullText: string;
  proseOnly: string;
  wordCount: number;
};

const MAX_SENTENCE_WORDS = 25;
const MAX_AVERAGE_WORDS = 15;
const MAX_FK_GRADE = 8;
const MIN_READING_EASE = 60;

const CONTRACTION_RE =
  /\b(?:don't|doesn't|isn't|aren't|can't|won't|wouldn't|shouldn't|haven't|hasn't|it's|that's|there's|you're|we're|they're)\b/gi;

const DISALLOWED_WORDS_RE =
  /\b(?:utilize|utilizes|utilized|ensure|ensures|perform|performs|obtain|obtains|regarding|furthermore|moreover|therefore|however|actually|basically|simply|easily|obviously|just|various|might|spelled-out)\b|\b(?:e\.g\.|i\.e\.|etc\.)/gi;

const PASSIVE_SUPPORT_RE = /\b(?:is|are)\s+(?:not\s+)?supported\b/gi;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeText(html: string, maskCode: boolean): string {
  const source = maskCode ? html.replace(/<code\b[^>]*>[\s\S]*?<\/code\s*>/g, ' CODE ') : html;
  return decodeEntities(source.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract visible documentation prose from <main> in an HTML page, excluding code examples,
 * navigation trees, alias lists, and non-prose summaries.
 */
function extractProseBlocks(html: string): ProseBlock[] {
  const mainStart = html.indexOf('<main');
  const mainEnd = html.indexOf('</main>');
  const region = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : html;

  const stripped = region
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<pre\b[\s\S]*?<\/pre\s*>/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/g, '')
    .replace(/<nav\b[\s\S]*?<\/nav\s*>/g, '')
    .replace(/<dl class="demo-list"[\s\S]*?<\/dl\s*>/g, '')
    .replace(/<dl class="input-results"[\s\S]*?<\/dl\s*>/g, '')
    .replace(/<table class="units"[\s\S]*?<\/table\s*>/g, '')
    .replace(/<ul class="topic-links"[\s\S]*?<\/ul\s*>/g, '');

  const blocks: ProseBlock[] = [];
  const tagRe = /<(\/?)(p|li|dd|dl|ul|ol|table|span)\b([^>]*)>/g;
  const blockTags = new Set(['p', 'li', 'dd', 'dl', 'ul', 'ol', 'table']);
  const stack: { tag: string; attrs: string; contentStart: number; hasNestedBlock: boolean }[] = [];

  for (const match of stripped.matchAll(tagRe)) {
    const isClose = match[1] === '/';
    const tag = match[2];
    const attrs = match[3];
    if (!isClose) {
      if (stack.length > 0 && blockTags.has(tag)) {
        stack[stack.length - 1].hasNestedBlock = true;
      }
      stack.push({
        tag,
        attrs,
        contentStart: (match.index ?? 0) + match[0].length,
        hasNestedBlock: false,
      });
      continue;
    }

    let poppedIndex = stack.length - 1;
    while (poppedIndex >= 0 && stack[poppedIndex].tag !== tag) poppedIndex--;
    if (poppedIndex < 0) continue;
    const entry = stack.splice(poppedIndex)[0];
    const isNoteSpan = tag === 'span' && /\bclass="note"/.test(entry.attrs);
    const isProseTag = tag === 'p' || tag === 'li' || tag === 'dd' || isNoteSpan;
    if (
      !isProseTag ||
      entry.hasNestedBlock ||
      /\bclass="(?:decl|summary|code-head|local-index-label)\b/.test(entry.attrs)
    ) {
      continue;
    }
    const inner = stripped.slice(entry.contentStart, match.index ?? entry.contentStart);
    const fullText = normalizeText(inner, false);
    const proseOnly = normalizeText(inner, true);
    if (fullText.length > 0) {
      blocks.push({ fullText, proseOnly });
    }
  }
  return blocks;
}

function splitSentences(blocks: ProseBlock[]): Sentence[] {
  const sentences: Sentence[] = [];
  const boundary = /(?<![A-Za-z]\.[A-Za-z]\.)(?<=[.!?])\s+(?=[A-Za-z0-9"'(`])/;
  for (const block of blocks) {
    // Split on sentence-ending punctuation followed by a new sentence (including lowercase code identifiers),
    // without splitting on abbreviations like "e.g." or "i.e.".
    const fullParts = block.fullText.split(boundary);
    const proseParts = block.proseOnly.split(boundary);
    for (let i = 0; i < fullParts.length; i++) {
      const fullText = fullParts[i].trim();
      const proseOnly = (proseParts[i] ?? fullText).trim();
      const words = fullText.split(/\s+/).filter(token => /[A-Za-z0-9]/.test(token));
      if (words.length >= 3) {
        sentences.push({ fullText, proseOnly, wordCount: words.length });
      }
    }
  }
  return sentences;
}

function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length === 0) return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function readability(sentences: Sentence[]): {
  avgWords: number;
  fkGrade: number;
  readingEase: number;
} {
  const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
  const totalSyllables = sentences.reduce(
    (sum, s) => sum + s.fullText.split(/\s+/).reduce((acc, w) => acc + countSyllables(w), 0),
    0
  );
  const avgWords = totalWords / sentences.length;
  const avgSyllables = totalSyllables / totalWords;
  return {
    avgWords,
    fkGrade: 0.39 * avgWords + 11.8 * avgSyllables - 15.59,
    readingEase: 206.835 - 1.015 * avgWords - 84.6 * avgSyllables,
  };
}

function proseViolations(html: string): {
  longSentences: string[];
  contractions: string[];
  disallowedWords: string[];
  passiveSupport: string[];
  metrics: { avgWords: number; fkGrade: number; readingEase: number };
  sentenceCount: number;
} {
  const sentences = splitSentences(extractProseBlocks(html));
  const longSentences: string[] = [];
  const contractions: string[] = [];
  const disallowedWords: string[] = [];
  const passiveSupport: string[] = [];

  for (const s of sentences) {
    if (s.wordCount > MAX_SENTENCE_WORDS) {
      longSentences.push(`(${s.wordCount}w) ${s.fullText}`);
    }
    const foundContractions = [...s.proseOnly.matchAll(CONTRACTION_RE)].map(m => m[0]);
    if (foundContractions.length > 0) {
      contractions.push(`[${foundContractions.join(', ')}] ${s.fullText}`);
    }
    const foundWords = [...s.proseOnly.matchAll(DISALLOWED_WORDS_RE)].map(m => m[0]);
    if (foundWords.length > 0) {
      disallowedWords.push(`[${foundWords.join(', ')}] ${s.fullText}`);
    }
    const foundPassive = [...s.proseOnly.matchAll(PASSIVE_SUPPORT_RE)].map(m => m[0]);
    if (foundPassive.length > 0) {
      passiveSupport.push(`[${foundPassive.join(', ')}] ${s.fullText}`);
    }
  }

  return {
    longSentences,
    contractions,
    disallowedWords,
    passiveSupport,
    metrics: readability(sentences),
    sentenceCount: sentences.length,
  };
}

describe('docs Simplified Technical English and plain-language checks', () => {
  const audit = proseViolations(page);

  it('extracts prose sentences from docs/index.html', () => {
    expect(audit.sentenceCount).toBeGreaterThan(100);
  });

  it('keeps every prose sentence within 25 words and average length within 15 words', () => {
    expect(audit.longSentences).toEqual([]);
    expect(audit.metrics.avgWords).toBeLessThanOrEqual(MAX_AVERAGE_WORDS);
  });

  it('keeps plain-language readability within Grade 8 and Reading Ease >= 60', () => {
    expect(audit.metrics.fkGrade).toBeLessThanOrEqual(MAX_FK_GRADE);
    expect(audit.metrics.readingEase).toBeGreaterThanOrEqual(MIN_READING_EASE);
  });

  it('avoids contractions, non-STE filler/jargon, and passive "is/are supported" phrasing in prose', () => {
    expect(audit.contractions).toEqual([]);
    expect(audit.disallowedWords).toEqual([]);
    expect(audit.passiveSupport).toEqual([]);
  });

  it('catches violations in synthetic prose while ignoring inline code examples', () => {
    const bad = proseViolations(`
      <main>
        <p>This single descriptive sentence deliberately keeps running well past the twenty five word Simplified Technical English limit so the automated prose test always catches overly long sentences reliably.</p>
        <p>It doesn't utilize plain words, e.g. you might simply prefer jargon.</p>
        <p>Brackets are not supported.</p>
      </main>
    `);
    expect(bad.longSentences).toHaveLength(1);
    expect(bad.contractions).toHaveLength(1);
    expect(bad.disallowedWords).toHaveLength(1);
    expect(bad.passiveSupport).toHaveLength(1);

    const codeOnly = proseViolations(`
      <main>
        <p>The parser accepts <code>I'm five foot eleven tall</code> and <code>isn't</code> as code examples.</p>
      </main>
    `);
    expect(codeOnly.contractions).toEqual([]);
    expect(codeOnly.disallowedWords).toEqual([]);
    expect(codeOnly.passiveSupport).toEqual([]);
  });
});
