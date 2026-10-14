import test from 'node:test';
import assert from 'node:assert/strict';
import { demoGame, demoSource, GameSchema, evidenceIssues, type GameType, type GenerationInput, type Answers } from '@oquplay/shared';
import { gradeGame, prepareGame } from '../src/gameplay';
import { generateValidated, OpenAIResponsesProvider, type LLMProvider } from '../src/llm';
import { replaceGeneratedItem } from '../src/regeneration';
const input:GenerationInput={source:demoSource('kk'),subject:demoGame('quiz','kk').subject,topic:demoGame('quiz','kk').title,grade:6,language:'kk',difficulty:'A',gameType:'quiz',count:5};
test('six bilingual demo fixtures satisfy schema and verbatim evidence',()=>{
 for(const type of ['quiz','matching','ordering']as const)for(const lang of ['kk','ru']as const){const g=demoGame(type,lang);assert.ok(GameSchema.safeParse(g).success);assert.deepEqual(evidenceIssues(g,demoSource(lang)),[]);}
});
test('demo item regeneration preserves reordered tasks and restores the selected stable ID in both languages',()=>{
 for(const type of ['quiz','matching','ordering']as const)for(const lang of ['kk','ru']as const){
  const sample=demoGame(type,lang),existing=structuredClone(sample);
  [existing.items[0],existing.items[1]]=[existing.items[1]!,existing.items[0]!];
  const target=existing.items[0]!;target.explanation='Edited task';existing.items[4]!.explanation='Keep this edit';
  const before=structuredClone(existing),expected=structuredClone(existing);
  expected.items[0]=structuredClone(sample.items.find(item=>item.id===target.id)!);
  const result=replaceGeneratedItem(existing,sample,target.id,'demo');
  assert.deepEqual(result,expected);assert.deepEqual(existing,before);assert.deepEqual(evidenceIssues(result,demoSource(lang)),[]);
 }
});
test('demo item regeneration still selects the correct task after a different task is deleted',()=>{
 for(const type of ['quiz','matching','ordering']as const)for(const lang of ['kk','ru']as const){
  const sample=demoGame(type,lang),existing=structuredClone(sample);existing.items.splice(0,1);existing.items.reverse();
  const target=existing.items[0]!;target.explanation='Edited task';const expected=structuredClone(existing);
  expected.items[0]=structuredClone(sample.items.find(item=>item.id===target.id)!);
  assert.deepEqual(replaceGeneratedItem(existing,sample,target.id,'demo'),expected);
 }
});
test('demo regeneration rejects custom task IDs instead of copying an unrelated sample task',()=>{
 for(const type of ['quiz','matching','ordering']as const){
  const sample=demoGame(type,'kk'),existing=structuredClone(sample);existing.items[0]!.id='custom_task';
  assert.ok(GameSchema.safeParse(existing).success);
  assert.throws(()=>replaceGeneratedItem(existing,sample,'custom_task','demo'),{message:'demo_sample_only',statusCode:422});
 }
});
test('live regeneration replaces only the selected task and preserves its existing ID',()=>{
 for(const type of ['quiz','matching','ordering']as const){
  const existing=demoGame(type,'kk'),generated=demoGame(type,'kk'),targetId=existing.items[0]!.id;
  generated.items.splice(1);generated.items[0]!.id='provider_task';generated.items[0]!.explanation='New provider explanation';
  const before=structuredClone(existing),providerBefore=structuredClone(generated),result=replaceGeneratedItem(existing,generated,targetId,'live');
  assert.equal(result.items[0]!.id,targetId);assert.equal(result.items[0]!.explanation,'New provider explanation');
  assert.deepEqual(result.items.slice(1),existing.items.slice(1));assert.deepEqual(existing,before);assert.deepEqual(generated,providerBefore);
  assert.ok(GameSchema.safeParse(result).success);assert.deepEqual(evidenceIssues(result,demoSource('kk')),[]);
 }
});
test('live regeneration replaces colliding nested IDs without losing quiz, matching or ordering answers',()=>{
 for(const type of ['quiz','matching','ordering']as const){
  const existing=demoGame(type,'kk'),generated=structuredClone(existing),targetId=existing.items[1]!.id;
  generated.items.splice(0,1);generated.items.splice(1);generated.items[0]!.id='provider_task';
  if(generated.gameType==='quiz'&&existing.gameType==='quiz'){
   const item=generated.items[0]!,other=existing.items[0]!,correctIndex=item.options.findIndex(option=>option.id===item.correctOptionId);
   item.options.forEach((option,i)=>{option.id=other.options[i]!.id;});item.correctOptionId=item.options[correctIndex]!.id;
  }else if(generated.gameType==='matching'&&existing.gameType==='matching'){
   generated.items[0]!.left.id=existing.items[0]!.left.id;generated.items[0]!.right.id=existing.items[0]!.right.id;
  }else if(generated.gameType==='ordering'&&existing.gameType==='ordering'){
   const item=generated.items[0]!,other=existing.items[0]!,order=item.correctOrder.map(id=>item.elements.findIndex(element=>element.id===id));
   item.elements.forEach((element,i)=>{element.id=other.elements[i]!.id;});item.correctOrder=order.map(i=>item.elements[i]!.id);
  }
  const result=replaceGeneratedItem(existing,generated,targetId,'live'),answers:Answers={};
  assert.ok(GameSchema.safeParse(result).success);assert.equal(result.items[1]!.id,targetId);
  assert.deepEqual(result.items.filter(item=>item.id!==targetId),existing.items.filter(item=>item.id!==targetId));
  if(result.gameType==='quiz')result.items.forEach(item=>{answers[item.id]=item.correctOptionId;});
  else if(result.gameType==='matching')result.items.forEach(item=>{answers[item.left.id]=item.right.id;});
  else result.items.forEach(item=>{answers[item.id]=item.correctOrder;});
  const graded=gradeGame(result,answers);assert.equal(graded.score,existing.items.length);
  assert.equal(graded.review[1]!.expected,gradeGame(existing,{}).review[1]!.expected);
 }
});
test('reject duplicate IDs, nonexistent answer, duplicate pairs and missing sequence IDs',()=>{
 const q=demoGame('quiz','kk');if(q.gameType!=='quiz')throw Error();q.items[1]!.id=q.items[0]!.id;assert.equal(GameSchema.safeParse(q).success,false);
 q.items[1]!.id='unique';q.items[0]!.correctOptionId='missing';assert.equal(GameSchema.safeParse(q).success,false);
 const m=demoGame('matching','kk');if(m.gameType!=='matching')throw Error();m.items[1]!.right.text=m.items[0]!.right.text;assert.equal(GameSchema.safeParse(m).success,false);
 const o=demoGame('ordering','kk');if(o.gameType!=='ordering')throw Error();o.items[0]!.correctOrder.pop();assert.equal(GameSchema.safeParse(o).success,false);
});
test('randomized presentations contain no answer keys, evidence or pair associations',()=>{
 for(const type of ['quiz','matching','ordering']as const){const{publicGame}=prepareGame(demoGame(type,'kk'));assert.doesNotMatch(JSON.stringify(publicGame),/"(correctOptionId|correctOrder|explanation|evidence|source)":/);if(publicGame.gameType==='matching'){assert.equal('items'in publicGame,false);assert.equal(publicGame.left.some(l=>publicGame.right.some(r=>r.id===l.id)),false);}}
});
test('quiz scoring is stable across shuffled answers and uses IDs',()=>{
 for(let i=0;i<12;i++){const{key,publicGame}=prepareGame(demoGame('quiz','kk'));if(key.gameType!=='quiz'||publicGame.gameType!=='quiz')throw Error();const answers=Object.fromEntries(key.items.map(q=>[q.id,q.correctOptionId]));assert.equal(gradeGame(key,answers).score,5);assert.equal(publicGame.items.every(q=>q.options.some(o=>o.id===answers[q.id])),true);}
});
test('matching and ordering scoring, unknown IDs, partial orders and expiry',()=>{
 for(const type of ['matching','ordering'] as GameType[]){const{key}=prepareGame(demoGame(type,'kk'));const answers:Answers={};if(key.gameType==='matching')key.items.forEach(q=>answers[q.left.id]=q.right.id);if(key.gameType==='ordering')key.items.forEach(q=>answers[q.id]=q.correctOrder);assert.equal(gradeGame(key,answers).score,5);assert.equal(gradeGame(key,answers,true).score,0);assert.equal(gradeGame(key,{unknown:'unknown'}).score,0);if(key.gameType==='ordering'){answers[key.items[0]!.id]=key.items[0]!.correctOrder.slice(1);assert.equal(gradeGame(key,answers).score,4);}}
});
test('invalid JSON/content is rejected after exactly one repair',async()=>{
 let calls=0;const provider:LLMProvider={generate:async()=>{calls++;return 'not JSON';}};
 await assert.rejects(()=>generateValidated(provider,input),{message:'invalid_generation'});assert.equal(calls,2);
});
test('one repair can recover invalid generation; no silent demo fallback',async()=>{
 let calls=0;const provider:LLMProvider={generate:async()=>{calls++;return calls===1?{}:{status:'ok',message:'',game:demoGame('quiz','kk')};}};
 assert.equal((await generateValidated(provider,input)).items.length,5);assert.equal(calls,2);
 const failure:LLMProvider={generate:async()=>{throw new Error('upstream failure');}};await assert.rejects(()=>generateValidated(failure,input),{message:'upstream failure'});
});
test('count, language and fabricated evidence must match the request',async()=>{
 for(const change of ['count','language','evidence']){const game=demoGame('quiz','kk');if(change==='count')game.items.pop();if(change==='language')game.language='ru';if(change==='evidence')game.items[0]!.evidence='This was not in the source.';await assert.rejects(()=>generateValidated({generate:async()=>({status:'ok',message:'',game})},input),{message:'invalid_generation'});}
});
test('insufficient material ends immediately rather than padding or retrying',async()=>{
 let calls=0;await assert.rejects(()=>generateValidated({generate:async()=>{calls++;return{status:'insufficient',message:'More text needed',game:null};}},input),{message:'insufficient_material'});assert.equal(calls,1);
});
test('OpenAI adapter sends Responses structured output and parses completed text; incomplete output fails',async()=>{
 const original=globalThis.fetch;let sent:Record<string,unknown>|undefined;
 try{
  globalThis.fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'ok',message:'',game:demoGame('quiz','kk')})}]}]}),{status:200,headers:{'Content-Type':'application/json'}});};
  const game=await generateValidated(new OpenAIResponsesProvider(),input);assert.equal(game.items.length,5);assert.equal(sent?.store,false);assert.equal((sent?.text as {format:{strict:boolean}}).format.strict,true);assert.ok(Array.isArray(sent?.input));
  globalThis.fetch=async()=>new Response(JSON.stringify({status:'incomplete',output:[]}),{status:200});
  await assert.rejects(()=>new OpenAIResponsesProvider().generate(input,5),{message:'provider_incomplete'});
 }finally{globalThis.fetch=original;}
});
