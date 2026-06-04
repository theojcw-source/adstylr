import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("SUPABASE_URL ou SUPABASE_ANON_KEY non configuré");
}

export const supabase = createClient(url, key);
