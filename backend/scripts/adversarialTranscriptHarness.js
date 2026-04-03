import "dotenv/config";

import { getAdversarialScenarioKeys, runAdversarialHarness } from "../services/adversarialHarnessService.js";

function printUsage() {
  console.log("Usage: npm run adversarial-harness --workspace backend -- --personality=ID [--scenario=name|all]");
  console.log(`Scenarios: ${getAdversarialScenarioKeys().join(", ")}`);
}

function parseArgs(argv) {
  const options = {
    personalityId: null,
    scenario: "all",
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

    if (arg.startsWith("--scenario=")) {
      options.scenario = String(arg.split("=")[1] || "all").trim() || "all";
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

  try {
    const result = await runAdversarialHarness({
      personalityId: options.personalityId,
      scenario: options.scenario,
      judge: true,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

main();