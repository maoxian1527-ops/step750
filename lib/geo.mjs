// 31 个大陆省级招生单位：考生规模、2025 本科线、专科线、批次设置
// line 为 2025 年本科批（或二本）省控线；offset 由本科线相对广东折算，用于模拟跨省分差。
export const PROVINCES = [
  { name: '北京', candidates: 65000, line: { 物理类: 430, 历史类: 430 }, zhuanke: 120 },
  { name: '天津', candidates: 60000, line: { 物理类: 476, 历史类: 476 }, zhuanke: 160 },
  { name: '河北', candidates: 750000, line: { 物理类: 439, 历史类: 430 }, zhuanke: 200 },
  { name: '山西', candidates: 340000, line: { 物理类: 430, 历史类: 450 }, zhuanke: 130 },
  { name: '内蒙古', candidates: 220000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 160 },
  { name: '辽宁', candidates: 250000, line: { 物理类: 400, 历史类: 420 }, zhuanke: 150 },
  { name: '吉林', candidates: 150000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 150 },
  { name: '黑龙江', candidates: 210000, line: { 物理类: 390, 历史类: 410 }, zhuanke: 160 },
  { name: '上海', candidates: 55000, line: { 物理类: 402, 历史类: 402 }, zhuanke: 100 },
  { name: '江苏', candidates: 480000, line: { 物理类: 462, 历史类: 478 }, zhuanke: 220 },
  { name: '浙江', candidates: 400000, line: { 物理类: 492, 历史类: 490 }, zhuanke: 268 },
  { name: '安徽', candidates: 500000, line: { 物理类: 465, 历史类: 470 }, zhuanke: 200 },
  { name: '福建', candidates: 250000, line: { 物理类: 450, 历史类: 455 }, zhuanke: 220 },
  { name: '江西', candidates: 500000, line: { 物理类: 450, 历史类: 465 }, zhuanke: 200 },
  { name: '山东', candidates: 1000000, line: { 物理类: 445, 历史类: 450 }, zhuanke: 150 },
  { name: '河南', candidates: 1360000, line: { 物理类: 427, 历史类: 445 }, zhuanke: 200 },
  { name: '湖北', candidates: 500000, line: { 物理类: 420, 历史类: 430 }, zhuanke: 200 },
  { name: '湖南', candidates: 680000, line: { 物理类: 430, 历史类: 445 }, zhuanke: 200 },
  { name: '广东', candidates: 780000, line: { 物理类: 442, 历史类: 441 }, zhuanke: 200 },
  { name: '广西', candidates: 450000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 180 },
  { name: '海南', candidates: 70000, line: { 物理类: 470, 历史类: 470 }, zhuanke: 250 },
  { name: '重庆', candidates: 350000, line: { 物理类: 420, 历史类: 435 }, zhuanke: 180 },
  { name: '四川', candidates: 620000, line: { 物理类: 438, 历史类: 455 }, zhuanke: 150 },
  { name: '贵州', candidates: 450000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 180 },
  { name: '云南', candidates: 390000, line: { 物理类: 420, 历史类: 440 }, zhuanke: 200 },
  { name: '西藏', candidates: 30000, line: { 物理类: 300, 历史类: 320 }, zhuanke: 200 },
  { name: '陕西', candidates: 350000, line: { 物理类: 400, 历史类: 420 }, zhuanke: 150 },
  { name: '甘肃', candidates: 250000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 160 },
  { name: '青海', candidates: 50000, line: { 物理类: 330, 历史类: 350 }, zhuanke: 150 },
  { name: '宁夏', candidates: 70000, line: { 物理类: 370, 历史类: 390 }, zhuanke: 150 },
  { name: '新疆', candidates: 220000, line: { 物理类: 380, 历史类: 400 }, zhuanke: 140 },
];

// 仍按一本/二本分批次投档的省份（其余已合并为本科批）
export const SPLIT_PROVINCES = new Set([
  '河南', '四川', '山西', '陕西', '甘肃', '青海', '宁夏', '新疆', '内蒙古', '广西', '贵州', '云南',
]);

export const BATCHES = ['本科批', '本科一批', '本科二批', '专科批'];
export const YEARS = [2021, 2022, 2023, 2024, 2025];
export const LATEST_YEAR = 2025;

export const PROVINCE_MAP = Object.fromEntries(PROVINCES.map((p) => [p.name, p]));

// 跨省分差：以广东（442）为基准折算
export const provinceOffset = (province) => {
  const p = PROVINCE_MAP[province];
  if (!p) return 0;
  return Math.round((p.line['物理类'] - 442) * 0.7);
};

export const batchProfile = (province) =>
  SPLIT_PROVINCES.has(province) ? ['本科一批', '本科二批', '专科批'] : ['本科批', '专科批'];

export const batchFor = (school, province) => {
  if (school.level === '专科') return '专科批';
  if (!SPLIT_PROVINCES.has(province)) return '本科批';
  return ['985', '211', '双一流', '省重点'].includes(school.tier) ? '本科一批' : '本科二批';
};
