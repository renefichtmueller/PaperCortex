# PaperCortex on UnRaid

Two ways to install:

## Option A: template repository (recommended)

1. UnRaid web UI → **Docker** tab → scroll down to **Template Repositories**.
2. Add: `https://github.com/renefichtmueller/PaperCortex`
3. **Add Container** → pick **PaperCortex** from the template dropdown.
4. Fill in:
   - **Paperless URL** and **Paperless API Token** (Paperless-ngx → profile
     menu → My Profile → API Auth Token),
   - **Ollama URL** (your Ollama instance),
   - **Allowed Hosts**: the hostname or IP you use to open the UnRaid web
     UI, e.g. `tower.local` or `192.168.x.x` — without it the page answers
     403 (that is the DNS-rebinding defense, not a bug),
   - optionally a **Web UI Access Code**.
5. Start the container and open `http://<unraid>:8140` — the **system
   check** tells you what, if anything, is still missing, including the
   exact `ollama pull` commands.

## Option B: plain docker-compose

Use the `docker-compose.yml` from the repository root and the variables
documented in `.env.example`; the image is
`ghcr.io/renefichtmueller/papercortex:latest` (amd64/arm64).

## First steps after install

1. **System check** tab: everything green?
2. **Build search index** (one click) so semantic search has data.
3. **DATEV settings** tab: consultant number, client number, chart of
   accounts — see [docs/datev.md](../datev.md) for the full guide.
