import { runAdversarialHarness } from "../services/adversarialHarnessService.js";

export async function runHarnessHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const scenario = String(req.body?.scenario || req.query.scenario || "villain_marathon").trim() || "villain_marathon";
    const judge = req.body?.judge !== false;

    const report = await runAdversarialHarness({ personalityId, scenario, judge });
    return res.json(report);
  } catch (error) {
    return next(error);
  }
}