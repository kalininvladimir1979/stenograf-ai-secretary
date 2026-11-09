type OrganizationChoice={id:string;slug?:string;isDemo?:boolean;isCurrentDemo?:boolean};
export function modelCatalogOrganizations<T extends OrganizationChoice>(organizations:T[]):T[]{
  return organizations.filter(org=>!(org.isDemo??/^demo-/.test(org.slug||''))||org.isCurrentDemo===true);
}
export function shouldStartPublicDemo({enabled,publicAccess,restored,explicitLogin}:{enabled:boolean;publicAccess:boolean;restored:boolean;explicitLogin:boolean}){
  return enabled&&publicAccess&&!restored&&!explicitLogin;
}
export function workspaceUrl(login=false){
  const url=new URL(import.meta.env.BASE_URL,window.location.origin);url.searchParams.set('surface','app');if(login)url.searchParams.set('login','1');return url.href;
}
export function surfaceForPath(pathname:string,base='/'){
 const prefix=base.replace(/\/+$/,'');
 if(prefix&& !pathname.startsWith(prefix+'/'))return null;
 const relative=pathname.replace(/\/+$/,'').slice(prefix.length);
 return relative==='/adminvk'||relative==='/admin'?'admin':relative==='/dev'?'dev':null;
}
export function surfaceUrl(surface:'app'|'admin'|'dev',section?:string){
 const url=new URL(import.meta.env.BASE_URL,window.location.origin);
 if(surface!=='app')url.pathname=url.pathname.replace(/\/$/,'')+(surface==='admin'?'/adminvk':'/dev');
 if(section)url.searchParams.set('section',section);
 return url.href;
}
