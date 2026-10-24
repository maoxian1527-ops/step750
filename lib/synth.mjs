// 分数/位次/省控线/专业分的确定性生成器：同一输入永远得到同一结果。
// 这样 2,740 所学校 × 31 省 × 5 年 × 2 科类的「分数线」可以实时算出，不必存 85 万行。
import { PROVINCE_MAP, provinceOffset, batchFor, LATEST_YEAR } from './geo.mjs';

const SUBJECT_OFFSET = {
  综合: 2, 师范: 2, 财经: 2, 政法: 2, 语言: 2, 艺术: 1, 民族: 1, 体育: 0,
  理工: -6, 医药: -6, 农林: -5,
};
const BENKE1_GAP = { 物理类: 84, 历史类: 52 };

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rnd = (seed) => ((hash(seed) % 10000) / 10000);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const RANK_ANCHORS = {
  物理类: [
    [200, 0.98], [280, 0.92], [340, 0.85], [380, 0.76], [410, 0.65], [430, 0.52],
    [442, 0.42], [450, 0.38], [470, 0.3], [490, 0.22], [510, 0.15], [530, 0.1],
    [550, 0.062], [570, 0.038], [590, 0.022], [610, 0.012], [630, 0.006],
    [650, 0.0025], [670, 0.001], [690, 0.0003], [710, 0.00008],
  ],
  历史类: [
    [200, 0.98], [280, 0.93], [340, 0.86], [380, 0.78], [410, 0.66], [430, 0.55],
    [441, 0.46], [450, 0.43], [470, 0.36], [490, 0.28], [510, 0.21], [530, 0.15],
    [550, 0.1], [570, 0.064], [590, 0.038], [610, 0.021], [630, 0.011],
    [650, 0.005], [670, 0.002], [690, 0.0006], [710, 0.00015],
  ],
};
const SUBJECT_SHARE = { 物理类: 0.6, 历史类: 0.4 };

// 单科口径：没有官方单科线，用「满分 + 及格线」折算，位次按等效总分换算
export const SINGLE_SUBJECTS = {
  语文: 150, 数学: 150, 英语: 150,
  物理: 100, 化学: 100, 生物: 100,
  政治: 100, 历史: 100, 地理: 100,
};
export const isSingleSubject = (subject) => Object.prototype.hasOwnProperty.call(SINGLE_SUBJECTS, subject);
const trackOf = (track) => (track === '文科' ? '历史类' : '物理类');

function singleScoreFor(school, province, subject, year, track) {
  const full = SINGLE_SUBJECTS[subject];
  // 该科得分率 ≈ 学校在对应文理口径下的整体分数比例，再叠加稳定抖动
  const total = scoreFor(school, province, trackOf(track), year);
  const ratio = total / 750;
  const jitter = (rnd(`single|${school.name}|${province}|${year}|${subject}|${track}`) - 0.5) * 0.05;
  const trackAdj = track === '文科' ? -0.015 : 0;
  const score = clamp(Math.round(full * (ratio * 1.02 + jitter + trackAdj)), Math.round(full * 0.3), full);
  return { score, full, line: Math.round(full * 0.6) };
}

// 老高考省份用「理科/文科」，位次与省控线按物理/历史口径折算
const normSubject = (subject) => (subject === '理科' ? '物理类' : subject === '文科' ? '历史类' : subject);

export function rankFor(score, province, subject) {
  const prov = PROVINCE_MAP[province] || PROVINCE_MAP['广东'];
  const base = normSubject(subject);
  const anchors = RANK_ANCHORS[base] || RANK_ANCHORS['物理类'];
  const total = prov.candidates * (SUBJECT_SHARE[base] || 0.6);
  const s = clamp(Number(score) || 0, 0, 750);
  if (s <= anchors[0][0]) return Math.max(1, Math.round(total * 0.55));
  const last = anchors[anchors.length - 1];
  if (s >= last[0]) return Math.max(1, Math.round(total * last[1]));
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const [loScore, loFrac] = anchors[i];
    const [hiScore, hiFrac] = anchors[i + 1];
    if (s >= loScore && s <= hiScore) {
      const t = (s - loScore) / (hiScore - loScore);
      const frac = Math.exp(Math.log(loFrac) + t * (Math.log(hiFrac) - Math.log(loFrac)));
      return Math.max(1, Math.round(total * frac));
    }
  }
  return Math.max(1, Math.round(total * 0.5));
}

