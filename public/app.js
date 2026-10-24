/* ============================================================
   进步 · Progress —— 前端应用（原生 ES Module）
   路由： #/  分数线   #/school/:id   #/exams   #/favorites   #/me   #/login
   ============================================================ */

const state = {
  user: null,
  meta: null,
  mode: 'school',          // school | score
  q: {
    province: '广东',
    subject: '数学',
    track: '理科',
    year: 2025,
    tier: '',
    level: '',
    scale: 'total',          // total | single：列表按哪一个口径排序 / 看位次
    sort: 'score',
    q: '',
    page: 1,
  },
  match: null,
  matchMode: 'total-single',   // 四个模式：{查总分|查单科}×{看总分|看单科}
  chatLoaded: false,
  chatBusy: false,
  redirectTo: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('zh-CN'));
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

/* ---------------- 本地存储 ---------------- */
const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略 */ }
  },
};

/* ---------------- 请求 ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 忽略非 JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/* ---------------- 提示 ---------------- */
let toastTimer = null;
function toast(message, type = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

/* ---------------- 图表：折线（自适应宽度） ---------------- */
function lineChart(host, { points, height = 300, yLabel = '' }) {
  if (!host || !points.length) return;
  const W = Math.max(300, Math.round(host.clientWidth || 900));
  const narrow = W < 560;
  const H = height;
  const PAD = narrow ? { l: 42, r: 16, t: 30, b: 40 } : { l: 60, r: 34, t: 32, b: 44 };
  const values = points.map((p) => p.y);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) { max += 10; min -= 10; }
  const rawStep = (max - min) / 5;
  const step = rawStep <= 5 ? 5 : rawStep <= 10 ? 10 : rawStep <= 20 ? 20 : rawStep <= 25 ? 25 : rawStep <= 50 ? 50 : 100;
  min = Math.floor((min - (max - min) * 0.25) / step) * step;
  max = Math.ceil((max + (max - min) * 0.2) / step) * step;
  if (max - min < step * 2) max = min + step * 2;

  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points.length - 1);
  const y = (v) => PAD.t + ((max - v) / (max - min)) * (H - PAD.t - PAD.b);
  const fs = narrow ? { grid: 9.5, point: 11.5, axis: 9.5 } : { grid: 10.5, point: 13, axis: 11 };

  let grid = '';
  for (let v = min; v <= max + 0.001; v += step) {
    grid += `<line x1="${PAD.l}" y1="${y(v)}" x2="${W - PAD.r}" y2="${y(v)}" stroke="rgba(143,109,49,.12)" stroke-dasharray="1 6"/>
      <text x="${PAD.l - 8}" y="${y(v) + 3.5}" text-anchor="end" font-size="${fs.grid}" fill="#98a0b1" font-family="Noto Sans SC,sans-serif">${v}</text>`;
  }

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${y(min)} L${x(0).toFixed(1)} ${y(min)} Z`;

  const dots = points.map((p, i) => {
    const cx = x(i);
    const cy = y(p.y);
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const lx = i === 0 ? cx - 2 : i === points.length - 1 ? cx + 6 : cx;
    return `<circle cx="${cx}" cy="${cy}" r="4.6" fill="rgba(255,251,238,.94)" stroke="#c19a55" stroke-width="1.3"/>
      <circle cx="${cx}" cy="${cy}" r="1.9" fill="#c19a55"/>
      <text x="${lx}" y="${cy - 12}" text-anchor="${anchor}" font-size="${fs.point}" font-family="Noto Serif SC,serif"
        fill="#2a3040" font-variant-numeric="tabular-nums" stroke="#fffdf6" stroke-width="3.2" paint-order="stroke">${p.y}</text>
      <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="${fs.axis}" fill="#8d95a6" font-family="Noto Sans SC,sans-serif">${esc(p.x)}</text>`;
  }).join('');

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)}">
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e3c88f" stop-opacity=".26"/><stop offset="1" stop-color="#e3c88f" stop-opacity="0"/>
      </linearGradient>
      <filter id="chartGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#chartFill)"/>
    <path d="${path}" fill="none" stroke="#c19a55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#chartGlow)"/>
    ${dots}
  </svg>`;
}

/* ---------------- 布局碎片 ---------------- */
function heroBlock() {
  const s = state.meta?.stats || {};
  return `<section class="hero">
    <div class="crest"><span class="ring"></span><span class="ring"></span><span class="core"></span></div>
    <p class="eyebrow">Ad Astra · 以分数为阶</p>
    <h1>进步</h1>
    <p class="lede">按学校查清 <em>2021—2025</em> 年的录取分数线，也把自己的每一次进退记下来。<br>分数是脚印，不是判决。</p>
    <p class="disclaimer">⚠ 本站所有分数线均由算法生成，<strong>是演示数据</strong>，与任何官方录取结果无关。网上信息真假混杂，本站也一样——请自己核对，别盲信。</p>
    <div class="stats">
      <div><b>${num(s.schools)}</b><span>所院校</span></div>
      <div><b>${num(s.scores)}</b><span>条分数线</span></div>
      <div><b>${num(s.majors)}</b><span>条专业分</span></div>
      <div><b>${state.meta?.years?.[0]}—${state.meta?.latestYear}</b><span>五个年度</span></div>
    </div>
  </section>`;
}

