const fs = require('fs');
const path = './prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

const missingIdModels = [
  'AgentCollections',
  'CreditRequestDetails',
  'LedgerAccountGroups',
  'LedgerEntries',
  'LedgerTransactions',
  'TransactionApprovals'
];

missingIdModels.forEach(model => {
  const regex = new RegExp(`model ${model} \\{\\n`, 'g');
  content = content.replace(regex, `model ${model} {\n  id String @id @default(uuid())\n`);
});

fs.writeFileSync(path, content);
console.log('Injected missing IDs into 6 models.');
