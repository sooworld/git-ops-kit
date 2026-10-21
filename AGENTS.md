# git-ops-kit 작업 지침

이 저장소는 다른 저장소에 설치하는 Git 운영 키트를 관리한다. CLAUDE.md는 이 파일을 가져오는 진입점이다.

- `template/` 안의 `AGENTS.md`·`CLAUDE.md`·`.claude/`·`.codex/`·`.githooks/`는 배포물이다. 이 저장소에서 따르는 작업 지침이 아니므로 읽고 고치는 대상으로만 다룬다.
- 검증은 키트 루트에서 `node --test "tests/*.test.mjs"`로 한다. 설치 시험, 잔재·비밀 패턴 검사, 절 참조 검사가 들어 있다. 언어판이 둘 이상이면 두 언어 짝 검사도 돈다.
- 언어판(`template/<lang>/`, `docs/<lang>/`)을 더하거나 고칠 때는 같은 파일 구성과 절 구조를 유지한다. 한쪽만 고치지 않는다.
- 운영 방법의 원본은 `template/<lang>/docs/GIT.md`다. 키트 문서(`README.md`, `docs/<lang>/`)는 그 내용을 다시 쓰지 않고 절 제목으로 연결한다.
- 장치를 더하기 전에 `template/ko/docs/GIT.md` '목적과 범위'(기록·판정 지점·되돌림, 실수 방지)에 들어가는지 확인한다. 들어가지 않으면 더하지 않는다.
- 이 저장소의 커밋은 `template/ko/.gitmessage` 양식을 따른다.
