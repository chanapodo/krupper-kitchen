export type Kosher = 'meat' | 'dairy' | 'parve';
export type MealType = 'lunch' | 'dinner';
export type Role = 'parent' | 'kid';
export type Location = 'fridge' | 'freezer' | 'pantry';
export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface Member {
  id: string;
  name: string;
  role: Role;
  emoji: string;
  color: string;
}

export interface Settings {
  familyName: string;
  members: Member[];
  shabbat: boolean;
  pinSet: boolean;
}

export interface Ingredient {
  name: string;
  qty?: number;
  unit?: string;
  /** store aisle, for ingredients the catalog doesn't know */
  aisle?: string;
  /** frozen meat/chicken/fish that must be taken out to thaw */
  thaw?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  emoji: string;
  cuisine: string;
  kosher: Kosher;
  meals: MealType[];
  minutes: number;
  difficulty: 1 | 2 | 3;
  kidsCanHelp: boolean;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  photoUrl?: string;
  videoUrl?: string;
  link?: string;
  /** memberId -> 1..5 */
  ratings: Record<string, number>;
  /** 'pending' = a kid's suggestion waiting for a parent; hidden from the bank until approved */
  status?: 'pending';
  /** where an AI-found recipe came from */
  sources?: string[];
  createdBy?: string;
  createdAt: number;
}

export interface Slot {
  recipeIds: string[];
  note?: string;
}

export interface Week {
  id: string; // Sunday date, YYYY-MM-DD
  days: Partial<Record<DayKey, Partial<Record<MealType, Slot>>>>;
  /** ingredient keys a parent marked "not needed" for the shopping list */
  skipped: string[];
}

export interface Vote {
  id: string; // `${weekId}_${memberId}`
  weekId: string;
  memberId: string;
  recipeIds: string[];
  wishes: string[]; // free-text proposals
  updatedAt: number;
}

export type ShoppingStatus = 'pending' | 'active' | 'bought';

export interface ShoppingItem {
  id: string;
  name: string;
  qty?: number;
  unit?: string;
  aisle: string;
  status: ShoppingStatus;
  addedBy: string; // memberId
  note?: string;
  createdAt: number;
}

export interface PantryItem {
  id: string;
  name: string;
  qty?: number;
  unit?: string;
  location: Location;
  updatedAt: number;
}

export interface ThawPlan {
  /** date YYYY-MM-DD -> what to take out the evening before */
  byDate: Record<string, { text: string; items: string[]; meals: string[] }>;
  updatedAt: number;
}
