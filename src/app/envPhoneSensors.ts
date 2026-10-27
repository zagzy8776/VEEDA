/**
 * Local phone environment sensors (not weather-API data).
 * Barometer and ambient light update as you move / change surroundings.
 * Unsupported APIs fail silently — callers keep previous values.
 */

export type PhoneEnvSample = {
  pressureHpa: number | null;
  lightLux: number | null;
};

type Listener = (sample: PhoneEnvSample) => void;

let pressureHpa: number | null = null;
let lightLux: number | null = null;
const listeners = new Set<Listener>();
let started = false;
let pressureSensor: any = null;
let lightSensor: any = null;

function emit() {
  const sample = { pressureHpa, lightLux };
  for (const fn of listeners) {
    try { fn(sample); } catch {}
  }
}

function startPressure() {
  try {
    const PressureSensor = (window as any).PressureSensor;
    if (!PressureSensor) return;
    pressureSensor = new PressureSensor({ frequency: 1 });
    pressureSensor.addEventListener('reading', () => {
      const p = Number(pressureSensor.pressure);
      if (Number.isFinite(p)) {
        pressureHpa = Math.round(p * 10) / 10;
        emit();
      }
    });
    pressureSensor.addEventListener('error', () => {});
    pressureSensor.start();
  } catch {}
}

function startLight() {
  try {
    const AmbientLightSensor = (window as any).AmbientLightSensor;
    if (!AmbientLightSensor) return;
    lightSensor = new AmbientLightSensor({ frequency: 1 });
    lightSensor.addEventListener('reading', () => {
      const l = Number(lightSensor.illuminance);
      if (Number.isFinite(l)) {
        lightLux = Math.round(l);
        emit();
      }
    });
    lightSensor.addEventListener('error', () => {});
    lightSensor.start();
  } catch {}
}

export function subscribePhoneEnv(listener: Listener): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    startPressure();
    startLight();
  }
  // Immediate snapshot
  listener({ pressureHpa, lightLux });
  return () => {
    listeners.delete(listener);
  };
}

/** Human-readable GPS status with speed when walking. */
export function formatGpsLabel(opts: {
  accuracy: number | null;
  speedMps: number | null;
}): string {
  const { accuracy, speedMps } = opts;
  if (accuracy == null) return 'Acquiring GPS';
  const acc = `±${Math.max(1, Math.round(accuracy))}m`;
  if (speedMps != null && speedMps >= 0.8) {
    const kmh = Math.round(speedMps * 3.6);
    if (speedMps < 2.5) return `Walking · ${acc}`;
    if (speedMps < 8) return `${kmh} km/h · ${acc}`;
    return `${kmh} km/h · ${acc}`;
  }
  return `Active · ${acc}`;
}
