import {createRequire} from 'node:module';
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const pkg=require('pdfjs-dist/package.json');
const directory=path.dirname(require.resolve('pdfjs-dist/package.json'));
const destination=path.join(process.cwd(),'public/vendor/pdfjs',pkg.version);
await mkdir(destination,{recursive:true});
for(const file of ['pdf.mjs','pdf.worker.mjs'])await copyFile(path.join(directory,'build',file),path.join(destination,file));

await copyFile(path.join(directory,'LICENSE'),path.join(destination,'LICENSE'));
