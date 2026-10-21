// Loads and validates gitops.config.json from the repository root (two levels above this file).
// The location is fixed relative to this script, so hooks, setup and agent guards read the same file
// regardless of the current directory or the agent tool that runs them.
// A missing or invalid file throws ConfigError. Callers block and print the message (fail closed).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_NAME = 'gitops.config.json';
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const defaultConfigPath = resolve(repoRoot, CONFIG_NAME);

export class ConfigError extends Error {}

const TOP_KEYS = ['locale', 'protectedBranches', 'commit'];
const COMMIT_KEYS = ['types', 'requiredFields', 'warnFields', 'secretPatterns'];
const LOCALES = ['ko', 'en'];

export function loadConfig(path = defaultConfigPath) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`${CONFIG_NAME} 없음 / not found: ${path}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${CONFIG_NAME} JSON 오류 / invalid JSON: ${error.message}`);
  }
  return validate(raw, path);
}

// Returns a normalized config with compiled secret patterns, or throws ConfigError listing every problem.
// Unknown keys are rejected so that a misplaced key (for example a top-level secretPatterns) is not ignored.
export function validate(raw, where = CONFIG_NAME) {
  const problems = [];
  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const stringList = (value, name, { allowEmpty }) => {
    const ok = Array.isArray(value) && value.every(s => typeof s === 'string' && s !== '') && (allowEmpty || value.length > 0);
    if (!ok) problems.push(`${name}: ${allowEmpty ? '' : '비어 있지 않은 '}문자열 배열이어야 한다 / must be a ${allowEmpty ? '' : 'non-empty '}string array`);
    return ok;
  };
  const unknownKeys = (obj, allowed, prefix) => {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) problems.push(`${prefix}${key}: 알 수 없는 키 / unknown key`);
  };

  if (!isObject(raw)) throw new ConfigError(`${where}: 최상위는 객체여야 한다 / top level must be an object`);
  unknownKeys(raw, TOP_KEYS, '');
  if (!LOCALES.includes(raw.locale)) problems.push(`locale: ${LOCALES.join(' | ')}`);
  stringList(raw.protectedBranches, 'protectedBranches', { allowEmpty: false });

  const secretRegexps = [];
  const commit = raw.commit;
  if (!isObject(commit)) {
    problems.push('commit: 객체여야 한다 / must be an object');
  } else {
    unknownKeys(commit, COMMIT_KEYS, 'commit.');
    stringList(commit.types, 'commit.types', { allowEmpty: false });
    stringList(commit.requiredFields, 'commit.requiredFields', { allowEmpty: true });
    stringList(commit.warnFields, 'commit.warnFields', { allowEmpty: true });
    if (stringList(commit.secretPatterns, 'commit.secretPatterns', { allowEmpty: true })) {
      commit.secretPatterns.forEach((source, i) => {
        try {
          secretRegexps.push(new RegExp(source));
        } catch (error) {
          problems.push(`commit.secretPatterns[${i}]: 정규식 오류 / invalid regex (${error.message})`);
        }
      });
    }
  }

  if (problems.length) throw new ConfigError(`${where}\n  - ${problems.join('\n  - ')}`);
  return {
    locale: raw.locale,
    protectedBranches: [...raw.protectedBranches],
    commit: {
      types: [...commit.types],
      requiredFields: [...commit.requiredFields],
      warnFields: [...commit.warnFields],
      secretPatterns: [...commit.secretPatterns],
    },
    secretRegexps,
  };
}
