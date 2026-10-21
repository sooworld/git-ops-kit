// Connects this clone to the kit (local Git config only) and checks the installation.
// Usage: node scripts/gitops/setup.mjs          set core.hooksPath=.githooks and commit.template=.gitmessage, then check
//        node scripts/gitops/setup.mjs --check  check only, change nothing
// Global and system Git settings are never changed. Worktrees of a clone share these settings.
// Setup does not change core.hooksPath when another hook setup exists, because that would silently disable it:
//   - core.hooksPath already set at any scope (local, global, system), or
//   - non-sample hooks in the common git dir's hooks/ folder.
// With a hook manager (husky, lefthook, ...), keep it and call scripts/gitops/commit-msg.mjs and pre-push.mjs from
// its hook files. The check passes when the effective hooks folder has both hooks and they call those scripts.
// Exit 1 when a check fails. Warnings (exec bit, fields missing from .gitmessage, TODO(gitops) markers) do not fail.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, repoRoot } from './config.mjs';

const HOOKS_DIR = '.githooks', TEMPLATE = '.gitmessage', MIN_NODE = 22, HOOKS = ['commit-msg', 'pre-push'];
const TODO_MARK = ['TODO', '(gitops)'].join(''); // split so this file does not report itself
const checkOnly = process.argv.includes('--check');
const failures = [], warnings = [];
let locale;
const t = (ko, en) => (locale === 'ko' ? ko : locale === 'en' ? en : `${ko} / ${en}`);
const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

// core.hooksPath values at every scope, in Git's order (the last one is effective).
function hooksPathEntries() {
  const out = tryGit('config', '--show-scope', '--get-all', 'core.hooksPath');
  return out ? out.split('\n').map(line => { const [scope, ...rest] = line.split('\t'); return { scope, value: rest.join('\t') }; }) : [];
}

