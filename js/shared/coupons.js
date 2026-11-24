// أكواد الخصم — منطق العميل: التحقق، الحساب، واجهة السلة، وتسجيل الاستعمال.
// الحماية الحقيقية (الصلاحية، الوقت، الجمهور، الحد الأدنى، سقف الخصم، عدد الاستعمال)
// تُفرض في Firestore Rules (coupons / coupon_uses / coupon_clients). هذا الملف للتجربة وللحساب فقط.
//
// حالة الكود المطبّق على السلة (تعيش في الذاكرة فقط):
//   window._couponState = { code, data, last: { ok, reason, discount } }

function normalizeCouponCode(raw) {
  // أرقام عربية → إنجليزية، حذف المسافات، أحرف كبيرة
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(raw || '').replace(/[٠-٩]/g, d => ar.indexOf(d)).replace(/\s+/g, '').toUpperCase();
}

// آخر 9 خانات من رقم الهاتف (أرقام فقط)
function dpPhone9(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

function dpCouponDiscountLabel(c) {
  const parts = [];
  if (c.value > 0) parts.push(c.type === 'percent' ? `${c.value}%` : `${fmtPrice(c.value)} ${t('د.أ', 'JD')}`);
  if (c.freeDelivery) parts.push(t('توصيل مجاني', 'Free delivery'));
  return parts.join(' + ') || '—';
}

// ---------- التحقق من الكود عند إدخاله (قراءة من الخادم) ----------
async function dpFetchCouponFromServer(code) {
  const ref = window._fbDoc2('coupons', code);
  const snap = await window._fbGetDocFromServer(ref);
  return snap.exists() ? snap.data() : null;
}

async function dpClientCouponCount(code, uid) {
  try {
    const snap = await window._fbGetDocFromServer(window._fbDoc2('coupon_clients', code + '__' + uid));
    return snap.exists() ? (snap.data().count || 0) : 0;
  } catch (e) { return 0; }
}

async function dpClientHasPreviousOrders(email) {
  const q = window._fbQuery(window._fbCollection(window._db, 'orders'), window._fbWhere('clientEmail', '==', email), window._fbLimit(1));
  const snap = await window._fbGetDocs(q);
  return !snap.empty;
}

// يرجع { ok:true, data } أو { ok:false, reason }
async function dpValidateCouponForClient(code) {
  if (!currentUser || !currentUser.uid) return { ok: false, reason: t('سجّل الدخول لاستخدام كود الخصم', 'Please sign in to use a discount code') };
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, reason: t('الكود غير صحيح', 'Invalid code') };
  let data;
  try { data = await dpFetchCouponFromServer(code); }
  catch (e) { return { ok: false, reason: t('تعذر التحقق من الكود، تأكد من الاتصال بالإنترنت', 'Could not verify the code, check your connection') }; }
  if (!data || !data.active) return { ok: false, reason: t('الكود غير صحيح أو غير فعّال', 'Invalid or inactive code') };
  const now = Date.now();
  if (data.startsAtMs && now < data.startsAtMs) return { ok: false, reason: t('هذا الكود لم يبدأ بعد', 'This code is not active yet') };
  if (data.expiresAtMs && now > data.expiresAtMs) return { ok: false, reason: t('انتهت صلاحية الكود', 'This code has expired') };
  if (data.maxTotal && (data.usedCount || 0) >= data.maxTotal) return { ok: false, reason: t('نفد هذا الكود (بلغ الحد الأقصى للاستخدام)', 'This code has reached its usage limit') };
  if (data.audience === 'specific') {
    let allowed = false;
    try { allowed = (await window._fbGetDocFromServer(window._fbDoc2('coupon_targets', code + '__' + currentUser.uid))).exists(); } catch (e) {}
    if (!allowed) return { ok: false, reason: t('هذا الكود غير متاح لحسابك', 'This code is not available for your account') };
  }
  const used = await dpClientCouponCount(code, currentUser.uid);
  if (data.perClientMax && used >= data.perClientMax) return { ok: false, reason: t('سبق أن استخدمت هذا الكود الحد الأقصى المسموح', 'You have already used this code the maximum number of times') };
  if (data.audience === 'new') {
    let had = true;
    try { had = await dpClientHasPreviousOrders(currentUser.email); } catch (e) { had = true; }
    // رقم الهاتف يُستعمل مرة واحدة فقط لهذا الكود (يمنع إعادة الاستفادة بحساب جديد)
    let phoneUsed = false;
    const p9 = dpPhone9(currentUser.phone);
    if (p9) { try { phoneUsed = (await window._fbGetDocFromServer(window._fbDoc2('coupon_phones', code + '__' + p9))).exists(); } catch (e) {} }
    if (used > 0 || had || phoneUsed) return { ok: false, reason: t('هذا الكود للطلب الأول فقط', 'This code is for first orders only') };
  }
  return { ok: true, data };
}

