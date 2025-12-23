#!/usr/bin/env tsx
/**
 * Evaluation test harness for semantic vs baseline modes
 * 
 * Usage:
 *   MODE=semantic tsx src/tests/run_eval.ts
 *   MODE=baseline tsx src/tests/run_eval.ts
 */

import * as fs from "fs";
import * as path from "path";
import { reason, type AgentResponse } from "../agent/reasoning";
import { baselineRecommend } from "../agent/baseline";
import type { ChatMessage } from "@/lib/types";

const MODE = (process.env.MODE || "semantic").toLowerCase();

interface EvalQuestion {
  id: string;
  text: string;
  expected_mode: string;
  requires_clarifying_question: boolean;
  category: string;
}

interface EvalResult {
  question_id: string;
  question_text: string;
  mode: string;
  passed: boolean;
  errors: string[];
  details: {
    json_valid?: boolean;
    avoided_hallucinations?: boolean;
    asked_clarifiers_when_needed?: boolean;
    expected_mode_match?: boolean;
  };
}

/**
 * Validate JSON structure for semantic mode
 */
function validateJSON(response: unknown): boolean {
  try {
    const resp = response as AgentResponse;
    
    // Check required fields
    if (!resp.mode || !Array.isArray(resp.recommendations) || !Array.isArray(resp.errors)) {
      return false;
    }

    // Validate mode enum
    if (!["clarify", "recommend", "compare", "fail"].includes(resp.mode)) {
      return false;
    }

    // Validate recommendations if present
    if (resp.recommendations.length > 0) {
      for (const rec of resp.recommendations) {
        if (!rec.product_id || !rec.title || !rec.availability || !rec.confidence) {
          return false;
        }
        if (!["high", "medium", "low"].includes(rec.confidence)) {
          return false;
        }
        if (!Array.isArray(rec.why_it_fits) || !Array.isArray(rec.tradeoffs) || !Array.isArray(rec.proof)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if response avoided hallucinations (has proof for claimed attributes)
 */
function avoidedHallucinations(response: AgentResponse): boolean {
  for (const rec of response.recommendations) {
    // Check that proof array is not empty
    if (rec.proof.length === 0) {
      return false;
    }

    // Check that why_it_fits claims are reasonable
    // (In a real implementation, we'd cross-reference with actual product data)
    // For now, just check that proof exists
    if (rec.why_it_fits.length > 0 && rec.proof.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Check if clarifiers were asked when needed
 */
function askedClarifiersWhenNeeded(
  response: AgentResponse,
  question: EvalQuestion
): boolean {
  if (question.requires_clarifying_question) {
    return response.mode === "clarify" && response.clarifying_question !== null;
  }
  return true; // Not required, so pass
}

/**
 * Run evaluation for a single question
 */
async function evaluateQuestion(question: EvalQuestion): Promise<EvalResult> {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: question.text,
    },
  ];

  let response: AgentResponse | string;
  let jsonValid = true;
  let agentResponse: AgentResponse | null = null;

  try {
    if (MODE === "semantic") {
      response = await reason(messages);
      agentResponse = response as AgentResponse;
      jsonValid = validateJSON(response);
    } else {
      // Baseline mode
      response = await baselineRecommend(messages);
      jsonValid = typeof response === "string"; // Baseline returns string
    }
  } catch (error) {
    return {
      question_id: question.id,
      question_text: question.text,
      mode: MODE,
      passed: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
      details: {},
    };
  }

  const errors: string[] = [];
  const details: EvalResult["details"] = {};

  // Check JSON validity (semantic mode only)
  if (MODE === "semantic" && agentResponse) {
    details.json_valid = jsonValid;
    if (!jsonValid) {
      errors.push("Response is not valid JSON matching AgentResponse schema");
    }

    // Check hallucinations
    details.avoided_hallucinations = avoidedHallucinations(agentResponse);
    if (!details.avoided_hallucinations) {
      errors.push("Response may contain hallucinations (missing proof)");
    }

    // Check clarifiers
    details.asked_clarifiers_when_needed = askedClarifiersWhenNeeded(
      agentResponse,
      question
    );
    if (!details.asked_clarifiers_when_needed) {
      errors.push("Did not ask clarifying question when needed");
    }

    // Check expected mode
    details.expected_mode_match = agentResponse.mode === question.expected_mode;
    if (!details.expected_mode_match) {
      errors.push(
        `Expected mode ${question.expected_mode}, got ${agentResponse.mode}`
      );
    }
  }

  const passed = errors.length === 0;

  return {
    question_id: question.id,
    question_text: question.text,
    mode: MODE,
    passed,
    errors,
    details,
  };
}

/**
 * Main evaluation runner
 */
async function runEvaluation() {
  console.log(`\n=== Running Evaluation in ${MODE.toUpperCase()} mode ===\n`);

  // Load questions
  const questionsPath = path.join(__dirname, "eval_questions.json");
  const questionsData = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));
  const questions: EvalQuestion[] = questionsData.questions;

  console.log(`Loaded ${questions.length} test questions\n`);

  const results: EvalResult[] = [];

  // Run evaluation for each question
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`[${i + 1}/${questions.length}] Evaluating: "${question.text}"`);
    
    const result = await evaluateQuestion(question);
    results.push(result);

    if (result.passed) {
      console.log(`  ✓ PASSED\n`);
    } else {
      console.log(`  ✗ FAILED: ${result.errors.join(", ")}\n`);
    }

    // Small delay to avoid rate limits
    if (i < questions.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Print summary
  console.log("\n=== Evaluation Summary ===\n");
  
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Questions: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n`);

  // Breakdown by category
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const result of results) {
    const question = questions.find((q) => q.id === result.question_id);
    if (question) {
      if (!byCategory[question.category]) {
        byCategory[question.category] = { passed: 0, total: 0 };
      }
      byCategory[question.category].total++;
      if (result.passed) {
        byCategory[question.category].passed++;
      }
    }
  }

  console.log("Breakdown by Category:");
  for (const [category, stats] of Object.entries(byCategory)) {
    console.log(
      `  ${category}: ${stats.passed}/${stats.total} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`
    );
  }

  // Detailed failures
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n=== Failed Questions ===\n");
    for (const failure of failures) {
      console.log(`Q: ${failure.question_text}`);
      console.log(`  Errors: ${failure.errors.join(", ")}`);
      console.log(`  Details: ${JSON.stringify(failure.details, null, 2)}\n`);
    }
  }

  // Save results to file
  const resultsPath = path.join(__dirname, `eval_results_${MODE}_${Date.now()}.json`);
  fs.writeFileSync(
    resultsPath,
    JSON.stringify({ mode: MODE, results, summary: { passed, failed, total: results.length } }, null, 2)
  );
  console.log(`\nResults saved to: ${resultsPath}\n`);
}

// Run if executed directly
if (require.main === module) {
  runEvaluation().catch((error) => {
    console.error("Evaluation failed:", error);
    process.exit(1);
  });
}

export { runEvaluation, evaluateQuestion };

