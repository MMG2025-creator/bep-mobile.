"use strict";
const CACHE_NAME="bep-shell-v8";
const RUNTIME_CACHE="bep-runtime-v1";
const OFFLINE_CDN_HOSTS=new Set(["cdn.jsdelivr.net","cdnjs.cloudflare.com","tessdata.projectnaptha.com"]);
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css",
  "./ui-polish.css",
  "./auth-recovery.css",
  "./auth-page.css",
  "./spend-experience.css",
  "./runtime-config.js",
  "./offline-storage.js",
  "./financial-engine.js",
  "./receipt-ocr.js",
  "./app.js",
  "./auth-page.js",
  "./auth-recovery.js",
  "./monthly-budget-ui.js",
  "./pwa.js",
  "./spend-experience.js",
  "./spend-clean-ui.js",
  "./spend-clean-ui.css",
  "./receipt-ocr.js",
  "./icons/bep-icon.svg"
];
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>![CACHE_NAME,RUNTIME_CACHE].includes(key)).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin){
    if(OFFLINE_CDN_HOSTS.has(url.hostname))event.respondWith((async()=>{const cache=await caches.open(RUNTIME_CACHE),cached=await cache.match(request);if(cached)return cached;try{const response=await fetch(request);if(response&&(response.ok||response.type==="opaque"))await cache.put(request,response.clone());return response}catch(error){return cached||Response.error()}})());
    return;
  }
  if(url.pathname.startsWith("/api/"))return;
  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put("./index.html",response.clone());}
        return response;
      }catch(_error){
        return (await caches.match("./index.html"))||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response&&response.ok&&url.pathname.startsWith("/")){
        const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone());
      }
      return response;
    }catch(_error){return cached||Response.error();}
  })());
});