// 省控线（按批次）
export function lineFor(province, subject, year, batch) {
  const prov = PROVINCE_MAP[province];
  if (!prov) return 400;
  const base = prov.line[subject] ?? prov.line[normSubject(subject)] ?? 440;
  const drift = Math.round((year - LATEST_YEAR) * 2.4);
  if (batch === '专科批') return prov.zhuanke;
  if (batch === '本科一批') return clamp(base + drift + BENKE1_GAP[normSubject(subject)] + Math.round(rnd(`line1|${province}|${subject}|${year}`) * 6 - 3), 430, 620);
  if (batch === '本科二批') return clamp(base + drift + Math.round(rnd(`line2|${province}|${subject}|${year}`) * 4 - 2), 300, 560);
  return clamp(base + drift + Math.round(rnd(`line|${province}|${subject}|${year}`) * 4 - 2), 280, 560);
}

// 某校在某省某年某科类的最低分
export function scoreFor(school, province, subject, year) {
  const offset = provinceOffset(province);
  const subj = normSubject(subject) === '物理类' ? 0 : (SUBJECT_OFFSET[school.category] ?? 0);
  const drift = (year - LATEST_YEAR) * 4;
  const jitter = rnd(`score|${school.name}|${province}|${year}|${subject}`) * 6 - 3;
  let score = school.base + offset + subj + drift + jitter;
  if (school.level === '专科') score = Math.min(score, 480);
  return clamp(Math.round(score), 120, 740);
}

export function avgFor(school, province, subject, year, minScore) {
  const add = 4 + Math.round(rnd(`avg|${school.name}|${province}|${year}|${subject}`) * 8);
  return clamp(minScore + add, minScore, 745);
}

export function planFor(school, province, year) {
  const base = school.level === '专科' ? 60 : 40;
  return Math.max(4, Math.round(base + rnd(`plan|${school.name}|${province}|${year}`) * (school.level === '专科' ? 90 : 60)));
}

export function schoolRow(school, province, subject, year, track = '理科') {
  const batch = batchFor(school, province);

  if (isSingleSubject(subject)) {
    const { score, full, line } = singleScoreFor(school, province, subject, year, track);
    const equivTotal = Math.round((score / full) * 750);
    return {
      min_score: score,
      avg_score: Math.min(full, score + 3),
      min_rank: rankFor(equivTotal, province, trackOf(track)),
      plan_count: planFor(school, province, year),
      control_line: line,
      lineDiff: score - line,
      batch,
      track,
      scale: { kind: 'single', full, line },
    };
  }

  const minScore = scoreFor(school, province, subject, year);
  const line = lineFor(province, subject, year, batch);
  return {
    min_score: minScore,
    avg_score: avgFor(school, province, subject, year, minScore),
    min_rank: rankFor(minScore, province, subject),
    plan_count: planFor(school, province, year),
    control_line: line,
    lineDiff: minScore - line,
    batch,
    track,
    scale: { kind: 'total', full: 750, line },
  };
}

// 同时给出总分口径与单科口径
export function bothFor(school, province, subject, year, track = '理科') {
  const trackKey = track === '文科' ? '历史类' : '物理类';
  const total = schoolRow(school, province, trackKey, year, track);
  const single = schoolRow(school, province, subject, year, track);
  return {
    batch: total.batch,
    total_score: total.min_score,
    total_rank: total.min_rank,
    total_line: total.control_line,
    total_diff: total.lineDiff,
    single_score: single.min_score,
    single_full: SINGLE_SUBJECTS[subject] || 100,
    single_rank: single.min_rank,
    single_line: single.control_line,
    single_diff: single.lineDiff,
  };
}

