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
// Normalized: a Windows checkout with core.autocrlf has CRLF files; the repo and sync use LF.
const skillText = n => read(path.join(ROOT, 'skills', `${n}.md`)).replace(/\r\n/g, '\n');
const MODE_BUDGET = 3400;
const EXPLICIT = ['arena', 'caveman', 'compete', 'debate', 'interrogate', 'ls-usage-dashboard', 'swarm'];
const COMMANDS = ['amizing-mode', 'understand', 'research', 'product', 'requirements', 'architect', 'design', 'adr',
  'plan', 'implement', 'tdd', 'bdd', 'test', 'debug', 'review', 'security', 'performance', 'verify', 'release',
  'deploy', 'rollback', 'observe', 'incident', 'refactor', 'modernize', 'document', 'investigate', 'interrogate',
  'arena', 'swarm', 'debate', 'compete', 'caveman', 'normal', 'ship', 'ls-usage-dashboard', 'formal', 'statechart'];

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
    const budget = n === 'amizing-mode' ? MODE_BUDGET : 1600;
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
  assert.ok(Buffer.byteLength(gen) <= MODE_BUDGET);
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

// ---- /statechart engine (TLC runner) ----
const sc = require('../bin/statechart.js');
const SC = path.join(ROOT, 'bin/statechart.js');
// TLC -tool output: messages framed by @!@!@ markers. 2217 = trace state, 2110 = invariant broken, 2199 = counts.
const msg = (code, level, text) => `@!@!@STARTMSG ${code}:${level} @!@!@\n${text}\n@!@!@ENDMSG ${code} @!@!@`;
const tool = (...m) => ['TLC2 Version 2.19', ...m].join('\n');
const st = (n, action, x) => msg(2217, 4, `${n}: <${action}>\n/\\ phase = "${x}"\n/\\ n = ${n - 1}\n`);
const done = d => msg(2199, 0, `${d * 2} states generated, ${d} distinct states found, 0 states left on queue.`);

test('statechart: config rewrite keeps the model and swaps only the rules', () => {
  const cfg = sc.parseCfg('\\* c\nCONSTANTS N = 3 (* x *)\nSPECIFICATION Spec\nINVARIANTS TypeOK\n  Safe\nPROPERTY Live\nCHECK_DEADLOCK FALSE\n');
  assert.deepEqual([cfg.invariants, cfg.properties, cfg.deadlock], [['TypeOK', 'Safe'], ['Live'], false]);
  assert.equal(sc.cfgText(cfg, ['Safe'], []), 'CONSTANTS N = 3\nSPECIFICATION Spec\nINVARIANT Safe');
  assert.throws(() => sc.parseCfg('Spec\nINIT Init'), /unexpected "Spec"/);
});

test('statechart: reads TLC verdicts, traces, lassos and errors', () => {
  const inv = sc.verdict(tool(msg(2110, 1, 'Invariant Safe is violated.'), msg(2121, 1, 'The behavior up to this point is:'),
    st(1, 'Initial predicate', 'idle'), st(2, 'Pay line 9, col 3 to line 9, col 20 of module M', 'paid'), done(7)));
  assert.deepEqual(inv.broke, { kind: 'invariant', name: 'Safe' });
  assert.deepEqual(inv.trace.map(t => [t.action, t.vars.phase]), [[undefined, '"idle"'], ['Pay', '"paid"']]);
  assert.equal(inv.distinct, 7);
  assert.deepEqual(inv.errors, []);
  const init = sc.verdict(tool(msg(2107, 1, 'Invariant NotNine is violated by the initial state:\nx = 9\n')));
  assert.deepEqual([init.broke.name, init.trace[0].vars], ['NotNine', { x: '9' }]);
  assert.equal(sc.verdict(tool(msg(2114, 1, 'Deadlock reached.'))).broke.kind, 'deadlock');
  const live = sc.verdict(tool(msg(2116, 1, 'Temporal properties were violated.'), st(1, 'Initial predicate', 'a'),
    msg(2122, 4, '1: Back to state: <Retry line 5, col 1 to line 5, col 9 of module M>\n')));
  assert.deepEqual([live.broke.kind, live.trace[1]], ['temporal', { back: 1, action: 'Retry' }]);
  assert.deepEqual(sc.verdict(tool(msg(2111, 1, 'Evaluating invariant Safe failed.'))).errors, ['Evaluating invariant Safe failed.']);
});

test('statechart: parses TLA+ values for the view', () => {
  assert.deepEqual(sc.parseValue('[type |-> "Commit", rm |-> r1, ok |-> TRUE, n |-> -2]'), { type: 'Commit', rm: 'r1', ok: true, n: -2 });
  assert.deepEqual(sc.parseValue('(r1 :> "working" @@ r2 :> <<1, {}>>)'), { r1: 'working', r2: [1, []] });
  assert.deepEqual(sc.parseValue('{"a\\"b", 2..3}'), '{"a\\"b", 2..3}', 'unknown syntax stays raw');
  assert.deepEqual(sc.parseVars('/\\ a = <<1,\n      2>>\n/\\ b = "x"'), { a: '<<1, 2>>', b: '"x"' });
});

