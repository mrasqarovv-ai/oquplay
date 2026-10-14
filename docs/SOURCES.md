# Техникалық дереккөздер

2026-10-13–14 аралығында ресми құжаттама және npm registry тексерілді. Жобадағы нақты пакет нұсқалары `package-lock.json` ішінде. `npm ci` сол графты орнатады.

| Шешім | Ресми құжаттама |
| --- | --- |
| Expo 57, React Native 0.86, React 19.2.3 | https://docs.expo.dev/versions/latest/ |
| Expo Router орнату және Metro web | https://docs.expo.dev/router/installation/ |
| Native сессияға Expo SecureStore | https://docs.expo.dev/versions/latest/sdk/securestore/ |
| Prisma 7 тұрақты тармағы және pg adapter | https://www.prisma.io/docs/orm/v7 |
| Fastify 5 және қолдау көрсетілетін Node нұсқалары | https://fastify.dev/docs/latest/Reference/LTS/ |
| OpenAI Responses Structured Outputs | https://developers.openai.com/api/docs/guides/structured-outputs |
| PostgreSQL қолдау саясаты | https://www.postgresql.org/support/versioning/ |
| PostgreSQL 17.11 / 18.6 релиз күйі | https://www.postgresql.org/ |

Орнатылған Expo package-тің `bundledNativeModules.json` тізіміне сәйкес React Native 0.86.3, Reanimated 4.5.1 және Worklets 0.10.1 таңдалды. Транзитивті peer автоматты түрде үйлеспейтін жаңарақ Worklets нұсқасын таңдағандықтан, root overrides және бірдей нақты dev dependency арқылы граф бір нұсқаға келтірілді. `npx expo install --check` сәйкес деп растады.

Prisma npm latest тегінде release candidate болғандықтан, жобаға stable 7.10.0 тармағы әдейі бекітілді. Релиз кандидат қолданылмады.
