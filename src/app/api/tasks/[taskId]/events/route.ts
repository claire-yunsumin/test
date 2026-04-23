// src/app/api/tasks/[taskId]/events/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: { taskId: string } }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("task_events")
    .select("id, event_type, payload_json, created_at")
    .eq("task_id", params.taskId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}