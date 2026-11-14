"use strict";
(function(){
 const API=String(window.BEP_API_BASE||"https://bep-v2-api.onrender.com").replace(/\/+$/,"");
 const KEY="bep-device-id-v1";
 let deviceId="";
 try{
  deviceId=localStorage.getItem(KEY)||"";
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(deviceId)){
   deviceId=crypto.randomUUID();
   localStorage.setItem(KEY,deviceId);
  }
 }catch{
  deviceId=crypto.randomUUID();
 }
 window.BEP_DEVICE_ID=deviceId;
 const nativeFetch=window.fetch.bind(window);
 window.fetch=function(input,init){
  let target="";
  try{target=new URL(typeof input==="string"?input:input.url,location.href).origin}catch{}
  if(target!==new URL(API,location.href).origin)return nativeFetch(input,init);
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
  headers.set("X-BEP-Device-ID",deviceId);
  return nativeFetch(input,{...init,headers});
 };
})();
