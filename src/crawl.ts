import * as cheerio from 'cheerio';
import fetch, { type RequestInit, type Response } from 'node-fetch';

import type { CrawlOptions, DiscoveredLink, ProgressUpdate, RawDocument, SourceType } from './types.js';
import { DEFAULT_USER_AGENT, normalizeUrl, safeIsoDate, sleep, urlToRelativeOutputPath } from './utils.js';

const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'];
const TEXT_CONTENT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];

interface QueueEntry {
  url: string;
  depth: number;
}

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsConfig {
  rules: RobotsRule[];
}

interface FetchRuntimeOptions {
  timeoutMs: number;
  rateLimitMs: number;
  userAgent: string;
}

export interface CrawlResult {
  documents: RawDocument[];
  errors: string[];
}

interface FetchAttemptResult {
  document?: RawDocument | null;
  error?: string;
  url: string;
}

class RateLimitedFetcher {
  private nextRequestAt = 0;
  private reservation: Promise<void> = Promise.resolve();

  constructor(private readonly options: FetchRuntimeOptions) {}

  private async reserveStartSlot(): Promise<void> {
    let waitMs = 0;
    const reservation = this.reservation.then(() => {
      const now = Date.now();
      const startAt = Math.max(now, this.nextRequestAt);
      this.nextRequestAt = startAt + this.options.rateLimitMs;
      waitMs = Math.max(0, startAt - now);
    });

    this.reservation = reservation.catch(() => undefined);
    await reservation;

    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    await this.reserveStartSlot();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        headers: {
          'user-agent': this.options.userAgent || DEFAULT_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.1',
          ...(init.headers || {})
        },
        redirect: 'follow',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isHtmlContentType(contentType: string): boolean {
  return HTML_CONTENT_TYPES.some((type) => contentType.includes(type));
}

function isTextContentType(contentType: string): boolean {
  return TEXT_CONTENT_TYPES.some((type) => contentType.includes(type));
}

function extractLinks(html: string, baseUrl: string): DiscoveredLink[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const links: DiscoveredLink[] = [];

  $('a[href]').each((_, anchor) => {
    const href = ($(anchor).attr('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }

    try {
      const absoluteUrl = normalizeUrl(new URL(href, baseUrl).toString());
      if (seen.has(absoluteUrl)) {
        return;
      }

      seen.add(absoluteUrl);
      links.push({ href, absoluteUrl });
    } catch {
      links.push({ href });
    }
  });

  return links;
}

function parseRobotsTxt(content: string, userAgent: string): RobotsConfig {
  const desiredAgents = [userAgent.toLowerCase(), 'brain-drain', '*'];
  const lines = content.split(/\r?\n/);
  const rules: RobotsRule[] = [];
  let applies = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      applies = desiredAgents.some((agent) => value.toLowerCase().includes(agent));
      continue;
    }

    if (!applies) {
      continue;
    }

    if ((key === 'allow' || key === 'disallow') && value) {
      rules.push({ allow: key === 'allow', path: value });
    }
  }

  return { rules };
}

function isAllowedByRobots(targetUrl: string, robots: RobotsConfig | null): boolean {
  if (!robots || robots.rules.length === 0) {
    return true;
  }

  const pathname = new URL(targetUrl).pathname || '/';
  let bestMatch: RobotsRule | null = null;

  for (const rule of robots.rules) {
    if (!pathname.startsWith(rule.path)) {
      continue;
    }

    if (!bestMatch || rule.path.length >= bestMatch.path.length) {
      bestMatch = rule;
    }
  }

  return bestMatch ? bestMatch.allow : true;
}

function matchesExcludePattern(pathname: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }

  if (pattern.endsWith('/*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }

  if (pattern.startsWith('*')) {
    return pathname.endsWith(pattern.slice(1));
  }

  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }

  return pathname === pattern;
}

function getExcludedPath(targetUrl: string, patterns: string[]): string | null {
  const url = new URL(targetUrl);
  const pathname = `${url.pathname || '/'}${url.search || ''}`;
  return patterns.some((pattern) => matchesExcludePattern(pathname, pattern) || matchesExcludePattern(url.pathname || '/', pattern))
    ? pathname
    : null;
}

function reportExcluded(
  stage: 'crawl' | 'sitemap',
  targetUrl: string,
  options: Pick<CrawlOptions, 'excludePatterns'>,
  saved: number,
  queued: number,
  active: number,
  onProgress?: (update: ProgressUpdate) => void
): boolean {
  const excludedPath = getExcludedPath(targetUrl, options.excludePatterns);
  if (!excludedPath) {
    return false;
  }

  onProgress?.({
    stage,
    current: saved,
    queued,
    saved,
    active,
    message: `Skipping ${excludedPath} (excluded)`
  });
  return true;
}

async function fetchRobots(origin: string, fetcher: RateLimitedFetcher): Promise<RobotsConfig | null> {
  try {
    const response = await fetcher.fetch(`${origin}/robots.txt`);
    if (!response.ok) {
      return null;
    }

    const content = await response.text();
    return parseRobotsTxt(content, DEFAULT_USER_AGENT);
  } catch {
    return null;
  }
}

async function fetchSingleUrl(url: string, sourceType: 'crawl' | 'sitemap', fetcher: RateLimitedFetcher): Promise<RawDocument | null> {
  const response = await fetcher.fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with status ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || 'text/plain').toLowerCase();
  const canonicalSource = normalizeUrl(response.url || url);
  const lastModified = safeIsoDate(response.headers.get('last-modified'));

  if (isHtmlContentType(contentType)) {
    const html = await response.text();
    return {
      sourceType,
      canonicalSource,
      url: canonicalSource,
      relativeOutputPath: urlToRelativeOutputPath(canonicalSource),
      contentType,
      html,
      languageHint: null,
      discoveredLinks: extractLinks(html, canonicalSource),
      lastModified,
      statusCode: response.status
    };
  }

  if (isTextContentType(contentType)) {
    const text = await response.text();
    return {
      sourceType,
      canonicalSource,
      url: canonicalSource,
      relativeOutputPath: urlToRelativeOutputPath(canonicalSource),
      contentType,
      text,
      discoveredLinks: [],
      lastModified,
      statusCode: response.status
    };
  }

  return null;
}

async function fetchBatch(
  entries: QueueEntry[],
  sourceType: 'crawl' | 'sitemap',
  fetcher: RateLimitedFetcher,
  saved: number,
  queued: number,
  onProgress?: (update: ProgressUpdate) => void
): Promise<FetchAttemptResult[]> {
  const active = entries.length;

  return Promise.all(
    entries.map(async (entry, index) => {
      onProgress?.({
        stage: sourceType,
        current: saved + index + 1,
        queued,
        saved,
        active,
        message: `Fetching ${entry.url}`
      });

      try {
        const document = await fetchSingleUrl(entry.url, sourceType, fetcher);
        if (!document) {
          return {
            url: entry.url,
            error: `Skipped unsupported content type at ${entry.url}`
          };
        }

        return {
          url: entry.url,
          document
        };
      } catch (error) {
        return {
          url: entry.url,
          error: error instanceof Error ? error.message : `Unknown crawl error for ${entry.url}`
        };
      }
    })
  );
}

export async function crawlWebsite(
  rootUrl: string,
  options: CrawlOptions,
  onProgress?: (update: ProgressUpdate) => void
): Promise<CrawlResult> {
  const normalizedRoot = normalizeUrl(rootUrl);
  const root = new URL(normalizedRoot);
  const fetcher = new RateLimitedFetcher({
    timeoutMs: options.timeoutMs,
    rateLimitMs: options.rateLimitMs,
    userAgent: options.userAgent
  });
  const robots = await fetchRobots(root.origin, fetcher);
  const queue: QueueEntry[] = [{ url: normalizedRoot, depth: 0 }];
  const queued = new Set<string>([normalizedRoot]);
  const seen = new Set<string>();
  const documents: RawDocument[] = [];
  const errors: string[] = [];

  while (queue.length > 0 && documents.length < options.maxPages) {
    const batch: QueueEntry[] = [];

    while (queue.length > 0 && batch.length < options.concurrency && documents.length + batch.length < options.maxPages) {
      const current = queue.shift();
      if (!current || seen.has(current.url)) {
        continue;
      }

      seen.add(current.url);

      if (reportExcluded('crawl', current.url, options, documents.length, queue.length, batch.length, onProgress)) {
        continue;
      }

      if (!isAllowedByRobots(current.url, robots)) {
        errors.push(`Skipped by robots.txt: ${current.url}`);
        continue;
      }

      batch.push(current);
    }

    if (batch.length === 0) {
      continue;
    }

    const results = await fetchBatch(batch, 'crawl', fetcher, documents.length, queue.length, onProgress);

    for (const [index, result] of results.entries()) {
      if (result.error) {
        errors.push(result.error);
        onProgress?.({
          stage: 'crawl',
          current: documents.length,
          queued: queue.length,
          saved: documents.length,
          active: Math.max(0, results.length - index - 1),
          message: result.error
        });
        continue;
      }

      const document = result.document;
      if (!document) {
        continue;
      }

      documents.push(document);
      const current = batch[index];
      if (!current || !document.html || current.depth >= options.depth) {
        continue;
      }

      for (const link of document.discoveredLinks) {
        if (!link.absoluteUrl) {
          continue;
        }

        const normalizedLink = normalizeUrl(link.absoluteUrl);
        const target = new URL(normalizedLink);
        if (target.origin !== root.origin || seen.has(normalizedLink) || queued.has(normalizedLink)) {
          continue;
        }

        if (reportExcluded('crawl', normalizedLink, options, documents.length, queue.length, 0, onProgress)) {
          seen.add(normalizedLink);
          continue;
        }

        queue.push({ url: normalizedLink, depth: current.depth + 1 });
        queued.add(normalizedLink);
      }
    }
  }

  return { documents, errors };
}

export async function fetchDocumentsFromUrls(
  urls: string[],
  options: Omit<CrawlOptions, 'depth'>,
  sourceType: 'sitemap',
  onProgress?: (update: ProgressUpdate) => void
): Promise<CrawlResult> {
  const fetcher = new RateLimitedFetcher({
    timeoutMs: options.timeoutMs,
    rateLimitMs: options.rateLimitMs,
    userAgent: options.userAgent
  });

  const robotsCache = new Map<string, RobotsConfig | null>();
  const normalizedUrls = Array.from(new Set(urls.map((url) => normalizeUrl(url)))).slice(0, options.maxPages);
  const documents: RawDocument[] = [];
  const errors: string[] = [];

  for (let start = 0; start < normalizedUrls.length; start += options.concurrency) {
    const chunk = normalizedUrls.slice(start, start + options.concurrency);
    const active = chunk.length;
    const results = await Promise.all(
      chunk.map(async (url, offset) => {
        if (reportExcluded(sourceType, url, options, documents.length, Math.max(0, normalizedUrls.length - start - offset - 1), active, onProgress)) {
          return { url } satisfies FetchAttemptResult;
        }

        const origin = new URL(url).origin;
        if (!robotsCache.has(origin)) {
          robotsCache.set(origin, await fetchRobots(origin, fetcher));
        }

        if (!isAllowedByRobots(url, robotsCache.get(origin) || null)) {
          return {
            url,
            error: `Skipped by robots.txt: ${url}`
          } satisfies FetchAttemptResult;
        }

        onProgress?.({
          stage: sourceType,
          current: start + offset + 1,
          queued: Math.max(0, normalizedUrls.length - start - offset - 1),
          saved: documents.length,
          active,
          message: `Fetching ${url}`
        });

        try {
          return {
            url,
            document: await fetchSingleUrl(url, sourceType, fetcher)
          } satisfies FetchAttemptResult;
        } catch (error) {
          return {
            url,
            error: error instanceof Error ? error.message : `Unknown fetch error for ${url}`
          } satisfies FetchAttemptResult;
        }
      })
    );

    for (const result of results) {
      if (result.error) {
        errors.push(result.error);
        continue;
      }

      if (result.document) {
        documents.push(result.document);
      }
    }
  }

  return { documents, errors };
}
