# Extending

Never edit core. Add layers, which are merged in this order when `sync` runs:

```
amizloop core → technology → organization → project → .amizloop-local/ (repo)
```

```json
// amizloop.json
{
  "harnesses": ["claude", "copilot"],
  "layers": ["~/eng/amizloop-java", "~/eng/acme-standards", "./tools/amizloop-project"]
}
```
`.amizloop-local/` in the repo root is always applied last if it exists.

## Layer contents
Every folder is optional:
```
rules/<name>.md             appended to the always-on block (keep them short: they cost tokens every turn)
skills/<name>.md            new skill, or replaces a core skill with the same name
skills/<name>.append.md     appended to an existing skill (the usual way to add tech guidance)
gates/<name>.md             extra quality gate, applied by /verify and /amizing-mode
agents/<name>.md            new role for /debate, /compete, /swarm
templates/<name>.md         new or replacement artifact template
```
Later layers win when names collide. An `.append.md` file needs a base file of the same name in an earlier layer, otherwise `sync` fails with an error.

Skill frontmatter:
```md
---
name: k8s
description: Kubernetes manifest checks - resources, probes, security context.
explicit: true   # optional: opt-in only (never auto-run)
---
# /k8s
- …
```
Keep descriptions under 110 characters and free of `": "`. Keep the body under about 1.6 KB. A real example layer is in [extensions/java-spring](../extensions/java-spring).

## Custom adapter
```json
{ "harnesses": ["mytool"], "adapters": { "mytool": "./amizloop-mytool.js" } }
```
```js
// Receives the merged bundle b (Maps: skills, agents, templates, gates, rules) and helpers h.
module.exports = (b, h) => [
  { path: 'MYTOOL.md', block: h.alwaysOn(true) },                  // marker-managed block
  ...[...b.skills].map(([name, text]) => ({ path: `.mytool/${name}.md`, content: h.parse(text).body })),
];
```
