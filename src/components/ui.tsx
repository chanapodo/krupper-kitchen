import { useEffect, useState, type ReactNode } from 'react';
import type { Kosher, Member, Recipe } from '../lib/types';

// ---------- routing (hash based, works on GitHub Pages) ----------

export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = `#/${path}`;
}

// ---------- small pieces ----------

export const KOSHER_LABEL: Record<Kosher, string> = { meat: 'בשרי', dairy: 'חלבי', parve: 'פרווה' };

export function KosherBadge({ k }: { k: Kosher }) {
  return <span className={`badge kosher-${k}`}>{KOSHER_LABEL[k]}</span>;
}

export const RATING_FACES = ['😖', '😕', '🙂', '😋', '🤩'];

export function RecipeThumb({ recipe, size = 'md' }: { recipe: Recipe; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`thumb thumb-${size} thumb-${recipe.kosher}`} aria-hidden>
      {recipe.photoUrl && !broken ? (
        <img src={recipe.photoUrl} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="thumb-emoji">{recipe.emoji || '🍽️'}</span>
      )}
    </div>
  );
}

export function Avatar({ m, size = 36 }: { m: Member; size?: number }) {
  return (
    <span className="avatar" style={{ background: m.color, width: size, height: size, fontSize: size * 0.55 }} title={m.name}>
      {m.emoji}
    </span>
  );
}

export function Chips<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} className={`chip ${value === o.v ? 'on' : ''}`} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה"><X /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-emoji">{emoji}</div>
      <div>{children}</div>
    </div>
  );
}

/** 4-digit PIN pad. */
export function PinPad({ title, subtitle, onSubmit, onCancel, error }: {
  title: string; subtitle?: string; onSubmit: (pin: string) => void; onCancel?: () => void; error?: string;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => {
    if (pin.length === 4) {
      onSubmit(pin);
      setPin('');
    }
  }, [pin, onSubmit]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="pinpad">
      <h2>{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
      <div className="pin-dots" aria-label={`${pin.length} מתוך 4`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="pin-keys" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k === '' ? <span key={i} /> : (
            <button key={i} className="pin-key" aria-label={k === '⌫' ? 'מחיקה' : k}
              onClick={() => setPin((p) => (k === '⌫' ? p.slice(0, -1) : p.length < 4 ? p + k : p))}>
              {k === '⌫' ? <Backspace /> : k}
            </button>
          ))}
      </div>
      {onCancel && <button className="btn ghost" onClick={onCancel}>ביטול</button>}
    </div>
  );
}

export function youtubeSearch(title: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`מתכון ${title}`)}`;
}

export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Icons as SVG, so they look the same on every device and font.
const svg = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const Ok = () => <svg {...svg} className="ico"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const X = () => <svg {...svg} className="ico"><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Backspace = () => <svg {...svg} strokeWidth={2.2} className="ico"><path d="M9 5h11v14H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></svg>;
