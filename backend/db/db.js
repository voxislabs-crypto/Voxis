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
ensureColumn(
  "personalities",
  "expressionProfile",
  `TEXT NOT NULL DEFAULT '{"preset":"auto","calmness":0.5,"intensity":0.5,"blinkRate":0.5,"gazeDrift":0.5}'`,
);
ensureColumn(
  "personalities",
  "bigFiveProfile",
  `TEXT NOT NULL DEFAULT '{"openness":0.5,"conscientiousness":0.5,"extraversion":0.5,"agreeableness":0.5,"neuroticism":0.5}'`,
);
ensureColumn(
  "personalities",
  "alignmentProfile",
  `TEXT NOT NULL DEFAULT '{"enabled":false,"alignment":"true_neutral"}'`,
);
ensureColumn(
  "personalities",
  "expressionStyle",
  `TEXT NOT NULL DEFAULT '{"sentenceStyle":"","interruptionRate":0.3,"energy":"medium","rules":[]}'`,
);

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

ensureColumn("chat_messages", "userId", "INTEGER");
ensureColumn("chat_messages", "mode", "TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chat_messages_personality_id
  ON chat_messages (personalityId, id DESC)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chat_messages_user_personality
  ON chat_messages (userId, personalityId, id DESC)
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    displayName TEXT NOT NULL,
    ageBand TEXT NOT NULL DEFAULT 'adult',
    locale TEXT NOT NULL DEFAULT 'en-US',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    userId INTEGER PRIMARY KEY,
    defaultMode TEXT NOT NULL DEFAULT 'scientist',
    safetyTier TEXT NOT NULL DEFAULT 'standard',
    performanceTier TEXT NOT NULL DEFAULT 'light',
    voiceNarrationEnabled INTEGER NOT NULL DEFAULT 0,
    supervisedAdvancedMode INTEGER NOT NULL DEFAULT 0,
    parentEmailOptional TEXT NOT NULL DEFAULT '',
    parentalConsentRequired INTEGER NOT NULL DEFAULT 0,
    parentalConsentVerifiedAt TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`);

ensureColumn("user_profiles", "performanceTier", "TEXT NOT NULL DEFAULT 'light'");
ensureColumn("user_profiles", "voiceNarrationEnabled", "INTEGER NOT NULL DEFAULT 0");

// Clerk integration
ensureColumn("users", "clerkId", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "ownerId", "INTEGER");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_age_band
  ON users (ageBand, id DESC)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL,
    memoryType TEXT NOT NULL DEFAULT 'preference',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    embedding TEXT NOT NULL DEFAULT '',
    embeddingModel TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_user_memory_user_id
  ON user_memory (userId, importance DESC, id DESC)
`);

export default db;
