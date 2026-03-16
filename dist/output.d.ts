import type { KnowledgeGraph, OutputFormat, RunResult } from './types.js';
export declare function writeOutputBundle(graph: KnowledgeGraph, outputDir: string, format: OutputFormat): Promise<RunResult>;
