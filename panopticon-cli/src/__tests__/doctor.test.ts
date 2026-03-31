import { describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("doctor", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports windows as unsupported", async () => {
    const { runDoctorChecks } = await import("../commands/doctor");
    const results = runDoctorChecks({ platform: "win32" });
    expect(results.find((r) => r.id === "platform")?.ok).toBe(false);
  });

  it("fails when panopticon.yaml is missing", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panopticon-doctor-"));
    const prev = process.cwd();
    process.chdir(tmp);
    try {
      const { runDoctorChecks } = await import("../commands/doctor");
      const results = runDoctorChecks({ platform: "linux" });
      expect(results.find((r) => r.id === "config")?.ok).toBe(false);
    } finally {
      process.chdir(prev);
    }
  });

  it("passes when panopticon.yaml exists and parses", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "panopticon-doctor-"));
    fs.writeFileSync(
      path.join(tmp, "panopticon.yaml"),
      "sentinel:\n  port: 8787\nwatchtower:\n  port: 5173\noverseer:\n  logLevel: info\n",
      "utf8",
    );
    const prev = process.cwd();
    process.chdir(tmp);
    try {
      const { runDoctorChecks } = await import("../commands/doctor");
      const results = runDoctorChecks({ platform: "linux" });
      expect(results.find((r) => r.id === "config")?.ok).toBe(true);
    } finally {
      process.chdir(prev);
    }
  });
});
