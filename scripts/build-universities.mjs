// 把抓到的教育部名单（data/universities-raw.json）转成站点用的 data/schools.json
// 规则：真实校名/省份/城市/层次来自名单；层次标签(985/211/双一流)靠名单匹配；
//       基准分优先用我们手工标定的 222 所，其余按层次 + 校名哈希生成。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHOOLS as CURATED } from '../lib/data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RAW = path.join(ROOT, 'data', 'universities-raw.json');
const OUT = path.join(ROOT, 'data', 'schools.json');

const rawJson = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const raw = Array.isArray(rawJson) ? rawJson : (rawJson.data || Object.values(rawJson)[0]);

const PROVINCE_FIX = [
  ['北京市', '北京'], ['天津市', '天津'], ['上海市', '上海'], ['重庆市', '重庆'],
  ['河北省', '河北'], ['山西省', '山西'], ['内蒙古自治区', '内蒙古'], ['辽宁省', '辽宁'],
  ['吉林省', '吉林'], ['黑龙江省', '黑龙江'], ['江苏省', '江苏'], ['浙江省', '浙江'],
  ['安徽省', '安徽'], ['福建省', '福建'], ['江西省', '江西'], ['山东省', '山东'],
  ['河南省', '河南'], ['湖北省', '湖北'], ['湖南省', '湖南'], ['广东省', '广东'],
  ['广西壮族自治区', '广西'], ['海南省', '海南'], ['四川省', '四川'], ['贵州省', '贵州'],
  ['云南省', '云南'], ['西藏自治区', '西藏'], ['陕西省', '陕西'], ['甘肃省', '甘肃'],
  ['青海省', '青海'], ['宁夏回族自治区', '宁夏'], ['新疆维吾尔自治区', '新疆'],
];
const normProvince = (label) => {
  const clean = String(label).replace(/（.*?）|\(.*?\)/g, '').trim();
  const hit = PROVINCE_FIX.find(([cn]) => clean === cn || clean.startsWith(cn));
  return hit ? hit[1] : clean;
};
const normCity = (loc) => String(loc || '').replace(/市$/, '').replace(/地区$/, '').trim() || '';

const TIER_985 = new Set(['清华大学', '北京大学', '复旦大学', '上海交通大学', '浙江大学', '南京大学', '中国科学技术大学', '中国人民大学', '北京航空航天大学', '同济大学', '武汉大学', '华中科技大学', '西安交通大学', '哈尔滨工业大学', '中山大学', '厦门大学', '电子科技大学', '四川大学', '山东大学', '中南大学', '湖南大学', '重庆大学', '吉林大学', '中国海洋大学', '兰州大学', '西北农林科技大学', '天津大学', '南开大学', '北京理工大学', '北京师范大学', '中国农业大学', '华东师范大学', '华南理工大学', '大连理工大学', '东北大学', '西北工业大学', '中央民族大学', '国防科技大学', '中国人民解放军国防科技大学']);

const TIER_211 = new Set([
  '北京邮电大学', '上海财经大学', '中央财经大学', '对外经济贸易大学', '中国政法大学', '西安电子科技大学',
  '北京交通大学', '南京航空航天大学', '南京理工大学', '北京科技大学', '中国传媒大学', '华东理工大学',
  '苏州大学', '暨南大学', '上海大学', '华南师范大学', '西南财经大学', '郑州大学', '武汉理工大学', '合肥工业大学',
  '上海外国语大学', '东华大学', '江南大学', '河海大学', '中国矿业大学', '中国石油大学（华东）', '中国地质大学（武汉）',
  '北京工业大学', '北京化工大学', '北京林业大学', '北京中医药大学', '中国药科大学', '天津医科大学', '河北工业大学',
  '太原理工大学', '内蒙古大学', '辽宁大学', '大连海事大学', '延边大学', '哈尔滨工程大学', '东北林业大学', '东北农业大学',
  '南京师范大学', '安徽大学', '福州大学', '南昌大学', '华中师范大学', '华中农业大学', '中南财经政法大学', '湖南师范大学',
  '华南农业大学', '海南大学', '广西大学', '西南大学', '西南交通大学', '四川农业大学', '云南大学', '贵州大学', '西藏大学',
  '西北大学', '长安大学', '陕西师范大学', '青海大学', '宁夏大学', '新疆大学', '石河子大学', '中国矿业大学（北京）',
  '中国石油大学（北京）', '中国地质大学（北京）', '华北电力大学', '中央音乐学院', '北京体育大学', '第二军医大学',
  '第四军医大学', '海军军医大学', '空军军医大学',
]);

