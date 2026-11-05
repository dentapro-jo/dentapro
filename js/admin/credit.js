// الذمم (البيع الآجل) — واجهة الأدمن/الموظف:
//  • قائمة العملاء الذين عليهم ذمم + المتبقي على كل عميل + طباعة ملخص
//  • كشف ذمم العميل (فاتورة، تاريخها، قيمتها، دفعة السداد، تاريخها، المتبقي) + تسجيل الدفعات + الطباعة
//  • بطاقة الذمم في صفحة تفاصيل العميل (تفعيل + الحد الائتماني للأدمن فقط)
// الرصيد يُحسب دائماً من الفواتير والدفعات (dpCreditCompute في js/shared/credit.js).

var _creditStmt = null; // كشف العميل المفتوح

function dpFmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB');
}

function dpCreditModal(id, title, body, maxWidth) {
  const old = document.getElementById(id); if (old) old.remove();
  const m = document.createElement('div');
  m.id = id;
  m.className = 'modal-overlay open';
  m.style.zIndex = id === 'creditStmtModal' ? '3300' : '3200';
  m.innerHTML = `
    <div class="modal" style="max-width:${maxWidth || 760}px">
      <div class="modal-header" style="background:linear-gradient(135deg,#6d28d9,#a78bfa)">
        <div class="modal-title"><i class="fas fa-file-invoice-dollar"></i> <span>${title}</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="document.getElementById('${id}').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding:16px 20px;max-height:78vh;overflow-y:auto">${body}</div>
    </div>`;
  document.body.appendChild(m);
}

// ---------- قائمة العملاء ----------
var _creditList = [];

async function openCreditAdmin() {
  dpCreditModal('creditListModal', 'الذمم', '<div id="creditListBody" style="text-align:center;padding:24px"><div class="spinner" style="margin:0 auto;width:26px;height:26px;border-width:4px"></div></div>', 760);
  try {
    const [oSnap, pSnap, users] = await Promise.all([
      window._fbGetDocs(window._fbQuery(window._fbOrdersRef(), window._fbWhere('payMethod', '==', 'credit'))),
      window._fbGetDocs(window._fbCollection(window._db, 'credit_payments')),
      fetchAllUsersList()
    ]);
    const orders = oSnap.docs.map(d => d.data());
    const payments = pSnap.docs.map(d => d.data());
    const rows = [];
    users.filter(u => u.role === 'client').forEach(u => {
      const mine = orders.filter(o => o.clientUid === u.uid || o.clientEmail === u.email);
      const myPays = payments.filter(p => p.clientUid === u.uid);
      if (!mine.length && !myPays.length && u.creditEnabled !== true) return;
      const calc = dpCreditCompute(mine, myPays);
      rows.push({ uid: u.uid, email: u.email, name: u.firstName || u.name || 'عميل', clinic: u.clinic || '',
        limit: Number(u.creditLimit) || 0, enabled: u.creditEnabled === true, outstanding: calc.outstanding, invoices: calc.invoices.length });
    });
    _creditList = rows.sort((a, b) => b.outstanding - a.outstanding);
    dpRenderCreditList();
  } catch (e) {
    const b = document.getElementById('creditListBody');
    if (b) b.innerHTML = `<div style="color:var(--danger);font-weight:700">تعذر تحميل الذمم: ${escHtml(e.code || e.message)} — تأكد من نشر قواعد Firestore الجديدة</div>`;
  }
}

