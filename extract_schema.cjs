const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('welile_export_2026-05-05T07-18-02-698Z.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const tables = {};

  for await (const line of rl) {
    if (line.startsWith('INSERT INTO public.')) {
        const match = line.match(/INSERT INTO public\.("?[a-zA-Z0-9_]+"?) \((.+?)\) VALUES/);
        if (match) {
            const tableName = match[1].replace(/"/g, '');
            if (!tables[tableName]) {
                const cols = match[2].split(',').map(c => c.trim().replace(/"/g, ''));
                tables[tableName] = cols;
            }
        }
    }
  }

  let mermaid = 'erDiagram\n';
  for (const [table, cols] of Object.entries(tables)) {
      mermaid += `    ${table} {\n`;
      for (const col of cols) {
          mermaid += `        string ${col}\n`;
      }
      mermaid += `    }\n`;
  }
  
  // Infer relationships
  const relationships = [];
  const tableNames = Object.keys(tables);
  
  for (const [table, cols] of Object.entries(tables)) {
      for (const col of cols) {
          if (col.endsWith('_id') && col !== 'id') {
              let targetTable = null;
              
              // Special mapping cases for welile
              if (['user_id', 'agent_id', 'tenant_id', 'supporter_id', 'referrer_id', 'manager_id', 'coo_approved_by', 'cfo_approved_by'].includes(col)) {
                  if (tables['profiles']) targetTable = 'profiles';
              } else if (col === 'rent_request_id' && tables['rent_requests']) {
                  targetTable = 'rent_requests';
              } else if (col === 'wallet_id' && tables['wallets']) {
                  targetTable = 'wallets';
              } else if (col === 'group_id' && tables['ledger_account_groups']) {
                  targetTable = 'ledger_account_groups';
              } else if (col === 'account_id' && tables['ledger_accounts']) {
                  targetTable = 'ledger_accounts';
              } else if (col === 'landlord_id' && tables['landlords']) {
                  targetTable = 'landlords';
              } else {
                  // General fallback: remove _id and pluralize
                  const baseName = col.slice(0, -3);
                  if (tables[baseName + 's']) {
                      targetTable = baseName + 's';
                  } else if (tables[baseName + 'es']) {
                      targetTable = baseName + 'es';
                  } else if (tables[baseName]) {
                      targetTable = baseName;
                  }
              }
              
              if (targetTable) {
                  relationships.push(`    ${targetTable} ||--o{ ${table} : "${col}"`);
              }
          }
      }
  }
  
  // Dedup relationships
  const uniqueRelationships = [...new Set(relationships)];
  
  mermaid += '\n    %% Relationships\n';
  mermaid += uniqueRelationships.join('\n') + '\n';
  
  fs.writeFileSync('database_schema.md', '```mermaid\n' + mermaid + '```\n');
  console.log('Updated database_schema.md with relationships');
}

processLineByLine();
