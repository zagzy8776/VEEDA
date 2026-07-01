export type Spo2Scale = 1 | 2;
export type Consciousness = 'alert' | 'voice' | 'pain' | 'unresponsive' | 'new_confusion';

export interface VitalSignInput {
  patientId?: string;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  spo2Scale?: Spo2Scale;
  supplementalOxygen?: boolean;
  temperature?: number;
  systolicBp?: number;
  consciousness?: Consciousness;
}

export interface ClinicalUrgency {
  level: 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Incomplete';
  action: string;
  timelineMinutes: number | null;
}

export interface ClinicalScoreResult {
  standard: 'NEWS2' | 'qSOFA';
  total: number;
  components: Record<string, number>;
  missing: string[];
  complete: boolean;
  urgency: ClinicalUrgency;
}

export interface News2Result extends ClinicalScoreResult {
  standard: 'NEWS2';
  spo2Scale: Spo2Scale;
}

export interface QsofaResult extends ClinicalScoreResult {
  standard: 'qSOFA';
  sepsisRiskFlag: boolean;
}
