import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { KnowledgeGraph, KnowledgeNode, OutputFormat, RunResult } from './types.js';
import { ensureDirectory, slugify } from './utils.js';

function nodeJsonPath(outputDir: string, relativePath: string): string {
  return path.join(outputDir, 'json', `${relativePath}.json`);
}

function nodeMarkdownPath(outputDir: string, relativePath: string): string {
  return path.join(outputDir, 'markdown', `${relativePath}.md`);
}

function cleanNodeTitle(title: string): string {
  return title.replace(/^#+\s*/, '').trim() || 'Untitled';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Common English words that should never become wiki-links. */
const WIKI_LINK_STOP_WORDS = new Set([
  // Articles & determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  // Pronouns
  'i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'who', 'what', 'which', 'whom',
  // Prepositions & conjunctions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'and', 'but', 'or', 'nor',
  'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very',
  // Common verbs & auxiliaries
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  'get', 'got', 'make', 'made', 'go', 'went', 'come', 'came', 'take', 'took', 'give', 'gave',
  'say', 'said', 'tell', 'told', 'know', 'knew', 'think', 'see', 'saw', 'want', 'use', 'used',
  'find', 'found', 'put', 'run', 'set', 'try', 'ask', 'need', 'let', 'keep', 'start', 'show',
  'hear', 'play', 'move', 'live', 'work', 'read', 'grow', 'open', 'walk', 'turn', 'call',
  // Common adverbs & adjectives
  'like', 'just', 'also', 'now', 'new', 'well', 'way', 'even', 'then', 'here', 'there', 'when',
  'how', 'all', 'each', 'every', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'over', 'still', 'back', 'first', 'last', 'long', 'great', 'little', 'right', 'old', 'big',
  'high', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'public', 'bad',
  'good', 'best', 'sure', 'free', 'real', 'much', 'many',
  // Common nouns too generic to be meaningful links
  'part', 'time', 'year', 'people', 'day', 'thing', 'man', 'world', 'life', 'hand', 'place',
  'case', 'week', 'company', 'system', 'program', 'question', 'number', 'point', 'government',
  'home', 'water', 'room', 'mother', 'area', 'money', 'story', 'fact', 'month', 'lot', 'study',
  'book', 'eye', 'job', 'word', 'business', 'issue', 'side', 'kind', 'head', 'house', 'service',
  'end', 'name', 'city', 'add', 'based', 'using', 'including', 'check', 'support',
  // Tech-generic terms too common to link
  'data', 'file', 'files', 'code', 'app', 'web', 'page', 'user', 'users', 'type', 'form',
  'text', 'line', 'list', 'key', 'value', 'view', 'link', 'image', 'note', 'notes',
  'server', 'client', 'build', 'test', 'run', 'install', 'update', 'version',
  // Structural/formatting words from documents
  'based', 'built', 'unknown', 'untitled', 'section', 'overview', 'summary', 'description',
  'title', 'content', 'source', 'output', 'input', 'example', 'default', 'custom', 'local',
  // Abstract nouns/adjectives that are never proper nouns
  'increased', 'decreased', 'improved', 'reduced', 'partnership', 'systems', 'strategy',
  'approach', 'method', 'process', 'results', 'analysis', 'performance', 'management',
  'development', 'production', 'operations', 'planning', 'design', 'implementation',
  'integration', 'optimization', 'automation', 'infrastructure', 'architecture', 'framework',
  'platform', 'solution', 'product', 'feature', 'module', 'component', 'interface',
  'configuration', 'deployment', 'environment', 'documentation', 'specification',
  'requirements', 'guidelines', 'standards', 'practices', 'principles', 'concepts',
  'challenge', 'opportunity', 'advantage', 'benefit', 'impact', 'growth', 'success',
  'mission', 'vision', 'goal', 'objective', 'target', 'metrics', 'measurement',
  'discipline', 'expansion', 'leverage', 'sovereignty', 'velocity', 'clarity',
]);

function normalizeEntityName(value: string): string | null {
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();

  if (!normalized || normalized.length < 2) {
    return null;
  }

  // Filter out common/stop words (case-insensitive, single-word only)
  if (!normalized.includes(' ') && WIKI_LINK_STOP_WORDS.has(normalized.toLowerCase())) {
    return null;
  }

  // Single words under 4 chars are almost never meaningful wiki-links
  if (!normalized.includes(' ') && normalized.length < 4) {
    return null;
  }

  // Lowercase single words are never proper nouns worth linking
  if (!normalized.includes(' ') && /^[a-z]/.test(normalized)) {
    return null;
  }

  // Single capitalized words: check against stop list case-insensitively
  // (catches "Increased", "Systems", "Partnership" etc. that aren't real proper nouns)
  if (!normalized.includes(' ') && WIKI_LINK_STOP_WORDS.has(normalized.toLowerCase())) {
    return null;
  }

  // Filter out entities that are just type prefixes from extraction (e.g. "person:Something")
  if (/^(person|company|unknown|topic):/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeObsidianTag(topic: string): string | null {
  const normalized = slugify(topic);
  return normalized === 'untitled' ? null : normalized;
}

function wrapEntityWikiLinks(content: string, node: KnowledgeNode): string {
  const entityNames = Array.from(
    new Set(
      node.entities
        .map((entity) => normalizeEntityName(entity.name))
        .filter((entityName): entityName is string => Boolean(entityName))
    )
  ).sort((left, right) => right.length - left.length);

  return entityNames.reduce((currentContent, entityName) => {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\]])(${escapeRegex(entityName)})(?=$|[^\\p{L}\\p{N}\\[])`, 'gu');
    return currentContent.replace(pattern, (match, prefix, matchedEntity, offset, source) => {
      const entityStart = offset + prefix.length;
      const before = source.slice(Math.max(0, entityStart - 2), entityStart);
      const after = source.slice(entityStart + matchedEntity.length, entityStart + matchedEntity.length + 2);

      // Skip if already inside wiki-links
      if (before === '[[' && after === ']]') {
        return match;
      }

      // Skip if adjacent to brackets (inside markdown links like [text](url))
      const charBefore = entityStart > 0 ? source[entityStart - 1] : '';
      const charAfter = source[entityStart + matchedEntity.length] || '';
      if (charBefore === '[' || charAfter === ']' || charBefore === '(' || charAfter === ')') {
        return match;
      }

      // Skip if inside a URL (look for http/https before, or .com/.org/etc after)
      const nearby = source.slice(Math.max(0, entityStart - 30), entityStart + matchedEntity.length + 10);
      if (/https?:\/\//.test(nearby) && /\.\w{2,}/.test(nearby)) {
        return match;
      }

      return `${prefix}[[${entityName}]]`;
    });
  }, content);
}

function obsidianFrontMatter(node: KnowledgeNode): string {
  const title = cleanNodeTitle(node.title);
  const source = node.url || node.source || node.metadata.canonicalSource;
  const date = node.metadata.publishedAt || node.metadata.lastModified || node.metadata.generatedAt;
  const tags = Array.from(new Set(node.topics.map(normalizeObsidianTag).filter((tag): tag is string => Boolean(tag))));

  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    `source: ${JSON.stringify(source)}`,
    `tags: [${tags.map((tag) => JSON.stringify(tag)).join(', ')}]`,
    `type: ${JSON.stringify(node.metadata.sourceType)}`,
    '---'
  ].join('\n');
}

function renderObsidianNode(node: KnowledgeNode): string {
  const parts = [obsidianFrontMatter(node), ''];

  if (node.summary) {
    parts.push('## Summary', '', node.summary, '');
  }

  parts.push(wrapEntityWikiLinks(node.content, node), '');

  return parts.join('\n');
}

function nodeObsidianPath(outputDir: string, node: KnowledgeNode, usedSlugs: Set<string>): string {
  const candidates = [
    slugify(cleanNodeTitle(node.title)),
    slugify(node.metadata.relativeOutputPath.replace(/[\/]+/g, '-')),
    node.id.toLowerCase()
  ];

  for (const candidate of candidates) {
    if (!usedSlugs.has(candidate)) {
      usedSlugs.add(candidate);
      return path.join(outputDir, 'obsidian', `${candidate}.md`);
    }
  }

  const fallback = `${candidates[0]}-${node.id.toLowerCase()}`;
  usedSlugs.add(fallback);
  return path.join(outputDir, 'obsidian', `${fallback}.md`);
}

function markdownFrontMatter(node: KnowledgeNode): string {
  const entities = node.entities.map((entity) => `${entity.type}:${entity.name}`);
  const relationships = node.relationships.map((relationship) => relationship.target);

  return [
    '---',
    `id: ${node.id}`,
    `title: ${JSON.stringify(node.title)}`,
    `url: ${JSON.stringify(node.url || '')}`,
    `source: ${JSON.stringify(node.source || '')}`,
    `topics: [${node.topics.map((topic) => JSON.stringify(topic)).join(', ')}]`,
    `entities: [${entities.map((entry) => JSON.stringify(entry)).join(', ')}]`,
    `relationships: [${relationships.map((entry) => JSON.stringify(entry)).join(', ')}]`,
    `wordCount: ${node.metadata.wordCount}`,
    `language: ${JSON.stringify(node.metadata.language || '')}`,
    '---'
  ].join('\n');
}

function renderMarkdownNode(node: KnowledgeNode): string {
  const origin = node.url || node.source || node.metadata.canonicalSource;
  const title = cleanNodeTitle(node.title);

  return [
    markdownFrontMatter(node),
    '',
    `# ${title}`,
    '',
    `- Origin: ${origin}`,
    `- Source type: ${node.metadata.sourceType}`,
    `- Last modified: ${node.metadata.lastModified || 'unknown'}`,
    `- Author: ${node.metadata.author || 'unknown'}`,
    `- Topics: ${node.topics.join(', ') || 'none'}`,
    '',
    node.summary ? `## Summary\n\n${node.summary}\n` : '',
    '## Content',
    '',
    node.content,
    ''
  ]
    .filter(Boolean)
    .join('\n');
}

export async function writeOutputBundle(
  graph: KnowledgeGraph,
  outputDir: string,
  format: OutputFormat
): Promise<RunResult> {
  await ensureDirectory(outputDir);
  const usedObsidianSlugs = new Set<string>();

  for (const node of graph.nodes) {
    if (format === 'json' || format === 'both') {
      const jsonPath = nodeJsonPath(outputDir, node.metadata.relativeOutputPath);
      await ensureDirectory(path.dirname(jsonPath));
      await writeFile(jsonPath, `${JSON.stringify(node, null, 2)}\n`, 'utf8');
    }

    if (format === 'markdown' || format === 'both') {
      const markdownPath = nodeMarkdownPath(outputDir, node.metadata.relativeOutputPath);
      await ensureDirectory(path.dirname(markdownPath));
      await writeFile(markdownPath, `${renderMarkdownNode(node)}\n`, 'utf8');
    }

    if (format === 'obsidian') {
      const obsidianPath = nodeObsidianPath(outputDir, node, usedObsidianSlugs);
      await ensureDirectory(path.dirname(obsidianPath));
      await writeFile(obsidianPath, `${renderObsidianNode(node)}\n`, 'utf8');
    }
  }

  const graphPath = path.join(outputDir, 'brainfood.json');
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

  return {
    outputDir,
    graphPath,
    nodeCount: graph.nodes.length
  };
}
