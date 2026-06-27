`PROJECT_GOAL.md`

schema_version: 1
project_name: Juleswhile
project_type: ai-project-factory
status: bootstrap
goal_issue_number: null
goal_issue_url: null
autonomy_mode: guarded
publishing_mode: review_required
primary_branch: main
created_at: 2026-06-26
last_updated_at: 2026-06-26

# Juleswhile Project Goal

## 1. 프로젝트 개요

Juleswhile은 GitHub, Google Jules, Gemini, Google Stitch MCP, GitHub Actions, Netlify를 결합하여 AI 에이전트 조직이 프로젝트 목표를 TASK 단위로 수행하도록 만드는 재사용 가능한 템플릿 저장소다.

사용자가 최초 GitHub Issue에 프로젝트 목표와 제약사항을 작성하면 시스템은 이를 분석하여 기획, 리서치, 마케팅, 설계, 디자인, 개발, 검증, 배포 TASK로 분해한다.

각 TASK는 Google Jules 세션 하나에 전달되며, 결과는 Pull Request와 CI 검증을 거쳐 `main`에 반영된다.

---

## 2. 핵심 목표

Juleswhile은 다음 조건을 만족해야 한다.

1. 새 프로젝트를 템플릿에서 빠르게 생성할 수 있다.
2. 사용자는 최초 Goal Issue만으로 프로젝트를 시작할 수 있다.
3. 프로젝트 목표를 검증 가능한 TASK로 분해할 수 있다.
4. Jules 세션 하나가 TASK 하나만 처리한다.
5. TASK 간 의존성과 실행 순서를 관리할 수 있다.
6. 최대 동시 실행량과 일일 사용량을 제한할 수 있다.
7. 모든 결과는 Pull Request로 제출된다.
8. 모든 Pull Request는 CI 검증을 거친다.
9. CI 실패 시 제한된 횟수만큼 보완한다.
10. `main` 브랜치는 승인된 상태만 보관한다.
11. `main` 병합 결과를 Netlify에서 확인할 수 있다.
12. 운영 상태와 실패 원인을 추적할 수 있다.
13. 프로젝트별 역할·정책·TASK 구조를 재사용할 수 있다.
14. 자동화가 무한 루프에 빠지지 않아야 한다.
15. 민감하거나 파괴적인 작업은 자동 실행하지 않아야 한다.

---

## 3. 해결하려는 문제

AI 에이전트에게 장문의 목표를 한 번 전달하는 방식은 다음 문제가 있다.

- 작업 범위가 지나치게 커진다.
- 계획과 구현이 혼합된다.
- 진행 상태를 추적하기 어렵다.
- 실패 지점을 분리하기 어렵다.
- 여러 에이전트가 같은 파일을 충돌하며 수정한다.
- 작업 완료 여부를 객관적으로 판단하기 어렵다.
- AI가 후속 작업을 무한 생성할 수 있다.
- 프로젝트 컨텍스트가 오염된다.
- 사람의 승인 범위가 불분명하다.
- 결과가 저장소 상태와 분리된다.

Juleswhile은 프로젝트 목표를 작은 TASK로 분리하고, GitHub를 상태 관리와 품질 검증의 중심으로 사용하여 이 문제를 해결한다.

---

## 4. 대상 사용자

### 주요 사용자

- 여러 AI 프로젝트를 운영하는 1인 개발자
- Jules를 이용해 반복 개발 작업을 자동화하려는 개발자
- AI 기반 뉴스·리서치·콘텐츠 사이트 운영자
- 프로젝트별 AI 팀 구조를 재사용하려는 사용자
- GitHub 중심 자동화 환경을 원하는 사용자

### 보조 사용자

- 소규모 개발팀
- AI 콘텐츠 운영팀
- 기술 리서치팀
- 마케팅 자동화 팀
- 웹서비스 프로토타입 팀

---

## 5. 핵심 사용자 시나리오

### 시나리오 A. AI 트렌드 뉴스 팩토리

사용자는 Goal Issue에 다음 목표를 입력한다.

> 최신 AI 기술, 제품, 연구, 기업 동향을 수집하고 검증하여 지속적으로 게시하는 웹사이트를 만든다.

Juleswhile은 다음 TASK를 생성한다.

1. 정보원 조사
2. 수집 정책 정의
3. 콘텐츠 분류 체계 정의
4. 데이터 스키마 설계
5. 수집기 구현
6. 중복 제거 구현
7. 요약 및 분석 규칙 작성
8. 기사 페이지 설계
9. Stitch UI 설계
10. 웹사이트 구현
11. 품질 검증
12. Netlify 배포
13. 운영 자동화
14. 장애 감시

### 시나리오 B. 경제·금융 리서치 팩토리

사용자는 다음 목표를 입력한다.

> 경제·금융 뉴스와 리포트를 수집하여 시장, 산업, 자산별 분석 보고서를 생성한다.

Juleswhile은 출처 검증, 수치 검증, 사실·해석 분리, 위험 고지, 게시 승인 단계를 포함한 TASK를 생성한다.