async function applyCouponFromInput() {
  const input = document.getElementById('couponInput');
  const btn = document.getElementById('couponApplyBtn');
  const code = normalizeCouponCode(input ? input.value : '');
  if (!code) return;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  const res = await dpValidateCouponForClient(code);
  if (btn) { btn.disabled = false; btn.textContent = t('تطبيق', 'Apply'); }
  if (!res.ok) {
    const err = document.getElementById('couponMsg');
    if (err) { err.style.color = 'var(--danger)'; err.textContent = '⚠️ ' + res.reason; }
    return;
  }
  window._couponState = { code, data: res.data, last: null };
  if (typeof updateCartUI === 'function') updateCartUI();
  renderCouponBox();
  showToast('🎟️ ' + t('تم تطبيق الكود', 'Code applied'), 'success');
}

function removeCoupon() {
  window._couponState = null;
  window._couponOpen = false;
  if (typeof updateCartUI === 'function') updateCartUI();
  renderCouponBox();
}

// بعد إتمام الطلب أو تسجيل الخروج
function dpClearCoupon() {
  window._couponState = null;
  window._couponOpen = false;
  if (typeof renderCouponBox === 'function') renderCouponBox();
}

// ---------- حساب الخصم على السلة ----------
function dpCouponItemEligible(item, c) {
  const isOffer = item.isBundle || (item.basePrice && item.price < item.basePrice);
  if (isOffer && c.applyOnOffers === false) return false;
  if (!c.scope || c.scope === 'all') return true;
  if (item.isBundle) return false; // الباقة لا تدخل في كود محدد بمواد أو أقسام
  const pid = item.parentId || item.id;
  if (c.scope === 'products') return (c.productIds || []).some(id => String(id) === String(pid) || String(id) === String(item.id));
  if (c.scope === 'categories') {
    const p = products.find(x => x.id === pid) || products.find(x => x.id === item.id);
    const cat = (p && p.cat) || item.cat;
    return (c.categoryIds || []).some(id => String(id) === String(cat));
  }
  return true;
}

