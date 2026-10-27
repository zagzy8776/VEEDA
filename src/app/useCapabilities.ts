// React hook wrapping buildPlatformSnapshot + buildCapabilityRegistry.
//
// Pure detection logic lives in capabilityRegistry.ts. This hook only handles
// the browser-side snapshot construction and re-checks on visibility change
// (permissions can change while the tab is backgrounded).

import { useState, useEffect, useMemo } from 'react';
import { buildCapabilityRegistry, type CapabilityRegistry, type PlatformSnapshot } from './capabilityRegistry.ts';
import type { ConsentFeature } from './consent.ts';
import type { FeatureFlag } from './featureFlags.ts';

export function buildPlatformSnapshot(
  consent: Partial<Record<ConsentFeature, boolean>> = {},
  flags: Partial<Record<FeatureFlag, boolean>> = {},
  config: { hasLlmProvider?: boolean; hasRegulatoryVerifyUrl?: boolean; hasMapProvider?: boolean } = {},
): PlatformSnapshot {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;

  return {
    hasGetUserMedia: !!nav?.mediaDevices?.getUserMedia,
    hasDeviceMotion: typeof DeviceMotionEvent !== 'undefined',
    hasDeviceOrientation: typeof DeviceOrientationEvent !== 'undefined',
    hasGeolocation: !!nav?.geolocation,
    hasPressureSensor: typeof (win as any)?.PressureSensor !== 'undefined',
    hasBatteryApi: !!nav && 'getBattery' in nav,
    hasAmbientLightSensor: typeof (win as any)?.AmbientLightSensor !== 'undefined',
    hasProximitySensor: typeof (win as any)?.ProximitySensor !== 'undefined',
    hasNetworkInformation: !!nav && 'connection' in nav,
    hasWebBluetooth: !!nav && 'bluetooth' in nav,
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hasSpeechRecognition:
      typeof (win as any)?.SpeechRecognition !== 'undefined' ||
      typeof (win as any)?.webkitSpeechRecognition !== 'undefined',
    isSecureContext: !!win?.isSecureContext,
    isMobile: /Mobi|Android/i.test(nav?.userAgent ?? ''),
    consent,
    flags,
    hasLlmProvider: config.hasLlmProvider ?? false,
    hasRegulatoryVerifyUrl: config.hasRegulatoryVerifyUrl ?? false,
    hasMapProvider: config.hasMapProvider ?? false,
  };
}

export function useCapabilities(
  consent: Partial<Record<ConsentFeature, boolean>> = {},
  flags: Partial<Record<FeatureFlag, boolean>> = {},
  config: { hasLlmProvider?: boolean; hasRegulatoryVerifyUrl?: boolean; hasMapProvider?: boolean } = {},
): CapabilityRegistry {
  const [snap, setSnap] = useState<PlatformSnapshot>(() =>
    buildPlatformSnapshot(consent, flags, config),
  );

  useEffect(() => {
    const handler = () => setSnap(buildPlatformSnapshot(consent, flags, config));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handler);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handler);
      }
    };
  }, [consent, flags, config]);

  return useMemo(() => buildCapabilityRegistry(snap), [snap]);
}
