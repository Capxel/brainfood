# brain-drain — Knowledge Base → AI-Readable Structure

## What It Does
CLI tool that takes any knowledge source (website, docs folder, Notion export, PDF collection, wiki) and converts it into clean, structured, machine-readable files that AI agents can consume.

## Why It Matters
AI agents need structured data to make recommendations. Most companies have knowledge scattered across websites, PDFs, Google Docs, wikis. Humans navigate that fine — AI agents can't. brain-drain bridges the gap.

## Strategic Position
- **Open source** under Capxel GitHub (MIT license)
- **Gateway drug to full ASO** — companies use brain-drain to see what structured knowledge looks like, then hire Capxel for full LLM-LD deployment
- **First of 5 skills** in the 10-day release sprint

## Core Features

### Input Sources (Phase 1)
1. **URL crawl** — Point at a website, crawl all pages, extract content
2. **Local directory** — Point at a folder of markdown/HTML/text files
3. **Sitemap** — Parse sitemap.xml and crawl listed URLs

### Output Format
- **LLM-LD compatible JSON** — structured knowledge following LLM-LD principles
- Each page/document becomes a structured knowledge node with:
  - `title` — document title
  - `url` or `source` — origin
  - `content` — cleaned text (markdown)
  - `summary` — AI-generated summary (optional, requires API key)
  - `topics` — extracted topics/categories
  - `entities` — named entities (people, companies, products)
  - `relationships` — links to other nodes
  - `metadata` — date, author, word count, language
- Output directory structure mirrors source structure
- Index file (`brain-drain.json`) with full knowledge graph

### CLI Interface
```bash
# Crawl a website
brain-drain crawl https://example.com --output ./output --depth 2

# Process local docs
brain-drain local ./my-docs --output ./output

# From sitemap
brain-drain sitemap https://example.com/sitemap.xml --output ./output

# With AI summaries (requires OpenAI key)
brain-drain crawl https://example.com --output ./output --summarize

# Output formats
brain-drain crawl https://example.com --format json    # default
brain-drain crawl https://example.com --format markdown # human-readable
brain-drain crawl https://example.com --format both     # json + markdown
```

### Technical Stack
- **Language:** TypeScript (Node.js)
- **Package manager:** npm (widest compatibility for open source)
- **Web crawling:** cheerio + node-fetch (lightweight, no browser needed)
- **Content extraction:** mozilla/readability (same as Firefox Reader View)
- **CLI framework:** commander.js
- **Output:** JSON + optional Markdown
- **No external AI dependency required** — summaries are optional enhancement

### File Structure
```
brain-drain/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── crawl.ts          # Website crawler
│   ├── local.ts          # Local file processor
│   ├── sitemap.ts        # Sitemap parser
│   ├── extract.ts        # Content extraction (readability)
│   ├── structure.ts      # Knowledge structuring (topics, entities)
│   ├── summarize.ts      # Optional AI summary generation
│   ├── output.ts         # Output formatter (JSON/Markdown)
│   └── types.ts          # TypeScript types
├── package.json
├── tsconfig.json
├── README.md             # Comprehensive docs with examples
├── LICENSE               # MIT
└── .github/
    └── workflows/
        └── ci.yml        # GitHub Actions CI
```

### README Requirements
- Clear "What is this?" section
- Installation: `npm install -g brain-drain` or `npx brain-drain`
- Quick start with 3 example commands
- Output format documentation
- Link to LLM-LD standard
- "Built by Capxel" with link to capxel.com
- "Part of the ASO toolkit" positioning

## Quality Bar
- Must work on first `npx brain-drain crawl <url>` with zero config
- Clean TypeScript, no `any` types
- Handles errors gracefully (404s, timeouts, malformed HTML)
- Progress indicator for crawls
- Respects robots.txt
- Rate limiting (1 req/sec default, configurable)
- Tested on at least 3 real websites before release
