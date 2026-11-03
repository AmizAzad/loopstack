#!/usr/bin/env node
'use strict';
// Checks a TLA+ spec with TLC and draws its state graph as a Mermaid statechart, with the shortest
// path to each rule that breaks. Node builtins only; needs Java 11+ and tla2tools.jar. Used by
// /statechart and /formal. Copied into repos as .loopstack/statechart.js by `loopstack sync`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const CHART_STATES = 500;
const TLC_URL = 'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar';
const TLC_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
// Deadlock is reported as NoDeadlock, or CHECK_DEADLOCK when the spec has its own rule named NoDeadlock.
const USAGE = `usage: node statechart.js SPEC.tla [--config FILE] [--view FILE] [--out DIR] [--timeout SEC]
  Checks each INVARIANT, PROPERTY and deadlock with TLC, then writes report.md, tlc.out and,
  up to ${CHART_STATES} states, chart.mmd to --out (new or empty; default SPEC-chart).
  --view   module exporting state(vars) → label, step(action, from, to) → label | null, title
  --timeout seconds per TLC run (default 300)
  TLC: $TLA2TOOLS or ~/.loopstack/tla2tools.jar (${TLC_URL}
       sha256 ${TLC_SHA256}); Java 11+: $JAVA or java.
  Exit: 0 every rule holds · 1 a rule breaks · 2 error (nothing written).`;

// ---- TLC config ----
const KEYS = /^(CONSTANTS?|INIT|NEXT|SPECIFICATION|INVARIANTS?|PROPERT(Y|IES)|CONSTRAINTS?|ACTION_CONSTRAINTS?|SYMMETRY|VIEW|CHECK_DEADLOCK|POSTCONDITION|ALIAS)$/;
const RULE_KEYS = /^(INVARIANTS?|PROPERT(Y|IES)|CHECK_DEADLOCK)$/;

function parseCfg(text) {
  const sections = [];
  for (const tok of text.replace(/\(\*[\s\S]*?\*\)/g, ' ').replace(/\\\*.*$/gm, ' ').split(/\s+/).filter(Boolean)) {
    if (KEYS.test(tok)) sections.push({ key: tok, tokens: [] });
    else if (sections.length) sections[sections.length - 1].tokens.push(tok);
    else throw new Error(`config: unexpected "${tok}" before any section`);
  }
  const of = re => sections.filter(s => re.test(s.key)).flatMap(s => s.tokens);
  return {
    sections,
    invariants: of(/^INVARIANTS?$/),
    properties: of(/^PROPERT(Y|IES)$/),
    deadlock: of(/^CHECK_DEADLOCK$/)[0] !== 'FALSE',
  };
}

// Config with the given rules only; deadlock is passed to TLC as a flag instead.
const cfgText = (cfg, inv, props) => [
  ...cfg.sections.filter(s => !RULE_KEYS.test(s.key)).map(s => `${s.key} ${s.tokens.join(' ')}`),
  ...(inv.length ? [`INVARIANT ${inv.join(' ')}`] : []),
  ...(props.length ? [`PROPERTY ${props.join(' ')}`] : []),
].join('\n');

// ---- TLC -tool output ----
function readMessages(out) {
  const msgs = [];
  let cur = null;
  for (const line of out.replace(/\r\n/g, '\n').split('\n')) {
    const s = /^@!@!@STARTMSG (\d+):(\d+) @!@!@$/.exec(line);
    if (s) cur = { code: +s[1], level: +s[2], lines: [] };
    else if (/^@!@!@ENDMSG \d+ @!@!@$/.test(line)) {
      if (cur) msgs.push({ code: cur.code, level: cur.level, text: cur.lines.join('\n').trim() });
      cur = null;
    } else if (cur) cur.lines.push(line);
  }
  return msgs;
}

const plain = out => out.replace(/\r\n/g, '\n').split('\n').filter(l => !/^@!@!@(START|END)MSG /.test(l)).join('\n');

function parseVars(text) {
  const vars = {};
  let name = null;
  for (const line of text.split('\n')) {
    const m = /^(?:\/\\ )?([A-Za-z_]\w*) = (.*)$/.exec(line);
    if (m) [name, vars[m[1]]] = [m[1], m[2]];
    else if (name && line.trim()) vars[name] += ` ${line.trim()}`;
  }
  return vars;
}
const keyOf = vars => Object.keys(vars).sort().map(k => `${k}=${vars[k].replace(/\s+/g, ' ').trim()}`).join('\n');

