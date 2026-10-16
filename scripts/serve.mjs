import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json'};
http.createServer(async (req,res)=>{
 try {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path !== root && !path.startsWith(root+sep)) {res.writeHead(403); return res.end();}
  const target = (await stat(path)).isDirectory() ? resolve(path,'index.html') : path;
  const body = await readFile(target); res.writeHead(200,{'Content-Type':types[extname(target)] || 'application/octet-stream'}); res.end(body);
 } catch {res.writeHead(404); res.end('Not found');}
}).listen(Number(process.env.PORT || 5173),'0.0.0.0',()=>console.log(`DEADSHIFT server on port ${process.env.PORT || 5173}`));
