import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPanopticonConfig } from '../lib/config';

describe('readPanopticonConfig', () => {
  it('derives deterministic worktree-local ports and URLs when runtime.portStrategy=worktree', () => {
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'panopticon-config-a-'));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'panopticon-config-b-'));
    const yaml = [
      'runtime:',
      '  portStrategy: worktree',
      'sentinel:',
      '  demoSim: false',
      'overseer:',
      '  logLevel: info',
      'watchtower:',
      '  host: 127.0.0.1',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(tmpA, 'panopticon.yaml'), yaml, 'utf8');
    fs.writeFileSync(path.join(tmpB, 'panopticon.yaml'), yaml, 'utf8');

    const a1 = readPanopticonConfig({ cwd: tmpA, required: true });
    const a2 = readPanopticonConfig({ cwd: tmpA, required: true });
    const b = readPanopticonConfig({ cwd: tmpB, required: true });

    expect(a1.sentinel?.port).toBe(a2.sentinel?.port);
    expect(a1.watchtower?.port).toBe(a2.watchtower?.port);
    expect(a1.sentinel?.port).not.toBe(8787);
    expect(a1.watchtower?.port).not.toBe(5173);
    expect(a1.sentinel?.port).not.toBe(b.sentinel?.port);
    expect(a1.watchtower?.apiBaseUrl).toBe(`http://127.0.0.1:${a1.sentinel?.port}`);
    expect(a1.overseer?.sentinelUrl).toBe(`http://127.0.0.1:${a1.sentinel?.port}`);
  });

  it('preserves explicit ports and URLs when they are configured', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panopticon-config-fixed-'));
    fs.writeFileSync(
      path.join(tmp, 'panopticon.yaml'),
      [
        'runtime:',
        '  portStrategy: worktree',
        'sentinel:',
        '  port: 19000',
        'overseer:',
        '  sentinelUrl: http://127.0.0.1:19000',
        'watchtower:',
        '  port: 16000',
        '  apiBaseUrl: http://127.0.0.1:19000',
        '',
      ].join('\n'),
      'utf8',
    );

    const config = readPanopticonConfig({ cwd: tmp, required: true });
    expect(config.sentinel?.port).toBe(19000);
    expect(config.watchtower?.port).toBe(16000);
    expect(config.watchtower?.apiBaseUrl).toBe('http://127.0.0.1:19000');
    expect(config.overseer?.sentinelUrl).toBe('http://127.0.0.1:19000');
  });
});