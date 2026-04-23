const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID ?? "u-admin";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Demo-User-Id": DEMO_USER_ID,
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body.error ?? `Request failed: ${res.status}`;
    if (res.status === 403) {
      throw new Error(`권한 부족으로 처리할 수 없습니다. 현재 역할과 대상 범위를 확인한 뒤 다시 시도하세요. (${reason})`);
    }
    if (res.status === 429) {
      throw new Error("요청이 너무 많아 잠시 제한되었습니다. 1분 뒤 다시 시도하세요.");
    }
    if (res.status >= 500) {
      throw new Error(`서버 처리 중 문제가 발생했습니다. 작업 내용은 유지한 뒤 잠시 후 다시 시도하세요. (${reason})`);
    }
    throw new Error(`입력값을 확인해 주세요. ${reason}`);
  }

  return res.json();
}
