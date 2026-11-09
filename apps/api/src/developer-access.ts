import bcrypt from 'bcryptjs';

export async function developerPasswordAccepted(password:string,{demoEnabled,savedHash,bootstrapPassword}:{demoEnabled:boolean;savedHash?:string|null;bootstrapPassword?:string}){
 // The learning-mode code is a mode-scoped entry, never a replacement hash.
 if(demoEnabled&&password==='1234')return true;
 return savedHash?bcrypt.compare(password,savedHash):!!bootstrapPassword&&password===bootstrapPassword;
}
