// DentaPro domain module: extracted from the original implementation.
// CLIENTS LIST & DETAIL (ADMIN)
// =====================
var _cachedClientsList = [];

// يوحّد رقم الهاتف لآخر 9 أرقام (يتجاهل رمز الدولة والأصفار البادئة) لمطابقة دقيقة
// normalizePhone انتقلت إلى js/shared/discounts.js

async function openClientsListModal() {
  document.getElementById('clientsListModal').classList.add('open');
  document.getElementById('clientsListSearch').value = '';
  document.getElementById('clientsListSort').value = 'name';
  document.getElementById('clientsListBody').innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:4px"></div>جاري تحميل العملاء...</div>`;

  const TIMEOUT_MS = 12000;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));

  try {
    const allUsers = await Promise.race([fetchAllUsersList(), timeoutPromise]);
    let users = allUsers.filter(u => u.role === 'client');
    const localUsers = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    localUsers.forEach(lu => { if (!users.find(u => u.email === lu.email)) users.push(lu); });

    const [ordersSnap, allQuotes] = await Promise.all([
      window._fbGetDocs(window._fbOrdersRef()),
      getAllQuotes()
    ]);
    const allOrders = ordersSnap.docs.map(d => d.data());

    // خريطة أرقام هواتف العملاء المسجّلين، لربط طلبات الزوار المطابقة بحسابهم تلقائياً بدل اعتبارها منفصلة
    const phoneToUser = {};
    users.forEach(u => { const p = normalizePhone(u.phone); if (p) phoneToUser[p] = u; });

    // حساب مشتريات كل عميل مسجّل من طلباته المرتبطة بإيميله
    users.forEach(u => {
      u.totalSpent = allOrders.filter(o => o.clientEmail === u.email).reduce((s,o) => s + (o.total||0), 0);
    });

    // تجميع طلبات وعروض أسعار الزوار (clientEmail === 'guest') حسب رقم الهاتف
    const guestGroups = {};
    const guestItems = [
      ...allOrders.filter(o => o.clientEmail === 'guest').map(o => ({...o, _kind:'order'})),
      ...(allQuotes || []).filter(q => q.clientEmail === 'guest').map(q => ({...q, _kind:'quote'}))
    ];
    guestItems.forEach(item => {
      const p = normalizePhone(item.phone);
      if (!p) return;
      if (!guestGroups[p]) guestGroups[p] = [];
      guestGroups[p].push(item);
    });

    Object.keys(guestGroups).forEach(phone => {
      const items = guestGroups[phone];
      const spent = items.filter(i => i._kind === 'order').reduce((s,o) => s + (o.total||0), 0);
      const matchedUser = phoneToUser[phone];
      if (matchedUser) {
        // رقم هاتف الزائر يطابق عميل مسجّل فعلياً — يُحسب ضمن مشترياته، مو كعميل منفصل
        matchedUser.totalSpent = (matchedUser.totalSpent || 0) + spent;
        return;
      }
      // زائر جديد بالكامل — يُعرض كـ"عميل" مؤقت بالقائمة
      const latest = [...items].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      users.push({
        uid: '',
        email: 'guest:' + phone,
        firstName: latest.clientName || latest.doctor || 'زائر',
        clinic: latest.clinic || '',
        phone: latest.phone || phone,
        isGuest: true,
        totalSpent: spent,
      });
    });

    users.sort((a,b) => (a.firstName||a.name||'').localeCompare(b.firstName||b.name||'', 'ar'));
    _cachedClientsList = users;
    renderClientsList();
  } catch(e) {
    const isTimeout = e.message === 'timeout';
    document.getElementById('clientsListBody').innerHTML = `
      <div style="text-align:center;padding:32px;color:var(--danger)">
        ${isTimeout ? 'استغرق التحميل وقتاً أطول من المعتاد' : 'تعذر تحميل العملاء: ' + escHtml(e.message)}
        <div style="margin-top:14px">
          <button onclick="openClientsListModal()" style="padding:10px 24px;border-radius:50px;background:var(--primary);color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
            <i class="fas fa-redo"></i> إعادة المحاولة
          </button>
        </div>
      </div>`;
  }
}
function closeClientsListModal() {
  document.getElementById('clientsListModal').classList.remove('open');
}