// One trace message → { action, vars } | { back: n, action } | { stutter: true }.
function traceStep(m) {
  const [head, ...rest] = m.text.split('\n');
  const action = (/<([^\s>]+)(?: line \d+[^>]*)?>/.exec(head) || [])[1];
  if (m.code === 2218) return { stutter: true };
  if (m.code === 2122) return { back: +head.split(':')[0], action };
  return { action: /<Initial predicate>/.test(head) ? undefined : action, vars: parseVars(rest.join('\n')) };
}

function verdict(out) {
  const v = { broke: null, trace: [], distinct: 0, errors: [] };
  for (const m of readMessages(out)) {
    const inv = /^Invariant (\S+) is violated/.exec(m.text);
    const count = /([\d,]+) distinct states? (?:found|generated)/.exec(m.text);
    if (count) v.distinct = Math.max(v.distinct, +count[1].replace(/,/g, ''));
    if (inv) {
      v.broke = v.broke || { kind: 'invariant', name: inv[1] };
      if (m.code === 2107) v.trace.push({ vars: parseVars(m.text.split('\n').slice(1).join('\n')) });
    } else if (m.code === 2114) v.broke = v.broke || { kind: 'deadlock' };
    else if (m.code === 2116) v.broke = v.broke || { kind: 'temporal' };
    else if ([2217, 2122, 2218].includes(m.code)) v.trace.push(traceStep(m));
    else if (m.level === 1 && ![2121, 2264].includes(m.code)) v.errors.push(m.text);
  }
  return v;
}

// ---- check every rule: rerun without each rule that breaks ----
function check(cfg, tlc) {
  const left = { inv: [...cfg.invariants], props: [...cfg.properties], deadlock: cfg.deadlock };
  const dl = [...cfg.invariants, ...cfg.properties].includes('NoDeadlock') ? 'CHECK_DEADLOCK' : 'NoDeadlock';
  const names = () => [...left.inv, ...(left.deadlock ? [dl] : []), ...left.props];
  const r = { bugs: [], holds: [], unchecked: [], stop: null, first: null, distinct: 0, complete: false, dot: null };
  const stopped = run => [...(run.errors.length ? run.errors : plain(run.out).split('\n').filter(l => l.trim()).slice(-20)),
    `TLC exit ${run.status}`].join('\n');
  for (;;) {
    const run = tlc(cfgText(cfg, left.inv, left.props), left.deadlock);
    r.first = r.first || run;
    r.distinct = Math.max(r.distinct, run.distinct);
    const b = run.broke;
    if (!b) {
      if (run.status === 0) [r.holds, r.complete] = [[...r.holds, ...names()], true];
      else [r.stop, r.unchecked] = [stopped(run), names()];
      break;
    }
    if (b.kind === 'invariant' && left.inv.includes(b.name)) {
      r.bugs.push({ rule: b.name, kind: b.kind, trace: run.trace });
      left.inv = left.inv.filter(n => n !== b.name);
    } else if (b.kind === 'deadlock' && left.deadlock) {
      r.bugs.push({ rule: dl, kind: b.kind, trace: run.trace });
      left.deadlock = false;
    } else if (b.kind === 'temporal' && left.props.length) {
      // -lncheck final: safety finished first, so the invariants and deadlock left all hold.
      r.holds.push(...left.inv, ...(left.deadlock ? [dl] : []));
      r.complete = true;
      const solo = left.props.length === 1 ? [[left.props[0], run]] : left.props.map(p => [p, tlc(cfgText(cfg, [], [p]), false)]);
      for (const [p, s] of solo) {
        if (s.broke) r.bugs.push({ rule: p, kind: 'temporal', trace: s.trace });
        else if (s.status === 0) r.holds.push(p);
        else [r.stop, r.unchecked] = [r.stop || stopped(s), [...r.unchecked, p]];
      }
      break;
    } else {
      [r.stop, r.unchecked] = [`TLC reported a rule this config does not name:\n${stopped(run)}`, names()];
      break;
    }
  }
  if (r.complete && r.distinct <= CHART_STATES) r.dot = tlc(cfgText(cfg, [], []), false, true).dot;
  return r;
}

