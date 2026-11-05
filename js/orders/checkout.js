// computeCustomDiscount انتقلت إلى js/shared/discounts.js
// DentaPro domain module: extracted from the original implementation.
// QUOTE REQUEST (طلب عرض سعر) — CLIENT SIDE
// =====================
var currentQuoteItems = [];
var quotePendingImage = null;



function openQuoteRequestModal() {
  currentQuoteItems = [];
  window._guestResolvedClient = null;
  document.getElementById('quoteNotes').value = '';
  document.getElementById('quoteFormError').style.display = 'none';
  document.getElementById('quoteProductSearch').value = '';
  document.getElementById('quoteAddProductSelect').value = '';
  document.getElementById('quoteAddProductQty').value = '';
  document.getElementById('quoteProductDropdown').style.display = 'none';
  const hintEl = document.getElementById('quoteNoResultsHint');
  if (hintEl) hintEl.style.display = 'none';
  clearQuoteImage();

  const guestFields = document.getElementById('quoteGuestFields');
  if (guestFields) {
    guestFields.style.display = getActiveClientSession() ? 'none' : 'block';
    document.getElementById('quoteGuestName').value = '';
    document.getElementById('quoteGuestPhone').value = '';
    document.getElementById('quoteGuestClinic').value = '';
    window._guestResolvedClient = null;
  }

  renderQuoteItemsList();
  document.getElementById('quoteRequestModal').classList.add('open');
}

function triggerQuoteImgUpload() {
  document.getElementById('quoteItemImgFile').click();
}

function handleQuoteImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ حجم الصورة يتجاوز 5MB', 'error');
    return;
  }
  quotePendingImage = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('quoteImgPreview').src = e.target.result;
    document.getElementById('quoteImgPreviewWrap').style.display = 'block';
    document.getElementById('quoteImgUploadArea').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearQuoteImage() {
  quotePendingImage = null;
  const fileInput = document.getElementById('quoteItemImgFile');
  const previewWrap = document.getElementById('quoteImgPreviewWrap');
  const uploadArea = document.getElementById('quoteImgUploadArea');
  if (fileInput) fileInput.value = '';
  if (previewWrap) previewWrap.style.display = 'none';
  if (uploadArea) uploadArea.style.display = 'block';
}


function showQuoteProductList() {
  filterQuoteProductList();
  document.getElementById('quoteProductDropdown').style.display = 'block';
}

function filterQuoteProductList() {
  const term = normalizeArabic(document.getElementById('quoteProductSearch').value);
  const list = getSortedProductsAr().filter(p =>
    !term || normalizeArabic(p.ar).includes(term) || normalizeArabic(p.brand).includes(term) || p.en.toLowerCase().includes(term)
  );
  const dd = document.getElementById('quoteProductDropdown');
  const hint = document.getElementById('quoteNoResultsHint');
  if (!list.length) {
    dd.innerHTML = '';
    dd.style.display = 'none';
    hint.style.display = term ? 'block' : 'none';
    return;
  }
  hint.style.display = 'none';
  dd.innerHTML = list.map(p => `
    <div onclick="selectQuoteProduct(${p.id})"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f4f8"
      onmouseover="this.style.background='#f8fbfd'" onmouseout="this.style.background=''">
      <span style="font-size:18px;flex-shrink:0">${p.image?`<img src="${escHtml(cldOptimize(p.image,40))}" style="width:24px;height:24px;border-radius:5px;object-fit:cover" loading="lazy">`:escHtml(p.icon || '')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.ar)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(p.brand)}</div>
      </div>
    </div>`).join('');
  dd.style.display = 'block';
}

// يضيف مقاسات مختارة (من قائمة المقاسات) إلى طلب عرض السعر: كل مقاس سطر مستقل، ويُعرض مجمّعاً إن تساوت الأسعار
function addQuoteSizeItems(selections) {
  selections.forEach(({ child, qty }) => {
    const existing = currentQuoteItems.find(it => it.productId === child.id);
    if (existing) existing.qty = qty; else currentQuoteItems.push({ productId: child.id, qty });
  });
  showToast('✅ تمت إضافة المقاسات المختارة', 'success');
  renderQuoteItemsList();
}

function selectQuoteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (p.hasSizes) {
    document.getElementById('quoteProductDropdown').style.display = 'none';
    document.getElementById('quoteProductSearch').value = '';
    openSizePicker(p.id, { mode: 'quote', onConfirm: addQuoteSizeItems });
    return;
  }
  document.getElementById('quoteAddProductSelect').value = id;
  document.getElementById('quoteProductSearch').value = `${p.ar} — ${p.brand}`;
  document.getElementById('quoteProductDropdown').style.display = 'none';
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('quoteProductDropdown');
  const input = document.getElementById('quoteProductSearch');
  if (dd && dd.style.display === 'block' && !dd.contains(e.target) && e.target !== input) {
    dd.style.display = 'none';
  }
});

function closeQuoteRequestModal() {
  document.getElementById('quoteRequestModal').classList.remove('open');
}

