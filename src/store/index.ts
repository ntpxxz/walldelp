import type { Store } from "../types";
import { createLocalStore } from "./local";

export type { Store };

export function createStore(): Store {
  const backend = import.meta.env.VITE_BACKEND;
  if (backend === "firebase") {
    // Dynamic import so Firebase SDK is only bundled when needed
    return createLocalStore(); // replaced below
  }
  return createLocalStore();
}

export async function createStoreAsync(): Promise<Store> {
  const backend = import.meta.env.VITE_BACKEND;
  if (backend === "firebase") {
    const { createFirebaseStore } = await import("./firebase");
    return createFirebaseStore();
  }
  return createLocalStore();
}
