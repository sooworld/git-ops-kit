// Kit checks, run from the kit root: node --test "tests/*.test.mjs"
// - installer: installs and passes the installed checks per language, never overwrites, rejects bad targets
// - templates: no residue of the repository this kit was extracted from, default secret patterns catch common
//   secrets without blocking plain sentences
// - documents: every "<file>.md '<section>'" reference points to an existing heading; ko and en stay in step
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMessage } from '../template/common/scripts/gitops/commit-msg.mjs';
import { validate } from '../template/common/scripts/gitops/config.mjs';
import { gitIn, isolatedEnv, tempDir } from '../template/common/tests/gitops/helpers.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const LANGS = ['ko', 'en'].filter(lang => existsSync(join(KIT, 'template', lang)));
const node = process.execPath;
const readJson = path => JSON.parse(readFileSync(join(KIT, path), 'utf8'));
const walk = dir => (existsSync(dir) ? readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
}) : []);
const rel = (from, path) => relative(from, path).split(sep).join('/');

function newRepo(t, prefix) {
  const temp = tempDir(prefix);
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const env = isolatedEnv(join(temp, 'global.gitconfig'));
  const repo = join(temp, 'repo');
  gitIn(temp, env)('init', '-b', 'main', repo);
  const install = (...args) => spawnSync(node, [join(KIT, 'install.mjs'), ...args], { encoding: 'utf8', env });
  return { temp, env, repo, install };
}

// ---------- installer ----------

for (const lang of LANGS) {
  test(`install (${lang}): copies the kit, setup passes, installed checks pass`, { timeout: 240000 }, t => {
    const { env, repo, install } = newRepo(t, `kit-${lang}`);
    const result = install(repo, '--lang', lang, '--agents', 'claude,codex');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const path of ['gitops.config.json', 'AGENTS.md', 'CLAUDE.md', 'docs/GIT.md', '.githooks/pre-push', '.claude/settings.json', '.codex/hooks.json', '.github/workflows/gitops.yml'])
      assert.ok(existsSync(join(repo, path)), path);
    const setup = spawnSync(node, ['scripts/gitops/setup.mjs'], { cwd: repo, encoding: 'utf8', env });
    assert.equal(setup.status, 0, setup.stdout + setup.stderr);
    // A nested `node --test` that inherits NODE_TEST_CONTEXT runs nothing and exits 0, so drop it and count the passes.
    const { NODE_TEST_CONTEXT, ...outerFree } = env;
    const checks = spawnSync(node, ['--test', 'tests/gitops/*.check.mjs'], { cwd: repo, encoding: 'utf8', env: outerFree });
    assert.equal(checks.status, 0, checks.stdout.slice(-3000));
    assert.ok(Number(/^ℹ pass (\d+)/m.exec(checks.stdout)?.[1]) >= 25, checks.stdout.slice(-1500));
    assert.match(checks.stdout, /^ℹ fail 0/m);
  });
}

test('install: existing files are never overwritten and are reported as same or merge', t => {
  const { repo, install } = newRepo(t, 'kit-conflict');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(repo, 'CLAUDE.md'), '@AGENTS.md\n');
  const first = install(repo, '--lang', 'ko');
  assert.equal(first.status, 1, first.stdout);
  assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), 'node_modules/\n');
  assert.match(first.stdout, /! \.gitignore/);
  assert.match(first.stdout, /CLAUDE\.md/);
  assert.ok(existsSync(join(repo, 'scripts/gitops/setup.mjs')));
  const again = install(repo, '--lang', 'ko');
  assert.equal(again.status, 1);
  assert.match(again.stdout, /0개/); // nothing left to copy
});

test('install: bad targets and arguments are rejected with exit 2', t => {
  const { temp, repo, install } = newRepo(t, 'kit-args');
  mkdirSync(join(repo, 'sub'));
  const plain = join(temp, 'plain');
  mkdirSync(plain);
  for (const args of [[join(repo, 'sub'), '--lang', 'ko'], [repo], [repo, '--lang', 'fr'], [repo, '--lang', 'ko', '--agents', 'cursor'], [plain, '--lang', 'ko']])
    assert.equal(install(...args).status, 2, args.join(' '));
  assert.equal(existsSync(join(repo, 'gitops.config.json')), false);
});

// ---------- templates ----------

const RESIDUE = /(?<![A-Za-z0-9])4u(?![A-Za-z0-9])|Moodle|sesskey|menu-tree|00_GOAL|chrome-devtools|학번|d5d5918/i;

// The kit started from one documentation repository. None of its domain may remain anywhere in the kit.
test('the kit carries no residue of the repository it was extracted from', () => {
  const self = fileURLToPath(import.meta.url);
  const files = walk(KIT).filter(path => !rel(KIT, path).startsWith('.git/') && path !== self);
  assert.ok(files.length > 30, `only ${files.length} files scanned`);
  const hits = files.flatMap(path =>
    readFileSync(path, 'utf8').split('\n').map((line, i) => (RESIDUE.test(line) ? `${rel(KIT, path)}:${i + 1}: ${line.trim()}` : null)).filter(Boolean));
  assert.deepEqual(hits, []);
});

