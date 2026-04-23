import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase.rpc("patch_task_fields", {
    p_task_id: params.taskId,
    p_user_id: user.id,
    p_fields: body,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status = data?.[0]?.result_status;
  if (status !== "OK") {
    return NextResponse.json({ error: status }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}