export type TemplateType = "VISION" | "AXIS" | "OBJECTIVE" | "KEYRESULT" | "TASK";
export type TaskState = "DRAFT" | "IN_PROGRESS" | "DONE" | "CANCELED";
export type WorkflowPhase = "BACKLOG" | "PLAN" | "ACTIVE" | "CLOSED";
export type WorkflowStatusCategory = "OPEN" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE" | "CANCELED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type Role = "MEMBER" | "OWNER" | "ADMIN" | "SUPER_ADMIN";
export type DecisionType = "APPROVE" | "REJECT" | "SUPPLEMENT" | "STATE_ONLY";
export type InboxComponent = "DECISION" | "DISCUSSION" | "AWARENESS" | "RESULT";
export type StructureState = "FREEFORM" | "TEMPLATED";
export type MentionType = "MEMBER" | "TASK" | "FORM_FIELD" | "NOTE";
export type FormFieldType = "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "SELECT" | "FILE";
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
  workflowPhase?: WorkflowPhase;
  phaseOverride?: WorkflowPhase | null;
  workflowStatusId?: string;
  priority: Priority;
  ownerId: string;
  assigneeIds: string[];
  watcherIds: string[];
  dueDate: string | null;
  lastSeenAtByUser: Record<string, string>;
  approvalPolicyId?: string | null;
  updatedAt: string;
  createdAt: string;
  formValues: Record<string, string>;
  tags: string[];
  attachmentIds?: string[];
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  kind: "FILE" | "LINK";
  name: string;
  mimeType?: string;
  size?: number;
  url?: string;
  provider?: string;
  contentDataUrl?: string;
  createdBy: string;
  createdAt: string;
};

export type Unit = {
  id: string;
  name: string;
  purpose: string;
  defaultApprovalPolicyId?: string | null;
  notificationConfig?: {
    mentionEnabled: boolean;
    approvalRequestEnabled: boolean;
    dueSoonEnabled: boolean;
    digestEnabled: boolean;
  };
};

export type UnitMemberRole = "OWNER" | "MEMBER";

export type UnitMember = {
  id: string;
  unitId: string;
  memberId: string;
  role: UnitMemberRole;
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
  defaultPhase?: WorkflowPhase;
};

export type WorkflowStatusDefinition = {
  id: string;
  name: string;
  category: WorkflowStatusCategory;
  isDefault?: boolean;
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
  ackAt?: string | null;
  remindCount?: number;
  sourceUserId?: string | null;
  mentionCommentId?: string | null;
  createdAt: string;
};

export type NotificationSettings = {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  webPushEnabled: boolean;
  digestEnabled: boolean;
  mutedComponents: InboxComponent[];
  mentionOnlyForWatchers: boolean;
  slaHours: number;
};

export type WebPushSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
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
  workflowSchema?: {
    statuses: WorkflowStatusDefinition[];
    transitions: Array<{
      fromStatusId: string;
      toStatusId: string;
      label: string;
      decisionType: DecisionType;
      isDecision: boolean;
      onEnter?: Record<string, unknown>;
      onExit?: {
        approvalGate?: {
          enabled: boolean;
          policyId?: string | null;
        };
      };
    }>;
  };
};

export type ApprovalMode = "SINGLE" | "PARALLEL" | "CONSENSUS";
export type ApprovalAssigneeType = "ROLE" | "MEMBER";
export type ApprovalLineType = "CONSENSUS" | "APPROVAL";

export type ApprovalLine = {
  id: string;
  type: ApprovalLineType;
  participantIds: string[];
  minApprovals: number;
};

export type ApprovalPolicy = {
  id: string;
  name: string;
  unitId?: string | null;
  description?: string;
  enabled: boolean;
  mode: ApprovalMode;
  approverType: ApprovalAssigneeType;
  approverRole?: Role;
  approverIds?: string[];
  minApprovals: number;
  approvalLines?: ApprovalLine[];
  finalApproverId?: string | null;
  createdAt: string;
  updatedAt: string;
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
  unitMembers: UnitMember[];
  folders: Folder[];
  lists: TaskList[];
  tasks: Task[];
  attachments: TaskAttachment[];
  notes: Note[];
  comments: ThreadComment[];
  timeline: TimelineEvent[];
  inbox: InboxItem[];
  notificationSettings: NotificationSettings[];
  webPushSubscriptions: WebPushSubscription[];
  templates: Template[];
  workflowStatuses: WorkflowStatusDefinition[];
  approvalPolicies: ApprovalPolicy[];
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
  { from: "IN_PROGRESS", to: "DONE", label: "승인", isDecision: decision, decisionType: "APPROVE" },
  { from: "IN_PROGRESS", to: "IN_PROGRESS", label: "보완 요청", isDecision: decision, decisionType: "SUPPLEMENT" },
  { from: "IN_PROGRESS", to: "CANCELED", label: "반려", isDecision: decision, decisionType: "REJECT" }
];

