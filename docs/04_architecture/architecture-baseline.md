# Juleswhile Architecture Baseline

## 1. 상태

- 결정 상태: Accepted
- 적용 TASK: TASK-013
- 후속 TASK: TASK-014, TASK-015, TASK-016, TASK-017
- 적용 대상: Juleswhile Control Plane
- 기존 Runtime 동작 변경: 없음
- 기본 Source Size 제한: 500줄

## 2. 목적

Juleswhile의 Control Plane 코드를 다음 다섯 계층으로 분리하기 위한
의존성 방향과 책임 경계를 정의한다.

```text
Domain
Application
Ports
Infrastructure
Entrypoints
```

TASK-013에서는 기존 대형 모듈을 즉시 이동하거나 분리하지 않는다.

이번 TASK의 역할은 다음 두 가지다.

1. 후속 리팩터링이 따라야 할 Architecture Contract를 고정한다.
2. 새로운 대형 파일과 기존 대형 파일의 추가 성장을 차단한다.

## 3. 범위

이 Architecture Baseline은 다음 경로에 적용된다.

```text
ops/domain/**
ops/application/**
ops/ports/**
ops/infrastructure/**
ops/scripts/**
.github/workflows/**
ops/tasks/**
ops/roles/**
ops/prompts/**
docs/**
README.md
QUICKSTART.md
AGENTS.md
operator-guide.md
PROJECT_GOAL.md
```

## 4. 비범위

TASK-013에서는 다음 작업을 수행하지 않는다.

- 기존 Runtime Controller의 기능 변경
- GitHub API 동작 변경
- Jules API 동작 변경
- TASK 상태 머신 변경
- Quota 정책 변경
- Session 생성 정책 변경
- Runtime Projection 동작 변경
- Dashboard 동작 변경
- Workflow Trigger 변경
- Netlify 설정 변경
- 인증, 결제, 사용자 기능 변경
- 기존 대형 모듈의 물리적 분할
- 기존 문서의 내용 분할

실제 모듈 분리는 TASK-014부터 순차적으로 수행한다.

## 5. 목표 디렉터리

```text
ops/
├── domain/
├── application/
├── ports/
├── infrastructure/
└── scripts/
```

빈 디렉터리를 미리 생성하지 않는다.

후속 TASK가 실제 모듈을 추가할 때 필요한 디렉터리를 생성한다.

## 6. Domain 계층

Domain은 GitHub, Jules, Netlify, 파일 시스템과 독립적인
순수한 업무 규칙을 표현한다.

허용되는 책임:

- TASK 상태와 전이 규칙
- Quota 정책
- Session 상태 해석
- Resource Lock 정책
- Runtime Projection 불변식
- Drift 판정
- 값 객체
- 순수한 검증 함수
- 결정적 계산

금지되는 의존성:

- `node:fs`
- `node:path`를 이용한 실제 파일 접근
- `fetch`
- `process.env`
- GitHub API Payload 직접 해석
- Jules API Payload 직접 해석
- Netlify API Payload 직접 해석
- CLI Argument Parsing
- 표준 출력
- 프로세스 종료

Domain은 같은 Domain 내부 모듈 이외의 상위 계층을 import하지 않는다.

## 7. Application 계층

Application은 하나의 Use Case 실행 순서를 조정한다.

예상 Use Case:

- SelectNextTask
- DispatchTask
- ReconcileProject
- RebuildProjection
- SynchronizeRuntime
- VerifyDeployment
- MaterializeTaskIssues

허용되는 책임:

- Domain 정책 호출
- Port 호출 순서 조정
- Transaction 경계 정의
- Use Case 입력과 결과 정의
- 실패 결과 분류

금지되는 의존성:

- Infrastructure 구현 직접 import
- 직접 HTTP 요청
- 직접 파일 읽기와 쓰기
- `process.env` 직접 접근
- GitHub 전용 JSON 구조 해석
- Jules 전용 JSON 구조 해석
- CLI 출력

Application은 Domain과 Ports에만 의존할 수 있다.

## 8. Ports 계층

Ports는 Application이 외부 시스템과 통신하기 위한 추상 계약이다.

예상 Port:

- GitHubGateway
- JulesGateway
- DeploymentGateway
- TaskRepository
- ProjectStateRepository
- RuntimeEvidenceRepository
- Clock
- IdentifierGenerator

허용되는 책임:

- 외부 시스템 작업의 인터페이스 정의
- Domain 타입을 사용하는 요청과 결과 정의
- 저장소 Transaction 계약 정의

금지되는 의존성:

- Infrastructure 구현
- CLI Entrypoint
- 환경 변수
- 직접 HTTP 요청
- 직접 파일 접근

Ports는 Domain 타입을 참조할 수 있다.

## 9. Infrastructure 계층

Infrastructure는 Port의 실제 구현을 제공한다.

예상 Adapter:

```text
ops/infrastructure/github/**
ops/infrastructure/jules/**
ops/infrastructure/netlify/**
ops/infrastructure/filesystem/**
```

허용되는 책임:

- GitHub REST API 호출
- Jules REST API 호출
- Netlify API 호출
- YAML과 JSON 직렬화
- 파일 시스템 접근
- Retry와 Timeout
- 외부 오류 분류
- 외부 Payload를 Domain 또는 Application 타입으로 변환

Infrastructure는 Domain과 Ports에 의존할 수 있다.

Infrastructure는 Application Use Case의 실행 순서를 소유하지 않는다.

## 10. Entrypoints 계층

