export type TemplateType = "VISION" | "AXIS" | "OBJECTIVE" | "KEYRESULT" | "TASK";
export type TaskState = "DRAFT" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE" | "CANCELED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type Role = "VIEWER" | "EDITOR" | "APPROVER" | "ADMIN";
export type DecisionType = "APPROVE" | "REJECT" | "SUPPLEMENT" | "STATE_ONLY";
export type InboxComponent = "DECISION" | "DISCUSSION" | "AWARENESS" | "RESULT";
export type EventType =
  | "TASK_CREATED"
  | "STATE_TRANSITION"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "NOTE_UPDATED"
  | "COMMENT"
  | "MENTION"
  | "HIERARCHY_CHANGE"
  | "COMPLETED"
  | "CANCELED";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  unit: string;
};

export type Note = {
  id: string;
  taskId: string;
  title: string;
  content: string;
  authorId: string;
  lastEditorId: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
};

export type ThreadComment = {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  referencedNoteIds: string[];
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  taskId: string;
  type: EventType;
  actorId: string;
  decisionType: DecisionType | null;
  reason: string | null;
  referencedNoteIds: string[];
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  templateType: TemplateType;
  templateId: string;
  currentState: TaskState;
  priority: Priority;
  ownerId: string;
  assigneeIds: string[];
  watcherIds: string[];
  dueDate: string | null;
  lastSeenAtByUser: Record<string, string>;
  updatedAt: string;
  createdAt: string;
  formValues: Record<string, string>;
};

