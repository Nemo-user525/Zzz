import type {
  Company,
  Comparison,
  Health,
  RiskEvent,
  SimulationInput,
  SimulationInputWire,
  SimulationResult,
  Source,
  UseCases,
} from "./types";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    const fields = details.filter(
      (d): d is { field: string; reason: string } =>
        !!d && typeof d === "object" && "field" in d && "reason" in d,
    );
    super(message + fields.map((d) => `；${d.field}: ${d.reason}`).join(""));
  }
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const r = await fetch("/api" + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(15000),
    });
    const value = await r.json().catch(() => null);
    if (!r.ok)
      throw new ApiError(
        value?.code || "http_error",
        value?.message || `接口请求失败（${r.status}），请检查本地 API 后重试`,
        value?.details || [],
      );
    if (value === null)
      throw new ApiError(
        "invalid_response",
        "API 未返回 JSON，请检查 Vite 代理和后端",
      );
    return value as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "network_error",
      "无法连接本地 API 或请求超时。请运行 start.ps1 -SkipInstall，然后重试。",
    );
  }
}
export const api = {
  health: () => request<Health>("/health"),
  useCases: () => request<UseCases>("/use-cases"),
  demo: async (): Promise<SimulationInput> => {
    const i = await request<SimulationInputWire>("/demo-scenario");
    return {
      ...i,
      gross_margin_rate: i.gross_margin_rate ?? null,
      direct_cost_yuan: i.direct_cost_yuan ?? null,
      shipments: i.shipments ?? null,
      cost_day: i.cost_day ?? 10,
      horizon_days: i.horizon_days ?? 90,
    };
  },
  company: (id: string) =>
    request<Company>("/companies/" + encodeURIComponent(id)),
  events: (id: string) =>
    request<RiskEvent[]>(
      "/companies/" + encodeURIComponent(id) + "/risk-events",
    ),
  source: (id: string) => request<Source>("/sources/" + encodeURIComponent(id)),
  simulate: (input: SimulationInput) =>
    request<SimulationResult>("/simulations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  compare: (input: SimulationInput) =>
    request<Comparison>("/compare-scenarios", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
