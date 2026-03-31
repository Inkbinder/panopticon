#!/usr/bin/env node

import { Command } from "commander";
import { registerDoctor } from "./commands/doctor.js";

const program = new Command();

program
  .name("panopticon")
  .description("Panopticon CLI")
  // Keep version simple for now; we can wire real package.json version later if needed.
  .version("0.1.0");

registerDoctor(program);

// Parse argv at module top-level so `import "@inkbinder/panopticon-cli"` executes the CLI.
program.parseAsync(process.argv).catch((err) => {
  // Commander typically prints its own errors; this is for unexpected failures.
  console.error(err);
  process.exitCode = 1;
});
