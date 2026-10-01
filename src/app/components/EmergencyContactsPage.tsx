import { useState } from 'react';
import { motion } from 'motion/react';
import { Phone, MessageSquare, Trash2, Plus } from 'lucide-react';
import {
  MAX_EMERGENCY_CONTACTS,
  addContact,
  buildSmsHref,
  buildSosMessage,
  buildTelHref,
  loadContacts,
  removeContact,
  updateContact,
  type EmergencyContact,
} from '../emergencyContacts';

const C = { teal: '#2DD4A4', text: '#E2F4F0', muted: '#5A7A72', card: 'rgba(13,21,37,0.96)', border: 'rgba(255,255,255,0.1)', amber: '#EF9F27', red: '#E24B4A' };
const inp = { width: '100%', padding: '10px 12px', background: '#0A1220', border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

interface EmergencyContactsPageProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** Optional human-readable location text (e.g. "6.52, 3.37"). Included in the
   * message only when the user has granted location access. */
  locationText?: string;
  /** The user's own name, if they choose to include it. May be blank. */
  userName?: string;
}

export function EmergencyContactsPage({ open, onClose, userId, locationText, userName }: EmergencyContactsPageProps) {
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => loadContacts(window.localStorage, userId));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!open) return null;

  function refresh() { setContacts(loadContacts(window.localStorage, userId)); }

  function save() {
    setError('');
    const result = editingId
      ? updateContact(window.localStorage, userId, editingId, { name, phone })
      : addContact(window.localStorage, userId, { name, phone });
    if (result.ok === false) { setError(result.message ?? ''); return; }
    setName(''); setPhone(''); setEditingId(null); refresh();
  }

  function startEdit(c: EmergencyContact) {
    setEditingId(c.id); setName(c.name); setPhone(c.phone); setError('');
  }

  function cancelEdit() { setEditingId(null); setName(''); setPhone(''); setError(''); }

  function remove(id: string) {
    removeContact(window.localStorage, userId, id);
    if (editingId === id) cancelEdit();
    refresh();
  }

  const message = buildSosMessage({ userName, locationText });
  const atCap = contacts.length >= MAX_EMERGENCY_CONTACTS && !editingId;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.72)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, color: C.text, width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto' } as React.CSSProperties}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Emergency contacts</div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
          Save up to {MAX_EMERGENCY_CONTACTS} people to reach in an emergency. Names and numbers only.
          Stored on this device only. VEEDA does not send the message — it opens your phone so you can review and send it.
        </div>

        {contacts.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>No contacts saved yet.</div>
        )}

        {contacts.map((c) => (
          <div key={c.id} style={{ border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(c)} style={{ background: 'transparent', border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`} style={{ background: 'transparent', border: '0.5px solid rgba(226,75,74,0.35)', borderRadius: 8, color: C.red, padding: '4px 8px', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Trash2 size={13} /></button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{c.phone}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={buildTelHref(c.phone)} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '8px', borderRadius: 10, background: 'rgba(226,75,74,0.15)', color: C.red, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Phone size={13} /> Call</a>
              <a href={buildSmsHref(c.phone, message)} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '8px', borderRadius: 10, background: 'rgba(45,212,164,0.15)', color: C.teal, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><MessageSquare size={13} /> Message</a>
            </div>
          </div>
        ))}

        <div style={{ borderTop: `0.5px solid ${C.border}`, marginTop: 14, paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: C.muted, marginBottom: 8 }}>
            {editingId ? 'Edit contact' : 'Add a contact'}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...inp, marginBottom: 8 }} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" style={{ ...inp, marginBottom: 8 }} />
          {error && <div style={{ color: C.amber, fontSize: 11, marginBottom: 8 }}>{error}</div>}
          {atCap && <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>You already have {MAX_EMERGENCY_CONTACTS} contacts. Remove one to add another.</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save} disabled={atCap} style={{ flex: 1, padding: 11, borderRadius: 12, border: 0, background: atCap ? 'rgba(255,255,255,0.06)' : C.teal, color: atCap ? C.muted : '#04342C', fontWeight: 800, cursor: atCap ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={14} /> {editingId ? 'Save changes' : 'Add contact'}
            </button>
            {editingId && <button onClick={cancelEdit} style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Cancel</button>}
          </div>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>Close</button>
      </motion.div>
    </div>
  );
}
