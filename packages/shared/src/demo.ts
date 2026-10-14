import type { GameContent, GameType, Language } from './schemas';

const data = {
 kk: {
  subject: 'Дүниежүзі тарихы', title: 'Ұлы географиялық ашулар',
  rows: [
   ['1488', 'Бартоломеу Диаш', 'Африканың оңтүстік шетін айналып өтті'],
   ['1492', 'Христофор Колумб', 'Атлант мұхитын кесіп өтіп, Кариб аралдарына жетті'],
   ['1498', 'Васко да Гама', 'Африканы айналып, Үндістанға теңіз жолымен жетті'],
   ['1519', 'Фернан Магеллан', 'дүниежүзін айналу экспедициясын бастады'],
   ['1522', 'Хуан Себастьян Элькано', 'экспедицияны Испанияға қайтарып, дүниежүзін айналу сапарын аяқтады'],
  ],
  quiz: 'Бір дұрыс жауапты таңдаңыз. Әр дұрыс жауап — 1 ұпай.',
  matching: 'Зерттеушіні оның сапарының жылымен сәйкестендіріңіз. Әр дұрыс жұп — 1 ұпай.',
  ordering: 'Оқиғаларды ертеден кешке қарай орналастырыңыз. Толық дұрыс рет — 1 ұпай; жартылай ұпай берілмейді.',
  question: (name: string) => `${name} аталған сапарын қай жылы жасады?`,
  order: 'Оқиғалардың хронологиялық ретін анықтаңыз.',
 },
 ru: {
  subject: 'Всемирная история', title: 'Великие географические открытия',
  rows: [
   ['1488', 'Бартоломеу Диаш', 'обогнул южную оконечность Африки'],
   ['1492', 'Христофор Колумб', 'пересёк Атлантический океан и достиг Карибских островов'],
   ['1498', 'Васко да Гама', 'обогнул Африку и достиг Индии морским путём'],
   ['1519', 'Фернан Магеллан', 'начал кругосветную экспедицию'],
   ['1522', 'Хуан Себастьян Элькано', 'вернул экспедицию в Испанию и завершил кругосветное плавание'],
  ],
  quiz: 'Выберите один правильный ответ. За каждый правильный ответ — 1 балл.',
  matching: 'Сопоставьте исследователей с годами их путешествий. Каждая правильная пара — 1 балл.',
  ordering: 'Расположите события от раннего к позднему. Полностью верный порядок — 1 балл, частичных баллов нет.',
  question: (name: string) => `В каком году ${name} совершил указанное путешествие?`,
  order: 'Установите хронологический порядок событий.',
 },
};
export function demoSource(language: Language) {
 return data[language].rows.map(([year, name, event]) => language === 'kk' ? `${year} жылы ${name} ${event}.` : `В ${year} году ${name} ${event}.`).join('\n');
}
export function demoGame(type: GameType, language: Language): GameContent {
 const d = data[language], source = demoSource(language).split('\n');
 const base = { schemaVersion: 1 as const, title: d.title, subject: d.subject, grade: 6, language, difficulty: 'A' as const, instructions: d[type] };
 if (type === 'quiz') return { ...base, gameType: type, items: d.rows.map(([year, name], i) => ({
  id: `quiz_${i}`, question: d.question(name!), options: d.rows.filter((_, j) => j !== (i + 1) % 5).map(([y], j) => ({ id: `option_${i}_${j}`, text: y! })),
  correctOptionId: `option_${i}_${d.rows.filter((_, j) => j !== (i + 1) % 5).findIndex(r => r[0] === year)}`,
  explanation: source[i]!, evidence: source[i]!,
 })) };
 if (type === 'matching') return { ...base, gameType: type, items: d.rows.map(([year, name], i) => ({
  id: `pair_${i}`, left: { id: `l_${i}`, text: name! }, right: { id: `r_${i}`, text: year! }, explanation: source[i]!, evidence: source[i]!,
 })) };
 const choices = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [0, 2, 4], [0, 1, 3]];
 return { ...base, gameType: type, items: choices.map((indices, i) => ({
  id: `order_${i}`, prompt: d.order,
  elements: indices.map((j, k) => ({ id: `element_${i}_${k}`, text: `${d.rows[j]![1]}: ${d.rows[j]![2]}` })),
  correctOrder: indices.map((_, k) => `element_${i}_${k}`), explanation: indices.map(j => source[j]).join(' '), evidence: demoSource(language),
 })) };
}