function filterBar() {
  const m = state.meta;
  const q = state.q;
  return `<div class="panel toolbar">
    <div class="toolbar-row">
      <label class="search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
        <input id="qInput" type="search" placeholder="搜索学校，例如 中山大学" value="${esc(q.q)}" />
      </label>
      <select class="select" id="fProvince" aria-label="招生省份">
        ${m.provinces.map((p) => `<option ${p === q.province ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <select class="select" id="fSubject" aria-label="单科">
        ${(m.singleSubjects || m.subjects).map((p) => `<option ${p === q.subject ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <select class="select" id="fYear" aria-label="年份">
        ${m.years.slice().reverse().map((p) => `<option ${p === q.year ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <select class="select" id="fTrack" aria-label="文理">
        ${(m.tracks || ['理科', '文科']).map((t) => `<option ${t === q.track ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <select class="select" id="fLevel" aria-label="层次">
        <option value="">本科 + 专科</option>
        ${m.levels.map((p) => `<option ${p === q.level ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
    <div class="toolbar-meta">
      <div class="tabs" role="tablist">
        <button role="tab" data-mode="school" aria-selected="${state.mode === 'school'}">按学校查</button>
        <button role="tab" data-mode="score" aria-selected="${state.mode === 'score'}">按分数定位</button>
      </div>
      <div class="chips" id="tierChips">
        <button class="chip" data-tier="" aria-pressed="${!q.tier}">全部</button>
        ${m.tiers.map((t) => `<button class="chip" data-tier="${t}" aria-pressed="${q.tier === t}">${t}</button>`).join('')}
      </div>
      <div class="tabs" style="margin-left:12px" role="tablist" aria-label="分数口径">
        <button role="tab" data-scale="total" aria-selected="${q.scale !== 'single'}">总分</button>
        <button role="tab" data-scale="single" aria-selected="${q.scale === 'single'}">单科</button>
      </div>
      <a class="btn-quiet" style="margin-left:auto" href="#/exams">记录我的成绩 →</a>
    </div>
  </div>`;
}

/* ---------------- 首页 ---------------- */
async function renderHome() {
  const view = $('#view');
  if (!state.meta) {
    view.innerHTML = heroBlock() + `<div class="skeleton" style="margin-top:20px"></div>`;
    return;
  }
  view.innerHTML = `${heroBlock()}${filterBar()}<div id="results"></div>`;
  bindHome();
  if (state.mode === 'score') {
    renderMatch();
  } else {
    await loadSchools();
  }
}

function bindHome() {
  const q = state.q;
  const search = $('#qInput');
  let timer = null;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q.q = search.value.trim(); state.q.page = 1; loadSchools(); }, 320);
  });

  $('#fProvince')?.addEventListener('change', (e) => {
    state.q.province = e.target.value;
    state.q.page = 1;
    persistQuery();
    refreshResults();
  });
  $('#fSubject')?.addEventListener('change', (e) => { state.q.subject = e.target.value; state.q.page = 1; persistQuery(); refreshResults(); });
  $('#fYear')?.addEventListener('change', (e) => { state.q.year = Number(e.target.value); state.q.page = 1; persistQuery(); refreshResults(); });
  $('#fTrack')?.addEventListener('change', (e) => { state.q.track = e.target.value; state.q.page = 1; persistQuery(); refreshResults(); });
  $('#fLevel')?.addEventListener('change', (e) => { state.q.level = e.target.value; state.q.page = 1; refreshResults(); });

  $$('#tierChips .chip').forEach((btn) => btn.addEventListener('click', () => {
    state.q.tier = btn.dataset.tier;
    state.q.page = 1;
    $$('#tierChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    if (state.mode === 'score') renderMatch(); else loadSchools();
  }));

  $$('.tabs [data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    $$('.tabs [data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    refreshResults();
  }));

  $$('[data-scale]').forEach((btn) => btn.addEventListener('click', () => {
    state.q.scale = btn.dataset.scale;
    $$('[data-scale]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    refreshResults();
  }));

  // 事件委托：结果区（详情 / 收藏 / 分页）
  $('#results')?.addEventListener('click', async (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) { await toggleFavorite(Number(favBtn.dataset.fav), favBtn); return; }
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn && !pageBtn.disabled) {
      state.q.page = Number(pageBtn.dataset.page);
      loadSchools();
    }
  });
}

function refreshResults() {
  if (state.mode === 'score') renderMatch(); else loadSchools();
}

async function loadSchools() {
  const box = $('#results');
  if (!box) return;
  box.innerHTML = `<div class="skeleton" style="margin-top:18px;height:320px"></div>`;
  const q = state.q;
  const params = new URLSearchParams({
    province: q.province, subject: q.subject, track: q.track, year: q.year,
    page: q.page, pageSize: 20, sort: q.sort, scale: q.scale,
  });
  if (q.tier) params.set('tier', q.tier);
  if (q.level) params.set('level', q.level);
  if (q.level) params.set('level', q.level);
  if (q.q) params.set('q', q.q);

  try {
    const data = await api(`/api/schools?${params}`);
    box.innerHTML = schoolsPanel(data);
  } catch (err) {
    box.innerHTML = `<div class="panel empty"><b>没查成喵</b>${esc(err.message)}</div>`;
  }
}

function schoolsPanel(data) {
  if (!data.items.length) {
    return `<div class="panel empty" style="margin-top:18px"><b>圣录里没有匹配的学校</b>换个省份、科类，或者把关键词去掉试试。</div>`;
  }
  const rows = data.items.map((s) => `
    <tr>
      <td>
        <a class="school-cell" href="#/school/${s.id}">
          <span class="crest-sm">${esc(s.name[0])}</span>
          <span class="meta"><b>${esc(s.name)}</b><span>${esc(s.province)}${s.province === s.city ? '' : ` · ${esc(s.city)}`}</span></span>
        </a>
      </td>
      <td><span class="tag ${s.tier === '211' ? 'blue' : ''}">${esc(s.tier)}</span> <span class="dim" style="font-size:10px">${esc(s.level)}</span></td>
      <td><span class="tag">${esc(s.batch)}</span></td>
      <td class="r"><span class="score-strong">${s.total_score}</span></td>
      <td class="r dim">${s.single_score}<span style="font-size:10px"> / ${s.single_full}</span></td>
      <td class="r dim">${num(state.q.scale === 'single' ? s.single_rank : s.total_rank)}</td>
      <td class="r ${(state.q.scale === 'single' ? s.single_diff : s.total_diff) >= 0 ? 'diff-pos' : 'diff-neg'}">${sign(state.q.scale === 'single' ? s.single_diff : s.total_diff)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-fav="${s.id}" aria-pressed="${String(isFavorite(s.id))}" aria-label="收藏">${heart(isFavorite(s.id))}</button>
          <a class="btn-ghost btn-sm" href="#/school/${s.id}">详情</a>
        </div>
      </td>
    </tr>`).join('');

  const cards = data.items.map((s) => `
    <article class="scard">
      <div class="scard-head">
        <span class="crest-sm">${esc(s.name[0])}</span>
        <span><a class="scard-name" href="#/school/${s.id}">${esc(s.name)}</a><span class="scard-sub">${esc(s.province)}${s.province === s.city ? '' : ` · ${esc(s.city)}`} · ${esc(s.batch)}</span></span>
        <span class="tag">${esc(s.tier)}</span>
      </div>
      <div class="scard-stats">
        <div><b>${s.total_score}</b><span>总分</span></div>
        <div><b>${s.single_score}</b><span>${esc(state.q.subject)}</span></div>
        <div><b>${num(state.q.scale === 'single' ? s.single_rank : s.total_rank)}</b><span>位次</span></div>
      </div>
      <div class="scard-foot">
        <a class="btn-quiet" href="#/school/${s.id}">查看历年 →</a>
        <button class="icon-btn" data-fav="${s.id}" aria-pressed="${String(isFavorite(s.id))}" aria-label="收藏">${heart(isFavorite(s.id))}</button>
      </div>
    </article>`).join('');

  return `<div class="section-head">
      <h2>院校圣录</h2>
      <p class="sub">${esc(state.q.province)} · ${esc(state.q.subject)} · ${state.q.year} 年${state.q.tier ? ` · ${esc(state.q.tier)}` : ''}${singleNote(state.q.subject)}</p>
      <div class="right dim" style="font-size:12px">共 ${num(data.total)} 所</div>
    </div>
    <div class="panel" style="padding:6px 10px">
      <table class="result-table">
        <thead><tr>
          <th>院校</th><th>层次</th><th>批次</th><th class="r">总分</th><th class="r">${esc(state.q.subject)}</th><th class="r">位次</th><th class="r">线差</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="school-cards">${cards}</div>
    </div>
    <div class="pager">
      <button data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 <b>${data.page}</b> / ${data.pages} 页 · 共 ${num(data.total)} 所</span>
      <button data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>下一页</button>
    </div>`;
}

const favoriteIds = new Set();
const isFavorite = (id) => favoriteIds.has(Number(id));
const heart = (on) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"><path d="M12 20s-7-4.5-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.5 12 20 12 20z"/></svg>`;

async function toggleFavorite(schoolId, btn) {
  if (!state.user) {
    state.redirectTo = location.hash;
    toast('先登录，才能把学校收进圣殿喵');
    location.hash = '#/login';
    return;
  }
  const on = isFavorite(schoolId);
  try {
    if (on) {
      await api(`/api/favorites/${schoolId}`, { method: 'DELETE' });
      favoriteIds.delete(schoolId);
      toast('已从收藏里取下');
    } else {
      await api('/api/favorites', { method: 'POST', body: { schoolId } });
      favoriteIds.add(schoolId);
      toast('已收藏');
    }
    if (btn) {
      btn.setAttribute('aria-pressed', String(!on));
      btn.innerHTML = heart(!on);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- 分数定位 ---------------- */
// 四个模式：查总分·看总分 / 查总分·看单科 / 查单科·看总分 / 查单科·看单科
const MATCH_MODES = [
  { input: 'total', view: 'total', label: '查总分 · 看总分' },
  { input: 'total', view: 'single', label: '查总分 · 看单科' },
  { input: 'single', view: 'total', label: '查单科 · 看总分' },
  { input: 'single', view: 'single', label: '查单科 · 看单科' },
];
const modeKey = (m) => `${m.input}-${m.view}`;
const modeOf = (combo) => MATCH_MODES.find((m) => modeKey(m) === combo) || MATCH_MODES[1];

function renderMatch() {
  const box = $('#results');
  if (!box) return;
  const mode = modeOf(state.matchMode);
  const isSingleInput = mode.input === 'single';
  const full = SINGLE_SUBJECTS[state.q.subject] || 100;
  box.innerHTML = `<div class="panel" style="margin-top:18px">
    <div class="section-head" style="margin-top:0">
      <h2>按分数定位</h2>
      <p class="sub">${esc(state.q.province)} · ${esc(state.q.subject)}（${esc(state.q.track)}）· ${state.q.year}</p>
    </div>
    <div class="tabs" role="tablist" aria-label="定位模式" style="flex-wrap:wrap;gap:6px">
      ${MATCH_MODES.map((m) => `<button role="tab" data-mmode="${modeKey(m)}" aria-selected="${modeKey(m) === modeKey(mode)}">${m.label}</button>`).join('')}
    </div>
    <div class="toolbar-row">
      <input class="input" id="matchScore" type="number" min="0" max="${isSingleInput ? full : 750}" placeholder="${isSingleInput ? `输入你的${state.q.subject}单科成绩，满分 ${full}` : '输入你的总分，例如 608'}" style="max-width:250px" />
      <button class="btn" id="matchGo">看我能去哪</button>
      <span class="dim" style="font-size:12px">${isSingleInput ? `按单科分匹配：冲 = 高 1–${Math.max(2, Math.round(15 * full / 750))} 分 · 稳 = 上下 ${Math.max(2, Math.round(12 * full / 750))} 分 · 保 = 低 ${Math.round(13 * full / 750)}–${Math.round(35 * full / 750)} 分` : '按总分匹配：冲 = 高 1–15 分 · 稳 = 上下 12 分 · 保 = 低 13–35 分'}</span>
    </div>
    <div id="matchBody"></div>
  </div>`;
  const go = async () => {
    const score = Number($('#matchScore')?.value);
    if (!score) { toast('先填个分数喵', 'error'); return; }
    const body = $('#matchBody');
    body.innerHTML = `<div class="skeleton" style="margin-top:14px;height:180px"></div>`;
    try {
      const params = new URLSearchParams({
        score, province: state.q.province, subject: state.q.subject, track: state.q.track,
        year: state.q.year, level: state.q.level || '', input: mode.input, view: mode.view,
      });
      const data = await api(`/api/match?${params}`);
      state.match = data;
      body.innerHTML = matchPanel(data);
    } catch (err) {
      body.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  };
  $('#matchGo')?.addEventListener('click', go);
  $('#matchScore')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $$('[data-mmode]').forEach((btn) => btn.addEventListener('click', () => {
    state.matchMode = btn.dataset.mmode;
    state.match = null;
    renderMatch();
  }));
  if (state.match) $('#matchBody').innerHTML = matchPanel(state.match);
}

function matchPanel(data) {
  const viewSingle = data.view === 'single';
  const col = (title, key, cls) => {
    const items = data.groups[key] || [];
    return `<div class="match-col ${cls}">
      <h3>${title}</h3>
      ${items.length ? items.map((s) => `
        <a class="match-item" href="#/school/${s.id}">
          <span class="name">${esc(s.name)}<span>${esc(s.tier)} · ${esc(s.batch)} · 总分 ${s.total_score} · ${esc(data.subject)} ${s.single_score}/${s.single_full}${s.single_ok ? '' : ' ⚠'}</span></span>
          <span class="score">${viewSingle ? s.single_score : s.total_score}</span>
          <span class="gap">${s.gap > 0 ? `余 ${s.gap}` : s.gap < 0 ? `差 ${-s.gap}` : '卡线'}</span>
        </a>`).join('') : `<div class="match-empty">这一段没有匹配的学校</div>`}
    </div>`;
  };
  const modeLabel = data.input === 'single' ? `按${esc(data.subject)}单科` : '按总分';
  const viewLabel = data.view === 'single' ? `看${esc(data.subject)}单科` : '看总分';
  const edgeNote = data.overshoot
    ? `<div class="disclaimer" style="margin:10px 0 0">你的分数（${data.score}）高于本站所有院校的投档线（最高 ${data.topKey}），冲档不可能存在——下面列出站内分数最高的 8 所，纯属参考。</div>`
    : data.undershoot
      ? `<div class="disclaimer" style="margin:10px 0 0">你的分数（${data.score}）低于本站所有院校的投档线（最低 ${data.bottomKey}），保档为空——下面列出站内分数最低的 8 所。</div>`
      : '';
  return `<div class="dim" style="font-size:12px;margin:14px 0 0">
      本科线 ${data.line} 分 · ${esc(data.province)} ${esc(data.subject)}（${esc(data.track)}）· ${data.year} 年 · <b>${modeLabel}匹配</b> · <b>${viewLabel}</b>${data.input === 'single' ? ` · 满分 ${data.full}` : ''}</div>
    ${edgeNote}
    <div class="disclaimer" style="margin:10px 0 0">⚠ 演示数据：分数、位次、单科分全部由算法生成，不可作为志愿填报依据。网上信息都别全信，本站也一样。</div>
    <div class="match-grid">${col('冲 · 够一够', 'chong', 'chong')}${col('稳 · 站得住', 'wen', 'wen')}${col('保 · 睡得着', 'bao', 'bao')}</div>`;
}

/* ---------------- 学校详情 ---------------- */
async function renderSchool(id) {
  const view = $('#view');
  view.innerHTML = `<div class="crumbs"><a href="#/">圣殿</a><span>/</span><span>院校</span></div>
    <div class="skeleton" style="height:280px"></div>`;
  const params = new URLSearchParams({ province: state.q.province, subject: state.q.subject, track: state.q.track, year: state.q.year });
  let data;
  try {
    data = await api(`/api/schools/${id}?${params}`);
  } catch (err) {
    view.innerHTML = `<div class="panel empty" style="margin-top:24px"><b>没找到这所学校喵</b>${esc(err.message)}</div>`;
    return;
  }
  const { school, series, majors, isFavorite: fav, growth } = data;
  const latest = series.length ? series[series.length - 1] : null;
  const on = fav || isFavorite(school.id);

  view.innerHTML = `
    <div class="crumbs"><a href="#/">圣殿</a><span>/</span><span>${esc(school.province)}</span><span>/</span><span>${esc(school.name)}</span></div>
    <div class="panel">
      <div class="detail-head">
        <span class="crest-sm crest-lg">${esc(school.name[0])}</span>
        <div>
          <h1>${esc(school.name)}</h1>
          <div class="tags">
            <span class="tag">${esc(school.tier)}</span>
            <span class="tag blue">${esc(school.category)}</span>
            <span class="tag">${esc(school.level)}</span>
            <span class="tag">${esc(latest ? latest.batch : '—')}</span>
            <span class="tag">${esc(school.province)}${school.province === school.city ? '' : ` · ${esc(school.city)}`}</span>
          </div>
          <p class="note">${esc(school.note || '')}</p>
        </div>
        <div class="actions">
          <button class="btn-ghost btn-sm" id="favBtn" data-id="${school.id}" aria-pressed="${on}">${on ? '已收藏' : '☆ 收藏'}</button>
        </div>
      </div>
      <div class="stat-row">
        <div><b>${latest ? latest.total_score : '—'}</b><span>${state.q.year} 总分</span></div>
        <div><b>${latest ? `${latest.single_score}<small style="font-size:12px">/${latest.single_full}</small>` : '—'}</b><span>${esc(state.q.subject)} 单科</span></div>
        <div><b>${latest ? num(state.q.scale === 'single' ? latest.single_rank : latest.total_rank) : '—'}</b><span>位次</span></div>
        <div><b class="${(state.q.scale === 'single' ? latest?.single_diff : latest?.total_diff) >= 0 ? 'diff-pos' : 'diff-neg'}">${latest ? sign(state.q.scale === 'single' ? latest.single_diff : latest.total_diff) : '—'}</b><span>线差</span></div>
        <div><b class="${growth >= 0 ? 'diff-pos' : 'diff-neg'}">${growth === null ? '—' : sign(growth)}</b><span>总分五年变化</span></div>
      </div>
    </div>

    <div class="panel">
      <div class="section-head" style="margin-top:0">
        <h2>历年分数线</h2>
        <p class="sub">${esc(state.q.province)} · ${esc(state.q.subject)}（${esc(state.q.track)}）· 总分与单科双口径</p>
      </div>
      <div class="chart-wrap" id="schoolChart"></div>
      <div class="chart-legend"><b><i></i>${state.q.scale === 'single' ? '单科' : '总分'}走势</b><b class="dash"><i></i>切换上方「总分 / 单科」可换口径</b></div>
      <table class="data-table" style="margin-top:14px">
        <thead><tr><th>年份</th><th>总分</th><th>${esc(state.q.subject)}</th><th>位次</th><th>线差</th></tr></thead>
        <tbody>${series.map((r) => `<tr>
          <td>${r.year}</td><td>${r.total_score}</td>
          <td>${r.single_score}<span class="dim" style="font-size:10px">/${r.single_full}</span></td>
          <td>${num(state.q.scale === 'single' ? r.single_rank : r.total_rank)}</td>
          <td class="${(state.q.scale === 'single' ? r.single_diff : r.total_diff) >= 0 ? 'diff-pos' : 'diff-neg'}">${sign(state.q.scale === 'single' ? r.single_diff : r.total_diff)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="panel">
      <div class="section-head" style="margin-top:0">
        <h2>专业分数线</h2>
        <p class="sub">${data.query.year} 年 · ${esc(state.q.province)} · ${esc(state.q.subject)}</p>
      </div>
      ${majors.length ? `<table class="data-table">
        <thead><tr><th>专业</th><th>批次</th><th>最低分</th><th>最低位次</th><th>计划数</th></tr></thead>
        <tbody>${majors.map((m) => `<tr><td>${esc(m.major)}</td><td>${esc(m.batch)}</td><td>${m.min_score}</td><td>${num(m.min_rank)}</td><td>${num(m.plan_count)}</td></tr>`).join('')}</tbody>
      </table>` : `<div class="empty">这一年还没有专业分数线</div>`}
    </div>`;

  // 图表：最低分
  const host = $('#schoolChart');
  state.lastSchoolSeries = series;
  if (host && series.length) {
    lineChart(host, {
      points: series.map((r) => ({ x: String(r.year), y: state.q.scale === 'single' ? r.single_score : r.total_score })),
      height: 300,
      yLabel: state.q.scale === 'single' ? '单科分' : '总分',
    });
  }

  $('#favBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const wasOn = isFavorite(school.id) || btn.getAttribute('aria-pressed') === 'true';
    await toggleFavorite(school.id, null);
    if (state.user) {
      btn.textContent = wasOn ? '☆ 收藏' : '已收藏';
      btn.setAttribute('aria-pressed', String(!wasOn));
    }
  });
}

/* ---------------- 我的考试 ---------------- */
async function renderExams() {
  const view = $('#view');
  if (!state.user) {
    view.innerHTML = gateView('我的考试', '登录之后，每一次考试的总分、各科进退都会留在这里，花枝猫也才有东西可看。', '登录 / 注册', '#/login');
    return;
  }
  view.innerHTML = `<div class="section-head"><h2>我的考试</h2><p class="sub">每一次进退，都算数</p>
    <div class="right"><button class="btn-ghost btn-sm" id="newExam">＋ 录入新成绩</button></div></div>
    <div class="skeleton" style="height:320px"></div>`;
  let summary;
  try {
    summary = await api('/api/exams/summary');
  } catch (err) {
    view.innerHTML = `<div class="panel empty"><b>读取失败</b>${esc(err.message)}</div>`;
    return;
  }
  const list = await api('/api/exams').catch(() => ({ items: [] }));
  const examItems = list.items.slice();
  const subjectNames = [];
  examItems.forEach((e) => (e.subjects || []).forEach((s) => { if (!subjectNames.includes(s.name)) subjectNames.push(s.name); }));

  if (!summary.count) {
    view.innerHTML = `<div class="section-head"><h2>我的考试</h2><p class="sub">每一次进退，都算数</p></div>
      <div class="panel gate">
        <h2>还没有成绩</h2>
        <p>先把最近一次考试录进来：总分、各科分数。之后每一次录入，都会自动算出进步和退步。</p>
        <button class="btn" id="emptyNew">录入第一次成绩</button>
      </div>`;
    bindExamForm(() => renderExams());
    $('#emptyNew')?.addEventListener('click', () => openExamForm(() => renderExams()));
    return;
  }

  const latest = summary.latest;
  const deltaCls = summary.delta === null ? 'flat' : summary.delta > 0 ? 'up' : summary.delta < 0 ? 'down' : 'flat';
  view.innerHTML = `
    <div class="section-head"><h2>我的考试</h2><p class="sub">每一次进退，都算数</p>
      <div class="right"><button class="btn-ghost btn-sm" id="newExam">＋ 录入新成绩</button></div></div>

    <div class="panel">
      <div class="summary-grid">
        <div class="summary-card"><span>最近一次</span><b>${latest.total}<small>/${latest.full_total}</small></b>
          <div class="dim" style="font-size:11px">${esc(latest.name)} · ${esc(latest.exam_date)}</div></div>
        <div class="summary-card"><span>较上次</span><b class="diff-${summary.delta >= 0 ? 'pos' : 'neg'}">${summary.delta === null ? '—' : sign(summary.delta)}</b>
          <div class="dim" style="font-size:11px">${summary.previous ? `上次 ${esc(summary.previous.name)} ${summary.previous.total}` : '第一次记录'}</div></div>
        <div class="summary-card"><span>历史最高</span><b>${summary.best.total}</b>
          <div class="dim" style="font-size:11px">${esc(summary.best.name)} · ${esc(summary.best.date)}</div></div>
        <div class="summary-card"><span>净变化</span><b class="diff-${summary.net >= 0 ? 'pos' : 'neg'}">${sign(summary.net)}</b>
          <div class="dim" style="font-size:11px">共 ${summary.count} 次考试</div></div>
      </div>

      <div class="section-head" style="margin:22px 0 4px"><h2 style="font-size:18px">成绩走势</h2>
        <p class="sub">${summary.series[0].date} → ${summary.series[summary.series.length - 1].date} · 点科目切换单科曲线</p></div>
      <div class="tabs" id="chartTabs" role="tablist" aria-label="走势科目">
        <button role="tab" data-subject="" aria-selected="true">总分</button>
        ${subjectNames.map((n) => `<button role="tab" data-subject="${esc(n)}" aria-selected="false">${esc(n)}</button>`).join('')}
      </div>
      <div class="chart-wrap" id="examChart"></div>
      <p class="dim" id="chartNote" style="font-size:12px;margin:8px 0 0"></p>

      ${summary.bySubject.length ? `
        <div class="section-head" style="margin:20px 0 0"><h2 style="font-size:18px">最近一次各科</h2>
          <p class="sub">对比 ${summary.previous ? esc(summary.previous.name) : '上一次'}</p></div>
        <div class="subject-bars">
          ${summary.bySubject.map((s) => {
            const pct = Math.max(2, Math.round((s.score / s.full) * 100));
            const bad = s.delta !== null && s.delta < 0;
            return `<div class="subject-bar ${bad ? 'low' : ''}">
              <div class="name">${esc(s.name)}</div>
              <div class="val">${s.score}<small>/${s.full}</small></div>
              <div class="delta ${s.delta > 0 ? 'diff-pos' : s.delta < 0 ? 'diff-neg' : 'dim'}">${s.delta === null ? '—' : sign(s.delta)}</div>
              <div class="bar"><i style="width:${pct}%"></i></div>
            </div>`;
          }).join('')}
        </div>` : ''}
    </div>

    <div class="panel">
      <div class="section-head" style="margin-top:0"><h2 style="font-size:18px">全部记录</h2>
        <p class="sub">录入后会自动计算与上一次的差值</p></div>
      <div class="exam-list">
        ${list.items.slice().reverse().map((e) => `<div class="exam-row">
          <div><div class="name">${esc(e.name)}</div><div class="date">${esc(e.exam_date)}</div></div>
          <div class="total">${e.total}</div>
          <div class="delta ${e.delta > 0 ? 'up' : e.delta < 0 ? 'down' : 'flat'}">${e.delta === null ? '首次' : sign(e.delta)}</div>
          <button class="btn-quiet" data-del="${e.id}">删除</button>
        </div>`).join('')}
      </div>
    </div>`;

  const chartHost = $('#examChart');

  const drawChart = (subject) => {
    if (!chartHost) return;
    const note = $('#chartNote');
    let points;
    let label;
    if (!subject) {
      points = summary.series.map((s) => ({ x: s.name, y: s.total }));
      label = '总分走势';
      const vals = summary.series.map((s) => s.total);
      const best = Math.max(...vals);
      const worst = Math.min(...vals);
      if (note) note.textContent = `最高 ${best} · 最低 ${worst} · 净变化 ${sign(summary.net)} · 共 ${summary.count} 次`;
    } else {
      const rows = examItems
        .filter((e) => e.subjects.some((s) => s.name === subject))
        .map((e) => ({ name: e.name, date: e.exam_date, score: e.subjects.find((s) => s.name === subject).score }));
      points = rows.map((r) => ({ x: r.name, y: r.score }));
      label = `${subject}走势`;
      if (rows.length) {
        const vals = rows.map((r) => r.score);
        const best = Math.max(...vals);
        const worst = Math.min(...vals);
        const last = vals[vals.length - 1];
        const prev = vals.length > 1 ? vals[vals.length - 2] : null;
        const delta = prev === null ? null : last - prev;
        if (note) note.textContent = `最高 ${best} · 最低 ${worst} · 最近一次 ${last}${delta === null ? '（首次）' : `（较上次 ${sign(delta)}）`}`;
      } else if (note) {
        note.textContent = '';
      }
    }
    lineChart(chartHost, { points, height: 300, yLabel: label });
  };
  drawChart('');

  $$('#chartTabs [data-subject]').forEach((btn) => btn.addEventListener('click', () => {
    $$('#chartTabs [data-subject]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    drawChart(btn.dataset.subject || '');
  }));

  $('#newExam')?.addEventListener('click', () => openExamForm(() => renderExams()));
  $$('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('删掉这条考试记录？')) return;
    try {
      await api(`/api/exams/${btn.dataset.del}`, { method: 'DELETE' });
      toast('已删除');
      renderExams();
    } catch (err) { toast(err.message, 'error'); }
  }));
  bindExamForm(() => renderExams());
}

function bindExamForm(onDone) {
  const form = $('#examForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#examName').value.trim();
    const date = $('#examDate').value;
    const subjects = $$('.subject-input', form).map((row) => ({
      name: row.querySelector('.subject-name').value.trim(),
      score: Number(row.querySelector('input[type="number"]').value),
      full: Number(row.dataset.full || 100),
    })).filter((s) => s.name && Number.isFinite(s.score));
    if (!name) { toast('先给这次考试起个名字喵', 'error'); return; }
    if (!date) { toast('选一个日期喵', 'error'); return; }
    if (!subjects.length) { toast('至少填一科分数喵', 'error'); return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api('/api/exams', { method: 'POST', body: { name, date, subjects } });
      toast('已记下，花枝猫会看的');
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  // 切换科目时同步满分
  form.addEventListener('change', (e) => {
    const sel = e.target.closest('.subject-name');
    if (!sel) return;
    const row = sel.closest('.subject-input');
    const full = SUBJECT_FULL[sel.value] ?? 100;
    row.dataset.full = String(full);
    const num = row.querySelector('input[type="number"]');
    num.max = String(full);
    if (Number(num.value) > full) num.value = String(full);
    const label = row.querySelector('.full');
    if (label) label.textContent = `/${full}`;
  });

  $('#addSubject')?.addEventListener('click', () => {
    const wrap = $('#subjectInputs');
    wrap.insertAdjacentHTML('beforeend', subjectRow('政治'));
  });

  $$('.subject-input input[type="number"]', form).forEach((inp) => {
    inp.addEventListener('input', () => {
      const full = Number(inp.closest('.subject-input').dataset.full || 100);
      if (Number(inp.value) > full) inp.value = full;
    });
  });
}

const SUBJECT_FULL = { 语文: 150, 数学: 150, 英语: 150, 政治: 100, 地理: 100, 化学: 100, 生物: 100 };
const SUBJECT_OPTIONS = Object.keys(SUBJECT_FULL);
const DEFAULT_SUBJECTS = ['语文', '数学', '英语', '政治', '地理', '化学', '生物'];
// 单科口径（分数线按单科满分折算，线差 = 单科分 − 及格线）
const SINGLE_SUBJECTS = { 数学: 150, 化学: 100, 生物: 100 };
const singleNote = (subject) => (SINGLE_SUBJECTS[subject] ? ` · 单科满分 ${SINGLE_SUBJECTS[subject]}，线差 = 单科分 − 及格线` : '');

function subjectRow(name) {
  const full = SUBJECT_FULL[name] ?? 100;
  const options = SUBJECT_OPTIONS.map((s) => `<option ${s === name ? 'selected' : ''}>${s}</option>`).join('');
  return `<div class="subject-input" data-full="${full}">
    <select class="subject-name">${options}</select>
    <span class="score-box"><input type="number" min="0" max="${full}" step="0.5" /><span class="full">/${full}</span></span>
  </div>`;
}

function openExamForm(onDone) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="examModal">
      <div class="panel" style="max-width:620px;margin:6vh auto;max-height:86vh;overflow:auto">
        <div class="section-head" style="margin-top:0"><h2>录入一次成绩</h2>
          <div class="right"><button class="btn-quiet" id="closeExam">收起</button></div></div>
        <form class="exam-form" id="examForm">
          <div class="grid-2">
            <div class="field"><label>考试名称</label><input class="input" id="examName" placeholder="例如 二模" maxlength="40" /></div>
            <div class="field"><label>日期</label><input class="input" id="examDate" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
          </div>
          <div class="field"><label>各科分数</label>
            <div class="subject-inputs" id="subjectInputs">
              ${DEFAULT_SUBJECTS.map(subjectRow).join('')}
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn" type="submit">保存</button>
            <span class="dim" style="font-size:11.5px">总分自动相加，保存后立刻算出与上次的进退。</span>
          </div>
        </form>
      </div>
    </div>`);
  const modal = $('#examModal');
  const close = () => modal.remove();
  $('#closeExam').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  bindExamForm(() => { close(); onDone?.(); });
}

/* ---------------- 收藏 ---------------- */
async function renderFavorites() {
  const view = $('#view');
  if (!state.user) {
    view.innerHTML = gateView('我的收藏', '登录之后，把想去的学校收进圣殿，报志愿时不用再翻一遍。', '登录 / 注册', '#/login');
    return;
  }
  const params = new URLSearchParams({ province: state.q.province, subject: state.q.subject, track: state.q.track, year: state.q.year });
  view.innerHTML = `<div class="section-head"><h2>我的收藏</h2>
    <p class="sub">${esc(state.q.province)} · ${esc(state.q.subject)} · ${esc(state.q.track)} · ${state.q.year}</p></div>
    <div class="skeleton" style="height:200px"></div>`;
  try {
    const data = await api(`/api/favorites?${params}`);
    if (!data.items.length) {
      view.innerHTML = `<div class="section-head"><h2>我的收藏</h2></div>
        <div class="panel gate"><h2>还没有收藏</h2><p>在院校圣录里点一下 ☆，想去的学校就会留在这里。</p>
        <a class="btn" href="#/">去逛圣录</a></div>`;
      return;
    }
    view.innerHTML = `<div class="section-head"><h2>我的收藏</h2>
      <p class="sub">${esc(state.q.province)} · ${esc(state.q.subject)} · ${state.q.year}</p>
      <div class="right dim" style="font-size:12px">共 ${data.items.length} 所</div></div>
      <div class="fav-grid">
        ${data.items.map((s) => `<div class="fav-card">
          <span class="crest-sm">${esc(s.name[0])}</span>
          <div><a href="#/school/${s.id}" class="name">${esc(s.name)}</a>
            <div class="meta">${esc(s.province)} · ${esc(s.tier)}</div></div>
          <div class="score">${s.total_score ?? '—'}<small>总分</small></div>
          <div class="score">${s.single_score ?? '—'}<small>${esc(state.q.subject)}</small></div>
          <button class="icon-btn" data-unfav="${s.id}" aria-label="取消收藏">${heart(true)}</button>
        </div>`).join('')}
      </div>`;
    $$('[data-unfav]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await api(`/api/favorites/${btn.dataset.unfav}`, { method: 'DELETE' });
        favoriteIds.delete(Number(btn.dataset.unfav));
        toast('已取消收藏');
        renderFavorites();
      } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) {
    view.innerHTML = `<div class="panel empty"><b>读取失败</b>${esc(err.message)}</div>`;
  }
}

/* ---------------- 我的 ---------------- */
async function renderMe() {
  const view = $('#view');
  if (!state.user) {
    view.innerHTML = gateView('我的账号', '用你自己的邮箱登录，成绩、收藏和花枝猫的对话都会跟着你。', '登录 / 注册', '#/login');
    return;
  }
  const me = await api('/api/auth/me').catch(() => ({ user: state.user, stats: {} }));
  view.innerHTML = `<div class="section-head"><h2>我的账号</h2><p class="sub">成绩与收藏只属于你</p></div>
    <div class="panel">
      <div class="profile-row"><span class="label">邮箱</span><span class="value">${esc(me.user.email)}</span>
        <span class="right dim" style="font-size:11.5px">${me.user.emailVerified ? '已验证' : '未验证'}</span></div>
      <div class="profile-row"><span class="label">注册时间</span><span class="value">${esc((me.user.createdAt || '').slice(0, 10))}</span></div>
      <div class="profile-row"><span class="label">考试记录</span><span class="value">${me.stats?.exams ?? 0} 次</span></div>
      <div class="profile-row"><span class="label">收藏学校</span><span class="value">${me.stats?.favorites ?? 0} 所</span></div>
      <div class="profile-row"><span class="label">花枝猫</span><span class="value">对话记录只保存在这里</span>
        <span class="right"><button class="btn-quiet" id="clearChat">清空对话</button></span></div>
      <div class="profile-row"><span class="label">登录状态</span><span class="value">已登录</span>
        <span class="right"><button class="btn-danger" id="logoutBtn">退出登录</button></span></div>
    </div>`;
  $('#logoutBtn')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    state.user = null;
    state.chatLoaded = false;
    favoriteIds.clear();
    const box = $('#catMessages');
    box.innerHTML = '';
    box.classList.remove('locked');
    toast('已退出');
    renderAccount();
    location.hash = '#/';
  });
  $('#clearChat')?.addEventListener('click', async () => {
    if (!confirm('清空与花枝猫的全部对话？')) return;
    await api('/api/chat', { method: 'DELETE' });
    state.chatLoaded = false;
    $('#catMessages').innerHTML = '';
    toast('对话已清空');
  });
}

function gateView(title, text, cta, href) {
  return `<div class="section-head"><h2>${esc(title)}</h2></div>
    <div class="panel gate">
      <h2>${esc(title)}需要先登录</h2>
      <p>${esc(text)}</p>
      <a class="btn" href="${href}">${esc(cta)}</a>
    </div>`;
}

/* ---------------- 登录 / 注册 ---------------- */
function mountTurnstile(cb) {
  if (window.turnstile) { cb(); return; }
  if (document.getElementById('turnstileScript')) {
    const t = setInterval(() => {
      if (window.turnstile) { clearInterval(t); cb(); }
    }, 200);
    return;
  }
  const s = document.createElement('script');
  s.id = 'turnstileScript';
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.defer = true;
  s.onload = () => cb();
  document.head.appendChild(s);
}

function renderLogin() {
  const view = $('#view');
  view.innerHTML = `<div class="auth-wrap"><div class="panel auth-card">
    <h1>进入圣殿</h1>
    <p class="sub">用你自己的邮箱注册或登录</p>
    <div class="auth-tabs">
      <button type="button" data-auth="login" aria-selected="true">登录</button>
      <button type="button" data-auth="register" aria-selected="false">注册</button>
    </div>
    <form class="auth-form" id="authForm">
      <div class="field"><label>邮箱</label>
        <input class="input" id="authEmail" type="email" autocomplete="email" placeholder="you@example.com" required /></div>
      <div class="field"><label>密码</label>
        <input class="input" id="authPassword" type="password" autocomplete="current-password" placeholder="至少 8 位" required /></div>
      <div class="field" id="codeField" hidden>
        <label>邮箱验证码</label>
        <div class="code-row">
          <input class="input" id="authCode" inputmode="numeric" maxlength="6" placeholder="6 位数字" autocomplete="one-time-code" />
          <button type="button" class="btn-ghost btn-sm" id="sendCode">获取验证码</button>
        </div>
      </div>
      <div id="authAlert"></div>
      <div class="turnstile-slot" id="turnstileSlot" hidden></div>
      <button class="btn" type="submit" id="authSubmit">登录</button>
    </form>
    <p class="auth-note" id="authNote">密码用 PBKDF2 加盐哈希保存，服务器不存明文。<br>这是演示站点，请勿使用你在别处的重要密码。</p>
  </div></div>`;

  let mode = 'login';
  const codeEnabled = Boolean(state.meta?.emailCode);
  const turnstile = state.meta?.turnstile || { enabled: false };
  const syncMode = () => {
    const isRegister = mode === 'register';
    $('#codeField')?.toggleAttribute('hidden', !(isRegister && codeEnabled));
    $('#authSubmit').textContent = isRegister ? '注册并进入' : '登录';
    $('#authPassword').setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    $('#authNote').innerHTML = isRegister
      ? (codeEnabled
        ? '注册需要邮箱验证码，10 分钟内有效。<br>密码用 PBKDF2 加盐哈希保存，服务器不存明文。'
        : '邮箱验证码暂未开通，可直接注册。<br>密码用 PBKDF2 加盐哈希保存，服务器不存明文。')
      : '密码用 PBKDF2 加盐哈希保存，服务器不存明文。<br>这是演示站点，请勿使用你在别处的重要密码。';
    $('#authAlert').innerHTML = '';
  };

  // 人机验证：配了 Turnstile 就用它，否则用内置算式（都在同一个容器里）
  state.turnstileToken = '';
  state.challenge = null;
  const captchaMode = state.meta?.captcha || (turnstile.enabled ? 'turnstile' : 'challenge');
  let activeMode = captchaMode;
  const slot = $('#turnstileSlot');

  const loadChallenge = async () => {
    if (!slot) return;
    slot.hidden = false;
    slot.innerHTML = `<div class="challenge-row">
      <span class="challenge-q" id="challengeQ">正在出题…</span>
      <input class="input" id="challengeA" inputmode="numeric" placeholder="填答案" style="max-width:110px" autocomplete="off" />
      <button type="button" class="btn-quiet" id="challengeRefresh">换一题</button>
    </div>`;
    try {
      const data = await api('/api/auth/challenge');
      state.challenge = data;
      $('#challengeQ').textContent = data.question;
    } catch {
      $('#challengeQ').textContent = '验证题加载失败，点「换一题」重试';
    }
    $('#challengeRefresh')?.addEventListener('click', loadChallenge);
  };

  if (captchaMode === 'turnstile' && turnstile.enabled) {
    if (slot) slot.hidden = false;
    mountTurnstile(() => {
      const el = $('#turnstileSlot');
      if (!el || !window.turnstile) return;
      window.turnstile.render(el, {
        sitekey: turnstile.siteKey,
        theme: 'light',
        language: 'zh-cn',
        callback: (token) => { state.turnstileToken = token; },
        'expired-callback': () => { state.turnstileToken = ''; },
        'error-callback': () => { state.turnstileToken = ''; },
      });
    });
    // 第三方脚本被拦或渲染失败时的兜底：切到内置算式
    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = 'btn-quiet';
    fallback.style.cssText = 'display:block;margin:8px auto 0;font-size:11px';
    fallback.textContent = '验证框加载不出来？改用算式验证';
    $('.auth-form')?.appendChild(fallback);
    fallback.addEventListener('click', () => {
      activeMode = 'challenge';
      if (slot) slot.innerHTML = '';
      fallback.remove();
      loadChallenge();
    });
  } else {
    loadChallenge();
  }

  const requireHuman = () => {
    if (activeMode === 'turnstile' && turnstile.enabled) {
      if (state.turnstileToken) return true;
      toast('先完成下面的人机验证喵（加载不出来可点「改用算式验证」）', 'error');
      return false;
    }
    const ans = $('#challengeA')?.value.trim();
    if (ans) return true;
    toast('先把下面的算式填一下喵', 'error');
    return false;
  };
  const captchaPayload = () => {
    if (activeMode === 'turnstile' && turnstile.enabled) return { turnstileToken: state.turnstileToken };
    return { challengeToken: state.challenge?.token || '', challengeAnswer: $('#challengeA')?.value.trim() || '' };
  };

  $$('[data-auth]').forEach((btn) => btn.addEventListener('click', () => {
    mode = btn.dataset.auth;
    $$('[data-auth]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    syncMode();
  }));
  syncMode();

  let countdown = 0;
  let timer = null;
  const sendBtn = $('#sendCode');
  const startCountdown = () => {
    countdown = 60;
    sendBtn.disabled = true;
    sendBtn.textContent = `${countdown}s 后重发`;
    timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timer);
        sendBtn.disabled = false;
        sendBtn.textContent = '获取验证码';
        return;
      }
      sendBtn.textContent = `${countdown}s 后重发`;
    }, 1000);
  };

  sendBtn?.addEventListener('click', async () => {
    const email = $('#authEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast('先填一个正确的邮箱喵', 'error'); return; }
    if (!requireHuman()) return;
    sendBtn.disabled = true;
    try {
      const data = await api('/api/auth/send-code', { method: 'POST', body: { email, ...captchaPayload() } });
      if (data.devCode) {
        $('#authCode').value = data.devCode;
        toast(`本地开发模式：验证码 ${data.devCode}`);
      } else {
        toast('验证码已发送，查收邮箱');
      }
      startCountdown();
    } catch (err) {
      sendBtn.disabled = false;
      toast(err.message, 'error');
    }
  });

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const code = $('#authCode')?.value.trim() || '';
    const submit = $('#authSubmit');
    if (!requireHuman()) return;
    submit.disabled = true;
    try {
      const payload = { email, password, ...captchaPayload() };
      if (mode === 'register' && codeEnabled) payload.code = code;
      await api(`/api/auth/${mode}`, { method: 'POST', body: payload });
      await loadUser();
      toast(mode === 'login' ? '欢迎回来' : '欢迎来到圣殿');
      const target = state.redirectTo || '#/';
      state.redirectTo = null;
      location.hash = target;
    } catch (err) {
      $('#authAlert').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
    } finally {
      submit.disabled = false;
    }
  });
}

/* ---------------- 账号区 ---------------- */
function renderAccount() {
  const box = $('#account');
  if (!box) return;
  if (state.user) {
    const email = state.user.email;
    const short = email.length > 22 ? `${email.slice(0, 18)}…` : email;
    box.innerHTML = `<a class="account-chip" href="#/me" title="${esc(email)}">
        <span class="avatar-dot">${esc(email[0].toUpperCase())}</span>
        <span class="email-text">${esc(short)}</span>
      </a>
      <button class="logout" id="quickLogout">退出</button>`;
    $('#quickLogout')?.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      state.user = null;
      state.chatLoaded = false;
      favoriteIds.clear();
      const box = $('#catMessages');
      box.innerHTML = '';
      box.classList.remove('locked');
      toast('已退出');
      renderAccount();
      await route();
    });
  } else {
    box.innerHTML = `<a class="btn-ghost btn-sm" href="#/login">登录 / 注册</a>`;
  }
}

/* ---------------- 花枝猫 ---------------- */
function openCat() {
  const drawer = $('#catDrawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  $('#catFab').setAttribute('aria-expanded', 'true');
  if (!state.user) {
    const box = $('#catMessages');
    box.classList.add('locked');
    box.innerHTML = `<div class="cat-lock">
      <p>花枝猫在打盹。登录之后它才会醒来——<br>它会看你的成绩单，也会记得上次聊到哪儿。</p>
      <a href="#/login" data-cat-login>去登录 / 注册 →</a>
    </div>`;
    $('#catForm').style.display = 'none';
    $('#catSuggests').style.display = 'none';
    $('#catMessages').querySelector('[data-cat-login]')?.addEventListener('click', () => {
      state.redirectTo = location.hash;
      closeCat();
    });
    return;
  }
  $('#catForm').style.display = '';
  $('#catSuggests').style.display = '';
  $('#catMessages').classList.remove('locked');
  if (!state.chatLoaded) loadChat();
}

function closeCat() {
  const drawer = $('#catDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#catFab').setAttribute('aria-expanded', 'false');
}

async function loadChat() {
  try {
    const data = await api('/api/chat');
    state.chatLoaded = true;
    state.chatQuota = { limit: data.limit ?? 25, remaining: data.remaining ?? null };
    renderChatQuota();
    const box = $('#catMessages');
    box.innerHTML = '';
    if (!data.items.length) {
      appendChat('assistant', '喵，你来了。这里是圣殿的分数线，也是你走过的地方。把最近的分数说给小猫听——别怕，杂鱼也有爬上来的那天。');
      appendChatHint(data.model);
    } else {
      data.items.forEach((m) => appendChat(m.role, m.content));
      appendChatHint(data.model);
    }
  } catch (err) {
    if (err.status === 401) {
      $('#catMessages').innerHTML = `<div class="cat-lock">登录过期了，重新登录一下喵。<br><a href="#/login">去登录 →</a></div>`;
    } else {
      toast(err.message, 'error');
    }
  }
}

function appendChat(role, content) {
  const box = $('#catMessages');
  const el = document.createElement('div');
  el.className = `cat-msg ${role === 'user' ? 'me' : 'ai'}`;
  const face = role === 'user'
    ? '<span class="who">我</span>'
    : '<img class="face" src="/img/huazhimao-avatar.jpg" alt="" />';
  el.innerHTML = `${face}<div class="bubble">${esc(content).replace(/\n/g, '<br>')}</div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el.querySelector('.bubble');
}

let chatHintShown = false;
function appendChatHint(hasModel) {
  if (chatHintShown) return;
  chatHintShown = true;
  const box = $('#catMessages');
  const el = document.createElement('div');
  el.className = 'dim';
  el.style.cssText = 'font-size:10.5px;letter-spacing:.1em;text-align:center;padding:2px 0 6px';
  el.textContent = hasModel ? 'deepseek-v4-flash · 花枝猫人设 · 已连接' : '花枝猫人设 · 本地话术引擎（未配置模型密钥）';
  box.appendChild(el);
}

function renderChatQuota() {
  const q = state.chatQuota;
  const el = $('#catStatus');
  if (!el || !q || q.remaining === null) return;
  el.textContent = q.remaining > 0
    ? `今日还剩 ${q.remaining} / ${q.limit} 条 · 醒了就陪你复盘`
    : `今日 ${q.limit} 条已聊完 · 明天再来`;
}

async function sendChat(text) {
  if (!state.user) { openCat(); return; }
  if (state.chatBusy || !text.trim()) return;
  const quota = state.chatQuota;
  if (quota && quota.remaining === 0) {
    toast(`今天的 ${quota.limit} 条聊完了，明天再来喵`, 'error');
    return;
  }
  state.chatBusy = true;
  appendChat('user', text);
  const bubble = appendChat('assistant', '');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: { message: text, province: state.q.province, subject: state.q.subject, track: state.q.track },
    });
    bubble.innerHTML = esc(data.reply).replace(/\n/g, '<br>');
    if (typeof data.remaining === 'number') {
      state.chatQuota = { limit: data.limit ?? 25, remaining: data.remaining };
      renderChatQuota();
    }
  } catch (err) {
    if (err.status === 429 && err.payload) {
      state.chatQuota = { limit: err.payload.limit ?? 25, remaining: 0 };
      renderChatQuota();
      bubble.innerHTML = `（耳朵垂下来）${esc(err.payload.error || err.message)}`;
    } else {
      bubble.innerHTML = `（耳朵垂下来）${esc(err.message)}`;
    }
  } finally {
    state.chatBusy = false;
    $('#catMessages').scrollTop = $('#catMessages').scrollHeight;
  }
}

function bindReward() {
  const modal = $('#rewardModal');
  const open = $('#rewardOpen');
  if (!modal || !open) return;
  const show = () => {
    modal.hidden = false;
    document.body.classList.add('modal-open');
  };
  const hide = () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  };
  open.addEventListener('click', show);
  $('#rewardClose')?.addEventListener('click', hide);
  // 点空白处（遮罩本身）关闭
  modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) hide(); });

  // 每次打开网页都弹一次（同一页面内只弹一次，不重复打扰）
  setTimeout(() => {
    if (!modal.hidden || document.body.classList.contains('modal-open')) return;
    show();
  }, 1800);
}

function bindCat() {
  // 微信号复制（微信没有官方的加好友网页链接，复制最稳）
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* 退回到 execCommand */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  };
  $$('.wx-copy').forEach((btn) => btn.addEventListener('click', async () => {
    const text = btn.dataset.copy || '';
    const isQq = btn.dataset.kind === 'qq';
    const ok = await copyText(text);
    if (ok) toast(isQq ? `QQ 号已复制：${text}，打开 QQ 搜索添加` : `微信号已复制：${text}`);
    else toast(`复制失败，请手动记下：${text}`, 'error');
  }));
  $('#catFab')?.addEventListener('click', () => {
    const open = $('#catDrawer').classList.contains('open');
    if (open) closeCat(); else openCat();
  });
  $('#catClose')?.addEventListener('click', closeCat);
  $('#catForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#catInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendChat(text);
  });
  $$('#catSuggests button').forEach((btn) => btn.addEventListener('click', () => {
    sendChat(btn.textContent.trim());
  }));
}

/* ---------------- 用户协议 / 隐私政策 ---------------- */
function renderLegal(kind) {
  const view = $('#view');
  const wrap = (title, body) => `<div class="crumbs"><a href="#/">圣殿</a><span>/</span><span>${title}</span></div>
    <section class="panel legal"><h1>${title}</h1>
    <p class="dim" style="font-size:12px">最后更新：2026-10-23 · 适用于 step750.icu</p>
    ${body}</section>`;

  if (kind === 'terms') {
    view.innerHTML = wrap('用户协议', `
      <h2>一、服务性质</h2>
      <p>「进步 · Progress」（step750.icu，下称本站）是一个<strong>个人制作的演示项目</strong>，用于展示院校查询与成绩记录的交互方式。本站不提供任何志愿填报咨询、录取预测或代办服务。</p>
      <h2>二、数据免责（重要）</h2>
      <ul>
        <li>本站展示的<strong>分数线、位次、省控线、专业分、单科分全部由算法生成，是虚构的演示数据</strong>，与任何学校的真实录取情况无关。</li>
        <li>院校名称、所在地、办学层次等信息来自公开的教育部高校名录，仅作展示。</li>
        <li><strong>请勿将本站数据用于真实的高考志愿填报、择校决策</strong>。因使用本站数据产生的任何后果，由使用者自行承担。</li>
        <li>真实录取数据请以各省教育考试院、学校招生网公布为准。</li>
        <li><strong>本站由个人维护，能力、时间和信息来源都有限；互联网上的信息本身真假混杂，本站内容也不例外。</strong>请把这里当成众多参考之一，自己多方核对，不要盲信——包括不要盲信站长的判断。</li>
      </ul>
      <h2>三、账号</h2>
      <ul>
        <li>注册需要有效的邮箱地址（用于跨设备保存你的成绩记录）；请勿使用他人邮箱注册。</li>
        <li>邮箱验证码为可选功能：开启时需校验，关闭时可直接注册。</li>
        <li>你需自行保管密码，因密码泄露造成的损失由你自行承担。</li>
        <li>你可以随时要求删除账号与全部数据（见隐私政策）。</li>
      </ul>
      <h2>四、使用规范</h2>
      <ul>
        <li>禁止利用本站进行任何违法活动、批量抓取数据、攻击或干扰服务。</li>
        <li>禁止发布违法、侵权、骚扰性内容（包括与花枝猫的对话内容）。</li>
        <li>本站可对违规账号采取限制或删除措施。</li>
      </ul>
      <h2>五、赞赏</h2>
      <p>本站接受自愿赞赏，用于支持网站的开发与服务器开销。<strong>赞赏不构成任何购买行为，不代表购买数据、服务或任何承诺</strong>，也不影响你使用本站任何功能。</p>
      <h2>六、知识产权</h2>
      <p>本站的页面设计、代码、文案，以及「花枝猫」角色人设（含其性格设定、说话方式、设定文档），均由站长<strong>maoxian1527</strong> 原创并保留权利。未经许可，请勿复制、转载或用于其他项目。院校名称等公开信息不属于上述范围。</p>
      <h2>七、服务变更与终止</h2>
      <p>本站为个人项目，可能随时调整、暂停或关闭，恕不另行通知。本站不对服务的连续性、准确性作任何保证。</p>
      <h2>八、联系方式</h2>
      <p>如对本站有疑问、投诉或数据删除请求，可通过站点邮箱联系站长。</p>
    `);
    return;
  }

  view.innerHTML = wrap('隐私政策', `
    <h2>一、我们收集什么</h2>
    <ul>
      <li><strong>注册信息</strong>：邮箱地址、密码的加盐哈希（PBKDF2-SHA256，不保存明文密码）。</li>
      <li><strong>你主动录入的内容</strong>：考试成绩、科目分数、备注、收藏的院校、与花枝猫的对话记录。</li>
      <li><strong>技术信息</strong>：登录会话 Cookie（HttpOnly，用于保持登录状态）。本站不使用第三方统计或广告脚本。</li>
    </ul>
    <h2>二、用途</h2>
    <ul>
      <li>提供登录、成绩记录、进退步分析、收藏与对话功能。</li>
      <li>在你使用「获取验证码」时，通过第三方邮件服务 Resend 发送验证码邮件。</li>
      <li>与花枝猫对话时，你的消息会发送给模型服务商 DeepSeek 以生成回复。</li>
    </ul>
    <h2>三、存储位置</h2>
    <p>数据存储在 Cloudflare（D1 数据库 / Workers 平台），服务器位于中国大陆境外。如果你对数据出境有顾虑，请勿注册使用。</p>
    <h2>四、保留与删除</h2>
    <ul>
      <li>账号数据保留至你主动删除或本站停止服务。</li>
      <li>你可以随时通过站点邮箱要求删除账号及全部关联数据，我们会在合理时间内处理。</li>
      <li>验证码邮件记录在 10 分钟后失效，并会被定期清理。</li>
    </ul>
    <h2>五、共享</h2>
    <p>除上述邮件服务（Resend）与模型服务（DeepSeek）外，我们不会向任何第三方出售、出租或分享你的个人信息。</p>
    <h2>六、未成年人</h2>
    <p>本站面向高中生群体，未满 14 周岁的用户请在监护人同意后使用，并避免录入与学习无关的个人信息。</p>
    <h2>七、你的权利</h2>
    <p>你有权查阅、更正、删除你的个人信息，也有权注销账号。行使方式：通过站点邮箱联系站长。</p>
  `);
}

/* ---------------- 算法说明 ---------------- */
function renderAlgo() {
  const view = $('#view');
  const ranks = [200, 380, 442, 500, 550, 600, 650, 690].map((s) => {
    const r = rankForClient(s);
    return `<tr><td>${s}</td><td>${r.toLocaleString('zh-CN')}</td></tr>`;
  }).join('');

  view.innerHTML = `<div class="crumbs"><a href="#/">圣殿</a><span>/</span><span>算法说明</span></div>
    <section class="panel legal">
      <h1>分数是怎么算出来的</h1>
      <p class="dim" style="font-size:12px">最后更新：2026-10-24 · 配套代码：<code>lib/synth.mjs</code>、<code>lib/geo.mjs</code></p>

      <div class="disclaimer" style="margin:14px 0">
        一句话：本站的分数线<span>不是查到的</span>，是按公式<span>算出来的</span>。学校名单是真的，分数是假的。
      </div>

      <h2>一、总分（750 分制）</h2>
      <p>代码：<code>scoreFor()</code></p>
      <pre class="algo-code">总分 = 基准分 base
     + 省份偏移  (该省本科线 − 442) × 0.7
     + 文理偏移  综合/师范/财经 +2、艺术/民族 +1、理工/医药 −6、农林 −5
     + 年度漂移  (年份 − 2025) × 4
     + 抖动      ±3（由「校名+省份+年份+科类」算哈希，固定不变）</pre>
      <table class="data-table">
        <thead><tr><th>学校</th><th>base</th><th>省份偏移</th><th>文理</th><th>漂移</th><th>抖动</th><th>总分</th></tr></thead>
        <tbody>
          <tr><td>清华大学（广东·理科）</td><td>688</td><td>+0</td><td>+0</td><td>0</td><td>+0</td><td><b>688</b></td></tr>
          <tr><td>郑州大学（河南·理科）</td><td>598</td><td>−10</td><td>+0</td><td>0</td><td>−2</td><td><b>586</b></td></tr>
          <tr><td>郑州大学（河南·文科）</td><td>598</td><td>−10</td><td>+2</td><td>0</td><td>+0</td><td><b>590</b></td></tr>
          <tr><td>郑州大学（河南·2021）</td><td>598</td><td>−10</td><td>+0</td><td>−16</td><td>+0</td><td><b>572</b></td></tr>
          <tr><td>深圳信息职业（广东·专科）</td><td>445</td><td>+0</td><td>+0</td><td>0</td><td>+1</td><td><b>446</b></td></tr>
        </tbody>
      </table>
      <p class="dim" style="font-size:12px">「基准分」里只有最早 222 所是手工标定的，其余 2,500 多所是按办学层次取区间后哈希得到（985：640–688，211：588–630，普通本科：462–520，专科：360–440）。</p>

      <h2>二、位次（锚点 + 对数插值）</h2>
      <p>代码：<code>rankFor()</code>。21 个锚点覆盖 200–710 分，段内用对数插值，保证单调平滑。</p>
      <table class="data-table" style="max-width:360px">
        <thead><tr><th>分数（广东·物理类）</th><th>对应位次</th></tr></thead>
        <tbody>${ranks}</tbody>
      </table>
      <p class="dim" style="font-size:12px">最后再乘以该省考生数（如河南 136 万）× 文理占比（物理 60% / 历史 40%）。</p>

      <h2>三、单科（150 / 100 分制）</h2>
      <p>代码：<code>singleScoreFor()</code></p>
      <pre class="algo-code">单科分 = 该校总分 ÷ 750 × 该科满分 × 1.02 + 抖动
满分：语文/数学/英语 150，物理/化学/生物/政治/历史/地理 100
线差基准：及格线（150 分制 90，100 分制 60）</pre>
      <p>位次算法：把单科分折回 750 分制（<code>单科 ÷ 满分 × 750</code>），再套上面那条位次曲线。</p>

      <h2>四、省控线</h2>
      <p>代码：<code>lineFor()</code>，每省一张基准表写在 <code>lib/geo.mjs</code>：</p>
      <pre class="algo-code">广东：本科批 442 · 专科批 200
河南：一本 511 · 二本 426 · 专科 200
浙江：本科批 491 · 专科批 268
西藏：本科批 302 · 专科批 200
一本线 = 本科线 + 84（物理）/ +52（历史），再叠 ±3 抖动</pre>

      <h2>五、它能保证什么</h2>
      <ul>
        <li><strong>同一输入永远同一结果</strong>——公式是确定性的，刷新不会跳数字</li>
        <li><strong>排序和位次单调</strong>——不会出现高分低名次</li>
        <li><strong>不落库</strong>——2,740 校 × 31 省 × 5 年 × 2 科类 ≈ 85 万条，全是现算，省掉数据库空间</li>
      </ul>

      <h2>六、它不能保证什么（重要）</h2>
      <ul>
        <li><strong>数值不真实</strong>：base 是估的、省控线是按印象填的，跟考试院公布的数字没有关系</li>
        <li><strong>省份差异被简化</strong>：所有学校共用同一个省份偏移，真实的跨省差异远比这复杂</li>
        <li><strong>年度变化是线性的</strong>：每年固定漂移 4 分，真实分数线会波动甚至跳水</li>
        <li><strong>没有专业级真实差异</strong>：专业分数由学校分数 + 序号偏移生成，不代表真实的专业冷热</li>
      </ul>
      <p><strong>结论：这个页面是为了让你看懂原理，不是为了让你用这些数字填志愿。真实数据请以各省教育考试院、学校招生网为准。</strong></p>

      <h2>七、全部数据都是算法生成的</h2>
      <p>再强调一次：<strong>本站没有接入任何官方录取数据</strong>。2,740 所院校、31 个省级口径、2021—2025 五年、9 个单科，全部由上面几段公式算出来。</p>
      <ul>
        <li><strong>总分</strong>：基准分 + 省份偏移 + 文理偏移 + 年度漂移 + 抖动</li>
        <li><strong>单科</strong>：总分按满分比例折算，再叠抖动</li>
        <li><strong>位次</strong>：锚点表 + 对数插值</li>
        <li><strong>省控线</strong>：每省一张基准表 + 年度漂移</li>
        <li><strong>专业分</strong>：院校分 + 序号偏移</li>
      </ul>
      <p class="dim" style="font-size:12px">同一学校、同一省份、同一年份的分数永远一致（公式是确定性的），所以看起来像真的——但只是像。它不是任何一年的真实投档线，也不代表任何人的录取结果。</p>

      <h2>八、想要更准的数字</h2>
      <p>去官方渠道：<strong>各省教育考试院</strong>（投档线、一分一段表）、<strong>学校招生网</strong>（分专业录取分）、<strong>省考试院志愿填报系统</strong>（当年招生计划）。本站只做交互演示，不替代任何官方信息。</p>
    </section>`;
  window.scrollTo({ top: 0 });
}

// 与后端 rankFor 同口径的离线版本，仅用于渲染锚点表
function rankForClient(score) {
  const anchors = [[200, 0.98], [280, 0.92], [340, 0.85], [380, 0.76], [410, 0.65], [430, 0.52], [442, 0.42], [450, 0.38], [470, 0.3], [490, 0.22], [510, 0.15], [530, 0.1], [550, 0.062], [570, 0.038], [590, 0.022], [610, 0.012], [630, 0.006], [650, 0.0025], [670, 0.001], [690, 0.0003], [710, 0.00008]];
  const total = 780000 * 0.6;
  const s = Math.max(0, Math.min(750, score));
  if (s <= anchors[0][0]) return Math.round(total * 0.55);
  const last = anchors[anchors.length - 1];
  if (s >= last[0]) return Math.round(total * last[1]);
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const [loS, loF] = anchors[i];
    const [hiS, hiF] = anchors[i + 1];
    if (s >= loS && s <= hiS) {
      const t = (s - loS) / (hiS - loS);
      const frac = Math.exp(Math.log(loF) + t * (Math.log(hiF) - Math.log(loF)));
      return Math.round(total * frac);
    }
  }
  return Math.round(total * 0.5);
}

/* ---------------- 路由 ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  return {
    path: pathPart || '/',
    params: new URLSearchParams(queryPart || ''),
    parts: pathPart.split('/').filter(Boolean),
  };
}

function setNav(name) {
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

async function route() {
  const { path, parts } = parseHash();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (path === '/' || path === '') { setNav('query'); await renderHome(); return; }
  if (parts[0] === 'school') { setNav('query'); await renderSchool(parts[1]); return; }
  if (parts[0] === 'exams') { setNav('exams'); await renderExams(); return; }
  if (parts[0] === 'favorites') { setNav('favorites'); await renderFavorites(); return; }
  if (parts[0] === 'me') { setNav(''); await renderMe(); return; }
  if (parts[0] === 'login') { setNav(''); renderLogin(); return; }
  if (parts[0] === 'terms') { setNav(''); renderLegal('terms'); return; }
  if (parts[0] === 'privacy') { setNav(''); renderLegal('privacy'); return; }
  if (parts[0] === 'algorithm') { setNav(''); renderAlgo(); return; }
  setNav('query');
  await renderHome();
}

/* ---------------- 启动 ---------------- */
function persistQuery() {
  store.set('query', { province: state.q.province, subject: state.q.subject, track: state.q.track, year: state.q.year });
}

function motes() {
  const host = $('#motes');
  if (!host) return;
  const spots = [[8, 18], [22, 34], [37, 12], [51, 27], [66, 9], [79, 23], [91, 15], [15, 52], [33, 63], [47, 45], [62, 58], [74, 41], [87, 55], [95, 38], [9, 78], [28, 86], [44, 74], [58, 89], [71, 79], [85, 84]];
  host.innerHTML = spots.map(([x, y], i) => `<span class="mote" style="left:${x}%;top:${y}%;animation-delay:${(i * 0.83).toFixed(2)}s;animation-duration:${(6 + (i % 5) * 1.7).toFixed(1)}s"></span>`).join('');
}

async function loadMeta() {
  try {
    state.meta = await api('/api/meta');
    const saved = store.get('query');
    if (saved && state.meta.provinces.includes(saved.province)) {
      state.q.province = saved.province;
      const subjects = state.meta.singleSubjects || state.meta.subjects || [];
      if (saved.subject && subjects.includes(saved.subject)) state.q.subject = saved.subject;
      if (saved.track && (state.meta.tracks || []).includes(saved.track)) state.q.track = saved.track;
      state.q.year = state.meta.years.includes(saved.year) ? saved.year : state.meta.latestYear;
    } else {
      state.q.year = state.meta.latestYear;
    }
  } catch (err) {
    $('#view').innerHTML = `<div class="panel empty" style="margin-top:30px"><b>连不上圣殿</b>${esc(err.message)}</div>`;
  }
}

async function loadUser() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    if (data.user) {
      const favs = await api(`/api/favorites?${new URLSearchParams({ province: state.q.province, subject: state.q.subject, track: state.q.track, year: state.q.year })}`);
      favoriteIds.clear();
      favs.items.forEach((s) => favoriteIds.add(s.id));
    }
    renderAccount();
  } catch {
    state.user = null;
    renderAccount();
  }
}

(async function boot() {
  motes();
  bindCat();
  bindReward();
  await loadMeta();
  await loadUser();
  await route();
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => {
    const host = $('#schoolChart');
    if (host && host.querySelector('svg') && state.lastSchoolSeries) {
      const series = state.lastSchoolSeries;
      lineChart(host, {
        points: series.map((r) => ({ x: String(r.year), y: state.q.scale === 'single' ? r.single_score : r.total_score })),
        height: 300,
        yLabel: state.q.scale === 'single' ? '单科分' : '总分',
      });
    }
  });
})();
