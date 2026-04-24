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
  type UnitMemberRole,
  type Bucket
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

type GraphLayer = "context" | "decision" | "refs";

export function DecisionGraphView({ data }: { data: AppData }) {
  const tasks = data.tasks as TaskView[];
  const [focusId, setFocusId] = useState("ALL");
  const [density, setDensity] = useState<"COMPACT" | "BALANCED" | "DETAIL">("BALANCED");
  const [layers, setLayers] = useState<Set<GraphLayer>>(() => new Set(["context", "decision", "refs"]));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const noteMap = useMemo(() => new Map(data.notes.map((note) => [note.id, note])), [data.notes]);
  const byParent = useMemo(() => {
    const map = new Map<string | null, TaskView[]>();
    tasks.forEach((task) => {
      const rows = map.get(task.parentId) ?? [];
      rows.push(task);
      rows.sort((a, b) => templateOrder.indexOf(a.templateType ?? "TASK") - templateOrder.indexOf(b.templateType ?? "TASK"));
      map.set(task.parentId, rows);
    });
    return map;
  }, [tasks]);

  const orderedTasks = useMemo(() => {
    const rows: TaskView[] = [];
    const visit = (parentId: string | null) => {
      (byParent.get(parentId) ?? []).forEach((task) => {
        rows.push(task);
        visit(task.id);
      });
    };
    visit(null);
    return rows;
  }, [byParent]);

  const visibleTaskIds = useMemo(() => {
    if (focusId === "ALL") return new Set(tasks.map((task) => task.id));
    const ids = new Set<string>([focusId]);
    const addAncestors = (taskId: string) => {
      let cursor = taskMap.get(taskId);
      while (cursor?.parentId) {
        ids.add(cursor.parentId);
        cursor = taskMap.get(cursor.parentId);
      }
    };
    const addDescendants = (taskId: string) => {
      (byParent.get(taskId) ?? []).forEach((child) => {
        ids.add(child.id);
        addDescendants(child.id);
      });
    };
    addAncestors(focusId);
    addDescendants(focusId);
    data.comments.forEach((comment) => {
      if (comment.taskId !== focusId && !ids.has(comment.taskId)) return;
      comment.referencedNoteIds.forEach((noteId) => {
        const note = noteMap.get(noteId);
        if (note) ids.add(note.taskId);
      });
    });
    return ids;
  }, [byParent, data.comments, focusId, noteMap, taskMap, tasks]);

  const graphTasks = orderedTasks.filter((task) => visibleTaskIds.has(task.id));
  const depthOf = (task: TaskView) => {
    let depth = 0;
    let cursor = task.parentId ? taskMap.get(task.parentId) : undefined;
    while (cursor) {
      depth += 1;
      cursor = cursor.parentId ? taskMap.get(cursor.parentId) : undefined;
    }
    return depth;
  };
  const densityPreset = density === "COMPACT"
    ? { stepX: 190, stepY: 64, nodeW: 164, nodeH: 46 }
    : density === "DETAIL"
      ? { stepX: 280, stepY: 96, nodeW: 220, nodeH: 68 }
      : { stepX: 240, stepY: 84, nodeW: 196, nodeH: 60 };
  const positions = new Map(
    graphTasks.map((task, index) => [
      task.id,
      { x: 72 + depthOf(task) * densityPreset.stepX, y: 56 + index * densityPreset.stepY, width: densityPreset.nodeW, height: densityPreset.nodeH }
    ])
  );
  const width = Math.max(1080, Math.max(...graphTasks.map((task) => (positions.get(task.id)?.x ?? 0) + 320), 960));
  const height = Math.max(520, graphTasks.length * densityPreset.stepY + 112);
  const noteCounts = new Map(graphTasks.map((task) => [task.id, data.notes.filter((note) => note.taskId === task.id).length]));
  const commentCounts = new Map(graphTasks.map((task) => [task.id, data.comments.filter((comment) => comment.taskId === task.id).length]));
  const decisionCounts = new Map(graphTasks.map((task) => [task.id, data.timeline.filter((event) => event.taskId === task.id && event.decisionType).length]));
  const refEdges = data.comments.flatMap((comment) =>
    comment.referencedNoteIds
      .map((noteId) => ({ sourceTaskId: comment.taskId, targetTaskId: noteMap.get(noteId)?.taskId, noteId }))
      .filter((edge): edge is { sourceTaskId: string; targetTaskId: string; noteId: string } => Boolean(edge.targetTaskId))
      .filter((edge) => visibleTaskIds.has(edge.sourceTaskId) && visibleTaskIds.has(edge.targetTaskId))
  );
  const decisionRefEdges = data.timeline.flatMap((event) =>
    event.referencedNoteIds
      .map((noteId) => ({ sourceTaskId: event.taskId, targetTaskId: noteMap.get(noteId)?.taskId, noteId }))
      .filter((edge): edge is { sourceTaskId: string; targetTaskId: string; noteId: string } => Boolean(edge.targetTaskId))
      .filter((edge) => visibleTaskIds.has(edge.sourceTaskId) && visibleTaskIds.has(edge.targetTaskId))
  );
  const edgeRenderLimit = density === "COMPACT" ? 160 : density === "DETAIL" ? 540 : 320;
  const cappedHierarchy = graphTasks.filter((task) => task.parentId && visibleTaskIds.has(task.parentId)).slice(0, edgeRenderLimit);
  const cappedRefEdges = refEdges.slice(0, edgeRenderLimit);
  const cappedDecisionRefEdges = decisionRefEdges.slice(0, edgeRenderLimit);
  const hasCappedEdges = graphTasks.length > edgeRenderLimit || refEdges.length > edgeRenderLimit || decisionRefEdges.length > edgeRenderLimit;
  const selectedTask = focusId === "ALL" ? null : taskMap.get(focusId);
  const resetViewport = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };
  const toggleLayer = (layer: GraphLayer) => {
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Tasks / Decision Graph"
        title="조직 결정 자산 지도"
        description="계층, 노트, 스레드, 결정 참조를 같은 그래프 레이어로 겹쳐 봅니다."
        action={<button className="button secondary" onClick={() => go("/tasks")}>목록 보기</button>}
      />
      <TaskViewTabs value="graph" tasks={tasks} />
      <div className="toolbar graph-toolbar">
        <Select label="Focus" tone="filter" value={focusId} onChange={setFocusId} options={[["ALL", "전체 그래프"], ...orderedTasks.map((task) => [task.id, task.title] as [string, string])]} />
        <Select label="해상도" tone="filter" value={density} onChange={(value) => setDensity(value as typeof density)} options={[["COMPACT", "컴팩트"], ["BALANCED", "밸런스"], ["DETAIL", "디테일"]]} />
        <button className={`button ${layers.has("context") ? "primary" : "secondary"}`} onClick={() => toggleLayer("context")}>맥락</button>
        <button className={`button ${layers.has("decision") ? "primary" : "secondary"}`} onClick={() => toggleLayer("decision")}>결정</button>
        <button className={`button ${layers.has("refs") ? "primary" : "secondary"}`} onClick={() => toggleLayer("refs")}>#참조</button>
        <button className="button secondary" onClick={() => setFocusId("ALL")}>포커스 해제</button>
        <div className="graph-view-controls">
          <button className="button secondary" onClick={() => setZoom((prev) => Math.max(0.65, Number((prev - 0.1).toFixed(2))))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="button secondary" onClick={() => setZoom((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))))}>＋</button>
          <button className="button secondary" onClick={resetViewport}>리셋</button>
        </div>
      </div>
      {hasCappedEdges && <div className="inline-error">대규모 그래프 보호를 위해 엣지 일부를 생략해 렌더링 중입니다. 해상도를 낮추거나 Focus를 좁히세요.</div>}
      <div className="graph-metrics">
        <article className="metric-card"><small>노드</small><strong>{graphTasks.length}</strong></article>
        <article className="metric-card"><small>노트</small><strong>{data.notes.filter((note) => visibleTaskIds.has(note.taskId)).length}</strong></article>
        <article className="metric-card"><small>스레드 참조</small><strong>{refEdges.length}</strong></article>
        <article className="metric-card"><small>결정 참조</small><strong>{decisionRefEdges.length}</strong></article>
      </div>
      <div className="decision-graph-layout">
        <section className="graph-board" aria-label="결정 그래프 시각화">
          <div
            className={`graph-canvas ${panning ? "panning" : ""}`}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((prev) => {
                const next = event.deltaY > 0 ? prev - 0.08 : prev + 0.08;
                return Math.max(0.65, Math.min(1.8, Number(next.toFixed(2))));
              });
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              setPanning(true);
              setPanStart({ x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y });
            }}
            onMouseMove={(event) => {
              if (!panning || !panStart) return;
              setOffset({
                x: panStart.ox + (event.clientX - panStart.x),
                y: panStart.oy + (event.clientY - panStart.y)
              });
            }}
            onMouseUp={() => {
              setPanning(false);
              setPanStart(null);
            }}
            onMouseLeave={() => {
              setPanning(false);
              setPanStart(null);
            }}
          >
          <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <defs>
              <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
              <marker id="arrow-ref" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
            {cappedHierarchy.map((task) => {
              if (!task.parentId || !visibleTaskIds.has(task.parentId)) return null;
              const from = positions.get(task.parentId);
              const to = positions.get(task.id);
              if (!from || !to) return null;
              return <path key={`${task.parentId}-${task.id}`} className="graph-edge hierarchy" d={`M ${from.x + from.width} ${from.y + from.height / 2} C ${from.x + from.width + 44} ${from.y + from.height / 2}, ${to.x - 44} ${to.y + to.height / 2}, ${to.x} ${to.y + to.height / 2}`} markerEnd="url(#arrow-solid)" />;
            })}
            {layers.has("refs") && cappedRefEdges.map((edge, index) => {
              const from = positions.get(edge.sourceTaskId);
              const to = positions.get(edge.targetTaskId);
              if (!from || !to) return null;
              const sameTask = edge.sourceTaskId === edge.targetTaskId;
              const yOffset = sameTask ? 32 + index * 2 : 0;
              return <path key={`${edge.sourceTaskId}-${edge.noteId}-${index}`} className="graph-edge ref" d={`M ${from.x + from.width / 2} ${from.y + from.height + 4} C ${from.x + 40} ${from.y + 88 + yOffset}, ${to.x + to.width - 40} ${to.y - 36 - yOffset}, ${to.x + to.width / 2} ${to.y - 4}`} markerEnd="url(#arrow-ref)" />;
            })}
            {layers.has("decision") && cappedDecisionRefEdges.map((edge, index) => {
              const from = positions.get(edge.sourceTaskId);
              const to = positions.get(edge.targetTaskId);
              if (!from || !to || edge.sourceTaskId === edge.targetTaskId) return null;
              return <path key={`decision-${edge.sourceTaskId}-${edge.noteId}-${index}`} className="graph-edge decision" d={`M ${from.x + from.width} ${from.y + 12} C ${from.x + 86} ${from.y - 34}, ${to.x + 80} ${to.y - 34}, ${to.x} ${to.y + 12}`} markerEnd="url(#arrow-solid)" />;
            })}
            {graphTasks.map((task) => {
              const pos = positions.get(task.id)!;
              const notes = noteCounts.get(task.id) ?? 0;
              const comments = commentCounts.get(task.id) ?? 0;
              const decisions = decisionCounts.get(task.id) ?? 0;
              return (
                <g
                  key={task.id}
                  className={`graph-node graph-node-${(task.templateType ?? "task").toLowerCase()} ${task.structureState === "FREEFORM" ? "graph-node-freeform" : ""} ${task.id === focusId ? "focused" : ""}`}
                  onClick={() => setFocusId(task.id)}
                  onDoubleClick={() => go(`/tasks/${task.id}`)}
                  tabIndex={0}
                  role="button"
                >
                  <rect x={pos.x} y={pos.y} width={pos.width} height={pos.height} rx="8" />
                  <text x={pos.x + 12} y={pos.y + 19} className="graph-node-type">{templateLabel(task.templateType)} · {STRUCTURE_META[task.structureState].label}</text>
                  <text x={pos.x + 12} y={pos.y + 38} className="graph-node-title">{shortText(task.title, 25)}</text>
                  {layers.has("context") && (
                    <>
                      <circle cx={pos.x + pos.width - 48} cy={pos.y + pos.height - 13} r="10" className="graph-context-note" />
                      <text x={pos.x + pos.width - 48} y={pos.y + pos.height - 9} className="graph-count">{notes}</text>
                      <circle cx={pos.x + pos.width - 22} cy={pos.y + pos.height - 13} r="10" className="graph-context-thread" />
                      <text x={pos.x + pos.width - 22} y={pos.y + pos.height - 9} className="graph-count">{comments}</text>
                    </>
                  )}
                  {layers.has("decision") && decisions > 0 && (
                    <>
                      <circle cx={pos.x + pos.width - 10} cy={pos.y + 8} r="11" className="graph-decision-ring" />
                      <text x={pos.x + pos.width - 10} y={pos.y + 12} className="graph-count">{decisions}</text>
                    </>
                  )}
                </g>
              );
            })}
            </g>
          </svg>
          </div>
        </section>
        <aside className="graph-inspector">
          <PanelTitle title="레이어" />
          <div className="graph-legend">
            <span><i className="legend hierarchy" />계층 parentId</span>
            <span><i className="legend context-note" />노트 맥락</span>
            <span><i className="legend context-thread" />스레드 맥락</span>
            <span><i className="legend decision" />타임라인 결정</span>
            <span><i className="legend ref" /># 참조</span>
          </div>
          <div className="graph-inspector-card">
            <small>초점</small>
            <strong>{selectedTask ? selectedTask.title : "전체 그래프"}</strong>
            <p>{selectedTask ? selectedTask.description : "태스크 계층, 노트, 스레드, 타임라인, # 참조가 한 화면에서 연결됩니다."}</p>
          </div>
          <div className="graph-inspector-card">
            <small>축적 행위</small>
            <strong>결정 그래프</strong>
            <p>노드 생성, 맥락 축적, 결정 근거 기록, 횡단 참조가 쌓일수록 다음 루프의 재방문 이유가 커집니다.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
