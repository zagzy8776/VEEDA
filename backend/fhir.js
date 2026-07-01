export const UCUM_UNITS = {
  heart_rate: 'beats/min',
  breath_rate: '/min',
  respiratory: '/min',
  oxygen: '%',
  oxygen_saturation: '%',
  temperature: 'Cel',
  skin_temp: 'Cel',
  systolic_bp: 'mm[Hg]',
  hydration: 'L',
  sleep: 'h',
  steps: '{steps}',
};

export const LOINC = {
  heart_rate: { code: '8867-4', display: 'Heart rate' },
  breath_rate: { code: '9279-1', display: 'Respiratory rate' },
  respiratory: { code: '9279-1', display: 'Respiratory rate' },
  oxygen: { code: '2708-6', display: 'Oxygen saturation in Arterial blood' },
  oxygen_saturation: { code: '2708-6', display: 'Oxygen saturation in Arterial blood' },
  temperature: { code: '8310-5', display: 'Body temperature' },
  skin_temp: { code: '8310-5', display: 'Body temperature' },
  systolic_bp: { code: '8480-6', display: 'Systolic blood pressure' },
  hydration: { code: '41981-2', display: 'Fluid intake' },
  sleep: { code: '93832-4', display: 'Sleep duration' },
  steps: { code: '41950-7', display: 'Number of steps in 24 hour Measured' },
};

const TYPE_BY_LOINC = Object.fromEntries(Object.entries(LOINC).map(([type, coding]) => [coding.code, type]));

export function canonicalUnit(type, unit) {
  const expected = UCUM_UNITS[type];
  if (!expected) throw new Error(`Unsupported observation type: ${type}`);
  if (unit && unit !== expected) throw new Error(`Invalid UCUM unit for ${type}: expected ${expected}`);
  return expected;
}

// ── FHIR Patient Resource ─────────────────────────────────────────────────────
export function buildPatientResource(patientId, profile = {}) {
  const nameParts = (profile.name || patientId || '').split(' ');
  return {
    resourceType: 'Patient',
    id: patientId,
    identifier: [{
      system: 'https://veeda.local/fhir/identifiers',
      value: patientId,
    }],
    name: [{
      use: 'usual',
      family: nameParts.slice(1).join(' ') || 'Unknown',
      given: [nameParts[0] || patientId],
    }],
    gender: profile.sex || 'unknown',
    birthDate: profile.age ? `${new Date().getFullYear() - profile.age}-01-01` : undefined,
    telecom: [],
    managingOrganization: {
      reference: 'Organization/veda-default',
      display: 'VEDA Default Organization',
    },
    meta: {
      source: 'VEEDA',
      tag: [{ system: 'https://veeda.local/fhir/tags', code: 'phone-sensor' }],
    },
  };
}

// ── FHIR Practitioner Resource ────────────────────────────────────────────────
export function buildPractitionerResource(userId, role = 'unknown') {
  const roleLabel = { patient: 'Patient', nurse: 'Nurse', attending: 'Physician', system_admin: 'Administrator' };
  return {
    resourceType: 'Practitioner',
    id: userId || 'unknown',
    identifier: [{
      system: 'https://veeda.local/fhir/identifiers',
      value: userId || 'unknown',
    }],
    name: [{
      use: 'official',
      family: userId || 'Unknown',
      given: [roleLabel[role] || role],
    }],
    qualification: [{
      code: {
        coding: [{
          system: 'https://veeda.local/fhir/roles',
          code: role,
          display: roleLabel[role] || role,
        }],
      },
    }],
    meta: {
      source: 'VEEDA',
      tag: [{ system: 'https://veeda.local/fhir/tags', code: 'phone-sensor' }],
    },
  };
}

// ── FHIR Encounter Resource ───────────────────────────────────────────────────
export function buildEncounterResource(patientId, practitionerId, wardId = null) {
  const encounterId = `enc-${patientId}-${Date.now()}`;
  return {
    resourceType: 'Encounter',
    id: encounterId,
    status: 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    subject: { reference: `Patient/${patientId}` },
    participant: [{
      individual: { reference: `Practitioner/${practitionerId || 'unknown'}` },
    }],
    location: wardId ? [{
      location: {
        reference: `Location/${wardId}`,
        display: `Ward ${wardId}`,
      },
    }] : [],
    period: {
      start: new Date().toISOString(),
    },
    meta: {
      source: 'VEEDA',
      tag: [{ system: 'https://veeda.local/fhir/tags', code: 'phone-sensor' }],
    },
  };
}

