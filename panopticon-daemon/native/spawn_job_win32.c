// Minimal Windows helper: create a Job Object with KILL_ON_JOB_CLOSE,
// spawn a child process suspended, assign it to the job, then resume.
//
// Usage:
//   spawn_job_win32.exe --cwd <dir> -- <command> [args...]
// Writes the spawned PID to stdout.
//
// This is intentionally tiny and purpose-built for panopticon-daemon.

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void die(const char* msg) {
  DWORD err = GetLastError();
  fprintf(stderr, "%s (err=%lu)\n", msg, (unsigned long)err);
  ExitProcess(1);
}

static char* join_cmdline(int argc, char** argv, int start) {
  // naive quoting: wrap args with spaces in double quotes and escape internal quotes
  size_t cap = 1024;
  char* buf = (char*)malloc(cap);
  if (!buf) return NULL;
  buf[0] = '\0';

  for (int i = start; i < argc; i++) {
    const char* a = argv[i];
    int needQuote = (strpbrk(a, " \t\n\v\"") != NULL);
    // estimate
    size_t add = strlen(a) + 4;
    if (strlen(buf) + add + 2 > cap) {
      cap = (cap + add + 1024) * 2;
      char* nb = (char*)realloc(buf, cap);
      if (!nb) { free(buf); return NULL; }
      buf = nb;
    }

    if (i > start) strcat(buf, " ");
    if (!needQuote) {
      strcat(buf, a);
    } else {
      strcat(buf, "\"");
      for (const char* p = a; *p; p++) {
        if (*p == '\"') strcat(buf, "\\\"");
        else {
          size_t len = strlen(buf);
          buf[len] = *p;
          buf[len+1] = '\0';
        }
      }
      strcat(buf, "\"");
    }
  }

  return buf;
}

int main(int argc, char** argv) {
  const char* cwd = NULL;
  int i = 1;

  while (i < argc) {
    if (strcmp(argv[i], "--cwd") == 0) {
      if (i + 1 >= argc) {
        fprintf(stderr, "Missing --cwd value\n");
        return 2;
      }
      cwd = argv[i + 1];
      i += 2;
      continue;
    }
    if (strcmp(argv[i], "--") == 0) {
      i++;
      break;
    }
    // Unknown flag
    fprintf(stderr, "Unknown arg: %s\n", argv[i]);
    return 2;
  }

  if (i >= argc) {
    fprintf(stderr, "No command provided\n");
    return 2;
  }

  HANDLE job = CreateJobObjectA(NULL, NULL);
  if (!job) die("CreateJobObject failed");

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION info;
  ZeroMemory(&info, sizeof(info));
  info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info, sizeof(info))) {
    die("SetInformationJobObject failed");
  }

  // Build command line
  char* cmdline = join_cmdline(argc, argv, i);
  if (!cmdline) {
    fprintf(stderr, "Failed to allocate command line\n");
    return 1;
  }

  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));

  DWORD flags = CREATE_SUSPENDED | CREATE_NEW_PROCESS_GROUP;

  BOOL ok = CreateProcessA(
    NULL,
    cmdline,
    NULL,
    NULL,
    TRUE,
    flags,
    NULL,
    cwd,
    &si,
    &pi
  );

  if (!ok) {
    free(cmdline);
    die("CreateProcess failed");
  }

  if (!AssignProcessToJobObject(job, pi.hProcess)) {
    // If assignment fails, kill process so we don't leak
    TerminateProcess(pi.hProcess, 1);
    free(cmdline);
    die("AssignProcessToJobObject failed");
  }

  ResumeThread(pi.hThread);

  // Print PID for caller
  printf("%lu\n", (unsigned long)pi.dwProcessId);
  fflush(stdout);

  // The helper must stay alive and hold the job handle open.
  // We wait for the child to exit; when helper exits, job closes and kills any remaining processes.
  WaitForSingleObject(pi.hProcess, INFINITE);

  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  CloseHandle(job);
  free(cmdline);

  return 0;
}

#else
int main() { return 0; }
#endif
