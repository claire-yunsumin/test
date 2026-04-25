/**
 * Explorer 사이드바는 Unit → Folder → List 구조를 표시합니다.
 * 팀즈의 팀/채널 UI는 IA 참고용이며, # 표기는 스레드의 노트 커맨드(#)와 겹치므로 쓰지 않습니다.
 */
export function WorkspaceUnitScopeIcon({ className, title = "유닛 범위" }: { className?: string; title?: string }) {
  return <span className={`channel-icon workspace-surface-icon workspace-surface-icon--unit ${className ?? ""}`.trim()} title={title} aria-hidden />;
}

export function WorkspaceListScopeIcon({ className, title = "리스트" }: { className?: string; title?: string }) {
  return <span className={`channel-icon workspace-surface-icon workspace-surface-icon--list ${className ?? ""}`.trim()} title={title} aria-hidden />;
}
