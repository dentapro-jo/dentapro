// DentaPro domain module: extracted from the original implementation.

// [جديد] محتوى قائمة الحساب — نفس عناصر قائمة user-dropdown العلوية بالضبط
// يبني بنود قائمة حساب الأدمن/المدير (تُستخدم بهيدر الديسكتوب وبالـ Bottom Sheet معاً)
function adminAccountMenuButtonsHTML(itemStyle = '', closePrefix = '') {
  const s = itemStyle ? ` style="${itemStyle}"` : '';
  return `
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openClientsListModal()">
      <i class="fas fa-user-friends" style="color:var(--primary)"></i> ${t('العملاء','Clients')}
    </button>
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('orders')">
      <i class="fas fa-clipboard-list" style="color:var(--primary)"></i> ${t('الطلبات','Orders')}
      <span id="adminOrdersBadge" style="margin-inline-start:6px;background:var(--danger,#e53e3e);color:#fff;border-radius:50px;padding:1px 7px;font-size:11px;font-weight:800"></span>
    </button>
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('points')">
      <i class="fas fa-star" style="color:#f59e0b"></i> ${t('النقاط','Points')}
    </button>
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('offers')">
      <i class="fas fa-gift" style="color:#f59e0b"></i> ${t('العروض','Offers')}
    </button>
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('quotes')">
      <i class="fas fa-file-invoice-dollar" style="color:#0a5c8a"></i> ${t('طلبات عروض الأسعار','Quote Requests')}
      <span id="adminQuotesBadge" style="margin-inline-start:6px;background:var(--danger,#e53e3e);color:#fff;border-radius:50px;padding:1px 7px;font-size:11px;font-weight:800"></span>
    </button>
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('messages')">
      <i class="fas fa-comment-dots" style="color:#0a5c8a"></i> ${t('الرسائل','Messages')}
      <span id="adminMsgBadge" style="margin-inline-start:6px;background:var(--danger,#e53e3e);color:#fff;border-radius:50px;padding:1px 7px;font-size:11px;font-weight:800"></span>
    </button>
    ${isAdmin() ? `<button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('roles')">
      <i class="fas fa-user-shield" style="color:#e53e3e"></i> ${t('الصلاحيات','Roles')}
    </button>` : ''}
    <button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('products')">
      <i class="fas fa-box" style="color:var(--primary)"></i> ${t('المنتجات','Products')}
    </button>
    ${isAdmin() ? `<button class="user-dropdown-item"${s} onclick="${closePrefix}openHeroTitleEditModal()">
      <i class="fas fa-heading" style="color:#0a5c8a"></i> ${t('تعديل عنوان الرئيسية','Edit Homepage Title')}
    </button>` : ''}
    ${isAdmin() ? `<button class="user-dropdown-item"${s} onclick="${closePrefix}openCustomDiscountSettingsModal()">
      <i class="fas fa-user-tag" style="color:#7e22ce"></i> ${t('الخصم المخصص','Custom Discount')}
    </button>` : ''}
    ${isAdmin() ? `<button class="user-dropdown-item"${s} onclick="${closePrefix}openAdminTabDirect('homebanner')">
      <i class="fas fa-images" style="color:#0a5c8a"></i> ${t('تعديل الصفحة الرئيسية','Edit Homepage')}
    </button>` : ''}`;
}

// يفتح لوحة التحكم مباشرة على تبويب محدد
async function openAdminTabDirect(tab) {
  if (!isStaff()) { showToast('⛔ غير مصرح لك بالدخول', 'error'); return; }
  document.getElementById('adminPanel').classList.add('open');
  applyAdminUIPermissions();
  if (tab === 'products') {
    showToast('🔄 جاري تحميل كل المنتجات...', '');
    await ensureAllProductsLoaded();
    updateAdminStats();
    renderAdminTable();
  }
  switchAdminTab(tab);
}
function accountMenuItemsHTML() {
  if (!currentUser) return '';
  if (isStaff()) {
    return `
      ${adminAccountMenuButtonsHTML('width:100%;text-align:right;padding:16px 22px;font-size:15px', 'closeAccountMenu();')}
      <div class="user-dropdown-divider"></div>
      <button class="user-dropdown-item danger" style="width:100%;text-align:right;padding:16px 22px;font-size:15px" onclick="closeAccountMenu();doLogout()">
        <i class="fas fa-sign-out-alt"></i> ${t('تسجيل الخروج','Log Out')}
      </button>`;
  }
  // العميل ما عاد يستخدم هالقائمة — كل عناصره صارت مباشرة بالدرج العلوي، وزر الشريط السفلي صار "الرئيسية"
  return '';
}

function openAccountMenu() {
  document.getElementById('accountMenuItems').innerHTML = accountMenuItemsHTML();
  document.getElementById('accountMenuModal').classList.add('open');
  refreshAdminMenuBadges();
}

// يعيد ملء شارات القائمة فوراً من آخر بيانات محفوظة بالذاكرة (بدون انتظار تحديث لحظي جديد)
async function refreshAdminMenuBadges() {
  if (!isStaff()) return;
  try {
    if (typeof updateHeaderMsgBadge === 'function') updateHeaderMsgBadge();
    const ordersBadge = document.getElementById('adminOrdersBadge');
    if (ordersBadge) {
      let orders = window._cachedOrders;
      if (!orders) {
        const snap = await window._fbGetDocs(window._fbOrdersRef());
        orders = snap.docs.map(d => d.data());
      }
      const pending = orders.filter(o => !['delivered','cancelled'].includes(o.status)).length;
      ordersBadge.textContent = pending > 0 ? pending : '';
    }
    const quotesBadge = document.getElementById('adminQuotesBadge');
    if (quotesBadge) {
      let quotes = window._cachedAdminQuotes;
      if (!quotes) quotes = await getAllQuotes();
      const pendingQ = computeQuotesBadgeCount(quotes);
      quotesBadge.textContent = pendingQ > 0 ? pendingQ : '';
    }
  } catch(e) { console.warn('refreshAdminMenuBadges:', e.message); }
}
function closeAccountMenu() {
  document.getElementById('accountMenuModal').classList.remove('open');
}

