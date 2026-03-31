import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/build-native.ts", "src/verify-prebuilt.ts", "src/smoke.ts", "src/bundle-runtime.ts"],
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  dts: true,
});
