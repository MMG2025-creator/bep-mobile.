"use strict";
const express=require("express"),session=require("express-session"),PgSession=require("connect-pg-simple")(session),{Pool}=require("pg"),helmet=require("helmet"),crypto=require("crypto"),path=require("path"),bcrypt=require("bcryptjs");
const {createMonthlyBudgetRouter}=require("./monthly-budget-routes");
const {ensureBepAdminSchema,createBepAdminRouter}=require("./admin/bep-admin");
const {ensureBepAdminAuthSchema,createBepAdminAuthRouter,requireIndependentBepAdmin}=require("./admin/bep-admin-auth");
const BEP_ADMIN_AUTH_ENABLED=process.env.BEP_ADMIN_AUTH_ENABLED==="true";
const BEP_ADMIN_EMAILS=String(process.env.BEP_ADMIN_EMAILS||"mmsignenoir@gmail.com").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
const BEP_ADMIN_ENABLED=process.env.BEP_ADMIN_ENABLED==="true";
const BEP_ADMIN_INDEPENDENT_AUTH_READY=process.env.BEP_ADMIN_INDEPENDENT_AUTH_READY==="true";
const financialKnowledgeSeed=require("./lib/bep-financial-knowledge-seed");
const {buildIntelligence,VERSION:FINANCIAL_INTELLIGENCE_VERSION}=require("./lib/bep-financial-intelligence");
const {readCoachLibrary,researchWeb,digestWebCandidate,createCoachResearchStatusHandler,createCoachProposalsDocumentHandler,RESEARCH_CONFIG}=require("./lib/bep-coach-services");
const {ingestManualSource}=require("./lib/bep-coach-ingestion");
const {adminAgentStatus,scheduleAdminAgentRun}=require("./lib/bep-agent/admin-runner");
const {ensureSchema:ensureBepAgentSchema}=require("./lib/bep-agent/repository");
const {sourceFingerprint}=require("./lib/bep-agent/source-fingerprint");
const {validateManualKnowledge}=require("./lib/bep-manual-knowledge");
const {mergeOfflinePayload}=require("./lib/bep-offline-merge");
const FINANCIAL_INTELLIGENCE_ENABLED=process.env.BEP_FINANCIAL_INTELLIGENCE_ENABLED==="true";
const normalizeFrontendOrigin=(value,fallback)=>{try{const parsed=new URL(String(value||fallback));if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)return fallback;return parsed.origin}catch{return fallback}};
const app=express(),port=process.env.PORT||3000,FRONTEND_ORIGIN=normalizeFrontendOrigin(process.env.FRONTEND_ORIGIN,"https://bep-mobile.onrender.com"),pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,idleTimeoutMillis:30000,max:5}):null;
let dbReady=false,dbInitError=null,agentEnabled=false,agentTelemetryReady=false;
const configured=()=>!!(pool&&process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.GOOGLE_REDIRECT_URI&&process.env.SESSION_SECRET);
app.set("trust proxy",1);
app.use((req,res,next)=>{
 const origin=req.headers.origin;
 if(origin===FRONTEND_ORIGIN){res.setHeader("Access-Control-Allow-Origin",FRONTEND_ORIGIN);res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");}
 if(req.method==="OPTIONS")return origin===FRONTEND_ORIGIN?res.sendStatus(204):res.sendStatus(403);
 if(["POST","PUT","PATCH","DELETE"].includes(req.method)&&origin!==FRONTEND_ORIGIN)return res.status(403).json({error:"ORIGIN_NOT_ALLOWED"});
 next();
});
app.use(helmet({contentSecurityPolicy:{directives:{
 defaultSrc:["'self'"],baseUri:["'self'"],fontSrc:["'self'","data:","https://fonts.gstatic.com"],formAction:["'self'"],frameAncestors:["'none'"],imgSrc:["'self'","data:","blob:"],objectSrc:["'none'"],scriptSrc:["'self'","https://cdnjs.cloudflare.com","https://cdn.jsdelivr.net"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],connectSrc:["'self'","https://bep-v2-api.onrender.com"],workerSrc:["'self'","blob:","https://cdn.jsdelivr.net"]
}}}));
app.use("/api/admin/console/import",express.json({limit:"5mb"}));
app.use(express.json({limit:"1mb"}));
function readDeviceCookie(req){
 const raw=String(req.headers.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("bep_device="));
 if(!raw)return null;
 const token=decodeURIComponent(raw.slice("bep_device=".length));
 const parts=token.split(".");
 if(parts.length!==2||!process.env.SESSION_SECRET)return null;
 const [id,signature]=parts;
 if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{64}$/.test(signature))return null;
 const expected=crypto.createHmac("sha256",process.env.SESSION_SECRET).update("bep-device:"+id).digest("hex");
 const a=Buffer.from(signature,"hex"),b=Buffer.from(expected,"hex");
 return a.length===b.length&&crypto.timingSafeEqual(a,b)?id:null;
}
function ensureDeviceCookie(req,res){
 if(req.bepDeviceId)return req.bepDeviceId;
 let id=readDeviceCookie(req);
 if(!id){
  id=crypto.randomBytes(32).toString("hex");
  const signature=crypto.createHmac("sha256",process.env.SESSION_SECRET).update("bep-device:"+id).digest("hex");
  res.append("Set-Cookie","bep_device="+id+"."+signature+"; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=None");
 }
 req.bepDeviceId=id;
 return id;
}
function rateLimit({windowMs,max,scope}){return async(req,res,next)=>{
 if(!pool||!process.env.SESSION_SECRET)return res.status(503).json({error:"RATE_LIMIT_UNAVAILABLE"});
 const now=Date.now(),windowStart=Math.floor(now/windowMs)*windowMs,resetAt=windowStart+windowMs;
 const deviceId=ensureDeviceCookie(req,res);
 const key=crypto.createHash("sha256").update(scope+":device:"+deviceId).digest("hex");
 try{
  const result=await pool.query(
   "INSERT INTO bep_rate_limits(bucket_key,window_start_ms,request_count,expires_at) VALUES($1,$2,1,to_timestamp(($2::bigint+$3::bigint)/1000.0)) ON CONFLICT(bucket_key) DO UPDATE SET request_count=CASE WHEN bep_rate_limits.window_start_ms=EXCLUDED.window_start_ms THEN bep_rate_limits.request_count+1 ELSE 1 END,window_start_ms=EXCLUDED.window_start_ms,expires_at=EXCLUDED.expires_at RETURNING request_count",
   [scope+":"+key,windowStart,windowMs]
  );
  const count=Number(result.rows[0].request_count),remaining=Math.max(0,max-count),retryAfter=Math.max(1,Math.ceil((resetAt-now)/1000));
  res.setHeader("RateLimit-Limit",String(max));res.setHeader("RateLimit-Remaining",String(remaining));res.setHeader("RateLimit-Reset",String(retryAfter));
  if(count>max){res.setHeader("Retry-After",String(retryAfter));if(scope==="auth"&&req.method==="GET"&&req.path==="/google"&&req.accepts("html"))return oauthPopupRedirect(res,"rate_limited",retryAfter);return res.status(429).json({error:"RATE_LIMITED"})}
  if(Math.random()<0.01)pool.query("DELETE FROM bep_rate_limits WHERE expires_at<NOW()").catch(e=>console.error("Rate limit cleanup failed",e.message));
  next();
 }catch(e){console.error("Device rate limiter unavailable",e.message);return res.status(503).json({error:"RATE_LIMIT_UNAVAILABLE"})}
}}
app.use("/api/auth",rateLimit({windowMs:15*60*1000,max:20,scope:"auth"}));
app.use("/api/ai",rateLimit({windowMs:60*1000,max:20,scope:"ai"}));
app.use("/api/admin/auth",rateLimit({windowMs:15*60*1000,max:10,scope:"admin-auth"}));
const adminApiRateLimit=rateLimit({windowMs:60*1000,max:300,scope:"admin-api"});
const userApiRateLimit=rateLimit({windowMs:60*1000,max:120,scope:"api"});
app.use("/api",(req,res,next)=>req.path==="/admin"||req.path.startsWith("/admin/")?adminApiRateLimit(req,res,next):userApiRateLimit(req,res,next));
if(pool&&process.env.SESSION_SECRET)app.use(session({store:new PgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:true,sameSite:"none",maxAge:604800000}}));
if(BEP_ADMIN_AUTH_ENABLED){
 app.use("/api/admin/auth",createBepAdminAuthRouter({pool,bcrypt,allowedEmails:BEP_ADMIN_EMAILS,sendCode:(email,code)=>sendVerificationEmail(email,code,"admin_auth_code")}));
}
if(BEP_ADMIN_ENABLED&&BEP_ADMIN_AUTH_ENABLED&&BEP_ADMIN_INDEPENDENT_AUTH_READY){
 app.use("/api/admin/console",createBepAdminRouter({pool,requireAdmin:requireIndependentBepAdmin}));
}else if(BEP_ADMIN_ENABLED){console.warn("BEP admin console remains disabled: independent admin authentication is not ready");}
async function init(){if(!pool)return;await pool.query("CREATE TABLE IF NOT EXISTS bep_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT,avatar_url TEXT,password_hash TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"); await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS password_hash TEXT");await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE");await pool.query("CREATE TABLE IF NOT EXISTS bep_email_verifications(email TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,code_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");await pool.query("CREATE TABLE IF NOT EXISTS bep_password_reset_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");await pool.query("CREATE INDEX IF NOT EXISTS bep_password_reset_tokens_expiry ON bep_password_reset_tokens(expires_at)");await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bep_password_reset_tokens_user_unique ON bep_password_reset_tokens(user_id)");await pool.query("CREATE TABLE IF NOT EXISTS bep_user_data(user_id TEXT PRIMARY KEY REFERENCES bep_users(id) ON DELETE CASCADE,payload JSONB NOT NULL DEFAULT '{\"income\":0,\"budgets\":[],\"expenses\":[],\"goals\":[]}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");await pool.query("CREATE TABLE IF NOT EXISTS bep_oauth_states(state TEXT PRIMARY KEY,expires_at TIMESTAMPTZ NOT NULL)");await pool.query("CREATE TABLE IF NOT EXISTS bep_oauth_state_tokens(token_hash TEXT PRIMARY KEY,expires_at TIMESTAMPTZ NOT NULL)");
await pool.query("CREATE TABLE IF NOT EXISTS bep_user_ai(user_id TEXT PRIMARY KEY REFERENCES bep_users(id) ON DELETE CASCADE,provider TEXT NOT NULL,model TEXT NOT NULL,endpoint TEXT,encrypted_key TEXT NOT NULL,key_iv TEXT NOT NULL,key_tag TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
await pool.query("CREATE TABLE IF NOT EXISTS bep_ai_monthly_usage(user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,month_key TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,month_key))");
await pool.query("CREATE TABLE IF NOT EXISTS bep_ai_global_usage(month_key TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
await pool.query("CREATE TABLE IF NOT EXISTS bep_rate_limits(bucket_key TEXT PRIMARY KEY,window_start_ms BIGINT NOT NULL,request_count INTEGER NOT NULL DEFAULT 0,expires_at TIMESTAMPTZ NOT NULL)");
await pool.query("CREATE INDEX IF NOT EXISTS bep_rate_limits_expires_at ON bep_rate_limits(expires_at)");
await pool.query("ALTER TABLE bep_oauth_state_tokens ADD COLUMN IF NOT EXISTS flow TEXT NOT NULL DEFAULT 'login'");
await pool.query("ALTER TABLE bep_oauth_state_tokens ADD COLUMN IF NOT EXISTS user_id TEXT");
await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS first_name TEXT");await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS last_name TEXT");await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS phone_number TEXT");await pool.query("ALTER TABLE bep_users ADD COLUMN IF NOT EXISTS google_sub TEXT");
await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS bep_users_google_sub_unique ON bep_users(google_sub) WHERE google_sub IS NOT NULL");
await pool.query("UPDATE bep_users SET google_sub=id WHERE id NOT LIKE 'email:%' AND google_sub IS NULL");
await pool.query("CREATE TABLE IF NOT EXISTS bep_user_coach_knowledge(id BIGSERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,external_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('recommendation','knowledge')),category TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL,priority TEXT NOT NULL,confidence TEXT NOT NULL,evidence JSONB NOT NULL DEFAULT '[]'::jsonb,action TEXT NOT NULL DEFAULT '',valid_until DATE,source_provider TEXT NOT NULL,review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,external_id,kind))");
await pool.query("CREATE INDEX IF NOT EXISTS bep_user_coach_knowledge_user_created ON bep_user_coach_knowledge(user_id,created_at DESC)");
await pool.query(`CREATE TABLE IF NOT EXISTS bep_monthly_budgets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,month_key DATE NOT NULL CHECK(EXTRACT(DAY FROM month_key)=1 AND month_key>=DATE '2000-01-01' AND month_key<DATE '2100-01-01'),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),planned_income_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(planned_income_total>=0),planned_charges_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(planned_charges_total>=0),planned_savings_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(planned_savings_total>=0),version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,month_key),UNIQUE(id,user_id))`);
await pool.query("CREATE INDEX IF NOT EXISTS bep_monthly_budgets_user_month_idx ON bep_monthly_budgets(user_id,month_key DESC)");
await pool.query(`CREATE TABLE IF NOT EXISTS bep_monthly_budget_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),budget_id UUID NOT NULL REFERENCES bep_monthly_budgets(id) ON DELETE CASCADE,item_type TEXT NOT NULL CHECK(item_type IN ('income','charge','savings')),source_item_id TEXT,label TEXT NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 160),category TEXT CHECK(category IS NULL OR length(category)<=80),nature TEXT CHECK(nature IS NULL OR length(nature)<=40),planned_amount NUMERIC(14,2) NOT NULL CHECK(planned_amount>=0),metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
await pool.query("CREATE INDEX IF NOT EXISTS bep_monthly_budget_items_budget_type_idx ON bep_monthly_budget_items(budget_id,item_type)");
await pool.query(`CREATE TABLE IF NOT EXISTS bep_budget_audit_log (id BIGSERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES bep_users(id) ON DELETE CASCADE,budget_id UUID NOT NULL,action TEXT NOT NULL CHECK(action IN ('created','updated','closed','reopened','imported')),before_state JSONB,after_state JSONB,reason TEXT CHECK(reason IS NULL OR length(reason)<=500),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),FOREIGN KEY(budget_id,user_id) REFERENCES bep_monthly_budgets(id,user_id) ON DELETE CASCADE)`);
await pool.query("CREATE INDEX IF NOT EXISTS bep_budget_audit_log_budget_created_idx ON bep_budget_audit_log(budget_id,created_at DESC)");
await pool.query("CREATE INDEX IF NOT EXISTS bep_budget_audit_log_user_created_idx ON bep_budget_audit_log(user_id,created_at DESC)");
await pool.query("CREATE TABLE IF NOT EXISTS bep_financial_knowledge(slug TEXT PRIMARY KEY,category TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,keywords JSONB NOT NULL DEFAULT '[]'::jsonb,source_name TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',evidence_level TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,active BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
await pool.query("CREATE INDEX IF NOT EXISTS bep_financial_knowledge_active_category ON bep_financial_knowledge(active,category)");
for(const item of financialKnowledgeSeed){await pool.query("INSERT INTO bep_financial_knowledge(slug,category,title,content,keywords,source_name,source_url,evidence_level,version,active) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,1,TRUE) ON CONFLICT(slug) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,content=EXCLUDED.content,keywords=EXCLUDED.keywords,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,evidence_level=EXCLUDED.evidence_level,version=bep_financial_knowledge.version+1,active=TRUE,updated_at=NOW() WHERE bep_financial_knowledge.content IS DISTINCT FROM EXCLUDED.content OR bep_financial_knowledge.title IS DISTINCT FROM EXCLUDED.title OR bep_financial_knowledge.source_url IS DISTINCT FROM EXCLUDED.source_url",[item.slug,item.category,item.title,item.content,JSON.stringify(item.keywords),item.source_name,item.source_url,item.evidence_level])}
if(BEP_ADMIN_AUTH_ENABLED)await ensureBepAdminAuthSchema(pool);
if(BEP_ADMIN_ENABLED&&BEP_ADMIN_INDEPENDENT_AUTH_READY)await ensureBepAdminSchema(pool);
}
function auth(req,res,next){if(!req.session||!req.session.user)return res.status(401).json({error:"AUTH_REQUIRED"});next()}
const requireBepAgentAdmin=requireIndependentBepAdmin;
function coachTelemetry(req,res,next){
 if(!agentTelemetryReady)return next();
 const started=Date.now();let recorded=false;const send=res.json.bind(res);
 res.json=function(body){
  if(!recorded){
   recorded=true;
   const mode=["structured","structured-fallback","bep"].includes(body?.mode)?body.mode:"unknown";
   const status=Number(res.statusCode)||200;
   const tokens=Number(body?.usage?.totalTokenCount??body?.usage?.total_tokens)||0;
   res.once("finish",()=>{if(pool)pool.query("INSERT INTO bep_agent_coach_metrics(day_key,mode,status_code,calls,total_latency_ms,total_tokens) VALUES(CURRENT_DATE,$1,$2,1,$3,$4) ON CONFLICT(day_key,mode,status_code) DO UPDATE SET calls=bep_agent_coach_metrics.calls+1,total_latency_ms=bep_agent_coach_metrics.total_latency_ms+EXCLUDED.total_latency_ms,total_tokens=bep_agent_coach_metrics.total_tokens+EXCLUDED.total_tokens",[mode,status,Date.now()-started,tokens]).catch(()=>{})});
  }
  return send(body);
 };
 next();
}
async function keepSingleSession(userId,sessionId){await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1 AND sid<>$2",[String(userId),String(sessionId)])}
app.get("/api/health",async(req,res)=>{let databaseReady=false;try{if(pool){await pool.query("SELECT 1");databaseReady=dbReady}}catch(e){dbInitError=e.message}res.status(200).json({ok:true,authConfigured:configured(),databaseConfigured:!!pool,databaseReady, ...(dbInitError?{databaseError:"DATABASE_NOT_READY"}:{})})});
app.get("/api/auth/status",async(req,res)=>{res.setHeader("Cache-Control","no-store");if(!req.session?.user)return res.json({configured:true,googleConfigured:configured(),user:null});try{const r=await pool.query("SELECT id,email,display_name,email_verified,password_hash,google_sub FROM bep_users WHERE id=$1",[req.session.user.id]);if(!r.rowCount)return res.status(404).json({configured:true,googleConfigured:configured(),user:null});const u=r.rows[0];return res.json({configured:true,googleConfigured:configured(),user:{id:u.id,email:u.email,name:u.display_name||"",emailVerified:u.email_verified!==false,passwordEnabled:!!u.password_hash,googleLinked:!!u.google_sub}})}catch(e){console.error("Auth status read failed",e.message);return res.status(500).json({error:"AUTH_STATUS_UNAVAILABLE"})}});
async function sendVerificationEmail(email,code,type="email_verification"){const endpoint=process.env.GMAIL_APPS_SCRIPT_URL,secret=process.env.BEP_MAIL_SECRET;if(!endpoint||!secret)throw Error("EMAIL_SERVICE_NOT_CONFIGURED");const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({secret,email,code,type,resetUrl:type==="password_reset"?code:undefined,subject:type==="password_reset"?"Réinitialisation du mot de passe BEP":type==="admin_auth_code"?"Code de sécurité administrateur BEP":"Vérification de ton adresse e-mail BEP"})});const result=await response.json();if(!response.ok||!result.ok)throw Error("EMAIL_SEND_FAILED")}
app.post("/api/auth/forgot-password",async(req,res)=>{res.setHeader("Cache-Control","no-store");try{const email=String(req.body?.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(200).json({ok:true,message:"Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé."});const user=await pool.query("SELECT id FROM bep_users WHERE LOWER(email)=LOWER($1) ORDER BY created_at DESC",[email]);if(user.rowCount===1){const token=crypto.randomBytes(32).toString("hex"),tokenHash=crypto.createHash("sha256").update(token).digest("hex");await pool.query("INSERT INTO bep_password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=NOW()",[tokenHash,user.rows[0].id]);const resetUrl=FRONTEND_ORIGIN+"/?reset="+encodeURIComponent(token);try{await sendVerificationEmail(email,resetUrl,"password_reset")}catch(mailError){console.error("Password reset email failed",mailError.message);await pool.query("DELETE FROM bep_password_reset_tokens WHERE token_hash=$1",[tokenHash])}}return res.status(200).json({ok:true,message:"Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé."})}catch(e){console.error("Password reset request failed",e.message);return res.status(200).json({ok:true,message:"Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé."})}});
app.post("/api/auth/reset-password",async(req,res)=>{res.setHeader("Cache-Control","no-store");const token=String(req.body?.token||""),password=String(req.body?.password||"");if(!/^[a-f0-9]{64}$/.test(token)||password.length<10||password.length>128)return res.status(400).json({error:"RESET_INVALID",message:"Lien invalide ou mot de passe non conforme (10 caractères minimum)."});const tokenHash=crypto.createHash("sha256").update(token).digest("hex");const client=await pool.connect();try{await client.query("BEGIN");const found=await client.query("SELECT user_id FROM bep_password_reset_tokens WHERE token_hash=$1 AND expires_at>NOW() FOR UPDATE",[tokenHash]);if(!found.rowCount){await client.query("ROLLBACK");return res.status(400).json({error:"RESET_EXPIRED",message:"Ce lien est invalide ou expiré. Demande un nouveau lien."})}const userId=found.rows[0].user_id,hash=await bcrypt.hash(password,12);await client.query("UPDATE bep_users SET password_hash=$1,email_verified=TRUE,updated_at=NOW() WHERE id=$2",[hash,userId]);await client.query("DELETE FROM bep_password_reset_tokens WHERE user_id=$1",[userId]);await client.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1",[userId]);await client.query("COMMIT");return res.json({ok:true,message:"Ton mot de passe a été réinitialisé. Tu peux maintenant te connecter."})}catch(e){await client.query("ROLLBACK").catch(()=>{});console.error("Password reset confirmation failed",e.message);return res.status(500).json({error:"RESET_FAILED",message:"La réinitialisation a échoué. Réessaie."})}finally{client.release()}});
app.post("/api/auth/register",async(req,res)=>{try{const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||""),name=String(req.body?.name||"").trim().slice(0,80);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>128)return res.status(400).json({error:"EMAIL_OR_PASSWORD_INVALID",message:"Adresse e-mail invalide ou mot de passe inférieur à 10 caractères."});const exists=await pool.query("SELECT id FROM bep_users WHERE LOWER(email)=LOWER($1)",[email]);if(exists.rowCount)return res.status(409).json({error:"ACCOUNT_EXISTS",message:"Un compte existe déjà avec cette adresse."});const id="email:"+crypto.randomUUID(),hash=await bcrypt.hash(password,12);await pool.query("INSERT INTO bep_users(id,email,display_name,password_hash,email_verified) VALUES($1,$2,$3,$4,FALSE)",[id,email,name,hash]);await pool.query("INSERT INTO bep_user_data(user_id) VALUES($1)",[id]);const code=String(crypto.randomInt(0,1000000)).padStart(6,"0"),codeHash=crypto.createHash("sha256").update(code).digest("hex");await pool.query("INSERT INTO bep_email_verifications(email,user_id,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes') ON CONFLICT(email) DO UPDATE SET user_id=EXCLUDED.user_id,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,created_at=NOW()",[email,id,codeHash]);try{await sendVerificationEmail(email,code)}catch(mailError){console.error("Verification email failed",mailError.message);return res.status(503).json({error:"EMAIL_SEND_FAILED",message:"Compte préparé, mais l'e-mail n'a pas pu être envoyé. Réessaie l'envoi du code."})}res.status(201).json({ok:true,verificationRequired:true,email})}catch(e){console.error("Register error",e.message);res.status(500).json({error:"REGISTER_FAILED"})}});
app.post("/api/auth/verify-email",async(req,res)=>{try{const email=String(req.body?.email||"").trim().toLowerCase(),code=String(req.body?.code||"").trim();if(!/^\d{6}$/.test(code))return res.status(400).json({error:"INVALID_CODE",message:"Saisis le code à 6 chiffres."});const v=await pool.query("SELECT v.*,u.email_verified FROM bep_email_verifications v JOIN bep_users u ON u.id=v.user_id WHERE v.email=$1 AND v.expires_at>NOW()",[email]);if(!v.rowCount)return res.status(400).json({error:"CODE_EXPIRED",message:"Code expiré. Demande un nouveau code."});if(v.rows[0].attempts>=5)return res.status(429).json({error:"TOO_MANY_ATTEMPTS",message:"Trop de tentatives. Demande un nouveau code."});const hash=crypto.createHash("sha256").update(code).digest("hex");if(hash!==v.rows[0].code_hash){await pool.query("UPDATE bep_email_verifications SET attempts=attempts+1 WHERE email=$1",[email]);return res.status(400).json({error:"INVALID_CODE",message:"Code incorrect."})}const userId=v.rows[0].user_id;await pool.query("UPDATE bep_users SET email_verified=TRUE,updated_at=NOW() WHERE id=$1",[userId]);await pool.query("DELETE FROM bep_email_verifications WHERE email=$1",[email]);const u=await pool.query("SELECT id,email,display_name FROM bep_users WHERE id=$1",[userId]);req.session.regenerate(err=>{if(err)return res.status(500).json({error:"SESSION_ERROR"});req.session.user={id:u.rows[0].id,email:u.rows[0].email,name:u.rows[0].display_name||"",picture:""};req.session.save(async e=>{if(e)return res.status(500).json({error:"SESSION_ERROR"});try{await keepSingleSession(u.id,req.sessionID);return res.json({ok:true,user:req.session.user})}catch(error){console.error("Single-session enforcement failed",error.message);return res.status(500).json({error:"SESSION_POLICY_FAILED"})}})})}catch(e){console.error("Email verification error",e.message);res.status(500).json({error:"VERIFICATION_FAILED"})}});
app.post("/api/auth/resend-verification",async(req,res)=>{try{const email=String(req.body?.email||"").trim().toLowerCase(),u=await pool.query("SELECT id,email_verified FROM bep_users WHERE email=$1 AND id LIKE 'email:%'",[email]);if(!u.rowCount||u.rows[0].email_verified)return res.json({ok:true});const code=String(crypto.randomInt(0,1000000)).padStart(6,"0"),codeHash=crypto.createHash("sha256").update(code).digest("hex");await pool.query("INSERT INTO bep_email_verifications(email,user_id,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes') ON CONFLICT(email) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,created_at=NOW()",[email,u.rows[0].id,codeHash]);await sendVerificationEmail(email,code);res.json({ok:true})}catch(e){console.error("Resend verification failed",e.message);res.status(503).json({error:"EMAIL_SEND_FAILED",message:"Impossible d'envoyer le code pour le moment."})}});
app.post("/api/auth/login",async(req,res)=>{try{const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");const r=await pool.query("SELECT id,email,display_name,password_hash,email_verified FROM bep_users WHERE LOWER(email)=LOWER($1) ORDER BY created_at DESC",[email]);const matches=[];for(const candidate of r.rows){if(candidate.password_hash&&await bcrypt.compare(password,candidate.password_hash))matches.push(candidate)}if(!matches.length)return res.status(401).json({error:"LOGIN_INVALID",message:"Adresse e-mail ou mot de passe incorrect."});if(matches.length>1)return res.status(409).json({error:"ACCOUNT_AMBIGUOUS",message:"Plusieurs comptes utilisent cette adresse. La connexion est temporairement bloquée pour protéger tes données. Contacte le support BEP."});const u=matches[0];if(u.email_verified===false)return res.status(403).json({error:"EMAIL_NOT_VERIFIED",message:"Confirme ton adresse e-mail avant de te connecter."});req.session.regenerate(err=>{if(err)return res.status(500).json({error:"SESSION_ERROR"});req.session.user={id:u.id,email:u.email,name:u.display_name||"",picture:""};req.session.save(async e=>{if(e)return res.status(500).json({error:"SESSION_ERROR"});try{await keepSingleSession(u.id,req.sessionID);return res.json({ok:true,user:req.session.user})}catch(error){console.error("Single-session enforcement failed",error.message);return res.status(500).json({error:"SESSION_POLICY_FAILED"})}})})}catch(e){console.error("Login error",e.message);res.status(500).json({error:"LOGIN_FAILED"})}});
function oauthPopupRedirect(res,result,retryAfter){
 const params=new URLSearchParams({login:String(result||"error")});
 if(Number(retryAfter)>0)params.set("retry",String(Math.max(1,Math.ceil(Number(retryAfter)))));
 return res.redirect(303,FRONTEND_ORIGIN.replace(/\/+$/,"")+"/?"+params.toString());
}
function hashOAuthState(state){return crypto.createHash("sha256").update(state).digest("hex")}
app.get("/api/auth/google",async(req,res)=>{
 res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");res.setHeader("Pragma","no-cache");
 if(req.session?.user)return res.redirect(303,FRONTEND_ORIGIN.replace(/\/+$/,"")+"/?login=already_authenticated");
 try{if(!configured())return oauthPopupRedirect(res,"google_config_error");const state=crypto.randomBytes(32).toString("hex"),tokenHash=hashOAuthState(state);await pool.query("DELETE FROM bep_oauth_state_tokens WHERE expires_at<NOW()");await pool.query("INSERT INTO bep_oauth_state_tokens(token_hash,expires_at,flow,user_id) VALUES($1,NOW()+INTERVAL '10 minutes','login',NULL)",[tokenHash]);const p=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:process.env.GOOGLE_REDIRECT_URI,response_type:"code",scope:"openid email profile",state,prompt:"select_account"});res.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+p)}catch(e){console.error("OAuth start failed",e.message);return oauthPopupRedirect(res,"error")}
});
app.post("/api/auth/google/link/start",auth,async(req,res)=>{
 try{const account=await pool.query("SELECT id,email,password_hash FROM bep_users WHERE id=$1",[req.session.user.id]);if(!account.rowCount)return res.status(404).json({error:"ACCOUNT_NOT_FOUND"});const u=account.rows[0];if(u.password_hash){const password=String(req.body?.password||"");if(!password||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:"REAUTH_REQUIRED",message:"Confirme le mot de passe de ton compte BEP avant de continuer."});}const state=crypto.randomBytes(32).toString("hex"),tokenHash=hashOAuthState(state);await pool.query("DELETE FROM bep_oauth_state_tokens WHERE expires_at<NOW()");await pool.query("INSERT INTO bep_oauth_state_tokens(token_hash,expires_at,flow,user_id) VALUES($1,NOW()+INTERVAL '10 minutes','link',$2)",[tokenHash,u.id]);const p=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:process.env.GOOGLE_REDIRECT_URI,response_type:"code",scope:"openid email profile",state,prompt:"select_account"});res.json({url:"https://accounts.google.com/o/oauth2/v2/auth?"+p})}catch(e){console.error("Google link start failed",e.message);res.status(500).json({error:"LINK_START_FAILED"})}
});
app.get("/api/auth/google/callback",async(req,res)=>{
 res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");res.setHeader("Pragma","no-cache");
 let stage="callback";
 const rawState=String(req.query.state||"");
 try{
  if(!configured())return oauthPopupRedirect(res,"google_config_error");
  if(req.query.error)return oauthPopupRedirect(res,req.query.error==="access_denied"?"google_cancelled":"error");
  if(!req.query.code)return oauthPopupRedirect(res,"error");
  if(!/^[a-f0-9]{64}$/.test(rawState))return oauthPopupRedirect(res,"error");
  stage="state-validation";const tokenHash=hashOAuthState(req.query.state);const stateResult=await pool.query("DELETE FROM bep_oauth_state_tokens WHERE token_hash=$1 AND expires_at>NOW() RETURNING flow,user_id",[tokenHash]);if(stateResult.rowCount!==1)return oauthPopupRedirect(res,"error");const oauthState=stateResult.rows[0];stage="token-exchange";const t=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:req.query.code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:process.env.GOOGLE_REDIRECT_URI,grant_type:"authorization_code"})});const tokens=await t.json();if(!t.ok||!tokens.access_token){console.error("Google token exchange rejected",JSON.stringify({httpStatus:t.status,error:tokens.error||"unknown"}));if(tokens.error==="invalid_client")return oauthPopupRedirect(res,"google_config_error");throw Error("TOKEN_EXCHANGE_FAILED")}stage="profile";const g=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:"Bearer "+tokens.access_token}}),u=await g.json();if(!g.ok||!u.sub||!u.email||!u.email_verified)throw Error("GOOGLE_PROFILE_FAILED");const email=String(u.email).trim().toLowerCase();
if(oauthState.flow==="link"){stage="link-verification";if(!oauthState.user_id||!req.session?.user||req.session.user.id!==oauthState.user_id)return oauthPopupRedirect(res,"link_session_required");const account=await pool.query("SELECT id,email,display_name,google_sub FROM bep_users WHERE id=$1",[oauthState.user_id]);if(!account.rowCount)return oauthPopupRedirect(res,"link_account_missing");const current=account.rows[0];if(String(current.email).toLowerCase()!==email)return oauthPopupRedirect(res,"link_email_mismatch");if(current.google_sub&&current.google_sub!==u.sub)return oauthPopupRedirect(res,"google_already_linked");const conflict=await pool.query("SELECT id FROM bep_users WHERE google_sub=$1 AND id<>$2",[u.sub,current.id]);if(conflict.rowCount)return oauthPopupRedirect(res,"google_already_linked");await pool.query("UPDATE bep_users SET google_sub=$1,avatar_url=COALESCE(NULLIF($2,''),avatar_url),updated_at=NOW() WHERE id=$3 AND (google_sub IS NULL OR google_sub=$1)",[u.sub,u.picture||"",current.id]);req.session.user={...req.session.user,id:current.id,email:current.email,name:current.display_name||req.session.user.name||"",picture:u.picture||""};return req.session.save(err=>err?oauthPopupRedirect(res,"link_session_error"):oauthPopupRedirect(res,"google_linked"))}
stage="database-user";let found=await pool.query("SELECT id,email,display_name,avatar_url FROM bep_users WHERE google_sub=$1",[u.sub]);if(!found.rowCount){const byEmail=await pool.query("SELECT id FROM bep_users WHERE LOWER(email)=LOWER($1)",[email]);if(byEmail.rowCount)return oauthPopupRedirect(res,"link_required");await pool.query("INSERT INTO bep_users(id,email,display_name,avatar_url,google_sub) VALUES($1,$2,$3,$4,$1)",[u.sub,email,u.name||"",u.picture||""]);await pool.query("INSERT INTO bep_user_data(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[u.sub]);found=await pool.query("SELECT id,email,display_name,avatar_url FROM bep_users WHERE google_sub=$1",[u.sub])}const user=found.rows[0];if(String(user.email).toLowerCase()!==email)return oauthPopupRedirect(res,"google_email_changed");stage="session-save";req.session.regenerate(err=>{if(err)return oauthPopupRedirect(res,"error");req.session.user={id:user.id,email:user.email,name:user.display_name||u.name||"",picture:user.avatar_url||u.picture||""};req.session.save(async e=>{if(e)return oauthPopupRedirect(res,"error");try{await keepSingleSession(user.id,req.sessionID);return oauthPopupRedirect(res,"success")}catch(error){console.error("Single-session enforcement failed",error.message);return oauthPopupRedirect(res,"error")}})})}catch(e){console.error("OAuth error",JSON.stringify({stage,message:e.message}));oauthPopupRedirect(res,"error")}});
app.post("/api/auth/logout",(req,res)=>{const cookieOptions={path:"/",httpOnly:true,secure:true,sameSite:"none"};if(!req.session){res.clearCookie("connect.sid",cookieOptions);return res.json({ok:true})}req.session.destroy(err=>{res.clearCookie("connect.sid",cookieOptions);if(err){console.error("Logout session destroy failed",err.message);return res.status(500).json({error:"LOGOUT_FAILED"})}res.setHeader("Cache-Control","no-store");res.json({ok:true})})});
app.get("/api/me",auth,async(req,res)=>{const r=await pool.query("SELECT id,email,display_name,first_name,last_name,phone_number,avatar_url FROM bep_users WHERE id=$1",[req.session.user.id]);if(!r.rowCount)return res.status(404).json({error:"ACCOUNT_NOT_FOUND"});const u=r.rows[0];res.setHeader("Cache-Control","no-store");res.json({user:{id:u.id,email:u.email,name:u.display_name||"",firstName:u.first_name||"",lastName:u.last_name||"",phone:u.phone_number||"",picture:u.avatar_url||""}})});
app.put("/api/profile",auth,async(req,res)=>{const firstName=String(req.body?.firstName||"").trim().slice(0,80),lastName=String(req.body?.lastName||"").trim().slice(0,80),phone=String(req.body?.phone||"").trim().slice(0,30);if(!firstName||!lastName)return res.status(400).json({error:"PROFILE_REQUIRED",message:"Le prénom et le nom sont obligatoires."});if(phone&&!/^[+0-9(). /-]{6,30}$/.test(phone))return res.status(400).json({error:"PHONE_INVALID",message:"Le numéro de téléphone n'est pas valide."});const displayName=(firstName+" "+lastName).trim();await pool.query("UPDATE bep_users SET first_name=$2,last_name=$3,phone_number=$4,display_name=$5,updated_at=NOW() WHERE id=$1",[req.session.user.id,firstName,lastName,phone||null,displayName]);req.session.user.name=displayName;await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));res.json({ok:true,profile:{firstName,lastName,phone}})});
app.delete("/api/account",auth,async(req,res)=>{const userId=req.session.user.id;const client=await pool.connect();try{await client.query("BEGIN");await client.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1",[userId]);await client.query("DELETE FROM bep_oauth_state_tokens WHERE user_id=$1",[userId]);const deleted=await client.query("DELETE FROM bep_users WHERE id=$1 RETURNING id",[userId]);if(!deleted.rowCount)throw Error("ACCOUNT_NOT_FOUND");await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");console.error("Account deletion failed",e.message);return res.status(e.message==="ACCOUNT_NOT_FOUND"?404:500).json({error:"ACCOUNT_DELETE_FAILED",message:"La suppression du compte n'a pas pu être confirmée."})}finally{client.release()}const cookieOptions={path:"/",httpOnly:true,secure:true,sameSite:"none"};if(req.session)req.session.destroy(err=>{res.clearCookie("connect.sid",cookieOptions);if(err)return res.status(500).json({error:"SESSION_CLEANUP_FAILED",message:"Compte supprimé, mais la session doit être fermée."});res.setHeader("Cache-Control","no-store");res.json({ok:true})});else{res.clearCookie("connect.sid",cookieOptions);res.json({ok:true})}});

function aiEncryptionKey(){const raw=process.env.BEP_AI_ENCRYPTION_KEY||"";if(!/^[a-f0-9]{64}$/i.test(raw))throw Error("AI_ENCRYPTION_NOT_CONFIGURED");return Buffer.from(raw,"hex")}
function encryptAiKey(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",aiEncryptionKey(),iv),encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return{encrypted_key:encrypted.toString("base64"),key_iv:iv.toString("base64"),key_tag:cipher.getAuthTag().toString("base64")}}
function decryptAiKey(row){const d=crypto.createDecipheriv("aes-256-gcm",aiEncryptionKey(),Buffer.from(row.key_iv,"base64"));d.setAuthTag(Buffer.from(row.key_tag,"base64"));return Buffer.concat([d.update(Buffer.from(row.encrypted_key,"base64")),d.final()]).toString("utf8")}
const aiProviders={openai:{url:"https://api.openai.com/v1/chat/completions",kind:"openai"},anthropic:{url:"https://api.anthropic.com/v1/messages",kind:"anthropic"},gemini:{url:"https://generativelanguage.googleapis.com",kind:"gemini"},mistral:{url:"https://api.mistral.ai/v1/chat/completions",kind:"openai"},openrouter:{url:"https://openrouter.ai/api/v1/chat/completions",kind:"openai"},custom:{url:"",kind:"openai"}};
function validAiConfig(b){const provider=String(b.provider||"").toLowerCase(),model=String(b.model||"").trim().slice(0,120),endpoint=String(b.endpoint||"").trim().slice(0,500);if(!aiProviders[provider]||!model)throw Error("Choisis un fournisseur et un modèle.");if(provider==="custom")throw Error("Les endpoints IA personnalisés sont temporairement désactivés pour prévenir les accès réseau non autorisés (SSRF). Utilise un fournisseur prédéfini.");return{provider,model,endpoint:provider==="custom"?endpoint:aiProviders[provider].url}}
async function invokeAi(cfg,key,messages){if(cfg.provider==="custom")throw Error("Les endpoints IA personnalisés sont désactivés pour prévenir les accès réseau non autorisés (SSRF).");const p=aiProviders[cfg.provider],signal=AbortSignal.timeout(45000);let url,headers,body;if(p.kind==="anthropic"){url=p.url;headers={"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"};body={model:cfg.model,max_tokens:1100,system:messages[0].content,messages:messages.slice(1).map(x=>({role:x.role,content:x.content}))}}else if(p.kind==="gemini"){url=p.url+"/v1beta/models/"+encodeURIComponent(cfg.model)+":generateContent?key="+encodeURIComponent(key);headers={"content-type":"application/json"};body={systemInstruction:{parts:[{text:messages[0].content}]},contents:messages.slice(1).map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content}]})),generationConfig:{maxOutputTokens:1100}}}else{url=cfg.endpoint||p.url;headers={"content-type":"application/json",authorization:"Bearer "+key};body={model:cfg.model,messages,max_tokens:1100,temperature:.35}}const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal,redirect:"error"}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(String(d.error?.message||d.message||"Erreur fournisseur HTTP "+r.status).slice(0,350));const answer=p.kind==="anthropic"?(d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n"):p.kind==="gemini"?(d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("\n"):d.choices?.[0]?.message?.content;if(!answer)throw Error("Réponse IA vide.");return{answer:String(answer).slice(0,12000),usage:d.usage||d.usageMetadata||null}}
async function userAi(){
 const provider=String(process.env.BEP_AI_PROVIDER||"gemini").toLowerCase(),model=String(process.env.BEP_AI_MODEL||"gemini-3.8-flash"),key=String(process.env.BEP_AI_API_KEY||"").trim();
 if(!key||!aiProviders[provider]||process.env.BEP_AI_ZERO_BILLING_CONFIRMED!=="true")throw Error("Gemini est temporairement désactivé : le mode gratuit sans facturation doit être confirmé pour le projet Google. Le moteur BEP structuré reste disponible.");
 return{cfg:{provider,model,endpoint:aiProviders[provider].url},key,mode:"bep"};
}
const BEP_AI_FREE_MONTHLY_LIMIT=Math.max(1,Math.min(30,Number(process.env.BEP_AI_FREE_MONTHLY_LIMIT)||10));
const BEP_AI_GLOBAL_MONTHLY_LIMIT=Math.max(1,Math.min(1000,Number(process.env.BEP_AI_GLOBAL_MONTHLY_LIMIT)||250));
function aiMonthKey(){return new Date().toISOString().slice(0,7)}
async function consumeBepAiQuota(userId){
 const month=aiMonthKey(),client=await pool.connect();
 try{
  await client.query("BEGIN");
  const global=await client.query("INSERT INTO bep_ai_global_usage(month_key,used) VALUES($1,1) ON CONFLICT(month_key) DO UPDATE SET used=bep_ai_global_usage.used+1,updated_at=NOW() WHERE bep_ai_global_usage.used < $2 RETURNING used",[month,BEP_AI_GLOBAL_MONTHLY_LIMIT]);
  if(!global.rowCount)throw Error("Le quota gratuit global de BEP est atteint pour ce mois. Le Coach structuré reste disponible.");
  const user=await client.query("INSERT INTO bep_ai_monthly_usage(user_id,month_key,used) VALUES($1,$2,1) ON CONFLICT(user_id,month_key) DO UPDATE SET used=bep_ai_monthly_usage.used+1,updated_at=NOW() WHERE bep_ai_monthly_usage.used < $3 RETURNING used",[userId,month,BEP_AI_FREE_MONTHLY_LIMIT]);
  if(!user.rowCount)throw Error("Tu as atteint ton quota gratuit du Coach IA pour ce mois. Le Coach structuré reste disponible.");
  await client.query("COMMIT");return{used:user.rows[0].used,limit:BEP_AI_FREE_MONTHLY_LIMIT,globalUsed:global.rows[0].used,globalLimit:BEP_AI_GLOBAL_MONTHLY_LIMIT,month};
 }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error}finally{client.release()}
}
async function releaseBepAiQuota(userId,month){
 const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE bep_ai_monthly_usage SET used=GREATEST(0,used-1),updated_at=NOW() WHERE user_id=$1 AND month_key=$2",[userId,month]);await client.query("UPDATE bep_ai_global_usage SET used=GREATEST(0,used-1),updated_at=NOW() WHERE month_key=$1",[month]);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}finally{client.release()}
}

function coachProfileGuidance(raw){
 const allowed={budget:"gestion du budget et équilibre revenus-charges",spending:"maîtrise des dépenses et identification d'économies",savings:"constitution d'une épargne et capacité d'épargne",goals:"progression vers des objectifs financiers",income:"compréhension et optimisation des ressources",debt:"maîtrise des dettes, crédits et remboursements",planning:"anticipation des dépenses futures et imprévus",learning:"explications pédagogiques et progression en éducation financière"};
 const selected=Array.isArray(raw)?[...new Set(raw.filter(x=>Object.prototype.hasOwnProperty.call(allowed,x)))].slice(0,8):[];
 return selected.length?"Profil d'accompagnement choisi par l'utilisateur : "+selected.map(x=>allowed[x]).join("; ")+". Adapte la priorité, les exemples et les recommandations à ces thématiques, sans ignorer la question posée ni les données réelles.":"Aucune préférence thématique n'est définie : conserve un accompagnement équilibré et contextuel.";
}

function structuredMoney(value){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(Number(value)||0)}
function structuredAdvice(zone,p){
 const income=Number(p.income)||0,charges=Number(p.charges)||0,available=Number(p.available)||0,expenses=Array.isArray(p.expenses)?p.expenses:[],goals=Array.isArray(p.goals)?p.goals:[],budgets=Array.isArray(p.budgets)?p.budgets:[];
 const spent=expenses.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0),top=budgets.slice().sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0))[0];
 if(zone==="income")return income>0?"Tes revenus enregistrés représentent "+structuredMoney(income)+" par mois. Vérifie que les revenus variables et exceptionnels restent distingués des ressources régulières.":"Aucun revenu mensuel positif n'est disponible dans les données transmises. Enregistre tes sources de revenus pour obtenir un conseil chiffré.";
 if(zone==="charges")return charges>0?"Tes charges enregistrées représentent "+structuredMoney(charges)+". Vérifie les échéances annuelles et les abonnements pour éviter les oublis ou doubles comptes.":"Aucun total de charges exploitable n'est disponible. Vérifie que tes charges fixes et variables sont bien enregistrées.";
 if(zone==="savings")return goals.length?"Tu as "+goals.length+" objectif(s) d'épargne enregistré(s). Choisis une priorité et vérifie que le versement prévu reste compatible avec ton disponible de "+structuredMoney(available)+".":"Aucun objectif d'épargne n'est enregistré. Commence par définir un objectif réaliste, sans fragiliser tes dépenses essentielles.";
 if(zone==="purchases")return "Pour évaluer un achat, compare son montant au disponible affiché de "+structuredMoney(available)+". Garde une marge pour les dépenses à venir avant de décider.";
 if(zone==="budget")return "Ton budget indique "+structuredMoney(income)+" de revenus et "+structuredMoney(charges)+" de charges, soit un disponible transmis de "+structuredMoney(available)+". "+(top?"Le poste le plus élevé enregistré est « "+String(top.label||top.category||"poste sans libellé").slice(0,70)+" » ("+structuredMoney(top.amount)+").":"Vérifie que chaque poste de dépense est bien renseigné.");
 if(zone==="home")return "Ta situation enregistrée présente "+structuredMoney(income)+" de revenus, "+structuredMoney(charges)+" de charges et "+structuredMoney(available)+" de disponible. "+(spent>0?"Les dépenses présentes dans l'historique transmis totalisent "+structuredMoney(spent)+".":"Ajoute tes opérations pour enrichir le suivi réel.")+" La priorité est de maintenir les données à jour avant toute décision.";
 return "Les données BEP sont disponibles. Vérifie les montants enregistrés et leur période avant de prendre une décision.";
}
function routeStructuredQuestion(question,p){
 const q=String(question||"").toLocaleLowerCase("fr"),income=Number(p.income)||0,charges=Number(p.charges)||0,available=Number(p.available)||0,expenses=Array.isArray(p.expenses)?p.expenses:[],goals=Array.isArray(p.goals)?p.goals:[];
 const money=structuredMoney;
 if(/\b(disponible|reste.?t.?il|reste.?il|reste dans mon budget|solde disponible)\b/.test(q))return "D'après les données BEP transmises, ton montant disponible est de "+money(available)+". Vérifie que les dernières dépenses et échéances sont enregistrées.";
 if(/\b(revenu|revenus|gagne|salaire)\b/.test(q)&&/\b(combien|quel|quelle|montant|total)\b/.test(q))return "Tes revenus enregistrés représentent "+money(income)+" par mois.";
 if(/\b(charge|charges|factures)\b/.test(q)&&/\b(combien|quel|quelle|montant|total)\b/.test(q))return "Tes charges enregistrées représentent "+money(charges)+".";
 if(/\b(depense|depenses|dépense|dépenses|achat|achats)\b/.test(q)&&/\b(combien|total|montant)\b/.test(q)){const total=expenses.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);return expenses.length?"Les dépenses présentes dans l'historique transmis totalisent "+money(total)+".":"Aucune dépense enregistrée n'est disponible dans les données transmises."}
 if(/\b(objectif|objectifs|epargne|épargne)\b/.test(q)&&/\b(combien|quel|quelle|liste|mes)\b/.test(q))return goals.length?"Tu as "+goals.length+" objectif(s) d'épargne enregistré(s) : "+goals.slice(0,5).map(x=>String(x.name||x.title||"objectif").slice(0,60)).join(", ")+".":"Aucun objectif d'épargne n'est enregistré pour le moment.";
 const purchase=q.match(/(?:acheter|achat|dépenser|depense|cout|coût)\D{0,35}(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[,.]\d{1,2})?|\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|euros?)/);
 if(purchase){const amount=Number(purchase[1].replace(/[ \u00a0\u202f]/g,"").replace(",","."));if(Number.isFinite(amount))return amount<=available?"Le montant de "+money(amount)+" est inférieur au disponible transmis de "+money(available)+". Garde toutefois une marge pour les dépenses à venir.":"Attention : "+money(amount)+" dépasse le disponible transmis de "+money(available)+". Cet achat serait hors du disponible actuel."}
 return null;
}
app.get("/api/ai/config",auth,async(req,res)=>{const r=await pool.query("SELECT provider,model,endpoint FROM bep_user_ai WHERE user_id=$1",[req.session.user.id]);res.setHeader("Cache-Control","no-store");res.json({configured:!!r.rowCount,...(r.rows[0]||{})})});
app.put("/api/ai/config",auth,async(req,res)=>res.status(410).json({message:"La connexion d'une clé IA personnelle est désactivée. Le Coach IA BEP intégré est utilisé automatiquement."}));
app.delete("/api/ai/config",auth,async(req,res)=>{await pool.query("DELETE FROM bep_user_ai WHERE user_id=$1",[req.session.user.id]);res.json({ok:true})});
app.post("/api/ai/test",auth,async(req,res)=>{let quota=null;try{const {cfg,key}=await userAi(req.session.user.id);quota=await consumeBepAiQuota(req.session.user.id);await invokeAi(cfg,key,[{role:"system",content:"Réponds uniquement OK."},{role:"user",content:"Test."}]);res.json({ok:true,provider:cfg.provider,model:cfg.model,quota})}catch(e){if(quota)await releaseBepAiQuota(req.session.user.id,quota.month).catch(()=>{});res.status(400).json({message:e.message})}});
app.get("/api/ai/status",auth,async(req,res)=>{try{
 const [u,g]=await Promise.all([pool.query("SELECT used FROM bep_ai_monthly_usage WHERE user_id=$1 AND month_key=$2",[req.session.user.id,aiMonthKey()]),pool.query("SELECT used FROM bep_ai_global_usage WHERE month_key=$1",[aiMonthKey()])]);
 const configured=!!String(process.env.BEP_AI_API_KEY||"").trim()&&!!aiProviders[String(process.env.BEP_AI_PROVIDER||"gemini").toLowerCase()]&&process.env.BEP_AI_ZERO_BILLING_CONFIRMED==="true";
 res.setHeader("Cache-Control","no-store");res.json({available:configured,mode:configured?"bep":"structured",provider:configured?String(process.env.BEP_AI_PROVIDER||"gemini").toLowerCase():"",model:configured?String(process.env.BEP_AI_MODEL||"gemini-3.5-flash"):"",used:Number(u.rows[0]?.used)||0,limit:BEP_AI_FREE_MONTHLY_LIMIT,globalUsed:Number(g.rows[0]?.used)||0,globalLimit:BEP_AI_GLOBAL_MONTHLY_LIMIT,month:aiMonthKey()});
 }catch(e){res.status(500).json({message:"Statut du Coach IA indisponible."})}});
app.post("/api/ai/advice",auth,async(req,res)=>{try{
 const zone=String(req.body?.zone||"home"),allowed=["home","budget","income","charges","savings","purchases"];
 if(!allowed.includes(zone))return res.status(400).json({message:"Zone de conseil invalide."});
 res.setHeader("Cache-Control","no-store");res.json({answer:structuredAdvice(zone,req.body?.financialContext||{}),provider:"bep-structured",model:"bep-financial-rules",mode:"structured",usage:null,quota:null});
 }catch(e){res.status(400).json({message:e.message||"Conseil BEP indisponible."})}});
app.use("/api/ai/chat",coachTelemetry);
app.post("/api/ai/chat",auth,async(req,res)=>{try{
 const q=String(req.body?.question||"").trim();
 if(!q||q.length>4000)return res.status(400).json({message:"Question invalide."});
 const p=req.body?.financialContext||{};
 const intelligence=await buildIntelligence({pool,userId:req.session.user.id,query:q,context:p,enabled:true});
 const structured=routeStructuredQuestion(q,p);
 const docs=Array.isArray(intelligence.knowledge)?intelligence.knowledge:[];
 let answer="";
 if(structured){
  answer=structured;
 }else if(docs.length){
  answer="J’ai retrouvé ces repères dans la base documentaire BEP.\n\n"+
   docs.slice(0,3).map((doc,index)=>(index+1)+". "+doc.title+"\n"+String(doc.content||"").trim()).join("\n\n")+
   "\n\nCes éléments constituent les références disponibles pour ta question. Si tu veux une recommandation plus précise, indique le montant, la période ou l’objectif concerné dans BEP.";
 }else{
  answer="Je n’ai pas trouvé de fiche suffisamment pertinente dans la base documentaire BEP pour répondre de façon fiable à cette question. Je préfère te le signaler plutôt que d’inventer une réponse. Tu peux reformuler avec un thème précis ou demander à l’administration d’enrichir la base documentaire.";
 }
 res.setHeader("Cache-Control","no-store");
 res.json({
  answer,provider:"bep-local",model:"bep-local-documentary",mode:structured?"structured":"structured-fallback",usage:null,quota:null,
  intelligence:{
   enabled:true,
   knowledge:docs.slice(0,6).map(x=>({title:x.title,source:x.source_name||"BEP",url:x.source_url||"",category:x.category,score:x.score||0})),
   context:{
    monthlyHistoryMonths:intelligence.context.monthlyHistory?.length||0,
    budgets:intelligence.context.budgets?.length||0,
    goals:intelligence.context.goals?.length||0,
    expenses:intelligence.context.expenses?.length||0,
    savingsOperations:intelligence.context.savingsOperations?.length||0,
    dataWarnings:intelligence.context.dataWarnings||[]
   }
  }
 });
 }catch(e){console.error("Local Coach answer failed",String(e?.message||e).slice(0,160));res.status(503).json({message:"Le Coach documentaire BEP est momentanément indisponible. Aucun fournisseur externe n’a été sollicité."})}});
app.get("/api/coach/library",auth,async(req,res)=>{try{
 const query=String(req.query.q||"").trim().slice(0,4000);
 const result=await readCoachLibrary({pool,userId:req.session.user.id,query,context:req.query.context&&typeof req.query.context==="object"?req.query.context:{},limit:Math.min(8,Math.max(1,Number(req.query.limit)||6))});
 res.setHeader("Cache-Control","no-store");res.json(result);
 }catch(e){console.error("Coach library read failed",String(e?.message||e).slice(0,160));res.status(503).json({error:"COACH_LIBRARY_UNAVAILABLE"})}});
app.get("/api/admin/bep-coach/research/status",auth,requireBepAgentAdmin,createCoachResearchStatusHandler({pool,env:process.env,logger:console}));
app.post("/api/admin/bep-coach/research",auth,requireBepAgentAdmin,async(req,res)=>{try{
 const query=String(req.body?.query||"").trim(),category=String(req.body?.category||"general");
 if(!query||query.length>RESEARCH_CONFIG.limits.query_max_length)return res.status(400).json({error:"INVALID_RESEARCH_QUERY"});
 const result=await researchWeb({pool,query,category});
 res.setHeader("Cache-Control","no-store");res.status(result.enabled?201:409).json(result);
 }catch(e){const diagnostic=String(e?.message||"Erreur fournisseur inconnue").replace(/[\r\n\t]+/g," ").slice(0,280);console.error("Coach web research failed",diagnostic);res.status(502).json({error:"COACH_RESEARCH_FAILED",message:diagnostic+" · Aucune connaissance n'a été publiée."})}});
app.post("/api/admin/bep-coach/candidates/manual",auth,requireBepAgentAdmin,rateLimit({windowMs:60*1000,max:20,scope:"admin-manual-import"}),async(req,res)=>{
 const parsed=validateManualKnowledge(req.body);
 if(parsed.error)return res.status(400).json({error:parsed.error});
 const item=parsed.value,client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[item.sourceSlug]);
  const active=await client.query("SELECT slug FROM bep_financial_knowledge WHERE slug=$1 UNION ALL SELECT slug FROM bep_agent_approved_knowledge WHERE slug=$1 LIMIT 1",[item.sourceSlug]);
  if(active.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"MANUAL_KNOWLEDGE_ALREADY_EXISTS"})}
  const pending=await client.query("SELECT id,input_digest,review_status FROM bep_knowledge_candidates WHERE source_slug=$1 AND proposal_type='create' AND review_status='pending' FOR UPDATE",[item.sourceSlug]);
  if(pending.rowCount){
   if(pending.rows[0].input_digest===item.inputDigest){await client.query("COMMIT");res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:true,id:Number(pending.rows[0].id),status:"pending",duplicate:true})}
   await client.query("ROLLBACK");return res.status(409).json({error:"MANUAL_CANDIDATE_ALREADY_PENDING"});
  }
  const inserted=await client.query("INSERT INTO bep_knowledge_candidates(source_slug,source_version,source_digest,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,review_status,input_digest) VALUES($1,$2,$3,'create',$4,$5,$6,$7,$8,$9,$10,'pending',$11) ON CONFLICT(source_slug,proposal_type,input_digest) DO NOTHING RETURNING id",[item.sourceSlug,item.sourceVersion,item.sourceDigest,item.title,item.content,item.sourceName,item.sourceUrl,item.evidenceLevel,item.confidence,item.rationale,item.inputDigest]);
  if(!inserted.rowCount){
   const existing=await client.query("SELECT id,review_status FROM bep_knowledge_candidates WHERE source_slug=$1 AND proposal_type='create' AND input_digest=$2",[item.sourceSlug,item.inputDigest]);
   await client.query("COMMIT");
   if(existing.rowCount&&existing.rows[0].review_status==="pending"){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:true,id:Number(existing.rows[0].id),status:"pending",duplicate:true})}
   return res.status(409).json({error:"MANUAL_CANDIDATE_ALREADY_SUBMITTED"});
  }
  await client.query("COMMIT");
  res.setHeader("Cache-Control","no-store");return res.status(201).json({ok:true,id:Number(inserted.rows[0].id),status:"pending",duplicate:false});
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("BEP manual knowledge import failed",String(e?.message||e).slice(0,140));
  return res.status(503).json({error:"MANUAL_IMPORT_UNAVAILABLE"});
 }finally{client.release()}
});
app.post("/api/admin/bep-coach/ingest",auth,requireBepAgentAdmin,async(req,res)=>{try{
 const url=String(req.body?.url||"").trim(),mode=String(req.body?.mode||"page"),category=String(req.body?.category||"general");
 if(!url||url.length>2048||!["page","deep"].includes(mode)||!RESEARCH_CONFIG.research_policy.categories.includes(category))return res.status(400).json({error:"INVALID_INGESTION_INPUT"});
 const result=await ingestManualSource({pool,url,mode,category});
 res.setHeader("Cache-Control","no-store");res.status(result.enabled?201:409).json(result);
 }catch(e){const diagnostic=String(e?.message||"Erreur de collecte inconnue").replace(/[\\r\\n\\t]+/g," ").slice(0,220);console.error("Coach manual source ingestion failed",diagnostic);const status=diagnostic.includes("URL_")||diagnostic.includes("SOURCE_")?400:502;res.status(status).json({error:"COACH_INGESTION_FAILED",message:diagnostic+" · Aucune connaissance publiée."})}});

app.get("/api/coach/knowledge",auth,async(req,res)=>{try{const r=await pool.query("SELECT id,kind,category,title,detail,priority,confidence,evidence,action,valid_until,source_provider,review_status,created_at FROM bep_user_coach_knowledge WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.session.user.id]);res.setHeader("Cache-Control","no-store");res.json({items:r.rows.map(x=>({id:x.id,kind:x.kind,category:x.category,title:x.title,detail:x.detail,priority:x.priority,confidence:x.confidence,evidence:x.evidence,action:x.action,valid_until:x.valid_until,provider:x.source_provider,status:x.review_status,created_at:x.created_at}))})}catch(e){console.error("Coach knowledge read failed",e.message);res.status(500).json({message:"Base de connaissances indisponible."})}});
app.post("/api/coach/knowledge",auth,async(req,res)=>{const items=req.body?.items,provider=String(req.body?.source_provider||"other");if(!Array.isArray(items)||items.length<1||items.length>100||!["chatgpt","gemini","claude","mistral","other"].includes(provider))return res.status(400).json({message:"Import BEP invalide."});const client=await pool.connect();let inserted=0;try{await client.query("BEGIN");for(const x of items){const kind=x?.kind==="recommendation"?"recommendation":x?.kind==="knowledge"?"knowledge":null,category=String(x?.category||"other"),title=String(x?.title||"").trim().slice(0,120),detail=String(x?.detail||"").trim().slice(0,1500),priority=["low","medium","high"].includes(x?.priority)?x.priority:"medium",confidence=["low","medium","high"].includes(x?.confidence)?x.confidence:"low",externalId=String(x?.id||"").trim().slice(0,80);const allowed=kind==="recommendation"?["budget","spending","savings","debt","behavior","other"]:["budget","spending","savings","behavior","general"];const dateCandidate=kind==="recommendation"?String(x.valid_until||""):"";const dateValid=!dateCandidate||(/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)&&!Number.isNaN(Date.parse(dateCandidate+"T00:00:00Z"))&&new Date(dateCandidate+"T00:00:00Z").toISOString().slice(0,10)===dateCandidate);if(!kind||!allowed.includes(category)||!title||!detail||!externalId||!dateValid)continue;const evidence=Array.isArray(x.evidence)?x.evidence.slice(0,8).map(v=>String(v).slice(0,300)):[],action=kind==="recommendation"?String(x.action||"").slice(0,500):"",validUntil=kind==="recommendation"&&/^\d{4}-\d{2}-\d{2}$/.test(x.valid_until||"")?x.valid_until:null;const r=await client.query("INSERT INTO bep_user_coach_knowledge(user_id,external_id,kind,category,title,detail,priority,confidence,evidence,action,valid_until,source_provider) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12) ON CONFLICT(user_id,external_id,kind) DO NOTHING RETURNING id",[req.session.user.id,externalId,kind,category,title,detail,priority,confidence,JSON.stringify(evidence),action,validUntil,provider]);if(r.rowCount)inserted++}await client.query("COMMIT");res.status(201).json({ok:true,inserted,received:items.length})}catch(e){await client.query("ROLLBACK");console.error("Coach knowledge import failed",e.message);res.status(500).json({message:"Import non enregistré. Aucune donnée financière n'a été modifiée."})}finally{client.release()}});
app.get("/api/admin/bep-coach/library",auth,requireBepAgentAdmin,async(req,res)=>{
 try{
  const query=String(req.query.q||"").trim().toLocaleLowerCase("fr").slice(0,160);
  const category=String(req.query.category||"all");
  const allowedCategories=new Set(["all","budget","spending","savings","debt","behavior","income","planning","general"]);
  if(!allowedCategories.has(category))return res.status(400).json({error:"INVALID_LIBRARY_CATEGORY"});
  const [base,overlays]=await Promise.all([
   pool.query("SELECT slug,category,title,content,keywords,source_name,source_url,evidence_level,version,active,updated_at FROM bep_financial_knowledge WHERE active=TRUE ORDER BY category,slug LIMIT 1000"),
   pool.query("SELECT slug,category,title,content,keywords,source_name,source_url,evidence_level,active,source_version,source_digest,version,updated_at FROM bep_agent_approved_knowledge ORDER BY category,slug").catch(()=>({rows:[]}))
  ]);
  const merged=new Map(base.rows.map(item=>[item.slug,item]));
  for(const item of overlays.rows){
   const source=merged.get(item.slug);
   if(!source||Number(source.version)!==Number(item.source_version)||sourceFingerprint(source)!==item.source_digest)continue;
   if(item.active)merged.set(item.slug,item);else merged.delete(item.slug);
  }
  const all=[...merged.values()].filter(item=>(category==="all"||item.category===category)&&(!query||[item.title,item.content,item.category,item.source_name,item.source_url,...(Array.isArray(item.keywords)?item.keywords:[])].join(" ").toLocaleLowerCase("fr").includes(query))).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))||String(a.title).localeCompare(String(b.title),"fr"));
  res.setHeader("Cache-Control","no-store");
  res.json({items:all.slice(0,100).map(item=>({slug:item.slug,category:item.category,title:item.title,content:item.content,keywords:item.keywords||[],source_name:item.source_name,source_url:item.source_url,evidence_level:item.evidence_level,version:Number(item.version)||1,updated_at:item.updated_at||null})),total:all.length,limit:100,truncated:all.length>100,readOnly:true});
 }catch(e){console.error("BEP admin Coach library read failed",String(e?.message||e).slice(0,160));res.status(503).json({error:"COACH_ADMIN_LIBRARY_UNAVAILABLE"})}
});
app.get("/api/admin/bep-coach/proposals.json",auth,requireBepAgentAdmin,createCoachProposalsDocumentHandler({pool,logger:console}));
app.get("/api/admin/bep-agent/candidates",auth,requireBepAgentAdmin,async(req,res)=>{
 const status=["pending","accepted","rejected"].includes(String(req.query.status||"pending"))?String(req.query.status||"pending"):"pending";
 try{
  const r=await pool.query("SELECT id,source_slug,proposal_type,title,content,source_name,source_url,evidence_level,confidence,rationale,review_status,created_at FROM bep_knowledge_candidates WHERE review_status=$1 ORDER BY created_at DESC LIMIT 100",[status]);
  res.setHeader("Cache-Control","no-store");res.json({items:r.rows});
 }catch(e){res.status(503).json({error:"AGENT_CANDIDATES_UNAVAILABLE"})}
});
app.post("/api/admin/bep-agent/run",auth,requireBepAgentAdmin,async(req,res)=>{
 if(!agentEnabled)return res.status(409).json({error:"AGENT_DISABLED"});
 const scope=String(req.body?.scope||"documentary_json");
 const jobTypes=scope==="documentary_json"?["knowledge_review"]:scope==="quality"?["coach_quality_review"]:scope==="all"?["knowledge_review","coach_quality_review"]:null;
 if(!jobTypes)return res.status(400).json({error:"INVALID_AGENT_SCOPE"});
 try{
  const queuedJobs={};
  for(const jobType of jobTypes){
   const result=await pool.query("INSERT INTO bep_agent_jobs(job_type,payload) VALUES($1,'{}'::jsonb) ON CONFLICT DO NOTHING RETURNING id",[jobType]);
   queuedJobs[jobType]=result.rows[0]?.id||null;
  }
  const execution=scheduleAdminAgentRun({pool,logger:console,maxJobs:jobTypes.length});
  if(!execution.scheduled&&!execution.busy)return res.status(503).json({error:"AGENT_EXECUTION_UNAVAILABLE"});
  res.status(202).json({queued:true,scope,jobTypes,queuedJobs,processingScheduled:execution.scheduled,busy:execution.busy===true});
 }catch(e){console.error("BEP admin agent enqueue failed",String(e?.message||e).slice(0,160));res.status(503).json({error:"AGENT_QUEUE_UNAVAILABLE"})}
});
app.get("/api/admin/bep-agent/status",auth,requireBepAgentAdmin,async(req,res)=>{
 const config=adminAgentStatus();
 const status={ready:agentEnabled,configured:config.enabled,mode:config.onDemandMode?"admin_on_demand":"disabled",model:config.model,maxCallsPerDay:config.maxCallsPerDay,freeTierAcknowledged:config.freeTierAcknowledged,reason:config.enabled?(agentEnabled?null:"Schéma PostgreSQL du robot non disponible."):config.disabledReason};
 res.setHeader("Cache-Control","no-store");
 if(!agentEnabled)return res.json(status);
 try{
  const [usage,queue,candidates]=await Promise.all([
   pool.query("SELECT calls,tokens FROM bep_agent_daily_usage WHERE day_key=CURRENT_DATE"),
   pool.query("SELECT status,COUNT(*)::int AS count FROM bep_agent_jobs GROUP BY status"),
   pool.query("SELECT COUNT(*)::int AS count FROM bep_knowledge_candidates WHERE review_status='pending'")
  ]);
  const callsUsed=Number(usage.rows[0]?.calls||0);
  status.dailyUsage={callsUsed,callsLimit:config.maxCallsPerDay,callsRemaining:Math.max(0,config.maxCallsPerDay-callsUsed),tokens:Number(usage.rows[0]?.tokens||0)};
  status.queue=Object.fromEntries(queue.rows.map(row=>[row.status,Number(row.count)]));
  status.pendingCandidates=Number(candidates.rows[0]?.count||0);
  res.json(status);
 }catch(e){console.error("BEP admin agent status failed",String(e?.message||e).slice(0,160));res.status(503).json({error:"AGENT_STATUS_UNAVAILABLE"})}
});
app.get("/api/admin/bep-agent/overview",auth,requireBepAgentAdmin,async(req,res)=>{
 try{
  const [runs,metrics,coach]=await Promise.all([
   pool.query("SELECT id,job_type,status,model,input_digest,output_digest,output_summary,usage,error_code,started_at,finished_at FROM bep_agent_runs ORDER BY finished_at DESC LIMIT 30"),
   pool.query("SELECT day_key,jobs_completed,jobs_failed,candidates_created,quality_findings FROM bep_agent_metrics ORDER BY day_key DESC LIMIT 30"),
   pool.query("SELECT day_key,mode,status_code,calls,total_latency_ms,total_tokens FROM bep_agent_coach_metrics WHERE day_key>=CURRENT_DATE-INTERVAL '30 days' ORDER BY day_key DESC,mode LIMIT 120")
  ]);
  res.setHeader("Cache-Control","no-store");res.json({runs:runs.rows,agentMetrics:metrics.rows,coachMetrics:coach.rows});
 }catch(e){res.status(503).json({error:"AGENT_OVERVIEW_UNAVAILABLE"})}
});
app.post("/api/admin/bep-agent/candidates/:id/review",auth,requireBepAgentAdmin,async(req,res)=>{
 const id=Number(req.params.id),decision=String(req.body?.decision||"");
 if(!Number.isSafeInteger(id)||id<1||!["approve","reject"].includes(decision))return res.status(400).json({error:"INVALID_REVIEW"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT * FROM bep_knowledge_candidates WHERE id=$1 FOR UPDATE",[id]);
  if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"CANDIDATE_NOT_FOUND"})}
  const candidate=found.rows[0];
  if(candidate.review_status!=="pending"){await client.query("ROLLBACK");return res.status(409).json({error:"CANDIDATE_ALREADY_REVIEWED"})}
  if(decision==="approve"){
   if(String(candidate.source_slug).startsWith("manual-")){
    const match=/^manual-(budget|spending|savings|debt|behavior|income|planning|general)-([a-f0-9]{24})$/.exec(String(candidate.source_slug));
    const category=match?.[1],validated=match?validateManualKnowledge({title:candidate.title,category,content:candidate.content,source_name:candidate.source_name,source_url:candidate.source_url,evidence_level:candidate.evidence_level,confidence:candidate.confidence,rationale:candidate.rationale}):{value:null};
    if(!match||candidate.proposal_type!=="create"||Number(candidate.source_version)!==1||!validated.value||validated.value.sourceSlug!==candidate.source_slug||validated.value.sourceDigest!==candidate.source_digest||validated.value.inputDigest!==candidate.input_digest){await client.query("ROLLBACK");return res.status(409).json({error:"MANUAL_CANDIDATE_INVALID"})}
    const exists=await client.query("SELECT slug FROM bep_financial_knowledge WHERE slug=$1 UNION ALL SELECT slug FROM bep_agent_approved_knowledge WHERE slug=$1 LIMIT 1",[candidate.source_slug]);
    if(exists.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"MANUAL_KNOWLEDGE_ALREADY_EXISTS"})}
    const keywords=[...new Set((String(candidate.title)+" "+String(candidate.content)).toLocaleLowerCase("fr").match(/[a-z0-9]{4,}/g)||[])].slice(0,20);
    const inserted=await client.query("INSERT INTO bep_financial_knowledge(slug,category,title,content,keywords,source_name,source_url,evidence_level,version,active) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,1,TRUE) ON CONFLICT(slug) DO NOTHING RETURNING slug",[candidate.source_slug,category,candidate.title,candidate.content,JSON.stringify(keywords),candidate.source_name,candidate.source_url,candidate.evidence_level]);
    if(!inserted.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"MANUAL_KNOWLEDGE_ALREADY_EXISTS"})}
   }else if(String(candidate.source_slug).startsWith("web-")){
    const match=/^web-(budget|spending|savings|debt|behavior|income|planning|general)-([a-f0-9]{24})$/.exec(String(candidate.source_slug));
    if(!match||candidate.proposal_type!=="update"||candidate.evidence_level!=="web_research_pending"||!/^https:\/\//.test(String(candidate.source_url||""))){await client.query("ROLLBACK");return res.status(409).json({error:"WEB_CANDIDATE_INVALID"})}
    const category=match[1],sourceDoc={slug:candidate.source_slug,category,title:candidate.title,content:candidate.content,source_name:candidate.source_name,source_url:candidate.source_url,evidence_level:candidate.evidence_level,version:1};
    if(digestWebCandidate(candidate,category)!==candidate.source_digest||sourceFingerprint(sourceDoc)!==candidate.source_digest){await client.query("ROLLBACK");return res.status(409).json({error:"WEB_CANDIDATE_CHANGED"})}
    const keywords=[...new Set((String(candidate.title)+" "+String(candidate.content)).toLocaleLowerCase("fr").match(/[a-z0-9]{4,}/g)||[])].slice(0,20);
    const inserted=await client.query("INSERT INTO bep_financial_knowledge(slug,category,title,content,keywords,source_name,source_url,evidence_level,version,active) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'web_research',1,TRUE) ON CONFLICT(slug) DO NOTHING RETURNING slug",[candidate.source_slug,category,candidate.title,candidate.content,JSON.stringify(keywords),candidate.source_name,candidate.source_url]);
    if(!inserted.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"WEB_KNOWLEDGE_ALREADY_EXISTS"})}
   }else{
    const source=await client.query("SELECT slug,category,title,content,keywords,source_name,source_url,evidence_level,version FROM bep_financial_knowledge WHERE slug=$1 FOR UPDATE",[candidate.source_slug]);
    if(!source.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"SOURCE_DOCUMENT_NOT_FOUND"})}
    const original=source.rows[0],currentSourceDigest=sourceFingerprint(original);
    if(original.source_name!==candidate.source_name||original.source_url!==candidate.source_url||original.evidence_level!==candidate.evidence_level){await client.query("ROLLBACK");return res.status(409).json({error:"SOURCE_PROVENANCE_CHANGED"})}
    if(Number(original.version)!==Number(candidate.source_version)||currentSourceDigest!==candidate.source_digest){await client.query("ROLLBACK");return res.status(409).json({error:"SOURCE_DOCUMENT_CHANGED"})}
    const deactivate=candidate.proposal_type==="deactivate";
    await client.query("INSERT INTO bep_agent_approved_knowledge(slug,category,title,content,keywords,source_name,source_url,evidence_level,source_version,source_digest,version,active,approved_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,1,$11,$12) ON CONFLICT(slug) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,content=EXCLUDED.content,keywords=EXCLUDED.keywords,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,evidence_level=EXCLUDED.evidence_level,source_version=EXCLUDED.source_version,source_digest=EXCLUDED.source_digest,version=bep_agent_approved_knowledge.version+1,active=EXCLUDED.active,approved_by=EXCLUDED.approved_by,updated_at=NOW()",[original.slug,original.category,deactivate?original.title:candidate.title,deactivate?original.content:candidate.content,JSON.stringify(original.keywords||[]),original.source_name,original.source_url,original.evidence_level,Number(original.version),candidate.source_digest,!deactivate,String(req.session.user.id)]);
   }
  }
  await client.query("UPDATE bep_knowledge_candidates SET review_status=$2,reviewed_at=NOW() WHERE id=$1",[id,decision==="approve"?"accepted":"rejected"]);
  await client.query("COMMIT");res.json({ok:true,id,decision});
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("BEP agent candidate review failed",String(e?.message||e).slice(0,160));
  res.status(500).json({error:"CANDIDATE_REVIEW_FAILED"});
 }finally{client.release()}
});
app.use("/api/budgets",createMonthlyBudgetRouter({pool,auth}));
app.get("/api/data",auth,async(req,res)=>{const r=await pool.query("SELECT payload,updated_at FROM bep_user_data WHERE user_id=$1",[req.session.user.id]);res.json(r.rows[0]||{payload:{income:0,budgets:[],expenses:[],goals:[]}})});
app.put("/api/data",auth,async(req,res)=>{
 const offlineSync=req.body?.__bepOfflineSync===true;
 const base=offlineSync?req.body?.base:null;
 let p=offlineSync?req.body?.payload:req.body;
 if(!p||typeof p!=="object"||Array.isArray(p)||JSON.stringify(p).length>500000||
    (offlineSync&&(!base||typeof base!=="object"||Array.isArray(base)||JSON.stringify(base).length>500000)))return res.status(400).json({error:"INVALID_PAYLOAD"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("INSERT INTO bep_user_data(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.session.user.id]);
  const current=await client.query("SELECT payload FROM bep_user_data WHERE user_id=$1 FOR UPDATE",[req.session.user.id]);
  const previous=current.rows[0]?.payload||{income:0,incomes:[],budgets:[],expenses:[],goals:[],transactions:[],savingsOperations:[]};
  if(offlineSync){
    try{p=mergeOfflinePayload(base,p,previous)}
    catch(error){await client.query("ROLLBACK");if(error.code==="OFFLINE_CONFLICT")return res.status(409).json({error:"OFFLINE_CONFLICT",conflictPath:String(error.path||"").slice(0,180)});throw error}
    if(JSON.stringify(p).length>500000){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_PAYLOAD"})}
   }else{
   const financialKeys=["incomes","budgets","expenses","goals","transactions","savingsOperations"];
   const hasFinancialData=Number(previous.income)!==0||financialKeys.some(key=>Object.prototype.hasOwnProperty.call(previous,key)&&(!Array.isArray(previous[key])||previous[key].length>0));
   const hasOtherData=Object.entries(previous).some(([key,value])=>!["income",...financialKeys,"coachProfile"].includes(key)&&value!=null&&value!==""&&value!==false&&(!Array.isArray(value)||value.length>0)&&(!(value&&typeof value==="object")||Object.keys(value).length>0));
   const hasProfile=Object.prototype.hasOwnProperty.call(previous,"coachProfile")&&(!Array.isArray(previous.coachProfile)||previous.coachProfile.length>0);
   if(hasFinancialData||hasOtherData||hasProfile){await client.query("ROLLBACK");return res.status(409).json({error:"OFFLINE_SYNC_REQUIRED"});}
  }
  const goals=Array.isArray(p.goals)?p.goals:(Array.isArray(previous.goals)?previous.goals:[]);
  const suppliedOps=Object.prototype.hasOwnProperty.call(p,"savingsOperations")?p.savingsOperations:[];
  if(!Array.isArray(suppliedOps)||suppliedOps.length>5000){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_LEDGER"});}
  const ledgerMap=new Map();
  for(const o of (Array.isArray(previous.savingsOperations)?previous.savingsOperations:[])){
   if(!o||typeof o.id!=="string"||!o.id.trim()||ledgerMap.has(o.id)){await client.query("ROLLBACK");return res.status(409).json({error:"SAVINGS_LEDGER_CORRUPT"})}
   ledgerMap.set(o.id,o);
  }
  const suppliedIds=new Set();
  for(const o of suppliedOps){
   if(!o||typeof o!=="object"||Array.isArray(o)||typeof o.id!=="string"||!o.id.trim()||suppliedIds.has(o.id)){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_LEDGER"})}
   suppliedIds.add(o.id);
   if(ledgerMap.has(o.id)){
    const existing=ledgerMap.get(o.id);
    if(existing.type!==o.type||existing.goalId!==o.goalId||Number(existing.amount)!==Number(o.amount)||existing.date!==o.date||(existing.reversalOf||null)!==(o.reversalOf||null)){await client.query("ROLLBACK");return res.status(409).json({error:"SAVINGS_OPERATION_ID_CONFLICT"})}
   }else{ledgerMap.set(o.id,o)}
  }
  const incomingOps=Array.from(ledgerMap.values());
  if(incomingOps.length>5000){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_LEDGER"});}
  const goalIds=new Set(goals.filter(g=>g&&typeof g.id==="string"&&g.id.trim()).map(g=>g.id));
  const ids=new Set(),reversals=new Map(),ops=[];
  for(const o of incomingOps){
   if(!o||typeof o!=="object"||Array.isArray(o)||typeof o.id!=="string"||!o.id.trim()||o.id.length>128||ids.has(o.id)||!["deposit","withdrawal"].includes(o.type)||typeof o.goalId!=="string"||!goalIds.has(o.goalId)||!Number.isFinite(Number(o.amount))||Number(o.amount)<=0||Number(o.amount)>10000000||Math.abs(Number(o.amount)*100-Math.round(Number(o.amount)*100))>1e-7||typeof o.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||Number.isNaN(Date.parse(o.date+"T00:00:00Z"))||new Date(o.date+"T00:00:00Z").toISOString().slice(0,10)!==o.date){
    await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_LEDGER"});
   }
   ids.add(o.id);ops.push(o);
   if(o.reversalOf!==undefined){
    if(typeof o.reversalOf!=="string"||!o.reversalOf.trim()||reversals.has(o.reversalOf)){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_REVERSAL"})}
    reversals.set(o.reversalOf,o);
   }
  }
  for(const [targetId,reversal] of reversals){
   const target=ops.find(o=>o.id===targetId);
   if(!target||target.reversalOf||ops.indexOf(reversal)<=ops.indexOf(target)||reversal.date<target.date||target.goalId!==reversal.goalId||Number(target.amount)!==Number(reversal.amount)||target.type===reversal.type){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_SAVINGS_REVERSAL"})}
  }
  const balances=new Map();
  const ordered=ops.map((o,index)=>({o,index})).sort((a,b)=>a.o.date.localeCompare(b.o.date)||a.index-b.index);
  for(const {o} of ordered){
   const next=(balances.get(o.goalId)||0)+(o.type==="deposit"?1:-1)*Number(o.amount);
   if(next < -0.005){await client.query("ROLLBACK");return res.status(400).json({error:"SAVINGS_BALANCE_NEGATIVE"})}
   balances.set(o.goalId,next);
  }
  const rawCoachProfile=Object.prototype.hasOwnProperty.call(p,"coachProfile")?p.coachProfile:previous.coachProfile;const coachProfile=Array.isArray(rawCoachProfile)?[...new Set(rawCoachProfile.filter(x=>["budget","spending","savings","goals","income","debt","planning","learning"].includes(x)))].slice(0,8):[];
  // Preserve the bank-authorized overdraft independently from monthly financial calculations.
  const rawTreasury=Object.prototype.hasOwnProperty.call(p,"treasury")?p.treasury:previous.treasury;
  const treasurySource=rawTreasury===undefined?{overdraftLimit:0}:rawTreasury&&typeof rawTreasury==="object"&&!Array.isArray(rawTreasury)?rawTreasury:{};
  const overdraftLimit=Number(treasurySource.overdraftLimit);
  if(!Number.isFinite(overdraftLimit)||overdraftLimit<0||overdraftLimit>1000000){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_TREASURY"});}
  const treasury={overdraftLimit};
  const rawDeletedRecords=p.deletedRecords&&typeof p.deletedRecords==="object"&&!Array.isArray(p.deletedRecords)?p.deletedRecords:{};const deletedRecords={};for(const key of ["incomes","budgets","expenses","goals","transactions"]){const previousIds=Array.isArray(previous.deletedRecords?.[key])?previous.deletedRecords[key]:[];const values=rawDeletedRecords[key]===undefined?previousIds:rawDeletedRecords[key];if(!Array.isArray(values)||values.length>10000||values.some(id=>typeof id!=="string"||!id.length||id.length>128)){await client.query("ROLLBACK");return res.status(400).json({error:"INVALID_DELETION_LEDGER"});}deletedRecords[key]=[...new Set([...previousIds,...values])].slice(-10000)}const safe={income:Number(p.income)||0,incomes:Array.isArray(p.incomes)?p.incomes:[],budgets:Array.isArray(p.budgets)?p.budgets:[],expenses:Array.isArray(p.expenses)?p.expenses:[],goals,transactions:Array.isArray(p.transactions)?p.transactions.slice(-2000):[],savingsOperations:incomingOps.slice(-5000),coachProfile,treasury,deletedRecords};
  await client.query("INSERT INTO bep_user_data(user_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",[req.session.user.id,JSON.stringify(safe)]);
  await client.query("COMMIT");
  res.json({ok:true,updatedAt:new Date().toISOString(),payload:safe});
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  console.error("User data save failed",e.message);
  res.status(500).json({error:"DATA_SAVE_FAILED"});
 }finally{client.release()}
});
app.use((req,res)=>res.status(404).json({error:"NOT_FOUND"}));
app.listen(port,"0.0.0.0",()=>{console.log("BEP V2 server listening",port);(async()=>{for(let attempt=1;attempt<=5;attempt++){try{await init();dbReady=true;dbInitError=null;console.log("BEP database initialization complete");try{
 const agentConfig=adminAgentStatus();
 if(agentConfig.enabled){
  if(process.env.BEP_AGENT_SCHEMA_MIGRATE==="true"){
   await ensureBepAgentSchema(pool);
   console.info("BEP Gemini additive schema migration completed by explicit startup flag");
  }
  const schema=await pool.query("SELECT to_regclass('public.bep_agent_jobs') AS jobs,to_regclass('public.bep_agent_runs') AS runs,to_regclass('public.bep_knowledge_candidates') AS candidates,to_regclass('public.bep_agent_daily_usage') AS usage,to_regclass('public.bep_agent_metrics') AS metrics,to_regclass('public.bep_agent_approved_knowledge') AS approved,to_regclass('public.bep_agent_coach_metrics') AS coach_metrics");
  agentEnabled=Object.values(schema.rows[0]||{}).every(Boolean);
  if(!agentEnabled)console.warn("BEP Gemini admin mode disabled: additive agent schema is not migrated");
 }else console.info("BEP Gemini admin mode disabled:",agentConfig.disabledReason);
 agentTelemetryReady=agentEnabled;
}catch(agentError){agentEnabled=false;agentTelemetryReady=false;console.error("BEP Gemini admin configuration failed",String(agentError?.message||agentError).slice(0,180))}return}catch(e){dbReady=false;dbInitError=e.message;console.error("DB init attempt failed",JSON.stringify({attempt,message:e.message}));if(attempt<5)await new Promise(resolve=>setTimeout(resolve,Math.min(1000*2**(attempt-1),10000)))}}console.error("BEP database initialization did not complete; HTTP server remains available for diagnostics")})()});
