import type {
  ApprovalRequestSummary,
  Member,
  Note,
  Task,
  TaskAction,
  TaskAttachment,
  TaskPermissions,
  Template,
  TemplateSnapshot,
  ThreadComment,
  TimelineEvent,
  WorkflowRuntime
} from "@hwe/shared";

export type TaskView = Task & {
  template: Template | null;
  activity: { notesCount: number; commentsCount: number; filesCount: number };
  assignees: Member[];
  watchers: Member[];
  owner: Member;
};

export type TaskDetail = {
  task: TaskView;
  templateSnapshot: TemplateSnapshot | null;
  workflowRuntime: WorkflowRuntime;
  activeApprovalRequest?: ApprovalRequestSummary;
  availableActions: TaskAction[];
  permissions: TaskPermissions;
  parent: TaskView | null;
  children: TaskView[];
  referenceableTasks: TaskView[];
  notes: Note[];
  attachments: TaskAttachment[];
  referenceableNotes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  members: Member[];
};
