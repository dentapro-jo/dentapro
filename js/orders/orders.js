// DentaPro domain module: extracted from the original implementation.
// UNAVAILABLE ITEM REQUEST (طلب/استفسار عن مادة غير متوفرة)
// =====================

function openAddPointsModal(uid, email, name, clinic, currentBalance, mode = 'add') {
  window._pointsMode = mode;
  document.getElementById('pointsTargetUid').value = uid;
  document.getElementById('pointsTargetEmail').value = email;
  document.getElementById('pointsTargetName').textContent = `${name} — ${clinic}`;
  document.getElementById('pointsTargetEmail2').textContent = email;
  document.getElementById('pointsCurrentBalance').textContent = `${currentBalance} 🏆`;
  document.getElementById('pointsAmount').value = '';
  document.getElementById('pointsReason').value = '';
  document.getElementById('pointsModalError').style.display = 'none';

  const modalHeader = document.querySelector('#addPointsModal .modal-header');
  const modalTitle  = document.querySelector('#addPointsModal .modal-title');
  if (mode === 'deduct') {
    modalHeader.style.background = 'linear-gradient(135deg,#c53030,#e53e3e)';
    modalTitle.innerHTML = '<i class="fas fa-minus-circle"></i> تنقيص نقاط من العميل';
    document.getElementById('pointsAmount').placeholder = 'عدد النقاط المخصومة';
  } else {
    modalHeader.style.background = 'linear-gradient(135deg,#d97706,#f59e0b)';
    modalTitle.innerHTML = '<i class="fas fa-star"></i> إضافة نقاط للعميل';
    document.getElementById('pointsAmount').placeholder = 'مثال: 100';
  }
  document.getElementById('addPointsModal').classList.add('open');
}

function closeAddPointsModal() {
  document.getElementById('addPointsModal').classList.remove('open');
}

async function confirmAddPoints() {
  const uid     = document.getElementById('pointsTargetUid').value;
  const email   = document.getElementById('pointsTargetEmail').value;
  const amount  = parseInt(document.getElementById('pointsAmount').value);
  const mode    = window._pointsMode || 'add';
  const defaultReason = mode === 'deduct' ? 'خصم يدوي من الأدمن' : 'إضافة يدوية من الأدمن';
  const reason  = document.getElementById('pointsReason').value.trim() || defaultReason;

  if (!amount || amount < 1) {
    document.getElementById('pointsModalError').style.display = 'flex';
    return;
  }
  document.getElementById('pointsModalError').style.display = 'none';

  const currentBalance = await getClientPoints(uid);

  if (mode === 'deduct' && amount > currentBalance) {
    document.getElementById('pointsModalError').style.display = 'flex';
    document.getElementById('pointsModalError').innerHTML =
      '<i class="fas fa-exclamation-circle"></i> لا يمكن خصم أكثر من الرصيد الحالي (' + currentBalance + ' نقطة)';
    return;
  }

  const delta = mode === 'deduct' ? -amount : amount;

  const log = {
    type: mode === 'deduct' ? 'deduct' : 'add',
    amount,
    reason,
    date: new Date().toISOString(),
    by: 'admin'
  };

  try {
    await saveClientPoints(uid, email, delta, log);
  } catch(e) {
    document.getElementById('pointsModalError').style.display = 'flex';
    document.getElementById('pointsModalError').innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + e.message;
    return;
  }
  closeAddPointsModal();
  showToast(
    mode === 'deduct'
      ? `✅ تم خصم ${amount} نقطة بنجاح`
      : `✅ تم إضافة ${amount} نقطة بنجاح`,
    'success'
  );
  renderAdminPoints();
}
// =====================
// ORDER TRACKING SYSTEM
// =====================

// تنسيق موحّد لعرض إجمالي الطلب — يراعي حالة الدفع المختلط (نقاط + نقد سوا)
function getOrderDiscountPercent(order) {
  if (!order.originalTotal || order.originalTotal <= order.total) return null;
  if (order.discountPercent) return order.discountPercent;
  return Math.round((1 - order.total / order.originalTotal) * 100);
}

// يفكّك المجموع المخزَّن بالطلب (والذي يدمج الخصم والتوصيل) إلى بنود منفصلة لعرضها بالفاتورة
function getOrderBreakdown(order) {
  const deliveryDetermined = !!order.deliveryDetermined;
  const deliveryFee = deliveryDetermined ? (order.deliveryFee || 0) : 0;
  const postDiscountSubtotal = deliveryDetermined ? (order.total || 0) - deliveryFee : (order.total || 0);
  const hasDiscount = order.originalTotal && order.originalTotal > postDiscountSubtotal;
  const subtotal = hasDiscount ? order.originalTotal : postDiscountSubtotal;
  const discount = hasDiscount ? Math.round((subtotal - postDiscountSubtotal) * 100) / 100 : 0;
  return { subtotal, discount, deliveryFee, deliveryDetermined, finalTotal: order.total || 0 };
}

// تحديد رابط خريطة من بيانات الطلب
function getOrderMapLink(order) {
  if (order.locationLat && order.locationLng) {
    return `https://www.google.com/maps/search/?api=1&query=${order.locationLat},${order.locationLng}`;
  }
  if (order.address) {
    // استخراج إحداثيات (أرقام عشرية) من نص العنوان إن وُجدت، حتى لو مكتوبة بصيغة عربية
    const coordsMatch = order.address.match(/(-?\d+\.\d+)[^\d-]+(-?\d+\.\d+)/);
    if (coordsMatch) {
      return `https://www.google.com/maps/search/?api=1&query=${coordsMatch[1]},${coordsMatch[2]}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`;
  }
  return null;
}



// ── CLIENT ORDERS ──
function openClientOrders() {
  if (!currentUser) { openAuthModal('login'); return; }
  showPage('orders');
  renderPointsInHeader();
}
let _clientOrdersRenderPromise = null;

function renderClientOrders() {
  // منع تشغيل أكثر من تحميل في نفس الوقت عند فتح إشعار تحديث الطلب.
  if (_clientOrdersRenderPromise) return _clientOrdersRenderPromise;

  _clientOrdersRenderPromise = (async function() {
  const container = document.getElementById('clientOrdersList');
  container.innerHTML = skeletonOrderCardsHTML(3);

  try {
    // انتظر حتى يصبح Firebase جاهزاً
    for (let i = 0; i < 30; i++) {
      if (window._fbQuery && window._fbOrdersRef && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 300));
    }
    if (!window._fbQuery) throw new Error('Firebase غير جاهز');

    let q;
    if (isStaff()) {
      // تحديد عدد الطلبات المجلوبة دفعة واحدة لتفادي تجميد الصفحة عند تراكم آلاف الطلبات
      q = window._fbQuery(window._fbOrdersRef(), window._fbOrderBy('createdAt','desc'), window._fbLimit(50));
    } else {
      // لازم نفلتر من السيرفر عبر where() حتى تتوافق مع قواعد Firestore
      q = window._fbQuery(
        window._fbOrdersRef(),
        window._fbWhere('clientEmail', '==', currentUser.email)
      );
    }
    const snap = await window._fbGetDocs(q);
    let orders = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));

    if (currentUser.role !== 'admin') {
      orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    window._cachedOrders = orders;

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty-orders">
          <i class="fas fa-box-open"></i>
          <h3>لا توجد طلبات بعد</h3>
          <p>ابدأ تسوقك الآن وستجد طلباتك هنا</p>
          <button class="btn-primary" style="margin-top:16px"
            onclick="showPage('home')">تسوّق الآن</button>
        </div>`;
      return;
    }

    container.innerHTML = orders.map(order => {
      const date = new Date(order.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
        { year:'numeric', month:'long', day:'numeric' });
      return `
      <div class="order-track-card" data-order-id="${escHtml(String(order._docId || order.id))}">
        <div class="order-track-header">
          <div>
            <div class="order-track-num">
              <i class="fas fa-receipt" style="color:var(--primary-light)"></i> #${order.id}
            </div>
            <div class="order-track-date">📅 ${date} · ${escHtml(order.clinic)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            ${statusBadgeHTML(order.status)}
            ${order.payMethod === 'points'
              ? `<div class="order-track-total" style="background:#fffbeb;color:#92400e;border:1.5px solid #f59e0b">${formatOrderTotal(order)}</div>`
              : `<div class="order-track-total">${fmtPrice(order.total)} د.أ${deliveryLineHTML(order.deliveryFee, order.deliveryDetermined)}</div>`}
            <button onclick="printOrderInvoice('${order.id}')"
              style="padding:6px 16px;border-radius:50px;background:#f0f8ff;color:#0a5c8a;
                     border:1.5px solid #d0e4ef;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
              <i class="fas fa-print"></i> طباعة
            </button>
          </div>
        </div>
        <div class="order-track-body">
          ${trackStepsHTML(order.status)}
          <div class="order-items-list">
            ${dpDisplayItems(order.items).map(item => `
              <div class="order-item-row">
                <div class="order-item-icon">${escHtml(item.icon || '')}</div>
                <div style="flex:1;font-weight:600;color:var(--primary-dark)">${escHtml(item.ar || '')}${dpSizesSub(item)}</div>
                <div style="color:var(--text-muted)">× ${item.qty}</div>
                <div style="font-weight:800;color:${order.payMethod === 'points' ? '#d97706' : 'var(--primary)'}">
                  ${order.payMethod === 'points'
                    ? `🏆 ${(item.points||0)*item.qty} نقطة`
                    : `${fmtPrice((item.price*item.qty))} د.أ`}
                </div>
              </div>`).join('')}
          </div>
          ${order.notes ? `
            <div style="margin-top:12px;padding:10px 14px;background:#f8fbfd;
                        border-radius:10px;font-size:13px;color:var(--text-muted)">
              <i class="fas fa-sticky-note" style="color:var(--accent2)"></i> ${escHtml(order.notes)}
            </div>` : ''}
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    console.error(e);
    container.innerHTML = `
      <div class="empty-orders">
        <i class="fas fa-triangle-exclamation" style="color:var(--danger)"></i>
        <h3>تعذّر تحميل الطلبات</h3>
        <p>يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً</p>
        <button class="btn-primary" style="margin-top:16px" onclick="renderClientOrders()">إعادة المحاولة</button>
      </div>`;
  }
  })().finally(() => {
    _clientOrdersRenderPromise = null;
  });

  return _clientOrdersRenderPromise;
}
// ── ADMIN ORDERS ──
var ADMIN_TAB_TITLES = {
  products: 'المنتجات', orders: 'الطلبات', points: 'النقاط', offers: 'العروض',
  quotes: 'عروض الأسعار', messages: 'الرسائل', roles: 'الصلاحيات', homebanner: 'الصفحة الرئيسية'
};

