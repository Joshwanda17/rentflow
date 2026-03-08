const fs = require('fs');
const path = './prisma/schema.prisma';
const content = fs.readFileSync(path, 'utf8');
const fixed = content.split('\n').filter(line => !line.trim().startsWith('String @id')).join('\n');
fs.writeFileSync(path, fixed);
console.log('Schema fixed!');
