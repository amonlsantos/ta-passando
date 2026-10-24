/**
 * Helpers for the integration tests: free ports, child processes and a tiny
 * HTTP client. Everything is spawned on ephemeral ports so the suite can run
 * in parallel with a development server.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

export const mockScript = path.join(projectRoot, 'test', 'mock-epg.mjs');
export const serverEntry = path.join(projectRoot, 'dist', 'server.js');

/** Reserves a port by binding to :0 and immediately releasing it. */
export async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();

    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it resolves truthy, or gives up. */
export async function waitFor(check, { timeout = 15000, interval = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;

  for (;;) {
    try {
      const value = await check();
      if (value) {
        return value;
      }
    } catch {
      // keep polling
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }

    await wait(interval);
  }
}

/** Starts the mock XMLTV provider on `port`. Resolves once it answers /__stats. */
export async function startMock(port, { failMode = 'ok' } = {}) {
  const child = spawn(process.execPath, [mockScript, String(port)], {
    cwd: projectRoot,
    env: { ...process.env, MOCK_FAIL_MODE: failMode },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));

  await waitFor(
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`mock exited early (${child.exitCode}): ${stderr}`);
      }
      const response = await fetch(`http://localhost:${port}/__stats`);
      return response.ok;
    },
    { label: `mock provider on ${port}` },
  );

  return {
    child,
    port,
    url: `http://localhost:${port}/epg.xml`,
    stats: () => fetch(`http://localhost:${port}/__stats`).then((r) => r.json()),
    reset: () => fetch(`http://localhost:${port}/__reset`).then((r) => r.json()),
    stop: () => stop(child),
  };
}

/** Starts a throwaway HTTP endpoint with a fixed handler (error scenarios). */
export async function startRawServer(handler) {
  const port = await freePort();
  const { createServer } = await import('node:http');
  const server = createServer(handler);

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    port,
    url: `http://localhost:${port}/epg.xml`,
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** A provider that never answers, to exercise the upstream timeout. */
export function startBlackHole(delayMs = 60_000) {
  return startRawServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'text/xml' });
      response.end('<tv />');
    }, delayMs).unref();
  });
}

/** A provider that answers with a body larger than the configured limit. */
export function startOversizedProvider(bytes) {
  return startRawServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/xml' });
    response.end(`<tv>${'x'.repeat(bytes)}</tv>`);
  });
}

export function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}

/** Starts the built API. `env` is merged over the required defaults. */
export async function startApi({ xmltvUrl, env = {} }) {
  const port = await freePort();

  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {
      ...process.env,
      EPG_XMLTV_URL: xmltvUrl,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  await waitFor(
    async () => {
      if (child.exitCode !== null) {
        throw new Error(`api exited early (${child.exitCode}):\n${output}`);
      }
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    },
    { label: `api on ${port}` },
  );

  return {
    child,
    port,
    output: () => output,
    url: `http://127.0.0.1:${port}`,
    request: (route, init) => request(`http://127.0.0.1:${port}${route}`, init),
    stop: () => stop(child),
  };
}

/** Starts the API expecting it to fail, and resolves with its exit output. */
export function startApiExpectingFailure(env) {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  return new Promise((resolve) => {
    child.once('exit', (code) => resolve({ code, output }));
  });
}

/** GET/JSON helper returning `{ status, body, headers }`. */
export async function request(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();

  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body, headers: response.headers };
}