function switchAdminTab(tab) {
  const isProducts = tab === 'products';
  const isOrders   = tab === 'orders';
  const isPoints   = tab === 'points';
  const isOffers   = tab === 'offers';
  const isQuotes   = tab === 'quotes';
  const isMessages = tab === 'messages';
  const isRoles    = tab === 'roles';
  const isHomeBanner = tab === 'homebanner';

  if (isRoles && !isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  if (isHomeBanner && !isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }

  const titleEl = document.getElementById('adminPanelTitle');
  if (titleEl) titleEl.textContent = ADMIN_TAB_TITLES[tab] || 'المنتجات';

  const statsGrid = document.getElementById('adminStatTotal').closest('div[style*="grid"]');
  if (statsGrid) statsGrid.style.display = isProducts ? 'grid' : 'none';

  const filterBar = document.getElementById('adminFilterBar');
  if (filterBar) filterBar.style.display = isProducts ? 'flex' : 'none';

  const productsToolbar = document.getElementById('adminProductsToolbar');
  if (productsToolbar) productsToolbar.style.display = isProducts ? 'flex' : 'none';

  const prodWrap = document.getElementById('adminProductsWrap');
  if (prodWrap) prodWrap.style.display = isProducts ? 'block' : 'none';

  const ordersWrap = document.getElementById('adminOrdersWrap');
  if (ordersWrap) ordersWrap.style.display = isOrders ? 'block' : 'none';

  const pointsWrap = document.getElementById('adminPointsWrap');
  if (pointsWrap) pointsWrap.style.display = isPoints ? 'block' : 'none';

  const offersWrap = document.getElementById('adminOffersWrap');
  if (offersWrap) offersWrap.style.display = isOffers ? 'block' : 'none';

  const quotesWrap = document.getElementById('adminQuotesWrap');
  if (quotesWrap) quotesWrap.style.display = isQuotes ? 'block' : 'none';

  const messagesWrap = document.getElementById('adminMessagesWrap');
  if (messagesWrap) messagesWrap.style.display = isMessages ? 'block' : 'none';

  const rolesWrap = document.getElementById('adminRolesWrap');
  if (rolesWrap) rolesWrap.style.display = isRoles ? 'block' : 'none';

  const homeBannerWrap = document.getElementById('adminHomeBannerWrap');
  if (homeBannerWrap) homeBannerWrap.style.display = isHomeBanner ? 'block' : 'none';

  if (isOrders)   { renderAdminOrders(); markNotifsByLinkPrefixRead(['adminorders:']); }
  if (isPoints)   { renderAdminPoints(); loadAutoPointsConfigIntoForm(); loadEarnPointsConfigIntoForm(); }
  if (isOffers)   renderAdminOffers();
  if (isQuotes)   { renderAdminQuotes(); markNotifsByLinkPrefixRead(['adminquotes:']); }
  if (isMessages) { renderAdminMessages(); markNotifsByLinkPrefixRead(['clientmsg:']); }
  if (isRoles)    renderAdminStaffList();
  if (isHomeBanner) renderAdminHomeBanner();
}

// يُخفي عناصر الأدمن الحصرية (تبويب الصلاحيات + زر إعادة التعيين) عن Manager
function applyAdminUIPermissions() {
  const adminOnly = isAdmin();
  const rolesTabBtn = document.getElementById('adminTabRoles');
  if (rolesTabBtn) rolesTabBtn.style.display = adminOnly ? 'inline-block' : 'none';
}

// ── إدارة الصلاحيات: البحث عن مستخدم بالبريد أو بالاسم وتعيين دوره ──
function roleBadgeChip(role) {
  const roleLabel = role === 'admin' ? 'مدير النظام' : role === 'manager' ? 'مدير فرعي' : 'عميل';
  const roleColor = role === 'admin' ? '#e53e3e' : role === 'manager' ? '#d97706' : '#0a5c8a';
  return `<span style="padding:3px 12px;border-radius:50px;background:${roleColor}1a;color:${roleColor};font-size:11px;font-weight:800">${roleLabel}</span>`;
}

function roleActionButtonsHTML(uid, email) {
  return `
    <button onclick="assignUserRole('${escJsAttr(uid)}','admin','${escJsAttr(email)}')"
      style="padding:7px 14px;border-radius:50px;background:#e53e3e;color:#fff;border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
      مدير نظام
    </button>
    <button onclick="assignUserRole('${escJsAttr(uid)}','manager','${escJsAttr(email)}')"
      style="padding:7px 14px;border-radius:50px;background:#d97706;color:#fff;border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
      مدير فرعي
    </button>
    <button onclick="revokeUserRole('${escJsAttr(uid)}','${escJsAttr(email)}')"
      style="padding:7px 14px;border-radius:50px;background:#fff5f5;color:var(--danger);border:1.5px solid #fecaca;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
      <i class="fas fa-trash-alt"></i> إزالة الصلاحية
    </button>`;
}

async function fetchAllUsersList() {
  const snap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

async function searchUserForRole() {
  const term = document.getElementById('roleSearchEmail').value.trim();
  const resultBox = document.getElementById('roleSearchResult');
  if (!term) { showToast('يرجى إدخال البريد الإلكتروني أو اسم المستخدم', 'error'); return; }
  if (!navigator.onLine) { showToast('📡 لا يوجد اتصال بالإنترنت', 'error'); return; }
  resultBox.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</div>`;
  try {
    const allUsers = await fetchAllUsersList();
    const normTerm = normalizeArabic(term);
    const matches = allUsers.filter(u =>
      (u.email || '').toLowerCase().includes(term.toLowerCase()) ||
      normalizeArabic(u.firstName || u.name || '').includes(normTerm)
    );

    if (!matches.length) {
      resultBox.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px 0"><i class="fas fa-exclamation-circle"></i> لا يوجد مستخدم مطابق (يجب أن يكون قد أنشأ حساباً أولاً)</div>`;
      return;
    }

    resultBox.innerHTML = matches.map(data => {
      const currentRole = data.role || 'client';
      return `
      <div style="padding:14px;background:#f8fbfd;border-radius:12px;border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
          <div>
            <div style="font-weight:800">${escHtml(data.firstName || data.name || data.email)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${escHtml(data.email)}${data.clinic?' · '+escHtml(data.clinic):''}</div>
          </div>
          ${roleBadgeChip(currentRole)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${roleActionButtonsHTML(data.uid, data.email)}
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('searchUserForRole:', e.message);
    resultBox.innerHTML = `<div style="color:var(--danger);font-size:13px"><i class="fas fa-exclamation-circle"></i> حدث خطأ أثناء البحث، تحقق من اتصالك وحاول مجدداً</div>`;
  }
}

// ── عرض قائمة كل المدراء (admin) والمدراء الفرعيين (manager) الحاليين ──
async function renderAdminStaffList() {
  const container = document.getElementById('adminStaffList');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>`;
  try {
    const allUsers = await fetchAllUsersList();
    let staff = allUsers.filter(u => u.role === 'admin' || u.role === 'manager');

    // ضمان ظهور مدير النظام الرئيسي (البريد الثابت) حتى لو لم يكن له مستند users/{uid} بعد
    if (!staff.find(u => u.email === ADMIN_EMAIL)) {
      staff.unshift({ uid: null, email: ADMIN_EMAIL, firstName: 'المدير الرئيسي', role: 'admin', isBootstrap: true });
    }

    // ترتيب: مدير النظام أولاً ثم المدراء الفرعيون
    staff.sort((a,b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1));

    if (!staff.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">لا يوجد مدراء حالياً</div>`;
      return;
    }

    container.innerHTML = staff.map(u => {
      const avatarBg = u.role === 'admin' ? 'linear-gradient(135deg,#e53e3e,#c53030)' : 'linear-gradient(135deg,#d97706,#b45309)';
      const isSelf = currentUser && u.email === currentUser.email;
      const actions = u.isBootstrap
        ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic">حساب المدير الأساسي — لا يمكن تعديله من هنا</span>`
        : isSelf
          ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic">هذا حسابك الحالي</span>`
          : roleActionButtonsHTML(u.uid, u.email);
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
                  background:#fff;border:1px solid #e2eaf0;border-radius:14px;padding:14px 18px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px">
          <div style="width:40px;height:40px;border-radius:50%;background:${avatarBg};color:#fff;
                      display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">
            ${escHtml((u.firstName||u.name||'؟').charAt(0))}
          </div>
          <div style="min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">${escHtml(u.firstName || u.name || 'بدون اسم')}</div>
            <div style="font-size:12px;color:var(--text-muted)">${escHtml(u.email)}</div>
          </div>
          ${roleBadgeChip(u.role)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${actions}</div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('renderAdminStaffList:', e.message);
    container.innerHTML = `<div style="color:var(--danger);font-size:13px;text-align:center;padding:16px"><i class="fas fa-exclamation-circle"></i> تعذّر تحميل القائمة، تحقق من اتصالك</div>`;
  }
}

async function assignUserRole(uid, role, email) {
  if (!isAdmin()) { showToast('⛔ غير مصرح', 'error'); return; }
  const label = role === 'admin' ? 'مدير نظام' : role === 'manager' ? 'مدير فرعي' : 'عميل';
  if (!confirm(`تأكيد: تعيين ${email} كـ "${label}"؟`)) return;
  if (!navigator.onLine) { showToast('📡 لا يوجد اتصال بالإنترنت، حاول مجدداً', 'error'); return; }
  try {
    await window._fbUpdateDoc(window._fbDoc2('users', uid), { role });
    showToast('✅ تم تحديث الصلاحية بنجاح', 'success');
    searchUserForRole();
    renderAdminStaffList();
  } catch(e) {
    console.error('assignUserRole:', e.message);
    showToast('❌ فشل تحديث الصلاحية، تحقق من اتصالك وحاول مجدداً', 'error');
  }
}

// إزالة صلاحية مدير/مدير فرعي وإعادته لدور "عميل" — ملاحظة: هذا لا يحذف حساب المستخدم نفسه
// (حذف حساب Firebase Authentication يتطلب صلاحيات Admin SDK من الخادم، غير متاحة من المتصفح)
async function revokeUserRole(uid, email) {
  if (!isAdmin()) { showToast('⛔ غير مصرح', 'error'); return; }
  if (!confirm(`سيتم إزالة صلاحية الإدارة عن ${email} وتحويله إلى "عميل". هل تريد المتابعة؟`)) return;
  if (!navigator.onLine) { showToast('📡 لا يوجد اتصال بالإنترنت، حاول مجدداً', 'error'); return; }
  try {
    await window._fbUpdateDoc(window._fbDoc2('users', uid), { role: 'client' });
    showToast('✅ تمت إزالة الصلاحية بنجاح', 'success');
    searchUserForRole();
    renderAdminStaffList();
  } catch(e) {
    console.error('revokeUserRole:', e.message);
    showToast('❌ فشل تنفيذ العملية، تحقق من اتصالك وحاول مجدداً', 'error');
  }
}

function normalizeAdminPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('009627')) return '9627' + digits.slice(6);
  if (digits.startsWith('9627')) return digits;
  if (digits.startsWith('07')) return '9627' + digits.slice(2);
  return digits;
}

// يربط سجلات الزوار القديمة بحساب العميل المسجل عند عرضها للإدمن.
// لا يغيّر clientEmail حتى تبقى قواعد وتدفقات الطلبات القديمة متوافقة.
async function reconcileGuestRecordNames(records) {
  const guestRecords = (records || []).filter(r => r.clientEmail === 'guest' && r.phone);
  if (!guestRecords.length || !window._fbGetDocs || !window._fbCollection || !window._db) return;
  try {
    const snap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
    const usersByPhone = {};
    snap.docs.forEach(d => {
      const user = { ...d.data(), uid: d.id };
      if (user.role !== 'client') return;
      const key = normalizeAdminPhone(user.phone);
      if (key && !usersByPhone[key]) usersByPhone[key] = user;
    });
    guestRecords.forEach(record => {
      const matched = usersByPhone[normalizeAdminPhone(record.phone)];
      if (!matched) return;
      record.clientName = matched.firstName || matched.name || record.clientName;
      record.doctor = record.clientName;
      record.clinic = matched.clinic || record.clinic;
      record.clientUid = matched.uid || record.clientUid || null;
    });
  } catch (e) {
    console.warn('reconcileGuestRecordNames:', e.message);
  }
}

let _adminOrdersRenderPromise = null;

async function renderAdminOrders() {
  // منع تشغيل أكثر من رسم متزامن عند وصول عدة إشعارات onSnapshot متتالية
  if (_adminOrdersRenderPromise) return _adminOrdersRenderPromise;
  _adminOrdersRenderPromise = _renderAdminOrdersInner().finally(() => {
    _adminOrdersRenderPromise = null;
  });
  return _adminOrdersRenderPromise;
}

async function _renderAdminOrdersInner() {
  const body = document.getElementById('adminOrdersBody');
  if (!body) return;

  body.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text-muted)">
      <div class="spinner" style="margin:0 auto 14px;width:28px;height:28px;border-width:4px"></div>
      جاري تحميل الطلبات...
    </div>`;

  try {
    // نفس تحديد العدد المطبّق في renderClientOrders لمنع تجميد الصفحة عند تراكم آلاف الطلبات
    const q    = window._fbQuery(window._fbOrdersRef(), window._fbOrderBy('createdAt','desc'), window._fbLimit(50));
    const snap = await window._fbGetDocs(q);
    const orders = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    await reconcileGuestRecordNames(orders);
    window._cachedOrders = orders;

    const pending = orders.filter(o => !['delivered','cancelled'].includes(o.status)).length;
    const ordersBadge = document.getElementById('adminOrdersBadge');
    if (ordersBadge) ordersBadge.textContent = pending > 0 ? pending : '';

    if (!orders.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:56px 24px;color:var(--text-muted)">
          <i class="fas fa-inbox" style="font-size:52px;opacity:0.15;display:block;margin-bottom:16px"></i>
          <h3 style="font-weight:800;font-size:17px;color:var(--text);margin-bottom:8px">لا توجد طلبات بعد</h3>
          <p style="font-size:14px">ستظهر هنا فور إرسالها من العملاء</p>
        </div>`;
      return;
    }

    body.innerHTML = orders.map(order => {
      const date = new Date(order.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
        { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const itemsSummary = order.items.slice(0,2)
        .map(i => `${escHtml(i.icon || '')} ${escHtml((i.ar||'').substring(0,12))}`).join(' · ')
        + (order.items.length > 2 ? ` +${order.items.length - 2}` : '');
      const statusOpts = ORDER_STATUSES.map(s =>
        `<option value="${s.key}" ${order.status===s.key?'selected':''}>${s.label}</option>`
      ).join('');

      return `
      <div class="admin-order-row">
        <div>
          <div style="font-weight:800;color:var(--primary-dark);font-size:13px">#${escHtml(order.id)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            👤 ${escHtml(order.clientName)} · ${escHtml(order.clinic)}
          </div>
          <div style="font-size:11px;color:var(--text-muted)">📞 ${escHtml(order.phone)}</div>
        </div>
        <div class="admin-order-field" data-label="المنتجات:" style="font-size:12px;color:var(--text-muted);line-height:1.7">
          ${itemsSummary}<br>
          <span style="color:var(--primary-light);font-weight:700">${order.items.length} منتج</span>
        </div>
        <div class="admin-order-field" data-label="الإجمالي:" style="font-weight:900;color:${order.payMethod==='points'?'#d97706':'var(--primary)'}">
          ${formatOrderTotal(order)}
          <div style="display:flex;align-items:center;gap:4px;margin-top:4px;font-weight:400">
            <input type="number" id="deliveryFeeInput_${order._docId}" placeholder="توصيل" min="0" step="0.1"
              value="${order.deliveryFee !== null && order.deliveryFee !== undefined ? order.deliveryFee : ''}"
              style="width:60px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);font-size:11px;font-family:inherit">
            <button onclick="saveOrderDeliveryFee('${escJsAttr(order._docId)}')" title="حفظ أجور التوصيل لهذا الطلب فقط"
              style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:12px;padding:0"><i class="fas fa-check"></i></button>
          </div>
        </div>
        <div class="admin-order-field" data-label="التاريخ:" style="font-size:12px;color:var(--text-muted)">${date}</div>
        <div class="admin-order-field" data-label="الحالة:">
          <select class="status-select"
            onchange="updateOrderStatus('${escJsAttr(order._docId)}','${escJsAttr(order.id)}',this.value)">
            ${statusOpts}
          </select>
        </div>
        <div>
          <button onclick="showAdminOrderDetail('${order.id}')"
            style="padding:6px 12px;border-radius:50px;background:#e8f3fb;color:var(--primary);
                   border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
            <i class="fas fa-eye"></i> عرض
          </button>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    console.error(e);
    body.innerHTML = `
      <div style="text-align:center;padding:32px;color:var(--danger)">
        <i class="fas fa-exclamation-circle" style="font-size:32px;display:block;margin-bottom:12px"></i>
        خطأ في الاتصال بقاعدة البيانات
      </div>`;
  }
}
// يحوّل الأرقام العربية (٠-٩) والفاصلة العربية إلى صيغة تفهمها parseFloat
function normalizeNumericInput(str) {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  return String(str)
    .replace(/[٠-٩]/g, d => arabicDigits.indexOf(d))
    .replace(/،/g, '.')
    .trim();
}
async function saveOrderDeliveryFee(docId) {
  const input = document.getElementById(`deliveryFeeInput_${docId}`);
  if (!input) return;
  const rawVal = normalizeNumericInput(input.value);
  const fee = rawVal === '' ? null : parseFloat(rawVal);
  if (fee !== null && isNaN(fee)) {
    showToast('⚠️ قيمة التوصيل غير صحيحة', 'error');
    return;
  }

  try {
    // نقرأ الطلب طازجاً من قاعدة البيانات مباشرة (وليس من الكاش المحلي الذي قد يكون قديماً)
    // حتى نضمن أن التعديل اليدوي لهذا الطلب تحديداً يُطبَّق فوق آخر بيانات فعلية ولا يُفقد
    const snap = await window._fbGetDoc(window._fbDoc(docId));
    if (!snap.exists()) { showToast('❌ تعذر إيجاد الطلب', 'error'); return; }
    const order = snap.data();

    const previousDeliveryInTotal = order.deliveryDetermined ? (order.deliveryFee || 0) : 0;
    const subtotal = (order.total || 0) - previousDeliveryInTotal;
    const newTotal = fee === null ? subtotal : subtotal + fee;

    await window._fbUpdateDoc(window._fbDoc(docId), {
      deliveryFee: fee,
      deliveryDetermined: fee !== null,
      total: newTotal
    });

    // نحدّث الكاش المحلي والحقل فوراً بنفس القيمة المحفوظة كي لا يظهر أي ارتداد بصري للقيمة القديمة
    const cachedOrder = (window._cachedOrders || []).find(o => o._docId === docId);
    if (cachedOrder) { cachedOrder.deliveryFee = fee; cachedOrder.deliveryDetermined = fee !== null; cachedOrder.total = newTotal; }
    input.value = fee !== null ? fee : '';

    showToast('✅ تم تحديث أجور التوصيل لهذا الطلب', 'success');
    renderAdminOrders();
  } catch(e) {
    showToast('❌ فشل التحديث: ' + e.message, 'error');
  }
}
async function updateOrderStatus(docId, orderId, newStatus) {
  try {
    // نقرأ الطلب طازجاً من قاعدة البيانات مباشرة (وليس من الكاش المحلي الذي قد يكون قديماً)
    // حتى نضمن أن قرار خصم النقاط/المخزون يُبنى على القيم الفعلية الحالية
    // (payMethod, pointsDeducted, stockDeducted, totalPoints, clientUid, ...)
    const freshSnap = await window._fbGetDoc(window._fbDoc(docId));
    const order = freshSnap.exists()
      ? { _docId: docId, ...freshSnap.data() }
      : ((window._cachedOrders || []).find(o => o._docId === docId) || {});
    await window._fbUpdateDoc(window._fbDoc(docId), { status: newStatus });

    if (order.clientEmail && order.clientEmail !== 'guest') {
      const s = getStatusObj(newStatus);
      createNotification({
        scope: 'client',
        targetEmail: order.clientEmail,
        icon: s.icon === 'fa-clock' ? '⏳' : s.icon === 'fa-check-circle' ? '✅' : s.icon === 'fa-box-open' ? '📦' : s.icon === 'fa-shipping-fast' ? '🚚' : s.icon === 'fa-hand-holding' ? '🎉' : '🚫',
        title: `تحديث طلبك #${order.id || orderId}`,
        message: `حالة طلبك الآن: ${s.label}`,
        link: 'page:orders',
      });
    }
// خصم المخزون تلقائياً عند التحويل إلى أي حالة عدا "ملغي"، بشرط ألا يكون مخزون الطلب محجوزاً/مخصوماً حالياً
// (المحجوز وقت الإرسال عبر reserveOrderStock لا يُخصم ثانية؛ والطلب الملغي الذي أُعيد فتحه يُخصم من جديد لأن الكمية رجعت عند الإلغاء)
    const stockCurrentlyHeld = !!(order && (order.stockReserved || order.stockDeducted) && !order.stockReleased);
    if (newStatus !== 'cancelled' && order && !stockCurrentlyHeld) {
      await ensureAllProductsLoaded(); // نضمن أن كل المنتجات محمّلة محلياً قبل تعديل مخزونها
      const changedProducts = [];
      const stockCrossings = [];
      (order.items || []).forEach(item => {
        if (item.isBundle && item.bundleItems) {
          item.bundleItems.forEach(bi => {
            const prod = products.find(x => x.id === bi.productId);
            if (prod && prod.stock !== undefined && prod.stock !== null) {
              const prevStock = prod.stock;
              prod.stock = Math.max(0, prod.stock - (bi.qty * item.qty));
              changedProducts.push(prod);
              stockCrossings.push({ name: prod.ar, prev: prevStock, next: prod.stock });
            }
          });
        } else {
          const prod = products.find(x => x.id === item.id);
          if (prod && prod.stock !== undefined && prod.stock !== null) {
            const prevStock = prod.stock;
            prod.stock = Math.max(0, prod.stock - item.qty);
            changedProducts.push(prod);
            stockCrossings.push({ name: prod.ar, prev: prevStock, next: prod.stock });
          }
        }
      });
      if (changedProducts.length) {
        cacheProductsLocally();
        try {
          await Promise.all(changedProducts.map(p => saveProductToFirebase(p)));
        } catch(stockErr) {
          console.warn('⚠️ خطأ أثناء تحديث المخزون في Firebase:', stockErr.message);
        }
      }
      // نفس المنتج قد يتكرر في الطلب: نُرسل إشعاراً واحداً بآخر قيمة لكل منتج (من أول قيمة سابقة إلى آخر قيمة)
      const _byName = {};
      stockCrossings.forEach(c => { _byName[c.name] = _byName[c.name] ? { name: c.name, prev: _byName[c.name].prev, next: c.next } : c; });
      Object.values(_byName).forEach(c => notifyStockLevel(c.name, c.prev, c.next));
      await window._fbUpdateDoc(window._fbDoc(docId), { stockDeducted: true, stockReleased: false });
    }
    // خصم النقاط تلقائياً فقط عند التسليم، وفقط إذا لم تُخصم من قبل
    if (newStatus === 'delivered' && order.payMethod === 'points' && !order.pointsDeducted) {
      const log = {
        type: 'spend',
        amount: order.totalPoints || 0,
        reason: `شراء بالنقاط — طلب #${order.id || orderId}`,
        date: new Date().toISOString(),
      };
      await saveClientPoints(order.clientUid, order.clientEmail, -(order.totalPoints || 0), log);
      await window._fbUpdateDoc(window._fbDoc(docId), { pointsDeducted: true });
    }

    // إضافة نقاط تلقائية من قيمة الطلب عند التسليم، وفقط إذا لم تُضف من قبل (مرة واحدة لكل طلب)
    if (newStatus === 'delivered' && !order.earnPointsAwarded) {
      if (order.clientUid) {
        const eligibleTotal = computeEarnPointsEligibleTotal(order);
        const earnedPoints = Math.round(eligibleTotal * (_earnPointsConfig.percent || 0) / 100);
        if (earnedPoints > 0) {
          const log = {
            type: 'earn',
            amount: earnedPoints,
            reason: `نقاط تلقائية من الطلب #${order.id || orderId}`,
            date: new Date().toISOString(),
          };
          await saveClientPoints(order.clientUid, order.clientEmail, earnedPoints, log);
        }
      }
      await window._fbUpdateDoc(window._fbDoc(docId), { earnPointsAwarded: true });
    }

    if (newStatus === 'cancelled' && order && (order.stockReserved || order.stockDeducted) && !order.stockReleased) {
      await ensureAllProductsLoaded();
      await releaseOrderStock(order.items);
      await window._fbUpdateDoc(window._fbDoc(docId), { stockReleased: true });
    }

    // طلب ملغى عليه كود خصم: نُرجع الاستعمال حتى لا يُستنفد الكود بطلبات ملغاة
    if (newStatus === 'cancelled' && order && order.couponCode && !order.couponRefunded && typeof dpReleaseCouponUse === 'function') {
      await dpReleaseCouponUse(order, docId);
    }

    const s = getStatusObj(newStatus);
    showToast(`✅ طلب #${orderId} → ${s.label}`, 'success');
    if (document.getElementById('ordersPage').classList.contains('active')) {
      renderClientOrders();
    }
  } catch(e) {
    console.error(e);
    showToast('❌ فشل تحديث الحالة، تحقق من الاتصال', 'error');
  }
}

// =====================
// طباعة الفاتورة
// =====================
function printOrderInvoice(orderId) {
  const orders = window._cachedOrders || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) { showToast('❌ لم يتم العثور على الطلب', 'error'); return; }

  const date = new Date(order.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
    { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });

  const rows = dpDisplayItems(order.items).map(item => {
    // كل مادة تعرض بوحدتها الفعلية: نقاط لو مؤهلة وطُلب الدفع بالنقاط، وإلا نقد
    const itemPaidByPoints = order.payMethod === 'points' && (item.points || 0) > 0;
    return `
    <tr>
      <td>${escHtml(item.ar)}${item.sizesLabel ? `<br><small style="color:#5a7a90">${escHtml(item.sizesLabel)}</small>` : ''}</td>
      <td style="text-align:center">${item.qty}</td>
      <td style="text-align:center">${itemPaidByPoints
        ? `${(item.points||0)} نقطة`
        : `${fmtPrice(item.price)} د.أ`}</td>
      <td style="text-align:center;font-weight:700">${itemPaidByPoints
        ? `${(item.points||0)*item.qty} نقطة`
        : `${fmtPrice((item.price*item.qty))} د.أ`}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>فاتورة طلب #${order.id}</title>
    <style>
      body{font-family:'Cairo',Arial,sans-serif;padding:32px;color:#0f2133}
      h1{color:#0a5c8a;margin-bottom:4px}
      .muted{color:#5a7a90;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      th,td{padding:10px 12px;border-bottom:1px solid #e2eaf0;text-align:right;font-size:14px}
      th{background:#f0f8ff;color:#0a5c8a}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}
      .box{background:#f8fbfd;border-radius:8px;padding:12px}
      .total{margin-top:16px;text-align:left;font-size:18px;font-weight:900;color:#0a5c8a}
      @media print{ body{padding:0} }
    </style></head>
    <body>
      <h1>🦷 DentaPro</h1>
      <div class="muted">فاتورة طلب رقم #${order.id} — ${date}</div>
      <div class="grid">
        <div class="box"><strong>العميل:</strong> ${escHtml(order.clientName)}</div>
        <div class="box"><strong>العيادة:</strong> ${escHtml(order.clinic) || '—'}</div>
        <div class="box"><strong>الهاتف:</strong> ${escHtml(order.phone)}</div>
        <div class="box"><strong>العنوان:</strong> ${escHtml(order.address) || '—'}</div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${(order.payMethod !== 'points' && order.payMethod !== 'free') ? (() => {
        const b = getOrderBreakdown(order);
        return `
      <div class="grid" style="grid-template-columns:1fr;gap:6px;margin:16px 0 0">
        <div style="display:flex;justify-content:space-between;font-size:14px"><span>المجموع</span><span>${fmtPrice(b.subtotal)} د.أ</span></div>
        ${b.discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:#e53e3e"><span>الخصم</span><span>- ${fmtPrice(b.discount)} د.أ</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:14px"><span>التوصيل</span><span>${b.deliveryDetermined ? (b.deliveryFee ? fmtPrice(b.deliveryFee) + ' د.أ' : 'مجاني') : 'غير محدد بعد'}</span></div>
      </div>
      <div class="total">المجموع النهائي: ${fmtPrice(b.finalTotal)} د.أ</div>`;
      })() : `
      <div class="total">
        الإجمالي الكلي: ${formatOrderTotal(order)}
        ${order.payMethod==='points' ? ' (دفع بالنقاط)' : ''}
      </div>`}
      <script>window.print();<\/script>
    </body></html>
  `);
  win.document.close();
}

function showAdminOrderDetail(orderId) {
  const orders = window._cachedOrders || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  const date = new Date(order.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  document.querySelector('#deleteConfirmModal .modal-header').style.background = 'linear-gradient(135deg,#0a5c8a,#1a8bbf)';
  document.querySelector('#deleteConfirmModal .modal-title').innerHTML = `<i class="fas fa-receipt"></i> تفاصيل الطلب #${order.id}`;
  document.querySelector('#deleteConfirmModal .modal-body').innerHTML = `
    <div style="text-align:right">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">العميل</div>
          <div style="font-weight:700;font-size:14px">${escHtml(order.clientName)}</div>
        </div>
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">العيادة</div>
          <div style="font-weight:700;font-size:14px">${escHtml(order.clinic)}</div>
        </div>
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">الهاتف</div>
          <div style="font-weight:700;font-size:14px"><a href="tel:${escHtml(String(order.phone||'').replace(/[^\d+]/g,''))}" dir="ltr" style="color:var(--primary-dark);text-decoration:none"><i class="fas fa-phone" style="font-size:12px"></i> ${escHtml(order.phone)}</a></div>
        </div>
        ${order.altPhone ? `<div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">الرقم البديل / السكرتيرة</div>
          <div style="font-weight:700;font-size:14px"><a href="tel:${escHtml(String(order.altPhone).replace(/[^\d+]/g,''))}" dir="ltr" style="color:var(--primary-dark);text-decoration:none"><i class="fas fa-phone" style="font-size:12px"></i> ${escHtml(order.altPhone)}</a></div>
        </div>` : ''}
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">التاريخ</div>
          <div style="font-weight:700;font-size:13px">${date}</div>
        </div>
      </div>
      <div style="background:#f0f8ff;border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:700">📍 الموقع</div>
        <div style="font-size:13px;font-weight:600">
          ${getOrderMapLink(order)
            ? `<a href="${getOrderMapLink(order)}" target="_blank" style="color:var(--primary);text-decoration:underline;display:flex;align-items:center;gap:6px">
                 <i class="fas fa-map-marked-alt"></i> ${escHtml(order.address)} (افتح في الخريطة)
               </a>`
            : escHtml(order.address)}
        </div>
      </div>
      ${order.payMethod === 'points' ? `
      <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:10px 14px;margin-bottom:12px;
                  font-weight:800;color:#92400e;text-align:center">
        ${formatOrderTotal(order)}
        ${order.pointsDeducted ? ' (تم الخصم)' : ' (سيتم الخصم عند التسليم)'}
      </div>` : ''}
      ${order.payMethod === 'credit' ? `
      <div style="background:#f5f3ff;border:1.5px solid #a78bfa;border-radius:10px;padding:10px 14px;margin-bottom:12px;
                  font-weight:800;color:#6d28d9;text-align:center">
        🧾 بيع آجل (ذمم)
      </div>` : ''}
      ${order.payMethod === 'free' ? `
      <div style="background:#f0fdf4;border:1.5px solid #22c55e;border-radius:10px;padding:10px 14px;margin-bottom:12px;
                  font-weight:800;color:#15803d;text-align:center">
        🎁 طلب مجاني
      </div>` : ''}
      <div style="margin-bottom:12px">
        ${dpDisplayItems(order.items).map(item=>{
          const itemPaidByPoints = order.payMethod === 'points' && (item.points || 0) > 0;
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border);font-size:13px">
            <span style="font-size:22px">${escHtml(item.icon || '')}</span>
            <span style="flex:1;font-weight:600">${escHtml(item.ar || '')}${dpSizesSub(item)}</span>
            <span style="color:var(--text-muted)">× ${item.qty}</span>
            <span style="font-weight:800;color:${itemPaidByPoints?'#d97706':'var(--primary)'}">
              ${itemPaidByPoints
                ? `🏆 ${(item.points||0)*item.qty} نقطة`
                : `${fmtPrice((item.price*item.qty))} د.أ`}
            </span>
          </div>`;
        }).join('')}
        ${(order.payMethod !== 'free' && order.payMethod !== 'points') ? (() => {
          const b = getOrderBreakdown(order);
          return `
        <div style="border-top:1px dashed var(--border);margin-top:4px;padding-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px">
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>المجموع</span><span>${fmtPrice(b.subtotal)} د.أ</span></div>
          ${b.discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#e53e3e"><span>الخصم</span><span>- ${fmtPrice(b.discount)} د.أ</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)">
            <span>التوصيل</span><span>${b.deliveryDetermined ? (b.deliveryFee ? fmtPrice(b.deliveryFee) + ' د.أ' : 'مجاني') : 'غير محدد بعد'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;color:var(--primary)">
            <span>المجموع النهائي</span><span>${fmtPrice(b.finalTotal)} د.أ</span>
          </div>
        </div>`;
        })() : `
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;font-weight:900;font-size:16px;color:var(--primary)">
          <span>الإجمالي</span>
          <span>${order.payMethod==='free' ? formatOrderTotal(order) : (order.total > 0 ? formatOrderTotal(order) : `🏆 ${order.totalPoints||0} نقطة`)}</span>
        </div>`}
      </div>
      ${order.notes?`<div style="background:#fffbeb;border-radius:10px;padding:10px 14px;font-size:13px"><i class="fas fa-sticky-note" style="color:var(--accent2)"></i> ${escHtml(order.notes)}</div>`:''}
      <div style="margin-top:16px;text-align:center">${statusBadgeHTML(order.status)}</div>
      ${trackStepsHTML(order.status)}
    </div>`;
  document.querySelector('#deleteConfirmModal .modal-footer').innerHTML = `
    <button class="btn-back" onclick="closeDeleteConfirm();renderAdminOrders()">
      <i class="fas fa-arrow-right"></i> رجوع
    </button>
    <button onclick="sendWhatsAppAdmin('${order.id}')" style="padding:12px 20px;border-radius:50px;background:#25d366;color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px">
      <i class="fab fa-whatsapp"></i> تواصل مع العميل
    </button>
    <button onclick="printOrderInvoice('${order.id}')" style="padding:12px 20px;border-radius:50px;background:#0a5c8a;color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px">
      <i class="fas fa-print"></i> طباعة الفاتورة
    </button>`;
  document.getElementById('deleteConfirmModal').classList.add('open');
}

// =====================
// ADMIN: QUOTES MANAGEMENT
// =====================

// ─── عداد طلبات عروض الأسعار (يستثني ما تم تصفيره يدويًا) ───
function resetQuotesBadgeCounter() {
  if (!confirm('سيتم تصفير عداد "طلبات عروض الأسعار" بحيث لا تُحتسب الطلبات الحالية بعد الآن (تبقى الطلبات نفسها موجودة كما هي، فقط لن تُحسب ضمن العداد). هل تريد المتابعة؟')) return;
  localStorage.setItem('dp_quotesBadgeResetAt', new Date().toISOString());
  renderAdminQuotes();
  refreshAdminMenuBadges();
  showToast('تم تصفير العداد بنجاح', 'success');
}
function computeQuotesBadgeCount(quotes) {
  const resetAt = localStorage.getItem('dp_quotesBadgeResetAt');
  const countable = resetAt ? quotes.filter(q => new Date(q.createdAt) > new Date(resetAt)) : quotes;
  return countable.filter(q => q.status === 'pending').length;
}

async function renderAdminQuotes() {
  const container = document.getElementById('adminQuotesList');
  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text-muted)">
      <div class="spinner" style="margin:0 auto 14px;width:28px;height:28px;border-width:4px"></div>
      جاري تحميل طلبات عروض الأسعار...
    </div>`;

  const quotes = await getAllQuotes();
  await reconcileGuestRecordNames(quotes);
  window._cachedAdminQuotes = quotes;

  const pendingCount = computeQuotesBadgeCount(quotes);
  const badge = document.getElementById('adminQuotesBadge');
  if (badge) badge.textContent = pendingCount > 0 ? pendingCount : '';

  let ordersForLink = window._cachedOrders;
  if (!ordersForLink) {
    try {
      const snap = await window._fbGetDocs(window._fbOrdersRef());
      ordersForLink = snap.docs.map(d => d.data());
      window._cachedOrders = ordersForLink;
    } catch(e) { ordersForLink = []; }
  }
  function findLinkedOrder(q) {
    return ordersForLink.find(o =>
      o.sourceQuoteId === q.id || o.id === ('DP-' + String(q.id || '').replace('QT-', ''))
    );
  }

  if (!quotes.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:56px 24px;color:var(--text-muted)">
        <i class="fas fa-file-invoice-dollar" style="font-size:52px;opacity:0.15;display:block;margin-bottom:16px"></i>
        <h3 style="font-weight:800;font-size:17px;color:var(--text);margin-bottom:8px">لا توجد طلبات عروض أسعار</h3>
        <p style="font-size:14px">ستظهر هنا فور إرسالها من العملاء</p>
      </div>`;
    return;
  }

  container.innerHTML = quotes.map(q => {
    const date = new Date(q.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const linkedOrder = q.status === 'accepted' ? findLinkedOrder(q) : null;
    const itemsHtml = dpDisplayItems(q.items).map(i => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px">
        <span style="font-size:18px">${escHtml(i.icon || '')}</span>
        <span style="flex:1;font-weight:600">${escHtml(i.ar)}${dpSizesSub(i)}</span>
        ${i.isCustom ? `<span style="font-size:10px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:50px;padding:2px 8px;font-weight:700;flex-shrink:0">⚠️ غير مدرجة بالمتجر</span>` : ''}
        <span style="color:var(--text-muted)">${i.qty ? `× ${escHtml(String(i.qty))}` : 'كمية غير محددة'}</span>
        ${i.unitPrice ? `<span style="font-weight:800;color:var(--primary)">${fmtPrice(i.unitPrice)} د.أ</span>` : ''}
      </div>`).join('');

    return `
    <div class="points-admin-card" style="flex-direction:column;align-items:stretch;gap:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">📄 #${escHtml(q.id)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">👤 ${escHtml(q.clientName)} ${q.clinic?'· '+escHtml(q.clinic):''} · ${escHtml(q.clientEmail)}</div>
          <div style="font-size:11px;color:var(--text-muted)">📅 ${date}</div>
        </div>
        <div>${quoteStatusBadge(q.status)}</div>
      </div>
      <div style="background:#f8fbfd;border-radius:10px;padding:10px 14px">${itemsHtml}</div>
      ${(q.status === 'priced' || q.status === 'accepted' || q.status === 'saved') ? `
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--text-muted);padding:0 4px">
        <span>المجموع: <strong style="color:var(--text)">${fmtPrice(getQuoteItemsTotal(q))} د.أ</strong></span>
        <span>التوصيل: <strong style="color:var(--text)">${q.deliveryDetermined ? (q.deliveryFee ? fmtPrice(q.deliveryFee) + ' د.أ' : 'مجاني') : 'غير محدد بعد'}</strong></span>
        <span>المجموع النهائي: <strong style="color:var(--primary)">${fmtPrice(getQuoteTotal(q))} د.أ</strong></span>
      </div>` : ''}
      ${q.attachedImage ? `
      <div>
        <img src="${cldOptimize(q.attachedImage,200)}" loading="lazy" onclick="window.open('${escJsAttr(q.attachedImage)}','_blank')"
          style="max-width:120px;max-height:120px;border-radius:10px;border:2px solid var(--border);cursor:pointer" title="اضغط لعرض الصورة بالحجم الكامل">
      </div>` : ''}
      ${q.notes ? `<div style="font-size:13px;color:var(--text-muted);background:#fffbeb;padding:8px 12px;border-radius:8px"><i class="fas fa-sticky-note" style="color:var(--accent2)"></i> ${escHtml(q.notes)}</div>` : ''}
      ${q.status === 'accepted' ? `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:700;color:var(--text-muted)">حالة تنفيذ الطلب:</span>
        ${linkedOrder ? statusBadgeHTML(linkedOrder.status || 'pending') : `<span style="font-size:12px;color:var(--text-muted);font-style:italic">تعذر إيجاد الطلب المرتبط</span>`}
        <span style="font-size:11px;color:var(--text-muted)">(تُحدَّث من صفحة "الطلبات")</span>
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${(q.status === 'pending' || q.status === 'priced') ? `
        <button onclick="openPriceQuoteModal('${escJsAttr(q._docId)}')" style="padding:8px 18px;border-radius:50px;background:linear-gradient(135deg,#0a5c8a,#1a8bbf);color:#fff;border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fas fa-tag"></i> ${q.status === 'pending' ? 'تحديد السعر وإرسال العرض' : 'تعديل السعر'}
        </button>` : ''}
        <button onclick="sendWhatsAppQuote('${escJsAttr(q._docId)}')" style="padding:8px 18px;border-radius:50px;background:#e8fdf2;color:#16a34a;border:1.5px solid #bbf7d0;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fab fa-whatsapp"></i> تواصل مع العميل
        </button>
        ${q.status === 'accepted' ? `
        <button onclick="showQuoteOrderDetail('${escJsAttr(q._docId)}')" style="padding:8px 18px;border-radius:50px;background:#e8f3fb;color:var(--primary);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fas fa-eye"></i> عرض التفاصيل
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function updateQuoteOrderStatus(docId, quoteIdStr, newStatus) {
  try {
    await updateQuote(docId, { orderStatus: newStatus });
    const cached = (window._cachedAdminQuotes || []).find(x => x._docId === docId);
    if (cached) cached.orderStatus = newStatus;
    const s = getStatusObj(newStatus);
    showToast(`✅ طلب العرض #${quoteIdStr} → ${s.label}`, 'success');
  } catch(e) {
    showToast('❌ فشل تحديث الحالة، تحقق من الاتصال', 'error');
  }
}

