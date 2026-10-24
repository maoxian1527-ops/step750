-- 各省可选批次（河南、四川分一本/二本；广东、浙江、江苏、山东已合并为本科批）
CREATE TABLE IF NOT EXISTS province_batches (
  province   TEXT NOT NULL,
  batch      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (province, batch)
);
