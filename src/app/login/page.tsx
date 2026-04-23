"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const message = searchParams.get("message");

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>로그인</h1>
      <p>계정에 로그인하세요</p>

      <form action={handleSubmit}>
        <div>
          <label>이메일</label>
          <br />
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <br />

        <div>
          <label>비밀번호</label>
          <br />
          <input
            name="password"
            type="password"
            required
          />
        </div>

        <div style={{ marginTop: 8 }}>
          <Link href="/forgot-password">
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        <br />

        {error && (
          <p style={{ color: "red" }}>{error}</p>
        )}

        {message === "check-email" && (
          <p style={{ color: "green" }}>
            확인 이메일을 발송했습니다. 링크를 클릭해 주세요.
          </p>
        )}

        <button type="submit">
          로그인
        </button>
      </form>

      <br />

      <p>
        계정이 없으신가요? <Link href="/signup">회원가입</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