export type InboxItem = {
  id: string;
  userId: string;
  taskId: string;
  componentType: InboxComponent;
  eventType: EventType;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type Template = {
  id: string;
  name: string;
  type: TemplateType;
  version: number;
  enabled: boolean;
  workflow: Array<{
    from: TaskState;
    to: TaskState;
    label: string;
    isDecision: boolean;
    decisionType: DecisionType;
  }>;
};

export type Analytics = {
  weeklyReturnRate: number;
  notesThreadBalance: string;
  nonDevContributionRate: number;
  noteReferenceRate: number;
  voluntaryVisitsPerWeek: number;
  decisionEvents: number;
};

export type AppData = {
  me: Member;
  members: Member[];
  tasks: Task[];
  notes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  inbox: InboxItem[];
  templates: Template[];
  analytics: Analytics;
};

export const TEMPLATE_META: Record<TemplateType, { label: string; tone: string; short: string }> = {
  VISION: { label: "비전", tone: "violet", short: "V" },
  AXIS: { label: "축", tone: "blue", short: "A" },
  OBJECTIVE: { label: "목표", tone: "green", short: "O" },
  KEYRESULT: { label: "핵심 결과", tone: "amber", short: "KR" },
  TASK: { label: "태스크", tone: "slate", short: "T" }
};

export const STATE_META: Record<TaskState, { label: string; tone: string }> = {
  DRAFT: { label: "초안", tone: "slate" },
  IN_PROGRESS: { label: "진행 중", tone: "blue" },
  PENDING_APPROVAL: { label: "승인 대기", tone: "amber" },
  DONE: { label: "완료", tone: "green" },
  CANCELED: { label: "취소됨", tone: "red" }
};

export const INBOX_COMPONENTS: Array<{ value: InboxComponent; label: string }> = [
  { value: "DECISION", label: "결정" },
  { value: "DISCUSSION", label: "논의" },
  { value: "AWARENESS", label: "인지" },
  { value: "RESULT", label: "결과" }
];

const now = new Date("2026-04-23T09:00:00.000Z");
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

export function createSeedData(): AppData {
  const members: Member[] = [
    { id: "u-pm", name: "박PM", email: "pm@selvasin4.local", role: "EDITOR", unit: "HWE" },
    { id: "u-marketing", name: "김매니저", email: "marketing@selvasin4.local", role: "EDITOR", unit: "마케팅" },
    { id: "u-lead", name: "이팀장", email: "lead@selvasin4.local", role: "APPROVER", unit: "리더십" },
    { id: "u-admin", name: "관리자", email: "admin@selvasin4.local", role: "ADMIN", unit: "운영" },
    { id: "u-viewer", name: "정뷰어", email: "viewer@selvasin4.local", role: "VIEWER", unit: "영업" }
  ];

  const templates: Template[] = [
    {
      id: "tpl-okr",
      name: "OKR 결정 템플릿",
      type: "OBJECTIVE",
      version: 3,
      enabled: true,
      workflow: [
        { from: "DRAFT", to: "IN_PROGRESS", label: "시작", isDecision: false, decisionType: "STATE_ONLY" },
        { from: "IN_PROGRESS", to: "PENDING_APPROVAL", label: "검토 요청", isDecision: true, decisionType: "SUPPLEMENT" },
        { from: "PENDING_APPROVAL", to: "DONE", label: "승인", isDecision: true, decisionType: "APPROVE" },
        { from: "PENDING_APPROVAL", to: "IN_PROGRESS", label: "보완 요청", isDecision: true, decisionType: "SUPPLEMENT" }
      ]
    },
    {
      id: "tpl-task",
      name: "실행 태스크 템플릿",
      type: "TASK",
      version: 2,
      enabled: true,
      workflow: [
        { from: "DRAFT", to: "IN_PROGRESS", label: "시작", isDecision: false, decisionType: "STATE_ONLY" },
        { from: "IN_PROGRESS", to: "DONE", label: "완료", isDecision: false, decisionType: "STATE_ONLY" }
      ]
    }
  ];

  const tasks: Task[] = [
    {
      id: "task-vision",
      parentId: null,
      title: "2026 성장 결정 워크스페이스",
      description: "전략과 실행을 하나의 결정 그래프로 묶는 최상위 비전입니다.",
      templateType: "VISION",
      templateId: "tpl-okr",
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-lead"],
      dueDate: "2026-06-30",
      lastSeenAtByUser: { "u-lead": iso(72) },
      updatedAt: iso(4),
      createdAt: iso(420),
      formValues: { outcome: "결정 대상 구조화 지속", risk: "부서 간 맥락 단절" }
    },
    {
      id: "task-axis",
      parentId: "task-vision",
      title: "시장 진입 정렬 축",
      description: "마케팅, 영업, 개발이 같은 의사결정 기준을 사용하도록 정렬합니다.",
      templateType: "AXIS",
      templateId: "tpl-okr",
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-pm",
      assigneeIds: ["u-pm", "u-marketing"],
      watcherIds: ["u-lead"],
      dueDate: "2026-05-31",
      lastSeenAtByUser: { "u-lead": iso(48) },
      updatedAt: iso(3),
      createdAt: iso(360),
      formValues: { outcome: "부서별 판단 기준 통합", risk: "결정 기준의 언어 차이" }
    },
    {
      id: "task-objective",
      parentId: "task-axis",
      title: "Q3 마케팅 방향성 결정",
      description: "하네스엔지니어링 신규 시장 진입 메시지와 우선 세그먼트를 확정합니다.",
      templateType: "OBJECTIVE",
      templateId: "tpl-okr",
      currentState: "PENDING_APPROVAL",
      priority: "URGENT",
      ownerId: "u-pm",
      assigneeIds: ["u-marketing"],
      watcherIds: ["u-lead", "u-viewer"],
      dueDate: "2026-05-10",
      lastSeenAtByUser: { "u-lead": iso(96), "u-marketing": iso(6) },
      updatedAt: iso(2),
      createdAt: iso(240),
      formValues: { decisionQuestion: "Q3에 집중할 ICP와 메시지는 무엇인가?", successSignal: "승인된 캠페인 브리프 1건" }
    },
    {
      id: "task-kr1",
      parentId: "task-objective",
      title: "KR1: 제조 엔터프라이즈 ICP 검증",
      description: "현장 구매자와 의사결정권자의 요구를 구분해 ICP를 검증합니다.",
      templateType: "KEYRESULT",
      templateId: "tpl-okr",
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-marketing",
      assigneeIds: ["u-marketing"],
      watcherIds: ["u-pm", "u-lead"],
      dueDate: "2026-05-03",
      lastSeenAtByUser: { "u-pm": iso(12) },
      updatedAt: iso(8),
      createdAt: iso(200),
      formValues: { metric: "인터뷰 8건, 검증 리포트 1건", current: "인터뷰 5건 완료" }
    },
    {
      id: "task-kr2",
      parentId: "task-objective",
      title: "KR2: 캠페인 메시지 승인",
      description: "기술적 신뢰와 운영 효율을 동시에 담는 메시지를 승인받습니다.",
      templateType: "KEYRESULT",
      templateId: "tpl-okr",
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-marketing"],
      dueDate: "2026-05-17",
      lastSeenAtByUser: {},
      updatedAt: iso(18),
      createdAt: iso(180),
      formValues: { metric: "승인 메시지 3종", current: "초안 작성 전" }
    },
    {
      id: "task-exec1",
      parentId: "task-kr1",
      title: "시장 세분화 조사 결과 정리",
      description: "인터뷰와 리서치 산출물을 노트로 정리하고 검토 요청합니다.",
      templateType: "TASK",
      templateId: "tpl-task",
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-marketing",
      assigneeIds: ["u-marketing"],
      watcherIds: ["u-pm"],
      dueDate: "2026-04-29",
      lastSeenAtByUser: { "u-pm": iso(20) },
      updatedAt: iso(1),
      createdAt: iso(140),
      formValues: { deliverable: "세분화 매트릭스", blocker: "영업팀 샘플 데이터 확인 필요" }
    },
    {
      id: "task-exec2",
      parentId: "task-kr2",
      title: "메시지 후보 3종 작성",
      description: "승인 전 스레드 피드백을 수집할 메시지 후보를 작성합니다.",
      templateType: "TASK",
      templateId: "tpl-task",
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-marketing"],
      dueDate: "2026-05-08",
      lastSeenAtByUser: {},
      updatedAt: iso(12),
      createdAt: iso(120),
      formValues: { deliverable: "메시지 후보 문서", blocker: "없음" }
    }
  ];

  const notes: Note[] = [
    {
      id: "note-background",
      taskId: "task-objective",
      title: "배경 및 결정 질문",
      content: "기존 리드의 전환율은 높지만 진입 메시지가 기능 나열에 치우쳐 있습니다. 이번 결정은 ICP, 메시지, 승인 기준을 한 번에 고정하는 것을 목표로 합니다.",
      authorId: "u-pm",
      lastEditorId: "u-pm",
      attachments: ["Q3-market-brief.pdf"],
      createdAt: iso(180),
      updatedAt: iso(5)
    },
    {
      id: "note-analysis",
      taskId: "task-objective",
      title: "분석 요약",
      content: "제조 엔터프라이즈는 도입 리스크를 낮추는 근거를 먼저 요구합니다. 메시지는 생산성보다 검증 가능성과 운영 안정성에 가까울 때 반응이 좋았습니다.",
      authorId: "u-marketing",
      lastEditorId: "u-marketing",
      attachments: ["segment-matrix.xlsx"],
      createdAt: iso(72),
      updatedAt: iso(2)
    },
    {
      id: "note-decision",
      taskId: "task-objective",
      title: "결정 사항 초안",
      content: "1차 ICP는 제조 엔터프라이즈 운영혁신팀으로 두고, 메시지는 '현장 데이터를 의사결정 가능한 운영 지표로 전환'에 집중합니다.",
      authorId: "u-pm",
      lastEditorId: "u-pm",
      attachments: [],
      createdAt: iso(36),
      updatedAt: iso(4)
    },
    {
      id: "note-segmentation",
      taskId: "task-exec1",
      title: "시장 세분화 계획",
      content: "구매 주체, 현장 사용자, 승인권자를 분리해서 인터뷰 질문지를 운영합니다. #분석 요약 업데이트 후 캠페인 브리프로 연결합니다.",
      authorId: "u-marketing",
      lastEditorId: "u-marketing",
      attachments: [],
      createdAt: iso(30),
      updatedAt: iso(1)
    }
  ];

  const comments: ThreadComment[] = [
    {
      id: "comment-1",
      taskId: "task-objective",
      authorId: "u-lead",
      content: "#분석 요약 기준이면 메시지의 첫 문장은 효율보다 리스크 제거에 가까워야 할 것 같습니다.",
      referencedNoteIds: ["note-analysis"],
      createdAt: iso(3)
    },
    {
      id: "comment-2",
      taskId: "task-objective",
      authorId: "u-marketing",
      content: "반영해서 #결정 사항 초안을 수정했습니다. 영업팀 확인 후 승인 요청을 유지하겠습니다.",
      referencedNoteIds: ["note-decision"],
      createdAt: iso(2)
    },
	    {
	      id: "comment-3",
	      taskId: "task-exec1",
	      authorId: "u-pm",
	      content: "인터뷰 6번 이후부터 구매 기준이 반복되는지 확인해주세요.",
	      referencedNoteIds: ["note-analysis"],
	      createdAt: iso(7)
	    }
  ];

  const timeline: TimelineEvent[] = [
    {
      id: "event-1",
      taskId: "task-objective",
      type: "TASK_CREATED",
      actorId: "u-pm",
      decisionType: null,
      reason: null,
      referencedNoteIds: [],
      payload: { title: "Q3 마케팅 방향성 결정" },
      createdAt: iso(240)
    },
    {
      id: "event-2",
      taskId: "task-objective",
      type: "NOTE_UPDATED",
      actorId: "u-marketing",
      decisionType: null,
      reason: null,
      referencedNoteIds: ["note-analysis"],
      payload: { noteTitle: "분석 요약" },
      createdAt: iso(2)
    },
    {
      id: "event-3",
      taskId: "task-objective",
      type: "APPROVAL_REQUESTED",
      actorId: "u-marketing",
      decisionType: "SUPPLEMENT",
      reason: "ICP와 메시지 초안이 정리되어 승인권자 검토가 필요합니다.",
      referencedNoteIds: ["note-analysis", "note-decision"],
      payload: { fromState: "IN_PROGRESS", toState: "PENDING_APPROVAL" },
      createdAt: iso(1)
    }
  ];

  const inbox: InboxItem[] = [
    {
      id: "inbox-1",
      userId: "u-lead",
      taskId: "task-objective",
      componentType: "DECISION",
      eventType: "APPROVAL_REQUESTED",
      title: "승인 검토 대기",
      message: "Q3 마케팅 방향성 결정에 대한 승인 판단이 필요합니다.",
      readAt: null,
      createdAt: iso(1)
    },
    {
      id: "inbox-2",
      userId: "u-pm",
      taskId: "task-objective",
      componentType: "DISCUSSION",
      eventType: "NOTE_UPDATED",
      title: "참조한 노트가 수정됨",
      message: "김매니저가 분석 요약을 업데이트했습니다.",
      readAt: null,
      createdAt: iso(2)
    },
    {
      id: "inbox-3",
      userId: "u-marketing",
      taskId: "task-exec1",
      componentType: "AWARENESS",
      eventType: "HIERARCHY_CHANGE",
      title: "상위 목표 변경",
      message: "상위 결정 질문이 업데이트되었습니다.",
      readAt: null,
      createdAt: iso(5)
    },
    {
      id: "inbox-4",
      userId: "u-pm",
      taskId: "task-kr2",
      componentType: "RESULT",
      eventType: "COMPLETED",
      title: "이전 메시지 정리 완료",
      message: "지난 캠페인 회고가 완료되었습니다.",
      readAt: iso(10),
      createdAt: iso(12)
    }
  ];

  return {
    me: members[2],
    members,
    tasks,
    notes,
    comments,
    timeline,
    inbox,
    templates,
    analytics: {
      weeklyReturnRate: 0.74,
      notesThreadBalance: "46:54",
      nonDevContributionRate: 0.38,
      noteReferenceRate: 0.62,
      voluntaryVisitsPerWeek: 3.4,
      decisionEvents: 15
    }
  };
}
