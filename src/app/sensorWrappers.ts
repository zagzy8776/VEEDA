// Low-risk sensor wrappers for capabilities identified in the audit but lacking dedicated hooks.
// These modules provide honest availability checks and minimal data normalization without fabricating values.

import { useState, useEffect, useCallback } from 'react';
import { sensorHub } from './sensorHub';
import type { MeasurementQuality, MeasurementSource } from './sensorTypes';

/**
 * Gyroscope wrapper.
 * Uses DeviceOrientationEvent if available. Does not simulate or guess orientation.
 */
export function useGyroscope() {
  const [available, setAvailable] = useState(false);
  const [orientation, setOrientation] = useState<{ alpha: number; beta: number; gamma: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setAvailable(false);
      setError('Gyroscope/Orientation API not supported on this device/browser.');
      return;
    }

    const handler = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
        const orient = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
        setOrientation(orient);
        
        // Push to Sensor Hub
        sensorHub.add({
          capabilityId: 'gyroscope',
          measurementType: 'orientation',
          value: `${orient.alpha.toFixed(1)},${orient.beta.toFixed(1)},${orient.gamma.toFixed(1)}`,
          unit: 'degrees',
          source: 'PHONE_SENSOR',
          timestamp: new Date().toISOString(),
          freshness: 0,
          quality: 'GOOD',
          description: 'Device orientation (alpha, beta, gamma)'
        });
      }
    };

    window.addEventListener('deviceorientation', handler, true);
    setAvailable(true);
    setError(null);

    return () => {
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  return { available, orientation, error };
}

/**
 * Ambient Light Sensor wrapper.
 * Checks for AmbientLightSensor constructor. Most browsers do not support this yet.
 */
export function useAmbientLight() {
  const [available, setAvailable] = useState(false);
  const [lux, setLux] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any).AmbientLightSensor === 'undefined') {
      setAvailable(false);
      setError('Ambient Light Sensor API not supported on this device/browser.');
      return;
    }

    try {
      const SensorClass = (window as any).AmbientLightSensor;
      const sensor = new SensorClass();
      
      sensor.onreading = () => {
        const currentLux = sensor.illuminance;
        setLux(currentLux);
        
        // Push to Sensor Hub
        sensorHub.add({
          capabilityId: 'ambient_light',
          measurementType: 'ambient_light',
          value: currentLux,
          unit: 'lx',
          source: 'PHONE_SENSOR',
          timestamp: new Date().toISOString(),
          freshness: 0,
          quality: 'GOOD',
          description: 'Ambient light level'
        });
      };

      sensor.onerror = (e: any) => {
        setError(`Ambient light sensor error: ${e.message || 'Unknown error'}`);
        setAvailable(false);
      };

      sensor.start();
      setAvailable(true);
      setError(null);

      return () => {
        sensor.stop();
      };
    } catch (e: any) {
      setAvailable(false);
      setError(`Failed to initialize ambient light sensor: ${e.message}`);
    }
  }, []);

  return { available, lux, error };
}

/**
 * Proximity Sensor wrapper.
 * Checks for ProximitySensor constructor. Rarely supported on modern web browsers.
 */
export function useProximity() {
  const [available, setAvailable] = useState(false);
  const [near, setNear] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any).ProximitySensor === 'undefined') {
      setAvailable(false);
      setError('Proximity Sensor API not supported on this device/browser.');
      return;
    }

    try {
      const SensorClass = (window as any).ProximitySensor;
      const sensor = new SensorClass();
      
      sensor.onreading = () => {
        const isNear = sensor.near;
        setNear(isNear);
        
        // Push to Sensor Hub
        sensorHub.add({
          capabilityId: 'proximity',
          measurementType: 'proximity',
          value: isNear ? 1 : 0,
          unit: 'boolean',
          source: 'PHONE_SENSOR',
          timestamp: new Date().toISOString(),
          freshness: 0,
          quality: 'GOOD',
          description: `Object near screen: ${isNear}`
        });
      };

      sensor.onerror = (e: any) => {
        setError(`Proximity sensor error: ${e.message || 'Unknown error'}`);
        setAvailable(false);
      };

      sensor.start();
      setAvailable(true);
      setError(null);

      return () => {
        sensor.stop();
      };
    } catch (e: any) {
      setAvailable(false);
      setError(`Failed to initialize proximity sensor: ${e.message}`);
    }
  }, []);

  return { available, near, error };
}

/**
 * Network Status wrapper.
 * Uses navigator.connection if available. Provides online/offline state and effective type.
 */
export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);
  const [downlink, setDownlink] = useState<number | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for Network Information API
    const conn = (navigator as any).connection;
    if (conn) {
      const updateConnInfo = () => {
        setEffectiveType(conn.effectiveType);
        setDownlink(conn.downlink);
        
        // Push to Sensor Hub
        sensorHub.add({
          capabilityId: 'network_status',
          measurementType: 'network_status',
          value: conn.effectiveType || 'unknown',
          unit: 'string',
          source: 'PHONE_SENSOR',
          timestamp: new Date().toISOString(),
          freshness: 0,
          quality: 'GOOD',
          description: `Network: ${conn.effectiveType}, Downlink: ${conn.downlink} Mbps`
        });
      };

      conn.addEventListener('change', updateConnInfo);
      updateConnInfo(); // Initial read

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        conn.removeEventListener('change', updateConnInfo);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { online, effectiveType, downlink };
}
