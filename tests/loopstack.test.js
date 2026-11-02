'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin/loopstack.js');
const read = f => fs.readFileSync(f, 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'loopstack-'));
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
const ok = (...args) => { const r = run(...args); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const count = (s, sub) => s.split(sub).length - 1;

const skillFiles = fs.readdirSync(path.join(ROOT, 'skills'));
const skills = skillFiles.map(f => f.slice(0, -3));
const skillText = n => read(path.join(ROOT, 'skills', `${n}.md`));
const EXPLICIT = ['arena', 'caveman', 'compete', 'debate', 'interrogate', 'ls-usage-dashboard', 'swarm'];
const COMMANDS = ['amizing-mode', 'understand', 'research', 'product', 'requirements', 'architect', 'design', 'adr',
  'plan', 'implement', 'tdd', 'bdd', 'test', 'debug', 'review', 'security', 'performance', 'verify', 'release',
  'deploy', 'rollback', 'observe', 'incident', 'refactor', 'modernize', 'document', 'investigate', 'interrogate',
  'arena', 'swarm', 'debate', 'compete', 'caveman', 'normal', 'ship', 'ls-usage-dashboard'];

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
    for (const [, ref] of t.matchAll(/\.loopstack\/templates\/([\w-]+\.md)/g)) assert.ok(templates.includes(ref), `${n}: ${ref}`);
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
  for (const f of ['.loopstack/templates/adr.md', '.loopstack/agents/skeptic.md', '.loopstack/skills/debate.md', '.loopstack/learnings.md']) assert.ok(fs.existsSync(p(f)), f);

  const first = read(p('CLAUDE.md'));
  assert.match(first, /^# Mine\nkeep me\n\n<!-- loopstack:start -->/);
  ok('sync', '--dir', dir);
  assert.equal(read(p('CLAUDE.md')), first);
  assert.equal(count(first, '<!-- loopstack:start -->'), 1);
});

test('layers override, append, add, and stale output is cleaned', () => {
  const dir = tmp();
  const ext = path.join(dir, 'ext');
  write(path.join(ext, 'skills/review.md'), '---\nname: review\ndescription: Team review.\n---\n# /review\nteam rules\n');
  write(path.join(ext, 'skills/k8s.md'), '---\nname: k8s\ndescription: Kubernetes checks.\n---\n# /k8s\nhelm lint\n');
  write(path.join(dir, '.loopstack-local/skills/k8s.append.md'), 'repo: namespace payments\n');
  write(path.join(ext, 'rules/team.md'), '## Team\n- Use pnpm.\n');
  write(path.join(dir, 'loopstack.json'), JSON.stringify({ harnesses: ['claude'], layers: ['ext', path.join(ROOT, 'extensions/java-spring')] }));
  ok('sync', '--dir', dir);
  const p = f => path.join(dir, f);
  assert.match(read(p('.claude/skills/review/SKILL.md')), /team rules/);
  assert.match(read(p('.claude/skills/k8s/SKILL.md')), /helm lint\nrepo: namespace payments/);
  assert.match(read(p('.claude/skills/test/SKILL.md')), /Testcontainers/);
  assert.match(read(p('CLAUDE.md')), /Use pnpm[\s\S]*Java\/Spring rules/);
  assert.ok(fs.existsSync(p('.loopstack/gates/coverage.md')));
  assert.ok(fs.existsSync(p('.loopstack/agents/dba.md')));

  fs.rmSync(path.join(ext, 'skills/k8s.md'));
  fs.rmSync(p('.loopstack-local'), { recursive: true });
  ok('sync', '--dir', dir);
  assert.ok(!fs.existsSync(p('.claude/skills/k8s')), 'removed skill pruned');

  write(p('loopstack.json'), JSON.stringify({ harnesses: ['codex'] }));
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
  write(path.join(dir, 'loopstack.json'), JSON.stringify({ harnesses: ['mine'], adapters: { mine: './my-adapter.js' } }));
  ok('sync', '--dir', dir);
  assert.match(read(path.join(dir, 'MY.md')), /amizing-mode/);
});