for (const lang of LANGS) {
  test(`default secret patterns (${lang}): common secrets are caught, plain sentences pass`, () => {
    const config = validate(readJson(`template/${lang}/gitops.config.json`));
    const field = config.commit.requiredFields.map(f => `${f} x`).join('\n');
    const rejected = line => checkMessage(`docs: x\n\n${field}\n${line}`, config).errors.length > 0;
    const caught = [
      '-----BEGIN RSA PRIVATE KEY-----', 'AKIAIOSFODNN7EXAMPLE', `ghp_${'a1'.repeat(18)}`, `github_pat_${'A1b2'.repeat(6)}`,
      'xoxb-1234567890-abcdef', 'sk-ant-api03-abcdefghij1234567890', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'password=Xk3pL9qR2mN7vB4w', "API_KEY: 'a1b2c3d4e5f6g7h8i9'", 'token: ghs1234567890abcdefXYZ',
    ];
    const passes = [
      'password: required', 'token 갱신 주기를 정한다', 'task-generalize-the-kit-config-files', 'risk-assessment-for-the-new-release-2026',
      'secret: rotate monthly please', 'sk-learn 사용법', 'API key 설정은 ADOPTION.md 참고', 'Token: see docs/GIT.md',
    ];
    for (const line of caught) assert.ok(rejected(line), `should catch: ${line}`);
    for (const line of passes) assert.equal(rejected(line), false, `should pass: ${line}`);
    assert.equal(rejected('token=abcdefghijklmnopqrstuv'), false, 'known limit: values without digits are not caught');
  });
}

// ---------- documents ----------

const headings = path => {
  let fenced = false;
  return readFileSync(path, 'utf8').split('\n').flatMap(line => {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = !fenced && /^#{1,6} (.+?)\s*$/.exec(line);
    return m ? [m[1]] : [];
  });
};

function documentSet(lang) {
  const files = [...walk(join(KIT, 'template', lang)), ...walk(join(KIT, 'docs', lang)), join(KIT, lang === 'ko' ? 'README.md' : 'README.en.md')]
    .filter(path => path.endsWith('.md') && existsSync(path));
  const byName = new Map();
  for (const path of files) byName.set(basename(path), [...(byName.get(basename(path)) ?? []), path]);
  return { files, byName };
}

for (const lang of LANGS) {
  test(`documents (${lang}): every "<file>.md '<section>'" reference names an existing heading`, () => {
    const { files, byName } = documentSet(lang);
    const broken = [];
    let checked = 0;
    for (const path of files) {
      for (const [, name, title] of readFileSync(path, 'utf8').matchAll(/([\w-]+\.md)[`)]? '([^'\n]+)'/g)) {
        checked++;
        const targets = byName.get(name) ?? [];
        if (!targets.some(target => headings(target).includes(title))) broken.push(`${rel(KIT, path)}: ${name} '${title}'`);
      }
    }
    assert.ok(checked >= 10, `only ${checked} references found`);
    assert.deepEqual(broken, []);
  });
}

test('scripts: section names quoted in hook messages exist in that language\'s GIT.md', () => {
  const titles = LANGS.flatMap(lang => headings(join(KIT, 'template', lang, 'docs/GIT.md')));
  const quoted = walk(join(KIT, 'template/common/scripts')).flatMap(path =>
    [...readFileSync(path, 'utf8').matchAll(/GIT\.md '([^'\n]+)'/g)].map(m => m[1]));
  assert.ok(quoted.length >= 2, 'no quoted section names found');
  const missing = quoted.filter(title => !titles.includes(title)).filter(title => LANGS.length === 2 || /[가-힣]/.test(title));
  assert.deepEqual(missing, []);
});

test('ko and en stay in step: same files, same heading counts, same referenced paths, same config apart from language', t => {
  if (LANGS.length < 2) return t.skip('template/en not written yet');
  const pairs = [['template/ko', 'template/en'], ['docs/ko', 'docs/en']];
  for (const [ko, en] of pairs) {
    const list = dir => walk(join(KIT, dir)).map(path => rel(join(KIT, dir), path)).sort();
    assert.deepEqual(list(en), list(ko), `${ko} vs ${en}`);
  }
  const mdPairs = [['README.md', 'README.en.md'], ...pairs.flatMap(([ko, en]) =>
    walk(join(KIT, ko)).filter(p => p.endsWith('.md')).map(p => [rel(KIT, p), `${en}/${rel(join(KIT, ko), p)}`]))];
  const paths = file => new Set([...readFileSync(join(KIT, file), 'utf8').matchAll(/`([^`\s]*(?:\/|\.(?:md|mjs|json|yml))[^`\s]*)`/g)].map(m => m[1]));
  for (const [ko, en] of mdPairs) {
    assert.equal(headings(join(KIT, en)).length, headings(join(KIT, ko)).length, `heading count: ${ko} vs ${en}`);
    assert.deepEqual([...paths(en)].sort(), [...paths(ko)].sort(), `referenced paths: ${ko} vs ${en}`);
  }
  const strip = c => ({ ...c, locale: null, commit: { ...c.commit, requiredFields: null, warnFields: null } });
  assert.deepEqual(strip(readJson('template/en/gitops.config.json')), strip(readJson('template/ko/gitops.config.json')));
});
