# Harness setup

```sh
loopstack init --claude | --copilot | --codex | --grok | --all [--dir <repo>]
```

| Harness | Always-on block | Slash commands | Skill loading |
|---|---|---|---|
| Claude Code | `CLAUDE.md` | `.claude/skills/<name>/SKILL.md` | native, on demand; explicit-only skills get `disable-model-invocation: true` |
| GitHub Copilot | `.github/copilot-instructions.md` | `.github/prompts/<name>.prompt.md` (VS Code chat `/name`) | prompt file when invoked; `/amizing-mode` reads `.loopstack/skills/*.md` |
| Codex | `AGENTS.md` | `/name` convention in AGENTS.md | agent reads `.loopstack/skills/<name>.md` |
| Grok CLI | `.grok/GROK.md` | `/name` convention in GROK.md | agent reads `.loopstack/skills/<name>.md` |

- The always-on block sits between `<!-- loopstack:start -->` and `<!-- loopstack:end -->`. Your own content in those files is never touched.
- If a file loopstack did not create already exists at a target path (for example your own `.claude/skills/review/`), sync stops and changes nothing. Rerun with `--force` to overwrite it.
- Remove a harness by deleting it from `loopstack.json` and running `loopstack sync`. Its generated files and block are removed.
- Commit the generated files so teammates get them without running the CLI.
- Adapters contain only harness wiring. To support another tool, see [extending.md](extending.md#custom-adapter).
