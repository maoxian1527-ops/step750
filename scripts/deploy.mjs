// 一键部署到 Cloudflare：建 D1 → 写 database_id → 建表 → 灌数据 → deploy
// 用法: node scripts/deploy.mjs
//       node scripts/deploy.mjs --db jinbu-db
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CLI = path.join(ROOT, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');
const CONFIG = path.join(ROOT, 'wrangler.toml');

const args = process.argv.slice(2);
const dbName = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'jinbu-db';
const bindDomain = args.includes('--bind-domain');

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };

function run(command, { capture = false } = {}) {
  return execFileSync(process.execPath, [CLI, ...command], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
}

function capture(command) {
  try {
    return run(command, { capture: true }) || '';
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    return { failed: true, output: out };
  }
}

function log(step, text) {
  console.log(`\n\x1b[36m[${step}]\x1b[0m ${text}`);
}

/* 1. 登录检查 */
log('1/5', '检查 Cloudflare 登录状态');
const whoResult = spawnSync(process.execPath, [CLI, 'whoami'], { cwd: ROOT, env, encoding: 'utf8' });
const whoText = `${whoResult.stdout || ''}${whoResult.stderr || ''}`;
if (!/You are logged in/i.test(whoText)) {
  console.error('\n还没登录 Cloudflare。请先在本目录运行： npx wrangler login\n');
  console.error(whoText.trim().split('\n').slice(-6).join('\n'));
  process.exit(1);
}
const whoLine = whoText.split('\n').find((l) => /logged in/i.test(l)) || '';
console.log(whoLine.replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, '').trim());

/* 2. D1 数据库：配置里已有真实 id 就直接用，否则查/建 */
log('2/5', `准备 D1 数据库 ${dbName}`);
let databaseId = null;

const currentConfig = fs.readFileSync(CONFIG, 'utf8');
const configured = (currentConfig.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) || [])[1];
if (configured && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(configured)) {
  databaseId = configured;
  console.log(`复用 wrangler.toml 里的 database_id：${databaseId}`);
}

if (!databaseId) {
  const list = capture(['d1', 'list', '--json']);
  if (typeof list === 'string') {
    try {
      const rows = JSON.parse(list);
      const hit = rows.find((r) => r.name === dbName);
      if (hit) {
        databaseId = hit.uuid || hit.database_id || hit.id;
        console.log(`已存在：${dbName} → ${databaseId}`);
      }
    } catch {
      console.log('（d1 list 返回的不是 JSON，改用创建流程）');
    }
  }
}

if (!databaseId) {
  const created = capture(['d1', 'create', dbName]);
  const text = typeof created === 'string' ? created : created.output;
  const match = text.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) || text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!match) {
    console.error('创建 D1 失败，输出如下：\n' + text.trim().split('\n').slice(-10).join('\n'));
    process.exit(1);
  }
  databaseId = match[1];
  console.log(`已创建：${dbName} → ${databaseId}`);
}

/* 3. 写回 wrangler.toml */
log('3/5', '把 database_id 写入 wrangler.toml');
const config = fs.readFileSync(CONFIG, 'utf8');
const next = config.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${databaseId}"`);
if (next === config) {
  console.log('wrangler.toml 无需修改');
} else {
  fs.writeFileSync(CONFIG, next, 'utf8');
  console.log('已更新 database_id');
}

/* 4. 建表 + 灌数据 */
log('4/5', '远程 D1 建表与灌数据（种子约 0.8 MB，可能要等一会儿）');
run(['d1', 'migrations', 'apply', 'DB', '--remote']);
run(['d1', 'execute', 'DB', '--remote', '--file=seed/seed.sql', '--yes']);

/* 5. 部署 */
log('5/5', '部署 Worker');
if (bindDomain) {
  const toml = fs.readFileSync(CONFIG, 'utf8');
  if (!/^routes\s*=\s*\[/m.test(toml)) {
    console.log('提示：wrangler.toml 里没有启用 routes，自定义域名不会被绑定');
  } else {
    console.log('routes 已启用，本次部署会顺带绑定自定义域名');
  }
}
run(['deploy']);

console.log(`
\x1b[32m完成。\x1b[0m
下一步（等 step750.icu 实名通过后）：
  1. Cloudflare → Add a site → step750.icu，记下两个 NS；
  2. 阿里云 → 域名列表 → step750.icu → DNS 修改，填这两个 NS；
  3. 等 Cloudflare 显示 Active；
  4. 取消注释 wrangler.toml 里的 routes，再跑一次： node scripts/deploy.mjs
`);