// يغلّف computeGeneralDiscountForCart: لو فيه كود مطبّق وصالح للسلة الحالية يعتمد خصم الكود،
// وإلا يرجع للخصم العام/المخصص كما كان. الناتج بنفس الشكل + (couponCode, couponDiscount) عند التطبيق.
async function computeCartDiscountWithCoupon(cartItems, clientEmail, clientPhone) {
  const st = window._couponState;
  if (!st || !st.data || !currentUser) return computeGeneralDiscountForCart(cartItems, clientEmail, clientPhone);
  const c = st.data;
  const setLast = (last) => {
    const prev = JSON.stringify(st.last || null);
    st.last = last;
    if (JSON.stringify(last) !== prev) setTimeout(() => { if (typeof renderCouponBox === 'function') renderCouponBox(); }, 0);
  };

  const raw = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const now = Date.now();
  let reason = null;
  if (!c.active) reason = t('الكود غير فعّال', 'Code inactive');
  else if (c.startsAtMs && now < c.startsAtMs) reason = t('الكود لم يبدأ بعد', 'Code not active yet');
  else if (c.expiresAtMs && now > c.expiresAtMs) reason = t('انتهت صلاحية الكود', 'Code expired');
  else if (c.minPurchase && raw < c.minPurchase) reason = t(`الكود يتطلب مشتريات لا تقل عن ${fmtPrice(c.minPurchase)} د.أ`, `Requires a minimum purchase of ${fmtPrice(c.minPurchase)} JD`);

  const eligibleTotal = reason ? 0 : cartItems.filter(i => dpCouponItemEligible(i, c)).reduce((s, i) => s + i.price * i.qty, 0);
  if (!reason && eligibleTotal <= 0 && !c.freeDelivery) reason = t('لا توجد في سلتك مواد يشملها هذا الكود', 'No items in your cart are covered by this code');

  if (reason) {
    setLast({ ok: false, reason, discount: 0 });
    return computeGeneralDiscountForCart(cartItems, clientEmail, clientPhone);
  }

  // الخصم المخصص يُلغى مع الكود، إلا إن فعّل الأدمن إبقاءه
  let customPercent = 0;
  if (c.keepCustomDiscount) {
    const custom = await computeGeneralDiscountForCart(cartItems, clientEmail, clientPhone);
    if (custom) customPercent = custom.discountPercent || 0;
  }
  const customDiscount = customPercent ? Math.round(raw * customPercent / 100 * 100) / 100 : 0;
  const base = eligibleTotal * (1 - customPercent / 100);

  let disc = c.type === 'percent' ? base * (c.value || 0) / 100 : Math.min(c.value || 0, base);
  if (c.maxDiscount && disc > c.maxDiscount) disc = c.maxDiscount;
  disc = Math.max(0, Math.round(disc * 100) / 100);

  const total = Math.max(0, Math.round((raw - customDiscount - disc) * 100) / 100);
  setLast({ ok: true, reason: null, discount: disc });
  return {
    originalTotal: raw,
    total,
    discountPercent: raw > 0 ? Math.round((1 - total / raw) * 10000) / 100 : 0,
    couponCode: st.code,
    couponDiscount: disc,
    couponEligibleTotal: Math.round(eligibleTotal * 100) / 100
  };
}

// توصيل مجاني بالكود؟ (يُستدعى بعد حساب الخصم، فحالة last محدّثة)
function dpCouponGrantsFreeDelivery() {
  const st = window._couponState;
  return !!(st && st.data && st.data.freeDelivery && st.last && st.last.ok);
}

