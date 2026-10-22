# git-ops-kit

사람 승인자와 여러 AI 에이전트(Claude Code, Codex 등)가 한 GitHub 저장소를 함께 쓸 때의 Git 운영 방식과, 그 장치를 다른 저장소에 설치하는 키트다.

## 무엇을 하나

목적은 **에이전트가 바뀌거나 세션이 끊겨도 작업의 의도·결정·현재 상태를 복원할 수 있고, 사람이 그 작업을 안심하고 받아들이거나 되돌릴 수 있게 하는 것**이다. 기록·판정 지점·되돌림 세 가지만 갖춘다. 막는 대상은 협조하는 에이전트의 실수이며, 권한 경계가 아니다. 방법의 원본은 설치되는 `docs/GIT.md`다(키트의 [template/ko/docs/GIT.md](template/ko/docs/GIT.md)).

| 설치되는 것 | 하는 일 |
|---|---|
| `.githooks/commit-msg` → `scripts/gitops/commit-msg.mjs` | 커밋 제목 형식, 필수 칸과 빈 칸, 메시지 안의 비밀 값을 검사한다 |
| `.githooks/pre-push` → `scripts/gitops/pre-push.mjs` | 보호 브랜치의 생성·갱신·삭제 push를 거부한다(사람 포함) |
| `scripts/gitops/guard-tools.mjs` + 에이전트 도구 설정 | 에이전트의 PR 병합, 보호 브랜치 push, 훅 우회를 실행 전에 막는다 |
| `.github/pull_request_template.md`, `docs/GIT.md` '위험 등급' | 사람은 diff 대신 판정용 본문으로 판정하고, 바뀐 경로로 읽을 범위를 정한다 |
| `AGENTS.md`, `CLAUDE.md` | 모든 에이전트의 공통 지침. 프로젝트마다 '프로젝트 규칙' 칸을 채운다 |
| `gitops.config.json` | 보호 브랜치, 커밋 type·필수 칸, 비밀 패턴 |

장치가 막지 못하는 것은 GIT.md '장치와 한계'에 있다.

## 빠른 시작

필요한 것: Node 22 이상, Git, GitHub 저장소.

```sh
node <키트>/install.mjs <대상 저장소 최상위> --lang ko --agents claude,codex
cd <대상 저장소 최상위>
node scripts/gitops/setup.mjs
git add -A
git add --chmod=+x .githooks/commit-msg .githooks/pre-push
node --test "tests/gitops/*.check.mjs"
```

설치기는 기존 파일을 덮어쓰지 않는다. 이미 있던 파일은 "합칠 것"으로 알려 준다. 설치 뒤에는 `gitops.config.json`을 확인하고, setup이 나열하는 `TODO(gitops)` 자리를 채운 다음, 첫 PR을 낸다. 순서와 설명은 [docs/ko/ADOPTION.md](docs/ko/ADOPTION.md)에 있다. 팀 운영과 프로젝트 유형별 예는 [docs/ko/PROFILES.md](docs/ko/PROFILES.md)에 있다.

## 키트 구성

| 위치 | 내용 |
|---|---|
| `install.mjs` | 설치기. `node install.mjs <대상> --lang ko [--agents claude,codex]` |
| `template/common/` | 언어와 무관한 파일: 훅 래퍼, `scripts/gitops/`, `tests/gitops/`, 워크플로, `.gitattributes`, `CLAUDE.md` |
| `template/ko/` | 언어별 파일: `AGENTS.md`, `docs/GIT.md`, `.gitmessage`, PR 양식, ADR, `gitops.config.json`, `.gitignore` |
| `template/agents/` | 에이전트 도구별 훅 설정(Claude Code, Codex) |
| `docs/ko/` | 도입 안내(`ADOPTION.md`)와 운영·프로젝트 유형 예(`PROFILES.md`) |
| `tests/kit.test.mjs` | 키트 검증. 키트 최상위에서 `node --test "tests/*.test.mjs"` |

지금은 한국어판만 있다. 다른 언어는 `template/<lang>/`과 `docs/<lang>/`을 같은 구성으로 더하면 설치기가 `--lang <lang>`으로 인식한다. 훅 메시지는 이미 영어(`locale: "en"`)도 지원한다.
