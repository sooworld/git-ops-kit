# 도입 안내

git-ops-kit을 GitHub 저장소에 설치하고 프로젝트에 맞추는 순서다. 운영 규칙 자체는 설치되는 `docs/GIT.md`에 있다. 이 문서는 규칙을 다시 쓰지 않고 그 절 제목으로 가리킨다.

## 준비

- Node 22 이상. `node --test`의 글롭 인자를 쓴다.
- Git 2.31 이상(`rev-parse --path-format`). Windows는 Git for Windows의 sh가 훅을 실행한다.
- GitHub 저장소. guard가 막는 병합 명령은 `gh`와 GitHub API 기준이다. GitLab 등은 지원하지 않는다.
- 대상 저장소의 미커밋 변경은 먼저 커밋하거나 치워 둔다. 설치기는 파일을 더하기만 하지만, 섞이면 첫 PR을 판정하기 어렵다.

## 설치

```sh
node <키트>/install.mjs <대상 저장소 최상위> --lang ko --agents claude,codex
```

- `--lang`: 언어판 이름. 필수다. 지금은 `ko`만 있다(키트의 `template/` 아래 언어 폴더). 지침·규칙·양식의 언어와 커밋 필수 칸 이름이 정해진다.
- `--agents`: 훅 설정을 설치할 에이전트 도구. `claude`(기본), `codex`. Cursor·Gemini는 아래 '에이전트 도구'의 예를 직접 넣는다.
- 대상은 저장소 최상위여야 한다. 하위 폴더나 Git 저장소가 아닌 곳은 거부한다(exit 2).

설치기는 파일을 덮어쓰지 않는다. 결과는 세 가지로 나온다.

| 표시 | 뜻 | 할 일 |
|---|---|---|
| 복사함 | 없던 파일을 만들었다 | 없음 |
| 같음 | 이미 있고 키트와 내용이 같다 | 없음 |
| 합칠 것(`!`) | 이미 있고 내용이 다르다. 파일을 바꾸지 않았다 | 출력된 안내대로 직접 합친다. 이때 exit 1 |

합칠 것이 자주 생기는 파일:
- `.gitignore`: 키트 줄 중 없는 것만 추가한다.
- `.gitattributes`: `.githooks/** text eol=lf` 한 줄을 추가한다. 훅 래퍼의 shebang이 CRLF로 깨지지 않게 하는 줄이다. 저장소 전체 줄바꿈 규칙(`* text=auto eol=lf`)은 기존 파일을 다시 정규화하므로 키트가 넣지 않는다.
- `CLAUDE.md`: `@AGENTS.md` 줄이 없으면 추가한다.
- `AGENTS.md`: 키트 템플릿의 절을 기존 지침에 합친다. 기존 지침의 프로젝트 내용은 '프로젝트 규칙' 칸으로 옮긴다.
- `.claude/settings.json`, `.codex/hooks.json`: 출력된 항목을 `hooks.PreToolUse` 배열에 더한다.
- `docs/adr/`: 이미 ADR이 있으면 `0001-adopt-gitops.md`의 번호를 다음 번호로 바꾼다.

## 설정 참조

`gitops.config.json` 하나가 훅과 guard의 값을 정한다. 모든 키가 필요하고, 모르는 키가 있으면 오류다. 키를 잘못된 위치에 써서 조용히 무시되는 일을 막으려는 것이다.

| 키 | 뜻 | 기본값(ko) |
|---|---|---|
| `locale` | 훅 메시지 언어 `ko`/`en` | `ko` |
| `protectedBranches` | 직접 push·삭제를 막을 브랜치 이름. 정확한 이름만 쓰고 글롭은 지원하지 않는다 | `["main"]` |
| `commit.types` | 제목 `<type>(scope)!: <요약>`의 type 목록 | `feat`, `fix`, `docs` 등 11개 |
| `commit.requiredFields` | 메시지에 있어야 할 칸. 그 문자열로 시작하는 줄이 하나 있어야 한다 | `배경:`, `결정` |
| `commit.warnFields` | 있으면 경고만 하는 칸 | `다음:` |
| `commit.secretPatterns` | 메시지에 있으면 거부할 값의 정규식(JavaScript, 대소문자 구분, 줄 단위) | 개인 키, AWS·GitHub·Slack·OpenAI/Anthropic 키, JWT, `password=`·`token:` 뒤의 숫자 섞인 16자 이상 값 |