// ---------- واجهة السلة ----------
function renderCouponBox() {
  const box = document.getElementById('couponBox');
  if (!box) return;
  if (typeof cart !== 'undefined' && !cart.length) { box.innerHTML = ''; return; }
  const st = window._couponState;

  if (st && st.data) {
    const ok = !st.last || st.last.ok;
    const saved = st.last && st.last.ok && st.last.discount > 0 ? ` — ${t('وفّرت', 'saved')} ${fmtPrice(st.last.discount)} ${t('د.أ', 'JD')}` : '';
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-radius:12px;border:1.5px solid ${ok ? 'var(--success)' : '#d97706'};background:${ok ? '#f0fff4' : '#fffaf0'}">
        <div style="font-size:13px;font-weight:700;min-width:0">
          🎟️ <span dir="ltr">${escHtml(st.code)}</span> <span style="color:var(--text-muted);font-weight:600">(${escHtml(dpCouponDiscountLabel(st.data))})</span>${ok ? escHtml(saved) : ''}
          ${ok ? '' : `<div style="font-size:12px;color:#d97706;font-weight:700">⚠️ ${escHtml(st.last.reason)}</div>`}
        </div>
        <button type="button" onclick="removeCoupon()" aria-label="إزالة الكود" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px"><i class="fas fa-times"></i></button>
      </div>`;
    return;
  }

  if (!window._couponOpen) {
    box.innerHTML = `<button type="button" onclick="window._couponOpen=true;renderCouponBox()" style="background:none;border:none;color:var(--primary);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:0">🎟️ ${t('لديك كود خصم؟', 'Have a discount code?')}</button>`;
    return;
  }
  box.innerHTML = `
    <div style="display:flex;gap:8px">
      <input type="text" id="couponInput" class="form-input" dir="ltr" placeholder="${t('أدخل كود الخصم', 'Enter discount code')}" autocomplete="off"
        style="flex:1;text-transform:uppercase" onkeydown="if(event.key==='Enter'){event.preventDefault();applyCouponFromInput();}">
      <button type="button" id="couponApplyBtn" onclick="applyCouponFromInput()" style="padding:0 16px;border-radius:var(--radius-sm);border:none;background:var(--primary);color:#fff;font-family:inherit;font-weight:700;cursor:pointer">${t('تطبيق', 'Apply')}</button>
    </div>
    <div id="couponMsg" style="font-size:12px;font-weight:700;margin-top:6px"></div>`;
}

// ---------- كتابة الطلب مع تسجيل استعمال الكود (دفعة واحدة ذرّية) ----------
// تُرفض الدفعة كلها من القواعد إن لم تتحقق شروط الكود وقت الكتابة (انتهى، استُنفد، سبق استعماله...).
async function dpSetOrderWithCoupon(orderNum, order) {
  const uid = currentUser && currentUser.uid;
  if (!uid) throw new Error('coupon-requires-login');
  const code = order.couponCode;
  const cRef = window._fbDoc2('coupons', code);
  const cSnap = await window._fbGetDocFromServer(cRef);
  if (!cSnap.exists()) throw new Error('coupon-missing');
  const cd = cSnap.data();
  const clRef = window._fbDoc2('coupon_clients', code + '__' + uid);
  const clSnap = await window._fbGetDocFromServer(clRef);
  const prevCount = clSnap.exists() ? (clSnap.data().count || 0) : 0;

  const batch = window._fbWriteBatch();
  batch.set(window._fbDoc2('orders', orderNum), order);
  const useDoc = {
    code, uid, email: currentUser.email, orderId: orderNum,
    discount: order.couponDiscount, createdAt: new Date().toISOString()
  };
  if (cd.audience === 'new') {
    const p9 = dpPhone9(order.phone);
    if (!p9) throw new Error('coupon-needs-phone');
    const phRef = window._fbDoc2('coupon_phones', code + '__' + p9);
    const phSnap = await window._fbGetDocFromServer(phRef);
    if (phSnap.exists()) throw Object.assign(new Error('coupon-phone-used'), { code: 'permission-denied' });
    useDoc.phone9 = p9;
    batch.set(phRef, { code, phone9: p9, uid });
  }
  batch.set(window._fbDoc2('coupon_uses', orderNum), useDoc);
  batch.set(clRef, { code, uid, count: prevCount + 1 });
  batch.update(cRef, { usedCount: (cd.usedCount || 0) + 1, lastOrderId: orderNum });
  await batch.commit();
}

// ---------- إرجاع استعمال الكود عند إلغاء الطلب (للموظف/الأدمن) ----------
// ينقص عدّاد الكود وعدّاد العميل بواحد، ويضع علامة couponRefunded على الطلب حتى لا يتكرر الإرجاع.
async function dpReleaseCouponUse(order, docId) {
  if (!order || !order.couponCode || !order.clientUid || order.couponRefunded) return;
  try {
    const cRef = window._fbDoc2('coupons', order.couponCode);
    const clRef = window._fbDoc2('coupon_clients', order.couponCode + '__' + order.clientUid);
    const [cSnap, clSnap] = await Promise.all([window._fbGetDocFromServer(cRef), window._fbGetDocFromServer(clRef)]);
    const batch = window._fbWriteBatch();
    if (cSnap.exists() && (cSnap.data().usedCount || 0) > 0) batch.update(cRef, { usedCount: cSnap.data().usedCount - 1 });
    if (clSnap.exists() && (clSnap.data().count || 0) > 0) batch.update(clRef, { count: clSnap.data().count - 1 });
    batch.update(window._fbDoc(docId), { couponRefunded: true });
    await batch.commit();
  } catch (e) { console.warn('dpReleaseCouponUse:', e && e.message); }
}
