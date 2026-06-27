# Juleswhile

GitHub Issues, Google Jules, GitHub Actions, Stitch MCP, Pull Requests, CI와 Netlify를 결합한 이벤트 드리븐 AI 프로젝트 실행 템플릿이다.

사용자는 GitHub에 프로젝트 목표를 작성한다. Juleswhile은 목표를 WBS와 검증 가능한 TASK로 분해하고, 실행 가능한 TASK를 Jules Session에 하나씩 전달한다.

각 TASK 결과는 임시 브랜치와 Pull Request로 제출되며, CI 검증과 병합 정책을 통과한 결과만 `main`에 반영된다. 병합 후에는 다음 TASK가 자동으로 선택되고 Netlify Production 배포 결과까지 추적한다.

---

## 현재 상태

```text
Control Plane:       구축 완료
Production E2E:      검증 완료
Jules Dispatch:      검증 완료
PR Validation:       검증 완료
Auto Merge:          검증 완료
Netlify Production:  검증 완료
기본 운영 모드:       Guarded Automation
```

검증된 실행 흐름:

```text
Project Goal Issue
→ Planner Jules Session
→ WBS / TASK Manifest
→ Planner Pull Request
→ PR Validation
→ main 병합
→ 다음 READY TASK 선택
→ Jules TASK Session
→ TASK Pull Request
→ CI 검증
→ 자동 병합
→ Netlify Production 배포
→ TASK 완료
→ 다음 TASK 선택
```

---

## 핵심 운영 원칙

### One Session, One TASK

하나의 Jules Session은 하나의 TASK만 처리한다.

### One Permanent Branch

영구 브랜치는 `main` 하나만 사용한다.

Jules는 TASK별 임시 브랜치를 만들고 Pull Request로 결과를 제출한다.

### Pull Request Only

Jules가 생성한 결과는 `main`에 직접 Push하지 않는다.

### GitHub Is the Control Plane

GitHub Issues, Pull Requests, Actions와 Manifest가 프로젝트 상태의 기준이다.

### Jules Is the Worker

Jules는 TASK를 실행하지만 다음 TASK를 임의로 결정하지 않는다.

### CI Is the Quality Gate

AI가 완료했다고 주장하는 것과 검증된 완료를 구분한다.

### Guarded Autonomy

낮은 위험의 일반 TASK는 자동 진행할 수 있지만 다음 작업은 사람 승인을 요구할 수 있다.

* 인증·인가
* 결제 및 환불
* 사용자 데이터 삭제
* 파괴적 데이터베이스 변경
* Secrets 변경
* 도메인 및 운영 인프라 변경
* 유료 자원 생성
* 법률·의료·금융 결과 확정

---

## 새 프로젝트 빠른 시작

전체 설명은 [`docs/07_operations/operator-guide.md`](docs/07_operations/operator-guide.md)를 따른다.

### 1. 환경값 결정

```bash
export TEMPLATE_REPO="https://github.com/loopwhile/Juleswhile.git"

export PROJECT_DIR="my-project"
export PROJECT_ID="my-project"
export PROJECT_NAME="My Project"

export GITHUB_OWNER="YOUR_GITHUB_ID"
export GITHUB_REPO="my-project"
export REPOSITORY="${GITHUB_OWNER}/${GITHUB_REPO}"
```

`PROJECT_ID`는 소문자 영문, 숫자, 하이픈을 사용하는 것을 권장한다.

### 2. Juleswhile 복제 후 Git 이력 제거

```bash
git clone "$TEMPLATE_REPO" "$PROJECT_DIR"
cd "$PROJECT_DIR"

rm -rf .git

git init
git branch -M main
```

### 3. Template Smoke Test 상태 초기화

Juleswhile 원본 저장소에는 Production E2E 검증 기록이 포함되어 있다.

새 프로젝트에서는 다음 항목을 초기화해야 한다.

* 기존 TASK-001, TASK-002
* Smoke Test 문서
* Project State
* Runtime State
* 사용량 기록
* Jules Source
* Goal Issue 연결
* 기존 프로젝트 이름

정확한 초기화 명령은 운영자 가이드의 `새 프로젝트 Bootstrap 초기화` 절을 사용한다.

### 4. 새 GitHub 저장소 생성 및 연결

GitHub에 README나 `.gitignore`를 자동 생성하지 않은 빈 저장소를 만든다.

```bash
gh repo create "$REPOSITORY" \
  --private \
  --description "$PROJECT_NAME"
```

```bash
git remote add origin \
  "https://github.com/${REPOSITORY}.git"

git add .
git commit -m "chore: initialize project from Juleswhile"
git push -u origin main
```

### 5. Jules 연결

1. Jules 웹 앱을 연다.
2. GitHub App을 설치하거나 기존 설치 범위를 수정한다.
3. 새 GitHub 저장소를 Jules 접근 대상에 추가한다.
4. Jules에서 새 저장소가 선택되는지 확인한다.
5. Jules Settings에서 API Key를 생성한다.
6. Jules Sources API에서 저장소의 정확한 Source 이름을 확인한다.

