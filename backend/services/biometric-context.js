/**
 * Biometric context for AI chat.
 * Returns a lightweight prompt block from recent readings when available.
 * Safe no-op if tables/data are missing — must never crash boot or chat.
 */
import sql from '../db.js';

export async function getBiometricContext({
  tenantId,
  patientId,
  userId,
  hours = 24,
} = {}) {
  const empty = { promptBlock: '', readings: [] };
  if (!patientId || patientId === 'guest') return empty;

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    // Best-effort: schema varies across deploys; any failure returns empty context.
    const { rows } = await sql.query(
      `SELECT type, value, unit, created_at
       FROM readings
       WHERE (patient_id = $1 OR user_id = $1 OR owner_user_id = $1)
         AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 30`,
      [patientId, since],
    ).catch(() => ({ rows: [] }));

    if (!rows?.length) return empty;

    const lines = rows.map((r) => {
      const when = r.created_at ? new Date(r.created_at).toISOString() : '';
      return `- ${r.type}: ${r.value}${r.unit ? ` ${r.unit}` : ''} (${when})`;
    });

    return {
      promptBlock: `RECENT BIOMETRICS (last ${hours}h):\n${lines.join('\n')}`,
      readings: rows,
    };
  } catch (err) {
    console.error('getBiometricContext failed:', err?.message || err);
    return empty;
  }
}

export default { getBiometricContext };
