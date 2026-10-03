import { useEffect, useState } from "react";
import { api } from "./api/client";
import type {
  Comparison,
  SimulationInput,
  SimulationResult,
} from "./api/types";

// Results are bound to the exact input object, including the debounce interval.
// A late response can never become visible for a newer draft or after reset.
export function useSimulation(
  inputs: SimulationInput | null,
  running: boolean,
  retry: number,
) {
  const [settled, setSettled] = useState<{
    input: SimulationInput;
    retry: number;
    result?: SimulationResult;
    comparison?: Comparison;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!inputs || !running) {
      setSettled(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      Promise.all([api.simulate(inputs), api.compare(inputs)])
        .then(([result, comparison]) => {
          if (alive) setSettled({ input: inputs, retry, result, comparison });
        })
        .catch((error) => {
          if (alive) setSettled({ input: inputs, retry, error: error.message });
        });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [inputs, running, retry]);
  const valid =
    running && settled?.input === inputs && settled?.retry === retry;
  return {
    result: valid ? (settled?.result ?? null) : null,
    comparison: valid ? (settled?.comparison ?? null) : null,
    error: valid ? (settled?.error ?? "") : "",
    pending: running && !valid,
  };
}
