// pre-push hook logic: rejects creating, updating or deleting any protectedBranches ref on any remote.
// Usage (from .githooks/pre-push or another hook manager): node scripts/gitops/pre-push.mjs <remote> <url> < refs
// stdin lines: <local-ref> <local-sha> <remote-ref> <remote-sha>. Applies to people as well as agents.
// Branch names are compared exactly (refs/heads/<name>), as Git refs are case-sensitive on the server.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { msg } from './messages.mjs';

// Returns the protected branch names that the pushed refs would touch.
export function protectedTargets(stdinText, config) {
  const refs = new Set(config.protectedBranches.map(b => `refs/heads/${b}`));
  const hits = [];
  for (const line of stdinText.split(/\r?\n/)) {
    const remoteRef = line.trim().split(/\s+/)[2];
    if (remoteRef && refs.has(remoteRef)) hits.push(remoteRef.slice('refs/heads/'.length));
  }
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const hits = protectedTargets(readFileSync(0, 'utf8'), config);
    if (hits.length) {
      console.error(msg(config.locale, 'prePushBlocked', hits.join(', ')));
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`pre-push: ${error.message}`);
    process.exitCode = 1;
  }
}
