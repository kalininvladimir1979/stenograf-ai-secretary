// A public demo tab must not replace the owner's real account session.
const workKey='secretary-token',demoKey='secretary-demo-token',contourKey='secretary-contour';
export function isDemoSession(value:string){try{return JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).demo===true;}catch{return false;}}
export function createSessionStore(persistent:Storage,tab:Storage){
 const migrate=()=>{const old=persistent.getItem(workKey)||'';if(old&&isDemoSession(old)){if(!tab.getItem(demoKey))tab.setItem(demoKey,old);persistent.removeItem(workKey);}};
 const contour=()=>tab.getItem(contourKey)==='demo'?'demo':'work';
 const workingToken=()=>{migrate();return persistent.getItem(workKey)||'';};
 return {
  contour,
  select(mode:'demo'|'work'){migrate();tab.setItem(contourKey,mode);},
  token(){migrate();return contour()==='demo'?tab.getItem(demoKey)||'':workingToken();},
  workingToken,
  developerToken(){return workingToken()||tab.getItem(demoKey)||'';},
  saveWork(value:string){if(isDemoSession(value))throw Error('Демо-сессия не является рабочим аккаунтом.');persistent.setItem(workKey,value);},
  saveDemo(value:string){tab.setItem(demoKey,value);tab.setItem(contourKey,'demo');},
  clearActive(){if(contour()==='demo')tab.removeItem(demoKey);else persistent.removeItem(workKey);},
  clearWork(){persistent.removeItem(workKey);},
 };
}
