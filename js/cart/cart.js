// DentaPro domain module: extracted from the original implementation.
// =====================
function bumpCartIcon() {
  const btn = document.querySelector('.cart-btn');
  if (!btn) return;
  btn.classList.remove('bump');
  void btn.offsetWidth; // إعادة تشغيل الأنيميشن حتى لو تكرر بسرعة
  btn.classList.add('bump');
}

function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  // المنتج متعدد المقاسات لا يُضاف مباشرة: نفتح قائمة المقاسات ليختار العميل
  if (p.hasSizes) { if (typeof openSizePicker === 'function') openSizePicker(p.id); return; }
  const existing = cart.find(x => String(x.id) === String(id));
  if (!existing && p.stock !== undefined && p.stock !== null && p.stock <= 0) {
    showToast(`❌ ${t('عذراً، نفذت كمية هذا المنتج','Sorry, this product is out of stock')}`, 'error');
    return;
  }
  if (existing) {
    removeFromCart(id);
    showToast(`🗑️ ${p.en} ${t('أُزيل من السلة','removed from cart')}`, 'success');
    return;
  }
  // لو عليه عرض كمية نشط، نضيفه بالكمية المطلوبة لتحقيق العرض تلقائياً (بدل 1)، والعميل يقدر يعدّلها بعدين بحرّية
  const activeOffer = getActiveQtyOffer(p.id);
  const initialQty = (activeOffer && activeOffer.tiers && activeOffer.tiers.length)
    ? activeOffer.tiers.slice().sort((a,b) => a.qty - b.qty)[0].qty
    : 1;
  cart.push({...p, qty:initialQty, basePrice: p.price, price: getEffectiveUnitPrice(p, initialQty), points: getEffectivePoints(p)});
  showToast(`✅ ${p.en} ${t('أُضيف للسلة','added to cart')}`, 'success', { center: true });
  updateCartUI();
  renderProducts();
  bumpCartIcon();
  logActivity('add_to_cart', { productId: p.id, productName: p.ar });
}

// resolved (اختياري): عناصر الباقة بعد توزيع الكميات على المقاسات [{productId (المقاس الفعلي), qty}]
function addBundleToCart(bundleId, resolved) {
  const b = offers.find(o => o.id === bundleId && o.type === 'bundle');
  if (!b) return;
  if (!isBundleInStock(b)) {
    showToast(t('عذراً، أحد منتجات الباقة غير متوفر حالياً','Sorry, a bundle item is out of stock'), 'error');
    return;
  }
  // باقة فيها مادة بمقاسات: يوزّع العميل كمية المادة على المقاسات المسموحة أولاً
  if (!resolved && (b.items || []).some(it => dpBundleItemKids(it))) {
    openBundleSizePicker(b.id);
    return;
  }
  const lineItems = resolved || (b.items || []).map(it => ({ productId: it.productId, qty: it.qty }));
  // توزيعات المقاسات المختلفة تُنتج بنوداً مختلفة بالسلة
  const sig = resolved ? resolved.map(x => x.productId + ':' + x.qty).sort().join('_') : '';
  const cartId = 'bundle-' + b.id + (sig ? '-' + sig : '');
  const existing = cart.find(x => String(x.id) === cartId);
  if (existing) {
    const short = (existing.bundleItems || []).find(bi => {
      const pr = products.find(x => x.id === bi.productId);
      return pr && pr.stock !== undefined && pr.stock !== null && (bi.qty * (existing.qty + 1)) > pr.stock;
    });
    if (short) { showToast(t('❌ الكمية المتوفرة من إحدى مواد الباقة غير كافية','❌ Not enough stock for a bundle item'), 'error'); return; }
    existing.qty += 1;
  } else {
    cart.push({
      id: cartId, isBundle: true, bundleId: b.id,
      ar: b.name_ar, en: b.name_en, icon: b.icon || '🎁', image: b.image || null,
      price: b.bundlePrice, qty: 1, points: b.points || 0,
      bundleItems: lineItems.map(it => ({ productId: it.productId, qty: it.qty }))
    });
  }
  showToast(`✅ ${currentLang==='en'?b.name_en:b.name_ar} ${t('أُضيفت للسلة','added to cart')}`, 'success');
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(x => String(x.id) !== String(id));
  updateCartUI();
  renderProducts();
}