function openPriceQuoteModal(docId) {
  const quotes = window._cachedAdminQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) return;
  document.getElementById('priceQuoteDocId').value = docId;
  document.getElementById('priceQuoteError').style.display = 'none';
  const form = document.getElementById('priceQuoteItemsForm');
  const singleItemHtml = (i, idx) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8fbfd;border-radius:10px;border:1px solid var(--border)">
      <span style="font-size:22px;flex-shrink:0">${escHtml(i.icon || '')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px">${escHtml(i.ar)} ${i.isCustom ? `<span style="font-size:10px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:50px;padding:2px 8px;font-weight:700;margin-right:6px">⚠️ غير مدرجة بالمتجر</span>` : ''}</div>
        <div style="font-size:11px;color:var(--text-muted)">${i.qty ? `الكمية المطلوبة: ${i.qty}` : 'الكمية غير محددة من العميل'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input type="number" min="1" placeholder="الكمية" value="${i.qty || ''}" id="quoteItemQty_${idx}" style="width:80px;padding:7px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center">
        <input type="number" min="0" step="0.01" placeholder="سعر الوحدة" value="${i.unitPrice || ''}" id="quoteItemPrice_${idx}" style="width:100px;padding:7px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center">
      </div>
    </div>`;
  // مقاسات المنتج الواحد بنفس السعر: صف واحد بخانة سعر واحدة تُطبَّق على كل مقاساته، ولكل مقاس كميته
  const inputStyle = 'width:80px;padding:7px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center';
  const groups = dpGroupSizeLines(q.items, i => i.parentId);
  form.innerHTML = groups.map((g, gi) => {
    if (!g.parent) return singleItemHtml(g.line, g.idx);
    const first = g.lines[0].line;
    const sizes = g.lines.map(({ line, idx }) => `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
        <span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:12px;font-weight:700">${escHtml(line.sizeLabel || '')}</span>
        <span style="font-size:11px;color:var(--text-muted)">${line.qty ? `المطلوب: ${line.qty}` : 'الكمية غير محددة'}</span>
        <input type="number" min="1" placeholder="الكمية" value="${line.qty || ''}" id="quoteItemQty_${idx}" style="${inputStyle}">
      </div>`).join('');
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f8fbfd;border-radius:10px;border:1px solid var(--border)">
      <span style="font-size:22px;flex-shrink:0">${escHtml(first.icon || g.parent.icon || '')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px">${escHtml(g.parent.ar)}</div>
        ${sizes}
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <input type="number" min="0" step="0.01" placeholder="سعر الوحدة" value="${first.unitPrice || ''}" id="quoteGroupPrice_${gi}" data-idxs="${g.lines.map(l => l.idx).join(',')}" style="width:100px;padding:7px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center">
        <span style="font-size:10px;color:var(--text-muted)">سعر واحد لكل المقاسات</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('priceQuoteDeliveryFee').value =
    (q.deliveryFee !== null && q.deliveryFee !== undefined) ? q.deliveryFee : '';
  document.getElementById('priceQuoteModal').classList.add('open');
}

function closePriceQuoteModal() {
  document.getElementById('priceQuoteModal').classList.remove('open');
}

async function sendQuotePricing() {
  const docId = document.getElementById('priceQuoteDocId').value;
  const quotes = window._cachedAdminQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) return;

  // سعر موحّد لمجموعات المقاسات المتساوية السعر (خانة واحدة لكل المقاسات)
  const groupPrice = {};
  document.querySelectorAll('#priceQuoteItemsForm [data-idxs]').forEach(inp => {
    inp.dataset.idxs.split(',').forEach(i => { groupPrice[i] = inp.value; });
  });
  const updatedItems = q.items.map((item, idx) => {
    const qtyVal = document.getElementById(`quoteItemQty_${idx}`).value;
    const priceVal = (String(idx) in groupPrice) ? groupPrice[String(idx)] : document.getElementById(`quoteItemPrice_${idx}`).value;
    return {
      ...item,
      qty: qtyVal ? parseInt(qtyVal) : null,
      unitPrice: priceVal ? parseFloat(priceVal) : null,
    };
  });

  const allValid = updatedItems.every(i => i.qty && i.unitPrice && i.unitPrice > 0);
  if (!allValid) {
    document.getElementById('priceQuoteError').style.display = 'block';
    return;
  }
  document.getElementById('priceQuoteError').style.display = 'none';

  const deliveryVal = document.getElementById('priceQuoteDeliveryFee').value.trim();
  const deliveryFee = deliveryVal === '' ? null : parseFloat(deliveryVal);

  try {
    await updateQuote(docId, {
      items: updatedItems,
      status: 'priced',
      deliveryFee,
      deliveryDetermined: deliveryFee !== null,
    });
    if (q.clientEmail && q.clientEmail !== 'guest') {
      createNotification({
        scope: 'client',
        targetEmail: q.clientEmail,
        icon: '💰',
        title: 'عرض السعر جاهز',
        message: `تم تحديد سعر طلبك #${q.id}، يمكنك مراجعته الآن`,
        link: 'page:myQuotes',
      });
    }
    closePriceQuoteModal();
    showToast('✅ تم إرسال عرض السعر للعميل', 'success');
    renderAdminQuotes();
  } catch(e) {
    showToast('❌ حدث خطأ، تحقق من الاتصال', 'error');
  }
}

