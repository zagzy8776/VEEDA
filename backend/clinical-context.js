import sql from './db.js';

export async function getBiometricContext({ tenantId, patientId, userId = null, hours = 24 }) {
  if (!userId) {
    return {
      available: false,
      patientId,
      hours,
      summaries: [],
      promptBlock: `<biometric_context>{"available":false,"patientId":"${patientId}","hours":${hours},"reason":"Authenticated ownership context is required."}</biometric_context>`,
    };
  }

  const { rows } = await sql.query(
    `SELECT summary, window_start, window_end
     FROM clinical_summaries cs
     WHERE cs.tenant_id = $1
       AND (cs.owner_user_id = $2 OR EXISTS (
         SELECT 1 FROM patient_identity_mappings pim
         WHERE pim.tenant_id = $1
           AND pim.user_id = $2
           AND pim.legacy_patient_id = cs.patient_id
       ))
       AND cs.window_end >= NOW() - ($3 || ' hours')::interval
     ORDER BY cs.window_end DESC
     LIMIT 6`,
    [tenantId, userId, hours],
  );

  if (!rows.length) {
    return {
      available: false,
      patientId,
      hours,
      summaries: [],
      promptBlock: `<biometric_context>{"available":false,"patientId":"${patientId}","hours":${hours},"reason":"No synthesized biometric summaries available."}</biometric_context>`,
    };
  }

  const summaries = rows.map(row => row.summary);
  const context = {
    available: true,
    patientId,
    hours,
    windows: summaries.map(summary => ({
      window: summary.window,
      baselines: summary.baselines,
      variability: summary.variability,
      aggregates: summary.aggregates,
      anomalies: summary.anomalies,
      clinicalNarrative: summary.clinicalNarrative,
    })),
  };
  return {
    ...context,
    summaries,
    promptBlock: `<biometric_context>${JSON.stringify(context)}</biometric_context>`,
  };
}

export function clinicalChatReply({ message, vitals = {}, analysis = null, context }) {
  const m = String(message || '').toLowerCase();
  const news2 = analysis?.clinicalScores?.news2;
  const qsofa = analysis?.clinicalScores?.qsofa;
  const newsLine = news2
    ? `NEWS2 is ${news2.total}${news2.missing?.length ? ` with missing parameters: ${news2.missing.join(', ')}` : ''}. ${news2.urgency?.action || ''}`.trim()
    : 'NEWS2 is not available because the current observation set has not been scored.';
  const qsofaLine = qsofa
    ? `qSOFA is ${qsofa.total}${qsofa.sepsisRiskFlag ? ', meeting sepsis risk trigger criteria.' : '.'}`
    : 'qSOFA is not available.';
  const latestWindow = context?.summaries?.[0];
  const contextLine = latestWindow?.clinicalNarrative
    ? `Last synthesized biometric window: ${latestWindow.clinicalNarrative}`
    : 'No synthesized 24-hour biometric context is available.';

  if (m.includes('tired') || m.includes('fatigue') || m.includes('recovery')) {
    return `${newsLine}\n${qsofaLine}\n${contextLine}\nAssess fatigue against oxygenation trend, resting heart-rate baseline, respiratory trend, sleep record, and current NEWS2 escalation state.`;
  }
  if (m.includes('heart') || m.includes('pulse') || m.includes('bpm')) {
    const hr = vitals.heartRate ?? vitals.heart_rate;
    return `${newsLine}\nCurrent heart rate: ${hr ?? 'not recorded'} beats/min.\n${contextLine}`;
  }
  if (m.includes('spo2') || m.includes('oxygen') || m.includes('saturation')) {
    const spo2 = vitals.oxygen ?? vitals.oxygenSaturation;
    return `${newsLine}\nCurrent SpO2: ${spo2 ?? 'not recorded'}%.\n${contextLine}`;
  }
  if (m.includes('sepsis') || m.includes('infection')) {
    return `${qsofaLine}\nUse qSOFA as a risk flag, then assess against local sepsis pathway, lactate, infection source, blood pressure, mentation, and respiratory rate.`;
  }
  if (m.includes('news') || m.includes('score') || m.includes('risk')) {
    return `${newsLine}\n${qsofaLine}\n${contextLine}`;
  }
  return `${newsLine}\n${qsofaLine}\n${contextLine}`;
}
