#!/usr/bin/env node
'use strict';
// loopstack usage dashboard: reads .loopstack/runs.jsonl from one or more repos, writes one offline HTML file.
// Node builtins only: `sync` copies this file to .loopstack/dashboard.js when telemetry is on.
// aggregate() and client() are embedded in the page via Function#toString, so they must not use module scope.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RUNS = '.loopstack/runs.jsonl';
const LEARNINGS = '.loopstack/learnings.md';
const CONFIG = 'loopstack-dashboard.json';
const ROUTES = ['bug', 'feature', 'incident', 'refactor', 'question'];
const SHIPS = ['none', 'committed', 'pushed', 'pr'];
const HEAVY = ['architect', 'design', 'adr', 'research', 'security', 'performance', 'release', 'deploy', 'arena', 'debate', 'swarm', 'compete'];
const USAGE = `usage: dashboard [--dir <repo>]... [--out <file>] [--since 90d|12w|YYYY-MM-DD] [--json] [--by-member]
  --dir        repo to read; repeat for a team view (default: "projects" in ${CONFIG}, else .)
  --out        HTML file to write (default loopstack-dashboard.html)
  --since      ignore tasks older than this
  --json       print aggregates as JSON instead of writing HTML
  --by-member  split by git author name (opt-in; read from git blame, never from the log)`;

const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && (hi === undefined || x <= hi);
const isName = x => typeof x === 'string' && x.length > 0 && x.length <= 40;

// One log line → normalized event, or null when malformed. Unknown fields are ignored (forward compatible).
function parseLine(line) {
  let o;
  try { o = JSON.parse(line); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || !isInt(o.v, 1) || !isInt(o.lvl, 0, 4)) return null;
  const t = typeof o.ts === 'string' ? Date.parse(o.ts) : NaN;
  if (Number.isNaN(t)) return null;
  const has = k => o[k] !== undefined;
  if (has('lvl0') && !isInt(o.lvl0, 0, 4)) return null;
  for (const k of ['loops', 'unv', 'learn']) if (has(k) && !isInt(o[k], 0)) return null;
  for (const k of ['route', 'ship', 'h']) if (has(k) && !isName(o[k])) return null;
  if (has('skills') && !(Array.isArray(o.skills) && o.skills.every(isName))) return null;
  if (has('gates') && !(o.gates && typeof o.gates === 'object' && !Array.isArray(o.gates)
    && Object.entries(o.gates).every(([k, v]) => isName(k) && isInt(v, 0)))) return null;
  if (has('dur') && !(typeof o.dur === 'number' && o.dur >= 0 && Number.isFinite(o.dur))) return null;
  const e = {
    ts: new Date(t).toISOString(),
    lvl: o.lvl,
    lvl0: has('lvl0') ? o.lvl0 : o.lvl,
    route: ROUTES.includes(o.route) ? o.route : 'other',
    skills: [...new Set(o.skills || [])],
    gates: o.gates || {},
    loops: o.loops || 0,
    unv: o.unv || 0,
    learn: o.learn || 0,
    ship: SHIPS.includes(o.ship) ? o.ship : 'none',
    h: o.h || 'unknown',
  };
  if (has('dur')) e.dur = o.dur;
  return e;
}

// Repos may be someone else's clone: never let their config run external diff, textconv or fsmonitor commands.
const git = (dir, args) => spawnSync('git', ['-C', dir, '-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

// Author name per log line (index = line - 1). Uncommitted lines → "local". Emails are never read.
function blame(dir) {
  const r = git(dir, ['blame', '--no-textconv', '--line-porcelain', '--', RUNS]);
  const out = [];
  if (r.status !== 0) return out;
  let line = 0, sha = '', author = '';
  for (const l of r.stdout.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
    if (m) { sha = m[1]; line = +m[2]; author = ''; }
    else if (l.startsWith('author ')) author = l.slice(7);
    else if (l.startsWith('\t')) out[line - 1] = /^0+$/.test(sha) || !author ? 'local' : author.slice(0, 40);
  }
  return out;
}

// Lessons added per commit day, from git history of learnings.md ("- " lines only).
function learningsByDay(dir) {
  const out = {};
  if (!fs.existsSync(path.join(dir, LEARNINGS))) return out;
  const r = git(dir, ['log', '--no-ext-diff', '--no-textconv', '--format=loopstack-date %cI', '-p', '--unified=0', '--', LEARNINGS]);
  if (r.status !== 0) return out;
  let day = null;
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('loopstack-date ')) day = /^\d{4}-\d{2}-\d{2}$/.test(l.slice(15, 25)) ? l.slice(15, 25) : null;
    else if (day && l.startsWith('+- ')) out[day] = (out[day] || 0) + 1;
  }
  return out;
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// Reads only runs.jsonl, learnings history, manifest.json, loopstack.json and generated skill frontmatter.
function readProject(dir, opts) {
  const p = f => path.join(dir, f);
  const manifest = readJson(p('.loopstack/manifest.json'));
  const cfg = readJson(p('loopstack.json')) || {};
  const meta = {
    name: path.basename(path.resolve(dir)),
    version: manifest ? (typeof manifest.version === 'string' ? manifest.version : 'pre-0.2') : 'not installed',
    harnesses: Array.isArray(cfg.harnesses) ? cfg.harnesses.filter(isName) : [],
    telemetry: cfg.telemetry === true,
    events: 0,
    skipped: 0,
    last: null,
    learnings: learningsByDay(dir),
  };
  const catalog = {};
  const skillsDir = p('.loopstack/skills');
  if (fs.existsSync(skillsDir)) {
    for (const f of fs.readdirSync(skillsDir).filter(f => f.endsWith('.md')).sort()) {
      catalog[f.slice(0, -3)] = /^explicit: true$/m.test(fs.readFileSync(path.join(skillsDir, f), 'utf8').split('\n---')[0]);
    }
  }
  const lines = fs.existsSync(p(RUNS)) ? fs.readFileSync(p(RUNS), 'utf8').split(/\r?\n/) : [];
  const authors = opts.byMember ? blame(dir) : null;
  const events = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    const e = parseLine(l);
    if (!e) { meta.skipped++; return; }
    if (authors) e.member = authors[i] || 'local';
    meta.events++;
    if (!meta.last || e.ts > meta.last) meta.last = e.ts;
    if (!opts.since || e.ts >= opts.since) events.push(e);
  });
  return { meta, catalog, events };
}

