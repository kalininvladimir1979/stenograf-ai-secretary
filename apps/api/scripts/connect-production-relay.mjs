import {randomBytes} from 'node:crypto';
const remote=process.argv[2];
if(!remote||!remote.startsWith('https://'))throw Error('Укажите HTTPS API опубликованного СтеноГРАФа');
const token=randomBytes(48).toString('base64url');
for(const [base,body] of [[remote,{token}],['http://localhost:3002',{token,url:remote}]]){
 const r=await fetch(base+'/developer/ai-relay/setup',{method:'PUT',headers:{'Content-Type':'application/json','x-dev-password':process.env.DEV_SETUP_PASSWORD||'1234'},body:JSON.stringify(body)});
 if(!r.ok)throw Error('Не удалось подключить сервер обработки: HTTP '+r.status);
}
console.log('Защищённый сервер обработки подключён. Секрет не выводится.');
