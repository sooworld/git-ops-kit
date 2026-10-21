// Agent guard checks: command cases, several protected branches, the hook input of each agent tool,
// and fail-closed behavior when gitops.config.json is missing or broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../scripts/gitops/config.mjs';
import { blocked, blockedMcpTool, decide } from '../../scripts/gitops/guard-tools.mjs';
import { ALLOW, BLOCK } from './guard-cases.mjs';
import { root, tempDir } from './helpers.mjs';

const mainOnly = { protectedBranches: ['main'] };
const runGuard = (input, script = join(root, 'scripts/gitops/guard-tools.mjs')) =>
  spawnSync(process.execPath, [script], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });

test('guard: merges, protected pushes and hook bypasses are blocked', () => {
  for (const c of BLOCK) assert.ok(blocked(c, mainOnly), c);
});

test('guard: reads and ordinary work are allowed', () => {
  for (const c of ALLOW) assert.equal(blocked(c, mainOnly), false, c);
});

test('guard: every configured protected branch is blocked, names are escaped and compared lowercased', () => {
  const config = { protectedBranches: ['main', 'release/1.0', 'Develop'] };
  for (const c of ['git push origin HEAD:release/1.0', 'git push origin --delete release/1.0', 'git push origin develop', 'git push origin HEAD:refs/heads/DEVELOP'])
    assert.ok(blocked(c, config), c);
  for (const c of ['git push origin HEAD:release/1x0', 'git push origin release/1.0-notes', 'git push origin feature/develop'])
    assert.equal(blocked(c, config), false, c);
});

test('guard: hook input shapes of each agent tool', () => {
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 1' } }, mainOnly), true); // Claude Code, Codex
  assert.equal(decide({ tool_input: { command: ['bash', '-lc', 'git push origin main'] } }, mainOnly), true); // argv array
  assert.equal(decide({ command: 'git push origin main', cursor_version: '1.0' }, mainOnly), true); // Cursor
  assert.equal(decide({ tool_name: 'run_shell_command', tool_input: { command: 'git status' } }, mainOnly), false); // Gemini
  assert.throws(() => decide({ tool_name: 'Bash', tool_input: {} }, mainOnly));
});

test('guard: MCP merge tools are blocked by tool name, other MCP tools are allowed', () => {
  for (const name of ['mcp__github__merge_pull_request', 'mcp__gh__pr_merge', 'mcp__github__mergePullRequest']) assert.ok(blockedMcpTool(name), name);
  for (const name of ['mcp__github__get_pull_request', 'mcp__github__create_pull_request', 'mcp__prometheus__merge_series']) assert.equal(blockedMcpTool(name), false, name);
});

test('guard CLI: exit 2 to block, 0 to allow, Cursor always gets JSON', () => {
  const branch = loadConfig().protectedBranches[0];
  assert.equal(runGuard({ tool_input: { command: 'gh pr merge 2' } }).status, 2);
  const allowed = runGuard({ tool_input: { command: 'git status' } });
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
  assert.equal(runGuard({ tool_input: { command: ['git', 'push', 'origin', `HEAD:${branch}`] } }).status, 2);
  assert.equal(runGuard({ tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 1 } }).status, 2);
  assert.equal(runGuard({ tool_name: 'mcp__github__get_pull_request', tool_input: { pullNumber: 1 } }).status, 0);

  const cursorDeny = runGuard({ command: `git push origin ${branch}`, cwd: '.', cursor_version: '1.0' });
  assert.equal(cursorDeny.status, 2);
  assert.equal(JSON.parse(cursorDeny.stdout).permission, 'deny');
  const cursorAllow = runGuard({ command: 'git status', cwd: '.', cursor_version: '1.0' });
  assert.equal(cursorAllow.status, 0);
  assert.deepEqual(JSON.parse(cursorAllow.stdout), { permission: 'allow' });
});

test('guard CLI: broken input, missing command, missing or broken config all block', () => {
  assert.equal(runGuard('broken-json').status, 2);
  assert.equal(runGuard({ tool_name: 'Bash', tool_input: {} }).status, 2);
  const temp = tempDir('guard');
  try {
    cpSync(join(root, 'scripts/gitops'), join(temp, 'scripts/gitops'), { recursive: true });
    const script = join(temp, 'scripts/gitops/guard-tools.mjs');
    const missing = runGuard({ tool_input: { command: 'git status' } }, script);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /gitops\.config\.json/);
    writeFileSync(join(temp, 'gitops.config.json'), '{');
    assert.equal(runGuard({ tool_input: { command: 'git status' } }, script).status, 2);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
