# brain-drain

`brain-drain` is Capxel's open-source CLI for turning messy knowledge sources into structured, AI-readable output.

It crawls websites, ingests local docs, reads sitemaps, extracts the important content, and writes a clean knowledge graph that agents can actually use.

## What is this?

Most companies already have the knowledge AI systems need - it is just trapped inside websites, docs folders, internal exports, and long-form content built for humans instead of machines.

`brain-drain` converts those sources into:

- one structured node per page or document
- cleaned Markdown content
- topics and named entities
- relationship links between nodes
- a top-level `brain-drain.json` knowledge graph

This project is built to align with LLM-LD principles for machine-readable knowledge delivery. Learn more at https://llmld.org/.

## Why it exists

`brain-drain` pairs with Capxel's Agentic Search Optimization (ASO) service for full AI visibility deployment.

- Open source under MIT
- Zero-config first run for common use cases
- Useful by itself for audits and structured exports
- A practical preview of what richer LLM-LD deployment looks like

## Built by Capxel

Built by Capxel - https://capxel.com

Part of the ASO toolkit.

## Installation

### Run with `npx`

```bash
npx brain-drain crawl https://example.com --output ./output
```

### Install globally

```bash
npm install -g brain-drain
brain-drain --help
```

### Run from source

```bash
npm install
npx tsx src/index.ts --help
```

## Quick start

```bash
# Crawl a website
brain-drain crawl https://example.com --output ./output --depth 2

# Process a local docs directory
brain-drain local ./docs --output ./output --format both

# Read a sitemap and fetch listed pages
brain-drain sitemap https://example.com/sitemap.xml --output ./output
```

## CLI overview

### Crawl a website

```bash
brain-drain crawl https://example.com \
  --output ./output \
  --depth 2 \
  --max-pages 50 \
  --rate-limit 1000
```

### Process local docs

```bash
brain-drain local ./knowledge-base \
  --output ./output \
  --format both
```

### Read from a sitemap

```bash
brain-drain sitemap https://example.com/sitemap.xml \
  --output ./output \
  --max-pages 100
```

## Optional AI summaries

By default, `brain-drain` writes an extractive summary from the document itself.

To upgrade summaries with OpenAI, set `OPENAI_API_KEY` and pass `--summarize`:

```bash
export OPENAI_API_KEY="your-key"
brain-drain crawl https://example.com --output ./output --summarize
```

Optional model override:

```bash
brain-drain crawl https://example.com --output ./output --summarize --model gpt-4.1-mini
```

## Output formats

`brain-drain` always writes a graph index file:

```text
output/
├── brain-drain.json
├── json/
│   └── ...mirrored source structure...
└── markdown/
    └── ...mirrored source structure...
```

### `--format json`

- Writes per-document JSON nodes in `output/json/`
- Writes `output/brain-drain.json`

### `--format markdown`

- Writes per-document Markdown files in `output/markdown/`
- Still writes `output/brain-drain.json` so downstream tools always have a structured graph

### `--format both`

- Writes both JSON and Markdown nodes
- Writes `output/brain-drain.json`

## Node shape

Each page or document becomes a knowledge node like this:

```json
{
  "id": "0f7c80fef4ce",
  "title": "Example Domain",
  "url": "https://example.com",
  "content": "# Example Domain\n\nThis domain is for use in illustrative examples in documents.",
  "summary": "Example Domain explains the purpose of the site and points readers to more information.",
  "topics": ["example", "domain", "documents"],
  "entities": [
    { "name": "Example Domain", "type": "person" },
    { "name": "documents", "type": "topic" }
  ],
  "relationships": [],
  "metadata": {
    "sourceType": "crawl",
    "canonicalSource": "https://example.com/",
    "relativeOutputPath": "example-com/index",
    "contentType": "text/html; charset=UTF-8",
    "wordCount": 16,
    "language": "en",
    "author": null,
    "publishedAt": null,
    "lastModified": null,
    "generatedAt": "2026-03-16T00:00:00.000Z"
  }
}
```

## Features

- Website crawling with depth limits
- Sitemap parsing with nested sitemap support
- Local Markdown, HTML, and text ingestion
- Mozilla Readability-based content extraction
- Cheerio-based link discovery and cleanup
- Respect for `robots.txt`
- Default rate limiting of 1 request per second
- Graceful handling for timeouts, unsupported content types, and fetch failures
- Clean structured output ready for downstream AI pipelines

## Development

```bash
npm install
npm run check
npm run build
```

Run directly in development:

```bash
npx tsx src/index.ts crawl https://example.com --output ./test-output
```

## License

MIT
