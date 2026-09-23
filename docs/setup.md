# Setup Guide

## Prerequisites

- **Node.js** 20+ (or Docker)
- **Paperless-ngx** instance with API access
- **Ollama** with required models

## Step 1: Install Ollama Models

```bash
# Required: LLM for classification and extraction
ollama pull qwen2.5:14b

# Required: Embedding model for semantic search
ollama pull nomic-embed-text
```

Verify Ollama is running:
```bash
curl http://localhost:11434/api/tags
```

## Step 2: Get Paperless-ngx API Token

1. Open your Paperless-ngx web UI
2. Go to Settings > API
3. Generate a new API token
4. Copy the token for the next step

## Step 3: Configure PaperCortex

```bash
git clone https://github.com/YOUR_USERNAME/PaperCortex.git
cd PaperCortex
cp .env.example .env
```

Edit `.env` with your values:
```env
PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=<your-api-token>
OLLAMA_URL=http://localhost:11434
```

## Step 4: Run

### Option A: Docker (Recommended)

```bash
docker compose up -d
```

### Option B: Manual

```bash
npm install
npm run build
npm start
```

### Option C: Development

```bash
npm install
npm run dev
```

## Step 5: Register MCP Server

Add to your Claude Code configuration (`~/.claude.json`):

```json
{
  "mcpServers": {
    "papercortex": {
      "command": "node",
      "args": ["/absolute/path/to/PaperCortex/dist/mcp-server/index.js"],
      "env": {
        "PAPERLESS_URL": "http://localhost:8000",
        "PAPERLESS_TOKEN": "your-token",
        "OLLAMA_URL": "http://localhost:11434"
      }
    }
  }
}
```

## Step 6: Populate Vector Store

On first run, you need to embed your existing documents. This will be automated in a future release. For now, the vector store is populated as documents are queried or classified.

## Troubleshooting

### "Connection refused" to Paperless-ngx
- Verify the URL in `.env` is reachable
- Check that the API token is valid
- Ensure Paperless-ngx is running

### "Connection refused" to Ollama
- Run `ollama serve` if not already running
- Check the port (default: 11434)
- Verify models are pulled: `ollama list`

### Slow first query
- The first embedding generation may take longer as Ollama loads the model into memory
- Subsequent queries will be faster once the model is loaded

## DATEV (German accounting)

Run the wizard once, then preview and export — see [datev.md](datev.md):

```bash
npm run datev:init
```
