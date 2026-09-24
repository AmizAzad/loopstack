---
name: ship
description: Git flow - branch from latest parent before editing, commit after verify, push with approval.
---
# /ship
Skip if not a git repo or the user said to work on the current branch.
Start (before first edit):
1. `git status`: dirty → ask whether to stash, commit or carry changes over. Never discard.
2. Parent = branch the user named, else repo default (`git symbolic-ref --short refs/remotes/origin/HEAD`), else current.
3. `git fetch origin <parent>` then `git switch -c <type>/<slug> origin/<parent>` (type: feat, fix, refactor, docs, chore; follow repo naming if it has one). Already on this task's branch → stay.
Finish (after /verify passes):
4. Read `git diff`; stage only task files (no secrets, build output or unrelated edits).
5. Commit in the repo's style, else Conventional Commits `type(scope): summary` with body = why. Split large changes logically.
6. Parent moved → fetch, rebase (or merge if the repo prefers), rerun tests.
7. Push only with user approval: `git push -u origin <branch>`. Never push to the parent/default branch; never force-push shared branches.
8. Report branch, commit hashes and push result from git output. Open a PR only if asked.
