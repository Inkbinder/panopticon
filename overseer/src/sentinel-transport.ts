import Transport from 'winston-transport';

export type SentinelTransportOpts = {
  endpoint: string;
  scope: 'overseer' | 'cell';
  agent: 'overseer' | 'guard' | 'resident' | 'janitor';
  cellId?: string;
  timeoutMs?: number;
  maxQueue?: number;
} & ConstructorParameters<typeof Transport>[0];

export class SentinelTransport extends Transport {
  private endpoint: string;
  private scope: 'overseer' | 'cell';
  private agent: 'overseer' | 'guard' | 'resident' | 'janitor';
  private cellId?: string;
  private timeoutMs: number;
  private maxQueue: number;

  private queue: any[] = [];
  private flushing = false;

  constructor(opts: SentinelTransportOpts) {
    super(opts);
    this.endpoint = opts.endpoint;
    this.scope = opts.scope;
    this.agent = opts.agent;
    this.cellId = opts.cellId;
    this.timeoutMs = opts.timeoutMs ?? 2000;
    this.maxQueue = opts.maxQueue ?? 200;
  }

  // Winston calls this for each log entry.
  // We must not block the app; send best-effort in background.
  log(info: any, callback: () => void) {
    setImmediate(callback);

    // Clone to avoid later mutation by winston formats.
    const snapshot = { ...info };

    if (this.queue.length >= this.maxQueue) {
      // Drop oldest to avoid unbounded memory growth.
      this.queue.shift();
    }

    this.queue.push(snapshot);
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;

    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        try {
          await this.sendOne(next);
        } catch {
          // Best-effort: if sentinel is down or network fails, drop.
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async sendOne(info: any): Promise<void> {
    const message =
      typeof info?.message === 'string'
        ? info.message
        : info?.message != null
          ? JSON.stringify(info.message)
          : '';

    if (!message) return;

    const level = typeof info?.level === 'string' ? info.level : undefined;

    const body: any = {
      scope: this.scope,
      agent: this.agent,
      message,
      level,
    };

    if (this.scope === 'cell') body.cellId = this.cellId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    // Don't keep the process alive just for logging.
    (timeout as any).unref?.();

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Avoid throwing on non-2xx; just drop.
      void res.body?.cancel?.();
    } finally {
      clearTimeout(timeout);
    }
  }
}
