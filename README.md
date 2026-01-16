# PatentHub

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

PatentHub is a self-hosted platform designed for deep analysis of patents and scientific documents. Built for homelab enthusiasts and researchers, it combines global search capabilities with local RAG (Retrieval-Augmented Generation) and AI-powered insights to help you navigate technical innovation.

## Features

- **Global Search**: Seamlessly query USPTO, Google Patents, arXiv, and PubMed via SearXNG integration.
- **Local RAG System**: Index your PDFs locally using vector embeddings (Transformers.js) to chat with your documents.
- **AI-Powered Insights**: Generate technical summaries and comprehensive reports using LLMs via OpenRouter.
- **Smart PDF Management**: Automatic downloads, OCR support (Tesseract.js), and a built-in document viewer.
- **Privacy First**: Fully self-hosted with local SQLite storage.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Backend**: [Hono](https://hono.dev/)
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite (via `bun:sqlite`)
- **Embeddings**: Local `Xenova/all-MiniLM-L6-v2`
- **LLM Provider**: OpenRouter API

## Getting Started

### Prerequisites

- Docker and Docker Compose
- An API Key for an LLM provider (e.g., [OpenRouter](https://openrouter.ai/) or any OpenAI-compatible endpoint like LiteLLM, vLLM, Ollama)
- A [SearXNG](https://github.com/searxng/searxng) instance (self-hosted or find a public one at [searx.space](https://searx.space/))

### Quick Start with Docker

1. Clone the repository.
2. Copy `env.example` to `.env` and fill in your `AI_API_KEY` (or `OPENROUTER_API_KEY`).
3. (Optional) If using a provider other than OpenRouter, set `AI_BASE_URL` in the `.env` file.
4. Spin up the containers:
   ```bash
   docker-compose up -d
   ```
4. Access the UI at `http://localhost:3124`.

### Local Development (No Docker)

1. Install dependencies:
   ```bash
   cd app && bun install
   ```
2. Start the development server (runs both backend and frontend):
   ```bash
   bun run dev
   ```

## Project Structure

- `/app/backend`: Hono API, AI services, scraping logic, and DB management.
- `/app/frontend`: React Single Page Application.
- `/data`: Persistent storage for the SQLite database and downloaded PDFs.
