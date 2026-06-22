#!/usr/bin/env node
/**
 * Direct ElevenLabs API test - bypasses all Voxis code
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "voxis.sqlite");
const db = new Database(dbPath);

async function testElevenLabsKey() {
  console.log("=== Direct ElevenLabs API Test ===\n");

  // Get key from database
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get("tts_credentials");
  
  if (!row?.value) {
    console.log("❌ No tts_credentials found in database");
    db.close();
    return;
  }

  const parsed = JSON.parse(row.value);
  const apiKey = parsed.elevenlabs?.apiKey;

  if (!apiKey) {
    console.log("❌ No ElevenLabs API key in database");
    db.close();
    return;
  }

  console.log(`Testing key: ${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 5)}`);
  console.log(`Key length: ${apiKey.length}\n`);

  // Test 1: Fetch voices
  console.log("Test 1: Fetching voices...");
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      const voiceCount = data.voices?.length || 0;
      console.log(`✅ SUCCESS! Found ${voiceCount} voices`);
      
      if (voiceCount > 0) {
        console.log("\nYour voices:");
        data.voices.slice(0, 5).forEach(v => {
          console.log(`   - ${v.name} (${v.voice_id}) [${v.category}]`);
        });
        if (voiceCount > 5) {
          console.log(`   ... and ${voiceCount - 5} more`);
        }
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ FAILED: ${response.status}`);
      console.log(`Error response: ${errorText}`);
      
      if (response.status === 401) {
        console.log("\n💡 This means the API key is INVALID or EXPIRED");
        console.log("   Actions to take:");
        console.log("   1. Go to https://elevenlabs.io/app/settings/api-keys");
        console.log("   2. Check if this key is listed and active");
        console.log("   3. If not, generate a NEW key");
        console.log("   4. Copy the NEW key");
        console.log("   5. In Voxis Settings tab, re-enter it");
      } else if (response.status === 429) {
        console.log("\n💡 Rate limited - wait a moment and try again");
      }
    }
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
  }

  // Test 2: Fetch models
  console.log("\n\nTest 2: Fetching models...");
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      const modelCount = Array.isArray(data) ? data.length : 0;
      console.log(`✅ SUCCESS! Found ${modelCount} models`);
      
      if (modelCount > 0) {
        console.log("\nAvailable models:");
        data.slice(0, 5).forEach(m => {
          console.log(`   - ${m.name} (${m.model_id})`);
        });
      }
    } else {
      console.log(`❌ FAILED: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
  }

  db.close();
}

testElevenLabsKey();
