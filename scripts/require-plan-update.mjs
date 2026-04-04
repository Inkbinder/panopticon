import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function getChangedFiles(baseSha, headSha) {
  const output = runGit(['diff', '--name-only', `${baseSha}...${headSha}`]);
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasPrefix(filePath, prefix) {
  return filePath === prefix || filePath.startsWith(`${prefix}/`);
}

function isHighLeverageChange(filePath) {
  if (hasPrefix(filePath, '.github')) return true;
  if (filePath === 'scripts/verify-invariants.mjs') return true;
  if (filePath === 'docs/architecture.md') return true;
  if (filePath === 'package.json') return true;
  return false;
}

function isPlanFile(filePath) {
  return filePath.startsWith('docs/plans/active/') && filePath.endsWith('.md');
}

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName !== 'pull_request') {
    console.log('Plan guard: skipping (not a pull_request event).');
    return;
  }

  if (!eventPath || !fs.existsSync(eventPath)) {
    console.error('Plan guard: GITHUB_EVENT_PATH is missing; cannot determine PR base/head.');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const baseSha = payload?.pull_request?.base?.sha;
  const headSha = payload?.pull_request?.head?.sha;

  if (!baseSha || !headSha) {
    console.error('Plan guard: could not read pull_request.base.sha and pull_request.head.sha from event payload.');
    process.exit(1);
  }

  const changedFiles = getChangedFiles(baseSha, headSha);
  const highLeverageFiles = changedFiles.filter(isHighLeverageChange);
  if (highLeverageFiles.length === 0) {
    console.log('Plan guard: ok (no high-leverage changes detected).');
    return;
  }

  const planFiles = changedFiles.filter(isPlanFile);
  if (planFiles.length > 0) {
    console.log('Plan guard: ok (plan updated).');
    return;
  }

  const messageLines = [
    'Plan guard: missing plan update.',
    '',
    'This PR touches high-leverage areas that require a versioned plan update under docs/plans/active/.',
    '',
    'High-leverage files changed:',
    ...highLeverageFiles.map((f) => `- ${f}`),
    '',
    'Remediation:',
    '- Add or update an execution plan under docs/plans/active/ (or update the relevant existing plan) describing scope, non-goals, validation, and rollout steps.',
  ];

  console.error(messageLines.join('\n'));
  process.exit(1);
}

main();
