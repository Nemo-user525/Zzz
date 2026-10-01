import { createContext, useContext, useEffect, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

export const InputValidity = createContext<
  (id: string, invalid: boolean) => void
>(() => {});
export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState(String(props.value ?? ""));
  const id = useId();
  const report = useContext(InputValidity);
  useEffect(() => {
    setDraft(String(props.value ?? ""));
  }, [props.value]);
  useEffect(() => () => report(id, false), [id, report]);
  const step = props.step === "any" ? 0 : Number(props.step ?? 1);
  const steps = step ? (Number(draft) - Number(props.min ?? 0)) / step : 0;
  const invalid =
    draft.trim() === "" ||
    !Number.isFinite(Number(draft)) ||
    (props.min !== undefined && Number(draft) < Number(props.min)) ||
    (props.max !== undefined && Number(draft) > Number(props.max)) ||
    (step > 0 && Math.abs(steps - Math.round(steps)) > 0.000001);
  useEffect(() => report(id, invalid), [id, invalid, report]);
  return (
    <>
      <input
        {...props}
        required
        value={draft}
        aria-invalid={invalid}
        aria-describedby={invalid ? id + "-error" : undefined}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const bad = text.trim() === "" || !event.target.validity.valid;
          report(id, bad);
          if (!bad) props.onChange?.(event);
        }}
      />
      {invalid && (
        <small id={id + "-error"} aria-hidden="true" className="input-error">
          请输入有效{props.step === 1 ? "整数日期" : "数值"}
          {props.min !== undefined ? `（至少 ${props.min}）` : ""}
        </small>
      )}
    </>
  );
}
