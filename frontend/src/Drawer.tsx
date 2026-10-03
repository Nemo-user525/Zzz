import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Drawer({
  children,
  onClose,
  viewKey,
}: {
  children: ReactNode;
  onClose: () => void;
  viewKey: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current) ref.current.scrollTop = 0;
  }, [viewKey]);
  return (
    <div className="overlay" onClick={onClose}>
      <aside
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="核对详情"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const nodes = ref.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input, select, [tabindex="0"]',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <button
          className="drawer-close"
          aria-label="关闭详情"
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </aside>
    </div>
  );
}
