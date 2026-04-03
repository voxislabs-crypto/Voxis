import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databasePath = path.join(__dirname, "..", "voxis.sqlite");

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS personalities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    traits TEXT NOT NULL,
    quirks TEXT NOT NULL,
    mood TEXT NOT NULL,
    systemPrompt TEXT NOT NULL
  )
`);

ensureColumn("personalities", "sourceQuery", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "sourceUrls", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("personalities", "researchSummary", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "speechStyle", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "notablePhrases", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("personalities", "researchSources", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn(
  "personalities",
  "voiceProfile",
  `TEXT NOT NULL DEFAULT '{"enabled":true,"autoplay":false,"pitch":1,"rate":1,"preferredVoice":""}'`,
);
ensureColumn("personalities", "behaviorRules", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("personalities", "goals", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("personalities", "coreValues", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("personalities", "creativeContext", "TEXT NOT NULL DEFAULT 'default'");
ensureColumn("personalities", "moodBaseline", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("personalities", "moodState", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("personalities", "moodSensitivity", "REAL NOT NULL DEFAULT 1.0");

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY,
    personalityId INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personalityId) REFERENCES personalities(id)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chat_messages_personality_id
  ON chat_messages (personalityId, id DESC)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS personality_memory (
    id INTEGER PRIMARY KEY,
    personalityId INTEGER NOT NULL,
    memoryType TEXT NOT NULL DEFAULT 'note',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personalityId) REFERENCES personalities(id)
  )
`);

ensureColumn("personality_memory", "embedding", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personality_memory", "embeddingModel", "TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_personality_memory_personality_id
  ON personality_memory (personalityId, importance DESC, id DESC)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
