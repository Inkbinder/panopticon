# Native helper (Windows)

This folder contains a tiny Windows-only helper used by `@inkbinder/panopticon-daemon` to guarantee:

- If the daemon process terminates (crash, kill, logoff), all managed child processes are terminated.

It achieves this by creating a Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and assigning managed processes to it.

## Build

The daemon expects a prebuilt helper at runtime at:

- `native/bin/<platform>-<arch>/spawn_job_win32.exe`

Example:

- `native/bin/win32-x64/spawn_job_win32.exe`

During development you can build it locally on Windows:

- `npm -w panopticon-daemon run build:native`

Publishing from Windows runs `prepublishOnly`, which enforces that the prebuilt exists.
