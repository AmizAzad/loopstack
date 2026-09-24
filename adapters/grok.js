'use strict';
// Grok CLI: .grok/GROK.md custom instructions; skills are read lazily from .loopstack/skills/.
module.exports = (b, h) => [{ path: '.grok/GROK.md', block: h.alwaysOn(true) }];
