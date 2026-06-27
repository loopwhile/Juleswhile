`README.md`

# Juleswhile

GitHub, Google Jules, Gemini, Stitch MCP, GitHub Actions, Netlify를 이용해 프로젝트의 기획·리서치·설계·디자인·개발·검증·배포를 TASK 단위로 실행하는 이벤트 드리븐 AI 프로젝트 팩토리다.

사용자는 최초 GitHub Issue에 프로젝트 목표와 제약사항을 입력한다.

Juleswhile은 목표를 분석하여 WBS와 TASK를 생성하고, 실행 가능한 TASK를 Google Jules 세션에 하나씩 전달한다. Jules가 생성한 Pull Request는 CI 검증을 거쳐 `main`에 병합되며, Netlify가 결과를 자동 배포한다.

---

## 1. 프로젝트 목표

Juleswhile의 목표는 다음 과정을 재사용 가능한 템플릿으로 제공하는 것이다.

```text
프로젝트 목표 Issue
→ 목표 분석
→ 기획
→ 리서치
→ 요구사항 정의
→ 아키텍처 설계
→ UI/UX 설계
→ 개발
→ 테스트
→ Pull Request
→ CI 검증
→ main 병합
→ Netlify 배포
→ 다음 TASK 실행
````

새 프로젝트는 Juleswhile 저장소를 템플릿으로 생성한 뒤 다음 연결만 완료하면 사용할 수 있어야 한다.

* GitHub 저장소
* Google Jules GitHub App
* Jules API Key
* Jules Source
* Google Stitch MCP
* Netlify

---

## 2. 핵심 아키텍처

| 계층      | 도구                      | 책임                  |
| ------- | ----------------------- | ------------------- |
| 사용자 입력  | GitHub Issues           | 최초 목표, 수정 요청, 운영 명령 |
| 상태 관리   | GitHub Issues, Manifest | TASK 상태와 의존성        |
| 오케스트레이션 | GitHub Actions          | TASK 선택, 전달, 상태 전이  |
| 실행 워커   | Google Jules            | TASK 단위 작업          |
| 추론 모델   | Gemini                  | 기획, 분석, 코드, 검토      |
| 디자인 도구  | Stitch MCP              | 화면 설계와 디자인 산출물      |
| 결과 제출   | GitHub Pull Request     | 코드와 문서 변경           |
| 품질 게이트  | GitHub Actions CI       | 스키마, 테스트, 빌드, 정책 검증 |
| 최종 저장소  | `main`                  | 승인된 프로젝트 상태         |
| 배포      | Netlify                 | 웹사이트와 대시보드 배포       |

---

## 3. 운영 원칙

### One Session, One TASK

하나의 Jules 세션은 하나의 TASK만 처리한다.

### One Permanent Branch

영구 브랜치는 `main` 하나만 사용한다.

Jules는 TASK별 임시 브랜치에서 작업하고 Pull Request를 생성한다.

### Pull Request Only

`main`에 직접 커밋하지 않는다.

모든 변경은 Pull Request와 CI 검증을 거쳐 반영한다.

### GitHub Is the Control Plane

Jules는 전체 프로젝트 상태를 직접 제어하지 않는다.

GitHub Actions가 다음 TASK를 선택하고 Jules API에 전달한다.

### Guarded Autonomy

AI는 허용된 범위 안에서만 자율적으로 작업한다.

결제, 인증, 권한, 데이터 삭제, 비밀정보, 운영 비용과 관련된 변경은 별도 승인을 요구한다.

---

## 4. 지원 프로젝트 예시

Juleswhile은 다음 유형의 프로젝트에 적용할 수 있다.

### AI 트렌드 뉴스 팩토리

```text
자료 수집
→ 중복 제거
→ 분류
→ 요약
→ 영향 분석
→ 콘텐츠 생성
→ 검증
→ 웹사이트 게시
```

### 경제·금융 리서치 팩토리

```text
뉴스·리포트 수집
→ 출처 검증
→ 시장 요약
→ 산업 분석
→ 시나리오 작성
→ 위험 검토
→ 보고서 게시
```

### 콘텐츠 운영 웹사이트

```text
콘텐츠 계획
→ 리서치
→ 초안 작성
→ 검수
→ SEO 메타데이터 생성
→ 페이지 생성
→ 배포
```

### 웹서비스 개발팀

```text
목표 분석
→ PRD
→ 정책
→ 아키텍처
→ 데이터 모델
→ UI/UX
→ 개발
→ QA
→ 배포
```

### 마케팅 운영팀

```text
고객 정의
→ 시장 조사
→ 포지셔닝
→ 콘텐츠 전략
→ 랜딩 페이지
→ 측정 지표
→ 개선 TASK
```

---

## 5. 저장소 구조

```text
Juleswhile/
├── AGENTS.md
├── README.md
├── PROJECT_GOAL.md
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── project-goal.yml
│   │   ├── task.yml
│   │   ├── correction.yml
│   │   └── incident.yml
│   │
│   ├── workflows/
│   │   ├── 01-goal-intake.yml
│   │   ├── 02-dispatch-jules.yml
│   │   ├── 03-pr-validation.yml
│   │   ├── 04-auto-merge.yml
│   │   ├── 05-next-task.yml
│   │   ├── 06-reconciler.yml
│   │   ├── 07-content-schedule.yml
│   │   └── 08-netlify-status.yml
│   │
│   └── pull_request_template.md
│
├── ops/
│   ├── roles/
│   ├── prompts/
│   ├── schemas/
│   ├── tasks/
│   ├── state/
│   └── scripts/
│
├── docs/
│   ├── 01_overview/
│   ├── 02_product/
│   ├── 03_research/
│   ├── 04_architecture/
│   ├── 05_design/
│   ├── 06_marketing/
│   └── 07_operations/
│
├── content/
├── data/
├── src/
├── tests/
├── public/
├── netlify.toml
└── package.json
```

---

## 6. 사전 준비

필요한 계정과 연결:

* GitHub 계정
* Google AI Pro
* Google Jules
* Jules GitHub App
* Jules API Key
* Google Stitch MCP 연결
* Netlify 계정

필요한 로컬 도구:

* Git
* GitHub CLI
* Node.js
* npm

권장 버전은 프로젝트의 `package.json`과 CI 환경을 기준으로 한다.

---

## 7. 새 프로젝트 생성

### 방법 A. GitHub Template Repository 사용

권장 방식이다.

```bash
gh repo create <PROJECT_NAME> \
  --template <OWNER>/Juleswhile \
  --private \
  --clone

