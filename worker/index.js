// 择校圣殿 · Cloudflare Worker API
// 运行时：Workers + D1；无第三方依赖
import { buildSystemPrompt } from './persona.js';
import { SCHOOLS } from '../data/schools.mjs';
import { PROVINCES, BATCHES, YEARS, LATEST_YEAR, batchFor, batchProfile } from '../lib/geo.mjs';
import { schoolRow, majorsFor, lineFor, rankFor, SINGLE_SUBJECTS, bothFor } from '../lib/synth.mjs';

// esbuild 会把具名函数包一层，这里补一个等价实现（源码恢复用）
const __name = (fn, name) => {
  try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch { /* ignore */ }
  return fn;
};

var LIST = SCHOOLS.map((s, i) => ({ ...s, id: i + 1 }));
var BY_ID = new Map(LIST.map((s) => [s.id, s]));
var PBKDF2_ITERATIONS = 3e4;
var SESSION_TTL_DAYS = 30;
var MAX_PAGE_SIZE = 50;
var encoder = new TextEncoder();
var JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
var json = /* @__PURE__ */ __name((data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } }), "json");
var fail = /* @__PURE__ */ __name((message, status = 400) => json({ error: message }, status), "fail");
var hex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var randomHex = /* @__PURE__ */ __name((bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes))), "randomHex");
var clampInt = /* @__PURE__ */ __name((v, lo, hi, fallback) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}, "clampInt");
async function sha256Hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}
__name(sha256Hex, "sha256Hex");
async function pbkdf2Hex(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => Number.parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return hex(bits);
}
__name(pbkdf2Hex, "pbkdf2Hex");
var timingSafeEqual = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}, "timingSafeEqual");
var CODE_TTL_MS = 10 * 60 * 1e3;
var CODE_MAX_ATTEMPTS = 5;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var normalizeEmail = /* @__PURE__ */ __name((raw) => String(raw || "").trim().toLowerCase(), "normalizeEmail");
var emailCodeAvailable = /* @__PURE__ */ __name((env) => Boolean(env.EMAIL && env.EMAIL.send) || Boolean(env.RESEND_API_KEY) || env.DEV_SHOW_CODE === "1", "emailCodeAvailable");
var emailCodeEnabled = /* @__PURE__ */ __name((env) => env.REQUIRE_EMAIL_CODE === "1" && emailCodeAvailable(env), "emailCodeEnabled");
async function codeHash(env, email, code) {
  return sha256Hex(`${email}|${code}|${env.CODE_PEPPER || ""}`);
}
__name(codeHash, "codeHash");
async function sendCodeEmail(env, email, code) {
  const domain = env.SITE_DOMAIN || "step750.icu";
  const from = env.MAIL_FROM || `noreply@${domain}`;
  const subject = "进步 · Progress 注册验证码";
  const text = `你的进步 · Progress 注册验证码是 ${code}，10 分钟内有效。
如果这不是你本人操作，忽略这封邮件即可。`;
  const html = `<div style="font-family:system-ui,-apple-system,'Noto Sans SC',sans-serif;background:#fcfbf7;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(193,154,85,.35);border-radius:16px;padding:28px">
      <p style="letter-spacing:.3em;font-size:11px;color:#8f6d31;margin:0 0 14px">PROGRESS · STEP750.ICU</p>
      <h2 style="font-size:20px;margin:0 0 14px;color:#1b2437">注册验证码</h2>
      <p style="font-size:34px;letter-spacing:.28em;margin:0 0 16px;color:#8f6d31;font-weight:600">${code}</p>
      <p style="font-size:13px;color:#4b5670;margin:0">10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p>
    </div>
  </div>`;
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `进步 Progress <${from}>`, to: [email], subject, html, text }),
      signal: AbortSignal.timeout(2e4)
    });
    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(`resend ${res.status}: ${detail.slice(0, 200)}`);
      err.code = `RESEND_${res.status}`;
      throw err;
    }
    return;
  }
  if (env.EMAIL && env.EMAIL.send) {
    await env.EMAIL.send({ to: email, from, subject, text, html });
    return;
  }
  throw new Error("no email channel configured");
}
__name(sendCodeEmail, "sendCodeEmail");
function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
__name(cookieValue, "cookieValue");
function sessionCookie(request, token, maxAgeSec) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
__name(sessionCookie, "sessionCookie");
async function currentUser(request, env) {
  const token = cookieValue(request, "sid");
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.created_at, u.email_verified, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at <= (/* @__PURE__ */ new Date()).toISOString()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    emailVerified: Boolean(row.email_verified)
  };
}
__name(currentUser, "currentUser");
async function createSession(request, env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, userId, expires).run();
  return { token, header: sessionCookie(request, token, SESSION_TTL_DAYS * 86400) };
}
__name(createSession, "createSession");
async function readMeta(env) {
  const batchByProvince = {};
  for (const p of PROVINCES) batchByProvince[p.name] = batchProfile(p.name);
  return {
    provinces: PROVINCES.map((p) => p.name),
    singleSubjects: ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"],
    tracks: ["理科", "文科"],
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"],
    batches: BATCHES,
    batchByProvince,
    tiers: ["985", "211", "双一流", "省重点", "普通"],
    levels: ["本科", "专科"],
    categories: ["综合", "理工", "师范", "财经", "政法", "医药", "农林", "语言", "艺术", "民族", "体育"],
    years: YEARS,
    latestYear: LATEST_YEAR,
    emailCode: emailCodeEnabled(env),
    dataNote: '全部为演示数据，非官方录取数据',
    captcha: env.TURNSTILE_SECRET_KEY ? 'turnstile' : 'challenge',
    turnstile: { siteKey: env.TURNSTILE_SITE_KEY || '', enabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) },
    stats: {
      schools: LIST.length,
      scores: LIST.length * PROVINCES.length * YEARS.length * 2,
      majors: LIST.length * PROVINCES.length * 2 * 6,
      computed: true
    }
  };
}
__name(readMeta, "readMeta");
async function listSchools(env, params) {
  const province = params.province || "广东";
  const subject = params.subject || "数学";
  const track = params.track || "理科";
  const year = clampInt(params.year, 2e3, 2100, LATEST_YEAR);
  const page = clampInt(params.page, 1, 500, 1);
  const pageSize = clampInt(params.pageSize, 1, MAX_PAGE_SIZE, 20);
  const q = params.q ? String(params.q).trim() : "";
  const batchFilter = params.batch || "";
  let rows = LIST;
  if (params.tier) rows = rows.filter((s) => s.tier === params.tier);
  if (params.level) rows = rows.filter((s) => s.level === params.level);
  if (params.category) rows = rows.filter((s) => s.category === params.category);
  if (q) rows = rows.filter((s) => s.name.includes(q));
  if (batchFilter) rows = rows.filter((s) => batchFor(s, province) === batchFilter);
  const items = rows.map((s) => {
    const r = bothFor(s, province, subject, year, track);
    return {
      id: s.id,
      name: s.name,
      province: s.province,
      city: s.city,
      category: s.category,
      tier: s.tier,
      level: s.level,
      ...r
    };
  });
  const scale = params.scale === "single" ? "single" : "total";
  const main = /* @__PURE__ */ __name((x) => scale === "single" ? x.single_score : x.total_score, "main");
  const rank = /* @__PURE__ */ __name((x) => scale === "single" ? x.single_rank : x.total_rank, "rank");
  if (params.sort === "name") items.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  else if (params.sort === "rank") items.sort((a, b) => rank(a) - rank(b));
  else items.sort((a, b) => main(b) - main(a));
  const total = items.length;
  const start = (page - 1) * pageSize;
  return json({
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    scale,
    pages: Math.max(1, Math.ceil(total / pageSize))
  });
}
__name(listSchools, "listSchools");
async function schoolDetail(env, id, params, user) {
  const school = BY_ID.get(clampInt(id, 1, 1e9, 0));
  if (!school) return fail("没有找到这所学校喵", 404);
  const province = params.province || "广东";
  const subject = params.subject || "数学";
  const track = params.track || "理科";
  const year = clampInt(params.year, 2e3, 2100, LATEST_YEAR);
  const series = YEARS.map((y) => ({ year: y, ...bothFor(school, province, subject, y, track) }));
  const majors = majorsFor(school, province, subject, year, track);
  let isFavorite = false;
  if (user) {
    const fav = await env.DB.prepare("SELECT 1 AS x FROM favorites WHERE user_id = ? AND school_id = ?").bind(user.id, school.id).first();
    isFavorite = Boolean(fav);
  }
  const latest = series[series.length - 1];
  const first = series[0];
  return json({
    school,
    series,
    majors,
    isFavorite,
    growth: latest.total_score - first.total_score,
    singleGrowth: latest.single_score - first.single_score,
    query: { province, subject, track, year }
  });
}
__name(schoolDetail, "schoolDetail");
async function matchSchools(env, params) {
  const province = params.province || "广东";
  const subject = params.subject || "数学";
  const track = params.track || "理科";
  const year = clampInt(params.year, 2e3, 2100, LATEST_YEAR);
  const input = params.input === "single" ? "single" : "total";
  const view = params.view === "single" ? "single" : "total";
  const full = SINGLE_SUBJECTS[subject] || 100;
  const maxScore = input === "single" ? full : 750;
  const score = clampInt(params.score, 0, maxScore, 0);
  if (!score) return fail(input === "single" ? `先给我一个${subject}单科分喵` : "先给我一个总分喵（0–750）");
  const trackKey = track === "文科" ? "历史类" : "物理类";
  const predictedSingle = input === "single" ? score : clampInt(Math.round(score / 750 * full * 1.02), 0, full);
  const line = lineFor(province, trackKey, year, "本科批");
  const level = params.level || "";
  const factor = maxScore / 750;
  const up = Math.max(2, Math.round(15 * factor));
  const steady = Math.max(2, Math.round(12 * factor));
  const downFrom = Math.max(3, Math.round(13 * factor));
  const downTo = Math.max(4, Math.round(35 * factor));
  const scored = LIST.filter((s) => !level || s.level === level).map((s) => {
    const r = bothFor(s, province, subject, year, track);
    const key = input === "single" ? r.single_score : r.total_score;
    return {
      id: s.id,
      name: s.name,
      province: s.province,
      city: s.city,
      tier: s.tier,
      level: s.level,
      batch: r.batch,
      total_score: r.total_score,
      total_rank: r.total_rank,
      single_score: r.single_score,
      single_full: r.single_full,
      single_rank: r.single_rank,
      single_ok: predictedSingle >= r.single_score,
      key,
      gap: score - key
    };
  });
  const pick = /* @__PURE__ */ __name((lo, hi) => scored.filter((x) => x.key >= lo && x.key <= hi).sort((a, b) => b.key - a.key).slice(0, 8), "pick");
  const all = scored.slice().sort((a, b) => b.key - a.key);
  const topKey = all.length ? all[0].key : 0;
  const bottomKey = all.length ? all[all.length - 1].key : 0;
  let chong = pick(score + 1, score + up);
  const overshoot = chong.length === 0 && all.length > 0 && score >= topKey;
  if (overshoot) chong = all.slice(0, 8);
  let bao = pick(Math.max(0, score - downTo), Math.max(0, score - downFrom));
  const undershoot = bao.length === 0 && all.length > 0 && score < bottomKey;
  if (undershoot) bao = all.slice(-8).reverse();
  return json({
    score,
    province,
    subject,
    track,
    year,
    line,
    full,
    predictedSingle,
    level,
    input,
    view,
    overshoot,
    undershoot,
    topKey,
    bottomKey,
    ranges: { up, steady, downFrom, downTo },
    groups: {
      chong,
      wen: pick(Math.max(0, score - steady), score),
      bao
    }
  });
}
__name(matchSchools, "matchSchools");
async function examsWithSubjects(env, userId, ids) {
  const map = /* @__PURE__ */ new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT exam_id, name, score, full_score FROM exam_subjects WHERE exam_id IN (${placeholders}) ORDER BY id ASC`
  ).bind(...ids).all();
  for (const row of rows.results) {
    if (!map.has(row.exam_id)) map.set(row.exam_id, []);
    map.get(row.exam_id).push({ name: row.name, score: row.score, full: row.full_score });
  }
  return map;
}
__name(examsWithSubjects, "examsWithSubjects");
async function examsList(env, user) {
  const rows = await env.DB.prepare(
    "SELECT id, name, exam_date, total, full_total, note, created_at FROM exams WHERE user_id = ? ORDER BY exam_date ASC, id ASC"
  ).bind(user.id).all();
  const list = rows.results;
  const subjects = await examsWithSubjects(env, user.id, list.map((e) => e.id));
  const items = list.map((e, i) => ({
    ...e,
    subjects: subjects.get(e.id) || [],
    delta: i ? e.total - list[i - 1].total : null
  }));
  return json({ items });
}
__name(examsList, "examsList");
async function examCreate(env, user, body) {
  const name = String(body.name || "").trim().slice(0, 40);
  const date = String(body.date || "").trim();
  if (!name) return fail("给这次考试起个名字喵");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("考试日期格式应为 YYYY-MM-DD");
  const rawSubjects = Array.isArray(body.subjects) ? body.subjects : [];
  const subjects = [];
  for (const item of rawSubjects.slice(0, 12)) {
    const subName = String(item.name || "").trim().slice(0, 20);
    const score = Number(item.score);
    const full = Number(item.full);
    if (!subName) continue;
    if (!Number.isFinite(score) || !Number.isFinite(full)) return fail(`${subName} 的分数要填数字喵`);
    if (full <= 0 || full > 750) return fail(`${subName} 的满分不太对喵`);
    if (score < 0 || score > full) return fail(`${subName} 的分数不能超过满分喵`);
    subjects.push({ name: subName, score: Math.round(score * 10) / 10, full });
  }
  if (!subjects.length) return fail("至少填一科的分数喵");
  const total = Math.round(subjects.reduce((sum, s) => sum + s.score, 0));
  const fullTotal = Math.round(subjects.reduce((sum, s) => sum + s.full, 0));
  const note = String(body.note || "").slice(0, 200);
  const insert = await env.DB.prepare(
    "INSERT INTO exams (user_id, name, exam_date, total, full_total, note) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(user.id, name, date, total, fullTotal, note).run();
  const examId = insert.meta.last_row_id;
  await env.DB.batch(
    subjects.map((s) => env.DB.prepare(
      "INSERT INTO exam_subjects (exam_id, name, score, full_score) VALUES (?, ?, ?, ?)"
    ).bind(examId, s.name, s.score, s.full))
  );
  return json({ ok: true, exam: { id: examId, name, exam_date: date, total, full_total: fullTotal, subjects } }, 201);
}
__name(examCreate, "examCreate");
async function examDelete(env, user, id) {
  const examId = clampInt(id, 1, 1e9, 0);
  const res = await env.DB.prepare("DELETE FROM exams WHERE id = ? AND user_id = ?").bind(examId, user.id).run();
  if (!res.meta.changes) return fail("这条记录不在了喵", 404);
  return json({ ok: true });
}
__name(examDelete, "examDelete");
async function examSummary(env, user) {
  const rows = await env.DB.prepare(
    "SELECT id, name, exam_date, total, full_total FROM exams WHERE user_id = ? ORDER BY exam_date ASC, id ASC"
  ).bind(user.id).all();
  const list = rows.results;
  if (!list.length) {
    return { count: 0, series: [], bySubject: [], latest: null, previous: null, best: null, net: null };
  }
  const subjects = await examsWithSubjects(env, user.id, list.map((e) => e.id));
  const last = list[list.length - 1];
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const lastSubjects = subjects.get(last.id) || [];
  const prevSubjects = prev ? subjects.get(prev.id) || [] : [];
  const bySubject = lastSubjects.map((s) => {
    const before = prevSubjects.find((p) => p.name === s.name);
    return {
      name: s.name,
      score: s.score,
      full: s.full,
      previous: before ? before.score : null,
      delta: before ? Math.round((s.score - before.score) * 10) / 10 : null
    };
  }).sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  const series = list.map((e, i) => ({
    id: e.id,
    name: e.name,
    date: e.exam_date,
    total: e.total,
    delta: i ? e.total - list[i - 1].total : null
  }));
  const best = list.reduce((a, b) => b.total > a.total ? b : a, list[0]);
  return {
    count: list.length,
    series,
    bySubject,
    latest: { ...last, subjects: lastSubjects },
    previous: prev ? { ...prev, subjects: prevSubjects } : null,
    best: { id: best.id, name: best.name, date: best.exam_date, total: best.total },
    net: last.total - list[0].total,
    delta: prev ? last.total - prev.total : null
  };
}
__name(examSummary, "examSummary");
async function favoritesList(env, user, params) {
  const province = params.province || "广东";
  const subject = params.subject || "数学";
  const track = params.track || "理科";
  const year = clampInt(params.year, 2e3, 2100, LATEST_YEAR);
  const rows = await env.DB.prepare(
    "SELECT school_id, created_at FROM favorites WHERE user_id = ?"
  ).bind(user.id).all();
  const items = rows.results.map((r) => {
    const s = BY_ID.get(r.school_id);
    if (!s) return null;
    const sc = bothFor(s, province, subject, year, track);
    return {
      id: s.id,
      name: s.name,
      province: s.province,
      city: s.city,
      tier: s.tier,
      level: s.level,
      created_at: r.created_at,
      ...sc
    };
  }).filter(Boolean).sort((a, b) => b.total_score - a.total_score);
  return json({ items });
}
__name(favoritesList, "favoritesList");
async function chatHistory(env, userId, limit = 50) {
  const rows = await env.DB.prepare(
    "SELECT role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(userId, limit).all();
  return rows.results.reverse();
}
__name(chatHistory, "chatHistory");
async function nearbySchools(env, province, subject, score, track = "理科") {
  if (!score) return [];
  return LIST.filter((s) => s.level === "本科").map((s) => {
    const r = schoolRow(s, province, subject, LATEST_YEAR, track);
    return {
      name: s.name,
      tier: s.tier,
      min_score: r.min_score,
      min_rank: r.min_rank,
      batch: r.batch,
      year: LATEST_YEAR,
      diff: Math.abs(r.min_score - score)
    };
  }).sort((a, b) => a.diff - b.diff).slice(0, 6);
}
__name(nearbySchools, "nearbySchools");
var DAILY_CHAT_LIMIT = 25;
async function chatUsage(env, userId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM chat_messages
      WHERE user_id = ? AND role = 'user'
        AND created_at >= datetime('now', '+8 hours', 'start of day', '-8 hours')`
  ).bind(userId).first();
  return row?.n || 0;
}
__name(chatUsage, "chatUsage");
async function chatReply(env, user, body) {
  const message = String(body.message || "").trim().slice(0, 2e3);
  if (!message) return fail("说点什么喵");
  const used = await chatUsage(env, user.id);
  if (used >= DAILY_CHAT_LIMIT) {
    return json({
      error: `今天的 ${DAILY_CHAT_LIMIT} 条已经聊完啦，明天再来喵。（想多聊可以加 QQ 版小猫）`,
      limit: DAILY_CHAT_LIMIT,
      used,
      remaining: 0
    }, 429);
  }
  const province = String(body.province || "广东");
  const subject = String(body.subject || "数学");
  const track = String(body.track || "理科");
  const history = await chatHistory(env, user.id, 12);
  // 写入失败（例如 D1 当日写入额度用尽）不应该影响回话，只是这次不留记录
  await env.DB.prepare("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)").bind(user.id, "user", message).run().catch(() => {});
  const summary = await examSummary(env, user);
  const favorites = await env.DB.prepare(
    "SELECT s.name FROM favorites f JOIN schools s ON s.id = f.school_id WHERE f.user_id = ? LIMIT 5"
  ).bind(user.id).all();
  const hintScore = summary.latest?.total || clampInt(body.score, 100, 750, 0);
  const nearby = hintScore ? await nearbySchools(env, province, subject, hintScore, track) : [];
  const context = buildContext(summary, favorites.results.map((f) => f.name), province, subject, nearby, track, hintScore);
  let reply = null;
  let source = "local";
  if (env.MODEL_API_KEY) {
    try {
      reply = await callModel(env, message, history, context);
      if (reply) source = "model";
    } catch (e) {
      console.error("model error", e && e.message);
    }
  }
  if (!reply) {
    reply = await localReply(env, { message, summary, province, subject, favorites: favorites.results.map((f) => f.name) });
  }
  await env.DB.prepare("INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?)").bind(user.id, "assistant", reply).run().catch(() => {});
  return json({ reply, source, limit: DAILY_CHAT_LIMIT, used: used + 1, remaining: Math.max(0, DAILY_CHAT_LIMIT - used - 1) });
}
__name(chatReply, "chatReply");
function buildContext(summary, favorites, province, subject, nearby = [], track = "理科", scoreHint = 0) {
  const lines = [];
  lines.push(`招生省份：${province}；单科口径：${subject}（${track}）。`);
  if (scoreHint >= 700) {
    lines.push(`注意：这位同学的总分约 ${scoreHint}，已经接近 750 分满分，高于本站数据里几乎所有院校的投档线。如果他说「分太高就没大学上」，那是本站演示数据上限的问题，不是真的没学上——不要顺着这个说法，要解释清楚并提醒数据是演示用的。`);
  }
  if (summary.count) {
    const l = summary.latest;
    lines.push(`学生最近一次考试：${l.name}（${l.exam_date}），总分 ${l.total}/${l.full_total}。`);
    if (summary.previous) {
      lines.push(`上一次：${summary.previous.name}，总分 ${summary.previous.total}，本次变化 ${summary.delta > 0 ? "+" : ""}${summary.delta} 分。`);
    }
    lines.push(`历史最高：${summary.best.name} ${summary.best.total} 分；从第一次到现在净变化 ${summary.net > 0 ? "+" : ""}${summary.net} 分。`);
    if (summary.bySubject.length) {
      const parts = summary.bySubject.map((s) => `${s.name} ${s.score}/${s.full}${s.delta === null ? "" : `（较上次 ${s.delta > 0 ? "+" : ""}${s.delta}）`}`);
      lines.push(`本次各科：${parts.join("、")}。`);
    }
  } else {
    lines.push("学生还没有录入任何考试成绩。");
  }
  if (favorites.length) lines.push(`学生收藏的学校：${favorites.join("、")}。`);
  if (nearby.length) {
    const list = nearby.map((s) => {
      const gap = s.min_score - (summary.latest?.total || 0);
      const tag = gap > 0 ? `高 ${gap} 分` : gap < 0 ? `低 ${-gap} 分` : "卡线";
      return `${s.name}（${s.year} 年${s.batch}，最低 ${s.min_score}，位次 ${s.min_rank ?? "—"}，${tag}）`;
    });
    lines.push(`分数附近的院校（招生省份 ${province}，${yearOf(nearby)} 年）：${list.join("；")}。可以用这些真实数据回答「能冲哪些学校」。`);
  }
  return lines.join("\n");
}
__name(buildContext, "buildContext");
function yearOf(rows) {
  const years = [...new Set(rows.map((r) => r.year))].sort();
  return years.length ? years[years.length - 1] : 2025;
}
__name(yearOf, "yearOf");
async function callModel(env, message, history, context) {
  const base = (env.MODEL_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const messages = [
    { role: "system", content: buildSystemPrompt(context) },
    ...history.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    { role: "user", content: message }
  ];
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.MODEL_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.MODEL_NAME || "deepseek-v4-flash",
      messages,
      temperature: 0.85,
      max_tokens: 600
    }),
    signal: AbortSignal.timeout(25e3)
  });
  if (!res.ok) {
    console.error("model http error", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}
__name(callModel, "callModel");
async function localReply(env, { message, summary, province, subject, favorites }) {
  const hasExam = summary.count > 0;
  const latest = summary.latest;
  const pick = /* @__PURE__ */ __name((arr) => arr[Math.floor(Math.random() * arr.length)], "pick");
  const wantsSubject = /数学|语文|英语|物理|化学|生物|历史|地理|政治/.test(message) || /退步|下滑|掉分|没考好|失误|错题/.test(message);
  const wantsSchool = /学校|冲|稳|保|能上|志愿|分数线|位次|排名/.test(message);
  const wantsComfort = /慌|焦虑|累|压力|睡不着|怕|难受|崩溃|哭/.test(message);
  const wantsEncourage = /鼓励|一句|加油|撑|坚持/.test(message);
  const wantsScold = /骂|凶|批评/.test(message);
  const analysis = /* @__PURE__ */ __name(() => {
    const moved = [...summary.bySubject].filter((s) => s.delta !== null);
    const worst = moved.sort((a, b) => a.delta - b.delta)[0];
    if (!worst || worst.delta >= 0) {
      const weak = summary.bySubject[summary.bySubject.length - 1];
      return `这次没有明显退步喵。最低的一科是 ${weak?.name ?? "—"}（${weak?.score ?? "—"}），其余都守住了。
别乱改复习节奏，按原计划走。`;
    }
    const recovered = moved.filter((s) => s.delta > 0).slice(0, 2).map((s) => `${s.name} +${s.delta}`).join("、");
    return `（耳朵动了一下）这次真正的伤口是 ${worst.name}：${worst.previous} → ${worst.score}，掉了 ${-worst.delta} 分。
把它的失分拆成三堆：计算失误、思路卡住、时间不够，哪堆最大就只治哪堆。
总分 ${latest.total}${recovered ? `，${recovered} 在涨` : ""}，先别全线推倒重来喵。`;
  }, "analysis");
  if (wantsScold) {
    return "（耳朵立起来）……想让小猫骂你？\n你现在的分数，对不起你熬过的那些夜。别拿「我不行」当挡箭牌，你只是还没把错题本翻完喵。\n去翻，小猫在这里等着。";
  }
  if (wantsSchool) {
    const score = hasExam ? latest.total : clampInt(message.match(/\d{3}/)?.[0], 100, 750, 0);
    if (!score) return "报个分数给小猫喵——比如「608 能上哪些学校」，小猫去圣录里翻。";
    const target = await env.DB.prepare(
      `SELECT s.name, s.tier, a.min_score, a.min_rank, a.batch
         FROM admission_scores a JOIN schools s ON s.id = a.school_id
        WHERE a.province = ? AND a.subject = ? AND a.year = 2025
          AND a.batch IN ('本科批', '本科一批', '本科二批')
          AND s.level = '本科' AND a.min_score BETWEEN ? AND ?
        ORDER BY ABS(a.min_score - ?) ASC LIMIT 3`
    ).bind(province, subject, score - 15, score + 15, score).all();
    const items = target.results;
    if (!items.length) return `按 ${score} 分（${province} · ${subject}）小猫没在圣录里翻到刚好卡线的学校喵，换个科类或分数再试试。`;
    const shortBatch = /* @__PURE__ */ __name((b) => b === "本科一批" ? "一本" : b === "本科二批" ? "二本" : b === "本科批" ? "本科批" : "专科", "shortBatch");
    const list = items.map((s) => `${s.name} ${s.min_score} 分（${shortBatch(s.batch)} · 位次 ${(s.min_rank ?? 0).toLocaleString("zh-CN")}）`).join("、");
    return `${score} 分（${province} · ${subject}）附近：${list}。
这是坐标，不是判决喵——冲的当方向，稳的保睡眠。`;
  }
  if (wantsSubject && hasExam) {
    if (wantsComfort) return `先别慌，坐下，让尾巴安静一会儿。
${analysis()}`;
    return analysis();
  }
  if (wantsComfort) {
    const tail = hasExam ? `你现在 ${latest.total} 分，${summary.delta === null ? "刚起步" : summary.delta >= 0 ? `比上次还高 ${summary.delta} 分` : `比上次少 ${-summary.delta} 分`}，都还没到结局喵。` : "分数还没输进来，小猫连安慰都没法算准喵。";
    return `（把尾巴搭在你手上）先坐下，让尾巴安静一会儿。
${tail}
今晚只做三件小事：把明天的三件事写下来、收拾书包、睡觉。别的明天再说。`;
  }
  if (wantsEncourage) {
    return pick([
      "你不需要成为别人眼里的奇迹，杂鱼。只要在每次想放弃的时候，多坐十分钟——光是你自己写出来的喵。",
      "“来得及”这三个字，小猫替你写在今天。剩下的，用笔把它填满。"
    ]);
  }
  if (!hasExam) {
    return "（打了个哈欠）先别问方法喵。去「我的考试」录一次成绩，小猫才知道你是哪块料、该往哪儿使劲。";
  }
  const top = summary.bySubject.slice(0, 2).map((s) => `${s.name} ${s.score}`).join("、");
  return `（尾巴慢慢绕了一圈）小猫看到了：最近一次 ${latest.total} 分${top ? `，其中 ${top} 是眼下最该盯的两科` : ""}，净变化 ${summary.net > 0 ? "+" : ""}${summary.net} 分。
想聊哪一科？还是想看看这个分数能去哪儿？`;
}
__name(localReply, "localReply");
async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  const p = url.searchParams;
  if (method === "GET" && pathname === "/api/meta") return json(await readMeta(env));
  if (method === "GET" && pathname === "/api/schools") return listSchools(env, Object.fromEntries(p));
  if (method === "GET" && pathname.startsWith("/api/schools/")) {
    const user2 = await currentUser(request, env);
    return schoolDetail(env, pathname.split("/")[3], Object.fromEntries(p), user2);
  }
  if (method === "GET" && pathname === "/api/match") return matchSchools(env, Object.fromEntries(p));
  if (pathname === "/api/auth/me" && method === "GET") {
    const user2 = await currentUser(request, env);
    if (!user2) return json({ user: null });
    const [exams, favs] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM exams WHERE user_id = ?").bind(user2.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?").bind(user2.id)
    ]);
    return json({ user: user2, stats: { exams: exams.results[0].n, favorites: favs.results[0].n } });
  }
  if (pathname === "/api/auth/challenge" && method === "GET") return json(await issueChallenge(env));
  if (method === "POST" && pathname === "/api/auth/send-code") {
    if (!emailCodeAvailable(env)) return fail("邮箱验证码还没开通喵", 503);
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("邮箱格式不太对喵");
    const human = await guardHuman(env, request, body);
    if (human !== true) return fail(human, 400);
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) return fail("这个邮箱已经注册过了，直接登录吧喵", 409);
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > datetime('now', '-10 minutes')"
    ).bind(email).first();
    if (recent.n >= 5) return fail("验证码发得太快了，10 分钟后再试喵", 429);
    const code = String(1e5 + crypto.getRandomValues(new Uint32Array(1))[0] % 9e5);
    const hash2 = await codeHash(env, email, code);
    const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await env.DB.prepare(
      "INSERT INTO email_codes (email, code_hash, expires_at, ip) VALUES (?, ?, ?, ?)"
    ).bind(email, hash2, expires, request.headers.get("cf-connecting-ip") || "").run();
    if (env.EMAIL && env.EMAIL.send) {
      try {
        await sendCodeEmail(env, email, code);
      } catch (e) {
        console.error("send code failed", e && e.code, e && e.message);
        if (env.DEV_SHOW_CODE === "1") return json({ ok: true, devCode: code, expiresIn: 600, dev: true });
        return fail("验证码邮件发送失败，请稍后再试喵", 502);
      }
      return json({ ok: true, expiresIn: 600 });
    }
    return json({ ok: true, devCode: code, expiresIn: 600, dev: true });
  }
  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!EMAIL_RE.test(email) || email.length > 254) return fail("邮箱格式不太对喵");
    if (password.length < 8 || password.length > 72) return fail("密码至少 8 位，最多 72 位");
    const human = await guardHuman(env, request, body);
    if (human !== true) return fail(human, 400);
    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) return fail("这个邮箱已经注册过了，直接登录吧喵", 409);
    let emailVerified = 0;
    if (emailCodeEnabled(env)) {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return fail("请填 6 位邮箱验证码喵");
      const row = await env.DB.prepare(
        "SELECT id, code_hash, attempts, expires_at FROM email_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1"
      ).bind(email).first();
      if (!row) return fail("先点「获取验证码」喵");
      if (new Date(row.expires_at).getTime() < Date.now()) return fail("验证码过期了，重新获取喵");
      if (row.attempts >= CODE_MAX_ATTEMPTS) return fail("验证码试错太多次，重新获取喵");
      const hash2 = await codeHash(env, email, code);
      if (!timingSafeEqual(hash2, row.code_hash)) {
        await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
        return fail("验证码不对喵", 401);
      }
      await env.DB.prepare("UPDATE email_codes SET used = 1 WHERE id = ?").bind(row.id).run();
      emailVerified = 1;
    }
    const salt = randomHex(16);
    const passwordHash = await pbkdf2Hex(password, salt);
    const inserted = await env.DB.prepare(
      "INSERT INTO users (email, password_hash, password_salt, email_verified) VALUES (?, ?, ?, ?)"
    ).bind(email, passwordHash, salt, emailVerified).run();
    const session = await createSession(request, env, inserted.meta.last_row_id);
    return json(
      { user: { id: inserted.meta.last_row_id, email, emailVerified: Boolean(emailVerified) } },
      201,
      { "set-cookie": session.header }
    );
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return fail("邮箱和密码都要填喵");
    const human = await guardHuman(env, request, body);
    if (human !== true) return fail(human, 400);
    const attempts = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND created_at > datetime('now', '-10 minutes')"
    ).bind(email).first();
    if (attempts.n >= 8) return fail("试太多次了，歇十分钟再来喵", 429);
    const user2 = await env.DB.prepare("SELECT id, email, password_hash, password_salt FROM users WHERE email = ?").bind(email).first();
    const ok = user2 ? timingSafeEqual(await pbkdf2Hex(password, user2.password_salt), user2.password_hash) : false;
    if (!ok) {
      await env.DB.prepare("INSERT INTO login_attempts (email, ip, ok) VALUES (?, ?, 0)").bind(email, request.headers.get("cf-connecting-ip") || "").run().catch(() => {
      });
      return fail("邮箱或密码不对喵", 401);
    }
    const session = await createSession(request, env, user2.id);
    return json({ user: { id: user2.id, email: user2.email } }, 200, { "set-cookie": session.header });
  }
  if (method === "POST" && pathname === "/api/auth/logout") {
    const token = cookieValue(request, "sid");
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    }
    return json({ ok: true }, 200, {
      "set-cookie": "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    });
  }
  const user = await currentUser(request, env);
  if (pathname === "/api/exams" && method === "GET") {
    if (!user) return fail("先登录喵", 401);
    return examsList(env, user);
  }
  if (pathname === "/api/exams" && method === "POST") {
    if (!user) return fail("先登录喵", 401);
    return examCreate(env, user, await request.json().catch(() => ({})));
  }
  if (pathname === "/api/exams/summary" && method === "GET") {
    if (!user) return fail("先登录喵", 401);
    return json(await examSummary(env, user));
  }
  if (pathname.startsWith("/api/exams/") && method === "DELETE") {
    if (!user) return fail("先登录喵", 401);
    return examDelete(env, user, pathname.split("/")[3]);
  }
  if (pathname === "/api/favorites" && method === "GET") {
    if (!user) return fail("先登录喵", 401);
    return favoritesList(env, user, Object.fromEntries(p));
  }
  if (pathname === "/api/favorites" && method === "POST") {
    if (!user) return fail("先登录喵", 401);
    const body = await request.json().catch(() => ({}));
    const schoolId = clampInt(body.schoolId, 1, 1e9, 0);
    if (!schoolId) return fail("学校不对喵");
    await env.DB.prepare("INSERT OR IGNORE INTO favorites (user_id, school_id) VALUES (?, ?)").bind(user.id, schoolId).run();
    return json({ ok: true }, 201);
  }
  if (pathname.startsWith("/api/favorites/") && method === "DELETE") {
    if (!user) return fail("先登录喵", 401);
    const schoolId = clampInt(pathname.split("/")[3], 1, 1e9, 0);
    await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND school_id = ?").bind(user.id, schoolId).run();
    return json({ ok: true });
  }
  if (pathname === "/api/chat" && method === "GET") {
    if (!user) return fail("先登录喵", 401);
    const used = await chatUsage(env, user.id);
    return json({
      items: await chatHistory(env, user.id, 50),
      model: Boolean(env.MODEL_API_KEY),
      modelName: env.MODEL_NAME || "deepseek-flash",
      limit: DAILY_CHAT_LIMIT,
      used,
      remaining: Math.max(0, DAILY_CHAT_LIMIT - used)
    });
  }
  if (pathname === "/api/chat" && method === "POST") {
    if (!user) return fail("先登录喵", 401);
    return chatReply(env, user, await request.json().catch(() => ({})));
  }
  if (pathname === "/api/chat" && method === "DELETE") {
    if (!user) return fail("先登录喵", 401);
    await env.DB.prepare("DELETE FROM chat_messages WHERE user_id = ?").bind(user.id).run();
    return json({ ok: true });
  }
  return fail("没有这个接口喵", 404);
}
__name(handleApi, "handleApi");

