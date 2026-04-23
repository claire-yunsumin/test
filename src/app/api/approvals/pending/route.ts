import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: NextRequest) {
  const supabase = createRouteClient();

  // 🔐 세션 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("task_id");

  if (!taskId) {
    return NextResponse.json(
      { error: "task_id is required" },
      { status: 400 }
    );
  }

  // 🔥 자기 org 확인
  const { data: membership } = await supabase
    .from("org_members")  
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return unauthorized();

  const orgId = membership.org_id;

  // 🔥 task가 자기 org 소속인지 확인
  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("org_id", orgId)
    .single();

  if (!task) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 🔥 승인 대기 조회
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("task_id", taskId)
    .eq("status", "PENDING");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