function renderClientsList() {
  const rawSearch = document.getElementById('clientsListSearch').value;
  const term = normalizeArabic(rawSearch);
  const termDigits = rawSearch.replace(/\D/g,'');
  const sortMode = document.getElementById('clientsListSort').value;
  const typeFilter = document.getElementById('clientsListType').value;

  let list = _cachedClientsList.filter(u => {
    if (typeFilter === 'members' && u.isGuest) return false;
    if (typeFilter === 'guests' && !u.isGuest) return false;
    if (!rawSearch.trim()) return true;
    const nameMatch = normalizeArabic(u.firstName||u.name||'').includes(term) || normalizeArabic(u.clinic||'').includes(term);
    const phoneMatch = termDigits.length >= 3 && (u.phone||'').replace(/\D/g,'').includes(termDigits);
    return nameMatch || phoneMatch;
  });

  if (sortMode === 'spent') {
    list = [...list].sort((a,b) => (b.totalSpent||0) - (a.totalSpent||0));
  } else {
    list = [...list].sort((a,b) => (a.firstName||a.name||'').localeCompare(b.firstName||b.name||'', 'ar'));
  }

  document.getElementById('clientsListCount').textContent = `إجمالي العملاء: ${list.length}`;
  const body = document.getElementById('clientsListBody');
  if (!list.length) {
    body.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)"><i class="fas fa-user-slash" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px"></i>لا يوجد عملاء مطابقون</div>`;
    return;
  }

  const showSpentCol = sortMode === 'spent';
  const gridCols = showSpentCol ? '50px 1fr 1fr 130px 52px' : '50px 1fr 1fr 52px';

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:${gridCols};gap:12px;padding:12px 18px;background:#f8fbfd;border-bottom:2px solid #e2eaf0;font-size:12px;font-weight:700;color:var(--text-muted)">
      <div>#</div><div>اسم الطبيب</div><div>اسم العيادة</div>${showSpentCol ? '<div>مجموع المشتريات</div>' : ''}<div></div>
    </div>` +
    list.map((u, idx) => `
    <div onclick="openClientDetailModal('${escJsAttr(u.uid||'')}','${escJsAttr(u.email)}')" style="display:grid;grid-template-columns:${gridCols};gap:12px;padding:14px 18px;border-bottom:1px solid #f0f4f8;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#f8fbfd'" onmouseout="this.style.background=''">
      <div style="font-weight:800;color:var(--text-muted)">${idx+1}</div>
      <div style="font-weight:700;color:var(--primary-dark)">${escHtml(u.firstName||u.name||'—')} ${u.isGuest ? '<span style="font-size:10px;background:#fff7ed;color:#c2410c;border-radius:50px;padding:2px 8px;font-weight:800;margin-right:4px">غير مسجّل</span>' : ''}</div>
      <div style="color:var(--text-muted)">${escHtml(u.clinic||'—')}</div>
      ${showSpentCol ? `<div style="font-weight:800;color:var(--primary)">${fmtPrice((u.totalSpent||0))} د.أ</div>` : ''}
      <button type="button" title="حذف العميل" onclick="event.stopPropagation();confirmDeleteClient('${escJsAttr(u.uid||'')}','${escJsAttr(u.email)}','${escJsAttr(u.firstName||u.name||'—')}')" style="width:36px;height:36px;border:0;border-radius:10px;background:#fff1f2;color:#be123c;cursor:pointer;font-size:14px" aria-label="حذف العميل">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>`).join('');
}

