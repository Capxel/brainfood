# brain-drain — Build Spec

A CLI tool that crawls any knowledge source (website, folder, docs) and exports clean, structured, AI-readable output following LLM-LD principles.

## Core Features

1. **CLI interface:** `brain-drain <source> [options]`
   - `<source>`: URL, local directory path, or sitemap URL
   - `--output <dir>`: output directory (default: `./brain-drain-output/`)
   - `--format <json|markdown|jsonld>`: output format (default: `json`)
   - `--depth <n>`: crawl depth for URLs (default: 2)
   - `--include <pattern>`: file/URL patterns to include
   - `--exclude <pattern>`: file/URL patterns to exclude
   - `--max-pages <n>`: max pages to crawl (default: 100)

2. **Input sources:**
   - Local directory (recursively processes .md, .txt, .html, .pdf files)
   - Website URL (crawls up to --depth levels)
   - Sitemap URL (processes all pages in sitemap)

3. **Output structure:**
   - `index.json`: manifest of all extracted entities
   - `knowledge/`: one file per page/document
   - `entities.json`: structured entity map (people, products, services, topics)
   - `llm-ld.json`: LLM-LD formatted output (ai-readable standard)
   - `summary.md`: human-readable summary of what was extracted

4. **Each knowledge file contains:**
   ```json
   {
     "id": "unique-slug",
     "title": "Page Title",
     "url": "source URL or file path",
     "type": "article|product|service|person|faq|contact",
     "content": "clean text content",
     "summary": "1-2 sentence AI-generated summary",
     "keywords": ["array", "of", "keywords"],
     "entities": { "people": [], "products": [], "locations": [] },
     "relationships": [],
     "lastModified": "ISO date",
     "source": "website|local|sitemap"
   }
   ```

5. **LLM-LD output** (`llm-ld.json`):
   Follows the LLM-LD open standard. Makes the knowledge base readable by AI agents as a structured context block.

## Tech Stack
- Node.js CLI (no framework needed)
- `commander` for CLI argument parsing
- `cheerio` for HTML parsing
- `marked` for markdown parsing
- `node-fetch` for URL crawling
- `pdf-parse` for PDF support (optional, graceful fallback)

## Package
- Package name: `brain-drain`
- Bin: `brain-drain`
- License: MIT
- Publish target: npm + GitHub (public, under Capxel org)

## Output Quality Rules
- Strip navigation, headers, footers, cookie notices
- Preserve headings structure (H1→H2→H3)
- Extract structured data (FAQ patterns, product specs, team bios)
- Deduplicate content across pages
- Never truncate — full content in every file

## Example Usage
```bash
# Crawl a website
brain-drain https://capxel.com --depth 2 --output ./capxel-knowledge

# Process a local docs folder
brain-drain ~/Documents/client-docs --format jsonld --output ./client-knowledge

# Process a sitemap
brain-drain https://example.com/sitemap.xml --output ./example-knowledge
```

## Files to Create
- `package.json`
- `README.md` (with usage, examples, LLM-LD badge)
- `bin/brain-drain.js` (CLI entry point)
- `src/crawler.js` (URL crawling logic)
- `src/parser.js` (HTML/MD/PDF parsing + cleaning)
- `src/extractor.js` (entity + structure extraction)
- `src/formatter.js` (output formatting — JSON, markdown, LLM-LD)
- `src/index.js` (main orchestration)
- `.gitignore`
- `LICENSE` (MIT)
