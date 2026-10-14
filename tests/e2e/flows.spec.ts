import { test, expect, type Page } from '@playwright/test';
const email = () => `browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
async function register(page:Page, role:'teacher'|'student'='teacher') {
 await page.goto('/'); await page.getByRole('button',{name:role==='teacher'?'Мұғаліммін':'Оқушымын',exact:true}).click();
 await page.getByRole('textbox',{name:'Атыңыз немесе лақап атыңыз',exact:true}).fill('Browser Learner');
 await page.getByRole('textbox',{name:'Электрондық пошта',exact:true}).fill(email());
 await page.getByLabel('Құпиясөз',{exact:true}).fill('Browser-password-2026');
 await page.getByRole('button',{name:'Тіркелу',exact:true}).click();
 await expect(page.getByRole('button',{name:'Шығу',exact:true})).toBeVisible();
}
async function generate(page:Page,type:'quiz'|'matching'|'ordering'='quiz') {
 await page.goto('/create');await page.getByRole('button',{name:'Дайын үлгіні жүктеу',exact:true}).click();
 await page.getByRole('button',{name:'Жалғастыру',exact:true}).click();
 if(type!=='quiz')await page.getByRole('radio',{name:type==='matching'?'Сәйкестендіру':'Ретке орналастыру',exact:true}).click();
 await page.getByRole('button',{name:'Тапсырмалар құрастыру',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Ойын атауы',exact:true})).toBeVisible();
}
test('teacher generates, edits, previews, saves, publishes; guest joins and retries; analytics stays one participant',async({page,browser})=>{
 await register(page);await generate(page);
 await page.getByRole('textbox',{name:'Ойын атауы',exact:true}).fill('Browser classroom quiz');
 await page.getByRole('button',{name:'Алдын ала көру',exact:true}).click();
 await expect(page.getByText('Автордың алдын ала қарауы.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Редакторға оралу',exact:true}).first().click();
 await page.getByRole('button',{name:'Сақтау',exact:true}).click();await expect(page.getByText('Сақталды',{exact:true})).toBeVisible();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Жариялау',exact:true}).click();
 const code=await page.getByText(/^[A-F0-9]{16}$/).innerText();
 const context=await browser.newContext({viewport:{width:390,height:844}});const guest=await context.newPage();await guest.goto(`${process.env.E2E_BASE_URL??'http://localhost:3001'}/join?code=${code}`);
 await guest.getByRole('textbox',{name:'Ойындағы лақап атыңыз',exact:true}).fill('Guest One');await guest.getByRole('button',{name:'Ойынды бастау',exact:true}).click();
 await expect(guest.getByRole('radio')).toHaveCount(20);
 for(let i=0;i<5;i++)await guest.getByRole('radio').nth(i*4).click();
 await guest.getByRole('button',{name:'Жауаптарды жіберу',exact:true}).click();await expect(guest.getByRole('button',{name:'Қайта орындау',exact:true})).toBeVisible();
 await guest.getByRole('button',{name:'Қайта орындау',exact:true}).click();await expect(guest.getByRole('radio')).toHaveCount(20);for(let i=0;i<5;i++)await guest.getByRole('radio').nth(i*4).click();await guest.getByRole('button',{name:'Жауаптарды жіберу',exact:true}).click();await expect(guest.getByRole('button',{name:'Қайта орындау',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Сынып нәтижелері',exact:true}).click();await expect(page.getByText('Guest One',{exact:true})).toBeVisible();await expect(page.getByText('Әрекеттер: 2',{exact:true})).toBeVisible();
 await context.close();
});
test('generation API failure preserves entered material; Russian interface works',async({page})=>{
 await register(page);await page.goto('/create');await page.getByRole('button',{name:'Дайын үлгіні жүктеу',exact:true}).click();const source=await page.getByRole('textbox',{name:'Оқу материалы',exact:true}).inputValue();
 await page.getByRole('button',{name:'Жалғастыру',exact:true}).click();await page.route('**/api/generations',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'provider_unavailable'})}));
 await page.getByRole('button',{name:'Тапсырмалар құрастыру',exact:true}).click();await expect(page.getByText('ЖИ қызметі жауап бермеді.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Артқа',exact:true}).click();await expect(page.getByRole('textbox',{name:'Оқу материалы',exact:true})).toHaveValue(source);
 await page.getByRole('button',{name:'ҚАЗ / РУС',exact:true}).click();await expect(page.getByRole('textbox',{name:'Учебный материал',exact:true})).toHaveValue(source);
});
test('student completes matching and ordering with phone viewport, cannot publish',async({page})=>{
 await page.setViewportSize({width:390,height:844});await register(page,'student');
 for(const type of ['matching','ordering']as const){await generate(page,type);
  const clippedButtons=await page.getByRole('button').evaluateAll(buttons=>buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>window.innerWidth+1);}).map(b=>b.textContent));expect(clippedButtons).toEqual([]);
  await expect(page.getByRole('button',{name:'Жариялау',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Өзім орындау',exact:true}).click();
  if(type==='matching'){await expect(page.getByRole('button',{name:/^Сол жақ:/})).toHaveCount(5);for(let i=0;i<5;i++){await page.getByRole('button',{name:/^Сол жақ:/}).nth(i).click();await page.getByRole('button',{name:/^Оң жақ:/}).nth(i).click();}}
  else{await expect(page.getByRole('button',{name:'Төмен',exact:true})).toHaveCount(15);await page.getByRole('button',{name:'Төмен',exact:true}).first().click();}
  await page.getByRole('button',{name:'Жауаптарды жіберу',exact:true}).click();await expect(page.getByRole('button',{name:'Қайта орындау',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 await page.goto('/history');await expect(page.getByRole('button',{name:'Ашу',exact:true})).toHaveCount(2);
});
test('teacher regenerates moved and remaining demo tasks after editing the title, then logs out',async({page})=>{
 await register(page);await generate(page);
 const secondQuestion=await page.getByRole('textbox',{name:'2. Сұрақ',exact:true}).inputValue();
 const lastQuestion=await page.getByRole('textbox',{name:'5. Сұрақ',exact:true}).inputValue();
 await page.getByRole('textbox',{name:'Ойын атауы',exact:true}).fill('Edited demo title');
 await page.getByRole('button',{name:'Төмен',exact:true}).first().click();
 await page.getByRole('textbox',{name:'1. Сұрақ',exact:true}).fill('Edited moved question');
 await page.getByRole('button',{name:'Осы тапсырманы қайта құрастыру',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'1. Сұрақ',exact:true})).toHaveValue(secondQuestion);
 await expect(page.getByRole('textbox',{name:'Ойын атауы',exact:true})).toHaveValue('Edited demo title');
 await page.getByRole('button',{name:'Өшіру',exact:true}).first().click();
 await page.getByRole('textbox',{name:'4. Сұрақ',exact:true}).fill('Edited remaining question');
 await page.getByRole('button',{name:'Осы тапсырманы қайта құрастыру',exact:true}).last().click();
 await expect(page.getByRole('textbox',{name:'4. Сұрақ',exact:true})).toHaveValue(lastQuestion);
 await page.getByRole('button',{name:'Шығу',exact:true}).click();
 await expect(page.getByRole('button',{name:'Шығу',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Мұғаліммін',exact:true})).toBeVisible();
});
test('a timed attempt keeps elapsed time when returning from another screen',async({page})=>{
 await register(page,'student');await generate(page);await page.clock.install();
 await page.getByRole('radio',{name:'Қосулы',exact:true}).click();
 await page.getByRole('textbox',{name:'Минут',exact:true}).fill('5');
 await page.getByRole('button',{name:'Өзім орындау',exact:true}).click();
 const countdown=page.getByText(/^Қалған уақыт:/);
 await expect(countdown).toBeVisible();const attemptUrl=page.url();
 await page.getByRole('button',{name:'Басты бет',exact:true}).click();
 await expect(page).not.toHaveURL(attemptUrl);await page.clock.fastForward(240000);
 await page.goBack();await expect(page).toHaveURL(attemptUrl);await expect(countdown).toBeVisible();
 await expect.poll(async()=>{
  const text=await countdown.innerText(),match=text.match(/(\d+):(\d{2})/);
  return match?Number(match[1])*60+Number(match[2]):-1;
 }).toBeGreaterThan(30);
 const text=await countdown.innerText(),match=text.match(/(\d+):(\d{2})/);
 expect(match).not.toBeNull();expect(Number(match![1])*60+Number(match![2])).toBeLessThan(80);
});
