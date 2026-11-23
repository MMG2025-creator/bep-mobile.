"use strict";
const dns=require("node:dns").promises;
const tls=require("node:tls");
const HOST="generativelanguage.googleapis.com";
class GeminiNetworkDiagnosticError extends Error{
 constructor(phase,detail,diagnostic){super(detail);this.name="GeminiNetworkDiagnosticError";this.networkPhase=phase;this.networkDiagnostic=diagnostic;}
}
function timed(operation,timeoutMs){
 let timer;
 return Promise.race([
  Promise.resolve().then(operation),
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("diagnostic timeout")),timeoutMs);timer.unref?.()})
 ]).finally(()=>clearTimeout(timer));
}
function defaultTlsConnect(){
 return new Promise((resolve,reject)=>{
  const socket=tls.connect({host:HOST,port:443,servername:HOST,rejectUnauthorized:true});
  const finish=(error,result)=>{socket.destroy();error?reject(error):resolve(result)};
  socket.setTimeout(5000,()=>finish(new Error("TLS handshake timeout")));
  socket.once("secureConnect",()=>finish(null,{authorized:socket.authorized===true}));
  socket.once("error",finish);
 });
}
async function probeGeminiTransport({timeoutMs=5000,lookup=(host,options)=>dns.lookup(host,options),connectTls=defaultTlsConnect}={}){
 let started=Date.now(),addresses;
 try{
  addresses=await timed(()=>lookup(HOST,{all:true,verbatim:true}),timeoutMs);
  if(!Array.isArray(addresses)||addresses.length===0)throw new Error("empty DNS result");
 }catch(error){
  const diagnostic={phase:"dns",ok:false,durationMs:Date.now()-started};
  throw new GeminiNetworkDiagnosticError("dns","La résolution DNS de Google Gemini a échoué ou expiré.",diagnostic);
 }
 const dnsResult={ok:true,durationMs:Date.now()-started,addressCount:addresses.length};
 started=Date.now();
 try{
  const tlsResult=await timed(connectTls,timeoutMs);
  if(tlsResult?.authorized!==true)throw new Error("TLS certificate not authorized");
  return{host:HOST,dns:dnsResult,tls:{ok:true,durationMs:Date.now()-started,authorized:true}};
 }catch(error){
  const diagnostic={phase:"tls",ok:false,durationMs:Date.now()-started,dns:dnsResult};
  throw new GeminiNetworkDiagnosticError("tls","La connexion TLS vers Google Gemini a échoué ou expiré.",diagnostic);
 }
}
module.exports={probeGeminiTransport,GeminiNetworkDiagnosticError};
