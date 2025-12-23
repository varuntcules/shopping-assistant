/**
 * Configuration for agent mode
 * 
 * Set MODE=baseline|semantic in environment variables
 * Default: semantic
 */
export const AGENT_MODE = (process.env.MODE || "semantic").toLowerCase() as "baseline" | "semantic";

export function isSemanticMode(): boolean {
  return AGENT_MODE === "semantic";
}

export function isBaselineMode(): boolean {
  return AGENT_MODE === "baseline";
}

