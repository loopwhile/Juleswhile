# Juleswhile 운영자 가이드
## Guide Index
- [Juleswhile Operator Guide 01 · Overview](OPERATOR-GUIDE-01-OVERVIEW.md) — sections 1, 2
- [Juleswhile Operator Guide 02 · Bootstrap](OPERATOR-GUIDE-02-BOOTSTRAP.md) — sections 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
- [Juleswhile Operator Guide 03 · Runtime Operations](OPERATOR-GUIDE-03-RUNTIME-OPERATIONS.md) — sections 15, 16, 17, 18, 19
- [Juleswhile Operator Guide 04 · TASK Lifecycle](OPERATOR-GUIDE-04-TASK-LIFECYCLE.md) — sections 20, 21, 27, 30
- [Juleswhile Operator Guide 05 · Pull Request And Merge](OPERATOR-GUIDE-05-PULL-REQUEST-AND-MERGE.md) — sections 22, 23, 24, 25
- [Juleswhile Operator Guide 06 · Deployment](OPERATOR-GUIDE-06-DEPLOYMENT.md) — sections 14, 26
- [Juleswhile Operator Guide 07 · Projection And Dashboard](OPERATOR-GUIDE-07-PROJECTION-AND-DASHBOARD.md) — sections 29, 31
- [Juleswhile Operator Guide 08 · Recovery](OPERATOR-GUIDE-08-RECOVERY.md) — sections 28, 32, 33, 34
- [Juleswhile Operator Guide 09 · Troubleshooting](OPERATOR-GUIDE-09-TROUBLESHOOTING.md) — sections 35, 36, 37, 38
## 1. 목적
이 문서는 Juleswhile 템플릿을 새로운 프로젝트에 적용하고, GitHub와 Google Jules를 이용해 실제 프로젝트를 운영하는 전체 절차를 설명한다.
완료 목표:
```text
Juleswhile 복제
→ Template Runtime 초기화
→ 새 GitHub 저장소 연결
→ Jules GitHub App 연결
→ Jules API Key와 Source 등록
→ Netlify 연결
→ Secret과 Variable 등록
→ 로컬 및 Workflow 검증
→ Guarded Automation 활성화
→ Project Goal Issue 생성
→ Planner가 WBS와 TASK 생성
→ Jules가 TASK를 하나씩 수행
→ PR Validation
→ Custom Auto Merge
→ Netlify Production 검증
→ TASK 완료
→ 다음 TASK 반복
```
---
# 2. 운영 모델
## 2.1 사람의 역할
운영자는 다음을 담당한다.
* 프로젝트 최상위 목표 정의
* 비용, 일정, 제품과 보안 정책 결정
* 민감 작업 승인
* Draft PR과 계약 위반 PR 검토
* BLOCKED TASK 해결
* Unknown Dispatch 결과 판단
* 자동화 중지와 재개
* 프로젝트 출시와 종료 판단
## 2.2 Jules의 역할
Jules는 할당된 TASK 안에서 다음을 수행한다.
* 프로젝트 기획
* 요구사항 분석
* 리서치
* 시스템과 데이터 설계
* UI/UX 설계
* 코드 구현
* 테스트 작성
* 검증 명령 실행
* 임시 브랜치 생성
* Pull Request 생성
Jules는 다음 TASK를 스스로 선택하지 않는다.
## 2.3 GitHub Actions의 역할
GitHub Actions는 다음을 담당한다.
* Goal Issue 감지
* Planner Session 생성
* TASK Issue 생성과 동기화
* 다음 TASK 선택
* Quota 예약
* Dispatch Intent 기록
* Jules Session 생성
* PR 계약과 품질 검증
* 자동 병합 정책 평가
* Production 배포 확인
* TASK 완료
* 고착 상태 복구
* Runtime State Projection
* main 무결성 감사
## 2.4 상태 권위
Runtime 상태의 권위는 GitHub Issues와 Pull Requests다.
```text
GitHub Issues / Pull Requests
        ↓
Runtime Evidence
        ↓
Reconciler
        ↓
ops/state/project-state.json
```
`ops/tasks/task-index.yaml`은 TASK 계약과 의존성 Manifest다.
---
