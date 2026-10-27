import { useEffect, useState } from 'react';
import { sensorHub } from '../sensorHub';
import { buildPlatformSnapshot, useCapabilities } from '../useCapabilities';
import { buildRegistry } from '../modelRegistry';
import { imageVisionState } from '../sensorContext';
import type { NormalizedSensorReading } from '../sensorTypes';

const C = {
  teal: '#2DD4A4', blue: '#378ADD', amber: '#EF9F27', red: '#E24B4A',
  text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.88)', border: 'rgba(255,255,255,0.08)',
};

const VISION_REGISTRY = buildRegistry([]);
const VISION = imageVisionState(VISION_REGISTRY);

export interface SensorDiagnosticsPageProps {
  onClose?: () => void;
}

export function SensorDiagnosticsPage({ onClose }: SensorDiagnosticsPageProps) {
  const [readings, setReadings] = useState<NormalizedSensorReading[]>(() => sensorHub.getAll());
  const caps = useCapabilities();

  useEffect(() => {
    const unsub = sensorHub.subscribe(() => setReadings(sensorHub.getAll()));
    return unsub;
  }, []);

  const available = caps.available();
  const unavailable = caps.unavailable();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#0A1120', overflowY: 'auto', padding: 18, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Sensor diagnostics</div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
            Close
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Live view of the VEEDA Sensor Hub. Every reading carries its source and quality so an estimate can never be mistaken for a device measurement.
      </div>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Capabilities</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
          {available.length} available · {unavailable.length} unavailable
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {available.map(id => (
            <span key={id} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, background: 'rgba(45,212,164,0.14)', color: C.teal, border: `1px solid ${C.teal}` }}>{id}</span>
          ))}
          {unavailable.map(id => (
            <span key={id} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, background: 'rgba(239,159,39,0.12)', color: C.amber, border: `1px solid ${C.amber}` }}>{id}</span>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Latest readings in the hub</div>
        {readings.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted }}>No readings yet. Start a measurement to populate the hub.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {readings.map(r => (
            <div key={r.capabilityId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{r.capabilityId}</span>
                <span style={{ fontSize: 10, color: r.quality === 'GOOD' ? C.teal : C.amber }}>{r.quality}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {String(r.value)} {r.unit} · source: {r.source} · {new Date(r.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Image / vision pipeline</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          {VISION.available
            ? `Validated vision model registered.`
            : `${VISION.label} ${VISION.note}`}
        </div>
      </section>
    </div>
  );
}