test('bad input fails with a clear error', () => {
  const dir = tmp();
  assert.match(run('init', '--foo', '--dir', dir).stderr, /unknown option: --foo/);
  assert.match(run('init', '--dir', dir).stderr, /pick a harness/);
  write(path.join(dir, 'loopstack.json'), JSON.stringify({ harnesses: ['claude'], layers: ['nope'] }));
  assert.match(run('sync', '--dir', dir).stderr, /layer not found/);
  write(path.join(dir, 'x/skills/ghost.append.md'), 'x\n');
  write(path.join(dir, 'loopstack.json'), JSON.stringify({ harnesses: ['claude'], layers: ['x'] }));
  assert.match(run('sync', '--dir', dir).stderr, /no ghost\.md to extend/);
});

// ---- usage telemetry + dashboard ----
const dash = require('../bin/dashboard.js');
const VERSION = require('../package.json').version;
const LOG_STEP = read(path.join(ROOT, 'core/telemetry.md')).replace(/\r\n/g, '\n').trim();
const RUNS = '.loopstack/runs.jsonl';
const line = o => JSON.stringify({ v: 1, ts: '2026-09-07T10:00:00Z', lvl: 1, route: 'bug', skills: ['debug'], ...o });
const json = (...args) => JSON.parse(ok('dashboard', '--json', ...args));

test('telemetry is off by default: no log step, no dashboard script, no git files', () => {
  const dir = tmp();
  const p = f => path.join(dir, f);
  ok('init', '--claude', '--codex', '--dir', dir);
  assert.equal(read(p('.loopstack/skills/amizing-mode.md')), skillText('amizing-mode').replace(/\r\n/g, '\n'));
  assert.doesNotMatch(read(p('.claude/skills/amizing-mode/SKILL.md')), /runs\.jsonl/);
  for (const f of ['.loopstack/dashboard.js', '.gitattributes', '.gitignore', RUNS]) assert.ok(!fs.existsSync(p(f)), f);
  assert.equal(JSON.parse(read(p('.loopstack/manifest.json'))).version, VERSION);
});

test('telemetry on: log step within budget on every harness; off again removes only our parts', () => {
  const dir = tmp();
  const p = f => path.join(dir, f);
  write(p('.gitattributes'), '*.png binary\n');
  write(p('.gitignore'), 'node_modules/\n');
  write(p(RUNS), `${line({})}\n`);
  write(p('loopstack.json'), JSON.stringify({ harnesses: ['claude', 'copilot', 'codex', 'grok'], telemetry: true }));
  ok('sync', '--dir', dir);
  const gen = read(p('.loopstack/skills/amizing-mode.md'));
  assert.ok(gen.includes(`${LOG_STEP}\n9. Report`), 'log step sits before Report');
  const growth = Buffer.byteLength(gen) - Buffer.byteLength(skillText('amizing-mode').replace(/\r\n/g, '\n'));
  assert.ok(growth <= 300, `amizing-mode grew ${growth} B`);
  assert.ok(Buffer.byteLength(gen) <= 3000);
  assert.match(read(p('.claude/skills/amizing-mode/SKILL.md')), /runs\.jsonl/);
  assert.match(read(p('.github/prompts/amizing-mode.prompt.md')), /runs\.jsonl/);
  const plain = tmp();
  ok('init', '--codex', '--dir', plain);
  assert.equal(read(p('AGENTS.md')), read(path.join(plain, 'AGENTS.md')), 'always-on block unchanged by telemetry');
  assert.equal(read(p('.loopstack/dashboard.js')), read(path.join(ROOT, 'bin/dashboard.js')).replace(/\r\n/g, '\n'));
  const attrs = '*.png binary\n\n# loopstack:start\n.loopstack/runs.jsonl merge=union\n# loopstack:end\n';
  assert.equal(read(p('.gitattributes')), attrs);
  assert.equal(read(p('.gitignore')), 'node_modules/\n\n# loopstack:start\nloopstack-dashboard.html\n# loopstack:end\n');
  ok('sync', '--dir', dir);
  assert.equal(read(p('.gitattributes')), attrs, 'idempotent');
  assert.equal(read(p(RUNS)), `${line({})}\n`, 'log never touched');
  const r = spawnSync(process.execPath, [p('.loopstack/dashboard.js'), '--json', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).tasks, 1, 'copied script runs standalone');

  write(p('loopstack.json'), JSON.stringify({ harnesses: ['claude', 'copilot', 'codex', 'grok'] }));
  ok('sync', '--dir', dir);
  assert.doesNotMatch(read(p('.loopstack/skills/amizing-mode.md')), /runs\.jsonl/);
  assert.ok(!fs.existsSync(p('.loopstack/dashboard.js')));
  assert.equal(read(p('.gitattributes')), '*.png binary\n');
  assert.equal(read(p('.gitignore')), 'node_modules/\n');
  assert.equal(read(p(RUNS)), `${line({})}\n`, 'opt-out keeps user data');
});

