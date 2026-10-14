import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const apiFolder=fileURLToPath(new URL('../apps/api/',import.meta.url));
const child=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:apiFolder,stdio:'inherit',env:{...process.env,NODE_ENV:'development',PORT:'3001',WEB_ORIGIN:'http://localhost:3001',STATIC_WEB_DIR:'../mobile/dist'}});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
