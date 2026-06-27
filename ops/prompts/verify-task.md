`ops/prompts/verify-task.md`
---
prompt_id: verify-task
prompt_name: Verify TASK
version: 1
status: active
primary_role: verifier
task_type: verification
expected_branch: main
modifies_application_code: false
one_session_one_task: true
---

# Juleswhile TASK Verification Prompt

## 1. 목적

이 프롬프트는 구현된 TASK가 요구사항, 완료 조건, 테스트, 보안과 배포 기준을 실제로 충족하는지 독립적으로 검증한다.

이 세션은 검증만 수행한다.

애플리케이션 코드를 직접 수정하지 않는다.

---

## 2. Runtime Context

```text
REPOSITORY={{REPOSITORY}}
TASK_ID={{TASK_ID}}
TASK_ISSUE_NUMBER={{TASK_ISSUE_NUMBER}}
PULL_REQUEST_NUMBER={{PULL_REQUEST_NUMBER}}
PULL_REQUEST_URL={{PULL_REQUEST_URL}}
TARGET_COMMIT={{TARGET_COMMIT}}
STARTING_BRANCH={{PULL_REQUEST_HEAD_BRANCH}}
````

검증 대상 Commit을 반드시 고정한다.

검증 중 새로운 Commit이 추가되면 현재 결과가 최신 Commit에 적용되지 않을 수 있음을 보고한다.

---

## 3. 필수 읽기 순서

1. `AGENTS.md`
2. `PROJECT_GOAL.md`
3. 원본 TASK Manifest
4. 원본 TASK Issue
5. `ops/roles/verifier.md`
6. Pull Request 본문
7. 변경 Diff
8. 완료 조건
9. 관련 요구사항
10. 관련 Architecture
11. 관련 UX 명세
12. 기존 테스트
13. PR에서 추가된 테스트
14. CI 결과

---

## 4. 검증 독립성

구현자의 다음 주장을 그대로 신뢰하지 않는다.

* 구현 완료
* 테스트 통과
* 오류 없음
* 배포 가능
* 보안 문제 없음
* 요구사항 충족

실제 저장소, Diff, 테스트와 실행 결과로 확인한다.

---

## 5. 검증 범위

검증 범위는 다음으로 제한한다.

* 현재 TASK의 완료 조건
* 변경으로 인한 직접 회귀
* 관련 계약
* 관련 보안 경계
* 관련 배포 영향

현재 TASK와 무관한 전체 시스템 검증을 임의로 확대하지 않는다.

추가 문제가 발견되면 후속 TASK로 제안한다.

---

## 6. 검증 계획

실행 전 다음을 작성한다.

```yaml
verification_plan:
  task_id:
  pull_request:
  commit:
  environment:
  criteria:
    - id:
      statement:
      method:
      expected:
  commands: []
  manual_checks: []
  regression_scope: []
  security_checks: []
  stop_conditions: []
```

---

## 7. 환경 기록

다음을 기록한다.

```yaml
environment:
  operating_system:
  runtime:
  package_manager:
  dependency_lock:
  browser:
  database:
  commit:
  branch:
  configuration:
