import { APP_VERSION } from '../lib/update';
import { useState } from 'react';
import { Avatar, go, PinPad, X } from '../components/ui';
import type { Member, Settings } from '../lib/types';
import { LocalStore } from '../store/local';
import { useApp } from '../state';

const EMOJIS = ['👩', '👨', '🦊', '🐼', '🐱', '🐶', '🦄', '🐸', '🐯', '🐨', '🦁', '🐰', '⚽', '🎨', '🚀', '🌸'];
const COLORS = ['#FFD6C9', '#D4ECFF', '#E3DBFF', '#CDEFE3', '#FFF1C1', '#FFDCEB'];

export default function SettingsScreen() {
  const { me, isParent, settings, store, setMeId, toast } = useApp();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [err, setErr] = useState('');
  if (!settings || !me) return null;
  const s = draft ?? settings;

  const setMember = (id: string, patch: Partial<Member>) =>
    setDraft({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  const save = async () => {
    if (!draft) return;
    await store.set('meta/settings', { ...draft, members: draft.members.map((m) => ({ ...m, name: m.name.trim() || m.name })) } as unknown as Record<string, unknown>);
    setDraft(null);
    toast('ההגדרות נשמרו');
  };

  const addKid = () => setDraft({
    ...s, members: [...s.members, { id: `kid${Date.now().toString(36)}`, name: 'ילד/ה', role: 'kid', emoji: '🐰', color: COLORS[s.members.length % COLORS.length] }],
  });

  const switchUser = async () => {
    if (isParent) await store.lockParent();
    setMeId(null);
    go('home');
  };

  if (pinMode) {
    return (
      <div className="card">
        <PinPad title="קוד הורים חדש" subtitle="4 ספרות" onCancel={() => setPinMode(false)} onSubmit={async (pin) => {
          await store.changePin(pin);
          setPinMode(false);
          toast('הקוד עודכן 🔐');
        }} />
      </div>
    );
  }

  if (unlocking) {
    return (
      <div className="card">
        <PinPad title="קוד הורים" error={err} onCancel={() => { setUnlocking(false); setErr(''); }} onSubmit={async (pin) => {
          if (await store.unlockParent(pin)) { setUnlocking(false); setErr(''); } else setErr('קוד לא נכון');
        }} />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>⚙️ הגדרות</h1>

      <section className="card me-card">
        <Avatar m={me} size={56} />
        <div className="grow">
          <strong>{me.name}</strong>
          <div className="muted small">{isParent ? '🔓 מצב הורים פתוח במכשיר הזה' : me.role === 'parent' ? 'מצב הורים נעול' : 'מצב ילדים'}</div>
        </div>
        <button className="btn soft" onClick={switchUser}>החלפת משתמש</button>
      </section>

      {me.role === 'parent' && !isParent && (
        <button className="btn" onClick={() => setUnlocking(true)}>🔓 פתיחת מצב הורים</button>
      )}

      {isParent && (
        <>
          <section className="card">
            <h2>👨‍👩‍👧‍👦 המשפחה</h2>
            <label className="field">שם האפליקציה
              <input className="input" value={s.familyName} onChange={(e) => setDraft({ ...s, familyName: e.target.value })} />
            </label>
            {s.members.map((m) => (
              <div key={m.id} className="member-edit">
                <Avatar m={m} size={40} />
                <input className="input grow" value={m.name} onChange={(e) => setMember(m.id, { name: e.target.value })} aria-label={`שם של ${m.name}`} />
                <select className="input mini" value={m.emoji} onChange={(e) => setMember(m.id, { emoji: e.target.value })} aria-label="אימוג׳י">
                  {[...new Set([m.emoji, ...EMOJIS])].map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <span className="muted small">{m.role === 'parent' ? 'הורה' : 'ילד/ה'}</span>
                {m.role === 'kid' && s.members.filter((x) => x.role === 'kid').length > 1 && (
                  <button className="icon-btn small" aria-label={`להסיר את ${m.name}`} onClick={() => setDraft({ ...s, members: s.members.filter((x) => x.id !== m.id) })}><X /></button>
                )}
              </div>
            ))}
            <button className="link" onClick={addKid}>+ להוסיף ילד/ה</button>
            <label className="check-line">
              <input type="checkbox" checked={s.shabbat} onChange={(e) => setDraft({ ...s, shabbat: e.target.checked })} /> להציג גם שבת בתפריט
            </label>
            {draft && (
              <div className="action-row">
                <button className="btn" onClick={save}>שמירה</button>
                <button className="btn ghost" onClick={() => setDraft(null)}>ביטול</button>
              </div>
            )}
          </section>

          <section className="card">
            <h2>🔐 אבטחה</h2>
            <button className="btn soft" onClick={() => setPinMode(true)}>שינוי קוד הורים</button>
            <button className="btn ghost" onClick={async () => { await store.lockParent(); toast('מצב הורים ננעל'); }}>נעילת מצב הורים במכשיר הזה</button>
          </section>
        </>
      )}

      <section className="card">
        <h2>📲 התקנה במסך הבית</h2>
        <p className="small">באייפון: כפתור השיתוף ← ״הוספה למסך הבית״. באנדרואיד: תפריט ⋮ ← ״התקנת אפליקציה״.</p>
      </section>

      {store.mode === 'demo' && (
        <section className="card soft-butter">
          <h2>🧪 מצב דמו</h2>
          <p className="small">הנתונים נשמרים רק בדפדפן הזה. אחרי חיבור ל־Firebase כל המשפחה תראה את אותם נתונים בזמן אמת.</p>
          <button className="btn ghost" onClick={() => {
            if (confirm('לאפס את הדמו לנתוני ההתחלה?')) {
              (store as LocalStore).reset();
              setMeId(null);
              go('home');
            }
          }}>איפוס הדמו</button>
        </section>
      )}

      <p className="muted small center">גרסה <span dir="ltr">{APP_VERSION}</span></p>
    </div>
  );
}
