import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Quick smoke: starts daemon, hits /health, then shuts down.
// This is intended for local validation.

function httpGet(port: number, p: string) {
  return new Promise<string>((resolve, reject) => {
    const http = require("node:http") as typeof import("node:http");
    const req = http.request({ host: "127.0.0.1", port, path: p, method: "GET" }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entry = path.resolve(here, "./index.js");

  const child = spawn(process.execPath, [entry, "--timeout", "1000"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let port: number | null = null;
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (d) => {
    const m = String(d).match(/port (\d+)/);
    if (m) port = Number(m[1]);
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && port == null) {
    await new Promise((r) => setTimeout(r, 50));
  }

  if (port == null) throw new Error("daemon didn't print a port");

  await httpGet(port, "/health");
  child.kill("SIGTERM");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
