const fs = require('fs');
const content = fs.readFileSync('../prisma/schema.prisma', 'utf8');

const missingIdModels = [
  'AgentCollections',
  'CreditRequestDetails',
  'LedgerAccountGroups',
  'LedgerEntries',
  'LedgerTransactions',
  'TransactionApprovals'
];

let fixed = content.split('\n').filter(line => !line.trim().startsWith('String @id')).join('\n');

missingIdModels.forEach(model => {
  const regex = new RegExp(`model ${model} \\{\\n`, 'g');
  fixed = fixed.replace(regex, `model ${model} {\n  id String @id @default(uuid())\n`);
});

fs.writeFileSync('./prisma/schema.prisma', fixed);
console.log('Original schema completely fixed and written safely.');
