import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
import { cameraFailureKind } from '../chatAttachments';

export function ChatCameraCapture({ open, onClose, onCapture, onFallback }: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [status, setStatus] = useState<'starting' | 'ready' | 'denied' | 'error'>('starting');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
    const start = async () => {
      stop();
      setStatus('starting');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('ready');
      } catch (error: any) {
        setStatus(cameraFailureKind(error));
      }
    };
    void start();
    return () => { cancelled = true; stop(); };
  }, [open, facingMode]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      onCapture(new File([blob], `veeda-camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.9);
  }

  if (!open) return null;
  return <div role="dialog" aria-modal="true" aria-label="Camera capture" style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'end center' }}>
    <div style={{ width: '100%', maxWidth: 430, padding: 16, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', borderRadius: '24px 24px 0 0', background: 'var(--card)', color: 'var(--card-foreground)', boxShadow: '0 -18px 60px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Take a photo</strong>
        <button type="button" onClick={onClose} aria-label="Close camera" style={iconButtonStyle}><X size={18} /></button>
      </div>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, background: '#000', aspectRatio: '4 / 3' }}>
        <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {status !== 'ready' && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#fff', background: 'rgba(0,0,0,.62)', fontSize: 13 }}>
          {status === 'starting' ? 'Waiting for camera permission…' : status === 'denied' ? 'Camera permission was denied. Allow it in browser settings or choose a photo instead.' : 'The webcam is unavailable. Choose a photo instead.'}
        </div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 16 }}>
        <button type="button" onClick={() => setFacingMode(mode => mode === 'environment' ? 'user' : 'environment')} aria-label="Switch camera" title="Switch front or rear camera" style={iconButtonStyle}><RefreshCw size={19} /></button>
        <button type="button" onClick={capture} disabled={status !== 'ready'} aria-label="Capture photo" style={{ width: 62, height: 62, borderRadius: '50%', border: '5px solid rgba(255,255,255,.72)', background: status === 'ready' ? 'var(--primary)' : 'var(--muted)', display: 'grid', placeItems: 'center', color: 'var(--primary-foreground)' }}><Camera size={24} /></button>
        <button type="button" onClick={onFallback} style={{ ...iconButtonStyle, width: 'auto', padding: '0 12px', fontSize: 12 }}>Choose file</button>
      </div>
    </div>
  </div>;
}

const iconButtonStyle = { width: 42, height: 42, borderRadius: 13, border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--secondary-foreground)', display: 'grid', placeItems: 'center' } as const;
