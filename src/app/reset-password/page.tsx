"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage("❌ 비밀번호 변경 실패: " + error.message);
    } else {
      setMessage("✅ 비밀번호가 변경되었습니다.");
      setTimeout(() => router.push("/login"), 1500);
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>🔑 비밀번호 재설정</h1>

      <form onSubmit={handleReset}>
        <input
          type="password"
          required
          placeholder="새 비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />
        <button type="submit" disabled={loading}>
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}
