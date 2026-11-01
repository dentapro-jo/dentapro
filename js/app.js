// رقم الإصدار الموحّد يُؤخذ من رابط app.js نفسه (index.html?v=...) فيُطبَّق على كل الملفات المحمّلة منه
const _V = new URL(import.meta.url).searchParams.get('v');
const _q = _V ? `?v=${encodeURIComponent(_V)}` : '';
const withVersion = (src) => src + _q;

// تُحمَّل الوحدات الخمس بالتوازي (كانت تُحمَّل واحدة بعد أخرى فتُطيل بدء المتجر على الشبكات البطيئة)
const [{ APP_CONFIG }, { APP_NAME }, { setState }, { wait }, { waitForFirebase }] = await Promise.all([
  import(`./config.js${_q}`),
  import(`./constants.js${_q}`),
  import(`./state.js${_q}`),
  import(`./utils.js${_q}`),
  import(`./firebase/firebase-services.js${_q}`),
]);

const CORE_SCRIPTS = [
  './js/products/products.js',
  './js/cart/cart.js',
  './js/location/location.js',
  './js/ui/navigation.js',
  './js/user/auth-ui.js',
  // وظائف الطلبات وطلب عرض السعر مطلوبة من واجهة العميل أيضاً،
  // وليست خاصة بلوحة الإدارة. كانت محمّلة سابقاً للأدمن فقط،
  // لذلك كانت أزرار العميل تستدعي دوال غير موجودة وتبدو وكأنها لا تعمل.
  './js/orders/orders-core.js',
];

// ملفات كبيرة لا يلزم تنفيذها لرسم الصفحة الأولى (الطلبات، الطلب السريع وعروض الأسعار، الرسائل).
// تُحمَّل عند الخمول بعد ظهور المتجر، أو فوراً عند أول تفاعل، أو عند أول نقرة على أي زر يخصها.
// دوالها الجاهزة للاستدعاء من الأزرار وغيرها تُعرَّف مؤقتاً كـ"بدائل" تنتظر التحميل ثم تنفّذ الدالة الحقيقية (انظر أسفل).
// الدوال التي تُستدعى مباشرة ويُنتظر منها قيمة راجعة نُقلت إلى orders/orders-core.js (ضمن CORE_SCRIPTS).
const LAZY_SCRIPTS = [
  './js/orders/checkout.js',
  './js/orders/orders.js',
  './js/messages/messages.js',
];
const LAZY_FUNCTIONS = ["_renderAdminOrdersInner", "addQOItemRow", "addQOSizeItems", "addQuoteItemRow", "addQuoteSizeItems", "addSendOrderCustomItem", "addSendOrderProduct", "addSendOrderSizeItems", "applyAdminUIPermissions", "assignUserRole", "autoFillFromProfile", "clearAdminChatImage", "clearClientChatImage", "clearQuoteImage", "closeAddPointsModal", "closeAdminSendOrderModal", "closeClientOrdersReportModal", "closePriceQuoteModal", "closeProfileMapPicker", "closeQOInfoModal", "closeQOLocationModal", "closeQuickOrderModal", "closeQuoteRequestModal", "computeQuotesBadgeCount", "confirmAddPoints", "confirmDeleteAccount", "confirmProfileMapPick", "detectProfileLocation", "fetchAllUsersList", "filterQOProductList", "filterQuoteProductList", "finalizeQuickOrderSend", "getAllClientsList", "getAllMessageThreadsForAdmin", "getClientMessageThread", "getOrderBreakdown", "getOrderDiscountPercent", "getOrderMapLink", "getSendOrderDiscountAmount", "handleAdminChatImageSelect", "handleClientChatImageSelect", "handleQuoteImageSelect", "messagesRef", "normalizeAdminPhone", "normalizeNumericInput", "openAddPointsModal", "openAdminSendOrderModal", "openAdminThreadModal", "openBroadcastMessageModal", "openClientMessages", "openClientOrders", "openClientOrdersReportModal", "openDeleteAccountModal", "openEditProfile", "openLastProductDetail", "openPriceQuoteModal", "openProfileMapPicker", "openQOInfoModal", "openQOLocationModal", "openQuickOrderModal", "openQuoteRequestModal", "printClientOrdersReport", "printOrderInvoice", "printQuoteInvoice", "proceedQuickOrderCheckout", "propagateProfileUpdateToRecords", "qoGetGPSLocation", "qoOnAddressType", "qoSwitchLocMethod", "reconcileGuestRecordNames", "removeQOItemRowByIdx", "removeQuoteItemRowByIdx", "removeSendOrderItem", "renderAdminMessages", "renderAdminOrders", "renderAdminQuotes", "renderAdminStaffList", "renderAdminThreadBody", "renderBroadcastChips", "renderBroadcastClientList", "renderClientMessagesThread", "renderClientOrders", "renderQOItemsList", "renderQuoteItemsList", "renderSendOrderItems", "repriceQOFamilyOffers", "resetQuotesBadgeCounter", "revokeUserRole", "roleActionButtonsHTML", "roleBadgeChip", "runClientOrdersReport", "saveOrderDeliveryFee", "saveProfile", "searchSendOrderProducts", "searchUserForRole", "selectQOProduct", "selectQuoteProduct", "sendAdminMessage", "sendAdminThreadReply", "sendBroadcastMessage", "sendClientMessage", "sendClientMessageFromInput", "sendQuotePricing", "sendWhatsAppAdmin", "sendWhatsAppQuote", "setSendOrderDiscountType", "setSendOrderPayMethod", "showAdminOrderDetail", "showClientRecord", "showQOProductList", "showQuoteOrderDetail", "showQuoteProductList", "submitAdminSendOrder", "submitQOInfo", "submitQOLocation", "submitQuickOrder", "submitQuoteRequest", "switchAdminTab", "switchBroadcastMode", "toggleBroadcastClient", "toggleEpPasswordField", "toggleSendOrderCustomForm", "triggerQuoteImgUpload", "updateOrderStatus", "updateQOItemQtyByIdx", "updateQuickOrderTotal", "updateQuoteItemQtyByIdx", "updateQuoteOrderStatus", "updateSendOrderGroupPrice", "updateSendOrderPrice", "updateSendOrderQty", "updateSendOrderTotalDisplay"];

