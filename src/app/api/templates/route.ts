import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(req: NextRequest) {
  const supabase = createRouteClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return unauthorized();
  const body = await req.json();

  const { name, org_id } = body;

  if (!name || !org_id) {
    return NextResponse.json(
      { error: "name and org_id are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({
      name,
      org_id,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(error, { status: 500 });
  }

  return NextResponse.json(data);
}
