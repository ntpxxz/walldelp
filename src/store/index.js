import { createLocalStore } from "./local";
export function createStore() {
    const backend = import.meta.env.VITE_BACKEND;
    if (backend === "firebase") {
        // Dynamic import so Firebase SDK is only bundled when needed
        return createLocalStore(); // replaced below
    }
    return createLocalStore();
}
export async function createStoreAsync() {
    const backend = import.meta.env.VITE_BACKEND;
    if (backend === "firebase") {
        const { createFirebaseStore } = await import("./firebase");
        return createFirebaseStore();
    }
    return createLocalStore();
}
