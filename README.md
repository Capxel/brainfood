# 🧠 brainfood

**Structured knowledge for hungry agents.**

Your AI agent is only as smart as what you feed it. Brainfood turns your messy knowledge — YouTube transcripts, PDFs, docs, notes, websites — into clean, structured data your agent actually understands.

---

## What does it do?

You have knowledge trapped in files your AI can't use. Brainfood fixes that.

| Source | What brainfood does |
|--------|-------------------|
| PDFs | Extracts text, structures it, outputs clean JSON/Markdown/Obsidian notes |
| Local docs (Markdown, HTML, text, DOCX) | Parses, organizes, builds a knowledge graph |
| Websites | Crawls pages, extracts content, maps structure |
| Sitemaps | Reads sitemap XML, fetches and processes all listed pages |

Every source becomes structured, linked, agent-ready output.

## Quick start

```bash
# Install
npm install -g brainfood

# Process local files (PDFs, docs, transcripts)
brainfood local ./my-knowledge --format both

# Crawl a website
brainfood crawl https://example.com --depth 2

# Generate Obsidian-ready notes
brainfood local ./research --format obsidian

# Read from a sitemap
brainfood sitemap https://example.com/sitemap.xml
```

Or run without installing:

```bash
npx brainfood local ./docs --format json
```

## Output formats

### `--format json`
Structured JSON nodes — perfect for AI agent ingestion, pipelines, and APIs.

### `--format markdown`
Clean Markdown files — readable by humans and machines.

### `--format obsidian`
Obsidian-ready Markdown with YAML frontmatter, tags, and `[[wiki-links]]` — drop directly into your vault.

### `--format both`
JSON + Markdown together.

Every format also writes a `brainfood.json` knowledge graph index.

## Obsidian integration

Brainfood speaks Obsidian natively:

```bash
brainfood local ./research-papers --format obsidian --output ~/Documents/Obsidian\ Vault/research/
```

Output includes:
- **YAML frontmatter** — title, date, source, tags, type
- **Wiki-links** — entity names automatically linked as `[[Entity Name]]`
- **Clean filenames** — slugified, no special characters
- **Tags** — extracted topics become Obsidian tags

Your vault becomes a living knowledge base — searchable, linked, and graph-ready.

## How it works

1. **Ingest** — point brainfood at files, a folder, a URL, or a sitemap
2. **Extract** — content is parsed, cleaned, and structured using Mozilla Readability + Cheerio
3. **Structure** — topics, entities, and relationships are identified and linked
4. **Output** — clean knowledge nodes in your chosen format

Each document becomes a knowledge node:

```json
{
  "id": "a1b2c3d4e5f6",
  "title": "Document Title",
  "content": "# Clean structured content...",
  "summary": "AI-generated or extractive summary",
  "topics": ["topic1", "topic2"],
  "entities": [
    { "name": "Key Concept", "type": "topic" }
  ],
  "relationships": [],
  "metadata": {
    "sourceType": "local",
    "wordCount": 1250,
    "generatedAt": "2026-03-17T00:00:00.000Z"
  }
}
```

## CLI reference

### `brainfood local <directory>`
Process local Markdown, HTML, text, PDF, or DOCX files.

### `brainfood crawl <url>`
Crawl a website with configurable depth and rate limiting.

### `brainfood sitemap <url>`
Parse a sitemap and fetch all listed pages.

### Common options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <dir>` | `./brainfood-output` | Output directory |
| `-f, --format <format>` | `json` | Output format: json, markdown, obsidian, or both |
| `--summarize` | off | Generate AI summaries (requires OPENAI_API_KEY) |
| `--model <model>` | `gpt-4.1-mini` | OpenAI model for summaries |
| `--depth <n>` | `2` | Max crawl depth (crawl mode) |
| `--max-pages <n>` | `50` | Max pages to process |
| `--concurrency <n>` | `3` | Concurrent requests (max 10) |
| `--rate-limit <ms>` | `1000` | Minimum ms between requests |
| `--exclude <patterns>` | — | Comma-separated URL patterns to skip |

## Using brainfood with OpenClaw

Already running an OpenClaw agent? Just tell it what to process:

> "Install brainfood and process my research folder into Obsidian notes"

Your agent will run:
```bash
npm install -g brainfood
brainfood local ./research --format obsidian --output ~/Documents/Obsidian\ Vault/research/
```

> "Crawl my company website and give me structured data"

```bash
brainfood crawl https://yoursite.com --depth 2 --format json
```

> "Convert these PDFs into something you can actually read"

```bash
brainfood local ./documents --format both
```

That's it. One install, one command, your agent gets structured knowledge it can actually use.

**Tip for non-technical users:** Copy any of the commands above and paste them to your OpenClaw agent in chat. It handles the rest.

## Use cases

**Feed your AI agent** — Convert your knowledge base into structured data any LLM agent can ingest.

**Build an Obsidian vault** — Turn PDFs, transcripts, and research into linked, searchable notes.

**Audit a website** — Extract and map all content from any site for analysis or migration.

**Power a knowledge pipeline** — Automate ingestion from docs folders, sitemaps, or web sources.

## Built by Capxel

[Capxel](https://capxel.com) builds AI-native intelligence infrastructure. Brainfood is open source under MIT.

## Contributing

PRs welcome. See [issues](https://github.com/Capxel/brainfood/issues) for open work.

## License

MIT
