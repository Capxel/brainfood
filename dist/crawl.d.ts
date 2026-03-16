import type { CrawlOptions, ProgressUpdate, RawDocument } from './types.js';
export interface CrawlResult {
    documents: RawDocument[];
    errors: string[];
}
export declare function crawlWebsite(rootUrl: string, options: CrawlOptions, onProgress?: (update: ProgressUpdate) => void): Promise<CrawlResult>;
export declare function fetchDocumentsFromUrls(urls: string[], options: Omit<CrawlOptions, 'depth'>, sourceType: 'sitemap', onProgress?: (update: ProgressUpdate) => void): Promise<CrawlResult>;
