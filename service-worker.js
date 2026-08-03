const CACHE_NAME = 'dama-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './dama192.png',
  './dama512.png'
];

// 1. تثبيت الـ Service Worker وتخزين الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('جاري تخزين ملفات اللعبة في الكاش...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting()) // التفعيل الفوري
  );
});

// 2. تنظيف الكاش القديم عند التحديث
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. معالجة الطلبات: تجربة الشبكة أولاً، وإن تعذرت يتم الجلب من الكاش
self.addEventListener('fetch', (event) => {
  // تجاهل طلبات Socket.io أو السيرفر الخارجي حتى لا تتعطل الاتصالات اللحظية
  if (event.request.url.includes('socket.io') || event.request.url.includes('onrender.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        // في حال عدم وجود الملف في الكاش وكان الطلب لصفحة، يتم إرجاع index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});