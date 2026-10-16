import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const p of ['index.html','style.css','src']) await cp(p,`dist/${p}`,{recursive:true});
console.log('Static production build: dist/');