// Pure: events + context → every number the dashboard shows. Runs in Node (--json, tests) and in the page (filters).
function aggregate(events, ctx) {
  const RANK = { none: 0, committed: 1, pushed: 2, pr: 3 };
  const GATE_SKILL = { requirements: 'requirements', architecture: 'architect', implementation: 'implement', testing: 'test',
    security: 'security', review: 'review', verification: 'verify', release: 'release', deployment: 'deploy', production: 'observe' };
  const day = ts => ts.slice(0, 10);
  const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  const weekCache = {};
  const weekOf = ts => {
    const d = day(ts);
    return weekCache[d] || (weekCache[d] = addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)));
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const five = () => [0, 0, 0, 0, 0];
  const box = xs => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const q = p => { const i = (s.length - 1) * p, lo = Math.floor(i); return Math.round((s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)) * 10) / 10; };
    return { n: s.length, min: s[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: s[s.length - 1] };
  };
  const vkey = v => (/^\d+\.\d+\.\d+/.test(v) ? v.split('.').map(x => parseInt(x, 10)) : [-1]);
  const vcmp = (a, b) => { const x = vkey(a), y = vkey(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

  const sorted = events.slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const n = sorted.length;
  const weeks = [];
  if (n) for (let w = weekOf(sorted[0].ts), end = weekOf(sorted[n - 1].ts); w <= end; w = addDays(w, 7)) weeks.push(w);
  const wi = {};
  weeks.forEach((w, i) => { wi[w] = i; });
  const zeros = () => weeks.map(() => 0);
  const wk = { tasks: zeros(), firstPass: zeros(), rework: zeros(), gateFail: zeros(), unv: zeros(), learn: zeros(), loops: zeros(), levels: five().map(zeros) };
  const levels = five(), sizing = five().map(five), gateFails = {}, gateTasks = {}, loopsHist = [0, 0, 0, 0, 0, 0];
  const skillUse = {}, routes = {}, funnel = [0, 0, 0, 0], skillsPer = five().map(() => []), dur = five().map(() => []);
  const calendar = {}, projWeeks = {}, members = {};
  let firstPass = 0, rework = 0, gateFail = 0, unv = 0, learn = 0, heavyLow = 0, resized = 0, bugs = 0, bugTdd = 0, unvTasks = 0;

  for (const e of sorted) {
    const i = wi[weekOf(e.ts)];
    const failed = Object.keys(e.gates).filter(g => e.gates[g] > 0);
    wk.tasks[i]++; wk.levels[e.lvl][i]++; wk.unv[i] += e.unv; wk.learn[i] += e.learn; wk.loops[i] += e.loops;
    if (!failed.length && !e.loops) { firstPass++; wk.firstPass[i]++; }
    if (e.loops) { rework++; wk.rework[i]++; }
    if (failed.length) { gateFail++; wk.gateFail[i]++; }
    for (const g of failed) {
      gateFails[g] = (gateFails[g] || 0) + e.gates[g];
      (gateTasks[g] = gateTasks[g] || five())[e.lvl]++;
    }
    levels[e.lvl]++;
    sizing[e.lvl0][e.lvl]++;
    if (e.lvl0 !== e.lvl) resized++;
    loopsHist[Math.min(e.loops, 5)]++;
    for (const s of e.skills) skillUse[s] = (skillUse[s] || 0) + 1;
    const r = (routes[e.project] = routes[e.project] || {});
    r[e.route] = (r[e.route] || 0) + 1;
    for (let k = 0; k <= RANK[e.ship]; k++) funnel[k]++;
    skillsPer[e.lvl].push(e.skills.length);
    if (e.dur !== undefined) dur[e.lvl].push(e.dur);
    if (e.lvl <= 1 && e.skills.some(s => ctx.heavy.indexOf(s) >= 0)) heavyLow++;
    if (e.unv) unvTasks++;
    unv += e.unv;
    learn += e.learn;
    calendar[day(e.ts)] = (calendar[day(e.ts)] || 0) + 1;
    (projWeeks[e.project] = projWeeks[e.project] || zeros())[i]++;
    if (e.member !== undefined) (members[e.member] = members[e.member] || five())[e.lvl]++;
    if (e.route === 'bug') { bugs++; if (e.skills.indexOf('tdd') >= 0) bugTdd++; }
  }

  const learnWeeks = zeros();
  for (const p of ctx.projects) {
    for (const d of Object.keys(p.learnings || {})) {
      const j = wi[weekOf(d)];
      if (j !== undefined) learnWeeks[j] += p.learnings[d];
    }
  }
  const gateNames = Object.keys(gateFails).sort((a, b) => gateFails[b] - gateFails[a] || (a < b ? -1 : 1));
  const skills = Object.keys(skillUse).sort((a, b) => skillUse[b] - skillUse[a] || (a < b ? -1 : 1))
    .map(s => ({ name: s, count: skillUse[s], explicit: ctx.catalog[s] === true }));
  const neverUsed = Object.keys(ctx.catalog).filter(s => !skillUse[s] && s !== 'amizing-mode').sort();

  // Deterministic rules only; "now" is the newest event so output is reproducible.
  const insights = [];
  const add = (msg, evidence, action) => insights.push({ msg, evidence, action });
  for (const g of gateNames) {
    for (let l = 0; l < 5; l++) {
      const t = gateTasks[g][l];
      if (levels[l] >= 5 && t / levels[l] >= 0.3) add(`${g} gate fails in ${pct(t, levels[l])}% of L${l} tasks`, `${t} of ${levels[l]} L${l} tasks`, `run /${GATE_SKILL[g] || 'verify'} earlier in the loop`);
    }
  }
  if (n >= 10 && rework / n >= 0.3) add(`${pct(rework, n)}% of tasks loop back at least once`, `${rework} of ${n} tasks`, 'tighten acceptance criteria with /requirements');
  if (n >= 10 && resized / n >= 0.25) add(`Size changed mid-task in ${pct(resized, n)}% of tasks`, `${resized} of ${n} tasks`, 'revisit the sizing signals at /amizing-mode intake');
  if (heavyLow >= 3) add(`${heavyLow} L0/L1 tasks loaded heavy skills`, `heavy = ${ctx.heavy.join(', ')}`, 'keep process proportional to risk');
  if (bugs >= 5 && !bugTdd) add(`/tdd never used on ${bugs} bug tasks`, `0 of ${bugs} bug tasks`, 'reproduce bugs with a failing test (/tdd)');
  if (n >= 5 && unvTasks / n >= 0.3) add(`${pct(unvTasks, n)}% of tasks end with UNVERIFIED items`, `${unvTasks} of ${n} tasks`, 'close verification gaps with /verify');
  const newest = n ? sorted[n - 1].ts : null;
  for (const p of ctx.projects) {
    if (p.telemetry && !p.last) add(`${p.name}: telemetry is on but no tasks are logged`, 'runs.jsonl empty or missing', 'run a task through /amizing-mode, then check .loopstack/runs.jsonl');
    else if (p.last && newest) {
      const days = Math.floor((Date.parse(newest) - Date.parse(p.last)) / 864e5);
      if (days >= 30) add(`${p.name}: no tasks logged for ${days} days`, `last task ${day(p.last)}`, 'check the install, then loopstack sync');
    }
  }
  const installed = ctx.projects.filter(p => p.version !== 'not installed');
  const latest = installed.map(p => p.version).sort(vcmp).pop();
  const behind = installed.filter(p => vcmp(p.version, latest) < 0);
  if (behind.length) add(`${behind.length} project(s) behind loopstack ${latest}`, behind.map(p => `${p.name} (${p.version})`).join(', '), 'pull loopstack and run loopstack sync');
  const skipped = ctx.projects.filter(p => p.skipped);
  if (skipped.length) add(`${skipped.reduce((s, p) => s + p.skipped, 0)} malformed log lines skipped`, skipped.map(p => `${p.name}: ${p.skipped}`).join(', '), 'inspect .loopstack/runs.jsonl');

  return {
    tasks: n,
    range: n ? [day(sorted[0].ts), day(sorted[n - 1].ts)] : null,
    kpi: { tasks: n, firstPass: pct(firstPass, n), rework: pct(rework, n), gateFail: pct(gateFail, n), unv, learn },
    weeks,
    weekly: {
      tasks: wk.tasks,
      firstPass: weeks.map((_, i) => pct(wk.firstPass[i], wk.tasks[i])),
      rework: weeks.map((_, i) => pct(wk.rework[i], wk.tasks[i])),
      gateFail: weeks.map((_, i) => pct(wk.gateFail[i], wk.tasks[i])),
      loops: weeks.map((_, i) => (wk.tasks[i] ? Math.round((wk.loops[i] / wk.tasks[i]) * 100) / 100 : null)),
      unv: wk.unv,
      learn: wk.learn,
      learnGit: learnWeeks,
      levels: wk.levels,
    },
    levels,
    gates: gateNames.map(g => ({ name: g, fails: gateFails[g], byLevel: gateTasks[g], rate: gateTasks[g].map((t, l) => pct(t, levels[l])) })),
    loopsHist,
    skills,
    neverUsed,
    routes,
    sizing,
    resized,
    funnel,
    skillsPerTask: skillsPer.map(box),
    duration: dur.map(box),
    heavyLow,
    calendar,
    projectWeeks: projWeeks,
    members,
    insights,
  };
}

// Browser side: filters, charts (inline SVG), tables, export. All text goes through text nodes, never innerHTML.
function client(DATA, aggregate) {
  const NS = 'http://www.w3.org/2000/svg';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LV = ['L0', 'L1', 'L2', 'L3', 'L4'];
  const ROUTES = ['bug', 'feature', 'incident', 'refactor', 'question', 'other'];
  const all = DATA.events;
  const ctx0 = DATA.ctx;

  function h(tag, attrs, ...kids) {
    const svg = tag.startsWith('s:');
    const n = svg ? document.createElementNS(NS, tag.slice(2)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(typeof c === 'object' ? c : String(c));
    return n;
  }
  const tip = t => h('s:title', null, t);
  const wl = w => `${MON[+w.slice(5, 7) - 1]} ${+w.slice(8, 10)}`;
  const num = x => (x === null || x === undefined ? '–' : Math.abs(x) >= 1e4 ? `${(x / 1e3).toFixed(1).replace(/\.0$/, '')}K` : (Math.round(x * 10) / 10).toLocaleString('en-US'));
  const pc = x => (x === null || x === undefined ? '–' : `${num(x)}%`);
  const short = (s, k) => (s.length > k ? `${s.slice(0, k - 1)}…` : s);
  const nice = max => { const p = Math.pow(10, Math.floor(Math.log10(max))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p; return 10 * p; };
  const frame = (w, hh, label) => h('s:svg', { viewBox: `0 0 ${w} ${hh}`, class: 'chart', style: `max-width:${w}px`, role: 'img', 'aria-label': label });
  const empty = () => h('p', { class: 'empty' }, 'No tasks for this selection.');

  function yAxis(g, max, y, x0, x1, fmt) {
    for (const v of [0, max / 2, max]) {
      g.append(h('s:line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: v ? 'gl' : 'base' }),
        h('s:text', { x: x0 - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, (fmt || num)(v)));
    }
  }

  function columns(labels, series, label, fmtLab) {
    const W = 640, H = 220, L = 44, R = 8, T = 10, B = 24, n = labels.length || 1;
    const band = (W - L - R) / n, bw = Math.max(2, Math.min(24, band * 0.7)), every = Math.ceil(n / 7);
    const tot = labels.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
    const max = nice(Math.max(1, ...tot)), y = v => T + (H - T - B) * (1 - v / max);
    const g = frame(W, H, label);
    yAxis(g, max, y, L, W - R);
    labels.forEach((lab, i) => {
      const x = L + band * i + (band - bw) / 2;
      let acc = 0;
      for (const se of series) {
        const v = se.values[i] || 0;
        if (!v) continue;
        const y0 = y(acc) - (acc ? 2 : 0), y1 = y(acc + v);
        g.append(h('s:rect', { x, y: y1, width: bw, height: Math.max(1, y0 - y1), class: `f-${se.cls}` }, tip(`${fmtLab(lab)} · ${se.name}: ${num(v)}`)));
        acc += v;
      }
      if (i % every === 0) g.append(h('s:text', { x: x + bw / 2, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, fmtLab(lab)));
    });
    return g;
  }

  function hbars(items, label) {
    const W = 640, row = 26, LW = 150, H = items.length * row + 4;
    const max = Math.max(1, ...items.map(d => d.value));
    const g = frame(W, H, label);
    items.forEach((d, i) => {
      const y = 2 + i * row, w = Math.max(2, ((W - LW - 90) * d.value) / max), text = d.text || num(d.value);
      g.append(h('s:text', { x: LW - 8, y: y + 17, class: 'lab', 'text-anchor': 'end' }, short(d.label, 22)),
        h('s:rect', { x: LW, y: y + 5, width: w, height: 16, rx: 4, class: `f-${d.cls || 'accent'}` }, tip(`${d.label}: ${text}`)),
        h('s:text', { x: LW + w + 6, y: y + 17, class: 'val' }, text));
    });
    return g;
  }

  function stack100(rows, keys, clsOf, label) {
    const W = 640, row = 30, LW = 130, H = rows.length * row + 4, BW = W - LW - 8;
    const g = frame(W, H, label);
    rows.forEach((r, i) => {
      const y = 2 + i * row, tot = keys.reduce((s, k) => s + (r.parts[k] || 0), 0) || 1;
      g.append(h('s:text', { x: LW - 8, y: y + 19, class: 'lab', 'text-anchor': 'end' }, short(r.label, 18)));
      let x = LW;
      for (const k of keys) {
        const v = r.parts[k] || 0;
        if (!v) continue;
        const w = (BW * v) / tot;
        g.append(h('s:rect', { x, y: y + 5, width: Math.max(1, w - 2), height: 20, class: `f-${clsOf(k)}` }, tip(`${r.label} · ${k}: ${v} (${Math.round((100 * v) / tot)}%)`)));
        if (w > 44) g.append(h('s:text', { x: x + 6, y: y + 19, class: 'ink-on' }, `${Math.round((100 * v) / tot)}%`));
        x += w;
      }
    });
    return g;
  }

  function donut(items, label) {
    const S = 220, c = 110, r0 = 64, r1 = 96, tot = items.reduce((s, d) => s + d.value, 0);
    const g = frame(S, S, label);
    const pt = (r, t) => `${(c + r * Math.cos(t)).toFixed(2)} ${(c + r * Math.sin(t)).toFixed(2)}`;
    const live = items.filter(d => d.value);
    let a = -Math.PI / 2;
    for (const d of live) {
      const sweep = (2 * Math.PI * d.value) / tot, pad = live.length > 1 ? 0.012 : 0;
      const a0 = a + pad, a1 = a + Math.min(sweep, 2 * Math.PI - 1e-4) - pad, large = a1 - a0 > Math.PI ? 1 : 0;
      g.append(h('s:path', { d: `M${pt(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)}Z`, class: `f-${d.cls}` },
        tip(`${d.label}: ${d.value} (${Math.round((100 * d.value) / tot)}%)`)));
      a += sweep;
    }
    g.append(h('s:text', { x: c, y: c + 6, class: 'big', 'text-anchor': 'middle' }, num(tot)),
      h('s:text', { x: c, y: c + 26, class: 'tick', 'text-anchor': 'middle' }, 'tasks'));
    return g;
  }

  function heat(rows, cols, cell, label) {
    const LW = 120, CW = 64, RH = 28, TH = 22, W = LW + cols.length * CW, H = TH + rows.length * RH;
    const g = frame(W, H, label);
    cols.forEach((c, j) => g.append(h('s:text', { x: LW + j * CW + CW / 2, y: 15, class: 'tick', 'text-anchor': 'middle' }, c)));
    rows.forEach((r, i) => {
      g.append(h('s:text', { x: LW - 8, y: TH + i * RH + 18, class: 'lab', 'text-anchor': 'end' }, short(r, 16)));
      cols.forEach((c, j) => {
        const d = cell(i, j), x = LW + j * CW, y = TH + i * RH, on = d.v !== null && d.v > 0;
        g.append(h('s:rect', { x: x + 1, y: y + 1, width: CW - 2, height: RH - 2, rx: 3, class: on ? 'f-accent' : 'f-empty', 'fill-opacity': on ? (0.12 + 0.88 * d.v).toFixed(3) : null }, tip(d.tip)),
          h('s:text', { x: x + CW / 2, y: y + 18, 'text-anchor': 'middle', class: on && d.v > 0.55 ? 'ink-on' : 'cell' }, d.text));
      });
    });
    return g;
  }

  function line(labels, values, label, fmtV, area) {
    const W = 640, H = 200, L = 44, R = 14, T = 12, B = 24, n = labels.length;
    const vals = values.filter(v => v !== null);
    const max = nice(Math.max(1, ...vals)), y = v => T + (H - T - B) * (1 - v / max);
    const x = i => (n <= 1 ? (W + L - R) / 2 : L + ((W - L - R) * i) / (n - 1));
    const g = frame(W, H, label);
    yAxis(g, max, y, L, W - R, fmtV);
    let d = '', wash = '', seg = [];
    const flush = () => {
      if (!seg.length) return;
      d += seg.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`).join('');
      wash += `M${x(seg[0]).toFixed(1)} ${y(0)}${seg.map(i => `L${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`).join('')}L${x(seg[seg.length - 1]).toFixed(1)} ${y(0)}Z`;
      seg = [];
    };
    values.forEach((v, i) => { if (v === null) flush(); else seg.push(i); });
    flush();
    if (area) g.append(h('s:path', { d: wash, class: 'wash' }));
    g.append(h('s:path', { d, class: 'line' }));
    const every = Math.ceil(n / 7), band = n > 1 ? (W - L - R) / (n - 1) : W - L - R;
    labels.forEach((lab, i) => {
      if (values[i] !== null) g.append(h('s:rect', { x: x(i) - band / 2, y: T, width: band, height: H - T - B, class: 'hit' }, tip(`${wl(lab)}: ${(fmtV || num)(values[i])}`)));
      if (i % every === 0) g.append(h('s:text', { x: x(i), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, wl(lab)));
    });
    const lastI = values.map((v, i) => (v === null ? -1 : i)).filter(i => i >= 0).pop();
    if (lastI !== undefined) {
      g.append(h('s:circle', { cx: x(lastI), cy: y(values[lastI]), r: 4, class: 'dot' }),
        h('s:text', { x: Math.min(x(lastI) + 8, W - 2), y: y(values[lastI]) - 8, class: 'val', 'text-anchor': x(lastI) + 40 > W ? 'end' : 'start' }, (fmtV || num)(values[lastI])));
    }
    return g;
  }

  function boxes(stats, label, unit) {
    const W = 640, H = 210, L = 44, R = 8, T = 10, B = 24, band = (W - L - R) / 5;
    const max = nice(Math.max(1, ...stats.filter(Boolean).map(s => s.max))), y = v => T + (H - T - B) * (1 - v / max);
    const g = frame(W, H, label);
    yAxis(g, max, y, L, W - R);
    stats.forEach((s, i) => {
      const cx = L + band * i + band / 2;
      g.append(h('s:text', { x: cx, y: H - 6, class: 'tick', 'text-anchor': 'middle' }, `${LV[i]}${s ? ` · n=${s.n}` : ''}`));
      if (!s) return;
      const t = tip(`${LV[i]}: median ${s.med}${unit}, IQR ${s.q1}–${s.q3}, range ${s.min}–${s.max} (n=${s.n})`);
      g.append(h('s:line', { x1: cx, x2: cx, y1: y(s.min), y2: y(s.max), class: 'whisk' }),
        h('s:rect', { x: cx - 12, y: y(s.q3), width: 24, height: Math.max(2, y(s.q1) - y(s.q3)), rx: 4, class: `f-l${i}` }, t),
        h('s:line', { x1: cx - 12, x2: cx + 12, y1: y(s.med), y2: y(s.med), class: 'med' }));
    });
    return g;
  }

  function calendar(counts, end) {
    const C = 12, endMs = Date.parse(`${end}T00:00:00Z`), dow = (new Date(endMs).getUTCDay() + 6) % 7;
    const start = endMs - (52 * 7 + dow) * 864e5, W = 34 + 53 * C, H = 18 + 7 * C;
    const max = Math.max(1, ...Object.values(counts));
    const g = frame(W, H, 'Tasks per day, last 12 months');
    ['Mon', 'Wed', 'Fri'].forEach((d, i) => g.append(h('s:text', { x: 0, y: 18 + i * 2 * C + 9, class: 'tick' }, d)));
    for (let k = 0; k < 53 * 7; k++) {
      const ms = start + k * 864e5;
      if (ms > endMs) break;
      const d = new Date(ms).toISOString().slice(0, 10), v = counts[d] || 0, col = Math.floor(k / 7), row = k % 7;
      if (row === 0 && +d.slice(8) <= 7) g.append(h('s:text', { x: 34 + col * C, y: 10, class: 'tick' }, MON[+d.slice(5, 7) - 1]));
      g.append(h('s:rect', { x: 34 + col * C, y: 16 + row * C, width: C - 2, height: C - 2, rx: 2, class: v ? 'f-accent' : 'f-empty', 'fill-opacity': v ? (0.25 + (0.75 * v) / max).toFixed(3) : null }, tip(`${d}: ${v} task${v === 1 ? '' : 's'}`)));
    }
    return g;
  }

  function spark(values) {
    const pts = values.map((v, i) => [i, v]).filter(p => p[1] !== null);
    if (pts.length < 2) return null;
    const W = 140, H = 32, max = Math.max(...pts.map(p => p[1])), min = Math.min(...pts.map(p => p[1]));
    const x = i => 2 + ((W - 8) * i) / (values.length - 1), y = v => H - 4 - ((H - 8) * (v - min)) / (max - min || 1);
    const last = pts[pts.length - 1];
    return h('s:svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', 'aria-hidden': 'true' },
      h('s:path', { d: pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(''), class: 'line thin' }),
      h('s:circle', { cx: x(last[0]), cy: y(last[1]), r: 3, class: 'dot' }));
  }

  const legend = items => h('ul', { class: 'legend' }, items.map(i => h('li', null, h('span', { class: `sw f-${i.cls}` }), i.name)));
  function table(cols, rows) {
    return h('div', { class: 'tw' }, h('table', null,
      h('thead', null, h('tr', null, cols.map(c => h('th', { scope: 'col' }, c)))),
      h('tbody', null, rows.map(r => h('tr', null, r.map(v => h('td', null, v === null || v === undefined ? '–' : v)))))));
  }
  function card(title, sub, body, data, opts) {
    const o = opts || {};
    return h('section', { class: `card${o.wide ? ' wide' : ''}` },
      h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null, o.legend ? legend(o.legend) : null, body,
      data ? h('details', null, h('summary', null, 'Show data'), table(data.cols, data.rows)) : null);
  }

  // Filters
  const F = { range: '', from: '', to: '', project: '', lvl: '', route: '', h: '', member: '' };
  const uniq = k => [...new Set(all.map(e => e[k]).filter(v => v !== undefined))].sort();
  const lastDay = all.length ? all.reduce((m, e) => (e.ts > m ? e.ts : m), '').slice(0, 10) : null;
  const shift = days => new Date(Date.parse(`${lastDay}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  function select(key, label, opts) {
    return h('label', null, label, h('select', { onchange: ev => { F[key] = ev.target.value; update(); } },
      h('option', { value: '' }, 'All'), opts.map(o => h('option', { value: o[0] }, o[1]))));
  }
  const fromIn = h('input', { type: 'date', onchange: ev => { F.from = ev.target.value; update(); } });
  const toIn = h('input', { type: 'date', onchange: ev => { F.to = ev.target.value; update(); } });
  const rangeSel = h('select', { onchange: ev => {
    const d = +ev.target.value;
    F.from = d && lastDay ? shift(d) : ''; F.to = '';
    fromIn.value = F.from; toIn.value = ''; update();
  } }, h('option', { value: '' }, 'All time'), [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']].map(o => h('option', { value: o[0] }, o[1])));
  const filters = document.getElementById('filters');
  filters.append(h('label', null, 'Range', rangeSel), h('label', null, 'From', fromIn), h('label', null, 'To', toIn),
    select('project', 'Project', uniq('project').map(v => [v, v])),
    select('lvl', 'Level', LV.map((l, i) => [String(i), l])),
    select('route', 'Route', ROUTES.map(r => [r, r])),
    select('h', 'Harness', uniq('h').map(v => [v, v])),
    ...(ctx0.members ? [select('member', 'Member', uniq('member').map(v => [v, v]))] : []),
    h('button', { type: 'button', onclick: () => exportData('csv') }, 'Export CSV'),
    h('button', { type: 'button', onclick: () => exportData('json') }, 'Export JSON'));

  const pass = e => (!F.from || e.ts.slice(0, 10) >= F.from) && (!F.to || e.ts.slice(0, 10) <= F.to)
    && (!F.project || e.project === F.project) && (F.lvl === '' || e.lvl === +F.lvl)
    && (!F.route || e.route === F.route) && (!F.h || e.h === F.h) && (!F.member || e.member === F.member);

  const COLS = [['ts', 'Date'], ['project', 'Project']].concat(ctx0.members ? [['member', 'Member']] : [],
    [['lvl', 'Level'], ['lvl0', 'First size'], ['route', 'Route'], ['skills', 'Skills'], ['fails', 'Gate fails'], ['loops', 'Loops'],
      ['unv', 'UNVERIFIED'], ['learn', 'Learnings'], ['ship', 'Ship'], ['h', 'Harness'], ['dur', 'Minutes']]);
  const cellOf = (e, k) => (k === 'fails' ? Object.values(e.gates).reduce((s, v) => s + v, 0) : k === 'skills' ? e.skills.join(' ')
    : k === 'ts' ? e.ts.slice(0, 10) : k === 'lvl' || k === 'lvl0' ? `L${e[k]}` : e[k]);
  function exportData(kind) {
    const evs = all.filter(pass);
    const safe = v => { let s = v === undefined || v === null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = kind === 'json' ? JSON.stringify(evs, null, 2)
      : [COLS.map(c => c[1]).join(','), ...evs.map(e => COLS.map(c => safe(cellOf(e, c[0]))).join(','))].join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv' })), download: `loopstack-usage.${kind}` });
    document.body.append(a); a.click(); a.remove();
  }

  let sortKey = 'ts', sortDir = -1;
  function taskTable(evs) {
    const wrap = h('div', { class: 'tw' });
    const draw = () => {
      const key = e => { const v = cellOf(e, sortKey); return v === undefined ? '' : v; };
      const rows = evs.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; }).slice(0, 200);
      wrap.replaceChildren(h('table', { class: 'tasks' },
        h('thead', null, h('tr', null, COLS.map(([k, label]) => h('th', { scope: 'col', 'aria-sort': k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none' },
          h('button', { type: 'button', onclick: () => { sortDir = k === sortKey ? -sortDir : -1; sortKey = k; draw(); } }, label, k === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''))))),
        h('tbody', null, rows.map(e => h('tr', null, COLS.map(([k]) => h('td', null, cellOf(e, k) === undefined ? '–' : cellOf(e, k))))))),
        evs.length > 200 ? h('p', { class: 'sub' }, `Showing 200 of ${evs.length}. Export for the full list.`) : null);
    };
    draw();
    return wrap;
  }

  function fleet(a) {
    const rows = ctx0.projects.filter(p => !F.project || p.name === F.project);
    const multiples = h('div', { class: 'multiples' }, rows.map(p => {
      const vals = a.projectWeeks[p.name];
      return h('div', { class: 'mini' }, h('b', null, short(p.name, 24)), h('span', { class: 'sub' }, `${vals ? vals.reduce((s, v) => s + v, 0) : 0} tasks`), vals ? spark(vals) : h('span', { class: 'sub' }, 'no tasks in range'));
    }));
    return card('Is every project healthy and up to date?', 'Tasks per week per project, loopstack version and harnesses (drift shows here first).',
      h('div', null, multiples, table(['Project', 'loopstack', 'Harnesses', 'Telemetry', 'Tasks logged', 'Skipped lines', 'Last task'],
        rows.map(p => [p.name, p.version, p.harnesses.join(', ') || '–', p.telemetry ? 'on' : 'off', p.events, p.skipped, p.last ? p.last.slice(0, 10) : '–']))), null, { wide: true });
  }

  function sections(a, evs) {
    const out = [];
    if (!all.length) {
      out.push(card('No usage data yet', null, h('ol', { class: 'steps' },
        h('li', null, 'Set "telemetry": true in loopstack.json and run loopstack sync (commit the result for your team).'),
        h('li', null, 'Run tasks through /amizing-mode. Each finished task appends one line to .loopstack/runs.jsonl.'),
        h('li', null, 'Run /ls-usage-dashboard (or loopstack dashboard) again.')), null, { wide: true }));
      out.push(fleet(a));
      return out;
    }
    const k = a.kpi, w = a.weekly;
    out.push(h('div', { class: 'tiles wide' }, [
      ['Tasks', num(k.tasks), `${a.range[0]} → ${a.range[1]}`, w.tasks],
      ['First-pass rate', pc(k.firstPass), 'no gate failure, no loop-back', w.firstPass],
      ['Rework rate', pc(k.rework), 'tasks that looped back', w.rework],
      ['Gate failure rate', pc(k.gateFail), 'tasks with a failed gate', w.gateFail],
      ['UNVERIFIED items', num(k.unv), 'reported at task end', w.unv],
      ['Learnings added', num(k.learn), 'logged by tasks', w.learn],
    ].map(t => h('div', { class: 'tile' }, h('span', { class: 'tl' }, t[0]), h('span', { class: 'tv' }, t[1]), spark(t[3]), h('span', { class: 'sub' }, t[2])))));

    out.push(card('What should we adjust?', 'Rules over the selected tasks. Each item shows its evidence.',
      a.insights.length ? h('ul', { class: 'insights' }, a.insights.map(i => h('li', null, h('b', null, i.msg), ' → ', i.action, h('span', { class: 'sub' }, ` (${i.evidence})`))))
        : h('p', { class: 'sub' }, 'Nothing stands out for this selection.'), null, { wide: true }));

    if (!evs.length) { out.push(card('No tasks match these filters', null, empty(), null, { wide: true }), fleet(a)); return out; }
    const lvSeries = LV.map((l, i) => ({ name: l, cls: `l${i}`, values: w.levels[i] }));
    const lvLegend = LV.map((l, i) => ({ name: l, cls: `l${i}` }));
    const wkRows = a.weeks.map((wk, i) => [wk, w.tasks[i], ...LV.map((_, l) => w.levels[l][i])]);

    out.push(card('What size is our work?', 'Tasks per week by final level.', columns(a.weeks, lvSeries, 'Tasks per week by level', wl),
      { cols: ['Week', 'Tasks', ...LV], rows: wkRows }, { legend: lvLegend }));
    out.push(card('What is the overall mix?', 'Share of tasks by final level.',
      h('div', { class: 'center' }, donut(LV.map((l, i) => ({ label: l, value: a.levels[i], cls: `l${i}` })), 'Tasks by level')),
      { cols: ['Level', 'Tasks'], rows: LV.map((l, i) => [l, a.levels[i]]) }, { legend: lvLegend }));
    out.push(card('Which gates fail?', 'Gate failures (core and extension gates).',
      a.gates.length ? hbars(a.gates.map(g => ({ label: g.name, value: g.fails })), 'Gate failures') : h('p', { class: 'sub' }, 'No gate failures logged.'),
      { cols: ['Gate', 'Failures', ...LV.map(l => `${l} tasks`)], rows: a.gates.map(g => [g.name, g.fails, ...g.byLevel]) }));
    const rmax = Math.max(1e-9, ...a.gates.flatMap(g => g.rate.filter(v => v !== null)));
    out.push(card('Where do gates fail, by size?', 'Share of tasks at each level where the gate failed. Darker = higher.',
      a.gates.length ? heat(a.gates.map(g => g.name), LV, (r, c) => {
        const g = a.gates[r], v = g.rate[c];
        return { v: v === null ? null : v / rmax, text: pc(v), tip: `${g.name} · ${LV[c]}: ${g.byLevel[c]} of ${a.levels[c]} tasks (${pc(v)})` };
      }, 'Gate failure rate by level') : h('p', { class: 'sub' }, 'No gate failures logged.'),
      { cols: ['Gate', ...LV], rows: a.gates.map(g => [g.name, ...g.rate.map(pc)]) }));
    out.push(card('How much rework?', 'Average loop-backs per task, per week.', line(a.weeks, w.loops, 'Loop-backs per task per week', null, true),
      { cols: ['Week', 'Loops per task'], rows: a.weeks.map((wk, i) => [wk, w.loops[i]]) }));
    const hl = ['0', '1', '2', '3', '4', '5+'];
    out.push(card('How many loop-backs does a task take?', 'Tasks by number of loop-backs.',
      columns(hl, [{ name: 'Tasks', cls: 'accent', values: a.loopsHist }], 'Tasks by loop-backs', x => x),
      { cols: ['Loop-backs', 'Tasks'], rows: hl.map((x, i) => [x, a.loopsHist[i]]) }));
    out.push(card('Which skills are used?', 'Tasks that ran each skill. [explicit] = opt-in only.',
      h('div', null, a.skills.length ? hbars(a.skills.slice(0, 20).map(s => ({ label: s.explicit ? `${s.name} [explicit]` : s.name, value: s.count })), 'Skill usage') : h('p', { class: 'sub' }, 'No skills logged.'),
        a.neverUsed.length ? h('p', { class: 'sub' }, `Never used in this selection (candidates to prune or improve): ${a.neverUsed.join(', ')}`) : null),
      { cols: ['Skill', 'Tasks', 'Explicit'], rows: a.skills.map(s => [s.name, s.count, s.explicit ? 'yes' : '']) }));
    const projs = Object.keys(a.routes).sort();
    const routeCls = r => `r${ROUTES.indexOf(r)}`;
    out.push(card('What kind of work?', 'Route mix per project.', stack100(projs.map(p => ({ label: p, parts: a.routes[p] })), ROUTES, routeCls, 'Route mix per project'),
      { cols: ['Project', ...ROUTES], rows: projs.map(p => [p, ...ROUTES.map(r => a.routes[p][r] || 0)]) }, { legend: ROUTES.map(r => ({ name: r, cls: routeCls(r) })) }));
    const smax = Math.max(1, ...a.sizing.flat());
    out.push(card('Do we size tasks correctly?', `Rows: first size, columns: final size. Off-diagonal = resized (${a.resized} tasks).`,
      heat(LV.map(l => `first ${l}`), LV.map(l => `final ${l}`), (r, c) => {
        const v = a.sizing[r][c];
        return { v: v ? v / smax : null, text: v ? num(v) : '', tip: `first ${LV[r]} → final ${LV[c]}: ${v} tasks` };
      }, 'Sizing accuracy matrix'),
      { cols: ['First \\ final', ...LV], rows: a.sizing.map((r, i) => [LV[i], ...r]) }));
    out.push(card('Is verification debt growing?', 'UNVERIFIED items reported per week.', line(a.weeks, w.unv, 'UNVERIFIED items per week', null, true),
      { cols: ['Week', 'UNVERIFIED'], rows: a.weeks.map((wk, i) => [wk, w.unv[i]]) }));
    const stages = ['Tasks', 'Committed', 'Pushed', 'PR'];
    out.push(card('Is work getting shipped?', 'Tasks reaching each /ship stage.',
      hbars(stages.map((s, i) => ({ label: s, value: a.funnel[i], cls: `l${i + 1}`, text: `${num(a.funnel[i])} · ${pc(a.funnel[0] ? Math.round((1000 * a.funnel[i]) / a.funnel[0]) / 10 : null)}` })), 'Ship funnel'),
      { cols: ['Stage', 'Tasks'], rows: stages.map((s, i) => [s, a.funnel[i]]) }));
    const hasDur = a.duration.some(Boolean);
    out.push(card('Is process proportional to risk?', `Skills run per task by level. ${a.heavyLow} L0/L1 task(s) loaded heavy skills.`,
      h('div', null, boxes(a.skillsPerTask, 'Skills per task by level', ''), hasDur ? h('h3', null, 'Minutes per task by level') : null, hasDur ? boxes(a.duration, 'Minutes per task by level', ' min') : null),
      { cols: ['Level', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max'], rows: a.skillsPerTask.map((s, i) => (s ? [LV[i], s.n, s.min, s.q1, s.med, s.q3, s.max] : [LV[i], 0, null, null, null, null, null])) }));
    out.push(card('Is the loop learning?', 'Lessons committed to learnings.md per week (git history).',
      w.learnGit.some(Boolean) ? columns(a.weeks, [{ name: 'Lessons', cls: 'accent', values: w.learnGit }], 'Lessons per week', wl)
        : h('p', { class: 'sub' }, 'No lessons committed in this range (learnings.md has no git history here).'),
      { cols: ['Week', 'Lessons (git)', 'Lessons (task log)'], rows: a.weeks.map((wk, i) => [wk, w.learnGit[i], w.learn[i]]) }));
    out.push(card('When does the work happen?', 'Tasks per day, last 12 months.', h('div', { class: 'scroll' }, calendar(a.calendar, a.range[1])),
      { cols: ['Day', 'Tasks'], rows: Object.keys(a.calendar).sort().map(d => [d, a.calendar[d]]) }, { wide: true }));
    if (ctx0.members) {
      const names = Object.keys(a.members).sort();
      out.push(card('Who works at which size?', 'Tasks per member by level, alphabetical. Not a ranking.',
        stack100(names.map(m => ({ label: m, parts: Object.fromEntries(LV.map((l, i) => [l, a.members[m][i]])) })), LV, l => `l${LV.indexOf(l)}`, 'Tasks per member by level'),
        { cols: ['Member', ...LV, 'Total'], rows: names.map(m => [m, ...a.members[m], a.members[m].reduce((s, v) => s + v, 0)]) }, { legend: lvLegend }));
    }
    out.push(fleet(a));
    out.push(card('Which tasks are these?', 'Click a column to sort.', taskTable(evs), null, { wide: true }));
    return out;
  }

  const main = document.getElementById('main');
  const status = document.getElementById('status');
  function update() {
    const evs = all.filter(pass);
    const ctx = Object.assign({}, ctx0, { projects: ctx0.projects.filter(p => !F.project || p.name === F.project) });
    main.replaceChildren(...sections(aggregate(evs, ctx), evs));
    status.textContent = `${evs.length} of ${all.length} tasks`;
  }
  const root = document.documentElement;
  try { const t = localStorage.getItem('loopstack-theme'); if (t) root.dataset.theme = t; } catch (e) { /* storage blocked */ }
  document.getElementById('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('loopstack-theme', root.dataset.theme); } catch (e) { /* storage blocked */ }
  });
  update();
}

const LIGHT = '--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--base:#c3c2b7;--ring:rgba(11,11,11,.10);'
  + '--accent:#2a78d6;--l0:#86b6ef;--l1:#5598e7;--l2:#2a78d6;--l3:#1c5cab;--l4:#104281;'
  + '--r0:#2a78d6;--r1:#eb6834;--r2:#1baf7a;--r3:#eda100;--r4:#e87ba4;--r5:#898781;color-scheme:light';
const DARK = '--page:#0d0d0d;--surface:#1a1a19;--ink:#ffffff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--base:#383835;--ring:rgba(255,255,255,.10);'
  + '--accent:#3987e5;--l0:#184f95;--l1:#256abf;--l2:#3987e5;--l3:#6da7ec;--l4:#b7d3f6;'
  + '--r0:#3987e5;--r1:#d95926;--r2:#199e70;--r3:#c98500;--r4:#d55181;--r5:#6b6a66;color-scheme:dark';
const CSS = `:root{${LIGHT}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:0 0 2px}h3{font-size:13px;margin:12px 0 0;color:var(--ink2)}
.sub{color:var(--ink2);font-size:12px;margin:0 0 8px}
.note{color:var(--ink2);font-size:12px;margin:4px 0 12px}
#filters{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:end;margin:8px 0 16px;padding:12px;background:var(--surface);border:1px solid var(--ring);border-radius:10px}
#filters label{display:flex;flex-direction:column;font-size:11px;color:var(--ink2);gap:2px}
select,input,button{font:inherit;font-size:13px;color:var(--ink);background:var(--page);border:1px solid var(--base);border-radius:6px;padding:4px 8px}
button{cursor:pointer}button:hover{border-color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:16px;min-width:0}
.wide{grid-column:1/-1}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:2px}
.tl{font-size:12px;color:var(--ink2)}.tv{font-size:28px;font-weight:600}
.chart{width:100%;height:auto;display:block}.spark{width:140px;height:32px}
.center{display:flex;justify-content:center}.center .chart{max-width:240px}
.scroll{overflow-x:auto}.scroll .chart{min-width:640px}
svg text{pointer-events:none}
.tick{fill:var(--muted);font-size:11px}.lab{fill:var(--ink2);font-size:12px}.val{fill:var(--ink);font-size:12px}
.cell{fill:var(--ink);font-size:11px}.ink-on{fill:#fff;font-size:11px}.big{fill:var(--ink);font-size:26px;font-weight:600}
.gl{stroke:var(--grid);stroke-width:1}.base{stroke:var(--base);stroke-width:1}
.line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.thin{stroke-width:1.5}
.wash{fill:var(--accent);opacity:.1}.dot{fill:var(--accent);stroke:var(--surface);stroke-width:2}
.hit{fill:transparent}.hit:hover{fill:var(--ink);opacity:.05}
.whisk{stroke:var(--muted);stroke-width:1.5}.med{stroke:var(--ink);stroke-width:2}
[class^="f-"]:hover{opacity:.85}
.f-accent{fill:var(--accent);background:var(--accent)}.f-empty{fill:var(--grid)}
${[0, 1, 2, 3, 4].map(i => `.f-l${i}{fill:var(--l${i});background:var(--l${i})}`).join('')}
${[0, 1, 2, 3, 4, 5].map(i => `.f-r${i}{fill:var(--r${i});background:var(--r${i})}`).join('')}
.legend{display:flex;flex-wrap:wrap;gap:4px 12px;list-style:none;padding:0;margin:0 0 6px;font-size:12px;color:var(--ink2)}
.legend li{display:flex;align-items:center;gap:6px}.sw{width:10px;height:10px;border-radius:2px;display:inline-block}
details{margin-top:8px;font-size:12px}summary{cursor:pointer;color:var(--ink2)}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--grid);white-space:nowrap}
th button{border:0;background:none;padding:0;font-weight:600;color:var(--ink)}
.multiples{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:12px}
.mini{display:flex;flex-direction:column;padding:8px;border:1px solid var(--ring);border-radius:8px}
.insights{margin:0;padding-left:18px}.insights li{margin:4px 0}
.steps li{margin:4px 0}.empty{color:var(--ink2)}
@media (forced-colors:active){[class^="f-"]{forced-color-adjust:none}}`;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function render(model) {
  const data = JSON.stringify({ events: model.events, ctx: model.ctx }).replace(/</g, '\\u003c');
  const script = `${aggregate}\n${client}\nclient(JSON.parse(document.getElementById('data').textContent), aggregate);`;
  const hash = crypto.createHash('sha256').update(script).digest('base64');
  const a = model.agg;
  const skipped = model.ctx.projects.reduce((s, p) => s + p.skipped, 0);
  const scope = `${model.ctx.projects.length} project(s)${a.range ? ` · ${a.range[0]} → ${a.range[1]}` : ''} · ${skipped} skipped line(s)`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; img-src data:; base-uri 'none'; form-action 'none'">
<title>loopstack usage</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header><h1>loopstack usage</h1><span class="sub">${esc(scope)} · <span id="status"></span></span><button type="button" id="theme">Toggle theme</button></header>
<p class="note">Data is self-reported by the agent at the end of each /amizing-mode task (ASSUME: accurate). Skills called directly, without /amizing-mode, are not counted.</p>
<div id="filters" role="group" aria-label="Filters"></div>
<main id="main" class="grid"></main>
</div>
<script type="application/json" id="data">${data}</script>
<script>${script}</script>
</body>
</html>
`;
}

function build(dirs, opts) {
  const projects = [], events = [], catalog = {}, seen = {};
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
    const r = readProject(dir, opts);
    let name = r.meta.name;
    for (let k = 2; seen[name]; k++) name = `${r.meta.name}-${k}`;
    seen[name] = true;
    r.meta.name = name;
    for (const e of r.events) { e.project = name; events.push(e); }
    for (const [s, x] of Object.entries(r.catalog)) catalog[s] = catalog[s] === true || x;
    projects.push(r.meta);
  }
  const ctx = { projects, catalog, heavy: HEAVY, members: !!opts.byMember };
  return { events, ctx, agg: aggregate(events, ctx) };
}

function parseSince(s, now) {
  if (!s) return null;
  const m = /^(\d+)([dw])$/.exec(s);
  if (m) return new Date(now - +m[1] * (m[2] === 'w' ? 7 : 1) * 864e5).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return new Date(Date.parse(s)).toISOString();
  throw new Error(`bad --since: ${s} (use 90d, 12w or YYYY-MM-DD)`);
}

function main(argv) {
  const o = { dirs: [], out: 'loopstack-dashboard.html', since: null, json: false, byMember: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value\n${USAGE}`); return argv[++i]; };
    if (a === '--dir') o.dirs.push(path.resolve(val()));
    else if (a === '--out') o.out = val();
    else if (a === '--since') o.since = val();
    else if (a === '--json') o.json = true;
    else if (a === '--by-member') o.byMember = true;
    else if (a === '--help' || a === 'help') { console.log(USAGE); return; }
    else throw new Error(`unknown option: ${a}\n${USAGE}`);
  }
  if (!o.dirs.length) {
    const cfg = readJson(CONFIG);
    o.dirs = cfg && Array.isArray(cfg.projects) ? cfg.projects.map(p => path.resolve(p)) : [process.cwd()];
  }
  const model = build(o.dirs, { since: parseSince(o.since, Date.now()), byMember: o.byMember });
  if (o.json) {
    const projects = model.ctx.projects.map(({ learnings, ...p }) => p);
    console.log(JSON.stringify({ projects, ...model.agg }, null, 2));
    return;
  }
  fs.writeFileSync(o.out, render(model));
  const skipped = model.ctx.projects.reduce((s, p) => s + p.skipped, 0);
  console.log(`loopstack dashboard: ${model.events.length} tasks from ${model.ctx.projects.length} project(s), ${skipped} skipped line(s) → ${o.out}`);
}

module.exports = { main, build, render, aggregate, parseLine, USAGE };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`loopstack dashboard: ${e.message}`);
    process.exitCode = 1;
  }
}