test('statechart: reruns without each broken rule, splits properties, draws only complete small graphs', () => {
  const cfg = sc.parseCfg('SPECIFICATION Spec\nINVARIANT A B\nPROPERTY P Q\n');
  const calls = [];
  const s1 = st(1, 'Initial predicate', 'x');
  const replies = [ // TLC's answer to each run, in order
    tool(msg(2110, 1, 'Invariant A is violated.'), s1),
    tool(msg(2114, 1, 'Deadlock reached.'), s1),
    tool(msg(2116, 1, 'Temporal properties were violated.'), s1, done(4)),
    tool(done(4)), // P alone holds
    tool(msg(2116, 1, 'Temporal properties were violated.'), s1, done(4)), // Q alone breaks
  ];
  const fake = (text, deadlock, dump) => {
    calls.push([text.split('\n').slice(1).join(' | '), deadlock, !!dump]);
    if (dump) return { status: 0, out: '', ...sc.verdict(''), dot: 'digraph {}' };
    const v = sc.verdict(replies.shift());
    return { status: v.broke ? 12 : 0, out: '', ...v, dot: null };
  };
  const r = sc.check(cfg, fake);
  assert.deepEqual(calls, [
    ['INVARIANT A B | PROPERTY P Q', true, false],
    ['INVARIANT B | PROPERTY P Q', true, false],
    ['INVARIANT B | PROPERTY P Q', false, false],
    ['PROPERTY P', false, false],
    ['PROPERTY Q', false, false],
    ['', false, true],
  ]);
  assert.deepEqual(r.bugs.map(b => b.rule), ['A', 'NoDeadlock', 'Q']);
  assert.deepEqual(r.holds, ['B', 'P']);
  assert.equal(r.dot, 'digraph {}');

  const big = sc.check(sc.parseCfg('SPECIFICATION Spec\nINVARIANT NoDeadlock'), (text, d, dump) => {
    assert.ok(!dump, 'no graph run above the chart budget');
    const v = sc.verdict(tool(d ? msg(2114, 1, 'Deadlock reached.') : done(sc.CHART_STATES + 1)));
    return { status: v.broke ? 11 : 0, out: '', ...v, dot: null };
  });
  assert.deepEqual([big.bugs[0].rule, big.holds, big.dot], ['CHECK_DEADLOCK', ['NoDeadlock'], null], 'deadlock renamed when the spec owns NoDeadlock');

  const stopped = sc.check(sc.parseCfg('SPECIFICATION Spec\nINVARIANT A B'), text => {
    const v = sc.verdict(tool(/INVARIANT A/.test(text) ? msg(2110, 1, 'Invariant A is violated.') : msg(2111, 1, 'Evaluating invariant B failed.')));
    return { status: v.broke ? 12 : 75, out: '', ...v, dot: null };
  });
  assert.deepEqual([stopped.bugs.length, stopped.unchecked, stopped.complete], [1, ['B', 'NoDeadlock'], false]);
  assert.match(sc.render('M', stopped).report, /## Rules not checked\nB, NoDeadlock: TLC stopped[\s\S]*Evaluating invariant B failed/);
});

test('statechart: renders a reader chart with merged labels, hidden steps and bug marks', () => {
  const node = (id, phase, n, init) => `${id} [label="/\\\\ phase = \\"${phase}\\"\\n/\\\\ n = ${n}"${init ? ',style = filled' : ''}];`;
  const edge = (a, b, act) => `${a} -> ${b} [label="${act}",color="black",fontcolor="black"];`;
  const dot = ['strict digraph DiskGraph {', node(1, 'idle', 0, true), edge(1, 2, 'StartPay'), node(2, 'paying', 0),
    edge(2, 3, 'Tick'), node(3, 'paying', 1), edge(3, 4, 'PayFails'), node(4, 'failed: #1', 1), edge(2, 4, 'PayFails'),
    edge(4, 1, 'Reset'), '}'].join('\n');
  const trace = ['idle', 'paying', 'failed: #1'].map((p, i) => ({ action: [undefined, 'StartPay', 'PayFails'][i], vars: { phase: `"${p}"`, n: '0' } }));
  const r = { dot, distinct: 4, complete: true, holds: ['TypeOK'], unchecked: [], bugs: [{ rule: 'NeverFails', kind: 'invariant', trace }] };
  const view = {
    title: 'Checkout: pay',
    state: v => ({ idle: 'Cart', paying: 'Paying' }[v.phase] || 'Payment failed'),
    step: (a, from) => (a === 'Reset' ? null : a === 'PayFails' ? `the card is declined [after ${from.n} retries]` : undefined),
  };
  const { report, chart } = sc.render('Checkout', r, view);
  assert.equal(chart, [
    '---', 'title: "Checkout: pay"', '---', 'stateDiagram-v2', '  direction LR',
    '  s0: Cart', '  s1: Paying', '  s2: Payment failed', '  [*] --> s0',
    '  s0 --> s1: start pay',
    '  s1 --> s2: the card is declined [after 0 retries] or the card is declined [after 1 retries]',
    '  note right of s2: breaks NeverFails',
    '  classDef bugPath stroke#58;#1680f3,stroke-width#58;2.5px'.replace(/#58;/g, ':'), '  class s0,s1,s2 bugPath',
    '  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834', '  class s2 breaks', '',
  ].join('\n'));
  assert.match(report, /The chart draws 3 states and 2 arrows\.\nThe chart does not draw 1 steps that stay in one chart state\.\nThe view hides 1 steps\./);
  assert.match(report, /## NeverFails breaks\nThe shortest path has 2 steps:\n0\. Cart\n1\. start pay: Paying\n2\. the card is declined \[after 0 retries\]: Payment failed/);
  const raw = sc.render('Checkout', { ...r, bugs: [] }).chart;
  assert.match(raw, /s3: n = 1, phase = #34;failed#58; #35;1#34;\n/, 'default labels: sorted variables, Mermaid syntax escaped');
});

test('statechart: CLI explains missing TLC and refuses a used output folder, writing nothing', () => {
  const dir = tmp();
  write(path.join(dir, 'M.tla'), '---- MODULE M ----\n====\n');
  write(path.join(dir, 'M.cfg'), 'INIT Init\nNEXT Next\n');
  const env = { ...process.env, TLA2TOOLS: path.join(dir, 'missing.jar') };
  const r = spawnSync(process.execPath, [SC, path.join(dir, 'M.tla')], { encoding: 'utf8', env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no tla2tools\.jar[\s\S]*v1\.7\.4\/tla2tools\.jar[\s\S]*936a2620/);
  assert.ok(!fs.existsSync(path.join(dir, 'M-chart')));
  write(path.join(dir, 'used/x'), '');
  assert.match(spawnSync(process.execPath, [SC, path.join(dir, 'M.tla'), '--out', path.join(dir, 'used')], { encoding: 'utf8', env }).stderr, /not empty/);
  assert.match(spawnSync(process.execPath, [SC, 'a.tla', '--bogus'], { encoding: 'utf8' }).stderr, /unknown option: --bogus/);
  assert.equal(spawnSync(process.execPath, [SC, '--help'], { encoding: 'utf8' }).status, 0);
});

test('formal skills are auto-invocable, routed only on signal, and sync ships the runner', () => {
  for (const n of ['formal', 'statechart']) assert.doesNotMatch(skillText(n), /\nexplicit: true\n/);
  assert.match(skillText('amizing-mode'), /formal \(add to any route only on signal\)[^\n]*\/formal[^\n]*\/statechart[^\n]*Never for CRUD/);
  const dir = tmp();
  ok('init', '--claude', '--dir', dir);
  assert.doesNotMatch(read(path.join(dir, '.claude/skills/formal/SKILL.md')), /disable-model-invocation/);
  assert.ok(fs.existsSync(path.join(dir, '.loopstack/templates/formal-gate.md')));
  const copy = path.join(dir, '.loopstack/statechart.js');
  assert.equal(read(copy), read(SC).replace(/\r\n/g, '\n'));
  assert.equal(spawnSync(process.execPath, [copy, '--help'], { encoding: 'utf8' }).status, 0, 'copied runner works standalone');
});

// Live TLC check; runs only when TLA2TOOLS points at tla2tools.jar (and Java is installed).
test('statechart: end to end against real TLC', { skip: !(process.env.TLA2TOOLS && fs.existsSync(process.env.TLA2TOOLS)) && 'set TLA2TOOLS to run' }, () => {
  const dir = tmp();
  write(path.join(dir, 'Door.tla'), ['---- MODULE Door ----', 'VARIABLES door, alarm', 'vars == <<door, alarm>>',
    'Init == door = "closed" /\\ alarm = FALSE', 'YouOpen == door = "closed" /\\ door\' = "open" /\\ UNCHANGED alarm',
    'YouClose == door = "open" /\\ door\' = "closed" /\\ UNCHANGED alarm', 'YouArm == alarm = FALSE /\\ alarm\' = TRUE /\\ UNCHANGED door',
    'Next == YouOpen \\/ YouClose \\/ YouArm', 'Spec == Init /\\ [][Next]_vars', 'NeverOpenWhileArmed == ~(door = "open" /\\ alarm)', '===='].join('\n'));
  write(path.join(dir, 'Door.cfg'), 'SPECIFICATION Spec\nINVARIANT NeverOpenWhileArmed\n');
  const r = spawnSync(process.execPath, [SC, path.join(dir, 'Door.tla')], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 1, r.stderr);
  const report = read(path.join(dir, 'Door-chart/report.md'));
  assert.match(report, /## NeverOpenWhileArmed breaks\nThe shortest path has 2 steps:/);
  assert.match(read(path.join(dir, 'Door-chart/chart.mmd')), /breaks NeverOpenWhileArmed/);
  assert.match(read(path.join(dir, 'Door-chart/tlc.out')), /Invariant NeverOpenWhileArmed is violated/);
});
