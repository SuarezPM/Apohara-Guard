# Apohara Guard — 5-layer kernel sandbox

Status: Linux-only (Sprint 1). macOS/Windows: Phase 3.

## Threat model

ML inference workers (YOLOv8/ViT) classify untrusted user-supplied content
(suspected CSAM). The worker process must NOT be able to:
- Read arbitrary host files (`/etc/shadow`, `/home/*/.ssh/`, neighbor scans)
- Write outside its sandboxed output directory
- Open network sockets (no exfiltration of hashes, embeddings, or reports)
- Exceed configured memory + CPU budgets (DoS resistance)
- Survive parent crash (no orphan inference workers)

## The five layers

| # | Layer | Mechanism | Linux primitive |
|---|---|---|---|
| 1 | Mount namespace | New mount-ns, tmpfs root, whitelist bind mounts | `unshare --mount` / `bwrap --unshare-all --tmpfs /` |
| 2 | User namespace | Drop host UID, map to in-ns root with no capabilities | `unshare --user --map-root-user` |
| 3 | Landlock LSM | Per-process filesystem ACL (read/write/exec rules) | `landlock_create_ruleset(2)` (kernel >= 5.13, ABI v3 since 6.7) |
| 4 | seccomp-bpf | Syscall allow-list (block `socket`, `mount`, `ptrace`, etc.) | `seccomp(SECCOMP_SET_MODE_FILTER)` |
| 5 | RLIMIT_AS + RLIMIT_CPU | Hard memory + CPU budget | `prlimit --as=N --cpu=M` |

Our `spawnSandboxed()` implementation delivers all five via two paths:

- **bwrap path (preferred)**: `bubblewrap` ships layers 1–2 + parts of 4
  (its `--seccomp FD` plus default DENY of dangerous syscalls). RLIMIT_AS
  is layered via `prlimit` wrapper. Landlock is delivered indirectly via
  bwrap's bind-mount whitelist; direct Landlock rule application requires
  a small C/Rust helper (tracked below).
- **unshare path (fallback)**: raw `util-linux unshare` for layers 1–2
  only. No Landlock, no seccomp. Logged as a degraded mode.

## Why Linux only this sprint

- **bwrap + unshare are Linux kernel features.** Both rely on Linux
  namespaces and the LSM stack that simply do not exist on Darwin or
  Windows.
- Solo-founder sprint discipline. Cross-platform sandboxing is 3–4×
  the LOC. Real CSAM moderation production deployments run on Linux
  servers; macOS/Windows is dev-loop only.
- Dev-loop friendliness preserved via
  `allow_unsupported_platform_fallback: true`, which logs a WARN and
  falls back to plain `spawn()`.

## Phase 3 extensions

### macOS (Darwin) — Apple Seatbelt / `sandbox-exec`
- Use `sandbox-exec -f profile.sb cmd args...`
- Write a Scheme-style profile equivalent to the bwrap policy
  (deny file-read/write, deny network)
- Reference: Apple's deprecated-but-still-shipping App Sandbox SPI

### Windows — Job Objects + AppContainer
- Wrap process in a Job Object with `JOB_OBJECT_LIMIT_PROCESS_MEMORY`
  and `JOB_OBJECT_LIMIT_PROCESS_TIME`
- Use AppContainer SID for filesystem restriction
- Block network via Windows Filtering Platform (WFP) callout driver,
  or simpler: pre-revoke `internetClient` capability on the AppContainer

### Direct Landlock (both platforms — Phase 3)
Currently Landlock is approximated via bwrap's bind-mount whitelist.
For defense-in-depth (a malicious bwrap config bug bypass), we should
add a tiny `landlock-shim` binary (Rust / C) that:
1. `landlock_create_ruleset(ABI_V3)`
2. `landlock_add_rule` for each `allowed_read_paths` / `allowed_write_paths`
3. `landlock_restrict_self(0)`
4. `execve(cmd, argv, envp)`

Then `spawnSandboxed()` would invoke that shim instead of the raw cmd.

## Attribution

Pattern ported from **RAPTOR** (`gadievron/raptor`), MIT-licensed. See
`THIRD_PARTY_NOTICES.md` for the upstream license text.
