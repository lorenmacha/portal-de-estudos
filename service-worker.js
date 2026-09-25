const CACHE='portal-estudos-web-v15';
const FILES=[
  './','./index.html','./atlas-das-ideias.html','./atlas-economia-politica.html','./site.webmanifest','./site-manifest.json','./MANUAL-DE-USO.html',
  './assets/search-index.js','./assets/jszip.min.js','./assets/web-backend.js','./assets/guide-enhancements.js','./assets/guide-enhancements.css',
  './guias/politica-teoria-estado.html','./guias/criminologia.html','./guias/ciencias-sociais.html','./guias/historia-direito.html','./guias/economia-politica.html','./guias/introducao-ciencia-direito.html'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(x=>new URL(x,self.registration.scope).href))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c));return r}).catch(()=>caches.match(req).then(x=>x||caches.match(new URL('./index.html',self.registration.scope).href))));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c));}return r})));
});