Source 이름 예시:

```text
sources/github/OWNER/REPOSITORY
```

표시는 계정이나 API 버전에 따라 달라질 수 있으므로 반환된 값을 그대로 사용한다.

### 6. GitHub Secret 등록

필수:

```bash
gh secret set JULES_API_KEY \
  --repo "$REPOSITORY"
```

Netlify 상태 추적 사용 시:

```bash
gh secret set NETLIFY_AUTH_TOKEN \
  --repo "$REPOSITORY"

gh secret set NETLIFY_SITE_ID \
  --repo "$REPOSITORY"
```

Secret 값은 저장소 파일, Issue, Pull Request, 댓글에 작성하지 않는다.

### 7. Repository Variable 등록

처음에는 자동화를 비활성화한다.

```bash
gh variable set JULES_SOURCE_NAME \
  --repo "$REPOSITORY" \
  --body "sources/github/OWNER/REPOSITORY"

gh variable set JULES_MAX_CONCURRENCY \
  --repo "$REPOSITORY" \
  --body "10"

gh variable set JULES_DAILY_NEW_TASK_BUDGET \
  --repo "$REPOSITORY" \
  --body "65"

gh variable set JULES_DAILY_CORRECTION_BUDGET \
  --repo "$REPOSITORY" \
  --body "20"

gh variable set JULES_DAILY_MAINTENANCE_BUDGET \
  --repo "$REPOSITORY" \
  --body "10"

gh variable set JULES_DAILY_RESERVE \
  --repo "$REPOSITORY" \
  --body "5"

gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"

gh variable set NETLIFY_STATUS_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"

gh variable set NETLIFY_PRODUCTION_BRANCH \
  --repo "$REPOSITORY" \
  --body "main"

gh variable set PR_MERGE_METHOD \
  --repo "$REPOSITORY" \
  --body "squash"

gh variable set ALLOW_FORK_PRS \
  --repo "$REPOSITORY" \
  --body "false"
```

### 8. Netlify 연결

Netlify에서 새 프로젝트를 생성하고 GitHub 저장소를 연결한다.

기본 설정:

```text
Production Branch: main
Build Command: npm run build
Publish Directory: dist
```

Netlify Site ID와 API Token을 GitHub Secret으로 등록한다.

### 9. 로컬 검증

```bash
npm ci
npm run ci
```

다음 항목이 모두 PASS여야 한다.

* Biome lint
* JSON Schema validation
* TASK graph validation
* TypeScript typecheck
* Production build

### 10. 자동화 활성화

모든 연결과 검증이 완료된 뒤 활성화한다.

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

정기 콘텐츠 TASK도 실행할 때만 다음 값을 활성화한다.

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```

### 11. Project Goal Issue 생성

GitHub 저장소의 `Issues`에서 `New issue`를 선택하고 `Project Goal` 템플릿을 사용한다.

제목은 반드시 다음 형식으로 시작한다.

```text
[GOAL] 프로젝트 목표 제목
```

Issue에는 최소한 다음 내용을 구체적으로 작성한다.

* 프로젝트 이름
* 프로젝트 유형
* 최상위 목표
* 해결하려는 문제
* 대상 사용자
* 기대 산출물
* 핵심 기능
* 제약사항
* 데이터 및 정보 출처
* AI 팀 작업 범위
* 자동화 수준
* 게시 및 배포 정책
* 필수 품질 검증
* 제외 범위
* 예상 위험
* 목표 일정
* 검증 가능한 성공 조건

Secret, API Key, Token, 비밀번호, 개인정보는 Goal Issue에 작성하지 않는다.

---

## Goal Issue 작성 원칙

### 나쁜 목표

```text
좋은 웹사이트를 만들어 주세요.
```

문제:

* 완료 조건이 없다.
* 사용자와 해결 문제가 없다.
* 기능 범위가 없다.
* 기술·비용 제약이 없다.
* 검증 방법이 없다.

### 좋은 목표

```text
숙박업체가 여러 판매 채널의 객실 재고와 예약을 한 화면에서 관리하는
반응형 웹서비스 MVP를 구축한다.

대상은 20~100개 소규모 숙박업체다.

최종 결과에는 예약·객실·요금·채널 관리 화면, 운영자 로그인,
예약 충돌 방지 정책, 오류 감사 로그, 테스트, 운영 문서,
Netlify 배포 결과가 포함되어야 한다.

결제, 자동 환불, 실제 OTA API 연동은 이번 범위에서 제외한다.

