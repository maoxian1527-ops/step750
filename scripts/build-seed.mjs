// 生成 D1 种子：只灌「学校」表（2,740 所真实院校）。
// 分数线 / 专业分 / 省控线由 Worker 用 lib/synth.mjs 实时计算，不再入库。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHOOLS } from '../data/schools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'seed');
const OUT = path.join(OUT_DIR, 'seed.sql');
const esc = (s) => String(s ?? '').replace(/'/g, "''");

const lines = [];
lines.push('-- 由 scripts/build-seed.mjs 生成，请勿手工编辑');
lines.push('PRAGMA foreign_keys = ON;');
lines.push('DELETE FROM major_scores;');
lines.push('DELETE FROM admission_scores;');
lines.push('DELETE FROM favorites;');
lines.push('DELETE FROM control_lines;');
lines.push('DELETE FROM province_batches;');
lines.push('DELETE FROM schools;');
lines.push("DELETE FROM sqlite_sequence WHERE name = 'schools';");
lines.push('');

lines.push('INSERT INTO schools (code, name, province, city, category, tier, level, note) VALUES');
const rows = SCHOOLS.map((s, i) =>
  `('D${String(1001 + i).padStart(5, '0')}','${esc(s.name)}','${esc(s.province)}','${esc(s.city)}','${esc(s.category)}','${esc(s.tier)}','${esc(s.level)}','${esc(s.note)}')`);
for (let i = 0; i < rows.length; i += 400) {
  lines.push(rows.slice(i, i + 400).join(',\n') + ';');
  if (i + 400 < rows.length) {
    lines.push('INSERT INTO schools (code, name, province, city, category, tier, level, note) VALUES');
  }
}
lines.push('');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

const byLevel = SCHOOLS.reduce((a, s) => ({ ...a, [s.level]: (a[s.level] || 0) + 1 }), {});
console.log(`写入 ${path.relative(process.cwd(), OUT)}`);
console.log(`  学校 ${SCHOOLS.length} 所（本科 ${byLevel['本科'] || 0} / 专科 ${byLevel['专科'] || 0}）`);
console.log(`  文件 ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
