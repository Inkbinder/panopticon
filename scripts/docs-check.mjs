import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function isProbablyExternalLink(raw) {
  const link = raw.trim();
  return (
    link.startsWith("http://") ||
    link.startsWith("https://") ||
    link.startsWith("mailto:") ||
    link.startsWith("tel:") ||
    link.startsWith("data:") ||
    link.startsWith("vscode:") ||
    link.startsWith("file:")
  );
}

function normalizePosix(p) {
  return p.split(path.sep).join("/");
}

function slugifyHeading(text) {
  // Roughly matches GitHub-style anchor generation.
  const cleaned = text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase();

  const dashed = cleaned
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return dashed;
}

function extractLinks(markdown) {
  const links = [];

  // Very small Markdown link extractor. We intentionally do not attempt full Markdown parsing.
  // - Handles [text](target)
  // - Handles ![alt](target)
  // - Ignores reference-style links.
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;

  let match;
  while ((match = linkPattern.exec(markdown)) !== null) {
    links.push(match[1]);
  }

  return links;
}

function extractHeadings(markdown) {
  const anchors = new Set();
  const seen = new Map();

  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!headingMatch) continue;

    const headingText = headingMatch[2].trim();
    if (!headingText) continue;

    const base = slugifyHeading(headingText);
    if (!base) continue;

    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    const anchor = count === 1 ? base : `${base}-${count - 1}`;
    anchors.add(anchor);
  }

  return anchors;
}

async function listMarkdownFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      out.push(...(await listMarkdownFiles(full)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }

  return out;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function checkRequiredStructure(errors) {
  const requiredFiles = [
    "AGENTS.md",
    "README.md",
    "docs/index.md",
    "docs/architecture.md",
    "docs/quality.md",
  ];

  for (const rel of requiredFiles) {
    const abs = path.join(repoRoot, rel);
    if (!(await fileExists(abs))) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  // Ensure at least one active plan exists.
  const activeDir = path.join(repoRoot, "docs/plans/active");
  try {
    const entries = await fs.readdir(activeDir);
    const planFiles = entries.filter((e) => e.toLowerCase().endsWith(".md"));
    if (planFiles.length === 0) {
      errors.push("Missing active plan markdown under docs/plans/active/");
    }
  } catch {
    errors.push("Missing required directory: docs/plans/active/");
  }
}

async function main() {
  const errors = [];
  await checkRequiredStructure(errors);

  const roots = [
    path.join(repoRoot, "AGENTS.md"),
    path.join(repoRoot, "README.md"),
    path.join(repoRoot, "docs"),
  ];

  const markdownFiles = new Set();

  // Add the root files if present.
  for (const file of [roots[0], roots[1]]) {
    if (await fileExists(file)) markdownFiles.add(file);
  }

  // Add docs tree.
  try {
    const docsFiles = await listMarkdownFiles(roots[2]);
    for (const f of docsFiles) markdownFiles.add(f);
  } catch {
    // handled by required structure check
  }

  const headingCache = new Map();

  for (const filePath of markdownFiles) {
    const markdown = await fs.readFile(filePath, "utf8");
    const links = extractLinks(markdown);

    for (const rawLink of links) {
      if (!rawLink) continue;

      const link = rawLink.trim();
      if (isProbablyExternalLink(link)) continue;

      const [rawPathPart, rawHash] = link.split("#");
      const pathPart = rawPathPart ?? "";
      const hash = rawHash ?? "";

      if (!pathPart && !hash) continue;

      // Resolve filesystem target.
      const fileDir = path.dirname(filePath);
      const targetFile = path.resolve(fileDir, decodeURI(pathPart || path.basename(filePath)));

      if (pathPart) {
        if (!(await fileExists(targetFile))) {
          const from = normalizePosix(path.relative(repoRoot, filePath));
          const to = normalizePosix(path.relative(repoRoot, targetFile));
          errors.push(`${from}: broken link target ${link} (resolved to ${to})`);
          continue;
        }
      } else {
        // Same-file anchor-only link.
        if (!(await fileExists(targetFile))) continue;
      }

      // Anchor checks (if present).
      if (hash) {
        const key = targetFile;
        let anchors = headingCache.get(key);
        if (!anchors) {
          const targetMarkdown = await fs.readFile(targetFile, "utf8");
          anchors = extractHeadings(targetMarkdown);
          headingCache.set(key, anchors);
        }

        if (!anchors.has(hash)) {
          const from = normalizePosix(path.relative(repoRoot, filePath));
          const to = normalizePosix(path.relative(repoRoot, targetFile));
          errors.push(`${from}: broken anchor #${hash} in ${normalizePosix(pathPart || path.basename(filePath))} (resolved to ${to})`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("docs:check failed:\n");
    for (const err of errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log(`docs:check passed (${markdownFiles.size} markdown files checked)`);
}

await main();