모든 TypeScript typecheck, unit test, production build와
모바일 화면 검증이 통과해야 완료로 판단한다.
```

---

## 자동 실행 루프

`AUTOMATION_ENABLED=true`이면 다음 체인이 동작한다.

```text
[GOAL] Issue Open
→ 01 · Goal Intake
→ Planner Session 생성
→ Planner PR 생성
→ 03 · PR Validation
→ 04 · Auto Merge
→ pr_merged event
→ 05 · Next TASK
→ TASK Issue 생성 또는 동기화
→ 02 · Dispatch Jules TASK
→ Jules Session 생성
→ Jules PR 생성
→ 03 · PR Validation
→ 04 · Auto Merge
→ 다음 TASK 반복
```

실행 가능한 READY TASK가 없거나 다음 조건이 발생하면 루프는 멈춘다.

* TASK 의존성 미충족
* Jules 사용량 예산 초과
* 동시 실행 상한 초과
* Resource Lock 충돌
* CI 실패
* PR 계약 누락
* Draft PR
* 사람 승인 필요
* Merge Conflict
* BLOCKED TASK
* 자동화 비활성화

---

## 현재 자동화 경계

Juleswhile은 무제한 무감독 실행 시스템이 아니다.

현재 Jules가 Draft Pull Request를 만들거나 PR 본문 계약을 누락하면 사람이 확인해야 한다.

PR 본문에는 다음 값이 필요하다.

```markdown
<!-- juleswhile:task-pr -->

TASK Issue: #123
```

Planner PR은 다음 참조가 필요하다.

```markdown
<!-- juleswhile:task-pr -->

Goal Issue: #1
```

Draft PR은 다음 명령으로 Ready 상태로 전환할 수 있다.

```bash
gh pr ready <PR_NUMBER> \
  --repo "$REPOSITORY"
```

PR 계약이 올바르고 Draft가 아니면 검증, 병합, 다음 TASK 실행은 자동으로 이어진다.

---

## Workflow 목록

| Workflow                   | 역할                                  |
| -------------------------- | ----------------------------------- |
| `01 · Goal Intake`         | Goal Issue를 검증하고 Planner Session 생성 |
| `02 · Dispatch Jules TASK` | TASK 하나를 Jules Session 하나에 전달       |
| `03 · PR Validation`       | PR 계약, 스키마, TASK 범위, 테스트, 빌드 검증     |
| `04 · Auto Merge`          | 병합 정책 평가, 병합, Issue 완료, 다음 TASK 이벤트 |
| `05 · Next TASK`           | 실행 가능한 다음 READY TASK 선택             |
| `06 · Reconciler`          | 고착, 실패, 오래된 상태 복구                   |
| `07 · Content Schedule`    | 승인된 반복 콘텐츠 TASK 생성                  |
| `08 · Netlify Status`      | `main` 병합 결과의 Production 배포 확인      |

---

## 자동화 중지

```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

이 설정은 새로운 Goal 자동 Intake와 다음 TASK 선택을 중지한다.

이미 실행 중인 Jules Session이나 열린 PR은 별도로 확인해야 한다.

콘텐츠 자동화만 중지:

```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```

---

## 상태 확인

### 최근 Workflow

```bash
gh run list \
  --repo "$REPOSITORY" \
  --limit 20
```

### 열린 TASK

```bash
gh issue list \
  --repo "$REPOSITORY" \
  --label "juleswhile:task" \
  --state open
```

### 열린 PR

```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open
```

### 자동화 설정

```bash
gh variable list \
  --repo "$REPOSITORY"
```

### Secret 이름 확인

```bash
gh secret list \
  --repo "$REPOSITORY"
```

Secret 값은 다시 표시되지 않는 것이 정상이다.

---

## 상세 문서

* [`docs/07_operations/operator-guide.md`](docs/07_operations/operator-guide.md)

  * 새 프로젝트 초기화
  * GitHub 연결
  * Jules App, API Key, Source 연결
  * Netlify 연결
  * Repository Variables
  * Goal Issue 작성법
  * 자동화 활성화
  * 운영 모니터링
  * 장애 복구
  * 중지 및 재개

* [`AGENTS.md`](AGENTS.md)

  * Jules와 AI Agent의 저장소 작업 규칙

* [`PROJECT_GOAL.md`](PROJECT_GOAL.md)

  * 현재 프로젝트 목표의 committed snapshot

* [`ops/tasks/task-index.yaml`](ops/tasks/task-index.yaml)

  * TASK Manifest와 의존성

* [`ops/state/project-state.json`](ops/state/project-state.json)

  * 프로젝트 상태 snapshot

---

## 로컬 명령

```bash
npm ci
npm run lint
npm run validate:schemas
npm run validate:task-graph
npm run typecheck
npm test
npm run build
npm run ci
```

---

## 안전 원칙

* Secret을 파일에 커밋하지 않는다.
* Issue와 PR에 Token을 붙여 넣지 않는다.
* CI를 우회하지 않는다.
* 실패한 검증을 삭제하지 않는다.
* 민감 작업은 자동 승인하지 않는다.
* Jules 결과를 검증 없이 Production으로 간주하지 않는다.
* `main`은 승인되고 검증된 결과만 보관한다.
