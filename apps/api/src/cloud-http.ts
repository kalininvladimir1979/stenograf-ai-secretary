import {setTimeout as wait} from 'node:timers/promises';

export function cloudHttpError(status:number,retryAfter?:string|null){
  const seconds=retryAfter?(/^[\d.]+$/.test(retryAfter)?Number(retryAfter):Math.max(0,(Date.parse(retryAfter)-Date.now())/1000)):undefined;
  const message=status===429?'Облако временно ограничило частоту запросов (HTTP 429). Повторите попытку немного позже; переподключать аккаунт не требуется.':status===401?'Облако отклонило авторизацию (HTTP 401). Переподключите аккаунт в админке.':status===403?'Облако не предоставило доступ к файлу (HTTP 403). Проверьте права доступа к ссылке.':status===404?'Файл в облаке не найден (HTTP 404). Проверьте ссылку.':`Облако временно не выполнило запрос (HTTP ${status}). Попробуйте позже.`;
  return Object.assign(new Error(message),{status,retryAfterSeconds:Number.isFinite(seconds)?seconds:undefined});
}

// Retry only reads: OAuth exchanges and other writes must never be replayed.
export async function cloudJsonFetch(url:string,init:RequestInit={},dependencies:{fetch?:typeof fetch;wait?:(ms:number)=>Promise<unknown>}={}){
  const request=dependencies.fetch||fetch,sleep=dependencies.wait||wait;
  for(let attempt=0;;attempt++){
    const response=await request(url,{...init,signal:init.signal||AbortSignal.timeout(30000)});
    if(response.ok)return response.json();
    const error=cloudHttpError(response.status,response.headers.get('retry-after'));
    await response.body?.cancel();
    const delay=Math.max(1000*2**attempt,(error.retryAfterSeconds||0)*1000);
    if((init.method||'GET').toUpperCase()!=='GET'||attempt>=2||delay>10000||!(response.status===429||response.status>=500&&response.status<=599))throw error;
    await sleep(delay);
  }
}

export async function yandexPublicFile(url:string,jsonFetch:typeof cloudJsonFetch=cloudJsonFetch){
  const query='?public_key='+encodeURIComponent(url),base='https://cloud-api.yandex.net/v1/disk/public/resources';
  const data=await jsonFetch(base+query);
  if(data.type!=='file')throw Error('Это ссылка на папку. Для импорта укажите конкретный файл.');
  // Metadata already includes a download URL. The separate download endpoint
  // can be throttled independently even when this URL is usable.
  const downloadUrl=data.file||(await jsonFetch(base+'/download'+query)).href;
  if(typeof downloadUrl!=='string'||!downloadUrl)throw Error('Облако не предоставило ссылку для скачивания файла.');
  return {provider:'yandex',id:data.resource_id||data.public_key||url,version:data.md5||data.modified+':'+data.size,name:data.name,url:downloadUrl,normalizedUrl:url};
}
