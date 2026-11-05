export function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
export function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
export function formatCurrency(value, currency = 'د.أ') { return `${Number(value || 0).toLocaleString('ar-JO')} ${currency}`; }
