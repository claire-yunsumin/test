import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  LEGACY_STATE_TO_STATUS_ID,
  INBOX_COMPONENTS,
  STATE_META,
  STRUCTURE_META,
  TEMPLATE_META,
  type Analytics,
  type AppData,
  type ApprovalLine,
  type ApprovalPolicy,
  type DecisionType,
  type FormFieldType,
  type InboxComponent,
  type Member,
  type Mention,
  type Note,
  type NotificationSettings,
  type Role,
  type Task,
  type TaskAttachment,
  type TaskState,
  type Template,
  type TemplateType,
  type ThreadComment,
  type TimelineEvent,
  type Unit,
  type UnitMember,
  type UnitMemberRole
} from "@hwe/shared";
import { Badge, Centered, FilterShell, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../components/ui";
import { request } from "../lib/api";
import { go } from "../lib/router";
import type { TaskDetail, TaskView } from "../lib/viewTypes";
import { TaskViewTabs } from "../features/tasks/TaskViewTabs";
import {
  TASK_DESCRIPTION_FIELD_KEY,
  TASK_FILES_FIELD_KEY,
  buildTaskBreadcrumb,
  decisionActions,
  decisionHint,
  decisionLabel,
  densitySignal,
  elapsed,
  eventLabel,
  formatDate,
  formatFailure,
  hasChangedSinceSeen,
  isBacklogTask,
  isDueToday,
  memberName,
  pct,
  priorityLabel,
  profileDisplayName,
  roleLabel,
  shortText,
  states,
  taskAccessOf,
  templateLabel,
  templateOrder,
  templateTone,
  templateTypes,
  useDebouncedEffect,
  type TaskViewMode
} from "../lib/domain";

export function HierarchyView({ data, onReload }: { data: AppData; onReload: () => Promise<void> }) {
  const tasks = data.tasks as TaskView[];
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | TemplateType>("ALL");
  const [state, setState] = useState<"ALL" | TaskState>("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tasks.map((task) => task.id)));

  const filteredIds = useMemo(() => {
    const matched = new Set<string>();
    tasks.forEach((task) => {
      const okSearch = !search || `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase());
      const okType = type === "ALL" || task.templateType === type;
      const okState = state === "ALL" || task.currentState === state;
      const okAssignee = assignee === "ALL" || task.assigneeIds.includes(assignee);
      if (okSearch && okType && okState && okAssignee) {
        let cursor: Task | undefined = task;
        while (cursor) {
          matched.add(cursor.id);
          cursor = cursor.parentId ? tasks.find((row) => row.id === cursor?.parentId) : undefined;
        }
      }
    });
    return matched;
  }, [assignee, search, state, tasks, type]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, TaskView[]>();
    tasks.forEach((task) => {
      if (!filteredIds.has(task.id)) return;
      const rows = map.get(task.parentId) ?? [];
      rows.push(task);
      rows.sort((a, b) => templateOrder.indexOf(a.templateType ?? "TASK") - templateOrder.indexOf(b.templateType ?? "TASK"));
      map.set(task.parentId, rows);
    });
    return map;
  }, [filteredIds, tasks]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const param = [...next].join(",");
      window.history.replaceState({}, "", `/hierarchy?expanded=${param}`);
      return next;
    });
  };

  const createNode = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const task = await request<TaskView>("/api/tasks", { method: "POST", body: JSON.stringify({ title, parentId, templateId: templateId || null }) });
    setTitle("");
    setTemplateId("");
    setParentId(task.id);
    await onReload();
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="계층"
        title="결정 대상 구조"
        action={<button className="button primary" onClick={() => go("/tasks")}>새 태스크</button>}
      />
      <FilterShell
        meta={<span>{filteredIds.size} visible · {tasks.length} total</span>}
        action={<button className="button secondary" onClick={() => { setSearch(""); setType("ALL"); setState("ALL"); setAssignee("ALL"); }}>필터 초기화</button>}
      >
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="태스크 검색" />
        <Select label="유형" tone="filter" value={type} onChange={(v) => setType(v as typeof type)} options={templateTypes.map((v) => [v, v === "ALL" ? "전체 유형" : TEMPLATE_META[v].label])} />
        <Select label="상태" tone="filter" value={state} onChange={(v) => setState(v as typeof state)} options={states.map((v) => [v, v === "ALL" ? "전체 상태" : STATE_META[v].label])} />
        <Select label="담당자" tone="filter" value={assignee} onChange={setAssignee} options={[["ALL", "전체 담당자"], ...data.members.map((m) => [m.id, m.name] as [string, string])]} />
      </FilterShell>
      <form className="create-card" onSubmit={createNode}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Work Graph 노드 이름" />
        <Select label="상위" value={parentId ?? ""} onChange={(value) => setParentId(value || null)} options={[["", "상위 없음"], ...tasks.map((task) => [task.id, task.title] as [string, string])]} />
        <Select label="템플릿" value={templateId} onChange={setTemplateId} options={[["", "자유 노드"], ...data.templates.filter((template) => template.enabled).map((template) => [template.id, template.name] as [string, string])]} />
        <button className="button primary" disabled={!title.trim()}>형상화</button>
      </form>
      <div className="hierarchy-board">
        {(byParent.get(null) ?? []).map((task) => (
          <TreeNode key={task.id} task={task} templates={data.templates} byParent={byParent} expanded={expanded} onToggle={toggle} onReload={onReload} level={0} />
        ))}
      </div>
    </section>
  );
}

function TreeNode({
  task,
  templates,
  byParent,
  expanded,
  onToggle,
  onReload,
  level
}: {
  task: TaskView;
  templates: Template[];
  byParent: Map<string | null, TaskView[]>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onReload: () => Promise<void>;
  level: number;
}) {
  const children = byParent.get(task.id) ?? [];
  const [applyId, setApplyId] = useState(task.templateId ?? "");
  const applySelectedTemplate = async () => {
    if (!applyId) return;
    await request(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ templateId: applyId }) });
    await onReload();
  };
  return (
    <div className="tree-node" style={{ marginLeft: level ? 24 : 0 }}>
      <div className="tree-card">
        <button className="tree-toggle" onClick={() => onToggle(task.id)} aria-label="toggle">
          {children.length ? (expanded.has(task.id) ? "−" : "+") : ""}
        </button>
        <button className="tree-main" onClick={() => go(`/tasks/${task.id}`)}>
          <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
          <Badge tone={STRUCTURE_META[task.structureState].tone}>{STRUCTURE_META[task.structureState].label}</Badge>
          <span className="tree-title">{task.title}</span>
          <span className="tree-meta">
            노트 {task.activity.notesCount} · 스레드 {task.activity.commentsCount} · 파일 {task.activity.filesCount}
          </span>
        </button>
        <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
        <Select tone="inline" value={applyId} onChange={setApplyId} options={[["", "Template 적용"], ...templates.filter((template) => template.enabled).map((template) => [template.id, template.name] as [string, string])]} />
        <button className="button secondary" disabled={!applyId || applyId === task.templateId} onClick={() => void applySelectedTemplate()}>정형화</button>
      </div>
      {expanded.has(task.id) && children.length > 0 && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeNode key={child.id} task={child} templates={templates} byParent={byParent} expanded={expanded} onToggle={onToggle} onReload={onReload} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
