import * as cheerio from 'cheerio';
import fetch, { type RequestInit } from 'node-fetch';

import type { CrawlOptions, DiscoveredLink, ProgressUpdate, RawDocument } from './types.js';
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

class RateLimitedFetcher {
  private lastRequestAt = 0;

  constructor(private readonly options: FetchRuntimeOptions) {}

  async fetch(url: string, init: RequestInit = {}): Promise<import('node-fetch').Response> {
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = Math.max(0, this.options.rateLimitMs - elapsed);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      this.lastRequestAt = Date.now();
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
  const seen = new Set<string>();
  const documents: RawDocument[] = [];
  const errors: string[] = [];

  while (queue.length > 0 && documents.length < options.maxPages) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (seen.has(current.url)) {
      continue;
    }

    seen.add(current.url);
    if (!isAllowedByRobots(current.url, robots)) {
      errors.push(`Skipped by robots.txt: ${current.url}`);
      continue;
    }

    onProgress?.({
      stage: 'crawl',
      current: documents.length + 1,
      queued: queue.length,
      saved: documents.length,
      message: `Fetching ${current.url}`
    });

    try {
      const document = await fetchSingleUrl(current.url, 'crawl', fetcher);
      if (!document) {
        errors.push(`Skipped unsupported content type at ${current.url}`);
        continue;
      }

      documents.push(document);
      if (!document.html || current.depth >= options.depth) {
        continue;
      }

      for (const link of document.discoveredLinks) {
        if (!link.absoluteUrl) {
          continue;
        }

        const target = new URL(link.absoluteUrl);
        if (target.origin !== root.origin || seen.has(link.absoluteUrl)) {
          continue;
        }

        queue.push({ url: link.absoluteUrl, depth: current.depth + 1 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown crawl error for ${current.url}`;
      errors.push(message);
      onProgress?.({
        stage: 'crawl',
        current: documents.length,
        queued: queue.length,
        saved: documents.length,
        message
      });
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
  const documents: RawDocument[] = [];
  const errors: string[] = [];

  for (const [index, url] of urls.slice(0, options.maxPages).entries()) {
    const normalized = normalizeUrl(url);
    const origin = new URL(normalized).origin;

    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, await fetchRobots(origin, fetcher));
    }

    if (!isAllowedByRobots(normalized, robotsCache.get(origin) || null)) {
      errors.push(`Skipped by robots.txt: ${normalized}`);
      continue;
    }

    onProgress?.({
      stage: sourceType,
      current: index + 1,
      queued: Math.max(0, urls.length - index - 1),
      saved: documents.length,
      message: `Fetching ${normalized}`
    });

    try {
      const document = await fetchSingleUrl(normalized, sourceType, fetcher);
      if (document) {
        documents.push(document);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Unknown fetch error for ${normalized}`);
    }
  }

  return { documents, errors };
}
