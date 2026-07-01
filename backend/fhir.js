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

export function biometricToFhirObservation(row) {
  const coding = LOINC[row.type] ?? { code: row.type, display: row.type };
  const unit = canonicalUnit(row.type, row.unit);
  return {
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
    metadata: { fhirId: observation.id || null },
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
