import {type Command,demand} from './model';
// Intentionally excludes membership, invitations, deletion, imports and reset.
export const assistantCommands=['create_request','edit_request','master','submit','approve','reserve','assign','verify_documents','load','close','plan_task','assign_task'] as const;
export function assistantCommand(input:any):Command {
    demand(input&&typeof input==='object'&&!Array.isArray(input)&&assistantCommands.includes(input.type),'Unsupported assistant action / إجراء غير متاح للمساعد');
    demand(!('password' in input)&&!('file' in input),'Unsupported assistant input');
    if(input.type==='master')demand(input.id&&input.data&&Object.keys(input.data).every(k=>k==='name'),'Assistant master edits change an existing name only / تعديل اسم سجل موجود فقط');
    return {...input,channel:'assistant'};
}
