import type { ExtractedDocument, KnowledgeGraph, KnowledgeNode, SourceType } from './types.js';
export declare function buildKnowledgeNodes(documents: ExtractedDocument[]): KnowledgeNode[];
export declare function buildKnowledgeGraph(sourceType: SourceType, sourceRoot: string, nodes: KnowledgeNode[]): KnowledgeGraph;
