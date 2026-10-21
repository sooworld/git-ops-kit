// Pre-execution guard for AI agent tools (Claude Code, Codex, Cursor, Gemini-compatible hooks).
// Input: the tool's hook JSON on stdin. Output: exit 2 to block, exit 0 to allow. Cursor also gets a JSON reply on stdout.
// Blocks: PR merges by agents (gh and MCP merge tools), pushes to protectedBranches, hook bypass
// (--no-verify and its abbreviations, commit -n, changing core.hooksPath, GIT_CONFIG_* variables, aliases),
// merges and protected-branch writes through the GitHub API, and every graphql call.
// It only reads command strings. Commands inside script files, variable expansion and other tools are not seen.
// It leans toward blocking: words such as --no-verify inside a commit message also block.
// Missing or invalid gitops.config.json, or an input without a command, blocks every checked call (fail closed).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { msg } from './messages.mjs';

// Global git options that take the next word as their value
const GIT_VALUE_OPTS = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path']);
const base = w => w.replace(/^.*[\\/]/, '').replace(/\.exe$/, '');
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words are lowercased before matching, so branch names are compared lowercased too (leans toward blocking).
function protectedRefPattern(branches) {
  const names = branches.map(b => escapeRegExp(b.toLowerCase())).join('|');
  return new RegExp(`^(\\+?|.*:)(refs\\/heads\\/)?(${names})$`);
}

function blockedGit(words, protectedRef) {
  let i = 1;
  for (; i < words.length && words[i].startsWith('-'); i++) {
    if (/^-c$/.test(words[i]) && /^alias\./.test(words[i + 1] ?? '')) return true; // hiding push/commit behind an alias
    if (GIT_VALUE_OPTS.has(words[i])) i++;
  }
  const sub = words[i], args = words.slice(i + 1);
  if (args.some(w => /^--no-v/.test(w))) return true; // --no-verify and its abbreviations
  if (sub === 'commit' && args.some(w => /^-[a-z]*n[a-z]*$/.test(w))) return true;
  if (sub === 'config' && args.includes('core.hookspath')) {
    const read = args.some(w => w === 'get' || w === '-l' || /^--(get|list)/.test(w)) || args[args.length - 1] === 'core.hookspath';
    if (!read) return true;
  }
  if (sub === 'push' && args.some(w => w === '--mirror' || w === '--all' || w === ':' || (w.includes('*') && w.includes(':'))
    || protectedRef.test(w))) return true;
  return false;
}

function blockedGh(words) {
  const rest = words.slice(1);
  if (rest.includes('pr') && rest.includes('merge')) return true;
  if (rest[0] !== 'api') return false;
  if (rest.includes('graphql')) return true;
  const joined = rest.join(' ');
  const write = /(^| )(-x ?|--method[ =])(put|post|patch|delete)\b/.test(joined) || rest.some(w => /^(-f|-F|--field|--raw-field|--input)$/i.test(w));
  return write && /\/merges?\b|git\/refs|\/contents\/|\/branches\//.test(joined);
}

// Splits on shell connectors, strips quotes and brackets, lowercases, then looks for git and gh
// (including env, sh -c and VAR= prefixes).
function blockedPart(part, protectedRef) {
  const text = part.toLowerCase();
  if (/core\.hookspath\s*=/.test(text) || /git_config_(count|key_\d+|value_\d+|parameters)/.test(text)) return true;
  const words = text.replace(/["'`()$]/g, ' ').trim().split(/\s+/);
  for (let k = 0; k < words.length; k++) {
    const name = base(words[k]);
    if (name === 'git' && blockedGit(words.slice(k), protectedRef)) return true;
    if (name === 'gh' && blockedGh(words.slice(k))) return true;
  }
  return false;
}

// command: one shell command line. config: needs protectedBranches (a loaded or literal config object).
export function blocked(command, config) {
  const protectedRef = protectedRefPattern(config.protectedBranches);
  return command.split(/&&|\|\||[;&|\n\r]/).some(part => blockedPart(part, protectedRef));
}

// MCP tools are matched by the tool part of mcp__<server>__<tool>; only PR merge tools are blocked.
const MCP_MERGE = /merge.*(pull|pr)|(pull|pr).*merge/i;
export function blockedMcpTool(toolName) {
  return MCP_MERGE.test(toolName.split('__').slice(2).join('__'));
}

// input: parsed hook JSON. Shapes: tool_input.command (Claude Code, Codex, Gemini), top-level command (Cursor),
// tool_name mcp__* (MCP calls). An argv array is joined with spaces. Throws when no command is found.
export function decide(input, config) {
  const toolName = typeof input?.tool_name === 'string' ? input.tool_name : '';
  if (toolName.startsWith('mcp__')) return blockedMcpTool(toolName);
  let command = input?.tool_input?.command ?? input?.command;
  if (Array.isArray(command) && command.every(w => typeof w === 'string')) command = command.join(' ');
  if (typeof command !== 'string') throw new Error('command 필드가 없다 / no command field');
  return blocked(command, config);
}

const isCursor = input => typeof input?.cursor_version === 'string' || input?.hook_event_name === 'beforeShellExecution';

function respond({ deny, reason, cursor }) {
  if (cursor) {
    const reply = deny ? { permission: 'deny', user_message: reason, agent_message: reason } : { permission: 'allow' };
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  }
  if (deny) {
    console.error(reason);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input, locale, cursor = false;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
    cursor = isCursor(input);
    const config = loadConfig();
    locale = config.locale;
    const deny = decide(input, config);
    respond({ deny, reason: deny ? msg(locale, 'guardBlocked') : '', cursor });
  } catch (error) {
    respond({ deny: true, reason: msg(locale, 'guardInput', error.message), cursor });
  }
}
