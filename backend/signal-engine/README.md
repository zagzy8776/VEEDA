# VEEDA Signal Engine (v1)

Deterministic + statistical clinical intelligence layer.

**No LLM. Fully explainable.**

## Pipeline

```
raw_biometrics → quality → personal baseline → signals (z-score) → trajectory → clinical rules (NEWS2/qSOFA) → DeteriorationAssessment → ClinicalAlert
```

## Public API

```js
import { runSignalEngine } from './signal-engine/index.js';

const { assessment, alert } = await runSignalEngine(patientId, tenantId, {
  vitalsInput: { systolicBp: 110, consciousness: 'alert' },
});
```

## Design principles

1. Quality is first-class
2. Baseline requires enough high-quality samples
3. Fully deterministic and auditable
4. Alerts only when warranted
5. Every alert has human-readable reasons
