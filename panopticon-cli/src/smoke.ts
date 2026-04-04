import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type QuestionResponse = {
  id: string;
  prompt: string;
  status?: string;
  answer?: string;
};

type SseEnvelope = {
  type: string;
  data: Record<string, unknown>;
};

const startupTimeoutMs = 30_000;
const shutdownTimeoutMs = 10_000;
const sseTimeoutMs = 10_000;

function getStringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function getRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../..');
}

function assertBuiltArtifacts(repoRoot: string): void {
  const requiredFiles = [
    path.join(repoRoot, 'panopticon-cli', 'dist', 'index.js'),
    path.join(repoRoot, 'sentinel', 'dist', 'index.js'),
    path.join(repoRoot, 'overseer', 'dist', 'index.js'),
    path.join(repoRoot, 'watchtower', 'dist-server', 'server.js'),
    path.join(repoRoot, 'watchtower', 'dist', 'index.html'),
  ];

  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing build artifact: ${filePath}. Run npm run build before npm run smoke.`);
    }
  }
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a TCP port.'));
        return;
      }

      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function writeSmokeConfig(tempDir: string, sentinelPort: number, watchtowerPort: number): Promise<string> {
  const logDir = path.join(tempDir, 'logs');
  const yaml = [
    'sentinel:',
    `  port: ${sentinelPort}`,
    '  demoSim: false',
    'overseer:',
    `  logDir: ${JSON.stringify(logDir)}`,
    '  logLevel: info',
    '  consoleLogLevel: info',
    '  fileLogLevel: info',
    `  sentinelUrl: ${JSON.stringify(`http://127.0.0.1:${sentinelPort}`)}`,
    'watchtower:',
    `  port: ${watchtowerPort}`,
    '  host: 127.0.0.1',
    `  apiBaseUrl: ${JSON.stringify(`http://127.0.0.1:${sentinelPort}`)}`,
    '',
  ].join('\n');

  const configPath = path.join(tempDir, 'panopticon.yaml');
  await fsp.writeFile(configPath, yaml, 'utf8');
  return configPath;
}

function appendOutput(target: { value: string }, chunk: string): void {
  const next = `${target.value}${chunk}`;
  target.value = next.length > 20_000 ? next.slice(-20_000) : next;
}

function spawnSupervisor(repoRoot: string, cwd: string): {
  child: ChildProcess;
  stdout: { value: string };
  stderr: { value: string };
} {
  const stdout = { value: '' };
  const stderr = { value: '' };
  const child = spawn('node', [path.join(repoRoot, 'panopticon-cli', 'dist', 'index.js'), 'start', '--timeout', '1000'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => appendOutput(stdout, chunk));
  child.stderr?.on('data', (chunk: string) => appendOutput(stderr, chunk));

  return { child, stdout, stderr };
}

function formatFailure(message: string, details: { tempDir: string; stdout: string; stderr: string }): Error {
  const sections = [
    message,
    `Temporary harness state: ${details.tempDir}`,
    details.stdout ? `Captured stdout:\n${details.stdout}` : '',
    details.stderr ? `Captured stderr:\n${details.stderr}` : '',
  ].filter(Boolean);

  return new Error(sections.join('\n\n'));
}

async function waitForCondition(
  label: string,
  condition: () => Promise<boolean>,
  opts: { timeoutMs: number; onExit?: () => string | null },
): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    const earlyExit = opts.onExit?.();
    if (earlyExit) {
      throw new Error(`${label} failed because the supervisor exited early: ${earlyExit}`);
    }

    try {
      if (await condition()) return;
      lastError = null;
    } catch (err) {
      lastError = String(err);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(lastError ? `${label} timed out: ${lastError}` : `${label} timed out after ${opts.timeoutMs}ms`);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with ${res.status}`);
  }

  return await res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with ${res.status}`);
  }

  return await res.json();
}

async function createLog(baseUrl: string, message: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scope: 'overseer',
      agent: 'overseer',
      message,
      level: 'info',
    }),
  });

  if (!res.ok) {
    throw new Error(`Log creation failed with ${res.status}`);
  }

  void res.body?.cancel?.();
}

async function waitForOverseerLog(logDir: string, message: string, onExit: () => string | null): Promise<void> {
  await waitForCondition(
    `Waiting for overseer log message ${JSON.stringify(message)}`,
    async () => {
      const files = await fsp.readdir(logDir).catch(() => [] as string[]);
      for (const fileName of files) {
        const fullPath = path.join(logDir, fileName);
        const contents = await fsp.readFile(fullPath, 'utf8').catch(() => '');
        if (contents.includes(message)) {
          return true;
        }
      }
      return false;
    },
    { timeoutMs: startupTimeoutMs, onExit },
  );
}

async function createQuestion(baseUrl: string): Promise<QuestionResponse> {
  const res = await fetch(`${baseUrl}/api/questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scope: 'overseer',
      fromAgent: 'overseer',
      prompt: 'Smoke test question',
    }),
  });

  if (!res.ok) {
    throw new Error(`Question creation failed with ${res.status}`);
  }

  return (await res.json()) as QuestionResponse;
}

