/**
 * Tests for src/sandbox — 3-layer kernel sandbox (5-layer target in Phase 3).
 *
 * Run via:  bun test tests/sandbox.test.ts
 *
 * Some tests are Linux-only and skip on macOS/Windows.
 */
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { describe, expect, test } from 'bun:test';
import { type SandboxPolicy, spawnSandboxed } from '../src/sandbox/index';

const IS_LINUX = platform() === 'linux';
const HAS_BWRAP = existsSync('/usr/bin/bwrap') || existsSync('/usr/local/bin/bwrap');
const HAS_CURL = existsSync('/usr/bin/curl') || existsSync('/bin/curl');

const BASE_POLICY: SandboxPolicy = {
  allowed_read_paths: ['/usr', '/lib', '/lib64', '/bin', '/etc/ld.so.cache'],
  allowed_write_paths: [],
  allow_network: false,
  allow_unsupported_platform_fallback: true,
};

describe('spawnSandboxed', () => {
  test('runs a simple echo command and captures stdout', async () => {
    const result = await spawnSandboxed(['/bin/echo', 'hello sandbox'], BASE_POLICY);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello sandbox');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test.if(IS_LINUX && HAS_BWRAP)(
    'cannot read /etc/shadow when not in allowed_read_paths',
    async () => {
      // /etc is not bound by BASE_POLICY (only /etc/ld.so.cache is), so
      // /etc/shadow should not be visible.
      const result = await spawnSandboxed(
        ['/bin/sh', '-c', 'cat /etc/shadow 2>&1 || echo BLOCKED'],
        BASE_POLICY,
      );
      // Either the file is inaccessible (BLOCKED) or cat reports an error.
      const combined = result.stdout + result.stderr;
      expect(
        combined.includes('BLOCKED') ||
          combined.includes('No such file') ||
          combined.includes('Permission denied'),
      ).toBe(true);
    },
  );

  test.if(IS_LINUX && HAS_BWRAP)(
    'cannot write to /tmp/notallowed when not in allowed_write_paths',
    async () => {
      const result = await spawnSandboxed(
        [
          '/bin/sh',
          '-c',
          'touch /tmp/notallowed_sbx_test 2>&1 && echo WROTE || echo BLOCKED',
        ],
        BASE_POLICY,
      );
      const combined = result.stdout + result.stderr;
      // /tmp is a tmpfs root in bwrap mode; touch may "succeed" inside the
      // ephemeral tmpfs but the write does NOT escape to the host. Verify
      // the host-side /tmp/notallowed_sbx_test was NOT created.
      const hostExists = existsSync('/tmp/notallowed_sbx_test');
      expect(hostExists).toBe(false);
      expect(combined.length).toBeGreaterThan(0);
    },
  );

  test.if(IS_LINUX && HAS_BWRAP && HAS_CURL)(
    'with allow_network=false blocks curl to external host',
    async () => {
      const policy: SandboxPolicy = { ...BASE_POLICY, allow_network: false };
      const result = await spawnSandboxed(
        [
          '/bin/sh',
          '-c',
          'curl --max-time 3 -s -o /dev/null -w "%{http_code}" https://example.com 2>&1 || echo NETBLOCKED',
        ],
        policy,
      );
      const combined = result.stdout + result.stderr;
      // Either curl reports failure (000 / connection error) or our marker fires.
      expect(
        combined.includes('NETBLOCKED') ||
          combined.includes('000') ||
          combined.includes('Could not resolve') ||
          combined.includes('Network is unreachable'),
      ).toBe(true);
    },
  );

  test.if(!IS_LINUX)(
    'on non-Linux without fallback flag throws',
    async () => {
      const policy: SandboxPolicy = {
        allowed_read_paths: [],
        allowed_write_paths: [],
        allow_network: false,
        // No fallback flag → must throw on non-Linux
      };
      await expect(spawnSandboxed(['/bin/echo', 'x'], policy)).rejects.toThrow(
        /only supported on Linux/,
      );
    },
  );

  test.if(!IS_LINUX)(
    'on non-Linux with fallback flag warns and runs plain spawn',
    async () => {
      const policy: SandboxPolicy = {
        allowed_read_paths: [],
        allowed_write_paths: [],
        allow_network: false,
        allow_unsupported_platform_fallback: true,
      };
      const result = await spawnSandboxed(['/bin/echo', 'plain'], policy);
      expect(result.exitCode).toBe(0);
      expect(result.sandboxApplied).toBe(false);
      expect(result.stdout).toContain('plain');
    },
  );

  test('rejects empty cmd array', async () => {
    await expect(spawnSandboxed([], BASE_POLICY)).rejects.toThrow(
      /at least one element/,
    );
  });

  test.if(IS_LINUX)('reports sandboxApplied=true on Linux', async () => {
    const result = await spawnSandboxed(['/bin/echo', 'sb'], BASE_POLICY);
    expect(result.sandboxApplied).toBe(true);
  });
});
