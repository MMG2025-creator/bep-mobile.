"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
test("Google OAuth popup keeps its opener context across the provider redirect",()=>{
 const server=fs.readFileSync("server.js","utf8");
 assert.match(server,/crossOriginOpenerPolicy:\{policy:"same-origin-allow-popups"\}/);
});
