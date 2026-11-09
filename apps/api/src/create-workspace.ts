import {PrismaClient,OrgRole,TaskKind} from '@prisma/client';
export function createWorkspace(db:PrismaClient,userId:string,name:string,slug:string){
 return db.$transaction(async tx=>{
  const org=await tx.organization.create({data:{name,slug,departments:{create:{name:'Общий'}}}});
  const dep=await tx.department.findFirstOrThrow({where:{organizationId:org.id}});
  await tx.membership.create({data:{userId,organizationId:org.id,departmentId:dep.id,role:OrgRole.OWNER}});
  for(const [position,label,key] of [[1,'Черновик',TaskKind.DRAFT],[2,'В работе',TaskKind.IN_PROGRESS],[3,'Готово',TaskKind.DONE],[4,'Отменено',TaskKind.CANCELLED],[5,'Архив',TaskKind.ARCHIVED]] as const){await tx.taskStatus.create({data:{organizationId:org.id,name:label,key,position,transitions:[]}});}
  await tx.meetingTemplate.create({data:{organizationId:org.id,name:'Рабочая встреча',description:'Резюме, решения, поручения, риски',instructions:'Извлеки только подтверждённые факты. Не выдумывай исполнителей и сроки.',fields:['Резюме','Решения','Поручения','Риски'],isDefault:true}});
  await tx.audioRetentionPolicy.create({data:{organizationId:org.id}});
  return org;
 });
}
