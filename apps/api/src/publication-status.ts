type Snapshot = {hash:string;files:number;bytes:number;roots?:string[]};
type StatusSources = {
  serverReadOnly:boolean;
  readRelease:(id:string)=>Promise<any>;
  readLocal:()=>Promise<Snapshot>;
};
export async function publicationStatus(profileId:string,sources:StatusSources){
  const release=await sources.readRelease(profileId);
  const server=release?.server||null;
  // A deployed runtime is not a source workspace: never read its build context.
  if(sources.serverReadOnly)return {
    local:null,server,release,comparison:'unknown',mode:'server-read-only',
    note:'Публикация и проверка исходного состава выполняются из локальной защищённой Dev-консоли. Здесь показаны параметры серверного профиля.',
  };
  const local=await sources.readLocal();
  const comparison=server?(server.hash===local.hash?'synchronized':'changed'):'unknown';
  return {local,server,release,comparison,note:server?(comparison==='synchronized'?'VPS содержит текущий снимок выпуска.':'Локальный состав изменился после последнего выпуска.'):'Серверный снимок появится после первого подтверждённого выпуска.'};
}
