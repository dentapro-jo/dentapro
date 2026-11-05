const state = { language: 'ar', initialized: false };
const listeners = new Set();
export function getState() { return state; }
export function setState(patch) { Object.assign(state, patch); listeners.forEach(fn => fn(state)); return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export default state;
