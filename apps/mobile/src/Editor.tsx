import { useState } from 'react';
import { Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { GameContent, PublicGame } from '@oquplay/shared';
import { useApp } from './context';
import { Badge, Button, Card, Field, s } from './ui';
import { GameBoard, initialAnswers } from './GameBoard';
import { canRegenerateItem } from './generation';
export function Editor({ content, onChange, regenerate, busy }: { content: GameContent; onChange: (g: GameContent) => void; regenerate: (id: string) => void; busy: boolean }) {
 const { t, mode } = useApp();
 const edit = (fn: (g: GameContent) => void) => { const g = structuredClone(content); fn(g); onChange(g); };
 const itemEdit = (i: number, fn: (q: GameContent['items'][number]) => void) => edit(g => fn(g.items[i]!));
 const moveTask = (i:number,by:number) => edit(g => { [g.items[i],g.items[i+by]]=[g.items[i+by]!,g.items[i]!]; });
 function add() { edit(g => { const base={id:randomUUID(),explanation:'',evidence:''};
  if(g.gameType==='quiz')g.items.push({...base,question:'',options:[{id:randomUUID(),text:''},{id:randomUUID(),text:''},{id:randomUUID(),text:''},{id:randomUUID(),text:''}],correctOptionId:''});
  else if(g.gameType==='matching')g.items.push({...base,left:{id:randomUUID(),text:''},right:{id:randomUUID(),text:''}});
  else {const elements=Array.from({length:3},()=>({id:randomUUID(),text:''}));g.items.push({...base,prompt:'',elements,correctOrder:elements.map(e=>e.id)});}
 }); }
 return <View style={s.stack}><Card><Field label={t('title')} value={content.title} onChangeText={v=>edit(g=>{g.title=v;})} /><Field label={t('instructions')} value={content.instructions} multiline onChangeText={v=>edit(g=>{g.instructions=v;})} /></Card>
  {content.items.map((item,i)=><Card key={item.id}><View style={[s.row,{justifyContent:'space-between'}]}><Badge label={`${i+1} / ${content.items.length}`} /><View style={[s.row,{maxWidth:'100%',flexShrink:1}]}><Button label={t('up')} icon="chevron-up" kind="ghost" disabled={i===0||busy} onPress={()=>moveTask(i,-1)} /><Button label={t('down')} icon="chevron-down" kind="ghost" disabled={i===content.items.length-1||busy} onPress={()=>moveTask(i,1)} /><Button label={t('delete')} kind="danger" disabled={busy} onPress={()=>edit(g=>{g.items.splice(i,1);})} /></View></View>
   {'question' in item ? <><Field label={`${i+1}. ${t('question')}`} value={item.question} multiline onChangeText={v=>itemEdit(i,q=>{if('question'in q)q.question=v;})} />
    {item.options.map((o,j)=><View key={o.id} style={{gap:8}}><Field label={`${t('options')} ${j+1}`} value={o.text} onChangeText={v=>itemEdit(i,q=>{if('options'in q)q.options[j]!.text=v;})} /><View style={s.row}><Button label={`${item.correctOptionId===o.id?'✓ ':''}${t('correctAnswer')} ${j+1}`} kind={item.correctOptionId===o.id?'primary':'secondary'} onPress={()=>itemEdit(i,q=>{if('correctOptionId'in q)q.correctOptionId=o.id;})} /><Button label={t('delete')} kind="ghost" disabled={item.options.length<=2} onPress={()=>itemEdit(i,q=>{if('options'in q){q.options.splice(j,1);if(q.correctOptionId===o.id)q.correctOptionId='';}})} /></View></View>)}
    <Button label={t('addOption')} kind="secondary" disabled={item.options.length>=6} onPress={()=>itemEdit(i,q=>{if('options'in q)q.options.push({id:randomUUID(),text:''});})} />
   </> : 'left' in item ? <><Field label={t('pairLeft')} value={item.left.text} onChangeText={v=>itemEdit(i,q=>{if('left'in q)q.left.text=v;})} /><Field label={t('pairRight')} value={item.right.text} onChangeText={v=>itemEdit(i,q=>{if('right'in q)q.right.text=v;})} /></> : <><Field label={t('question')} value={item.prompt} multiline onChangeText={v=>itemEdit(i,q=>{if('prompt'in q)q.prompt=v;})} /><Text style={s.label}>{t('correctOrder')}</Text>
    {item.correctOrder.map((id,j)=>{ const element=item.elements.find(e=>e.id===id)!;return <View key={id} style={{gap:8}}><Field label={`${t('element')} ${j+1}`} value={element.text} onChangeText={v=>itemEdit(i,q=>{if('elements'in q)q.elements.find(e=>e.id===id)!.text=v;})} /><View style={s.row}>{([-1,1]as const).map(by=><Button key={by} label={t(by===-1?'up':'down')} kind="ghost" disabled={j+by<0||j+by>=item.elements.length} onPress={()=>itemEdit(i,q=>{if('correctOrder'in q){[q.correctOrder[j],q.correctOrder[j+by]]=[q.correctOrder[j+by]!,q.correctOrder[j]!];}})} />)}<Button label={t('delete')} kind="ghost" disabled={item.elements.length<=3} onPress={()=>itemEdit(i,q=>{if('elements'in q){q.elements=q.elements.filter(e=>e.id!==id);q.correctOrder=q.correctOrder.filter(e=>e!==id);}})} /></View></View>;})}
    <Button label={t('addElement')} kind="secondary" disabled={item.elements.length>=8} onPress={()=>itemEdit(i,q=>{if('elements'in q){const id=randomUUID();q.elements.push({id,text:''});q.correctOrder.push(id);}})} />
   </>}
   <Field label={t('explanation')} value={item.explanation} multiline onChangeText={v=>itemEdit(i,q=>{q.explanation=v;})} /><Field label={t('evidence')} value={item.evidence} multiline onChangeText={v=>itemEdit(i,q=>{q.evidence=v;})} />
   <Button label={t('regenerate')} icon="refresh-cw" kind="secondary" disabled={busy || !canRegenerateItem(content,item.id,mode)} onPress={()=>regenerate(item.id)} />
  </Card>)}<Button label={t('addTask')} kind="secondary" icon="plus" disabled={content.items.length>=30||busy} onPress={add} />
 </View>;
}
function publicPreview(g:GameContent):PublicGame {
 const base={schemaVersion:g.schemaVersion,title:g.title,subject:g.subject,grade:g.grade,language:g.language,difficulty:g.difficulty,instructions:g.instructions};
 if(g.gameType==='quiz')return{...base,gameType:'quiz',items:g.items.map(q=>({id:q.id,question:q.question,options:[...q.options].reverse()}))};
 if(g.gameType==='matching')return{...base,gameType:'matching',left:g.items.map(p=>p.left),right:g.items.map(p=>p.right).reverse()};
 return{...base,gameType:'ordering',items:g.items.map(q=>({id:q.id,prompt:q.prompt,elements:[...q.elements].reverse()}))};
}
export function Preview({content,onClose}:{content:GameContent;onClose:()=>void}) {const{t}=useApp();const[game]=useState(()=>publicPreview(content));const[answers,setAnswers]=useState(()=>initialAnswers(game));return <View style={s.stack}><Card><Text style={s.subtitle}>{content.title}</Text><Text style={s.muted}>{t('previewNotice')}</Text><Text style={s.body}>{content.instructions}</Text><Button label={t('returnEditor')} onPress={onClose} kind="secondary" /></Card><GameBoard game={game} answers={answers} setAnswers={setAnswers} /><Button label={t('returnEditor')} onPress={onClose} /></View>;}
