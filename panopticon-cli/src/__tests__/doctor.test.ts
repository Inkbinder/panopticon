import { describe, expect, it, beforeEach, vi } from "vitest";

describe("doctor", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports windows as unsupported", async () => {
    const { runDoctorChecks } = await import("../commands/doctor");
    const results = runDoctorChecks({ platform: "win32" });
    expect(results.find((r) => r.id === "platform")?.ok).toBe(false);
  });
});
