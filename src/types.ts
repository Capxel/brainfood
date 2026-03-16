export type OutputFormat = 'json' | 'markdown' | 'both';

export type SourceType = 'crawl' | 'local' | 'sitemap';

export interface SharedOptions {
  output: string;
  format: OutputFormat;
  summarize: boolean;
  openAiModel: string;
  rateLimitMs: number;
  timeoutMs: number;
  userAgent: string;
}

export interface CrawlOptions extends SharedOptions {
  depth: number;
  maxPages: number;
}

export interface SitemapOptions extends SharedOptions {
  maxPages: number;
}

export interface ProgressUpdate {
  stage: string;
  current?: number;
  queued?: number;
  saved?: number;
  message: string;
}

export interface DiscoveredLink {
  href: string;
  absoluteUrl?: string;
}

export interface RawDocument {
  sourceType: SourceType;
  canonicalSource: string;
  url?: string;
  sourcePath?: string;
  relativeOutputPath: string;
  contentType: string;
  html?: string;
  text?: string;
  titleHint?: string | null;
  languageHint?: string | null;
  authorHint?: string | null;
  publishedAtHint?: string | null;
  lastModified?: string | null;
  statusCode?: number;
  discoveredLinks: DiscoveredLink[];
}

export interface ExtractedDocument {
  sourceType: SourceType;
  canonicalSource: string;
  url?: string;
  source?: string;
  relativeOutputPath: string;
  contentType: string;
  title: string;
  content: string;
  excerpt: string | null;
  language: string | null;
  author: string | null;
  publishedAt: string | null;
  lastModified: string | null;
  statusCode?: number;
  wordCount: number;
  discoveredLinks: DiscoveredLink[];
}

export type EntityType = 'person' | 'company' | 'product' | 'topic' | 'unknown';

export interface Entity {
  name: string;
  type: EntityType;
}

export interface Relationship {
  type: 'links_to';
  target: string;
  targetTitle?: string;
}

export interface KnowledgeNode {
  id: string;
  title: string;
  url?: string;
  source?: string;
  content: string;
  summary: string | null;
  topics: string[];
  entities: Entity[];
  relationships: Relationship[];
  metadata: {
    sourceType: SourceType;
    canonicalSource: string;
    relativeOutputPath: string;
    contentType: string;
    statusCode?: number;
    wordCount: number;
    language: string | null;
    author: string | null;
    publishedAt: string | null;
    lastModified: string | null;
    generatedAt: string;
  };
}

export interface KnowledgeGraph {
  '@context': string[];
  tool: {
    name: string;
    brand: string;
    website: string;
    version: string;
  };
  generatedAt: string;
  sourceType: SourceType;
  sourceRoot: string;
  stats: {
    documentCount: number;
    relationshipCount: number;
    topicCount: number;
    entityCount: number;
  };
  nodes: KnowledgeNode[];
}

export interface RunResult {
  outputDir: string;
  graphPath: string;
  nodeCount: number;
}

export interface SummaryRequest {
  title: string;
  content: string;
  fallback: string | null;
}