function sendWhatsAppQuote(docId) {
  const quotes = window._cachedAdminQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) return;
  const statusInfo = QUOTE_STATUSES[q.status] || QUOTE_STATUSES.pending;
  const hasPrices = q.items.every(i => i.unitPrice && i.unitPrice > 0);
  const itemsTxt = dpDisplayItems(q.items).map(i =>
    `• ${i.ar}${i.sizesLabel ? ` (${i.sizesLabel})` : ''}${i.qty ? ` × ${i.qty}` : ''}${hasPrices && i.unitPrice ? ` — ${fmtPrice((i.unitPrice * (i.qty || 1)))} د.أ` : ''}`
  ).join('\n');
  const deliveryLine = (hasPrices && q.deliveryDetermined)
    ? `\n🚚 التوصيل: ${q.deliveryFee ? fmtPrice(q.deliveryFee) + ' د.أ' : 'مجاني'}`
    : '';
  const totalLine = hasPrices
    ? `\n📦 المجموع: ${fmtPrice(getQuoteItemsTotal(q))} د.أ${deliveryLine}\n\n💰 *الإجمالي النهائي: ${fmtPrice(getQuoteTotal(q))} د.أ*`
    : '';
  const msg = encodeURIComponent(
    `🦷 *DentaPro — بخصوص طلب عرض السعر #${q.id}*\n\nمرحباً ${q.clientName}،\n\n` +
    `الحالة الحالية: *${statusInfo.label}*\n\n` +
    `بخصوص طلبك لعرض سعر المواد:\n${itemsTxt}${totalLine}\n\n` +
    (q.status === 'priced' ? 'يرجى مراجعة العرض والرد علينا.' : 'سنوافيك بالتفاصيل قريباً.')
  );
  const phone = formatPhoneForWhatsApp(q.phone);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}


