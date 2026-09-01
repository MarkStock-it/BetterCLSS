import crypto from 'node:crypto';
import net from 'node:net';

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = targets.find((entry) => entry.type === 'page' && entry.url === 'about:blank');
if (!target) throw new Error('No blank Chrome test page found');

const wsUrl = new URL(target.webSocketDebuggerUrl);
const socket = net.createConnection({ host: wsUrl.hostname, port: Number(wsUrl.port) });
const key = crypto.randomBytes(16).toString('base64');
let buffer = Buffer.alloc(0);
let handshaken = false;
let nextId = 1;
const pending = new Map();

function sendFrame(text) {
  const payload = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 0xfe; header.writeUInt16BE(payload.length, 2);
  } else throw new Error('CDP message unexpectedly large');
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  socket.write(Buffer.concat([header, mask, masked]));
}

function command(method, params = {}) {
  const id = nextId++;
  sendFrame(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function consumeFrames() {
  while (buffer.length >= 2) {
    const lengthCode = buffer[1] & 0x7f;
    let offset = 2;
    let length = lengthCode;
    if (lengthCode === 126) {
      if (buffer.length < 4) return;
      length = buffer.readUInt16BE(2); offset = 4;
    } else if (lengthCode === 127) throw new Error('Unexpected 64-bit CDP frame');
    if (buffer.length < offset + length) return;
    const payload = buffer.subarray(offset, offset + length);
    buffer = buffer.subarray(offset + length);
    const message = JSON.parse(payload.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  }
}

await new Promise((resolve, reject) => {
  socket.once('connect', () => {
    socket.write(`GET ${wsUrl.pathname} HTTP/1.1\r\nHost: ${wsUrl.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshaken) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end === -1) return;
      if (!buffer.subarray(0, end).toString().startsWith('HTTP/1.1 101')) reject(new Error('WebSocket handshake failed'));
      buffer = buffer.subarray(end + 4);
      handshaken = true;
      resolve();
    }
    if (handshaken) consumeFrames();
  });
  socket.once('error', reject);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const touch = (type, x, y) => command('Input.dispatchTouchEvent', {
  type,
  touchPoints: type === 'touchEnd' ? [] : [{ id: 1, x, y, radiusX: 1, radiusY: 1, force: 1 }],
});
const rect = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await command('Page.addScriptToEvaluateOnNewDocument', { source: `
  localStorage.setItem('bclss_canvas_token', 'test-token');
  localStorage.setItem('bclss_student_id', '1');
  localStorage.setItem('bclss_local', JSON.stringify({ assignments: [
    { id: 'assignment-1', courseId: 1, title: 'Write reflection', subject: 'English', due: '2026-09-05', done: false }
  ] }));
  window.__agentRequests = [];
  window.fetch = async (input, init) => {
    window.__agentRequests.push({ url: String(input), method: init?.method || 'GET' });
    return new Response(JSON.stringify({ job: { id: 'gesture-test-job' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
` });
await command('Page.navigate', { url: 'http://127.0.0.1:5173/' });
await wait(900);

const trigger = await rect('.action-tray-trigger');
if (!trigger) throw new Error('Assignment action trigger did not render');
const start = centre(trigger);

// 1. A plain tap never opens the tray or changes the assignment.
await touch('touchStart', start.x, start.y);
await touch('touchEnd');
await wait(450);
const tapResult = await evaluate(`({ tray: Boolean(document.querySelector('.action-tray')), done: JSON.parse(localStorage.bclss_local).assignments[0].done })`);
if (tapResult.tray || tapResult.done) throw new Error(`Tap had an action: ${JSON.stringify(tapResult)}`);

// 2–4. Hold, target Agentic Start, then release: it must select and invoke the existing job request.
await touch('touchStart', start.x, start.y);
await wait(410);
let tray = await rect('.action-tray');
if (!tray) throw new Error('Tray did not appear after hold');
let agent = await rect('[data-action="agent"]');
let point = centre(agent);
await touch('touchMove', point.x, point.y);
await wait(30);
if (!(await evaluate(`document.querySelector('[data-action="agent"]')?.classList.contains('is-hovered')`))) throw new Error('Agentic Start was not selected on drag');
await touch('touchEnd');
await wait(100);
const agentResult = await evaluate(`({ requests: window.__agentRequests, tray: Boolean(document.querySelector('.action-tray')) })`);
if (agentResult.requests.filter((request) => request.method === 'POST').length !== 1 || agentResult.tray) throw new Error(`Agentic release did not execute once: ${JSON.stringify(agentResult)}`);

// 5–6. Re-open, target Submit, release: exactly one completion update.
const triggerAgain = await rect('.action-tray-trigger');
const startAgain = centre(triggerAgain);
await touch('touchStart', startAgain.x, startAgain.y);
await wait(410);
tray = await rect('.action-tray');
if (!tray) throw new Error('Tray did not reappear');
const submit = await rect('[data-action="submit"]');
point = centre(submit);
await touch('touchMove', point.x, point.y);
await wait(30);
if (!(await evaluate(`document.querySelector('[data-action="submit"]')?.classList.contains('is-hovered')`))) throw new Error('Submit was not selected on drag');
await touch('touchEnd');
await wait(80);
const submitResult = await evaluate(`({ done: JSON.parse(localStorage.bclss_local).assignments[0].done, tray: Boolean(document.querySelector('.action-tray')) })`);
if (!submitResult.done || submitResult.tray) throw new Error(`Submit release did not complete once: ${JSON.stringify(submitResult)}`);

// 7. Releasing outside targets cancels. Restore test data first.
await evaluate(`localStorage.setItem('bclss_local', JSON.stringify({ assignments: [{ id: 'assignment-1', courseId: 1, title: 'Write reflection', subject: 'English', due: '2026-09-05', done: false }] }))`);
await command('Page.reload');
await wait(700);
const cancelStart = centre(await rect('.action-tray-trigger'));
await touch('touchStart', cancelStart.x, cancelStart.y);
await wait(410);
await touch('touchMove', 8, 8);
await touch('touchEnd');
await wait(80);
const cancelResult = await evaluate(`({ done: JSON.parse(localStorage.bclss_local).assignments[0].done, tray: Boolean(document.querySelector('.action-tray')) })`);
if (cancelResult.done || cancelResult.tray) throw new Error(`Outside release was not cancelled: ${JSON.stringify(cancelResult)}`);

// 8. A pre-hold vertical swipe keeps its native scroll behaviour and never opens a tray.
await evaluate(`document.body.style.minHeight = '2000px'; window.scrollTo(0, 0)`);
const scrollStart = centre(await rect('.action-tray-trigger'));
await touch('touchStart', scrollStart.x, scrollStart.y);
await touch('touchMove', scrollStart.x, scrollStart.y - 120);
await touch('touchEnd');
await wait(80);
const scrollResult = await evaluate(`({ scrollY: window.scrollY, tray: Boolean(document.querySelector('.action-tray')) })`);
if (scrollResult.tray) throw new Error(`Scroll unexpectedly opened tray: ${JSON.stringify(scrollResult)}`);

console.log(JSON.stringify({ tapResult, agentResult, submitResult, cancelResult, scrollResult }, null, 2));
socket.end();