// ملفات لوحة الإدارة فقط — لا تُحمّل للعميل العادي.
const ADMIN_SCRIPTS = [
  './js/admin/products.js',
  './js/admin/clients.js',
  './js/admin/coupons.js',
  './js/admin/credit.js',
  './js/admin/admin.js',
];

const DOMAIN_SCRIPTS = [...CORE_SCRIPTS, ...ADMIN_SCRIPTS]; // يبقى للتوافق مع أي كود يستورد هذا الاسم

function loadDomainScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = withVersion(src);
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadDomainScriptOrdered(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = withVersion(src);
    script.async = false; // يحافظ على ترتيب التنفيذ الأصلي، بس التحميل نفسه يصير بالتوازي
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

// تحميل الملفات الأساسية: إن فشل ملف نعيد المحاولة مرة واحدة بعد لحظة، وإن فشل ثانية
// لا نوقف الموقع كله: نسجّل الخطأ ونُظهر رسالة للزائر ونُكمل تشغيل بقية الأجزاء.
function loadCoreWithRetry(src) {
  return loadDomainScriptOrdered(src).catch(() =>
    new Promise(r => setTimeout(r, 800)).then(() => loadDomainScript(src))
  );
}

function showLoadFailureNotice() {
  if (document.getElementById('dpLoadFailureNotice')) return;
  const en = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const box = document.createElement('div');
  box.id = 'dpLoadFailureNotice';
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100000;max-width:92vw;' +
    'display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;padding:10px 14px;border-radius:14px;' +
    'background:#fff7ed;border:2px solid #f59e0b;color:#92400e;font:600 13px inherit;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.2)';
  const msg = document.createElement('span');
  msg.textContent = en ? 'Part of the site failed to load. Check your connection and reload.'
                       : 'تعذّر تحميل جزء من الموقع. تحقق من الاتصال ثم أعد التحميل.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = en ? 'Reload' : 'إعادة التحميل';
  btn.style.cssText = 'padding:6px 14px;border:0;border-radius:50px;background:#0b4f75;color:#fff;font:700 12px inherit;font-family:inherit;cursor:pointer';
  btn.onclick = () => location.reload();
  box.append(msg, btn);
  (document.body || document.documentElement).appendChild(box);
}

const _failedCoreScripts = [];
await Promise.all(CORE_SCRIPTS.map(src =>
  loadCoreWithRetry(src).catch(err => { _failedCoreScripts.push(src); console.error(err); })
));
if (_failedCoreScripts.length) showLoadFailureNotice();

// ---------- التحميل المؤجل لملفات الطلبات والرسائل ----------
let _lazyPromise = null;
function loadLazyScripts() {
  if (_lazyPromise) return _lazyPromise;
  _lazyPromise = Promise.all(LAZY_SCRIPTS.map(loadCoreWithRetry)).then(() => {
    window._lazyLoaded = true;
    document.dispatchEvent(new CustomEvent('dp:lazy-ready'));
    // رسائل/إشعارات وصلت قبل تحميل messages.js: نحدّث العدّادات الآن
    try { if (window.currentUser && typeof window._onMessagesUpdate === 'function') window._onMessagesUpdate(); } catch (e) { console.warn(e); }
  }).catch(err => {
    _lazyPromise = null; // نسمح بإعادة المحاولة عند الاستعمال التالي
    showLoadFailureNotice();
    throw err;
  });
  return _lazyPromise;
}
window.loadLazyScripts = loadLazyScripts;

function showLazyNotice() {
  let el = document.getElementById('lazyLoadingNotice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lazyLoadingNotice';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:6000;background:#0a5c8a;color:#fff;padding:10px 20px;border-radius:50px;font:700 13px/1.4 inherit;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    el.textContent = document.body.classList.contains('en') ? '⏳ Loading...' : '⏳ جاري التحميل...';
    document.body.appendChild(el);
  }
  return () => { const e = document.getElementById('lazyLoadingNotice'); if (e) e.remove(); };
}

// بدائل مؤقتة: أي استدعاء قبل اكتمال التحميل ينتظره ثم ينفّذ الدالة الحقيقية بنفس المعاملات.
// (تُستبدل تلقائياً بالتعريف الحقيقي عندما ينفّذ الملف المؤجل تعريفها)
for (const name of LAZY_FUNCTIONS) {
  if (typeof window[name] === 'function') continue; // معرّفة سابقاً في ملف أساسي
  const stub = function (...args) {
    // ضغط المستخدم زراً قبل اكتمال التحميل المؤجل: نُظهر له "جاري التحميل" بدل أن يبدو الزر لا يعمل
    const hideNotice = window._lazyLoaded ? null : showLazyNotice();
    return loadLazyScripts().then(() => {
      if (hideNotice) hideNotice();
      const real = window[name];
      if (typeof real !== 'function' || real === stub) throw new Error('lazy function missing: ' + name);
      return real.apply(this, args);
    }, (err) => { if (hideNotice) hideNotice(); throw err; });
  };
  window[name] = stub;
}

// موعد التحميل: عند أول تفاعل للمستخدم، أو بعد اكتمال تحميل الصفحة بوقت قصير.
// لا نبدأ ملفات الطلبات/الرسائل أثناء نافذة PageSpeed الأولى؛ هذا يقلل منافسة الشبكة
// والـ JavaScript على رسم الصفحة وLCP/TBT. أي تفاعل من المستخدم يحمّلها فوراً عند الحاجة.
let _lazyBootTimer = null;
const startLazyAfterLoad = () => {
  if (_lazyBootTimer) return;
  const schedule = () => {
    _lazyBootTimer = setTimeout(() => { loadLazyScripts().catch(() => {}); }, 4500);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true, passive: true });
};
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { loadLazyScripts().catch(() => {}); }, { once: true, passive: true }));
startLazyAfterLoad();

