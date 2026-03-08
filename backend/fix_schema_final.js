const fs = require('fs');
const path = './prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

// The strategy: For each model, ensure there is EXACTLY ONE id field.
const models = content.split('model ');
let result = models[0]; // the top stuff before first model

for (let i = 1; i < models.length; i++) {
  let modelBody = models[i];
  const lines = modelBody.split('\\n');
  
  let idCount = 0;
  let fixedLines = lines.filter(line => {
    if (line.includes('@id')) {
      idCount++;
      // Only keep the first @id field
      if (idCount > 1) {
        return false;
      }
    }
    return true;
  });
  
  // If no @id found at all, add one right below the model declaration (first line)
  if (idCount === 0) {
     fixedLines.splice(1, 0, '  id String @id @default(uuid())');
  }
  
  result += 'model ' + fixedLines.join('\\n');
}

fs.writeFileSync(path, result);
console.log('Fixed duplicate/missing IDs!');
