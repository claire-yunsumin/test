import type { Member, Note, Task, ThreadComment, TimelineEvent } from "@hwe/shared";

export type TaskView = Task & {
  activity: { notesCount: number; commentsCount: number; filesCount: number };
  assignees: Member[];
  watchers: Member[];
  owner: Member;
};

export type TaskDetail = {
  task: TaskView;
  parent: TaskView | null;
  children: TaskView[];
  notes: Note[];
  referenceableNotes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  members: Member[];
};
