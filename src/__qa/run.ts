import { downloadRoiDisbursementPdf } from './mod';
const names=['PAMELA SSAKA','Kamukama Annet','NASASIRA FAITH DAVID','LANGAT SAMUEL','PROSSY NAZZIMULI','Daniel Abel Rubangakene Long Name','MARY NYACHWO'];
const cash=Array.from({length:82},(_,i)=>({n:i+1,portfolio_phone:i%5?'+25670932002'+(i%10):'Not registered',partner:names[i%names.length],paid_to:'Kabahuma Lillian',principal:1_000_000*(82-i),returns_paid:150_000*(82-i),time_eat:'17:1'+(i%10),date_eat:'2026-08-10',portfolio_code:'WIP'+i}));
const comp=Array.from({length:26},(_,i)=>({n:i+1,portfolio_phone:'+256700123'+(100+i),partner:names[i%names.length],new_principal:5_000_000+i*1000,returns_compounded:750_000+i*10,executed_by:'ATUHAIRE CAROLYNE',time_eat:'09:5'+(i%10),date_eat:'2026-08-10',portfolio_code:'WIP'+i}));
const report={period:{start:'',end:'',start_eat:'2026-08-10 00:00',end_eat:'2026-08-10 23:59'},generated_at:new Date().toISOString(),
summary:{total_approved:129799253,cash_total:89448376,compounded_total:40350877,partners_affected:95,payouts_count:82,compounded_portfolios:26,portfolios_total:108,principal_total:900000000},
cash,compounded:comp,
approvals:[{stage:'Requested / prepared',authorised_by:'ATUHAIRE CAROLYNE',role:'Partner Ops',items:82,amount:89448376,window:'15:40 - 18:57'},{stage:'Operational clearance',authorised_by:'LUKODDA JOSEPH',role:'COO',items:82,amount:89448376,window:'15:40 - 18:57'},{stage:'Final approval / disbursed',authorised_by:'Angwen Sarah / Benjamin Muhanguzi',role:'CFO',items:82,amount:89448376,window:'15:40 - 18:57'},{stage:'Compounding executed',authorised_by:'ATUHAIRE CAROLYNE',role:'Partner Ops',items:26,amount:40350877,window:'09:57 - 15:03'}],
reconciliation:{wallet_credits:{legs:82,amount:89448376},reinvestments:{legs:26,amount:40350877},platform_expense:{legs:108,amount:129799253},balanced:true},
routing:[{name:'Kabahuma Lillian',phone:'+256706662454',credits:82,amount:89448376}],proxy_credits:82,
exceptions:[{portfolio_code:'WIP2507088914',partner:'PAMELA SSAKA',amount:11769795,compounded_at:'10:11',paid_at:'18:57'}]};
await downloadRoiDisbursementPdf({filename:'qa.pdf',periodLabel:'Daily',report});
console.log('done');
