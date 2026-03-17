#!/usr/bin/env node
import { Command } from 'commander';
import { crawlWebsite } from './crawl.js';
import { extractDocument } from './extract.js';
import { collectLocalDocuments } from './local.js';
import { writeOutputBundle } from './output.js';
import { crawlFromSitemap } from './sitemap.js';
import { buildKnowledgeGraph, buildKnowledgeNodes } from './structure.js';
import { generateSummary } from './summarize.js';
import { DEFAULT_USER_AGENT } from './utils.js';
function parsePositiveInteger(value, label) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive integer.`);
    }
    return parsed;
}
function parseConcurrency(value) {
    const parsed = parsePositiveInteger(value || '3', 'concurrency');
    if (parsed > 10) {
        throw new Error('concurrency must be 10 or less.');
    }
    return parsed;
}
function parseFormat(value) {
    if (value === 'json' || value === 'markdown' || value === 'both') {
        return value;
    }
    throw new Error(`Unsupported format: ${value}`);
}
function parseExcludePatterns(value) {
    return (value || '')
        .split(',')
        .map((pattern) => pattern.trim())
        .filter(Boolean);
}
function logProgress(update) {
    const counts = [
        typeof update.current === 'number' ? `current=${update.current}` : null,
        typeof update.queued === 'number' ? `queued=${update.queued}` : null,
        typeof update.saved === 'number' ? `saved=${update.saved}` : null,
        typeof update.active === 'number' ? `active=${update.active}` : null
    ]
        .filter(Boolean)
        .join(' ');
    console.error(`[${update.stage}] ${update.message}${counts ? ` (${counts})` : ''}`);
}
function createSharedOptions(commandOptions) {
    return {
        output: commandOptions.output || './brain-drain-output',
        format: parseFormat(commandOptions.format || 'json'),
        summarize: Boolean(commandOptions.summarize),
        openAiModel: commandOptions.model || 'gpt-4.1-mini',
        rateLimitMs: parsePositiveInteger(commandOptions.rateLimit || '1000', 'rate-limit'),
        timeoutMs: parsePositiveInteger(commandOptions.timeout || '15000', 'timeout'),
        userAgent: DEFAULT_USER_AGENT,
        excludePatterns: parseExcludePatterns(commandOptions.exclude),
        concurrency: parseConcurrency(commandOptions.concurrency)
    };
}
function boxLine(content, innerWidth) {
    return `│ ${content.padEnd(innerWidth)} │`;
}
function printCompletionSummary(sourceRoot, sourceType, outputDir, graph, startedAt) {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const lines = [
        'brain-drain — complete',
        `Source:        ${sourceRoot}`,
        `Mode:          ${sourceType}`,
        `Documents:     ${graph.stats.documentCount}`,
        `Topics:        ${graph.stats.topicCount}`,
        `Entities:      ${graph.stats.entityCount}`,
        `Relationships: ${graph.stats.relationshipCount}`,
        `Output:        ${outputDir}`,
        `Time:          ${elapsedSeconds}s`
    ];
    const innerWidth = Math.max(...lines.map((line) => line.length));
    console.log(`┌${'─'.repeat(innerWidth + 2)}┐`);
    console.log(boxLine(lines[0] || '', innerWidth));
    console.log(`├${'─'.repeat(innerWidth + 2)}┤`);
    for (const line of lines.slice(1)) {
        console.log(boxLine(line, innerWidth));
    }
    console.log(`└${'─'.repeat(innerWidth + 2)}┘`);
}
async function finalizeRun(sourceType, sourceRoot, shared, extractedDocuments, startedAt) {
    const nodes = buildKnowledgeNodes(extractedDocuments);
    const summarizedNodes = [];
    for (const node of nodes) {
        const summary = await generateSummary({
            title: node.title,
            content: node.content,
            fallback: node.summary
        }, shared.summarize, shared.openAiModel);
        summarizedNodes.push({
            ...node,
            summary
        });
    }
    const graph = buildKnowledgeGraph(sourceType, sourceRoot, summarizedNodes);
    await writeOutputBundle(graph, shared.output, shared.format);
    printCompletionSummary(sourceRoot, sourceType, shared.output, graph, startedAt);
}
const program = new Command();
program
    .name('brain-drain')
    .description('CLI for turning websites, sitemaps, and local docs into AI-readable knowledge bundles.')
    .version('1.0.0');
program
    .command('crawl')
    .argument('<url>', 'Website URL to crawl')
    .option('-o, --output <dir>', 'Output directory', './brain-drain-output')
    .option('-f, --format <format>', 'Output format: json, markdown, or both', 'json')
    .option('--depth <number>', 'Maximum crawl depth', '2')
    .option('--max-pages <number>', 'Maximum pages to crawl', '50')
    .option('--exclude <patterns>', 'Comma-separated path patterns to skip')
    .option('--concurrency <number>', 'Concurrent fetches (default: 3, max: 10)', '3')
    .option('--rate-limit <milliseconds>', 'Minimum time between requests in milliseconds', '1000')
    .option('--timeout <milliseconds>', 'HTTP timeout in milliseconds', '15000')
    .option('--summarize', 'Generate higher-quality summaries with OpenAI')
    .option('--model <model>', 'OpenAI model for summaries', 'gpt-4.1-mini')
    .action(async (url, options) => {
    const startedAt = Date.now();
    const shared = createSharedOptions(options);
    const crawlOptions = {
        ...shared,
        depth: parsePositiveInteger(options.depth, 'depth'),
        maxPages: parsePositiveInteger(options.maxPages, 'max-pages')
    };
    const result = await crawlWebsite(url, crawlOptions, logProgress);
    if (result.documents.length === 0) {
        throw new Error(result.errors[0] || 'No crawlable pages were found.');
    }
    const extracted = result.documents.map(extractDocument).filter((document) => document.content.trim().length > 0);
    await finalizeRun('crawl', url, shared, extracted, startedAt);
    if (result.errors.length > 0) {
        console.error(`Completed with ${result.errors.length} warning(s).`);
        for (const warning of result.errors.slice(0, 10)) {
            console.error(`- ${warning}`);
        }
    }
});
program
    .command('local')
    .argument('<directory>', 'Local directory of markdown, HTML, text, PDF, or DOCX files')
    .option('-o, --output <dir>', 'Output directory', './brain-drain-output')
    .option('-f, --format <format>', 'Output format: json, markdown, or both', 'json')
    .option('--rate-limit <milliseconds>', 'Unused for local mode; kept for interface consistency', '1000')
    .option('--timeout <milliseconds>', 'Unused for local mode; kept for interface consistency', '15000')
    .option('--summarize', 'Generate higher-quality summaries with OpenAI')
    .option('--model <model>', 'OpenAI model for summaries', 'gpt-4.1-mini')
    .action(async (directory, options) => {
    const startedAt = Date.now();
    const shared = createSharedOptions(options);
    const documents = await collectLocalDocuments(directory, logProgress);
    if (documents.length === 0) {
        throw new Error('No supported local documents were found.');
    }
    const extracted = documents.map(extractDocument).filter((document) => document.content.trim().length > 0);
    await finalizeRun('local', directory, shared, extracted, startedAt);
});
program
    .command('sitemap')
    .argument('<url>', 'Sitemap URL to read')
    .option('-o, --output <dir>', 'Output directory', './brain-drain-output')
    .option('-f, --format <format>', 'Output format: json, markdown, or both', 'json')
    .option('--max-pages <number>', 'Maximum pages to fetch from the sitemap', '100')
    .option('--exclude <patterns>', 'Comma-separated path patterns to skip')
    .option('--concurrency <number>', 'Concurrent fetches (default: 3, max: 10)', '3')
    .option('--rate-limit <milliseconds>', 'Minimum time between requests in milliseconds', '1000')
    .option('--timeout <milliseconds>', 'HTTP timeout in milliseconds', '15000')
    .option('--summarize', 'Generate higher-quality summaries with OpenAI')
    .option('--model <model>', 'OpenAI model for summaries', 'gpt-4.1-mini')
    .action(async (url, options) => {
    const startedAt = Date.now();
    const shared = createSharedOptions(options);
    const sitemapOptions = {
        ...shared,
        maxPages: parsePositiveInteger(options.maxPages, 'max-pages')
    };
    const result = await crawlFromSitemap(url, sitemapOptions, logProgress);
    if (result.documents.length === 0) {
        throw new Error(result.errors[0] || 'The sitemap did not yield any crawlable pages.');
    }
    const extracted = result.documents.map(extractDocument).filter((document) => document.content.trim().length > 0);
    await finalizeRun('sitemap', url, shared, extracted, startedAt);
    if (result.errors.length > 0) {
        console.error(`Completed with ${result.errors.length} warning(s).`);
        for (const warning of result.errors.slice(0, 10)) {
            console.error(`- ${warning}`);
        }
    }
});
program.parseAsync(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`brain-drain failed: ${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map