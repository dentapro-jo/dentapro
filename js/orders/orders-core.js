// دوال وبيانات صغيرة متزامنة تحتاجها الصفحة منذ البدء (عرض حالة الطلب، تتبّع الطلب، إجماليات عروض الأسعار...).
// فُصلت عن orders.js / checkout.js لأن هذين الملفين (مع messages.js) صارت تُحمَّل عند الخمول أو عند أول استعمال
// (انظر LAZY_SCRIPTS في js/app.js)، ودوال هذا الملف تُستدعى مباشرةً وتنتظر قيمة راجعة فلا تصلح بديلاً مؤجلاً.

var ORDER_STATUSES = [
  { key:'pending',   label:'في الانتظار',  icon:'fa-clock',          class:'status-pending'   },
  { key:'confirmed', label:'تم التأكيد',   icon:'fa-check-circle',   class:'status-confirmed' },
  { key:'preparing', label:'جاري التجهيز', icon:'fa-box-open',       class:'status-preparing' },
  { key:'shipped',   label:'في الشحن',     icon:'fa-shipping-fast',  class:'status-shipped'   },
  { key:'delivered', label:'تم التسليم',   icon:'fa-hand-holding',   class:'status-delivered' },
  { key:'cancelled', label:'ملغي',          icon:'fa-times-circle',   class:'status-cancelled' },
];
var TRACK_FLOW = ['pending','confirmed','preparing','shipped','delivered'];
function getStatusObj(key) {
  return ORDER_STATUSES.find(s => s.key === key) || ORDER_STATUSES[0];
}
function statusBadgeHTML(key) {
  const s = getStatusObj(key);
  return `<span class="status-badge ${s.class}"><i class="fas ${s.icon}"></i> ${s.label}</span>`;
}
function trackStepsHTML(currentStatus) {
  if (currentStatus === 'cancelled') {
    return `<div style="text-align:center;padding:16px;color:var(--danger);font-weight:700">
      <i class="fas fa-times-circle" style="font-size:28px;margin-bottom:6px;display:block"></i>
      تم إلغاء الطلب
    </div>`;
  }
  const currentIdx = TRACK_FLOW.indexOf(currentStatus);
  return `<div class="track-steps">` +
    TRACK_FLOW.map((key, i) => {
      const s = getStatusObj(key);
      const isDone   = i < currentIdx;
      const isActive = i === currentIdx;
      const cls = isDone ? 'done' : isActive ? 'active' : '';
      return `<div class="track-step ${cls}">
        <div class="track-step-icon"><i class="fas ${s.icon}"></i></div>
        <div class="track-step-label">${s.label}</div>
      </div>`;
    }).join('') +
  `</div>`;
}
function formatOrderTotal(order, opts = {}) {
  const currency = opts.currency || 'د.أ';
  const prefix = opts.prefix || '';
  if (order.payMethod === 'free') {
    return `${prefix}مجاناً`;
  }
  const hasCash = (order.total || 0) > 0;
  const hasPoints = order.payMethod === 'points' && (order.totalPoints || 0) > 0;
  if (hasPoints && hasCash) {
    return `${prefix}🏆 ${(order.totalPoints||0).toLocaleString()} نقطة + ${fmtPrice(order.total)} ${currency}`;
  } else if (hasPoints) {
    return `${prefix}🏆 ${(order.totalPoints||0).toLocaleString()} نقطة`;
  } else {
    return `${prefix}${fmtPrice(order.total||0)} ${currency}`;
  }
}
function getQuoteItemsTotal(q) {
  return q.items.reduce((s,i) => s + ((i.unitPrice||0) * (i.qty||1)), 0);
}
function getQuoteTotal(q) {
  const itemsTotal = getQuoteItemsTotal(q);
  return itemsTotal + (q.deliveryDetermined ? (q.deliveryFee || 0) : 0);
}
function rememberGuestQuote(quote) {
  if (!quote || !quote.id) return;
  try {
    const key = 'dentapro_guest_quote_refs';
    const refs = JSON.parse(localStorage.getItem(key) || '[]');
    const next = refs.filter(r => r.id !== quote.id);
    next.push({ id: quote.id, phone: quote.phone || '', createdAt: quote.createdAt || new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(next.slice(-30)));
  } catch(e) { console.warn('guest quote reference:', e); }
}
function getSortedProductsAr() {
  return products.filter(p => !p.parentId).sort((a,b) => a.ar.localeCompare(b.ar, 'ar')); // بطاقة واحدة للمادة؛ مقاساتها تنبثق عند اختيارها
}
var qoLocationData = { lat: null, lng: null, address: '', method: '' };
