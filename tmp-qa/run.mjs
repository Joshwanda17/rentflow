import { generateRepaymentSheetPdf } from './sheet.ts';
const data = {
  aiId:'WL-AB12CD', tenantName:'Jane Tenant', phone:'0704825473', agentName:'Field Agent',
  plans:[{date:'2026-03-01T08:00:00Z',disbursedAt:'2026-03-02T08:00:00Z',durationDays:30,status:'repaying',registrationType:null,rentAmount:300000,totalRepayment:360000,amountRepaid:120000,dailyRepayment:12000,initialOutstanding:null,landlordName:'Mr Landlord',propertyAddress:'Kampala'}],
  transactions:[{date:'2026-03-05T10:00:00Z',amount:50000},{date:'2026-03-10T11:00:00Z',amount:70000}],
  allocations:[{date:'2026-03-05T10:00:00Z',amount:50000},{date:'2026-03-10T11:00:00Z',amount:70000}],
};
const blob = await generateRepaymentSheetPdf(data);
const buf = Buffer.from(await blob.arrayBuffer());
const { writeFileSync } = await import('fs');
writeFileSync('/tmp/out.pdf', buf);
console.log('bytes', buf.length);
