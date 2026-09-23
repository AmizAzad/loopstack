'use strict';
// Grok CLI: .grok/GROK.md custom instructions; skills are read lazily from .amizloop/skills/.
module.exports = (b, h) => [{ path: '.grok/GROK.md', block: h.alwaysOn(true) }];
