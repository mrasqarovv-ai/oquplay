import { copyFile, constants } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of ['api','mobile']) {
 const folder=resolve(root,'apps',name);
 try {await copyFile(resolve(folder,'.env.example'),resolve(folder,'.env'),constants.COPYFILE_EXCL);console.log(`Created apps/${name}/.env`);}
 catch(e){if(e.code==='EEXIST')console.log(`Kept existing apps/${name}/.env`);else throw e;}
}
