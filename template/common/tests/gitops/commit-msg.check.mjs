// commit-msg checks: message rules with fixed Korean and English configs (independent of this repository's values),
// plus the command line script with this repository's config.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMessage } from '../../scripts/gitops/commit-msg.mjs';
import { loadConfig, validate } from '../../scripts/gitops/config.mjs';
import { root, tempDir, validMessage } from './helpers.mjs';

const TYPES = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'style', 'perf', 'build', 'ci', 'revert'];
const ko = validate({ locale: 'ko', protectedBranches: ['main'],
  commit: { types: TYPES, requiredFields: ['배경:', '결정'], warnFields: ['다음:'], secretPatterns: ['sk-[A-Za-z0-9]{20,}'] } });
const en = validate({ locale: 'en', protectedBranches: ['main'],
  commit: { types: TYPES, requiredFields: ['Background:', 'Decision'], warnFields: ['Next:'], secretPatterns: ['sk-[A-Za-z0-9]{20,}'] } });
const ok = (text, config) => checkMessage(text, config).errors.length === 0;

test('commit-msg: a message with type subject and required fields passes', () => {
  assert.ok(ok('docs: 규칙 정리\n\n배경: 이유\n결정과 버린 대안: 선택\n검증: 미실행', ko));
  assert.ok(ok('feat(api)!: change\n\nBackground: why\nDecision and rejected options: what\n', en));
  assert.ok(ok('fix: a\r\n\r\nBackground: b\r\nDecision c\r\n', en), 'CRLF');
});

test('commit-msg: bad subject or missing fields are rejected', () => {
  assert.equal(ok('규칙 정리\n\n배경: x\n결정: y', ko), false);
  assert.equal(ok('docs:no space\n\n배경: x\n결정: y', ko), false);
  assert.equal(ok('wip: x\n\n배경: x\n결정: y', ko), false);
  assert.equal(checkMessage('docs: x\n\n결정: y', ko).errors.length, 1);
  assert.equal(checkMessage('docs: x\n', ko).errors.length, 2);
});

test('commit-msg: comment lines and text below the scissors line do not count', () => {
  assert.equal(ok('docs: x\n\n# 배경: in a comment\n결정: y', ko), false);
  assert.equal(ok('docs: x\n\n결정: y\n# ------------------------ >8 ------------------------\n배경: below scissors', ko), false);
  assert.ok(ok('# comment first\ndocs: x\n\n배경: x\n결정: y', ko));
});

test('commit-msg: secret values are rejected, mentioning the word is not', () => {
  assert.equal(ok('docs: x\n\n배경: key sk-abcdefghijklmnopqrstu1\n결정: y', ko), false);
  assert.ok(ok('docs: x\n\n배경: sk- 접두 키는 마스킹한다\n결정: y', ko));
});

test('commit-msg: warn fields only warn, merge-like subjects are skipped', () => {
  const warned = checkMessage('docs: x\n\nBackground: a\nDecision b\nNext: later', en);
  assert.equal(warned.errors.length, 0);
  assert.equal(warned.warnings.length, 1);
  for (const subject of ['Merge branch x', 'Revert "x"', 'fixup! x', 'squash! x', 'amend! x'])
    assert.equal(checkMessage(`${subject}\n`, ko).skipped, true, subject);
});

test('commit-msg CLI: exit 0 for a valid message and 1 with the prefix for an invalid one', () => {
  const config = loadConfig();
  const temp = tempDir('commit-msg');
  try {
    const file = join(temp, 'COMMIT_EDITMSG');
    const run = text => { writeFileSync(file, text); return spawnSync(process.execPath, [join(root, 'scripts/gitops/commit-msg.mjs'), file], { encoding: 'utf8' }); };
    assert.equal(run(validMessage(config)).status, 0);
    const bad = run('no subject format\n');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^commit-msg: /m);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
