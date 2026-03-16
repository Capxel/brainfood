import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { KnowledgeGraph, KnowledgeNode, OutputFormat, RunResult } from './types.js';
import { ensureDirectory } from './utils.js';

function nodeJsonPath(outputDir: string, relativePath: string): string {
  return path.join(outputDir, 'json', `${relativePath}.json`);
}

function nodeMarkdownPath(outputDir: string, relativePath: string): string {
  return path.join(outputDir, 'markdown', `${relativePath}.md`);
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

  return [
    markdownFrontMatter(node),
    '',
    `# ${node.title}`,
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
  }

  const graphPath = path.join(outputDir, 'brain-drain.json');
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

  return {
    outputDir,
    graphPath,
    nodeCount: graph.nodes.length
  };
}
