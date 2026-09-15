// Supabase project connection details.
// The anon key is safe to expose in client-side code — Row Level Security
// policies on the database (not this key) control what it's allowed to do.
const SUPABASE_URL = "https://smgzxdgmrxykfwpyzyea.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtZ3p4ZGdtcnh5a2Z3cHl6eWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0Mjk2OTEsImV4cCI6MjEwNTAwNTY5MX0.HSS42x8_K5lLpT_qFjtBtn-_AqL9btP_kvtIK53X-Zc";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = [
  { value: "games", label: "Video Games" },
  { value: "movies", label: "Movies" },
  { value: "music", label: "Music" },
  { value: "toys", label: "Toys" },
  { value: "comics", label: "Comics" },
  { value: "cards", label: "Sports Cards" },
];

function categoryLabel(value) {
  const match = CATEGORIES.find((c) => c.value === value);
  return match ? match.label : value;
}
