import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { fetchDocumentsFromUrls } from './crawl.js';
import { DEFAULT_USER_AGENT, normalizeUrl } from './utils.js';
async function loadXml(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        const response = await fetch(url, {
            headers: {
                'user-agent': options.userAgent || DEFAULT_USER_AGENT,
                accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1'
            },
            redirect: 'follow',
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch sitemap ${url}: ${response.status}`);
        }
        return await response.text();
    }
    finally {
        clearTimeout(timeout);
    }
}
async function collectSitemapUrls(url, options, visited) {
    const normalized = normalizeUrl(url);
    if (visited.has(normalized)) {
        return [];
    }
    visited.add(normalized);
    const xml = await loadXml(normalized, options);
    const $ = cheerio.load(xml, { xmlMode: true });
    const nestedSitemaps = $('sitemap > loc')
        .map((_, element) => $(element).text().trim())
        .get()
        .filter(Boolean);
    if (nestedSitemaps.length > 0) {
        const discovered = [];
        for (const nested of nestedSitemaps) {
            discovered.push(...(await collectSitemapUrls(nested, options, visited)));
        }
        return discovered;
    }
    return $('url > loc')
        .map((_, element) => $(element).text().trim())
        .get()
        .filter(Boolean)
        .map((entry) => normalizeUrl(entry));
}
export async function crawlFromSitemap(sitemapUrl, options, onProgress) {
    const urls = Array.from(new Set(await collectSitemapUrls(sitemapUrl, options, new Set())));
    const crawlOptions = {
        output: options.output,
        format: options.format,
        summarize: options.summarize,
        openAiModel: options.openAiModel,
        rateLimitMs: options.rateLimitMs,
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent,
        excludePatterns: options.excludePatterns,
        concurrency: options.concurrency,
        maxPages: options.maxPages
    };
    const result = await fetchDocumentsFromUrls(urls, crawlOptions, 'sitemap', onProgress);
    return {
        ...result,
        urls
    };
}
//# sourceMappingURL=sitemap.js.map