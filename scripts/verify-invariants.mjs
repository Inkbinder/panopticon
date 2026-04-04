import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const workspaceDirs = ['panopticon', 'panopticon-cli', 'overseer', 'sentinel', 'watchtower'];
const workspaceRoots = workspaceDirs.map((dir) => ({ name: dir, root: path.join(repoRoot, dir) }));
const sourceRoots = [
  path.join(repoRoot, 'panopticon', 'bin'),
  path.join(repoRoot, 'panopticon-cli', 'src'),
  path.join(repoRoot, 'overseer', 'src'),
  path.join(repoRoot, 'sentinel', 'src'),
  path.join(repoRoot, 'watchtower', 'src'),
];

const violations = [];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

function addViolation(filePath, message, remediation, lineNumber) {
  violations.push({ filePath, message, remediation, lineNumber });
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx|js)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function findWorkspaceForFile(filePath) {
  return workspaceRoots.find(({ root }) => filePath === root || filePath.startsWith(`${root}${path.sep}`));
}

function lineNumberForIndex(contents, index) {
  return contents.slice(0, index).split('\n').length;
}

function extractSpecifiers(contents) {
  const specifiers = [];
  const regex = /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"`]+)['"]|import\(\s*['"]([^'"`]+)['"]\s*\)/g;
  let match;
  while ((match = regex.exec(contents)) !== null) {
    specifiers.push({
      specifier: match[1] ?? match[2],
      index: match.index,
    });
  }

  return specifiers;
}

function resolveImportTarget(filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function isInDir(filePath, dirPath) {
  return filePath === dirPath || filePath.startsWith(`${dirPath}${path.sep}`);
}

function checkInternalLayering(filePath, contents) {
  const workspace = findWorkspaceForFile(filePath);
  if (!workspace) return;

  // PR10: internal layering rules (minimal, remediation-oriented).
  // Sentinel layering: events (lowest) <- state <- routes/demo (highest).
  if (workspace.name === 'sentinel') {
    const eventsDir = path.join(workspace.root, 'src', 'events');
    const stateDir = path.join(workspace.root, 'src', 'state');
    const routesDir = path.join(workspace.root, 'src', 'routes');
    const demoDir = path.join(workspace.root, 'src', 'demo');

    const inEvents = isInDir(filePath, eventsDir);
    const inState = isInDir(filePath, stateDir);

    for (const { specifier, index } of extractSpecifiers(contents)) {
      if (!specifier?.startsWith('.')) continue;
      const resolved = resolveImportTarget(filePath, specifier);
      if (!resolved) continue;

      if (inEvents && (isInDir(resolved, stateDir) || isInDir(resolved, routesDir) || isInDir(resolved, demoDir))) {
        addViolation(
          filePath,
          `Sentinel events layer must not import higher layers (${relativePath(resolved)}).`,
          'Move shared types/utilities down into sentinel/src/events or a small leaf module; keep routes/state/demo depending on events, not the reverse.',
          lineNumberForIndex(contents, index),
        );
      }

      if (inState && (isInDir(resolved, routesDir) || isInDir(resolved, demoDir))) {
        addViolation(
          filePath,
          `Sentinel state layer must not import higher layers (${relativePath(resolved)}).`,
          'Move boundary wiring into sentinel/src/routes (or demo), and keep sentinel/src/state focused on in-memory domain behavior + event publication.',
          lineNumberForIndex(contents, index),
        );
      }
    }
  }

  // Watchtower layering: realtime/types (lower) <- widgets <- pages/app (higher).
  if (workspace.name === 'watchtower') {
    const realtimeDir = path.join(workspace.root, 'src', 'ui', 'realtime');
    const widgetsDir = path.join(workspace.root, 'src', 'ui', 'widgets');
    const pagesDir = path.join(workspace.root, 'src', 'ui', 'pages');

    const inRealtime = isInDir(filePath, realtimeDir);
    const inWidgets = isInDir(filePath, widgetsDir);

    for (const { specifier, index } of extractSpecifiers(contents)) {
      if (!specifier?.startsWith('.')) continue;
      const resolved = resolveImportTarget(filePath, specifier);
      if (!resolved) continue;

      if (inRealtime && (isInDir(resolved, widgetsDir) || isInDir(resolved, pagesDir))) {
        addViolation(
          filePath,
          `Watchtower realtime layer must not import UI composition layers (${relativePath(resolved)}).`,
          'Keep watchtower/src/ui/realtime focused on SSE transport + state hooks; move UI composition into widgets/pages instead of importing them into realtime.',
          lineNumberForIndex(contents, index),
        );
      }

      if (inWidgets && isInDir(resolved, pagesDir)) {
        addViolation(
          filePath,
          `Watchtower widgets layer must not import pages (${relativePath(resolved)}).`,
          'Move shared view logic into widgets or ui/types; pages may compose widgets, but widgets should stay reusable and not depend on routing/page composition.',
          lineNumberForIndex(contents, index),
        );
      }
    }
  }
}

function checkRelativeImportBoundaries(filePath, contents) {
  const workspace = findWorkspaceForFile(filePath);
  if (!workspace) {
    return;
  }

  for (const { specifier, index } of extractSpecifiers(contents)) {
    if (!specifier) {
      continue;
    }

    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), specifier);
      if (!resolved.startsWith(`${workspace.root}${path.sep}`) && resolved !== workspace.root) {
        addViolation(
          filePath,
          `Relative import ${JSON.stringify(specifier)} escapes the ${workspace.name} workspace boundary.`,
          "Move the shared contract into a package-level public module or duplicate the local boundary type instead of importing another workspace's source tree.",
          lineNumberForIndex(contents, index),
        );
      }
      continue;
    }

    for (const otherWorkspace of workspaceRoots) {
      if (otherWorkspace.name === workspace.name) {
        continue;
      }

      if (specifier.includes(`${otherWorkspace.name}/src`) || specifier.includes(`${otherWorkspace.name}/bin`)) {
        addViolation(
          filePath,
          `Import ${JSON.stringify(specifier)} reaches into ${otherWorkspace.name}'s private source tree.`,
          'Import the published workspace entrypoint or extract the shared contract into an explicit boundary module.',
          lineNumberForIndex(contents, index),
        );
      }
    }
  }
}

