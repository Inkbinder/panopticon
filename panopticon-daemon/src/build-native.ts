import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

function main() {
  if (process.platform !== "win32") return;

  const strict = process.argv.includes("--strict");

  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(here, ".. ".trim());
  const src = path.join(pkgRoot, "native", "spawn_job_win32.c");
  const outDir = path.join(pkgRoot, "native", "bin", `${process.platform}-${process.arch}`);
  const outExe = path.join(outDir, "spawn_job_win32.exe");

  fs.mkdirSync(outDir, { recursive: true });

  // Try cl.exe first (VS Build Tools), else fallback to gcc (mingw).
  // We keep this simple; CI/release can provide a prebuilt.
  const hasCl = spawnSync("where", ["cl.exe"], { shell: true, stdio: "ignore" }).status === 0;
  if (hasCl) {
    const r = spawnSync(
      "cl.exe",
      [
        "/nologo",
        "/O2",
        "/MT",
        "/Fe:" + outExe,
        src,
      ],
      { stdio: "inherit" },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
    return;
  }

  const hasGcc = spawnSync("where", ["gcc.exe"], { shell: true, stdio: "ignore" }).status === 0;
  if (hasGcc) {
    const r = spawnSync("gcc.exe", ["-O2", "-o", outExe, src], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
    return;
  }

  const msg =
    `panopticon-daemon: Windows native helper not built (no compiler found).\n` +
    `Install one of:\n` +
    `- Visual Studio Build Tools (cl.exe)\n` +
    `- MinGW-w64 gcc (gcc.exe)\n` +
    `Then run: npm -w panopticon-daemon run build:native\n` +
    `OS=${os.release()} arch=${process.arch}`;

  if (strict) {
    // eslint-disable-next-line no-console
    console.error(msg);
    process.exit(1);
  }

  // Default: don't fail the JS build.
  // The daemon enforces helper presence at runtime on Windows.
  // eslint-disable-next-line no-console
  console.warn(msg);
  return;
}

main();
