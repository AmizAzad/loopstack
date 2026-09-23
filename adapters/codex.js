'use strict';
// OpenAI Codex: AGENTS.md block; skills are read lazily from .amizloop/skills/.
module.exports = (b, h) => [{ path: 'AGENTS.md', block: h.alwaysOn(true) }];
