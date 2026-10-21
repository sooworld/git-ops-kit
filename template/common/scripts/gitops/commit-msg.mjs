// commit-msg hook logic (rules: docs/GIT.md, format: .gitmessage, values: gitops.config.json commit.*).
// Usage (from .githooks/commit-msg or another hook manager): node scripts/gitops/commit-msg.mjs <message-file>
// Rejects: secret-looking values in the message, a subject not matching '<type>(scope)!: <summary>', a missing
// required field (a line starting with the field text). Warns: a line starting with a warn field.
// Subjects starting with Merge/Revert/fixup!/squash!/amend! are not checked at all (same as the original sh hook).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { msg } from './messages.mjs';

const SKIP_SUBJECT = /^(Merge |Revert |fixup! |squash! |amend! )/;
const SCISSORS = /^# -* >8 -*$/;
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lines Git keeps: everything above the scissors line, without lines starting with '#'.
export function messageLines(text) {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex(line => SCISSORS.test(line));
  return (cut === -1 ? lines : lines.slice(0, cut)).filter(line => !line.startsWith('#'));
}

// Returns { skipped, errors, warnings } for the message text. config: a validated config (see config.mjs).
export function checkMessage(text, config) {
  const locale = config.locale;
  const lines = messageLines(text);
  const subject = lines.find(line => /\S/.test(line)) ?? '';
  if (SKIP_SUBJECT.test(subject)) return { skipped: true, errors: [], warnings: [] };

  const errors = [], warnings = [];
  // Mentioning a word is fine; only a value matching a pattern is rejected. Patterns are tested line by line like grep.
  config.secretRegexps.forEach((pattern, n) => {
    if (lines.some(line => pattern.test(line))) errors.push(msg(locale, 'commitSecret', n, config.commit.secretPatterns[n]));
  });
  const types = config.commit.types.map(escapeRegExp).join('|');
  if (!new RegExp(`^(${types})(\\([^)]+\\))?!?: .+`).test(subject)) errors.push(msg(locale, 'commitSubject', config.commit.types));
  for (const field of config.commit.requiredFields) {
    if (!lines.some(line => line.startsWith(field))) errors.push(msg(locale, 'commitMissing', field));
  }
  for (const field of config.commit.warnFields) {
    if (lines.some(line => line.startsWith(field))) warnings.push(msg(locale, 'commitWarn', field));
  }
  return { skipped: false, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const result = checkMessage(readFileSync(process.argv[2], 'utf8'), config);
    for (const line of [...result.warnings, ...result.errors]) console.error(line);
    if (result.errors.length) {
      console.error(msg(config.locale, 'commitFooter'));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`commit-msg: ${error.message}`);
    process.exitCode = 1;
  }
}