async function answerQuestion(baseUrl: string, id: string, answer: string): Promise<QuestionResponse> {
  const res = await fetch(`${baseUrl}/api/questions/${id}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });

  if (!res.ok) {
    throw new Error(`Question answer failed with ${res.status}`);
  }

  return (await res.json()) as QuestionResponse;
}

function pullEventBlocks(buffer: string): { blocks: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';
  return { blocks, remainder };
}

async function waitForSseEvent(
  url: string,
  predicate: (event: SseEnvelope) => boolean,
  label: string,
  onExit: () => string | null,
  opts?: { timeoutMs?: number; onOpen?: () => void | Promise<void> },
): Promise<SseEnvelope> {
  const timeoutMs = opts?.timeoutMs ?? sseTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE request failed with ${res.status}`);
    }

    await opts?.onOpen?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const earlyExit = onExit();
      if (earlyExit) {
        throw new Error(`${label} failed because the supervisor exited early: ${earlyExit}`);
      }

      const { done, value } = await reader.read();
      if (done) {
        throw new Error(`SSE stream ended before ${label}`);
      }

      buffer += decoder.decode(value, { stream: true });
      const { blocks, remainder } = pullEventBlocks(buffer);
      buffer = remainder;

      for (const block of blocks) {
        const dataLines = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());

        if (dataLines.length === 0) continue;

        const parsed = JSON.parse(dataLines.join('\n')) as SseEnvelope;
        if (predicate(parsed)) {
          return parsed;
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function stopSupervisor(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;

  child.kill('SIGINT');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Supervisor did not shut down within ${shutdownTimeoutMs}ms`));
    }, shutdownTimeoutMs);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  if ((child.exitCode ?? 0) !== 0) {
    throw new Error(`Supervisor exited with code ${child.exitCode}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = getRepoRoot();
  assertBuiltArtifacts(repoRoot);

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'panopticon-smoke-'));
  const sentinelPort = await allocatePort();
  const watchtowerPort = await allocatePort();
  await writeSmokeConfig(tempDir, sentinelPort, watchtowerPort);

  const { child, stdout, stderr } = spawnSupervisor(repoRoot, tempDir);
  const watchtowerBaseUrl = `http://127.0.0.1:${watchtowerPort}`;
  const sentinelBaseUrl = `http://127.0.0.1:${sentinelPort}`;
  const onExit = () => {
    if (child.exitCode === null && child.signalCode === null) return null;
    return `code=${child.exitCode ?? 'null'} signal=${child.signalCode ?? 'null'}`;
  };

  let shouldPreserveTempDir = true;

  try {
    await waitForCondition(
      'Waiting for Sentinel health (direct)',
      async () => {
        const payload = (await fetchJson(`${sentinelBaseUrl}/api/health`)) as { ok?: boolean };
        return payload.ok === true;
      },
      { timeoutMs: startupTimeoutMs, onExit },
    );

    const smokeLogMessage = `Smoke test log ${Date.now()}`;
    await waitForSseEvent(
      `${sentinelBaseUrl}/api/events?scope=overseer`,
      (event) =>
        event.type === 'log' &&
        getStringField(event.data, 'scope') === 'overseer' &&
        getStringField(event.data, 'message') === smokeLogMessage,
      'Waiting for log ingestion to appear on the SSE stream',
      onExit,
      {
        timeoutMs: startupTimeoutMs,
        onOpen: async () => {
          await createLog(sentinelBaseUrl, smokeLogMessage);
        },
      },
    );

    await waitForCondition(
      'Waiting for Watchtower to serve the UI',
      async () => {
        const html = await fetchText(`${watchtowerBaseUrl}/`);
        return html.toLowerCase().includes('<!doctype html');
      },
      { timeoutMs: startupTimeoutMs, onExit },
    );

    await waitForCondition(
      'Waiting for Sentinel health through the Watchtower proxy',
      async () => {
        const payload = (await fetchJson(`${watchtowerBaseUrl}/api/health`)) as { ok?: boolean };
        return payload.ok === true;
      },
      { timeoutMs: startupTimeoutMs, onExit },
    );

    await waitForOverseerLog(path.join(tempDir, 'logs'), 'running a task every minute', onExit);

    const created = await createQuestion(watchtowerBaseUrl);
    await waitForSseEvent(
      `${watchtowerBaseUrl}/api/events?scope=overseer`,
      (event) =>
        event.type === 'question.upsert' &&
        getStringField(event.data, 'id') === created.id &&
        getStringField(event.data, 'prompt') === created.prompt &&
        getStringField(event.data, 'status') === 'open',
      'Waiting for the created question to appear on the SSE stream',
      onExit,
    );

    const expectedAnswer = 'Smoke test answer';
    const answered = await answerQuestion(watchtowerBaseUrl, created.id, expectedAnswer);
    if (answered.status !== 'answered' || answered.answer !== expectedAnswer) {
      throw new Error(
        `Unexpected question answer response. status=${JSON.stringify(answered.status)} answer=${JSON.stringify(answered.answer)}`,
      );
    }

    await waitForSseEvent(
      `${watchtowerBaseUrl}/api/events?scope=overseer`,
      (event) =>
        event.type === 'question.upsert' &&
        getStringField(event.data, 'id') === created.id &&
        getStringField(event.data, 'status') === 'answered' &&
        getStringField(event.data, 'answer') === expectedAnswer,
      'Waiting for the answered question to appear on a fresh SSE connection (reconnect snapshot)',
      onExit,
    );

    await stopSupervisor(child);
    shouldPreserveTempDir = false;
    await fsp.rm(tempDir, { recursive: true, force: true });
    console.log('Panopticon smoke test passed.');
  } catch (err) {
    try {
      await stopSupervisor(child);
    } catch {
      // Preserve artifacts for debugging if shutdown also fails.
    }

    throw formatFailure(String(err), {
      tempDir: shouldPreserveTempDir ? tempDir : '(removed)',
      stdout: stdout.value,
      stderr: stderr.value,
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});