function addQuoteItemRow() {
  const select = document.getElementById('quoteAddProductSelect');
  const productId = parseInt(select.value);
  const qtyVal = document.getElementById('quoteAddProductQty').value;
  const qty = qtyVal ? parseInt(qtyVal) : null;
  const typedText = document.getElementById('quoteProductSearch').value.trim();

  if (productId) {
    // مادة مختارة من نتائج البحث (موجودة بالمتجر)
    const p = products.find(x => x.id === productId);
    const existing = currentQuoteItems.find(it => it.productId === productId);
    if (existing) {
      existing.qty = qty;
      showToast(`✏️ تم تحديث "${p ? p.ar : 'المادة'}"`, 'success');
    } else {
      currentQuoteItems.push({ productId, qty });
      showToast(`✅ تمت إضافة "${p ? p.ar : 'مادة'}"`, 'success');
    }
  } else if (typedText) {
    // لم يُختر منتج من القائمة — نعتمد النص المكتوب كمادة غير موجودة بالمتجر
    currentQuoteItems.push({ productId: null, customName: typedText, qty });
    showToast(`✅ تمت إضافة "${typedText}"`, 'success');
  } else {
    showToast('⚠️ يرجى كتابة اسم المادة أو اختيارها من القائمة أولاً', 'error');
    return;
  }

  document.getElementById('quoteAddProductQty').value = '';
  select.value = '';
  document.getElementById('quoteProductSearch').value = '';
  renderQuoteItemsList();
}