function confirmDeleteClient(uid, email, name) {
  window._pendingClientDeletion = { uid: uid || '', email: email || '', name: name || 'هذا العميل' };
  const existing = document.getElementById('confirmDeleteClientModal');
  if (existing) existing.remove();

  const isGuest = String(email || '').startsWith('guest:');
  const warning = isGuest
    ? 'سيتم حذف جميع الطلبات وعروض الأسعار المرتبطة برقم هاتف هذا الزائر نهائيًا.'
    : 'سيتم حذف مستند العميل من مجموعة المستخدمين نهائيًا. لن يتم حذف الطلبات أو عروض الأسعار القديمة.';

  const modal = document.createElement('div');
  modal.id = 'confirmDeleteClientModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '5000';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header" style="background:linear-gradient(135deg,#be123c,#e53e3e)">
        <div class="modal-title"><i class="fas fa-user-times"></i> حذف العميل</div>
        <button class="close-btn" type="button" onclick="document.getElementById('confirmDeleteClientModal').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="text-align:center">
        <div style="font-size:44px;color:#be123c;margin-bottom:12px"><i class="fas fa-exclamation-triangle"></i></div>
        <div style="font-size:17px;font-weight:900;margin-bottom:10px">هل تريد حذف ${escHtml(name || 'هذا العميل')}؟</div>
        <div style="color:var(--text-muted);line-height:1.8">${warning}</div>
      </div>
      <div class="modal-footer" style="justify-content:center;gap:10px">
        <button type="button" class="btn-back" onclick="document.getElementById('confirmDeleteClientModal').remove()">إلغاء</button>
        <button type="button" id="confirmDeleteClientBtn" class="btn-submit" onclick="deleteClientRecord()" style="background:linear-gradient(135deg,#be123c,#e53e3e)">
          <i class="fas fa-trash-alt"></i> نعم، احذف
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function deleteClientRecord() {
  const pending = window._pendingClientDeletion;
  if (!pending) return;

  const btn = document.getElementById('confirmDeleteClientBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحذف...';
  }

  try {
    const isGuest = String(pending.email || '').startsWith('guest:');
    if (isGuest) {
      const phoneKey = normalizePhone(String(pending.email).slice(6));
      const [ordersSnap, allQuotes] = await Promise.all([
        window._fbGetDocs(window._fbOrdersRef()),
        getAllQuotes()
      ]);
      const orderDeletes = ordersSnap.docs
        .filter(docSnap => {
          const order = docSnap.data() || {};
          return order.clientEmail === 'guest' && phoneKey && normalizePhone(order.phone) === phoneKey;
        })
        .map(docSnap => window._fbDeleteDoc(window._fbDoc2('orders', docSnap.id)));
      const quoteDeletes = (allQuotes || [])
        .filter(quote => quote.clientEmail === 'guest' && phoneKey && normalizePhone(quote.phone) === phoneKey && quote._docId)
        .map(quote => window._fbDeleteDoc(window._fbDoc2('quotes', quote._docId)));
      await Promise.all([...orderDeletes, ...quoteDeletes]);
    } else {
      if (!pending.uid) throw new Error('معرّف العميل غير موجود');
      await window._fbUpdateDoc(window._fbDoc2('users', pending.uid), {
        disabled: true,
        disabledAt: new Date().toISOString()
      });
    }

    _cachedClientsList = _cachedClientsList.filter(client => client.email !== pending.email && (!pending.uid || client.uid !== pending.uid));
    const modal = document.getElementById('confirmDeleteClientModal');
    if (modal) modal.remove();
    window._pendingClientDeletion = null;
    renderClientsList();
    showToast(isGuest ? '✅ تم حذف بيانات الزائر وطلباته وعروض أسعاره' : '✅ تم حذف العميل بنجاح', 'success');
  } catch (e) {
    console.error('Delete client error:', e);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-alt"></i> نعم، احذف';
    }
    showToast('❌ تعذر حذف العميل، حاول مرة أخرى', 'error');
  }
}

