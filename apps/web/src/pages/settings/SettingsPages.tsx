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
import { Badge, Centered, FilterShell, PageHeader, PanelHeader, PanelTitle, Select, Tabs } from "../../components/ui";
import { request } from "../../lib/api";
import { go } from "../../lib/router";
import type { TaskDetail, TaskView } from "../../lib/viewTypes";
import { TaskViewTabs } from "../../features/tasks/TaskViewTabs";
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
} from "../../lib/domain";

export function ProfileSettingsView({ me, onNavigate }: { me: Member; onNavigate: (path: string) => void }) {
  return (
    <section className="page-stack">
      <PageHeader eyebrow="프로필" title="내 계정 설정" />
      <section className="panel">
        <PanelHeader title="기본 정보" />
        <div className="kv-grid">
          <div><small>이름</small><strong>{profileDisplayName(me)}</strong></div>
          <div><small>이메일</small><strong>{me.email}</strong></div>
          <div><small>전역 역할</small><strong>{roleLabel[me.role]}</strong></div>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="빠른 이동" />
        <div className="row-actions left">
          <button className="button secondary" onClick={() => onNavigate("/tasks")}>태스크로 이동</button>
          <button className="button secondary" onClick={() => onNavigate("/settings/access")}>사용자 및 권한</button>
        </div>
      </section>
    </section>
  );
}

function AdminPermissionsView({ embedded = false }: { embedded?: boolean }) {
  return (
    <section className="page-stack">
      {!embedded && <PageHeader eyebrow="관리" title="전역 권한 관리" />}
      <section className="panel">
        <PanelHeader title="권한 모델" />
        <div className="kv-grid">
          <div><small>역할 계층</small><strong>유닛 멤버 → 유닛 오너 → 관리자 → IT 인프라 담당자</strong></div>
          <div><small>전역 사용자</small><strong>전역 사용자 관리는 계정(신원) 관리만 담당합니다.</strong></div>
          <div><small>정책 원칙</small><strong>권한은 기능/메뉴/유닛 스코프에서 별도로 부여됩니다.</strong></div>
          <div><small>역할 해석</small><strong>관리자: 인사팀/C레벨/섹터리드, IT 인프라 담당자: 플랫폼/인프라 운영 책임</strong></div>
        </div>
      </section>
    </section>
  );
}

export function AccessControlView({
  members,
  units,
  unitMembers,
  onReload
}: {
  members: Member[];
  units: Unit[];
  unitMembers: UnitMember[];
  onReload: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"users" | "policy" | "unitAccess">("users");
  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="사용자 및 권한" />
      <Tabs
        value={tab}
        onChange={(value) => setTab(value as "users" | "policy" | "unitAccess")}
        tabs={[
          { value: "users", label: "사용자 관리", count: members.length },
          { value: "policy", label: "권한 정책" },
          { value: "unitAccess", label: "유닛 멤버십", count: unitMembers.length }
        ]}
      />
      {tab === "users" ? (
        <MembersView members={members} onReload={onReload} embedded />
      ) : tab === "policy" ? (
        <AdminPermissionsView embedded />
      ) : (
        <UnitMembershipView members={members} units={units} unitMembers={unitMembers} onReload={onReload} />
      )}
    </section>
  );
}

