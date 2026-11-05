// DentaPro domain module: extracted from the original implementation.
// ADMIN PANEL
// =====================
var deleteTargetId = null;
var editingProductId = null;

function closeAdmin() {
  document.getElementById('adminPanel').classList.remove('open');
}

var LOW_STOCK_THRESHOLD = 5;

function getLowStockProducts() {
  return products.filter(p =>
    p.stock !== undefined && p.stock !== null && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD
  );
}

function updateAdminStats() {
  document.getElementById('adminStatTotal').textContent = products.filter(p => !p.parentId).length;
  document.getElementById('adminStatCats').textContent = new Set(products.map(p => p.cat)).size;
  document.getElementById('adminStatOffers').textContent = products.filter(p => p.old).length;
  document.getElementById('adminStatNew').textContent = products.filter(p => p.badge === 'جديد').length;
  renderLowStockBanner();
}

function getOutOfStockProducts() {
  return products.filter(p => p.stock !== undefined && p.stock !== null && p.stock <= 0);
}

// تصفية جدول المنتجات حسب المخزون: 'low' (على وشك النفاد) | 'out' (نفذ) | null (إلغاء التصفية)
window._adminStockFilter = null;
function setAdminStockFilter(kind) {
  window._adminStockFilter = kind || null;
  const cat = document.getElementById('adminCatFilter'); if (cat) cat.value = 'all';
  const search = document.getElementById('adminSearch'); if (search) search.value = '';
  renderAdminTable();
  const table = document.getElementById('adminTable');
  if (table && kind) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLowStockBanner() {
  ['lowStockBanner', 'outStockBanner'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

  const statsGrid = document.getElementById('adminStatTotal').closest('div[style*="grid"]');
  const makeBanner = (id, icon, title, list, kind, c) => {
    const banner = document.createElement('div');
    banner.id = id;
    banner.style.cssText = `
      margin: 0 28px 16px; padding: 14px 20px; border-radius: 14px;
      background: ${c.bg}; border: 2px solid ${c.border}; display: flex; align-items: center;
      justify-content: space-between; gap: 12px; flex-wrap: wrap;
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:24px">${icon}</div>
        <div>
          <div style="font-weight:800;font-size:14px;color:${c.text}">${title}</div>
          <div style="font-size:12px;color:${c.text};margin-top:2px">
            ${list.slice(0,3).map(p => `${escHtml(p.ar)} (${p.stock})`).join(' · ')}${list.length > 3 ? ' ...' : ''}
          </div>
        </div>
      </div>
      <button onclick="setAdminStockFilter('${kind}')"
        style="padding:8px 18px;border-radius:50px;background:${c.border};color:#fff;border:none;
               font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
        عرض الكل
      </button>`;
    return banner;
  };

  const out = getOutOfStockProducts();
  const low = getLowStockProducts();
  let anchor = statsGrid;
  if (low.length) {
    const el = makeBanner('lowStockBanner', '⚠️', `تنبيه: ${low.length} منتج على وشك النفاد`, low, 'low',
      { bg: 'linear-gradient(135deg, #fff7ed, #fffbeb)', border: '#f59e0b', text: '#92400e' });
    anchor.parentNode.insertBefore(el, anchor.nextSibling); anchor = el;
  }
  if (out.length) {
    const el = makeBanner('outStockBanner', '⛔', `تنبيه: ${out.length} منتج نفذ من المخزون`, out, 'out',
      { bg: 'linear-gradient(135deg, #fef2f2, #fff5f5)', border: '#e53e3e', text: '#991b1b' });
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }
}

// المنتجات المطابقة لتصفية جدول الإدارة الحالية (البحث + الفئة + تصفية المخزون) — يستخدمها الجدول والطباعة
function getAdminFilteredProducts() {
  const search = document.getElementById('adminSearch').value.toLowerCase();
  const catFilter = document.getElementById('adminCatFilter').value;
  const stockFilter = window._adminStockFilter;
  return products.filter(p => {
    if (p.parentId && !stockFilter) return false; // المقاسات الفرعية تظهر فقط عند تصفية المخزون
    const matchSearch = !search || p.ar.includes(search) || p.en.toLowerCase().includes(search) || p.brand.toLowerCase().includes(search);
    const matchCat = catFilter === 'all' || (catFilter === 'students' ? !!p.studentPack : p.cat === catFilter);
    const hasStock = p.stock !== undefined && p.stock !== null;
    const matchStock = !stockFilter ||
      (stockFilter === 'low' && hasStock && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD) ||
      (stockFilter === 'out' && hasStock && p.stock <= 0);
    return matchSearch && matchCat && matchStock;
  });
}

function renderAdminTable() {
  const search = document.getElementById('adminSearch').value.toLowerCase();
  const catFilter = document.getElementById('adminCatFilter').value;
  const catNames = {dev:'أجهزة',hand:'أدوات يدوية',mat:'مواد طبية',prot:'وقاية',ortho:'تقويم',impl:'زراعة',home:'منزلية'};
  const badgeColors = {'جديد':'#0a5c8a','الأكثر مبيعاً':'#e53e3e','':''};

  const stockFilter = window._adminStockFilter;
  let list = getAdminFilteredProducts();

  list = [...list].sort(stockFilter
    ? (a,b) => (a.stock - b.stock) || a.ar.localeCompare(b.ar, 'ar')
    : (a,b) => a.ar.localeCompare(b.ar, 'ar'));

  const filterNotice = stockFilter ? `<tr><td colspan="6" style="padding:10px 16px;background:${stockFilter==='out'?'#fef2f2':'#fffbeb'}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;font-weight:700;color:${stockFilter==='out'?'#991b1b':'#92400e'}">
        <span>${stockFilter==='out' ? '⛔ عرض المنتجات التي نفذت فقط' : '⚠️ عرض المنتجات التي على وشك النفاد فقط'} (${list.length})</span>
        <button onclick="setAdminStockFilter(null)" style="padding:6px 14px;border-radius:50px;border:1px solid currentColor;background:#fff;color:inherit;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">إلغاء التصفية ✕</button>
      </div></td></tr>` : '';

  const tbody = document.getElementById('adminTableBody');
  if (!list.length) {
    tbody.innerHTML = filterNotice + `<tr><td colspan="6" style="padding:0">
      <div class="empty-orders" style="padding:48px 24px">
        <i class="fas fa-box-open"></i>
        <h3>لا توجد منتجات مطابقة</h3>
        <p>جرّب تغيير كلمة البحث أو الفئة المحددة</p>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filterNotice + list.map((p, idx) => `
    <tr style="border-bottom:1px solid #f0f4f8;transition:background 0.15s" onmouseover="this.style.background='#f8fbfd'" onmouseout="this.style.background=''">
      <td style="padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:26px;flex-shrink:0;text-align:center;font-weight:800;font-size:12px;color:var(--text-muted)">${idx+1}</div>
          <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#f0f8ff,#e8f3fb);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden">
            ${p.image
              ? `<img src="${cldOptimize(p.image, 80)}" style="width:100%;height:100%;object-fit:contain" loading="lazy" decoding="async">`
              : escHtml(p.icon || '')}
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:#0f2133">${escHtml(p.ar)}</div>
            <div style="font-size:12px;color:#5a7a90">${escHtml(p.brand)} · ${escHtml(p.en.substring(0,30))}${p.en.length>30?'...':''}</div>
            ${p.studentPack ? `<div style="margin-top:4px"><span style="background:#fff4e0;color:#b45309;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:700">🎓 قسم الطلاب</span></div>` : ''}
            ${p.hasSizes ? `<div style="margin-top:4px"><span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:700">📏 ${getSizeChildren(p).length} مقاسات</span></div>` : ''}
            ${p.parentId ? `<div style="margin-top:4px"><span style="background:#e8f3fb;color:#0a5c8a;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:700">مقاس ضمن منتج متعدد المقاسات</span></div>` : ''}
            ${p.points ? `<div style="margin-top:4px"><span style="background:rgba(245,158,11,0.15);color:#d97706;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:800">🏆 ${p.points} نقطة</span></div>` : ''}
            ${(p.stock !== undefined && p.stock !== null) ? `<div style="margin-top:4px"><span style="background:${p.stock<=0?'rgba(229,62,62,0.12)':(p.stock<=LOW_STOCK_THRESHOLD?'rgba(245,158,11,0.15)':'rgba(16,185,129,0.12)')};color:${p.stock<=0?'#e53e3e':(p.stock<=LOW_STOCK_THRESHOLD?'#d97706':'#059669')};border-radius:50px;padding:2px 10px;font-size:11px;font-weight:800">${p.stock<=0?'⛔ نفذت الكمية':(p.stock<=LOW_STOCK_THRESHOLD?'⚠️ منخفض: '+p.stock:'📦 المخزون: '+p.stock)}</span></div>` : ''}
            ${p._syncFailed ? `<div style="margin-top:4px"><span onclick="retryProductSync(${p.id})" style="cursor:pointer;background:rgba(229,62,62,0.15);color:#e53e3e;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:800">⚠️ لم يُحفظ بالسحابة — اضغط لإعادة المحاولة</span></div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding:14px 16px">
        <span style="padding:4px 12px;border-radius:50px;background:#e8f3fb;color:#0a5c8a;font-size:12px;font-weight:700">${catNames[p.cat]||p.cat}</span>
      </td>
      <td style="padding:14px 16px;font-weight:800;color:#0a5c8a;font-size:15px">${p.hasSizes ? 'من ' : ''}${fmtPrice(p.price)} د.أ</td>
      <td style="padding:14px 16px;color:#5a7a90;font-size:13px;text-decoration:line-through">${p.old ? fmtPrice(p.old)+' د.أ' : '—'}</td>
      <td style="padding:14px 16px">
        ${p.badge ? `<span style="padding:4px 10px;border-radius:50px;background:${badgeColors[p.badge]||'#f59e0b'};color:#fff;font-size:11px;font-weight:700">${p.badge}</span>` : '<span style="color:#ccc;font-size:13px">—</span>'}
      </td>
      <td style="padding:14px 16px;text-align:center">
        <div style="display:flex;gap:8px;justify-content:center">
          <button onclick="openEditProduct(${p.id})" style="padding:7px 16px;border-radius:50px;background:#e8f3fb;color:#0a5c8a;border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px">
            <i class="fas fa-edit"></i> تعديل
          </button>
          ${p.parentId ? '' : `<button onclick="openDeleteConfirm(${p.id})" style="padding:7px 16px;border-radius:50px;background:#fff5f5;color:#e53e3e;border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px">
            <i class="fas fa-trash-alt"></i> حذف
          </button>`}
        </div>
      </td>
    </tr>
  `).join('');
}

// Add / Edit Product
// =====================
// IMAGE HANDLING
// =====================
// cldOptimize / compressImageFile / uploadToCloudinary انتقلت إلى js/shared/media.js

var currentProductImage = null;

function triggerImgUpload() {
  document.getElementById('pImageFile').click();
}

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('❌ حجم الصورة يتجاوز 2MB', 'error');
    return;
  }

  const preview = document.getElementById('imgPreviewBox');
  const area    = document.getElementById('imgUploadArea');
  const removeBtn = document.getElementById('removeImgBtn');

  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = '⏳ جاري رفع الصورة...';
  area.querySelector('.img-upload-hint').textContent = '';

  try {
    const url = await uploadToCloudinary(file);
    currentProductImage = url;
    preview.src = url;
    preview.classList.add('show');
    area.classList.add('has-image');
    area.querySelector('.img-upload-icon').style.display = 'none';
    area.querySelector('.img-upload-text').textContent = '✅ تم تحميل الصورة';
    area.querySelector('.img-upload-hint').textContent = file.name;
    removeBtn.style.display = 'inline-flex';
  } catch (e) {
    console.error(e);
    showToast('❌ فشل رفع الصورة، تحقق من الاتصال', 'error');
    area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
    area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  }
}

function removeProductImage() {
  currentProductImage = null;
  const preview   = document.getElementById('imgPreviewBox');
  const area      = document.getElementById('imgUploadArea');
  const removeBtn = document.getElementById('removeImgBtn');
  const fileInput = document.getElementById('pImageFile');
  preview.src = '';
  preview.classList.remove('show');
  area.classList.remove('has-image');
  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  removeBtn.style.display = 'none';
  fileInput.value = '';
}

function resetImageUpload() {
  currentProductImage = null;
  removeProductImage();
}

// ===== صور إضافية للمعرض =====
var currentProductExtraImages = [];

function triggerExtraImgUpload() {
  if (currentProductExtraImages.length >= 4) {
    showToast('⚠️ الحد الأقصى 4 صور إضافية', 'error');
    return;
  }
  document.getElementById('pExtraImageFile').click();
}

async function handleExtraImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (currentProductExtraImages.length >= 4) {
    showToast('⚠️ الحد الأقصى 4 صور إضافية', 'error');
    event.target.value = '';
    return;
  }
  showToast('⏳ جاري رفع الصورة...', '');
  try {
    const url = await uploadToCloudinary(file);
    currentProductExtraImages.push(url);
    renderExtraImagesGrid();
  } catch(e) {
    showToast('❌ فشل رفع الصورة: ' + e.message, 'error');
  }
  event.target.value = '';
}