function showQuoteOrderDetail(docId) {
  const quotes = window._cachedAdminQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) return;
  const date = new Date(q.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const total = getQuoteTotal(q);
  const linkedOrderForDetail = (window._cachedOrders || []).find(o =>
    o.sourceQuoteId === q.id || o.id === ('DP-' + String(q.id || '').replace('QT-', ''))
  );
  const orderStatus = linkedOrderForDetail ? (linkedOrderForDetail.status || 'pending') : 'pending';

  document.querySelector('#deleteConfirmModal .modal-header').style.background = 'linear-gradient(135deg,#0a5c8a,#1a8bbf)';
  document.querySelector('#deleteConfirmModal .modal-title').innerHTML = `<i class="fas fa-file-invoice-dollar"></i> تفاصيل طلب عرض السعر #${q.id}`;
  document.querySelector('#deleteConfirmModal .modal-body').innerHTML = `
    <div style="text-align:right">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">العميل</div>
          <div style="font-weight:700;font-size:14px">${escHtml(q.clientName)}</div>
        </div>
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">العيادة</div>
          <div style="font-weight:700;font-size:14px">${escHtml(q.clinic||'—')}</div>
        </div>
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">الهاتف</div>
          <div style="font-weight:700;font-size:14px">${escHtml(q.phone||'—')}</div>
        </div>
        <div style="background:#f8fbfd;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">التاريخ</div>
          <div style="font-weight:700;font-size:13px">${date}</div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        ${dpDisplayItems(q.items).map(i=>`
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border);font-size:13px">
            <span style="font-size:22px">${escHtml(i.icon || '')}</span>
            <span style="flex:1;font-weight:600">${escHtml(i.ar)}${dpSizesSub(i)}</span>
            <span style="color:var(--text-muted)">× ${i.qty||1}</span>
            <span style="font-weight:800;color:var(--primary)">${fmtPrice(((i.unitPrice||0)*(i.qty||1)))} د.أ</span>
          </div>`).join('')}
        <div style="border-top:1px dashed var(--border);margin-top:10px;padding-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px">
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)">
            <span>المجموع</span><span>${fmtPrice(getQuoteItemsTotal(q))} د.أ</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)">
            <span>التوصيل</span>
            <span>${q.deliveryDetermined ? (q.deliveryFee ? `${fmtPrice(q.deliveryFee)} د.أ` : 'مجاني') : 'غير محدد بعد'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;color:var(--primary)">
            <span>المجموع النهائي</span><span>${fmtPrice(total)} د.أ</span>
          </div>
        </div>
      </div>
      ${q.attachedImage ? `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px"><i class="fas fa-image" style="color:var(--primary-light)"></i> صورة مرفقة من العميل</div>
        <img src="${cldOptimize(q.attachedImage,400)}" loading="lazy" onclick="window.open('${escJsAttr(q.attachedImage)}','_blank')"
          style="max-width:220px;max-height:220px;border-radius:12px;border:2px solid var(--border);cursor:pointer" title="اضغط لعرض الصورة بالحجم الكامل">
      </div>` : ''}
      ${q.notes?`<div style="background:#fffbeb;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:12px"><i class="fas fa-sticky-note" style="color:var(--accent2)"></i> ${escHtml(q.notes)}</div>`:''}
      <div style="margin-top:16px;text-align:center">${statusBadgeHTML(orderStatus)}</div>
      ${trackStepsHTML(orderStatus)}
    </div>`;
  document.querySelector('#deleteConfirmModal .modal-footer').innerHTML = `
    <button class="btn-back" onclick="closeDeleteConfirm();renderAdminQuotes()">
      <i class="fas fa-arrow-right"></i> رجوع
    </button>
    <button onclick="sendWhatsAppQuote('${q._docId}')" style="padding:12px 20px;border-radius:50px;background:#25d366;color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px">
      <i class="fab fa-whatsapp"></i> تواصل مع العميل
    </button>
    <button onclick="printQuoteInvoice('${q._docId}')" style="padding:12px 20px;border-radius:50px;background:#0a5c8a;color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px">
      <i class="fas fa-print"></i> طباعة الفاتورة
    </button>`;
  document.getElementById('deleteConfirmModal').classList.add('open');
}