현재 `ops/scripts/*.ts`는 CLI Entrypoint와 기존 Runtime Controller가
혼재된 상태다.

최종 Entrypoint의 책임은 다음으로 제한한다.

- CLI Argument Parsing
- 환경 변수 읽기
- Adapter 구성
- Application Use Case 호출
- 결과 출력
- Exit Code 결정

Entrypoint는 Composition Root이므로 Domain, Application, Ports,
Infrastructure를 조립할 수 있다.

Entrypoint에 업무 정책을 새로 추가하지 않는다.

## 11. 허용 의존성 방향

```text
Entrypoints
  ├── Application
  ├── Infrastructure
  ├── Ports
  └── Domain

Infrastructure
  ├── Ports
  └── Domain

Application
  ├── Ports
  └── Domain

Ports
  └── Domain

Domain
  └── Domain
```

## 12. 금지 의존성 방향

다음 역참조를 금지한다.

```text
Domain         -> Application
Domain         -> Ports
Domain         -> Infrastructure
Domain         -> Entrypoints

Ports          -> Application
Ports          -> Infrastructure
Ports          -> Entrypoints

Application    -> Infrastructure
Application    -> Entrypoints

Infrastructure -> Entrypoints
```

## 13. Source Size 정책

기본 제한은 파일당 500줄이다.

적용 그룹:

- TypeScript Control Plane Source
- GitHub Workflow YAML
- TASK Manifest YAML
- 운영 문서
- Role 및 Prompt 문서

라인 수는 UTF-8 텍스트의 물리적 줄 수를 기준으로 계산한다.

빈 줄과 주석도 파일의 유지보수 비용에 포함되므로 줄 수에 포함한다.

## 14. Ratchet 정책

현재 이미 500줄을 초과한 파일은 즉시 CI 실패로 만들지 않는다.

대신 `ops/config/source-size-baseline.json`에 다음 정보를 기록한다.

- 파일 경로
- 현재 허용 가능한 최대 줄 수
- 제거를 담당하는 후속 TASK
- 예외 사유

기준선 파일에 등록된 기존 대형 파일도 다음 규칙을 따른다.

1. 기준선보다 한 줄이라도 증가하면 실패한다.
2. 파일이 500줄 이하가 되면 예외 항목을 제거해야 한다.
3. 삭제된 파일의 예외 항목이 남아 있으면 실패한다.
4. 새로 생성된 500줄 초과 파일은 실패한다.
5. 기준선에 없는 기존 파일이 500줄을 초과하면 실패한다.
6. 예외 최대 줄 수를 임의로 상향하면 안 된다.

이 정책은 현재 기술 부채를 고정하고 후속 TASK에서 감소시키는
단방향 Ratchet이다.

## 15. 예외 제거 책임

### TASK-014

Projection과 Reconciler 영역을 분리한다.

주요 대상:

- reconcile-project.ts
- reconcile-project.test.ts
- project-state-projection.ts
- project-state-projection.test.ts
- rebuild-project-state.ts

### TASK-015

Selector, Dispatcher, Issue Materialization과 상태 전이를 분리한다.

주요 대상:

- dispatch-jules.ts
- select-next-task.ts
- materialize-issues.ts
- validate-task-graph.ts
- task-state-transition.ts

### TASK-016

Workflow, TASK History, 운영 문서, Role 및 Prompt 문서를 분리한다.

주요 대상:

- Workflow YAML
- task-history.yaml
- README.md
- AGENTS.md
- PROJECT_GOAL.md
- operator-guide.md
- Role 문서
- Prompt 문서

### TASK-017

남은 예외가 없는지 검증하고 Architecture Dependency Gate와
Bootstrap 회귀 검증을 수행한다.

## 16. 테스트 원칙

Source Size Validator는 최소한 다음 동작을 검증해야 한다.

- 모든 관리 파일이 500줄 이하면 성공
- 신규 500줄 초과 파일은 실패
- 등록된 예외가 기준선 이하이면 성공
- 등록된 예외가 기준선을 초과하면 실패
- 삭제된 파일의 예외가 남아 있으면 실패
- 500줄 이하 파일의 불필요한 예외는 실패
- 중복 예외 경로는 실패
- 정렬되지 않은 예외 목록은 실패
- 잘못된 경로와 Repository 외부 경로는 실패
- 동일 입력은 결정적인 결과를 생성

## 17. 마이그레이션 순서

```text
TASK-013
Architecture Contract와 Source Size Ratchet

TASK-014
Projection 및 Reconciler 분리

TASK-015
Selector 및 Dispatcher 분리

TASK-016
Workflow, TASK Manifest, 문서 분리

TASK-017
전체 Architecture와 Bootstrap 최종 검증
```

TASK-014와 TASK-015는 공통 Adapter와 Runtime 타입 충돌을 피하기 위해
순차적으로 수행한다.

## 18. 완료 조건

TASK-013은 다음 조건을 만족해야 한다.

- Architecture 계층 책임이 문서화되어 있다.
- 허용 및 금지 의존성 방향이 명시되어 있다.
- 500줄 제한이 기계적으로 검증된다.
- 현재 초과 파일은 정확한 기준선으로만 허용된다.
- 기존 초과 파일은 더 커질 수 없다.
- 신규 초과 파일은 허용되지 않는다.
- Validator 단위 테스트가 존재한다.
- Validator가 CI 경로에 연결된다.
- 기존 Runtime 동작은 변경되지 않는다.
- 기존 전체 CI가 통과한다.