- 파일이 없거나 깨지면 커밋·push·에이전트 명령이 모두 막힌다. 기본값으로 대신하지 않는 것은, 설정을 실수로 지웠을 때 추가 보호 브랜치가 경고 없이 풀리는 일을 막기 위해서다. 에이전트의 파일 편집 도구는 막히지 않으므로 고칠 수 있다.
- 비밀 패턴은 커밋 **메시지**만 검사한다. diff 안의 비밀은 검사하지 않는다(GIT.md '장치와 한계'). 숫자가 없는 값(단어로 된 암호문)은 기본 패턴이 놓친다.
- `commit.requiredFields`를 바꾸면 `.gitmessage`의 안내도 맞춘다. setup이 어긋남을 경고한다.

## 연결과 점검

```sh
node scripts/gitops/setup.mjs          # 연결하고 점검
node scripts/gitops/setup.mjs --check  # 점검만
```

setup은 이 clone의 로컬 Git 설정에 `core.hooksPath=.githooks`와 `commit.template=.gitmessage`를 넣는다. 전역·시스템 설정은 바꾸지 않는다. worktree는 설정을 공유하므로 clone마다 한 번이면 된다.

점검 항목:
- 실패(exit 1): Node 버전, 설정 파일, 훅 폴더가 두 스크립트를 부르는지, `commit.template`
- 경고: 훅의 실행 비트(100755), `.gitmessage`에 없는 필수 칸, 아직 남은 `TODO(gitops)` 자리, 가려진 다른 수준의 `core.hooksPath`

**다른 훅 설정이 있을 때.** 이미 `core.hooksPath`가 어느 수준(local·global·system)에든 있거나 `.git/hooks`에 sample이 아닌 훅이 있으면, setup은 `core.hooksPath`를 바꾸지 않고 멈춘다. 바꾸면 그 훅이 조용히 꺼지기 때문이다. 이때는 쓰던 훅 관리자에서 두 스크립트를 부른다.

```sh
# husky 예: .husky/commit-msg
node scripts/gitops/commit-msg.mjs "$1"
# husky 예: .husky/pre-push
node scripts/gitops/pre-push.mjs "$@"
```

```yaml
# lefthook 예: lefthook.yml
commit-msg:
  commands:
    gitops:
      run: node scripts/gitops/commit-msg.mjs {1}
pre-push:
  commands:
    gitops:
      run: node scripts/gitops/pre-push.mjs
```

husky처럼 `core.hooksPath`를 쓰는 관리자는 `--check`가 그 폴더의 훅 파일이 두 스크립트를 부르는지 확인한다. lefthook·pre-commit처럼 `.git/hooks`에 직접 훅을 만드는 관리자는 `core.hooksPath`가 없으므로 `--check`가 항상 실패로 보고한다. 이때는 잘못된 메시지의 커밋이 거부되는지, 보호 브랜치 push가 거부되는지를 한 번씩 직접 확인한다.

**실행 비트.** Windows에서 추가한 훅은 실행 비트 없이 커밋된다. Linux·macOS clone에서는 그 훅이 무시된다. 처음 커밋할 때 함께 실행한다.

```sh
git add --chmod=+x .githooks/commit-msg .githooks/pre-push
```

**검증.** `node --test "tests/gitops/*.check.mjs"`. 인자 없는 `node --test`는 프로젝트의 다른 테스트까지 실행하므로 쓰지 않는다. 키트 테스트 파일 이름은 `*.check.mjs`라서 jest·vitest의 기본 탐색에는 잡히지 않는다.

## 프로젝트에 맞추기

setup이 `TODO(gitops)` 자리를 파일:줄로 보여 준다. 채운 뒤 표시를 지운다.

