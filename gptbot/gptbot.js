const MODULE_URL = new URL(import.meta.url);
const STYLE_URL = new URL('./gptbot.css', MODULE_URL).href;

const DEFAULT_SUGGESTIONS = [
  'What are the research interests?',
  'Which publications are listed here?',
  'What projects can I explore on this site?'
];

const INTRO = 'Ask me about the biography, research, publications, teaching, talks, or projects documented on this homepage.';

function randomSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `anon-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') || Date.now()}`;
}

function appendInline(target, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) target.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    const element = document.createElement(token.startsWith('**') ? 'strong' : 'code');
    element.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
    target.append(element);
    cursor = match.index + token.length;
  }
  if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)));
}

function renderSafeMarkdown(container, value) {
  container.replaceChildren();
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  let list = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      list = null;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (!list) {
        list = document.createElement('ul');
        container.append(list);
      }
      const item = document.createElement('li');
      appendInline(item, bullet[1]);
      list.append(item);
      continue;
    }

    list = null;
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const element = document.createElement(heading ? 'h4' : 'p');
    appendInline(element, heading ? heading[1] : line.trim());
    container.append(element);
  }
}

function safeSourceHref(source) {
  const explicit = typeof source?.href === 'string' ? source.href.trim() : '';
  const path = typeof source?.path === 'string' ? source.path.trim().replace(/\\/g, '/') : '';
  const anchor = typeof source?.anchor === 'string' ? source.anchor.trim() : '';
  const candidate = explicit || (path ? `${path}${anchor ? `#${encodeURIComponent(anchor)}` : ''}` : '');
  if (!candidate || candidate.startsWith('//')) return '';
  try {
    const url = new URL(candidate, document.baseURI);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

class AskThisSite extends HTMLElement {
  static get observedAttributes() { return ['endpoint']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this._busy = false;
    this._session = randomSessionId();
    this._abortController = null;
    this._lastFocused = null;
    this._render();
  }

  connectedCallback() {
    this._bind();
    if (!this._introduced) {
      this._introduced = true;
      this._addMessage('assistant', INTRO);
    }
  }

  disconnectedCallback() {
    this._abortController?.abort();
    document.body.classList.remove('gptbot-is-open');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'endpoint' && oldValue !== newValue) this._updateConnectionLabel();
  }

  get endpoint() {
    return (this.getAttribute('endpoint') || globalThis.GPTBOT_ENDPOINT || '').trim();
  }

  set endpoint(value) {
    if (value) this.setAttribute('endpoint', value);
    else this.removeAttribute('endpoint');
  }

  get openState() { return this._open; }

  open() {
    if (this._open) return;
    this._lastFocused = document.activeElement;
    this._open = true;
    this.setAttribute('open', '');
    document.body.classList.add('gptbot-is-open');
    this._els.panel.setAttribute('aria-hidden', 'false');
    this._els.launcher.setAttribute('aria-expanded', 'true');
    this.dispatchEvent(new CustomEvent('gptbot:state', {
      bubbles: true,
      composed: true,
      detail: { open: true }
    }));
    requestAnimationFrame(() => this._els.input.focus({ preventScroll: true }));
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.removeAttribute('open');
    document.body.classList.remove('gptbot-is-open');
    this._els.panel.setAttribute('aria-hidden', 'true');
    this._els.launcher.setAttribute('aria-expanded', 'false');
    this.dispatchEvent(new CustomEvent('gptbot:state', {
      bubbles: true,
      composed: true,
      detail: { open: false }
    }));
    const focusTarget = this._lastFocused?.isConnected ? this._lastFocused : this._els.launcher;
    focusTarget?.focus?.({ preventScroll: true });
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  _render() {
    const suggestions = DEFAULT_SUGGESTIONS.map((question) => (
      `<button class="suggestion" type="button" data-question="${question.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${question}</button>`
    )).join('');

    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="${STYLE_URL}">
      <button class="launcher" type="button" aria-label="Open Ask this site" aria-haspopup="dialog" aria-expanded="false">
        <span class="launcher-orbit" aria-hidden="true"><span>✦</span></span>
        <span class="launcher-label">Ask this site</span>
      </button>
      <section class="panel" role="dialog" aria-modal="true" aria-labelledby="gptbot-title" aria-describedby="gptbot-subtitle" aria-hidden="true">
        <header class="header">
          <div class="identity" aria-hidden="true"><span>✦</span></div>
          <div class="heading">
            <h2 id="gptbot-title">Ask this site</h2>
            <p id="gptbot-subtitle">Answers grounded in this homepage</p>
          </div>
          <button class="close" type="button" aria-label="Close Ask this site">×</button>
        </header>
        <div class="scope" role="status">
          <span class="scope-dot"></span>
          <span class="scope-text">Repository-only knowledge</span>
        </div>
        <div class="messages" role="log" aria-live="polite" aria-relevant="additions text" tabindex="0"></div>
        <div class="suggestions" aria-label="Suggested questions">${suggestions}</div>
        <form class="composer">
          <label class="sr-only" for="gptbot-question">Ask a question about this homepage</label>
          <textarea id="gptbot-question" rows="1" maxlength="1200" placeholder="Ask about this homepage…" autocomplete="off"></textarea>
          <button class="send" type="submit" aria-label="Send question">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 19.2 21 12 3.4 4.8 3 10l12 2-12 2 .4 5.2Z"/></svg>
          </button>
        </form>
        <footer class="footer"><span>Answers cite the repository. No web search.</span></footer>
      </section>`;

    this._els = {
      launcher: this.shadowRoot.querySelector('.launcher'),
      panel: this.shadowRoot.querySelector('.panel'),
      close: this.shadowRoot.querySelector('.close'),
      messages: this.shadowRoot.querySelector('.messages'),
      suggestions: this.shadowRoot.querySelector('.suggestions'),
      form: this.shadowRoot.querySelector('.composer'),
      input: this.shadowRoot.querySelector('textarea'),
      send: this.shadowRoot.querySelector('.send'),
      scopeText: this.shadowRoot.querySelector('.scope-text'),
      scopeDot: this.shadowRoot.querySelector('.scope-dot')
    };
    this._updateConnectionLabel();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    this._els.launcher.addEventListener('click', () => this.toggle());
    this._els.close.addEventListener('click', () => this.close());
    this._els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this._submit(this._els.input.value);
    });
    this._els.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this._els.form.requestSubmit();
      }
    });
    this._els.input.addEventListener('input', () => this._resizeInput());
    this._els.suggestions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-question]');
      if (button) this._submit(button.dataset.question);
    });
    this.shadowRoot.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.close();
      } else if (event.key === 'Tab' && this._open) {
        this._trapFocus(event);
      }
    });
  }

  _trapFocus(event) {
    const focusable = Array.from(this._els.panel.querySelectorAll('button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((node) => {
        const style = getComputedStyle(node);
        return node.offsetParent !== null && style.visibility !== 'hidden' && style.display !== 'none';
      });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.shadowRoot.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  _resizeInput() {
    const input = this._els.input;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  _setBusy(value) {
    this._busy = value;
    this._els.input.disabled = value;
    this._els.send.disabled = value;
    this._els.send.classList.toggle('is-busy', value);
  }

  _updateConnectionLabel() {
    if (!this._els) return;
    const configured = Boolean(this.endpoint);
    this._els.scopeText.textContent = configured ? 'Repository-only knowledge' : 'Preview · backend not configured';
    this._els.scopeDot.classList.toggle('is-preview', !configured);
  }

  _addMessage(role, text, sources = []) {
    const row = document.createElement('article');
    row.className = `message ${role}`;
    row.dataset.role = role;
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = role === 'assistant' ? 'Site assistant' : 'You';
    const content = document.createElement('div');
    content.className = 'message-content';
    renderSafeMarkdown(content, text);
    row.append(label, content);
    if (sources.length) row.append(this._renderSources(sources));
    this._els.messages.append(row);
    this._els.messages.scrollTo({ top: this._els.messages.scrollHeight, behavior: this._reducedMotion() ? 'auto' : 'smooth' });
    return { row, content };
  }

  _renderSources(sources) {
    const details = document.createElement('details');
    details.className = 'sources';
    const summary = document.createElement('summary');
    summary.textContent = `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;
    const list = document.createElement('ul');
    for (const source of sources.slice(0, 6)) {
      const item = document.createElement('li');
      const label = [source.path, source.section || source.title].filter(Boolean).join(' · ') || 'Repository source';
      const href = safeSourceHref(source);
      if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        link.addEventListener('click', () => {
          if (matchMedia('(max-width: 900px)').matches) this.close();
        });
        item.append(link);
      } else {
        item.textContent = label;
      }
      list.append(item);
    }
    details.append(summary, list);
    return details;
  }

  async _submit(rawQuestion) {
    const question = String(rawQuestion || '').trim();
    if (!question || this._busy) return;
    this.open();
    this._els.input.value = '';
    this._resizeInput();
    this._els.suggestions.hidden = true;
    this._addMessage('user', question);

    if (!this.endpoint) {
      this._addMessage('assistant', 'The assistant interface is ready, but its secure backend endpoint has not been configured yet. Set the component’s `endpoint` attribute after deploying `gptbot/worker`.');
      return;
    }

    this._setBusy(true);
    const pending = this._addMessage('assistant', 'Searching this repository…');
    pending.row.classList.add('pending');
    this._abortController?.abort();
    this._abortController = new AbortController();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream, application/x-ndjson' },
        body: JSON.stringify({ question, session: this._session }),
        signal: this._abortController.signal,
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || errorBody.message || `Request failed (${response.status})`);
      }
      const result = await this._readResponse(response, pending.content);
      pending.row.classList.remove('pending');
      renderSafeMarkdown(pending.content, result.answer || 'No grounded answer was returned.');
      if (Array.isArray(result.sources) && result.sources.length) pending.row.append(this._renderSources(result.sources));
    } catch (error) {
      pending.row.classList.remove('pending');
      const message = error?.name === 'AbortError' ? 'The request was cancelled.' : `I could not reach the repository assistant. ${error?.message || 'Please try again.'}`;
      renderSafeMarkdown(pending.content, message);
    } finally {
      this._setBusy(false);
      this._els.input.focus({ preventScroll: true });
    }
  }

  async _readResponse(response, target) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) return response.json();

    const reader = response.body?.getReader();
    if (!reader) return { answer: await response.text(), sources: [] };
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let sources = [];
    let frame = null;
    const paint = () => {
      frame = null;
      renderSafeMarkdown(target, answer || 'Searching this repository…');
      this._els.messages.scrollTop = this._els.messages.scrollHeight;
    };
    const consume = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('event:') || trimmed === 'data: [DONE]') return;
      const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      try {
        const event = JSON.parse(payload);
        if (typeof event.delta === 'string') answer += event.delta;
        else if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') answer += event.delta;
        else if (typeof event.answer === 'string') answer = event.answer;
        if (Array.isArray(event.sources)) sources = event.sources;
        if (!frame) frame = requestAnimationFrame(paint);
      } catch {
        answer += payload;
        if (!frame) frame = requestAnimationFrame(paint);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(consume);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (frame) cancelAnimationFrame(frame);
    return { answer, sources };
  }

  _reducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

if (!customElements.get('ask-this-site')) customElements.define('ask-this-site', AskThisSite);

export { AskThisSite };
