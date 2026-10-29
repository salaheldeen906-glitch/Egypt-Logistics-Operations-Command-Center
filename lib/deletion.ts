import { type State, type Kind, kinds, references, row, demand, text } from './model';
const masters: Kind[] = ['units','projects','products','customers','warehouses','locations','batches','resources','carriers'];
export function deletePreview(s: State, kind: Kind, id: string) {
    demand(kinds.includes(kind), 'Invalid record type / نوع سجل غير صحيح');
    const target = row(s,kind,id), blockers: string[] = [], ids = new Set([id]);
    if (kind === 'imports') {
        if (target.status !== 'applied' || ['opening','requests'].includes(target.kind)) blockers.push('Posted balances and imported requests require correction / الأرصدة والطلبات المستوردة تحتاج مسار تصحيح');
        for (const k of kinds) for (const r of s[k]) if (r.importId === id) ids.add(r.id);
    } else if (kind === 'requests') {
        if (target.status !== 'draft') blockers.push('Only drafts can be deleted / المسح للمسودات فقط');
        for (const line of s.lines.filter(l=>l.requestId===id)) ids.add(line.id);
    } else if (kind === 'lines') {
        if (row(s,'requests',target.requestId).status !== 'draft' || s.lines.filter(l=>l.requestId===target.requestId).length <= 1) blockers.push('Keep at least one draft line / يلزم مسودة بها بند واحد على الأقل');
    } else if (kind === 'tasks') {
        if(target.routeId||target.status!=='planned'||row(s,'requests',target.requestId).status!=='draft')blockers.push('Only unused draft tasks / مهام المسودة غير المنفذة فقط');
    } else if (kind === 'assignments') {
        if (target.routeId || !['reserved','assigned'].includes(row(s,'requests',target.requestId).status)) blockers.push('Assignment already used in execution / التكليف مرتبط بالتنفيذ');
    } else if (kind === 'documents') {
        if (target.verified || row(s,'requests',target.requestId).status === 'closed') blockers.push('Verified documents are protected / المستند المعتمد محمي');
    } else if (kind === 'routes') {
        if (target.status !== 'planned') blockers.push('Route execution started / بدأ تنفيذ الرحلة');
    } else if (kind === 'stops') blockers.push('Stops are required by the route workflow / المحطات مرتبطة بدورة الرحلة ولا تُمسح منفردة');
    else if (!masters.includes(kind)) blockers.push('Use the documented correction workflow / استخدم مسار التصحيح المعتمد');
    for (const k of kinds) for (const r of s[k]) if (!ids.has(r.id) && references(k,r).some(([,ref])=>ids.has(ref))) blockers.push(`${k}: ${r.code}`);
    return { kind, id, name:target.name || target.code, code:target.code, count:kind==='imports'?ids.size-1:ids.size, allowed:blockers.length===0, blockers:[...new Set(blockers)], ids:[...ids] };
}
export function deleteRecords(s: State, kind: Kind, id: string, reason: string) {
    text(reason); const preview=deletePreview(s,kind,id);
    demand(preview.allowed, 'Deletion blocked / المسح ممنوع: '+preview.blockers.join(' · '),'DEPENDENCY',409);
    const target=row(s,kind,id), requestId=kind==='assignments'?target.requestId:undefined, ids=new Set(preview.ids);
    if(kind==='imports') ids.delete(id);
    for(const k of kinds) s[k]=s[k].filter(r=>!ids.has(r.id));
    if(kind==='imports') { target.status='undone'; target.reason=reason; }
    if(requestId) row(s,'requests',requestId).status='reserved';
    return {id,count:preview.count};
}