function printQuoteInvoice(docId) {
  const quotes = window._cachedAdminQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) { showToast('❌ لم يتم العثور على الطلب', 'error'); return; }

  const date = new Date(q.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
    { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const total = getQuoteTotal(q);

  const rows = dpDisplayItems(q.items).map(item => `
    <tr>
      <td>${escHtml(item.ar)}${item.sizesLabel ? `<br><small style="color:#5a7a90">${escHtml(item.sizesLabel)}</small>` : ''}</td>
      <td style="text-align:center">${item.qty||1}</td>
      <td style="text-align:center">${fmtPrice((item.unitPrice||0))} د.أ</td>
      <td style="text-align:center;font-weight:700">${fmtPrice(((item.unitPrice||0)*(item.qty||1)))} د.أ</td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>فاتورة عرض سعر #${q.id}</title>
    <style>
      body{font-family:'Cairo',Arial,sans-serif;padding:32px;color:#0f2133}
      h1{color:#0a5c8a;margin-bottom:4px}
      .muted{color:#5a7a90;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      th,td{padding:10px 12px;border-bottom:1px solid #e2eaf0;text-align:right;font-size:14px}
      th{background:#f0f8ff;color:#0a5c8a}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}
      .box{background:#f8fbfd;border-radius:8px;padding:12px}
      .total{margin-top:16px;text-align:left;font-size:18px;font-weight:900;color:#0a5c8a}
      @media print{ body{padding:0} }
    </style></head>
    <body>
      <h1>🦷 DentaPro</h1>
      <div class="muted">فاتورة عرض سعر رقم #${q.id} — ${date}</div>
      <div class="grid">
        <div class="box"><strong>العميل:</strong> ${escHtml(q.clientName)}</div>
        <div class="box"><strong>العيادة:</strong> ${escHtml(q.clinic||'—')}</div>
        <div class="box"><strong>الهاتف:</strong> ${escHtml(q.phone||'—')}</div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="grid" style="grid-template-columns:1fr;gap:6px;margin:16px 0 0">
        <div style="display:flex;justify-content:space-between;font-size:14px"><span>المجموع</span><span>${fmtPrice(getQuoteItemsTotal(q))} د.أ</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px"><span>التوصيل</span><span>${q.deliveryDetermined ? (q.deliveryFee ? fmtPrice(q.deliveryFee) + ' د.أ' : 'مجاني') : 'غير محدد بعد'}</span></div>
      </div>
      <div class="total">المجموع النهائي: ${fmtPrice(total)} د.أ</div>
      <script>window.print();<\/script>
    </body></html>
  `);
  win.document.close();
}

function sendWhatsAppAdmin(orderId) {
  const orders = window._cachedOrders || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  const s = getStatusObj(order.status);

  // 1) السعر الفردي لكل مادة × العدد
  const itemsTxt = dpDisplayItems(order.items || []).map(i =>
    `• ${i.ar}${i.sizesLabel ? ` (${i.sizesLabel})` : ''}${i.qty ? ` × ${i.qty}` : ''} — ${fmtPrice(i.price)} د.أ × ${i.qty}`
  ).join('\n');

  // 2) 📦 المجموع (سعر المواد قبل أي خصم)
  const itemsSubtotal = (order.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
  const productsSubtotal = (order.originalTotal && order.originalTotal > 0) ? order.originalTotal : itemsSubtotal;
  const subtotalLine = `📦 المجموع: ${fmtPrice(productsSubtotal)} د.أ`;

  // 3) الخصم (إن وُجد)
  let discountLine = '';
  if (order.originalTotal && order.originalTotal > 0) {
    const subtotalAfterDiscount = (order.total || 0) - (order.deliveryDetermined ? (order.deliveryFee || 0) : 0);
    const discountAmount = order.originalTotal - subtotalAfterDiscount;
    if (discountAmount > 0.001) {
      discountLine = `\nالخصم: ${fmtPrice(discountAmount)} د.أ${order.couponCode ? ` (كود ${order.couponCode})` : ''}`;
    }
  }

  // 4) 🚚 التوصيل
  let deliveryLine;
  if (!order.deliveryDetermined) {
    deliveryLine = `\n🚚 التوصيل: يُحدَّد لاحقاً`;
  } else if (order.deliveryFee > 0) {
    deliveryLine = `\n🚚 التوصيل: ${fmtPrice(order.deliveryFee)} د.أ`;
  } else {
    deliveryLine = `\n🚚 التوصيل: مجاني`;
  }

  // 5) 💰 الإجمالي النهائي
  const totalLine = order.payMethod === 'points'
    ? `💰🏆 *الإجمالي النهائي: ${formatOrderTotal(order)}*`
    : `💰 *الإجمالي النهائي: ${fmtPrice((order.total || 0))} د.أ*`;

  const msg = encodeURIComponent(
    `🦷 *DentaPro — تحديث طلبك*\n\nمرحباً ${order.clientName}،\n` +
    `طلبك رقم *#${order.id}* الآن في مرحلة: *${s.label}*\n\n` +
    `المواد:\n${itemsTxt}\n\n` +
    `${subtotalLine}${discountLine}${deliveryLine}\n\n${totalLine}\n\n` +
    `شكراً لثقتك بـ DentaPro 💙`
  );
  const clean = formatPhoneForWhatsApp(order.phone);
  window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
}
// =====================
// AUTO FILL FROM PROFILE
// =====================
function autoFillFromProfile() {
  if (!currentUser) return;
  if (currentUser.clinic)  document.getElementById('clinicName').value  = currentUser.clinic;
  if (currentUser.name)    document.getElementById('doctorName').value   = currentUser.name;
  if (currentUser.phone)   document.getElementById('phoneNumber').value  = currentUser.phone.replace(/^\+\d+/, '');
  // إزالة أي أخطاء تحقق
  ['clinicName','doctorName','phoneNumber'].forEach(id => {
    document.getElementById(id).classList.remove('error');
  });
  ['clinicNameError','doctorNameError','phoneError'].forEach(id => {
    document.getElementById(id).classList.remove('show');
  });
  showToast('✅ تم ملء البيانات من ملفك الشخصي', 'success');
}

// =====================
// EDIT PROFILE MODAL
// =====================
function openEditProfile() {
  // أغلق modal الطلب مؤقتاً وافتح modal التعديل
  const existing = document.getElementById('editProfileModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'editProfileModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '4000';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary))">
        <div class="modal-title"><i class="fas fa-user-edit"></i> <span data-ar="تعديل الملف الشخصي" data-en="Edit Profile">تعديل الملف الشخصي</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="document.getElementById('editProfileModal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">الاسم <span class="required">*</span></label>
            <input type="text" class="form-input" id="epName" value="${escHtml(currentUser.name||'')}" placeholder="اسمك">
          </div>
          <div class="form-group">
            <label class="form-label">اسم العيادة <span class="required">*</span></label>
            <input type="text" class="form-input" id="epClinic" value="${escHtml(currentUser.clinic||'')}" placeholder="عيادة...">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">رقم الهاتف</label>
          <input type="tel" class="form-input" id="epPhone" value="${escHtml(currentUser.phone||'')}" placeholder="05xxxxxxxx">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fas fa-phone" style="color:var(--primary-light)"></i> الرقم البديل أو رقم السكرتيرة (اختياري)</label>
          <input type="tel" class="form-input" id="epAltPhone" value="${escHtml(currentUser.altPhone||'')}" placeholder="07XXXXXXXX">
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fas fa-envelope" style="color:var(--primary-light)"></i> البريد الإلكتروني</label>
          <input type="email" class="form-input" id="epEmail" value="${escHtml(currentUser.email||'')}" placeholder="بريدك الإلكتروني" oninput="toggleEpPasswordField()">
        </div>
        <div class="form-group" id="epPasswordWrap" style="display:none">
          <label class="form-label"><i class="fas fa-lock" style="color:var(--primary-light)"></i> كلمة المرور الحالية <small style="color:var(--text-muted);font-weight:500">(مطلوبة لتأكيد تغيير البريد)</small></label>
          <div class="input-with-icon">
            <input type="password" class="form-input" id="epCurrentPassword" placeholder="كلمة المرور الحالية">
            <i class="fas fa-eye input-icon" style="cursor:pointer;pointer-events:all" onclick="togglePassVis('epCurrentPassword',this)"></i>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fas fa-map-marker-alt" style="color:var(--primary-light)"></i> وصف الموقع اليدوي <small style="color:var(--text-muted);font-weight:500">(اختياري)</small></label>
          <textarea class="form-textarea" id="epLocationText" placeholder="مثال: عمّان، الدوار السابع، مقابل...">${escHtml(currentUser.profileLocationText||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fas fa-map-marked-alt" style="color:var(--primary-light)"></i> تحديد الموقع عبر خرائط جوجل <small style="color:var(--text-muted);font-weight:500">(اختياري)</small></label>
          <input type="hidden" id="epLocationLat" value="${currentUser.profileLocationLat||''}">
          <input type="hidden" id="epLocationLng" value="${currentUser.profileLocationLng||''}">
          <div style="display:flex;gap:8px">
            <button type="button" onclick="detectProfileLocation()" style="flex:1;padding:11px;border-radius:var(--radius-sm);
              background:#f0f8ff;color:var(--primary);border:1.5px dashed var(--border);font-family:inherit;
              font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
              <i class="fas fa-crosshairs"></i> موقعي الحالي
            </button>
            <button type="button" onclick="openProfileMapPicker()" style="flex:1;padding:11px;border-radius:var(--radius-sm);
              background:#0a5c8a;color:#fff;border:none;font-family:inherit;
              font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
              <i class="fas fa-map-marked-alt"></i> اختر من الخريطة
            </button>
          </div>
          <div id="epLocationStatus" style="margin-top:8px;font-size:12px;font-weight:600;${currentUser.profileLocationLat ? '' : 'display:none;'}">
            ${currentUser.profileLocationLat ? `<i class="fas fa-check-circle" style="color:var(--success)"></i> <a href="https://www.google.com/maps?q=${currentUser.profileLocationLat},${currentUser.profileLocationLng}" target="_blank" style="color:var(--primary);text-decoration:underline">عرض الموقع المحفوظ على خرائط جوجل</a>` : ''}
          </div>
        </div>
        <div id="epError" style="display:none;color:var(--danger);font-size:13px;font-weight:700;
          padding:10px;background:#fff5f5;border-radius:8px;margin-top:8px">
          <i class="fas fa-exclamation-circle"></i> يرجى ملء الحقول المطلوبة
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn-back" onclick="document.getElementById('editProfileModal').remove()">
          <i class="fas fa-times"></i> إلغاء
        </button>
        <button class="btn-submit" onclick="saveProfile()">
          <i class="fas fa-save"></i> حفظ التعديلات
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function detectProfileLocation() {
  if (!navigator.geolocation) {
    showToast(t('المتصفح لا يدعم تحديد الموقع','Browser does not support location'), 'error');
    return;
  }
  const statusEl = document.getElementById('epLocationStatus');
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري تحديد موقعك...`;
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      document.getElementById('epLocationLat').value = lat;
      document.getElementById('epLocationLng').value = lng;
      statusEl.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success)"></i>
        <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:var(--primary);text-decoration:underline">عرض الموقع على خرائط جوجل</a>`;
      showToast(t('✅ تم تحديد موقعك بنجاح','✅ Location detected!'), 'success');
    },
    err => {
      statusEl.innerHTML = `<span style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> تعذر تحديد الموقع، حاول مجدداً</span>`;
    }
  );
}

// ═══ خريطة اختيار الموقع: تستخدم نافذة الخريطة المشتركة في location.js (السياقات: ep / reg / qo) ═══
function openProfileMapPicker(context) { return openMapPicker(context || 'ep'); }
function closeProfileMapPicker() { closeMapPicker(); }
function confirmProfileMapPick() { confirmMapPick(); }

function toggleEpPasswordField() {
  const newEmail = document.getElementById('epEmail').value.trim();
  const wrap = document.getElementById('epPasswordWrap');
  if (!wrap) return;
  wrap.style.display = (currentUser.email && newEmail && newEmail !== currentUser.email) ? 'block' : 'none';
}

async function saveProfile() {
  const name   = document.getElementById('epName').value.trim();
  const clinic = document.getElementById('epClinic').value.trim();
  const phone  = document.getElementById('epPhone').value.trim();
  const altPhone = (document.getElementById('epAltPhone')?.value || '').trim();
  const newEmail = document.getElementById('epEmail').value.trim();
  const currentPassword = document.getElementById('epCurrentPassword')?.value || '';
  const locationText = document.getElementById('epLocationText').value.trim();
  const locationLat  = document.getElementById('epLocationLat').value || null;
  const locationLng  = document.getElementById('epLocationLng').value || null;
  if (!name || !clinic) {
    document.getElementById('epError').style.display = 'flex';
    return;
  }
  // الرقم البديل اختياري: إما فارغ أو رقم صالح (7 أرقام على الأقل)
  if (altPhone && altPhone.replace(/\D/g, '').length < 7) {
    showToast('⚠️ الرقم البديل غير صحيح', 'error');
    return;
  }

  const oldEmail = currentUser.email;
  const emailChanged = newEmail && newEmail !== oldEmail;

  // تغيير البريد يتطلب تأكيد هوية حقيقي (كلمة السر الحالية) قبل أي حفظ
  if (emailChanged) {
    if (!currentPassword) {
      showToast('⚠️ أدخل كلمة المرور الحالية لتأكيد تغيير البريد', 'error');
      return;
    }
    try {
      const fbUser = window._auth.currentUser;
      const credential = window._fbEmailAuthProvider.credential(oldEmail, currentPassword);
      await window._fbReauthenticate(fbUser, credential);
      await window._fbUpdateEmail(fbUser, newEmail);
      await fbUser.getIdToken(true); // تحديث فوري للتوكن ليطابق البريد الجديد قبل الكتابة على Firestore
    } catch(e) {
      showToast('❌ تعذر تغيير البريد: ' + (e.message || 'تحقق من كلمة المرور'), 'error');
      return;
    }
  }

  // الحفظ في Firestore أولاً: لا نغيّر الجلسة المحلية ولا نعرض "تم الحفظ" إلا بعد نجاح الكتابة الفعلية.
  // (كان الخطأ يُبتلع فيظهر النجاح ثم تعود البيانات القديمة بعد التحديث لأن الصفحة تُعيد قراءتها من Firestore)
  if (!currentUser.uid || !window._fbDoc2 || !window._fbUpdateDoc) {
    showToast('❌ تعذّر الحفظ: لا يوجد اتصال بالخادم، حاول مرة أخرى', 'error');
    return;
  }
  // جلسة Firebase Auth الفعلية مطلوبة للكتابة؛ إن انتهت يُرفض كل شيء بـ permission-denied
  if (!(window._auth && window._auth.currentUser)) {
    showToast('⚠️ انتهت جلسة الدخول. سجّل الخروج ثم الدخول من جديد وأعد المحاولة', 'error');
    return;
  }
  // يجب أن يطابق البريد المُرسل بريد الحساب في Firebase Auth تماماً (تشترطه قواعد Firestore)
  const authEmail = (window._auth && window._auth.currentUser && window._auth.currentUser.email) || (emailChanged ? newEmail : currentUser.email);
  const profilePayload = { firstName: name, clinic, phone, email: authEmail,
      profileLocationText: locationText, profileLocationLat: locationLat, profileLocationLng: locationLng,
      updatedAt: new Date().toISOString() };
  const userRef = window._fbDoc2('users', currentUser.uid);
  let altSaved = true;
  try {
    try {
      await window._fbUpdateDoc(userRef, { ...profilePayload, altPhone });
    } catch (e1) {
      if (e1 && e1.code === 'not-found' && window._fbSetDoc) {
        // لا يوجد مستند للمستخدم بعد: ننشئه بدل أن تضيع بياناته
        await window._fbSetDoc(userRef, { ...profilePayload, altPhone, role: currentUser.role || 'client' }, { merge: true });
      } else if (e1 && e1.code === 'permission-denied') {
        // إن لم تكن قواعد Firestore محدّثة بعد لتقبل altPhone نحفظ بقية الملف ونُبلغ المستخدم
        await window._fbUpdateDoc(userRef, profilePayload);
        altSaved = false;
      } else { throw e1; }
    }
  } catch (e) {
    console.error('saveProfile Firebase:', e);
    showToast('❌ تعذّر حفظ الملف الشخصي (' + (e.code || e.message || 'خطأ') + '). لم يُحفظ أي تغيير' +
      (e && e.code === 'permission-denied' ? '، وقد تحتاج قواعد Firestore إلى النشر من جديد.' : '، حاول مرة أخرى.'), 'error');
    return;
  }

  // نجحت الكتابة: نحدّث الجلسة المحلية
  currentUser.name   = name;
  currentUser.clinic = clinic;
  currentUser.phone  = phone;
  currentUser.altPhone = altPhone;
  if (emailChanged) currentUser.email = newEmail;
  currentUser.profileLocationText = locationText;
  currentUser.profileLocationLat  = locationLat;
  currentUser.profileLocationLng  = locationLng;
  localStorage.setItem('dentapro_session', JSON.stringify(currentUser));
  if (!altSaved) showToast('⚠️ حُفظ الملف لكن تعذّر حفظ الرقم البديل. حدّث قواعد Firestore.', 'error');

  // تحديث الطلبات والسجلات المرتبطة: فشله لا يلغي حفظ الملف الشخصي نفسه
  try { await propagateProfileUpdateToRecords(oldEmail, { name, clinic, phone }); }
  catch (e) { console.warn('propagateProfileUpdateToRecords:', e); }

  // نسخة محلية قديمة (للتوافق مع البيانات السابقة فقط)
  try {
    const users = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    const idx = users.findIndex(u => u.email === oldEmail);
    const rec = { firstName: name, clinic, phone, altPhone, email: currentUser.email, profileLocationText: locationText, profileLocationLat: locationLat, profileLocationLng: locationLng };
    if (idx !== -1) users[idx] = { ...users[idx], ...rec }; else users.push(rec);
    localStorage.setItem('dentapro_users', JSON.stringify(users));
  } catch (e) {}

  document.getElementById('editProfileModal').remove();
  renderAuthHeader();
  showToast('✅ تم حفظ الملف الشخصي', 'success');
  logActivity('profile_updated');
}

// =====================
// DELETE ACCOUNT
// =====================
function openDeleteAccountModal() {
  const existing = document.getElementById('deleteAccountModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'deleteAccountModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '4500';
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header" style="background:linear-gradient(135deg,#be123c,#e53e3e)">
        <div class="modal-title"><i class="fas fa-user-times"></i> <span data-ar="حذف الحساب نهائياً" data-en="Delete Account">حذف الحساب نهائياً</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="document.getElementById('deleteAccountModal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div style="background:#fff5f5;border:1.5px solid #fecdd3;border-radius:12px;padding:14px;margin-bottom:18px;
          display:flex;align-items:flex-start;gap:10px">
          <i class="fas fa-exclamation-triangle" style="color:var(--danger);margin-top:2px"></i>
          <div style="font-size:13px;color:#7f1d1d;line-height:1.7">
            هذا الإجراء <strong>نهائي ولا يمكن التراجع عنه</strong>. سيتم حذف حسابك وبيانات ملفك الشخصي وقائمة مفضلاتك بشكل كامل.
            سجل طلباتك السابقة سيبقى محفوظاً لدينا لأغراض إدارية فقط، وليس مرتبطاً بحسابك بعد الحذف.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label"><i class="fas fa-lock" style="color:var(--primary-light)"></i> أدخل كلمة المرور لتأكيد هويتك <span class="required">*</span></label>
          <div class="input-with-icon">
            <input type="password" class="form-input" id="delAccPassword" placeholder="كلمة المرور الحالية">
            <i class="fas fa-eye input-icon" style="cursor:pointer;pointer-events:all" onclick="togglePassVis('delAccPassword',this)"></i>
          </div>
        </div>

        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted);cursor:pointer;margin-top:6px">
          <input type="checkbox" id="delAccConfirmCheck" style="width:16px;height:16px;cursor:pointer">
          أفهم أن هذا الإجراء نهائي ولا يمكن التراجع عنه
        </label>

        <div id="delAccError" style="display:none;color:var(--danger);font-size:13px;font-weight:700;
          padding:10px;background:#fff5f5;border-radius:8px;margin-top:12px">
          <i class="fas fa-exclamation-circle"></i> <span id="delAccErrorMsg"></span>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn-back" onclick="document.getElementById('deleteAccountModal').remove()">
          <i class="fas fa-times"></i> إلغاء
        </button>
        <button class="btn-submit" id="delAccConfirmBtn" onclick="confirmDeleteAccount()"
          style="background:linear-gradient(135deg,#be123c,#e53e3e)">
          <i class="fas fa-user-times"></i> نعم، احذف حسابي نهائياً
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function confirmDeleteAccount() {
  const password = document.getElementById('delAccPassword').value;
  const confirmed = document.getElementById('delAccConfirmCheck').checked;
  const showErr = msg => {
    document.getElementById('delAccErrorMsg').textContent = msg;
    document.getElementById('delAccError').style.display = 'flex';
  };
  document.getElementById('delAccError').style.display = 'none';

  if (!password) return showErr('يرجى إدخال كلمة المرور لتأكيد هويتك');
  if (!confirmed) return showErr('يرجى تأكيد أنك تفهم أن هذا الإجراء نهائي');
  if (!navigator.onLine) return showErr('📡 لا يوجد اتصال بالإنترنت، تحقق من الشبكة');

  const btn = document.getElementById('delAccConfirmBtn');
  const originalBtnHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحذف...';

  try {
    const fbUser = window._auth.currentUser;
    if (!fbUser) throw { code: 'no-user' };

    // إعادة تأكيد الهوية (مطلوبة من Firebase لأي عملية حذف حساب)
    const credential = window._fbEmailAuthProvider.credential(fbUser.email, password);
    await window._fbReauthenticate(fbUser, credential);

    // حذف مستند بيانات المستخدم من Firestore
    try {
      await window._fbDeleteDoc(window._fbDoc2('users', fbUser.uid));
    } catch(e) { console.warn('تعذر حذف مستند المستخدم من Firestore:', e); }

    // حذف حساب المصادقة نفسه من Firebase Auth
    await window._fbDeleteUser(fbUser);

    // تنظيف كامل للبيانات المحلية المرتبطة بالحساب
    currentUser = null;
    cart = [];
    favoritesList = [];
    localStorage.removeItem('dentapro_session');
    localStorage.removeItem('dentapro_cart');
    localStorage.removeItem('dentapro_favorites');

    document.getElementById('deleteAccountModal').remove();
    renderAuthHeader();
    updateCartUI();
    document.getElementById('notifBtn').style.display = 'none';
    const msgBtn = document.getElementById('msgBtn');
    if (msgBtn) msgBtn.style.display = 'none';
    showPage('home');
    showToast('✅ تم حذف حسابك نهائياً، نأسف لرؤيتك تغادر', 'success');

  } catch(e) {
    console.error('Delete account error:', e.code || e.message);
    let msg = 'حدث خطأ أثناء حذف الحساب، حاول مرة أخرى';
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = '❌ كلمة المرور غير صحيحة';
    else if (e.code === 'auth/too-many-requests') msg = '⏳ محاولات كثيرة، حاول لاحقاً';
    else if (e.code === 'auth/network-request-failed') msg = '📡 تعذّر الاتصال، تحقق من الإنترنت';
    else if (e.code === 'no-user') msg = 'يرجى إعادة تسجيل الدخول والمحاولة مجدداً';
    showErr(msg);
    btn.disabled = false;
    btn.innerHTML = originalBtnHtml;
  }
}

// =====================
// CLIENT RECORD (ADMIN)
// =====================
// ============================
// إرسال طلبية يدوية للعميل (هاتف / واتساب)
// ============================
var _sendOrderItems = [];
var _sendOrderPayMethod = 'money';
var _sendOrderDiscountType = 'fixed'; // 'fixed' (د.أ) أو 'percent' (%)

function openAdminSendOrderModal(email, uid, name, clinic, phone) {
  _sendOrderItems = [];
  _sendOrderPayMethod = 'money';
  _sendOrderDiscountType = 'fixed';
  document.getElementById('sendOrderClientEmail').value = email;
  document.getElementById('sendOrderClientUid').value = uid || '';
  document.getElementById('sendOrderClientPhone').value = phone || '';
  document.getElementById('sendOrderClientClinic').value = clinic || '';
  document.getElementById('sendOrderClientName').textContent = name || 'العميل';
  document.getElementById('sendOrderProductSearch').value = '';
  document.getElementById('sendOrderSearchResults').style.display = 'none';
  document.getElementById('sendOrderCustomForm').style.display = 'none';
  document.getElementById('sendOrderCustomName').value = '';
  document.getElementById('sendOrderCustomPrice').value = '';
  document.getElementById('sendOrderError').style.display = 'none';
  document.getElementById('sendOrderDiscountValue').value = '';
  setSendOrderDiscountType('fixed');
  setSendOrderPayMethod('money');
  renderSendOrderItems();
  document.getElementById('adminSendOrderModal').classList.add('open');
}
function closeAdminSendOrderModal() {
  document.getElementById('adminSendOrderModal').classList.remove('open');
}

function toggleSendOrderCustomForm() {
  const el = document.getElementById('sendOrderCustomForm');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function searchSendOrderProducts() {
  const term = document.getElementById('sendOrderProductSearch').value.trim().toLowerCase();
  const box = document.getElementById('sendOrderSearchResults');
  if (!term) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const matches = products.filter(p => !p.parentId && (
    (p.ar && p.ar.toLowerCase().includes(term)) || (p.en && p.en.toLowerCase().includes(term)))
  ).slice(0, 15);
  if (!matches.length) {
    box.innerHTML = `<div style="padding:14px;color:var(--text-muted);font-size:13px;text-align:center">لا توجد نتائج</div>`;
    box.style.display = 'block';
    return;
  }
  box.innerHTML = matches.map(p => `
    <div onclick="addSendOrderProduct(${p.id})" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#f8fbfd;display:flex;align-items:center;justify-content:center">
        ${p.image ? `<img src="${cldOptimize(p.image,80)}" style="width:100%;height:100%;object-fit:contain">` : `<span>${escHtml(p.icon||'📦')}</span>`}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--primary-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.ar||p.en)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${(p.hasSizes && !sizesSamePrice(p)) ? 'من ' : ''}${fmtPrice((p.price||0))} د.أ${p.hasSizes ? ' · 📏 مقاسات' : ''}</div>
      </div>
    </div>`).join('');
  box.style.display = 'block';
}

// يضيف مقاسات مختارة إلى الطلبية: كل مقاس بند مستقل (لمخزونه وسعره)، ويُعرض مجمّعاً إن تساوت الأسعار
function addSendOrderSizeItems(selections) {
  selections.forEach(({ child, qty }) => {
    const existing = _sendOrderItems.find(i => i.kind === 'catalog' && i.id === child.id);
    if (existing) { existing.qty = qty; }
    else {
      _sendOrderItems.push({
        kind: 'catalog', id: child.id, parentId: child.parentId, sizeLabel: child.sizeLabel || '',
        ar: child.ar, en: child.en, icon: child.icon || '📦',
        price: child.price, points: getEffectivePoints(child), qty
      });
    }
  });
  renderSendOrderItems();
}

function addSendOrderProduct(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  if (p.hasSizes) {
    document.getElementById('sendOrderProductSearch').value = '';
    document.getElementById('sendOrderSearchResults').style.display = 'none';
    openSizePicker(p.id, { mode: 'sendorder', onConfirm: addSendOrderSizeItems });
    return;
  }
  const existing = _sendOrderItems.find(i => i.kind === 'catalog' && i.id === productId);
  if (existing) { existing.qty += 1; }
  else {
    _sendOrderItems.push({
      kind: 'catalog', id: p.id, ar: p.ar, en: p.en, icon: p.icon || '📦',
      price: p.price, points: getEffectivePoints(p), qty: 1
    });
  }
  document.getElementById('sendOrderProductSearch').value = '';
  document.getElementById('sendOrderSearchResults').style.display = 'none';
  renderSendOrderItems();
}

function addSendOrderCustomItem() {
  const name = document.getElementById('sendOrderCustomName').value.trim();
  const price = parseFloat(document.getElementById('sendOrderCustomPrice').value);
  if (!name || isNaN(price) || price < 0) {
    showToast('⚠️ أدخل اسم المادة وسعرًا صحيحًا', 'error');
    return;
  }
  _sendOrderItems.push({
    kind: 'custom', id: `custom-${Date.now()}`, ar: name, en: name, icon: '📦',
    price, points: 0, qty: 1
  });
  document.getElementById('sendOrderCustomName').value = '';
  document.getElementById('sendOrderCustomPrice').value = '';
  document.getElementById('sendOrderCustomForm').style.display = 'none';
  renderSendOrderItems();
}

function updateSendOrderQty(index, delta) {
  const item = _sendOrderItems[index];
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  renderSendOrderItems();
}
function updateSendOrderPrice(index, value) {
  const item = _sendOrderItems[index];
  if (!item) return;
  const v = parseFloat(value);
  item.price = isNaN(v) ? 0 : v;
  updateSendOrderTotalDisplay();
}
// خانة سعر واحدة لمجموعة مقاسات متساوية السعر: تُطبَّق على كل مقاساتها
function updateSendOrderGroupPrice(idxsCsv, value) {
  const v = parseFloat(value);
  idxsCsv.split(',').forEach(k => { const it = _sendOrderItems[parseInt(k, 10)]; if (it) it.price = isNaN(v) ? 0 : v; });
  updateSendOrderTotalDisplay();
}
function removeSendOrderItem(index) {
  _sendOrderItems.splice(index, 1);
  renderSendOrderItems();
}

function renderSendOrderItems() {
  const list = document.getElementById('sendOrderItemsList');
  const empty = document.getElementById('sendOrderEmptyState');
  if (!_sendOrderItems.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    updateSendOrderTotalDisplay();
    return;
  }
  empty.style.display = 'none';
  const singleRowHtml = (item, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:12px">
      <div style="display:flex;align-items:center;gap:4px;background:#f8fbfd;border-radius:50px;padding:4px;flex-shrink:0">
        <button type="button" onclick="updateSendOrderQty(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:none;background:#fff;cursor:pointer;font-weight:900;color:var(--primary)">−</button>
        <span style="min-width:20px;text-align:center;font-weight:800;font-size:13px">${item.qty}</span>
        <button type="button" onclick="updateSendOrderQty(${i},1)" style="width:26px;height:26px;border-radius:50%;border:none;background:#fff;cursor:pointer;font-weight:900;color:var(--primary)">+</button>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--primary-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.ar)}</div>
      </div>
      <input type="number" value="${item.price}" min="0" step="0.01" oninput="updateSendOrderPrice(${i}, this.value)"
        style="width:72px;padding:6px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center">
      <button type="button" onclick="removeSendOrderItem(${i})" style="width:28px;height:28px;border-radius:50%;border:none;background:#fff5f5;color:var(--danger);cursor:pointer;flex-shrink:0">
        <i class="fas fa-times" style="font-size:11px"></i>
      </button>
    </div>`;
  const stepBtn = 'width:26px;height:26px;border-radius:50%;border:none;background:#fff;cursor:pointer;font-weight:800';
  list.innerHTML = dpGroupSizeLines(_sendOrderItems, it => it.parentId).map(g => {
    if (!g.parent) return singleRowHtml(g.line, g.idx);
    const first = g.lines[0].line;
    const sizes = g.lines.map(({ line, idx }) => `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
        <span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:12px;font-weight:700">${escHtml(line.sizeLabel || '')}</span>
        <div style="display:flex;align-items:center;gap:4px;background:#f8fbfd;border-radius:50px;padding:4px">
          <button type="button" onclick="updateSendOrderQty(${idx},-1)" style="${stepBtn}">−</button>
          <span style="min-width:20px;text-align:center;font-weight:800;font-size:13px">${line.qty}</span>
          <button type="button" onclick="updateSendOrderQty(${idx},1)" style="${stepBtn}">+</button>
        </div>
        <button type="button" onclick="removeSendOrderItem(${idx})" style="width:24px;height:24px;border-radius:50%;border:none;background:#fff5f5;color:var(--danger);cursor:pointer"><i class="fas fa-times" style="font-size:10px"></i></button>
      </div>`).join('');
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--primary-dark)">${escHtml(g.parent.ar)}</div>
        ${sizes}
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
        <input type="number" value="${first.price}" min="0" step="0.01" oninput="updateSendOrderGroupPrice('${g.lines.map(l => l.idx).join(',')}', this.value)"
          style="width:72px;padding:6px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center">
        <span style="font-size:10px;color:var(--text-muted)">سعر واحد لكل المقاسات</span>
      </div>
    </div>`;
  }).join('');
  updateSendOrderTotalDisplay();
}

function setSendOrderPayMethod(method) {
  _sendOrderPayMethod = method;
  document.querySelectorAll('#sendOrderPayMethodGroup .pay-method-mini').forEach(btn => {
    const active = btn.dataset.val === method;
    btn.style.background = active ? 'var(--primary)' : '#f8fbfd';
    btn.style.color = active ? '#fff' : 'var(--text-muted)';
  });
  const discountBox = document.getElementById('sendOrderDiscountBox');
  if (discountBox) discountBox.style.display = (method === 'money' || method === 'credit') ? 'block' : 'none';
  updateSendOrderTotalDisplay();
}

function setSendOrderDiscountType(type) {
  _sendOrderDiscountType = type;
  const fixedBtn = document.getElementById('sendOrderDiscTypeFixed');
  const percentBtn = document.getElementById('sendOrderDiscTypePercent');
  if (fixedBtn && percentBtn) {
    fixedBtn.style.background = type === 'fixed' ? 'var(--primary)' : '#f8fbfd';
    fixedBtn.style.color = type === 'fixed' ? '#fff' : 'var(--text-muted)';
    percentBtn.style.background = type === 'percent' ? 'var(--primary)' : '#f8fbfd';
    percentBtn.style.color = type === 'percent' ? '#fff' : 'var(--text-muted)';
  }
  const valueInput = document.getElementById('sendOrderDiscountValue');
  if (valueInput) valueInput.placeholder = type === 'percent' ? 'مثال: 10' : 'مثال: 5.00';
  updateSendOrderTotalDisplay();
}

// يحسب مبلغ الخصم اليدوي (نقداً فقط) بناءً على نوعه وقيمته، بحد أقصى = المجموع نفسه
function getSendOrderDiscountAmount(rawTotal) {
  if (_sendOrderPayMethod !== 'money' && _sendOrderPayMethod !== 'credit') return 0;
  const input = document.getElementById('sendOrderDiscountValue');
  const raw = input ? parseFloat(input.value) : 0;
  const val = isNaN(raw) || raw < 0 ? 0 : raw;
  if (!val) return 0;
  if (_sendOrderDiscountType === 'percent') {
    const pct = Math.min(100, val);
    return Math.round((rawTotal * pct / 100) * 100) / 100;
  }
  return Math.min(val, rawTotal);
}

async function updateSendOrderTotalDisplay() {
  const rawTotal = _sendOrderItems.reduce((s, i) => s + i.price * i.qty, 0);
  const totalPoints = _sendOrderItems.reduce((s, i) => s + (i.points || 0) * i.qty, 0);
  const disp = document.getElementById('sendOrderTotalDisplay');
  const beforeRow = document.getElementById('sendOrderTotalBeforeRow');
  const beforeDisp = document.getElementById('sendOrderTotalBeforeDisplay');
  const deliveryRow = document.getElementById('sendOrderDeliveryRow');
  const uid = document.getElementById('sendOrderClientUid').value || null;

  let subtotal;
  if (_sendOrderPayMethod === 'points') {
    if (beforeRow) beforeRow.style.display = 'none';
    disp.textContent = `${totalPoints} نقطة`;
    if (deliveryRow) deliveryRow.innerHTML = '';
    return;
  } else if (_sendOrderPayMethod === 'free') {
    if (beforeRow) beforeRow.style.display = 'none';
    disp.innerHTML = `<span style="text-decoration:line-through;color:var(--text-muted);font-size:14px">${fmtPrice(rawTotal)} د.أ</span> مجانًا`;
    if (deliveryRow) deliveryRow.innerHTML = '';
    return;
  } else {
    const discountAmount = getSendOrderDiscountAmount(rawTotal);
    subtotal = Math.max(0, Math.round((rawTotal - discountAmount) * 100) / 100);
    if (discountAmount > 0) {
      if (beforeRow) beforeRow.style.display = 'flex';
      if (beforeDisp) beforeDisp.textContent = `${fmtPrice(rawTotal)} د.أ`;
    } else if (beforeRow) {
      beforeRow.style.display = 'none';
    }
  }

  const deliverySettings = uid ? await loadClientDeliverySettings(uid) : null;
  const deliveryResult = computeDeliveryFee(deliverySettings, subtotal);
  const finalTotal = deliveryResult.determined ? subtotal + (deliveryResult.fee || 0) : subtotal;
  disp.textContent = `${fmtPrice(finalTotal)} د.أ`;
  if (deliveryRow) deliveryRow.innerHTML = deliveryLineHTML(deliveryResult.fee, deliveryResult.determined);
}

async function submitAdminSendOrder() {
  if (!_sendOrderItems.length) {
    document.getElementById('sendOrderError').style.display = 'flex';
    return;
  }
  document.getElementById('sendOrderError').style.display = 'none';

  const btn = document.getElementById('sendOrderSubmitBtn');
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

  const email  = document.getElementById('sendOrderClientEmail').value;
  const uid    = document.getElementById('sendOrderClientUid').value || null;
  const phone  = document.getElementById('sendOrderClientPhone').value;
  const clinic = document.getElementById('sendOrderClientClinic').value;
  const name   = document.getElementById('sendOrderClientName').textContent;

  const totalPoints = _sendOrderItems.reduce((s, i) => s + (i.points || 0) * i.qty, 0);
  const cashOnlyItems = _sendOrderItems.filter(i => !i.points || i.points === 0);

  let total, originalTotal = null, discountAmount = 0;
  if (_sendOrderPayMethod === 'points') {
    total = cashOnlyItems.reduce((s, i) => s + i.price * i.qty, 0); // بس المواد الغير مؤهلة للنقاط
  } else if (_sendOrderPayMethod === 'free') {
    total = 0;
  } else {
    const rawTotal = _sendOrderItems.reduce((s, i) => s + i.price * i.qty, 0);
    discountAmount = getSendOrderDiscountAmount(rawTotal);
    if (discountAmount > 0) {
      originalTotal = rawTotal;
      total = Math.max(0, Math.round((rawTotal - discountAmount) * 100) / 100);
    } else {
      total = rawTotal;
    }
  }

  // تحقق من كفاية رصيد نقاط العميل قبل الإرسال (لو الدفع بالنقاط)
  if (_sendOrderPayMethod === 'points') {
    const currentBalance = await getClientPoints(uid);
    if (currentBalance < totalPoints) {
      showToast(`⚠️ رصيد العميل (${currentBalance} نقطة) لا يكفي — المطلوب ${totalPoints} نقطة`, 'error');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return;
    }
  }

  // الذمم: نُنبّه الأدمن إن لم تكن مفعّلة للعميل أو تجاوز حده (القرار له)
  if (_sendOrderPayMethod === 'credit') {
    if (!uid) { showToast('🧾 الذمم متاحة للعملاء المسجلين فقط', 'error'); btn.disabled = false; btn.innerHTML = originalHTML; return; }
    let warn = '';
    try {
      const uSnap = await window._fbGetDocFromServer(window._fbDoc2('users', uid));
      const ud = uSnap.exists() ? uSnap.data() : {};
      if (ud.creditEnabled !== true) warn = 'الذمم غير مفعّلة لهذا العميل.';
      else {
        const oq = window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', email));
        const pq = window._fbQuery(window._fbCollection(window._db, 'credit_payments'), window._fbWhere('clientUid', '==', uid));
        const [os, ps] = await Promise.all([window._fbGetDocs(oq), window._fbGetDocs(pq)]);
        const out = dpCreditCompute(os.docs.map(d => d.data()), ps.docs.map(d => d.data())).outstanding;
        if (out + total > (Number(ud.creditLimit) || 0)) warn = `المتبقي عليه ${fmtPrice(out)} د.أ مع هذا الطلب يتجاوز حده الائتماني (${fmtPrice(Number(ud.creditLimit) || 0)} د.أ).`;
      }
    } catch (e) { warn = 'تعذر التحقق من حالة الذمم.'; }
    if (warn && !confirm(warn + '\nهل تريد المتابعة بالطلب على الذمم؟')) { btn.disabled = false; btn.innerHTML = originalHTML; return; }
  }

  const deliverySettings = uid ? await loadClientDeliverySettings(uid) : null;
  const deliveryResult = computeDeliveryFee(deliverySettings, total);
  const totalWithDelivery = deliveryResult.determined ? total + (deliveryResult.fee || 0) : total;

  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  const orderNum = `DP-${ts}-${rand}`;

  const order = {
    id: orderNum,
    clientName: name,
    clientEmail: email,
    clientUid: uid,
    clinic: clinic,
    doctor: name,
    phone: phone,
    address: '',
    notes: 'طلبية أُدخلت يدوياً من الأدمن (هاتف/واتساب)',
    items: _sendOrderItems.map(i => ({
      id: i.id, ...(i.parentId ? { parentId: i.parentId, sizeLabel: i.sizeLabel || '' } : {}), ar: i.ar, en: i.en, icon: i.icon, price: i.price, qty: i.qty, points: i.points || 0
    })),
    total: totalWithDelivery,
    deliveryFee: deliveryResult.determined ? (deliveryResult.fee || 0) : null,
    deliveryDetermined: deliveryResult.determined,
    originalTotal: originalTotal,
    manualDiscountAmount: discountAmount > 0 ? discountAmount : 0,
    manualDiscountType: discountAmount > 0 ? _sendOrderDiscountType : null,
    totalPoints,
    payMethod: _sendOrderPayMethod,
    pointsDeducted: false,
    status: 'confirmed',
    createdByAdmin: true,
    createdAt: new Date().toISOString(),
  };

  function stripUndefinedDeep(obj) {
    if (Array.isArray(obj)) {
      return obj.map(stripUndefinedDeep);
    } else if (obj !== null && typeof obj === 'object') {
      const clean = {};
      Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val === undefined) return;
        clean[key] = stripUndefinedDeep(val);
      });
      return clean;
    }
    return obj;
  }
  const cleanOrder = stripUndefinedDeep(order);

  try {
    const stockResult = await reserveOrderStock(cleanOrder.items);
    cleanOrder.stockReserved = stockResult.reserved;
  } catch(stockErr) {
    showToast(`❌ ${stockErr.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return;
  }

  try {
    await window._fbSetDoc(window._fbDoc2('orders', orderNum), cleanOrder);
  } catch (e) {
    console.error('❌ Firebase error:', e.code || e.message, e);
    showToast('❌ تعذّر إرسال الطلبية، تحقق من الاتصال', 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return;
  }

  if (email && email !== 'guest') {
    createNotification({
      scope: 'client',
      targetEmail: email,
      icon: '🛒',
      title: 'طلبية جديدة',
      message: `تم تجهيز طلبية لك بقيمة ${_sendOrderPayMethod === 'points' ? totalPoints + ' نقطة' : fmtPrice(total) + ' د.أ'}`,
      link: 'page:orders',
    });
  }

  showToast('✅ تم إرسال الطلبية بنجاح', 'success');
  closeAdminSendOrderModal();
  btn.disabled = false;
  btn.innerHTML = originalHTML;

  if (email) showClientRecord(uid, email); // تحديث فوري لعدد الطلبات في سجل العميل
}

// ============================
// تقرير تفاصيل طلبات العميل (فلترة بالتاريخ + الحالة، مع طباعة)
// ============================
function openClientOrdersReportModal(email, name, clinic, phone = '') {
  document.getElementById('reportClientEmail').value = email;
  document.getElementById('reportClientName').value = name;
  document.getElementById('reportClientClinic').value = clinic;
  window._clientOrdersReportPhone = phone || '';
  document.getElementById('reportFromDate').value = '';
  document.getElementById('reportToDate').value = '';
  document.getElementById('reportStatusFilter').value = 'all';
  document.getElementById('reportPayMethodFilter').value = 'all';
  document.getElementById('clientOrdersReportBody').innerHTML = '';
  document.getElementById('clientOrdersReportModal').classList.add('open');
  runClientOrdersReport();
}
function closeClientOrdersReportModal() {
  document.getElementById('clientOrdersReportModal').classList.remove('open');
}

async function runClientOrdersReport() {
  const email  = document.getElementById('reportClientEmail').value;
  const name   = document.getElementById('reportClientName').value;
  const clinic = document.getElementById('reportClientClinic').value;
  const reportPhone = window._clientOrdersReportPhone || '';
  const normalizeReportPhone = value => String(value || '').replace(/\D/g, '').slice(-9);
  const reportPhoneKey = normalizeReportPhone(reportPhone);
  const fromVal = document.getElementById('reportFromDate').value;
  const toVal   = document.getElementById('reportToDate').value;
  const statusFilter = document.getElementById('reportStatusFilter').value;
  const payMethodFilter = document.getElementById('reportPayMethodFilter').value;
  const body = document.getElementById('clientOrdersReportBody');
  body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px;width:26px;height:26px;border-width:4px"></div>جاري تجهيز التقرير...</div>`;

  try {
    const [ordersSnap, allQuotes] = await Promise.all([
      window._fbGetDocs(window._fbOrdersRef()),
      getAllQuotes()
    ]);
    let orders = ordersSnap.docs.map(d => d.data()).filter(o =>
      o.clientEmail === email ||
      (reportPhoneKey && o.clientEmail === 'guest' && normalizeReportPhone(o.phone) === reportPhoneKey)
    );
    let quoteOrders = (allQuotes || [])
      .filter(q =>
        (q.clientEmail === email ||
          (reportPhoneKey && q.clientEmail === 'guest' && normalizeReportPhone(q.phone) === reportPhoneKey)) &&
        q.status === 'accepted'
      )
      .filter(q => !orders.some(o =>
        o.sourceQuoteId === q.id || o.id === ('DP-' + String(q.id || '').replace('QT-', ''))
      ))
      .map(q => ({
        id: q.id || q._docId,
        createdAt: q.createdAt,
        status: 'pending',
        items: q.items || [],
      }));
    let all = [...orders, ...quoteOrders];

    const fromDate = fromVal ? new Date(fromVal) : null;
    const toDate   = toVal ? new Date(toVal + 'T23:59:59') : null;
    all = all.filter(o => {
      const d = new Date(o.createdAt);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });

    if (statusFilter !== 'all') {
      all = all.filter(o => (o.status || 'pending') === statusFilter);
    }

    if (payMethodFilter !== 'all') {
      all = all.filter(o => (o.payMethod || 'money') === payMethodFilter);
    }

    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!all.length) {
      body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">لا توجد طلبات ضمن هذه الفترة/الحالة</div>`;
      return;
    }

    let grandTotalCash = 0;
    let grandTotalPoints = 0;
    let grandTotalCredit = 0;
    let invoicesHTML = '';
    all.forEach(order => {
      const isCancelled = (order.status || 'pending') === 'cancelled';
      const isPointsPay = order.payMethod === 'points';
      const items = dpDisplayItems(order.items || []); // مقاسات المادة الواحدة بنفس السعر: بند واحد وبجانبه المقاسات
      let invoiceTotal = 0;
      const rowsHTML = items.map((it, idx) => {
        const lineTotal = (it.price || 0) * (it.qty || 1);
        invoiceTotal += lineTotal;
        return `
          <tr>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #eef2f6">${idx + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #eef2f6">${escHtml(it.ar || it.en || '—')}${it.sizesLabel ? `<br><small style="color:#5a7a90">${escHtml(it.sizesLabel)}</small>` : ''}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #eef2f6">${it.qty || 1}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #eef2f6">${fmtPrice(it.price || 0)}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #eef2f6;font-weight:700">${fmtPrice(lineTotal)}</td>
          </tr>`;
      }).join('');

      // المجموع الفعلي: نستخدم order.total (يعكس الخصم تلقائياً لو موجود) لو متوفر،
      // وإلا مجموع بنود العناصر (لعروض أسعار مقبولة لسا ما تحولت لطلب حقيقي)
      const actualTotal = (typeof order.total === 'number') ? order.total : invoiceTotal;
      const hasDiscount = order.originalTotal && order.originalTotal > order.total;

      if (!isCancelled) {
        if (order.payMethod === 'credit') grandTotalCredit += actualTotal;
        if (isPointsPay) {
          grandTotalPoints += (order.totalPoints || 0);
          if (actualTotal > 0) grandTotalCash += actualTotal; // جزء النقد بالطلبات المختلطة
        } else {
          grandTotalCash += actualTotal;
        }
      }

      const dateStr = new Date(order.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
      const s = getStatusObj(order.status || 'pending');

      const footerTotalHTML = isPointsPay
        ? formatOrderTotal(order, { prefix: '🏆 إجمالي الفاتورة: ' })
        : (hasDiscount
            ? `إجمالي الفاتورة: <span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;font-weight:600;margin-inline-end:6px">${fmtPrice(order.originalTotal)} د.أ</span>${fmtPrice(actualTotal)} د.أ <span style="font-size:11px;color:#e53e3e">(خصم ${getOrderDiscountPercent(order)}%)</span>`
            : `إجمالي الفاتورة: ${fmtPrice(actualTotal)} د.أ`);

      invoicesHTML += `
        <div style="margin-bottom:24px;border:1.5px solid var(--border);border-radius:14px;overflow:hidden;${isCancelled ? 'opacity:0.6' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#f8fbfd;flex-wrap:wrap;gap:8px">
            <div style="font-weight:800;color:var(--primary-dark);font-size:13px">
              <i class="fas fa-file-invoice"></i> فاتورة #${escHtml(String(order.id || ''))} — ${dateStr}${order.couponCode ? ` — 🎟️ ${escHtml(order.couponCode)}` : ''}
            </div>
            ${order.payMethod === 'credit' ? '<span class="status-badge" style="background:#ede9fe;color:#6d28d9">🧾 ذمم</span> ' : ''}<span class="status-badge ${s.class}"><i class="fas ${s.icon}"></i> ${s.label}${isCancelled ? ' (ملغاة)' : ''}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#fff">
                <th style="padding:8px;text-align:center;color:var(--text-muted);font-size:11px">#</th>
                <th style="padding:8px;text-align:right;color:var(--text-muted);font-size:11px">المادة</th>
                <th style="padding:8px;text-align:center;color:var(--text-muted);font-size:11px">الكمية</th>
                <th style="padding:8px;text-align:center;color:var(--text-muted);font-size:11px">سعر الوحدة</th>
                <th style="padding:8px;text-align:center;color:var(--text-muted);font-size:11px">الإجمالي</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
          <div style="display:flex;justify-content:flex-end;padding:10px 16px;background:#f8fbfd;font-weight:900;color:var(--primary)">
            ${footerTotalHTML}
          </div>
        </div>`;
    });

    body.innerHTML = `
      <div id="clientOrdersReportPrintArea">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-weight:900;font-size:17px;color:var(--primary-dark)">${escHtml(name)}</div>
          <div style="font-size:13px;color:var(--text-muted)">${escHtml(clinic || '—')}</div>
        </div>
        ${invoicesHTML}
        <div style="display:flex;flex-direction:column;gap:8px;padding:16px;background:linear-gradient(135deg,var(--primary-dark),var(--primary));border-radius:14px;color:#fff;margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:800">الإجمالي العام (نقد)</span>
            <strong style="font-size:20px">${fmtPrice(grandTotalCash)} د.أ</strong>
          </div>
          ${grandTotalCredit > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.25)">
            <span style="font-weight:800">منها بالذمم</span>
            <strong style="font-size:20px">${fmtPrice(grandTotalCredit)} د.أ</strong>
          </div>` : ''}
          ${grandTotalPoints > 0 ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.25)">
            <span style="font-weight:800">🏆 الإجمالي العام (نقاط)</span>
            <strong style="font-size:20px">${grandTotalPoints.toLocaleString()} نقطة</strong>
          </div>` : ''}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger)">خطأ: ${e.message}</div>`;
  }
}

