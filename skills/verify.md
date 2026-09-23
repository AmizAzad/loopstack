---
name: verify
description: Prove with evidence that the change works and nothing broke; list what is unverified.
---
# /verify
Answer each with evidence (command + result, API response, log, metric, deploy status) or mark UNVERIFIED:
1. Did we build the requested thing? (each AC)
2. Does it work, including important edge cases?
3. Is existing behaviour intact? (regression suite)
4. Secure enough for its context?
5. Observable?
6. Deployable? (build, config, migrations, flags)
Also apply gates in `.amizloop/gates/` if present.
Output:
VERIFIED: <item> — <evidence>
UNVERIFIED: <item> — <why / how to verify>
Never report UNVERIFIED as done. Template: `.amizloop/templates/verification.md`.
