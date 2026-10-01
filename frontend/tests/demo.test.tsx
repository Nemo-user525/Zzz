import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { api } from "../src/api/client";
import { useSimulation } from "../src/useSimulation";
import fixture from "../src/api/fixtures/baseline.json";
import type {
  Company,
  Comparison,
  Health,
  RiskEvent,
  SimulationInput,
  SimulationResult,
  Source,
} from "../src/api/types";

vi.mock("echarts-for-react/lib/core", () => ({
  default: () => <div>测试环境省略画布；真实浏览器单独验收</div>,
}));
beforeEach(() => {
  vi.spyOn(api, "health").mockResolvedValue(fixture.health as Health);
  vi.spyOn(api, "useCases").mockResolvedValue(
    structuredClone(fixture.useCases),
  );
  vi.spyOn(api, "demo").mockResolvedValue(structuredClone(fixture.demo));
  vi.spyOn(api, "company").mockResolvedValue(fixture.company as Company);
  vi.spyOn(api, "events").mockResolvedValue(fixture.events as RiskEvent[]);
  vi.spyOn(api, "source").mockImplementation(
    async (id) => (fixture.sources as Record<string, Source>)[id],
  );
  vi.spyOn(api, "simulate").mockResolvedValue(
    fixture.result as SimulationResult,
  );
  vi.spyOn(api, "compare").mockResolvedValue(fixture.comparison as Comparison);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe("request lifecycle", () => {
  it("hides old results during debounce and ignores a late older response", async () => {
    vi.useFakeTimers();
    let finishOld!: (result: SimulationResult) => void;
    vi.mocked(api.simulate).mockImplementationOnce(
      () => new Promise((resolve) => (finishOld = resolve)),
    );
    const initial = structuredClone(fixture.demo) as SimulationInput;
    const { result, rerender } = renderHook(
      ({ input }) => useSimulation(input, true, 0),
      { initialProps: { input: initial } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    const updated = { ...initial, prepayment_rate: 0.3 };
    vi.mocked(api.simulate).mockResolvedValue({
      ...fixture.result,
      minimum_balance_yuan: 330000,
    } as SimulationResult);
    rerender({ input: updated });
    expect(result.current.result).toBeNull();
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(result.current.result?.minimum_balance_yuan).toBe(330000);
    await act(async () => {
      finishOld(fixture.result as SimulationResult);
    });
    expect(result.current.result?.minimum_balance_yuan).toBe(330000);
  });
  it("reset invalidates in-flight results and comparisons together", async () => {
    vi.useFakeTimers();
    let finish!: (result: SimulationResult) => void;
    vi.mocked(api.simulate).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const { result, rerender } = renderHook(
      ({ running }) => useSimulation(fixture.demo, running, 0),
      { initialProps: { running: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    rerender({ running: false });
    await act(async () => {
      finish(fixture.result as SimulationResult);
    });
    expect(result.current.result).toBeNull();
    expect(result.current.comparison).toBeNull();
  });
});

it("loads a third configuration without evidence changes; reset respects configured default", async () => {
  const cases = structuredClone(fixture.useCases);
  cases.use_cases.push({
    ...cases.use_cases[1],
    id: "test-third-role",
    target_user: "测试采购负责人",
    headline: "第三角色配置标题",
    primary_action: "第三角色主操作",
    output_template: {
      title: "第三角色核对卡",
      sections: [
        {
          id: "extension",
          title: "扩展章节",
          fields: ["legal_name", "unknown_future_key"],
        },
      ],
    },
  });
  cases.default_use_case_id = cases.use_cases[1].id;
  vi.mocked(api.useCases).mockResolvedValue(cases);
  render(<App />);
  await screen.findByRole("heading", { name: cases.use_cases[1].headline });
  fireEvent.change(screen.getByLabelText("用户场景"), {
    target: { value: "test-third-role" },
  });
  expect(
    screen.getByRole("heading", { name: "第三角色配置标题" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "第三角色主操作 →" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "第三角色核对卡 ↗" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "第三角色核对卡 ↗" }));
  expect(
    screen.getByText("字段 unknown_future_key 尚未配置展示规则"),
  ).toBeTruthy();
  expect(api.company).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "↺ 重置演示" }));
  expect(
    screen.getByRole("heading", { name: cases.use_cases[1].headline }),
  ).toBeTruthy();
});

it("empty and negative inputs pause calculation; zero safety floor is accepted", async () => {
  render(<App />);
  await screen.findByRole("heading", {
    name: fixture.useCases.use_cases[0].headline,
  });
  fireEvent.click(screen.getByRole("button", { name: "推演这笔订单 →" }));
  await screen.findByRole("img", {
    name: "现金最低 3 万元，第 75 天；底线缺口 17 万元",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "编辑成本、发货、其他现金流 +" }),
  );
  const cash = screen.getByLabelText("期初现金（万元）");
  fireEvent.change(cash, { target: { value: "" } });
  expect(cash.getAttribute("aria-invalid")).toBe("true");
  expect(
    screen.queryByRole("img", {
      name: "现金最低 3 万元，第 75 天；底线缺口 17 万元",
    }),
  ).toBeNull();
  fireEvent.change(cash, { target: { value: "-1" } });
  expect(screen.getByRole("alert").textContent).toContain("已暂停计算");
  fireEvent.change(cash, { target: { value: "300.125" } });
  fireEvent.change(screen.getByLabelText("安全底线（万元）"), {
    target: { value: "0" },
  });
  await waitFor(() =>
    expect(api.simulate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opening_cash_yuan: 3001250,
        safety_floor_yuan: 0,
      }),
    ),
  );
});

it("source failure clearly uses cached evidence and preserves the selected fact excerpt", async () => {
  render(<App />);
  await screen.findByRole("heading", {
    name: fixture.useCases.use_cases[0].headline,
  });
  await waitFor(() => expect(api.source).toHaveBeenCalledTimes(2));
  vi.mocked(api.source).mockRejectedValue(new Error("network unavailable"));
  fireEvent.click(
    screen.getByRole("button", { name: /归属上市公司股东净资产\s*2026/ }),
  );
  await screen.findByText(/当前来源接口不可用，显示此前缓存/);
  expect(
    screen.getByText(/归属于上市公司股东的净资产 1,499,708,682.21/),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "打开官方原始 PDF ↗" })
      .getAttribute("href"),
  ).toContain("#page=3");
});

it("API failures do not silently use mock results; explicit retry recovers", async () => {
  vi.mocked(api.simulate).mockRejectedValueOnce(new Error("测试接口故障"));
  render(<App />);
  await screen.findByRole("heading", {
    name: fixture.useCases.use_cases[0].headline,
  });
  fireEvent.click(screen.getByRole("button", { name: "推演这笔订单 →" }));
  await screen.findByRole("alert");
  expect(
    screen
      .getByRole("button", { name: "交易核对卡 ↗" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "重试计算" }));
  await screen.findByRole("img", {
    name: "现金最低 3 万元，第 75 天；底线缺口 17 万元",
  });
});
