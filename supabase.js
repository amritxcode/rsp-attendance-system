// ============================================================
// supabase.js
// Initialize Supabase Client
// ============================================================

// Replace these values with your actual Supabase URL and Anon Key
// from: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = "https://dzscqpzjzazzexinydfz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_93QrOZ5GT-5TjOH4YunO_w_1VhKlYu8";

if (typeof supabase === "undefined") {
  console.error(
    "Supabase SDK is not loaded. Ensure the CDN script is included in HTML.",
  );
}

const supabaseClient =
  typeof supabase !== "undefined"
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Expose globally to window object for access across index/admin scripts
window.supabase = supabaseClient;
