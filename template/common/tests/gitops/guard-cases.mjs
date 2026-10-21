// Shared command cases for the agent guard, written for protectedBranches ["main"].
// Not a test file itself (no .check. in the name). guard-tools.check.mjs runs them.
// BLOCK includes bypasses found by an earlier independent review: case changes, abbreviated options,
// env and sh -c prefixes, merge API variants.
export const BLOCK = [
  'gh pr merge 2 --squash', 'GH pr merge 2', 'gh pr --repo o/r merge 2', 'cd x && gh pr merge 2',
  'git push origin HEAD:main', 'git push origin main', 'git push origin +HEAD:main', 'git push origin HEAD:refs/heads/main',
  'git push origin :main', 'git push origin --delete main', 'git push origin "HEAD:main"', 'git push --mirror', 'git push origin :',
  'git push origin refs/heads/*:refs/heads/*', 'git -C ../x push origin HEAD:main', 'git --work-tree . push origin HEAD:main',
  'git push --no-verify origin task/x', 'git push origin --no-verif HEAD:x', 'git commit --no-veri -m x', 'git commit -n -m x',
  'git commit -nm x', 'git --work-tree . commit -n -m x', 'FOO=1 git commit --no-verify -m x', 'env git push --no-verify origin x',
  'sh -c "git commit --no-verify -m x"', '(git push origin HEAD:main)',
  'git -c core.hooksPath=/dev/null push', 'git -c core.hookspath=/x push origin x', 'git config core.hookspath /tmp',
  'git config set core.hooksPath /tmp', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hookspath GIT_CONFIG_VALUE_0=/x git push',
  'git -c alias.x=push x origin HEAD:main',
  'gh api repos/o/r/pulls/2/merge -X PUT', 'gh api --method=PUT repos/o/r/pulls/2/merge', 'gh api -XPUT repos/o/r/pulls/2/merge',
  'gh api repos/o/r/merges -f base=main -f head=x', 'gh api -X PUT repos/o/r/contents/a.md -f branch=main',
  'gh api graphql -f query="mutation { mergePullRequest }"', 'gh api graphql -F query=@m.graphql',
];

export const ALLOW = [
  'git status', 'git push origin task/12-main-fix', 'git push -u origin docs/x', 'git log -n 5', 'git log -n 5 --grep commit',
  'git -C ../x push -u origin task/a', 'git config --get core.hooksPath', 'git config core.hooksPath', 'git config get core.hooksPath',
  'grep -- --no-verify file', 'gh pr view 2', 'gh pr list', 'node --test', 'gh api repos/o/r/git/refs/heads/main',
  'gh api repos/o/r/pulls/2', 'git commit -m "fix"',
];
