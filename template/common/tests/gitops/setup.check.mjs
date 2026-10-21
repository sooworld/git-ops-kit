// setup checks in temporary repositories that contain a copy of this repository's kit files:
// clean setup, refusing to override other hook setups, hook managers, warnings, broken config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitIn, isolatedEnv, root, tempDir } from './helpers.mjs';

// Creates a repository with the kit files and returns helpers bound to it.
function fixture(t) {
  const temp = tempDir('setup');
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, 'repo'), globalFile = join(temp, 'global.gitconfig');
  const env = isolatedEnv(globalFile);
  gitIn(temp, env)('init', '-b', 'task/setup', repo);
  for (const path of ['scripts/gitops', '.githooks', 'gitops.config.json', '.gitmessage']) cpSync(join(root, path), join(repo, path), { recursive: true });
  const setup = (...args) => spawnSync(process.execPath, [join(repo, 'scripts/gitops/setup.mjs'), ...args], { cwd: repo, encoding: 'utf8', env });
  const localHooksPath = () => spawnSync('git', ['-C', repo, 'config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8', env }).stdout.trim();
  return { repo, globalFile, env, setup, localHooksPath, git: gitIn(repo, env) };
}

test('setup: a clean clone is connected and passes the check', t => {
  const f = fixture(t);
  const result = f.setup();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.localHooksPath(), '.githooks');
  assert.match(result.stderr, /100755/); // hooks not committed yet: exec bit warning
  assert.equal(f.setup('--check').status, 0);
});

test('setup: a global core.hooksPath is not overridden', t => {
  const f = fixture(t);
  writeFileSync(f.globalFile, '[core]\n\thooksPath = company-hooks\n');
  const result = f.setup();
  assert.equal(result.status, 1);
  assert.equal(f.localHooksPath(), '');
  assert.match(result.stderr, /company-hooks/);
});

test('setup: existing non-sample hooks in .git/hooks are not disabled', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 0\n');
  const result = f.setup();
  assert.equal(result.status, 1);
  assert.equal(f.localHooksPath(), '');
  assert.match(result.stderr, /pre-commit/);
});

test('setup: a hook manager folder passes only when it calls both scripts', t => {
  const f = fixture(t);
  mkdirSync(join(f.repo, '.husky'));
  writeFileSync(join(f.repo, '.husky/commit-msg'), 'node scripts/gitops/commit-msg.mjs "$1"\n');
  writeFileSync(join(f.repo, '.husky/pre-push'), 'npm test\n');
  f.git('config', 'core.hooksPath', '.husky');
  f.git('config', 'commit.template', '.gitmessage');
  assert.equal(f.setup('--check').status, 1);
  writeFileSync(join(f.repo, '.husky/pre-push'), 'node scripts/gitops/pre-push.mjs "$@"\n');
  assert.equal(f.setup('--check').status, 0);
  assert.equal(f.setup().status, 0);
  assert.equal(f.localHooksPath(), '.husky');
});

test('setup: unfilled markers and fields missing from .gitmessage are warnings, not failures', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'NOTES.md'), `- ${'TODO'}(gitops): fill in\n`);
  writeFileSync(join(f.repo, '.gitmessage'), '# <type>: <summary>\n');
  const result = f.setup();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /NOTES\.md:1/);
  assert.match(result.stderr, /\.gitmessage/);
});

test('setup: a broken config fails the check', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'gitops.config.json'), '{');
  assert.equal(f.setup('--check').status, 1);
});
