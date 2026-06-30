# Mobile PWA Status (as of 2026-06-29)

## Official Mobile Access
The **official WMS desktop and mobile access** is the responsive main web app:
```
https://d2b1ltxtvypxr4.cloudfront.net/
```
No separate Mobile PWA is required for production use.

## Staging Mobile PWA (experimental, retained for reference)
| Resource | Value | Status |
|----------|-------|--------|
| PWA URL | https://dk5pxve63tjs4.cloudfront.net | Staging only, **no measured traffic in the last 30 days** |
| API URL | https://7y5wmmppta.execute-api.us-east-1.amazonaws.com | Staging only, **no measured invocations in the last 30 days** |
| CloudFormation stack | `RigentecWmsMobileStagingStack` | Deployed, but no production stack exists |

## Key Findings (audit 2026-06-29)
- CloudWatch metrics show **zero requests** to the staging Mobile PWA CloudFront distribution (`E1NWSEMNXWI8IE`) in the last 30 days.
- CloudWatch metrics show **zero invocations** on the staging Mobile API Gateway (`7y5wmmppta`) in the last 30 days.
- No production Mobile PWA stack (`RigentecWmsMobileProdStack`) exists.
- The `runtime-support-matrix.md` lists Mobile PWA as “soportado mientras siga en pipeline” (supported while it remains in pipeline), indicating it is an opt-in experimental track.
- Last meaningful mobile feature work was ~2 months ago; recent commits are mechanical/chore only.

## CI Job
The CI job **`Staging Mobile PWA Smoke (manual)`** (`staging-mobile-pwa-smoke`) validates this staging Mobile PWA. It is **manual-only** (`workflow_dispatch`) to avoid confusion with the official WMS web app smoke tests.

## Decommission Guideline
**Re-evaluate after 2026-09-30**: if the staging Mobile PWA/API still show no traffic and no active roadmap item depends on them, schedule stack destruction (`npm run mobile:infra:destroy -- --env staging`) and archive/remove the `mobile/` and `mobile-web/` source code.

## References
- `docs/runbooks/runtime-support-matrix.md` → “Mobile edge / PWA” section
- `docs/mobile/v1-contracts.md` → contract specification
- `docs/mobile/aws-deploy.md` → deployment guide (“no deploy by default”)
- `.github/workflows/ci.yml` → job `staging-mobile-pwa-smoke`