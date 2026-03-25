/**
 * Shadow Logger — Phase 3 Dual Execution
 * 
 * Wraps shadow validation in a fire-and-forget promise.
 * Logs match/divergence to console with [SHADOW] prefix.
 * All errors are swallowed — shadow failures NEVER affect primary path.
 */

import type { ShadowValidationResult } from "./shadowValidation.ts";

export function runShadowAudit(
  functionName: string,
  inputs: Record<string, unknown>,
  primaryPassed: boolean,
  shadowFn: () => ShadowValidationResult,
): void {
  // Fire-and-forget — intentionally not awaited
  Promise.resolve().then(() => {
    try {
      const shadowResult = shadowFn();
      const shadowPassed = shadowResult.valid;

      if (shadowPassed === primaryPassed) {
        console.log(
          `[SHADOW] ${functionName} | MATCH | primary=${primaryPassed} shadow=${shadowPassed}`
        );
      } else {
        console.warn(
          `[SHADOW] ${functionName} | DIVERGENCE | primary=${primaryPassed} shadow=${shadowPassed} | errors=${JSON.stringify(shadowResult.errors)} | inputs=${JSON.stringify(inputs)}`
        );
      }
    } catch (err) {
      console.error(
        `[SHADOW] ${functionName} | ERROR | ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }).catch(() => {
    // Double safety net — swallow everything
  });
}
