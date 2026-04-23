import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function POST(
  req: NextRequest,
  { params }: { params: { approvalId: string } }
) {
  const supabase = createRouteClient();

  // 1️⃣ 세션 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const userId = user.id;
  const approvalId = params.approvalId;

  // 2️⃣ 유저 org 조회
  const { data: membership } = await supabase
    .from("memberships")  
    .select("org_id")
    .eq("user_id", userId)
    .single();

  if (!membership) return forbidden();

  const userOrgId = membership.org_id;

  // 3️⃣ approval → task → org 검증
  const { data: approval } = await supabase
    .from("approval_requests")
    .select("task_id")
    .eq("id", approvalId)
    .single();

  if (!approval) {
    return NextResponse.json(
      { error: "APPROVAL_NOT_FOUND" },
      { status: 404 }
    );
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("org_id")
    .eq("id", approval.task_id)
    .single();

  if (!task || task.org_id !== userOrgId) {
    return forbidden();
  }

  // 4️⃣ Atomic 승인 호출
  const { data, error } = await supabase.rpc(
    "approve_request_atomic",
    {
      p_approval_id: approvalId,
      p_actor_id: userId,
    }
  );

  if (error) {
    const msg = (error.message || "").toUpperCase();

    if (msg.includes("APPROVAL_NOT_FOUND")) {
      return NextResponse.json(
        { error: "APPROVAL_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (msg.includes("APPROVAL_ALREADY_PROCESSED")) {
      return NextResponse.json(
        { error: "APPROVAL_ALREADY_PROCESSED" },
        { status: 409 }
      );
    }

    if (msg.includes("INVALID_TASK_STATE")) {
      return NextResponse.json(
        { error: "INVALID_TASK_STATE" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "APPROVE_FAILED" },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    status: row?.result_status,
    approval_id: approvalId,
  });
}