function changeQty(id, delta) {
  const item = cart.find(x => String(x.id) === String(id));
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(id); return; }

  if (delta > 0) {
    if (item.isBundle) {
      const insufficientItem = (item.bundleItems || []).find(bi => {
        const p = products.find(x => x.id === bi.productId);
        return p && p.stock !== undefined && p.stock !== null && (bi.qty * newQty) > p.stock;
      });
      if (insufficientItem) {
        showToast(t('❌ الكمية المتوفرة من إحدى مواد الباقة غير كافية','❌ Not enough stock for a bundle item'), 'error');
        return;
      }
    } else {
      const product = products.find(x => x.id === item.id);
      if (product && product.stock !== undefined && product.stock !== null && newQty > product.stock) {
        showToast(t(`❌ الكمية المتوفرة: ${product.stock} فقط`,`❌ Only ${product.stock} in stock`), 'error');
        return;
      }
    }
  }

  item.qty = newQty;
  if (!item.isBundle) {
    const product = products.find(x => x.id === item.id);
    if (product) item.price = getEffectiveUnitPrice(product, item.qty);
  }
  updateCartUI();
}

function clearCart() {
  cart = [];
  window._myCredit = null; // يُعاد تحميل ائتمان العميل بعد كل طلب
  if (typeof dpClearCoupon === 'function') dpClearCoupon();
  updateCartUI();
  renderProducts();
}

function getTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

// يعيد تسعير بنود المقاسات التي عليها عرض كمية "على مجموع المقاسات" بعد أي تغيير في السلة
function repriceCartFamilyOffers() {
  cart.forEach(l => {
    if (l.isBundle || !l.parentId) return;
    const pr = products.find(x => x.id === l.id);
    if (!pr || getActiveQtyOffer(pr.id) || !getFamilyQtyOffer(pr)) return;
    l.price = getEffectiveUnitPrice(pr, l.qty); // يعتمد على مجموع قطع المقاسات المشمولة بكل شريحة
  });
}

