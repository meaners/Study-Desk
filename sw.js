const PREFIX='study-desk-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+'v1';
const FILES=['./','./index.html','./app.js','./manifest.json','./icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&!response.redirected){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(event.request);
    return saved||(event.request.mode==='navigate'?await cache.match(new URL('./index.html',self.registration.scope).href):undefined)||Response.error();
  }));
});
