export type TemplateType = "VISION" | "AXIS" | "OBJECTIVE" | "KEYRESULT" | "TASK";
export type TaskState = "DRAFT" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE" | "CANCELED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type Role = "VIEWER" | "EDITOR" | "APPROVER" | "ADMIN";
export type DecisionType = "APPROVE" | "REJECT" | "SUPPLEMENT" | "STATE_ONLY";
export type InboxComponent = "DECISION" | "DISCUSSION" | "AWARENESS" | "RESULT";
export type StructureState = "FREEFORM" | "TEMPLATED";
export type MentionType = "MEMBER" | "TASK" | "FORM_FIELD" | "NOTE";
export type FormFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SELECT";
export type EngagementEventType =
  | "NODE_CREATED"
  | "NODE_UPDATED"
  | "PARENT_CHANGED"
  | "TEMPLATE_APPLIED"
  | "FORM_SAVED"
  | "COMMENT_CREATED"
  | "MENTION_CREATED"
  | "NOTE_UPDATED"
  | "DECISION_TRANSITION"
  | "VOLUNTARY_VISIT";
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

export type FormFieldDefinition = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  helpText?: string;
  options?: string[];
};

export type Mention = {
  id: string;
  type: MentionType;
  label: string;
  targetId: string;
  fieldKey?: string;
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
  mentions: Mention[];
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
  unitId: string;
  folderId: string | null;
  listId: string;
  parentId: string | null;
  title: string;
  description: string;
  structureState: StructureState;
  templateType: TemplateType | null;
  templateId: string | null;
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

export type Unit = {
  id: string;
  name: string;
  purpose: string;
};

export type Folder = {
  id: string;
  unitId: string;
  name: string;
};

export type TaskList = {
  id: string;
  unitId: string;
  folderId: string | null;
  name: string;
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
  formDefinition: FormFieldDefinition[];
  inspectionCriteria: string[];
  workflow: Array<{
    from: TaskState;
    to: TaskState;
    label: string;
    isDecision: boolean;
    decisionType: DecisionType;
  }>;
};

export type EngagementEvent = {
  id: string;
  type: EngagementEventType;
  actorId: string;
  taskId: string | null;
  targetId?: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type Analytics = {
  weeklyReturnRate: number;
  notesThreadBalance: string;
  nonDevContributionRate: number;
  noteReferenceRate: number;
  voluntaryVisitsPerWeek: number;
  decisionEvents: number;
  shapedNodeCount: number;
  relationCount: number;
  templatedNodeCount: number;
  activeFormFieldCount: number;
  mentionCount: number;
  mentionThreadCount: number;
  crossFunctionalThreadRate: number;
  feedbackNodeRevisionRate: number;
  voluntaryVisitCount: number;
};

export type AppData = {
  me: Member;
  members: Member[];
  units: Unit[];
  folders: Folder[];
  lists: TaskList[];
  tasks: Task[];
  notes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  inbox: InboxItem[];
  templates: Template[];
  engagement: EngagementEvent[];
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

export const STRUCTURE_META: Record<StructureState, { label: string; tone: string }> = {
  FREEFORM: { label: "형상화", tone: "slate" },
  TEMPLATED: { label: "정형화", tone: "green" }
};

export const INBOX_COMPONENTS: Array<{ value: InboxComponent; label: string }> = [
  { value: "DECISION", label: "결정" },
  { value: "DISCUSSION", label: "논의" },
  { value: "AWARENESS", label: "인지" },
  { value: "RESULT", label: "결과" }
];

const now = new Date("2026-04-23T09:00:00.000Z");
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

const workflow = (decision = true): Template["workflow"] => [
  { from: "DRAFT", to: "IN_PROGRESS", label: "시작", isDecision: false, decisionType: "STATE_ONLY" },
  { from: "IN_PROGRESS", to: "PENDING_APPROVAL", label: "검토 요청", isDecision: decision, decisionType: "SUPPLEMENT" },
  { from: "PENDING_APPROVAL", to: "DONE", label: "승인", isDecision: decision, decisionType: "APPROVE" },
  { from: "PENDING_APPROVAL", to: "IN_PROGRESS", label: "보완 요청", isDecision: decision, decisionType: "SUPPLEMENT" }
];

const makeTask = (task: Task): Task => task;

export function createSeedData(): AppData {
  const units: Unit[] = [
    { id: "unit-growth", name: "성장 전략", purpose: "시장/브랜드/포지셔닝 결정" },
    { id: "unit-product", name: "제품 전략", purpose: "로드맵/출시/품질 운영" },
    { id: "unit-ops", name: "운영 개선", purpose: "조직 프로세스/내부 효율화" }
  ];
  const folders: Folder[] = [
    { id: "folder-growth-planning", unitId: "unit-growth", name: "시장 전략" },
    { id: "folder-growth-exec", unitId: "unit-growth", name: "실행 검증" },
    { id: "folder-product-roadmap", unitId: "unit-product", name: "로드맵" }
  ];
  const lists: TaskList[] = [
    { id: "list-growth-objective", unitId: "unit-growth", folderId: "folder-growth-planning", name: "Objective 리스트" },
    { id: "list-growth-validation", unitId: "unit-growth", folderId: "folder-growth-exec", name: "Validation 리스트" },
    { id: "list-product-phase", unitId: "unit-product", folderId: "folder-product-roadmap", name: "Phase 리스트" },
    { id: "list-ops-backlog", unitId: "unit-ops", folderId: null, name: "운영 백로그" }
  ];
  const members: Member[] = [
    { id: "u-pm", name: "박PM", email: "pm@selvasin4.local", role: "EDITOR", unit: "HWE" },
    { id: "u-marketing", name: "김매니저", email: "marketing@selvasin4.local", role: "EDITOR", unit: "마케팅" },
    { id: "u-lead", name: "이팀장", email: "lead@selvasin4.local", role: "APPROVER", unit: "리더십" },
    { id: "u-admin", name: "관리자", email: "admin@selvasin4.local", role: "ADMIN", unit: "운영" },
    { id: "u-viewer", name: "정뷰어", email: "viewer@selvasin4.local", role: "VIEWER", unit: "영업" }
  ];

  const templates: Template[] = [
    {
      id: "tpl-marketing-objective",
      name: "마케팅전략 Objective Template",
      type: "OBJECTIVE",
      version: 1,
      enabled: true,
      formDefinition: [
        { key: "problemDefinition", label: "M1. 문제정의", type: "LONG_TEXT", required: true, helpText: "누가 어떤 의사결정을 해야 하는지 적습니다." },
        { key: "marketAnalysis", label: "M2. 시장 분석", type: "LONG_TEXT", required: true, helpText: "ICP, Champion, 경쟁환경, White Space를 포함합니다." },
        { key: "gameRule", label: "M3. 게임의 룰", type: "LONG_TEXT", required: true, helpText: "핵심 경쟁 기준과 지속 가능성 근거를 적습니다." },
        { key: "positioning", label: "M4. 포지셔닝", type: "LONG_TEXT", required: true, helpText: "한 문장 포지셔닝과 맵 기준을 적습니다." }
      ],
      inspectionCriteria: ["ICP 정의가 충분한가?", "White Space 근거가 있는가?", "포지셔닝 문장이 구매 기준과 연결되는가?"],
      workflow: workflow(true)
    },
    {
      id: "tpl-product-phase",
      name: "제품전략 Phase Template",
      type: "KEYRESULT",
      version: 1,
      enabled: true,
      formDefinition: [
        { key: "releaseSpec", label: "Release Spec", type: "LONG_TEXT", required: true },
        { key: "qualityGate", label: "품질 기준", type: "LONG_TEXT", required: true },
        { key: "launchSignal", label: "출시 신호", type: "TEXT", required: false }
      ],
      inspectionCriteria: ["출시 범위가 검증 가능하게 쓰였는가?", "품질 기준이 결정 가능하게 정의되었는가?"],
      workflow: workflow(true)
    },
    {
      id: "tpl-task",
      name: "실행 Task Template",
      type: "TASK",
      version: 2,
      enabled: true,
      formDefinition: [
        { key: "deliverable", label: "산출물", type: "TEXT", required: true },
        { key: "blocker", label: "블로커", type: "TEXT", required: false }
      ],
      inspectionCriteria: ["산출물이 명확한가?", "블로커가 있으면 담당자에게 연결되었는가?"],
      workflow: workflow(false)
    }
  ];

  const tasks: Task[] = [
    makeTask({
      id: "task-vision",
      unitId: "unit-growth",
      folderId: "folder-growth-planning",
      listId: "list-growth-objective",
      parentId: null,
      title: "2026 성장 결정 워크스페이스",
      description: "전략과 실행을 하나의 결정 그래프로 묶는 최상위 비전입니다.",
      structureState: "FREEFORM",
      templateType: "VISION",
      templateId: null,
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
    }),
    makeTask({
      id: "task-marketing-strategy",
      unitId: "unit-growth",
      folderId: "folder-growth-planning",
      listId: "list-growth-objective",
      parentId: "task-vision",
      title: "S/W 제품 마케팅전략",
      description: "비개발부서와 함께 시장성, 메시지, 포지셔닝 결정을 구조화합니다.",
      structureState: "TEMPLATED",
      templateType: "OBJECTIVE",
      templateId: "tpl-marketing-objective",
      currentState: "PENDING_APPROVAL",
      priority: "URGENT",
      ownerId: "u-pm",
      assigneeIds: ["u-marketing"],
      watcherIds: ["u-lead", "u-viewer"],
      dueDate: "2026-05-10",
      lastSeenAtByUser: { "u-lead": iso(96), "u-marketing": iso(6) },
      updatedAt: iso(2),
      createdAt: iso(240),
      formValues: {
        problemDefinition: "Q3에 집중할 ICP와 메시지는 무엇인가?",
        marketAnalysis: "제조 엔터프라이즈 운영혁신팀의 도입 리스크와 White Space를 검증 중입니다.",
        gameRule: "운영 안정성과 검증 가능성이 핵심 경쟁 기준입니다.",
        positioning: "현장 데이터를 의사결정 가능한 운영 지표로 전환"
      }
    }),
    makeTask({
      id: "task-market-validation",
      unitId: "unit-growth",
      folderId: "folder-growth-exec",
      listId: "list-growth-validation",
      parentId: "task-marketing-strategy",
      title: "시장성 검증",
      description: "시장성 판단을 위한 KR입니다.",
      structureState: "FREEFORM",
      templateType: "KEYRESULT",
      templateId: null,
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
    }),
    makeTask({
      id: "task-target-research",
      unitId: "unit-growth",
      folderId: "folder-growth-exec",
      listId: "list-growth-validation",
      parentId: "task-market-validation",
      title: "타깃시장 조사",
      description: "세그먼트와 구매 기준을 정리합니다.",
      structureState: "TEMPLATED",
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
    }),
    makeTask({
      id: "task-customer-interview",
      unitId: "unit-growth",
      folderId: "folder-growth-exec",
      listId: "list-growth-validation",
      parentId: "task-market-validation",
      title: "고객 인터뷰",
      description: "현장 사용자와 승인권자를 분리해 질문합니다.",
      structureState: "FREEFORM",
      templateType: null,
      templateId: null,
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-marketing",
      assigneeIds: ["u-marketing"],
      watcherIds: ["u-pm"],
      dueDate: "2026-05-02",
      lastSeenAtByUser: {},
      updatedAt: iso(10),
      createdAt: iso(118),
      formValues: {}
    }),
    makeTask({
      id: "task-competitive-context",
      unitId: "unit-growth",
      folderId: "folder-growth-planning",
      listId: "list-growth-objective",
      parentId: "task-marketing-strategy",
      title: "경쟁환경 파악",
      description: "White Space와 경쟁 기준을 추출합니다.",
      structureState: "FREEFORM",
      templateType: null,
      templateId: null,
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-marketing"],
      dueDate: "2026-05-08",
      lastSeenAtByUser: {},
      updatedAt: iso(12),
      createdAt: iso(120),
      formValues: {}
    }),
    makeTask({
      id: "task-product-strategy",
      unitId: "unit-product",
      folderId: "folder-product-roadmap",
      listId: "list-product-phase",
      parentId: "task-vision",
      title: "S/W 제품전략",
      description: "제품 출시 단계와 기능 결정을 형상화합니다.",
      structureState: "FREEFORM",
      templateType: "OBJECTIVE",
      templateId: null,
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-lead"],
      dueDate: "2026-06-15",
      lastSeenAtByUser: {},
      updatedAt: iso(14),
      createdAt: iso(170),
      formValues: {}
    }),
    makeTask({
      id: "task-phase-1",
      unitId: "unit-product",
      folderId: "folder-product-roadmap",
      listId: "list-product-phase",
      parentId: "task-product-strategy",
      title: "Phase 1 - MVP 출시",
      description: "File Block과 Timeline을 포함한 MVP 출시 단계를 정형화합니다.",
      structureState: "TEMPLATED",
      templateType: "KEYRESULT",
      templateId: "tpl-product-phase",
      currentState: "IN_PROGRESS",
      priority: "HIGH",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: ["u-lead"],
      dueDate: "2026-06-01",
      lastSeenAtByUser: {},
      updatedAt: iso(16),
      createdAt: iso(130),
      formValues: { releaseSpec: "KR-1.1 Work Graph 출시", qualityGate: "멘션 기반 논의 1회 이상 검증", launchSignal: "파일럿 팀 재방문" }
    }),
    makeTask({
      id: "task-file-block",
      unitId: "unit-product",
      folderId: "folder-product-roadmap",
      listId: "list-product-phase",
      parentId: "task-phase-1",
      title: "File Block 구현",
      description: "Notes 첨부 근거를 파일 블록으로 확장할 준비를 합니다.",
      structureState: "FREEFORM",
      templateType: null,
      templateId: null,
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: [],
      dueDate: null,
      lastSeenAtByUser: {},
      updatedAt: iso(20),
      createdAt: iso(90),
      formValues: {}
    }),
    makeTask({
      id: "task-timeline",
      unitId: "unit-product",
      folderId: "folder-product-roadmap",
      listId: "list-product-phase",
      parentId: "task-phase-1",
      title: "Timeline 구현",
      description: "결정 이벤트와 투자 행위를 타임라인에 보존합니다.",
      structureState: "FREEFORM",
      templateType: null,
      templateId: null,
      currentState: "DRAFT",
      priority: "MEDIUM",
      ownerId: "u-pm",
      assigneeIds: ["u-pm"],
      watcherIds: [],
      dueDate: null,
      lastSeenAtByUser: {},
      updatedAt: iso(22),
      createdAt: iso(88),
      formValues: {}
    })
  ];

  const notes: Note[] = [
    {
      id: "note-background",
      taskId: "task-marketing-strategy",
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
      taskId: "task-marketing-strategy",
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
      taskId: "task-marketing-strategy",
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
      taskId: "task-target-research",
      title: "시장 세분화 계획",
      content: "구매 주체, 현장 사용자, 승인권자를 분리해서 인터뷰 질문지를 운영합니다.",
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
      taskId: "task-marketing-strategy",
      authorId: "u-lead",
      content: "@S/W 제품 마케팅전략.M2 기준이면 메시지의 첫 문장은 효율보다 리스크 제거에 가까워야 할 것 같습니다.",
      referencedNoteIds: ["note-analysis"],
      mentions: [
        { id: "mention-1", type: "FORM_FIELD", targetId: "task-marketing-strategy", fieldKey: "marketAnalysis", label: "S/W 제품 마케팅전략.M2 시장 분석" },
        { id: "mention-2", type: "NOTE", targetId: "note-analysis", label: "분석 요약" }
      ],
      createdAt: iso(3)
    },
    {
      id: "comment-2",
      taskId: "task-marketing-strategy",
      authorId: "u-marketing",
      content: "@이팀장 반영해서 #결정 사항 초안을 수정했습니다. 영업팀 확인 후 승인 요청을 유지하겠습니다.",
      referencedNoteIds: ["note-decision"],
      mentions: [
        { id: "mention-3", type: "MEMBER", targetId: "u-lead", label: "이팀장" },
        { id: "mention-4", type: "NOTE", targetId: "note-decision", label: "결정 사항 초안" }
      ],
      createdAt: iso(2)
    },
    {
      id: "comment-3",
      taskId: "task-target-research",
      authorId: "u-pm",
      content: "@고객 인터뷰 인터뷰 6번 이후부터 구매 기준이 반복되는지 확인해주세요.",
      referencedNoteIds: ["note-analysis"],
      mentions: [
        { id: "mention-5", type: "TASK", targetId: "task-customer-interview", label: "고객 인터뷰" },
        { id: "mention-6", type: "NOTE", targetId: "note-analysis", label: "분석 요약" }
      ],
      createdAt: iso(7)
    }
  ];

  const timeline: TimelineEvent[] = [
    {
      id: "event-1",
      taskId: "task-marketing-strategy",
      type: "TASK_CREATED",
      actorId: "u-pm",
      decisionType: null,
      reason: null,
      referencedNoteIds: [],
      payload: { title: "S/W 제품 마케팅전략" },
      createdAt: iso(240)
    },
    {
      id: "event-2",
      taskId: "task-marketing-strategy",
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
      taskId: "task-marketing-strategy",
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
      taskId: "task-marketing-strategy",
      componentType: "DECISION",
      eventType: "APPROVAL_REQUESTED",
      title: "승인 검토 대기",
      message: "S/W 제품 마케팅전략에 대한 승인 판단이 필요합니다.",
      readAt: null,
      createdAt: iso(1)
    },
    {
      id: "inbox-2",
      userId: "u-pm",
      taskId: "task-marketing-strategy",
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
      taskId: "task-market-validation",
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
      taskId: "task-phase-1",
      componentType: "RESULT",
      eventType: "COMPLETED",
      title: "이전 메시지 정리 완료",
      message: "지난 캠페인 회고가 완료되었습니다.",
      readAt: iso(10),
      createdAt: iso(12)
    }
  ];

  const engagement: EngagementEvent[] = [
    { id: "eng-1", type: "NODE_CREATED", actorId: "u-pm", taskId: "task-marketing-strategy", metadata: { structureState: "TEMPLATED" }, createdAt: iso(240) },
    { id: "eng-2", type: "NODE_CREATED", actorId: "u-marketing", taskId: "task-market-validation", metadata: { structureState: "FREEFORM" }, createdAt: iso(200) },
    { id: "eng-3", type: "TEMPLATE_APPLIED", actorId: "u-pm", taskId: "task-marketing-strategy", targetId: "tpl-marketing-objective", metadata: { fields: 4 }, createdAt: iso(160) },
    { id: "eng-4", type: "COMMENT_CREATED", actorId: "u-lead", taskId: "task-marketing-strategy", metadata: { mentions: 2, crossFunctional: true }, createdAt: iso(3) },
    { id: "eng-5", type: "MENTION_CREATED", actorId: "u-lead", taskId: "task-marketing-strategy", targetId: "task-marketing-strategy", metadata: { type: "FORM_FIELD" }, createdAt: iso(3) },
    { id: "eng-6", type: "NOTE_UPDATED", actorId: "u-marketing", taskId: "task-marketing-strategy", targetId: "note-analysis", metadata: { afterMention: true }, createdAt: iso(2) },
    { id: "eng-7", type: "NODE_UPDATED", actorId: "u-marketing", taskId: "task-marketing-strategy", metadata: { afterFeedback: true }, createdAt: iso(2) },
    { id: "eng-8", type: "DECISION_TRANSITION", actorId: "u-marketing", taskId: "task-marketing-strategy", metadata: { toState: "PENDING_APPROVAL" }, createdAt: iso(1) },
    { id: "eng-9", type: "VOLUNTARY_VISIT", actorId: "u-lead", taskId: "task-marketing-strategy", metadata: { source: "discussion" }, createdAt: iso(1) }
  ];

  const analytics = calculateSeedAnalytics(tasks, notes, comments, timeline, engagement, templates);

  return {
    me: members[2],
    members,
    units,
    folders,
    lists,
    tasks,
    notes,
    comments,
    timeline,
    inbox,
    templates,
    engagement,
    analytics
  };
}

function calculateSeedAnalytics(
  tasks: Task[],
  notes: Note[],
  comments: ThreadComment[],
  timeline: TimelineEvent[],
  engagement: EngagementEvent[],
  templates: Template[]
): Analytics {
  const templatedTasks = tasks.filter((task) => task.structureState === "TEMPLATED");
  const activeFormFieldCount = templatedTasks.reduce((sum, task) => {
    const template = templates.find((row) => row.id === task.templateId);
    return sum + (template?.formDefinition.length ?? Object.keys(task.formValues).length);
  }, 0);
  const mentionCount = comments.reduce((sum, comment) => sum + comment.mentions.length, 0);
  const mentionThreadCount = comments.filter((comment) => comment.mentions.length > 0 || comment.referencedNoteIds.length > 0).length;
  const nonDevComments = comments.filter((comment) => ["u-marketing", "u-viewer"].includes(comment.authorId)).length;

  return {
    weeklyReturnRate: 0.74,
    notesThreadBalance: `${notes.length}:${comments.length}`,
    nonDevContributionRate: comments.length ? nonDevComments / comments.length : 0,
    noteReferenceRate: comments.length ? comments.filter((comment) => comment.referencedNoteIds.length > 0).length / comments.length : 0,
    voluntaryVisitsPerWeek: engagement.filter((event) => event.type === "VOLUNTARY_VISIT").length,
    decisionEvents: timeline.filter((event) => event.decisionType).length,
    shapedNodeCount: tasks.length,
    relationCount: tasks.filter((task) => task.parentId).length,
    templatedNodeCount: templatedTasks.length,
    activeFormFieldCount,
    mentionCount,
    mentionThreadCount,
    crossFunctionalThreadRate: comments.length ? comments.filter((comment) => comment.authorId !== tasks.find((task) => task.id === comment.taskId)?.ownerId).length / comments.length : 0,
    feedbackNodeRevisionRate: engagement.filter((event) => event.type === "NODE_UPDATED" && event.metadata.afterFeedback === true).length / Math.max(1, mentionThreadCount),
    voluntaryVisitCount: engagement.filter((event) => event.type === "VOLUNTARY_VISIT").length
  };
}
