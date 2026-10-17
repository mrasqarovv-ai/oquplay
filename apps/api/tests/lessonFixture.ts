import { demoGame, demoSource, type GameType, type Language, type LessonContent, type LessonInput } from '@oquplay/shared';

// Deterministic provider output for tests; never used by the running application.
export function lessonFixture(language: Language = 'kk', type: GameType = 'quiz'): LessonContent {
 const kk = language === 'kk', source = demoSource(language);
 return {
  game: demoGame(type, language),
  objectives: kk ? ['Зерттеушілер мен сапар жылдарын анықтау.', 'Саяхаттарды хронологиялық ретпен салыстыру.'] : ['Определить исследователей и годы путешествий.', 'Сравнить путешествия в хронологическом порядке.'],
  sections: [
   { heading: kk ? 'Негізгі оқиғалар' : 'Основные события', body: source },
   { heading: kk ? 'Оқиғаларды салыстыру' : 'Сравнение событий', body: kk ? 'Берілген оқиғаларды жылдары бойынша салыстырыңыз. Қай саяхат ертерек, қайсысы кейін болғанын анықтаңыз. Жауабыңызды негізгі мәтіндегі дерекпен түсіндіріңіз.' : 'Сравните приведённые события по годам. Определите, какое путешествие состоялось раньше, а какое позже. Обоснуйте ответ фактами из основного текста.' },
   { heading: kk ? 'Қолдану үлгісі' : 'Пример применения', body: kk ? 'Оқиғалар кестесін жасаңыз: бірінші бағанға жылды, екіншісіне зерттеушіні, үшіншісіне саяхат нәтижесін жазыңыз. Мәтінге сүйеніп, кестенің ретін тексеріңіз.' : 'Составьте таблицу событий: в первой колонке укажите год, во второй — исследователя, в третьей — результат путешествия. Проверьте порядок по тексту.' },
  ],
  glossary: kk ? [
   { term: 'Хронология', definition: 'Оқиғалардың уақыт бойынша реті.' }, { term: 'Экспедиция', definition: 'Белгілі мақсатпен ұйымдастырылған зерттеу сапары.' }, { term: 'Теңіз жолы', definition: 'Теңізбен жүретін сапар бағыты.' },
  ] : [
   { term: 'Хронология', definition: 'Порядок событий во времени.' }, { term: 'Экспедиция', definition: 'Исследовательское путешествие с определённой целью.' }, { term: 'Морской путь', definition: 'Маршрут путешествия по морю.' },
  ],
  homework: kk ? 'Зерттеушілердің сапарларын уақыт сызығына орналастырыңыз. Екі саяхаттың нәтижесін мәтіндегі деректермен салыстырыңыз.' : 'Разместите путешествия исследователей на временной линии. Сравните результаты двух путешествий по фактам текста.',
  slides: Array.from({ length: 4 }, (_, i) => ({ title: kk ? `Саяхаттар: ${i + 1}` : `Путешествия: ${i + 1}`, bullets: [source.split('\n')[i]!, source.split('\n')[i + 1]!].map(s => s.slice(0, 120)), notes: kk ? 'Сапардың жылын және нәтижесін бірге талқылаңыз.' : 'Вместе обсудите год и результат путешествия.' })),
 };
}
export function lessonInput(language: Language = 'kk', type: GameType = 'quiz'): LessonInput {
 const game = demoGame(type, language);
 return { topic: game.title, subject: game.subject, grade: game.grade, language, difficulty: game.difficulty, gameType: type, count: 5 };
}