function UnitMembershipView({
  members,
  units,
  unitMembers,
  onReload
}: {
  members: Member[];
  units: Unit[];
  unitMembers: UnitMember[];
  onReload: () => Promise<void>;
}) {
  const [memberId, setMemberId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState<UnitMemberRole>("MEMBER");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = unitMembers
    .map((row) => ({
      ...row,
      member: members.find((member) => member.id === row.memberId) ?? null,
      unit: units.find((unit) => unit.id === row.unitId) ?? null
    }))
    .filter((row) => row.member && row.unit);
  const addMembership = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberId || !unitId) return;
    const member = members.find((row) => row.id === memberId);
    if (!member) return;
    try {
      setBusy(true);
      setMessage(null);
      await request("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ email: member.email, role: member.role, unitId, unitMemberRole: role })
      });
      await onReload();
      setMessage("유닛 멤버십이 추가되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "유닛 멤버십 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const changeMembershipRole = async (targetUnitId: string, targetMemberId: string, nextRole: UnitMemberRole) => {
    try {
      setBusy(true);
      setMessage(null);
      await request(`/api/units/${targetUnitId}/members/${targetMemberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await onReload();
      setMessage("유닛 멤버십 역할이 변경되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "유닛 멤버십 역할 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const removeMembership = async (targetUnitId: string, targetMemberId: string, memberName: string, unitName: string) => {
    if (!window.confirm(`${memberName} 사용자의 ${unitName} 멤버십을 제거할까요?`)) return;
    try {
      setBusy(true);
      setMessage(null);
      await request(`/api/units/${targetUnitId}/members/${targetMemberId}`, { method: "DELETE" });
      await onReload();
      setMessage("유닛 멤버십이 제거되었습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "유닛 멤버십 제거에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page-stack">
      <section className="panel">
        <PanelHeader title="유닛 멤버십 추가" />
        <form className="create-card" onSubmit={addMembership}>
          <Select label="사용자" value={memberId} onChange={setMemberId} options={[["", "사용자 선택"], ...members.map((member) => [member.id, `${member.name} (${member.email})`] as [string, string])]} />
          <Select label="유닛" value={unitId} onChange={setUnitId} options={[["", "유닛 선택"], ...units.map((unit) => [unit.id, unit.name] as [string, string])]} />
          <Select label="유닛 역할" value={role} onChange={(value) => setRole(value as UnitMemberRole)} options={[["OWNER", "유닛 오너"], ["MEMBER", "유닛 멤버"]]} />
          <button className="button primary" disabled={busy || !memberId || !unitId}>추가</button>
        </form>
        {message && <div className="inline-error">{message}</div>}
      </section>
      <section className="panel">
        <PanelHeader title="유닛 멤버십 목록" />
        <div className="task-table">
          <div className="task-row static">
            <strong>사용자</strong>
            <strong>이메일</strong>
            <strong>유닛</strong>
            <strong>유닛 역할</strong>
            <strong>액션</strong>
          </div>
          {rows.map((row) => (
            <div className="task-row static" key={row.id}>
              <strong>{row.member!.name}</strong>
              <span>{row.member!.email}</span>
              <span>{row.unit!.name}</span>
              <Select
                tone="inline"
                value={row.role}
                onChange={(value) => void changeMembershipRole(row.unitId, row.memberId, value as UnitMemberRole)}
                options={[["OWNER", "유닛 오너"], ["MEMBER", "유닛 멤버"]]}
              />
              <button className="button danger" disabled={busy} onClick={() => void removeMembership(row.unitId, row.memberId, row.member!.name, row.unit!.name)}>
                제거
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function GlobalUnitManagementView({
  units,
  onSelectUnit,
  onNavigate,
  onReload
}: {
  units: Unit[];
  onSelectUnit: (unitId: string) => void;
  onNavigate: (path: string) => void;
  onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string>("");
  const [editName, setEditName] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const rows = units.filter((unit) => !query.trim() || `${unit.name} ${unit.purpose}`.toLowerCase().includes(query.toLowerCase()));

  const createUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await request("/api/units", { method: "POST", body: JSON.stringify({ name: name.trim(), purpose: purpose.trim() || undefined }) });
      setName("");
      setPurpose("");
      setFeedback("유닛이 생성되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 생성에 실패했습니다.");
    }
  };

  const saveUnit = async () => {
    if (!editingUnitId || !editName.trim()) return;
    try {
      await request(`/api/units/${editingUnitId}`, { method: "PATCH", body: JSON.stringify({ name: editName.trim(), purpose: editPurpose.trim() || undefined }) });
      setEditingUnitId("");
      setFeedback("유닛이 수정되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 수정에 실패했습니다.");
    }
  };

  const removeUnit = async (unit: Unit) => {
    if (!window.confirm(`'${unit.name}' 유닛을 삭제할까요?`)) return;
    try {
      await request(`/api/units/${unit.id}`, { method: "DELETE" });
      setFeedback("유닛이 삭제되었습니다.");
      await onReload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "유닛 삭제에 실패했습니다.");
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="전역 유닛 관리" />
      <form className="create-card" onSubmit={createUnit}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="새 유닛 이름" />
        <input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="유닛 목적(선택)" />
        <button className="button primary" disabled={!name.trim()}>유닛 생성</button>
      </form>
      <div className="filter-shell">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="유닛 이름/목적 검색" />
      </div>
      {feedback && <div className="inline-error">{feedback}</div>}
      <div className="task-table">
        {rows.map((unit) => {
          const editing = editingUnitId === unit.id;
          return (
            <div className="task-row static" key={unit.id}>
              <strong>{unit.name}</strong>
              <span>{unit.purpose}</span>
              <div className="row-actions">
                <button className="button secondary" onClick={() => { onSelectUnit(unit.id); onNavigate(`/units/${unit.id}/settings`); }}>상세 관리</button>
                {editing ? (
                  <>
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="이름" />
                    <input value={editPurpose} onChange={(event) => setEditPurpose(event.target.value)} placeholder="목적" />
                    <button className="button primary" onClick={() => void saveUnit()} disabled={!editName.trim()}>저장</button>
                    <button className="button secondary" onClick={() => setEditingUnitId("")}>취소</button>
                  </>
                ) : (
                  <>
                    <button className="button secondary" onClick={() => { setEditingUnitId(unit.id); setEditName(unit.name); setEditPurpose(unit.purpose); }}>수정</button>
                    <button className="button danger" onClick={() => void removeUnit(unit)}>삭제</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function UnitSettingsView({
  me,
  unit,
  members,
  unitMembers,
  approvalPolicies,
  onNavigate,
  onReload
}: {
  me: Member;
  unit: Unit | null;
  members: Member[];
  unitMembers: UnitMember[];
  approvalPolicies: ApprovalPolicy[];
  onNavigate: (path: string) => void;
  onReload: () => Promise<void>;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER");
  const [inviteUnitRole, setInviteUnitRole] = useState<UnitMemberRole>("MEMBER");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [unitInfoBusy, setUnitInfoBusy] = useState(false);
  const [unitInfoMessage, setUnitInfoMessage] = useState<string | null>(null);
  const [unitNameDraft, setUnitNameDraft] = useState(unit?.name ?? "");
  const [unitPurposeDraft, setUnitPurposeDraft] = useState(unit?.purpose ?? "");
  const [unitPolicyBusy, setUnitPolicyBusy] = useState(false);
  const [unitPolicyMessage, setUnitPolicyMessage] = useState<string | null>(null);
  const [defaultApprovalPolicyId, setDefaultApprovalPolicyId] = useState(unit?.defaultApprovalPolicyId ?? "");
  const [customPolicyName, setCustomPolicyName] = useState("");
  const [customPolicyMode, setCustomPolicyMode] = useState<ApprovalPolicy["mode"]>("SINGLE");
  const [unitNotificationBusy, setUnitNotificationBusy] = useState(false);
  const [unitNotificationMessage, setUnitNotificationMessage] = useState<string | null>(null);
  const [unitNotificationConfig, setUnitNotificationConfig] = useState({
    mentionEnabled: unit?.notificationConfig?.mentionEnabled ?? true,
    approvalRequestEnabled: unit?.notificationConfig?.approvalRequestEnabled ?? true,
    dueSoonEnabled: unit?.notificationConfig?.dueSoonEnabled ?? true,
    digestEnabled: unit?.notificationConfig?.digestEnabled ?? false
  });
  const relatedMembers = unit
    ? unitMembers
      .filter((row) => row.unitId === unit.id)
      .map((row) => ({ ...row, member: members.find((member) => member.id === row.memberId) }))
      .filter((row) => Boolean(row.member))
    : [];
  const availableUnitPolicies = approvalPolicies.filter((policy) => policy.enabled && (!policy.unitId || policy.unitId === unit?.id));
  const myUnitRole = unitMembers.find((row) => row.unitId === unit?.id && row.memberId === me.id)?.role;
  const canInvite = Boolean(unit);
  useEffect(() => {
    setDefaultApprovalPolicyId(unit?.defaultApprovalPolicyId ?? "");
  }, [unit?.id, unit?.defaultApprovalPolicyId]);
  useEffect(() => {
    setUnitNameDraft(unit?.name ?? "");
    setUnitPurposeDraft(unit?.purpose ?? "");
  }, [unit?.id, unit?.name, unit?.purpose]);
  useEffect(() => {
    setUnitNotificationConfig({
      mentionEnabled: unit?.notificationConfig?.mentionEnabled ?? true,
      approvalRequestEnabled: unit?.notificationConfig?.approvalRequestEnabled ?? true,
      dueSoonEnabled: unit?.notificationConfig?.dueSoonEnabled ?? true,
      digestEnabled: unit?.notificationConfig?.digestEnabled ?? false
    });
  }, [unit?.id, unit?.notificationConfig?.mentionEnabled, unit?.notificationConfig?.approvalRequestEnabled, unit?.notificationConfig?.dueSoonEnabled, unit?.notificationConfig?.digestEnabled]);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (!canInvite || !inviteEmail.trim() || !unit) return;
    try {
      setInviteBusy(true);
      setInviteMessage(null);
      await request("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, unitId: unit.id, unitMemberRole: inviteUnitRole })
      });
      setInviteEmail("");
      setInviteUnitRole("MEMBER");
      setInviteOpen(false);
      await onReload();
      setInviteMessage("유닛 멤버 초대가 생성되었습니다.");
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : "초대 생성에 실패했습니다.");
    } finally {
      setInviteBusy(false);
    }
  };
  const saveUnitDefaultPolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!unit) return;
    try {
      setUnitPolicyBusy(true);
      setUnitPolicyMessage(null);
      await request(`/api/units/${unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ defaultApprovalPolicyId: defaultApprovalPolicyId || null })
      });
      await onReload();
      setUnitPolicyMessage("유닛 기본 승인정책이 저장되었습니다.");
    } catch (err) {
      setUnitPolicyMessage(err instanceof Error ? err.message : "유닛 기본 승인정책 저장에 실패했습니다.");
    } finally {
      setUnitPolicyBusy(false);
    }
  };
  const createUnitCustomPolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!unit || !customPolicyName.trim()) return;
    try {
      setUnitPolicyBusy(true);
      setUnitPolicyMessage(null);
      await request("/api/admin/approval-policies", {
        method: "POST",
        body: JSON.stringify({
          name: customPolicyName.trim(),
          description: `${unit.name} 유닛 커스텀 정책`,
          enabled: true,
          mode: customPolicyMode,
          approverType: "ROLE",
          approverRole: "OWNER",
          approverIds: [],
          minApprovals: 1,
          approvalLines: [],
          finalApproverId: null,
          unitId: unit.id
        })
      });
      setCustomPolicyName("");
      await onReload();
      setUnitPolicyMessage("유닛 커스텀 승인정책이 생성되었습니다.");
    } catch (err) {
      setUnitPolicyMessage(err instanceof Error ? err.message : "유닛 커스텀 승인정책 생성에 실패했습니다.");
    } finally {
      setUnitPolicyBusy(false);
    }
  };
  const saveUnitInfo = async (event: FormEvent) => {
    event.preventDefault();
    if (!unit || !unitNameDraft.trim()) return;
    try {
      setUnitInfoBusy(true);
      setUnitInfoMessage(null);
      await request(`/api/units/${unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: unitNameDraft.trim(),
          purpose: unitPurposeDraft.trim()
        })
      });
      await onReload();
      setUnitInfoMessage("유닛 기본 정보가 저장되었습니다.");
    } catch (err) {
      setUnitInfoMessage(err instanceof Error ? err.message : "유닛 기본 정보 저장에 실패했습니다.");
    } finally {
      setUnitInfoBusy(false);
    }
  };
  const saveUnitNotifications = async (event: FormEvent) => {
    event.preventDefault();
    if (!unit) return;
    try {
      setUnitNotificationBusy(true);
      setUnitNotificationMessage(null);
      await request(`/api/units/${unit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notificationConfig: unitNotificationConfig })
      });
      await onReload();
      setUnitNotificationMessage("유닛 알림 설정이 저장되었습니다.");
    } catch (err) {
      setUnitNotificationMessage(err instanceof Error ? err.message : "유닛 알림 설정 저장에 실패했습니다.");
    } finally {
      setUnitNotificationBusy(false);
    }
  };
  const changeUnitMemberRole = async (memberId: string, role: UnitMemberRole) => {
    if (!unit) return;
    try {
      setMemberBusyId(memberId);
      setMemberMessage(null);
      await request(`/api/units/${unit.id}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      });
      await onReload();
      setMemberMessage("유닛 멤버 역할이 변경되었습니다.");
    } catch (err) {
      setMemberMessage(err instanceof Error ? err.message : "유닛 멤버 역할 변경에 실패했습니다.");
    } finally {
      setMemberBusyId(null);
    }
  };
  const kickUnitMember = async (memberId: string, memberName: string) => {
    if (!unit) return;
    if (!window.confirm(`${memberName} 멤버를 이 유닛에서 제외할까요?`)) return;
    try {
      setMemberBusyId(memberId);
      setMemberMessage(null);
      await request(`/api/units/${unit.id}/members/${memberId}`, { method: "DELETE" });
      await onReload();
      setMemberMessage("유닛 멤버가 제외되었습니다.");
    } catch (err) {
      setMemberMessage(err instanceof Error ? err.message : "유닛 멤버 제외에 실패했습니다.");
    } finally {
      setMemberBusyId(null);
    }
  };
  return (
    <section className="page-stack">
      <PageHeader eyebrow="유닛" title="유닛 설정" />
      <section className="panel">
        <PanelHeader title="현재 유닛" />
        <form className="approval-policy-form" onSubmit={saveUnitInfo}>
          <div className="policy-basic-grid">
            <label>
              유닛명
              <input
                value={unitNameDraft}
                onChange={(event) => setUnitNameDraft(event.target.value)}
                placeholder="유닛명"
                disabled={!unit}
              />
            </label>
            <label>
              유닛 목적(설명)
              <input
                value={unitPurposeDraft}
                onChange={(event) => setUnitPurposeDraft(event.target.value)}
                placeholder="유닛 목적"
                disabled={!unit}
              />
            </label>
          </div>
          <div className="kv-grid">
            <div><small>내 역할</small><strong>{myUnitRole === "OWNER" ? "유닛 오너" : myUnitRole === "MEMBER" ? "유닛 멤버" : roleLabel[me.role]}</strong></div>
          </div>
          <div className="policy-submit-row">
            <button className="button primary" disabled={!unit || unitInfoBusy || !unitNameDraft.trim()}>
              {unitInfoBusy ? "저장 중..." : "유닛 정보 저장"}
            </button>
          </div>
        </form>
        {unitInfoMessage && <div className="inline-error">{unitInfoMessage}</div>}
      </section>
      <section className="panel">
        <PanelHeader title="유닛 멤버 관리" />
        <div className="kv-grid">
          <div><small>인원 수</small><strong>{relatedMembers.length}</strong></div>
          <div><small>구성</small><strong>{relatedMembers.map((row) => `${row.member!.name}(${row.role})`).join(", ") || "연결된 멤버 없음"}</strong></div>
        </div>
        <div className="row-actions left">
          <button type="button" className="button primary" disabled={!canInvite || !unit} onClick={() => setInviteOpen(true)}>
            유닛 멤버 초대
          </button>
        </div>
        {inviteMessage && <div className="inline-error">{inviteMessage}</div>}
        {memberMessage && <div className="inline-error">{memberMessage}</div>}
        <div className="task-table">
          <div className="task-row static">
            <strong>이름</strong>
            <strong>이메일</strong>
            <strong>전역 역할</strong>
            <strong>유닛 역할</strong>
            <strong>액션</strong>
          </div>
          {relatedMembers.map((row) => (
            <div className="task-row static" key={row.id}>
              <strong>{row.member!.name}</strong>
              <span>{row.member!.email}</span>
              <Badge tone="slate">{roleLabel[row.member!.role]}</Badge>
              <Select
                tone="inline"
                value={row.role}
                onChange={(value) => void changeUnitMemberRole(row.member!.id, value as UnitMemberRole)}
                options={[["OWNER", "오너"], ["MEMBER", "멤버"]]}
              />
              <button
                className="button danger"
                disabled={memberBusyId === row.member!.id}
                onClick={() => void kickUnitMember(row.member!.id, row.member!.name)}
              >
                킥
              </button>
            </div>
          ))}
        </div>
        <div className="row-actions left">
          <button className="button secondary" onClick={() => onNavigate("/settings/access")}>사용자 및 권한으로 이동</button>
        </div>
        {inviteOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-head">
                <h3>유닛 멤버 초대</h3>
                <button type="button" className="button ghost" onClick={() => setInviteOpen(false)}>닫기</button>
              </div>
              <form className="unit-invite-form" onSubmit={invite}>
                <label>
                  이메일
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder={canInvite ? "초대할 이메일" : "유닛을 먼저 선택하세요"}
                    disabled={!canInvite || !unit}
                  />
                </label>
                <label>
                  전역 역할
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} disabled={!canInvite || !unit}>
                    <option value="MEMBER">멤버</option>
                    <option value="OWNER">오너</option>
                    <option value="ADMIN">관리자</option>
                    <option value="SUPER_ADMIN">수퍼어드민</option>
                  </select>
                </label>
                <label>
                  유닛 역할
                  <select value={inviteUnitRole} onChange={(event) => setInviteUnitRole(event.target.value as UnitMemberRole)} disabled={!canInvite || !unit}>
                    <option value="OWNER">오너</option>
                    <option value="MEMBER">멤버</option>
                  </select>
                </label>
                <div className="row-actions">
                  <button type="button" className="button secondary" onClick={() => setInviteOpen(false)}>취소</button>
                  <button className="button primary" disabled={!canInvite || !unit || inviteBusy || !inviteEmail.trim()}>
                    {inviteBusy ? "초대 생성 중..." : "초대 생성"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <PanelHeader title="유닛 기본 승인정책" />
        <form className="approval-policy-form" onSubmit={saveUnitDefaultPolicy}>
          <div className="policy-basic-grid">
            <label>
              기본 정책
              <select value={defaultApprovalPolicyId} onChange={(event) => setDefaultApprovalPolicyId(event.target.value)} disabled={!unit}>
                <option value="">없음 (태스크별 선택)</option>
                {availableUnitPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.unitId ? `[유닛] ${policy.name}` : `[전역] ${policy.name}`} ({policy.mode})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-actions left">
            <button type="button" className="button secondary" onClick={() => onNavigate("/settings/approval-policies")}>
              전역 승인정책 관리로 이동
            </button>
          </div>
          <div className="policy-submit-row">
            <button className="button primary" disabled={!unit || unitPolicyBusy}>
              {unitPolicyBusy ? "저장 중..." : "유닛 기본정책 저장"}
            </button>
          </div>
        </form>
        <form className="approval-policy-form" onSubmit={createUnitCustomPolicy}>
          <div className="policy-basic-grid">
            <label>
              커스텀 정책 이름
              <input value={customPolicyName} onChange={(event) => setCustomPolicyName(event.target.value)} placeholder="예: 제품출시 유닛 빠른승인" disabled={!unit} />
            </label>
            <label>
              정책 모드
              <select value={customPolicyMode} onChange={(event) => setCustomPolicyMode(event.target.value as ApprovalPolicy["mode"])} disabled={!unit}>
                <option value="SINGLE">단일</option>
                <option value="PARALLEL">병렬</option>
                <option value="CONSENSUS">합의</option>
              </select>
            </label>
          </div>
          <div className="policy-submit-row">
            <button className="button secondary" disabled={!unit || unitPolicyBusy || !customPolicyName.trim()}>
              {unitPolicyBusy ? "생성 중..." : "유닛 커스텀 정책 생성"}
            </button>
          </div>
        </form>
        {unitPolicyMessage && <div className="inline-error">{unitPolicyMessage}</div>}
      </section>
      <section className="panel">
        <PanelHeader title="유닛 알림 설정" />
        <form className="approval-policy-form" onSubmit={saveUnitNotifications}>
          <div className="policy-basic-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={unitNotificationConfig.mentionEnabled}
                onChange={(event) => setUnitNotificationConfig((prev) => ({ ...prev, mentionEnabled: event.target.checked }))}
                disabled={!unit}
              />
              멘션 알림
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={unitNotificationConfig.approvalRequestEnabled}
                onChange={(event) => setUnitNotificationConfig((prev) => ({ ...prev, approvalRequestEnabled: event.target.checked }))}
                disabled={!unit}
              />
              승인 요청 알림
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={unitNotificationConfig.dueSoonEnabled}
                onChange={(event) => setUnitNotificationConfig((prev) => ({ ...prev, dueSoonEnabled: event.target.checked }))}
                disabled={!unit}
              />
              마감 임박 알림
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={unitNotificationConfig.digestEnabled}
                onChange={(event) => setUnitNotificationConfig((prev) => ({ ...prev, digestEnabled: event.target.checked }))}
                disabled={!unit}
              />
              하루 한 번 요약 알림
            </label>
          </div>
          <div className="policy-submit-row">
            <button className="button primary" disabled={!unit || unitNotificationBusy}>
              {unitNotificationBusy ? "저장 중..." : "유닛 알림 설정 저장"}
            </button>
          </div>
        </form>
        {unitNotificationMessage && <div className="inline-error">{unitNotificationMessage}</div>}
      </section>
    </section>
  );
}

export function GlobalApprovalPolicySettingsView({
  approvalPolicies,
  members,
  units,
  onReload
}: {
  approvalPolicies: ApprovalPolicy[];
  members: Member[];
  units: Unit[];
  onReload: () => Promise<void>;
}) {
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string>("");
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [policyMode, setPolicyMode] = useState<ApprovalPolicy["mode"]>("PARALLEL");
  const [policyUnitId, setPolicyUnitId] = useState<string>("");
  const [scopeFilter, setScopeFilter] = useState<"ALL" | "GLOBAL" | "UNIT">("ALL");
  const [policyLines, setPolicyLines] = useState<Array<{ id: string; type: "CONSENSUS" | "APPROVAL"; participantIds: string[]; minApprovals: number }>>([
    { id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }
  ]);
  const [finalApproverId, setFinalApproverId] = useState("");
  const resetPolicyForm = () => {
    setEditingPolicyId("");
    setPolicyName("");
    setPolicyDescription("");
    setPolicyEnabled(true);
    setPolicyMode("PARALLEL");
    setPolicyUnitId("");
    setPolicyLines([{ id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }]);
    setFinalApproverId("");
  };
  const loadPolicy = (policyId: string) => {
    setEditingPolicyId(policyId);
    const policy = approvalPolicies.find((row) => row.id === policyId);
    if (!policy) return;
    setPolicyName(policy.name);
    setPolicyDescription(policy.description ?? "");
    setPolicyEnabled(policy.enabled);
    setPolicyMode(policy.mode);
    setPolicyUnitId(policy.unitId ?? "");
    setPolicyLines((policy.approvalLines ?? []).length
      ? (policy.approvalLines ?? []).map((line) => ({ id: line.id, type: line.type, participantIds: line.participantIds, minApprovals: line.minApprovals }))
      : [{ id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }]);
    setFinalApproverId(policy.finalApproverId ?? "");
  };
  const onLineParticipants = (lineId: string, target: HTMLSelectElement) => {
    const values = Array.from(target.selectedOptions).map((option) => option.value);
    setPolicyLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, participantIds: values } : line)));
  };
  const savePolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!policyName.trim()) return;
    if (policyLines.some((line) => line.participantIds.length === 0)) {
      setPolicyMessage("모든 결재라인에 참여자를 최소 1명 이상 선택해주세요.");
      return;
    }
    try {
      setPolicyBusy(true);
      setPolicyMessage(null);
      const payload = {
        name: policyName.trim(),
        description: policyDescription.trim() || undefined,
        unitId: policyUnitId || null,
        enabled: policyEnabled,
        mode: policyMode,
        approverType: "MEMBER",
        approverIds: [...new Set(policyLines.flatMap((line) => line.participantIds))],
        minApprovals: Math.max(...policyLines.map((line) => line.minApprovals)),
        approvalLines: policyLines.map((line) => ({
          id: line.id,
          type: line.type,
          participantIds: line.participantIds,
          minApprovals: line.minApprovals
        })),
        finalApproverId: finalApproverId || null
      };
      if (editingPolicyId) {
        await request(`/api/admin/approval-policies/${editingPolicyId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setPolicyMessage("승인정책이 수정되었습니다.");
      } else {
        await request("/api/admin/approval-policies", { method: "POST", body: JSON.stringify(payload) });
        setPolicyMessage("승인정책이 생성되었습니다.");
      }
      await onReload();
      resetPolicyForm();
    } catch (err) {
      setPolicyMessage(err instanceof Error ? err.message : "승인정책 저장에 실패했습니다.");
    } finally {
      setPolicyBusy(false);
    }
  };
  const visiblePolicies = approvalPolicies.filter((policy) => {
    if (scopeFilter === "GLOBAL") return !policy.unitId;
    if (scopeFilter === "UNIT") return Boolean(policy.unitId);
    return true;
  });
  const unitNameById = new Map(units.map((unit) => [unit.id, unit.name]));
  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="전역 승인정책" />
      <section className="panel">
        <PanelHeader title="승인정책 라이브러리 (크로스 유닛 공통)" />
        <div className="policy-toolbar">
          <label className="policy-toolbar-field">
            <small>정책 선택</small>
            <select value={editingPolicyId} onChange={(event) => (event.target.value ? loadPolicy(event.target.value) : resetPolicyForm())}>
              <option value="">새 정책 작성</option>
              {visiblePolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.unitId ? `[유닛:${unitNameById.get(policy.unitId) ?? "미지정"}] ${policy.name}` : `[전역] ${policy.name}`}
                </option>
              ))}
            </select>
          </label>
          <label className="policy-toolbar-field">
            <small>스코프 필터</small>
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "ALL" | "GLOBAL" | "UNIT")}>
              <option value="ALL">전체</option>
              <option value="GLOBAL">전역 정책</option>
              <option value="UNIT">유닛 정책</option>
            </select>
          </label>
          <button type="button" className="button secondary" onClick={resetPolicyForm}>초기화</button>
          <button type="button" className="button secondary" onClick={() => setPolicyLines((prev) => [...prev, { id: `line-${crypto.randomUUID()}`, type: "CONSENSUS", participantIds: [], minApprovals: 1 }])}>
            결재라인 추가
          </button>
        </div>
        <form className="approval-policy-form" onSubmit={savePolicy}>
          <div className="policy-basic-grid">
            <label>
              정책 이름
              <input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="예: 크로스 유닛 병렬합의" />
            </label>
            <label>
              설명
              <input value={policyDescription} onChange={(event) => setPolicyDescription(event.target.value)} placeholder="정책 설명" />
            </label>
            <label>
              정책 스코프
              <select value={policyUnitId} onChange={(event) => setPolicyUnitId(event.target.value)}>
                <option value="">전역</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="policy-meta-row">
            <label>
              정책 모드
              <select value={policyMode} onChange={(event) => setPolicyMode(event.target.value as ApprovalPolicy["mode"])}>
                <option value="PARALLEL">병렬</option>
                <option value="CONSENSUS">합의</option>
                <option value="SINGLE">단일</option>
              </select>
            </label>
            <label>
              최종결정권자
              <select value={finalApproverId} onChange={(event) => setFinalApproverId(event.target.value)}>
                <option value="">미지정</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.name} ({roleLabel[member.role]})</option>
                ))}
              </select>
            </label>
            <label className="toggle-field">
              <input type="checkbox" checked={policyEnabled} onChange={(event) => setPolicyEnabled(event.target.checked)} />
              <span>활성 정책</span>
            </label>
          </div>
          <div className="policy-lines">
            {policyLines.map((line, index) => (
              <div key={line.id} className="policy-line-card">
                <div className="policy-line-head">
                  <strong>결재라인 {index + 1}</strong>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPolicyLines((prev) => prev.filter((row) => row.id !== line.id))}
                    disabled={policyLines.length <= 1}
                  >
                    라인 삭제
                  </button>
                </div>
                <div className="policy-line-grid">
                  <label>
                    타입
                    <select
                      value={line.type}
                      onChange={(event) => setPolicyLines((prev) => prev.map((row) => (row.id === line.id ? { ...row, type: event.target.value as ApprovalLine["type"] } : row)))}
                    >
                      <option value="CONSENSUS">합의</option>
                      <option value="APPROVAL">승인</option>
                    </select>
                  </label>
                  <label>
                    최소 승인 수
                    <input
                      type="number"
                      min={1}
                      value={line.minApprovals}
                      onChange={(event) => setPolicyLines((prev) => prev.map((row) => (row.id === line.id ? { ...row, minApprovals: Number(event.target.value) || 1 } : row)))}
                    />
                  </label>
                </div>
                <label>
                  참여자(다중 선택)
                  <select multiple value={line.participantIds} onChange={(event) => onLineParticipants(line.id, event.target)}>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({roleLabel[member.role]})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="policy-submit-row">
            <button className="button secondary" type="button" onClick={resetPolicyForm}>취소</button>
            <button className="button primary" disabled={policyBusy || !policyName.trim()}>
              {policyBusy ? "저장 중..." : editingPolicyId ? "승인정책 수정" : "승인정책 생성"}
            </button>
          </div>
        </form>
        {policyMessage && <div className="inline-error">{policyMessage}</div>}
      </section>
    </section>
  );
}

