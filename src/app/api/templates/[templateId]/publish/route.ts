import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

function normalizeWorkflow(workflow: any) {
    if (Array.isArray(workflow?.states) && typeof workflow.states[0] === "string") {
      const keys: string[] = workflow.states;
      workflow.states = keys.map((k, idx) => ({
        key: k,
        type: idx === 0 ? "INITIAL" : (idx === keys.length - 1 ? "TERMINAL" : "NORMAL"),
      }));
    }
    return workflow;
  }
  

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  try {
    const supabase = createRouteClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return unauthorized();

    // ✅ Next 16: params는 Promise
    const { templateId } = await context.params;

    const body = await req.json();
    const { form_schema, workflow, policy } = body;
    const workflowNormalized = normalizeWorkflow(workflow);


    if (!form_schema || !workflow) {
      return NextResponse.json(
        { error: "form_schema and workflow are required" },
        { status: 400 }
      );
    }

    // 1️⃣ 기존 최신 version 조회
    const { data: lastVersionRows, error: versionError } = await supabase
      .from("template_versions")
      .select("version")
      .eq("template_id", templateId)
      .order("version", { ascending: false })
      .limit(1);

    if (versionError) {
      console.error("Version fetch error:", versionError);
      return NextResponse.json({ error: versionError }, { status: 500 });
    }

    const newVersion =
      lastVersionRows && lastVersionRows.length > 0
        ? lastVersionRows[0].version + 1
        : 1;

    // 2️⃣ 새 version insert
    const { data, error } = await supabase
      .from("template_versions")
      .insert({
        template_id: templateId,
        version: newVersion,
        form_schema_json: form_schema,
        workflow_json: workflowNormalized,
        policy_json: policy ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    // 3️⃣ template 상태 업데이트
    await supabase
      .from("templates")
      .update({ status: "published" })
      .eq("id", templateId);

    return NextResponse.json(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