| 위치 | 채울 것 |
|---|---|
| `AGENTS.md` '프로젝트 규칙' | 목적, 작업별 시작 문서, 외부 시스템 보호, 작업별 검증. 예는 [PROFILES.md](PROFILES.md) |
| `docs/GIT.md` '위험 등급' | 표의 '프로젝트 경로': 요구 기준 문서, 위험 코드, 저위험 산출물 |
| `docs/GIT.md` 'PR' | 병합 방식: merge commit 또는 squash. squash 메시지는 훅이 검사하지 않는다 |
| `docs/GIT.md` '장치와 한계' | 서버 쪽 브랜치 보호를 쓸 수 있는지와 확인 날짜 |
| `.github/workflows/gitops.yml` | `push.branches`에 보호 브랜치 전부 |
| `docs/adr/0001-adopt-gitops.md` | 날짜, 맥락, 병합 방식, 채택 PR |

## GitHub 설정

- 서버 쪽 브랜치 보호를 쓸 수 있으면(공개 저장소 또는 유료 플랜) 보호 브랜치에 "PR 필수"와 "gitops guards 검사 필수"를 켠다. 그러면 로컬 장치 위에 권한 경계가 생긴다. ADR-0001의 재검토 조건에 해당하므로 ADR에 적는다.
- 병합 방식은 GIT.md 'PR'에서 고른 하나만 켠다.
- 병합 후 브랜치 자동 삭제를 켜면 GIT.md '종료와 작업 공간 정리'의 원격 브랜치 확인은 필요 없어진다. 로컬 브랜치와 worktree는 그대로 정리한다.
- 승인자가 여러 명이면 CODEOWNERS로 고위험 경로의 리뷰 담당을 정한다([PROFILES.md](PROFILES.md) '팀').

## 에이전트 도구

guard 하나가 도구마다 다른 훅 입력을 읽는다. 명령은 `tool_input.command`(Claude Code·Codex·Gemini) 또는 최상위 `command`(Cursor)에서 읽고, 막을 때 exit 2로 끝낸다. 아래 내용은 2026-10-21에 각 도구의 공식 문서로 확인했다.

| 도구 | 설정 파일 | 상태 | 주의 |
|---|---|---|---|
| Claude Code | `.claude/settings.json` | 설치됨, 검증함 | matcher는 셸 도구와 이름에 merge가 들어간 MCP 도구다 |
| Codex CLI | `.codex/hooks.json` | 설치됨, 입력 시험만 함 | 프로젝트 `.codex/` 층을 신뢰해야 훅이 실행된다. 훅 내용이 바뀌면 `/hooks`에서 다시 신뢰한다. exit 2가 아닌 실패는 막지 않는 것으로 보인다. Windows에서는 `commandWindows`(상대 경로)를 쓴다 |
| Cursor | `.cursor/hooks.json` | 예만 제공, 미검증 | 기본이 fail-open이라 `failClosed`를 켠다. guard는 Cursor 입력을 알아보고 항상 JSON으로 답한다 |
| Gemini CLI / Antigravity CLI | `.gemini/settings.json` | 예만 제공, 미검증 | 2026-06-18 Antigravity CLI(`agy`)로 대체됐고 훅 호환은 확인하지 못했다. AGENTS.md를 읽게 하려면 `context.fileName`을 정한다 |

