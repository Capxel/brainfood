import type { ProgressUpdate, RawDocument, SitemapOptions } from './types.js';
export declare function crawlFromSitemap(sitemapUrl: string, options: SitemapOptions, onProgress?: (update: ProgressUpdate) => void): Promise<{
    documents: RawDocument[];
    errors: string[];
    urls: string[];
}>;