function removeExtraImage(idx) {
  currentProductExtraImages.splice(idx, 1);
  renderExtraImagesGrid();
}

function renderExtraImagesGrid() {
  const grid = document.getElementById('extraImagesGrid');
  const uploadArea = document.getElementById('extraImgUploadArea');
  if (!grid) return;
  grid.innerHTML = currentProductExtraImages.map((url, idx) => `
    <div class="extra-img-thumb">
      <img src="${cldOptimize(url,150)}" loading="lazy">
      <button type="button" class="remove-extra-btn" onclick="removeExtraImage(${idx})"><i class="fas fa-times"></i></button>
    </div>`).join('');
  if (uploadArea) uploadArea.style.display = currentProductExtraImages.length >= 4 ? 'none' : 'block';
}

function loadExtraImages(images) {
  currentProductExtraImages = Array.isArray(images) ? [...images] : [];
  renderExtraImagesGrid();
}

function resetExtraImages() {
  currentProductExtraImages = [];
  renderExtraImagesGrid();
}
// ===== صورة القسم =====
var currentCategoryImage = null;

function triggerCatImgUpload() {
  document.getElementById('catImageFile').click();
}

async function handleCatImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('❌ حجم الصورة يتجاوز 2MB', 'error');
    return;
  }

  const preview = document.getElementById('catImgPreviewBox');
  const area    = document.getElementById('catImgUploadArea');
  const removeBtn = document.getElementById('removeCatImgBtn');

  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = '⏳ جاري رفع الصورة...';
  area.querySelector('.img-upload-hint').textContent = '';

  try {
    const url = await uploadToCloudinary(file);
    currentCategoryImage = url;
    preview.src = url;
    preview.classList.add('show');
    area.classList.add('has-image');
    area.querySelector('.img-upload-icon').style.display = 'none';
    area.querySelector('.img-upload-text').textContent = '✅ تم تحميل الصورة';
    area.querySelector('.img-upload-hint').textContent = file.name;
    removeBtn.style.display = 'inline-flex';
  } catch (e) {
    console.error(e);
    showToast('❌ فشل رفع الصورة، تحقق من الاتصال', 'error');
    area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
    area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  }
}

function removeCategoryImage() {
  currentCategoryImage = null;
  const preview   = document.getElementById('catImgPreviewBox');
  const area      = document.getElementById('catImgUploadArea');
  const removeBtn = document.getElementById('removeCatImgBtn');
  const fileInput = document.getElementById('catImageFile');
  preview.src = '';
  preview.classList.remove('show');
  area.classList.remove('has-image');
  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  removeBtn.style.display = 'none';
  fileInput.value = '';
}

function resetCatImageUpload() {
  currentCategoryImage = null;
  removeCategoryImage();
}

function loadCatImagePreview(imageUrl) {
  if (!imageUrl) { resetCatImageUpload(); return; }
  currentCategoryImage = imageUrl;
  const preview   = document.getElementById('catImgPreviewBox');
  const area      = document.getElementById('catImgUploadArea');
  const removeBtn = document.getElementById('removeCatImgBtn');
  preview.src = imageUrl;
  preview.classList.add('show');
  area.classList.add('has-image');
  area.querySelector('.img-upload-icon').style.display = 'none';
  area.querySelector('.img-upload-text').textContent = '✅ صورة محفوظة';
  area.querySelector('.img-upload-hint').textContent = 'انقر لتغييرها';
  removeBtn.style.display = 'inline-flex';
}
function loadImagePreview(imageUrl) {
  if (!imageUrl) { resetImageUpload(); return; }
  currentProductImage = imageUrl;
  const preview   = document.getElementById('imgPreviewBox');
  const area      = document.getElementById('imgUploadArea');
  const removeBtn = document.getElementById('removeImgBtn');
  preview.src = imageUrl;
  preview.classList.add('show');
  area.classList.add('has-image');
  area.querySelector('.img-upload-icon').style.display = 'none';
  area.querySelector('.img-upload-text').textContent = '✅ صورة محفوظة';
  area.querySelector('.img-upload-hint').textContent = 'انقر لتغييرها';
  removeBtn.style.display = 'inline-flex';
}
function openAddProduct() {
  editingProductId = null;
  document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة منتج جديد';
  ['pAr','pEn','pDescAr','pDescEn','pBrand','pPrice','pOldPrice','pUnitQty'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pCat').value = 'dev';
  document.getElementById('pUnit').value = 'قطعة';
  document.getElementById('pBadge').value = '';
  document.getElementById('pCountry').value = '';
  document.getElementById('pPoints').value = 0;
  document.getElementById('pPointsManual').checked = true;
  document.getElementById('pPoints').disabled = false;
  document.getElementById('pStock').value = '';
  document.getElementById('productFormError').style.display = 'none';
  resetImageUpload();
  resetExtraImages();
  resetSizesEditor();
  const spAdd = document.getElementById('pStudentPack'); if (spAdd) spAdd.checked = false;
  document.getElementById('productFormModal').classList.add('open');
}

function openEditProduct(id) {
  let p = products.find(x => x.id === id);
  if (!p) return;
  // المقاس الفرعي يُعدَّل من نموذج المنتج الرئيسي
  if (p.parentId) {
    const parent = products.find(x => x.id === p.parentId);
    if (parent) { p = parent; id = parent.id; }
  }
  editingProductId = id;
  document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل المنتج';
  document.getElementById('pAr').value = p.ar;
  document.getElementById('pEn').value = p.en;
  document.getElementById('pDescAr').value = p.desc_ar;
  document.getElementById('pDescEn').value = p.desc_en;
  document.getElementById('pBrand').value = p.brand;
  document.getElementById('pPrice').value = p.price;
  document.getElementById('pOldPrice').value = p.old || '';
  document.getElementById('pCat').value = p.cat;
  document.getElementById('pUnitQty').value = p.unitQty || '';
  document.getElementById('pUnit').value = p.unit || 'قطعة';
  document.getElementById('pBadge').value = p.badge || '';
  document.getElementById('pCountry').value = p.country || '';
  document.getElementById('pPoints').value = p.points || 0;
  document.getElementById('pPointsManual').checked = p.manualPoints !== false;
  document.getElementById('pPoints').disabled = p.manualPoints === false;
  document.getElementById('pStock').value = (p.stock !== undefined && p.stock !== null) ? p.stock : '';
  document.getElementById('productFormError').style.display = 'none';
  loadImagePreview(p.image || null);
  loadExtraImages(p.images || []);
  resetSizesEditor();
  const spEdit = document.getElementById('pStudentPack'); if (spEdit) spEdit.checked = !!p.studentPack;
  if (p.hasSizes) {
    document.getElementById('pHasSizes').checked = true;
    const fill = () => { document.getElementById('pSizesRows').innerHTML = ''; getSizeChildren(p).forEach(k => addSizeRow(k)); toggleSizesEditor(); };
    fill();
    // قد تكون بعض المقاسات لم تُحمَّل بعد (التحميل التدريجي)؛ نجلبها ثم نعيد تعبئة الصفوف
    if (getSizeChildren(p).length < (p.sizeIds || []).length) fetchProductsByIds(p.sizeIds).then(fill).catch(() => {});
  }
  document.getElementById('productFormModal').classList.add('open');
}

// ===== المنتج متعدد المقاسات: نموذج الإدارة =====
function resetSizesEditor() {
  const cb = document.getElementById('pHasSizes');
  if (cb) cb.checked = false;
  const rows = document.getElementById('pSizesRows');
  if (rows) rows.innerHTML = '';
  toggleSizesEditor();
}

function toggleSizesEditor() {
  const on = !!(document.getElementById('pHasSizes') || {}).checked;
  const ed = document.getElementById('pSizesEditor'); if (ed) ed.style.display = on ? 'block' : 'none';
  ['pPriceRow', 'pStockGroup'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = on ? 'none' : ''; });
  if (on && !document.querySelector('#pSizesRows .size-row')) addSizeRow();
}

function addSizeRow(data) {
  const wrap = document.getElementById('pSizesRows');
  if (!wrap) return;
  const row = document.createElement('div');
  row.className = 'size-row';
  row.dataset.childId = data && data.id ? String(data.id) : '';
  // خانة المقاس تأخذ سطراً كاملاً (لتتسع للكتابة)، وتحتها السعر والمخزون وزر الحذف
  row.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed var(--border)';
  const val = (v) => (v === undefined || v === null) ? '' : escHtml(String(v));
  row.innerHTML = `
    <input type="text" class="form-input size-label" placeholder="المقاس (مثال: 5 مل)" value="${val(data && data.sizeLabel)}" style="width:100%">
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center">
      <input type="number" class="form-input size-price" min="0" step="0.01" placeholder="السعر" value="${val(data && data.price)}">
      <input type="number" class="form-input size-stock" min="0" placeholder="المخزون" value="${val(data && data.stock)}">
      <button type="button" aria-label="حذف المقاس" onclick="this.closest('.size-row').remove()" style="width:34px;height:34px;border-radius:50%;border:none;background:#fff5f5;color:#e53e3e;cursor:pointer"><i class="fas fa-trash-alt"></i></button>
    </div>`;
  wrap.appendChild(row);
}

