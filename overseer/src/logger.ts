import fs from 'node:fs';
import path from 'node:path';
import { createLogger, format, transports } from 'winston';
import { SentinelTransport } from './sentinel-transport';

function getLogDir(): string {
  return process.env.OVERSEER_LOG_DIR ?? process.env.PANOPTICON_LOG_DIR ?? path.join(process.cwd(), 'logs');
}

function makeRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${ts}-${process.pid}`;
}

const runId = makeRunId();
const logDir = getLogDir();
fs.mkdirSync(logDir, { recursive: true });

const logFileBase = path.join(logDir, `overseer-${runId}.log`);

function getSentinelLogsEndpoint(): string {
  const base = process.env.API_BASE_URL ?? process.env.SENTINEL_URL ?? 'http://localhost:8787';
  return new URL('/api/logs', base).toString();
}

const jsonFmt = format.combine(format.timestamp(), format.errors({ stack: true }), format.splat(), format.json());

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: 'overseer', pid: process.pid, runId },
  transports: [
    new transports.Console({
      level: process.env.CONSOLE_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.printf((info) => {
          const base = `${info.timestamp} ${String(info.level).toUpperCase()} ${info.message}`;
          return info.stack ? `${base}\n${info.stack}` : base;
        }),
      ),
    }),

    new transports.File({
      filename: logFileBase,
      level: process.env.FILE_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
      format: jsonFmt,
    }),

    new SentinelTransport({
      level: 'info',
      endpoint: getSentinelLogsEndpoint(),
      scope: 'overseer',
      agent: 'overseer',
      timeoutMs: Number(process.env.SENTINEL_LOG_TIMEOUT_MS ?? 2000),
      maxQueue: Number(process.env.SENTINEL_LOG_MAX_QUEUE ?? 200),
      format: jsonFmt,
    }),
  ],
});
