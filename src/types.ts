export type ColorKey = "carbon" | "mist" | "electric" | "violet" | "lime" | "steel";

export interface AppState {
  updatedAt: number;
  sample: boolean;
  items: Item[];
}

export interface Item {
  id: string;
  name: string;
  provider: string;
  total: number;
  months: number;
  rate: number;
  start: string;    // "YYYY-MM"
  dueDay: number;
  color: ColorKey;
  note: string;
  payments: Payment[];
}

export interface Payment {
  id: string;
  date: string;     // "YYYY-MM-DD"
  amount: number;
  note: string;
  slip?: Slip;
}

export type Slip =
  | { id: string; url?: string }
  | { data: string };

export interface Row {
  idx: number;
  num: number;
  amount: number;
  due: string;      // "YYYY-MM-DD"
  cumDue: number;
  covered: number;
  full: boolean;
  paidAt: string | null;
}

export interface Derived {
  interest: number;
  grand: number;
  per: number;
  last: number;
  rows: Row[];
  paidAmt: number;
  paidN: number;
  next: Row | null;
  owe: number;
  remain: number;
  pct: number;
  done: boolean;
}

export interface Store {
  signIn(): Promise<{ uid: string; email: string }>;
  signOut(): Promise<void>;
  load(): Promise<Item[]>;
  saveItem(item: Item): Promise<void>;
  deleteItem(id: string): Promise<void>;
  savePayment(itemId: string, p: Payment): Promise<void>;
  deletePayment(itemId: string, pId: string): Promise<void>;
  uploadSlip(blob: Blob, ref: { itemId: string; paymentId: string }): Promise<Slip>;
  slipSrc(slip: Slip): Promise<string>;
  deleteSlip(slip: Slip): Promise<void>;
  subscribe?: (cb: (items: Item[]) => void) => () => void;
}