// ---- TLA+ values → JS for the view: strings, ints, booleans, <<seq>> and {set} → arrays,
// [rec] and (k :> v @@ …) → objects, model values → strings; anything else stays raw text.
function parseValue(s) {
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] || '')) i++; };
  const eat = t => { ws(); if (!s.startsWith(t, i)) return false; i += t.length; return true; };
  const need = t => { if (!eat(t)) throw new Error(t); };
  const list = (end, item) => {
    const out = [];
    if (eat(end)) return out;
    do out.push(item()); while (eat(','));
    need(end);
    return out;
  };
  const atom = () => {
    ws();
    const m = /^(?:"((?:[^"\\]|\\.)*)"|(-?\d+)\b|([A-Za-z_]\w*))/.exec(s.slice(i));
    if (!m) throw new Error('atom');
    i += m[0].length;
    if (m[1] !== undefined) return m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' }[c] || c));
    if (m[2] !== undefined) return Number(m[2]);
    return m[3] === 'TRUE' ? true : m[3] === 'FALSE' ? false : m[3];
  };
  const val = () => {
    if (eat('<<')) return list('>>', val);
    if (eat('{')) return list('}', val);
    if (eat('[')) return Object.fromEntries(list(']', () => { const k = atom(); need('|->'); return [k, val()]; }));
    if (eat('(')) {
      const o = {};
      do { const k = val(); need(':>'); o[k] = val(); } while (eat('@@'));
      need(')');
      return o;
    }
    return atom();
  };
  try {
    const v = val();
    ws();
    return i === s.length ? v : s;
  } catch {
    return s;
  }
}

// ---- chart ----
const words = a => a.replace(/^.*!/, '').replace(/([a-z\d])([A-Z])|([A-Z])([A-Z][a-z])/g, '$1$3 $2$4').replace(/_/g, ' ').toLowerCase();
const flat = x => (typeof x === 'string' ? x : Array.isArray(x) ? x.map(flat).join(' / ')
  : x && typeof x === 'object' ? Object.entries(x).map(([k, v]) => `${k} ${flat(v)}`).join(', ') : String(x));
