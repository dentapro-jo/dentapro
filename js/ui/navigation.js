// DentaPro domain module: extracted from the original implementation.
// CATEGORY MANAGEMENT
// =====================
function openAddCategory() {
  document.getElementById('catFormTitle').innerHTML = '<i class="fas fa-folder-plus"></i> إضافة قسم جديد';
  document.getElementById('catNameAr').value = '';
  document.getElementById('catNameEn').value = '';
  document.getElementById('catId').value     = '';
  document.getElementById('catId').disabled  = false;
  document.getElementById('editCatId').value = '';
  document.getElementById('catFormError').style.display = 'none';
  resetCatImageUpload();
  renderCurrentCatList();
  document.getElementById('addCategoryModal').classList.add('open');
}

function closeAddCategory() {
  document.getElementById('addCategoryModal').classList.remove('open');
}

function renderCurrentCatList() {
  const list = document.getElementById('catCurrentList');
  // استثنِ "الكل"
  const filtered = categories.filter(c => c.id !== 'all');
  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:12px">لا توجد أقسام</div>`;
    return;
  }
  list.innerHTML = filtered.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:10px 14px;background:#f8fbfd;border-radius:10px;
                border:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        ${c.image
          ? `<img src="${escHtml(cldOptimize(c.image, 64))}" style="width:32px;height:32px;border-radius:8px;object-fit:cover" loading="lazy" decoding="async">`
          : `<span style="font-size:22px">${escHtml(c.icon || '📁')}</span>`}
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--primary-dark)">${escHtml(c.ar)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escHtml(c.en)} · ID: ${escHtml(c.id)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="editCategory('${escJsAttr(c.id)}')"
          style="padding:5px 12px;border-radius:50px;background:#e8f3fb;color:var(--primary);
                 border:none;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fas fa-edit"></i>
        </button>
        ${c.id === 'students' ? '<span style="font-size:11px;color:var(--text-muted);align-self:center">تلقائي</span>' : `<button onclick="deleteCategory('${escJsAttr(c.id)}')"
          style="padding:5px 12px;border-radius:50px;background:#fff5f5;color:var(--danger);
                 border:none;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fas fa-trash-alt"></i>
        </button>`}
      </div>
    </div>`).join('');
}

function editCategory(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;
  document.getElementById('catFormTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل القسم';
  document.getElementById('catNameAr').value = c.ar;
  document.getElementById('catNameEn').value = c.en;
  document.getElementById('catId').value     = c.id;
  document.getElementById('catId').disabled  = true;
  document.getElementById('editCatId').value = c.id;
  document.getElementById('catFormError').style.display = 'none';
  loadCatImagePreview(c.image || null);
}

function deleteCategory(id) {
  if (id === 'students') {
    document.getElementById('catFormErrorMsg').textContent = 'قسم الطلاب يُدار تلقائياً من خيار "قسم الطلاب" داخل المنتج، ولا يُحذف يدوياً';
    document.getElementById('catFormError').style.display = 'flex';
    return;
  }
  const inUse = products.some(p => p.cat === id);
  if (inUse) {
    document.getElementById('catFormErrorMsg').textContent = 'لا يمكن حذف قسم يحتوي على منتجات';
    document.getElementById('catFormError').style.display = 'flex';
    return;
  }
  const idx = categories.findIndex(c => c.id === id);
  if (idx !== -1) categories.splice(idx, 1);
  saveCategories();

  renderCurrentCatList();
  renderCategories();
  populateCategorySelects();
  renderProducts();
  showToast('🗑️ تم حذف القسم بنجاح', 'success');
}
function saveCategory() {
  const ar   = document.getElementById('catNameAr').value.trim();
  const en   = document.getElementById('catNameEn').value.trim();
  const id   = document.getElementById('catId').value.trim().toLowerCase().replace(/\s/g,'');
  const editId = document.getElementById('editCatId').value;
  const image = currentCategoryImage || null;

  const showErr = (msg) => {
    document.getElementById('catFormErrorMsg').textContent = msg;
    document.getElementById('catFormError').style.display = 'flex';
  };

  if (!ar || !en || !id) return showErr('يرجى ملء جميع الحقول المطلوبة');
  if (!/^[a-z0-9]+$/.test(id)) return showErr('المعرّف يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام فقط');

  if (editId) {
    const idx = categories.findIndex(c => c.id === editId);
    if (idx !== -1) { categories[idx] = { ...categories[idx], ar, en, image }; }
    saveCategories();
    document.getElementById('catFormError').style.display = 'none';
    document.getElementById('editCatId').value = '';
    document.getElementById('catId').disabled  = false;
    document.getElementById('catNameAr').value = '';
    document.getElementById('catNameEn').value = '';
    document.getElementById('catId').value     = '';
    resetCatImageUpload();
    document.getElementById('catFormTitle').innerHTML = '<i class="fas fa-folder-plus"></i> إضافة قسم جديد';
    renderCurrentCatList();
    renderCategories();
    populateCategorySelects();
    renderProducts();
    closeAddCategory();
    showToast('✅ تم تعديل القسم بنجاح', 'success');
  } else {
    if (categories.find(c => c.id === id)) return showErr('هذا المعرّف مستخدم مسبقاً');
    categories.push({ id, icon: '📁', image, ar, en });
    const pCat = document.getElementById('pCat');
    const aCat = document.getElementById('adminCatFilter');
    const newOpt = new Option(ar, id);
    pCat.add(newOpt.cloneNode(true));
    aCat.add(new Option(ar, id));
    saveCategories();
    document.getElementById('catFormError').style.display = 'none';
    document.getElementById('editCatId').value = '';
    document.getElementById('catId').disabled  = false;
    document.getElementById('catNameAr').value = '';
    document.getElementById('catNameEn').value = '';
    document.getElementById('catId').value     = '';
    resetCatImageUpload();
    document.getElementById('catFormTitle').innerHTML = '<i class="fas fa-folder-plus"></i> إضافة قسم جديد';
    renderCurrentCatList();
    renderCategories();
    populateCategorySelects();
    renderProducts();
    closeAddCategory();
    showToast('✅ تم إضافة القسم بنجاح', 'success');
  }
}

// =====================
// XSS PROTECTION
// =====================
function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// Escape a value for a single-quoted JavaScript string inside an HTML attribute.
function escJsAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'");
}

// =====================
// TOAST
// =====================
function showToast(msg, type='', opts) {
  const center = !!(opts && opts.center);
  let container = document.getElementById('toastContainer');
  if (center) {
    // إشعار وسط الشاشة (مثل "أُضيف للسلة") بدل أسفلها
    container = document.getElementById('toastCenterContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastCenterContainer';
      container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;max-width:90vw';
      document.body.appendChild(container);
    }
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  if (center) toast.style.animation = 'none';
  toast.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'exclamation-circle':'info-circle'}"></i> ${escHtml(msg)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity='0';
    toast.style.transform = center ? 'scale(.9)' : 'translateX(40px)';
    setTimeout(()=>toast.remove(),300);
  }, center ? 1600 : 3000);
}

function openQuickView(id) {
  window.lastViewedProductId = id;
  const p = products.find(x => x.id === id);
  if (!p) return;
  const body = document.getElementById('quickViewBody');
  body.innerHTML = `
    <img src="${escHtml(cldOptimize(p.image || '', 600))}" alt="${escHtml(p.ar)}" onerror="this.style.display='none'">
    <div>
      <div style="font-size:18px;font-weight:900;margin-bottom:6px">${escHtml(p.en)}</div>
      <div style="color:var(--text-muted);line-height:1.8">${escHtml(currentLang==='en'?p.desc_en:p.desc_ar)}</div>
      <div style="margin-top:14px;font-size:20px;font-weight:900;color:var(--primary)">${fmtPrice(p.price)} ${t('د.أ','JD')}</div>
      <button class="btn-primary" style="margin-top:14px;width:100%" onclick="addToCart(${p.id});closeQuickView()">${t('أضف للسلة','Add to cart')}</button>
    </div>`;
  document.getElementById('quickViewModal').classList.add('open');
}
function closeQuickView(){ document.getElementById('quickViewModal').classList.remove('open'); }

var _voiceRec = null;
var _voiceActive = false;

function initVoiceSearch() {
  const search = document.getElementById('searchInput');
  if (!search || document.getElementById('voiceSearchBtn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'voice-search-btn';
  btn.id = 'voiceSearchBtn';
  btn.innerHTML = '<i class="fas fa-microphone"></i>';
  btn.onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showToast(t('المتصفح لا يدعم البحث الصوتي','Voice search is not supported'), 'error');
    // منع تشغيل نسخة ثانية أثناء وجود نسخة شغّالة أصلاً (السبب الشائع لخطأ aborted)
    if (_voiceActive) { try { _voiceRec.stop(); } catch(e) {} return; }
    const rec = new SR();
    _voiceRec = rec;
    rec.lang = currentLang === 'en' ? 'en-US' : 'ar-JO';
    rec.onresult = e => { search.value = e.results[0][0].transcript; search.dispatchEvent(new Event('input', {bubbles:true})); };
    rec.onstart = () => { _voiceActive = true; btn.classList.add('listening'); };
    rec.onend = () => { _voiceActive = false; btn.classList.remove('listening'); };
    rec.onerror = (e) => {
      _voiceActive = false;
      console.warn('⚠️ خطأ البحث الصوتي:', e.error);
      const messages = {
        'not-allowed': t('الرجاء السماح باستخدام الميكروفون','Please allow microphone access'),
        'service-not-allowed': t('خدمة البحث الصوتي غير متاحة حاليًا','Voice service unavailable'),
        'no-speech': t('لم يتم رصد أي صوت','No speech detected'),
        'audio-capture': t('تعذّر الوصول للميكروفون','Microphone unavailable'),
        'network': t('تحقق من اتصال الإنترنت','Check your internet connection'),
        'aborted': t('تم إيقاف التسجيل، حاول مجددًا','Recording stopped, try again'),
      };
      showToast(messages[e.error] || (t('تعذّر تشغيل البحث الصوتي','Unable to start voice search') + ' (' + e.error + ')'), 'error');
    };
    try {
      rec.start();
    } catch(e) {
      _voiceActive = false;
      console.warn('⚠️ فشل بدء التسجيل:', e.message);
    }
  };
  search.parentElement.appendChild(btn);
}

function updateBottomNav(page) {
  document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  // Reflect active state on the fixed bottom nav as well
  const bottomNav = document.getElementById('bottomNavBar');
  if(bottomNav) bottomNav.classList.add('visible');
}

function updateBottomNavStateFromSection() {
  const active = document.querySelector('.page-section.active')?.id || 'homePage';
  const map = { homePage:'home', cartPage:'cart', ordersPage:'orders', favoritesPage:'orders', productDetailPage:'home', comparePage:'home' };
  updateBottomNav(map[active] || 'home');
}

function hookBottomNavIntoPageChanges() {
  const origShowPage = window.showPage;
  window.showPage = function(page, ...rest) {
    const r = origShowPage.apply(this, [page, ...rest]);
    setTimeout(updateBottomNavStateFromSection, 0);
    return r;
  };
  const origOpenProductDetail = window.openProductDetail;
  window.openProductDetail = function(...args) {
    const r = origOpenProductDetail.apply(this, args);
    setTimeout(() => updateBottomNav('home'), 0);
    return r;
  };
}

function setupScrollHideBottomNav() {
  const nav = document.getElementById('bottomNavBar');
  if (!nav) return;
  let lastY = window.scrollY;
  let accum = 0;
  window.addEventListener('scroll', () => {
    if (window.innerWidth >= 768) return;
    const y = window.scrollY;
    const delta = y - lastY;
    // تغيّر الاتجاه فعلياً → نصفّر التراكم ونبلش نحسب من جديد
    if ((delta > 0 && accum < 0) || (delta < 0 && accum > 0)) accum = 0;
    accum += delta;
    if (accum > 24 && y > 100) { nav.classList.add('hidden'); accum = 0; }
    else if (accum < -24) { nav.classList.remove('hidden'); accum = 0; }
    lastY = y;
  }, {passive:true});
}

function initProductZoom() {
  document.addEventListener('mousemove', e => {
    const wrap = document.getElementById('pdImageWrap');
    const img = document.getElementById('pdMainImg');
    if (!wrap || !img || !wrap.contains(e.target) || window.innerWidth < 768) return;
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    img.style.transformOrigin = `${x*100}% ${y*100}%`;
    img.style.transform = 'scale(1.35)';
  });
  document.addEventListener('mouseleave', () => {
    const img = document.getElementById('pdMainImg');
    if (img) img.style.transform = 'scale(1)';
  }, true);
}

function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight; canvas.style.display = 'block';
  const pieces = Array.from({length:140}, () => ({x:Math.random()*canvas.width,y:-20,vx:(Math.random()-.5)*6,vy:Math.random()*6+3,r:Math.random()*6+3,c:`hsl(${Math.random()*360},90%,60%)`,rot:Math.random()*360}));
  const step = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .12; p.rot += p.vx; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180); ctx.fillStyle=p.c; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.5); ctx.restore(); });
    if (pieces.some(p => p.y < canvas.height + 30)) requestAnimationFrame(step); else canvas.style.display = 'none';
  };
  step();
}
var _tickerRAF = null;
var _tickerPaused = false;

async function initOffersTicker() {
  const ticker = document.getElementById('offersTicker');
  const track = document.getElementById('offersTickerTrack');
  if (!ticker || !track) return;

  // نلغي أي حركة سابقة قبل إعادة البناء، لمنع تراكب أكثر من حركة بنفس الوقت
  if (_tickerRAF) { cancelAnimationFrame(_tickerRAF); _tickerRAF = null; }

  const items = [];
  const qtyProducts = await getActiveQtyOfferProducts();
  qtyProducts.forEach(p => {
    const offer = getActiveQtyOffer(p.id);
    if (offer && offer.tiers && offer.tiers.length) {
      const tiersText = buildQtyOfferTiersText(p, offer);
      items.push(`<div class="offers-ticker-item" onclick="openProductDetail(${p.id})">
        <i class="fas fa-tags"></i>
        <span>${t('عرض كمية','Qty offer')}: ${escHtml(p.en)} — ${tiersText}</span>
      </div>`);
    }
  });
  offers.filter(o => o.type === 'text' && o.active && !isOfferExpired(o)).forEach(o => {
    items.push(`<div class="offers-ticker-item">
      <i class="fas fa-bullhorn"></i>
      <span>${escHtml(currentLang==='en' ? (o.textEn || o.text) : o.text)}</span>
    </div>`);
  });
  getActiveBundles().forEach(b => {
    const original = getBundleOriginalPrice(b);
    const price = b.bundlePrice || 0;
    const save = original - price;
    items.push(`<div class="offers-ticker-item" onclick="openBundleDetail(${b.id})">
      <i class="fas fa-box-open"></i>
      <span>${t('باقة','Bundle')}: ${escHtml(currentLang==='en'?b.name_en:b.name_ar)} — ${t('بسعر','for')} ${fmtPrice(price)} ${t('د.أ','JD')} ${t('بدلاً من','instead of')} ${fmtPrice(original)} ${t('د.أ','JD')}</span>
    </div>`);
  });

  if (!items.length) {
    ticker.style.display = 'none';
    const spacer = document.getElementById('tickerSpacer');
    if (spacer) spacer.style.height = '0';
    return;
  }

  const MIN_ITEMS = 6;
  let repeated = [...items];
  while (repeated.length < MIN_ITEMS) repeated = repeated.concat(items);

  // تحريك مباشر عبر JS بدل الاعتماد على حركة CSS التلقائية — تحكم كامل بالموضع كل لحظة،
  // بدون أي احتمال "قفزة" أو اختفاء مفاجئ عند إعادة اللف
  track.style.animation = 'none';
  track.innerHTML = repeated.join('') + repeated.join('');
  ticker.style.display = 'block';
  const updateSpacerHeight = () => {
    const spacer = document.getElementById('tickerSpacer');
    if (spacer) spacer.style.height = ticker.offsetHeight + 'px';
  };
  requestAnimationFrame(updateSpacerHeight);
  // إعادة الحساب بعد لحظة إضافية لضمان دقة الارتفاع حتى لو تأخر تخطيط الهيدر (position:sticky)
  setTimeout(updateSpacerHeight, 150);

  requestAnimationFrame(() => runTickerLoop(ticker, track));
}

function runTickerLoop(ticker, track) {
  const PIXELS_PER_SECOND = 55;
  const isEn = currentLang === 'en';
  let pos = 0;
  let lastTime = null;
  _tickerPaused = false;

  ticker.onmouseenter = () => { _tickerPaused = true; };
  ticker.onmouseleave = () => { _tickerPaused = false; };

  // pos is stored in the ticker's logical coordinate system.
  // Convert it to the physical CSS transform only here.
  function getPhysicalX(value) {
    return isEn ? -value : value;
  }

  function applyTransform() {
    track.style.transform = `translateX(${getPhysicalX(pos)}px)`;
  }

  // ===== سحب الشريط بالإصبع =====
  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let dragStartPhysicalX = 0;
  let dragMoved = false;

  ticker.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;

    dragging = true;
    _tickerPaused = true;
    dragMoved = false;
    dragStartX = e.touches[0].clientX;
    dragStartPos = pos;
    dragStartPhysicalX = getPhysicalX(pos);
  }, { passive: true });

  ticker.addEventListener('touchmove', (e) => {
    if (!dragging || !e.touches || !e.touches.length) return;

    const dx = e.touches[0].clientX - dragStartX;
    if (Math.abs(dx) > 4) dragMoved = true;

    const halfWidth = track.scrollWidth / 2;
    if (halfWidth <= 0) return;

    // Move the rendered track by exactly the same physical delta as the finger.
    // Therefore a right-to-left finger movement (negative dx) is always
    // rendered as a leftward movement, including in RTL mode.
    const physicalX = dragStartPhysicalX + dx;
    track.style.transform = `translateX(${physicalX}px)`;

    // Keep the logical position synchronized for autoplay after release.
    pos = isEn ? -physicalX : physicalX;

    if (Math.abs(dx) > 8 && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });

  const endDrag = () => {
    if (!dragging) return;

    dragging = false;
    _tickerPaused = false;

    // Normalize only after the finger is released, never during the drag.
    const halfWidth = track.scrollWidth / 2;
    if (halfWidth > 0) {
      pos = ((pos % halfWidth) + halfWidth) % halfWidth;
      applyTransform();
    }

    if (dragMoved) {
      // إن كانت سحبًا فعليًا، نمنع نقرة الفتح العرضية التي قد تلي الإفلات
      const suppressClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        ticker.removeEventListener('click', suppressClick, true);
      };
      ticker.addEventListener('click', suppressClick, true);
    }
  };

  ticker.addEventListener('touchend', endDrag, { passive: true });
  ticker.addEventListener('touchcancel', endDrag, { passive: true });

  function step(time) {
    if (lastTime === null) lastTime = time;
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    const halfWidth = track.scrollWidth / 2;
    if (halfWidth > 0 && !_tickerPaused) {
      pos += PIXELS_PER_SECOND * dt;
      if (pos >= halfWidth) pos -= halfWidth;
      applyTransform();
    }

    _tickerRAF = requestAnimationFrame(step);
  }

  _tickerRAF = requestAnimationFrame(step);
}
function setupReorderButtons() {
  const body = document.getElementById('clientOrdersList');
  if (!body) return;

  // منع إنشاء أكثر من MutationObserver لنفس القائمة.
  if (body._reorderObserver) body._reorderObserver.disconnect();

  let isUpdating = false;
  const addReorderButtons = () => {
    if (isUpdating) return;
    isUpdating = true;
    try {
      body.querySelectorAll('[data-order-id]').forEach(card => {
        if (card.querySelector('.reorder-btn')) return;
        const order = (window._cachedOrders || []).find(o => String(o._docId || o.id) === String(card.dataset.orderId));
        if (!order) return;
        const btn = document.createElement('button');
        btn.className = 'reorder-btn btn-primary';
        btn.style.marginTop = '12px';
        btn.innerHTML = `<i class="fas fa-redo"></i> ${t('إعادة الطلب','Reorder')}`;
        btn.onclick = () => {
          (order.items || []).forEach(item => {
            const p = products.find(x => String(x.id) === String(item.id));
            if (!p) return;
            const existing = cart.find(x => String(x.id) === String(p.id));
            if (!existing) cart.push({...p, qty: item.qty || 1, basePrice: p.price, price: p.price});
            else existing.qty += item.qty || 1;
          });
          updateCartUI();
          showToast(t('تمت إضافة عناصر الطلب إلى السلة','Order items added to cart'),'success');
        };
        card.appendChild(btn);
      });
    } finally {
      isUpdating = false;
    }
  };

  addReorderButtons();

  const mo = new MutationObserver(mutations => {
    const hasRelevantChanges = mutations.some(mutation => {
      if (mutation.type !== 'childList') return false;
      const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
      return nodes.some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return true;
        if (node.classList && node.classList.contains('reorder-btn')) return false;
        if (node.querySelector && node.querySelector('.reorder-btn')) return false;
        return true;
      });
    });
    if (hasRelevantChanges) addReorderButtons();
  });

  mo.observe(body, {childList: true, subtree: true});
  body._reorderObserver = mo;
}

function enhanceQuickViewAndReorder() {
  initVoiceSearch();
  setupScrollHideBottomNav();
  // No auto-popups or daily-deal banners
  initProductZoom();
  setupReorderButtons();
  hookBottomNavIntoPageChanges();
  updateBottomNavStateFromSection();
  // Reflect cart count on bottom nav badge
  const syncBadge = () => {
    const badge = document.getElementById('bottomNavCartBadge');
    const count = cart.reduce((s,i)=>s+i.qty,0);
    if(badge){ badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  };
  const origUpdateCartUI = window.updateCartUI;
  window.updateCartUI = function(){
    const r = origUpdateCartUI.apply(this, arguments);
    syncBadge();
    return r;
  };
  syncBadge();
  setTimeout(() => { if (document.getElementById('successScreen')?.classList.contains('show')) triggerConfetti(); }, 500);
  const success = document.getElementById('successScreen');
  if (success) new MutationObserver(() => { if (success.classList.contains('show')) triggerConfetti(); }).observe(success, {attributes:true, attributeFilter:['class']});
}

// =====================
// OFFLINE / ONLINE BANNER
// =====================
function updateOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.classList.remove('show');
  } else {
    banner.classList.add('show');
  }
}

window.addEventListener('online', () => {
  updateOfflineBanner();
  showToast('✅ تم استعادة الاتصال بالإنترنت', 'success');
});
window.addEventListener('offline', () => {
  updateOfflineBanner();
  showToast('📡 انقطع الاتصال بالإنترنت', 'error');
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateOfflineBanner, { once: true });
} else {
  updateOfflineBanner();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceQuickViewAndReorder);
} else {
  enhanceQuickViewAndReorder();
}
// =====================
// HELPERS
// =====================
function scrollToProducts() {
  document.getElementById('productsSection').scrollIntoView({behavior:'smooth', block:'start'});
}

function scrollToProductImage() {
  const el = document.getElementById('pdImageWrap');
  if (!el) { window.scrollTo(0, 0); return; }
  const header = document.querySelector('header');
  const headerH = header ? header.offsetHeight : 0;
  const y = el.getBoundingClientRect().top + window.scrollY - headerH - 8;
  window.scrollTo(0, Math.max(0, y));
}
async function sendContactMessage() {
  const name = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const message = document.getElementById('contactMessage').value.trim();

  if (!name || !email || !message) {
    showToast('❌ يرجى ملء جميع الحقول', 'error');
    return;
  }

  try {
    if (window._fbAddDoc && window._fbCollection && window._db) {
      await window._fbAddDoc(window._fbCollection(window._db, 'contact_messages'), {
        name, email, message, createdAt: new Date().toISOString()
      });
    }
    showToast('✅ تم إرسال رسالتك بنجاح، سنتواصل معك قريبًا', 'success');
    document.getElementById('contactName').value = '';
    document.getElementById('contactEmail').value = '';
    document.getElementById('contactMessage').value = '';
  } catch (e) {
    console.error(e);
    showToast('❌ فشل إرسال الرسالة، تحقق من الاتصال', 'error');
  }
}
// =====================
// PAGE NAVIGATION HISTORY (لدعم زر الرجوع في WebView)
// =====================
var pageHistory = ['home'];
var isBackNavigation = false;
var _homeGuardArmed = false;
var _exitWarningShown = false;
var _exitWarningTimer = null;

// ============================================================
// [جديد] مكدّس طبقات واجهة المستخدم (مودالات / سلة / لوحة تحكم / إشعارات)
// الفكرة: أي عنصر من هذه الأنواع يُكتشف تلقائياً عند فتحه أو إغلاقه
// (عبر MutationObserver) بدون الحاجة لتعديل أي دالة open*/close* موجودة.
// كل فتح يُسجَّل كـ "طبقة" فوق حالة History الحالية، وزر الرجوع
// يغلق الطبقة الأعلى فقط بدل الانتقال بين الصفحات أو إغلاق التطبيق.
// ============================================================
var uiLayerStack = [];          // {id, el} لكل طبقة مفتوحة حالياً، بترتيب الفتح
var _pendingHistoryCleanup = false; // يمنع أي popstate ناتج عن تنظيفنا التلقائي للسجل من التسبب بتنقل غير مقصود
var _pendingNotificationPage = null; // وجهة إشعار تنتظر انتهاء تنظيف سجل القائمة

// المودالات الثابتة الموجودة أصلاً بالـ HTML (تُغلق بإزالة كلاس open فقط، لا تُحذف من الـ DOM)
var STATIC_MODAL_IDS = new Set([
  'orderModal', 'authModal', 'adminPanel', 'productFormModal', 'addPointsModal',
  'qtyOfferModal', 'bundleModal', 'quoteRequestModal', 'priceQuoteModal',
  'addCategoryModal', 'deleteConfirmModal', 'accountMenuModal', 'quickOrderModal'
]);

// أي عنصر آخر بكلاس modal-overlay (المودالات المُنشأة ديناميكياً بالجافاسكربت مثل
// تعديل الملف الشخصي، حذف الحساب، سجل العميل، محادثة الأدمن، الرسالة الجماعية)
// يُغلق فعلياً بحذفه من الـ DOM، لأن هذا هو نفس سلوك أزرار الإغلاق الأصلية فيها.

function isTrackableUIElement(el) {
  if (!el || !el.classList || !el.id) return false;
  if (el.id === 'cartSidebar' || el.id === 'notifDropdown') return true;
  return el.classList.contains('modal-overlay');
}

function trackUILayerOpen(el) {
  if (uiLayerStack.some(l => l.id === el.id)) return; // مُسجّلة مسبقاً، تجاهل
  uiLayerStack.push({ id: el.id, el });
  scheduleUIHistoryReconcile();
}

function trackUILayerClose(el) {
  const idx = uiLayerStack.findIndex(l => l.id === el.id);
  if (idx === -1) return; // غير مُسجّلة (أو أُغلقت مسبقاً عبر زر الرجوع نفسه)
  uiLayerStack.splice(idx, 1);
  scheduleUIHistoryReconcile();
}

var _historyLayerCount = 0;
var _uiHistoryReconcileScheduled = false;

// نؤجل أي تعديل فعلي على History لنهاية نفس اللحظة (microtask)، حتى لو صار
// إغلاق مودال وفتح آخر متتاليين بنفس الاستدعاء المتزامن (زي: quickOrderModal
// يقفل ونافذة معلومات الزائر تنفتح بنفس الوقت). هذا يمنع تصادم history.back()
// غير المتزامنة مع history.pushState() الفورية.
function scheduleUIHistoryReconcile() {
  if (_uiHistoryReconcileScheduled) return;
  _uiHistoryReconcileScheduled = true;
  Promise.resolve().then(reconcileUIHistory);
}

function reconcileUIHistory() {
  _uiHistoryReconcileScheduled = false;
  const target = uiLayerStack.length;
  const diff = target - _historyLayerCount;
  if (diff === 0) return;
  if (diff > 0) {
    for (let i = target - diff; i < target; i++) {
      history.pushState({ uiLayer: uiLayerStack[i].id }, '', window.location.href);
    }
  } else {
    _pendingHistoryCleanup = true;
    history.go(diff);
  }
  _historyLayerCount = target;
}

// ينفّذ الإغلاق الفعلي لعنصر عندما يكون زر الرجوع هو من طلب الإغلاق
function closeUILayerElement(el) {
  if (!el || !document.body.contains(el)) return;
  if (el.id === 'cartSidebar') { if (typeof closeCart === 'function') closeCart(); return; }
  if (el.id === 'notifDropdown') { if (typeof closeNotifDropdown === 'function') closeNotifDropdown(); return; }
  if (STATIC_MODAL_IDS.has(el.id)) { el.classList.remove('open'); return; }
  // مودال ديناميكي (تم إنشاؤه بالجافاسكربت) → يُحذف من الـ DOM مثل زر إغلاقه تماماً
  el.remove();
}

// مراقب عام يكتشف فتح/إغلاق أي طبقة واجهة تلقائياً دون لمس أي كود موجود
var _uiLayerObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      const el = m.target;
      if (!isTrackableUIElement(el)) continue;
      const isOpenNow = el.classList.contains('open');
      const alreadyTracked = uiLayerStack.some(l => l.id === el.id);
      if (isOpenNow && !alreadyTracked) trackUILayerOpen(el);
      else if (!isOpenNow && alreadyTracked) trackUILayerClose(el);
    } else if (m.type === 'childList') {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (isTrackableUIElement(node) && node.classList.contains('open')) trackUILayerOpen(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('.modal-overlay.open').forEach(child => trackUILayerOpen(child));
        }
      });
      m.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (isTrackableUIElement(node)) trackUILayerClose(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('.modal-overlay').forEach(child => trackUILayerClose(child));
        }
      });
    }
  }
});
_uiLayerObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
// ============================================================
// [نهاية الجزء الخاص بمكدّس الطبقات]
// ============================================================

function armHomeGuard() {
  // يضيف "حالة حارسة" فوق السجل الحالي — هذي هي اللي تلتقط أول ضغطة رجوع
  // وأنت بجذر الصفحة الرئيسية، فتمنع خروج التطبيق فوراً وتفسح المجال لعرض التنبيه
  if (_homeGuardArmed) return;
  _homeGuardArmed = true;
  history.pushState({ page: 'home', guard: true }, '', window.location.href);
}

// نبني السجل الأساسي: حالة جذر عادية، وفوقها الحارس مباشرة
history.replaceState({ page: 'home' }, '', window.location.href);
armHomeGuard();

function goBack() {
  if (pageHistory.length > 1) {
    pageHistory.pop();
    isBackNavigation = true;
    showPage(pageHistory[pageHistory.length - 1]);
    isBackNavigation = false;
  }
}

function updateHeaderBackBtn() {
  return; // تم إلغاء زر الرجوع بجانب الشعار نهائياً بناءً على طلب المستخدم
}

// معالج زر الرجوع في Android WebView
window.addEventListener('popstate', (e) => {
  // (1) تجاهل أي popstate ناتج عن تنظيفنا التلقائي للسجل بعد إغلاق طبقة من واجهة المستخدم
  // (مثلاً: ضغط المستخدم زر X لإغلاق مودال، وليس زر الرجوع الفيزيائي)
  if (_pendingHistoryCleanup) {
    _pendingHistoryCleanup = false;
    if (_pendingNotificationPage) {
      const pendingPage = _pendingNotificationPage;
      _pendingNotificationPage = null;
      setTimeout(() => {
        try { showPage(pendingPage); }
        catch (err) { console.warn('تعذر فتح وجهة الإشعار:', err); }
      }, 0);
    }
    return;
  }

  // (2) الأولوية دائماً لإغلاق أعلى طبقة مفتوحة (مودال / سلة / لوحة تحكم / إشعارات)
  // قبل أي تنقل بين الصفحات أو محاولة الخروج من التطبيق
  if (uiLayerStack.length > 0) {
    const layer = uiLayerStack.pop();
    closeUILayerElement(layer.el);
    // زر الرجوع الفعلي استهلك حالة History بنفسه — لازم ننزّل العداد يدويًا هون
    _historyLayerCount = Math.max(0, _historyLayerCount - 1);
    return;
  }

  // حالة: استُهلكت "الحالة الحارسة" ووصلنا فعلياً لجذر الصفحة الرئيسية (لا صفحات أخرى بالسجل الداخلي)
  if (e.state && e.state.page === 'home' && !e.state.guard && pageHistory.length <= 1) {
    _homeGuardArmed = false;
    if (!_exitWarningShown) {
      _exitWarningShown = true;
      showToast('اضغط رجوع مرة أخرى للخروج من التطبيق', '');
      // إن لم يضغط المستخدم رجوع خلال 3 ثوانٍ، نعيد تسليح الحارس ليحميه مرة أخرى لاحقاً
      clearTimeout(_exitWarningTimer);
      _exitWarningTimer = setTimeout(() => {
        _exitWarningShown = false;
        armHomeGuard();
      }, 3000);
    }
    // لا داعي لأي إجراء إضافي هنا: لو ضغط المستخدم رجوع مرة ثانية الآن،
    // WebView سيغلق التطبيق تلقائياً بما إنه ما عاد يوجد سجل أبعد من هذه النقطة
    return;
  }

  if (e.state && e.state.page) {
    // إبقاء سجل الصفحات الداخلي متزامناً مع السجل الفعلي عند استخدام زر الرجوع الفيزيائي
    if (pageHistory.length > 1) pageHistory.pop();
    isBackNavigation = true;
    showPage(e.state.page);
    isBackNavigation = false;
  }
});
// يفعّل ظهور قسم صفحة بحركة انتقال سلسة فعلية (بدل قفزة فجائية)
function activatePageSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('active'));
  });
}
// ينزل تلقائياً لبداية محتوى الصفحة نفسها، متخطياً الهيدر وشريط العروض المثبّت بالأعلى
function scrollToPageSection(id) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  });
}
let pageScrollPositions = {};

function showPage(page) {
  const validPages = new Set(['home', 'orders', 'productDetail', 'about', 'compare', 'favorites', 'reordered', 'myQuotes', 'messages', 'trackOrder', 'error']);
  if (!validPages.has(page)) {
    console.warn('محاولة فتح صفحة غير معروفة:', page);
    page = 'home';
  }

  // احفظ موضع التمرير الحالي للصفحة يلي عم نغادرها، لإعادته لاحقاً لو رجعنالها
  const leavingPage = pageHistory[pageHistory.length - 1];
  if (leavingPage) pageScrollPositions[leavingPage] = window.scrollY;

  document.querySelectorAll('.page-section').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
  
  // أضيف الصفحة الجديدة للسجل (إذا لم تكن عملية رجوع)
  if (!isBackNavigation && (pageHistory.length === 0 || pageHistory[pageHistory.length - 1] !== page)) {
    pageHistory.push(page);
    window.history.pushState({ page: page }, '', `#${page}`);
  }
  updateHeaderBackBtn();

  // أي صفحة غير الرئيسية تعني أننا غادرنا الجذر، فنسمح بإعادة تسليح الحارس لاحقاً عند العودة إليه
  if (page !== 'home') _homeGuardArmed = false;
  
  if (page === 'home') {
    activatePageSection('homePage');
    // كل مرة نصل فيها فعلياً لجذر الصفحة الرئيسية (تنقل عادي أو رجوع)، نعيد تسليح حارس الخروج
    if (pageHistory.length <= 1) armHomeGuard();
    if (typeof pageScrollPositions[page] === 'number') {
      const savedY = pageScrollPositions[page];
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, savedY)));
    }
  } else if (page === 'orders') {
    activatePageSection('ordersPage');
    window.scrollTo(0, 0);
    // لا نبدأ قراءة Firebase أو إعادة رسم الإشعارات أثناء تغيير الصفحة.
    // هذا يمنع تجمّد WebView عند فتح الصفحة من نقرة إشعار.
    setTimeout(() => {
      if (typeof renderClientOrders === 'function') renderClientOrders();
      if (typeof markNotifsByLinkPrefixRead === 'function') {
        markNotifsByLinkPrefixRead(['page:orders']);
      }
    }, 0);
  } else if (page === 'productDetail') {
    activatePageSection('productDetailPage');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToProductImage());
    });
  } else if (page === 'about') {
    activatePageSection('aboutPage');
    window.scrollTo(0, 0);
  } else if (page === 'compare') {
    activatePageSection('comparePage');
    window.scrollTo(0, 0);
  } else if (page === 'favorites') {
    activatePageSection('favoritesPage');
    scrollToPageSection('favoritesPage');
  } else if (page === 'reordered') {
    activatePageSection('reorderedProductsPage');
    scrollToPageSection('reorderedProductsPage');
  } else if (page === 'myQuotes') {
    activatePageSection('myQuotesPage');
    scrollToPageSection('myQuotesPage');
    renderMyQuotesPage();
    markNotifsByLinkPrefixRead(['page:myQuotes']);
  } else if (page === 'messages') {
    activatePageSection('messagesPage');
    renderClientMessagesThread().then(() => {
      const input = document.getElementById('clientMsgInput');
      if (input) input.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    markNotifsByLinkPrefixRead(['page:messages']);
  } else if (page === 'trackOrder') {
    activatePageSection('trackOrderPage');
    scrollToPageSection('trackOrderPage');
  } else if (page === 'error') {
    activatePageSection('errorPage');
    scrollToPageSection('errorPage');
  }
}

function showErrorPage(options = {}) {
  const icon    = options.icon    || '⚠️';
  const title   = options.title   || 'حدث خطأ ما';
  const message = options.message || 'تعذّر تحميل هذه الصفحة. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.';

  document.getElementById('errorPageIcon').textContent = icon;
  document.getElementById('errorPageTitle').textContent = title;
  document.getElementById('errorPageMessage').textContent = message;
  showPage('error');
}
function openTrackOrderPage() {
  document.getElementById('trackOrderId').value = '';
  document.getElementById('trackOrderPhone').value = '';
  document.getElementById('trackErrorBox').style.display = 'none';
  document.getElementById('trackResultBox').innerHTML = '';
  renderTrackRecentBox();
  showPage('trackOrder');
}

function renderTrackRecentBox() {
  const box = document.getElementById('trackRecentBox');
  if (!box) return;
  const orderRefs = getGuestOrderRefs();
  const quoteRefs = getGuestQuoteRefs();
  const all = [...orderRefs, ...quoteRefs].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!all.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = `
    <div style="font-size:13px;font-weight:800;color:var(--text-muted);margin-bottom:10px">📱 طلباتك الأخيرة على هذا الجهاز</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${all.slice(0,10).map(r => `
        <button onclick="trackRecentTap('${escJsAttr(r.id)}','${escJsAttr(r.phone||'')}')"
          style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:10px;
          background:#f8fbfd;border:1.5px solid var(--border);cursor:pointer;font-family:inherit;text-align:right">
          <span style="font-weight:800;color:var(--primary-dark)">#${escHtml(r.id)}</span>
          <i class="fas fa-chevron-left" style="color:var(--text-muted);font-size:12px"></i>
        </button>`).join('')}
    </div>`;
}

function trackRecentTap(id, phone) {
  document.getElementById('trackOrderId').value = id;
  document.getElementById('trackOrderPhone').value = phone;
  if (phone) {
    trackGuestOrder();
  } else {
    document.getElementById('trackOrderPhone').focus();
  }
}

function showOrderConfirmation(orderId) {
  document.getElementById('orderConfirmNumber').textContent = orderId;
  document.getElementById('orderConfirmModal').classList.add('open');
}
function closeOrderConfirmModal() {
  document.getElementById('orderConfirmModal').classList.remove('open');
}
function copyOrderConfirmNumber() {
  const num = document.getElementById('orderConfirmNumber').textContent;
  navigator.clipboard.writeText(num).then(() => showToast('✅ تم نسخ رقم الطلب', 'success'))
    .catch(() => showToast('❌ تعذّر النسخ', 'error'));
}
function copyDisplayedOrderNumber() {
  const num = document.getElementById('orderNumberDisplay').textContent;
  navigator.clipboard.writeText(num).then(() => showToast('✅ تم نسخ رقم الطلب', 'success'))
    .catch(() => showToast('❌ تعذّر النسخ', 'error'));
}
function shareOrderConfirmWhatsApp() {
  const num = document.getElementById('orderConfirmNumber').textContent;
  const text = encodeURIComponent(`رقم طلبي من DentaPro: ${num}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}
function showTrackError(msg) {
  document.getElementById('trackResultBox').innerHTML = '';
  document.getElementById('trackErrorMsg').textContent = msg;
  document.getElementById('trackErrorBox').style.display = 'flex';
}

async function trackGuestOrder() {
  const idInput = document.getElementById('trackOrderId').value.trim().toUpperCase();
  const phoneInput = document.getElementById('trackOrderPhone').value.trim();
  document.getElementById('trackErrorBox').style.display = 'none';
  const resultBox = document.getElementById('trackResultBox');

  if (!idInput || !phoneInput) return showTrackError('يرجى إدخال رقم الطلب ورقم الهاتف');

  resultBox.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
    <div class="spinner" style="margin:0 auto 14px;width:28px;height:28px;border-width:4px"></div>جاري البحث...</div>`;

  try {
    const isQuote = idInput.startsWith('QT-');
    const colName = isQuote ? 'quotes' : 'orders';
    const snap = await window._fbGetDoc(window._fbDoc2(colName, idInput));

    if (!snap.exists()) return showTrackError('لم يتم العثور على طلب بهذا الرقم، تأكد من كتابته بشكل صحيح');

    const data = snap.data();
    const cleanPhone  = (data.phone || '').replace(/\D/g,'');
    const inputPhone  = phoneInput.replace(/\D/g,'');
    // مقارنة آخر 9 أرقام (تغطي الرقم المحلي الكامل بدون رمز الدولة، أدق من 7 أرقام)
    const matches = cleanPhone.length >= 9 && inputPhone.length >= 9 && cleanPhone.slice(-9) === inputPhone.slice(-9);
    if (!matches) return showTrackError('رقم الهاتف لا يطابق بيانات هذا الطلب');

    if (isQuote) rememberGuestQuote({ id: idInput, phone: data.phone, createdAt: data.createdAt });
    else rememberGuestOrder({ id: idInput, phone: data.phone, createdAt: data.createdAt });

    const date = new Date(data.createdAt).toLocaleDateString('ar-SA-u-ca-gregory',
      { year:'numeric', month:'long', day:'numeric' });

    if (isQuote) {
      const total = (data.items||[]).reduce((s,i)=> s + ((i.unitPrice||0)*(i.qty||1)), 0);
      resultBox.innerHTML = `
        <div class="order-track-card">
          <div class="order-track-header">
            <div>
              <div class="order-track-num"><i class="fas fa-file-invoice-dollar"></i> #${escHtml(data.id)}</div>
              <div class="order-track-date">📅 ${date}</div>
            </div>
            ${quoteStatusBadge(data.status)}
          </div>
          <div class="order-track-body">
            ${data.status==='accepted' ? trackStepsHTML(data.orderStatus||'pending') : ''}
            <div class="order-items-list">
              ${(data.items||[]).map(i=>`
                <div class="order-item-row">
                  <div class="order-item-icon">${i.icon||'📦'}</div>
                  <div style="flex:1;font-weight:600">${escHtml(i.ar)}</div>
                  <div style="color:var(--text-muted)">${i.qty?`× ${i.qty}`:''}</div>
                </div>`).join('')}
            </div>
            ${(data.status==='priced'||data.status==='accepted') ? `<div style="text-align:left;font-weight:900;color:var(--primary);margin-top:10px">الإجمالي: ${fmtPrice(total)} د.أ</div>` : ''}
          </div>
        </div>`;
    } else {
      resultBox.innerHTML = `
        <div class="order-track-card">
          <div class="order-track-header">
            <div>
              <div class="order-track-num"><i class="fas fa-receipt"></i> #${escHtml(data.id)}</div>
              <div class="order-track-date">📅 ${date}</div>
            </div>
            ${statusBadgeHTML(data.status)}
          </div>
          <div class="order-track-body">
            ${trackStepsHTML(data.status)}
            <div class="order-items-list">
              ${(data.items||[]).map(i=>`
                <div class="order-item-row">
                  <div class="order-item-icon">${escHtml(i.icon || '')}</div>
                  <div style="flex:1;font-weight:600">${escHtml(i.ar)}</div>
                  <div style="color:var(--text-muted)">× ${i.qty}</div>
                </div>`).join('')}
            </div>
            <div style="text-align:left;font-weight:900;color:var(--primary);margin-top:10px">
              الإجمالي: ${data.payMethod==='points' ? `${data.totalPoints||0} نقطة` : `${fmtPrice(data.total)} د.أ`}
            </div>
          </div>
        </div>`;
    }
  } catch(e) {
    console.error(e);
    if (e && e.code === 'permission-denied') {
      // الطلب مسجّل باسم عميل لديه حساب: لا يقرأه إلا صاحبه بعد تسجيل الدخول (حماية لبياناته)
      showTrackError('هذا الطلب مرتبط بحساب مسجّل، فلا يمكن تتبعه برقم الطلب والهاتف. سجّل الدخول بحساب صاحب الطلب ثم افتح «طلباتي».');
    } else {
      showTrackError('حدث خطأ أثناء البحث، تحقق من الاتصال بالإنترنت');
    }
  }
}

function skeletonOrderCardsHTML(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
    <div class="skeleton-order-card">
      <div class="skeleton-block skeleton-line medium"></div>
      <div class="skeleton-block skeleton-line short"></div>
      <div class="skeleton-block skeleton-line long" style="margin-top:16px;height:60px;border-radius:12px"></div>
    </div>`;
  }
  return html;
}
// =====================
// PUSH NOTIFICATIONS (FCM)
// =====================
var _swRegistration = null;

async function registerServiceWorkerForPush() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    if (_swRegistration) return _swRegistration;
    // استخدم مساراً نسبياً حتى يعمل المتجر أيضاً عند نشره داخل مجلد
    // مثل GitHub Pages، وليس فقط عند النشر من جذر النطاق.
    const swUrl = new URL('firebase-messaging-sw.js', document.baseURI);
    _swRegistration = await navigator.serviceWorker.register(swUrl);
    return _swRegistration;
  } catch(e) {
    console.warn('⚠️ فشل تسجيل Service Worker:', e.message);
    return null;
  }
}

async function enablePushNotifications() {
  // الإشعارات الآن عبر OneSignal (js/push/onesignal.js): نربط الجهاز ببريد العميل فقط
  if (!currentUser || !currentUser.email) return;
  for (let i = 0; i < 30; i++) {
    if (window.storePushLogin) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (window.storePushLogin) window.storePushLogin(currentUser.email);
}

// إشعار يصل والموقع مفتوح بالمقدمة فعلياً — نعرضه toast بدل إشعار نظام مزدوج
window._onForegroundFCMMessage = function(payload) {
  const title = payload.notification?.title || payload.data?.title || '';
  const body = payload.notification?.body || payload.data?.body || '';
  showToast(`🔔 ${title}${body ? ' — ' + body : ''}`, 'success');
  if (typeof loadAndRenderNotifIcon === 'function' && currentUser) loadAndRenderNotifIcon();
};

// استقبال نقرة المستخدم على إشعار نظام (يصل من الـ Service Worker بالخلفية)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'notification-click' && event.data.link) {
      if (typeof onNotifClick === 'function') onNotifClick('', event.data.link);
    }
  });
}

// =====================
function toggleFabFan() {
  const wrap = document.getElementById('fabFanWrap');
  if (!wrap) return;
  wrap.classList.toggle('open');
}

function closeFabFan() {
  const wrap = document.getElementById('fabFanWrap');
  if (wrap) wrap.classList.remove('open');
}

function focusSearchInput() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => input.focus(), 300);
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('dentapro_darkMode', document.body.classList.contains('dark-mode') ? '1' : '0');
}

// تطبيق التفضيل المحفوظ فور تحميل الصفحة
(function applyStoredDarkMode() {
  if (localStorage.getItem('dentapro_darkMode') === '1') {
    document.body.classList.add('dark-mode');
  }
})();

// ═══════ قائمة "تواصل معنا" — تُفتح من زر الشريط السفلي ═══════
function toggleContactMenu() {
  const menu = document.getElementById('contactFabMenu');
  if (menu) menu.classList.toggle('open');
}

window.closeContactFab = function() {
  const menu = document.getElementById('contactFabMenu');
  if (menu) menu.classList.remove('open');
};

(function initContactMenuOutsideClose() {
  function closeIfOutside(e) {
    const menu = document.getElementById('contactFabMenu');
    const navBtn = document.getElementById('contactNavBtn');
    if (menu && menu.classList.contains('open') &&
        !menu.contains(e.target) && !(navBtn && navBtn.contains(e.target))) {
      e.stopPropagation();
      e.preventDefault();
      menu.classList.remove('open');
    }
  }
  document.addEventListener('touchstart', closeIfOutside, { capture: true, passive: false });
  document.addEventListener('click', closeIfOutside, true);
})();

// إغلاق تلقائي لو ضغط المستخدم بأي مكان تاني برّا اللسان والقائمة
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('fabFanWrap');
  if (wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) {
    e.stopPropagation();
    e.preventDefault();
    wrap.classList.remove('open');
  }
}, true);
// =====================
// MOBILE DRAWER MENU
// =====================

function toggleMobileDrawer() {
  const mobileDrawer = document.getElementById('mobileDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');

  if (!mobileDrawer || !drawerOverlay) return;

  mobileDrawer.classList.toggle('open');
  drawerOverlay.classList.toggle('open');
  // فتح الدرج مؤشر قوي على أن المستخدم سيضغط رابطاً يحتاج ملفات الطلبات/الرسائل المؤجلة: نبدأ تحميلها الآن
  if (mobileDrawer.classList.contains('open') && typeof window.loadLazyScripts === 'function') window.loadLazyScripts().catch(() => {});

  document.body.classList.toggle(
    'drawer-open',
    mobileDrawer.classList.contains('open')
  );
}

// جعل الدالة متاحة لأزرار onclick الموجودة داخل index.html
window.toggleMobileDrawer = toggleMobileDrawer;

// ===== أجزاء واجهة العميل التي كانت داخل admin.js (لا تُحمَّل للعميل العادي) — نُقلت إلى الملفات الأساسية =====
// للعميل (غير الموظف): الزر صار "الرئيسية" مباشرة. للموظف/الأدمن: يفتح قائمة الإدارة كما هي.
function handleBottomNavAccount() {
  if (currentUser && isStaff()) {
    // openAccountMenu جزء من كود الإدارة المحمّل عند الحاجة؛ ننتظر تحميله إن لم يكن جاهزاً بعد
    if (typeof openAccountMenu === 'function') { openAccountMenu(); return; }
    if (typeof window.loadAdminScriptsOnce === 'function') {
      window.loadAdminScriptsOnce().then(() => { if (typeof openAccountMenu === 'function') openAccountMenu(); });
      return;
    }
  }
  goHome();
}
function syncBottomNavCartBadge() {
  const badge = document.getElementById('bottomNavCartBadge');
  if (!badge) return;
  const count = cart.reduce((s,i) => s + i.qty, 0);
  badge.style.display = count > 0 ? 'flex' : 'none';
  badge.textContent = count > 9 ? '9+' : count;
}
const _origUpdateCartUI = updateCartUI;
updateCartUI = function() { _origUpdateCartUI(); syncBottomNavCartBadge(); };

window._onNotificationsUpdate = async function() {
  if (!currentUser) return;
  const isAdminUser = isStaff();
  _cachedNotifs = await fetchNotificationsFor(currentUser.email, isAdminUser);
  updateNotifBadge();
  if (document.getElementById('notifDropdown')?.classList.contains('open')) {
    renderNotifList();
  }
};

// ===== فتح وجهة الإشعار مباشرة عند النقر على إشعار الدفع =====
// الرابط يصل من مصدرين (معامل ?n= في عنوان الصفحة، وحدث النقر من OneSignal). ننتظر حتى يجهز الموقع
// (تحميل الملفات + معرفة حالة تسجيل الدخول + تحميل كود الإدارة لإشعارات الإدارة) ثم نفتح الوجهة.
var _dpLastNotifLink = '', _dpLastNotifLinkAt = 0;
var DP_NOTIF_LINK_PREFIXES = ['page:', 'adminorders:', 'adminquotes:', 'adminproducts:', 'product:', 'clientmsg:'];

function dpOpenNotifLink(link) {
  link = String(link || '').trim();
  if (!link || !DP_NOTIF_LINK_PREFIXES.some(p => link.startsWith(p))) return;
  const now = Date.now();
  if (link === _dpLastNotifLink && now - _dpLastNotifLinkAt < 8000) return; // نقرة واحدة قد تصل من مصدرين
  _dpLastNotifLink = link;
  _dpLastNotifLinkAt = now;

  const needsStaff = /^(adminorders:|adminquotes:|adminproducts:|clientmsg:)/.test(link);
  const started = Date.now();
  const tick = () => {
    const authKnown = window._currentRole !== undefined; // undefined = لم تُحسم حالة الدخول بعد
    const ready = typeof onNotifClick === 'function' && authKnown &&
      (!needsStaff || (typeof isStaff === 'function' && isStaff() && typeof switchAdminTab === 'function'));
    if (ready) { onNotifClick('', link); return; }
    if (Date.now() - started < 20000) setTimeout(tick, 300);
  };
  tick();
}
window.dpOpenNotifLink = dpOpenNotifLink;

(function processNotifDeepLink() {
  try {
    const url = new URL(location.href);
    const n = url.searchParams.get('n');
    if (n) {
      url.searchParams.delete('n');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      dpOpenNotifLink(n);
    }
    if (window._pendingNotifLink) {
      const l = window._pendingNotifLink;
      window._pendingNotifLink = null;
      dpOpenNotifLink(l);
    }
  } catch (e) { console.warn('notif deep link:', e && e.message); }
})();

