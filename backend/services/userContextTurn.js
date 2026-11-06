import { detectUserAffect } from "./userAffectDetector.js";
import { buildAdaptationDirectives } from "./userAdaptation.js";
import { readUserContextFlags } from "./userContextFlags.js";
import { recordUserTurn } from "./userContextStore.js";
import { buildTheoryOfMind } from "./theoryOfMind.js";

function emptyTurn(flags) {
  return {
    affect: null,
    userModel: null,
    theoryOfMind: null,
    adaptation: null,
    flags,
  };
}

// One turn of the user-side layers. Character mood is not an input or an output.
export function runUserContextTurn(input = {}) {
  const flags = input.flags || readUserContextFlags();
  if (!flags.affect && !flags.model && !flags.theory && !flags.adaptation) {
    return emptyTurn(flags);
  }

  const affect = flags.affect
    ? detectUserAffect({ message: input.message, history: input.history || [] })
    : null;

  let userModel = null;
  if (flags.model) {
    try {
      userModel = recordUserTurn({
        personalityId: input.personalityId,
        userId: input.userId,
        sessionKey: input.sessionKey,
        message: input.message,
        affect,
        now: input.now,
      });
    } catch (error) {
      console.error("[VOXIS] user model update failed:", error?.message || error);
    }
  }

  const theoryOfMind = flags.theory
    ? buildTheoryOfMind({
        affect,
        userModel,
        message: input.message,
        history: input.history || [],
      })
    : null;

  const adaptation = flags.adaptation
    ? buildAdaptationDirectives({ affect, userModel, theoryOfMind })
    : null;

  return { affect, userModel, theoryOfMind, adaptation, flags };
}
