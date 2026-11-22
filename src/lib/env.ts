// Public values only. The publishable key is designed to ship to browsers; RLS is the security boundary.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bnpfmeczerxqlbcvilnd.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_illwinMztr1KFdE7gNgLfA_DsKtfZMC";
