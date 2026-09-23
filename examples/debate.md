# Example: explicit debate
Illustrative trace, not a recorded run.

> /debate Queue or direct HTTP for sending notifications? roles: architect, sre, skeptic

- **Propose**: Architect wants a queue for decoupling and retries. SRE also prefers a queue but points out it is new infrastructure to run. Skeptic proposes direct calls plus an outbox table, since volume is 50/min.
- **Critique**: Skeptic: "What second consumer justifies a broker?" Architect: "Direct calls lose messages when the provider is down." SRE: "The outbox handles that with no new infrastructure."
- **Defend**: Architect concedes that current volume is low. The disagreement over future consumers remains.
- **Synthesis**: all agree messages must be durable. They still disagree on whether new infrastructure is worth it now. Choose an outbox if volume stays under ~1k/min with one consumer. Choose a queue if more consumers are planned. No consensus is claimed.
