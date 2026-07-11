import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const debugPort = Number(process.argv.find((arg) => arg.startsWith('--debug-port='))?.split('=')[1] || 9226);
const sitePort = Number(process.argv.find((arg) => arg.startsWith('--site-port='))?.split('=')[1] || 8768);
const siteUrl = `http://127.0.0.1:${sitePort}/index.html`;
const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page target was found.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const listeners = new Map();
const exceptions = [];
socket.addEventListener('message', (message) => {
  const payload = JSON.parse(message.data);
  if (payload.id) {
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(`${waiter.method}: ${payload.error.message}`));
    else waiter.resolve(payload.result);
    return;
  }
  if (payload.method === 'Runtime.exceptionThrown') exceptions.push(payload.params.exceptionDetails?.text || 'Runtime exception');
  const queue = listeners.get(payload.method);
  if (queue?.length) queue.shift()(payload.params);
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolveSend, reject) => {
    pending.set(id, { resolve: resolveSend, reject, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitFor(method, timeout = 10_000) {
  return new Promise((resolveEvent, reject) => {
    const queue = listeners.get(method) || [];
    queue.push(resolveEvent);
    listeners.set(method, queue);
    setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout).unref();
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result?.value;
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function navigate(url) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await sleep(700);
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const path = resolve(tmpdir(), name);
  await writeFile(path, Buffer.from(result.data, 'base64'));
  return path;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await navigate(siteUrl);

const registered = await evaluate(`(() => {
  const bot = document.querySelector('ask-this-site');
  return {
    defined: Boolean(customElements.get('ask-this-site')),
    hasShadow: Boolean(bot && bot.shadowRoot),
    launcher: bot?.shadowRoot?.querySelector('.launcher-label')?.textContent || '',
    endpoint: bot?.endpoint || ''
  };
})()`);

await evaluate(`document.querySelector('ask-this-site').open()`);
await sleep(350);
const desktopOpen = await evaluate(`(() => {
  const bot = document.querySelector('ask-this-site');
  const panel = bot.shadowRoot.querySelector('.panel');
  const rect = panel.getBoundingClientRect();
  return {
    open: bot.hasAttribute('open'),
    bodyLocked: document.body.classList.contains('gptbot-is-open'),
    ariaHidden: panel.getAttribute('aria-hidden'),
    panel: { width: Math.round(rect.width), height: Math.round(rect.height), right: Math.round(innerWidth - rect.right), bottom: Math.round(innerHeight - rect.bottom) }
  };
})()`);

await evaluate(`(() => {
  const root = document.querySelector('ask-this-site').shadowRoot;
  const input = root.querySelector('textarea');
  input.value = 'What are the research interests?';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('form').requestSubmit();
  return true;
})()`);

let answered = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  answered = await evaluate(`(() => {
    const root = document.querySelector('ask-this-site').shadowRoot;
    const messages = [...root.querySelectorAll('.message')];
    const last = messages.at(-1);
    return {
      count: messages.length,
      pending: Boolean(last?.classList.contains('pending')),
      text: last?.querySelector('.message-content')?.textContent || '',
      sources: [...(last?.querySelectorAll('.sources a') || [])].map((link) => ({ text: link.textContent, href: link.getAttribute('href') }))
    };
  })()`);
  if (answered.count >= 3 && !answered.pending) break;
  await sleep(150);
}

const wheelIsolation = await evaluate(`(() => {
  const track = document.querySelector('.main-inner');
  const before = track.style.transform;
  const messages = document.querySelector('ask-this-site').shadowRoot.querySelector('.messages');
  messages.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, composed: true, cancelable: true }));
  return { before, after: track.style.transform };
})()`);

const keyboardIsolation = await evaluate(`(() => {
  const track = document.querySelector('.main-inner');
  const before = track.style.transform;
  const input = document.querySelector('ask-this-site').shadowRoot.querySelector('textarea');
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, composed: true, cancelable: true }));
  return { before, after: track.style.transform };
})()`);

const desktopScreenshot = await screenshot('gptbot-desktop-open.png');

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await navigate(siteUrl);
const mobileMutualExclusion = await evaluate(`(() => {
  const toggle = document.getElementById('nav-toggle');
  toggle.click();
  const menuOpened = document.body.classList.contains('nav-open');
  document.querySelector('ask-this-site').open();
  return { menuOpened, menuAfterAssistant: document.body.classList.contains('nav-open') };
})()`);
await sleep(350);
const mobileOpen = await evaluate(`(() => {
  const bot = document.querySelector('ask-this-site');
  const rect = bot.shadowRoot.querySelector('.panel').getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    panel: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    bodyLocked: document.body.classList.contains('gptbot-is-open'),
    navOpen: document.body.classList.contains('nav-open')
  };
})()`);
const mobileScreenshot = await screenshot('gptbot-mobile-open.png');

const checks = {
  componentRegistered: registered.defined && registered.hasShadow && registered.launcher === 'Ask this site',
  endpointConfiguredByDevServer: registered.endpoint === '/api/chat',
  desktopPanelOpened: desktopOpen.open && desktopOpen.ariaHidden === 'false' && desktopOpen.panel.width >= 390 && desktopOpen.panel.width <= 420 && desktopOpen.panel.right >= 18 && desktopOpen.panel.bottom >= 18,
  answerReturned: answered?.count >= 3 && !answered?.pending && answered?.text.includes('Mock mode is enabled'),
  sourceRendered: Array.isArray(answered?.sources) && answered.sources.length > 0,
  homepageWheelIsolated: wheelIsolation.before === wheelIsolation.after,
  homepageKeyboardIsolated: keyboardIsolation.before === keyboardIsolation.after,
  mobilePanelFillsViewport: Math.abs(mobileOpen.panel.x) <= 1 && Math.abs(mobileOpen.panel.y) <= 1 && mobileOpen.panel.width === mobileOpen.viewport.width && mobileOpen.panel.height === mobileOpen.viewport.height,
  mobileBodyLocked: mobileOpen.bodyLocked && !mobileOpen.navOpen,
  mobileMenuAndAssistantAreExclusive: mobileMutualExclusion.menuOpened && !mobileMutualExclusion.menuAfterAssistant,
  noRuntimeExceptions: exceptions.length === 0
};

console.log(JSON.stringify({ checks, registered, desktopOpen, answered, wheelIsolation, keyboardIsolation, mobileMutualExclusion, mobileOpen, screenshots: { desktopScreenshot, mobileScreenshot }, exceptions }, null, 2));
socket.close();
if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
