import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		exclude: ["dist/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			exclude: [
				"**/dist/**",
				"**/__tests__/**",
				"**/*.d.ts",
				"**/*.config.*",
				"**/vitest.config.*",
				"**/src/index.ts",
				"**/src/commands/start-stop.ts",
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 60,
				statements: 78,
			},
		},
	},
});
