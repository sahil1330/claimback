import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const demoEmail = process.env.DEMO_USER_EMAIL;
const demoPassword = process.env.DEMO_USER_PASSWORD;
if (!url || !publishableKey || !secretKey || !demoEmail || !demoPassword) {
  throw new Error("Set Supabase URL/keys and demo credentials in .env.local");
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const demo = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const outsider = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: demoAuth, error: demoAuthError } = await demo.auth.signInWithPassword({
  email: demoEmail,
  password: demoPassword,
});
if (demoAuthError || !demoAuth.user) {
  throw demoAuthError ?? new Error("Demo sign-in failed");
}

const disposableEmail = `rls-check-${randomUUID()}@example.com`;
const disposablePassword = randomBytes(24).toString("base64url");
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: disposableEmail,
  password: disposablePassword,
  email_confirm: true,
});
if (createError || !created.user) {
  throw createError ?? new Error("Disposable user creation failed");
}

let testCaseId;
let testObjectPath;
try {
  const { error: outsiderAuthError } = await outsider.auth.signInWithPassword({
    email: disposableEmail,
    password: disposablePassword,
  });
  if (outsiderAuthError) throw outsiderAuthError;

  const { data: testCase, error: insertError } = await demo
    .from("cases")
    .insert({ user_id: demoAuth.user.id, title: "A1 disposable RLS check" })
    .select("id, status, recovered_paise")
    .single();
  if (insertError || !testCase) {
    throw insertError ?? new Error("Test case insert failed");
  }
  testCaseId = testCase.id;
  assert.equal(testCase.status, "DRAFT");
  assert.equal(testCase.recovered_paise, 0);

  const { data: foreignCases, error: readError } = await outsider
    .from("cases")
    .select("id")
    .eq("id", testCaseId);
  if (readError) throw readError;
  assert.equal(foreignCases.length, 0, "Another merchant can read the case");

  const { data: foreignProfiles, error: profileReadError } = await outsider
    .from("profiles")
    .select("id")
    .eq("id", demoAuth.user.id);
  if (profileReadError) throw profileReadError;
  assert.equal(foreignProfiles.length, 0, "Another merchant can read the profile");

  const { error: moneyError } = await demo
    .from("cases")
    .update({ recovered_paise: 1 })
    .eq("id", testCaseId);
  assert.ok(moneyError, "Browser client can change verified money");

  testObjectPath = `${demoAuth.user.id}/${testCaseId}/${randomUUID()}-proof.txt`;
  const sample = new Blob(["ClaimBack RLS check"], { type: "text/plain" });
  const { error: ownUploadError } = await demo.storage
    .from("claimback-evidence")
    .upload(testObjectPath, sample, { contentType: "text/plain", upsert: false });
  if (ownUploadError) throw ownUploadError;

  const { error: ownDownloadError } = await demo.storage
    .from("claimback-evidence")
    .download(testObjectPath);
  if (ownDownloadError) throw ownDownloadError;

  const { error: foreignDownloadError } = await outsider.storage
    .from("claimback-evidence")
    .download(testObjectPath);
  assert.ok(foreignDownloadError, "Another merchant can read the evidence");

  const foreignPath = `${created.user.id}/${testCaseId}/${randomUUID()}-forged.txt`;
  const { error: foreignUploadError } = await outsider.storage
    .from("claimback-evidence")
    .upload(foreignPath, sample, { contentType: "text/plain", upsert: false });
  assert.ok(foreignUploadError, "Another merchant can write into the case folder");

  console.log("Live A1 checks passed: case/profile RLS, protected money, evidence isolation");
} finally {
  if (testObjectPath) {
    const { error } = await admin.storage.from("claimback-evidence").remove([testObjectPath]);
    if (error) {
      console.error("Could not remove disposable evidence:", error.message);
      process.exitCode = 1;
    }
  }
  if (testCaseId) {
    const { error } = await admin.from("cases").delete().eq("id", testCaseId);
    if (error) {
      console.error("Could not remove disposable case:", error.message);
      process.exitCode = 1;
    }
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
  if (deleteError) {
    console.error("Could not remove disposable user:", deleteError.message);
    process.exitCode = 1;
  }
}
