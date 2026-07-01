# Juleswhile Operator Guide 08 · Recovery
[Operator Guide Index](OPERATOR-GUIDE-01-OVERVIEW.md)
# 28. Unknown Dispatch Outcome
다음 오류는 결과가 불명확할 수 있다.
* Timeout
* Connection reset
* HTTP 408
* HTTP 425
* HTTP 5xx
* 응답 파싱 전 연결 종료
이 경우 절대로 즉시 재Dispatch하지 않는다.
필수 순서:
1. TASK Issue 댓글 확인
2. Quota reservation 상태 확인
3. Dispatch intent 확인
4. Dispatch outcome 확인
5. Canonical Session marker 확인
6. Jules API Session 조회
7. Reconciler Dry Run
8. 필요 시 Reconciler Apply
중복 Session보다 일시적 정지가 안전하다.
---
# 32. 자동화 중지
Core Automation 중지:
```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```
Content Schedule 중지:
```bash
gh variable set CONTENT_AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "false"
```
주의:
* 실행 중 Jules Session은 계속 작업할 수 있다.
* 열린 PR Validation은 계속될 수 있다.
* 열린 PR Auto Merge를 막으려면 `do-not-merge`를 적용한다.
```bash
export PR_NUMBER="123"

jq -n \
  '{labels:["do-not-merge"]}' |
gh api \
  --method POST \
  "repos/${REPOSITORY}/issues/${PR_NUMBER}/labels" \
  --input -
```
---
# 33. 자동화 재개
재개 전 확인:
* Unknown Dispatch 없음
* Active Session 파악
* 열린 PR 파악
* Resource Lock 파악
* Quota 남은 양 확인
* Reconciler Dry Run 성공
재개:
```bash
gh variable set AUTOMATION_ENABLED \
  --repo "$REPOSITORY" \
  --body "true"
```
READY TASK가 있지만 이벤트가 없다면:
```bash
gh workflow run "05-next-task.yml" \
  --repo "$REPOSITORY" \
  -f source_task_id="" \
  -f dry_run="false" \
  -f force="false"
```
---
# 34. 장애 복구
## 34.1 Goal Intake 실패
주요 원인:
* 제목이 `[GOAL]`로 시작하지 않음
* `AUTOMATION_ENABLED=false`
* `JULES_API_KEY` 없음
* `JULES_SOURCE_NAME` 없음
* Jules App 저장소 권한 없음
* Source가 다른 저장소를 가리킴
* 기존 Planner Session 존재
## 34.2 TASK Dispatch 실패
주요 원인:
* TASK Issue 번호 불일치
* TASK가 READY가 아님
* Jules API Key 오류
* Source 오류
* 기존 Session 존재
* 미해결 Dispatch Intent 존재
* Quota 초과
* 동시성 초과
* Resource Lock 충돌
## 34.3 Draft PR
```bash
export PR_NUMBER="123"

gh pr view "$PR_NUMBER" \
  --repo "$REPOSITORY" \
  --json number,title,isDraft,body,files,url
```
계약 확인 후:
```bash
gh pr ready "$PR_NUMBER" \
  --repo "$REPOSITORY"
```
## 34.4 PR Validation 실패
```bash
gh pr checks "$PR_NUMBER" \
  --repo "$REPOSITORY"
```
원칙:
* 실패한 검증을 삭제하지 않는다.
* CI를 우회하지 않는다.
* TASK 허용 범위를 넓혀 실패를 숨기지 않는다.
* 가능한 경우 동일 PR에서 수정한다.
* Correction 횟수 제한을 지킨다.
## 34.5 Auto Merge 차단
주요 차단 라벨:
```text
do-not-merge
state:blocked
security-review-required
merge:manual-only
validation:failed
human-approval-required
state:merge-blocked
```
## 34.6 Netlify 실패
확인 항목:
* Netlify Site ID
* Netlify Auth Token
* Production Branch
* Build Command
* Publish Directory
* Merge Commit과 Deploy Commit 일치
* Deploy 상태
* Build 로그
---