async function openClientDetailModal(uid, email) {
  document.getElementById('clientDetailModal').classList.add('open');
  document.getElementById('clientDetailBody').innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:4px"></div>جاري التحميل...</div>`;

  const isGuest = email.startsWith('guest:');
  const guestPhone = isGuest ? email.slice(6) : null;

  try {
    let u = _cachedClientsList.find(x => x.email === email);
    if (!u && !isGuest) {
      const allUsers = await fetchAllUsersList();
      u = allUsers.find(x => x.email === email) || { email, firstName:'عميل', clinic:'' };
    }
    if (!uid) uid = u ? u.uid : '';

    const [ordersSnap, allQuotes, balance] = await Promise.all([
      window._fbGetDocs(window._fbOrdersRef()),
      getAllQuotes(),
      isGuest ? Promise.resolve(0) : getClientPoints(uid)
    ]);

    let allOrders, clientQuotes;
    if (isGuest) {
      allOrders = ordersSnap.docs.map(d => d.data()).filter(o => o.clientEmail === 'guest' && normalizePhone(o.phone) === guestPhone);
      clientQuotes = (allQuotes || []).filter(q => q.clientEmail === 'guest' && normalizePhone(q.phone) === guestPhone);
    } else {
      const uPhone = normalizePhone(u.phone);
      allOrders = ordersSnap.docs.map(d => d.data()).filter(o =>
        o.clientEmail === email || (uPhone && o.clientEmail === 'guest' && normalizePhone(o.phone) === uPhone)
      );
      clientQuotes = (allQuotes || []).filter(q =>
        q.clientEmail === email || (uPhone && q.clientEmail === 'guest' && normalizePhone(q.phone) === uPhone)
      );
    }
    const totalSpent = allOrders.reduce((s,o) => s + (o.total||0), 0);

    let regDate = '—';
    if (u && u.createdAt) {
      const d = typeof u.createdAt === 'number' ? new Date(u.createdAt) : new Date(u.createdAt);
      if (!isNaN(d)) regDate = d.toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'long', day:'numeric' });
    }

    const gpsLink = (u && u.profileLocationLat && u.profileLocationLng)
      ? `<a href="https://www.google.com/maps?q=${u.profileLocationLat},${u.profileLocationLng}" target="_blank" style="color:var(--primary);text-decoration:underline"><i class="fas fa-map-marked-alt"></i> عرض على خرائط جوجل</a>`
      : `<span style="color:var(--text-muted)">غير محدد</span>`;

    const nameDisplay = u ? (u.firstName||u.name||'عميل') : 'زائر';
    const clinicDisplay = u ? (u.clinic||'') : '';
    // الرقم المحفوظ للعميل، وإن لم يوجد فآخر رقم استخدمه في طلب أو عرض سعر
    const phoneDisplay = u
      ? (u.phone || (allOrders[0] && allOrders[0].phone) || (clientQuotes[0] && clientQuotes[0].phone) || '')
      : ((allOrders[0]&&allOrders[0].phone) || (clientQuotes[0]&&clientQuotes[0].phone) || guestPhone);
    // صيغة واتساب الدولية (الأردن): 07XXXXXXXX → 9627XXXXXXXX
    const waDigits = (() => {
      let d = String(phoneDisplay || '').replace(/\D/g, '');
      if (d.startsWith('00')) d = d.slice(2);
      else if (d.startsWith('0')) d = '962' + d.slice(1);
      else if (d.length === 9) d = '962' + d;
      return d;
    })();
    const telHref = String(phoneDisplay || '').replace(/[^\d+]/g, '');
    const waLink = phoneDisplay ? `https://wa.me/${phoneDisplay.replace(/\D/g,'')}` : null;

    document.getElementById('clientDetailBody').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;padding:20px;background:linear-gradient(135deg,rgba(10,92,138,0.06),rgba(0,194,168,0.04));border-radius:16px;border:1px solid var(--border);margin-bottom:20px">
        <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:900;flex-shrink:0">
          ${escHtml((nameDisplay||'؟').charAt(0))}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:900;font-size:18px;color:var(--primary-dark)">${escHtml(nameDisplay)} ${isGuest ? '<span style="font-size:11px;background:#fff7ed;color:#c2410c;border-radius:50px;padding:3px 10px;font-weight:800;margin-right:6px">غير مسجّل — عبر الهاتف</span>' : ''}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${isGuest ? escHtml(phoneDisplay||'') : escHtml(email)}</div>
          ${!isGuest ? `<div style="font-size:13px;margin-top:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <i class="fas fa-phone" style="color:var(--primary)"></i>
            ${phoneDisplay
              ? `<a href="tel:${telHref}" dir="ltr" style="color:var(--primary-dark);font-weight:700;text-decoration:none">${escHtml(phoneDisplay)}</a>
                 <a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" title="واتساب" style="color:#25d366;font-size:18px;text-decoration:none"><i class="fab fa-whatsapp"></i></a>`
              : '<span style="color:var(--text-muted)">—</span>'}
          </div>` : ''}
        </div>
      </div>

      <div style="background:#fff;border-radius:16px;border:1px solid #e2eaf0;padding:20px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px">اسم الطبيب</div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(nameDisplay||'—')}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px">اسم العيادة</div>
            <div style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(clinicDisplay||'—')}</div>
          </div>
          ${!isGuest ? `
          <div style="grid-column:1/-1">
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px"><i class="fas fa-map-marker-alt"></i> موقع العيادة (وصف يدوي)</div>
            <div style="font-size:13px">${u.profileLocationText ? escHtml(u.profileLocationText) : '<span style="color:var(--text-muted)">غير محدد</span>'}</div>
          </div>
          <div style="grid-column:1/-1">
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px"><i class="fas fa-map-marked-alt"></i> موقع GPS</div>
            <div style="font-size:13px">${gpsLink}</div>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px">تاريخ التسجيل</div>
            <div style="font-weight:700;font-size:13px;color:var(--text)">${regDate}</div>
          </div>
          ` : `
          <div style="grid-column:1/-1">
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px"><i class="fas fa-phone-alt"></i> رقم الهاتف</div>
            <div style="font-size:13px;font-weight:700">${escHtml(phoneDisplay||'—')}</div>
          </div>
          `}
          <div>
            <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px">إجمالي المشتريات</div>
            <div style="font-weight:900;font-size:16px;color:var(--primary)">${fmtPrice(totalSpent)} د.أ</div>
          </div>
        </div>
      </div>

      ${!isGuest ? `
      <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:2px solid #f59e0b;border-radius:16px;padding:18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:12px;color:#92400e;font-weight:700;margin-bottom:4px">🏆 رصيد النقاط</div>
          <div style="font-size:24px;font-weight:900;color:#d97706">${balance} نقطة</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="add-points-btn" onclick="openAddPointsModal('${escJsAttr(uid)}','${escJsAttr(email)}','${escJsAttr(nameDisplay)}','${escJsAttr(clinicDisplay)}',${balance},'add')">
            <i class="fas fa-plus"></i> إضافة
          </button>
          <button class="add-points-btn" style="background:linear-gradient(135deg,#e53e3e,#c53030)" onclick="openAddPointsModal('${escJsAttr(uid)}','${escJsAttr(email)}','${escJsAttr(nameDisplay)}','${escJsAttr(clinicDisplay)}',${balance},'deduct')">
            <i class="fas fa-minus"></i> خصم
          </button>
        </div>
      </div>

      <div style="background:#fff;border:1.5px solid #e2eaf0;border-radius:16px;padding:18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-bottom:4px"><i class="fas fa-truck"></i> أجور التوصيل</div>
          <div style="font-size:13px;color:var(--text-muted)">إعدادات خاصة بهذا العميل تحدّد تكلفة التوصيل على فواتيره</div>
        </div>
        <button onclick="openDeliverySettingsModal('${escJsAttr(uid)}','${escJsAttr(email)}','${escJsAttr(nameDisplay)}','${escJsAttr(clinicDisplay)}')"
          style="padding:10px 18px;border-radius:12px;background:linear-gradient(135deg,#0a5c8a,#1a8bbf);color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
          <i class="fas fa-cog"></i> إعدادات التوصيل
        </button>
      </div>
      <div id="clientCreditCard"></div>
      ` : ''}

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${!isGuest ? `
        <button onclick="openAdminThreadModal('${escJsAttr(email)}')" style="flex:1;min-width:160px;padding:14px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;border:none;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i class="fas fa-comment-dots"></i> مراسلة العميل
        </button>
        ` : (waLink ? `
        <a href="${waLink}" target="_blank" style="flex:1;min-width:160px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border:none;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none">
          <i class="fab fa-whatsapp"></i> تواصل عبر واتساب
        </a>
        ` : '')}
        <button onclick="openClientAllOrdersModal('${escJsAttr(email)}')" style="flex:1;min-width:160px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#0a5c8a,#1a8bbf);color:#fff;border:none;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i class="fas fa-receipt"></i> طلباته (${allOrders.length + clientQuotes.length})
        </button>
        ${!isGuest ? `
        <button onclick="openAdminSendOrderModal('${escJsAttr(email)}','${escJsAttr(uid||'')}','${escJsAttr(nameDisplay)}','${escJsAttr(clinicDisplay)}','${escJsAttr(phoneDisplay||'')}')" style="flex:1;min-width:160px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border:none;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i class="fas fa-paper-plane"></i> إرسال طلبية
        </button>
        <button onclick="openClientOrdersReportModal('${escJsAttr(email)}','${escJsAttr(nameDisplay)}','${escJsAttr(clinicDisplay)}','${escJsAttr(phoneDisplay||'')}')" style="flex:1;min-width:160px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#7e22ce,#a855f7);color:#fff;border:none;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
          <i class="fas fa-file-invoice"></i> تفاصيل طلبات العميل
        </button>
        ` : ''}
      </div>
    `;

    if (!isGuest && typeof renderClientCreditCard === 'function') renderClientCreditCard(u, uid, email, nameDisplay, clinicDisplay);

    window._cachedClientDetailOrders = allOrders;
    window._cachedClientDetailQuotes = clientQuotes;
    const existingCachedOrders = window._cachedOrders || [];
    allOrders.forEach(o => { if (!existingCachedOrders.find(x => x.id === o.id)) existingCachedOrders.push(o); });
    window._cachedOrders = existingCachedOrders;

    const existingCachedQuotes = window._cachedAdminQuotes || [];
    clientQuotes.forEach(q => { if (!existingCachedQuotes.find(x => x._docId === q._docId)) existingCachedQuotes.push(q); });
    window._cachedAdminQuotes = existingCachedQuotes;
  } catch(e) {
    document.getElementById('clientDetailBody').innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger)">خطأ: ${e.message}</div>`;
  }
}
function closeClientDetailModal() {
  document.getElementById('clientDetailModal').classList.remove('open');
}

