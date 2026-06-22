/**
 * migrateRickSfx.js
 * 
 * Migration script to update existing Rick personas with the new SFX tag system.
 * This script finds all personalities with "rick" in their name and adds
 * the new sfxTags, sfxFrequency, and sfxPlacement fields to their vocalMannerisms.
 * 
 * Run with: node backend/scripts/migrateRickSfx.js
 */

import { getAllPersonalities, updatePersonality } from "../models/personalityModel.js";

function isRickPersona(personality) {
  const name = String(personality.name || "").toLowerCase();
  return name.includes("rick");
}

function migratePersona(personality) {
  if (!isRickPersona(personality)) {
    return personality;
  }

  const currentVocalMannerisms = personality.vocalMannerisms || {};
  
  // Only migrate if sfxTags is not already set
  if (Array.isArray(currentVocalMannerisms.sfxTags) && currentVocalMannerisms.sfxTags.length > 0) {
    console.log(`  Skipping "${personality.name}" - already has sfxTags configured`);
    return personality;
  }

  const updatedVocalMannerisms = {
    ...currentVocalMannerisms,
    sfxTags: ["burp"],
    sfxFrequency: 0.32,
    sfxPlacement: "random", // "random" + burp => "throughout" for drunk interjections
  };

  console.log(`  Migrating "${personality.name}" with SFX configuration:`, updatedVocalMannerisms);

  return {
    ...personality,
    vocalMannerisms: updatedVocalMannerisms,
  };
}

async function main() {
  console.log("Starting Rick persona SFX migration...\n");

  try {
    const personalities = getAllPersonalities();
    console.log(`Found ${personalities.length} total personalities`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const personality of personalities) {
      if (!isRickPersona(personality)) {
        continue;
      }

      try {
        const updated = migratePersona(personality);
        
        // Check if migration was needed
        if (updated === personality) {
          skippedCount++;
          continue;
        }

        // Update the personality in the database
        await updatePersonality(personality.id, updated);
        console.log(`  ✓ Successfully migrated "${personality.name}" (ID: ${personality.id})`);
        migratedCount++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate "${personality.name}" (ID: ${personality.id}):`, error.message);
        errorCount++;
      }
    }

    console.log("\nMigration summary:");
    console.log(`  Migrated: ${migratedCount}`);
    console.log(`  Skipped: ${skippedCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log("\nMigration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
