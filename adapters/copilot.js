'use strict';
// GitHub Copilot: prompt files are the slash commands; repo instructions carry the always-on block.
module.exports = (b, h) => [
  ...[...b.skills].map(([name, text]) => {
    const { meta, body } = h.parse(text);
    return { path: `.github/prompts/${name}.prompt.md`, content: h.yaml({ description: meta.description }) + body };
  }),
  { path: '.github/copilot-instructions.md', block: h.alwaysOn(true) },
];
