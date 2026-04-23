import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("approval_requests")
    .select("id, status")
    .eq("task_id", params.taskId)
    .eq("status", "PENDING")
    .single();

  if (error || !data) {
    return NextResponse.json({ approval_id: null });
  }

  return NextResponse.json({
    approval_id: data.id,
  });
}