const esc = s => String(s).replace(/\s+/g, ' ').trim().replace(/[#:;<>"%{}\\]/g, c => `#${c.charCodeAt(0)};`);

function parseDot(text) {
  const nodes = new Map();
  const edges = [];
  const unq = s => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    let m;
    if ((m = /^(-?\d+) -> (-?\d+) \[label="((?:[^"\\]|\\.)*)"/.exec(line))) edges.push({ from: m[1], to: m[2], action: unq(m[3]) });
    else if ((m = /^(-?\d+) -> (-?\d+)/.exec(line))) edges.push({ from: m[1], to: m[2], action: '' });
    else if ((m = /^(-?\d+) \[label="((?:[^"\\]|\\.)*)"(.*)$/.exec(line))) nodes.set(m[1], { vars: parseVars(unq(m[2])), init: /style ?= ?filled/.test(m[3]) });
  }
  return { nodes, edges };
}

// Labels every model state and step through the view (each answer asked once), merges equal labels.
function render(module, r, view = {}) {
  const memo = new Map();
  const ask = (k, f) => (memo.has(k) ? memo.get(k) : memo.set(k, f()).get(k));
  const vals = vars => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, parseValue(v)]));
  const label = vars => ask(`s\0${keyOf(vars)}`, () => flat(view.state ? view.state(vals(vars))
    : Object.keys(vars).sort().map(k => `${k} = ${vars[k].replace(/\s+/g, ' ')}`).join(', ')));
  const stepOf = (action, a, b) => ask(`t\0${action}\0${keyOf(a)}\0${keyOf(b)}`, () => {
    const s = view.step ? view.step(action, vals(a), vals(b)) : undefined;
    return s === null ? null : s === undefined ? words(action || 'step') : flat(s);
  });
  const shown = (action, a, b) => stepOf(action, a, b) || words(action || 'step');

  const out = [`# ${module}`, ''];
  let chart = null;
  if (r.dot) {
    const g = parseDot(r.dot);
    const ids = new Map();
    const arrows = new Map();
    const starts = new Set();
    let loops = 0;
    let hidden = 0;
    const adj = new Map();
    for (const e of g.edges) (adj.get(e.from) || adj.set(e.from, []).get(e.from)).push(e);
    const queue = [...g.nodes].filter(([, n]) => n.init).map(([id]) => id);
    const seen = new Set(queue);
    for (let q = 0; q < queue.length; q++) {
      const from = g.nodes.get(queue[q]);
      const a = label(from.vars);
      if (!ids.has(a)) ids.set(a, `s${ids.size}`);
      if (from.init) starts.add(a);
      for (const e of adj.get(queue[q]) || []) {
        const to = g.nodes.get(e.to);
        if (!to) continue;
        if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
        const b = label(to.vars);
        const s = stepOf(e.action, from.vars, to.vars);
        if (a === b) { loops++; continue; }
        if (s === null) { hidden++; continue; }
        const k = `${a}\0${b}`;
        (arrows.get(k) || arrows.set(k, { a, b, steps: new Set() }).get(k)).steps.add(s);
        if (!ids.has(b)) ids.set(b, `s${ids.size}`);
      }
    }
    const lines = [...(view.title ? ['---', `title: ${JSON.stringify(String(view.title).replace(/\s+/g, ' '))}`, '---'] : []), 'stateDiagram-v2', '  direction LR'];
    for (const [l, id] of ids) lines.push(`  ${id}: ${esc(l)}`);
    for (const l of starts) lines.push(`  [*] --> ${ids.get(l)}`);
    for (const { a, b, steps } of arrows.values()) lines.push(`  ${ids.get(a)} --> ${ids.get(b)}: ${esc([...steps].join(' or '))}`);
    const path = new Set();
    const breaks = new Map();
    for (const bug of r.bugs) {
      const states = bug.trace.filter(t => t.vars).map(t => ids.get(label(t.vars))).filter(Boolean);
      states.forEach(id => path.add(id));
      if (bug.kind !== 'temporal' && states.length) breaks.set(states[states.length - 1], [...(breaks.get(states[states.length - 1]) || []), bug.rule]);
    }
    for (const [id, rules] of breaks) lines.push(`  note right of ${id}: breaks ${esc(rules.join(', '))}`);
    if (path.size) lines.push('  classDef bugPath stroke:#1680f3,stroke-width:2.5px', `  class ${[...path].join(',')} bugPath`);
    if (breaks.size) lines.push('  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834', `  class ${[...breaks.keys()].join(',')} breaks`);
    chart = `${lines.join('\n')}\n`;
    out.push(`TLC reached ${r.distinct} states and ${g.edges.length} steps. The chart draws ${ids.size} states and ${arrows.size} arrows.`);
    if (loops) out.push(`The chart does not draw ${loops} steps that stay in one chart state.`);
    if (hidden) out.push(`The view hides ${hidden} steps.`);
  } else if (r.complete) out.push(`TLC reached ${r.distinct} states, more than the chart budget of ${CHART_STATES}, so there is no chart.mmd. Make the model smaller to see it.`);
  else out.push('TLC did not finish exploring the model, so there is no chart.mmd.');

  for (const bug of r.bugs) {
    const steps = bug.trace;
    const states = steps.filter(t => t.vars);
    out.push('', `## ${bug.rule} breaks`, `The shortest path has ${Math.max(states.length - 1, 0)} step${states.length === 2 ? '' : 's'}:`);
    states.forEach((t, i) => out.push(i ? `${i}. ${shown(t.action, states[i - 1].vars, t.vars)}: ${label(t.vars)}` : `0. ${label(t.vars)}`));
    const back = steps.find(t => t.back);
    if (back && states[back.back - 1]) out.push(`Then "${shown(back.action, states[states.length - 1].vars, states[back.back - 1].vars)}" goes back to step ${back.back - 1}, and the run repeats forever.`);
    if (steps.some(t => t.stutter)) out.push('Then the run stops here forever.');
  }
  if (r.holds.length) out.push('', '## Rules that hold', r.holds.join(', '));
  if (r.unchecked.length) out.push('', '## Rules not checked', `${r.unchecked.join(', ')}: TLC stopped before checking them.`, '```', ...r.stop.split('\n').slice(0, 30), '```');
  return { report: `${out.join('\n')}\n`, chart };
}