function openClientAllOrdersModal(email) {
  const orders = (window._cachedClientDetailOrders || []).map(o => ({...o, _kind:'order'}));
  const quotes = (window._cachedClientDetailQuotes || []).map(q => ({...q, _kind:'quote'}));
  const all = [...orders, ...quotes].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const existing = document.getElementById('clientAllOrdersModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'clientAllOrdersModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '4500';
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:85vh">
      <div class="modal-header" style="background:linear-gradient(135deg,#0a5c8a,#1a8bbf)">
        <div class="modal-title"><i class="fas fa-receipt"></i> جميع طلبات العميل</div>
        <button class="close-btn" onclick="document.getElementById('clientAllOrdersModal').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        ${!all.length ? `<div style="text-align:center;padding:32px;color:var(--text-muted)">لا توجد طلبات بعد</div>` :
          all.map(item => {
            const date = new Date(item.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'short', day:'numeric' });
            if (item._kind === 'order') {
              return `
              <div onclick="showAdminOrderDetail('${item.id}')" style="padding:14px;border-radius:12px;border:1px solid var(--border);margin-bottom:10px;background:#fafcfe;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='#fafcfe'">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <div>
                    <span style="font-size:11px;background:#e8f3fb;color:var(--primary);padding:2px 10px;border-radius:50px;font-weight:800">طلب</span>
                    <span style="font-weight:800;font-size:13px;margin-right:6px">#${escHtml(item.id)}</span>
                  </div>
                  ${statusBadgeHTML(item.status)}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:6px">📅 ${date} · ${dpDisplayItems(item.items).length} مادة</div>
                <div style="font-weight:900;color:var(--primary);margin-top:6px">${item.payMethod==='points' ? formatOrderTotal(item) : `${fmtPrice(item.total)} د.أ`}</div>
                <div style="font-size:11px;color:var(--primary-light);margin-top:6px;font-weight:700"><i class="fas fa-eye"></i> اضغط لعرض التفاصيل الكاملة</div>
              </div>`;
            } else {
              return `
              <div onclick="showQuoteOrderDetail('${item._docId}')" style="padding:14px;border-radius:12px;border:1px solid var(--border);margin-bottom:10px;background:#fafcfe;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='#fafcfe'">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <div>
                    <span style="font-size:11px;background:#fdf4ff;color:#7e22ce;padding:2px 10px;border-radius:50px;font-weight:800">عرض سعر</span>
                    <span style="font-weight:800;font-size:13px;margin-right:6px">#${escHtml(item.id)}</span>
                  </div>
                  ${quoteStatusBadge(item.status)}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:6px">📅 ${date} · ${dpDisplayItems(item.items).length} مادة</div>
                <div style="font-size:11px;color:var(--primary-light);margin-top:6px;font-weight:700"><i class="fas fa-eye"></i> اضغط لعرض التفاصيل الكاملة</div>
              </div>`;
            }
          }).join('')
        }
      </div>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn-back" onclick="document.getElementById('clientAllOrdersModal').remove()">إغلاق</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// =====================