function nonSampleHooks() {
  const dir = resolve(repoRoot, git('rev-parse', '--git-common-dir'), 'hooks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => !name.endsWith('.sample') && statSync(join(dir, name)).isFile()).map(name => join(dir, name));
}

// Git resolves a relative core.hooksPath from the worktree root and expands a leading ~.
const hooksFolder = value => resolve(repoRoot, value.replace(/^~(?=[\\/])/, homedir()));

if (Number(process.versions.node.split('.')[0]) < MIN_NODE) failures.push(`Node ${MIN_NODE}+ (${process.version})`);

let config;
try {
  config = loadConfig();
  locale = config.locale;
} catch (error) {
  failures.push(error.message);
}

// 1. Hook folder
let entries = hooksPathEntries();
if (!checkOnly && entries.length === 0) {
  const existing = nonSampleHooks();
  if (existing.length) {
    failures.push(t(
      `기존 훅이 있어 core.hooksPath를 바꾸지 않았다(바꾸면 꺼진다): ${existing.join(', ')}. 그 훅을 ${HOOKS_DIR}/로 옮기거나, 쓰는 훅 관리자에서 scripts/gitops/*.mjs를 부르게 한다(docs/GIT.md '장치와 한계').`,
      `Existing hooks found, so core.hooksPath was not changed (it would disable them): ${existing.join(', ')}. Move them into ${HOOKS_DIR}/ or call scripts/gitops/*.mjs from your hook manager (docs/GIT.md 'Devices and limits').`));
  } else {
    git('config', '--local', 'core.hooksPath', HOOKS_DIR);
    entries = hooksPathEntries();
  }
}
const effective = entries.at(-1);
if (!effective) {
  if (!failures.length || checkOnly) failures.push(t('core.hooksPath가 설정되지 않았다. node scripts/gitops/setup.mjs를 실행한다.', 'core.hooksPath is not set. Run node scripts/gitops/setup.mjs.'));
} else {
  for (const other of entries.slice(0, -1)) {
    warnings.push(t(`${other.scope} core.hooksPath=${other.value}는 ${effective.scope} 값에 가려 실행되지 않는다.`,
      `${other.scope} core.hooksPath=${other.value} is shadowed by the ${effective.scope} value and does not run.`));
  }
  const folder = hooksFolder(effective.value);
  const unwired = HOOKS.filter(hook => {
    const file = join(folder, hook);
    return !(existsSync(file) && readFileSync(file, 'utf8').includes(`scripts/gitops/${hook}.mjs`));
  });
  for (const hook of unwired) {
    failures.push(t(`${join(folder, hook)}가 없거나 scripts/gitops/${hook}.mjs를 부르지 않는다(core.hooksPath=${effective.value}, ${effective.scope}).`,
      `${join(folder, hook)} is missing or does not call scripts/gitops/${hook}.mjs (core.hooksPath=${effective.value}, ${effective.scope}).`));
  }
  if (unwired.length && effective.value !== HOOKS_DIR) {
    failures.push(t(`다른 훅 설정을 덮지 않으려고 core.hooksPath를 바꾸지 않았다. 그 훅에서 scripts/gitops/*.mjs를 부르게 하거나, 그 설정을 지운 뒤 다시 실행한다.`,
      `core.hooksPath was left alone so another hook setup is not overridden. Call scripts/gitops/*.mjs from those hooks, or remove that setting and run again.`));
  }
  if (effective.value === HOOKS_DIR) {
    const modes = new Map((tryGit('ls-files', '-s', '--', ...HOOKS.map(h => `${HOOKS_DIR}/${h}`)) ?? '')
      .split('\n').filter(Boolean).map(line => [line.split('\t')[1], line.split(' ')[0]]));
    const notExecutable = HOOKS.map(h => `${HOOKS_DIR}/${h}`).filter(path => modes.get(path) !== '100755');
    if (notExecutable.length) warnings.push(t(
      `${notExecutable.join(', ')}가 실행 파일(100755)로 커밋되지 않았다. Linux·macOS clone에서 훅이 무시된다: git add --chmod=+x ${notExecutable.join(' ')}`,
      `${notExecutable.join(', ')} not committed as executable (100755). Linux and macOS clones would ignore the hooks: git add --chmod=+x ${notExecutable.join(' ')}`));
  }
}

// 2. Commit template
if (!checkOnly) git('config', '--local', 'commit.template', TEMPLATE);
if (tryGit('config', '--get', 'commit.template') !== TEMPLATE) {
  failures.push(t(`commit.template=${TEMPLATE} 설정이 필요하다.`, `commit.template=${TEMPLATE} is required.`));
}
const templatePath = resolve(repoRoot, TEMPLATE);
if (!existsSync(templatePath)) {
  failures.push(t(`${TEMPLATE} 파일이 없다.`, `${TEMPLATE} is missing.`));
} else if (config) {
  const text = readFileSync(templatePath, 'utf8');
  const missing = config.commit.requiredFields.filter(field => !text.includes(field));
  if (missing.length) warnings.push(t(`${TEMPLATE}에 필수 칸 ${missing.join(', ')}이 없다(gitops.config.json commit.requiredFields와 맞춘다).`,
    `${TEMPLATE} lacks required fields ${missing.join(', ')} (keep it in line with gitops.config.json commit.requiredFields).`));
}

// 3. Places still waiting for project-specific values
const todo = tryGit('grep', '--untracked', '-n', '-I', '-F', TODO_MARK, '--', '.', ':!scripts/gitops', ':!tests/gitops');
if (todo) warnings.push(`${t('아직 채우지 않은 곳', 'Still to fill in')} (${TODO_MARK}):\n    ${todo.split('\n').join('\n    ')}`);

for (const w of warnings) console.warn(`${t('경고', 'warning')}: ${w}`);
for (const f of failures) console.error(`${t('실패', 'failed')}: ${f}`);
if (!failures.length) console.log(checkOnly ? t('gitops: 점검 통과', 'gitops: check passed') : t('gitops: 설정과 점검 완료', 'gitops: setup and check done'));
process.exitCode = failures.length ? 1 : 0;