### 시나리오 C. 신규 웹서비스 개발

사용자는 서비스 아이디어와 제약사항을 Goal Issue에 작성한다.

Juleswhile은 기획, 정책, PRD, 아키텍처, 데이터 모델, UI/UX, 개발, QA, 배포 TASK를 순차적으로 생성한다.

### 시나리오 D. 운영 중인 웹사이트 개선

사용자는 기존 저장소에 개선 목표 Issue를 작성한다.

Juleswhile은 현황 분석 후 기능 개선, 콘텐츠 개선, SEO, 성능, 접근성, 테스트 TASK를 생성한다.

---

## 6. 프로젝트 범위

### 포함 범위

- Goal Issue 수집
- 목표 정규화
- WBS 생성
- TASK 생성
- TASK Schema 검증
- TASK 의존성 검증
- 실행 가능 TASK 선택
- Jules API 세션 생성
- Jules 역할 프롬프트 전달
- TASK별 Pull Request 생성
- CI 검증
- CI 실패 보완
- 자동 병합 제어
- 다음 TASK 활성화
- 상태 복구
- 사용량 제한
- 동시 실행 제한
- Netlify 배포 상태 확인
- 운영 대시보드용 데이터 생성
- Stitch MCP 활용 규칙
- 프로젝트별 역할 템플릿
- 프로젝트별 문서 구조

### 제외 범위

초기 버전에서는 다음을 직접 제공하지 않는다.

- 자체 LLM 모델 호스팅
- 자체 GPU 인프라
- 별도 Redis 또는 메시지 큐
- 별도 PostgreSQL 상태 서버
- 다중 GitHub 영구 브랜치 전략
- 무제한 자율 실행
- 무검토 결제 정책 변경
- 무검토 운영 데이터 삭제
- 고객 대상 자동 스팸 발송
- 법률·의료·금융 판단 자동 확정
- 외부 유료 자원의 무승인 생성
- Jules 계정 사용량 우회
- CAPTCHA 우회
- 접근 권한 우회

---

## 7. 시스템 원칙

### GitHub as Control Plane

GitHub Issues, Pull Requests, Actions, 파일 Manifest를 프로젝트 제어 평면으로 사용한다.

### Jules as Worker

Jules는 TASK를 실행한다.

Jules가 프로젝트 전체 상태를 직접 결정하지 않는다.

### Manifest as Contract

TASK는 자유 형식 문장만으로 관리하지 않는다.

모든 TASK는 Schema로 검증 가능한 Manifest를 가진다.

### CI as Quality Gate

AI가 완료했다고 주장하는 것과 실제 완료를 구분한다.

빌드, 테스트, 스키마, 정책 검증을 통과해야 한다.

### Main as SSOT

승인된 결과만 `main`에 존재한다.

### Netlify as Visible Result

웹 프로젝트의 결과는 `main` 병합 후 Netlify에서 확인한다.

### Human Authority

사용자는 다음 권한을 유지한다.

- 자동화 중지
- 프로젝트 목표 변경
- TASK 취소
- BLOCKED TASK 해결
- 민감 작업 승인
- 자동 병합 비활성화
- 프로젝트 종료

---

## 8. AI 팀 역할

Juleswhile의 기본 AI 역할은 다음과 같다.

| 역할 | 책임 |
|---|---|
| Project Planner | 목표 분석, 범위, WBS, TASK 분해 |
| Business Analyst | 사용자 요구, 정책, 비즈니스 규칙 |
| Researcher | 조사, 출처, 사실 검증 |
| Marketer | 시장, 고객, 포지셔닝, 콘텐츠 전략 |
| Solution Architect | 시스템 구조, 데이터, API, 보안 |
| UX Designer | 정보 구조, 화면, Stitch 작업 |
| Developer | 코드와 테스트 구현 |
| Verifier | 빌드, 테스트, 완료 조건 검증 |
| Reviewer | 정합성, 품질, 보안, 위험 검토 |
| Publisher | 콘텐츠 게시와 릴리스 관리 |

역할은 별도의 모델 인스턴스를 의미하지 않는다.

각 역할은 TASK에 포함된 프롬프트, 입력, 출력, 권한, 검증 기준으로 구분된다.

---

## 9. 자율성 수준

기본 자율성은 `guarded`다.

### `manual`

- 사용자가 각 TASK 실행을 승인한다.
- 자동 병합을 사용하지 않는다.
- 다음 TASK를 자동 실행하지 않는다.

### `guarded`

- 낮은 위험의 TASK는 자동 실행할 수 있다.
- CI 통과 시 자동 병합할 수 있다.
- 민감 작업은 사람 승인을 요구한다.
- 실패 보완 횟수를 제한한다.

### `limited-autonomous`

- 승인된 프로젝트 범위에서 후속 TASK를 자동 실행한다.
- 일일 예산과 동시 실행량을 강제한다.
- 금지 작업은 자동으로 차단한다.
- 정기적인 사람 검토 지점을 둔다.

초기 기본값:

```yaml
autonomy_mode: guarded
```

---

## 10. 사용량 정책