const TIER_SY = new Set([
  '中国科学院大学', '上海科技大学', '南方科技大学', '宁波大学', '南京信息工程大学', '河南大学', '湘潭大学', '成都理工大学',
  '首都师范大学', '首都医科大学', '天津工业大学', '山西大学', '上海海洋大学', '上海中医药大学', '南京邮电大学',
  '南京林业大学', '南京中医药大学', '广州中医药大学', '广州医科大学', '南方医科大学', '成都中医药大学', '西南石油大学',
  '昆明理工大学', '西安建筑科技大学', '华南农业大学', '南京医科大学', '上海体育学院', '天津中医药大学', '成都体育学院',
]);

const CATEGORY_RULES = [
  ['医药', /医科|医学|中医|药科|药学|护理|卫生|口腔|眼科|肿瘤/],
  ['师范', /师范|教育/],
  ['财经', /财经|经济|金融|商学|工商|贸易|审计|税务|会计/],
  ['政法', /政法|警察|公安|司法|警官|政法|检察/],
  ['农林', /农业|农林|林业|农学|畜牧|兽医|水产|园艺|茶/],
  ['语言', /外国语|外语|语言/],
  ['艺术', /艺术|美术|音乐|戏剧|电影|舞蹈|传媒|工艺美/],
  ['体育', /体育/],
  ['民族', /民族/],
  ['理工', /工业|理工|科技|工程|交通|航空|航天|海事|海运|建筑|电子|信息|邮电|矿业|石油|地质|化工|电力|能源|水利|冶金|纺织|机械|汽车|船舶|铁道|铁路|轻工|食品|环境|测绘|计量|印刷|包装/],
];

const inferCategory = (name) => {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(name)) return cat;
  return '综合';
};

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const CURATED_MAP = new Map(CURATED.map((s) => [s.name, s]));
const seen = new Set();
const schools = [];

for (const group of raw) {
  const province = normProvince(group.city);
  for (const item of group.list || []) {
    const name = String(item.school_name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const level = item.level === '专科' ? '专科' : '本科';
    const curated = CURATED_MAP.get(name);
    let tier = curated?.tier;
    if (!tier) {
      if (level === '专科') tier = '普通';
      else if (TIER_985.has(name)) tier = '985';
      else if (TIER_211.has(name)) tier = '211';
      else if (TIER_SY.has(name)) tier = '双一流';
      else tier = '普通';
    }
    const base = curated?.base ?? (() => {
      const r = hash(name) % 1000;
      if (level === '专科') return 360 + (r % 80);
      if (tier === '985') return 640 + (r % 48);
      if (tier === '211') return 588 + (r % 42);
      if (tier === '双一流') return 552 + (r % 38);
      return 462 + (r % 58);
    })();
    const note = curated?.note
      || `${province}${normCity(item.location) ? ` · ${normCity(item.location)}` : ''}｜${item.management || ''}${item.remark ? `｜${item.remark}` : ''}`;
    schools.push({
      name,
      province,
      city: normCity(item.location) || province,
      level,
      tier,
      category: curated?.category || inferCategory(name),
      base,
      note,
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify(schools), 'utf8');
const byLevel = schools.reduce((a, s) => ({ ...a, [s.level]: (a[s.level] || 0) + 1 }), {});
const byTier = schools.reduce((a, s) => ({ ...a, [s.tier]: (a[s.tier] || 0) + 1 }), {});
const provinces = new Set(schools.map((s) => s.province));
const curatedHit = schools.filter((s) => CURATED_MAP.has(s.name)).length;
console.log(`写入 ${path.relative(process.cwd(), OUT)}`);
console.log(`  学校 ${schools.length} 所（本科 ${byLevel['本科'] || 0} / 专科 ${byLevel['专科'] || 0}）`);
console.log(`  层次：${JSON.stringify(byTier)}`);
console.log(`  省份 ${provinces.size} 个｜命中手工标定 ${curatedHit} 所`);
console.log(`  文件 ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
