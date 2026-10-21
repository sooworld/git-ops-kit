// Installs the kit into a target Git repository. Run it once from the kit. Every clone then runs scripts/gitops/setup.mjs.
// Usage: node install.mjs <target-repo-root> --lang <lang> [--agents claude,codex]   (<lang>: a folder in template/, e.g. ko)
// Copies template/common, template/<lang> and template/agents/<agent> for each agent (default: claude).
// Never overwrites. An existing file is reported as "same" (identical bytes) or "merge" (different) and left untouched,
// with a hint on what to merge. Running it again later shows which installed files differ from this kit version.
// Exit 0: everything copied or identical. Exit 1: something needs a manual merge. Exit 2: usage error.
// Does not stage, commit or change Git config.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = dirname(fileURLToPath(import.meta.url));
const AGENTS = ['claude', 'codex'];
// Language editions are the template/ folders other than common/ and agents/.
const LANGS = readdirSync(join(KIT, 'template')).filter(name => !['common', 'agents'].includes(name) && statSync(join(KIT, 'template', name)).isDirectory());

function parseArgs(argv) {
  const args = { target: null, lang: null, agents: ['claude'] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') args.lang = argv[++i];
    else if (argv[i] === '--agents') args.agents = (argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    else if (!argv[i].startsWith('--') && !args.target) args.target = argv[i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.target) throw new Error('target repository path is required');
  if (!LANGS.includes(args.lang)) throw new Error(`--lang ${LANGS.join('|')} is required`);
  const bad = args.agents.filter(a => !AGENTS.includes(a));
  if (bad.length) throw new Error(`unknown agent: ${bad.join(', ')} (available: ${AGENTS.join(', ')})`);
  return args;
}

const samePath = (a, b) => {
  const norm = p => realpathSync.native(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Published path → source path, in copy order. A path provided by two sources is a kit bug.
function plan({ lang, agents }) {
  const sources = [join(KIT, 'template/common'), join(KIT, 'template', lang), ...agents.map(a => join(KIT, 'template/agents', a))];
  const files = new Map();
  for (const source of sources) {
    for (const path of walk(source)) {
      const rel = relative(source, path).split(sep).join('/');
      if (files.has(rel)) throw new Error(`kit bug: ${rel} is provided by two templates`);
      files.set(rel, path);
    }
  }
  return files;
}

function mergeHint(rel, source, t) {
  const show = `\n${readFileSync(source, 'utf8').trimEnd().replace(/^/gm, '      ')}`;
  switch (rel) {
    case '.gitignore': return t('키트 줄 중 없는 것을 추가한다:', 'Add the kit lines you do not have yet:') + show;
    case '.gitattributes': return t('다음 줄을 추가한다:', 'Add this line:') + show;
    case 'CLAUDE.md': return t('`@AGENTS.md` 줄이 없으면 추가한다.', 'Add an `@AGENTS.md` line if it is not there.');
    case '.claude/settings.json': return t('hooks.PreToolUse에 다음 항목을 합친다:', 'Merge this entry into hooks.PreToolUse:') + show;
    case '.codex/hooks.json': return t('hooks.PreToolUse에 다음 항목을 합친다:', 'Merge this entry into hooks.PreToolUse:') + show;
    default: return t(`키트 파일과 비교해 합친다: ${source}`, `Compare with the kit file and merge: ${source}`);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`install: ${error.message}\nusage: node install.mjs <target-repo-root> --lang ${LANGS.join('|')} [--agents claude,codex]`);
    return 2;
  }
  const t = (ko, en) => (args.lang === 'ko' ? ko : en);
  const target = resolve(args.target);
  let top;
  try {
    top = execFileSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    console.error(t(`install: Git 저장소가 아니다: ${target}`, `install: not a Git repository: ${target}`));
    return 2;
  }
  if (!samePath(top, target)) {
    console.error(t(`install: 저장소 최상위를 지정한다: ${top}`, `install: point to the repository root: ${top}`));
    return 2;
  }

  const copied = [], same = [], merge = [];
  for (const [rel, source] of plan(args)) {
    const dest = join(target, rel);
    if (!existsSync(dest)) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(source, dest);
      copied.push(rel);
    } else if (readFileSync(dest).equals(readFileSync(source))) {
      same.push(rel);
    } else {
      merge.push({ rel, hint: mergeHint(rel, source, t) });
    }
  }

  console.log(t(`복사함 ${copied.length}개:`, `Copied ${copied.length}:`));
  for (const rel of copied) console.log(`  + ${rel}`);
  if (same.length) console.log(t(`같음(그대로 둠) ${same.length}개: ${same.join(', ')}`, `Same, left as is (${same.length}): ${same.join(', ')}`));
  if (merge.length) {
    console.log(t(`합칠 것 ${merge.length}개(파일을 바꾸지 않았다):`, `To merge by hand (${merge.length}, files not changed):`));
    for (const { rel, hint } of merge) console.log(`  ! ${rel}\n    ${hint}`);
  }
  const adoption = join(KIT, 'docs', args.lang, 'ADOPTION.md');
  console.log(t(
    `\n다음 순서(자세한 것은 ${adoption}):\n  1. gitops.config.json의 보호 브랜치·커밋 칸·비밀 패턴을 확인한다.\n  2. node scripts/gitops/setup.mjs\n  3. git add --chmod=+x .githooks/commit-msg .githooks/pre-push (다른 파일과 함께 add한다)\n  4. node --test "tests/gitops/*.check.mjs"\n  5. setup이 보여 주는 TODO(gitops) 표시를 채운다.`,
    `\nNext (details in ${adoption}):\n  1. Review protected branches, commit fields and secret patterns in gitops.config.json.\n  2. node scripts/gitops/setup.mjs\n  3. git add --chmod=+x .githooks/commit-msg .githooks/pre-push (together with the other files)\n  4. node --test "tests/gitops/*.check.mjs"\n  5. Fill in the TODO(gitops) markers that setup lists.`));
  return merge.length ? 1 : 0;
}

process.exitCode = main();