/* ---------------- 人机验证 ---------------- */
async function hmacHex(env, message) {
  const keyRaw = encoder.encode(env.CHALLENGE_SECRET || env.TURNSTILE_SECRET_KEY || 'jinbu-default-secret');
  const key = await crypto.subtle.importKey('raw', keyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return hex(sig);
}

async function issueChallenge(env) {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  const a = 2 + (rand[0] % 8);
  const b = 2 + (rand[1] % 8);
  const exp = Date.now() + 10 * 60 * 1000;
  const ansHash = (await sha256Hex(`${a + b}|${exp}`)).slice(0, 24);
  const sig = (await hmacHex(env, `${exp}|${ansHash}`)).slice(0, 24);
  return { question: `${a} + ${b} = ?`, token: `${exp}.${ansHash}.${sig}` };
}

async function verifyChallenge(env, token, answer) {
  if (!token || answer === undefined || answer === null || answer === '') return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [expStr, ansHash, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expectSig = (await hmacHex(env, `${expStr}|${ansHash}`)).slice(0, 24);
  if (expectSig !== sig) return false;
  const got = (await sha256Hex(`${String(answer).trim()}|${expStr}`)).slice(0, 24);
  return got === ansHash;
}

async function verifyTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', String(token));
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

// Turnstile 与内置算式二选一通过即可
async function guardHuman(env, request, body) {
  if (body.challengeToken && body.challengeAnswer !== undefined && body.challengeAnswer !== '') {
    if (await verifyChallenge(env, body.challengeToken, body.challengeAnswer)) return true;
  }
  if (env.TURNSTILE_SECRET_KEY && body.turnstileToken) {
    if (await verifyTurnstile(env, request, body.turnstileToken)) return true;
    return '人机验证没通过喵，刷新页面再试一次';
  }
  if (!env.TURNSTILE_SECRET_KEY) return '算式验证没通过喵，刷新页面重试';
  return '人机验证没通过喵，刷新页面再试一次';
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error('api error', e && e.stack || e);
        return json({ error: '服务器开小差了，稍后再试喵' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
