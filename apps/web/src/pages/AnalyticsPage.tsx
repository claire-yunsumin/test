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

export function AnalyticsView({ analytics }: { analytics: Analytics }) {
  const unmetNeedsYes = analytics.shapedNodeCount > 0
    && analytics.templatedNodeCount > 0
    && analytics.mentionThreadCount > 0;
  const retentionYes = analytics.alarmActionConversionRate >= 0.6
    && analytics.decisionClosureRate >= 0.6
    && analytics.weeklyVoluntaryReturnRate > 0;
  const headline = [
    ["Unmet Needs", unmetNeedsYes ? "YES" : "WATCH", "object clarity"],
    ["Retention", retentionYes ? "YES" : "WATCH", `${analytics.voluntaryVisitsPerWeek}/week`],
    ["Loop Quality", pct(analytics.feedbackNodeRevisionRate), "feedback revision"],
    ["Decision Flow", String(analytics.decisionEvents), `closure ${pct(analytics.decisionClosureRate)}`]
  ];
  const rows = [
    ["형상화", "Work Graph에 결정 대상이 존재하는가", analytics.shapedNodeCount, "노드 수"],
    ["관계", "Objective→KR→Task 연결이 이어지는가", analytics.relationCount, "edge 수"],
    ["정형화", "Template 적용으로 산출물 구조가 생겼는가", analytics.templatedNodeCount, "template node"],
    ["Form", "Template Form Output이 활성화됐는가", analytics.activeFormFieldCount, "field 수"],
    ["멘션", "대상을 가리켜 논의가 시작됐는가", analytics.mentionCount, "mention 수"],
    ["Thread", "멘션 기반 스레드가 만들어졌는가", analytics.mentionThreadCount, "thread 수"],
    ["Cross-Fn", "비개발/개발이 같은 노드를 보고 있는가", pct(analytics.crossFunctionalThreadRate), "rate"],
    ["Revision", "피드백 이후 구조가 다시 바뀌는가", pct(analytics.feedbackNodeRevisionRate), "rate"]
  ];
  const cards = [
    ["주간 재방문(7d)", pct(analytics.weeklyVoluntaryReturnRate), "자발 루프"],
    ["Alarm->Action", pct(analytics.alarmActionConversionRate), "trigger to action"],
    ["결정 귀속 완결", pct(analytics.decisionClosureRate), "request to closure"],
    ["템플릿 상태 매핑 성공", pct(analytics.templateStatusMappingSuccessRate), "template transition"],
    ["템플릿 수동 보정률", pct(analytics.templateManualAdjustmentRate), "manual required"],
    ["노트 : 스레드", analytics.notesThreadBalance, "근거/논의 균형"],
    ["비개발 편집", pct(analytics.nonDevContributionRate), "cross function"],
    ["#참조율", pct(analytics.noteReferenceRate), "evidence link"],
    ["집계 시각", analytics.computedAt, analytics.dataStatus]
  ];
  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Analytics / Objective 1"
        title="Objective 1 판정 대시보드"
        description="형상화, 정형화, 멘션, 재방문 루프의 현재 품질을 운영 지표로 판정합니다."
      />
      <div className="analytics-summary-strip">
        {headline.map(([label, value, caption]) => (
          <article className="hero-metric" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{caption}</span>
          </article>
        ))}
      </div>
      <div className="analytics-layout">
        <section className="analytics-table">
          <div className="analytics-row analytics-head">
            <span>KR 1.1 Index</span>
            <span>판정 질문</span>
            <span>Value</span>
            <span>Unit</span>
          </div>
          {rows.map(([label, question, value, unit]) => (
            <div className="analytics-row" key={label}>
              <strong>{label}</strong>
              <span>{question}</span>
              <b>{value}</b>
              <small>{unit}</small>
            </div>
          ))}
        </section>
        <aside className="analytics-insight-panel">
          <PanelTitle title="Loop Signals" />
          {cards.map(([label, value, caption]) => (
            <article className="insight-row" key={label}>
              <div>
                <strong>{label}</strong>
                <small>{caption}</small>
              </div>
              <b>{value}</b>
            </article>
          ))}
          <div className="loop-map-mini">
            <span>형상화</span>
            <i />
            <span>정형화</span>
            <i />
            <span>멘션</span>
            <i />
            <span>재방문</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
