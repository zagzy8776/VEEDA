/**
 * VEEDA Signal Engine – Core Types (v1)
 * Deterministic + statistical clinical intelligence. No LLM.
 */

/**
 * @typedef {"HEART_RATE" | "RESP_RATE" | "SPO2" | "SYSTOLIC_BP" | "TEMPERATURE" | "CONSCIOUSNESS"} MetricType
 * @typedef {"6h" | "24h" | "7d"} Window
 * @typedef {"low" | "moderate" | "high"} ConfidenceLevel
 * @typedef {"up" | "down" | "stable"} Direction
 * @typedef {"small" | "moderate" | "large"} Magnitude
 * @typedef {"improving" | "stable" | "worsening" | "insufficient_data"} TrajectoryOverall
 * @typedef {"low" | "moderate" | "high" | "critical"} Severity
 * @typedef {"ROUTINE" | "ATTENTION" | "URGENT"} Priority
 */

/**
 * @typedef {Object} Quality
 * @property {number} score
 * @property {ConfidenceLevel} confidence
 * @property {number} [snrDb]
 * @property {number} [sampleCount]
 * @property {"phone_rppg" | "phone_mic" | "manual" | "bluetooth_device" | "unknown"} source
 * @property {string[]} [flags]
 */

/**
 * @typedef {Object} Observation
 * @property {string} patientId
 * @property {string} tenantId
 * @property {MetricType} metric
 * @property {number} value
 * @property {string} unit
 * @property {string} timestamp
 * @property {Quality} quality
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} PatientBaseline
 * @property {string} patientId
 * @property {MetricType} metric
 * @property {Window} window
 * @property {number} mean
 * @property {number} stdDev
 * @property {number} median
 * @property {number} sampleCount
 * @property {number} minValidSamples
 * @property {boolean} qualityWeighted
 * @property {string} computedAt
 * @property {boolean} sufficient
 */

/**
 * @typedef {Object} Signal
 * @property {MetricType} metric
 * @property {number} currentValue
 * @property {number} baselineMean
 * @property {number} baselineStdDev
 * @property {number} deviation
 * @property {Direction} direction
 * @property {Magnitude} magnitude
 * @property {number} confidence
 * @property {Window} window
 * @property {Quality} quality
 */

/**
 * @typedef {Object} Trajectory
 * @property {string} patientId
 * @property {Window} window
 * @property {TrajectoryOverall} overall
 * @property {Signal[]} signals
 * @property {boolean} coherent
 */

/**
 * @typedef {Object} DeteriorationAssessment
 * @property {string} patientId
 * @property {string} tenantId
 * @property {string} assessedAt
 * @property {Trajectory} trajectory
 * @property {Severity} severity
 * @property {{ news2?: { total: number, urgency: string }, qsofa?: { total: number, sepsisRiskFlag: boolean } }} clinicalScores
 * @property {Signal[]} signals
 * @property {string[]} reasons
 */

/**
 * @typedef {Object} ClinicalAlert
 * @property {string} id
 * @property {string} patientId
 * @property {string} tenantId
 * @property {Priority} priority
 * @property {string} alert
 * @property {string} summary
 * @property {string} recommendedAttention
 * @property {Signal[]} supportingSignals
 * @property {DeteriorationAssessment["clinicalScores"]} [clinicalScores]
 * @property {TrajectoryOverall} trajectory
 * @property {string} createdAt
 * @property {boolean} [acknowledged]
 * @property {string} [acknowledgedBy]
 * @property {string} [acknowledgedAt]
 */

export {};
