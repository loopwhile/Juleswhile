# Juleswhile Operator Guide 09 · Troubleshooting
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
# 35. 일일 운영 체크리스트
```text
[ ] state:failed TASK가 없는가?
[ ] state:blocked TASK가 없는가?
[ ] 오래된 state:running TASK가 없는가?
[ ] 열린 Draft PR이 없는가?
[ ] validation:failed PR이 없는가?
[ ] state:merge-blocked PR이 없는가?
[ ] Unknown Dispatch Outcome이 없는가?
[ ] Netlify Production이 ready인가?
[ ] Jules 일일 사용량이 예산 안에 있는가?
[ ] main과 Production이 일치하는가?
[ ] Secret 노출 사고가 없는가?
[ ] Reconciler가 정상 실행됐는가?
```
---
# 36. 프로젝트 목표 변경
기존 목표를 파일에서 조용히 수정하지 않는다.
중대한 목표 변경은 새 Goal Issue로 작성한다.
```text
[GOAL] 기존 프로젝트에 새로운 목표 추가
```
명시할 내용:
* 기존 프로젝트와의 관계
* 변경 목표
* 영향 범위
* 마이그레이션
* 기존 TASK 취소 여부
* 새로운 위험
* 새로운 품질 기준
* 새로운 완료 조건
---
# 37. 프로젝트 종료
먼저 자동화를 중지한다.
```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```
확인:
```bash
gh pr list \
  --repo "$REPOSITORY" \
  --state open
gh issue list \
  --repo "$REPOSITORY" \
  --state open
```
최종 상태:
```json
{
  "status": "completed",
  "phase": "completed"
}
```
최종 변경도 Pull Request로 제출한다.
---
# 38. 정상 운영 완료 기준
```text
GitHub
- main 하나만 영구 브랜치
- Jules App 연결
- Actions 쓰기 권한
- Secret과 Variable 설정
- PR Validation 정상
- Custom Auto Merge 정상
- Main Integrity Audit 정상
Jules
- API Key 유효
- Source 유효
- 저장소 접근 가능
- One Session, One TASK
- 중복 Session 없음
Netlify
- GitHub 저장소 연결
- Production Branch main
- Build 성공
- Merge Commit과 Deploy Commit 일치
Automation
- AUTOMATION_ENABLED=true
- CONTENT_AUTOMATION_ENABLED=false 또는 명시적 활성화
- JULES_MAX_CONCURRENCY=1
- Goal Intake 정상
- TASK Dispatch 정상
- Next TASK 정상
- Reconciler 정상
- Content Schedule disabled no-op 정상
Project
- PROJECT_GOAL.md가 Goal Issue를 반영
- TASK Manifest 유효
- Runtime Projection 정합
- 완료 TASK Issue 종료
- Active Session, PR, Lock 정합
- main과 Production 일치
```
Juleswhile의 운영 목표:
```text
사람은 목표와 안전 경계를 정의한다.
Planner는 목표를 검증 가능한 TASK로 분해한다.
Jules는 TASK를 하나씩 수행한다.
GitHub Actions는 선택, 검증, 병합과 상태 전이를 통제한다.
Netlify는 main의 결과를 Production으로 보여준다.
실패하거나 결과가 불명확하면 시스템은 멈추고 사람에게 통제권을 돌려준다.
```
