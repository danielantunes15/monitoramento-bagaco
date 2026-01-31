// Service Worker para Cache Offline (PWA)
const CACHE_NAME = 'belfire-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/monitor3d.html',
  '/emergency.html',
  '/css/style.css',
  '/css/dark-mode.css',
  '/css/dashboard.css',
  '/css/cameras.css',
  '/css/videowall.css',
  '/css/settings.css',
  '/js/app.js',
  '/js/cameras.js',
  '/js/dashboard.js',
  '/js/settings.js'
];

// Instalação: Cacheia os arquivos estáticos
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando e Cacheando recursos...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Ativação: Limpa caches antigos se houver atualização
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
});

// Interceptação de Rede (Fetch):
// Tenta buscar na rede. Se falhar (offline), busca no cache.
self.addEventListener('fetch', (event) => {
  // Ignora requisições de API (queremos dados frescos ou erro, não dados velhos de API)
  if (event.request.url.includes('/api/')) {
    return; 
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request).then((response) => {
            if (response) {
                return response;
            } else if (event.request.mode === 'navigate') {
                // Se não achar a página e estiver offline, redireciona pro index
                return caches.match('/index.html');
            }
        });
      })
  );
});

// Sincronização em Background (Simulação)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-logs') {
        console.log('[Service Worker] Sincronizando logs em background...');
        // Aqui iria a lógica de enviar dados salvos no IndexedDB para o servidor
    }
});