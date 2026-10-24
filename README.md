# 进步 · Progress — step750.icu

按学校查录取分数线，记录每一次考试的**进步与退步**，还有一只叫**花枝猫**的猫陪学生复盘。
动态站点：**Cloudflare Workers + D1（SQLite）+ Workers Assets**，零第三方运行时依赖；邮箱注册/登录。

> 视觉：无尽天堂 / 圣殿（光柱、拱门、金箔、云海）。设计源文件在 `preview/index.html`（纯静态预览，保留作风格参考）。

**已上线**：https://step750.icu （www 同步可用，Cloudflare 自动签证书）
Worker `jinbu` + D1 `jinbu-db`，zone `dcda7cc731dbb7d04d5e56cd820f564e`（Active，NS `jobs.ns.cloudflare.com` / `piper.ns.cloudflare.com`）。
国内直连 `*.workers.dev` 通常被墙，自定义域名可以正常访问。

## 一、现在能做什么

| 功能 | 说明 |
|---|---|
| 分数线查询 | **2,740 所院校**（教育部全国普通高校名单：本科 1,272 / 专科 1,468）× **31 个省级招生单位** × 2021—2025 × 物理类/历史类，约 **84.9 万条**分数线（运行时计算）；支持关键词、层次、办学层次、批次筛选与分页（137 页） |
| 院校详情 | 五年最低分走势、历年最低分/平均分/位次/计划数/省控线/线差、当年专业分数线（专业分约 102 万条，同样实时生成） |
| 分数定位 | 输入分数 → 冲（+1~15）/ 稳（±12）/ 保（−13~35）三档院校，按批次匹配 |
| 我的考试 | 邮箱登录后录入每次考试与各科分数（**语文/数学/英语/政治/地理/化学/生物**，满分自动匹配），自动算总分、较上次进退、历史最高、净变化、各科进退与总分曲线 |
| 收藏 | 收藏院校，按当前省份/科类看最低分 |
| 花枝猫 | 人设由站长「maoxian1527」原创（`persona/huazhimao.md`，部署于 NekroAgent）；配置模型密钥即接 `deepseek-flash`，未配置时用「本地话术引擎」 |
| 账号 | 邮箱 + 密码注册登录（PBKDF2-SHA256 加盐哈希），**注册需邮箱验证码**（Resend 发信：10 分钟有效、60 秒重发间隔、5 次试错上限）；HttpOnly Cookie 会话 30 天，登录失败限流 |

## 二、目录结构

```
school-score-site/
├─ worker/
│  ├─ index.js            Worker API（认证、检索、考试、收藏、聊天）
│  └─ persona.js          花枝猫系统提示词（网站版）
├─ public/                静态站点（由 Workers Assets 提供）
│  ├─ index.html  app.css  app.js
│  └─ img/                立绘、头像、favicon
├─ migrations/0001_init.sql   D1 表结构
├─ scripts/build-universities.mjs  教育部名单 → data/schools.mjs（2,740 所）
├─ scripts/build-seed.mjs          生成 seed/seed.sql（只灌学校表，336 KB）
├─ data/schools.mjs                2,740 所院校（自动生成）
├─ data/universities-raw.json      教育部原始名单（31 组）
├─ lib/geo.mjs                     31 省考生规模/本科线/专科线/批次规则
├─ lib/synth.mjs                   分数线/位次/省控线/专业分的确定性生成器
├─ persona/huazhimao.md            花枝猫人设原文（maoxian1527 原创）+ 网站版取舍
├─ wrangler.toml                   Workers / D1 / Assets 配置
└─ preview/index.html              最初的静态视觉预览
```

## 三、本地跑起来

前置：Node 18+（本项目在 Node 24 上验证）。

```bash
npm install                 # 安装 wrangler（devDependency）
npm run seed                # 生成 seed/seed.sql
npm run db:migrate          # 本地 D1 建表
npm run db:seed             # 灌入演示数据
npm run dev                 # http://127.0.0.1:8787
```

本地数据落在 `.wrangler/state/v3/d1`，删掉这个目录即可重来（再跑 migrate + seed）。

> 注：若在受限沙箱里执行，`wrangler` 需要启动 `workerd` 子进程与临时目录，可能被拒；在普通终端执行即可。

## 四、部署到 Cloudflare

已部署完成，日常改完代码重新发布只需要：

```bash
set NODE_OPTIONS=--dns-result-order=ipv4first   # 本机 DNS 走 IPv6 时否则会 fetch failed
node scripts/deploy.mjs                         # 建库→建表→灌种子→deploy，幂等
node scripts/deploy.mjs --bind-domain           # 自定义域名生效后，启用 routes 再发布
```

首次从零部署（换个 Cloudflare 账号时）也可以直接用这个脚本，它会：检查登录 → 找不到 `jinbu-db` 就创建 → 把 database_id 写回 `wrangler.toml` → `d1 migrations apply --remote` → 灌 `seed/seed.sql` → `deploy`。

手动命令等价于：

```bash
npx wrangler login
npx wrangler d1 create jinbu-db
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file=seed/seed.sql
npx wrangler deploy
npx wrangler secret put MODEL_API_KEY               # 可选：接真模型
```

免费额度足够小站：Workers 10 万请求/天、D1 5 GB 存储 / 500 万行读取/天、Assets 免费。

### 绑定 step750.icu（已完成）

域名 2026-10-23 在阿里云注册，Cloudflare 站点已添加并 **Active**：

```
Cloudflare NS：jobs.ns.cloudflare.com  /  piper.ns.cloudflare.com
阿里云 NS：     已改为上述两个（原 dns21/dns22.hichina.com 已替换）
绑定结果：     step750.icu ✅ / www.step750.icu ✅（HTTPS 200，证书正常）
```

