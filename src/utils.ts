import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_USER_AGENT = 'brain-drain/1.0 (+https://github.com/Capxel/brain-drain)';

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

export function sentenceSummary(content: string): string | null {
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
