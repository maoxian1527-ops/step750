"""方案 B 的严格子集管道（暂不接入，等作者授权后跑）

四道闸：
① 剔除 conflicts_2025.csv 里标记过冲突的 record_id
② 剔除 quality_flags 非空的记录
③ 必须有公开位次（min_rank_start）
④ 必须有原始来源链接（source_url）
⑤ 科类必须与省份制度匹配（3+3 省只认综合；新疆/西藏认理科文科；其余认物理类/历史类）
另外保留原先的：排除专项/预科/中外合作/校区、本科校排除专科批、校名精确匹配 + 更名别名
"""
import csv
import io
import json
import re
import zipfile
from collections import defaultdict

ZIP = r"C:\Users\maoxian\Downloads\全国高校_2025录取数据与2027条件参考_CSV.zip"
SCHOOLS = r"C:\Users\maoxian\Documents\Codex\2026-08-25\wo\nekogen-site\deepseek\school-score-site\data\schools.json"
OUT = r"C:\Users\maoxian\Documents\Codex\2026-08-25\wo\nekogen-site\deepseek\school-score-site\data\review\strict-subset.json"

PRIORITY = {"institution-admission": 4, "school-admission-summary": 3, "major-group-admission": 2,
            "major-admission": 1, "vocational-admission": 1}
BAD_TYPE = re.compile(r"中外合作|较高收费|专项|预科|民族班|定向|艺术|体育|强基|免费|飞行员|强军|国防|公安|消防救援")
BAD_SUBTYPE = re.compile(r"高校专项|地方专项|国家专项|中外合作|预科|民族班|定向")
BAD_NAME = re.compile(r"校区|分校|合作办学")
PAREN = re.compile(r"[（(][^）)]*[）)]")
SPACE = re.compile(r"\s+")

THREE_PLUS_THREE = {"北京", "天津", "上海", "浙江", "山东", "海南"}
OLD_SYSTEM = {"新疆", "西藏"}

ALIAS_PAIRS = [("职业技术大学", "职业技术学院"), ("职业大学", "职业学院"),
               ("师范大学", "师范学院"), ("医科大学", "医学院"), ("中医药大学", "中医学院")]


def norm(name: str) -> str:
    s = SPACE.sub("", name or "")
    prev = None
    while prev != s:
        prev = s
        s = PAREN.sub("", s)
    return s.replace("分校", "").replace("校区", "")


def variants(n: str):
    out = [n]
    for a, b in ALIAS_PAIRS:
        if n.endswith(a):
            out.append(n[: -len(a)] + b)
        if n.endswith(b):
            out.append(n[: -len(b)] + a)
    return out


schools = json.load(open(SCHOOLS, encoding="utf-8"))
by_norm = {}
for idx, s in enumerate(schools):
    by_norm.setdefault(norm(s["name"]), idx)
level_of = {idx: s["level"] for idx, s in enumerate(schools)}


def match_idx(name_raw: str):
    for v in variants(norm(name_raw)):
        if v in by_norm:
            return by_norm[v]
    return None


def subject_ok(province: str, subject: str) -> bool:
    if province in THREE_PLUS_THREE:
        return subject == "综合"
    if province in OLD_SYSTEM:
        return subject in ("理科", "文科")
    return subject in ("物理类", "历史类")


conflicts = set()
with zipfile.ZipFile(ZIP) as z, z.open("conflicts_2025.csv") as raw:
    text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
    reader = csv.DictReader(text)
    field = "record_id" if "record_id" in (reader.fieldnames or []) else (reader.fieldnames or [""])[0]
    for row in reader:
        rid = (row.get(field) or "").strip()
        if rid:
            conflicts.add(rid)
print("冲突记录 ID:", len(conflicts))

best = {}
stats = defaultdict(int)
provinces = defaultdict(int)

with zipfile.ZipFile(ZIP) as z, z.open("admissions_2025.csv") as raw:
    text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
    for row in csv.DictReader(text):
        if row.get("year") != "2025":
            continue
        stats["total"] += 1
        rid = (row.get("record_id") or "").strip()
        if rid in conflicts:
            stats["skip_conflict"] += 1
            continue
        if (row.get("quality_flags") or "").strip():
            stats["skip_flags"] += 1
            continue
        if not (row.get("min_rank_start") or "").strip():
            stats["skip_no_rank"] += 1
            continue
        if not (row.get("source_url") or "").strip():
            stats["skip_no_url"] += 1
            continue
        if (row.get("scope") or "").strip() == "special-path-only":
            stats["skip_special"] += 1
            continue
        if BAD_TYPE.search(row.get("admission_type") or "") or BAD_SUBTYPE.search(row.get("admission_subtype") or ""):
            stats["skip_type"] += 1
            continue
        name_raw = row.get("school_name") or ""
        if BAD_NAME.search(name_raw):
            stats["skip_campus"] += 1
            continue
        try:
            score = int(float((row.get("min_score") or "").strip()))
            rank = int(float(row["min_rank_start"]))
        except ValueError:
            stats["skip_nan"] += 1
            continue
        if not (0 < score <= 750):
            stats["skip_range"] += 1
            continue

        province = row["province"].strip()
        subject = row["subject_type"].strip()
        if not subject_ok(province, subject):
            stats["skip_subject_mismatch"] += 1
            continue

        idx = match_idx(name_raw)
        if idx is None:
            stats["skip_unmatched"] += 1
            continue

        batch = (row.get("batch") or "").strip()
        is_voc = bool(re.search(r"专科|高职", batch)) or row.get("data_type") == "vocational-admission"
        if level_of[idx] == "本科" and is_voc:
            stats["skip_voc"] += 1
            continue
        if level_of[idx] == "专科" and not is_voc:
            stats["skip_benke"] += 1
            continue

        stats["kept"] += 1
        provinces[province] += 1
        key = (province, subject, idx)
        prio = PRIORITY.get(row.get("data_type", ""), 0)
        cur = best.get(key)
        cand = {"score": score, "rank": rank, "batch": batch,
                "data_type": row.get("data_type", ""), "prio": prio}
        if cur is None or cand["prio"] > cur["prio"] or (cand["prio"] == cur["prio"] and cand["score"] < cur["score"]):
            best[key] = cand

import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"schools": [s["name"] for s in schools],
           "rows": {f"{idx}|{p}|{s}": [v["score"], v["rank"], v["batch"]] for (p, s, idx), v in best.items()}},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

print("统计:", dict(stats))
print("严格子集组合数:", len(best))
print("覆盖院校:", len({k[2] for k in best}), "/", len(schools))
print("覆盖省份:", len(provinces))
print("文件:", OUT, round(os.path.getsize(OUT) / 1024), "KB")