export const DEFAULT_WORKFLOW_STATUSES: WorkflowStatusDefinition[] = [
  { id: "open", name: "Open", category: "OPEN", isDefault: true },
  { id: "in_progress", name: "In Progress", category: "IN_PROGRESS" },
  { id: "done", name: "Done", category: "DONE" },
  { id: "canceled", name: "Canceled", category: "CANCELED" }
];

export const LEGACY_STATE_TO_STATUS_ID: Record<TaskState, string> = {
  DRAFT: "open",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  CANCELED: "canceled"
};

const legacyStateToPhase = (state: TaskState): WorkflowPhase => {
  if (state === "DRAFT") return "BACKLOG";
  if (state === "DONE" || state === "CANCELED") return "CLOSED";
  return "ACTIVE";
};

const makeTask = (task: Omit<Task, "tags"> & Partial<Pick<Task, "tags">>): Task => ({
  ...task,
  workflowStatusId: task.workflowStatusId ?? LEGACY_STATE_TO_STATUS_ID[task.currentState],
  workflowPhase: task.workflowPhase ?? legacyStateToPhase(task.currentState),
  phaseOverride: task.phaseOverride ?? null,
  tags: task.tags ?? [],
  attachmentIds: task.attachmentIds ?? []
});

export function createSeedData(): AppData {
  const units: Unit[] = [
    { id: "unit-growth", name: "성장 전략", purpose: "시장/브랜드/포지셔닝 결정", defaultApprovalPolicyId: "ap-growth-consensus" },
    { id: "unit-product", name: "제품 전략", purpose: "로드맵/출시/품질 운영", defaultApprovalPolicyId: "ap-default-unit-approver" },
    { id: "unit-ops", name: "운영 개선", purpose: "조직 프로세스/내부 효율화", defaultApprovalPolicyId: "ap-default-unit-approver" }
  ];
  const folders: Folder[] = [
    { id: "folder-growth-planning", unitId: "unit-growth", name: "시장 전략" },
    { id: "folder-growth-exec", unitId: "unit-growth", name: "실행 검증" },
    { id: "folder-product-roadmap", unitId: "unit-product", name: "로드맵" }
  ];
  const lists: TaskList[] = [
    { id: "list-growth-objective", unitId: "unit-growth", folderId: "folder-growth-planning", name: "Objective 리스트", defaultPhase: "PLAN" },
    { id: "list-growth-validation", unitId: "unit-growth", folderId: "folder-growth-exec", name: "Validation 리스트", defaultPhase: "ACTIVE" },
    { id: "list-product-phase", unitId: "unit-product", folderId: "folder-product-roadmap", name: "Phase 리스트", defaultPhase: "PLAN" },
    { id: "list-ops-backlog", unitId: "unit-ops", folderId: null, name: "운영 백로그", defaultPhase: "BACKLOG" }
  ];
  const members: Member[] = [
    { id: "u-pm", name: "박PM", email: "pm@selvasin4.local", role: "MEMBER", unit: "HWE" },
    { id: "u-marketing", name: "김매니저", email: "marketing@selvasin4.local", role: "MEMBER", unit: "마케팅" },
    { id: "u-lead", name: "이팀장", email: "lead@selvasin4.local", role: "OWNER", unit: "리더십" },
    { id: "u-admin", name: "관리자", email: "admin@selvasin4.local", role: "ADMIN", unit: "운영" },
    { id: "u-viewer", name: "정멤버", email: "viewer@selvasin4.local", role: "MEMBER", unit: "영업" },
    { id: "u-super", name: "수퍼관리자", email: "super@selvasin4.local", role: "SUPER_ADMIN", unit: "전사" }
  ];
  const unitMembers: UnitMember[] = [
    { id: "um-growth-owner", unitId: "unit-growth", memberId: "u-pm", role: "OWNER" },
    { id: "um-growth-member-1", unitId: "unit-growth", memberId: "u-marketing", role: "MEMBER" },
    { id: "um-growth-member-2", unitId: "unit-growth", memberId: "u-lead", role: "MEMBER" },
    { id: "um-growth-member", unitId: "unit-growth", memberId: "u-viewer", role: "MEMBER" },
    { id: "um-product-owner", unitId: "unit-product", memberId: "u-pm", role: "OWNER" },
    { id: "um-product-member", unitId: "unit-product", memberId: "u-lead", role: "MEMBER" },
    { id: "um-ops-owner", unitId: "unit-ops", memberId: "u-admin", role: "OWNER" }
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
      ,
      workflowSchema: {
        statuses: DEFAULT_WORKFLOW_STATUSES,
        transitions: workflow(true).map((row) => ({
          fromStatusId: LEGACY_STATE_TO_STATUS_ID[row.from],
          toStatusId: LEGACY_STATE_TO_STATUS_ID[row.to],
          label: row.label,
          decisionType: row.decisionType,
          isDecision: row.isDecision
        }))
      }
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
      workflow: workflow(true),
      workflowSchema: {
        statuses: DEFAULT_WORKFLOW_STATUSES,
        transitions: workflow(true).map((row) => ({
          fromStatusId: LEGACY_STATE_TO_STATUS_ID[row.from],
          toStatusId: LEGACY_STATE_TO_STATUS_ID[row.to],
          label: row.label,
          decisionType: row.decisionType,
          isDecision: row.isDecision
        }))
      }
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
      workflow: workflow(false),
      workflowSchema: {
        statuses: DEFAULT_WORKFLOW_STATUSES,
        transitions: workflow(false).map((row) => ({
          fromStatusId: LEGACY_STATE_TO_STATUS_ID[row.from],
          toStatusId: LEGACY_STATE_TO_STATUS_ID[row.to],
          label: row.label,
          decisionType: row.decisionType,
          isDecision: row.isDecision
        }))
      }
    }
  ];
  const approvalPolicies: ApprovalPolicy[] = [
    {
      id: "ap-default-unit-approver",
      name: "기본 승인자 정책",
      unitId: null,
      description: "OWNER/ADMIN 권한자 단일 승인 요청",
      enabled: true,
      mode: "SINGLE",
      approverType: "ROLE",
      approverRole: "OWNER",
      approverIds: [],
      minApprovals: 1,
      approvalLines: [{ id: "line-default-approval", type: "APPROVAL", participantIds: ["u-lead"], minApprovals: 1 }],
      finalApproverId: "u-admin",
      createdAt: iso(260),
      updatedAt: iso(2)
    },
    {
      id: "ap-growth-consensus",
      name: "성장전략 합의 정책",
      unitId: "unit-growth",
      description: "지정 멤버 병렬 합의(2인)",
      enabled: true,
      mode: "CONSENSUS",
      approverType: "MEMBER",
      approverIds: ["u-lead", "u-admin"],
      minApprovals: 2,
      approvalLines: [
        { id: "line-growth-consensus", type: "CONSENSUS", participantIds: ["u-lead", "u-admin"], minApprovals: 2 },
        { id: "line-growth-approval", type: "APPROVAL", participantIds: ["u-admin"], minApprovals: 1 }
      ],
      finalApproverId: "u-admin",
      createdAt: iso(200),
      updatedAt: iso(1)
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
      currentState: "IN_PROGRESS",
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
  const attachments: TaskAttachment[] = [];

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
      payload: { fromState: "IN_PROGRESS", toState: "IN_PROGRESS", toStatusId: "in_progress" },
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
      ackAt: null,
      remindCount: 0,
      sourceUserId: "u-marketing",
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
      ackAt: null,
      remindCount: 0,
      sourceUserId: "u-marketing",
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
      ackAt: null,
      remindCount: 0,
      sourceUserId: "u-pm",
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
      ackAt: iso(10),
      remindCount: 0,
      sourceUserId: "u-pm",
      createdAt: iso(12)
    },
    {
      id: "inbox-5",
      userId: "u-admin",
      taskId: "task-marketing-strategy",
      componentType: "DISCUSSION",
      eventType: "MENTION",
      title: "관리자 멘션 확인 요청",
      message: "박PM: @관리자 정책 검토 부탁드립니다.",
      readAt: null,
      ackAt: null,
      remindCount: 1,
      sourceUserId: "u-pm",
      mentionCommentId: "comment-seed-admin-1",
      createdAt: iso(3)
    },
    {
      id: "inbox-6",
      userId: "u-admin",
      taskId: "task-market-validation",
      componentType: "DECISION",
      eventType: "APPROVAL_REQUESTED",
      title: "전역 승인 정책 검토 요청",
      message: "김매니저: 전환 정책 변경 승인 부탁드립니다.",
      readAt: null,
      ackAt: null,
      remindCount: 0,
      sourceUserId: "u-marketing",
      createdAt: iso(4)
    },
    {
      id: "inbox-7",
      userId: "u-pm",
      taskId: "task-marketing-strategy",
      componentType: "DECISION",
      eventType: "APPROVAL_REQUESTED",
      title: "승인 요청 전송됨",
      message: "관리자님에게 승인 요청을 보냈습니다.",
      readAt: null,
      ackAt: null,
      remindCount: 2,
      sourceUserId: "u-admin",
      createdAt: iso(2)
    },
    {
      id: "inbox-8",
      userId: "u-marketing",
      taskId: "task-marketing-strategy",
      componentType: "DISCUSSION",
      eventType: "MENTION",
      title: "합의 요청 멘션 전송됨",
      message: "합의 라인 확인을 위해 멘션했습니다.",
      readAt: iso(1),
      ackAt: null,
      remindCount: 1,
      sourceUserId: "u-admin",
      mentionCommentId: "comment-seed-admin-2",
      createdAt: iso(2)
    },
    {
      id: "inbox-9",
      userId: "u-lead",
      taskId: "task-phase-1",
      componentType: "RESULT",
      eventType: "STATE_TRANSITION",
      title: "후속 액션 열람 대기",
      message: "결정 후속 태스크 착수 요청이 전달되었는지 열람 확인이 필요합니다.",
      readAt: iso(3),
      ackAt: iso(2),
      remindCount: 0,
      sourceUserId: "u-admin",
      createdAt: iso(4)
    }
  ];

  const notificationSettings: NotificationSettings[] = members.map((member) => ({
    userId: member.id,
    emailEnabled: false,
    pushEnabled: true,
    webPushEnabled: false,
    digestEnabled: false,
    mutedComponents: [],
    mentionOnlyForWatchers: false,
    slaHours: 24
  }));
  const webPushSubscriptions: WebPushSubscription[] = [];

  const engagement: EngagementEvent[] = [
    { id: "eng-1", type: "NODE_CREATED", actorId: "u-pm", taskId: "task-marketing-strategy", metadata: { structureState: "TEMPLATED" }, createdAt: iso(240) },
    { id: "eng-2", type: "NODE_CREATED", actorId: "u-marketing", taskId: "task-market-validation", metadata: { structureState: "FREEFORM" }, createdAt: iso(200) },
    { id: "eng-3", type: "TEMPLATE_APPLIED", actorId: "u-pm", taskId: "task-marketing-strategy", targetId: "tpl-marketing-objective", metadata: { fields: 4 }, createdAt: iso(160) },
    { id: "eng-4", type: "COMMENT_CREATED", actorId: "u-lead", taskId: "task-marketing-strategy", metadata: { mentions: 2, crossFunctional: true }, createdAt: iso(3) },
    { id: "eng-5", type: "MENTION_CREATED", actorId: "u-lead", taskId: "task-marketing-strategy", targetId: "task-marketing-strategy", metadata: { type: "FORM_FIELD" }, createdAt: iso(3) },
    { id: "eng-6", type: "NOTE_UPDATED", actorId: "u-marketing", taskId: "task-marketing-strategy", targetId: "note-analysis", metadata: { afterMention: true }, createdAt: iso(2) },
    { id: "eng-7", type: "NODE_UPDATED", actorId: "u-marketing", taskId: "task-marketing-strategy", metadata: { afterFeedback: true }, createdAt: iso(2) },
    { id: "eng-8", type: "DECISION_TRANSITION", actorId: "u-marketing", taskId: "task-marketing-strategy", metadata: { toState: "IN_PROGRESS", toStatusId: "in_progress" }, createdAt: iso(1) },
    { id: "eng-9", type: "VOLUNTARY_VISIT", actorId: "u-lead", taskId: "task-marketing-strategy", metadata: { source: "discussion" }, createdAt: iso(1) }
  ];

  const analytics = calculateSeedAnalytics(tasks, notes, comments, timeline, engagement, templates);

  return {
    me: members[2],
    members,
    units,
    unitMembers,
    folders,
    lists,
    tasks,
    attachments,
    notes,
    comments,
    timeline,
    inbox,
    notificationSettings,
    webPushSubscriptions,
    templates,
    workflowStatuses: DEFAULT_WORKFLOW_STATUSES,
    approvalPolicies,
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