export function NotificationSettingsView() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    void request<NotificationSettings>("/api/settings/notifications").then(setSettings);
    if (typeof window !== "undefined" && "Notification" in window) setPushPermission(Notification.permission);
    else setPushPermission("unsupported");
  }, []);

  const patch = (partial: Partial<NotificationSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setSaved(null);
  };

  const toggleMuteComponent = (component: InboxComponent) => {
    if (!settings) return;
    const has = settings.mutedComponents.includes(component);
    patch({
      mutedComponents: has
        ? settings.mutedComponents.filter((row) => row !== component)
        : [...settings.mutedComponents, component]
    });
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const next = await request<NotificationSettings>("/api/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify({
          emailEnabled: settings.emailEnabled,
          pushEnabled: settings.pushEnabled,
          webPushEnabled: settings.webPushEnabled,
          digestEnabled: settings.digestEnabled,
          mutedComponents: settings.mutedComponents,
          mentionOnlyForWatchers: settings.mentionOnlyForWatchers,
          slaHours: settings.slaHours
        })
      });
      if (next.webPushEnabled) await syncBrowserPushSubscription();
      else await request("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({}) });
      setSettings(next);
      setSaved("저장되었습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <section className="panel"><p className="muted">불러오는 중...</p></section>;

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  };

  const syncBrowserPushSubscription = async () => {
    setPushError(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushError("이 브라우저는 웹 푸시를 지원하지 않습니다.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") {
      setPushError("브라우저 알림 권한이 필요합니다.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!vapidPublicKey) {
        setPushError("VITE_WEB_PUSH_PUBLIC_KEY 설정이 필요합니다.");
        return;
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      setPushError("푸시 구독 정보가 올바르지 않습니다.");
      return;
    }
    await request("/api/push/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent
      })
    });
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="설정" title="알림 설정" />
      <section className="panel">
        <PanelHeader title="수신 채널" action={<button className="button primary" onClick={() => void save()} disabled={busy}>저장</button>} />
        <div className="stack">
          <label className="toggle-field"><input type="checkbox" checked={settings.pushEnabled} onChange={(event) => patch({ pushEnabled: event.target.checked })} />앱 내 알림 받기</label>
          <div className="meta-row">
            <strong>웹 푸시(브라우저)</strong>
            <div className="row-actions left">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={settings.webPushEnabled}
                  onChange={(event) => patch({ webPushEnabled: event.target.checked })}
                />
                브라우저 푸시 받기
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() => void syncBrowserPushSubscription()}
                disabled={pushPermission === "unsupported"}
              >
                {pushPermission === "granted" ? "브라우저 푸시 연결 갱신" : pushPermission === "denied" ? "브라우저 권한 차단됨" : pushPermission === "unsupported" ? "브라우저 미지원" : "브라우저 푸시 연결"}
              </button>
            </div>
          </div>
          {pushError && <p className="form-error">{pushError}</p>}
          <label className="toggle-field"><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => patch({ emailEnabled: event.target.checked })} />이메일 알림 받기</label>
          <label className="toggle-field"><input type="checkbox" checked={settings.digestEnabled} onChange={(event) => patch({ digestEnabled: event.target.checked })} />하루 한 번 요약 알림 받기</label>
          <label className="toggle-field"><input type="checkbox" checked={settings.mentionOnlyForWatchers} onChange={(event) => patch({ mentionOnlyForWatchers: event.target.checked })} />내가 관여한 태스크 멘션만 우선 수신</label>
          <label className="meta-row">
            <strong>SLA 응답 시간(시간)</strong>
            <input
              type="number"
              min={1}
              max={168}
              value={settings.slaHours}
              onChange={(event) => patch({ slaHours: Math.min(168, Math.max(1, Number(event.target.value) || 24)) })}
            />
          </label>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="뮤트할 알림 분류" />
        <div className="stack">
          {INBOX_COMPONENTS.map((component) => (
            <label key={component.value} className="toggle-field">
              <input
                type="checkbox"
                checked={!settings.mutedComponents.includes(component.value)}
                onChange={() => toggleMuteComponent(component.value)}
              />
              {component.label}
            </label>
          ))}
        </div>
        {saved && <p className="muted">{saved}</p>}
      </section>
    </section>
  );
}