test('a 0.1.0 install upgrades with one sync; dashboard reads old and missing installs', () => {
  const dir = tmp();
  const mp = path.join(dir, '.loopstack/manifest.json');
  ok('init', '--claude', '--dir', dir);
  const m = JSON.parse(read(mp));
  delete m.version;
  fs.writeFileSync(mp, JSON.stringify(m));
  const none = tmp();
  const j = json('--dir', dir, '--dir', none);
  assert.deepEqual(j.projects.map(p => [p.version, p.events]), [['pre-0.2', 0], ['not installed', 0]]);
  write(path.join(dir, 'loopstack.json'), JSON.stringify({ harnesses: ['claude'], telemetry: true }));
  ok('sync', '--dir', dir);
  assert.equal(JSON.parse(read(mp)).version, VERSION);
  assert.ok(!JSON.parse(read(mp)).files.includes(RUNS), 'log is never in the manifest');
});

test('dashboard aggregates exact numbers and tolerates bad lines', () => {
  const a = tmp();
  const b = tmp();
  write(path.join(a, RUNS), [
    line({ lvl: 1, skills: ['debug', 'test', 'verify'], ship: 'pushed', h: 'claude' }),
    line({ ts: '2026-09-08T10:00:00Z', lvl: 3, lvl0: 2, route: 'feature', skills: ['requirements', 'design', 'security', 'verify'],
      gates: { security: 2, testing: 1 }, loops: 2, unv: 1, learn: 1, ship: 'pr', h: 'codex', extra: 'ignored' }),
    'not json',
    JSON.stringify({ v: 1, ts: '2026-09-09', lvl: 'L2' }),
    JSON.stringify({ v: 2, ts: '2026-09-14T00:00:00Z', lvl: 0, future: { x: 1 } }),
    '',
  ].join('\n'));
  write(path.join(b, RUNS), `${line({ ts: '2026-09-15T09:00:00Z', lvl: 2, route: 'refactor', skills: ['refactor', 'verify'], gates: { review: 1 }, ship: 'committed', h: 'claude' })}\n`);
  const j = json('--dir', a, '--dir', b);
  const [pa, pb] = j.projects;
  assert.deepEqual([pa.events, pa.skipped, pb.events, pb.skipped], [3, 2, 1, 0]);
  assert.equal(j.tasks, 4);
  assert.deepEqual(j.kpi, { tasks: 4, firstPass: 50, rework: 25, gateFail: 50, unv: 1, learn: 1 });
  assert.deepEqual(j.levels, [1, 1, 1, 1, 0]);
  assert.deepEqual(j.weeks, ['2026-09-07', '2026-09-14']);
  assert.deepEqual(j.weekly.tasks, [2, 2]);
  assert.deepEqual(j.gates.map(g => [g.name, g.fails]), [['security', 2], ['review', 1], ['testing', 1]]);
  assert.deepEqual(j.gates[0].rate, [0, 0, 0, 100, null]);
  assert.equal(j.sizing[2][3], 1);
  assert.equal(j.resized, 1);
  assert.deepEqual(j.funnel, [4, 3, 2, 1]);
  assert.deepEqual(j.loopsHist, [3, 0, 1, 0, 0, 0]);
  assert.deepEqual(j.skills.slice(0, 2).map(s => [s.name, s.count]), [['verify', 3], ['debug', 1]]);
  assert.deepEqual(j.routes[pa.name], { bug: 1, feature: 1, other: 1 });
  assert.deepEqual(j.routes[pb.name], { refactor: 1 });
  assert.ok(j.insights.some(i => /2 malformed log lines skipped/.test(i.msg)));
  assert.equal(ok('dashboard', '--json', '--dir', a, '--dir', b), ok('dashboard', '--json', '--dir', a, '--dir', b), 'deterministic');
  assert.equal(json('--dir', a, '--since', '2026-09-10').tasks, 1);
  assert.match(run('dashboard', '--dir', path.join(a, 'nope')).stderr, /not a directory/);
  assert.match(run('dashboard', '--since', 'soon').stderr, /bad --since/);
  assert.match(run('dashboard', '--bogus').stderr, /unknown option: --bogus/);
});

