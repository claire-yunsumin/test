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
  tabs
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: Array<{ value: string; label: string; count?: number }>;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab.value} className={value === tab.value ? "active" : ""} onClick={() => onChange(tab.value)}>
          {tab.label}
          {typeof tab.count === "number" && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className="centered">{children}</div>;
}
