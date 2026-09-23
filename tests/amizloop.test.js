'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin/amizloop.js');
const read = f => fs.readFileSync(f, 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'amizloop-'));
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
const ok = (...args) => { const r = run(...args); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const count = (s, sub) => s.split(sub).length - 1;

const skillFiles = fs.readdirSync(path.join(ROOT, 'skills'));
const skills = skillFiles.map(f => f.slice(0, -3));
const skillText = n => read(path.join(ROOT, 'skills', `${n}.md`));
const EXPLICIT = ['arena', 'caveman', 'compete', 'debate', 'interrogate', 'swarm'];
const COMMANDS = ['amizing-mode', 'understand', 'research', 'product', 'requirements', 'architect', 'design', 'adr',
  'plan', 'implement', 'tdd', 'bdd', 'test', 'debug', 'review', 'security', 'performance', 'verify', 'release',
  'deploy', 'rollback', 'observe', 'incident', 'refactor', 'modernize', 'document', 'investigate', 'interrogate',
  'arena', 'swarm', 'debate', 'compete', 'caveman', 'normal'];

test('every recommended command has a skill', () => {
  for (const c of COMMANDS) assert.ok(skills.includes(c), `missing skill ${c}`);
});

test('skills are well-formed and within size budget', () => {
  for (const n of skills) {
    const t = skillText(n);
    const m = /^---\nname: (.+)\ndescription: (.+)\n(?:explicit: true\n)?---\n# \/(.+)\n/.exec(t);
    assert.ok(m, `${n}: bad frontmatter/header`);
    assert.equal(m[1], n);
    assert.equal(m[3], n);
    assert.ok(m[2].length <= 110, `${n}: description too long`);
    assert.ok(!m[2].includes(': '), `${n}: description must stay YAML-safe`);
    const budget = n === 'amizing-mode' ? 3000 : 1600;
    assert.ok(Buffer.byteLength(t) <= budget, `${n}: ${Buffer.byteLength(t)} bytes > ${budget}`);
  }
});

test('explicit-only skills are exactly the opt-in set and say so', () => {
  const marked = skills.filter(n => /\nexplicit: true\n/.test(skillText(n))).sort();
  assert.deepEqual(marked, EXPLICIT);
  for (const n of EXPLICIT) assert.match(skillText(n), /Run only when the user invokes it|On when invoked/);
});

test('skill and template references resolve', () => {
  const templates = fs.readdirSync(path.join(ROOT, 'templates'));
  for (const n of skills) {
    const t = skillText(n);
    for (const [, ref] of t.matchAll(/(?<![\w.`/<])\/([a-z][a-z-]+)/g)) assert.ok(skills.includes(ref), `${n}: /${ref}`);
    for (const [, ref] of t.matchAll(/\.amizloop\/templates\/([\w-]+\.md)/g)) assert.ok(templates.includes(ref), `${n}: ${ref}`);
  }
});

test('always-on instructions stay under ~600 tokens', () => {
  const dir = tmp();
  ok('init', '--codex', '--dir', dir);
  const bytes = Buffer.byteLength(read(path.join(dir, 'AGENTS.md')));
  assert.ok(bytes / 4 <= 600, `AGENTS.md ≈ ${Math.round(bytes / 4)} tokens`);
});

test('init --all generates every harness, preserves user content, is idempotent', () => {
  const dir = tmp();
  write(path.join(dir, 'CLAUDE.md'), '# Mine\nkeep me\n');
  ok('init', '--all', '--dir', dir);
  const p = f => path.join(dir, f);
  const review = read(p('.claude/skills/review/SKILL.md'));
  assert.match(review, /^---\nname: "review"\ndescription: ".+"\n---\n# \/review/);
  assert.doesNotMatch(review, /disable-model-invocation/);
  for (const n of EXPLICIT) assert.match(read(p(`.claude/skills/${n}/SKILL.md`)), /disable-model-invocation: true/);
  assert.match(read(p('.github/prompts/verify.prompt.md')), /^---\ndescription: ".+"\n---\n# \/verify/);
  for (const f of ['.github/copilot-instructions.md', 'AGENTS.md', '.grok/GROK.md']) assert.match(read(p(f)), /Skills: .*amizing-mode/);
  assert.doesNotMatch(read(p('CLAUDE.md')), /Skills:/, 'claude discovers skills natively');
  for (const f of ['.amizloop/templates/adr.md', '.amizloop/agents/skeptic.md', '.amizloop/skills/debate.md', '.amizloop/learnings.md']) assert.ok(fs.existsSync(p(f)), f);

  const first = read(p('CLAUDE.md'));
  assert.match(first, /^# Mine\nkeep me\n\n<!-- amizloop:start -->/);
  ok('sync', '--dir', dir);
  assert.equal(read(p('CLAUDE.md')), first);
  assert.equal(count(first, '<!-- amizloop:start -->'), 1);
});

test('layers override, append, add, and stale output is cleaned', () => {
  const dir = tmp();
  const ext = path.join(dir, 'ext');
  write(path.join(ext, 'skills/review.md'), '---\nname: review\ndescription: Team review.\n---\n# /review\nteam rules\n');
  write(path.join(ext, 'skills/k8s.md'), '---\nname: k8s\ndescription: Kubernetes checks.\n---\n# /k8s\nhelm lint\n');
  write(path.join(dir, '.amizloop-local/skills/k8s.append.md'), 'repo: namespace payments\n');
  write(path.join(ext, 'rules/team.md'), '## Team\n- Use pnpm.\n');
  write(path.join(dir, 'amizloop.json'), JSON.stringify({ harnesses: ['claude'], layers: ['ext', path.join(ROOT, 'extensions/java-spring')] }));
  ok('sync', '--dir', dir);
  const p = f => path.join(dir, f);
  assert.match(read(p('.claude/skills/review/SKILL.md')), /team rules/);
  assert.match(read(p('.claude/skills/k8s/SKILL.md')), /helm lint\nrepo: namespace payments/);
  assert.match(read(p('.claude/skills/test/SKILL.md')), /Testcontainers/);
  assert.match(read(p('CLAUDE.md')), /Use pnpm[\s\S]*Java\/Spring rules/);
  assert.ok(fs.existsSync(p('.amizloop/gates/coverage.md')));
  assert.ok(fs.existsSync(p('.amizloop/agents/dba.md')));

  fs.rmSync(path.join(ext, 'skills/k8s.md'));
  fs.rmSync(p('.amizloop-local'), { recursive: true });
  ok('sync', '--dir', dir);
  assert.ok(!fs.existsSync(p('.claude/skills/k8s')), 'removed skill pruned');

  write(p('amizloop.json'), JSON.stringify({ harnesses: ['codex'] }));
  ok('sync', '--dir', dir);
  assert.ok(!fs.existsSync(p('.claude')), 'dropped harness output removed');
  assert.ok(!fs.existsSync(p('CLAUDE.md')), 'block-only file removed');
  assert.ok(fs.existsSync(p('AGENTS.md')));
});

test('never overwrites a user file of the same name without --force', () => {
  const dir = tmp();
  const mine = path.join(dir, '.claude/skills/review/SKILL.md');
  write(mine, 'my own review skill\n');
  assert.match(run('init', '--claude', '--dir', dir).stderr, /refusing to overwrite[\s\S]*review\/SKILL\.md/);
  assert.equal(read(mine), 'my own review skill\n');
  ok('sync', '--force', '--dir', dir);
  assert.match(read(mine), /# \/review/);
});

test('custom adapter via config', () => {
  const dir = tmp();
  write(path.join(dir, 'my-adapter.js'), "module.exports = (b, h) => [{ path: 'MY.md', block: h.alwaysOn(true) }];\n");
  write(path.join(dir, 'amizloop.json'), JSON.stringify({ harnesses: ['mine'], adapters: { mine: './my-adapter.js' } }));
  ok('sync', '--dir', dir);
  assert.match(read(path.join(dir, 'MY.md')), /amizing-mode/);
});

test('bad input fails with a clear error', () => {
  const dir = tmp();
  assert.match(run('init', '--foo', '--dir', dir).stderr, /unknown option: --foo/);
  assert.match(run('init', '--dir', dir).stderr, /pick a harness/);
  write(path.join(dir, 'amizloop.json'), JSON.stringify({ harnesses: ['claude'], layers: ['nope'] }));
  assert.match(run('sync', '--dir', dir).stderr, /layer not found/);
  write(path.join(dir, 'x/skills/ghost.append.md'), 'x\n');
  write(path.join(dir, 'amizloop.json'), JSON.stringify({ harnesses: ['claude'], layers: ['x'] }));
  assert.match(run('sync', '--dir', dir).stderr, /no ghost\.md to extend/);
});
