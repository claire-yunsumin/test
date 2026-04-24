import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="panel-header">
      <PanelTitle title={title} />
      {action}
    </div>
  );
}

export function PanelTitle({ title }: { title: string }) {
  return <div className="panel-title">{title}</div>;
}

export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="meta-row">
      <small>{label}</small>
      <strong>{children}</strong>
    </div>
  );
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function Tabs({
  value,
  onChange,
  tabs,
  variant = "default"
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
  variant?: "default" | "segmented";
}) {
  return (
    <div className={`tabs tabs-${variant}`} role="tablist">
      {tabs.map((tab) => (
        <button key={tab.value} className={value === tab.value ? "active" : ""} onClick={() => onChange(tab.value)} role="tab" aria-selected={value === tab.value}>
          <span className="tab-label">{tab.label}</span>
          {typeof tab.count === "number" && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  tone = "default"
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  label?: string;
  tone?: "default" | "filter" | "inline";
}) {
  const selected = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <label className={`select-control select-${tone}`}>
      <div className="select-frame">
        {label && <em className="select-inline-label">{label}</em>}
        <strong className="select-value">{selected}</strong>
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label ?? selected}>
          {options.map(([v, optionLabel]) => (
            <option key={v} value={v}>
              {optionLabel}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export function FilterShell({ children, meta, action }: { children: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="filter-shell">
      <div className="filter-controls">{children}</div>
      {(meta || action) && (
        <div className="filter-meta">
          <div>{meta}</div>
          {action}
        </div>
      )}
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="centered">{children}</div>;
}
