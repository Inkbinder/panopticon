import { describe, expect, it, vi, beforeEach } from "vitest";

let existsSyncMock: ReturnType<typeof vi.fn>;

let requireResolveMock: ReturnType<typeof vi.fn>;

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
  existsSync: (...args: any[]) => (existsSyncMock as any)(...args),
  };
});

vi.mock("node:module", async () => {
  const actual = await vi.importActual<typeof import("node:module")>("node:module");
  return {
    ...actual,
    createRequire: () => ({ resolve: (...args: any[]) => (requireResolveMock as any)(...args) }),
  };
});

describe("doctor", () => {
  beforeEach(() => {
    vi.resetModules();
  existsSyncMock = vi.fn();
    requireResolveMock = vi.fn();
  });

  it("reports windows helper + compiler status", async () => {
    const { runDoctorChecks } = await import("../commands/doctor");

    // helper missing
  existsSyncMock.mockReturnValue(false);
    requireResolveMock.mockReturnValue("C:/global/node_modules/@inkbinder/panopticon-daemon/package.json");

    const results = runDoctorChecks({ platform: "win32" });

  expect(results.find((r) => r.id === "win32-job-helper")?.ok).toBe(false);
  expect(results.some((r) => r.id === "win32-compiler")).toBe(false);
  });
});