cd <PROJECT_NAME>
```

공개 저장소가 필요하면 `--private` 대신 `--public`을 사용한다.

### 방법 B. Git Clone 후 재초기화

```bash
git clone <JULESWHILE_REPOSITORY_URL> <PROJECT_NAME>
cd <PROJECT_NAME>

rm -rf .git
git init
git branch -M main

git remote add origin <NEW_REPOSITORY_URL>
git add .
git commit -m "chore: initialize project from Juleswhile template"
git push -u origin main
```

---

## 8. GitHub 설정

### 8.1 Jules GitHub App

새 저장소를 Jules GitHub App의 접근 대상에 추가한다.

API Key만 등록해도 저장소 접근 권한이 자동으로 생기는 것은 아니다.

### 8.2 GitHub Actions Secret

다음 Secret을 등록한다.

| Secret               | 필수 | 설명                  |
| -------------------- | -: | ------------------- |
| `JULES_API_KEY`      | 필수 | Jules API 인증        |
| `NETLIFY_AUTH_TOKEN` | 선택 | Netlify API 상태 확인   |
| `NETLIFY_SITE_ID`    | 선택 | Netlify 사이트 식별      |
| `GH_APP_ID`          | 선택 | GitHub App 방식 사용 시  |
| `GH_APP_PRIVATE_KEY` | 선택 | GitHub App 설치 토큰 발급 |

Secret에는 실제 값을 저장하고 저장소 파일에는 값을 작성하지 않는다.

GitHub CLI 예시:

```bash
gh secret set JULES_API_KEY
```

### 8.3 GitHub Repository Variables

다음 Variable을 등록한다.

| Variable                         |     기본값 | 설명                        |
| -------------------------------- | ------: | ------------------------- |
| `JULES_SOURCE_NAME`              |      없음 | Jules에서 확인한 저장소 Source 이름 |
| `JULES_MAX_CONCURRENCY`          |    `10` | Jules 동시 실행 상한            |
| `JULES_DAILY_NEW_TASK_BUDGET`    |    `65` | 일일 신규 TASK 예산             |
| `JULES_DAILY_CORRECTION_BUDGET`  |    `20` | 보완 TASK 예산                |
| `JULES_DAILY_MAINTENANCE_BUDGET` |    `10` | 유지보수 TASK 예산              |
| `JULES_DAILY_RESERVE`            |     `5` | 긴급 예비 예산                  |
| `AUTOMATION_ENABLED`             | `false` | 자동 실행 활성화 여부              |

설정 예시:

```bash
gh variable set JULES_SOURCE_NAME --body "<JULES_SOURCE_NAME>"
gh variable set JULES_MAX_CONCURRENCY --body "10"
gh variable set JULES_DAILY_NEW_TASK_BUDGET --body "65"
gh variable set AUTOMATION_ENABLED --body "false"
```

초기 검증이 끝나기 전까지 `AUTOMATION_ENABLED`는 `false`로 유지한다.

---

## 9. Branch Ruleset

`main`에 다음 규칙을 설정한다.

* Pull Request를 통한 변경만 허용
* Required Status Checks 활성화
* 승인되지 않은 직접 Push 차단
* 대화 해결 요구
* 강제 Push 차단
* 브랜치 삭제 차단
* 관리자 우회 최소화
* 병합 후 작업 브랜치 자동 삭제

초기 구축 단계에서는 자동 병합보다 CI 검증을 먼저 안정화한다.

---

## 10. Netlify 연결

1. Netlify에서 새 사이트를 생성한다.
2. GitHub 저장소를 연결한다.
3. Production Branch를 `main`으로 지정한다.
4. Build Command를 프로젝트 설정에 맞게 입력한다.
5. Publish Directory를 프로젝트 설정에 맞게 입력한다.
6. 필요한 환경 변수를 Netlify에 등록한다.

기본 예시:

```text
Build command: npm run build
Publish directory: dist
```

Next.js 등 다른 프레임워크를 사용하면 해당 프레임워크의 Netlify 설정을 따른다.

---

## 11. 최초 프로젝트 시작

GitHub Issues에서 `Project Goal` 템플릿을 선택한다.

최소한 다음 내용을 작성한다.

* 프로젝트 목표
* 대상 사용자
* 기대 산출물
* 프로젝트 유형
* 제약사항
* 자동화 허용 범위
* 게시 정책
* 성공 조건
* 제외 범위

Issue 제목은 자동으로 다음 접두사를 사용한다.

```text
[GOAL]
```

Goal Intake Workflow는 해당 Issue를 감지하여 Planner용 Jules 세션을 생성한다.

Planner는 다음 산출물을 작성한다.

* 프로젝트 목표 정규화
* 범위
* 비범위
* WBS
* TASK Manifest
* 의존성 그래프
* 위험 요소
* 검증 계획

Planner 결과는 Pull Request로 제출된다.

---

## 12. TASK 실행 흐름

```text
DRAFT
→ READY
→ QUEUED
→ DISPATCHING
→ RUNNING
→ PR_OPENED
→ VALIDATING
→ MERGE_READY
→ MERGED
→ DEPLOYING
→ COMPLETED
```

CI 실패 시:

```text
VALIDATING
→ CORRECTING
→ VALIDATING
```

보완 한도 초과 시:

```text
CORRECTING
→ BLOCKED
```

---

## 13. 안전 경계

AI에게 기본적으로 허용되는 작업:

* 문서 작성
* 조사 결과 정리
* 코드 작성
* 테스트 작성
* UI 명세 작성
* Stitch 기반 디자인 작업
* 콘텐츠 생성
* SEO 메타데이터 작성
* 버그 수정
* CI 오류 수정

별도 승인이 필요한 작업:

* 결제 정책 변경
* 인증·인가 변경
* 사용자 데이터 삭제
* 데이터베이스 파괴적 마이그레이션
* Secrets 변경
* 도메인 설정 변경
* 유료 외부 자원 생성
* 대규모 의존성 업데이트
* 법률 문서 최종 확정
* 금융 콘텐츠 자동 게시
* 고객에게 자동 메시지 발송

---

## 14. 사용량 정책

기본 사용량 예산:

```yaml
quota_policy:
  daily_hard_limit: 100
  new_task_budget: 65
  correction_budget: 20
  maintenance_budget: 10
  emergency_reserve: 5
  max_concurrent: 10
```

모든 사용량을 신규 TASK에 배정하지 않는다.

실패 복구, 검증, 운영 장애를 위한 예비량을 유지한다.

---

## 15. 개발 상태

Juleswhile은 다음 순서로 구축한다.

1. 저장소 규약
2. Issue Form
3. Pull Request 규약
4. 역할 프롬프트
5. TASK Schema
6. 상태 머신
7. GitHub Actions
8. Jules API Dispatcher
9. CI 검증
10. Netlify 연결
11. Pilot Project
12. 안정화

현재 상세 진행 상황은 GitHub Issues와 TASK Manifest를 기준으로 확인한다.

---

## 16. 라이선스와 책임

Juleswhile은 AI 에이전트의 결과를 무조건 신뢰하도록 설계되지 않는다.

모든 산출물은 다음 과정을 거쳐야 한다.

* 구조 검증
* 테스트
* CI
* 보안 검사
* 정책 검사
* 필요 시 사람 승인

특히 금융, 법률, 의료, 개인정보, 결제 관련 결과는 별도의 전문가 검토가 필요하다.
