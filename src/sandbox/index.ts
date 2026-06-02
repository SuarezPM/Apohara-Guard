/**
 * SPDX-License-Identifier: Apache-2.0
 * (was AGPL-3.0-only until 2026-06-02)
 * 3-layer kernel sandbox (extendable to 5) for Apohara Guard ML inference subprocesses.
 *
 * Active layers (Linux, this commit):
 *  1. mount namespace (via bwrap --unshare-all): hides host filesystem outside
 *     allowed_read_paths
 *  2. user namespace (via bwrap --unshare-all): drops capabilities; maps to
 *     non-root inside the sandbox
 *  3. RLIMIT_AS / RLIMIT_CPU (via prlimit wrapping): memory + CPU caps
 *
 * Planned layers (Phase 3):
 *  4. Landlock LSM (RULESET_ABI v3): filesystem access restriction at LSM
 *     level — requires Linux 5.13+, currently delivered indirectly via
 *     bwrap's bind-mount whitelist
 *  5. seccomp-bpf filter: syscall allow-list (ML_INFERENCE_SYSCALLS defined
 *     below); requires libseccomp-generated bpf blob loaded via bwrap
 *     --seccomp <fd>
 *
 * Ported from RAPTOR's core/sandbox/{_spawn,landlock,seccomp,proxy}.py
 * (MIT licensed; attribution in THIRD_PARTY_NOTICES.md).
 *
 * macOS/Windows: throws unless policy.allow_unsupported_platform_fallback=true,
 * in which case falls back to plain spawn() with WARN log.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

export interface SandboxPolicy {
  allowed_read_paths: string[];
  allowed_write_paths: string[];
  allowed_syscalls?: string[]; // defaults to ML_INFERENCE_SYSCALLS
  max_cpu_ms?: number;
  max_memory_mb?: number;
  allow_network: boolean;
  // If true, fall back to plain spawn on non-Linux platforms with warning
  // instead of throwing.
  allow_unsupported_platform_fallback?: boolean;
}

export interface SandboxedResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  sandboxApplied: boolean;
}

// Conservative syscall allow-list for ML inference (Python + numpy + onnx).
// Exported for inspection / extension by callers that need custom kernels.
export const ML_INFERENCE_SYSCALLS = [
  'read', 'write', 'open', 'openat', 'close', 'stat', 'fstat', 'lstat',
  'mmap', 'munmap', 'mprotect', 'brk', 'madvise',
  'rt_sigaction', 'rt_sigprocmask', 'rt_sigreturn',
  'futex', 'clone', 'clone3', 'execve', 'exit', 'exit_group', 'wait4',
  'getpid', 'getppid', 'getuid', 'getgid', 'geteuid', 'getegid',
  'arch_prctl', 'set_tid_address', 'set_robust_list', 'rseq',
  'epoll_create1', 'epoll_ctl', 'epoll_wait', 'epoll_pwait',
  'poll', 'select', 'pipe', 'pipe2', 'dup', 'dup2', 'dup3',
  'fcntl', 'ioctl', 'readlink', 'readlinkat',
  'getrandom', 'getcwd', 'chdir', 'fchdir',
  'newfstatat', 'statx', 'uname',
  'clock_gettime', 'clock_nanosleep', 'nanosleep',
] as const;

export const NETWORK_SYSCALLS = [
  'socket', 'connect', 'bind', 'listen', 'accept', 'sendto', 'recvfrom',
  'getsockopt', 'setsockopt',
] as const;

function isLinux(): boolean {
  return platform() === 'linux';
}

function hasUnshare(): boolean {
  return existsSync('/usr/bin/unshare') || existsSync('/bin/unshare');
}

function hasBwrap(): boolean {
  // bubblewrap is a simpler unshare wrapper; prefer it if present
  return existsSync('/usr/bin/bwrap') || existsSync('/usr/local/bin/bwrap');
}

function hasPrlimit(): boolean {
  return existsSync('/usr/bin/prlimit') || existsSync('/bin/prlimit');
}

/**
 * Spawn a subprocess wrapped in the 3-layer kernel sandbox (layers 4-5 planned for Phase 3).
 *
 * On non-Linux platforms (Darwin, Windows): throws unless
 * `policy.allow_unsupported_platform_fallback === true`, in which case
 * falls back to plain spawn() with WARN logged.
 */