// ── FHIR Observation Resource ─────────────────────────────────────────────────
export function biometricToFhirObservation(row, encounterId = null) {
  const coding = LOINC[row.type] ?? { code: row.type, display: row.type };
  const unit = canonicalUnit(row.type, row.unit);
  const obs = {
    resourceType: 'Observation',
    id: String(row.id ?? ''),
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
        display: 'Vital Signs',
      }],
    }],
    code: {
      coding: [{
        system: 'http://loinc.org',
        code: coding.code,
        display: coding.display,
      }],
      text: coding.display,
    },
    subject: row.patient_id ? { reference: `Patient/${row.patient_id}` } : undefined,
    effectiveDateTime: row.timestamp,
    valueQuantity: {
      value: Number(row.value),
      unit,
      system: 'http://unitsofmeasure.org',
      code: unit,
    },
    device: { display: 'VEEDA' },
    meta: {
      source: 'VEEDA',
      tag: [{ system: 'https://veeda.local/fhir/tags', code: 'phone-sensor' }],
    },
  };
  if (encounterId) {
    obs.encounter = { reference: `Encounter/${encounterId}` };
    obs.performer = [{ reference: `Practitioner/veda-system` }];
  }
  return obs;
}

// ── FHIR Transaction Bundle ───────────────────────────────────────────────────
export function buildTransactionBundle(resources) {
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    timestamp: new Date().toISOString(),
    entry: resources.map(resource => {
      const fullUrl = resource.resourceType === 'Observation' && resource.id
        ? `urn:uuid:${resource.id}`
        : resource.id
          ? `urn:uuid:${resource.id}`
          : undefined;

      const url = resource.resourceType === 'Patient'
        ? `Patient/${resource.id}`
        : resource.resourceType === 'Practitioner'
          ? `Practitioner/${resource.id}`
          : resource.resourceType === 'Encounter'
            ? `Encounter/${resource.id}`
            : `Observation/${resource.id}`;

      const method = resource.resourceType === 'Observation' ? 'POST' : 'PUT';

      return {
        fullUrl,
        request: { method, url },
        resource,
      };
    }),
  };
}

// ── Full Bundle: Package Patient + Practitioner + Encounter + Observations ─────
export function buildClinicalBundle({ patientId, profile, userId, role, wardId, observations, encounterId }) {
  const encounter = buildEncounterResource(patientId, userId, wardId);
  const actualEncounterId = encounter.id;

  const resources = [
    buildPatientResource(patientId, profile),
    buildPractitionerResource(userId, role),
    encounter,
    ...observations.map(obs => biometricToFhirObservation(obs, actualEncounterId)),
  ];

  return {
    bundle: buildTransactionBundle(resources),
    encounterId: actualEncounterId,
  };
}

export function fhirObservationToBiometric(observation) {
  if (observation?.resourceType !== 'Observation') throw new Error('FHIR resource must be Observation');
  if (observation.status && observation.status !== 'final') throw new Error('Only final Observations can be ingested');

  const loinc = observation.code?.coding?.find(c => c.system === 'http://loinc.org')?.code;
  const type = TYPE_BY_LOINC[loinc];
  if (!type) throw new Error(`Unsupported LOINC code: ${loinc || 'missing'}`);

  const quantity = observation.valueQuantity;
  if (!quantity || quantity.value === undefined) throw new Error('Observation.valueQuantity.value is required');
  const unit = canonicalUnit(type, quantity.code || quantity.unit);
  const patientId = observation.subject?.reference?.replace(/^Patient\//, '');
  if (!patientId) throw new Error('Observation.subject reference Patient/{id} is required');

  return {
    patient_id: patientId,
    type,
    value: Number(quantity.value),
    unit,
    timestamp: observation.effectiveDateTime || new Date().toISOString(),
    metadata: { fhirId: observation.id || null, encounter: observation.encounter?.reference || null },
  };
}

export function patientVitalsBundle(patientId, observations) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: observations.map(observation => ({
      fullUrl: observation.id ? `urn:uuid:${observation.id}` : undefined,
      resource: observation,
    })),
    subject: { reference: `Patient/${patientId}` },
  };
}