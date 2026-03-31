import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

function rmDir(p: string) {
  fs.rmSync(p, { recursive: true, force: true });
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../.. ".trim());
  const daemonRoot = path.resolve(here, ".. ".trim());

  const outRoot = path.join(daemonRoot, "runtime");
  rmDir(outRoot);

  // sentinel
  const sentinelDist = path.join(repoRoot, "sentinel", "dist");
  if (!fs.existsSync(path.join(sentinelDist, "index.js"))) {
    throw new Error(`Missing sentinel build output at ${sentinelDist}. Build sentinel first.`);
  }
  copyDir(sentinelDist, path.join(outRoot, "sentinel"));

  // overseer
  const overseerDist = path.join(repoRoot, "overseer", "dist");
  if (!fs.existsSync(path.join(overseerDist, "index.js"))) {
    throw new Error(`Missing overseer build output at ${overseerDist}. Build overseer first.`);
  }
  copyDir(overseerDist, path.join(outRoot, "overseer"));

  // watchtower: copy dist-server + dist assets
  const watchtowerDistServer = path.join(repoRoot, "watchtower", "dist-server");
  const watchtowerDist = path.join(repoRoot, "watchtower", "dist");
  if (!fs.existsSync(path.join(watchtowerDistServer, "server.js"))) {
    throw new Error(`Missing watchtower dist-server output at ${watchtowerDistServer}. Build watchtower first.`);
  }
  if (!fs.existsSync(watchtowerDist)) {
    throw new Error(`Missing watchtower dist output at ${watchtowerDist}. Build watchtower first.`);
  }
  copyDir(watchtowerDistServer, path.join(outRoot, "watchtower", "dist-server"));
  copyDir(watchtowerDist, path.join(outRoot, "watchtower", "dist"));

  // Note: watchtower/dist-server/server.js serves static files from ../dist,
  // so keeping dist-server and dist siblings is required.
}

main();
