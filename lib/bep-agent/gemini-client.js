"use strict";

class GeminiClient{
 constructor({apiKey,model,timeoutMs=30000}){
  if(!apiKey)throw new Error("Gemini agent API key is missing");
  this.apiKey=apiKey;this.model=model;this.timeoutMs=timeoutMs;
 }
 async generateJson({system,prompt,maxOutputTokens=1800}){
  const url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(this.model)+":generateContent?key="+encodeURIComponent(this.apiKey);
  const response=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(this.timeoutMs),headers:{"content-type":"application/json"},body:JSON.stringify({
   systemInstruction:{parts:[{text:String(system||"")}]},
   contents:[{role:"user",parts:[{text:String(prompt||"")}]}],
   generationConfig:{temperature:0.1,maxOutputTokens,responseMimeType:"application/json"}
  })});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Gemini HTTP "+response.status);
  const text=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();
  if(!text)throw new Error("Gemini returned an empty response");
  try{return{value:JSON.parse(text),usage:data.usageMetadata||null}}
  catch{throw new Error("Gemini returned invalid JSON")}
 }
}
module.exports={GeminiClient};
