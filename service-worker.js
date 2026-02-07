// Service Worker for POS PWA
const CACHE_NAME = 'pos-cache-v1.1.29';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/firebase-config.js',
    '/js/app.js',
    '/js/menu.js',
    '/js/seats.js',
    '/js/sales.js',
    '/js/order.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg'
];

// 설치 시 캐시
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('캐시 열기');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.log('캐시 실패:', error);
            })
    );
    self.skipWaiting();
});

// 활성화 시 이전 캐시 삭제
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('이전 캐시 삭제:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 네트워크 요청 처리 (Network First 전략)
self.addEventListener('fetch', event => {
    // Firebase 요청은 캐시하지 않음
    if (event.request.url.includes('firestore') ||
        event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // 성공하면 캐시 업데이트
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseClone);
                        });
                }
                return response;
            })
            .catch(() => {
                // 오프라인이면 캐시에서 가져오기
                return caches.match(event.request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        // 캐시에도 없으면 기본 페이지 반환
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});
