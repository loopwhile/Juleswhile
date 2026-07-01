# Juleswhile Operator Guide 04 · TASK Lifecycle
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
# 20. Project Goal Issue
GitHub에서 다음으로 이동한다.
```text
Issues
→ New issue
→ Project Goal
```
제목:
```text
[GOAL] 프로젝트 목표
```
Goal Issue는 사람이 TASK 전체를 작성하는 문서가 아니다.
다음 경계와 결과를 정의한다.
* 무엇을 만들 것인가
* 누구를 위한 것인가
* 어떤 문제를 해결하는가
* 최종 산출물은 무엇인가
* 어떤 기능이 필수인가
* 무엇을 하지 않는가
* 어떤 기술·비용·일정 제한이 있는가
* 어떤 테스트를 통과해야 하는가
* 어떤 작업을 AI가 자동 수행할 수 있는가
* 어떤 작업에 사람 승인이 필요한가
* 어디에 배포하는가
* 어떤 위험이 있는가
Secret과 개인정보는 입력하지 않는다.
---
# 21. Planner 결과 검토
Planner는 다음 파일을 생성하거나 수정해야 한다.
* `PROJECT_GOAL.md`
* 프로젝트 개요
* 범위와 제외 범위
* WBS
* `ops/tasks/task-index.yaml`
* `ops/state/project-state.json`
* TASK 의존성
* 위험 요소
* 검증 계획
Planner PR 제목:
```text
[GOAL-N] Initialize project plan and TASK graph
```
Planner PR 본문:
```markdown
<!-- juleswhile:task-pr -->
Goal Issue: #N
```
검토 항목:
* Goal을 잘못 해석하지 않았는가
* 지나치게 큰 TASK가 없는가
* TASK dependency cycle이 없는가
* 허용 경로가 분리됐는가
* Resource Lock이 적절한가
* 민감 작업이 사람 승인으로 분류됐는가
* 검증 명령이 구체적인가
* 아직 실행하지 않은 TASK가 완료로 표시되지 않았는가
---
# 27. Next TASK Selector
`05 · Next TASK`는 다음을 확인한다.
* READY TASK
* 의존성 충족
* 동시 실행 상한
* 일일 Jules 예산
* Resource Lock
* 충돌 TASK
* 기존 실행 Session
* 기존 TASK Issue
* 기존 Dispatch Evidence
실행 가능한 TASK 하나만 선택한다.
기본 동시 실행량은 `1`이다.
---
# 30. Content Schedule
기본값:
```text
CONTENT_AUTOMATION_ENABLED=false
```
비활성 상태에서는 Schedule이 성공 no-op으로 끝나야 한다.
실제로 사용할 때 필요한 항목:
* 유효한 Content TASK Template
* `CONTENT_TASK_TEMPLATE_ID`
* 콘텐츠 유형
* 주제
* 기간 Key
* 중복 방지 정책
* 출처 정책
* 게시 승인 정책
활성화:
```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```
Core Automation과 별도로 관리한다.
---
