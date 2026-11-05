// إدارة أكواد الخصم (للأدمن فقط): قائمة الأكواد + نافذة إضافة/تعديل.
// تُخزَّن في Firestore: coupons/{CODE}. التحقق النهائي عند الاستعمال تفرضه Firestore Rules.

var _adminCoupons = [];
var _couponEdit = null; // { isNew, productIds:[], categoryIds:[] }

function dpCouponStatus(c) {
  const now = Date.now();
  if (!c.active) return { txt: 'متوقف', color: '#6b7a86' };
  if (c.startsAtMs && now < c.startsAtMs) return { txt: 'لم يبدأ', color: '#d97706' };
  if (c.expiresAtMs && now > c.expiresAtMs) return { txt: 'منتهي', color: 'var(--danger)' };
  if (c.maxTotal && (c.usedCount || 0) >= c.maxTotal) return { txt: 'مستنفد', color: 'var(--danger)' };
  return { txt: 'فعّال', color: 'var(--success)' };
}

function dpCloseCouponModal(id) { const m = document.getElementById(id); if (m) m.remove(); }

function dpCouponModalShell(id, title, bodyHtml, maxWidth) {
  dpCloseCouponModal(id);
  const m = document.createElement('div');
  m.id = id;
  m.className = 'modal-overlay open';
  m.style.zIndex = id === 'couponEditModal' ? '3300' : '3200';
  m.innerHTML = `
    <div class="modal" style="max-width:${maxWidth || 560}px">
      <div class="modal-header" style="background:linear-gradient(135deg,#7c3aed,#a78bfa)">
        <div class="modal-title"><i class="fas fa-ticket-alt"></i> <span>${title}</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="dpCloseCouponModal('${id}')"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding:16px 20px;max-height:75vh;overflow-y:auto">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(m);
  return m;
}

// ---------- القائمة ----------
async function openCouponsAdmin() {
  if (!isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  dpCouponModalShell('couponsModal', 'أكواد الخصم', '<div id="couponsListBody" style="text-align:center;padding:24px"><div class="spinner" style="margin:0 auto;width:26px;height:26px;border-width:4px"></div></div>', 640);
  await dpLoadAdminCoupons();
}

async function dpLoadAdminCoupons() {
  try {
    const snap = await window._fbGetDocs(window._fbCollection(window._db, 'coupons'));
    _adminCoupons = snap.docs.map(d => ({ ...d.data(), code: d.id }));
  } catch (e) {
    _adminCoupons = [];
    const b = document.getElementById('couponsListBody');
    if (b) b.innerHTML = `<div style="color:var(--danger);font-weight:700">تعذر تحميل الأكواد — تأكد من نشر قواعد Firestore الجديدة</div>`;
    return;
  }
  dpRenderCouponsList();
}

function dpRenderCouponsList() {
  const b = document.getElementById('couponsListBody');
  if (!b) return;
  const list = [..._adminCoupons].sort((a, c) => (c.createdAt || '').localeCompare(a.createdAt || ''));
  b.style.textAlign = 'start'; b.style.padding = '0';
  b.innerHTML = `
    <button onclick="openCouponEditor()" style="width:100%;padding:11px;margin-bottom:12px;border:none;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer"><i class="fas fa-plus"></i> كود جديد</button>
    ${list.length ? list.map(c => {
      const st = dpCouponStatus(c);
      const label = (typeof dpCouponDiscountLabel === 'function') ? dpCouponDiscountLabel(c) : '';
      const uses = `${c.usedCount || 0}${c.maxTotal ? ' / ' + c.maxTotal : ''}`;
      return `
      <div style="border:1.5px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-weight:900;font-size:15px" dir="ltr">${escHtml(c.code)}</div>
          <span style="font-size:12px;font-weight:800;color:${st.color}">${st.txt}</span>
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin:6px 0">
          ${escHtml(label)} • استُخدم: ${uses}
          ${c.expiresAtMs ? ` • ينتهي: ${new Date(c.expiresAtMs).toLocaleDateString('en-GB')}` : ''}
          ${c.audience === 'specific' ? ' • عملاء معنيون' : c.audience === 'new' ? ' • الطلب الأول' : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="openCouponEditor('${escJsAttr(c.code)}')" style="padding:6px 14px;border-radius:50px;border:1.5px solid var(--primary);background:#fff;color:var(--primary);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">تعديل</button>
          <button onclick="toggleCouponActive('${escJsAttr(c.code)}')" style="padding:6px 14px;border-radius:50px;border:1.5px solid var(--border);background:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">${c.active ? 'إيقاف' : 'تفعيل'}</button>
          <button onclick="deleteCoupon('${escJsAttr(c.code)}')" style="padding:6px 14px;border-radius:50px;border:1.5px solid var(--danger);background:#fff;color:var(--danger);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">حذف</button>
        </div>
      </div>`;
    }).join('') : '<div style="text-align:center;color:var(--text-muted);padding:20px">لا توجد أكواد بعد</div>'}`;
}

async function toggleCouponActive(code) {
  const c = _adminCoupons.find(x => x.code === code);
  if (!c) return;
  try {
    await window._fbUpdateDoc(window._fbDoc2('coupons', code), { active: !c.active });
    c.active = !c.active;
    dpRenderCouponsList();
    showToast(c.active ? '✅ تم تفعيل الكود' : '⏸️ تم إيقاف الكود', 'success');
  } catch (e) { showToast('❌ تعذر التحديث: ' + (e.code || e.message), 'error'); }
}

async function deleteCoupon(code) {
  if (!confirm(`حذف الكود ${code} نهائياً؟ (سجل استعماله السابق يبقى محفوظاً)`)) return;
  try {
    await window._fbDeleteDoc(window._fbDoc2('coupons', code));
    try {
      const old = await window._fbGetDocs(window._fbQuery(window._fbCollection(window._db, 'coupon_targets'), window._fbWhere('code', '==', code)));
      await Promise.all(old.docs.map(d => window._fbDeleteDoc(d.ref)));
    } catch (e) {}
    _adminCoupons = _adminCoupons.filter(x => x.code !== code);
    dpRenderCouponsList();
    showToast('🗑️ تم حذف الكود', 'success');
  } catch (e) { showToast('❌ تعذر الحذف: ' + (e.code || e.message), 'error'); }
}

// ---------- نافذة الإضافة/التعديل ----------
function dpMsToLocalInput(ms) { return ms ? toDatetimeLocalValue(new Date(ms).toISOString()) : ''; }

async function openCouponEditor(code) {
  const existing = code ? _adminCoupons.find(x => x.code === code) : null;
  const c = existing || { type: 'percent', value: 10, maxDiscount: 0, minPurchase: 0, startsAtMs: 0, expiresAtMs: 0,
    audience: 'all', perClientMax: 1, maxTotal: 0, scope: 'all', productIds: [], categoryIds: [],
    keepCustomDiscount: false, applyOnOffers: true, freeDelivery: false, active: true };
  _couponEdit = { isNew: !existing, productIds: [...(c.productIds || [])], categoryIds: [...(c.categoryIds || [])], targetUids: [] };
  if (existing && existing.audience === 'specific') {
    try {
      const q = window._fbQuery(window._fbCollection(window._db, 'coupon_targets'), window._fbWhere('code', '==', code));
      _couponEdit.targetUids = (await window._fbGetDocs(q)).docs.map(d => d.data().uid);
    } catch (e) {}
  }

  let clients = [];
  try { clients = (await fetchAllUsersList()).filter(u => u.role === 'client'); } catch (e) {}
  try { if (typeof ensureAllProductsLoaded === 'function') await ensureAllProductsLoaded(); } catch (e) {}

  const clientBoxes = clients.map(u => {
    return `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px">
      <input type="checkbox" class="couponClientCb" value="${escHtml(u.uid)}" data-label="${escHtml((u.clinic || u.firstName || u.name || '').slice(0, 60))}" ${_couponEdit.targetUids.includes(u.uid) ? 'checked' : ''}>
      ${escHtml(u.firstName || u.name || '')} — ${escHtml(u.clinic || '')}</label>`;
  }).join('') || '<div style="font-size:12px;color:var(--text-muted)">لا يوجد عملاء مسجلون</div>';

  const catBoxes = (typeof categories !== 'undefined' ? categories : []).map(k =>
    `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px">
      <input type="checkbox" class="couponCatCb" value="${escHtml(k.id)}" ${_couponEdit.categoryIds.some(x => String(x) === String(k.id)) ? 'checked' : ''}> ${escHtml(k.ar || k.id)}</label>`).join('');

  const lbl = 'display:block;font-size:12px;font-weight:700;margin:12px 0 4px';
  const body = `
    <label style="${lbl}">الكود ${_couponEdit.isNew ? '' : '(لا يُعدَّل)'}</label>
    <div style="display:flex;gap:8px">
      <input type="text" id="cpCode" class="form-input" dir="ltr" maxlength="30" placeholder="كود عشوائي طويل أصعب تخميناً" value="${escHtml(c.code || '')}" ${_couponEdit.isNew ? '' : 'disabled'} style="flex:1;text-transform:uppercase">
      ${_couponEdit.isNew ? `<button type="button" onclick="dpGenCouponCode()" style="padding:0 14px;border-radius:var(--radius-sm);border:1.5px solid var(--primary);background:#fff;color:var(--primary);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">🎲 توليد كود</button>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px">الأكواد القصيرة أو الرقمية (مثل 0185) سهلة التخمين، فاستعمل الكود العشوائي للأكواد المهمة.</div>

    <label style="${lbl}">نوع الخصم وقيمته</label>
    <div style="display:flex;gap:8px">
      <select id="cpType" class="form-input" style="flex:1"><option value="percent" ${c.type==='percent'?'selected':''}>نسبة %</option><option value="fixed" ${c.type==='fixed'?'selected':''}>مبلغ ثابت (د.أ)</option></select>
      <input type="number" id="cpValue" class="form-input" min="0" step="any" value="${c.value ?? 0}" style="flex:1">
    </div>
    <label style="${lbl}">سقف الخصم (د.أ، للنسبة — 0 = بدون سقف)</label>
    <input type="number" id="cpMaxDiscount" class="form-input" min="0" step="any" value="${c.maxDiscount || 0}">

    <label style="${lbl}">الحد الأدنى لقيمة الشراء (د.أ — 0 = بدون)</label>
    <input type="number" id="cpMinPurchase" class="form-input" min="0" step="any" value="${c.minPurchase || 0}">

    <label style="${lbl}">يبدأ في (اختياري)</label>
    <input type="datetime-local" id="cpStarts" class="form-input" value="${dpMsToLocalInput(c.startsAtMs)}">
    <label style="${lbl}">ينتهي في (اختياري — بدونه يبقى مفتوحاً)</label>
    <input type="datetime-local" id="cpExpires" class="form-input" value="${dpMsToLocalInput(c.expiresAtMs)}">

    <label style="${lbl}">من يستطيع استخدامه</label>
    <select id="cpAudience" class="form-input" onchange="dpCouponAudienceChanged()">
      <option value="all" ${c.audience==='all'?'selected':''}>الجميع</option>
      <option value="specific" ${c.audience==='specific'?'selected':''}>عملاء معنيون</option>
      <option value="new" ${c.audience==='new'?'selected':''}>العملاء الجدد (الطلب الأول فقط)</option>
    </select>
    <div id="cpClientsBox" style="${c.audience==='specific'?'':'display:none;'}max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:8px">${clientBoxes}</div>

    <label style="${lbl}">عدد مرات الاستخدام للعميل الواحد (0 = مفتوح حتى ينتهي الوقت)</label>
    <input type="number" id="cpPerClient" class="form-input" min="0" step="1" value="${c.perClientMax ?? 1}">
    <label style="${lbl}">إجمالي مرات الاستخدام لكل الكود (0 = بلا حد)</label>
    <input type="number" id="cpMaxTotal" class="form-input" min="0" step="1" value="${c.maxTotal || 0}">

    <label style="${lbl}">المواد المشمولة</label>
    <select id="cpScope" class="form-input" onchange="dpCouponScopeChanged()">
      <option value="all" ${c.scope==='all'?'selected':''}>كل المواد</option>
      <option value="products" ${c.scope==='products'?'selected':''}>مواد محددة</option>
      <option value="categories" ${c.scope==='categories'?'selected':''}>أقسام محددة</option>
    </select>
    <div id="cpProductsBox" style="${c.scope==='products'?'':'display:none;'}margin-top:8px">
      <input type="text" id="cpProductSearch" class="form-input" placeholder="🔍 ابحث عن المادة..." autocomplete="off" oninput="dpFillMaterialSelect('cpProductSelect','cpProductSearch')" style="margin-bottom:8px">
      <div style="display:flex;gap:8px"><select id="cpProductSelect" class="form-input" style="flex:1"></select>
        <button type="button" onclick="dpCouponAddProduct()" style="padding:0 16px;border-radius:var(--radius-sm);border:none;background:var(--primary);color:#fff;font-family:inherit;font-weight:700;cursor:pointer">إضافة</button></div>
      <div id="cpProductChips" style="margin-top:8px"></div>
    </div>
    <div id="cpCatsBox" style="${c.scope==='categories'?'':'display:none;'}max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:8px">${catBoxes}</div>

    <div style="margin-top:14px;padding:12px;border-radius:12px;background:#f8fbfd;border:1.5px solid var(--border)">
      <div style="font-size:12px;font-weight:800;margin-bottom:8px">عند استعمال الكود</div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0"><input type="checkbox" id="cpKeepCustom" ${c.keepCustomDiscount?'checked':''}> إبقاء الخصم المخصص للعميل مع الكود <small style="color:var(--text-muted)">(إن أُلغي يُعتمد خصم الكود فقط)</small></label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0"><input type="checkbox" id="cpOnOffers" ${c.applyOnOffers!==false?'checked':''}> تطبيق الكود على بنود عروض الكميات والباقات <small style="color:var(--text-muted)">(إن أُلغي تبقى بسعرها دون خصم إضافي)</small></label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0"><input type="checkbox" id="cpFreeDelivery" ${c.freeDelivery?'checked':''}> توصيل مجاني مع الكود</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:5px 0"><input type="checkbox" id="cpActive" ${c.active!==false?'checked':''}> الكود فعّال</label>
    </div>

    <div id="cpError" style="display:none;color:var(--danger);font-size:13px;font-weight:700;margin-top:10px"></div>
    <button onclick="saveCoupon()" style="width:100%;margin-top:14px;padding:13px;border:none;border-radius:50px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer"><i class="fas fa-save"></i> حفظ الكود</button>`;
  dpCouponModalShell('couponEditModal', _couponEdit.isNew ? 'كود جديد' : 'تعديل الكود', body, 560);
  dpFillMaterialSelect('cpProductSelect', 'cpProductSearch', '');
  dpRenderCouponProductChips();
}

// كود عشوائي (10 خانات، بلا حروف متشابهة) يصعب تخمينه
function dpGenCouponCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  document.getElementById('cpCode').value = [...arr].map(n => alphabet[n % alphabet.length]).join('');
}

