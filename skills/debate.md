---
name: debate
description: Explicit only. Multi-agent debate - roles propose, critique, defend; neutral synthesis of trade-offs.
explicit: true
---
# /debate
Run only when the user invokes it.
Setup: question; criteria; roles (default Architect, Implementer, Skeptic; user picks from `.amizloop/agents/`); rounds (default 2).
1. Propose: each role independently states position + evidence (separate agent per role if the harness supports it, else clearly separated personas). Brief each with its role file only.
2. Critique: each attacks the others' assumptions, risks and weak evidence.
3. Defend: respond, concede or revise.
4. Synthesis (neutral): positions, strongest arguments, agreements, unresolved disagreements, trade-off table, conditional recommendation ("A if…, B if…").
Rules: evidence over rhetoric; ≤150 words per turn; report real disagreement; no fabricated consensus; never call the winner objectively correct.