function updateCartUI() {
  repriceCartFamilyOffers();
  saveCart();
  const count = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartItemsCount').textContent = `(${count})`;

  // نعرض المجموع الخام فورًا (بدون انتظار)، وبعدين نحدّثه بالخصم لو انطبق —
  // حتى ما تنتظر رسمة السلة كاملة (المنتجات + حالة الفراغ) أي طلب شبكة
  document.getElementById('cartTotal').innerHTML = `${fmtPrice(getTotal())} <small style="font-size:14px;font-weight:600">${t('د.أ','JD')}</small>`;
  refreshCartDiscountedTotal();
  updateFreeShippingBar();
  if (typeof renderCouponBox === 'function') renderCouponBox();

  const itemsDiv = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');

  if (!cart.length) {
    empty.style.display = 'block';
    // Remove any existing cart item elements
    itemsDiv.querySelectorAll('.cart-item').forEach(e => e.remove());
    return;
  }
  empty.style.display = 'none';
  itemsDiv.querySelectorAll('.cart-item').forEach(e => e.remove());
  // مقاسات المنتج الواحد بنفس السعر تظهر كمادة واحدة بجانبها المقاسات المختارة
  dpGroupSizeLines(cart, it => it.parentId).forEach(g => {
    if (g.parent) { itemsDiv.insertBefore(buildSizeGroupCartEl(g), empty); return; }
    const item = g.line;
    const el = document.createElement('div');
    el.className = 'cart-item';
    el.id = `cartItem-${item.id}`;
    const imgHtml = item.image
      ? `<img src="${cldOptimize(item.image,80)}" style="width:100%;height:100%;object-fit:contain" loading="lazy">`
      : item.icon;
    const bundleSubHtml = item.isBundle ? `
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
        ${item.bundleItems.map(bi => {
          const bp = products.find(x => x.id === bi.productId);
          return bp ? `${bp.icon} ${escHtml(currentLang==='en'?bp.en:bp.ar)} ×${bi.qty}` : '';
        }).join(' · ')}
      </div>` : '';
    const savingsHtml = (!item.isBundle && item.basePrice && item.price < item.basePrice)
      ? `<div style="font-size:11px;font-weight:800;color:var(--success)">🏷️ ${t('سعر عرض الكمية','Qty offer price')}</div>` : '';
    el.innerHTML = `
      <div class="cart-item-img">${imgHtml}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(currentLang==='en'?item.en:item.ar)}</div>
        ${bundleSubHtml}
        ${savingsHtml}
        <div class="cart-item-price">${fmtPrice((item.price*item.qty))} ${t('د.أ','JD')}</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${item.id}',-1)"><i class="fas fa-minus"></i></button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}',1)"><i class="fas fa-plus"></i></button>
          <button class="remove-item" onclick="removeFromCart('${item.id}')"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    itemsDiv.insertBefore(el, empty);
  });
}

function buildSizeGroupCartEl(g) {
  const parent = g.parent;
  const items = g.lines.map(x => x.line);
  const el = document.createElement('div');
  el.className = 'cart-item';
  el.id = `cartItem-g${parent.id}`;
  const img = parent.image || (items[0] && items[0].image);
  const imgHtml = img
    ? `<img src="${cldOptimize(img,80)}" style="width:100%;height:100%;object-fit:contain" loading="lazy">`
    : (parent.icon || (items[0] && items[0].icon) || '');
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const hasQtyOffer = items.some(i => i.basePrice && i.price < i.basePrice);
  const savingsHtml = hasQtyOffer
    ? `<div style="font-size:11px;font-weight:800;color:var(--success)">🏷️ ${t('سعر عرض الكمية','Qty offer price')}</div>` : '';
  const rows = items.map(i => `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
      <span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:12px;font-weight:700">${escHtml(i.sizeLabel || '')}</span>
      <div class="cart-item-controls" style="margin:0">
        <button class="qty-btn" onclick="changeQty('${i.id}',-1)"><i class="fas fa-minus"></i></button>
        <span class="qty-num">${i.qty}</span>
        <button class="qty-btn" onclick="changeQty('${i.id}',1)"><i class="fas fa-plus"></i></button>
        <button class="remove-item" onclick="removeFromCart('${i.id}')"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>`).join('');
  el.innerHTML = `
    <div class="cart-item-img">${imgHtml}</div>
    <div class="cart-item-info">
      <div class="cart-item-name">${escHtml(currentLang==='en' ? parent.en : parent.ar)}</div>
      ${savingsHtml}
      <div class="cart-item-price">${fmtPrice(total)} ${t('د.أ','JD')}</div>
      ${rows}
    </div>`;
  return el;
}

async function refreshCartDiscountedTotal() {
  if (!cart.length) return;
  const previewClientEmail = currentUser ? (currentUser.email || 'guest') : 'guest';
  const previewClientPhone = currentUser ? (currentUser.phone || '') : '';
  const total = getTotal();
  const discountPreview = await computeCartDiscountWithCoupon(cart, previewClientEmail, previewClientPhone);
  if (!discountPreview) return;
  if (getTotal() !== total) return;
  const el = document.getElementById('cartTotal');
  if (el) {
    el.innerHTML = `<span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;font-weight:600;margin-inline-end:6px">${fmtPrice(discountPreview.originalTotal)}</span>${fmtPrice(discountPreview.total)} <small style="font-size:14px;font-weight:600">${t('د.أ','JD')}</small> <small style="font-size:10px;color:#e53e3e;font-weight:800">(${t('خصم','off')} ${discountPreview.discountPercent}%)</small>`;
  }
}

// يحدد أجور التوصيل الواجب عرضها/اعتمادها: الإعداد العام (إن كان مفعّلاً) يُلغي أي تسعير خاص بالعميل
// ويطبَّق على الجميع، وإلا تُعتمد إعدادات العميل الخاصة إن وُجد، وإلا "غير محدد" لغير المسجلين.
async function computeCartDeliveryPreview(subtotal, phone, linkedClientOverride, opts) {
  // كود خصم بتوصيل مجاني (يُطلب فقط من مسار السلة عبر opts.coupon)
  if (opts && opts.coupon && typeof dpCouponGrantsFreeDelivery === 'function' && dpCouponGrantsFreeDelivery()) return { fee: 0, determined: true };
  const globalSettings = await loadGlobalDeliverySettings();
  if (globalSettings && globalSettings.discountEnabled) {
    const globalResult = computeGlobalDeliveryFee(globalSettings, subtotal);
    // الخصم العام له الأولوية بس فقط لو فعلاً انطبق (وصلت المشتريات للحد) —
    // إذا ما انطبق أي درجة، نكمل ونرجع نعتمد سعر التوصيل الخاص بالعميل بدل التوقف هون
    if (globalResult.determined) return globalResult;
  }

  let linkedClient = linkedClientOverride !== undefined ? linkedClientOverride : (currentUser || null);
  if (linkedClientOverride === undefined && !linkedClient && phone && typeof findRegisteredClientByPhone === 'function') {
    linkedClient = await findRegisteredClientByPhone(phone) || null;
  }
  if (linkedClient && linkedClient.uid) {
    const clientSettings = await loadClientDeliverySettings(linkedClient.uid);
    return computeDeliveryFee(clientSettings, subtotal);
  }
  return { fee: null, determined: false };
}

async function updateFreeShippingBar() {
  const wrap = document.getElementById('freeShipWrap');
  if (!wrap) return;
  if (!cart.length) { wrap.innerHTML = ''; return; }
  const subtotal = getTotal();
  const phoneInput = document.getElementById('phoneNumber');
  const phone = (!currentUser && phoneInput && phoneInput.value)
    ? formatPhoneForWhatsApp((document.getElementById('countryCode')?.value || '') + phoneInput.value)
    : null;
  const deliveryResult = await computeCartDeliveryPreview(subtotal, phone);
  if (getTotal() !== subtotal) return;
  wrap.innerHTML = deliveryLineHTML(deliveryResult.fee, deliveryResult.determined);
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartSidebar').classList.add('open');
}
function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartSidebar').classList.remove('open');
}