function renderQuoteItemsList() {
  const list = document.getElementById('quoteItemsList');
  if (!currentQuoteItems.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:10px">لم تتم إضافة مواد بعد</div>`;
    return;
  }
  const rowStyle = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 12px;background:#f8fbfd;border-radius:10px;border:1px solid var(--border)';
  const qtyInput = (it, idx) => `<input type="number" min="1" placeholder="غير محددة" value="${it.qty || ''}" style="width:90px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center" onchange="updateQuoteItemQtyByIdx(${idx}, this.value)">`;
  const removeBtn = (idx) => `<button onclick="removeQuoteItemRowByIdx(${idx})" style="background:none;border:none;color:var(--danger);cursor:pointer;flex-shrink:0"><i class="fas fa-times-circle"></i></button>`;
  const iconOf = (p) => p ? (p.image ? `<img src="${cldOptimize(p.image,40)}" style="width:24px;height:24px;border-radius:5px;object-fit:cover" loading="lazy">` : p.icon) : '✏️';
  const groups = dpGroupSizeLines(currentQuoteItems, it => { const p = it.productId ? products.find(x => x.id === it.productId) : null; return p ? p.parentId : null; });
  list.innerHTML = groups.map(g => {
    if (g.parent) {
      // مادة واحدة بجانبها المقاسات المختارة (لكل مقاس كميته)
      const sizes = g.lines.map(({ line, idx }) => {
        const p = products.find(x => x.id === line.productId);
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:12px;font-weight:700">${escHtml(p ? p.sizeLabel : '')}</span>
          <span style="font-size:12px;color:var(--text-muted)">الكمية:</span>${qtyInput(line, idx)}${removeBtn(idx)}</div>`;
      }).join('');
      return `<div style="${rowStyle};align-items:flex-start">
        <span style="font-size:18px;flex-shrink:0">${iconOf(g.parent)}</span>
        <div style="flex:1 1 160px;min-width:120px;display:flex;flex-direction:column;gap:6px">
          <span style="font-weight:700;font-size:13px">${escHtml(g.parent.ar)}</span>${sizes}</div></div>`;
    }
    const it = g.line, idx = g.idx;
    const p = it.productId ? products.find(x => x.id === it.productId) : null;
    const name = p ? p.ar : (it.customName || 'مادة');
    const customBadge = !p ? `<span style="font-size:10px;background:#fdf4ff;color:#7e22ce;border:1px solid #e9d5ff;border-radius:50px;padding:1px 8px;flex-shrink:0">مادة غير مدرجة</span>` : '';
    return `
    <div style="${rowStyle}">
      <div style="display:flex;align-items:center;gap:8px;flex:1 1 140px;min-width:100px">
        <span style="font-size:18px;flex-shrink:0">${iconOf(p)}</span>
        <span style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${escHtml(name)}</span>
      </div>
      ${customBadge}
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:12px;color:var(--text-muted)">الكمية:</span>${qtyInput(it, idx)}
      </div>
      ${removeBtn(idx)}
    </div>`;
  }).join('');
}

function updateQuoteItemQtyByIdx(idx, newQty) {
  if (currentQuoteItems[idx]) currentQuoteItems[idx].qty = newQty ? parseInt(newQty) : null;
}
function removeQuoteItemRowByIdx(idx) {
  currentQuoteItems.splice(idx, 1);
  renderQuoteItemsList();
}
// =====================
// QUICK ORDER (طلب سريع)
// =====================
var currentQuickOrderItems = [];

function showQOProductList() {
  filterQOProductList();
  document.getElementById('qoProductDropdown').style.display = 'block';
}

function filterQOProductList() {
  const term = normalizeArabic(document.getElementById('qoProductSearch').value);
  const list = getSortedProductsAr().filter(p =>
    !term || normalizeArabic(p.ar).includes(term) || normalizeArabic(p.brand).includes(term) || p.en.toLowerCase().includes(term)
  );
  const dd = document.getElementById('qoProductDropdown');
  const hint = document.getElementById('qoNoResultsHint');
  if (!list.length) {
    dd.innerHTML = '';
    dd.style.display = 'none';
    hint.style.display = term ? 'block' : 'none';
    return;
  }
  hint.style.display = 'none';
  dd.innerHTML = list.map(p => `
    <div onclick="selectQOProduct(${p.id})"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f4f8"
      onmouseover="this.style.background='#f8fbfd'" onmouseout="this.style.background=''">
      <span style="font-size:18px;flex-shrink:0">${p.image?`<img src="${escHtml(cldOptimize(p.image,40))}" style="width:24px;height:24px;border-radius:5px;object-fit:cover" loading="lazy">`:escHtml(p.icon || '')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.ar)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(p.brand)}</div>
      </div>
      <div style="font-weight:800;font-size:12px;color:var(--primary);flex-shrink:0">${(p.hasSizes && !sizesSamePrice(p)) ? t('من ','From ') : ''}${fmtPrice(p.price)} ${t('د.أ','JD')}</div>
    </div>`).join('');
  dd.style.display = 'block';
}

// يضيف مقاسات مختارة إلى الطلب السريع: كل مقاس سطر مستقل (لمخزونه)، ويُعرض مجمّعاً إن تساوت الأسعار
function addQOSizeItems(selections) {
  selections.forEach(({ child, qty }) => {
    const existing = currentQuickOrderItems.find(it => it.productId === child.id);
    if (existing) {
      existing.qty = qty;
      existing.unitPrice = getEffectiveUnitPrice(child, qty);
    } else {
      currentQuickOrderItems.push({ productId: child.id, parentId: child.parentId, sizeLabel: child.sizeLabel || '', ar: child.ar, en: child.en, icon: child.icon, image: child.image || null, isCustom: false, qty, unitPrice: getEffectiveUnitPrice(child, qty) });
    }
  });
  showToast('✅ تمت إضافة المقاسات المختارة', 'success');
  renderQOItemsList();
}

function selectQOProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (p.hasSizes) {
    document.getElementById('qoProductDropdown').style.display = 'none';
    document.getElementById('qoProductSearch').value = '';
    openSizePicker(p.id, { mode: 'qo', onConfirm: addQOSizeItems });
    return;
  }
  document.getElementById('qoAddProductSelect').value = id;
  document.getElementById('qoProductSearch').value = `${p.ar} — ${p.brand}`;
  document.getElementById('qoProductDropdown').style.display = 'none';
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('qoProductDropdown');
  const input = document.getElementById('qoProductSearch');
  if (dd && dd.style.display === 'block' && !dd.contains(e.target) && e.target !== input) {
    dd.style.display = 'none';
  }
});

function addQOItemRow() {
  const select = document.getElementById('qoAddProductSelect');
  const productId = parseInt(select.value);
  const qtyVal = document.getElementById('qoAddProductQty').value;
  const qty = qtyVal ? parseInt(qtyVal) : 1;
  const typedText = document.getElementById('qoProductSearch').value.trim();

  if (productId) {
    const p = products.find(x => x.id === productId);
    const existing = currentQuickOrderItems.find(it => it.productId === productId);
    if (existing) {
      existing.qty = qty;
      existing.unitPrice = getEffectiveUnitPrice(p, qty);
      showToast(`✏️ تم تحديث "${p ? p.ar : 'المادة'}"`, 'success');
    } else {
      currentQuickOrderItems.push({ productId, ar: p.ar, en: p.en, icon: p.icon, image: p.image || null, isCustom: false, qty, unitPrice: getEffectiveUnitPrice(p, qty), basePrice: p.price });
      showToast(`✅ تمت إضافة "${p ? p.ar : 'مادة'}"`, 'success');
    }
  } else if (typedText) {
    currentQuickOrderItems.push({ productId: null, ar: typedText, en: '', icon: '✏️', image: null, isCustom: true, qty, unitPrice: null });
    showToast(`✅ تمت إضافة "${typedText}"`, 'success');
  } else {
    showToast('⚠️ يرجى كتابة اسم المادة أو اختيارها من القائمة أولاً', 'error');
    return;
  }

  document.getElementById('qoAddProductQty').value = '1';
  select.value = '';
  document.getElementById('qoProductSearch').value = '';
  renderQOItemsList();
}

// عرض كمية "على مجموع المقاسات": إعادة تسعير بنود مقاسات المادة الواحدة في الطلب السريع
function repriceQOFamilyOffers() {
  const lines = currentQuickOrderItems.filter(it => !it.isCustom && it.parentId).map(it => ({ id: it.productId, parentId: it.parentId, qty: it.qty }));
  currentQuickOrderItems.forEach(l => {
    if (l.isCustom || !l.parentId) return;
    const pr = products.find(x => x.id === l.productId);
    if (!pr || getActiveQtyOffer(pr.id) || !getFamilyQtyOffer(pr)) return;
    l.unitPrice = getEffectiveUnitPrice(pr, l.qty, lines);
  });
}

function renderQOItemsList() {
  repriceQOFamilyOffers();
  const list = document.getElementById('qoItemsList');
  if (!currentQuickOrderItems.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:10px">لم تتم إضافة مواد بعد</div>`;
    updateQuickOrderTotal();
    return;
  }
  const rowStyle = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 12px;background:#f8fbfd;border-radius:10px;border:1px solid var(--border)';
  const iconOf = (it) => it.image ? `<img src="${escHtml(cldOptimize(it.image,40))}" style="width:24px;height:24px;border-radius:5px;object-fit:cover" loading="lazy">` : escHtml(it.icon || '');
  const qtyInput = (it, idx, w) => `<input type="number" min="1" value="${it.qty}" style="width:${w}px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center" onchange="updateQOItemQtyByIdx(${idx}, this.value)">`;
  const removeBtn = (idx) => `<button onclick="removeQOItemRowByIdx(${idx})" style="background:none;border:none;color:var(--danger);cursor:pointer;flex-shrink:0"><i class="fas fa-times-circle"></i></button>`;
  const groups = dpGroupSizeLines(currentQuickOrderItems, it => it.parentId);
  list.innerHTML = groups.map(g => {
    if (g.parent) {
      // مادة واحدة بجانبها المقاسات المختارة (لكل مقاس كميته)
      const lines = g.lines.map(l => l.line);
      const total = lines.reduce((s, it) => s + it.unitPrice * it.qty, 0);
      const sizes = g.lines.map(({ line, idx }) => `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:12px;font-weight:700">${escHtml(line.sizeLabel || '')}</span>
          <span style="font-size:12px;color:var(--text-muted)">الكمية:</span>${qtyInput(line, idx, 70)}${removeBtn(idx)}</div>`).join('');
      return `<div style="${rowStyle};align-items:flex-start">
        <span style="font-size:18px;flex-shrink:0">${iconOf(lines[0])}</span>
        <div style="flex:1 1 160px;min-width:120px;display:flex;flex-direction:column;gap:6px">
          <span style="font-weight:700;font-size:13px">${escHtml(g.parent.ar)}</span>${sizes}</div>
        <span style="font-size:12px;font-weight:800;color:var(--primary);flex-shrink:0">${fmtPrice(total)} ${t('د.أ','JD')}</span></div>`;
    }
    const it = g.line, idx = g.idx;
    const customBadge = it.isCustom ? `<span style="font-size:10px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:50px;padding:1px 8px;flex-shrink:0">مادة غير مدرجة</span>` : '';
    const priceInfo = it.isCustom
      ? ''
      : `<span style="font-size:12px;font-weight:800;color:var(--primary);flex-shrink:0">${fmtPrice(it.unitPrice)} × ${it.qty} = ${fmtPrice((it.unitPrice*it.qty))} ${t('د.أ','JD')}</span>`;
    return `
    <div style="${rowStyle}">
      <div style="display:flex;align-items:center;gap:8px;flex:1 1 140px;min-width:100px">
        <span style="font-size:18px;flex-shrink:0">${iconOf(it)}</span>
        <span style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${escHtml(it.ar)}</span>
      </div>
      ${customBadge}
      ${priceInfo}
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:12px;color:var(--text-muted)">الكمية:</span>${qtyInput(it, idx, 70)}
      </div>
      ${removeBtn(idx)}
    </div>`;
  }).join('');
  updateQuickOrderTotal();
}

function updateQOItemQtyByIdx(idx, newQty) {
  const item = currentQuickOrderItems[idx];
  if (item) {
    item.qty = parseInt(newQty) || 1;
    if (!item.isCustom && item.productId) {
      const p = products.find(x => x.id === item.productId);
      if (p) item.unitPrice = getEffectiveUnitPrice(p, item.qty);
    }
  }
  renderQOItemsList();
}
function removeQOItemRowByIdx(idx) {
  currentQuickOrderItems.splice(idx, 1);
  renderQOItemsList();
}

async function updateQuickOrderTotal() {
  const label = document.getElementById('quickOrderTotalLabel');
  if (!label) return;
  if (!currentQuickOrderItems.length) {
    label.textContent = 'الإجمالي: بانتظار التحديد الكامل';
    return;
  }
  let total = 0, hasUnknown = false;
  currentQuickOrderItems.forEach(it => {
    if (!it.isCustom && it.unitPrice) total += it.unitPrice * it.qty;
    else hasUnknown = true;
  });
  if (hasUnknown) {
    label.innerHTML = `الإجمالي التقديري: <strong style="color:var(--primary)">${fmtPrice(total)} د.أ</strong>
      <span style="color:#d97706;font-weight:600"> + مواد بانتظار تسعير الإدارة</span>`;
  } else {
    const previewClientEmail = currentUser ? (currentUser.email || 'guest') : 'guest';
    const previewClientPhone = currentUser ? (currentUser.phone || '') : '';
    const discountItems = currentQuickOrderItems.filter(it => !it.isCustom).map(it => ({ price: it.unitPrice, qty: it.qty, basePrice: it.basePrice }));
    const discountPreview = await computeGeneralDiscountForCart(discountItems, previewClientEmail, previewClientPhone);
    const subtotalForDelivery = discountPreview ? discountPreview.total : total;
    const deliveryResult = await computeCartDeliveryPreview(subtotalForDelivery, currentUser?.phone || '', currentUser || undefined);
    label.innerHTML = (discountPreview
      ? `الإجمالي: <span style="text-decoration:line-through;color:var(--text-muted);font-size:12px;font-weight:600;margin-inline-end:6px">${fmtPrice(discountPreview.originalTotal)} د.أ</span><strong style="color:var(--primary);font-size:15px">${fmtPrice(discountPreview.total)} د.أ</strong> <span style="font-size:10px;color:#e53e3e;font-weight:800">(خصم ${discountPreview.discountPercent}%)</span>`
      : `الإجمالي: <strong style="color:var(--primary);font-size:15px">${fmtPrice(total)} د.أ</strong>`) + deliveryLineHTML(deliveryResult.fee, deliveryResult.determined);
  }
}

function openQuickOrderModal() {
  currentQuickOrderItems = [];
  window._guestResolvedClient = null;
  document.getElementById('qoProductSearch').value = '';
  document.getElementById('qoAddProductSelect').value = '';
  document.getElementById('qoAddProductQty').value = '1';
  document.getElementById('qoProductDropdown').style.display = 'none';
  document.getElementById('qoNoResultsHint').style.display = 'none';
  renderQOItemsList();
  document.getElementById('quickOrderModal').classList.add('open');
}

function openLastProductDetail() {
  if (!window.lastViewedProductId) {
    showToast('يرجى اختيار منتج أولاً', 'info');
    return;
  }
  openProductDetail(window.lastViewedProductId);
}

function closeQuickOrderModal() {
  document.getElementById('quickOrderModal').classList.remove('open');
}

async function submitQuickOrder(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  if (!currentQuickOrderItems.length) {
    showToast('⚠️ يرجى إضافة مادة واحدة على الأقل', 'error');
    return;
  }
  const items = currentQuickOrderItems.map(it => ({
    productId: it.productId, ...(it.parentId ? { parentId: it.parentId, sizeLabel: it.sizeLabel || '' } : {}), ar: it.ar, en: it.en, icon: it.icon, image: it.image, isCustom: it.isCustom, qty: it.qty, unitPrice: it.unitPrice, basePrice: it.basePrice
  }));
  const hasCustomItem = items.some(it => it.isCustom);

  closeQuickOrderModal();
  proceedQuickOrderCheckout(items, hasCustomItem);
}

function proceedQuickOrderCheckout(items, hasCustomItem) {
  window._qoItems = items;
  window._qoHasCustom = hasCustomItem;
  window._qoClinic = null;
  window._qoDoctor = null;
  window._qoPhone = null;
  window._qoLocationText = null;
  window._qoLocationLat = null;
  window._qoLocationLng = null;
  // مفتاح idempotency لهذا الطلب — نقطة الالتقاء المشتركة لكل مسارات الطلب السريع
  // (من السلة عبر openQuickOrderModal، ومن عرض سعر مقبول عبر products.js مباشرة)
  window._currentOrderIdempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const clientSession = getActiveClientSession();
  const missingInfo = !clientSession || !clientSession.clinic || !clientSession.phone;
  const missingLocation = !clientSession || !((clientSession.profileLocationText && clientSession.profileLocationText.trim()) || (clientSession.profileLocationLat && clientSession.profileLocationLng));

  if (!missingInfo && !missingLocation) {
    finalizeQuickOrderSend();
  } else if (!missingInfo && missingLocation) {
    openQOLocationModal();
  } else {
    openQOInfoModal();
  }
}

function openQOInfoModal() {
  const clientSession = getActiveClientSession();
  document.getElementById('qoClinicInput').value = (clientSession && clientSession.clinic) || '';
  document.getElementById('qoDoctorInput').value = (clientSession && clientSession.name) || '';
  document.getElementById('qoPhoneInput').value  = (clientSession && clientSession.phone) || '';
  document.getElementById('qoInfoError').style.display = 'none';
  document.getElementById('qoInfoModal').classList.add('open');
}
function closeQOInfoModal() {
  document.getElementById('qoInfoModal').classList.remove('open');
}
async function submitQOInfo(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const clinic = document.getElementById('qoClinicInput').value.trim();
  const doctor = document.getElementById('qoDoctorInput').value.trim();
  const phone  = document.getElementById('qoPhoneInput').value.trim();
  if (!clinic || !doctor || !phone || phone.length < 7) {
    document.getElementById('qoInfoError').style.display = 'block';
    return;
  }
  window._qoClinic = clinic;
  window._qoDoctor = doctor;
  window._qoPhone  = phone;
  if (!getActiveClientSession() && typeof findRegisteredClientByPhone === 'function') {
    window._guestResolvedClient = await findRegisteredClientByPhone(phone);
  }

  // زائر جديد كلياً (مو مسجّل دخول، ومافي تطابق برقم هاتفه) → ننشئ له حساب فعلي الآن
  if (!getActiveClientSession() && !window._guestResolvedClient && !currentUser) {
    const email = document.getElementById('qoGuestEmail').value;
    const password = document.getElementById('qoGuestPassword').value;
    const passwordConfirm = document.getElementById('qoGuestPasswordConfirm').value;
    const result = await createGuestAccountIfNeeded(email, password, passwordConfirm, doctor, clinic, phone);
    if (!result.ok) {
      document.getElementById('qoInfoError').style.display = 'block';
      document.getElementById('qoInfoError').innerHTML = `<i class="fas fa-exclamation-circle"></i> ${result.message}`;
      return;
    }
  }

  closeQOInfoModal();

  const sessionForLocation = getActiveClientSession() || window._guestResolvedClient || null;
  const hasLocation = sessionForLocation && ((sessionForLocation.profileLocationText && sessionForLocation.profileLocationText.trim()) || (sessionForLocation.profileLocationLat && sessionForLocation.profileLocationLng));
  if (hasLocation) {
    finalizeQuickOrderSend();
  } else {
    openQOLocationModal();
  }
}


function qoSwitchLocMethod(method) {
  document.querySelectorAll('#qoLocationModal .loc-method-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('qoBtn' + method.charAt(0).toUpperCase() + method.slice(1))?.classList.add('active');
}

function qoOnAddressType() {
  const val = document.getElementById('qoAddressInput').value.trim();
  if (val.length > 5) {
    qoLocationData.address = val;
    qoLocationData.method = 'manual';
    document.getElementById('qoLocationConfirm').classList.add('show');
    document.getElementById('qoLocationConfirmText').textContent = `📍 ${val}`;
    document.getElementById('qoLocationError').classList.remove('show');
  }
}

function qoGetGPSLocation() {
  qoSwitchLocMethod('GPS');
  if (!navigator.geolocation) {
    showToast(t('المتصفح لا يدعم GPS','Browser does not support GPS'), 'error');
    return;
  }
  document.getElementById('qoGpsLoading').classList.add('show');
  document.getElementById('qoLocationConfirm').classList.remove('show');
  navigator.geolocation.getCurrentPosition(
    pos => {
      qoLocationData.lat = pos.coords.latitude.toFixed(5);
      qoLocationData.lng = pos.coords.longitude.toFixed(5);
      qoLocationData.address = `${t('خط العرض','Lat')}: ${qoLocationData.lat}, ${t('خط الطول','Lng')}: ${qoLocationData.lng}`;
      qoLocationData.method = 'gps';
      document.getElementById('qoGpsLoading').classList.remove('show');
      const box = document.getElementById('qoMapPreview');
      box.classList.add('located');
      box.innerHTML = `
        <i class="fas fa-map-marker-alt" style="color:var(--success)"></i>
        <div class="map-placeholder-text" style="color:var(--primary-dark)">تم تحديد الموقع</div>
        <div class="map-coords">📍 ${qoLocationData.lat}, ${qoLocationData.lng}</div>`;
      document.getElementById('qoLocationConfirm').classList.add('show');
      document.getElementById('qoLocationConfirmText').textContent = `✅ تم تحديد موقعك بنجاح!`;
      document.getElementById('qoLocationError').classList.remove('show');
      showToast('✅ تم تحديد موقعك بنجاح', 'success');
    },
    err => {
      document.getElementById('qoGpsLoading').classList.remove('show');
      showToast('تعذر الحصول على الموقع. يرجى إدخاله يدوياً.', 'error');
    }
  );
}

function openQOLocationModal() {
  qoLocationData = { lat: null, lng: null, address: '', method: '' };
  document.getElementById('qoAddressInput').value = '';
  document.getElementById('qoLocationConfirm').classList.remove('show');
  document.getElementById('qoLocationError').classList.remove('show');
  document.getElementById('qoGpsLoading').classList.remove('show');
  const box = document.getElementById('qoMapPreview');
  box.classList.remove('located');
  box.innerHTML = `<i class="fas fa-map-marked-alt"></i><div class="map-placeholder-text">حدد موقعك عبر GPS أو اكتب العنوان يدوياً</div>`;
  qoSwitchLocMethod('manual');
  document.getElementById('qoLocationModal').classList.add('open');
}
function closeQOLocationModal() {
  document.getElementById('qoLocationModal').classList.remove('open');
}
function submitQOLocation(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const manualVal = document.getElementById('qoAddressInput').value.trim();
  if (!qoLocationData.lat && !manualVal) {
    document.getElementById('qoLocationError').classList.add('show');
    return;
  }
  window._qoLocationText = qoLocationData.address || manualVal;
  window._qoLocationLat  = qoLocationData.lat || null;
  window._qoLocationLng  = qoLocationData.lng || null;
  closeQOLocationModal();
  finalizeQuickOrderSend();
}

async function finalizeQuickOrderSend() {
  const items = window._qoItems || [];
  const hasCustomItem = window._qoHasCustom;
  const clientSession = getActiveClientSession();
  const guestClient = clientSession || window._guestResolvedClient || null;

  const clinic = window._qoClinic || (guestClient ? guestClient.clinic : '') || '';
  const doctor = window._qoDoctor || (guestClient ? guestClient.name : '') || '';
  const phone  = window._qoPhone  || (guestClient ? guestClient.phone : '') || '';

  const locText = window._qoLocationText || (guestClient ? guestClient.profileLocationText : '') || '';
  const locLat  = window._qoLocationLat  || (guestClient ? guestClient.profileLocationLat  : null);
  const locLng  = window._qoLocationLng  || (guestClient ? guestClient.profileLocationLng  : null);
  const address = locText || (locLat && locLng ? `${t('خط العرض','Lat')}: ${locLat}, ${t('خط الطول','Lng')}: ${locLng}` : '');

  try {
    const fromQuoteDocId = window._qoQuoteDocId || null;
    const fromQuoteIdStr = window._qoQuoteIdStr || null;

    if (!hasCustomItem) {
      const ts = Date.now().toString(36).toUpperCase();
      let orderNum = fromQuoteIdStr ? `DP-${fromQuoteIdStr.replace('QT-','')}` : `DP-${ts}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;
      const rawTotal = items.reduce((s,i) => s + (i.unitPrice * i.qty), 0);
      const clientEmailForOrder = guestClient ? (guestClient.email || 'guest') : 'guest';
      const discountItems = items.map(i => ({ price: i.unitPrice, qty: i.qty, basePrice: i.basePrice }));
      const discountResult = await computeGeneralDiscountForCart(discountItems, clientEmailForOrder, phone);
      const subtotalForDelivery = discountResult ? discountResult.total : rawTotal;

      let deliveryResult;
      if (fromQuoteDocId) {
        // العرض سبق أن حُدِّدت له أجور توصيل من الأدمن وعُرضت على العميل قبل الموافقة،
        // لذا نعتمد نفس القيمة هنا بدل إعادة احتسابها تلقائياً حتى لا يتفاجأ العميل بفرق بالسعر
        deliveryResult = { fee: window._qoQuoteDeliveryFee, determined: !!window._qoQuoteDeliveryDetermined };
      } else {
        deliveryResult = await computeCartDeliveryPreview(subtotalForDelivery, phone, guestClient || undefined);
      }
      let total = deliveryResult.determined ? subtotalForDelivery + (deliveryResult.fee || 0) : subtotalForDelivery;

      const order = {
        id: orderNum,
        clientName: guestClient ? (guestClient.name || doctor) : doctor,
        clientEmail: clientEmailForOrder,
        clientUid: guestClient ? (guestClient.uid || null) : null,
        clinic, doctor, phone,
        address, locationLat: locLat || null, locationLng: locLng || null,
        notes: fromQuoteDocId ? `طلب ناتج عن عرض سعر مقبول #${fromQuoteIdStr}` : 'تم الإرسال عبر ميزة الطلب السريع',
        sourceQuoteId: fromQuoteIdStr || null,
        items: items.map(i => ({ id: i.productId, ...(i.parentId ? { parentId: i.parentId, sizeLabel: i.sizeLabel || '' } : {}), ar: i.ar, en: i.en, icon: i.icon, price: i.unitPrice, basePrice: i.basePrice || null, qty: i.qty, points: 0 })),
        total, totalPoints: 0, payMethod: 'money', pointsDeducted: false,
        deliveryFee: deliveryResult.determined ? (deliveryResult.fee || 0) : null,
        deliveryDetermined: deliveryResult.determined,
        status: 'pending', createdAt: new Date().toISOString(),
        ...(discountResult ? { originalTotal: discountResult.originalTotal, discountPercent: discountResult.discountPercent } : {})
      };

      if (window.SERVER_ORDER_CREATION_ENABLED) {
        // مسار الخادم: الدالة تحسب السعر/الخصم/التوصيل/المخزون بنفسها وتنشئ الطلب
        try {
          const serverResult = await window._fbCreateOrderFn({
            items: items.map(i => ({ id: i.productId, qty: i.qty })),
            clinic, doctor, phone, address,
            locationLat: locLat || null, locationLng: locLng || null,
            notes: order.notes, payMethod: 'money',
            sourceQuoteId: fromQuoteIdStr || null,
            idempotencyKey: window._currentOrderIdempotencyKey,
          });
          orderNum = serverResult.data.orderNum;
          total = serverResult.data.total;
          order.id = orderNum;
          order.total = total;
        } catch(serverErr) {
          showToast(`❌ ${serverErr.message}`, 'error');
          return;
        }
      } else {
        // المسار المحلي الحالي (سيُزال لاحقاً بعد التأكد من عمل مسار الخادم بثقة)
        try {
          const stockResult = await reserveOrderStock(order.items);
          order.stockReserved = stockResult.reserved;
        } catch(stockErr) {
          showToast(`❌ ${stockErr.message}`, 'error');
          return;
        }

        // محاولة سابقة فشلت بعد إنشاء الطلب؟ لا نعيد كتابته (القواعد تمنع تعديله) ونكمل تحديث حالة العرض
        let orderAlreadyExists = false;
        if (fromQuoteDocId) {
          try { orderAlreadyExists = (await window._fbGetDoc(window._fbDoc2('orders', orderNum))).exists(); } catch (e) {}
        }
        if (!orderAlreadyExists) {
          await window._fbSetDoc(window._fbDoc2('orders', orderNum), order);
        }
        if (!guestClient) rememberGuestOrder(order);
      }

      if (fromQuoteDocId) {
        await updateQuote(fromQuoteDocId, { status: 'accepted', orderStatus: 'pending' });
        removeQuoteFavoriteId(String(fromQuoteDocId));
        createNotification({
          scope: 'admin', icon: '✅', title: 'تم قبول عرض السعر',
          message: `العميل وافق على عرض السعر #${fromQuoteIdStr}، وأُنشئ الطلب #${orderNum}`,
          link: 'adminquotes:open',
        });
      } else {
        createNotification({
          scope: 'admin', icon: '⚡', title: 'طلب سريع جديد',
          message: `طلب سريع من ${clinic || doctor} بقيمة ${fmtPrice(total)} د.أ`,
          link: 'adminorders:open',
        });
      }
      showToast(
        discountResult
          ? `🎉 تم إرسال طلبك بنجاح — الإجمالي بعد الخصم: ${fmtPrice(discountResult.total)} د.أ (بدل ${fmtPrice(discountResult.originalTotal)} د.أ)`
          : '🎉 تم إرسال طلبك بنجاح، سنتواصل معك قريباً',
        'success'
      );
      if (!guestClient) showOrderConfirmation(orderNum);
      if (fromQuoteDocId) renderMyQuotesPage();
    } else {
      const ts = Date.now().toString(36).toUpperCase();
      const quoteNum = `QT-${ts}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;
      const quote = {
        id: quoteNum,
        clientName: guestClient ? (guestClient.name || doctor) : doctor,
        clientEmail: guestClient ? (guestClient.email || 'guest') : 'guest',
        clientUid: guestClient ? (guestClient.uid || null) : null,
        clinic, phone,
        items: items.map(i => ({ productId: i.productId, ar: i.ar, en: i.en, icon: i.icon, image: i.image || null, isCustom: i.isCustom, qty: i.qty, unitPrice: i.unitPrice || null })),
        notes: `تم الإرسال عبر ميزة الطلب السريع${address ? ' — الموقع: ' + address : ''}`,
        attachedImage: null, status: 'pending', createdAt: new Date().toISOString(),
      };
      await createQuoteRequest(quote);
      if (!guestClient) rememberGuestQuote(quote);
      createNotification({
        scope: 'admin', icon: '⚡', title: 'طلب سريع جديد',
        message: `${clinic || doctor} أرسل طلباً سريعاً لعدد ${items.length} مادة`,
        link: 'adminquotes:open',
      });
      showToast('🎉 تم إرسال طلبك، سنوافيك بعرض السعر النهائي قريباً', 'success');
    }
  } catch(e) {
    console.error(e);
    showToast('❌ حدث خطأ أثناء الإرسال، تحقق من الاتصال', 'error');
  } finally {
    window._qoItems = null; window._qoHasCustom = false;
    window._qoClinic = null; window._qoDoctor = null; window._qoPhone = null;
    window._qoLocationText = null; window._qoLocationLat = null; window._qoLocationLng = null;
    window._qoQuoteDocId = null; window._qoQuoteIdStr = null;
    window._qoQuoteDeliveryFee = null; window._qoQuoteDeliveryDetermined = false;
  }
}
async function submitQuoteRequest(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const showErr = msg => {
    document.getElementById('quoteFormErrorMsg').textContent = msg;
    document.getElementById('quoteFormError').style.display = 'block';
  };
  if (!currentQuoteItems.length) return showErr('يرجى إضافة مادة واحدة على الأقل');

  const clientSession = getActiveClientSession();
  let guestName = '', guestPhone = '', guestClinic = '';
  let guestClient = clientSession;
  if (!clientSession) {
    guestName   = document.getElementById('quoteGuestName').value.trim();
    guestPhone  = document.getElementById('quoteGuestPhone').value.trim();
    guestClinic = document.getElementById('quoteGuestClinic').value.trim();
    if (!guestName || !guestPhone) {
      return showErr('يرجى إدخال الاسم ورقم الهاتف للمتابعة كزائر');
    }
    if (guestPhone.length < 7) {
      return showErr('رقم الهاتف غير صحيح');
    }
    guestClient = await findRegisteredClientByPhone(guestPhone);
    window._guestResolvedClient = guestClient || null;
  }

  let attachedImageUrl = null;
  if (quotePendingImage) {
    showToast('⏳ جاري رفع الصورة...', '');
    try {
      attachedImageUrl = await uploadToCloudinary(quotePendingImage, 'dentapro_customer_uploads');
    } catch(e) {
      showErr('فشل رفع الصورة: ' + e.message);
      return;
    }
  }

  const ts = Date.now().toString(36).toUpperCase();
  const quoteNum = `QT-${ts}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;

  const quote = {
    id: quoteNum,
    clientName: guestClient ? guestClient.name : guestName,
    clientEmail: guestClient ? (guestClient.email || 'guest') : 'guest',
    clientUid: guestClient ? (guestClient.uid || null) : null,
    clinic: guestClient ? (guestClient.clinic || guestClinic || '') : guestClinic,
    phone: guestClient ? (guestClient.phone || guestPhone) : guestPhone,
    items: currentQuoteItems.map(it => {
      const p = it.productId ? products.find(x => x.id === it.productId) : null;
      return {
        productId: it.productId || null,
        ...(p && p.parentId ? { parentId: p.parentId, sizeLabel: p.sizeLabel || '' } : {}),
        ar: p ? p.ar : (it.customName || 'مادة بدون اسم'),
        en: p ? p.en : (it.customName || ''),
        icon: p ? p.icon : '✏️',
        image: p ? (p.image || null) : null,
        isCustom: !p,
        qty: it.qty || null,
        unitPrice: null,
      };
    }),
    notes: document.getElementById('quoteNotes').value.trim(),
    attachedImage: attachedImageUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    await createQuoteRequest(quote);
    document.getElementById('quoteFormError').style.display = 'none';
    closeQuoteRequestModal();
    createNotification({
      scope: 'admin',
      icon: '📄',
      title: 'طلب عرض سعر جديد',
      message: `${quote.clientName} طلب عرض سعر لعدد ${quote.items.length} مادة`,
      link: 'adminquotes:open',
    });
    showToast(
      currentUser
        ? '🎉 تم إرسال طلب عرض السعر بنجاح، سنوافيك بالرد قريباً'
        : '🎉 تم إرسال طلبك بنجاح! سنتواصل معك على رقم هاتفك قريباً',
      'success'
    );
  } catch(e) {
    console.error('❌ submitQuoteRequest error:', e.code || e.message, e);
    showErr('حدث خطأ أثناء الإرسال، تحقق من الاتصال');
  }
}

// =====================
