'use strict';
// Claude Code: native skills (slash command + on-demand load) and a CLAUDE.md block.
// Explicit-only skills get disable-model-invocation so Claude can never auto-run them.
module.exports = (b, h) => [
  ...[...b.skills].map(([name, text]) => {
    const { meta, body } = h.parse(text);
    const fm = { name, description: meta.description };
    if (meta.explicit === 'true') fm['disable-model-invocation'] = true;
    return { path: `.claude/skills/${name}/SKILL.md`, content: h.yaml(fm) + body };
  }),
  { path: 'CLAUDE.md', block: h.alwaysOn(false) },
];