// =====================
// ORDER MODAL
// =====================

function setOrderGuestFieldsLocked(locked) {
  window._orderFieldsLocked = !!locked;
  // الرقم البديل غير مقفل أبداً: يمكن إضافته أو تعديله في كل طلب
  const alt = document.getElementById('altPhone');
  if (alt) { alt.readOnly = false; alt.style.background = ''; alt.style.cursor = ''; }
  // العنوان المكتوب وأزرار الموقع (موقعي الحالي، الخريطة، الكتابة) مفتوحة دائماً لهذا الطلب
  const addr = document.getElementById('addressInput');
  if (addr) { addr.readOnly = false; addr.style.background = ''; addr.style.cursor = ''; }
  ['clinicName','doctorName','phoneNumber'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = locked;
    el.disabled = false;
    el.style.background = locked ? '#f1f5f9' : '';
    el.style.cursor = locked ? 'not-allowed' : '';
  });
  const country = document.getElementById('countryCode');
  if (country) {
    country.disabled = locked;
    country.style.cursor = locked ? 'not-allowed' : '';
    country.style.pointerEvents = locked ? 'none' : ''; // ليصل النقر للعنصر الأب فنُظهر رسالة التنبيه
  }
}

async function autofillOrderClientByPhone() {
  const phoneEl = document.getElementById('phoneNumber');
  if (!phoneEl || typeof findRegisteredClientByPhone !== 'function') return null;
  const value = phoneEl.value.trim();
  if (normalizeClientPhone(value).length < 7) return null;
  const client = await findRegisteredClientByPhone(value);
  window._orderGuestResolvedClient = client || null;
  if (!client) {
    setOrderGuestFieldsLocked(false);
    return null;
  }
  document.getElementById('clinicName').value = client.clinic || '';
  document.getElementById('doctorName').value = client.name || '';
  document.getElementById('phoneNumber').value = client.phone || value;
  if (document.getElementById('altPhone')) document.getElementById('altPhone').value = client.altPhone || '';
  if (client.profileLocationText && document.getElementById('addressInput')) {
    document.getElementById('addressInput').value = client.profileLocationText;
  }
  if (client.profileLocationLat && client.profileLocationLng) {
    locationData.lat = client.profileLocationLat;
    locationData.lng = client.profileLocationLng;
    locationData.address = client.profileLocationText || `${client.profileLocationLat}, ${client.profileLocationLng}`;
    locationData.method = 'member-profile';
  }
  setOrderGuestFieldsLocked(true);
  showToast('✅ تم التعرف على العضو وتعبئة بياناته', 'success');
  return client;
}

function applyProfileLocationToOrder() {
  if (!currentUser) return;
  const hasCoords = currentUser.profileLocationLat && currentUser.profileLocationLng;
  const hasText   = currentUser.profileLocationText && currentUser.profileLocationText.trim();
  if (!hasCoords && !hasText) return;

  if (hasText) {
    document.getElementById('addressInput').value = currentUser.profileLocationText;
  }
  if (hasCoords) {
    locationData.lat = currentUser.profileLocationLat;
    locationData.lng = currentUser.profileLocationLng;
    showLocationOnMap(locationData.lat, locationData.lng);
  }
  locationData.address = hasText ? currentUser.profileLocationText
    : `${t('خط العرض','Lat')}: ${locationData.lat}, ${t('خط الطول','Lng')}: ${locationData.lng}`;
  locationData.method = hasCoords ? 'profile-map' : 'profile-manual';

  document.getElementById('locationConfirm').classList.add('show');
  document.getElementById('locationConfirmText').textContent =
    `✅ ${t('تم تعبئة الموقع من ملفك الشخصي، يمكنك تعديله','Location filled from your profile, you can edit it')}`;
  document.getElementById('locationError').classList.remove('show');
}