// ---- CLI ----
function runner({ java, jar, spec, tmp, timeout }) {
  let n = 0;
  return (cfg, deadlock, dump) => {
    const name = `run${++n}`;
    fs.writeFileSync(path.join(tmp, `${name}.cfg`), cfg);
    const graph = path.join(tmp, `${name}-graph`);
    const r = spawnSync(java, [`-Djava.io.tmpdir=${tmp}`, `-DTLA-Library=${path.dirname(spec)}`, '-cp', jar, 'tlc2.TLC',
      '-tool', '-workers', '1', '-fp', '0', '-lncheck', 'final', ...(deadlock ? [] : ['-deadlock']),
      '-metadir', path.join(tmp, `${name}-meta`), '-config', path.join(tmp, `${name}.cfg`),
      ...(dump ? ['-dump', 'dot,actionlabels', graph] : []), path.basename(spec, '.tla')],
    { cwd: tmp, encoding: 'utf8', maxBuffer: 1 << 30, timeout: timeout * 1000 });
    if (r.error) throw new Error(r.error.code === 'ETIMEDOUT' ? `TLC ran longer than ${timeout}s; make the model smaller or pass --timeout` : `cannot run ${java}: ${r.error.message}`);
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return { status: r.status, out, ...verdict(out), dot: dump && fs.existsSync(`${graph}.dot`) ? fs.readFileSync(`${graph}.dot`, 'utf8') : null };
  };
}

async function main(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (['--config', '--view', '--out', '--timeout'].includes(argv[i])) {
      if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value\n${USAGE}`);
      flags[argv[i].slice(2)] = argv[++i];
    } else if (argv[i] === '--help' || argv[i] === '-h') return console.log(USAGE), 0;
    else if (argv[i].startsWith('--')) throw new Error(`unknown option: ${argv[i]}\n${USAGE}`);
    else pos.push(argv[i]);
  }
  if (pos.length !== 1 || !/\.tla$/.test(pos[0])) throw new Error(`give one SPEC.tla\n${USAGE}`);
  const spec = path.resolve(pos[0]);
  const cfgFile = path.resolve(flags.config || spec.replace(/\.tla$/, '.cfg'));
  const out = path.resolve(flags.out || spec.replace(/\.tla$/, '-chart'));
  const timeout = Number(flags.timeout || 300);
  if (!fs.existsSync(spec)) throw new Error(`no spec at ${spec}`);
  if (!fs.existsSync(cfgFile)) throw new Error(`no TLC config at ${cfgFile}; pass --config FILE`);
  if (!(timeout > 0)) throw new Error(`bad --timeout: ${flags.timeout}`);
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`${out} is not empty; pass --out with a new folder`);
  const jar = process.env.TLA2TOOLS || path.join(os.homedir(), '.loopstack', 'tla2tools.jar');
  if (!fs.existsSync(jar)) throw new Error(`no tla2tools.jar at ${jar}. Download ${TLC_URL}, check sha256 ${TLC_SHA256}, then save it there or set TLA2TOOLS.`);
  const view = flags.view ? await import(pathToFileURL(path.resolve(flags.view)).href) : {};
  const cfg = parseCfg(fs.readFileSync(cfgFile, 'utf8'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loopstack-tlc-'));
  try {
    const r = check(cfg, runner({ java: process.env.JAVA || 'java', jar, spec, tmp, timeout }));
    if (!r.bugs.length && r.stop) throw new Error(`TLC could not check ${path.basename(spec)}:\n${r.stop}`);
    const { report, chart } = render(path.basename(spec, '.tla'), r, view.default && !view.state ? view.default : view);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'report.md'), report);
    fs.writeFileSync(path.join(out, 'tlc.out'), plain(r.first.out));
    if (chart) fs.writeFileSync(path.join(out, 'chart.mmd'), chart);
    process.stdout.write(`${report}\nWrote ${out}\n`);
    return r.bugs.length ? 1 : 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { parseCfg, cfgText, readMessages, verdict, check, parseValue, parseVars, parseDot, render, main, CHART_STATES };

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => {
    console.error(`statechart: ${e.message}`);
    process.exitCode = 2;
  });
}
