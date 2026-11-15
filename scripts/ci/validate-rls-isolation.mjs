import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A wrapper is not a transaction: every relative include must independently
// satisfy the same isolation contract. Never execute includes during validation.
export function validateRlsIsolation(file, ancestors = new Set()) {
  const resolved = fs.realpathSync(file);
  if (ancestors.has(resolved)) throw new Error(`Cyclic RLS include: ${file}`);
  const stack = new Set(ancestors).add(resolved);
  const sql = fs.readFileSync(resolved, 'utf8');
  if (/^\s*COMMIT\s*;/mi.test(sql)) throw new Error(`RLS suite must use BEGIN/ROLLBACK without COMMIT: ${file}`);
  // Existing transaction suites may include DDL/helpers inside their own rollback.
  if (/^\s*BEGIN\s*;/mi.test(sql) && /^\s*ROLLBACK\s*;/mi.test(sql)) return;
  if (/^\s*\\ir\b/m.test(sql)) {
    // Deliberately narrow wrapper grammar: no SQL or other psql commands.
    const lines = sql.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/);
    let included = 0;
    for (const line of lines) {
      if (/^\s*(?:--.*)?$/.test(line)) continue;
      const match = /^\s*\\ir\s+([A-Za-z0-9_./-]+\.sql)\s*$/.exec(line);
      if (!match) throw new Error(`SQL or unsupported command outside RLS wrapper: ${file}`);
      validateRlsIsolation(path.resolve(path.dirname(resolved), match[1]), stack);
      included++;
    }
    if (!included) throw new Error(`Empty RLS wrapper: ${file}`);
    return;
  }
  throw new Error(`RLS suite must use BEGIN/ROLLBACK without COMMIT: ${file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const files = process.argv.slice(2);
    if (!files.length) throw new Error('No RLS suites supplied');
    for (const file of files) validateRlsIsolation(file);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
