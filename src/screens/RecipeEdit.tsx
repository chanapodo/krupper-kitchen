import RecipeForm from '../components/RecipeForm';
import { Empty, go } from '../components/ui';
import { verb } from '../lib/logic';
import type { Recipe } from '../lib/types';
import { useApp } from '../state';

export default function RecipeEdit({ id, name }: { id: string; name?: string }) {
  const { recipeMap, store, me, isParent, toast, pantry, shopping, notify } = useApp();
  const existing = id !== 'new' ? recipeMap.get(id) : undefined;

  if (id !== 'new' && !existing) return <Empty emoji="🤷">המתכון לא נמצא</Empty>;
  if (existing && !isParent) return <Empty emoji="🔒">רק הורים יכולים לערוך מתכונים</Empty>;

  const initial: Recipe = existing ?? {
    id: '', title: name ?? '', emoji: '🍲', cuisine: 'ישראלי', kosher: 'parve', meals: ['dinner'], minutes: 30, difficulty: 1,
    kidsCanHelp: false, tags: [], ingredients: [{ name: '' }, { name: '' }, { name: '' }], steps: [], ratings: {}, createdAt: 0,
  };
  const known = [...pantry.map((p) => p.name), ...shopping.map((s) => s.name)];

  const save = async (r: Recipe) => {
    const rid = existing?.id ?? store.newId();
    const data: Recipe = {
      ...r, id: rid,
      createdAt: existing?.createdAt || Date.now(),
      createdBy: existing?.createdBy ?? me?.id,
    };
    await store.set(`recipes/${rid}`, data as unknown as Record<string, unknown>);
    // a kid's new recipe goes straight in; the parents get a notice
    if (!existing && me && !isParent) await notify('recipe', `${me.name} ${verb(me, 'הוסיף')} ${data.title} למתכונים`);
    toast(existing ? 'המתכון עודכן' : 'המתכון נוסף לספר המתכונים 🎉');
    go(`recipe/${rid}`);
  };

  return (
    <RecipeForm
      initial={initial}
      known={known}
      onSubmit={save}
      top={<>
        <button className="link back" onClick={() => history.back()}>→ חזרה</button>
        <h1>{existing ? 'עריכת מתכון' : 'מתכון חדש'}</h1>
      </>}
    />
  );
}
