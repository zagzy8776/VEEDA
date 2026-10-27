import type { NormalizedSensorReading, CapabilityId, MeasurementType } from './sensorTypes';

/**
 * Simple in‑memory sensor hub. It stores the latest reading for each capability
 * and allows subscribers to be notified when a new reading arrives.
 */
class SensorHub {
  private latest: Map<CapabilityId, NormalizedSensorReading> = new Map();
  private listeners: Set<() => void> = new Set();

  /** Add or replace a reading for a capability. */
  add(reading: NormalizedSensorReading) {
    this.latest.set(reading.capabilityId, reading);
    this.notify();
  }

  /** Get the latest reading for a capability, or undefined if none. */
  get(capabilityId: CapabilityId): NormalizedSensorReading | undefined {
    return this.latest.get(capabilityId);
  }

  /** Get a snapshot of all stored readings. */
  getAll(): NormalizedSensorReading[] {
    return Array.from(this.latest.values());
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    for (const cb of this.listeners) cb();
  }
}

// Export a singleton instance used throughout the app.
export const sensorHub = new SensorHub();
