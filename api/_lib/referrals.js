// Referral codes that make the domain free. Codes live in the REFERRAL_CODES env var
// (comma-separated, not case-sensitive), so new codes never need a code change.
export function referralIsValid(code) {
  const wanted = String(code || '').trim().toUpperCase();
  if (!wanted) return false;
  return (process.env.REFERRAL_CODES || '')
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
    .includes(wanted);
}
