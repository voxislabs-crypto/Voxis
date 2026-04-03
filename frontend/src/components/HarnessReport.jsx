import { useMemo, useState } from "react";

const scenarios = [
  { value: "villain_marathon", label: "Villain Marathon" },
  { value: "reform_pressure", label: "Reform Pressure" },
  { value: "false_vulnerability", label: "False Vulnerability" },
  { value: "authority_pressure", label: "Authority Pressure" },
  { value: "exploit_guilt", label: "Exploit Guilt" },
  { value: "all", label: "All Scenarios" },
];

const reportStyles = `
  .harness-shell {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .harness-toolbar {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .harness-toolbar select,
  .harness-toolbar button {
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(0,180,255,0.16);
    background: rgba(6,14,28,0.86);
    color: var(--text);
  }

  .harness-toolbar button {
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    border: 0;
    font-weight: 800;
  }

  .harness-note {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.93rem;
  }

  .report-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .score-card,
  .scenario-card {
    border: 1px solid rgba(0,180,255,0.12);
    border-radius: 18px;
    background: rgba(6,14,28,0.72);
    padding: 14px 16px;
  }

  .score-card strong,
  .scenario-card strong {
    display: block;
    color: var(--accent);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  .score-card span {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text);
  }

  .scenario-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .scenario-topline {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 8px;
  }

  .scenario-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 10px 0;
  }

  .scenario-pills span {
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(0,180,255,0.08);
    border: 1px solid rgba(0,180,255,0.16);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .judge-block,
  .issues-block,
  .transcript-block {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0,180,255,0.10);
  }

  .judge-summary,
  .issue-list,
  .transcript-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .issue-list li {
    color: var(--muted);
    line-height: 1.5;
  }

  .transcript-turn {
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(0, 180, 255, 0.04);
  }

  .transcript-turn.user {
    border-left: 3px solid rgba(255,122,56,0.65);
  }

  .transcript-turn.assistant {
    border-left: 3px solid rgba(0,200,255,0.65);
  }

  .transcript-turn strong {
    display: inline;
    margin: 0 8px 0 0;
    color: var(--text);
    font-size: 0.82rem;
    letter-spacing: 0.04em;
  }

  .transcript-turn p {
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .empty-report {
    padding: 26px 0;
    text-align: center;
    color: var(--muted);
  }

  @media (max-width: 900px) {
    .report-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .report-grid {
      grid-template-columns: 1fr;
    }
  }
`;

function ScoreCard({ label, value }) {
  return (
    <div className="score-card">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

export default function HarnessReport({ personality, onStatus }) {
  const [scenario, setScenario] = useState("villain_marathon");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const selectedScenario = useMemo(
    () => scenarios.find((item) => item.value === scenario)?.label || scenario,
    [scenario],
  );

  async function runHarness() {
    if (!personality) {
      return;
    }

    setRunning(true);
    onStatus({ type: "", message: "" });

    try {
      const response = await fetch(`/personality/${personality.id}/harness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, judge: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to run adversarial harness.");
      }

      setReport(data);
      onStatus({
        type: "success",
        message: `Harness finished for ${personality.name} using ${selectedScenario}.`,
      });
    } catch (error) {
      onStatus({ type: "error", message: error.message || "Failed to run adversarial harness." });
    } finally {
      setRunning(false);
    }
  }

  if (!personality) {
    return (
      <div className="harness-shell">
        <style>{reportStyles}</style>
        <p className="empty-report">Select a personality to run the adversarial harness.</p>
      </div>
    );
  }

  return (
    <div className="harness-shell">
      <style>{reportStyles}</style>

      <div className="harness-toolbar">
        <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
          {scenarios.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <button type="button" onClick={runHarness} disabled={running}>
          {running ? "Running evaluation…" : "Run adversarial harness"}
        </button>
      </div>

      <p className="harness-note">
        Runs a transcript stress test against the active personality, then reports heuristic scores,
        prompt-budget telemetry, mood adjudication coverage, and an LLM judge summary.
      </p>

      {report ? (
        <>
          <div className="report-grid">
            <ScoreCard label="Overall" value={report.summary.overallScore} />
            <ScoreCard label="Judge Avg" value={report.summary.averageJudgeScore} />
            <ScoreCard label="Max Prompt Tokens" value={report.summary.maxPromptTokens} />
            <ScoreCard label="Semantic Mood Turns" value={`${report.summary.semanticMoodTurns}/${report.summary.ambiguousMoodTurns}`} />
          </div>

          <div className="scenario-stack">
            {report.results.map((result) => (
              <div key={result.key} className="scenario-card">
                <div className="scenario-topline">
                  <div>
                    <strong>{result.title}</strong>
                    <div>{result.turnCount} turns</div>
                  </div>
                  <div>Score {result.scores.overall}</div>
                </div>

                <div className="scenario-pills">
                  <span>Identity {result.scores.identityResistance}</span>
                  <span>Discipline {result.scores.characterizationDiscipline}</span>
                  <span>Prompt {result.scores.promptEfficiency}</span>
                  <span>Mood {result.scores.moodCoverage}</span>
                  <span>Tokens max {result.promptStats.maxApproxTokens}</span>
                </div>

                {result.judge ? (
                  <div className="judge-block">
                    <strong>Judge Summary</strong>
                    <div className="judge-summary">
                      <div>{result.judge.summary}</div>
                      <div className="scenario-pills">
                        <span>Judge overall {result.judge.overallScore}</span>
                        <span>Identity {result.judge.identityResistance}</span>
                        <span>Discipline {result.judge.characterizationDiscipline}</span>
                        <span>Pressure {result.judge.pressureResponse}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {(result.judge?.issues?.length || result.judge?.strengths?.length) ? (
                  <div className="issues-block">
                    <strong>Judge Notes</strong>
                    <ul className="issue-list">
                      {(result.judge.strengths || []).map((item) => (
                        <li key={`strength-${item}`}>Strength: {item}</li>
                      ))}
                      {(result.judge.issues || []).map((item) => (
                        <li key={`issue-${item}`}>Issue: {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="transcript-block">
                  <summary>Transcript and diagnostics</summary>
                  <div className="transcript-list">
                    {result.transcript.map((turn, index) => (
                      <div key={`${turn.role}-${index}`} className={`transcript-turn ${turn.role}`}>
                        <strong>{turn.role === "assistant" ? personality.name : "User"}</strong>
                        {turn.role === "assistant" && turn.moodLabel ? `Mood: ${turn.moodLabel}` : null}
                        <p>{turn.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-report">No report yet. Run the harness against the active personality.</p>
      )}
    </div>
  );
}