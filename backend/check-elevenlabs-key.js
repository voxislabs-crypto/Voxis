#!/usr/bin/env node
/**
 * Diagnostic script to check ElevenLabs API key configuration
 * Usage: node check-elevenlabs-key.js
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "voxis.sqlite");
const db = new Database(dbPath);

console.log("=== ElevenLabs API Key Diagnostic ===\n");

// Check environment variable
const envKey = process.env.ELEVENLABS_API_KEY;
console.log("1. Environment Variable (ELEVENLABS_API_KEY):");
if (envKey) {
  console.log(`   ✓ Present: ${envKey.substring(0, 8)}... (length: ${envKey.length})`);
} else {
  console.log("   ✗ Not set");
}
console.log();

// Check database
try {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get("tts_credentials");
  
  console.log("2. Database Credential (app_settings.tts_credentials):");
  
  if (!row || !row.value) {
    console.log("   ✗ No tts_credentials entry found in database");
  } else {
    const parsed = JSON.parse(row.value);
    
    if (parsed.elevenlabs) {
      const apiKey = parsed.elevenlabs.apiKey || "";
      const voiceId = parsed.elevenlabs.voiceId || "";
      const model = parsed.elevenlabs.model || "";
      const updatedAt = parsed.elevenlabs.updatedAt || "";
      
      console.log("   ✓ ElevenLabs entry found:");
      console.log(`      API Key: ${apiKey ? apiKey.substring(0, 8) + "... (length: " + apiKey.length + ")" : "(empty)"}`);
      console.log(`      Voice ID: ${voiceId || "(not set)"}`);
      console.log(`      Model: ${model || "(not set)"}`);
      console.log(`      Updated: ${updatedAt || "(unknown)"}`);
      
      // Check for common issues
      if (apiKey) {
        const trimmed = apiKey.trim();
        if (trimmed.length !== apiKey.length) {
          console.log("\n   ⚠ WARNING: API key has leading/trailing whitespace!");
        }
        if (apiKey.includes(" ")) {
          console.log("   ⚠ WARNING: API key contains spaces!");
        }
        if (!apiKey.match(/^[a-zA-Z0-9]+$/)) {
          console.log("   ⚠ WARNING: API key contains unexpected characters!");
        }
      }
    } else {
      console.log("   ✗ No elevenlabs entry in tts_credentials");
    }
    
    // Show all providers
    console.log("\n   Other providers in database:");
    Object.keys(parsed).forEach(provider => {
      if (provider !== "elevenlabs") {
        console.log(`      - ${provider}`);
      }
    });
  }
} catch (error) {
  console.log(`   ✗ Error reading database: ${error.message}`);
}

console.log("\n3. Recommendation:");

let dbHasElevenlabs = false;
try {
  if (row?.value) {
    const parsed = JSON.parse(row.value);
    dbHasElevenlabs = Boolean(parsed.elevenlabs?.apiKey);
  }
} catch {
  // ignore
}

if (!envKey && !dbHasElevenlabs) {
  console.log("   → No API key found. Add one in Settings → Voice Provider Credentials");
} else if (envKey && dbHasElevenlabs) {
  console.log("   → Both env and database keys are present. Database key takes priority.");
  console.log("   → If having issues, try clearing the database key and using only the env key,");
  console.log("      or vice versa.");
} else if (dbHasElevenlabs) {
  console.log("   → Using database key. If authentication fails:");
  console.log("      1. Verify the key is correct in your ElevenLabs account");
  console.log("      2. Re-enter the key in Settings → Voice Provider Credentials");
  console.log("      3. Or clear it and use ELEVENLABS_API_KEY environment variable");
} else {
  console.log("   → Using environment key. If authentication fails:");
  console.log("      1. Verify ELEVENLABS_API_KEY is correct");
  console.log("      2. Restart the backend server after changing .env");
}

console.log("\n=================================\n");

db.close();
