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
  `TEXT NOT NULL DEFAULT '{"enabled":true,"autoplay":false,"engine":"auto","pitch":1,"rate":1,"preferredVoice":"","providerVoice":"alloy","providerModel":"gpt-4o-mini-tts","piperModelPath":"","piperSpeaker":null}'`,
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
  "responseFocusProfile",
  `TEXT NOT NULL DEFAULT '{"defaultLens":"balanced","lenses":[]}'`,
);
ensureColumn(
  "personalities",
  "expressionStyle",
  `TEXT NOT NULL DEFAULT '{"sentenceStyle":"","interruptionRate":0.3,"energy":"medium","rules":[]}'`,
);
ensureColumn("personalities", "prosodyTemplate", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("personalities", "prosodyTemplatePath", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "prosodySourceUrl", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "prosodyUpdatedAt", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "voiceSampleAnalysis", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("personalities", "voiceSampleSelectedAt", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "gender", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "avatarImageUrl", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "singingProfile", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("personalities", "emotionDrift", "TEXT NOT NULL DEFAULT '{}'");
// Per-personality LLM binding — used by the council/external API layer.
// Falls back to global config when empty.
ensureColumn("personalities", "llmConfig", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn(
  "personalities",
  "stateFlaws",
  `TEXT NOT NULL DEFAULT '{"intoxication":{"enabled":false,"level":0,"decayPerTurn":0.02,"triggerGain":0.12,"triggerKeywords":["drink","drunk","alcohol","whiskey","vodka","beer","wine","buzzed"]}}'`,
);
ensureColumn(
  "personalities",
  "vocalMannerisms",
  `TEXT NOT NULL DEFAULT '{"frequency":0.15,"items":[],"sfxTags":[],"sfxFrequency":0.25,"sfxPlacement":"random"}'`,
);

// ── Voice clone metadata ─────────────────────────────────────────────────────
// Stores which clone engine is active and where reference files live on disk.
// Audio/model files are stored as files; only paths are persisted here.
ensureColumn("personalities", "cloneEngine", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "cloneReferenceClipPath", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personalities", "cloneRvcPackId", "INTEGER");
ensureColumn("personalities", "cloneUpdatedAt", "TEXT NOT NULL DEFAULT ''");

// ── RVC Voice Packs ──────────────────────────────────────────────────────────
// Pre-trained RVC models that can be linked to any persona as a voice pack.
db.exec(`
  CREATE TABLE IF NOT EXISTS rvc_voice_packs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    modelPath TEXT NOT NULL,
    samplePath TEXT NOT NULL DEFAULT '',
    ownerId INTEGER,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

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
ensureColumn("chat_messages", "embedding", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chat_messages", "embeddingModel", "TEXT NOT NULL DEFAULT ''");

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
    lastAccessedAt TEXT,
    accessCount INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (personalityId) REFERENCES personalities(id)
  )
`);

ensureColumn("personality_memory", "embedding", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personality_memory", "embeddingModel", "TEXT NOT NULL DEFAULT ''");
ensureColumn("personality_memory", "enabled", "INTEGER NOT NULL DEFAULT 1");
// Existing databases already have createdAt. These two are new. ensureColumn
// checks PRAGMA table_info first, so a fresh database that just created the
// columns does not throw on ALTER TABLE.
ensureColumn("personality_memory", "lastAccessedAt", "TEXT");
ensureColumn("personality_memory", "accessCount", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_personality_memory_personality_id
  ON personality_memory (personalityId, importance DESC, id DESC)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memory_keyword_index (
    keyword TEXT NOT NULL,
    memoryId INTEGER NOT NULL,
    personalityId INTEGER NOT NULL,
    PRIMARY KEY (keyword, memoryId)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memory_keyword_personality
  ON memory_keyword_index (personalityId, keyword)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memory_keyword_memory
  ON memory_keyword_index (memoryId)
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

// ---------------------------------------------------------------------------
// Persona Preference Memory — what each persona loves, hates, finds exciting
// or annoying. These persist across conversations and actively influence mood.
// prefType: 'loves'|'likes'|'excites'|'hates'|'dislikes'|'annoys'|'offends'|'bores'
// source:   'learned' (extracted from dialogue) | 'explicit' (manually set)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS persona_preferences (
    id INTEGER PRIMARY KEY,
    personalityId INTEGER NOT NULL,
    prefType TEXT NOT NULL DEFAULT 'likes',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 7,
    source TEXT NOT NULL DEFAULT 'learned',
    triggerCount INTEGER NOT NULL DEFAULT 0,
    lastTriggeredAt TEXT NOT NULL DEFAULT '',
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personalityId) REFERENCES personalities(id)
  )
`);

ensureColumn("persona_preferences", "triggerCount", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("persona_preferences", "lastTriggeredAt", "TEXT NOT NULL DEFAULT ''");
ensureColumn("persona_preferences", "updatedAt", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_persona_preferences_personality_id
  ON persona_preferences (personalityId, importance DESC, id DESC)
`);

// ---------------------------------------------------------------------------
// Extended user memory types for emotional preferences:
// 'user_likes' | 'user_dislikes' | 'user_trigger_positive' | 'user_trigger_negative'
// are stored in the existing user_memory table — no schema change needed.
// ---------------------------------------------------------------------------

export default db;