Cursor 예(`.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      { "command": "node scripts/gitops/guard-tools.mjs", "timeout": 30, "failClosed": true }
    ]
  }
}
```

Gemini CLI 예(`.gemini/settings.json`):

```json
{
  "context": { "fileName": ["AGENTS.md"] },
  "hooks": {
    "BeforeTool": [
      { "matcher": "run_shell_command", "hooks": [{ "type": "command", "command": "node \"$GEMINI_PROJECT_DIR/scripts/gitops/guard-tools.mjs\"" }] }
    ]
  }
}
```

**도구마다 한 번 확인한다.** guard에 입력을 직접 넣어 보는 것은 도구 없이도 된다.

```sh
echo '{"tool_input":{"command":"gh pr merge 1"}}' | node scripts/gitops/guard-tools.mjs; echo $?   # 2
echo '{"tool_input":{"command":"git status"}}' | node scripts/gitops/guard-tools.mjs; echo $?      # 0
```

그다음 실제 도구 세션에서 에이전트에게 `git push origin HEAD:main`(보호 브랜치)을 시켜 막히는지 본다. 막히지 않으면 그 도구의 훅이 실행되지 않는 것이다(신뢰 절차, 설정 위치, 버전을 확인한다).

guard가 막는 명령은 정해져 있다. 배포(`npm publish` 등)처럼 프로젝트에서 따로 막을 명령은 '프로젝트 규칙'에 적고, Claude Code는 `permissions.deny`, Codex는 승인 정책으로 더 막을 수 있다.

## 첫 ADR과 첫 PR

- `docs/adr/0001-adopt-gitops.md`의 `TODO(gitops)`를 채운다. 결정마다 출처("승인자 제시"/"승인자 선택"/"에이전트가 정함")를 적는다. 상태는 승인자가 이 PR을 병합한 시점부터 효력이 있다.
- 도입 PR은 대부분 고위험 경로라 150줄 기준을 넘는다. 본문에 "키트 그대로인 파일"과 "프로젝트에 맞게 바꾼 줄"을 나눠 적어 승인자가 읽을 양을 줄인다. 키트 그대로인 파일은 설치기를 다시 실행하면 "같음"으로 확인된다.

## 공유 진행 목록 만들기

여러 에이전트·worktree를 쓸 때 clone마다 한 번 만든다(GIT.md '시작과 공유 진행 목록').

```sh
d="$(git rev-parse --path-format=absolute --git-common-dir)/coordination"
mkdir -p "$d" && test ! -e "$d/active.md" && printf '# 공유 진행 목록 (이 clone 전용 로컬 색인)\n\n- 조정 담당:\n- 규칙 기준 SHA:\n- 마지막 확인:\n' > "$d/active.md"
```

```powershell
$d = Join-Path (git rev-parse --path-format=absolute --git-common-dir) 'coordination'
New-Item -ItemType Directory -Force $d | Out-Null
$f = Join-Path $d 'active.md'
if (-not (Test-Path $f)) { Set-Content -Encoding utf8 $f "# 공유 진행 목록 (이 clone 전용 로컬 색인)`n`n- 조정 담당:`n- 규칙 기준 SHA:`n- 마지막 확인:" }
```

## 키트 갱신

새 키트 판본으로 설치기를 다시 실행한다. 바뀌지 않은 파일은 "같음", 프로젝트에서 고쳤거나 키트가 바뀐 파일은 "합칠 것"으로 나온다. 자동으로 덮어쓰지 않으므로 차이를 보고 직접 합친다. `scripts/gitops/`와 `tests/gitops/`는 프로젝트에서 고치지 않는 것을 권한다. 그래야 갱신 때 비교가 쉽다.

## 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| GUI Git 클라이언트에서 커밋할 때 `node not found` | 그 클라이언트의 PATH에 node가 없다. PATH에 넣거나 터미널에서 커밋한다. `--no-verify`로 넘기지 않는다 |
| Linux·macOS에서 훅이 실행되지 않음 | 실행 비트 없이 커밋됐다. `git add --chmod=+x .githooks/commit-msg .githooks/pre-push` |
| 모든 커밋·명령이 막힘 | `gitops.config.json`이 없거나 깨졌다. 메시지가 가리키는 키를 고친다 |
| Codex에서 막혀야 할 명령이 실행됨 | 프로젝트 훅을 신뢰하지 않았다. Codex에서 `/hooks`로 확인한다 |
| 프로젝트 린터가 `scripts/gitops/`를 검사함 | 린터 제외 경로에 `scripts/gitops/`, `tests/gitops/`를 넣는다 |
| setup이 "기존 훅이 있어" 멈춤 | 위 '연결과 점검'의 다른 훅 설정 안내를 따른다 |
