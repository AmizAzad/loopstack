---
name: deploy
description: Ship to an environment with a risk-matched strategy, post-deploy checks and rollback path.
---
# /deploy
Production deploys need explicit user approval.
Before: artifact version; config/secrets per env; migrations ordered expand → deploy → contract; rollback known; monitoring ready.
Strategy by risk: direct (low risk) · rolling · blue/green · canary with automatic abort criteria · dark launch behind flag.
After: health checks, smoke tests, error rate/latency/saturation vs baseline for a set window (/observe). Abort criteria hit → /rollback.
Report status only from deploy tool output. Template: `.amizloop/templates/deployment.md`.