function dpCouponAudienceChanged() {
  document.getElementById('cpClientsBox').style.display = document.getElementById('cpAudience').value === 'specific' ? 'block' : 'none';
  if (document.getElementById('cpAudience').value === 'new') document.getElementById('cpPerClient').value = 1;
}
function dpCouponScopeChanged() {
  const v = document.getElementById('cpScope').value;
  document.getElementById('cpProductsBox').style.display = v === 'products' ? 'block' : 'none';
  document.getElementById('cpCatsBox').style.display = v === 'categories' ? 'block' : 'none';
}

function dpCouponAddProduct() {
  const id = parseInt(document.getElementById('cpProductSelect').value);
  if (!id) { showToast('⚠️ اختر مادة أولاً', 'error'); return; }
  if (!_couponEdit.productIds.includes(id)) _couponEdit.productIds.push(id);
  document.getElementById('cpProductSelect').value = '';
  dpRenderCouponProductChips();
}
function dpCouponRemoveProduct(id) {
  _couponEdit.productIds = _couponEdit.productIds.filter(x => x !== id);
  dpRenderCouponProductChips();
}
function dpRenderCouponProductChips() {
  const box = document.getElementById('cpProductChips');
  if (!box) return;
  box.innerHTML = _couponEdit.productIds.map(id => {
    const p = products.find(x => x.id === id);
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin:0 0 6px 6px;border-radius:50px;background:#eaf4fb;font-size:12px;font-weight:700">${escHtml(p ? p.ar : '#' + id)}
      <button type="button" onclick="dpCouponRemoveProduct(${id})" style="background:none;border:none;color:var(--danger);cursor:pointer">×</button></span>`;
  }).join('') || '<span style="font-size:12px;color:var(--text-muted)">لم تُضف مواد بعد</span>';
}

async function saveCoupon() {
  const err = (m) => { const e = document.getElementById('cpError'); e.textContent = m; e.style.display = 'block'; };
  const num = (id) => { const v = parseFloat(document.getElementById(id).value); return isFinite(v) && v > 0 ? v : 0; };

  const code = normalizeCouponCode(document.getElementById('cpCode').value);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return err('الكود: 3 إلى 30 خانة (أحرف إنجليزية أو أرقام أو - _)');
  if (_couponEdit.isNew && (code.length < 8 || /^[0-9]+$/.test(code)) &&
      !confirm('هذا الكود قصير أو أرقام فقط، فيسهل تخمينه من أي عميل مسجّل. هل تريد المتابعة به؟')) return;
  const type = document.getElementById('cpType').value;
  const value = num('cpValue');
  const freeDelivery = document.getElementById('cpFreeDelivery').checked;
  if (type === 'percent' && value > 100) return err('نسبة الخصم لا تتجاوز 100%');
  if (value <= 0 && !freeDelivery) return err('حدد قيمة الخصم، أو فعّل التوصيل المجاني');

  const startsAtMs = document.getElementById('cpStarts').value ? new Date(document.getElementById('cpStarts').value).getTime() : 0;
  const expiresAtMs = document.getElementById('cpExpires').value ? new Date(document.getElementById('cpExpires').value).getTime() : 0;
  if (expiresAtMs && expiresAtMs <= Date.now()) return err('تاريخ الانتهاء يجب أن يكون بالمستقبل');
  if (expiresAtMs && startsAtMs && expiresAtMs <= startsAtMs) return err('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء');

  const audience = document.getElementById('cpAudience').value;
  const targets = audience === 'specific' ? [...document.querySelectorAll('.couponClientCb:checked')].map(cb => ({ uid: cb.value, label: cb.dataset.label || '' })) : [];
  if (audience === 'specific' && !targets.length) return err('اختر عميلاً واحداً على الأقل');

  const scope = document.getElementById('cpScope').value;
  const productIds = scope === 'products' ? [..._couponEdit.productIds] : [];
  const categoryIds = scope === 'categories' ? [...document.querySelectorAll('.couponCatCb:checked')].map(cb => cb.value) : [];
  if (scope === 'products' && !productIds.length) return err('أضف مادة واحدة على الأقل');
  if (scope === 'categories' && !categoryIds.length) return err('اختر قسماً واحداً على الأقل');

  const data = {
    type, value,
    maxDiscount: type === 'percent' ? num('cpMaxDiscount') : 0,
    minPurchase: num('cpMinPurchase'),
    startsAtMs, expiresAtMs,
    audience,
    perClientMax: audience === 'new' ? 1 : Math.floor(num('cpPerClient')),
    maxTotal: Math.floor(num('cpMaxTotal')),
    scope, productIds, categoryIds,
    keepCustomDiscount: document.getElementById('cpKeepCustom').checked,
    applyOnOffers: document.getElementById('cpOnOffers').checked,
    freeDelivery,
    active: document.getElementById('cpActive').checked,
  };

  try {
    const ref = window._fbDoc2('coupons', code);
    if (_couponEdit.isNew) {
      const ex = await window._fbGetDocFromServer(ref);
      if (ex.exists()) return err('يوجد كود بنفس الاسم، اختر اسماً آخر');
      await window._fbSetDoc(ref, { ...data, code, usedCount: 0, createdAt: new Date().toISOString() });
    } else {
      // لا نلمس usedCount/lastOrderId: يزيدهما العملاء عند الاستعمال
      await window._fbUpdateDoc(ref, data);
    }
    // عملاء الكود المعنيون: مستند لكل عميل (لا تُخزَّن إيميلاتهم داخل الكود)
    {
      const colRef = window._fbCollection(window._db, 'coupon_targets');
      const oldSnap = await window._fbGetDocs(window._fbQuery(colRef, window._fbWhere('code', '==', code)));
      const oldIds = new Set(oldSnap.docs.map(d => d.id));
      const wanted = new Map(targets.map(tg => [code + '__' + tg.uid, tg]));
      const batch = window._fbWriteBatch();
      wanted.forEach((tg, id) => { if (!oldIds.has(id)) batch.set(window._fbDoc2('coupon_targets', id), { code, uid: tg.uid, label: tg.label }); });
      oldIds.forEach(id => { if (!wanted.has(id)) batch.delete(window._fbDoc2('coupon_targets', id)); });
      await batch.commit();
    }
    dpCloseCouponModal('couponEditModal');
    showToast('✅ تم حفظ الكود', 'success');
    await dpLoadAdminCoupons();
  } catch (e) {
    err('تعذر الحفظ: ' + (e.code || e.message) + ' — تأكد من نشر قواعد Firestore الجديدة');
  }
}
