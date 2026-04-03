import "dotenv/config";

import {
  backfillAllMissingMemoryEmbeddings,
  backfillMissingMemoryEmbeddings,
} from "../models/memoryModel.js";
import { getEmbeddingModelName, isEmbeddingConfigured } from "../services/llmService.js";

function printUsage() {
  console.log("Usage: npm run backfill-memory-embeddings --workspace backend -- [--personality=ID] [--limit=100]");
}

function parseArgs(argv) {
  const options = {
    personalityId: null,
    limit: 100,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--personality=")) {
      options.personalityId = Number(arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!isEmbeddingConfigured()) {
    console.error("Embeddings are not configured. Set EMBEDDING_MODEL and provider settings in backend/.env first.");
    process.exit(1);
  }

  const limit = Number.isFinite(options.limit) ? Math.min(500, Math.max(1, Math.floor(options.limit))) : 100;

  if (options.personalityId !== null && !Number.isInteger(options.personalityId)) {
    console.error("--personality must be an integer.");
    process.exit(1);
  }

  const result = Number.isInteger(options.personalityId)
    ? await backfillMissingMemoryEmbeddings(options.personalityId, limit)
    : await backfillAllMissingMemoryEmbeddings(limit);

  console.log(
    JSON.stringify(
      {
        embeddingModel: getEmbeddingModelName(),
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});