기본 Google Jules 사용량 정책:

```yaml
quota_policy:
  daily_hard_limit: 100
  new_task_budget: 65
  correction_budget: 20
  maintenance_budget: 10
  emergency_reserve: 5
  max_concurrent: 10
```

최대 지원량을 모두 사용하도록 설계하지 않는다.

오류 수정과 장애 대응을 위한 예비량을 유지한다.

---

## 11. 보안 경계

자동 실행 금지 또는 사람 승인이 필요한 작업:

* Secrets 생성·조회·출력
* 인증 정책 변경
* 관리자 권한 변경
* 결제 및 환불 정책 변경
* 운영 데이터 삭제
* 파괴적 DB 마이그레이션
* 도메인 소유권 변경
* 외부 유료 서비스 생성
* 대량 사용자 메시지 발송
* 개인정보 외부 전송
* 법적 문서 최종 확정
* 금융 투자 권유 자동 게시
* 보안 규칙 비활성화
* Branch Ruleset 해제

---

## 12. 성공 조건

Juleswhile 초기 버전은 다음 조건을 충족하면 성공으로 판단한다.

### 템플릿 생성

* 새 GitHub 저장소를 템플릿에서 생성할 수 있다.
* 필수 환경 설정 문서가 제공된다.
* Secret과 Variable이 저장소 밖에서 관리된다.

### Goal Intake

* `[GOAL]` Issue를 감지할 수 있다.
* Goal 정보를 정규화할 수 있다.
* Planner Jules 세션을 생성할 수 있다.
* WBS와 TASK Manifest PR을 생성할 수 있다.

### TASK Management

* TASK Schema를 검증할 수 있다.
* 의존성 순환을 탐지할 수 있다.
* 실행 가능한 TASK를 선택할 수 있다.
* 동일 TASK의 중복 실행을 차단할 수 있다.

### Jules Execution

* TASK 하나를 Jules 세션 하나에 전달할 수 있다.
* TASK 역할과 입력·출력을 프롬프트에 포함할 수 있다.
* Jules가 Pull Request를 생성할 수 있다.

### Validation

* PR에서 lint, test, build를 실행할 수 있다.
* TASK 완료 조건을 검증할 수 있다.
* CI 실패를 보완 흐름으로 전환할 수 있다.
* 최대 수정 횟수를 강제할 수 있다.

### Delivery

* 성공한 PR을 `main`에 병합할 수 있다.
* Netlify가 `main`을 자동 배포할 수 있다.
* 배포 상태를 TASK에 기록할 수 있다.
* 다음 TASK를 활성화할 수 있다.

### Recovery

* 중단된 TASK를 탐지할 수 있다.
* 시간 초과 TASK를 재시도하거나 차단할 수 있다.
* 자동화 전체를 Repository Variable로 중지할 수 있다.

---

## 13. 비기능 요구사항

### 재현성

동일한 TASK는 동일한 입력과 저장소 상태를 기준으로 실행되어야 한다.

### 추적성

모든 작업은 다음 항목과 연결되어야 한다.

```text
Goal Issue
→ TASK ID
→ Jules Session
→ Working Branch
→ Pull Request
→ CI Result
→ Merge Commit
→ Deployment
```

### 제한성

에이전트는 허용된 경로와 작업만 수행해야 한다.

### 복구 가능성

실패한 작업은 원인과 상태를 보존해야 한다.

### 감사 가능성

누가, 언제, 어떤 TASK를 실행했고 어떤 결과가 생성됐는지 확인할 수 있어야 한다.

### 이식성

특정 프로젝트 코드에 종속되지 않고 다양한 프로젝트 유형에 적용할 수 있어야 한다.

---

## 14. 초기 구축 단계

### Phase 1. Repository Contract

* `AGENTS.md`
* `README.md`
* Goal Issue Form
* TASK Issue Form
* PR Template

### Phase 2. Roles and Prompts

* Planner
* Analyst
* Researcher
* Marketer
* Architect
* Designer
* Developer
* Verifier
* Reviewer

### Phase 3. State and Schema

* Goal Schema
* TASK Schema
* Project State Schema
* TASK Index
* Dependency Validator

### Phase 4. GitHub Automation

* Goal Intake
* Jules Dispatcher
* PR Validation
* Auto Merge
* Next TASK
* Reconciler
* Content Schedule
* Netlify Status

### Phase 5. Pilot

다음 중 하나를 Pilot Project로 실행한다.

* AI 트렌드 뉴스 팩토리
* 경제·금융 리서치 팩토리
* AI 도구 설명서 사이트

### Phase 6. Stabilization

* 중복 실행 방지
* 실패 복구
* 사용량 제어
* 동시성 제어
* 보안 검토
* 운영 문서
* 템플릿 배포

---

## 15. 현재 상태

현재 저장소는 Juleswhile 템플릿 자체를 구축하는 단계다.

```yaml
current_phase: repository-contract
automation_enabled: false
pilot_started: false
production_ready: false
```

자동화는 Schema, CI, 상태 머신, Dispatcher 검증이 완료된 후 활성화한다.