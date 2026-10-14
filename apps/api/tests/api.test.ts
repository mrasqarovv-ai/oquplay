import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { demoGame, demoSource, type Answers, type AttemptResult, type GameContent } from '@oquplay/shared';
if(!process.env.TEST_DATABASE_URL)throw new Error('Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database. Tests create records.');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.NODE_ENV='test';
const {buildApp}=await import('../src/app');
const {prisma}=await import('../src/db');
const app=await buildApp({testing:true,mode:'demo'});
after(async()=>{await app.close();await prisma.$disconnect();});
const request=async(method:'GET'|'POST'|'PUT',url:string,token?:string,body?:unknown,key?:string)=>app.inject({method,url:`/api${url}`,headers:{'x-oquplay-client':'native',...(token?{authorization:`Bearer ${token}`} : {}),...(key?{'idempotency-key':key}:{})},...(body!==undefined?{payload:body as object}:{})});
async function register(role='TEACHER'){const r=await request('POST','/auth/register',undefined,{email:`${randomUUID()}@example.test`,password:'Testing-password-2026',name:role,role});assert.equal(r.statusCode,200,r.body);return r.json() as {token:string;user:{id:string}};}
async function guest(){const r=await request('POST','/auth/session');assert.equal(r.statusCode,200,r.body);return r.json().token as string;}
async function create(token:string,type:'quiz'|'matching'|'ordering'='quiz'){const r=await request('POST','/games',token,{content:demoGame(type,'kk'),source:demoSource('kk'),timeLimitSec:null,isDemo:true});assert.equal(r.statusCode,200,r.body);return r.json() as {id:string;revision:number};}
async function publish(token:string,g:{id:string;revision:number}){const r=await request('POST',`/games/${g.id}/publish`,token,{reviewed:true,revision:g.revision});assert.equal(r.statusCode,200,r.body);return r.json().code as string;}
async function join(token:string,code:string,key=randomUUID()){const r=await request('POST','/join',token,{code,nickname:'Learner'},key);assert.equal(r.statusCode,200,r.body);return r.json().id as string;}
async function correctAnswers(id:string){const a=await prisma.attempt.findUniqueOrThrow({where:{id}});const g=a.playContent as unknown as GameContent;const answers:Answers={};if(g.gameType==='quiz')g.items.forEach(q=>answers[q.id]=q.correctOptionId);if(g.gameType==='matching')g.items.forEach(p=>answers[p.left.id]=p.right.id);if(g.gameType==='ordering')g.items.forEach(q=>answers[q.id]=q.correctOrder);return answers;}

