// Hook checks with real Git: this repository's .githooks reject a bad commit message and any push that creates,
// updates or deletes a protected branch, including a push run from a script and from a linked worktree.
// Pushes go only to a bare remote created in a temporary folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../../scripts/gitops/config.mjs';
import { protectedTargets } from '../../scripts/gitops/pre-push.mjs';
import { gitIn, isolatedEnv, root, shell, tempDir, validMessage } from './helpers.mjs';

test('pre-push: only exact protected refs are reported', () => {
  const config = { protectedBranches: ['main', 'release/1.0'] };
  const line = ref => `refs/heads/x 1111 ${ref} 0000`;
  assert.deepEqual(protectedTargets([line('refs/heads/main'), line('refs/heads/task/main')].join('\n'), config), ['main']);
  assert.deepEqual(protectedTargets(`(delete) 0000 refs/heads/release/1.0 1111\n`, config), ['release/1.0']);
  assert.deepEqual(protectedTargets([line('refs/heads/Main'), line('refs/tags/main'), ''].join('\n'), config), []);
});

test('hooks: bad commit messages and protected-branch pushes are rejected in real Git', () => {
  const config = loadConfig();
  const branch = config.protectedBranches[0];
  const temp = tempDir('hooks');
  try {
    const env = isolatedEnv(join(temp, 'global.gitconfig'));
    const remote = join(temp, 'remote.git'), local = join(temp, 'local'), linked = join(temp, 'linked');
    gitIn(temp, env)('init', '--bare', remote);
    gitIn(temp, env)('init', '-b', 'task/example', local);
    const git = gitIn(local, env);
    git('commit', '--allow-empty', '-m', 'test: fixture before hooks');
    git('remote', 'add', 'origin', remote);
    git('push', 'origin', `HEAD:refs/heads/${branch}`); // create the protected branch before enabling hooks
    git('config', 'core.hooksPath', resolve(root, '.githooks').replaceAll('\\', '/'));

    assert.throws(() => git('commit', '--allow-empty', '-m', 'no type prefix'), e => String(e.stderr).includes('commit-msg:'));
    git('commit', '--allow-empty', '-m', validMessage(config, 'new change'));
    git('push', 'origin', 'HEAD:refs/heads/task/example');

    for (const args of [['push', 'origin', `HEAD:${branch}`], ['push', 'origin', '--delete', branch], ['push', 'origin', 'HEAD:refs/heads/task/second', `HEAD:${branch}`]])
      assert.throws(() => git(...args), e => String(e.stderr).includes('pre-push:'), args.join(' '));
    assert.equal(git('ls-remote', 'origin', 'refs/heads/task/second').trim(), '');

    const script = join(temp, 'push.sh');
    writeFileSync(script, `git push origin HEAD:${branch}\n`);
    const fromScript = spawnSync(shell(), [script], { cwd: local, encoding: 'utf8', env });
    assert.notEqual(fromScript.status, 0);
    assert.match(fromScript.stderr, /pre-push:/);

    git('worktree', 'add', '-b', 'task/linked', linked);
    assert.throws(() => gitIn(linked, env)('push', 'origin', `HEAD:${branch}`), e => String(e.stderr).includes('pre-push:'), 'linked worktree');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