function printClientOrdersReport() {
  const printArea = document.getElementById('clientOrdersReportPrintArea');
  if (!printArea) { showToast('⚠️ لا يوجد تقرير لطباعته', 'error'); return; }
  const win = window.open('', '_blank');
  win.document.write(`
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير طلبات العميل</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#1a2332}
        table{width:100%;border-collapse:collapse}
        .status-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:50px;font-size:11px;font-weight:700;background:#eef2f6}
      </style>
    </head>
    <body>${printArea.innerHTML}</body>
    </html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

async function showClientRecord(uid, email) {
  const existing = document.getElementById('clientRecordModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'clientRecordModal';
  modal.className = 'modal-overlay open';
  modal.style.cssText = 'z-index:4000;align-items:flex-start;padding:20px;overflow-y:auto';
  modal.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-header" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary))">
        <div class="modal-title"><i class="fas fa-folder-open"></i> سجل العميل</div>
        <button class="close-btn" aria-label="إغلاق" onclick="document.getElementById('clientRecordModal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" id="clientRecordBody">
        <div style="text-align:center;padding:32px;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 14px;width:28px;height:28px;border-width:4px"></div>
          جاري تحميل السجل...
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  try {
    // جلب بيانات العميل
    const usersSnap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
    const userDoc   = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).find(u => u.email === email);
    const localUsers = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    const localUser  = localUsers.find(u => u.email === email);
    const u = userDoc || localUser || { email, firstName: 'عميل', clinic: '', phone: '' };

    // جلب طلباته
    const ordersSnap = await window._fbGetDocs(window._fbOrdersRef());
    const orders = ordersSnap.docs.map(d => d.data())
      .filter(o => o.clientEmail === email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalSpent  = orders.reduce((s, o) => s + (o.total || 0), 0);
    const balance     = await getClientPoints(uid);

    document.getElementById('clientRecordBody').innerHTML = `
      <!-- بطاقة العميل -->
      <div style="display:flex;align-items:center;gap:16px;padding:16px;
        background:linear-gradient(135deg,rgba(10,92,138,0.06),rgba(0,194,168,0.04));
        border-radius:14px;border:1px solid var(--border);margin-bottom:20px">
        <div style="width:56px;height:56px;border-radius:50%;
          background:linear-gradient(135deg,var(--primary),var(--accent));
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:24px;font-weight:900;flex-shrink:0">
          ${(u.firstName||u.name||'؟').charAt(0)}
        </div>
        <div style="flex:1">
          <div style="font-weight:900;font-size:16px;color:var(--primary-dark)">${escHtml(u.firstName||u.name||'عميل')}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${escHtml(u.clinic||'')}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escHtml(u.email)} ${u.phone ? '· '+escHtml(u.phone) : ''}</div>
        </div>
      </div>

      <!-- إحصائيات -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:#f0f8ff;border-radius:12px;padding:16px;text-align:center;border:1px solid #cce4f6">
          <div style="font-size:24px;font-weight:900;color:var(--primary)">${orders.length}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">إجمالي الطلبات</div>
        </div>
        <div style="background:#f0fff4;border-radius:12px;padding:16px;text-align:center;border:1px solid #bbf7d0">
          <div style="font-size:22px;font-weight:900;color:#15803d">${fmtPrice(totalSpent)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">إجمالي المشتريات (د.أ)</div>
        </div>
        <div style="background:#fffbeb;border-radius:12px;padding:16px;text-align:center;border:1px solid #fde68a">
          <div style="font-size:24px;font-weight:900;color:#d97706">${balance}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">🏆 رصيد النقاط</div>
        </div>
      </div>

      <!-- قائمة الطلبات -->
      <div style="font-weight:800;font-size:14px;color:var(--primary-dark);margin-bottom:12px;
        display:flex;align-items:center;gap:8px">
        <i class="fas fa-history" style="color:var(--primary-light)"></i> سجل الطلبات
      </div>
      ${!orders.length ? `
        <div style="text-align:center;padding:32px;color:var(--text-muted)">
          <i class="fas fa-box-open" style="font-size:36px;opacity:0.2;display:block;margin-bottom:12px"></i>
          لا توجد طلبات بعد
        </div>` :
        orders.map(o => {
          const date = new Date(o.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
            { year:'numeric', month:'short', day:'numeric' });
          const s = getStatusObj(o.status);
          return `
          <div style="padding:12px 14px;border-radius:12px;border:1px solid var(--border);
            margin-bottom:8px;background:#fafcfe">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:800;font-size:13px;color:var(--primary-dark)">#${o.id}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${date}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span class="status-badge ${s.class}"><i class="fas ${s.icon}"></i> ${s.label}</span>
                <span style="font-weight:900;color:var(--primary);font-size:14px">
                  ${fmtPrice(o.total)} د.أ
                </span>
              </div>
            </div>
            <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
              ${dpDisplayItems(o.items).map(i => `${escHtml(i.icon || '')} ${escHtml(i.ar)}${i.sizesLabel ? ` (${escHtml(i.sizesLabel)})` : ''} ×${i.qty}`).join(' &nbsp;·&nbsp; ')}
            </div>
          </div>`;
        }).join('')
      }`;
  } catch(e) {
    document.getElementById('clientRecordBody').innerHTML = `
      <div style="text-align:center;padding:32px;color:var(--danger)">
        خطأ في تحميل البيانات: ${e.message}
      </div>`;
  }
}

// =====================
// بعد تعديل العميل لملفه الشخصي، ننشر التحديث على كل طلباته وعروض أسعاره
// السابقة، حتى تظهر باسمه/هاتفه/عيادته الجديدة بلوحة الإدمن بكل مكان
async function propagateProfileUpdateToRecords(email, { name, clinic, phone }) {
  try {
    const [ordersSnap, quotesSnap] = await Promise.all([
      window._fbGetDocs(window._fbOrdersRef()),
      window._fbGetDocs(window._fbCollection(window._db, 'quotes'))
    ]);
    const uPhone = normalizePhone(phone);
    // نشمل كمان الطلبات/العروض القديمة اللي تمت وهو زائر (clientEmail:'guest')
    // بنفس رقم الهاتف — نفس منطق دمج طلبات الزائر اللي بنيناه سابقاً
    const myOrders = ordersSnap.docs.filter(d => {
      const o = d.data();
      return o.clientEmail === email || (uPhone && o.clientEmail === 'guest' && normalizePhone(o.phone) === uPhone);
    });
    const myQuotes = quotesSnap.docs.filter(d => {
      const q = d.data();
      return q.clientEmail === email || (uPhone && q.clientEmail === 'guest' && normalizePhone(q.phone) === uPhone);
    });
    if (!myOrders.length && !myQuotes.length) return;

    const batch = window._fbWriteBatch();
    myOrders.forEach(d => {
      const wasGuest = d.data().clientEmail === 'guest';
      batch.update(window._fbDoc2('orders', d.id), {
        clientName: name, doctor: name, clinic, phone,
        ...(wasGuest ? { clientEmail: email, clientUid: currentUser.uid } : {})
      });
    });
    myQuotes.forEach(d => {
      const wasGuest = d.data().clientEmail === 'guest';
      batch.update(window._fbDoc2('quotes', d.id), {
        clientName: name, phone,
        ...(wasGuest ? { clientEmail: email, clientUid: currentUser.uid } : {})
      });
    });
    await batch.commit();
  } catch (e) {
    console.warn('propagateProfileUpdateToRecords:', e.message);
  }
}
// عرض نقاط العميل الحالي بجانب زر اللغة بالهيدر (بس للعملاء المسجّلين)
