/**
 * Ownership predicates used by patient reads during the legacy-ID migration.
 * Existing legacy patient_id columns remain intact. A patient can see a row
 * only when its owner UUID matches or its legacy ID has an explicit mapping.
 */
export function ownershipPredicate({
  tableAlias,
  userParam = '$1',
  tenantParam = '$2',
  legacyColumn = 'patient_id',
}) {
  const qualifiedLegacyColumn = `${tableAlias}.${legacyColumn}`;
  return `(${tableAlias}.owner_user_id = ${userParam}
    OR EXISTS (
      SELECT 1
      FROM patient_identity_mappings pim
      WHERE pim.tenant_id = ${tenantParam}
        AND pim.user_id = ${userParam}
        AND pim.legacy_patient_id = ${qualifiedLegacyColumn}
    ))`;
}

export function requestedOwnershipPredicate({
  tableAlias,
  userParam = '$1',
  tenantParam = '$2',
  legacyParam = '$3',
  legacyColumn = 'patient_id',
}) {
  const qualifiedLegacyColumn = `${tableAlias}.${legacyColumn}`;
  return `(
    (${legacyParam} = ${userParam}::text AND ${tableAlias}.owner_user_id = ${userParam})
    OR (${qualifiedLegacyColumn} = ${legacyParam}
      AND EXISTS (
        SELECT 1 FROM patient_identity_mappings pim
        WHERE pim.tenant_id = ${tenantParam}
          AND pim.user_id = ${userParam}
          AND pim.legacy_patient_id = ${qualifiedLegacyColumn}
      ))
  )`;
}

export function rowVisibleToUser({ row, userId, role = 'patient', tenantId, mappings }) {
  if (!row || !userId || !tenantId) return false;
  if (role === 'admin') return true;
  if (row.owner_user_id && String(row.owner_user_id) === String(userId)) return true;
  return mappings.some((mapping) => (
    String(mapping.tenant_id) === String(tenantId)
    && String(mapping.user_id) === String(userId)
    && String(mapping.legacy_patient_id) === String(row.patient_id)
  ));
}

export function isUnmappedLegacyRow({ row, tenantId, mappings }) {
  if (!row || row.owner_user_id) return false;
  return !mappings.some((mapping) => (
    String(mapping.tenant_id) === String(tenantId)
    && String(mapping.legacy_patient_id) === String(row.patient_id)
  ));
}

export async function resolveLegacyPatientId({ db, tenantId, userId }) {
  const { rows } = await db.query(
    `SELECT legacy_patient_id
     FROM patient_identity_mappings
     WHERE tenant_id = $1 AND user_id = $2
     LIMIT 1`,
    [tenantId, userId],
  );
  return rows[0]?.legacy_patient_id || userId;
}

/**
 * Every legacy patient_id text that maps to this user, so an account erase can
 * also remove rows written before ownership columns existed (and never
 * back-filled). Returns the mapped legacy ids plus the user's own UUID as text,
 * de-duplicated, so a row matched by either path is caught.
 */
export async function legacyPatientIdsForUser({ db, tenantId, userId }) {
  const { rows } = await db.query(
    `SELECT legacy_patient_id
     FROM patient_identity_mappings
     WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  );
  const ids = new Set([String(userId)]);
  for (const row of rows) {
    if (row.legacy_patient_id) ids.add(String(row.legacy_patient_id));
  }
  return [...ids];
}