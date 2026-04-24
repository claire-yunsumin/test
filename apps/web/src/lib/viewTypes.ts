import type { Member, Note, Task, Template, ThreadComment, TimelineEvent } from "@hwe/shared";

export type TaskView = Task & {
  template: Template | null;
  activity: { notesCount: number; commentsCount: number; filesCount: number };
  assignees: Member[];
  watchers: Member[];
  owner: Member;
};

export type TaskDetail = {
  task: TaskView;
  parent: TaskView | null;
  children: TaskView[];
  referenceableTasks: TaskView[];
  notes: Note[];
  referenceableNotes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  members: Member[];
  permissions?: {
    canEditTask: boolean;
    canEditForm: boolean;
  };
};
