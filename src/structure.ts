import type { Entity, EntityType, ExtractedDocument, KnowledgeGraph, KnowledgeNode, Relationship, SourceType } from './types.js';
import { normalizeUrl, packageVersion, sentenceSummary, shortHash } from './utils.js';

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'being',
  'between', 'both', 'but', 'by', 'can', 'could', 'do', 'does', 'for', 'from', 'get', 'had', 'has', 'have', 'how',
  'if', 'in', 'into', 'is', 'it', 'its', 'may', 'more', 'most', 'new', 'not', 'of', 'on', 'or', 'our', 'out', 'over',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'to',
  'up', 'use', 'using', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you', 'your'
]);

function extractTopics(document: ExtractedDocument): string[] {
  const frequency = new Map<string, number>();
  const corpus = `${document.title}\n${document.content}`.toLowerCase();
  const tokens = corpus.match(/[a-z][a-z0-9-]{2,}/g) || [];

  for (const token of tokens) {
    if (STOPWORDS.has(token)) {
      continue;
    }

    frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([topic]) => topic);
}

function classifyEntity(name: string): EntityType {
  if (/\b(inc|corp|llc|ltd|gmbh|company|co\.)\b/i.test(name)) {
    return 'company';
  }

  if (/\b(v\d+|[A-Z]{2,}\d+|[A-Z][a-z]+\s+[0-9]{2,})\b/.test(name)) {
    return 'product';
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 4) {
    return 'person';
  }

  return 'unknown';
}

function extractEntities(document: ExtractedDocument, topics: string[]): Entity[] {
  const matches = document.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z0-9&.-]+){0,3}\b/g) || [];
  const entities = new Map<string, Entity>();

  for (const match of matches) {
    const name = match.trim();
    if (name.length < 3 || STOPWORDS.has(name.toLowerCase())) {
      continue;
    }

    entities.set(name, { name, type: classifyEntity(name) });
  }

  for (const topic of topics.slice(0, 4)) {
    if (!entities.has(topic)) {
      entities.set(topic, { name: topic, type: 'topic' });
    }
  }

  return [...entities.values()].slice(0, 15);
}

function buildRelationships(document: ExtractedDocument, sourceMap: Map<string, KnowledgeNode>): Relationship[] {
  const relationships: Relationship[] = [];
  const seenTargets = new Set<string>();

  for (const link of document.discoveredLinks) {
    if (!link.absoluteUrl) {
      continue;
    }

    const normalizedTarget = normalizeUrl(link.absoluteUrl);
    const relatedNode = sourceMap.get(normalizedTarget);
    if (!relatedNode || seenTargets.has(relatedNode.id)) {
      continue;
    }

    seenTargets.add(relatedNode.id);
    relationships.push({
      type: 'links_to',
      target: relatedNode.id,
      targetTitle: relatedNode.title
    });
  }

  return relationships;
}

export function buildKnowledgeNodes(documents: ExtractedDocument[]): KnowledgeNode[] {
  const generatedAt = new Date().toISOString();
  const baseNodes = documents.map((document) => {
    const topics = extractTopics(document);
    const entities = extractEntities(document, topics);

    return {
      id: shortHash(document.canonicalSource),
      title: document.title,
      url: document.url,
      source: document.source,
      content: document.content,
      summary: sentenceSummary(document.content) || document.excerpt,
      topics,
      entities,
      relationships: [],
      metadata: {
        sourceType: document.sourceType,
        canonicalSource: document.canonicalSource,
        relativeOutputPath: document.relativeOutputPath,
        contentType: document.contentType,
        statusCode: document.statusCode,
        wordCount: document.wordCount,
        language: document.language,
        author: document.author,
        publishedAt: document.publishedAt,
        lastModified: document.lastModified,
        generatedAt
      }
    } satisfies KnowledgeNode;
  });

  const sourceMap = new Map<string, KnowledgeNode>();
  for (const node of baseNodes) {
    sourceMap.set(node.metadata.canonicalSource, node);
    if (node.url) {
      sourceMap.set(normalizeUrl(node.url), node);
    }
  }

  return baseNodes.map((node, index) => ({
    ...node,
    relationships: buildRelationships(documents[index]!, sourceMap)
  }));
}

export function buildKnowledgeGraph(
  sourceType: SourceType,
  sourceRoot: string,
  nodes: KnowledgeNode[]
): KnowledgeGraph {
  const topicSet = new Set<string>();
  const entitySet = new Set<string>();
  let relationshipCount = 0;

  for (const node of nodes) {
    for (const topic of node.topics) {
      topicSet.add(topic);
    }

    for (const entity of node.entities) {
      entitySet.add(`${entity.type}:${entity.name}`);
    }

    relationshipCount += node.relationships.length;
  }

  return {
    '@context': ['https://schema.org', 'https://llmld.org/'],
    tool: {
      name: 'brain-drain',
      brand: 'Capxel',
      website: 'https://capxel.com',
      version: packageVersion()
    },
    generatedAt: new Date().toISOString(),
    sourceType,
    sourceRoot,
    stats: {
      documentCount: nodes.length,
      relationshipCount,
      topicCount: topicSet.size,
      entityCount: entitySet.size
    },
    nodes
  };
}
