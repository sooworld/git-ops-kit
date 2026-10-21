// Shared helpers for the gitops checks (not a test file itself).
// Temporary repositories run Git with an empty global config and no system config, so the user's own settings
// (signing, global hooks, templates) cannot change the results.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));

export function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `gitops-${prefix}-`));
}

// Environment for Git in temporary repositories. globalFile is created empty when missing.
export function isolatedEnv(globalFile) {
  if (!existsSync(globalFile)) writeFileSync(globalFile, '');
  return { ...process.env, GIT_CONFIG_GLOBAL: globalFile, GIT_CONFIG_NOSYSTEM: '1' };
}

export function gitIn(dir, env) {
  return (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { encoding: 'utf8', stdio: 'pipe', env });
}

// On Windows use the sh that ships with Git: three levels above git --exec-path (.../mingw64/libexec/git-core).
export function shell() {
  if (process.platform !== 'win32') return 'sh';
  const sh = resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/sh.exe');
  return existsSync(sh) ? sh : 'sh';
}

// A commit message that satisfies the given config: first type, then every required field.
export function validMessage(config, subject = 'check') {
  return [`${config.commit.types[0]}: ${subject}`, '', ...config.commit.requiredFields.map(field => `${field} test`)].join('\n');
}
