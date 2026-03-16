import type { SummaryRequest } from './types.js';
export declare function generateSummary(request: SummaryRequest, enabled: boolean, model: string): Promise<string | null>;
