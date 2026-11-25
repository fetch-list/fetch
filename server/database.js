// Opens the SQLite database and creates the schema.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS registers (
    list_id TEXT NOT NULL,
    entity  TEXT NOT NULL,
    id      TEXT NOT NULL,
    field   TEXT NOT NULL,
    value   TEXT NOT NULL,    -- JSON
    hlc     TEXT NOT NULL,    -- timestamp of the winning write
    seq     INTEGER NOT NULL, -- server-side order of acceptance, used as pull cursor
    PRIMARY KEY (list_id, entity, id, field)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS registers_seq ON registers (list_id, seq);
`;

export function openDatabase(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
