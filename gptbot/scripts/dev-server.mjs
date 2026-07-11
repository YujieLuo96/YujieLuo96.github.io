import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/worker.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const portArg = process.argv.find((value) => /^--port=\d+$/.test(value));
const port = Number(portArg?.split('=')[1] || 8767);
const origin = `http://127.0.0.1:${port}`;
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml']
]);

async function readRequestBody(request, maxBytes = 16 * 1024) {
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > maxBytes) throw new Error('Request body too large');
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function handleApi(nodeRequest, nodeResponse) {
  const body = ['GET', 'HEAD'].includes(nodeRequest.method) ? undefined : await readRequestBody(nodeRequest);
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value != null) headers.set(key, value);
  }
  if (!headers.has('Origin')) headers.set('Origin', origin);
  const request = new Request(new URL(nodeRequest.url, origin), { method: nodeRequest.method, headers, body });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGINS: origin,
    MOCK_MODE: 'true',
    ALLOW_NO_ORIGIN: 'true'
  });
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

async function handleStatic(nodeRequest, nodeResponse) {
  const url = new URL(nodeRequest.url, origin);
  if (url.pathname === '/gptbot/config.js') {
    nodeResponse.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    nodeResponse.end("globalThis.GPTBOT_ENDPOINT = '/api/chat';\n");
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const candidate = resolve(repoRoot, `.${pathname}`);
  const relativePrefix = `${repoRoot}${sep}`.toLowerCase();
  if (candidate.toLowerCase() !== repoRoot.toLowerCase() && !candidate.toLowerCase().startsWith(relativePrefix)) {
    nodeResponse.writeHead(403).end('Forbidden');
    return;
  }
  let file = candidate;
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = resolve(file, 'index.html');
    const resolved = await realpath(file);
    if (!resolved.toLowerCase().startsWith(relativePrefix)) throw new Error('Path escapes repository');
    const content = await readFile(resolved);
    nodeResponse.writeHead(200, {
      'Content-Type': mimeTypes.get(extname(resolved).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (nodeRequest.method === 'HEAD') nodeResponse.end();
    else nodeResponse.end(content);
  } catch {
    nodeResponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    nodeResponse.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  try {
    if (new URL(request.url, origin).pathname.startsWith('/api/') || new URL(request.url, origin).pathname === '/health') {
      await handleApi(request, response);
    } else {
      await handleStatic(request, response);
    }
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ask this site mock server: ${origin}`);
});
