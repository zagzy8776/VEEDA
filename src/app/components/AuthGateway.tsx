import { useState, type FormEvent } from 'react';
import { Activity, ArrowRight, LockKeyhole } from 'lucide-react';
import { login, register, type AuthUser } from '../api';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.94)', border: 'rgba(255,255,255,0.1)', red: '#E24B4A' };

export function AuthGateway({ onAuthenticated, onContinueLocally }: { onAuthenticated: (user: AuthUser) => void; onContinueLocally: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = mode === 'login' ? await login(email, password) : await register(email, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 18% 10%, rgba(45,212,164,0.18), transparent 30%), radial-gradient(circle at 86% 16%, rgba(55,138,221,0.16), transparent 28%), #07101D', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(180deg,rgba(45,212,164,0.2),rgba(45,212,164,0.06))', border: '1px solid rgba(45,212,164,0.25)', display: 'grid', placeItems: 'center', color: C.teal, margin: '0 auto 16px' }}><Activity size={30} /></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}><span style={{ color: C.teal }}>V</span>EDA</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Wellness Intelligence</div>
        </div>

        <form onSubmit={submit} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {(['login', 'register'] as const).map(tab => <button type="button" key={tab} onClick={() => { setMode(tab); setError(''); }} style={{ flex: 1, padding: 10, borderRadius: 10, border: 0, background: mode === tab ? C.teal : 'rgba(255,255,255,0.07)', color: mode === tab ? '#04342C' : C.muted, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>{tab}</button>)}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" style={inputStyle} />
            <input type="password" required minLength={10} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (10+ characters)" style={inputStyle} />
          </div>
          {error && <div role="alert" style={{ marginTop: 12, color: C.red, fontSize: 12, lineHeight: 1.4 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 18, padding: 14, borderRadius: 12, border: 0, background: busy ? 'rgba(45,212,164,0.45)' : C.teal, color: '#04342C', fontWeight: 900, fontSize: 15, cursor: busy ? 'wait' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <LockKeyhole size={16} /> {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button type="button" onClick={onContinueLocally} style={{ width: '100%', marginTop: 10, padding: 11, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            Continue with local measurements <ArrowRight size={14} />
          </button>
          <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>Sign in to save readings and history to your protected account. Local camera, microphone, and motion measurements remain available without an account.</p>
        </form>
      </div>
    </div>
  );
}

const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '12px 14px', background: '#0A1220', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 10, color: C.text, fontSize: 16, outline: 'none' };