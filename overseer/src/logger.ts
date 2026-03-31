import fs from 'node:fs';
import path from 'node:path';
import { createLogger, format, transports } from 'winston';
import { SentinelTransport } from './sentinel-transport';
import { readPanopticonConfig } from './config';

const config = readPanopticonConfig();

function getLogDir(): string {
	return config.overseer?.logDir ?? path.join(process.cwd(), 'logs');
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
	const base = config.overseer?.apiBaseUrl ?? config.overseer?.sentinelUrl ?? 'http://localhost:8787';
	return new URL('/api/logs', base).toString();
}

const jsonFmt = format.combine(format.timestamp(), format.errors({ stack: true }), format.splat(), format.json());

export const logger = createLogger({
	level: config.overseer?.logLevel ?? 'info',
  defaultMeta: { service: 'overseer', pid: process.pid, runId },
  transports: [
    new transports.Console({
			level: config.overseer?.consoleLogLevel ?? config.overseer?.logLevel ?? 'info',
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
			level: config.overseer?.fileLogLevel ?? config.overseer?.logLevel ?? 'info',
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
			timeoutMs: Number(config.overseer?.sentinelLogTimeoutMs ?? 2000),
			maxQueue: Number(config.overseer?.sentinelLogMaxQueue ?? 200),
      format: jsonFmt,
    }),
  ],
});
