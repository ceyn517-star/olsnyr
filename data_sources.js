import fs from 'node:fs';
import path from 'node:path';

// Deploy trigger: manual redeploy requested

// Scan data directory to discover TXT and SQL sources
export function scanDataSources(dataDir) {
  let TXT_PATH = path.join(dataDir, 'dcıdsorgudata.txt');
  let SQL_PATHS = [
    path.join(dataDir, 'za.sql'),
    path.join(dataDir, 'zagros.sql'),
    path.join(dataDir, 'zagrs.sql'),
    path.join(dataDir, 'discord data.sql'),
  ];

  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => e.name);

    const sqlFiles = files.filter(n => n.toLowerCase().endsWith('.sql')).map(n => path.join(dataDir, n));
    if (sqlFiles.length > 0) SQL_PATHS = sqlFiles;

    if (!fs.existsSync(TXT_PATH)) {
      const txtFiles = files.filter(n => n.toLowerCase().endsWith('.txt')).map(n => path.join(dataDir, n));
      if (txtFiles.length > 0) TXT_PATH = txtFiles[0];
    }
  } catch (err) {
    // ignore
  }

  return { TXT_PATH, SQL_PATHS };
}

// Load all SQL files into the database. Assumes a working DB connection via db.execSql.
export async function loadAllSql(dataDir, sqlPaths) {
  // Execute SQL files into the database
  try {
    const { execSql } = await import('./db.js');
    
    for (const file of sqlPaths) {
      try {
        if (typeof file === 'string' && file && fs.existsSync(file)) {
          console.log(`[DataSources] Loading SQL file: ${path.basename(file)}`);
          const sqlContent = fs.readFileSync(file, 'utf8');
          
          // Enhanced MySQL to PostgreSQL conversion
          let processedContent = sqlContent
            .replace(/`/g, '"')  // Backticks -> çift tırnak
            .replace(/\\'/g, "''")  // Escape single quotes
            .replace(/\\n/g, '\\n')  // Handle newlines
            .replace(/\\r/g, '\\r')  // Handle carriage returns
            .replace(/\\t/g, '\\t')  // Handle tabs
            .replace(/USE\s+\w+;/gi, '')  // Remove USE statements
            .replace(/--.*$/gm, '')  // Remove single line comments
            .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
            .replace(/ENGINE=\w+/gi, '')  // Remove ENGINE declarations
            .replace(/DEFAULT CHARSET=\w+/gi, '')  // Remove CHARSET
            .replace(/COLLATE=\w+/gi, '')  // Remove COLLATE
            .replace(/AUTO_INCREMENT/gi, 'SERIAL')  // MySQL AUTO_INCREMENT -> PostgreSQL SERIAL
            .replace(/TINYINT\(\d+\)/gi, 'SMALLINT')  // TINYINT -> SMALLINT
            .replace(/MEDIUMINT\(\d+\)/gi, 'INTEGER')  // MEDIUMINT -> INTEGER
            .replace(/INT\(\d+\)/gi, 'INTEGER')  // INT(n) -> INTEGER
            .replace(/BIGINT\(\d+\)/gi, 'BIGINT')  // BIGINT(n) -> BIGINT
            .replace(/VARCHAR\(\d+\)/gi, (match) => match)  // Keep VARCHAR
            .replace(/TEXT\(\d+\)/gi, 'TEXT')  // TEXT(n) -> TEXT
            .replace(/DATETIME/gi, 'TIMESTAMP')  // DATETIME -> TIMESTAMP
            .replace(/IF NOT EXISTS/gi, 'IF NOT EXISTS')  // Keep IF NOT EXISTS
            .replace(/PRIMARY KEY\s*\(/gi, 'PRIMARY KEY (')  // Keep PRIMARY KEY
            .replace(/UNIQUE KEY\s*\(/gi, 'UNIQUE (')  // MySQL UNIQUE KEY -> PostgreSQL UNIQUE
            .replace(/KEY\s*\(/gi, 'INDEX (')  // MySQL KEY -> PostgreSQL INDEX
            .replace(/\s*,\s*\)/g, ')')  // Clean trailing commas
            .replace(/;\s*$/gm, ';')  // Ensure semicolons
            .replace(/\n\s*\n/g, '\n');  // Remove empty lines

          // Split into individual statements and execute
          const statements = processedContent
            .split(/;\s*\n/)
            .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'))
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 10); // Filter out very short statements
          
          for (const statement of statements) {
            if (statement && !statement.startsWith('--')) {
              try {
                await execSql(statement);
              } catch (sqlErr) {
                // Log the problematic statement for debugging
                console.warn(`[DataSources] SQL statement failed in ${path.basename(file)}:`, sqlErr.message);
                console.warn(`[DataSources] Problematic statement: ${statement.substring(0, 100)}...`);
              }
            }
          }
          
          console.log(`[DataSources] ✓ Loaded: ${path.basename(file)}`);
        }
      } catch (e) {
        console.warn('[DataSources] SQL file load error:', file, e.message);
      }
    }
    return true;
  } catch (err) {
    console.error('[DataSources] Failed to load SQL files:', err.message);
    return false;
  }
}

// Simple TXT search for a given Discord ID
export function searchTxtForDiscordId(txtPath, discordId) {
  try {
    if (!txtPath || !fs.existsSync(txtPath)) return [];
    const content = fs.readFileSync(txtPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.includes(discordId));
    // Return raw lines or parsed objects if possible; here we return lines for simplicity
    return lines;
  } catch {
    return [];
  }
}
