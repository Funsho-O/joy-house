import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json({ error: "Missing Supabase configuration." }, { status: 500 });
  }

  const supabase = createClient(url, anon);
  const { data, error } = await supabase.rpc("run_birthday_celebrations");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return Response.json({ ok: true, result: data });
}
