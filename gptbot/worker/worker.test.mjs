import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { DEFAULT_MODEL, retrieve } from './worker.js';

const origin = 'https://scheme96.github.io';
const env = { ALLOWED_ORIGINS: origin, MOCK_MODE: 'true' };

test('keeps the requested default model server-side', () => {
  assert.equal(DEFAULT_MODEL, 'gpt-5.3-mini');
});

test('retrieval finds homepage research evidence', () => {
  const matches = retrieve('What are the research interests?');
  assert.ok(matches.length > 0);
  assert.ok(matches.some((match) => match.section === 'research'));
});

test('retrieval expands a Chinese homepage question', () => {
  const matches = retrieve('他的研究方向是什么？');
  assert.ok(matches.some((match) => match.section === 'research'));
});

test('chat accepts only question and session and returns grounded sources', async () => {
  const request = new Request('https://worker.example/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': origin },
    body: JSON.stringify({ question: 'What are the research interests?', session: 'session-12345678' })
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.grounded, true);
  assert.equal(body.model, 'mock');
  assert.ok(body.sources.some((source) => source.section === 'research'));
});

test('chat rejects client-selected model fields', async () => {
  const request = new Request('https://worker.example/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': origin },
    body: JSON.stringify({ question: 'Research interests?', session: 'session-abcdefgh', model: 'attacker-model' })
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'unsupported_fields');
});

test('chat rejects unapproved origins', async () => {
  const request = new Request('https://worker.example/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://evil.example' },
    body: JSON.stringify({ question: 'Research interests?', session: 'session-abcdefgh' })
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 403);
});
