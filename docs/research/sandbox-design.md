# Apohara Guard — 3-layer kernel sandbox (Phase 3: 5-layer)

Status: Linux-only (Sprint 1). macOS/Windows: Phase 3.

## Threat model

ML inference workers (YOLOv8/ViT) classify untrusted user-supplied content
(suspected CSAM). The worker process must NOT be able to:
- Read arbitrary host files (`/etc/shadow`, `/home/*/.ssh/`, neighbor scans)
- Write outside its sandboxed output directory
- Open network sockets (no exfiltration of hashes, embeddings, or reports)
- Exceed configured memory + CPU budgets (DoS resistance)
- Survive parent crash (no orphan inference workers)

## Active layers (3 of 5 — this commit)

| # | Layer | Mechanism | Linux primitive | Status |
|---|---|---|---|---|
| 1 | Mount namespace | New mount-ns, tmpfs root, whitelist bind mounts | `bwrap --unshare-all --tmpfs /` | **ACTIVE** |
| 2 | User namespace | Drop host UID, map to in-ns root with no capabilities | `bwrap --unshare-all` | **ACTIVE** |
| 3 | RLIMIT_AS + RLIMIT_CPU | Hard memory + CPU budget | `prlimit --as=N --cpu=M` | **ACTIVE** |
| 4 | Landlock LSM | Per-process filesystem ACL (read/write/exec rules) | `landlock_create_ruleset(2)` (kernel >= 5.13, ABI v3 since 6.7) | **PHASE 3** |
| 5 | seccomp-bpf | Syscall allow-list (block `socket`, `mount`, `ptrace`, etc.) | `seccomp(SECCOMP_SET_MODE_FILTER)` via `bwrap --seccomp <fd>` | **PHASE 3** |

## Implementation paths

Our `spawnSandboxed()` delivers 3 active layers via two paths:

- **bwrap path (preferred)**: `bubblewrap` provides mount-ns + user-ns (layers 1–2)
  via `--unshare-all`. RLIMIT_AS/RLIMIT_CPU (layer 3) is layered via `prlimit`
  wrapper inside the bwrap command. Landlock and seccomp are NOT yet wired —
  `ML_INFERENCE_SYSCALLS` is defined and reserved for Phase 3 (`bwrap --seccomp
  <fd>` requires a pre-built libseccomp bpf blob; Landlock requires a C/Rust shim).
- **unshare path (fallback)**: raw `util-linux unshare` for layers 1–2 only.
  No Landlock, no seccomp, no prlimit (unless available). Logged as a degraded mode.

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

### Landlock LSM + seccomp-bpf (Linux — closes layers 4 & 5)

**Landlock (layer 4)**: Currently approximated via bwrap's bind-mount whitelist.
For defense-in-depth (bypass resistance), add a `landlock-shim` binary (Rust/C):
1. `landlock_create_ruleset(ABI_V3)`
2. `landlock_add_rule` for each `allowed_read_paths` / `allowed_write_paths`
3. `landlock_restrict_self(0)`
4. `execve(cmd, argv, envp)`

Then `spawnSandboxed()` invokes that shim instead of the raw cmd.

**seccomp-bpf (layer 5)**: `ML_INFERENCE_SYSCALLS` (defined in `src/sandbox/index.ts`)
is the target allow-list. Wiring it requires:
1. A helper (Go or Python with `libseccomp` bindings) that compiles the allow-list
   to a BPF blob and writes it to a named pipe or temp file.
2. Pass the fd to bwrap via `--seccomp <fd>`.
3. Wire into `spawnWithBwrap()` in `src/sandbox/index.ts`.

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

## Attribution

Pattern ported from **RAPTOR** (`gadievron/raptor`), MIT-licensed. See
`THIRD_PARTY_NOTICES.md` for the upstream license text.