function openOrderModal() {
  if (!cart.length) { showToast(t('السلة فارغة!','Cart is empty!'), 'error'); return; }
  closeCart();
  currentStep = 1;
  orderSubmitted = false;
  window._autoFilledOnce = false;
  window._orderGuestResolvedClient = null;
  // مفتاح idempotency: يُولَّد مرة واحدة لكل طلب جديد (هنا)، ويبقى ثابتاً حتى لو
  // فشلت محاولة الإرسال وأعاد المستخدم الضغط على الزر — هذا هو معنى منع التكرار أصلاً.
  // نستخدم crypto.randomUUID عند توفرها (كل متصفح حديث عبر HTTPS)، وإلا بديل بسيط.
  window._currentOrderIdempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  setOrderGuestFieldsLocked(false);
  locationData = { lat: null, lng: null, address: '', method: '' };
  document.getElementById('locationConfirm').classList.remove('show');
  document.getElementById('mapPreview').classList.remove('located');
  document.getElementById('gpsLoading').classList.remove('show');
  ['clinicName','doctorName','phoneNumber','altPhone','addressInput','orderNotes'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.value=''; el.classList.remove('error'); }
  });
  document.getElementById('charCount').textContent = '0';
  document.getElementById('successScreen').classList.remove('show');
  document.getElementById('modalBody').querySelector('.modal-steps').style.display='flex';
  window._selectedPayMethod = 'money';
  applyProfileLocationToOrder();
  // الرقم البديل المحفوظ في الملف الشخصي يظهر مبدئياً، وما يكتبه العميل هنا يخص هذا الطلب فقط
  const _altEl = document.getElementById('altPhone');
  if (_altEl && getActiveClientSession() && currentUser.altPhone) _altEl.value = currentUser.altPhone;
  if (getActiveClientSession()) setOrderGuestFieldsLocked(true);
  // العميل المسجّل لا يحتاج إدخال بريد/كلمة مرور — تظهر هذه الخانات للزائر فقط
  const guestWrap = document.getElementById('guestAccountFieldsWrap');
  if (guestWrap) guestWrap.style.display = currentUser ? 'none' : '';
  renderModalStep();
  document.getElementById('orderModal').classList.add('open');
}
function closeOrderModal() {
  document.getElementById('orderModal').classList.remove('open');
}

