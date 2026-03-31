import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function main() {
  // Only enforce for Windows publishes.
  if (process.platform !== "win32") return;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(here, ".. ".trim());

  // Require at least win32-x64 helper; add win32-arm64 later if you ship it.
  const required = [path.join(pkgRoot, "native", "bin", "win32-x64", "spawn_job_win32.exe")];

  const missing = required.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(
      `panopticon-daemon: missing Windows prebuilt helper(s):\n` +
        missing.map((m) => `- ${m}`).join("\n") +
        `\n\nBuild it on Windows with a compiler, then run:\n` +
        `  npm -w panopticon-daemon run build:native\n`,
    );
    process.exit(1);
  }
}

main();
