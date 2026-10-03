import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const email = process.env.DEMO_USER_EMAIL;
const password = process.env.DEMO_USER_PASSWORD;

if (!url || !publishableKey || !secretKey || !email || !password) {
  throw new Error("Set Supabase URL/keys and DEMO_USER_EMAIL/PASSWORD in .env.local");
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findDemoUser() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < 100) return null;
  }
}

const existing = await findDemoUser();
const attributes = {
  password,
  email_confirm: true,
  user_metadata: { business_name: "Sharma Medical" },
};
const result = existing
  ? await admin.auth.admin.updateUserById(existing.id, attributes)
  : await admin.auth.admin.createUser({ email, ...attributes });

if (result.error || !result.data.user) {
  throw result.error ?? new Error("Demo user provisioning failed");
}

const { error: profileError } = await admin.from("profiles").upsert({
  id: result.data.user.id,
  business_name: "Sharma Medical",
});
if (profileError) throw profileError;

const browserAuth = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: loginError } = await browserAuth.auth.signInWithPassword({
  email,
  password,
});
if (loginError) throw loginError;

console.log(`Demo sign-in verified for ${email}`);
