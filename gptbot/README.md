# Ask this site

`gptbot/` contains the repository-grounded assistant used by the homepage.

> Ask this site — Answers grounded in this homepage.

The module is split into three trust boundaries:

1. `gptbot.js` and `gptbot.css` provide the dependency-free browser UI.
2. `corpus.json` is a reproducible, allowlisted snapshot of tracked repository content.
3. `worker/` provides the server-side `/api/chat` endpoint and is the only component that can access the OpenAI API key.

The browser never sends a model name, prompt, source text, tool list, or API key. It sends only a visitor question and an anonymous session identifier. Retrieval and prompt construction happen in the Worker.

## Build the corpus

From the repository root:

```powershell
node gptbot/scripts/build-corpus.mjs
```

The builder reads only paths returned by `git ls-files` and then applies the explicit allowlist in `corpus.config.json`. It does not inspect Git history, ignored or untracked files, environment variables, external links, or the rest of the user filesystem.

Commit the regenerated `corpus.json` whenever an allowlisted homepage or documentation source changes.

## Configure the frontend

The homepage mounts the custom element and supplies the deployed Worker URL through its `endpoint` attribute. Until an endpoint is configured, the component remains usable as a visual preview but does not claim to generate an AI answer.

Never place `OPENAI_API_KEY` in this repository, an HTML attribute, browser storage, or a GitHub Pages build artifact.

## Deploy the Worker

See [`worker/README.md`](worker/README.md). The main deployment settings are:

- `OPENAI_API_KEY`: secret, required for live answers.
- `OPENAI_MODEL`: optional server-side override.
- `ALLOWED_ORIGINS`: comma-separated exact origins allowed to call the endpoint.

The requested default model is `gpt-5.3-mini`. At implementation time, that exact slug was not present in the public OpenAI model catalog, so the Worker keeps it as the requested default while allowing a server-side override without changing browser code.

## Grounding rules

- No web search, shell, browser, MCP, arbitrary URL fetch, or GitHub token is available to the model.
- A question with insufficient repository evidence is rejected before an OpenAI request is made.
- Sources returned to the UI are selected by the server from `corpus.json`; visitors cannot submit their own context.
- Responses use `store: false`.
- All rendered response text is treated as untrusted and is converted to safe DOM nodes; raw HTML is not rendered.

## Local verification

Run the dependency-free mock server from the repository root:

```powershell
node gptbot/scripts/dev-server.mjs
```

Then open `http://127.0.0.1:8767/`. The development server injects `/api/chat` as the frontend endpoint and runs the real Worker retrieval path with `MOCK_MODE=true`; it never calls OpenAI.

The UI can also be tested with any endpoint that implements:

```http
POST /api/chat
Content-Type: application/json

{"question":"What are the research interests?","session":"anonymous-id"}
```

JSON response:

```json
{
  "answer": "...",
  "sources": [{ "path": "index.html", "section": "research", "anchor": "research" }],
  "grounded": true,
  "model": "gpt-5.3-mini",
  "requestId": "..."
}
```
