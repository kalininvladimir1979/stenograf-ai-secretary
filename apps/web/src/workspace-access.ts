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
