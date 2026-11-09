import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const providers = [
  { id:'yandex', name:'Яндекс Диск', auth:'https://oauth.yandex.ru/authorize', token:'https://oauth.yandex.ru/token', scope:'cloud_api:disk.read', docs:'https://yandex.com/dev/id/doc/en/register-client.html' },
  { id:'google', name:'Google Диск', auth:'https://accounts.google.com/o/oauth2/v2/auth', token:'https://oauth2.googleapis.com/token', scope:'https://www.googleapis.com/auth/drive.readonly', docs:'https://developers.google.com/workspace/guides/create-credentials' },
  { id:'onedrive', name:'Microsoft OneDrive', auth:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token:'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope:'offline_access Files.Read', docs:'https://learn.microsoft.com/en-us/graph/auth-register-app-v2' },
  { id:'dropbox', name:'Dropbox', auth:'https://www.dropbox.com/oauth2/authorize', token:'https://api.dropboxapi.com/oauth2/token', scope:'files.metadata.read files.content.read', docs:'https://developers.dropbox.com/oauth-guide' },
  { id:'box', name:'Box', auth:'https://account.box.com/api/oauth2/authorize', token:'https://api.box.com/oauth2/token', scope:'', docs:'https://developer.box.com/guides/authentication/oauth2/oauth2-setup/' },
];
const hosts = ['disk.yandex.ru','yadi.sk','disk.yandex.com','cloud-api.yandex.net','downloader.disk.yandex.ru','storage.yandex.net','yandex.net','drive.google.com','docs.google.com','googleusercontent.com','googleapis.com','1drv.ms','1drv.com','onedrive.live.com','sharepoint.com','microsoft.com','microsoftonline.com','live.com','dropbox.com','dropboxapi.com','dropboxusercontent.com','box.com','boxcloud.com'];
export function providerOf(raw:string) {
  const u = new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw new Error('Используйте публичную HTTPS-ссылку облачного провайдера.');
  const h=u.hostname.toLowerCase();
  if (['disk.yandex.ru','disk.yandex.com','yadi.sk'].includes(h)) return 'yandex';
  if (['drive.google.com','docs.google.com'].includes(h)) return 'google';
  if (h==='1drv.ms'||h==='onedrive.live.com'||h.endsWith('.sharepoint.com')) return 'onedrive';
  if(h==='dropbox.com'||h.endsWith('.dropbox.com')) return 'dropbox';
  if(h==='box.com'||h.endsWith('.box.com')) return 'box';
  throw new Error('Поддерживаются ссылки Яндекс Диска, Google Диска, OneDrive, Dropbox и Box. Скачайте файл и загрузите вручную.');
}
export function publicAddress(ip:string) {
  if(isIP(ip)===4) {const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
  return isIP(ip)===6 && !/^(::|fc|fd|fe[89ab]|ff)/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}
// Pin the checked DNS answer to the actual socket, and validate every redirect.
export async function safeResponse(raw:string, redirects=0, headers:Record<string,string>={},allowAnyPublicHost=false):Promise<any> {
  if(redirects>5) throw new Error('Слишком много перенаправлений. Загрузите файл вручную.');
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||(!allowAnyPublicHost&&!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))) throw new Error('Адрес скачивания не разрешён. Загрузите файл вручную.');
  const addresses=await lookup(u.hostname,{all:true});
  if(!addresses.length||addresses.some(x=>!publicAddress(x.address))) throw new Error('Облачная ссылка указывает на запрещённый сетевой адрес.');
  const address=addresses[0];
  const response:any=await new Promise((resolve,reject)=>{
    const request=https.get(u,{headers,lookup:((_h:any,options:any,cb:any)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)) as any,timeout:30000},resolve);
    request.on('timeout',()=>request.destroy(new Error('Истекло время скачивания.')));request.on('error',reject);
  });
  if([301,302,303,307,308].includes(response.statusCode)){response.resume();const next=new URL(response.headers.location,u);return safeResponse(next.href,redirects+1,next.origin===u.origin?headers:{},allowAnyPublicHost);}
  if(response.statusCode!==200){response.resume();throw new Error(`Облако не разрешило скачивание (HTTP ${response.statusCode}). Скачайте файл и загрузите вручную.`);}
  return response;
}
export async function downloadFile(url:string,destination:string,maxBytes:number,headers:Record<string,string>={},allowAnyPublicHost=false) {
  const response=await safeResponse(url,0,headers,allowAnyPublicHost);
  const mime=String(response.headers['content-type']||'').split(';')[0];
  if(/text\/html|application\/json/.test(mime)){response.destroy();throw new Error('Получена страница просмотра вместо файла. Скачайте файл и загрузите вручную.');}
  if(Number(response.headers['content-length']||0)>maxBytes){response.destroy();throw new Error('Файл превышает настроенный предел загрузки.');}
  let bytes=0;const timer=setTimeout(()=>response.destroy(new Error('Истекло время скачивания.')),300000);
  try{await pipeline(response,new Transform({transform(chunk,_enc,cb){bytes+=chunk.length;cb(bytes>maxBytes?new Error('Превышен предел размера файла.'):null,chunk);}}),createWriteStream(destination,{flags:'wx',mode:0o600}));return {bytes,mime};}
  catch(e){await fs.unlink(destination).catch(()=>{});throw e;}finally{clearTimeout(timer);}
}
export function kindOf(name:string) {
  const ext=name.toLowerCase().split('.').pop()||'';
  if(['mp4','webm','mov','mkv','avi','mpeg','mpg','m4v','wmv','flv','3gp','ogv'].includes(ext))return 'video';
  if(['mp3','wav','m4a','ogg','aac','flac','opus','wma','aiff'].includes(ext))return 'audio';
  if(['jpg','jpeg','png','webp','tif','tiff'].includes(ext))return 'image';
  if(['txt','md','pdf','docx','rtf','csv','xlsx','pptx'].includes(ext))return 'document';
  return null;
}
export function validateSchedule(s:any) {
  if(!['manual','interval','weekly','monthly'].includes(s.mode))throw new Error('Неизвестный режим расписания.');
  if(s.mode==='manual')return {...s,timezone:s.timezone||'Europe/Moscow'};
  new Intl.DateTimeFormat('en',{timeZone:s.timezone||'Europe/Moscow'});
  if(s.mode==='interval'&&![15,30,60,180,360,720,1440].includes(Number(s.minutes)))throw new Error('Выберите допустимый интервал.');
  if(s.mode!=='interval'&&(!Array.isArray(s.times)||!s.times.length||s.times.some((t:any)=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))throw new Error('Укажите время ЧЧ:ММ.');
  if(s.mode==='weekly'&&(!s.days?.length||s.days.some((d:any)=>!Number.isInteger(d)||d<0||d>6)))throw new Error('Выберите дни недели.');
  if(s.mode==='monthly'&&(!s.days?.length&&!s.lastDay||s.days?.some((d:any)=>!Number.isInteger(d)||d<1||d>31)))throw new Error('Выберите числа месяца.');
  return {...s,timezone:s.timezone||'Europe/Moscow'};
}
export function nextRuns(schedule:any,from=new Date(),count=3) {
  const s=validateSchedule(schedule);const out:Date[]=[];
  if(s.mode==='manual')return out;
  if(s.mode==='interval'){for(let i=1;i<=count;i++)out.push(new Date(+from+i*s.minutes*60000));return out;}
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const start=Math.floor(+from/60000)*60000+60000;
  for(let t=start;t<start+370*86400000&&out.length<count;t+=60000){
    const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(x=>[x.type,x.value]));
    if(!s.times.includes(p.hour+':'+p.minute))continue;
    const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday);
    const last=Number(p.day)===new Date(Date.UTC(Number(p.year),Number(p.month),0)).getUTCDate();
    if(s.mode==='weekly'?s.days.includes(weekday):s.days?.includes(Number(p.day))||s.lastDay&&last)out.push(new Date(t));
  }return out;
}
