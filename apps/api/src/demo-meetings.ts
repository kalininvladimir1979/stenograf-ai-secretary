// @ts-nocheck
// Example records are identified by a server-owned marker, never by a title
// supplied with a new meeting. Older installations get their sample markers once.
export async function markDemoExamples(db,organizationId){
 const examples=await db.meeting.findMany({where:{organizationId,notes:'Учебный материал для отдельного подразделения.',OR:[{title:'План технической команды',transcript:{text:'Обсуждаем архитектуру импорта. Требуется проверить доступность исходных материалов.'}},{title:'План работы с клиентами',transcript:{text:'Обсуждаем вопросы клиентов. Ответственного и срок нужно уточнить.'}}]},select:{id:true}});
 if(examples.length)await db.aiOperation.createMany({data:examples.map(m=>({id:'demo-example:'+m.id,organizationId,meetingId:m.id,kind:'demo-example'})),skipDuplicates:true});
}
export async function demoMeetingCount(db,organizationId){await markDemoExamples(db,organizationId);return db.meeting.count({where:{organizationId,aiOperations:{none:{kind:'demo-example'}}}});}
export async function assertDemoMeetingCapacity(tx,organizationId,limit){
 if(!await tx.demoSpace.findUnique({where:{organizationId}}))return;
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'demo-meetings:'+organizationId}))`;
 if(limit>0&&await demoMeetingCount(tx,organizationId)>=limit)throw Object.assign(Error(`Достигнут лимит демо-встреч (${limit}). Удалите ненужную встречу или попросите владельца увеличить лимит в консоли.`),{status:429});
}
