# Example: small bug (L1)
Illustrative trace, not a recorded run.

> Users with an apostrophe in their name can't save their profile.

- **Size**: L1 (one validator, no contract change). Route: ship start → understand → debug → tdd → implement → review → verify → ship finish.
- **/ship start**: `git fetch origin main`, then `git switch -c fix/profile-apostrophe origin/main`.
- **/understand**: `ProfileValidator.java:42` has regex `^[A-Za-z ]+$`. It is called by `ProfileController.update`. `ProfileValidatorTest` has no apostrophe case.
- **/debug**: FACT: reproduced. Name `O'Brien` returns 400.
- **/tdd**: RED: new test fails. GREEN: regex now allows `'` and `-`. Suite 38/38.
- **/review**: no findings. Checked that the name reaches SQL as a bound parameter.
- **/verify**: VERIFIED: AC passes (new test). VERIFIED: regression suite green. UNVERIFIED: none.
- **/ship finish**: committed `fix(profile): allow apostrophes and hyphens in names` (2 files). After the user approved, ran `git push -u origin fix/profile-apostrophe`.
- **Skipped** (no value at L1): requirements docs, design, ADR, security review, release.