function renderModalStep() {
  ['modalStep1','modalStep2','modalStep3','modalStep4','successScreen'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById(`modalStep${currentStep}`)?.style && (document.getElementById(`modalStep${currentStep}`).style.display = 'block');

  // Steps highlight
  for(let i=1;i<=4;i++){
    const s = document.getElementById(`step${i}`);
    s.classList.remove('active','done');
    if(i < currentStep) s.classList.add('done');
    else if(i === currentStep) s.classList.add('active');
  }

  // Buttons
  document.getElementById('btnBack').style.display = currentStep > 1 ? 'flex' : 'none';
  document.getElementById('btnNext').style.display = currentStep < 4 ? 'flex' : 'none';
  document.getElementById('btnSubmit').style.display = currentStep === 4 ? 'flex' : 'none';

  if (currentStep === 1) renderModalSummary();
  if (currentStep === 2) {
    const banner = document.getElementById('autoFillBanner');
    if (banner) banner.style.display = 'none';
    if (currentUser && currentUser.role === 'client' && !window._autoFilledOnce) {
      const cn = document.getElementById('clinicName');
      const dn = document.getElementById('doctorName');
      const ph = document.getElementById('phoneNumber');
      if (!cn.value && currentUser.clinic) cn.value = currentUser.clinic;
      if (!dn.value && currentUser.name)   dn.value = currentUser.name;
      if (!ph.value && currentUser.phone)  ph.value = currentUser.phone.replace(/^\+\d+/, '');
      window._autoFilledOnce = true;
    }
  }
  if (currentStep === 4) renderConfirmDetails();
}

async function renderModalSummary() {
  const div = document.getElementById('modalSummaryItems');

  const previewClientEmail = currentUser ? (currentUser.email || 'guest') : 'guest';
  const previewClientPhone = currentUser ? (currentUser.phone || '') : '';
  const guestPhoneInput = document.getElementById('phoneNumber');
  const previewPhoneForDelivery = currentUser
    ? previewClientPhone
    : (guestPhoneInput && guestPhoneInput.value
        ? formatPhoneForWhatsApp((document.getElementById('countryCode')?.value || '') + guestPhoneInput.value)
        : '');
  const discountPreview = await computeCartDiscountWithCoupon(cart, previewClientEmail, previewClientPhone);
  const subtotalForDelivery = discountPreview ? discountPreview.total : getTotal();
  const deliveryResult = await computeCartDeliveryPreview(subtotalForDelivery, previewPhoneForDelivery, currentUser || undefined, { coupon: true });
  const finalTotal = deliveryResult.determined ? subtotalForDelivery + (deliveryResult.fee || 0) : subtotalForDelivery;

  div.innerHTML = cart.map(item => `
    <div class="summary-item">
      <span>${escHtml(item.icon || '')} ${escHtml(currentLang==='en'?item.en:item.ar)} × ${item.qty}</span>
      <span>${fmtPrice((item.price*item.qty))} ${t('د.أ','JD')}</span>
    </div>
  `).join('') + `
    <div class="summary-item" style="font-weight:800;font-size:15px;color:var(--primary)">
      <span>${t('الإجمالي','Total')}</span>
      <span>
        ${discountPreview
          ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;font-weight:600;margin-inline-end:6px">${fmtPrice(discountPreview.originalTotal)} ${t('د.أ','JD')}</span>${fmtPrice(finalTotal)} ${t('د.أ','JD')} <span style="font-size:10px;color:#e53e3e;font-weight:800">(${t('خصم','off')} ${discountPreview.discountPercent}%)</span>`
          : `${fmtPrice(finalTotal)} ${t('د.أ','JD')}`}
        ${deliveryLineHTML(deliveryResult.fee, deliveryResult.determined)}
      </span>
    </div>`;
}

async function renderConfirmDetails() {
  const div = document.getElementById('confirmDetails');
  const notes = document.getElementById('orderNotes').value;

  const totalPoints = cart.reduce((s, i) => s + ((i.points || 0) * i.qty), 0);
  const hasAnyPoints = cart.some(i => i.points > 0);

  // معاينة الخصم العام (لو مفعّل ومطابق للعميل/الحد الأدنى) قبل الإرسال الفعلي
  const previewPhone = formatPhoneForWhatsApp(document.getElementById('countryCode').value + document.getElementById('phoneNumber').value);
  const previewMatchedClient = (!currentUser && typeof findRegisteredClientByPhone === 'function')
    ? await findRegisteredClientByPhone(previewPhone) : null;
  const previewLinkedClient = currentUser || previewMatchedClient || null;
  const previewClientEmail = previewLinkedClient ? (previewLinkedClient.email || 'guest') : 'guest';
  const previewClientPhone = previewLinkedClient ? (previewLinkedClient.phone || previewPhone) : previewPhone;
  const discountPreview = await computeCartDiscountWithCoupon(cart, previewClientEmail, previewClientPhone);
  const subtotalForDelivery = discountPreview ? discountPreview.total : getTotal();
  const deliveryResult = await computeCartDeliveryPreview(subtotalForDelivery, previewPhone, previewLinkedClient, { coupon: true });
  const finalTotalWithDelivery = deliveryResult.determined ? subtotalForDelivery + (deliveryResult.fee || 0) : subtotalForDelivery;

  let clientPoints = 0;
  if (currentUser && currentUser.role === 'client') {
    clientPoints = await getClientPoints(currentUser.uid);
  }

  const isClient     = currentUser?.role === 'client';
  // الذمم: نحمّل ائتمان العميل مرة (حدّه والمتبقي عليه) ليظهر خيار الدفع بالذمم إن كان مفعّلاً له
  if (isClient && (!window._myCredit || window._myCredit.uid !== currentUser.uid)) { await dpLoadMyCredit(); }
  const myCredit = isClient ? window._myCredit : null;
  const hasCredit = !!(myCredit && myCredit.enabled);
  const creditAvail = dpCreditAvailable(myCredit);
  const canPayCredit = hasCredit && finalTotalWithDelivery <= creditAvail;
  const canPayPoints = isClient && totalPoints > 0 && clientPoints >= totalPoints;
  const hasPoints    = isClient && totalPoints > 0;
  const someNoPoints = isClient && hasAnyPoints && cart.some(i => !i.points || i.points === 0);

  // إذا اختار الدفع بالنقاط وتغيرت المنتجات نعيد لدفع بالمال
  if (window._selectedPayMethod === 'points' && !canPayPoints) {
    window._selectedPayMethod = 'money';
  }
  if (window._selectedPayMethod === 'credit' && !canPayCredit) {
    window._selectedPayMethod = 'money';
  }

  div.innerHTML = `
    <div class="summary-item"><span>🏥 ${t('العيادة','Clinic')}</span><span>${escHtml(document.getElementById('clinicName').value)}</span></div>
    <div class="summary-item"><span>👨‍⚕️ ${t('الطبيب','Doctor')}</span><span>${escHtml(document.getElementById('doctorName').value)}</span></div>
    <div class="summary-item"><span>📞 ${t('الهاتف','Phone')}</span><span>${document.getElementById('countryCode').value} ${escHtml(document.getElementById('phoneNumber').value)}</span></div>
    <div class="summary-item"><span>📍 ${t('الموقع','Location')}</span><span style="max-width:200px;text-align:left">${escHtml(locationData.address || document.getElementById('addressInput').value)}</span></div>
    ${notes ? `<div class="summary-item"><span>🗒️ ${t('ملاحظات','Notes')}</span><span style="max-width:200px">${escHtml(notes)}</span></div>` : ''}

    <!-- ملخص المنتجات مع النقاط -->
    <div style="margin:12px 0;background:#f8fbfd;border-radius:10px;padding:12px">
      ${cart.map(i => `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px">
          <span>${escHtml(i.icon || '')} ${escHtml(currentLang==='en'?i.en:i.ar)} × ${i.qty}</span>
          <div style="text-align:left">
            <div style="font-weight:800;color:var(--primary)">${fmtPrice((i.price*i.qty))} ${t('د.أ','JD')}</div>
            ${i.points ? `<div style="font-size:11px;color:#d97706;font-weight:700">🏆 ${i.points * i.qty} نقطة</div>` : ''}
          </div>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding-top:10px;font-weight:900;font-size:15px;color:var(--primary)">
        <span>${t('الإجمالي','Total')}</span>
        <div style="text-align:left">
          <div>
            ${discountPreview
              ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;font-weight:600;margin-inline-end:6px">${fmtPrice(discountPreview.originalTotal)} ${t('د.أ','JD')}</span><span>${fmtPrice(finalTotalWithDelivery)} ${t('د.أ','JD')}</span> <span style="font-size:10px;color:#e53e3e;font-weight:800">(${t('خصم','off')} ${discountPreview.discountPercent}%)</span>`
              : `${fmtPrice(finalTotalWithDelivery)} ${t('د.أ','JD')}`}
          </div>
          ${deliveryLineHTML(deliveryResult.fee, deliveryResult.determined)}
          ${totalPoints > 0 ? `<div style="font-size:12px;color:#d97706;font-weight:700">🏆 ${totalPoints} نقطة مطلوبة</div>` : ''}
        </div>
      </div>
    </div>

    <!-- طريقة الدفع -->
    <div style="margin-top:20px">
      <div style="font-weight:800;font-size:14px;color:var(--primary-dark);margin-bottom:12px">
        <i class="fas fa-credit-card" style="color:var(--primary-light)"></i>
        ${t('طريقة الدفع','Payment Method')}
      </div>

      ${isClient ? `
      <div class="points-balance-box">
        <span class="points-balance-label">🏆 ${t('رصيد نقاطك','Your Points Balance')}</span>
        <span class="points-balance-num">${clientPoints} ${t('نقطة','pts')}</span>
      </div>` : ''}

      <div class="pay-method-wrap">
        <button class="pay-method-btn ${window._selectedPayMethod==='money'?'active':''}"
          onclick="selectPayMethod('money')">
          <span class="pay-method-icon">💵</span>
          <div class="pay-method-label">${t('الدفع بالمال','Pay with Money')}</div>
          <div class="pay-method-sub">${fmtPrice(finalTotalWithDelivery)} ${t('د.أ','JD')}</div>
        </button>

        ${isClient && hasPoints ? `
        <button class="pay-method-btn points-btn
          ${window._selectedPayMethod==='points'?'active':''}
          ${!canPayPoints?'disabled':''}"
          onclick="${canPayPoints ? "selectPayMethod('points')" : 'void(0)'}">
          <span class="pay-method-icon">🏆</span>
          <div class="pay-method-label">${t('الدفع بالنقاط','Pay with Points')}</div>
          <div class="pay-method-sub">
            ${totalPoints} ${t('نقطة مطلوبة','pts needed')}
            ${someNoPoints ? ` + ${fmtPrice(cart.filter(i => !i.points || i.points===0).reduce((s,i)=>s+i.price*i.qty,0))} ${t('د.أ','JD')}` : ''}
          </div>
        </button>` : ''}

        ${hasCredit ? `
        <button class="pay-method-btn ${window._selectedPayMethod==='credit'?'active':''} ${!canPayCredit?'disabled':''}"
          ${!canPayCredit ? 'disabled' : ''}
          onclick="${canPayCredit ? "selectPayMethod('credit')" : 'void(0)'}">
          <span class="pay-method-icon">🧾</span>
          <div class="pay-method-label">${t('الدفع بالذمم', 'Pay on credit')}</div>
          <div class="pay-method-sub">${t('المتاح', 'Available')}: ${fmtPrice(creditAvail)} ${t('د.أ','JD')}</div>
        </button>` : ''}
      </div>

      ${hasCredit && !canPayCredit ? `
      <div class="points-insufficient">
        <i class="fas fa-exclamation-circle"></i>
        ${t('رصيدك المتاح في الذمم', 'Your available credit')} (${fmtPrice(creditAvail)} ${t('د.أ','JD')}) ${t('لا يكفي لهذا الطلب', 'is not enough for this order')}
      </div>` : ''}

      ${isClient && hasPoints && !canPayPoints ? `
      <div class="points-insufficient">
        <i class="fas fa-exclamation-circle"></i>
        ${t('نقاطك','Your points')} (${clientPoints}) ${t('أقل من المطلوب','less than required')} (${totalPoints} ${t('نقطة','pts')})
      </div>` : ''}

      ${isClient && window._selectedPayMethod === 'points' && someNoPoints ? `
      <div style="margin-top:10px;padding:10px 14px;background:#fffbeb;border:1.5px solid #f59e0b;
                  border-radius:var(--radius-sm);font-size:13px;color:#92400e;font-weight:600;
                  display:flex;align-items:center;gap:8px">
        <i class="fas fa-info-circle"></i>
        ${t('بعض المنتجات في سلتك لا تدعم الشراء بالنقاط، وسيُضاف سعرها نقداً للفاتورة','Some cart items do not support points payment and will be charged in cash')}
      </div>` : ''}

      ${!isClient ? `
      <div style="padding:12px 14px;background:#f0f8ff;border-radius:var(--radius-sm);
                  font-size:13px;color:var(--primary);font-weight:600;
                  display:flex;align-items:center;gap:8px;border:1.5px solid var(--border)">
        <i class="fas fa-info-circle"></i>
        ${t('سجّل دخولك للاستفادة من نظام النقاط','Login to use the points system')}
      </div>` : ''}
    </div>`;
}

function selectPayMethod(method) {
  window._selectedPayMethod = method;
  renderConfirmDetails();
}

async function nextStep() {
  if (!validateStep(currentStep)) return;

  // خطوة "بياناتك": لو زائر جديد كلياً (مو مسجّل دخول، ومافي تطابق برقم هاتفه)، ننشئ له حساب فعلي الآن
  if (currentStep === 2 && !currentUser) {
    const phone = document.getElementById('phoneNumber').value.trim();
    let matched = null;
    if (typeof findRegisteredClientByPhone === 'function') {
      matched = await findRegisteredClientByPhone(phone);
    }
    window._guestResolvedClient = matched;

    if (!matched) {
      const doctor = document.getElementById('doctorName').value.trim();
      const clinic = document.getElementById('clinicName').value.trim();
      const email = document.getElementById('guestEmail').value;
      const password = document.getElementById('guestPassword').value;
      const passwordConfirm = document.getElementById('guestPasswordConfirm').value;
      const result = await createGuestAccountIfNeeded(email, password, passwordConfirm, doctor, clinic, phone);
      if (!result.ok) {
        document.getElementById('guestPasswordError').classList.add('show');
        document.getElementById('guestPasswordError').querySelector('span').textContent = result.message;
        return;
      }
    }
  }

  if (currentStep < 4) { currentStep++; renderModalStep(); }
}
function prevStep() {
  if (currentStep > 1) { currentStep--; renderModalStep(); }
}

function validateStep(step) {
  if (step === 2) {
    let ok = true;
    const cn = document.getElementById('clinicName');
    const dn = document.getElementById('doctorName');
    const ph = document.getElementById('phoneNumber');
    if (!cn.value.trim()) { cn.classList.add('error'); document.getElementById('clinicNameError').classList.add('show'); ok=false; }
    else { cn.classList.remove('error'); document.getElementById('clinicNameError').classList.remove('show'); }
    if (!dn.value.trim()) { dn.classList.add('error'); document.getElementById('doctorNameError').classList.add('show'); ok=false; }
    else { dn.classList.remove('error'); document.getElementById('doctorNameError').classList.remove('show'); }
    const phoneVal = ph.value.replace(/\s/g,'');
    if (!phoneVal || phoneVal.length < 7) { ph.classList.add('error'); document.getElementById('phoneError').classList.add('show'); ok=false; }
    else { ph.classList.remove('error'); document.getElementById('phoneError').classList.remove('show'); }
    return ok;
  }
  if (step === 3) {
    const addr = document.getElementById('addressInput').value.trim();
    const hasLocation = locationData.lat || addr;
    if (!hasLocation) {
      document.getElementById('locationError').classList.add('show');
      return false;
    }
    document.getElementById('locationError').classList.remove('show');
    return true;
  }
  return true;
}

// =====================

// ===== تنبيه عند الضغط على حقل مقفل (العيادة، الطبيب، الهاتف، رمز الدولة) في نافذة الطلب للعميل المعروف =====
var _orderLockNoticeAt = 0;
function showOrderLockedNotice() {
  const now = Date.now();
  if (now - _orderLockNoticeAt < 2500) return; // لا نكرر الرسالة مع كل نقرة متتالية
  _orderLockNoticeAt = now;
  showToast('🔒 ' + t(
    'لا يمكن التعديل إلا من صفحة تعديل الملف الشخصي، باستثناء الرقم البديل: يمكنك إضافته أو تعديله في كل مرة',
    'This can only be edited from your profile page, except the alternate number, which you can add or change each time'
  ), 'info');
}

(function initOrderLockNotices() {
  const modal = document.getElementById('orderModal');
  if (!modal || modal._lockNoticesBound) return;
  modal._lockNoticesBound = true;
  const lockedIds = ['clinicName', 'doctorName', 'phoneNumber'];

  modal.addEventListener('click', function (e) {
    if (!window._orderFieldsLocked) return;
    const target = e.target;
    const cc = document.getElementById('countryCode');
    const onLockedField = lockedIds.includes(target.id) ||
      (cc && (target === cc || (cc.parentElement && target === cc.parentElement)));
    if (onLockedField) showOrderLockedNotice();
  }, true);
})();
