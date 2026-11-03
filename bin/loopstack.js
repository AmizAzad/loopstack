#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const CORE = path.resolve(__dirname, '..');
const HARNESSES = ['claude', 'copilot', 'codex', 'grok'];
const KINDS = ['skills', 'agents', 'templates', 'gates'];
const CONFIG = 'loopstack.json';
const MANIFEST = '.loopstack/manifest.json';
const VERSION = require('../package.json').version;
// .gitattributes/.gitignore take # comments; every other managed file is markdown.
const MARKS = p => (/^\.git(attributes|ignore)$/.test(path.basename(p))
  ? ['# loopstack:start', '# loopstack:end'] : ['<!-- loopstack:start -->', '<!-- loopstack:end -->']);
const blockRe = p => new RegExp(`${MARKS(p)[0]}[\\s\\S]*?${MARKS(p)[1]}\\r?\\n?`);
const USAGE = `usage: loopstack <command> [--dir <path>] [--force]
  init --claude --copilot --codex --grok | --all   add harnesses, generate files
  sync                                             regenerate from loopstack.json
  --force                                          overwrite same-named files loopstack did not create
  list                                             show merged skills
  dashboard [--help]                               write the usage dashboard (needs "telemetry": true)`;

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const isAppend = f => f.endsWith('.append.md');
const mdFiles = d => (fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.md')) : [])
  .sort((a, b) => isAppend(a) - isAppend(b) || a.localeCompare(b));

function parse(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const meta = {};
  if (!m) return { meta, body: text };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function readConfig(dir) {
  const p = path.join(dir, CONFIG);
  return fs.existsSync(p) ? { harnesses: [], layers: [], ...JSON.parse(read(p)) } : { harnesses: [], layers: [] };
}

// Core first, then configured layers, then .loopstack-local. Same name replaces; <name>.append.md extends.
function load(dir, cfg) {
  const layers = [CORE, ...cfg.layers.map(l => path.resolve(dir, l.replace(/^~(?=$|[\\/])/, os.homedir())))];
  if (fs.existsSync(path.join(dir, '.loopstack-local'))) layers.push(path.join(dir, '.loopstack-local'));
  const b = { principles: read(path.join(CORE, 'core/principles.md')).trim() };
  for (const k of [...KINDS, 'rules']) b[k] = new Map();
  for (const layer of layers) {
    if (!fs.existsSync(layer)) throw new Error(`layer not found: ${layer}`);
    for (const k of [...KINDS, 'rules']) {
      for (const f of mdFiles(path.join(layer, k))) {
        const text = read(path.join(layer, k, f));
        const name = f.slice(0, isAppend(f) ? -10 : -3);
        if (!isAppend(f)) b[k].set(name, text);
        else if (b[k].has(name)) b[k].set(name, `${b[k].get(name).trimEnd()}\n${parse(text).body}`);
        else throw new Error(`${path.join(layer, k, f)}: no ${name}.md to extend`);
      }
    }
  }
  // Opt-in usage log: one step in amizing-mode, before Report. Off → zero bytes added.
  if (cfg.telemetry === true && b.skills.has('amizing-mode')) {
    const log = read(path.join(CORE, 'core/telemetry.md')).trim();
    const t = b.skills.get('amizing-mode');
    b.skills.set('amizing-mode', /^8\. Report/m.test(t) ? t.replace(/^8\. Report/m, () => `${log}\n9. Report`) : `${t.trimEnd()}\n${log}\n`);
  }
  return b;
}

function alwaysOn(b, index) {
  const names = [...b.skills.keys()];
  const explicit = names.filter(n => parse(b.skills.get(n)).meta.explicit === 'true');
  const cmd = [
    '## Commands',
    '`/<name>` → follow `.loopstack/skills/<name>.md` (or the native command). Load only what the task needs.',
    'Task without a command: trivial → do it and verify; otherwise follow /amizing-mode.',
    `Explicit-only, never auto-run: ${explicit.map(n => `/${n}`).join(' ')}.`,
  ];
  if (index) cmd.push(`Skills: ${names.filter(n => !explicit.includes(n)).join(', ')}.`);
  return [b.principles, ...[...b.rules.values()].map(r => r.trim()), cmd.join('\n')].join('\n\n');
}

const helpers = b => ({
  parse,
  alwaysOn: index => alwaysOn(b, index),
  yaml: obj => `---\n${Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n')}\n---\n`,
});

function adapter(dir, cfg, name) {
  const custom = cfg.adapters && cfg.adapters[name];
  if (!custom && !HARNESSES.includes(name)) throw new Error(`unknown harness: ${name}`);
  return require(custom ? path.resolve(dir, custom) : path.join(CORE, 'adapters', `${name}.js`));
}

function upsertBlock(p, body) {
  const [start, end] = MARKS(p);
  const block = `${start}\n${body.trim()}\n${end}\n`;
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  fs.writeFileSync(p, blockRe(p).test(cur) ? cur.replace(blockRe(p), () => block) : (cur.trim() ? `${cur.trimEnd()}\n\n` : '') + block);
}

function removeBlock(p) {
  if (!fs.existsSync(p)) return;
  const rest = fs.readFileSync(p, 'utf8').replace(blockRe(p), '').trim();
  if (rest) fs.writeFileSync(p, `${rest}\n`);
  else fs.unlinkSync(p);
}

// Deletes only files listed in our own manifest, never outside the target dir; prunes emptied dirs.
function removeFile(dir, rel) {
  let p = path.resolve(dir, rel);
  if (!p.startsWith(dir + path.sep) || !fs.existsSync(p)) return;
  fs.unlinkSync(p);
  for (p = path.dirname(p); p !== dir && fs.readdirSync(p).length === 0; p = path.dirname(p)) fs.rmdirSync(p);
}

function sync(dir, force) {
  const cfg = readConfig(dir);
  if (!cfg.harnesses.length) throw new Error(`no harnesses in ${CONFIG}\n${USAGE}`);
  const b = load(dir, cfg);
  const out = [];
  for (const k of KINDS) for (const [n, t] of b[k]) out.push({ path: `.loopstack/${k}/${n}.md`, content: t });
  for (const h of cfg.harnesses) out.push(...adapter(dir, cfg, h)(b, helpers(b)));
  // TLC runner for /statechart and /formal; runs standalone without the CLI, like dashboard.js.
  if (b.skills.has('statechart')) out.push({ path: '.loopstack/statechart.js', content: read(path.join(__dirname, 'statechart.js')) });
  // .loopstack/runs.jsonl is user data like learnings.md: never generated, never pruned.
  if (cfg.telemetry === true) out.push(
    { path: '.loopstack/dashboard.js', content: read(path.join(__dirname, 'dashboard.js')) },
    { path: '.gitattributes', block: '.loopstack/runs.jsonl merge=union' },
    { path: '.gitignore', block: 'loopstack-dashboard.html' },
  );

  const mp = path.join(dir, MANIFEST);
  const old = fs.existsSync(mp) ? JSON.parse(read(mp)) : { files: [], blocks: [] };
  const conflicts = out.filter(f => !('block' in f) && !old.files.includes(f.path)
    && fs.existsSync(path.join(dir, f.path)) && read(path.join(dir, f.path)) !== f.content).map(f => f.path);
  if (conflicts.length && !force) throw new Error(`refusing to overwrite files loopstack did not create (rerun with --force):\n  ${conflicts.join('\n  ')}`);
  const now = { version: VERSION, files: [], blocks: [] };
  for (const f of out) {
    const p = path.join(dir, f.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if ('block' in f) { upsertBlock(p, f.block); now.blocks.push(f.path); }
    else { fs.writeFileSync(p, f.content); now.files.push(f.path); }
  }
  old.files.filter(f => !now.files.includes(f)).forEach(f => removeFile(dir, f));
  old.blocks.filter(f => !now.blocks.includes(f)).forEach(f => removeBlock(path.join(dir, f)));
  fs.writeFileSync(mp, `${JSON.stringify(now, null, 2)}\n`);
  console.log(`loopstack: ${now.files.length} files, ${now.blocks.length} managed blocks → ${cfg.harnesses.join(', ')}${cfg.telemetry === true ? ' (telemetry on)' : ''}`);
}

function init(dir, flags) {
  const bad = [...flags].filter(f => !['all', 'force', ...HARNESSES].includes(f));
  if (bad.length) throw new Error(`unknown option: --${bad.join(' --')}\n${USAGE}`);
  const cfg = readConfig(dir);
  const picked = flags.has('all') ? HARNESSES : HARNESSES.filter(h => flags.has(h));
  if (!picked.length && !cfg.harnesses.length) throw new Error(`pick a harness\n${USAGE}`);
  cfg.harnesses = [...new Set([...cfg.harnesses, ...picked])];
  fs.mkdirSync(path.join(dir, '.loopstack'), { recursive: true });
  fs.writeFileSync(path.join(dir, CONFIG), `${JSON.stringify(cfg, null, 2)}\n`);
  const learn = path.join(dir, '.loopstack/learnings.md');
  if (!fs.existsSync(learn)) fs.writeFileSync(learn, '# Learnings\nOne line per non-obvious lesson. Read at intake of L2+ tasks.\n');
  sync(dir, flags.has('force'));
}

function list(dir) {
  for (const [n, t] of load(dir, readConfig(dir)).skills) {
    const { meta } = parse(t);
    console.log(`/${n.padEnd(13)} ${meta.explicit === 'true' ? '[explicit] ' : ''}${meta.description || ''}`);
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'dashboard') return require('./dashboard.js').main(rest);
  let dir = process.cwd();
  const flags = new Set();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dir') dir = path.resolve(rest[++i] || '.');
    else if (rest[i].startsWith('--')) flags.add(rest[i].slice(2));
    else throw new Error(`unexpected argument: ${rest[i]}\n${USAGE}`);
  }
  if (cmd === 'init') return init(dir, flags);
  if (cmd === 'sync' && [...flags].every(f => f === 'force')) return sync(dir, flags.has('force'));
  if (flags.size) throw new Error(`unknown option for ${cmd}\n${USAGE}`);
  if (cmd === 'list') return list(dir);
  console.log(USAGE);
  if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`loopstack: ${e.message}`);
  process.exitCode = 1;
}
