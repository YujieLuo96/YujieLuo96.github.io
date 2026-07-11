# Ask this site Worker

Cloudflare Worker backend for the repository-grounded homepage assistant.

## Security boundary

The public endpoint accepts only:

```json
{"question":"...","session":"anonymous-id"}
```

The model, instructions, retrieved context, tools, output limit, and OpenAI key are server-controlled. Web search and other tools are not enabled. The Worker sends `store: false` to the OpenAI Responses API.

## Local development

```powershell
cd gptbot/worker
npm install
Copy-Item .dev.vars.example .dev.vars
npm test
npm run dev
```

Set `MOCK_MODE=true` to test retrieval and the complete browser interface without making an OpenAI request.

## Secrets and variables

Configure the production key with Wrangler; never put it in a `vars` block:

```powershell
npx wrangler secret put OPENAI_API_KEY
```

Variables:

- `OPENAI_MODEL`: optional server-side model override.
- `ALLOWED_ORIGINS`: comma-separated exact browser origins.
- `MAX_OUTPUT_TOKENS`: clamped to 200–1200.
- `MOCK_MODE`: local/test only.
- `ALLOW_NO_ORIGIN`: local/test only; leave unset in production.

The requested default model is `gpt-5.3-mini`. The public OpenAI model catalog did not list that exact slug when this code was written. If the API returns `model_unavailable`, set `OPENAI_MODEL` to the model ID enabled for the OpenAI project; no frontend change is required.

## Deploy

Update `ALLOWED_ORIGINS` in `wrangler.jsonc`, then:

```powershell
npm run deploy
```

After deployment, place the resulting `https://...workers.dev/api/chat` URL in the homepage `<ask-this-site endpoint="...">` element.

For a public launch, enable Cloudflare's rate limiting binding and add Turnstile before relying on the service at scale. The in-memory limiter included here is only a best-effort fallback per Worker isolate.