/* ---------- 专业 ---------- */
const MAJORS = {
  综合: { 物理类: ['计算机科学与技术', '电子信息工程', '数学与应用数学', '临床医学', '经济学', '法学'], 历史类: ['汉语言文学', '法学', '新闻学', '经济学', '英语', '历史学'] },
  理工: { 物理类: ['计算机科学与技术', '人工智能', '电子信息工程', '自动化', '机械设计制造及其自动化', '软件工程'], 历史类: ['英语', '工商管理', '法学', '国际经济与贸易', '日语', '新闻学'] },
  师范: { 物理类: ['数学与应用数学（师范）', '计算机科学与技术（师范）', '物理学（师范）', '化学（师范）', '地理科学（师范）', '教育技术学'], 历史类: ['汉语言文学（师范）', '英语（师范）', '历史学（师范）', '教育学', '心理学（师范）', '思想政治教育（师范）'] },
  财经: { 物理类: ['金融学', '会计学', '经济学', '统计学', '金融工程', '财务管理'], 历史类: ['金融学', '会计学', '国际经济与贸易', '财政学', '市场营销', '审计学'] },
  政法: { 物理类: ['法学', '侦查学', '刑事科学技术', '行政管理', '金融学', '社会学'], 历史类: ['法学', '政治学与行政学', '社会工作', '新闻学', '英语', '行政管理'] },
  医药: { 物理类: ['临床医学', '口腔医学', '药学', '预防医学', '医学影像学', '护理学'], 历史类: ['护理学', '公共事业管理', '英语', '应用心理学', '市场营销', '健康服务与管理'] },
  农林: { 物理类: ['农学', '园林', '动物医学', '食品科学与工程', '生物技术', '水利水电工程'], 历史类: ['农村区域发展', '农林经济管理', '英语', '社会学', '旅游管理', '法学'] },
  语言: { 物理类: ['英语', '翻译', '计算机科学与技术', '国际经济与贸易', '汉语国际教育', '日语'], 历史类: ['英语', '翻译', '汉语国际教育', '日语', '西班牙语', '新闻学'] },
  艺术: { 物理类: ['数字媒体技术', '广播电视工程', '计算机科学与技术', '网络与新媒体', '广告学', '电子信息工程'], 历史类: ['播音与主持艺术', '广播电视编导', '动画', '视觉传达设计', '网络与新媒体', '戏剧影视文学'] },
  民族: { 物理类: ['计算机科学与技术', '电子信息工程', '数学与应用数学', '化学', '生物科学', '经济学'], 历史类: ['民族学', '汉语言文学', '历史学', '法学', '英语', '社会学'] },
  体育: { 物理类: ['体育教育', '运动人体科学', '康复治疗学', '运动康复', '社会体育指导与管理', '计算机科学与技术'], 历史类: ['体育教育', '社会体育指导与管理', '新闻学', '英语', '旅游管理', '市场营销'] },
};
const MAJORS_VOCATIONAL = {
  综合: ['大数据与会计', '电子商务', '旅游管理', '护理', '学前教育', '现代物流管理'],
  理工: ['电子信息工程技术', '计算机应用技术', '机电一体化技术', '汽车检测与维修技术', '建筑工程技术', '数字媒体技术'],
  师范: ['学前教育', '小学教育', '音乐教育', '美术教育', '体育教育', '现代教育技术'],
  财经: ['大数据与会计', '金融服务与管理', '市场营销', '电子商务', '现代物流管理', '商务英语'],
  政法: ['法律事务', '行政管理', '社会工作', '社区管理与服务', '司法助理', '法律文秘'],
  医药: ['护理', '药学', '医学检验技术', '康复治疗技术', '口腔医学技术', '助产'],
  农林: ['现代农业技术', '园林技术', '畜牧兽医', '食品检验检测技术', '园艺技术', '水利工程'],
  语言: ['商务英语', '应用英语', '应用日语', '旅游英语', '国际经济与贸易', '跨境电子商务'],
  艺术: ['视觉传达设计', '数字媒体艺术设计', '环境艺术设计', '广告艺术设计', '动漫设计', '音乐表演'],
  民族: ['旅游管理', '电子商务', '大数据与会计', '学前教育', '护理', '民族传统技艺'],
  体育: ['体育教育', '运动训练', '社会体育', '康复治疗技术', '体育运营与管理', '健身指导与管理'],
};

export function majorsFor(school, province, subject, year, track = '理科') {
  const trackKey = track === '文科' ? '历史类' : '物理类';
  const list = school.level === '专科'
    ? (MAJORS_VOCATIONAL[school.category] || MAJORS_VOCATIONAL['综合'])
    : ((MAJORS[school.category] || MAJORS['综合'])[trackKey] || MAJORS['综合']['物理类']);
  const base = schoolRow(school, province, subject, year, track).min_score;
  return list.map((major, idx) => {
    const score = clamp(base + Math.round(idx * 2 + rnd(`major|${school.name}|${province}|${subject}|${major}`) * 8), 120, 745);
    return {
      major,
      batch: batchFor(school, province),
      min_score: score,
      min_rank: rankFor(score, province, subject),
      plan_count: Math.max(2, Math.round(3 + rnd(`mplan|${school.name}|${major}`) * 18)),
    };
  }).sort((a, b) => b.min_score - a.min_score);
}

export { LATEST_YEAR };
