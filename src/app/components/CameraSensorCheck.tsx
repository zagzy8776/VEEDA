import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertTriangle, X } from 'lucide-react';

export function CameraSensorCheck({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [message, setMessage] = useState('Starting camera…');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.');
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('ready');
        setMessage('Camera is working. Place your fingertip over the rear lens for rPPG.');
      } catch (e: any) {
        setStatus('error');
        setMessage(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in browser settings.' : e?.message || 'Camera could not be started.');
      }
    };
    start();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  }, [open]);

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#050a12', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 390, padding: 20, paddingBottom: 32, background: '#0a0f1c', borderRadius: '24px 24px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Camera size={18} color="#2DD4A4" /><strong style={{ color: '#E2F4F0' }}>Camera sensor</strong></div>
          <button onClick={onClose} aria-label="Close camera check" style={{ border: 0, background: 'rgba(255,255,255,.08)', color: '#E2F4F0', borderRadius: 10, width: 34, height: 34 }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {status === 'ready' && <div style={{ position: 'absolute', inset: '18%', border: '2px solid #2DD4A4', borderRadius: 24, pointerEvents: 'none' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: status === 'error' ? '#E24B4A' : '#5A7A72', fontSize: 12, lineHeight: 1.45 }}>
          {status === 'ready' ? <CheckCircle size={16} color="#2DD4A4" /> : <AlertTriangle size={16} />}
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}