// ============================
// الخصم العام على الفواتير — يُدار من الأدمن (محفوظ بـ Firestore: store_data/discount_settings)
// ============================
var _discountConfigCache = null;
var _discountConfigCacheTime = 0;


// تفريغ التخزين المؤقت فوراً بعد ما الإدمن يحفظ إعدادات جديدة، حتى ينعكس التغيير فورياً بدل انتظار 15 ثانية
function invalidateDiscountConfigCache() {
  _discountConfigCache = null;
  _discountConfigCacheTime = 0;
}



// normalizePhone / computeGeneralDiscountForCart / loadCustomDiscountConfig /
// invalidateCustomDiscountConfigCache / computeCustomDiscount انتقلت إلى js/shared/discounts.js

function setCustomDiscExpiryPreset(idx, days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  document.getElementById(`custDiscExpiry${idx}`).value = toDatetimeLocalValue(d.toISOString());
}

async function openCustomDiscountSettingsModal() {
  if (!isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  document.getElementById('customDiscountSettingsModal').classList.add('open');
  document.getElementById('customDiscountSettingsBody').innerHTML = `<div style="text-align:center;padding:32px"><div class="spinner" style="margin:0 auto;width:26px;height:26px;border-width:4px"></div></div>`;

  const cfg = await loadCustomDiscountConfig();
  const allUsers = await fetchAllUsersList();
  const clients = allUsers.filter(u => u.role === 'client');
  const tiers = (cfg && cfg.tiers && cfg.tiers.length === 3) ? cfg.tiers : [0,1,2].map(() => ({ amount:0, percent:0, scope:'all', targetIds:[] }));

  const tierHtml = tiers.map((tier, idx) => {
    const clientCheckboxes = clients.map(c =>
      `<label style="display:flex;align-items:center;gap:6px;padding:5px 0;font-size:12px">
         <input type="checkbox" class="custDiscClient${idx}" value="${escJsAttr(c.email)}" ${tier.targetIds && tier.targetIds.includes(c.email) ? 'checked' : ''}>
         ${escHtml(c.firstName||c.name||'')} — ${escHtml(c.clinic||'')}
       </label>`
    ).join('');
    return `
    <div style="border:1.5px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-weight:800;color:var(--primary-dark);margin-bottom:10px">المستوى ${idx+1}</div>
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">قيمة تصنيف الشريحة (د.أ)</label>
      <input type="number" id="custDiscAmount${idx}" class="form-input" min="0" step="1" value="${tier.amount||0}" style="margin-bottom:10px">
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">نسبة الخصم %</label>
      <input type="number" id="custDiscPercent${idx}" class="form-input" min="0" max="100" step="1" value="${tier.percent||0}" style="margin-bottom:10px">
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">نطاق هذا المستوى</label>
      <select id="custDiscScope${idx}" class="form-input" style="margin-bottom:8px" onchange="document.getElementById('custDiscClientsBox${idx}').style.display=this.value==='client'?'block':'none'">
        <option value="all" ${!tier.scope || tier.scope==='all' ? 'selected':''}>تحديد الكل</option>
        <option value="client" ${tier.scope==='client' ? 'selected':''}>عملاء معنيين</option>
      </select>
      <div id="custDiscClientsBox${idx}" style="${tier.scope==='client' ? '' : 'display:none'};max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:12px">
        ${clientCheckboxes || '<div style="font-size:12px;color:var(--text-muted)">لا يوجد عملاء مسجلين</div>'}
      </div>
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">وقت انتهاء هذا المستوى (اختياري)</label>
      <input type="datetime-local" id="custDiscExpiry${idx}" class="form-input" style="margin-bottom:8px" value="${tier.expiresAt ? toDatetimeLocalValue(tier.expiresAt) : ''}">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" onclick="setCustomDiscExpiryPreset(${idx},1)" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">يوم</button>
        <button type="button" onclick="setCustomDiscExpiryPreset(${idx},2)" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">يومين</button>
        <button type="button" onclick="setCustomDiscExpiryPreset(${idx},3)" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">3 أيام</button>
        <button type="button" onclick="setCustomDiscExpiryPreset(${idx},7)" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">أسبوع</button>
        <button type="button" onclick="setCustomDiscExpiryPreset(${idx},30)" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">شهر</button>
        <button type="button" onclick="document.getElementById('custDiscExpiry${idx}').value=''" style="flex:1;min-width:56px;padding:6px;border-radius:8px;border:1.5px solid var(--border);background:#fff;font-size:11px;font-weight:700;cursor:pointer">بدون</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('customDiscountSettingsBody').innerHTML = `
    <label style="display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:16px;cursor:pointer">
      <input type="checkbox" id="custDiscEnabled" ${cfg && cfg.enabled ? 'checked' : ''} style="width:20px;height:20px">
      تفعيل الخصم المخصص
    </label>
    <label style="display:flex;align-items:center;gap:10px;font-weight:700;margin-bottom:16px;cursor:pointer">
      <input type="checkbox" id="custDiscApplyToOffers" ${!cfg || cfg.applyToOffers !== false ? 'checked' : ''} style="width:20px;height:20px">
      تطبيق الخصم على عروض الكمية والباقات أيضاً
    </label>
    ${tierHtml}
    <button onclick="saveCustomDiscountConfig()" class="btn-submit" style="width:100%">
      <i class="fas fa-save"></i> حفظ إعدادات الخصم المخصص
    </button>`;
}

function closeCustomDiscountSettingsModal() {
  document.getElementById('customDiscountSettingsModal').classList.remove('open');
}

async function saveCustomDiscountConfig() {
  const enabled = document.getElementById('custDiscEnabled').checked;
  const applyToOffers = document.getElementById('custDiscApplyToOffers').checked;
  const tiers = [0,1,2].map(idx => {
    const scope = document.getElementById(`custDiscScope${idx}`).value;
    const targetIds = scope === 'client'
      ? Array.from(document.querySelectorAll(`.custDiscClient${idx}:checked`)).map(el => el.value)
      : [];
    const expiryVal = document.getElementById(`custDiscExpiry${idx}`).value;
    return {
      amount: parseFloat(document.getElementById(`custDiscAmount${idx}`).value) || 0,
      percent: Math.max(0, Math.min(100, parseFloat(document.getElementById(`custDiscPercent${idx}`).value) || 0)),
      scope, targetIds,
      expiresAt: expiryVal ? new Date(expiryVal).toISOString() : null
    };
  });

  try {
    await window._fbSetDoc(window._fbDoc2('store_data', 'custom_discount_settings'), {
      enabled, applyToOffers, tiers, updatedAt: new Date().toISOString()
    });
    invalidateCustomDiscountConfigCache();
    showToast('✅ تم حفظ إعدادات الخصم المخصص', 'success');
    closeCustomDiscountSettingsModal();
  } catch(e) {
    showToast('❌ فشل الحفظ: ' + e.message, 'error');
  }
}

var _currentDeliveryUid = null;

async function openDeliverySettingsModal(uid, email, name, clinic) {
  if (!uid) { showToast('⚠️ لا يمكن ضبط التوصيل لهذا العميل (لا يوجد حساب مسجّل)', 'error'); return; }
  _currentDeliveryUid = uid;
  document.getElementById('deliverySettingsClientName').textContent = name || email;
  document.getElementById('deliverySettingsError').style.display = 'none';
  document.getElementById('deliveryEnabled').checked = false;
  document.getElementById('deliveryFee').value = '';
  document.getElementById('deliverySettingsModal').classList.add('open');

  const settings = await loadClientDeliverySettings(uid);
  if (settings) {
    document.getElementById('deliveryEnabled').checked = !!settings.enabled;
    document.getElementById('deliveryFee').value = (settings.fee === null || settings.fee === undefined) ? '' : settings.fee;
  }
}

function closeDeliverySettingsModal() {
  document.getElementById('deliverySettingsModal').classList.remove('open');
  _currentDeliveryUid = null;
}

async function saveDeliverySettings() {
  const errEl = document.getElementById('deliverySettingsError');
  errEl.style.display = 'none';
  if (!_currentDeliveryUid) return;

  const enabled = document.getElementById('deliveryEnabled').checked;
  const feeVal = document.getElementById('deliveryFee').value;
  const fee = feeVal === '' ? null : parseFloat(feeVal);

  try {
    await window._fbSetDoc(window._fbDoc2('delivery_settings', _currentDeliveryUid), {
      enabled, fee
    });
    closeDeliverySettingsModal();
    showToast('✅ تم حفظ إعدادات التوصيل', 'success');
  } catch(e) {
    errEl.textContent = 'فشل الحفظ: ' + e.message;
    errEl.style.display = 'block';
  }
}

// ===== إعداد الخصم العام على التوصيل (خارجي — يطبَّق على الجميع ويُلغي تسعير أي عميل) =====
async function openGlobalDeliveryDiscountModal() {
  document.getElementById('globalDeliveryError').style.display = 'none';
  document.getElementById('globalDeliveryDiscountEnabled').checked = false;
  document.getElementById('globalDeliveryTiersList').innerHTML = '';
  document.getElementById('globalDeliveryDiscountModal').classList.add('open');
  toggleGlobalDeliveryTiersSection();

  const settings = await loadGlobalDeliverySettings();
  if (settings) {
    document.getElementById('globalDeliveryDiscountEnabled').checked = !!settings.discountEnabled;
    (settings.tiers || []).forEach(t => addGlobalDeliveryTierRow(t.minTotal, t.type, t.value));
    toggleGlobalDeliveryTiersSection();
  }
}

function closeGlobalDeliveryDiscountModal() {
  document.getElementById('globalDeliveryDiscountModal').classList.remove('open');
}

function toggleGlobalDeliveryTiersSection() {
  const on = document.getElementById('globalDeliveryDiscountEnabled').checked;
  document.getElementById('globalDeliveryTiersWrap').style.display = on ? 'block' : 'none';
}

function addGlobalDeliveryTierRow(minTotal='', type='free', value='') {
  const list = document.getElementById('globalDeliveryTiersList');
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
  row.innerHTML = `
    <input type="number" class="form-input tier-min" placeholder="الفاتورة من (د.أ)" min="0" value="${minTotal}" style="flex:1">
    <select class="form-input tier-type" style="flex:1" onchange="this.nextElementSibling.style.display = this.value==='free' ? 'none':'block'">
      <option value="free" ${type==='free'?'selected':''}>توصيل مجاني</option>
      <option value="fixed" ${type==='fixed'?'selected':''}>مبلغ ثابت (د.أ)</option>
    </select>
    <input type="number" class="form-input tier-value" placeholder="القيمة" min="0" value="${value}" style="flex:1;display:${type==='free'?'none':'block'}">
    <button type="button" onclick="this.closest('.tier-row').remove()" style="width:38px;height:38px;border-radius:50%;background:#fff5f5;color:var(--danger);border:none;cursor:pointer;flex-shrink:0"><i class="fas fa-times"></i></button>`;
  list.appendChild(row);
}

async function saveGlobalDeliveryDiscount() {
  const errEl = document.getElementById('globalDeliveryError');
  errEl.style.display = 'none';

  const discountEnabled = document.getElementById('globalDeliveryDiscountEnabled').checked;
  const tiers = [];
  document.querySelectorAll('#globalDeliveryTiersList .tier-row').forEach(row => {
    const minTotal = parseFloat(row.querySelector('.tier-min').value);
    const type = row.querySelector('.tier-type').value;
    const value = parseFloat(row.querySelector('.tier-value').value) || 0;
    if (!isNaN(minTotal)) tiers.push({ minTotal, type, value });
  });
  tiers.sort((a,b) => a.minTotal - b.minTotal);

  if (discountEnabled && !tiers.length) {
    errEl.textContent = 'أضف درجة واحدة على الأقل أو ألغِ تفعيل الخصم العام';
    errEl.style.display = 'block';
    return;
  }

  try {
    await window._fbSetDoc(window._fbDoc2('delivery_settings', '_global'), {
      discountEnabled, tiers
    });
    closeGlobalDeliveryDiscountModal();
    showToast('✅ تم حفظ الخصم العام على التوصيل — يُطبَّق الآن على جميع العملاء', 'success');
  } catch(e) {
    errEl.textContent = 'فشل الحفظ: ' + e.message;
    errEl.style.display = 'block';
  }
}