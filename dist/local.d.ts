import type { ProgressUpdate, RawDocument } from './types.js';
export declare function collectLocalDocuments(rootDir: string, onProgress?: (update: ProgressUpdate) => void): Promise<RawDocument[]>;