test('web authentication uses HttpOnly cookies, never returns tokens, rejects other origins',async()=>{
 const wrong=await app.inject({method:'POST',url:'/api/auth/session',headers:{origin:'https://evil.example'}});assert.equal(wrong.statusCode,403);
 const web=await app.inject({method:'POST',url:'/api/auth/session',headers:{origin:process.env.WEB_ORIGIN??'http://localhost:8081'}});assert.equal(web.statusCode,200,web.body);assert.equal('token'in web.json(),false);assert.match(String(web.headers['set-cookie']),/HttpOnly/i);assert.match(String(web.headers['set-cookie']),/SameSite=Lax/i);
});
test('ownership enforced for editor, duplicate, publish and teacher analytics',async()=>{
 const owner=await register(),other=await register(),student=await register('STUDENT'),game=await create(owner.token);
 for(const [method,url,body]of[['GET',`/games/${game.id}`,undefined],['PUT',`/games/${game.id}`,{content:demoGame('quiz','kk'),source:demoSource('kk'),timeLimitSec:null,isDemo:true,revision:1}],['POST',`/games/${game.id}/duplicate`,undefined],['POST',`/games/${game.id}/publish`,{reviewed:true,revision:1}],['GET',`/games/${game.id}/analytics`,undefined]]as const){const r=await request(method,url,other.token,body);assert.equal(r.statusCode,404,r.body);}
 const ownStudentGame=await create(student.token);assert.equal((await request('POST',`/games/${ownStudentGame.id}/publish`,student.token,{reviewed:true,revision:1})).statusCode,403);
 const privateAttempt=await request('POST',`/games/${ownStudentGame.id}/practice`,student.token,undefined,randomUUID());assert.equal(privateAttempt.statusCode,200,privateAttempt.body);
});
test('guest completes three games; answer keys withheld and server rejects forged score',async()=>{
 const teacher=await register(),token=await guest();
 for(const type of ['quiz','matching','ordering']as const){const game=await create(teacher.token,type),code=await publish(teacher.token,game),id=await join(token,code);
  const publicResponse=await request('GET',`/attempts/${id}`,token);assert.equal(publicResponse.statusCode,200);assert.doesNotMatch(publicResponse.body,/"(correctOptionId|correctOrder|evidence|source|playContent)":/);
  const answers=await correctAnswers(id),forged=await request('POST',`/attempts/${id}/submit`,token,{answers,score:999});assert.equal(forged.statusCode,422);
  const graded=await request('POST',`/attempts/${id}/submit`,token,{answers});assert.equal(graded.statusCode,200,graded.body);const result=graded.json<AttemptResult>();assert.equal(result.percent,100);assert.equal(result.review.length,5);
  const stranger=await guest();assert.equal((await request('GET',`/attempts/${id}`,stranger)).statusCode,404);assert.equal((await request('POST',`/attempts/${id}/submit`,stranger,{answers})).statusCode,404);
 }
});
test('immutable versions preserve results; retries count one participant; duplicate submits are idempotent',async()=>{
 const teacher=await register(),token=await guest(),game=await create(teacher.token),code=await publish(teacher.token,game),startKey=randomUUID(),id=await join(token,code,startKey);
 assert.equal(await join(token,code,startKey),id);
 const answers=await correctAnswers(id),responses=await Promise.all([request('POST',`/attempts/${id}/submit`,token,{answers}),request('POST',`/attempts/${id}/submit`,token,{answers:{}})]);
 assert.deepEqual(responses[0]!.json(),responses[1]!.json());assert.equal(await prisma.answer.count({where:{attemptId:id}}),5);
 const retry=await request('POST',`/attempts/${id}/retry`,token,undefined,randomUUID());assert.equal(retry.statusCode,200,retry.body);const id2=retry.json().id as string;await request('POST',`/attempts/${id2}/submit`,token,{answers:{}});
 const stats=(await request('GET',`/games/${game.id}/analytics`,teacher.token)).json();assert.equal(stats.participants,1);assert.equal(stats.attempts,2);assert.equal(stats.rows[0].best,100);assert.equal(stats.rows[0].last,0);
 const oldResult=(await request('GET',`/attempts/${id}`,token)).json().result;
 const updated=demoGame('quiz','kk');updated.title='Updated version';const put=await request('PUT',`/games/${game.id}`,teacher.token,{content:updated,source:demoSource('kk'),timeLimitSec:null,isDemo:true,revision:1});assert.equal(put.statusCode,200,put.body);
 await publish(teacher.token,{id:game.id,revision:2});assert.deepEqual((await request('GET',`/attempts/${id}`,token)).json().result,oldResult);assert.equal((await request('POST','/join',token,{code,nickname:'Learner'},randomUUID())).statusCode,404);
});
test('closed/invalid codes, revision conflict and explicit teacher review',async()=>{
 const teacher=await register(),token=await guest(),game=await create(teacher.token);assert.equal((await request('POST',`/games/${game.id}/publish`,teacher.token,{reviewed:false,revision:1})).statusCode,422);
 const code=await publish(teacher.token,game);await request('POST',`/games/${game.id}/close`,teacher.token);
 for(const c of[code,'AAAAAAAAAAAAAAAA'])assert.equal((await request('POST','/join',token,{code:c,nickname:'X'},randomUUID())).statusCode,404);
 const stale=await request('PUT',`/games/${game.id}`,teacher.token,{content:demoGame('quiz','kk'),source:demoSource('kk'),timeLimitSec:null,isDemo:true,revision:99});assert.equal(stale.statusCode,409);
});
test('generation is authenticated, explicitly demo-only and idempotent; student history remains private',async()=>{
 const teacher=await register(),student=await register('STUDENT'),token=await guest();const g=demoGame('quiz','kk'),settings={source:demoSource('kk'),subject:g.subject,topic:g.title,grade:6,language:'kk',difficulty:'A',gameType:'quiz',count:5};
 assert.equal((await request('POST','/generations',token,{settings},randomUUID())).statusCode,401);
 const key=randomUUID(),r=await request('POST','/generations',teacher.token,{settings},key);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().isDemo,true);assert.deepEqual((await request('POST','/generations',teacher.token,{settings},key)).json(),r.json());
 const bad=await request('POST','/generations',teacher.token,{settings:{...settings,source:'Different unrelated user material. '.repeat(5)}},randomUUID());assert.equal(bad.statusCode,422);assert.equal(bad.json().error,'demo_sample_only');
 const game=await create(teacher.token),code=await publish(teacher.token,game),id=await join(student.token,code);await request('POST',`/attempts/${id}/submit`,student.token,{answers:{}});assert.equal((await request('GET','/history',student.token)).json().length,1);assert.equal((await request('GET','/history',teacher.token)).json().length,0);
});
test('concurrent joins reserve one attempt and retry keys cannot select another game or the original attempt',async()=>{
 const teacher=await register(),token=await guest(),first=await create(teacher.token),second=await create(teacher.token);
 const firstCode=await publish(teacher.token,first),secondCode=await publish(teacher.token,second),firstKey=randomUUID(),secondKey=randomUUID();
 const concurrent=await Promise.all([request('POST','/join',token,{code:firstCode,nickname:'Learner'},firstKey),request('POST','/join',token,{code:firstCode,nickname:'Learner'},firstKey)]);
 for(const response of concurrent)assert.equal(response.statusCode,200,response.body);
 const firstId=concurrent[0]!.json().id as string;assert.equal(concurrent[1]!.json().id,firstId);
 assert.equal(await prisma.attempt.count({where:{participantKey:`guest:${(await prisma.attempt.findUniqueOrThrow({where:{id:firstId}})).sessionId}`,startKey:firstKey}}),1);
 const secondId=await join(token,secondCode,secondKey);await request('POST',`/attempts/${secondId}/submit`,token,{answers:{}});
 for(const key of [firstKey,secondKey]){
  const conflict=await request('POST',`/attempts/${secondId}/retry`,token,undefined,key);assert.equal(conflict.statusCode,409,conflict.body);assert.equal(conflict.json().error,'idempotency_conflict');
 }
 const retryKey=randomUUID(),retries=await Promise.all([request('POST',`/attempts/${secondId}/retry`,token,undefined,retryKey),request('POST',`/attempts/${secondId}/retry`,token,undefined,retryKey)]);
 for(const response of retries)assert.equal(response.statusCode,200,response.body);
 assert.equal(retries[0]!.json().id,retries[1]!.json().id);assert.notEqual(retries[0]!.json().id,secondId);
 assert.equal(await prisma.attempt.count({where:{versionId:(await prisma.attempt.findUniqueOrThrow({where:{id:secondId}})).versionId,startKey:retryKey}}),1);
});
test('demo generation preserves edited task order after moves and deletions in both languages',async()=>{
 for(const type of ['quiz','matching','ordering']as const)for(const language of ['kk','ru']as const){
  const teacher=await register(),sample=demoGame(type,language),settings={source:demoSource(language),subject:sample.subject,topic:sample.title,grade:6,language,difficulty:'A',gameType:type,count:5};
  for(const deleted of [false,true]){
   const existing=structuredClone(sample);if(deleted)existing.items.splice(0,1);existing.items.reverse();existing.items[0]!.explanation='Edited task';
   const targetId=existing.items[0]!.id,response=await request('POST','/generations',teacher.token,{settings,existing,replaceItemId:targetId},randomUUID());
   assert.equal(response.statusCode,200,response.body);const expected=structuredClone(existing);expected.items[0]=structuredClone(sample.items.find(item=>item.id===targetId)!);
   assert.deepEqual(response.json().content,expected);
  }
 }
});
test('live task regeneration repairs colliding provider IDs through the authenticated API',async()=>{
 const live=await buildApp({testing:true,mode:'live',provider:{generate:async(input,count)=>{
  assert.equal(count,1);const content=demoGame(input.gameType,input.language);content.items.splice(1);
  if(content.gameType==='matching'){content.items[0]!.left.text='New explorer';content.items[0]!.right.text='New year';}
  return{status:'ok',message:'',game:content};
 }}});
 try{
  for(const type of ['quiz','matching','ordering']as const){
   const teacher=await register(),existing=demoGame(type,'kk'),targetId=existing.items[1]!.id;
   const response=await live.inject({method:'POST',url:'/api/generations',headers:{'x-oquplay-client':'native',authorization:`Bearer ${teacher.token}`,'idempotency-key':randomUUID()},payload:{settings:{source:demoSource('kk'),subject:existing.subject,topic:existing.title,grade:6,language:'kk',difficulty:'A',gameType:type,count:5},existing,replaceItemId:targetId}});
   assert.equal(response.statusCode,200,response.body);const result=response.json().content as GameContent;
   assert.equal(result.items[1]!.id,targetId);assert.deepEqual(result.items[0],existing.items[0]);assert.equal(response.json().isDemo,false);
  }
 }finally{await live.close();}
});