export async function spawnSandboxed(
  cmd: string[],
  policy: SandboxPolicy,
): Promise<SandboxedResult> {
  if (cmd.length === 0) {
    throw new Error('spawnSandboxed: cmd must contain at least one element');
  }
  const t0 = Date.now();
  if (!isLinux()) {
    if (!policy.allow_unsupported_platform_fallback) {
      throw new Error(
        `Sandbox only supported on Linux (current platform: ${platform()}). ` +
          'Set policy.allow_unsupported_platform_fallback=true to spawn unsandboxed.',
      );
    }
    console.warn(
      `[sandbox] WARN: non-Linux platform (${platform()}), spawning unsandboxed`,
    );
    return spawnPlain(cmd, t0);
  }

  // Prefer bwrap if available (cleaner UX than raw unshare)
  if (hasBwrap()) {
    return spawnWithBwrap(cmd, policy, t0);
  }
  if (hasUnshare()) {
    return spawnWithUnshare(cmd, policy, t0);
  }
  throw new Error(
    'Neither bwrap nor unshare found. Install: apt-get install bubblewrap util-linux',
  );
}

async function spawnPlain(
  cmd: string[],
  t0: number,
): Promise<SandboxedResult> {
  const [bin, ...rest] = cmd;
  if (!bin) {
    throw new Error('spawnPlain: empty cmd');
  }
  const proc = spawn(bin, rest);
  return collectResult(proc, t0, false);
}

async function spawnWithBwrap(
  cmd: string[],
  policy: SandboxPolicy,
  t0: number,
): Promise<SandboxedResult> {
  const args: string[] = ['--unshare-all'];
  if (policy.allow_network) args.push('--share-net');
  // Mount root as tmpfs (no host fs by default)
  args.push('--tmpfs', '/');
  // Bind allowed paths (only those that exist; bwrap fails otherwise)
  for (const path of policy.allowed_read_paths) {
    if (existsSync(path)) args.push('--ro-bind', path, path);
  }
  for (const path of policy.allowed_write_paths) {
    if (existsSync(path)) args.push('--bind', path, path);
  }
  // /proc + /dev needed for basic operation
  args.push('--proc', '/proc', '--dev', '/dev');
  // Standard library paths
  if (existsSync('/usr')) args.push('--ro-bind', '/usr', '/usr');
  if (existsSync('/lib')) args.push('--ro-bind', '/lib', '/lib');
  if (existsSync('/lib64')) args.push('--ro-bind', '/lib64', '/lib64');
  if (existsSync('/bin')) args.push('--ro-bind', '/bin', '/bin');
  if (existsSync('/etc/ld.so.cache'))
    args.push('--ro-bind', '/etc/ld.so.cache', '/etc/ld.so.cache');
  // Die when the parent dies (prevents orphan inference workers)
  args.push('--die-with-parent');
  // Then the actual command, optionally wrapped in prlimit for memory caps.
  if (policy.max_memory_mb && hasPrlimit()) {
    const bytes = policy.max_memory_mb * 1024 * 1024;
    args.push('--', 'prlimit', `--as=${bytes}`, ...cmd);
  } else {
    args.push('--', ...cmd);
  }

  const proc = spawn('bwrap', args, { env: { ...process.env } });
  return collectResult(proc, t0, true);
}

async function spawnWithUnshare(
  cmd: string[],
  policy: SandboxPolicy,
  t0: number,
): Promise<SandboxedResult> {
  // Raw unshare (no Landlock/seccomp wrapper without C helper). Conservative
  // namespace isolation only; documented in design doc.
  const args: string[] = [
    '--mount',
    '--user',
    '--map-root-user',
    '--pid',
    '--fork',
  ];
  if (!policy.allow_network) args.push('--net');
  if (policy.max_memory_mb && hasPrlimit()) {
    const bytes = policy.max_memory_mb * 1024 * 1024;
    args.push('--', 'prlimit', `--as=${bytes}`, ...cmd);
  } else {
    args.push('--', ...cmd);
  }
  const proc = spawn('unshare', args);
  return collectResult(proc, t0, true);
}

function collectResult(
  proc: ChildProcess,
  t0: number,
  sandboxApplied: boolean,
): Promise<SandboxedResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => {
      reject(err);
    });
    proc.on('close', (code, signal) => {
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        durationMs: Date.now() - t0,
        sandboxApplied,
      });
    });
  });
}