// يقرأ صفوف المقاسات ويتحقق منها: يرجع { rows } أو { error }
function collectSizeRows() {
  const rows = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('#pSizesRows .size-row')) {
    const label = el.querySelector('.size-label').value.trim();
    const price = parseFloat(el.querySelector('.size-price').value);
    const stockRaw = el.querySelector('.size-stock').value;
    if (!label && !el.querySelector('.size-price').value && stockRaw === '') continue; // صف فارغ نتجاهله
    if (!label) return { error: 'اكتب اسم كل مقاس' };
    if (!(price > 0)) return { error: `حدّد سعراً صحيحاً للمقاس "${label}"` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { error: `المقاس "${label}" مكرر` };
    seen.add(key);
    rows.push({ id: el.dataset.childId ? parseInt(el.dataset.childId, 10) : null, label, price, stock: stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10) || 0) });
  }
  if (!rows.length) return { error: 'أضف مقاساً واحداً على الأقل' };
  return { rows };
}

// ===== طباعة قائمة المنتجات (للتدقيق اليدوي على الورق) =====
// الأعمدة: التسلسل | اسم المنتج بالإنجليزي | اسم المنتج بالعربي | السعر | ملاحظات
function buildProductsPrintHtml() {
  const stockFilter = window._adminStockFilter;
  const list = getAdminFilteredProducts();
  const catName = (id) => (categories.find(c => c.id === id) || {}).ar || (id ? id : 'بدون فئة');
  const catOrder = (id) => { const i = categories.findIndex(c => c.id === id); return i < 0 ? 999 : i; };
  const COLS = 5;

  const byCat = new Map();
  list.forEach(p => { const k = p.cat || ''; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(p); });
  const cats = [...byCat.keys()].sort((a, b) => catOrder(a) - catOrder(b));

  let n = 0;
  const itemRow = (p, indent) => {
    n++;
    return `<tr>
      <td class="c">${n}</td>
      <td class="en" dir="ltr" style="${indent ? 'padding-left:22px' : ''}">${escHtml(p.en || '')}</td>
      <td style="${indent ? 'padding-right:22px' : ''}"><b>${escHtml(p.ar || '')}</b></td>
      <td class="c">${fmtPrice(p.price)}</td>
      <td class="blank"></td>
    </tr>`;
  };

  let body = '';
  cats.forEach(cid => {
    body += `<tr class="cat"><td colspan="${COLS}">${escHtml(catName(cid))}</td></tr>`;
    const items = byCat.get(cid).slice().sort(stockFilter
      ? (a, b) => (a.stock - b.stock) || a.ar.localeCompare(b.ar, 'ar')
      : (a, b) => a.ar.localeCompare(b.ar, 'ar'));
    items.forEach(p => {
      if (p.hasSizes && !stockFilter) {
        // المادة متعددة المقاسات: عنوان، وتحتها كل مقاس بسطره (كل مقاس يُجرد على حدة)
        body += `<tr class="parent"><td colspan="${COLS}">${escHtml(p.ar)} <span class="sub">— ${escHtml(p.en || '')} (مقاسات)</span></td></tr>`;
        getSizeChildren(p).forEach(k => { body += itemRow(k, true); });
      } else {
        body += itemRow(p, false);
      }
    });
  });

  const catSel = document.getElementById('adminCatFilter').value;
  const search = document.getElementById('adminSearch').value.trim();
  const filters = [];
  if (catSel !== 'all') filters.push('الفئة: ' + catName(catSel));
  if (search) filters.push('بحث: ' + search);
  if (stockFilter === 'low') filters.push('على وشك النفاد');
  if (stockFilter === 'out') filters.push('نفذت');
  const date = new Date().toLocaleDateString('ar-JO', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>جرد المنتجات</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; direction: rtl; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #444; margin-bottom: 10px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #444; padding: 5px 6px; vertical-align: middle; text-align: right; }
  th { background: #dfe7ee; font-size: 12px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .c { text-align: center; white-space: nowrap; }
  .en { text-align: left; }
  .cat td { background: #e9eef2; font-weight: 800; font-size: 13px; }
  .parent td { background: #f6f8fa; font-weight: 700; }
  .blank { height: 26px; }
  .sub { color: #555; font-size: 11px; font-weight: 400; }
  .sign { margin-top: 18px; display: flex; gap: 40px; font-size: 13px; }
  .noprint { margin: 10px 0; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="noprint"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer">🖨️ طباعة</button></div>
  <h1>جرد المنتجات — DentaPro</h1>
  <div class="meta">التاريخ: ${escHtml(date)} &nbsp;|&nbsp; عدد المواد: ${n} ${filters.length ? '&nbsp;|&nbsp; ' + escHtml(filters.join(' — ')) : ''}</div>
  <table>
    <thead><tr>
      <th class="c" style="width:44px">التسلسل</th>
      <th style="width:34%;text-align:left">اسم المنتج (English)</th>
      <th>اسم المنتج (عربي)</th>
      <th class="c" style="width:64px">السعر</th>
      <th style="width:22%">ملاحظات</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="sign"><div>اسم المدقِّق: ____________________</div><div>التاريخ: ______________</div><div>التوقيع: ______________</div></div>
  <script>window.print();<\/script>
</body></html>`;
}

// زر الطباعة: يفتح ورقة الجرد مباشرة (حسب التصفية الحالية)
function printProductsList() {
  if (!getAdminFilteredProducts().length) { showToast('⚠️ لا توجد مواد للطباعة', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { showToast('⚠️ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة', 'error'); return; }
  win.document.write(buildProductsPrintHtml());
  win.document.close();
}
function openProductsPrintOptions() { printProductsList(); } // اسم قديم محفوظ للتوافق

function closeProductForm() {
  document.getElementById('productFormModal').classList.remove('open');
}

function showProductFormError(msg) {
  const el = document.getElementById('productFormError');
  el.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (msg || 'يرجى ملء جميع الحقول الإلزامية');
  el.style.display = 'block';
}

// ينشئ/يحدّث المنتجات الفرعية (المقاسات) للمنتج الرئيسي ويحذف ما أُزيل من الصفوف
async function syncSizeChildren(parent, base, rows) {
  const prevKids = products.filter(x => x.parentId === parent.id);
  const keep = new Set(rows.filter(r => r.id).map(r => r.id));
  const removed = prevKids.filter(k => !keep.has(k.id));
  const stoppedBundles = [];
  const ids = [];
  const toSave = [];
  for (const r of rows) {
    const common = {
      cat: base.cat, brand: base.brand, unit: base.unit, unitQty: base.unitQty,
      desc_ar: base.desc_ar, desc_en: base.desc_en, country: base.country,
      image: base.image, images: base.images, points: base.points, manualPoints: base.manualPoints,
      ar: `${base.ar} — ${r.label}`, en: `${base.en} — ${r.label}`,
      price: r.price, old: null, badge: null, stock: r.stock,
      parentId: parent.id, sizeLabel: r.label,
    };
    let kid = r.id ? products.find(x => x.id === r.id) : null;
    if (kid) {
      Object.assign(kid, common);
    } else {
      const newId = await getNextId('products', products);
      kid = { id: newId, icon: parent.icon || '📦', createdAt: new Date().toISOString(), ...common };
      products.push(kid);
    }
    ids.push(kid.id);
    toSave.push(kid);
  }
  parent.sizeIds = ids;
  removed.forEach(k => {
    const i = products.findIndex(x => x.id === k.id);
    if (i !== -1) products.splice(i, 1);
    stoppedBundles.push(...purgeProductRefs(k.id));
  });
  return { toSave, removed, stoppedBundles };
}

// ينظّف السلة والعروض من منتج محذوف. الباقة التي يُحذف أحد عناصرها تُوقَف (لا تبقى بمحتوى أقل وبسعرها القديم)،
// ويرجع أسماء الباقات التي أُوقفت لتنبيه الأدمن
function purgeProductRefs(id) {
  cart = cart.filter(x => x.id !== id);
  offers = offers.filter(o => !(o.type === 'qty' && o.productId === id));
  const stopped = [];
  offers.forEach(o => {
    // مقاس محذوف: يُزال من مقاسات الشرائح؛ والشريحة التي لا يبقى لها مقاس تُحذف (لا تتحول لشريحة على كل المقاسات)
    if (o.type === 'qty' && Array.isArray(o.tiers)) {
      o.tiers = o.tiers.filter(tr => {
        if (!Array.isArray(tr.sizeIds) || !tr.sizeIds.includes(id)) return true;
        tr.sizeIds = tr.sizeIds.filter(sid => sid !== id);
        return tr.sizeIds.length > 0;
      });
    }
    if (o.type === 'bundle' && o.items) {
      let broke = o.items.some(it => it.productId === id);
      o.items = o.items.filter(it => it.productId !== id);
      o.items.forEach(it => {
        if (Array.isArray(it.sizeIds) && it.sizeIds.includes(id)) {
          it.sizeIds = it.sizeIds.filter(sid => sid !== id);
          if (!it.sizeIds.length) broke = true;
        }
      });
      if (broke) {
        if (o.active) stopped.push(o.name_ar || o.name_en || 'باقة');
        o.active = false;
      }
    }
  });
  offers = offers.filter(o => !(o.type === 'qty' && (!o.tiers || !o.tiers.length)));
  saveOffers();
  return stopped;
}

function warnStoppedBundles(names) {
  const uniq = [...new Set(names)];
  if (uniq.length) showToast(`⚠️ أُوقفت الباقة: ${uniq.join('، ')} لأن أحد مقاساتها/موادها حُذف. راجعها ثم أعد تفعيلها.`, 'error');
}

async function saveProduct() {
  const ar = document.getElementById('pAr').value.trim();
  const en = document.getElementById('pEn').value.trim();
  const brand = document.getElementById('pBrand').value.trim();
  const hasSizes = !!document.getElementById('pHasSizes').checked;
  const prevProduct = editingProductId ? products.find(x => x.id === editingProductId) : null;
  const wasSizes = !!(prevProduct && prevProduct.hasSizes);

  let sizeRows = [];
  let price;
  if (hasSizes) {
    const r = collectSizeRows();
    if (r.error) { showProductFormError(r.error); return; }
    sizeRows = r.rows;
    price = Math.min(...sizeRows.map(x => x.price)); // سعر المنتج الرئيسي = أقل سعر بين المقاسات (يظهر "من X")
  } else {
    price = parseFloat(document.getElementById('pPrice').value);
  }

  if (!ar || !en || !brand || !price) {
    showProductFormError();
    return;
  }
  document.getElementById('productFormError').style.display = 'none';

  const oldPrice = parseFloat(document.getElementById('pOldPrice').value) || null;
  const unit = document.getElementById('pUnit').value || 'قطعة';
  const unitQty = document.getElementById('pUnitQty').value.trim() || '';
  const productData = {
    cat: document.getElementById('pCat').value,
    brand, ar, en,
    price, old: oldPrice, unit, unitQty,
    desc_ar: document.getElementById('pDescAr').value.trim() || ar,
    desc_en: document.getElementById('pDescEn').value.trim() || en,
    badge:   (document.getElementById('pBadge').value || '').trim() || null,
    country: document.getElementById('pCountry').value.trim() || '',
    image:   currentProductImage || null,
    images:  currentProductExtraImages.slice(),
    points:  parseInt(document.getElementById('pPoints').value) || 0,
    manualPoints: document.getElementById('pPointsManual').checked,
    stock:   document.getElementById('pStock').value === '' ? null : parseInt(document.getElementById('pStock').value),
  };
  const studentPack = !!(document.getElementById('pStudentPack') || {}).checked;
  if (studentPack) productData.studentPack = true;
  else if (prevProduct && prevProduct.studentPack) productData.studentPack = false; // أُلغي: يخرج من قسم الطلاب ويبقى في قسمه الأصلي
  if (hasSizes) {
    productData.hasSizes = true;
    productData.old = null;
    productData.stock = null; // مخزون المنتج الرئيسي غير مستخدم: لكل مقاس مخزونه
  } else if (wasSizes) {
    productData.hasSizes = false;
    productData.sizeIds = [];
  }
  if (!editingProductId) {
    productData.icon = '📦'; // أيقونة افتراضية للمنتجات الجديدة فقط (تُستخدم إن لم تُرفع صورة)
    productData.createdAt = new Date().toISOString();
  }

  let savedProduct;
  if (editingProductId) {
    const idx = products.findIndex(x => x.id === editingProductId);
    if (idx !== -1) products[idx] = { ...products[idx], ...productData };
    savedProduct = products[idx];
    showToast('✅ تم تعديل المنتج بنجاح', 'success');
  } else {
    const newId = await getNextId('products', products);
    savedProduct = { id: newId, ...productData };
    products.push(savedProduct);
    showToast('✅ تم إضافة المنتج بنجاح', 'success');
    createNotification({
      scope: 'broadcast',
      icon: '🆕',
      title: 'منتج جديد في DentaPro',
      message: `${ar} — ${hasSizes ? 'من ' : ''}${fmtPrice(price)} د.أ`,
      link: `product:${newId}`,
    });
  }

  // المقاسات الفرعية (إن وُجدت أو كانت موجودة سابقاً)
  let sizeSync = { toSave: [], removed: [], stoppedBundles: [] };
  if (hasSizes || wasSizes) {
    sizeSync = await syncSizeChildren(savedProduct, productData, hasSizes ? sizeRows : []);
    warnStoppedBundles(sizeSync.stoppedBundles);
  }

  // تفعيل قسم الطلاب لأول مرة: ينشئ القسم ضمن الأقسام
  const studentsCatCreated = studentPack ? ensureStudentsCategory() : false;
  if (studentsCatCreated) populateCategorySelects();

  cacheProductsLocally();
  closeProductForm();
  updateAdminStats();
  renderAdminTable();
  renderProducts();
  renderCategories();
  await saveProductToFirebase(savedProduct);
  if (studentsCatCreated) await saveCategories();
  for (const kid of sizeSync.toSave) await saveProductToFirebase(kid);
  for (const k of sizeSync.removed) await deleteProductFromFirebase(k.id);
}

// Delete Product
function openDeleteConfirm(id) {
  deleteTargetId = id;
  const p = products.find(x => x.id === id);
  document.getElementById('deleteProductName').textContent = p ? `${p.icon || ''} ${p.ar || ''}` : '';
  document.getElementById('deleteConfirmModal').classList.add('open');
}
function closeDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.remove('open');
  deleteTargetId = null;
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  const p = products.find(x => x.id === deleteTargetId);
  // حذف المنتج متعدد المقاسات يحذف مقاساته الفرعية أيضاً
  const sizeKids = products.filter(x => x.parentId === deleteTargetId);
  const stoppedBundles = [];
  sizeKids.forEach(k => {
    const ki = products.findIndex(x => x.id === k.id);
    if (ki !== -1) products.splice(ki, 1);
    stoppedBundles.push(...purgeProductRefs(k.id));
  });
  const idx = products.findIndex(x => x.id === deleteTargetId);
  if (idx !== -1) products.splice(idx, 1);
  cart = cart.filter(x => x.id !== deleteTargetId);

  // تنظيف العروض المرتبطة بالمنتج المحذوف (الباقات المتأثرة تُوقَف)
  stoppedBundles.push(...purgeProductRefs(deleteTargetId));

  cacheProductsLocally();
  const deletedId = deleteTargetId;
  closeDeleteConfirm();
  updateAdminStats();
  renderAdminTable();
  renderProducts();
  renderCategories();
  renderOffers();
  initOffersTicker();
  updateCartUI();
  showToast(`🗑️ تم حذف "${p?.ar}" بنجاح`, 'success');
  warnStoppedBundles(stoppedBundles);
  await deleteProductFromFirebase(deletedId);
  for (const k of sizeKids) await deleteProductFromFirebase(k.id);
}
// =====================
// POINTS SYSTEM
// =====================

// جلب نقاط عميل معين
// getClientPoints انتقلت إلى js/shared/loyalty.js

// حفظ نقاط عميل
async function saveClientPoints(uid, email, delta, logTemplate) {
  if (!uid) { console.warn('saveClientPoints: uid مفقود'); return; }

  try {
    for (let i = 0; i < 15; i++) {
      if (window._fbDoc2 && window._fbRunTransaction) break;
      await new Promise(r => setTimeout(r, 200));
    }
    const ref = window._fbDoc2('points', uid);
    const finalBalance = await window._fbRunTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? (snap.data().balance || 0) : 0;
      const logs = snap.exists() ? (snap.data().logs || []) : [];
      const next = current + delta;
      if (next < 0) throw new Error('الرصيد غير كافٍ لإتمام هذه العملية');
      const log = { ...logTemplate, balance: next };
      logs.unshift(log);
      tx.set(ref, { email, uid, balance: next, logs });
      return next;
    });

    const saved = JSON.parse(localStorage.getItem('dentapro_points') || '{}');
    saved[uid] = finalBalance;
    localStorage.setItem('dentapro_points', JSON.stringify(saved));
    console.log('✅ تم حفظ النقاط في Firebase:', email, finalBalance);
    return finalBalance;
  } catch(e) {
    console.warn('⚠️ فشل تحديث النقاط:', e.message);
    throw e;
  }
}

// عرض رصيد النقاط في الهيدر
// renderPointsInHeader انتقلت إلى js/shared/loyalty.js

// ── ADMIN: عرض قائمة العملاء ونقاطهم ──
async function renderAdminPoints() {
  const container = document.getElementById('adminPointsList');
  container.innerHTML = `
    <div style="text-align:center;padding:32px;color:var(--text-muted)">
      <div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:4px"></div>
      جاري تحميل العملاء...
    </div>`;
  try {
    // جلب العملاء من Firestore مباشرة
    for (let i = 0; i < 20; i++) {
      if (window._fbCollection && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const usersSnap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
    let users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.role === 'client');

    // دمج مع localStorage للمستخدمين القدامى
    const localUsers = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    localUsers.forEach(lu => {
      if (!users.find(u => u.email === lu.email)) users.push(lu);
    });

    if (!users.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:48px;color:var(--text-muted)">
          <i class="fas fa-users" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px"></i>
          <h3 style="font-weight:800;margin-bottom:8px">لا يوجد عملاء مسجلون بعد</h3>
        </div>`;
      return;
    }

    // جلب الطلبات لحساب إجمالي المشتريات
    const ordersSnap = await window._fbGetDocs(window._fbOrdersRef());
    const allOrders  = ordersSnap.docs.map(d => d.data());

    const usersWithData = await Promise.all(users.map(async u => {
      const balance    = await getClientPoints(u.uid);
      const userOrders = allOrders.filter(o => o.clientEmail === u.email);
      const totalSpent = userOrders.reduce((s, o) => s + (o.total || 0), 0);
      return { ...u, balance, orderCount: userOrders.length, totalSpent };
    }));

    container.innerHTML = usersWithData.map(u => `
      <div class="points-admin-card">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));
            display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:800;flex-shrink:0">
            ${(u.firstName||u.name||'؟').charAt(0)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">${escHtml(u.firstName || u.name || 'عميل')}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(u.clinic || '')} · ${escHtml(u.email)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center">
              <span class="points-badge"><i class="fas fa-star"></i> ${u.balance} نقطة</span>
              <span style="font-size:12px;color:var(--text-muted)">
                <i class="fas fa-shopping-bag" style="color:var(--primary-light)"></i> ${u.orderCount} طلب
              </span>
              <span style="font-size:12px;font-weight:800;color:var(--primary)">
                ${fmtPrice(u.totalSpent)} د.أ
              </span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button onclick="showClientRecord('${escJsAttr(u.uid)}','${escJsAttr(u.email)}')"
            style="padding:8px 16px;border-radius:50px;background:#e8f3fb;color:var(--primary);
            border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;
            display:flex;align-items:center;gap:5px">
            <i class="fas fa-folder-open"></i> السجل
          </button>
          <button class="add-points-btn" onclick="openAddPointsModal('${escJsAttr(u.uid)}','${escJsAttr(u.email)}','${escJsAttr(u.firstName||u.name||'عميل')}','${escJsAttr(u.clinic||'')}',${u.balance},'add')">
            <i class="fas fa-plus"></i> نقاط
          </button>
          <button class="add-points-btn" style="background:linear-gradient(135deg,#e53e3e,#c53030);box-shadow:0 2px 8px rgba(229,62,62,0.3)"
            onclick="openAddPointsModal('${escJsAttr(u.uid)}','${escJsAttr(u.email)}','${escJsAttr(u.firstName||u.name||'عميل')}','${escJsAttr(u.clinic||'')}',${u.balance},'deduct')">
            <i class="fas fa-minus"></i>
          </button>
        </div>
      </div>
    `).join('');

  } catch(e) {
    console.error(e);
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger)">خطأ في تحميل البيانات: ${e.message}</div>`;
  }
}

// =====================
// ADMIN: OFFERS MANAGEMENT
// =====================
function renderAdminOffers() {
  const container = document.getElementById('adminOffersList');
  if (!offers.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <i class="fas fa-gift" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px"></i>
      لا توجد عروض حالياً</div>`;
    return;
  }
  container.innerHTML = offers.map(o => {
    if (o.type === 'text') {
      return `
      <div class="points-admin-card">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
          <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#f3e8ff,#e9d5ff);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📢</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">${escHtml(o.text)}</div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:800;color:${o.active?'#15803d':'#94a3b8'}">${o.active?'● فعّال':'○ متوقف'}</span>
              ${o.expiresAt ? `<span class="offer-countdown-badge mini" style="margin:0"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${o.expiresAt}">${formatCountdown(o.expiresAt)||''}</span></span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="toggleOfferActive(${o.id})" style="padding:7px 14px;border-radius:50px;background:#f8fbfd;color:var(--text-muted);border:1.5px solid var(--border);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-power-off"></i></button>
          <button onclick="openAddTextOffer(${o.id})" style="padding:7px 14px;border-radius:50px;background:#e8f3fb;color:var(--primary);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-edit"></i></button>
          <button onclick="deleteOffer(${o.id})" style="padding:7px 14px;border-radius:50px;background:#fff5f5;color:var(--danger);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    } else if (o.type === 'qty') {
      const p = products.find(x => x.id === o.productId);
      const tiersHtml = (o.tiers || []).map(tr =>
        `<span style="background:#f0f8ff;border-radius:50px;padding:3px 10px;font-size:12px;font-weight:700;color:var(--primary);margin-left:4px">${tr.qty}× = ${tr.price} د.أ</span>`
      ).join('');
      return `
      <div class="points-admin-card">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
          <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#f0f8ff,#e8f3fb);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${p?p.icon:'🏷️'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">🏷️ ${p?p.ar:'منتج محذوف'}</div>
            <div style="margin-top:6px">${tiersHtml}</div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:800;color:${o.active?'#15803d':'#94a3b8'}">${o.active?'● فعّال':'○ متوقف'}</span>
              ${o.expiresAt ? `<span class="offer-countdown-badge mini" style="margin:0"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${o.expiresAt}">${formatCountdown(o.expiresAt)||''}</span></span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="toggleOfferActive(${o.id})" style="padding:7px 14px;border-radius:50px;background:#f8fbfd;color:var(--text-muted);border:1.5px solid var(--border);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-power-off"></i></button>
          <button onclick="openEditQtyOffer(${o.id})" style="padding:7px 14px;border-radius:50px;background:#e8f3fb;color:var(--primary);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-edit"></i></button>
          <button onclick="deleteOffer(${o.id})" style="padding:7px 14px;border-radius:50px;background:#fff5f5;color:var(--danger);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    } else {
      const original = getBundleOriginalPrice(o);
      const itemsDetailHtml = (o.items || []).map(it => {
        const ip = products.find(x => x.id === it.productId);
        return ip ? `<span style="background:#f0f8ff;border-radius:50px;padding:2px 10px;font-size:11px;font-weight:700;color:var(--primary);margin-left:4px;display:inline-block;margin-top:4px">${ip.ar} × ${it.qty}</span>` : '';
      }).join('');
      return `
      <div class="points-admin-card">
        <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
          <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#fffbeb,#fef3c7);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden">
            ${o.image?`<img src="${escHtml(cldOptimize(o.image,80))}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`:escHtml(o.icon||'🎁')}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">🎁 ${escHtml(o.name_ar)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${fmtPrice(original)} ← ${fmtPrice(o.bundlePrice)} د.أ</div>
            <div style="margin-top:4px">${itemsDetailHtml}</div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:800;color:${o.active?'#15803d':'#94a3b8'}">${o.active?'● فعّال':'○ متوقف'}</span>
              ${o.expiresAt ? `<span class="offer-countdown-badge mini" style="margin:0"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${o.expiresAt}">${formatCountdown(o.expiresAt)||''}</span></span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="toggleOfferActive(${o.id})" style="padding:7px 14px;border-radius:50px;background:#f8fbfd;color:var(--text-muted);border:1.5px solid var(--border);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-power-off"></i></button>
          <button onclick="openEditBundle(${o.id})" style="padding:7px 14px;border-radius:50px;background:#e8f3fb;color:var(--primary);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-edit"></i></button>
          <button onclick="deleteOffer(${o.id})" style="padding:7px 14px;border-radius:50px;background:#fff5f5;color:var(--danger);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    }
  }).join('');
}

function openAddTextOffer(id) {
  document.getElementById('textOfferId').value = id || '';
  document.getElementById('textOfferText').value = '';
  document.getElementById('textOfferTextEn').value = '';
  document.getElementById('textOfferExpiry').value = '';
  document.getElementById('textOfferShowBanner').checked = false;
  document.getElementById('textOfferError').style.display = 'none';
  removeTextOfferImage();
  if (id) {
    const o = offers.find(x => x.id === id);
    if (o) {
      document.getElementById('textOfferText').value = o.text || '';
      document.getElementById('textOfferTextEn').value = o.textEn || '';
      if (o.expiresAt) document.getElementById('textOfferExpiry').value = toDatetimeLocalValue(o.expiresAt);
      document.getElementById('textOfferShowBanner').checked = !!o.showInBanner;
      if (o.image) loadTextOfferImagePreview(o.image);
    }
  }
  document.getElementById('textOfferModal').classList.add('open');
}
function closeTextOfferModal() {
  document.getElementById('textOfferModal').classList.remove('open');
}
async function saveTextOffer() {
  const text = document.getElementById('textOfferText').value.trim();
  const textEn = document.getElementById('textOfferTextEn').value.trim();
  if (!text) {
    document.getElementById('textOfferError').style.display = 'flex';
    return;
  }
  const editId = parseInt(document.getElementById('textOfferId').value) || null;
  const expiryVal = document.getElementById('textOfferExpiry').value;
  const expiresAt = normalizeOfferExpiry(expiryVal);

  const showInBanner = document.getElementById('textOfferShowBanner').checked;
  if (editId) {
    const o = offers.find(x => x.id === editId);
    if (o) { o.text = text; o.textEn = textEn; o.expiresAt = expiresAt; o.showInBanner = showInBanner; o.image = currentTextOfferImage; }
  } else {
    const newId = await getNextId('offers', offers);
    offers.push({ id: newId, type: 'text', text, textEn, expiresAt, showInBanner, image: currentTextOfferImage, active: true, createdAt: new Date().toISOString() });
  }
  saveOffers();
  renderAdminOffers();
  initOffersTicker();
  closeTextOfferModal();
  showToast('✅ تم حفظ النص الإعلاني', 'success');
}

var currentTextOfferImage = null;
function triggerTextOfferImgUpload() { document.getElementById('textOfferImageFile').click(); }

async function handleTextOfferImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('❌ حجم الصورة يتجاوز 2MB', 'error'); return; }
  const preview = document.getElementById('textOfferImgPreviewBox');
  const area = document.getElementById('textOfferImgUploadArea');
  const removeBtn = document.getElementById('removeTextOfferImgBtn');
  area.querySelector('.img-upload-text').textContent = '⏳ جاري رفع الصورة...';
  try {
    const url = await uploadToCloudinary(file);
    currentTextOfferImage = url;
    preview.src = url; preview.classList.add('show');
    area.classList.add('has-image');
    area.querySelector('.img-upload-icon').style.display = 'none';
    area.querySelector('.img-upload-text').textContent = '✅ تم تحميل الصورة';
    area.querySelector('.img-upload-hint').textContent = file.name;
    removeBtn.style.display = 'inline-flex';
  } catch (e) {
    showToast('❌ فشل رفع الصورة، تحقق من الاتصال', 'error');
    area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  }
}

function removeTextOfferImage() {
  currentTextOfferImage = null;
  const preview = document.getElementById('textOfferImgPreviewBox');
  const area = document.getElementById('textOfferImgUploadArea');
  const removeBtn = document.getElementById('removeTextOfferImgBtn');
  preview.src = ''; preview.classList.remove('show');
  area.classList.remove('has-image');
  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  removeBtn.style.display = 'none';
  document.getElementById('textOfferImageFile').value = '';
}

function loadTextOfferImagePreview(url) {
  currentTextOfferImage = url;
  const preview = document.getElementById('textOfferImgPreviewBox');
  const area = document.getElementById('textOfferImgUploadArea');
  const removeBtn = document.getElementById('removeTextOfferImgBtn');
  preview.src = url; preview.classList.add('show');
  area.classList.add('has-image');
  area.querySelector('.img-upload-icon').style.display = 'none';
  area.querySelector('.img-upload-text').textContent = '✅ صورة محفوظة';
  area.querySelector('.img-upload-hint').textContent = 'انقر لتغييرها';
  removeBtn.style.display = 'inline-flex';
}

function toggleOfferActive(id) {
  const o = offers.find(x => x.id === id);
  if (!o) return;
  o.active = !o.active;
  saveOffers();
  renderAdminOffers();
  renderOffers();
  renderProducts();
  initOffersTicker();
  showToast(o.active ? '✅ تم تفعيل العرض' : '⏸️ تم إيقاف العرض', 'success');
}

function deleteOffer(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العرض؟')) return;
  offers = offers.filter(x => x.id !== id);
  saveOffers();
  renderAdminOffers();
  renderOffers();
  renderProducts();
  initOffersTicker();
  showToast('🗑️ تم حذف العرض', 'success');
}

// ============================
// أدوات مشتركة لقوائم اختيار المادة في عرض الكمية والباقة (قائمة + خانة بحث، والمادة تظهر مرة واحدة)
// ============================
function dpAdminMaterials(selectedId) {
  const list = products.filter(p => !p.parentId);
  const sel = selectedId ? products.find(p => p.id === selectedId) : null;
  if (sel && sel.parentId) list.push(sel); // عرض/باقة قديمة على مقاس منفرد
  return list.sort((a, b) => (a.ar || '').localeCompare(b.ar || '', 'ar'));
}

function dpMaterialOptionLabel(p) {
  const n = p.hasSizes ? getSizeChildren(p).length || (p.sizeIds || []).length : 0;
  return `${p.ar}${p.hasSizes ? ` (${n} مقاسات)` : ''} — ${p.brand || ''}`;
}

// يعيد بناء خيارات القائمة حسب نص البحث، مع إبقاء الاختيار الحالي ظاهراً
async function dpFillMaterialSelect(selectId, searchId, selectedId) {
  const sel = document.getElementById(selectId);
  const searchEl = document.getElementById(searchId);
  if (!sel) return;
  // المنتجات تُحمَّل بالصفحات، فنضمن تحميل الكتالوج كاملاً حتى يشمل البحث كل المواد
  if (typeof _productsAllLoaded !== 'undefined' && !_productsAllLoaded && typeof ensureAllProductsLoaded === 'function') {
    const keepNow = selectedId !== undefined && selectedId !== null ? String(selectedId) : sel.value;
    if (!sel.options.length || !keepNow) sel.innerHTML = '<option value="">⏳ جارٍ تحميل المواد...</option>';
    try { await ensureAllProductsLoaded(); } catch (e) {}
  }
  const keep = selectedId !== undefined && selectedId !== null ? String(selectedId) : sel.value;
  const term = searchEl ? searchEl.value.trim() : '';
  const nt = normalizeArabic(term);
  const lt = term.toLowerCase();
  const list = dpAdminMaterials(keep ? parseInt(keep) : null).filter(p =>
    !term || String(p.id) === keep ||
    normalizeArabic(p.ar || '').includes(nt) || normalizeArabic(p.brand || '').includes(nt) || (p.en || '').toLowerCase().includes(lt)
  );
  sel.innerHTML = `<option value="">${list.length ? '— اختر مادة —' : '— لا توجد نتائج —'}</option>` +
    list.map(p => `<option value="${escHtml(p.id)}">${escHtml(dpMaterialOptionLabel(p))}</option>`).join('');
  sel.value = keep && list.some(p => String(p.id) === keep) ? keep : '';
}

// قائمة مقاسات بخانات اختيار مع أسعارها
function dpSizeChecklistHTML(kids, checkedIds, cbClass) {
  return kids.map(k => {
    const on = !checkedIds || checkedIds.some(i => String(i) === String(k.id));
    return `<label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:50px;border:1.5px solid var(--border);background:#fff;font-size:12px;font-weight:700;cursor:pointer;margin:0 0 6px 6px">
      <input type="checkbox" class="${cbClass}" value="${k.id}" ${on ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer">
      ${escHtml(k.sizeLabel || k.ar)} <span style="color:var(--primary);font-weight:800">${fmtPrice(k.price)} د.أ</span>
    </label>`;
  }).join('');
}

function dpCheckedSizeIds(container, cbClass) {
  return [...container.querySelectorAll('input.' + cbClass + ':checked')].map(cb => parseInt(cb.value));
}

function dpToggleAllSizes(btn, cbClass) {
  const box = btn.closest('.size-check-box');
  const cbs = box.querySelectorAll('input.' + cbClass);
  const all = [...cbs].every(cb => cb.checked);
  cbs.forEach(cb => { cb.checked = !all; });
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

// ============================
// عرض الكمية (الأدمن): مستوى = كمية + سعر إجمالي + المقاسات المشمولة (للمادة ذات المقاسات)
// ============================
function dpQtyOfferProduct() {
  const id = parseInt(document.getElementById('qtyOfferProduct').value);
  return id ? products.find(x => x.id === id) : null;
}

function addTierRow(qty = '', price = '', sizeIds) {
  const list = document.getElementById('qtyTiersList');
  const block = document.createElement('div');
  block.className = 'tier-block';
  block.style.cssText = 'border:1.5px solid var(--border);border-radius:12px;padding:10px;background:#fafcfe';
  block.innerHTML = `
    <div class="tier-row">
      <input type="number" class="form-input tier-qty" placeholder="الكمية" min="1" value="${qty}" style="flex:1">
      <input type="number" class="form-input tier-price" placeholder="السعر الإجمالي" min="0" step="any" value="${price}" style="flex:1">
      <button type="button" onclick="this.closest('.tier-block').remove()" style="width:38px;height:38px;border-radius:50%;background:#fff5f5;color:var(--danger);border:none;cursor:pointer;flex-shrink:0"><i class="fas fa-times"></i></button>
    </div>
    <div class="tier-sizes size-check-box" style="margin-top:8px"></div>
    <div class="tier-hint" style="font-size:12px;font-weight:700;color:var(--text-muted);margin-top:4px"></div>`;
  list.appendChild(block);
  dpRenderTierSizes(block, sizeIds);
}

// يرسم قائمة مقاسات المستوى بحسب المادة المختارة (sizeIds = المقاسات المحددة سابقاً؛ بدونها تُحدَّد كل المقاسات)
function dpRenderTierSizes(block, sizeIds) {
  const box = block.querySelector('.tier-sizes');
  const p = dpQtyOfferProduct();
  block.dataset.pid = p ? p.id : '';
  if (!p || !p.hasSizes) { box.innerHTML = ''; dpUpdateTierHint(block); return; }
  const kids = getSizeChildren(p);
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:12px;font-weight:800;color:var(--primary-dark)">المقاسات المشمولة بهذا المستوى</span>
      <button type="button" onclick="dpToggleAllSizes(this,'tier-size-cb')" style="background:none;border:none;color:var(--primary);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">تحديد/إلغاء الكل</button>
    </div>` + dpSizeChecklistHTML(kids, sizeIds, 'tier-size-cb');
  dpUpdateTierHint(block);
}

// سطر توضيحي: سعر القطعة بالعرض، مع تنبيه لو تجاوز السعر العادي لأحد المقاسات المشمولة
function dpUpdateTierHint(block) {
  const hint = block.querySelector('.tier-hint');
  if (!hint) return;
  const qty = parseInt(block.querySelector('.tier-qty').value);
  const price = parseFloat(block.querySelector('.tier-price').value);
  if (!(qty > 0 && price > 0)) { hint.textContent = ''; return; }
  const unit = price / qty;
  let txt = `سعر القطعة بالعرض = ${fmtPrice(Math.round(unit * 1000) / 1000)} د.أ (يُطبَّق على كل القطع المشمولة)`;
  let warn = false;
  const p = dpQtyOfferProduct();
  if (p && p.hasSizes) {
    const ids = dpCheckedSizeIds(block, 'tier-size-cb');
    const prices = getSizeChildren(p).filter(k => ids.includes(k.id)).map(k => parseFloat(k.price) || 0);
    if (prices.length && unit > Math.min(...prices) + 1e-9) { warn = true; txt += ` — ⚠️ أعلى من السعر العادي لأقل مقاس مشمول (${fmtPrice(Math.min(...prices))} د.أ)`; }
  }
  hint.style.color = warn ? '#d97706' : 'var(--text-muted)';
  hint.textContent = txt;
}

function dpBindTierListEvents() {
  const list = document.getElementById('qtyTiersList');
  if (!list || list.dataset.bound) return;
  list.dataset.bound = '1';
  const h = (e) => { const b = e.target.closest('.tier-block'); if (b) dpUpdateTierHint(b); };
  list.addEventListener('input', h);
  list.addEventListener('change', h);
}

// عند تغيير المادة: نحمّل مقاساتها ثم نعيد رسم مقاسات كل المستويات (تُحدَّد كلها لمادة جديدة)
async function onQtyOfferProductChange() {
  const p = dpQtyOfferProduct();
  if (p && p.hasSizes && getSizeChildren(p).length < (p.sizeIds || []).length) {
    try { await fetchProductsByIds(p.sizeIds); } catch (e) {}
  }
  document.querySelectorAll('#qtyTiersList .tier-block').forEach(b => {
    const same = p && String(b.dataset.pid) === String(p.id);
    dpRenderTierSizes(b, same ? dpCheckedSizeIds(b, 'tier-size-cb') : undefined);
  });
}

function openAddQtyOffer() {
  document.getElementById('qtyOfferTitle').innerHTML = '<i class="fas fa-tag"></i> إضافة عرض كمية';
  document.getElementById('qtyOfferId').value = '';
  document.getElementById('qtyOfferError').style.display = 'none';
  document.getElementById('qtyOfferExpiry').value = '';
  document.getElementById('qtyOfferShowBanner').checked = false;
  document.getElementById('qtyOfferProductSearch').value = '';
  document.getElementById('qtyOfferProduct').innerHTML = '';
  dpFillMaterialSelect('qtyOfferProduct', 'qtyOfferProductSearch', '');
  document.getElementById('qtyTiersList').innerHTML = '';
  dpBindTierListEvents();
  addTierRow(1, '');
  addTierRow('', '');
  document.getElementById('qtyOfferModal').classList.add('open');
}

async function openEditQtyOffer(id) {
  const o = offers.find(x => x.id === id);
  if (!o) return;
  openAddQtyOffer();
  const p = products.find(x => x.id === o.productId);
  if (p && p.hasSizes) { try { await fetchProductsByIds(p.sizeIds || []); } catch (e) {} }
  dpFillMaterialSelect('qtyOfferProduct', 'qtyOfferProductSearch', o.productId);
  document.getElementById('qtyOfferTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل عرض الكمية';
  document.getElementById('qtyOfferId').value = id;
  document.getElementById('qtyOfferExpiry').value = toDatetimeLocalValue(o.expiresAt);
  document.getElementById('qtyOfferShowBanner').checked = !!o.showInBanner;
  document.getElementById('qtyTiersList').innerHTML = '';
  (o.tiers || []).forEach(tr => addTierRow(tr.qty, tr.price, Array.isArray(tr.sizeIds) && tr.sizeIds.length ? tr.sizeIds : undefined));
}

function closeQtyOfferModal() {
  document.getElementById('qtyOfferModal').classList.remove('open');
}

// نظام عرض البانر (_adBanner* والدوال المرتبطة) انتقل بالكامل إلى js/shared/ad-banner.js

// ============================
// إدارة صور شريط الصفحة الرئيسية (لوحة تحكم الأدمن)
// ============================
function renderAdminHomeBanner() {
  const container = document.getElementById('adminHomeBannerList');
  const addBtn = document.getElementById('addHomeBannerBtn');
  if (addBtn) addBtn.style.display = homeBannerSlides.length >= 10 ? 'none' : 'flex';
  if (!container) return;
  if (!homeBannerSlides.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <i class="fas fa-images" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px"></i>
      لا توجد صور حالياً</div>`;
    return;
  }
  const now = new Date();
  container.innerHTML = homeBannerSlides.map(s => {
    const isActive = (!s.startAt || new Date(s.startAt) <= now) && (!s.endAt || new Date(s.endAt) >= now);
    const linkLabel = s.linkType === 'product'
      ? (products.find(p => p.id === s.linkTarget)?.ar || 'منتج غير موجود')
      : s.linkType === 'category'
        ? (categories.find(c => c.id === s.linkTarget)?.ar || 'قسم')
        : s.linkType === 'url'
          ? s.linkTarget
          : s.linkType === 'qtyoffer'
            ? `عرض كمية: ${products.find(p => p.id === s.linkTarget)?.ar || 'منتج غير موجود'}`
            : s.linkType === 'bundle'
              ? `باقة: ${offers.find(o => o.id === s.linkTarget)?.name_ar || 'باقة غير موجودة'}`
              : 'بدون رابط';
    return `
    <div class="points-admin-card">
      <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0">
        <img src="${escHtml(cldOptimize(s.image,80))}" style="width:60px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:13px;color:var(--primary-dark)">${escHtml(linkLabel)}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:800;color:${isActive?'#15803d':'#94a3b8'}">${isActive?'● نشطة الآن':'○ غير نشطة الآن'}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="openEditHomeBannerSlide(${s.id})" style="padding:7px 14px;border-radius:50px;background:#e8f3fb;color:var(--primary);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-edit"></i></button>
        <button onclick="deleteHomeBannerSlide(${s.id})" style="padding:7px 14px;border-radius:50px;background:#fff5f5;color:var(--danger);border:none;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>`;
  }).join('');
}

var _bannerSlideImagePending = null;

async function openAddHomeBannerSlide() {
  if (homeBannerSlides.length >= 10) { showToast('⚠️ الحد الأقصى 10 صور', 'error'); return; }
  document.getElementById('homeBannerSlideTitle').innerHTML = '<i class="fas fa-image"></i> إضافة صورة';
  document.getElementById('homeBannerSlideId').value = '';
  document.getElementById('homeBannerSlideError').style.display = 'none';
  document.getElementById('homeBannerStartAt').value = '';
  document.getElementById('homeBannerEndAt').value = '';
  document.getElementById('homeBannerLinkType').value = 'none';
  setHomeBannerLinkType('none');
  document.getElementById('homeBannerLinkProductId').value = '';
  document.getElementById('homeBannerLinkProductSearch').value = '';
  document.getElementById('homeBannerLinkUrl').value = '';
  const catSel = document.getElementById('homeBannerLinkCategory');
  catSel.innerHTML = categories.filter(c => c.id !== 'all').map(c => `<option value="${escHtml(c.id)}">${escHtml(c.ar)}</option>`).join('');

  const qtyOfferProducts = await getActiveQtyOfferProducts();
  const qtySel = document.getElementById('homeBannerLinkQtyOfferProduct');
  qtySel.innerHTML = qtyOfferProducts.length
    ? qtyOfferProducts.map(p => `<option value="${p.id}">${escHtml(p.ar)} — ${escHtml(p.brand)}</option>`).join('')
    : `<option value="">لا يوجد عروض كمية نشطة حالياً</option>`;

  const bundles = getActiveBundles();
  const bundleSel = document.getElementById('homeBannerLinkBundle');
  bundleSel.innerHTML = bundles.length
    ? bundles.map(o => `<option value="${o.id}">${escHtml(o.name_ar)}</option>`).join('')
    : `<option value="">لا يوجد باقات نشطة حالياً</option>`;

  _bannerSlideImagePending = null;
  document.getElementById('homeBannerImagePreview').style.display = 'none';
  document.getElementById('homeBannerSlideModal').classList.add('open');
}

async function openEditHomeBannerSlide(id) {
  const s = homeBannerSlides.find(x => x.id === id);
  if (!s) return;
  await openAddHomeBannerSlide();
  document.getElementById('homeBannerSlideTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل الصورة';
  document.getElementById('homeBannerSlideId').value = id;
  document.getElementById('homeBannerStartAt').value = s.startAt ? toDatetimeLocalValue(s.startAt) : '';
  document.getElementById('homeBannerEndAt').value = s.endAt ? toDatetimeLocalValue(s.endAt) : '';
  document.getElementById('homeBannerLinkType').value = s.linkType || 'none';
  setHomeBannerLinkType(s.linkType || 'none');
  if (s.linkType === 'product') {
    const p = products.find(x => x.id === s.linkTarget);
    document.getElementById('homeBannerLinkProductId').value = s.linkTarget;
    document.getElementById('homeBannerLinkProductSearch').value = p ? `${p.ar} — ${p.brand}` : '';
  } else if (s.linkType === 'category') {
    document.getElementById('homeBannerLinkCategory').value = s.linkTarget;
  } else if (s.linkType === 'url') {
    document.getElementById('homeBannerLinkUrl').value = s.linkTarget || '';
  } else if (s.linkType === 'qtyoffer') {
    document.getElementById('homeBannerLinkQtyOfferProduct').value = s.linkTarget;
  } else if (s.linkType === 'bundle') {
    document.getElementById('homeBannerLinkBundle').value = s.linkTarget;
  }
  _bannerSlideImagePending = s.image;
  const preview = document.getElementById('homeBannerImagePreview');
  preview.src = s.image;
  preview.style.display = 'block';
}

function closeHomeBannerSlideModal() {
  document.getElementById('homeBannerSlideModal').classList.remove('open');
}

function setHomeBannerLinkType(type) {
  document.getElementById('homeBannerLinkProductWrap').style.display = type === 'product' ? 'block' : 'none';
  document.getElementById('homeBannerLinkCategoryWrap').style.display = type === 'category' ? 'block' : 'none';
  document.getElementById('homeBannerLinkUrlWrap').style.display = type === 'url' ? 'block' : 'none';
  document.getElementById('homeBannerLinkQtyOfferWrap').style.display = type === 'qtyoffer' ? 'block' : 'none';
  document.getElementById('homeBannerLinkBundleWrap').style.display = type === 'bundle' ? 'block' : 'none';
}

async function handleHomeBannerImageSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  showToast('⏳ جاري رفع الصورة...', '');
  try {
    const url = await uploadToCloudinary(file, 'dentapro_home_banner');
    _bannerSlideImagePending = url;
    const preview = document.getElementById('homeBannerImagePreview');
    preview.src = url;
    preview.style.display = 'block';
    showToast('✅ تم رفع الصورة', 'success');
  } catch(e) {
    showToast('❌ فشل رفع الصورة: ' + e.message, 'error');
  }
}

function showHomeBannerLinkProductList() {
  filterHomeBannerLinkProductList();
  document.getElementById('homeBannerLinkProductDropdown').style.display = 'block';
}
function filterHomeBannerLinkProductList() {
  const term = normalizeArabic(document.getElementById('homeBannerLinkProductSearch').value);
  const list = getSortedProductsAr().filter(p =>
    !term || normalizeArabic(p.ar).includes(term) || normalizeArabic(p.brand).includes(term) || p.en.toLowerCase().includes(term)
  );
  const dd = document.getElementById('homeBannerLinkProductDropdown');
  if (!list.length) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
  dd.innerHTML = list.slice(0,30).map(p => `
    <div onclick="selectHomeBannerLinkProduct(${p.id})"
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
function selectHomeBannerLinkProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('homeBannerLinkProductId').value = id;
  document.getElementById('homeBannerLinkProductSearch').value = `${p.ar} — ${p.brand}`;
  document.getElementById('homeBannerLinkProductDropdown').style.display = 'none';
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('homeBannerLinkProductDropdown');
  const input = document.getElementById('homeBannerLinkProductSearch');
  if (dd && dd.style.display === 'block' && !dd.contains(e.target) && e.target !== input) {
    dd.style.display = 'none';
  }
});

async function saveHomeBannerSlide() {
  const errEl = document.getElementById('homeBannerSlideError');
  const errMsgEl = document.getElementById('homeBannerSlideErrorMsg');
  errEl.style.display = 'none';

  if (!_bannerSlideImagePending) {
    errMsgEl.textContent = 'يرجى رفع صورة';
    errEl.style.display = 'block';
    return;
  }

  const id = document.getElementById('homeBannerSlideId').value;
  const startVal = document.getElementById('homeBannerStartAt').value;
  const endVal = document.getElementById('homeBannerEndAt').value;
  const linkType = document.getElementById('homeBannerLinkType').value;
  let linkTarget = null;
  if (linkType === 'product') {
    linkTarget = parseInt(document.getElementById('homeBannerLinkProductId').value) || null;
    if (!linkTarget) { errMsgEl.textContent = 'يرجى اختيار منتج'; errEl.style.display = 'block'; return; }
  } else if (linkType === 'category') {
    linkTarget = document.getElementById('homeBannerLinkCategory').value || null;
  } else if (linkType === 'url') {
    linkTarget = document.getElementById('homeBannerLinkUrl').value.trim() || null;
    if (!linkTarget) { errMsgEl.textContent = 'يرجى إدخال رابط'; errEl.style.display = 'block'; return; }
  } else if (linkType === 'qtyoffer') {
    linkTarget = parseInt(document.getElementById('homeBannerLinkQtyOfferProduct').value) || null;
    if (!linkTarget) { errMsgEl.textContent = 'يرجى اختيار منتج عليه عرض كمية'; errEl.style.display = 'block'; return; }
  } else if (linkType === 'bundle') {
    linkTarget = parseInt(document.getElementById('homeBannerLinkBundle').value) || null;
    if (!linkTarget) { errMsgEl.textContent = 'يرجى اختيار باقة'; errEl.style.display = 'block'; return; }
  }

  const slideData = {
    id: id ? parseInt(id) : Date.now(),
    image: _bannerSlideImagePending,
    startAt: startVal ? new Date(startVal).toISOString() : null,
    endAt: endVal ? new Date(endVal).toISOString() : null,
    linkType, linkTarget
  };

  if (id) {
    const idx = homeBannerSlides.findIndex(x => x.id === parseInt(id));
    if (idx !== -1) homeBannerSlides[idx] = slideData;
  } else {
    if (homeBannerSlides.length >= 10) { errMsgEl.textContent = 'الحد الأقصى 10 صور'; errEl.style.display = 'block'; return; }
    homeBannerSlides.push(slideData);
  }

  try {
    await window._fbSetDoc(window._fbDoc2('store_data', 'home_banner_slides'), { slides: homeBannerSlides, updatedAt: new Date().toISOString() });
    closeHomeBannerSlideModal();
    renderAdminHomeBanner();
    renderAdBanner();
    showToast('✅ تم الحفظ', 'success');
  } catch(e) {
    errMsgEl.textContent = 'فشل الحفظ: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function deleteHomeBannerSlide(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الصورة؟')) return;
  homeBannerSlides = homeBannerSlides.filter(x => x.id !== id);
  try {
    await window._fbSetDoc(window._fbDoc2('store_data', 'home_banner_slides'), { slides: homeBannerSlides, updatedAt: new Date().toISOString() });
  } catch(e) {
    showToast('❌ فشل الحذف: ' + e.message, 'error');
  }
  renderAdminHomeBanner();
  renderAdBanner();
  showToast('🗑️ تم الحذف', 'success');
}

// renderBannerQtySlide / renderBannerBundleSlide انتقلتا إلى js/shared/ad-banner.js
async function saveQtyOffer() {
  const productId = parseInt(document.getElementById('qtyOfferProduct').value);
  const showErr = msg => {
    document.getElementById('qtyOfferErrorMsg').textContent = msg;
    document.getElementById('qtyOfferError').style.display = 'block';
  };
  if (!productId) return showErr('يرجى اختيار مادة');
  const prod = products.find(x => x.id === productId);
  const withSizes = !!(prod && prod.hasSizes);

  const tiers = [];
  let overpriced = null;
  let sizeError = false;
  document.querySelectorAll('#qtyTiersList .tier-block').forEach(r => {
    const qty = parseInt(r.querySelector('.tier-qty').value);
    const price = parseFloat(r.querySelector('.tier-price').value);
    if (!(qty > 0 && price > 0)) return;
    if (!withSizes) { tiers.push({ qty, price }); return; }
    const sizeIds = dpCheckedSizeIds(r, 'tier-size-cb');
    if (!sizeIds.length) { sizeError = true; return; }
    const prices = getSizeChildren(prod).filter(k => sizeIds.includes(k.id)).map(k => parseFloat(k.price) || 0);
    if (prices.length && price / qty > Math.min(...prices) + 1e-9) overpriced = overpriced || { qty, unit: price / qty, min: Math.min(...prices) };
    tiers.push({ qty, price, sizeIds });
  });
  tiers.sort((a, b) => a.qty - b.qty);

  if (sizeError) return showErr('حدّد مقاساً واحداً على الأقل في كل مستوى');
  if (tiers.length < 1) return showErr('يرجى إضافة مستوى واحد على الأقل بكمية وسعر صحيحين');

  const expiryVal = document.getElementById('qtyOfferExpiry').value;
  if (expiryVal && new Date(expiryVal) <= new Date()) return showErr('تاريخ الانتهاء يجب أن يكون بالمستقبل');
  const expiresAt = expiryVal ? new Date(expiryVal).toISOString() : null;

  const editId = parseInt(document.getElementById('qtyOfferId').value) || null;
  const existingDup = offers.find(o => o.type === 'qty' && o.productId === productId && o.id !== editId);
  if (existingDup) return showErr('يوجد عرض كمية بالفعل لهذه المادة');

  if (overpriced && !confirm(`تنبيه: في مستوى الكمية ${overpriced.qty} سعر القطعة بالعرض (${fmtPrice(Math.round(overpriced.unit * 1000) / 1000)} د.أ) أعلى من السعر العادي لأقل مقاس مشمول (${fmtPrice(overpriced.min)} د.أ). قد يدفع العميل أكثر من السعر العادي لذلك المقاس. هل تريد المتابعة؟`)) return;

  const showInBanner = document.getElementById('qtyOfferShowBanner').checked;
  if (editId) {
    const idx = offers.findIndex(o => o.id === editId);
    if (idx !== -1) offers[idx] = { ...offers[idx], productId, tiers, expiresAt, showInBanner };
    showToast('✅ تم تعديل عرض الكمية', 'success');
  } else {
    const newId = await getNextId('offers', offers);
    offers.push({ id: newId, type: 'qty', productId, tiers, expiresAt, showInBanner, active: true, createdAt: new Date().toISOString() });
    showToast('✅ تم إضافة عرض الكمية', 'success');
  }
  saveOffers();
  document.getElementById('qtyOfferError').style.display = 'none';
  closeQtyOfferModal();
  renderAdminOffers();
  renderOffers();
  renderProducts();
  initOffersTicker();
  renderAdBanner();
}

var currentBundleItems = [];
var currentBundleImage = null;

function dpBundleSelectedProduct() {
  const id = parseInt(document.getElementById('bundleAddProductSelect').value);
  return id ? products.find(x => x.id === id) : null;
}

// عند اختيار مادة لها مقاسات: تنبثق قائمة مقاساتها بأسعارها ليحدد الأدمن ما تشمله الباقة
async function onBundleProductChange() {
  const panel = document.getElementById('bundleSizesPanel');
  const p = dpBundleSelectedProduct();
  if (!p || !p.hasSizes) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  if (getSizeChildren(p).length < (p.sizeIds || []).length) {
    try { await fetchProductsByIds(p.sizeIds); } catch (e) {}
  }
  const existing = currentBundleItems.find(it => it.productId === p.id);
  panel.innerHTML = `
    <div class="size-check-box" style="padding:10px 12px;border-radius:12px;border:1.5px dashed var(--border);background:#fffaf0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:12px;font-weight:800;color:var(--primary-dark)">المقاسات المسموحة لهذه المادة في الباقة</span>
        <button type="button" onclick="dpToggleAllSizes(this,'bundle-size-cb')" style="background:none;border:none;color:var(--primary);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">تحديد/إلغاء الكل</button>
      </div>
      ${dpSizeChecklistHTML(getSizeChildren(p), existing && existing.sizeIds ? existing.sizeIds : undefined, 'bundle-size-cb')}
    </div>`;
  panel.style.display = 'block';
}

function addBundleItemRow() {
  const select = document.getElementById('bundleAddProductSelect');
  const productId = parseInt(select.value);
  const qty = parseInt(document.getElementById('bundleAddProductQty').value) || 1;
  if (!productId) {
    showToast('⚠️ يرجى اختيار مادة أولاً', 'error');
    return;
  }
  const p = products.find(x => x.id === productId);
  let sizeIds;
  if (p && p.hasSizes) {
    sizeIds = dpCheckedSizeIds(document.getElementById('bundleSizesPanel'), 'bundle-size-cb');
    if (!sizeIds.length) { showToast('⚠️ حدّد مقاساً واحداً على الأقل لهذه المادة', 'error'); return; }
  }
  const entry = sizeIds ? { productId, qty, sizeIds } : { productId, qty };
  const existing = currentBundleItems.find(it => it.productId === productId);
  if (existing) {
    Object.keys(existing).forEach(k => delete existing[k]);
    Object.assign(existing, entry);
    showToast(`✏️ تم تحديث \"${p ? p.ar : 'المادة'}\" (الكمية ${qty})`, 'success');
  } else {
    currentBundleItems.push(entry);
    showToast(`✅ تمت إضافة \"${p ? p.ar : 'مادة'}\" بكمية ${qty}`, 'success');
  }
  document.getElementById('bundleAddProductQty').value = 1;
  // إعادة ضبط القائمة لفرض اختيار صريح للمادة التالية
  select.value = '';
  document.getElementById('bundleSizesPanel').style.display = 'none';
  document.getElementById('bundleSizesPanel').innerHTML = '';
  renderBundleItemsList();
}

function removeBundleItemRow(productId) {
  currentBundleItems = currentBundleItems.filter(it => it.productId !== productId);
  renderBundleItemsList();
}

function renderBundleItemsList() {
  const list = document.getElementById('bundleItemsList');
  if (!currentBundleItems.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:10px">لم تتم إضافة منتجات بعد</div>`;
  } else {
    list.innerHTML = currentBundleItems.map(it => {
      const p = products.find(x => x.id === it.productId);
      if (!p) return '';
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:#f8fbfd;border-radius:10px;border:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          <span style="font-size:18px;flex-shrink:0">${escHtml(p.icon || '')}</span>
          <span style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.ar)}${dpAdminBundleSizesNote(it)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="font-size:12px;color:var(--text-muted)">الكمية:</span>
          <input type="number" min="1" value="${it.qty}" style="width:56px;padding:5px 8px;border-radius:8px;border:1.5px solid var(--border);font-family:inherit;font-size:13px;text-align:center"
            onchange="updateBundleItemQty(${it.productId}, this.value)">
        </div>
        <button onclick="removeBundleItemRow(${it.productId})" style="background:none;border:none;color:var(--danger);cursor:pointer;flex-shrink:0"><i class="fas fa-times-circle"></i></button>
      </div>`;
    }).join('');
  }
  updateBundleOriginalPreview();
}

// سطر صغير يعرض المقاسات المسموحة لعنصر الباقة
function dpAdminBundleSizesNote(it) {
  if (!Array.isArray(it.sizeIds) || !it.sizeIds.length) return '';
  const names = it.sizeIds.map(id => { const k = products.find(x => x.id === id); return k ? (k.sizeLabel || k.ar) : ''; }).filter(Boolean);
  return names.length ? `<small style="display:block;font-weight:600;color:var(--text-muted);white-space:normal">المقاسات: ${escHtml(names.join('، '))}</small>` : '';
}

function updateBundleItemQty(productId, newQty) {
  const qty = parseInt(newQty) || 1;
  const item = currentBundleItems.find(it => it.productId === productId);
  if (item) item.qty = qty;
  updateBundleOriginalPreview();
}

function updateBundleOriginalPreview() {
  const hasSized = currentBundleItems.some(it => { const p = products.find(x => x.id === it.productId); return p && p.hasSizes; });
  const total = getBundleOriginalPrice({ items: currentBundleItems });
  const el = document.getElementById('bundleOriginalPreview');
  if (el) el.textContent = (hasSized ? 'من ' : '') + fmtPrice(total) + ' د.أ';
}

function triggerBundleImgUpload() { document.getElementById('bundleImageFile').click(); }

async function handleBundleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('❌ حجم الصورة يتجاوز 2MB', 'error'); return; }
  const preview = document.getElementById('bundleImgPreviewBox');
  const area = document.getElementById('bundleImgUploadArea');
  const removeBtn = document.getElementById('removeBundleImgBtn');
  area.querySelector('.img-upload-text').textContent = '⏳ جاري رفع الصورة...';
  try {
    const url = await uploadToCloudinary(file);
    currentBundleImage = url;
    preview.src = url; preview.classList.add('show');
    area.classList.add('has-image');
    area.querySelector('.img-upload-icon').style.display = 'none';
    area.querySelector('.img-upload-text').textContent = '✅ تم تحميل الصورة';
    area.querySelector('.img-upload-hint').textContent = file.name;
    removeBtn.style.display = 'inline-flex';
  } catch (e) {
    showToast('❌ فشل رفع الصورة، تحقق من الاتصال', 'error');
    area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  }
}

function removeBundleImage() {
  currentBundleImage = null;
  const preview = document.getElementById('bundleImgPreviewBox');
  const area = document.getElementById('bundleImgUploadArea');
  const removeBtn = document.getElementById('removeBundleImgBtn');
  preview.src = ''; preview.classList.remove('show');
  area.classList.remove('has-image');
  area.querySelector('.img-upload-icon').style.display = 'block';
  area.querySelector('.img-upload-text').textContent = 'انقر لاختيار صورة';
  area.querySelector('.img-upload-hint').textContent = 'PNG، JPG، WEBP — بحد أقصى 2MB';
  removeBtn.style.display = 'none';
  document.getElementById('bundleImageFile').value = '';
}

function loadBundleImagePreview(url) {
  currentBundleImage = url;
  const preview = document.getElementById('bundleImgPreviewBox');
  const area = document.getElementById('bundleImgUploadArea');
  const removeBtn = document.getElementById('removeBundleImgBtn');
  preview.src = url; preview.classList.add('show');
  area.classList.add('has-image');
  area.querySelector('.img-upload-icon').style.display = 'none';
  area.querySelector('.img-upload-text').textContent = '✅ صورة محفوظة';
  area.querySelector('.img-upload-hint').textContent = 'انقر لتغييرها';
  removeBtn.style.display = 'inline-flex';
}

function openAddBundle() {
  document.getElementById('bundleModalTitle').innerHTML = '<i class="fas fa-gift"></i> إضافة باقة جديدة';
  document.getElementById('bundleId').value = '';
  document.getElementById('bundleExpiry').value = '';
  document.getElementById('bundleShowBanner').checked = false;
  ['bundleNameAr','bundleNameEn','bundleDescAr','bundleDescEn','bundlePrice','bundlePoints'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bundleError').style.display = 'none';
  currentBundleItems = [];
  removeBundleImage();
  document.getElementById('bundleAddProductSearch').value = '';
  dpFillMaterialSelect('bundleAddProductSelect', 'bundleAddProductSearch', '');
  const panel = document.getElementById('bundleSizesPanel');
  panel.style.display = 'none'; panel.innerHTML = '';
  document.getElementById('bundleAddProductQty').value = 1;
  renderBundleItemsList();
  document.getElementById('bundleModal').classList.add('open');
}

function openEditBundle(id) {
  const o = offers.find(x => x.id === id && x.type === 'bundle');
  if (!o) return;
  openAddBundle();
  document.getElementById('bundleModalTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل الباقة';
  document.getElementById('bundleId').value = id;
  document.getElementById('bundleNameAr').value = o.name_ar;
  document.getElementById('bundleNameEn').value = o.name_en;
  document.getElementById('bundleDescAr').value = o.desc_ar || '';
  document.getElementById('bundleDescEn').value = o.desc_en || '';
  document.getElementById('bundlePrice').value = o.bundlePrice;
  document.getElementById('bundlePoints').value = o.points || '';
  document.getElementById('bundleExpiry').value = toDatetimeLocalValue(o.expiresAt);
  document.getElementById('bundleShowBanner').checked = !!o.showInBanner;
  currentBundleItems = (o.items || []).map(it => ({...it, ...(Array.isArray(it.sizeIds) ? { sizeIds: [...it.sizeIds] } : {})}));
  prefetchOfferSizeProducts().then(renderBundleItemsList);
  if (o.image) loadBundleImagePreview(o.image);
  renderBundleItemsList();
}

function closeBundleModal() { document.getElementById('bundleModal').classList.remove('open'); }

async function saveBundle() {
  const name_ar = document.getElementById('bundleNameAr').value.trim();
  const name_en = document.getElementById('bundleNameEn').value.trim();
  const bundlePrice = parseFloat(document.getElementById('bundlePrice').value);
  const showErr = msg => { document.getElementById('bundleErrorMsg').textContent = msg; document.getElementById('bundleError').style.display = 'block'; };

  if (!name_ar || !name_en) return showErr('يرجى إدخال اسم الباقة بالعربي والإنجليزي');
  if (!currentBundleItems.length) return showErr('يرجى إضافة منتج واحد على الأقل للباقة');
  if (!bundlePrice || bundlePrice <= 0) return showErr('يرجى إدخال سعر صحيح للباقة');
  if (currentBundleItems.some(it => { const p = products.find(x => x.id === it.productId); return p && p.hasSizes && !(Array.isArray(it.sizeIds) && it.sizeIds.length); })) return showErr('حدّد المقاسات المسموحة لكل مادة لها مقاسات (أعد إضافتها)');

  const bundleExpiryVal = document.getElementById('bundleExpiry').value;
  if (bundleExpiryVal && new Date(bundleExpiryVal) <= new Date()) return showErr('تاريخ الانتهاء يجب أن يكون بالمستقبل');

  const data = {
    type: 'bundle',
    name_ar, name_en,
    desc_ar: document.getElementById('bundleDescAr').value.trim(),
    desc_en: document.getElementById('bundleDescEn').value.trim(),
    items: currentBundleItems.map(it => ({...it, ...(Array.isArray(it.sizeIds) ? { sizeIds: [...it.sizeIds] } : {})})),
    bundlePrice,
    points: parseInt(document.getElementById('bundlePoints').value) || 0,
    image: currentBundleImage || null,
    icon: '🎁',
    expiresAt: bundleExpiryVal ? new Date(bundleExpiryVal).toISOString() : null,
    showInBanner: document.getElementById('bundleShowBanner').checked,
  };

  const editId = parseInt(document.getElementById('bundleId').value) || null;
  if (editId) {
    const idx = offers.findIndex(o => o.id === editId);
    if (idx !== -1) offers[idx] = { ...offers[idx], ...data };
    showToast('✅ تم تعديل الباقة', 'success');
  } else {
    const newId = await getNextId('offers', offers);
    offers.push({ id: newId, ...data, active: true, createdAt: new Date().toISOString() });
    showToast('✅ تم إضافة الباقة', 'success');
  }
  saveOffers();
  document.getElementById('bundleError').style.display = 'none';
  closeBundleModal();
  renderAdminOffers();
  renderOffers();
  initOffersTicker();
}

// =====================
