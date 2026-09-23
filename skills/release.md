---
name: release
description: Prepare a release - version, changelog, notes, go/no-go checklist, reproducible artifacts.
---
# /release
- Version per project scheme (semver: breaking → major).
- Release notes: user-visible changes, breaking changes, migrations, upgrade steps.
- Go/no-go: CI green · verified · security scan clean · migrations tested · rollback ready · flags set · stakeholders told.
- Build artifacts reproducibly from the tagged commit; record artifact/version ids.
Template: `.amizloop/templates/release.md`.
