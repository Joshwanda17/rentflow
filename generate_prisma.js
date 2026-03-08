import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TYPES_FILE_PATH = join(process.cwd(), 'src', 'integrations', 'supabase', 'types.ts');
const PRISMA_SCHEMA_PATH = join(process.cwd(), 'prisma', 'schema.prisma');

function generatePrismaSchema() {
  const content = readFileSync(TYPES_FILE_PATH, 'utf-8');
  
  // Find the Tables definition within Database['public']
  const tablesMatch = content.match(/Tables:\s*\{([\s\S]*?)\}\s*(?:Views:|Functions:|Enums:|CompositeTypes:)/);
  if (!tablesMatch) {
    console.error("Could not find Tables definition");
    return;
  }
  
  const tablesContent = tablesMatch[1];
  
  // Regex to match each table block
  const tableRegex = /([\w_]+):\s*\{\s*Row:\s*\{([\s\S]*?)\}\s*Insert:\s*\{[\s\S]*?\}\s*Update:\s*\{[\s\S]*?\}\s*Relationships:\s*\[([\s\S]*?)\]\s*\}/g;
  
  let prismaSchema = `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;

  let match;
  while ((match = tableRegex.exec(tablesContent)) !== null) {
    const tableName = match[1];
    const rowContent = match[2];
    
    // Attempt basic mapping of fields
    const fields = rowContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [field, typeDef] = line.split(':').map(part => part.trim());
        if (!field || !typeDef) return null;
        
        // Remove trailing commas
        let cleanType = typeDef.replace(/,$/, '');
        
        let prismaType = 'String';
        let isOptional = false;
        
        if (cleanType.includes('null')) {
          isOptional = true;
          cleanType = cleanType.replace(/\s*\|\s*null/, '');
        }
        
        if (cleanType === 'string') prismaType = 'String';
        else if (cleanType === 'number') prismaType = 'Float';
        else if (cleanType === 'boolean') prismaType = 'Boolean';
        else if (cleanType === 'Json' || cleanType === 'Json[]') prismaType = 'Json';
        else if (cleanType.includes('Enums')) prismaType = 'String'; // Fallback for enums
        
        let idModifier = field === 'id' ? ' @id @default(uuid())' : '';
        let optionalModifier = isOptional ? '?' : '';
        let lineString = '  ' + field + ' ' + prismaType + optionalModifier + idModifier;
        return lineString;
      })
      .filter(Boolean);
      
      const modelName = tableName.charAt(0).toUpperCase() + tableName.slice(1).replace(/_([a-z])/g, (g) => g[1].toUpperCase());

      prismaSchema += 'model ' + modelName + ' {\n' + fields.join('\n') + '\n\n  @@map("' + tableName + '")\n}\n\n';
  }

  writeFileSync(PRISMA_SCHEMA_PATH, prismaSchema, 'utf-8');
  console.log("Prisma schema generated successfully at", PRISMA_SCHEMA_PATH);
}

generatePrismaSchema();