function checkSentinelRoutes() {
  const routeFiles = walkFiles(path.join(repoRoot, 'sentinel', 'src', 'routes'));

  for (const filePath of routeFiles) {
    const contents = fs.readFileSync(filePath, 'utf8');
    if (!contents.includes('../validation')) {
      addViolation(
        filePath,
        'Sentinel routes must import the shared validation module before touching external input.',
        'Parse params, query, or body with sentinel/src/validation.ts so ingress behavior stays consistent across routes.',
      );
    }

    if (!contents.includes('.safeParse(')) {
      addViolation(
        filePath,
        'Sentinel routes must schema-parse external input at the boundary.',
        'Use the relevant zod schema from sentinel/src/validation.ts and reject invalid input before business logic runs.',
      );
    }
  }
}

function checkConfigValidation() {
  const configFiles = [
    path.join(repoRoot, 'sentinel', 'src', 'config.ts'),
    path.join(repoRoot, 'overseer', 'src', 'config.ts'),
    path.join(repoRoot, 'panopticon-cli', 'src', 'lib', 'config.ts'),
  ];

  for (const filePath of configFiles) {
    const contents = fs.readFileSync(filePath, 'utf8');
    if (!contents.includes('panopticonConfigSchema') || !contents.includes('.safeParse(')) {
      addViolation(
        filePath,
        'Config loading must validate panopticon.yaml with the shared schema before use.',
        'Keep YAML parsing and schema validation together so invalid config fails before runtime behavior starts.',
      );
    }
  }
}

function checkWatchtowerSseBoundary() {
  const filePath = path.join(repoRoot, 'watchtower', 'src', 'ui', 'realtime', 'useEventStream.ts');
  const contents = fs.readFileSync(filePath, 'utf8');

  if (!contents.includes('parseSseEnvelope(')) {
    addViolation(
      filePath,
      'Watchtower must parse SSE payloads through the shared envelope parser.',
      'Route inbound event-stream data through watchtower/src/ui/realtime/sse.ts before dispatching it to UI handlers.',
    );
  }

  if (contents.includes('JSON.parse(')) {
    addViolation(
      filePath,
      'Watchtower event-stream handling must not parse raw JSON inline.',
      'Keep SSE parsing centralized in watchtower/src/ui/realtime/sse.ts so malformed envelopes fail consistently.',
    );
  }
}

function checkOverseerLogging() {
  const files = walkFiles(path.join(repoRoot, 'overseer', 'src'));
  for (const filePath of files) {
    const contents = fs.readFileSync(filePath, 'utf8');
    const match = /\bconsole\./.exec(contents);
    if (match) {
      addViolation(
        filePath,
        'Overseer source must use structured logger output instead of direct console calls.',
        'Emit logs through overseer/src/logger.ts so console and file output stay machine-readable and consistently shipped to Sentinel.',
        lineNumberForIndex(contents, match.index),
      );
    }
  }
}

for (const root of sourceRoots) {
  for (const filePath of walkFiles(root)) {
    const contents = fs.readFileSync(filePath, 'utf8');
    checkRelativeImportBoundaries(filePath, contents);
    checkInternalLayering(filePath, contents);
  }
}

checkSentinelRoutes();
checkConfigValidation();
checkWatchtowerSseBoundary();
checkOverseerLogging();

if (violations.length > 0) {
  console.error('Invariant checks failed.');
  console.error('');

  for (const violation of violations) {
    const location = violation.lineNumber
      ? `${relativePath(violation.filePath)}:${violation.lineNumber}`
      : relativePath(violation.filePath);

    console.error(`- ${location}: ${violation.message}`);
    console.error(`  Remediation: ${violation.remediation}`);
  }

  process.exitCode = 1;
} else {
  console.log('Invariant checks passed.');
}