test('dashboard HTML is offline, CSP-locked and renders hostile strings inert', () => {
  const dir = tmp();
  const out = path.join(dir, 'd.html');
  write(path.join(dir, RUNS), `${line({ skills: ['<script>alert(1)</script>'], h: '"><svg onload=alert(1)>', route: '</script><img src=x>' })}\n`);
  ok('dashboard', '--dir', dir, '--out', out);
  const html = read(out);
  assert.equal(count(html, '<script'), 2, 'only the data block and our own script');
  assert.equal(count(html, '</script>'), 2);
  assert.ok(html.includes('\\u003cscript>alert(1)\\u003c/script>'), 'data is escaped');
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'no external URLs');
  assert.doesNotMatch(html, /innerHTML|eval\(|<link|\ssrc=/);
  const csp = /script-src 'sha256-([^']+)'/.exec(html)[1];
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.equal(require('crypto').createHash('sha256').update(script).digest('base64'), csp, 'CSP hash matches the inline script');
  const empty = tmp();
  ok('dashboard', '--dir', empty, '--out', path.join(empty, 'd.html'));
  assert.match(read(path.join(empty, 'd.html')), /"events":\[\]/, 'empty state renders');
});

test('per-member view is opt-in and uses git author names only', () => {
  const dir = tmp();
  const g = (...a) => spawnSync('git', ['-C', dir, '-c', 'user.name=Ada Lovelace', '-c', 'user.email=ada@example.com', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
  const now = new Date().toISOString();
  g('init', '-q');
  write(path.join(dir, RUNS), `${line({ ts: now })}\n`);
  write(path.join(dir, '.loopstack/learnings.md'), '# Learnings\nheader\n- lesson one\n- lesson two\n');
  g('add', '.');
  assert.equal(g('commit', '-qm', 'log').status, 0);
  fs.appendFileSync(path.join(dir, RUNS), `${line({ ts: now, lvl: 2 })}\n`);
  assert.deepEqual(json('--dir', dir).members, {});
  const raw = ok('dashboard', '--json', '--dir', dir, '--by-member');
  assert.deepEqual(JSON.parse(raw).members, { 'Ada Lovelace': [0, 1, 0, 0, 0], local: [0, 0, 1, 0, 0] });
  assert.ok(!raw.includes('ada@example.com'), 'no emails');
  assert.equal(JSON.parse(raw).weekly.learnGit.reduce((s, v) => s + v, 0), 2, 'lessons counted from git history');
});

test('10k events aggregate and render under 1 s', () => {
  const dir = tmp();
  const lines = Array.from({ length: 1e4 }, (_, i) => line({ ts: new Date(Date.UTC(2026, 0, 1) + i * 36e5).toISOString(), lvl: i % 5, lvl0: (i * 7) % 5,
    skills: ['debug', 'test', 'verify', 'design'].slice(0, 1 + (i % 4)), gates: i % 4 ? {} : { testing: 1 }, loops: i % 3, route: i % 2 ? 'bug' : 'feature' }));
  write(path.join(dir, RUNS), `${lines.join('\n')}\n`);
  const t0 = process.hrtime.bigint();
  const m = dash.build([dir], {});
  const html = dash.render(m);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(m.agg.tasks, 1e4);
  assert.ok(html.length > 1e5);
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});
