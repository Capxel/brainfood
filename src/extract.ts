import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import type { AnyNode } from 'domhandler';
import { JSDOM } from 'jsdom';

import type { ExtractedDocument, RawDocument } from './types.js';
import { normalizeWhitespace, safeIsoDate, sentenceSummary } from './utils.js';

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'dialog',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '[data-cookie]',
  '[data-consent]',
  '.cookie',
  '.cookies',
  '.consent',
  '.banner',
  '.newsletter'
];

function extractMetaContent($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const content = $(selector).attr('content')?.trim();
    if (content) {
      return content;
    }
  }

  return null;
}

function cleanHtml(html: string): string {
  const $ = cheerio.load(html);
  for (const selector of NOISE_SELECTORS) {
    $(selector).remove();
  }

  $('[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"]').remove();
  return $.html();
}

function renderInline($: cheerio.CheerioAPI, element: AnyNode): string {
  if (element.type === 'text') {
    return $(element).text().replace(/\s+/g, ' ');
  }

  if (element.type !== 'tag') {
    return '';
  }

  const tag = element.tagName.toLowerCase();
  const children = $(element)
    .contents()
    .toArray()
    .map((child) => renderInline($, child))
    .join('');

  if (tag === 'strong' || tag === 'b') {
    return children.trim() ? `**${children.trim()}**` : '';
  }

  if (tag === 'em' || tag === 'i') {
    return children.trim() ? `*${children.trim()}*` : '';
  }

  if (tag === 'code') {
    return children.trim() ? `\`${children.trim()}\`` : '';
  }

  if (tag === 'a') {
    const label = children.trim() || $(element).attr('href')?.trim() || 'link';
    const href = $(element).attr('href')?.trim();
    return href ? `[${label}](${href})` : label;
  }

  if (tag === 'br') {
    return '\n';
  }

  return children;
}

function renderList($: cheerio.CheerioAPI, element: AnyNode, ordered: boolean): string {
  const items = $(element)
    .children('li')
    .toArray()
    .map((child, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const text = renderBlockChildren($, child).trim();
      return `${prefix}${text}`.trimEnd();
    })
    .filter(Boolean);

  return items.join('\n');
}

function renderTable($: cheerio.CheerioAPI, element: AnyNode): string {
  const rows = $(element)
    .find('tr')
    .toArray()
    .map((row) =>
      $(row)
        .find('th,td')
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()))
        .filter(Boolean)
    )
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    return '';
  }

  const [header, ...body] = rows;
  if (!header) {
    return '';
  }

  const separator = header.map(() => '---');
  const lines = [`| ${header.join(' | ')} |`, `| ${separator.join(' | ')} |`];
  for (const row of body) {
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

function renderBlockChildren($: cheerio.CheerioAPI, element: AnyNode): string {
  if (element.type === 'text') {
    return $(element).text().replace(/\s+/g, ' ');
  }

  if (element.type !== 'tag') {
    return '';
  }

  const tag = element.tagName.toLowerCase();
  const inline = () =>
    $(element)
      .contents()
      .toArray()
      .map((child) => renderInline($, child))
      .join('');
  const blocks = () =>
    $(element)
      .contents()
      .toArray()
      .map((child) => renderBlockChildren($, child))
      .join('');

  if (/^h[1-6]$/.test(tag)) {
    const level = Number.parseInt(tag.slice(1), 10);
    return `${'#'.repeat(level)} ${normalizeWhitespace(inline())}\n\n`;
  }

  if (tag === 'p') {
    const content = normalizeWhitespace(inline());
    return content ? `${content}\n\n` : '';
  }

  if (tag === 'pre') {
    const content = $(element).text().replace(/^\n+|\n+$/g, '');
    return content ? `\`\`\`\n${content}\n\`\`\`\n\n` : '';
  }

  if (tag === 'blockquote') {
    const content = normalizeWhitespace(blocks())
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return content ? `${content}\n\n` : '';
  }

  if (tag === 'ul') {
    const content = renderList($, element, false);
    return content ? `${content}\n\n` : '';
  }

  if (tag === 'ol') {
    const content = renderList($, element, true);
    return content ? `${content}\n\n` : '';
  }

  if (tag === 'table') {
    const content = renderTable($, element);
    return content ? `${content}\n\n` : '';
  }

  if (tag === 'hr') {
    return '---\n\n';
  }

  if (tag === 'img') {
    const alt = $(element).attr('alt')?.trim();
    return alt ? `![${alt}]()` : '';
  }

  if (tag === 'section' || tag === 'article' || tag === 'main' || tag === 'div') {
    const content = blocks();
    return content ? `${content.trim()}\n\n` : '';
  }

  return inline();
}

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(`<body>${html}</body>`);
  const rendered = $('body')
    .contents()
    .toArray()
    .map((element) => renderBlockChildren($, element))
    .join('');

  return normalizeWhitespace(
    rendered
      .replace(/\n {2,}/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
  );
}

function extractFromHtml(document: RawDocument): ExtractedDocument {
  const cleanedHtml = cleanHtml(document.html || '');
  const dom = new JSDOM(cleanedHtml, document.url ? { url: document.url } : undefined);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const $ = cheerio.load(cleanedHtml);

  const fallbackHtml = $('main').html() || $('article').html() || $('body').html() || cleanedHtml;
  const markdown = htmlToMarkdown(article?.content || fallbackHtml);
  const title = normalizeWhitespace(
    article?.title || document.titleHint || $('title').text() || $('h1').first().text() || 'Untitled'
  );
  const author = normalizeWhitespace(
    article?.byline || document.authorHint || extractMetaContent($, ['meta[name="author"]', 'meta[property="article:author"]']) || ''
  ) || null;
  const publishedAt =
    safeIsoDate(document.publishedAtHint) ||
    safeIsoDate(extractMetaContent($, ['meta[property="article:published_time"]', 'meta[name="date"]'])) ||
    null;
  const language = document.languageHint || $('html').attr('lang')?.trim() || null;
  const content = markdown || normalizeWhitespace(article?.textContent || $('body').text());

  return {
    sourceType: document.sourceType,
    canonicalSource: document.canonicalSource,
    url: document.url,
    source: document.sourcePath,
    relativeOutputPath: document.relativeOutputPath,
    contentType: document.contentType,
    title,
    content,
    excerpt: normalizeWhitespace(article?.excerpt || sentenceSummary(content) || '') || null,
    language,
    author,
    publishedAt,
    lastModified: safeIsoDate(document.lastModified),
    statusCode: document.statusCode,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    discoveredLinks: document.discoveredLinks
  };
}

function extractFromText(document: RawDocument): ExtractedDocument {
  const content = normalizeWhitespace(document.text || '');
  const title = normalizeWhitespace(document.titleHint || content.split('\n')[0] || 'Untitled');

  return {
    sourceType: document.sourceType,
    canonicalSource: document.canonicalSource,
    url: document.url,
    source: document.sourcePath,
    relativeOutputPath: document.relativeOutputPath,
    contentType: document.contentType,
    title,
    content,
    excerpt: sentenceSummary(content),
    language: document.languageHint || null,
    author: document.authorHint || null,
    publishedAt: safeIsoDate(document.publishedAtHint),
    lastModified: safeIsoDate(document.lastModified),
    statusCode: document.statusCode,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    discoveredLinks: document.discoveredLinks
  };
}

export function extractDocument(rawDocument: RawDocument): ExtractedDocument {
  if (rawDocument.html) {
    return extractFromHtml(rawDocument);
  }

  return extractFromText(rawDocument);
}
