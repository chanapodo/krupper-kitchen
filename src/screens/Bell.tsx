import { useRequests } from '../components/actions';
import { Avatar, Empty, Ok, X } from '../components/ui';
import { DAY_NAMES, weekLabel } from '../lib/dates';
import { decidedRequests, MEAL_NAMES, pendingRequests, unreadNotices, verb } from '../lib/logic';
import type { ApprovalRequest, Notice } from '../lib/types';
import { useApp } from '../state';

const RULES_URL = 'https://github.com/chanapodo/krupper-kitchen/blob/main/firestore.rules';

function ago(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}

/** What a request asks, in a line. */
function useDescribe() {
  const { settings, recipeMap } = useApp();
  return (r: ApprovalRequest) => {
    const m = settings?.members.find((x) => x.id === r.by);
    const who = m?.name ?? '';
    if (r.kind === 'menu-add') {
      const recipe = r.recipeId ? recipeMap.get(r.recipeId) : undefined;
      const where = r.day && r.meal ? `${DAY_NAMES[r.day]} ${MEAL_NAMES[r.meal]}` : '';
      return { m, text: `${who} ${verb(m, 'הוסיף')} ${recipe?.emoji ?? '🍽️'} ${recipe?.title ?? r.title} לתפריט · ${where}${r.weekId ? `, ${weekLabel(r.weekId)}` : ''}` };
    }
    return { m, text: `${who} ${verb(m, 'ביקש')} להוריד מרשימת הקניות: ${r.title}` };
  };
}

/** Kids' requests with approve / reject (in the bell screen and the pop-up on open). */
export function ApprovalList({ items }: { items: ApprovalRequest[] }) {
  const { approve, reject } = useRequests();
  const describe = useDescribe();
  if (!items.length) return <p className="muted small">אין בקשות שמחכות.</p>;
  return (
    <ul className="approval-list">
      {items.map((r) => {
        const { m, text } = describe(r);
        return (
          <li key={r.id} className="approval-row">
            {m && <Avatar m={m} size={30} />}
            <span className="grow">
              <span>{text}</span>
              <span className="muted small"> · {ago(r.at)}</span>
            </span>
            <span className="approval-actions">
              <button className="btn small ok" onClick={() => approve(r)} aria-label={`לאשר: ${r.title}`}><Ok /> אישור</button>
              <button className="btn small ghost" onClick={() => reject(r)} aria-label={`לדחות: ${r.title}`}><X /> {r.kind === 'shop-remove' ? 'להשאיר' : 'לא'}</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The published security rules are older than the app: the parent re-pastes them. */
export function RulesBanner() {
  return (
    <section className="card soft-peach rules-banner" role="alert">
      <h2>🔐 צריך לעדכן את חוקי האבטחה</h2>
      <p className="small">
        הגרסה החדשה צריכה חוקים מעודכנים כדי שהילדים יוכלו להוסיף, לסמן ולבקש אישור. עד אז חלק מהפעולות שלהם לא יישמרו.
      </p>
      <ol className="small">
        <li>לפתוח את <a href={RULES_URL} target="_blank" rel="noreferrer">הקובץ firestore.rules</a> ולהעתיק את כל התוכן.</li>
        <li>Firebase Console ← Firestore Database ← Rules: למחוק הכול, להדביק, וללחוץ Publish.</li>
        <li>לרענן את האפליקציה.</li>
      </ol>
    </section>
  );
}

export default function BellScreen() {
  const { notices, requests, me, store, settings, toast, rulesOutdated } = useApp();
  const { revert } = useRequests();
  const describe = useDescribe();
  if (!me) return null;
  const waiting = pendingRequests(requests);
  const unread = unreadNotices(notices, me.id);
  const feed = notices.filter((n) => !n.undone).sort((a, b) => b.at - a.at).slice(0, 60);
  const decided = decidedRequests(requests);
  const isUnread = (n: Notice) => !n.readBy?.[me.id];

  const markRead = async (list: Notice[]) => {
    for (const n of list) await store.update(`notices/${n.id}`, { [`readBy.${me.id}`]: true });
  };
  const markAll = async () => {
    const list = unread;
    await markRead(list);
    toast(`${list.length} התראות סומנו כנקראו`, async () => {
      for (const n of list) await store.update(`notices/${n.id}`, { [`readBy.${me.id}`]: false });
    });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>🔔 התראות</h1>
        {unread.length > 0 && <button className="btn small soft" onClick={markAll}>סימון הכול כנקרא</button>}
      </div>

      {rulesOutdated && <RulesBanner />}

      <section className="card soft-peach">
        <h2>🙋 מחכה לאישור ({waiting.length})</h2>
        <ApprovalList items={waiting} />
      </section>

      <section className="card">
        <h2>מה הילדים עשו</h2>
        {!feed.length && <Empty emoji="🌤️">עוד אין התראות</Empty>}
        <ul className="notice-list">
          {feed.map((n) => {
            const m = settings?.members.find((x) => x.id === n.by);
            return (
              <li key={n.id} className={`notice-row ${isUnread(n) ? 'unread' : ''}`}>
                {m && <Avatar m={m} size={28} />}
                <span className="grow">
                  <span className="notice-text">{n.text}</span>
                  <span className="muted small"> · {ago(n.at)}</span>
                </span>
                {isUnread(n) && (
                  <button className="link small" onClick={() => markRead([n])} aria-label={`סימון כנקרא: ${n.text}`}><Ok /> נקרא</button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {decided.length > 0 && (
        <details className="card history recent">
          <summary>↩ החלטות מהשבוע האחרון ({decided.length})</summary>
          <ul className="history-list">
            {decided.map((r) => (
              <li key={r.id} className="history-row">
                <span className="history-icon" aria-hidden>{r.status === 'approved' ? '✅' : '🙅'}</span>
                <span className="grow">
                  <span>{describe(r).text}</span>
                  <span className="from-menu">{r.status === 'approved' ? 'אושר' : 'נדחה'} {ago(r.decidedAt ?? 0)}</span>
                </span>
                <button className="btn small" onClick={async () => { await revert(r); toast('ההחלטה בוטלה – הבקשה מחכה שוב'); }}
                  aria-label={`לבטל את ההחלטה: ${r.title}`}>ביטול ההחלטה</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