日常发布（改完代码后）：

```bash
set NODE_OPTIONS=--dns-result-order=ipv4first
node scripts/deploy.mjs
```

`wrangler.toml` 里的 `routes` 已启用，每次 deploy 会同时更新 workers.dev 与自定义域名。

## 五、域名 step750.icu（已购买，等实名审核）

- 2026-10-23 在**阿里云**注册，注册局 RDAP 已能查到记录。
- 含义：`step` = 进步一步，`750` = 高考总分 750。
- 审核期间域名暂时不能解析；可以先在 Cloudflare 加站点拿 NS，等阿里云实名通过再改 NS。
- 以后若想换到 Cloudflare Registrar 续费更便宜：`.icu` 注册满 60 天可从阿里云转出（拿转移码）。
- **托管在 Cloudflare 不需要 ICP 备案**（备案只针对中国大陆境内的服务器）；若以后把服务器搬回国内，要先确认 `.icu` 是否在工信部可备案后缀名单里。

### 在阿里云购买的注意点

1. **账号实名**和**域名信息模板实名**是两个独立环节，都要过；未实名域名会被 serverHold；
2. 改 NS 后阿里云云解析失效是正常的，DNS 全权交给 Cloudflare；
3. 开**自动续费**，避免过期下线；
4. 若购买页有「隐私保护」，勾上（WHOIS 信息脱敏）。

## 六、花枝猫与模型

- 人设：**「花枝猫」由站长 maoxian1527 原创**（部署在 NekroAgent 实例的 `presets` 表 `id=1`），原文见 `persona/huazhimao.md`；网站版保留人格核心，去掉 QQ 专用指令。
- 接真模型（OpenAI 兼容接口）：

```bash
npx wrangler secret put MODEL_API_KEY     # 你的密钥
# wrangler.toml 的 [vars] 里可改：
#   MODEL_BASE_URL = "https://api.deepseek.com/v1"
#   MODEL_NAME     = "deepseek-v4-flash"
```

- 未配置密钥时，聊天走本地话术引擎：会读该用户的成绩（最近总分、各科进退、净变化）与收藏，给出带真实数字的回复；界面会标注「本地话术引擎」。

## 七、数据说明与下一步

- 学校名单：`data/schools.mjs`，来自教育部全国普通高等学校名单（2,740 所，31 个省级单位）。
- **所有分数线都是算法生成的演示数据**：`lib/synth.mjs` 用「基准分 + 省份偏移 + 文理偏移 + 年度漂移 + 稳定抖动」算出全部数值，随 Worker 内联，不查库、不依赖任何第三方数据集。
  - 覆盖：2,740 所院校 / 31 个省级口径 / 2021—2025 五年 / 9 个单科。
  - 同一输入永远同一结果；页面与「算法说明」页都标注了它是演示数据，**不可用于志愿填报**。
  - 单科分为折算值（`总分 ÷ 750 × 满分 × 1.02`）。
- ⚠️ D1 免费版每天 10 万行写入，批量灌数据容易触顶（UTC 午夜重置）。
- 下一步：如需接入真实数据，把 `admission_scores` 表按 `(school_id, province, year, subject, batch)` 覆盖，并把读取顺序改成「先查库、查不到再算」。

## 八、合规与数据处理原则

这个项目是个人做的演示站，下面是明确写下来的边界，避免以后说不清。

### 数据

- 站内**所有分数线、位次、省控线、专业分、单科分均由算法生成**（`lib/synth.mjs`），不依赖任何第三方数据集，不代表任何官方录取结果。
- **不抓取、不绕过任何网站的反爬/验证机制**。公开信息只通过人工下载或官方公开接口获取。
- 第三方数据（如社区整理的高考数据集）**只有在获得作者书面授权后才接入**，且必须：标注来源、标注「二次整理」、标注「仅供参考」、不再分发原始文件。
- 当前授权状态：2026-10-24 已向 `lghui12138/gaokao-zhiyuan` 作者提交授权申请；**在获得回复前不接入其数据**。严格子集管道（`scripts/build-strict-subset.py`）已就绪，覆盖率见 `data/review/COVERAGE.md`。

### 明确不做的四件事

1. **不代填志愿**、不做付费咨询
2. **不承诺录取/保过/保线**
3. **不售卖数据或「内部渠道」信息**
4. **不收集身份证、准考证号、家庭住址等敏感信息**（账号只要邮箱）

### 赞赏

- 赞赏是**自愿支持网站开发**，与数据准确性、服务内容、任何承诺无关，不影响任何功能使用。
- 不构成购买行为，不提供对价服务。

### AI 对话

- 站内花枝猫只做陪伴与复盘，**不替学生做志愿决策、不预测录取**（见 `worker/persona.js` 的边界规则）。
- 学生提到极端情绪时会引导寻求现实中的帮助，不做诊断。

## 九、安全说明

- 密码：PBKDF2-SHA256，16 字节随机盐，**30,000 次迭代**。这个数字是为了压在 Workers 免费计划 10ms CPU 限制内；升级到付费计划后可把 `worker/index.js` 里的 `PBKDF2_ITERATIONS` 提到 100,000 以上。
- 会话：随机 32 字节 token，库里只存 SHA-256 哈希，HttpOnly + SameSite=Lax Cookie，30 天过期，登出即删。
- 写接口要求同源 JSON 请求；登录失败按邮箱限流（10 分钟 8 次）。
- 演示站点，请勿使用你在别处的重要密码。
