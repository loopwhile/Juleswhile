# Security Capability Matrix

Updated: 2026-06-29

## Repository Evidence

- Repository: `loopwhile/Juleswhile`
- Visibility: private
- GitHub Actions: enabled
- Actions allowed actions setting: `all`
- GitHub API rulesets check: HTTP 403, "Upgrade to GitHub Pro or make this repository public to enable this feature."
- GitHub API branch protection check: HTTP 403, "Upgrade to GitHub Pro or make this repository public to enable this feature."

Secret values were not read. Only secret names and repository variables were checked during preflight.

## Capability Status

| Capability | Current status | Evidence | Current control |
|---|---|---|---|
| Repository rulesets | Not available on current private repository plan | GitHub API returned HTTP 403 | Detective `09 - Main Integrity Audit` workflow |
| Branch protection API | Not available on current private repository plan | GitHub API returned HTTP 403 | Pull-request-only operating contract plus detective audit |
| Main force-push prevention | Not server-enforced here | Ruleset/branch protection unavailable | Detective audit and incident creation for unauthorized direct pushes |
| Secret scanning | Not confirmed by API for this private repo | `security_and_analysis` was null | Repository integrity tests and no secret value logging policy |
| Push protection | Not confirmed by API for this private repo | `security_and_analysis` was null | No secret values in workflow artifacts or issue comments |
| Dependency review | Not enabled here | No dependency-review workflow added | `npm audit`, Dependabot, and lockfile review |
| Code scanning | Not enabled here | No code scanning configuration present | TypeScript, unit tests, workflow policy validation |
| Artifact attestation | Not enabled in TASK-008 | Requires additional plan/permission validation before production use | SHA-256 hashes and SBOM generation |
| GitHub Action SHA pinning | Enabled by repository validation | `npm run validate:supply-chain` | All external actions must use 40-character commit SHAs |

## Compensating Main Control

`09 - Main Integrity Audit` is a detective/compensating control. It is not server-side branch protection.

Behavior:

- Runs on `push` to `main`.
- Checks pushed commits for associated merged PRs.
- Allows the current owner actor `loopwhile` to retain emergency direct-push ability.
- Creates one incident issue for unauthorized direct pushes by other actors.
- Uses an idempotency marker keyed by the pushed `after` SHA.

## Future Enablement Conditions

If the repository becomes public or moves to a GitHub plan that supports private repository rulesets and branch protection, evaluate:

- Required PR before merge.
- Required status checks for PR validation and supply-chain validation.
- Force-push and branch-deletion denial.
- Admin enforcement that still preserves a documented emergency recovery path.
- Artifact attestations with `id-token: write` only in the required job.