function dpRenderCreditList() {
  const b = document.getElementById('creditListBody');
  if (!b) return;
  const total = _creditList.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
  if (!document.getElementById('creditSearch')) { // الهيكل يُرسم مرة واحدة كي لا يفقد حقل البحث التركيز
    b.style.textAlign = 'start'; b.style.padding = '0';
    b.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <input type="text" id="creditSearch" class="form-input" placeholder="🔍 ابحث باسم العميل أو العيادة..." oninput="dpRenderCreditList()" style="flex:1;min-width:180px">
        <button onclick="printCreditSummary()" style="padding:0 16px;border-radius:var(--radius-sm);border:1.5px solid #6d28d9;background:#fff;color:#6d28d9;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-print"></i> طباعة الملخص</button>
      </div>
      <div id="creditListTotal" style="padding:10px 14px;border-radius:12px;background:#f5f3ff;font-weight:800;color:#6d28d9;margin-bottom:12px"></div>
      <div id="creditListItems"></div>`;
  }
  document.getElementById('creditListTotal').textContent = `إجمالي الذمم المتبقية على كل العملاء: ${fmtPrice(total)} د.أ`;
  const term = normalizeArabic(document.getElementById('creditSearch').value || '');
  const list = _creditList.filter(r => !term || normalizeArabic(r.name).includes(term) || normalizeArabic(r.clinic).includes(term));
  document.getElementById('creditListItems').innerHTML = `
    ${list.length ? list.map((r, i) => `
      <div onclick="dpOpenCreditStatementFromList(${_creditList.indexOf(r)})" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px;border:1.5px solid var(--border);border-radius:12px;margin-bottom:8px;cursor:pointer">
        <div style="min-width:0">
          <div style="font-weight:800">${escHtml(r.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escHtml(r.clinic)} ${r.enabled ? '' : '• <span style="color:#d97706">الذمم غير مفعّلة</span>'}</div>
        </div>
        <div style="text-align:end;white-space:nowrap">
          <div style="font-weight:900;color:${r.outstanding > 0 ? 'var(--danger)' : 'var(--success)'}">${fmtPrice(r.outstanding)} د.أ</div>
          <div style="font-size:11px;color:var(--text-muted)">${r.invoices} فاتورة${r.limit ? ' • الحد ' + fmtPrice(r.limit) : ''}</div>
        </div>
      </div>`).join('') : '<div style="text-align:center;color:var(--text-muted);padding:20px">لا يوجد عملاء عليهم ذمم</div>'}`;
}

function dpOpenCreditStatementFromList(idx) {
  const r = _creditList[idx];
  if (r) openCreditStatement(r.uid, r.email, r.name, r.clinic, r.limit);
}

function printCreditSummary() {
  const rows = _creditList.filter(r => r.outstanding !== 0 || r.invoices);
  const total = rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
  const html = `
    <h2 style="text-align:center">ملخص الذمم</h2>
    <div style="text-align:center;color:#555;margin-bottom:14px">${dpFmtDate(new Date().toISOString())}</div>
    <table><thead><tr><th>العميل</th><th>العيادة</th><th>عدد الفواتير</th><th>المتبقي (د.أ)</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${escHtml(r.name)}</td><td>${escHtml(r.clinic)}</td><td style="text-align:center">${r.invoices}</td><td style="text-align:center;font-weight:700">${fmtPrice(r.outstanding)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">إجمالي الذمم المتبقية</td><td style="text-align:center">${fmtPrice(total)}</td></tr></tfoot></table>`;
  dpCreditPrint('ملخص الذمم', html);
}

// ---------- كشف عميل ----------
async function openCreditStatement(uid, email, name, clinic, limit) {
  dpCreditModal('creditStmtModal', 'كشف الذمم — ' + escHtml(name || ''), '<div id="creditStmtBody" style="text-align:center;padding:24px"><div class="spinner" style="margin:0 auto;width:26px;height:26px;border-width:4px"></div></div>', 820);
  try {
    const [oSnap, pSnap] = await Promise.all([
      window._fbGetDocs(window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', email))),
      window._fbGetDocs(window._fbQuery(window._fbCollection(window._db, 'credit_payments'), window._fbWhere('clientUid', '==', uid)))
    ]);
    const payments = pSnap.docs.map(d => ({ ...d.data(), _id: d.id }));
    const calc = dpCreditCompute(oSnap.docs.map(d => d.data()), payments);
    _creditStmt = { uid, email, name, clinic, limit: Number(limit) || 0, invoices: calc.invoices, outstanding: calc.outstanding };
    dpRenderCreditStatement();
  } catch (e) {
    const b = document.getElementById('creditStmtBody');
    if (b) b.innerHTML = `<div style="color:var(--danger);font-weight:700">تعذر تحميل الكشف: ${escHtml(e.code || e.message)}</div>`;
  }
}

// جدول الكشف: صف لكل فاتورة (رقمها، تاريخها، قيمتها، المتبقي بعد دفعاتها) وتحتها صف لكل دفعة (المبلغ والتاريخ)
function dpCreditTableHTML(st, forPrint) {
  const canDelete = !forPrint && typeof isAdmin === 'function' && isAdmin();
  let body = '';
  st.invoices.forEach(inv => {
    const days = !inv.cancelled && inv.remaining > 0 ? Math.floor((Date.now() - new Date(inv.date)) / 86400000) : null;
    body += `<tr style="background:#faf8ff">
      <td style="font-weight:700">#${escHtml(String(inv.id))}${inv.cancelled ? ' <small style="color:#c53030">(ملغاة)</small>' : ''}</td>
      <td>${dpFmtDate(inv.date)}${days !== null && !forPrint ? `<div style="font-size:10px;color:var(--text-muted)">منذ ${days} يوم</div>` : ''}</td>
      <td style="text-align:center;font-weight:700">${fmtPrice(inv.total)}</td>
      <td></td><td></td>
      <td style="text-align:center;font-weight:800;color:${inv.remaining > 0 ? '#c53030' : '#15803d'}">${fmtPrice(inv.remaining)}</td>
    </tr>`;
    inv.payments.forEach(p => {
      body += `<tr>
        <td colspan="2" style="color:#6b7a86;font-size:12px;padding-inline-start:24px">↳ دفعة${p.note ? ' — ' + escHtml(p.note) : ''}</td>
        <td></td>
        <td style="text-align:center;color:#15803d;font-weight:700">${fmtPrice(p.amount)}</td>
        <td style="text-align:center">${dpFmtDate(p.date)}${canDelete ? ` <button onclick="dpDeleteCreditPayment('${escJsAttr(p._id)}')" title="حذف الدفعة" style="background:none;border:none;color:var(--danger);cursor:pointer">✕</button>` : ''}</td>
        <td></td>
      </tr>`;
    });
  });
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#ede9fe">
        <th style="padding:8px;text-align:start">رقم الفاتورة</th><th style="padding:8px;text-align:start">تاريخ الفاتورة</th>
        <th style="padding:8px">قيمة الفاتورة</th><th style="padding:8px">دفعة السداد</th><th style="padding:8px">تاريخ الدفعة</th><th style="padding:8px">المتبقي</th>
      </tr></thead>
      <tbody>${body || '<tr><td colspan="6" style="text-align:center;padding:16px;color:#6b7a86">لا توجد فواتير ذمم</td></tr>'}</tbody>
      <tfoot><tr style="background:#f5f3ff;font-weight:900">
        <td colspan="5" style="padding:10px">مجموع الذمم المتبقية بعد احتساب الدفعات</td>
        <td style="padding:10px;text-align:center;color:#c53030">${fmtPrice(st.outstanding)} د.أ</td>
      </tr></tfoot>
    </table>`;
}

function dpRenderCreditStatement() {
  const st = _creditStmt;
  const b = document.getElementById('creditStmtBody');
  if (!st || !b) return;
  const unpaid = st.invoices.filter(i => !i.cancelled && i.remaining > 0);
  b.style.textAlign = 'start'; b.style.padding = '0';
  b.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div>
        <div style="font-weight:900;font-size:16px">${escHtml(st.name || '')}</div>
        <div style="font-size:12px;color:var(--text-muted)">${escHtml(st.clinic || '')}${st.limit ? ' • الحد الائتماني: ' + fmtPrice(st.limit) + ' د.أ' : ''}</div>
      </div>
      <button onclick="printCreditStatement()" style="padding:9px 16px;border-radius:50px;border:none;background:#6d28d9;color:#fff;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-print"></i> طباعة</button>
    </div>
    <div style="overflow-x:auto">${dpCreditTableHTML(st, false)}</div>

    <div style="margin-top:16px;padding:14px;border-radius:12px;border:1.5px solid var(--border);background:#fafcfe">
      <div style="font-weight:800;margin-bottom:8px">تسجيل دفعة سداد</div>
      <select id="cpTarget" class="form-input" style="margin-bottom:8px">
        <option value="__fifo">سداد من الأقدم أولاً (تلقائي)</option>
        ${unpaid.map(i => `<option value="${escHtml(String(i.id))}">فاتورة #${escHtml(String(i.id))} — المتبقي ${fmtPrice(i.remaining)} د.أ</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input type="number" id="cpAmount" class="form-input" min="0" step="any" placeholder="المبلغ (د.أ)" style="flex:1">
        <input type="date" id="cpPayDate" class="form-input" value="${new Date().toISOString().slice(0, 10)}" style="flex:1">
      </div>
      <input type="text" id="cpNote" class="form-input" maxlength="120" placeholder="ملاحظة (اختياري: نقداً، حوالة، شيك...)" style="margin-bottom:8px">
      <div id="cpPayError" style="display:none;color:var(--danger);font-size:13px;font-weight:700;margin-bottom:8px"></div>
      <button onclick="saveCreditPayment()" ${unpaid.length ? '' : 'disabled'} style="width:100%;padding:11px;border:none;border-radius:50px;background:linear-gradient(135deg,#15803d,#22c55e);color:#fff;font-family:inherit;font-weight:800;cursor:pointer;${unpaid.length ? '' : 'opacity:.5'}"><i class="fas fa-check"></i> تسجيل الدفعة</button>
    </div>`;
}

async function saveCreditPayment() {
  const st = _creditStmt;
  const err = (m) => { const e = document.getElementById('cpPayError'); e.textContent = m; e.style.display = 'block'; };
  const amount = dpRound2(parseFloat(document.getElementById('cpAmount').value));
  const target = document.getElementById('cpTarget').value;
  const dateVal = document.getElementById('cpPayDate').value;
  const note = (document.getElementById('cpNote').value || '').trim();
  if (!(amount > 0)) return err('أدخل مبلغاً صحيحاً');
  if (!dateVal) return err('اختر تاريخ الدفعة');

  const unpaid = st.invoices.filter(i => !i.cancelled && i.remaining > 0);
  const allocations = []; // { orderId, amount }
  if (target === '__fifo') {
    let left = amount;
    for (const inv of unpaid) { // الأقدم أولاً (الفواتير مرتبة بالتاريخ)
      if (left <= 0) break;
      const take = Math.min(left, inv.remaining);
      allocations.push({ orderId: inv.id, amount: dpRound2(take) });
      left = dpRound2(left - take);
    }
    if (left > 0.001) return err(`المبلغ أكبر من إجمالي المتبقي (${fmtPrice(st.outstanding)} د.أ)`);
  } else {
    const inv = unpaid.find(i => String(i.id) === target);
    if (!inv) return err('الفاتورة غير موجودة');
    if (amount > inv.remaining + 0.001) return err(`المبلغ أكبر من المتبقي على الفاتورة (${fmtPrice(inv.remaining)} د.أ)`);
    allocations.push({ orderId: inv.id, amount });
  }

  const when = new Date(dateVal + 'T12:00:00').toISOString();
  try {
    const batch = window._fbWriteBatch();
    allocations.forEach((a, n) => {
      const id = 'CP-' + Date.now().toString(36).toUpperCase() + '-' + n + Math.random().toString(36).slice(2, 5).toUpperCase();
      batch.set(window._fbDoc2('credit_payments', id), {
        clientUid: st.uid, clientEmail: st.email, clientName: st.name || '',
        orderId: String(a.orderId), amount: a.amount, date: when, note,
        createdBy: (currentUser && currentUser.email) || '', createdAt: new Date().toISOString()
      });
    });
    await batch.commit();
    showToast('✅ تم تسجيل الدفعة', 'success');
    await openCreditStatement(st.uid, st.email, st.name, st.clinic, st.limit);
  } catch (e) { err('تعذر الحفظ: ' + (e.code || e.message)); }
}

async function dpDeleteCreditPayment(id) {
  if (!confirm('حذف هذه الدفعة؟ سيرجع مبلغها إلى المتبقي على الفاتورة.')) return;
  try {
    await window._fbDeleteDoc(window._fbDoc2('credit_payments', id));
    showToast('🗑️ تم حذف الدفعة', 'success');
    const st = _creditStmt;
    await openCreditStatement(st.uid, st.email, st.name, st.clinic, st.limit);
  } catch (e) { showToast('❌ تعذر الحذف: ' + (e.code || e.message), 'error'); }
}

// ---------- الطباعة ----------
function dpCreditPrint(title, innerHtml) {
  const win = window.open('', '_blank');
  if (!win) { showToast('⚠️ اسمح بالنوافذ المنبثقة للطباعة', 'error'); return; }
  win.document.write(`<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#1a2332}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:start}
      th{background:#ede9fe}
      tfoot td{background:#f5f3ff;font-weight:800}
      h2{margin:0 0 4px}
      button{display:none}
    </style></head><body>${innerHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

function printCreditStatement() {
  const st = _creditStmt;
  if (!st) return;
  dpCreditPrint('كشف الذمم', `
    <h2 style="text-align:center">كشف الذمم</h2>
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-weight:800;font-size:16px">${escHtml(st.name || '')}</div>
      <div style="color:#555">${escHtml(st.clinic || '')} — بتاريخ ${dpFmtDate(new Date().toISOString())}</div>
    </div>
    ${dpCreditTableHTML(st, true)}`);
}

// ---------- بطاقة الذمم في تفاصيل العميل ----------
async function renderClientCreditCard(u, uid, email, name, clinic) {
  const box = document.getElementById('clientCreditCard');
  if (!box || !uid) return;
  const admin = typeof isAdmin === 'function' && isAdmin();
  // نقرأ إعدادات الذمم من مستند العميل مباشرة (القائمة المخزنة قد لا تحمل هذه الحقول)
  let fresh = {};
  try { const sn = await window._fbGetDocFromServer(window._fbDoc2('users', uid)); if (sn.exists()) fresh = sn.data(); } catch (e) {}
  const enabled = fresh.creditEnabled === true;
  const limit = Number(fresh.creditLimit) || 0;
  box.innerHTML = `
    <div style="background:#f5f3ff;border:1.5px solid #a78bfa;border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div style="font-weight:900;color:#6d28d9">🧾 الذمم (البيع الآجل)</div>
        <div id="clientCreditOutstanding" style="font-weight:800;color:#6b7a86">...</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700">
          <input type="checkbox" id="clientCreditEnabled" ${enabled ? 'checked' : ''} ${admin ? '' : 'disabled'}> تفعيل الذمم لهذا العميل</label>
        <input type="number" id="clientCreditLimit" class="form-input" min="0" step="any" value="${limit || ''}" placeholder="الحد الائتماني (د.أ)" style="max-width:190px" ${admin ? '' : 'disabled'}>
        ${admin ? `<button onclick="saveClientCreditSettings('${escJsAttr(uid)}')" style="padding:9px 16px;border-radius:50px;border:none;background:#6d28d9;color:#fff;font-family:inherit;font-weight:700;cursor:pointer">حفظ</button>` : ''}
        <button onclick="openCreditStatement('${escJsAttr(uid)}','${escJsAttr(email)}','${escJsAttr(name)}','${escJsAttr(clinic)}',${limit})" style="padding:9px 16px;border-radius:50px;border:1.5px solid #6d28d9;background:#fff;color:#6d28d9;font-family:inherit;font-weight:700;cursor:pointer"><i class="fas fa-file-invoice-dollar"></i> كشف الذمم</button>
      </div>
    </div>`;
  try {
    const [oSnap, pSnap] = await Promise.all([
      window._fbGetDocs(window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', email))),
      window._fbGetDocs(window._fbQuery(window._fbCollection(window._db, 'credit_payments'), window._fbWhere('clientUid', '==', uid)))
    ]);
    const calc = dpCreditCompute(oSnap.docs.map(d => d.data()), pSnap.docs.map(d => d.data()));
    const el = document.getElementById('clientCreditOutstanding');
    if (el) {
      el.textContent = `المتبقي: ${fmtPrice(calc.outstanding)} د.أ` + (limit ? ` • المتاح: ${fmtPrice(Math.max(0, limit - calc.outstanding))} د.أ` : '');
      el.style.color = calc.outstanding > 0 ? '#c53030' : '#15803d';
    }
  } catch (e) { const el = document.getElementById('clientCreditOutstanding'); if (el) el.textContent = ''; }
}

async function saveClientCreditSettings(uid) {
  if (!isAdmin()) { showToast('⛔ خاص بمدير النظام', 'error'); return; }
  const enabled = document.getElementById('clientCreditEnabled').checked;
  const limit = Math.max(0, parseFloat(document.getElementById('clientCreditLimit').value) || 0);
  if (enabled && limit <= 0 && !confirm('لم تحدد حداً ائتمانياً، فلن يستطيع العميل الطلب بالذمم. هل تريد المتابعة؟')) return;
  try {
    await window._fbUpdateDoc(window._fbDoc2('users', uid), { creditEnabled: enabled, creditLimit: limit });
    showToast('✅ تم حفظ إعدادات الذمم', 'success');
  } catch (e) { showToast('❌ تعذر الحفظ: ' + (e.code || e.message), 'error'); }
}
