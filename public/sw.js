/* 进步 · 成绩本 —— Service Worker
   策略：
   - 页面/静态资源：先走网络，失败回缓存（保证改版后能及时更新）
   - /img/ 下图片：缓存优先（很少变）
   - /api/ 全部不缓存，始终走网络（成绩、登录、聊天都不能读旧数据）
*/
const VERSION = 'jinbu-v1';
const SHELL = ['/', '/account', '/manifest.webmanifest', '/img/icon-192.png', '/img/icon-512.png', '/img/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 接口永不缓存

  // 图片：缓存优先
  if (url.pathname.startsWith('/img/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // 页面与脚本：网络优先，失败回缓存（离线也能打开）
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
  );
});
