import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(req: NextRequest) {
  const supabase = createRouteClient();

  // 1️⃣ 세션 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const body = await req.json();
  const { title } = body;

  if (!title || title.trim().length === 0) {
    return NextResponse.json(
      { error: "TITLE_REQUIRED" },
      { status: 400 }
    );
  }

  // 2️⃣ membership 기반 org 조회 (🔥 멀티테넌시 핵심)
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    console.error("MEMBERSHIP_ERROR", membershipError);
    return NextResponse.json(
      { error: "NO_ORG_MEMBERSHIP" },
      { status: 403 }
    );
  }

  const orgId = membership.org_id;
  const userId = user.id;

  // 3️⃣ org 스코프 기준 최신 published template_version 조회
  const { data: template, error: templateError } = await supabase
    .from("template_versions")
    .select("id, templates!inner(org_id)")
    .eq("templates.org_id", orgId)
    .not("published_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (templateError || !template) {
    console.error("TEMPLATE_FETCH_ERROR", templateError);
    return NextResponse.json(
      { error: "NO_TEMPLATE_VERSION_FOUND" },
      { status: 500 }
    );
  }

  console.log("template_version_id:", template.id);

  // 4️⃣ Atomic Task 생성
  const { data, error } = await supabase.rpc(
    "create_task_atomic",
    {
      p_org_id: orgId,
      p_template_version_id: template.id,
      p_title: title.trim(),
      p_created_by: userId,
    }
  );

  if (error) {
    console.error("CREATE_TASK_ERROR", error);
    return NextResponse.json(
      { error: "TASK_CREATION_FAILED" },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    task_id: row?.task_id,
    current_state: row?.current_state,
  });
}
