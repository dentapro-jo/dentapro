export const APP_NAME = 'DentaPro';
export const SUPPORTED_LANGUAGES = Object.freeze(['ar', 'en']);
export const STORAGE_KEYS = Object.freeze({ cart: 'dentapro_cart', products: 'dentapro_products', session: 'dentapro_session' });

// عند تفعيلها (بعد نشر Cloud Function وترقية Blaze)، إنشاء الطلبات (Quick Order وسلة الشراء)
// ينتقل من الحساب المحلي في المتصفح إلى دالة createOrder على الخادم
window.SERVER_ORDER_CREATION_ENABLED = false;

// رابط Cloudflare Worker المسؤول عن إرسال إشعارات الدفع (اتركه فارغاً لتعطيل الإرسال)
// مثال: 'https://dentapro-push.YOUR-NAME.workers.dev'
window.PUSH_WORKER_URL = 'https://dentapro-push.moh-a-alkh-4b3.workers.dev';
