import { generateFloatAllocationsPdf } from './alloc.ts';
import { writeFileSync } from 'fs';
const rows=[
 {date:'2026-04-21T08:28:29Z',amount:12000,status:'active',reason:null},
 {date:'2026-04-21T08:28:48Z',amount:15000,status:'active',reason:null},
 {date:'2026-04-19T14:02:53Z',amount:300000,status:'reversed',reason:'Not actual amount'},
 {date:'2026-04-22T06:14:42Z',amount:24000,status:'active',reason:null},
];
const blob=await generateFloatAllocationsPdf({aiId:'WL-AB12CD',tenantName:'Jane Tenant',phone:'0704825473',agentName:'Field Agent',rows,periodFrom:'2026-04-01',periodTo:'2026-04-30',statusFilter:'all'});
writeFileSync('/tmp/alloc.pdf',Buffer.from(await blob.arrayBuffer()));
console.log('ok');
