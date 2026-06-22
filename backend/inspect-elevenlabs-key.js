#!/usr/bin/env node
/**
 * Detailed API key inspector - shows exact character issues
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "voxis.sqlite");
const db = new Database(dbPath);

try {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get("tts_credentials");
  
  if (row?.value) {
    const parsed = JSON.parse(row.value);
    
    if (parsed.elevenlabs?.apiKey) {
      const apiKey = parsed.elevenlabs.apiKey;
      
      console.log("=== Detailed API Key Analysis ===\n");
      console.log(`Length: ${apiKey.length}`);
      console.log(`First 15 chars: ${apiKey.substring(0, 15)}`);
      console.log(`Last 5 chars: ...${apiKey.substring(apiKey.length - 5)}`);
      console.log();
      
      // Check for specific issues
      const issues = [];
      
      // Check for whitespace
      if (apiKey !== apiKey.trim()) {
        issues.push(`Whitespace at start/end (actual length: ${apiKey.length}, trimmed: ${apiKey.trim().length})`);
      }
      
      // Check for newlines/carriage returns
      if (apiKey.includes("\n")) issues.push("Contains newline (\\n)");
      if (apiKey.includes("\r")) issues.push("Contains carriage return (\\r)");
      if (apiKey.includes("\t")) issues.push("Contains tab (\\t)");
      
      // Check for non-ASCII
      for (let i = 0; i < apiKey.length; i++) {
        const charCode = apiKey.charCodeAt(i);
        if (charCode > 127) {
          issues.push(`Non-ASCII character at position ${i} (code: ${charCode}, char: ${apiKey[i]})`);
          break;
        }
      }
      
      // Show character codes for unexpected chars
      const unexpectedChars = [];
      for (let i = 0; i < apiKey.length; i++) {
        const char = apiKey[i];
        const code = apiKey.charCodeAt(i);
        
        // ElevenLabs keys are alphanumeric plus underscore
        if (!/[a-zA-Z0-9_]/.test(char)) {
          unexpectedChars.push({ pos: i, char, code, display: char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : char });
        }
      }
      
      if (issues.length > 0) {
        console.log("❌ ISSUES FOUND:");
        issues.forEach(issue => console.log(`   - ${issue}`));
        console.log();
      }
      
      if (unexpectedChars.length > 0) {
        console.log("🔍 Unexpected characters:");
        unexpectedChars.slice(0, 10).forEach(({pos, display, code}) => {
          console.log(`   Position ${pos}: '${display}' (ASCII ${code})`);
        });
        if (unexpectedChars.length > 10) {
          console.log(`   ... and ${unexpectedChars.length - 10} more`);
        }
        console.log();
      }
      
      if (issues.length === 0 && unexpectedChars.length === 0) {
        console.log("✓ API key format looks correct (only alphanumeric + underscore)");
        console.log("\n⚠ The key format is valid, but ElevenLabs is rejecting it.");
        console.log("  Possible reasons:");
        console.log("  1. The key has been revoked or expired");
        console.log("  2. This is a test/sandbox key without API access");
        console.log("  3. Your ElevenLabs account has been suspended");
        console.log("\n  → Try generating a new API key from your ElevenLabs dashboard");
      } else {
        console.log("💡 FIX:");
        console.log("   1. Go to Settings → Voice Provider Credentials");
        console.log("   2. Clear the current ElevenLabs credential");
        console.log("   3. Copy your API key CAREFULLY from ElevenLabs dashboard");
        console.log("   4. Paste it into the API Key field (make sure no extra spaces)");
        console.log("   5. Save");
      }
      
    } else {
      console.log("No ElevenLabs API key found in database.");
    }
  } else {
    console.log("No tts_credentials found in database.");
  }
} catch (error) {
  console.error("Error:", error.message);
} finally {
  db.close();
}
