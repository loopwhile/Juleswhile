---

schema_version: 1
project_name: "<PROJECT_NAME>"
project_type: "<PROJECT_TYPE>"
status: template
goal_issue_number: null
goal_issue_url: null
autonomy_mode: guarded
publishing_mode: review_required
primary_branch: main
created_at: null
last_updated_at: null
---
# Project Goal Template
> 이 파일은 새 프로젝트의 Goal을 기록하기 위한 committed snapshot 템플릿이다.
>
> 새 프로젝트를 시작할 때 이 파일을 사람이 임의로 완성하지 않는다.
> `[GOAL]` Issue를 작성하고 Planner Pull Request를 통해 실제 프로젝트 목표로 교체한다.
>
> `<PLACEHOLDER>`는 Planner PR에서 모두 실제 값으로 변경해야 한다.
## 1. 문서 권위
프로젝트 목표의 최초 입력은 GitHub Project Goal Issue다.
```text
[GOAL] Issue
→ Planner Jules Session
→ Planner 분석
→ PROJECT_GOAL.md 갱신
→ WBS와 TASK Manifest 생성
→ Planner Pull Request
→ 사람 검토
→ PR Validation
→ main 병합
```
이 파일은 병합된 Goal의 committed snapshot이다.
Goal Issue와 이 파일이 불일치하면 새 Goal Issue 또는 Correction TASK를 통해 정합화한다.
## 2. 프로젝트 메타데이터
| 항목            | 값                          |
| ------------- | -------------------------- |
| 프로젝트 이름       | `<PROJECT_NAME>`           |
| 프로젝트 유형       | `<PROJECT_TYPE>`           |
| 상태            | `template`                 |
| Goal Issue    | `미생성`                      |
| 기본 자율성        | `guarded`                  |
| 게시 정책         | `review_required`          |
| 영구 브랜치        | `main`                     |
| Production 환경 | `<PRODUCTION_ENVIRONMENT>` |
| 목표 완료일        | `<YYYY-MM-DD 또는 미정>`       |
## 3. 프로젝트 개요
### 3.1 한 문장 설명
```text
<이 프로젝트가 무엇을 만드는지 한 문장으로 작성>
```
### 3.2 최상위 목표
```text
<무엇을 만들고, 어떤 문제를 해결하며,
최종적으로 어떤 상태가 되어야 하는지 작성>
```
### 3.3 최종 결과
프로젝트 완료 시 다음 결과가 존재해야 한다.
* `<최종 산출물 1>`
* `<최종 산출물 2>`
* `<최종 산출물 3>`
* `<Production 결과>`
* `<운영 문서>`
* `<검증 결과>`
## 4. 해결하려는 문제
### 현재 문제
```text
<현재 사용자가 겪는 문제, 비용, 비효율 또는 위험>
```
### 프로젝트가 필요한 이유
```text
<기존 방식으로 해결하기 어려운 이유>
```
### 해결 후 기대 변화
```text
<프로젝트 완료 후 사용자의 업무나 경험이 어떻게 달라지는지 작성>
```
## 5. 대상 사용자
### 주요 사용자
* `<주요 사용자 1>`
* `<주요 사용자 2>`
### 보조 사용자
* `<보조 사용자 1>`
* `<보조 사용자 2>`
### 주요 사용 상황
1. `<사용 상황 1>`
2. `<사용 상황 2>`
3. `<사용 상황 3>`
## 6. 기대 산출물
### 기획 및 정책
* `<프로젝트 개요>`
* `<요구사항 문서>`
* `<업무 또는 제품 정책>`
* `<범위와 제외 범위>`
### 설계
* `<시스템 아키텍처>`
* `<데이터 모델>`
* `<API 계약>`
* `<UI/UX 설계>`
* `<보안과 권한 설계>`
### 구현
* `<애플리케이션 또는 콘텐츠>`
* `<자동화>`
* `<테스트>`
* `<배포 설정>`
### 운영
* `<운영자 가이드>`
* `<장애 대응 절차>`
* `<모니터링>`
* `<Production URL 또는 배포 결과>`
## 7. 핵심 기능
| ID      | 기능        | 설명        | 필수 여부 |
| ------- | --------- | --------- | ----- |
| `F-001` | `<기능 이름>` | `<기능 설명>` | 필수    |
| `F-002` | `<기능 이름>` | `<기능 설명>` | 필수    |
| `F-003` | `<기능 이름>` | `<기능 설명>` | 선택    |
기능은 사용자 관점에서 검증할 수 있어야 한다.
## 8. 프로젝트 범위
### 포함 범위
* `<포함 범위 1>`
* `<포함 범위 2>`
* `<포함 범위 3>`
### 제외 범위
* `<제외 범위 1>`
* `<제외 범위 2>`
* `<제외 범위 3>`
제외 범위에 포함된 기능은 Planner가 구현 TASK로 생성하지 않는다.
## 9. 제약사항
### 기술 제약
* 영구 브랜치는 `main` 하나만 사용한다.
* 모든 정상 변경은 Pull Request로 제출한다.
* CI를 통과한 결과만 `main`에 반영한다.
* Secret은 저장소에 기록하지 않는다.
* `<추가 기술 제약>`
### 비용 제약
* `<월간 비용 상한>`
* `<유료 API 사용 제한>`
* `<인프라 제한>`
### 일정 제약
* 목표 완료일: `<YYYY-MM-DD 또는 미정>`
* 중간 검토일: `<YYYY-MM-DD 또는 미정>`
### 계정과 사용량 제약
* Google Jules 사용량 한도를 준수한다.
* 초기 최대 동시 실행량은 `1`이다.
* 일일 사용량 예산을 초과하지 않는다.
* `<추가 계정 제약>`
### 운영 제약
* Production Branch는 `main`이다.
* Netlify Production 검증 전에는 TASK를 완료하지 않는다.
* `<추가 운영 제약>`
## 10. 데이터 및 정보 출처 정책
### 우선 출처
* `<공식 문서>`
* `<공식 API>`
* `<정부·공공기관>`
* `<논문 원문>`
* `<공식 GitHub 저장소>`
### 보조 출처
* `<신뢰 가능한 전문 매체>`
* `<공식 발표 영상>`
* `<검증 가능한 2차 자료>`
### 금지 출처
* 원문을 확인할 수 없는 재가공 콘텐츠
* 작성일과 출처가 없는 정보
* 출처 없는 수치와 성능 주장
* 커뮤니티 추측을 사실로 단정한 자료
* 라이선스와 이용 조건을 확인할 수 없는 데이터
### 최신성 기준
```text
<정보 유형별 허용 최신성 작성>
```
예:
```text
가격과 사용량: 최근 30일 이내 확인
제품 기능: 최근 90일 이내 확인
법률과 정책: 답변 또는 게시 시점에 재확인
고정된 역사적 사실: 원문 출처 확인
```
### 검증 기준
* 중요한 사실은 가능한 경우 2개 이상의 출처로 교차 검증한다.
* 가격, 일정, 정책과 지원 범위에는 확인 날짜를 기록한다.
* 사실과 해석을 구분한다.
* 불확실한 내용은 불확실하다고 표시한다.
* 과도한 원문 인용을 금지한다.
## 11. AI 팀 작업 범위
이번 프로젝트에서 사용할 역할을 선택한다.
```text
[ ] Project Planner
[ ] Business Analyst
[ ] Researcher
[ ] Marketer
[ ] Solution Architect
[ ] Contract Designer
[ ] Data Designer
[ ] UX Designer
[ ] Stitch Designer
[ ] Frontend Developer
[ ] Backend Developer
[ ] QA / Verifier
[ ] Security Reviewer
[ ] Publisher
[ ] Operations
```
### 역할별 제한
* 각 Jules Session은 하나의 TASK만 처리한다.
* 역할은 TASK 계약에 정의된 허용 경로만 수정한다.
* 다음 TASK는 Jules가 선택하지 않는다.
* 민감 작업은 자동 승인하지 않는다.
* 역할 간 파일 충돌은 Resource Lock으로 방지한다.
## 12. 자율성 정책
기본값:
```text
guarded
```
### 허용되는 자동 실행
* 낮은 위험의 문서 작성
* 비파괴적 코드 구현
* 테스트 작성
* 정적 분석
* CI 검증
* 승인된 범위의 Netlify 배포
* `<프로젝트별 허용 작업>`
### 사람 승인이 필요한 작업
* 인증·인가 정책
* 결제 및 환불
* 사용자 데이터 삭제
* 파괴적 데이터베이스 변경
* Secret과 Credential 변경
* 도메인과 인프라 변경
* 유료 자원 생성
* 외부 사용자에게 직접 영향을 주는 정책
* 법률·의료·금융 결과 확정
* `<프로젝트별 승인 작업>`
### 자동 실행 금지
* CI 우회
* Secret 출력
* 승인 없는 Production 데이터 삭제
* 무제한 TASK 생성
* 중복 Jules Session 생성
* Unknown Dispatch 결과에서 즉시 재시도
* CAPTCHA 또는 접근 권한 우회
* `<프로젝트별 금지 작업>`
## 13. 게시 및 배포 정책
### 기본 정책
```text
<모든 배포를 사람이 승인
또는
CI 통과 시 자동 배포
또는
일반 콘텐츠만 자동 게시
또는
초안까지만 자동 생성>
```
### Production 조건
다음 조건을 모두 충족해야 한다.
* PR Validation 성공
* 필수 사람 승인 충족
* Custom Auto Merge 성공
* `main` 반영
* Netlify Build 성공
* Deploy Commit과 Merge Commit 일치
* Production URL 확인
* Secret 노출 없음
## 14. 필수 품질 검증
### 공통 검증
* `npm run lint`
* `npm run validate:supply-chain`
* `npm run validate:schemas`
* `npm run validate:task-graph`
* `npm run typecheck`
* `npm test`
* `npm run build`
* `npm run ci`
### 프로젝트별 검증
* `<검증 1>`
* `<검증 2>`
* `<검증 3>`
### 콘텐츠 프로젝트 추가 검증
* 출처 존재 여부
* 확인 날짜
* 중복 콘텐츠
* 사실과 해석 구분
* 저작권 침해 가능성
* 내부 링크
* SEO metadata
* 모바일 화면
### 웹서비스 추가 검증
* 인증과 권한
* 입력 검증
* 오류 처리
* 데이터 무결성
* 접근성
* 반응형 화면
* 성능
* 보안 회귀 테스트
## 15. 위험 관리
| ID         | 위험     | 수준                  | 완화 방법     | 승인 필요      |
| ---------- | ------ | ------------------- | --------- | ---------- |
| `RISK-001` | `<위험>` | `<low/medium/high>` | `<완화 방법>` | `<yes/no>` |
| `RISK-002` | `<위험>` | `<low/medium/high>` | `<완화 방법>` | `<yes/no>` |
기본 위험 항목:
* Jules 사용량 초과
* 외부 API 변경
* Netlify Build 실패
* AI 생성 결과 오류
* Secret 노출
* 중복 Session
* 잘못된 TASK 의존성
* 파일 범위 충돌
* 라이선스와 저작권
* Production 결과 불일치
## 16. 의사결정 필요 항목
| ID        | 의사결정      | 선택지     | 결정자       | 필요 시점  | 상태     |
| --------- | --------- | ------- | --------- | ------ | ------ |
| `DEC-001` | `<결정 내용>` | `<선택지>` | `<owner>` | `<단계>` | `open` |
의사결정이 완료되지 않은 민감 TASK는 `BLOCKED` 상태를 유지한다.
## 17. 프로젝트 성공 조건
모든 성공 조건은 검증 가능해야 한다.
| ID       | 성공 조건                                            | 검증 방법                          | 필수 |
| -------- | ------------------------------------------------ | ------------------------------ | -- |
| `AC-001` | Goal Issue에서 Planner Session이 정확히 하나 생성된다.       | GitHub Actions와 Issue Evidence | 예  |
| `AC-002` | Planner가 PROJECT_GOAL, WBS와 TASK Manifest를 생성한다. | Planner PR                     | 예  |
| `AC-003` | TASK dependency graph가 유효하다.                     | `npm run validate:task-graph`  | 예  |
| `AC-004` | 각 TASK에 입력, 출력, 허용 경로와 검증 기준이 있다.                | Manifest Review                | 예  |
| `AC-005` | 모든 변경이 Pull Request로 제출된다.                       | GitHub PR History              | 예  |
| `AC-006` | 모든 필수 CI가 통과한다.                                  | GitHub Actions                 | 예  |
| `AC-007` | Production 결과가 Merge Commit과 일치한다.               | Netlify Deploy Evidence        | 예  |
| `AC-008` | `<프로젝트별 성공 조건>`                                  | `<검증 방법>`                      | 예  |
프로젝트별 성공 조건을 추가한다.
## 18. 완료 정의
프로젝트는 다음 조건을 모두 충족했을 때 완료된다.
```text
[ ] 모든 필수 TASK가 COMPLETED다.
[ ] READY, RUNNING, VALIDATING, DEPLOYING TASK가 없다.
[ ] Active Jules Session이 없다.
[ ] Active TASK Pull Request가 없다.
[ ] Resource Lock이 없다.
[ ] Unresolved Dispatch Intent가 없다.
[ ] Duplicate Session이 없다.
[ ] 모든 필수 CI가 성공했다.
[ ] Netlify Production이 성공했다.
[ ] 운영 문서가 존재한다.
[ ] PROJECT_GOAL.md와 실제 결과가 일치한다.
[ ] 운영자가 최종 결과를 승인했다.
```
## 19. Goal 변경 정책
중대한 프로젝트 목표 변경은 이 파일만 직접 수정하지 않는다.
새 Goal Issue를 생성한다.
```text
[GOAL] 기존 프로젝트 목표 변경 또는 확장
```
새 Goal에는 다음을 포함한다.
* 기존 Goal과의 관계
* 변경 이유
* 변경 범위
* 기존 TASK에 미치는 영향
* 취소 또는 대체할 TASK
* 마이그레이션
* 새로운 위험
* 새로운 품질 기준
* 새로운 성공 조건
## 20. Source
Planner PR에서 실제 값으로 갱신한다.
```yaml
source:
  issue_number: null
  issue_url: null
  repository: "<OWNER/REPOSITORY>"
  planner_session_name: null
  planner_session_id: null
  planner_pr_number: null
```
## 21. 변경 이력
| 날짜             | 변경                  | 근거                          |
| -------------- | ------------------- | --------------------------- |
| `<YYYY-MM-DD>` | 초기 Goal snapshot 생성 | `<Goal Issue / Planner PR>` |
## Template 사용 규칙
1. `<PLACEHOLDER>`를 실제 값으로 교체한다.
2. 사용하지 않는 선택지는 삭제한다.
3. Secret과 개인정보를 기록하지 않는다.
4. Goal Issue와 Planner PR 번호를 기록한다.
5. 성공 조건은 검증 가능하게 작성한다.
6. 민감 작업의 승인자를 명시한다.
7. Planner PR이 병합되기 전에는 `status: template` 또는 `draft`를 유지한다.
8. Planner PR 병합 후 `status: active`로 변경한다.