// ── تحميل كود لوحة الإدارة (ADMIN_SCRIPTS) فقط إذا كان المستخدم Staff ──
// نتحقق أولاً من الجلسة المحلية الفورية (بلا انتظار شبكة) لتفادي أي تأخير محسوس
// لأدمن يفتح الموقع، ثم نُثبّت القرار لاحقاً عبر onAuthStateChanged الحقيقي في firebase-init.js
let _adminScriptsLoaded = false;
let _adminScriptsLoadingPromise = null;

function loadAdminScriptsOnce() {
  if (_adminScriptsLoaded) return Promise.resolve();
  if (_adminScriptsLoadingPromise) return _adminScriptsLoadingPromise;
  // لوحة الإدارة تستعمل دوال الطلبات والرسائل مباشرة، فنحمّل الملفات المؤجلة أولاً
  _adminScriptsLoadingPromise = loadLazyScripts().then(() => Promise.all(ADMIN_SCRIPTS.map(loadDomainScriptOrdered))).then(() => {
    _adminScriptsLoaded = true;
    document.dispatchEvent(new CustomEvent('dp:admin-scripts-ready'));
  }).catch(err => {
    console.error('فشل تحميل كود لوحة الإدارة:', err);
    _adminScriptsLoadingPromise = null; // يسمح بإعادة المحاولة لاحقاً
  });
  return _adminScriptsLoadingPromise;
}
window.loadAdminScriptsOnce = loadAdminScriptsOnce; // متاحة لـ firebase-init.js وأي كود آخر يحتاج التأكد من جاهزيتها

// فحص أولي سريع من الجلسة المحلية المحفوظة (currentUser تُضبط في auth-ui.js أعلاه بشكل متزامن)
if (typeof window.currentUser !== 'undefined' && window.currentUser &&
    (window.currentUser.role === 'admin' || window.currentUser.role === 'manager')) {
  loadAdminScriptsOnce();
}

// لا ننتظر Firebase أو تهيئة المنتجات قبل إخفاء شاشة البداية.
// أي تأخير أو خطأ في الشبكة يجب ألا يمنع المستخدم من دخول الصفحة الرئيسية.
if (typeof window.initializeProductsModule === 'function') {
  window.initializeProductsModule().catch(err => console.error('Products init:', err));
}

// مؤقت أمان مستقل عن Firebase والمنتجات لإخفاء شاشة البداية دائماً.
setTimeout(() => {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.opacity = '0';
    splash.style.visibility = 'hidden';
    setTimeout(() => splash.remove(), 500);
  }
}, 450);

await waitForFirebase();
setState({ initialized: true });
document.documentElement.dataset.app = APP_NAME;
document.documentElement.dataset.language = APP_CONFIG.defaultLanguage;
await wait(0);

export { DOMAIN_SCRIPTS, loadDomainScript };
