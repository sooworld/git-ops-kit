// Config checks: this repository's gitops.config.json is valid, and invalid configs are rejected with every problem listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadConfig, validate } from '../../scripts/gitops/config.mjs';
import { tempDir } from './helpers.mjs';

const good = () => ({
  locale: 'en',
  protectedBranches: ['main'],
  commit: { types: ['feat', 'fix'], requiredFields: ['Background:'], warnFields: [], secretPatterns: ['sk-[A-Za-z0-9]{20,}'] },
});

test('config: this repository config loads', () => {
  const config = loadConfig();
  assert.ok(config.protectedBranches.length > 0);
  assert.equal(config.secretRegexps.length, config.commit.secretPatterns.length);
});

test('config: a valid config is normalized with compiled patterns', () => {
  const config = validate(good());
  assert.equal(config.locale, 'en');
  assert.ok(config.secretRegexps[0].test('sk-abcdefghijklmnopqrstuvwxyz'));
});

test('config: invalid values and unknown keys are rejected', () => {
  const cases = [
    [c => { c.locale = 'fr'; }, /locale/],
    [c => { c.protectedBranches = []; }, /protectedBranches/],
    [c => { delete c.commit; }, /commit/],
    [c => { c.commit.types = 'feat'; }, /commit\.types/],
    [c => { c.commit.secretPatterns = ['(']; }, /secretPatterns\[0\]/],
    [c => { c.secretPatterns = []; }, /secretPatterns: /],
    [c => { c.commit.requiredField = []; }, /commit\.requiredField: /],
  ];
  for (const [mutate, pattern] of cases) {
    const raw = good();
    mutate(raw);
    assert.throws(() => validate(raw), error => error instanceof ConfigError && pattern.test(error.message), pattern.source);
  }
});

test('config: a missing file or broken JSON throws ConfigError', () => {
  const temp = tempDir('config');
  try {
    const file = join(temp, 'gitops.config.json');
    assert.throws(() => loadConfig(file), ConfigError);
    writeFileSync(file, '{ "locale": ');
    assert.throws(() => loadConfig(file), ConfigError);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
