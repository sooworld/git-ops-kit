// User-facing messages of the hooks and the agent guard, in Korean and English.
// The prefixes (commit-msg:, pre-push:, gitops guard) stay the same in both languages so tests can match them.
const MESSAGES = {
  ko: {
    guardBlocked: 'gitops guard: PR 병합·보호 브랜치 push·훅 우회는 에이전트가 실행할 수 없다. 작업 브랜치를 push하고 사람이 PR을 병합한다.',
    guardInput: detail => `gitops guard: 입력 오류라 막았다 - ${detail}`,
    prePushBlocked: branch => `pre-push: ${branch} 생성·갱신·삭제는 금지한다. 작업 브랜치를 push하고 사람이 PR을 병합한다.`,
    commitSecret: (n, source) => `commit-msg: 메시지에 비밀 값으로 보이는 문자열이 있다(commit.secretPatterns[${n}]: ${source}). 마스킹한다.`,
    commitSubject: types => `commit-msg: 제목은 '<type>: <요약>' 형식이다 (type: ${types.join(', ')}).`,
    commitMissing: field => `commit-msg: '${field}' 칸이 없다.`,
    commitEmpty: field => `commit-msg: '${field}' 칸이 비어 있다. 칸 이름과 같은 줄에 내용을 쓴다.`,
    commitWarn: field => `commit-msg: 경고 - '${field}'은(는) 커밋이 아니라 작업별 인계에 쓴다(docs/GIT.md '커밋 기록').`,
    commitFooter: 'commit-msg: 형식은 .gitmessage를 본다. 쓰던 메시지는 .git/COMMIT_EDITMSG에 남아 있다.',
  },
  en: {
    guardBlocked: 'gitops guard: agents may not merge PRs, push to protected branches, or bypass hooks. Push a work branch and let a human merge the PR.',
    guardInput: detail => `gitops guard: blocked because the input could not be checked - ${detail}`,
    prePushBlocked: branch => `pre-push: creating, updating or deleting ${branch} is not allowed. Push a work branch and let a human merge the PR.`,
    commitSecret: (n, source) => `commit-msg: the message contains what looks like a secret value (commit.secretPatterns[${n}]: ${source}). Mask it.`,
    commitSubject: types => `commit-msg: the subject must be '<type>: <summary>' (type: ${types.join(', ')}).`,
    commitMissing: field => `commit-msg: the '${field}' field is missing.`,
    commitEmpty: field => `commit-msg: the '${field}' field is empty. Write its content on the same line as the field name.`,
    commitWarn: field => `commit-msg: warning - '${field}' belongs in the task handoff, not in the commit (docs/GIT.md 'Commit records').`,
    commitFooter: 'commit-msg: see .gitmessage for the format. Your message is kept in .git/COMMIT_EDITMSG.',
  },
};

// Returns the message for the locale. Without a known locale (for example when the config could not be read),
// both languages are joined so the reader always gets one they understand.
export function msg(locale, key, ...args) {
  const render = lang => {
    const entry = MESSAGES[lang][key];
    return typeof entry === 'function' ? entry(...args) : entry;
  };
  return MESSAGES[locale] ? render(locale) : `${render('ko')}\n${render('en')}`;
}