export function TemplatesView({
  templates,
  workflowStatuses,
  onReload
}: {
  templates: Template[];
  workflowStatuses: AppData["workflowStatuses"];
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("TASK");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusJson, setStatusJson] = useState(() => JSON.stringify(workflowStatuses, null, 2));

  useEffect(() => {
    setStatusJson(JSON.stringify(workflowStatuses, null, 2));
  }, [workflowStatuses]);

  const createTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request("/api/templates", { method: "POST", body: JSON.stringify({ name, type, enabled }) });
      setName("");
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 생성 실패", "새 템플릿이 추가되지 않았습니다", "권한과 입력값을 확인한 뒤 다시 생성하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <PageHeader eyebrow="템플릿" title="템플릿 센터" />
      <section className="panel">
        <PanelHeader title="운영 가이드" />
        <p className="muted">
          자유폼 태스크로 시작한 뒤 템플릿을 적용하거나, 현재 폼을 템플릿으로 저장해 재사용할 수 있습니다.
          템플릿은 기본 양식 필드셋과 워크플로우를 함께 정의합니다.
        </p>
      </section>
      <section className="panel">
        <PanelHeader title="전역 상태 라이브러리" />
        <p className="muted">템플릿 공통 상태 사전입니다. 각 템플릿 전이는 여기 정의된 status id를 참조합니다.</p>
        <textarea className="code-textarea" value={statusJson} onChange={(event) => setStatusJson(event.target.value)} rows={8} />
        <div className="row-actions">
          <button
            className="button secondary"
            onClick={async () => {
              try {
                setError(null);
                const parsed = JSON.parse(statusJson);
                await request("/api/workflow/statuses", { method: "PATCH", body: JSON.stringify({ statuses: parsed }) });
                await onReload();
              } catch (err) {
                setError(err instanceof Error ? err.message : "전역 상태 저장에 실패했습니다.");
              }
            }}
          >
            전역 상태 저장
          </button>
        </div>
      </section>
      <form className="create-card template-create" onSubmit={createTemplate}>
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="템플릿 이름" />
        <Select label="유형" value={type} onChange={(value) => setType(value as TemplateType)} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
        <label className="toggle-row">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          활성화
        </label>
        <button className="button primary" disabled={busy || !name.trim()}>생성</button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      <div className="template-grid">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} workflowStatuses={workflowStatuses} onReload={onReload} />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  workflowStatuses,
  onReload
}: {
  template: Template;
  workflowStatuses: AppData["workflowStatuses"];
  onReload: () => Promise<void>;
}) {
  const normalizeWorkflowSchemaDraft = (raw: unknown) => {
    const input = raw as {
      statuses?: Array<{ id: string; name: string; category: string; isDefault?: boolean }>;
      transitions?: Array<{
        fromStatusId: string;
        toStatusId: string;
        label: string;
        decisionType: DecisionType;
        isDecision: boolean;
        onEnter?: Record<string, unknown>;
        onExit?: { approvalGate?: { enabled: boolean; policyId?: string | null } };
      }>;
    };
    const statuses = (input.statuses ?? workflowStatuses).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      category: row.category as "OPEN" | "IN_PROGRESS" | "PENDING_APPROVAL" | "DONE" | "CANCELED",
      isDefault: Boolean(row.isDefault)
    }));
    const transitions = (input.transitions ?? []).map((row) => ({
      fromStatusId: String(row.fromStatusId),
      toStatusId: String(row.toStatusId),
      label: String(row.label),
      decisionType: row.decisionType,
      isDecision: Boolean(row.isDecision),
      onEnter: row.onEnter ?? {},
      onExit: {
        ...(row.onExit ?? {}),
        approvalGate: {
          enabled: Boolean(row.onExit?.approvalGate?.enabled),
          policyId: row.onExit?.approvalGate?.policyId ?? null
        }
      }
    }));
    return { statuses, transitions };
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: template.name, type: template.type, enabled: template.enabled });
  const [workflowJson, setWorkflowJson] = useState(() =>
    JSON.stringify(template.workflowSchema ?? {
      statuses: workflowStatuses,
      transitions: template.workflow.map((rule) => ({
        fromStatusId: LEGACY_STATE_TO_STATUS_ID[rule.from],
        toStatusId: LEGACY_STATE_TO_STATUS_ID[rule.to],
        label: rule.label,
        decisionType: rule.decisionType,
        isDecision: rule.isDecision,
        onEnter: {},
        onExit: {
          approvalGate: {
            enabled: rule.isDecision,
            policyId: null
          }
        }
      }))
    }, null, 2)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ name: template.name, type: template.type, enabled: template.enabled });
    setWorkflowJson(JSON.stringify(template.workflowSchema ?? {
      statuses: workflowStatuses,
      transitions: template.workflow.map((rule) => ({
        fromStatusId: LEGACY_STATE_TO_STATUS_ID[rule.from],
        toStatusId: LEGACY_STATE_TO_STATUS_ID[rule.to],
        label: rule.label,
        decisionType: rule.decisionType,
        isDecision: rule.isDecision,
        onEnter: {},
        onExit: {
          approvalGate: {
            enabled: rule.isDecision,
            policyId: null
          }
        }
      }))
    }, null, 2));
  }, [template.enabled, template.name, template.type, template.workflow, template.workflowSchema, workflowStatuses]);

  const save = async () => {
    if (!draft.name.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/templates/${template.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      setEditing(false);
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 저장 실패", "템플릿 변경사항이 반영되지 않았습니다", "편집자 이상 권한과 입력값을 확인한 뒤 다시 저장하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("이 템플릿을 삭제할까요? 사용 중이면 비활성화로 처리됩니다.")) return;
    try {
      setBusy(true);
      setError(null);
      await request(`/api/templates/${template.id}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("템플릿 삭제 실패", "템플릿이 그대로 유지됩니다", "관리자 권한과 대상 상태를 확인한 뒤 다시 삭제하세요")
      );
    } finally {
      setBusy(false);
    }
  };

  const saveWorkflow = async () => {
    try {
      setBusy(true);
      setError(null);
      const parsed = JSON.parse(workflowJson);
      const normalized = normalizeWorkflowSchemaDraft(parsed);
      await request(`/api/templates/${template.id}/workflow`, { method: "PATCH", body: JSON.stringify(normalized) });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "워크플로우 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel">
      <PanelHeader
        title={template.name}
        action={<Badge tone={template.enabled ? "green" : "slate"}>{template.enabled ? "활성" : "비활성"} · v{template.version}</Badge>}
      />
      {error && <p className="form-error">{error}</p>}
      {editing ? (
        <div className="template-editor">
          <input value={draft.name} maxLength={120} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          <Select label="유형" value={draft.type} onChange={(value) => setDraft((prev) => ({ ...prev, type: value as TemplateType }))} options={templateTypes.filter((value) => value !== "ALL").map((value) => [value, TEMPLATE_META[value].label])} />
          <label className="toggle-row">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
            활성화
          </label>
          <label>
            워크플로우(JSON, 고급 설정)
            <textarea className="code-textarea" rows={10} value={workflowJson} onChange={(event) => setWorkflowJson(event.target.value)} />
          </label>
          <p className="muted">전이는 `onExit.approvalGate.enabled/policyId` 기준으로 승인 게이트를 설정합니다.</p>
          <div className="row-actions">
            <button className="button secondary" disabled={busy} onClick={() => setEditing(false)}>취소</button>
            <button className="button secondary" disabled={busy} onClick={() => void saveWorkflow()}>워크플로우 저장</button>
            <button className="button primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>저장</button>
          </div>
        </div>
      ) : (
        <>
          <div className="template-summary">
            <Badge tone={TEMPLATE_META[template.type].tone}>{TEMPLATE_META[template.type].label}</Badge>
            <div className="row-actions left">
              <button className="text-button" disabled={busy} onClick={() => setEditing(true)}>수정</button>
              <button className="text-button danger-text" disabled={busy} onClick={() => void remove()}>삭제</button>
            </div>
          </div>
          <div className="workflow-list">
            {(template.workflowSchema?.transitions ?? []).map((rule) => (
              <div key={`${rule.fromStatusId}-${rule.toStatusId}-${rule.decisionType}`}>
                <span>{rule.fromStatusId}</span>
                <strong>{rule.label}</strong>
                <span>{rule.toStatusId}</span>
                {rule.isDecision && <Badge tone="amber">{decisionLabel[rule.decisionType]}</Badge>}
                {rule.onExit?.approvalGate?.enabled && (
                  <Badge tone={rule.onExit.approvalGate.policyId ? "blue" : "red"}>
                    {rule.onExit.approvalGate.policyId ? "승인게이트(정책연결)" : "승인게이트(정책미지정)"}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

export function MembersView({ members, onReload, embedded = false }: { members: Member[]; onReload: () => Promise<void>; embedded?: boolean }) {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const result = await request<{ inviteUrl: string }>("/api/admin/invitations", { method: "POST", body: JSON.stringify({ email, role: "MEMBER" }) });
    setInviteUrl(result.inviteUrl);
    setEmail("");
    await onReload();
  };

  const changeRole = async (memberId: string, nextRole: Role) => {
    try {
      setError(null);
      await request(`/api/admin/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("역할 변경 실패", "멤버 역할이 변경되지 않았습니다", "권한과 대상 멤버 상태를 확인한 뒤 다시 시도하세요")
      );
    }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`${member.name} 멤버를 제거할까요? 연결된 담당자/참관자와 알림도 정리됩니다.`)) return;
    try {
      setError(null);
      await request(`/api/admin/members/${member.id}`, { method: "DELETE" });
      await onReload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formatFailure("멤버 제거 실패", "멤버가 그대로 유지됩니다", "관리자 권한과 대상 멤버 상태를 확인한 뒤 다시 시도하세요")
      );
    }
  };

  return (
    <section className="page-stack">
      {!embedded && <PageHeader eyebrow="관리" title="멤버와 역할" />}
      <form className="create-card" onSubmit={invite}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@company.com" />
        <button className="button primary">초대</button>
      </form>
      <p className="muted">전역 사용자 관리는 계정 생성/삭제 중심이며, 권한은 권한 정책/유닛 멤버십에서 부여합니다.</p>
      {inviteUrl && <div className="change-banner"><strong>초대 URL</strong><span>{inviteUrl}</span></div>}
      {error && <div className="inline-error">{error}</div>}
      <div className="task-table">
        {members.map((member) => (
	          <div className="task-row static" key={member.id}>
	            <div className="avatar">{member.name.slice(0, 1)}</div>
	            <strong>{member.name}</strong>
	            <span>{member.email}</span>
              <Badge tone="slate">사용자</Badge>
	            <div className="row-actions">
	              <button className="button danger" onClick={() => void removeMember(member)}>제거</button>
	            </div>
	          </div>
        ))}
      </div>
    </section>
  );
}
