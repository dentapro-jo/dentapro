// دوال مشتركة لنقاط الولاء — تُستخدم من السلة (cart.js) وهيدر الموقع (auth-ui.js)
// بالإضافة إلى لوحة الإدارة (orders.js). نُقلت من js/admin/products.js لتحميلها
// لكل الزوار دون تحميل باقي كود لوحة الإدارة.

async function getClientPoints(uid) {
  if (!uid) return 0;
  // قراءة محلية فورية كقيمة مبدئية
  const localSaved = JSON.parse(localStorage.getItem('dentapro_points') || '{}');
  const localBalance = localSaved[uid] || 0;

  try {
    for (let i = 0; i < 20; i++) {
      if (window._fbDoc2 && window._fbGetDoc) break;
      await new Promise(r => setTimeout(r, 200));
    }
    const ref = window._fbDoc2('points', uid);
    const snap = await window._fbGetDoc(ref);
    if (snap.exists()) {
      const balance = snap.data().balance || 0;
      localSaved[uid] = balance;
      localStorage.setItem('dentapro_points', JSON.stringify(localSaved));
      return balance;
    }
    return localBalance;
  } catch(e) {
    console.warn('❌ خطأ Firebase points:', e.message);
    return localBalance;
  }
}

// عرض رصيد النقاط في الهيدر
async function renderPointsInHeader() {
  if (!currentUser || currentUser.role !== 'client') return;
  const balance = await getClientPoints(currentUser.uid);
  currentUser.points = balance;
  const chip = document.querySelector('.user-chip-role');
  if (chip) {
    chip.innerHTML = `عميل &nbsp;|&nbsp; <span style="color:#d97706;font-weight:800">🏆 ${balance} نقطة</span>`;
  }
  const headerBadge = document.getElementById('headerPointsBadge');
  if (headerBadge) {
    headerBadge.textContent = balance.toLocaleString();
    headerBadge.style.display = 'inline';
  }
  const fabPointsBtn = document.getElementById('fabPointsBtn');
  const fabPointsLabel = document.getElementById('fabPointsLabel');
  if (fabPointsBtn && fabPointsLabel) {
    fabPointsLabel.textContent = balance.toLocaleString() + ' نقطة';
    fabPointsBtn.style.display = 'flex';
  }

  // إظهار بطاقة النقاط في صفحة طلباتي
  const existing = document.getElementById('clientPointsCard');
  if (existing) { existing.remove(); }

  const ordersPage = document.getElementById('ordersPage');
  if (!ordersPage || !ordersPage.classList.contains('active')) return;

  const card = document.createElement('div');
  card.id = 'clientPointsCard';
  card.style.cssText = `
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border: 2px solid #f59e0b;
    border-radius: 18px;
    padding: 22px 28px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    box-shadow: 0 4px 16px rgba(245,158,11,0.15);
  `;
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px">
      <div style="width:56px;height:56px;border-radius:50%;
                  background:linear-gradient(135deg,#f59e0b,#d97706);
                  display:flex;align-items:center;justify-content:center;
                  font-size:26px;box-shadow:0 4px 12px rgba(245,158,11,0.35)">🏆</div>
      <div>
        <div style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:4px">رصيد نقاطك الحالي</div>
        <div style="font-size:30px;font-weight:900;color:#d97706;line-height:1">${balance} <span style="font-size:15px;font-weight:600">نقطة</span></div>
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:6px">يمكنك استخدام نقاطك عند الشراء</div>
      <button onclick="showPage('home')" class="btn-primary" style="padding:10px 24px;font-size:13px">
        <i class="fas fa-shopping-cart"></i> تسوّق الآن
      </button>
    </div>
  `;

  const ordersInner = ordersPage.querySelector('.orders-page');
  const firstChild  = ordersInner?.querySelector('[style*="display:flex"]');
  if (firstChild) {
    ordersInner.insertBefore(card, firstChild.nextSibling);
  } else if (ordersInner) {
    ordersInner.appendChild(card);
  }
}
