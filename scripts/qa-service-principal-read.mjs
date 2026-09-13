#!/usr/bin/env node
// Non-browser, read-only contract check for the TOM QA service principal.
// This deliberately uses the public client key plus the service principal's
// protected password, never the service-role key, and performs only the
// explicitly approved directory-read contract.
import { createClient } from "@supabase/supabase-js";

const QA_PROJECT_REF = "qfpxvumcrnzrjyvqkicq";
const QA_PROJECT_URL = `https://${QA_PROJECT_REF}.supabase.co`;
const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const email = process.env.QA_TOM_SERVICE_PRINCIPAL_EMAIL ?? "";
const password = process.env.QA_TOM_SERVICE_PRINCIPAL_PASSWORD ?? "";

if (supabaseUrl !== QA_PROJECT_URL) {
  throw new Error(`qa-service-principal-read: refusing non-QA target "${supabaseUrl || "(unset)"}"`);
}
if (!publishableKey || !email || !password) {
  throw new Error("qa-service-principal-read: QA URL, publishable key, email, and password are required");
}

const client = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
if (authError || !authData.user) throw new Error(`service principal sign-in failed: ${authError?.message ?? "no user"}`);

const { data: rows, error: readError } = await client.from("tenants").select("id").limit(1);
if (readError) throw new Error(`service principal directory read failed: ${readError.message}`);
if (!Array.isArray(rows)) throw new Error("service principal directory read returned a non-array result");

console.log(`qa-service-principal-read: authenticated non-browser read passed (rows=${rows.length})`);
await client.auth.signOut();
