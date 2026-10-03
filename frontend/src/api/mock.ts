// Test/development fixtures captured from API v1.0.0; never used as a live fallback.
// No UI mock mode is enabled. Import only in tests or explicitly labelled rehearsal tools.
import snapshot from "./fixtures/baseline.json";
import type { SimulationInput, SimulationResult } from "./types";
export const demoInput: SimulationInput = snapshot.demo;
export const mockResult = snapshot.result as SimulationResult;
