const fs = require('fs');
let content = fs.readFileSync('../prisma/schema.prisma', 'utf8');

const models = content.split('model ');
let result = models[0];

for (let i = 1; i < models.length; i++) {
  let modelBody = models[i];
  const lines = modelBody.split('\n');
  
  let idCount = 0;
  let fixedLines = lines.filter(line => {
    // skip the badly generated String @id empty lines
    if (line.trim() === 'String @id') return false;
    
    if (line.includes('@id')) {
      idCount++;
      if (idCount > 1) return false;
    }
    return true;
  });
  
  if (idCount === 0) {
     fixedLines.splice(1, 0, '  id String @id @default(uuid())');
  }
  
  result += 'model ' + fixedLines.join('\n');
}

fs.writeFileSync('./prisma/schema.prisma', result);
console.log('Absolutely fixed the schema.');