```

환경 변수의 실제 값은 기록하지 않는다.

---

## 8. 정적 검증

필요한 범위에서 실행한다.

```bash
git diff --check
npm run validate:schemas
npm run validate:task-graph
npm run lint
npm run typecheck
```

확인 항목:

* 문법
* 타입
* Schema
* TASK Graph
* 허용 경로
* Secret 패턴
* 변경 범위
* 문서 일관성

---

## 9. 자동 테스트

TASK에 명시된 검증 명령어를 우선한다.

예:

```bash
npm test
npm run test:integration
npm run test:e2e
npm run build
```

명령별로 기록한다.

| 명령어 | 결과                    | 핵심 내용 |
| --- | --------------------- | ----- |
|     | PASS / FAIL / NOT RUN |       |

---

## 10. 완료 조건 검증

각 완료 조건을 독립적으로 판정한다.

| ID   | 완료 조건 | 방법 | 예상 | 실제 | 결과          |
| ---- | ----- | -- | -- | -- | ----------- |
| AC-1 |       |    |    |    | PASS / FAIL |

완료 조건을 검증할 수 없으면 `BLOCKED` 또는 `NOT RUN`으로 기록한다.

---

## 11. 실패 흐름 검증

필요한 범위에서 다음을 검증한다.

* 잘못된 입력
* 누락된 입력
* 권한 없음
* 존재하지 않는 리소스
* 빈 데이터
* 외부 API 실패
* 시간 초과
* 중복 요청
* 재시도
* 취소
* 새로고침
* 네트워크 오류
* 부분 성공
* 데이터 불일치

정상 흐름 하나만 성공했다고 전체 PASS로 판정하지 않는다.

---

## 12. UI 검증

UI 변경이 있는 경우 확인한다.

* 모바일
* 데스크톱
* 로딩
* 빈 상태
* 오류
* 긴 텍스트
* 키보드
* 포커스
* 버튼 상태
* 폼 오류
* 링크
* 404
* 권한 없음
* 접근성 기본 조건

Preview 또는 로컬 실행이 불가능하면 `NOT RUN`으로 기록한다.

---

## 13. API 검증

API 변경이 있는 경우 확인한다.

* 성공 응답
* 입력 검증
* 인증 없음
* 권한 없음
* 존재하지 않는 리소스
* 중복 요청
* 멱등성
* 상태 코드
* 오류 Schema
* 외부 실패
* 시간 초과
* 민감정보 노출

---

## 14. 데이터 검증

데이터 변경이 있는 경우 확인한다.

* 생성
* 조회
* 수정
* 삭제
* 중복
* null
* 기본값
* 날짜
* 타임존
* 단위
* 정합성
* 마이그레이션
* 롤백

운영 데이터를 사용하지 않는다.

---

## 15. 보안 검증

TASK 범위에서 확인한다.

* Secret 하드코딩
* 민감 로그
* 권한 누락
* 외부 입력 검증
* 위험한 HTML
* Path Traversal
* Command Injection
* SSRF
* XSS
* Workflow 권한
* Fork PR 위험
* 의존성 변경

Production을 공격하거나 파괴적 보안 테스트를 수행하지 않는다.

---

## 16. 회귀 검증

변경 파일과 의존 관계를 기준으로 필요한 기존 테스트를 실행한다.

검토 대상:

* 공유 컴포넌트
* 공유 타입
* 공통 유틸리티
* 데이터 Schema
* API 계약
* 인증
* 빌드
* 배포

---

## 17. 결과 분류

### PASS

완료 조건이 충족되고 필수 검증이 성공했다.

### FAIL

기대 결과와 실제 결과가 다르다.

### BLOCKED

필수 입력, 환경 또는 권한 부족으로 검증할 수 없다.

### NOT RUN

해당 검증을 실행하지 않았다.

`BLOCKED` 또는 `NOT RUN`을 PASS로 취급하지 않는다.

---

## 18. 실패 보고

실패마다 다음을 기록한다.

```yaml
failure:
  criterion:
  severity:
  environment:
  steps_to_reproduce: []
  expected:
  actual:
  evidence:
  suspected_area:
  regression:
  correction_scope:
```

구현 방법을 단정하지 않는다.

증상, 재현 절차와 필요한 보완 범위를 제시한다.

---

## 19. 코드 수정 금지

Verifier는 다음을 수행하지 않는다.

* 애플리케이션 코드 수정
* 테스트 삭제
* 완료 조건 변경
* PR에 수정 Commit 추가
* 실패를 성공으로 변경
* 구현자의 설명만으로 승인

검증 도구 실행으로 생성된 임시 파일은 PR에 포함하지 않는다.

---

## 20. Verification Report

다음 형식으로 보고서를 작성한다.

```md
# Verification Report

## Target

- TASK:
- Pull Request:
- Commit:

## Environment

## Acceptance Criteria

| Criterion | Method | Result | Evidence |
|---|---|---|---|

## Commands

| Command | Result |
|---|---|

## Manual Verification

## Regression Verification

## Security Verification

## Failures

## Blocked or Not Run

## Final Verdict

PASS / FAIL / BLOCKED
```

TASK에서 파일 산출물을 요구하면 지정된 경로에 저장한다.

그렇지 않으면 TASK Issue 또는 Pull Request Review에 결과를 남긴다.

---

## 21. 최종 판정

### PASS 조건

* 모든 필수 완료 조건 PASS
* 필수 CI PASS
* 필수 빌드 PASS
* Blocker 또는 Critical 실패 없음
* 미실행 필수 검증 없음

### FAIL 조건

* 하나 이상의 필수 완료 조건 FAIL
* 빌드 실패
* 필수 테스트 실패
* 보안 또는 데이터 문제
* 핵심 회귀

### BLOCKED 조건

* 검증 환경 없음
* 필수 입력 없음
* 대상 Commit 불명확
* 승인 또는 권한 없음

---

## 22. 완료 정의

* 대상 Commit이 명확하다.
* 검증 환경이 기록됐다.
* 완료 조건별 결과가 있다.
* 명령어와 결과가 기록됐다.
* 실패와 미실행이 숨겨지지 않았다.
* 필요한 회귀 범위를 확인했다.
* 보안과 데이터 영향을 검토했다.
* 구현 코드를 수정하지 않았다.
* 최종 판정이 명확하다.