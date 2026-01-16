# PatentHub Backend

Logic core of PatentHub, built with TypeScript and powered by [Bun](https://bun.sh/) and [Hono](https://hono.dev/).

## Services

- **Search Service**: Federated search across USPTO and SearXNG (Google Patents, arXiv, PubMed). Uses deterministic IDs (MD5) to prevent duplicates.
- **AI Service**: OpenRouter integration with automatic fallback between multiple LLM models.
- **Embedding Service**: Local vector generation using `Transformers.js` (`all-MiniLM-L6-v2` model).
- **PDF/Scraper Service**: PDF downloading, parsing, and dynamic HTML scraping.
- **Database**: SQLite with WAL mode enabled for optimal performance.

## Main Endpoints

- `GET /api/search?q=...`: Global search with integrated caching.
- `POST /api/patents/:id/explain`: Generate technical analysis of a document.
- `POST /api/patents/:id/chat`: RAG-based interaction using full text or abstract.
- `POST /api/patents/:id/process-pdf`: Download and index PDF for the RAG system.

## Development

To start only the backend:
```bash
bun run backend
```

The server will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|-----------|-------------|
| `AI_API_KEY` | API Key for LLM models (falls back to `OPENROUTER_API_KEY`). |
| `AI_BASE_URL` | Base URL for the AI API (default: OpenRouter). Supports any OpenAI-compatible endpoint. |
| `AI_MODELS` | Comma-separated list of models for fallback. |
| `SEARXNG_URL` | URL of your SearXNG instance. |
| `DATABASE_URL` | Path to the SQLite database file. |
