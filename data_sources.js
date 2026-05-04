import fs from 'node:fs';
import path from 'node:path';

/** Veri dizininde SQL/TXT kaynaklarını tarar; sunucu başlangıcında kullanılır. */
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
    let totalLoaded = 0;
    let totalErrors = 0;
    
    for (const file of sqlPaths) {
      try {
        if (typeof file === 'string' && file && fs.existsSync(file)) {
          console.log(`[DataSources] Loading SQL file: ${path.basename(file)}`);
          const stats = fs.statSync(file);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`[DataSources] File size: ${sizeMB} MB`);
          
          const sqlContent = fs.readFileSync(file, 'utf8');
          
          // Enhanced MySQL to PostgreSQL conversion
          let processedContent = sqlContent
            // FIRST: Handle specific MySQL patterns that need backticks
            .replace(/`id`\s+INTEGER\s+NOT\s+NULL/gi, '`id` SERIAL')  // Fix id column with backticks
            .replace(/`id`\s+INT\s+NOT\s+NULL/gi, '`id` SERIAL')  // Fix id INT with backticks
            .replace(/`id`\s+INTEGER\s+NOT\s+NULL\s+SERIAL/gi, '`id` SERIAL')  // Fix id with SERIAL
            // Then convert backticks to quotes
            .replace(/`/g, '"')  // Backticks -> çift tırnak
            .replace(/\\'/g, "''")  // Escape single quotes
            .replace(/\\n/g, '\\n')  // Handle newlines
            .replace(/\\r/g, '\\r')  // Handle carriage returns
            .replace(/\\t/g, '\\t')  // Handle tabs
            // MariaDB/MySQL conditional comments /*!40101 */
            .replace(/\/\*![\d]+\s+SET\s+@[^*]+\*\//gi, '')  // Remove conditional SET statements
            .replace(/\/\*![\d]+\s+SET\s+NAMES[^*]+\*\//gi, '')  // Remove SET NAMES
            .replace(/\/\*![\d]+\s+DEFAULT\s+CHARACTER[^*]+\*\//gi, '')  // Remove DEFAULT CHARACTER SET
            // MySQL-specific statements to remove
            .replace(/SET\s+SQL_MODE\s*=\s*["']?[^"';]+["']?\s*;/gi, '')  // Remove SET SQL_MODE
            .replace(/SET\s+FOREIGN_KEY_CHECKS\s*=\s*\d+\s*;/gi, '')  // Remove FOREIGN_KEY_CHECKS
            .replace(/SET\s+UNIQUE_CHECKS\s*=\s*\d+\s*;/gi, '')  // Remove UNIQUE_CHECKS
            .replace(/SET\s+AUTOCOMMIT\s*=\s*\d+\s*;/gi, '')  // Remove AUTOCOMMIT
            .replace(/SET\s+time_zone\s*=\s*["'][^"']+["']\s*;/gi, '')  // Remove SET time_zone
            .replace(/SET\s+TIME_ZONE\s*=\s*["'][^"']+["']\s*;/gi, '')  // Remove SET TIME_ZONE
            .replace(/START\s+TRANSACTION\s*;/gi, 'BEGIN;')  // Convert START TRANSACTION to BEGIN
            .replace(/COMMIT\s*;/gi, 'COMMIT;')  // Keep COMMIT
            .replace(/ROLLBACK\s*;/gi, 'ROLLBACK;')  // Keep ROLLBACK
            .replace(/USE\s+\w+\s*;/gi, '')  // Remove USE statements
            .replace(/USE\s+["']\w+["']\s*;/gi, '')  // Remove USE with quotes
            .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+\w+.*;/gi, '')  // Remove CREATE DATABASE with options
            .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+["']\w+["'].*;/gi, '')  // Remove CREATE DATABASE with backticks
            .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
            .replace(/--.*$/gm, '')  // Remove single line comments
            .replace(/ENGINE=\w+/gi, '')  // Remove ENGINE declarations
            .replace(/DEFAULT CHARSET=\w+/gi, '')  // Remove CHARSET
            .replace(/COLLATE=\w+/gi, '')  // Remove COLLATE
            // Fix ID column patterns after backtick conversion - SQLite mode
            .replace(/"id"\s+INTEGER\s+NOT\s+NULL\s+AUTO_INCREMENT/gi, '"id" INTEGER PRIMARY KEY AUTOINCREMENT')  // SQLite auto increment
            .replace(/"id"\s+INTEGER\s+NOT\s+NULL\s+SERIAL/gi, '"id" INTEGER PRIMARY KEY AUTOINCREMENT')  // SQLite SERIAL
            .replace(/INTEGER\s+NOT\s+NULL\s+SERIAL/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // SQLite SERIAL
            .replace(/INTEGER\s+NOT\s+NULL\s+AUTO_INCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // MySQL -> SQLite
            .replace(/INTEGER\s+NOT\s+NULL\s+AUTOINCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // Fix INTEGER NOT NULL AUTOINCREMENT
            .replace(/AUTO_INCREMENT/gi, 'PRIMARY KEY AUTOINCREMENT')  // MySQL AUTO_INCREMENT -> SQLite
            .replace(/SERIAL/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // PostgreSQL SERIAL -> SQLite
            .replace(/INTEGER PRIMARY KEY AUTOINCREMENT PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // Fix double PRIMARY KEY
            .replace(/PRIMARY KEY AUTOINCREMENT PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')  // Fix double PRIMARY KEY variant
            .replace(/TINYINT\(\d+\)/gi, 'INTEGER')  // TINYINT -> INTEGER (SQLite only has INTEGER)
            .replace(/SMALLINT\(\d+\)/gi, 'INTEGER')  // SMALLINT -> INTEGER
            .replace(/MEDIUMINT\(\d+\)/gi, 'INTEGER')  // MEDIUMINT -> INTEGER
            .replace(/INT\(\d+\)/gi, 'INTEGER')  // INT(n) -> INTEGER
            .replace(/BIGINT\(\d+\)/gi, 'INTEGER')  // BIGINT(n) -> INTEGER (SQLite uses INTEGER for all)
            .replace(/DOUBLE\(\d+,\d+\)/gi, 'REAL')  // DOUBLE -> REAL
            .replace(/FLOAT\(\d+,\d+\)/gi, 'REAL')  // FLOAT -> REAL
            .replace(/DECIMAL\(\d+,\d+\)/gi, 'NUMERIC')  // DECIMAL -> NUMERIC
            .replace(/NUMERIC\(\d+,\d+\)/gi, 'NUMERIC')  // Keep NUMERIC
            .replace(/VARCHAR\(\d+\)/gi, 'TEXT')  // VARCHAR -> TEXT (SQLite prefers TEXT)
            .replace(/CHAR\(\d+\)/gi, 'TEXT')  // CHAR -> TEXT
            .replace(/TEXT\(\d+\)/gi, 'TEXT')  // TEXT(n) -> TEXT
            .replace(/LONGTEXT/gi, 'TEXT')  // LONGTEXT -> TEXT
            .replace(/MEDIUMTEXT/gi, 'TEXT')  // MEDIUMTEXT -> TEXT
            .replace(/TINYTEXT/gi, 'TEXT')  // TINYTEXT -> TEXT
            .replace(/BYTEA/gi, 'BLOB')  // PostgreSQL BYTEA -> SQLite BLOB
            .replace(/BLOB/gi, 'BLOB')  // Keep BLOB
            .replace(/LONGBLOB/gi, 'BLOB')  // LONGBLOB -> BLOB
            .replace(/MEDIUMBLOB/gi, 'BLOB')  // MEDIUMBLOB -> BLOB
            .replace(/TINYBLOB/gi, 'BLOB')  // TINYBLOB -> BLOB
            .replace(/DATETIME/gi, 'TEXT')  // DATETIME -> TEXT (SQLite stores dates as TEXT)
            .replace(/TIMESTAMP/gi, 'TEXT')  // TIMESTAMP -> TEXT
            .replace(/DATE/gi, 'TEXT')  // DATE -> TEXT
            .replace(/TIME/gi, 'TEXT')  // TIME -> TEXT
            .replace(/YEAR\(\d+\)/gi, 'INTEGER')  // YEAR -> INTEGER
            .replace(/BOOLEAN/gi, 'INTEGER')  // BOOLEAN -> INTEGER (SQLite uses 0/1)
            .replace(/BOOL/gi, 'INTEGER')  // BOOL -> INTEGER
            .replace(/IF NOT EXISTS/gi, 'IF NOT EXISTS')  // Keep IF NOT EXISTS
            .replace(/PRIMARY KEY\s*\(/gi, 'PRIMARY KEY (')  // Keep PRIMARY KEY
            .replace(/UNIQUE KEY\s*\(/gi, 'UNIQUE (')  // MySQL UNIQUE KEY -> SQLite UNIQUE
            .replace(/KEY\s*\(/gi, '')  // Remove MySQL KEY (SQLite doesn't support standalone KEY)
            .replace(/\s*,\s*\)/g, ')')  // Clean trailing commas
            .replace(/;\s*$/gm, ';')  // Ensure semicolons
            .replace(/\n\s*\n/g, '\n');  // Remove empty lines

          // Remove MySQL stored procedures (DELIMITER blocks)
          processedContent = processedContent
            .replace(/DELIMITER\s+\$\$[\s\S]*?DELIMITER\s*;/gi, '')  // Remove DELIMITER blocks
            .replace(/DELIMITER\s+[^\s]+/gi, '');  // Remove DELIMITER statements

          // Split into individual statements and execute
          const statements = processedContent
            .split(/;\s*\n/)
            .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'))
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 10) // Filter out very short statements
            .filter(stmt => !stmt.match(/^discord\.gg\//i)) // Skip discord.gg lines
            .filter(stmt => !stmt.match(/^[a-zA-Z0-9]+\.gg\//i)) // Skip other .gg invite links
            .filter(stmt => !stmt.toUpperCase().includes('DEFINER=')) // Skip stored procedures
            .filter(stmt => !stmt.toUpperCase().includes('PROCEDURE')) // Skip procedures
            .filter(stmt => !stmt.toUpperCase().includes('FUNCTION')); // Skip functions
          
          console.log(`[DataSources] ${path.basename(file)}: ${statements.length} statements to execute`);
          
          let fileLoaded = 0;
          let fileErrors = 0;
          
          for (const statement of statements) {
            if (statement && !statement.startsWith('--')) {
              try {
                await execSql(statement);
                fileLoaded++;
              } catch (sqlErr) {
                fileErrors++;
                // Only log first few errors to avoid spam, but include the full error
                if (fileErrors <= 3) {
                  console.warn(`[DataSources] SQL statement failed in ${path.basename(file)}:`);
                  console.warn(`  Error: ${sqlErr.message}`);
                  console.warn(`  Code: ${sqlErr.code || 'N/A'}`);
                  console.warn(`  Statement: ${statement.substring(0, 80)}...`);
                }
              }
            }
          }
          
          totalLoaded += fileLoaded;
          totalErrors += fileErrors;
          console.log(`[DataSources] ✓ Loaded: ${path.basename(file)} (${fileLoaded} OK, ${fileErrors} errors)`);
        }
      } catch (e) {
        console.warn('[DataSources] SQL file load error:', file, e.message);
      }
    }
    
    console.log(`[DataSources] Total: ${totalLoaded} statements loaded, ${totalErrors} errors`);
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
