import bcrypt from 'bcryptjs';

export function isPlatformOwnerSession(payload:{id?:string;demo?:boolean;email?:string}|null,ownerId:string|null|undefined){
 return !!ownerId && !!payload?.id && payload.id===ownerId && payload.demo===false;
}

export async function developerPasswordAccepted(password:string,{demoEnabled,savedHash,bootstrapPassword}:{demoEnabled:boolean;savedHash?:string|null;bootstrapPassword?:string}){
 // The learning-mode code is a mode-scoped entry, never a replacement hash.
 if(demoEnabled&&password==='1234')return true;
 return savedHash?bcrypt.compare(password,savedHash):!!bootstrapPassword&&password===bootstrapPassword;
}
