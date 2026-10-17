# Серверге орналастыру және мобильді build

Бұл файл — кейін өзіңіз орындайтын нұсқаулық. Жоба интернетке орналастырылған жоқ, аккаунттар мен ақылы ресурстар ашылған жоқ.

Render арқылы командаларсыз демо іске қосу үшін [орысша қысқа нұсқаулықты](RENDER.md) қараңыз. `render.yaml` сайт пен базаны бірге сипаттайды; нақты орналастыру Render аккаунтында расталады. Тегін PostgreSQL 30 күнмен шектеледі.

## Сервер архитектурасы

Бір HTTPS доменінде web және `/api` бірге тұрғаны ыңғайлы: web cookie first-party болады. `STATIC_WEB_DIR` орнатылса, Fastify Expo web export-ты да береді, `/join`, `/play` сияқты терең сілтемелер index.html арқылы ашылады.

Қажет: Node 24, PostgreSQL 17.11 не үйлесімді қолдау көрсетілетін жаңа нұсқа, HTTPS reverse proxy, ұзақ сұраныстарға кемінде 120 секунд timeout. Live generation екі рет 45 секундқа дейін күтуі мүмкін. Мәлімет көлемі серверде 400 KB-мен шектелген.

## Контейнерсіз

Сервердегі **oquplay түбір қалтасында**:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build:web
npm run start -w @oquplay/api
```

Осы командаларға дейін сервердің environment жүйесіне төмендегілерді орнатыңыз. Құпияларды Git-ке коммит жасамаңыз:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
DATABASE_URL=
WEB_ORIGIN=https://your-domain.example
STATIC_WEB_DIR=/absolute/path/to/oquplay/apps/mobile/dist
LLM_MODE=demo
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=
GENERATION_DAILY_LIMIT=10
GENERATION_GLOBAL_DAILY_LIMIT=100
```

`DATABASE_URL` — өз PostgreSQL серверіңіздің TLS талаптарына сай толық connection string. Production үшін сервер құпиялары файлға емес, хостингтің environment/secrets жүйесіне енгізілсін. Кілтті Docker build ARG не EXPO_PUBLIC айнымалысына қоспаңыз.

Web build кезінде `apps/mobile/.env` ішінде development LAN/localhost мекенжайы қалмасын. Production web үшін `EXPO_PUBLIC_API_URL` мәнін бос орнатыңыз: API сол HTTPS origin-нен шақырылады. Native build үшін бұл мән бос болмайды, толық HTTPS API мекенжайы беріледі.

`NODE_ENV=production` кезінде `WEB_ORIGIN` HTTPS болмаса сервер әдейі тоқтайды. Secure cookie үшін браузер міндетті түрде HTTPS арқылы кіруі керек.

## Docker

**oquplay түбірінде**:

```bash
docker build -t oquplay-ai:0.1.0 .
```

Dockerfile `.env`, node_modules, test traces және generated файлдарды көшірмейді. Prisma клиенті мен web контейнер ішінде қайта жиналады. Бұл image әзірлеу тәуелділіктерін де қамтиды; кейін image көлемін азайтуға болады.

Іске қоспас бұрын осы image арқылы бір реттік migration job орындаңыз: `npm run db:migrate -w @oquplay/api`. Оған тек сервердің DATABASE_URL мәнін беріңіз. Кейін image-ті production environment-пен іске қосыңыз. Контейнердің 3001 портын тек HTTPS proxy-ге жалғаңыз, PostgreSQL портын жалпы интернетке ашпаңыз.

Жергілікті `docker-compose.yml` production конфигурациясы емес: оның `local_only` паролі тек компьютердегі демоға арналған.

## Proxy және масштаб

Fastify `trustProxy=false`: клиент жіберген `X-Forwarded-For` арқылы rate limit айналып өтілмейді. Proxy артында осы күймен барлық пайдаланушы proxy IP-іне бірігуі мүмкін. Production алдында тек нақты proxy IP/CIDR-іне сенетін конфигурацияны `buildApp` ішіне енгізіп, spoofing тестін қосыңыз; `trustProxy=true` деп барлық желіге сенбеңіз.

Бір процесс rate limiter-і бар. Бірнеше replica үшін HTTP limit-ті Redis не ортақ gateway-ге ауыстыру қажет. Generation daily budget PostgreSQL-де транзакциямен ортақ есептеледі. Migration-ды барлық replica бір мезетте емес, deployment алдындағы job орындайды.

PostgreSQL backup/restore, log rotation және session/job retention саясатын орналастыратын ортада орнатыңыз. Бұлар аккаунттағы деректерді жоғалтпау үшін керек, осы архив сыртқы инфрақұрылымды өзі құрмайды.

## Android APK/AAB және iPhone build

Алдымен `docs/MOBILE.md` тізімін нақты құрылғыда орындаңыз. `apps/mobile/app.config.ts` ішіндегі `android.package` пен `ios.bundleIdentifier` өз аккаунтыңызда бірегей болуы керек. Көрінетін өнім атауы түбірдегі `brand.json` арқылы өзгереді.

Төмендегі командалар **apps/mobile қалтасында** орындалады:

```bash
npx expo run:android
```

Жергілікті Android SDK/JDK/эмулятор қажет. Native Android жобасы жасалып, debug build құрылғыға орнатылады.

```bash
npx expo run:ios
```

Тек macOS + Xcode ортасында. Windows-та iOS native build жергілікті жасалмайды.

EAS қолдануды өзіңіз таңдасаңыз, Expo аккаунтын байланыстырып, EAS CLI-дің ресми ағымдағы орнату нұсқаулығын орындаңыз. `eas.json` ішінде `development`, `preview`, `production` профильдері бар. Development profile үшін алдымен `npx expo install expo-dev-client` орындап, lockfile-ды жаңартыңыз. EAS қызметінің тарифін тексеріп, build-ті өзіңіз іске қосыңыз:

```bash
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

Бұл командалар сыртқы build қызметін қолданады. Preview Android profile APK жасайды. iOS құрылғылары үшін Apple signing/provisioning қажет; аккаунт талаптары мен төлемдері осы жобаға кірмейді.

Native build environment-ке:

```dotenv
EXPO_PUBLIC_API_URL=https://your-domain.example
EXPO_PUBLIC_WEB_URL=https://your-domain.example
```

`LLM_API_KEY` мобильді build environment-ке ешқашан берілмейді. EAS build артефактісін дүкенге жіберу — жеке әрекет; автоматты submit қосылмаған.
