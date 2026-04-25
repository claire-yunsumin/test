import { STATE_META, type AppData, type InboxComponent } from "@hwe/shared";
import { Badge, PageHeader, PanelHeader } from "../components/ui";
import { elapsed, formatDate, isDueToday, priorityLabel, templateLabel, templateTone } from "../lib/domain";
import { go } from "../lib/router";
import type { TaskView } from "../lib/viewTypes";

const componentLabel: Record<InboxComponent, string> = {
  DECISION: "결정",
  DISCUSSION: "논의",
  AWARENESS: "인지",
  RESULT: "결과"
};

function daysUntil(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function urgencyScore(task: TaskView) {
  const priorityScore = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[task.priority];
  return daysUntil(task.dueDate) * 10 + priorityScore;
}

function EmptyState({ title }: { title: string }) {
  return <div className="home-empty">{title}</div>;
}

function TaskActionRow({
  task,
  meta
}: {
  task: TaskView;
  meta: string;
}) {
  return (
    <button className="home-row task-action-row" onClick={() => go(`/tasks/${task.id}`)}>
      <span className="home-row-main">
        <strong>{task.title}</strong>
        <small>{meta}</small>
      </span>
      <span className="home-row-tags">
        <Badge tone={templateTone(task.templateType)}>{templateLabel(task.templateType)}</Badge>
        <Badge tone={STATE_META[task.currentState].tone}>{STATE_META[task.currentState].label}</Badge>
      </span>
    </button>
  );
}

export function HomeView({ data, tasks }: { data: AppData; tasks: TaskView[] }) {
  const meId = data.me.id;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const activeTasks = tasks.filter((task) => task.currentState !== "DONE" && task.currentState !== "CANCELED");
  const unread = data.inbox
    .filter((item) => item.userId === meId && !item.readAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const decisionQueue = unread.filter((item) => item.componentType === "DECISION" || item.componentType === "DISCUSSION");
  const myTasks = activeTasks
    .filter((task) => task.ownerId === meId || task.assigneeIds.includes(meId))
    .sort((a, b) => urgencyScore(a) - urgencyScore(b));
  const dueSoon = myTasks.filter((task) => daysUntil(task.dueDate) <= 7);
  const watchedChanges = activeTasks
    .filter((task) => task.watcherIds.includes(meId))
    .filter((task) => {
      const seenAt = task.lastSeenAtByUser[meId];
      return !seenAt || new Date(task.updatedAt).getTime() > new Date(seenAt).getTime();
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const evidenceGaps = myTasks
    .filter((task) => task.activity.notesCount === 0 && task.activity.filesCount === 0)
    .slice(0, 5);

  return (
    <section className="page-stack home-page">
      <PageHeader
        eyebrow="홈"
        title="내가 봐야 할 일"
        description="결정 대기, 담당 태스크, 임박 항목을 먼저 봅니다."
        action={<button className="button secondary" onClick={() => go("/tasks")}>전체 태스크</button>}
      />

      <div className="home-summary-grid">
        <button className="metric-card home-metric" onClick={() => go("/inbox")}>
          <small>결정/논의 미확인</small>
          <strong>{decisionQueue.length}</strong>
          <span>미확인 {unread.length}</span>
        </button>
        <button className="metric-card home-metric" onClick={() => go("/tasks")}>
          <small>내 활성 태스크</small>
          <strong>{myTasks.length}</strong>
          <span>임박 {dueSoon.length}</span>
        </button>
        <button className="metric-card home-metric" onClick={() => go("/tasks?view=board")}>
          <small>오늘/임박</small>
          <strong>{dueSoon.length}</strong>
          <span>오늘 {myTasks.filter((task) => isDueToday(task.dueDate)).length}</span>
        </button>
        <button className="metric-card home-metric" onClick={() => go("/tasks?view=backlog")}>
          <small>근거 없음</small>
          <strong>{evidenceGaps.length}</strong>
          <span>노트/파일 0</span>
        </button>
      </div>

      <div className="home-grid">
        <section className="list-panel home-panel">
          <PanelHeader title="결정 대기" action={<button className="button secondary" onClick={() => go("/inbox")}>알림함</button>} />
          <div className="home-list">
            {decisionQueue.slice(0, 6).map((item) => {
              const task = taskById.get(item.taskId);
              return (
                <button key={item.id} className="home-row" onClick={() => go(task ? `/tasks/${task.id}` : "/inbox")}>
                  <span className="home-row-main">
                    <strong>{item.title}</strong>
                    <small>{task?.title ?? item.message}</small>
                  </span>
                  <span className="home-row-tags">
                    <Badge tone={item.componentType === "DECISION" ? "blue" : "amber"}>{componentLabel[item.componentType]}</Badge>
                    <small>{elapsed(item.createdAt)}</small>
                  </span>
                </button>
              );
            })}
            {!decisionQueue.length && <EmptyState title="대기 중인 결정이 없습니다." />}
          </div>
        </section>

        <section className="list-panel home-panel">
          <PanelHeader title="내 활성 태스크" action={<button className="button secondary" onClick={() => go("/tasks")}>작업대</button>} />
          <div className="home-list">
            {myTasks.slice(0, 6).map((task) => (
              <TaskActionRow
                key={task.id}
                task={task}
                meta={`${priorityLabel[task.priority]} · ${task.dueDate ? formatDate(task.dueDate) : "기한 없음"}`}
              />
            ))}
            {!myTasks.length && <EmptyState title="담당 중인 활성 태스크가 없습니다." />}
          </div>
        </section>

        <section className="list-panel home-panel">
          <PanelHeader title="오늘/임박" />
          <div className="home-list">
            {dueSoon.slice(0, 5).map((task) => (
              <TaskActionRow
                key={task.id}
                task={task}
                meta={`${daysUntil(task.dueDate) <= 0 ? "오늘까지" : `${daysUntil(task.dueDate)}일 남음`} · ${priorityLabel[task.priority]}`}
              />
            ))}
            {!dueSoon.length && <EmptyState title="7일 안에 마감되는 내 태스크가 없습니다." />}
          </div>
        </section>

        <section className="list-panel home-panel">
          <PanelHeader title="참관 업데이트" />
          <div className="home-list">
            {watchedChanges.slice(0, 5).map((task) => (
              <TaskActionRow key={task.id} task={task} meta={`${elapsed(task.updatedAt)} · 댓글 ${task.activity.commentsCount}`} />
            ))}
            {!watchedChanges.length && <EmptyState title="새로 확인할 참관 업데이트가 없습니다." />}
          </div>
        </section>
      </div>
    </section>
  );
}
