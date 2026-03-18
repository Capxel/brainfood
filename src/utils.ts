import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_USER_AGENT = 'brainfood/1.0 (+https://github.com/Capxel/brainfood)';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function ensureDirectory(targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
}

export function sanitizeSegment(value: string): string {
  const cleaned = value
    .replace(/%[0-9A-F]{2}/gi, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return cleaned || 'index';
}

export function slugify(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalized
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return slug || 'untitled';
}

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';

  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function urlToRelativeOutputPath(rawUrl: string): string {
  const url = new URL(rawUrl);
  const host = sanitizeSegment(url.hostname);
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => sanitizeSegment(segment));

  if (!segments.length) {
    return path.posix.join(host, 'index');
  }

  const lastSegment = segments[segments.length - 1] ?? 'index';
  if (lastSegment.includes('.')) {
    const withoutExtension = lastSegment.replace(/\.[a-z0-9]+$/i, '') || 'index';
    segments[segments.length - 1] = withoutExtension;
  }

  return path.posix.join(host, ...segments);
}

export function localPathToRelativeOutputPath(rootDir: string, filePath: string): string {
  const relativePath = path.relative(rootDir, filePath);
  const segments = relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => sanitizeSegment(segment.replace(/\.[^.]+$/, '')));

  return segments.length ? path.posix.join(...segments) : 'index';
}

export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

const SUMMARY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'for', 'from', 'had', 'has', 'have',
  'he', 'her', 'his', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their',
  'them', 'they', 'this', 'to', 'was', 'we', 'were', 'will', 'with', 'you', 'your'
]);

function summarizeText(sentences: string[]): string | null {
  return normalizeWhitespace(sentences.join(' ')) || null;
}

export function fallbackSummary(content: string): string | null {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return null;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return normalizeWhitespace(sentences.slice(0, 2).join(' ')).slice(0, 320) || null;
}

export function sentenceSummary(content: string): string | null {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return null;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);

  if (sentences.length === 0) {
    return fallbackSummary(content);
  }

  const scored = sentences.map((sentence, index) => {
    const capitalizedWords = sentence.match(/\b[A-Z][a-z]+(?:[A-Z][A-Za-z]+)?\b/g)?.length || 0;
    const numbers = sentence.match(/\b\d+(?:[.,]\d+)?\b/g)?.length || 0;
    const uniqueTerms = new Set(
      (sentence.toLowerCase().match(/\b[a-z][a-z0-9-]{2,}\b/g) || []).filter((term) => !SUMMARY_STOPWORDS.has(term))
    ).size;

    return {
      sentence,
      index,
      score: capitalizedWords * 3 + numbers * 2 + uniqueTerms
    };
  });

  const selected = scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.sentence);

  if (selected.length === 0) {
    return fallbackSummary(content);
  }

  const kept: string[] = [];
  for (const sentence of selected) {
    const candidate = summarizeText([...kept, sentence]);
    if (!candidate) {
      continue;
    }

    if (candidate.length > 500) {
      if (kept.length === 0) {
        return candidate;
      }
      break;
    }

    kept.push(sentence);
  }

  return summarizeText(kept)?.slice(0, 500) || fallbackSummary(content);
}

export function safeIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function packageVersion(): string {
  return process.env.npm_package_version || '1.0.0';
}
