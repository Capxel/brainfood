import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

import type { ProgressUpdate, RawDocument } from './types.js';
import { localPathToRelativeOutputPath, safeIsoDate } from './utils.js';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.html', '.htm', '.txt', '.pdf', '.docx']);

async function extractPdfText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocxHtml(filePath: string): Promise<string> {
  const result = await mammoth.convertToHtml({ path: filePath });
  return result.value;
}

async function walkDirectory(currentDir: string, collected: string[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, collected);
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(extension)) {
      collected.push(fullPath);
    }
  }
}

export async function collectLocalDocuments(
  rootDir: string,
  onProgress?: (update: ProgressUpdate) => void
): Promise<RawDocument[]> {
  const absoluteRoot = path.resolve(rootDir);
  const filePaths: string[] = [];
  await walkDirectory(absoluteRoot, filePaths);

  const documents: RawDocument[] = [];

  for (const [index, filePath] of filePaths.entries()) {
    onProgress?.({
      stage: 'local',
      current: index + 1,
      queued: Math.max(0, filePaths.length - index - 1),
      saved: documents.length,
      message: `Reading ${filePath}`
    });

    const extension = path.extname(filePath).toLowerCase();
    const fileStats = await stat(filePath);
    const relativeOutputPath = localPathToRelativeOutputPath(absoluteRoot, filePath);
    const titleHint = path.basename(filePath, extension);

    if (extension === '.html' || extension === '.htm') {
      documents.push({
        sourceType: 'local',
        canonicalSource: filePath,
        sourcePath: filePath,
        relativeOutputPath,
        contentType: 'text/html',
        html: await readFile(filePath, 'utf8'),
        titleHint,
        discoveredLinks: [],
        lastModified: safeIsoDate(fileStats.mtime.toISOString())
      });
      continue;
    }

    if (extension === '.pdf') {
      documents.push({
        sourceType: 'local',
        canonicalSource: filePath,
        sourcePath: filePath,
        relativeOutputPath,
        contentType: 'application/pdf',
        text: await extractPdfText(filePath),
        titleHint,
        discoveredLinks: [],
        lastModified: safeIsoDate(fileStats.mtime.toISOString())
      });
      continue;
    }

    if (extension === '.docx') {
      documents.push({
        sourceType: 'local',
        canonicalSource: filePath,
        sourcePath: filePath,
        relativeOutputPath,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        html: await extractDocxHtml(filePath),
        titleHint,
        discoveredLinks: [],
        lastModified: safeIsoDate(fileStats.mtime.toISOString())
      });
      continue;
    }

    const contentType = extension === '.txt' ? 'text/plain' : 'text/markdown';
    documents.push({
      sourceType: 'local',
      canonicalSource: filePath,
      sourcePath: filePath,
      relativeOutputPath,
      contentType,
      text: await readFile(filePath, 'utf8'),
      titleHint,
      discoveredLinks: [],
      lastModified: safeIsoDate(fileStats.mtime.toISOString())
    });
  }

  return documents;
}
