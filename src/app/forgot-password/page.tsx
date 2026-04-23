"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
});

    if (error) {
      setMessage("❌ 이메일 전송 실패: " + error.message);
    } else {
      setMessage("✅ 비밀번호 재설정 이메일을 확인해주세요.");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>🔐 비밀번호 찾기</h1>
      <p>가입한 이메일을 입력하세요.</p>

      <form onSubmit={handleResetRequest}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, width: 300 }}
        />
        <br /><br />

        <button type="submit" disabled={loading}>
          {loading ? "전송 중..." : "재설정 이메일 보내기"}
        </button>
      </form>

      {message && (
        <p style={{ marginTop: 20 }}>{message}</p>
      )}
    </div>
  );
}
