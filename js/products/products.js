// DentaPro domain module: extracted from the original implementation.
// =====================
// DATA
// =====================
var DEFAULT_CATEGORIES = [
  {id:'all',   icon:'🦷', ar:'الكل',              en:'All'},
  {id:'dev',   icon:'🔬', ar:'أجهزة ومعدات',       en:'Devices'},
  {id:'hand',  icon:'🛠️', ar:'أدوات يدوية',        en:'Instruments'},
  {id:'mat',   icon:'💊', ar:'مواد طبية',           en:'Materials'},
  {id:'prot',  icon:'🧤', ar:'الوقاية والتعقيم',    en:'Protection'},
  {id:'ortho', icon:'🦷', ar:'التقويم',             en:'Orthodontics'},
  {id:'impl',  icon:'🏥', ar:'زراعة الأسنان',       en:'Implants'},
  {id:'home',  icon:'🌟', ar:'العناية المنزلية',     en:'Home Care'},
];
// يبني قائمتي الفئات (نموذج المنتج + فلتر جدول الأدمن) من مصفوفة categories الفعلية
// قسم الطلاب: قسم خاص يُنشأ تلقائياً عند تفعيل خيار "قسم الطلاب" في أي منتج.
// المنتج يحمل علامة studentPack ويبقى في قسمه الأصلي (cat)، فيظهر في قسمين دون نسخه.
var STUDENTS_CATEGORY = { id: 'students', icon: '🎓', ar: 'قسم الطلاب', en: 'Students', system: true };
function ensureStudentsCategory() {
  if (categories.find(c => c.id === STUDENTS_CATEGORY.id)) return false;
  categories.push({ ...STUDENTS_CATEGORY });
  return true;
}
function hasStudentProducts() { return products.some(p => p.studentPack && !p.parentId); }

function populateCategorySelects() {
  const realCats = categories.filter(c => c.id !== 'all');

  const pCat = document.getElementById('pCat');
  if (pCat) {
    const currentVal = pCat.value;
    const primaryCats = realCats.filter(c => c.id !== STUDENTS_CATEGORY.id); // قسم الطلاب ليس فئة أصلية يُختار منها
    pCat.innerHTML = primaryCats.map(c => `<option value="${c.id}">${escHtml(c.ar)}</option>`).join('');
    if (primaryCats.find(c => c.id === currentVal)) pCat.value = currentVal;
  }

  const adminFilter = document.getElementById('adminCatFilter');
  if (adminFilter) {
    const currentVal = adminFilter.value || 'all';
    adminFilter.innerHTML = `<option value="all">كل الفئات</option>` +
      realCats.map(c => `<option value="${c.id}">${escHtml(c.ar)}</option>`).join('');
    if (currentVal === 'all' || realCats.find(c => c.id === currentVal)) adminFilter.value = currentVal;
  }
}

function loadCategories() {
  try {
    const saved = localStorage.getItem('dentapro_categories');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return DEFAULT_CATEGORIES.map(c => ({...c}));
}

async function loadCategoriesFromFirebase() {
  try {
    for (let i = 0; i < 180; i++) {
      if (window._fbDoc2 && window._fbGetDoc) break;
      await new Promise(r => setTimeout(r, 50));
    }
    if (!window._fbDoc2 || !window._fbGetDoc) return;

    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'categories'));
    if (snap.exists()) {
      const list = snap.data().list;
      if (Array.isArray(list) && list.length > 0) {
        categories.length = 0;
        list.forEach(c => categories.push(c));
        localStorage.setItem('dentapro_categories', JSON.stringify(categories));
        clearSearchIndex();
        renderCategories();
        populateCategorySelects();
        renderProducts();
        console.log('✅ تم تحميل الأقسام من Firebase:', categories.length);
      }
    }
    // لا نرفع تلقائياً أي شيء؛ فقط نقرأ. الكتابة تتم فقط عند تعديل فعلي من الأدمن.
  } catch(e) {
    console.warn('Firebase loadCategories:', e.message);
  }
}

async function saveCategories() {
  clearSearchIndex();
  try {
    localStorage.setItem('dentapro_categories', JSON.stringify(categories));
  } catch(e) {}
  try {
    for (let i = 0; i < 15; i++) {
      if (window._fbDoc2 && window._fbSetDoc) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await window._fbSetDoc(
      window._fbDoc2('store_data', 'categories'),
      { list: categories, updatedAt: new Date().toISOString() }
    );
  } catch(e) {
    console.warn('Firebase saveCategories:', e.message);
  }
}

var categories = loadCategories();

// ============================
// HERO TITLE — قابل للتعديل من الأدمن (محفوظ في Firestore: store_data/hero_settings)
// ============================
// كل سطر: { text, size (px), color (hex), align ('right'|'left'|'center') } — أي سطر نصه فاضي ما بيترسم إطلاقاً
function emptyHeroLine() { return { text: '', size: 26, color: '#123b62', align: 'right' }; }
var heroLinesAr = [
  { text: 'كل ما تحتاجه', size: 26, color: '#123b62', align: 'right' },
  { text: 'لعيادتك في مكان', size: 26, color: '#123b62', align: 'right' },
  { text: 'واحد', size: 26, color: '#078f91', align: 'right' },
  emptyHeroLine()
];
var heroLinesEn = [
  { text: 'Everything Your Clinic', size: 26, color: '#123b62', align: 'left' },
  { text: 'Needs In One', size: 26, color: '#123b62', align: 'left' },
  { text: 'Place', size: 26, color: '#078f91', align: 'left' },
  emptyHeroLine()
];
var heroExpiresAt = null;
var heroImage = null;

// لا نرسم قسم الهيرو (ولا نصه الافتراضي "كل ما تحتاجه...") قبل معرفة إعدادات الأدمن الفعلية؛ وإلا يومض النص الافتراضي
// ثم يختفي إن كان الأدمن قد أفرغ الهيرو. الإعدادات تُحفظ بجهاز الزائر فيظهر الشكل الصحيح فوراً في الزيارات التالية.
var _heroReady = false;
var HERO_CACHE_KEY = 'dentapro_hero_cache';
function saveHeroCache(exists) {
  try {
    localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(exists
      ? { exists: true, linesAr: heroLinesAr, linesEn: heroLinesEn, expiresAt: heroExpiresAt, image: heroImage }
      : { exists: false }));
  } catch (e) {}
}
(function restoreHeroCache() {
  try {
    const c = JSON.parse(localStorage.getItem(HERO_CACHE_KEY) || 'null');
    if (!c) return;
    if (c.exists) {
      if (Array.isArray(c.linesAr) && c.linesAr.length) heroLinesAr = c.linesAr;
      if (Array.isArray(c.linesEn) && c.linesEn.length) heroLinesEn = c.linesEn;
      heroExpiresAt = c.expiresAt || null;
      heroImage = c.image || null;
    }
    _heroReady = true;
    if (window.dpSplash) dpSplash.mark('hero');
  } catch (e) {}
})();

function isHeroExpired() {
  return !!(heroExpiresAt && new Date(heroExpiresAt) <= new Date());
}

function renderHeroTitle() {
  if (!_heroReady) return; // الإعدادات لم تُعرف بعد: القسم يبقى مخفياً
  const el = document.getElementById('heroTitleEl');
  const wrap = document.getElementById('heroContentWrap');
  const imgEl = document.getElementById('heroImageEl');
  const section = document.getElementById('heroSection');
  if (!el || !wrap) return;

  if (isHeroExpired()) {
    if (section) section.style.display = 'none'; // يخفي القسم بالكامل — الحيز يختفي تماماً
    return;
  }

  const lines = currentLang === 'en' ? heroLinesEn : heroLinesAr;
  const filledLines = lines.filter(l => l.text && l.text.trim());

  // لا أسطر نص ولا صورة → القسم كامل بلا محتوى، نخفيه بدل ما يظهر فاضي
  if (!filledLines.length && !heroImage) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = '';
  wrap.style.display = 'block';

  el.innerHTML = filledLines
    .map(l => `<div style="font-size:${l.size}px;color:${l.color};line-height:1.15;text-align:${l.align || 'right'}">${escHtml(l.text)}</div>`)
    .join('');

  // الصورة تطفو بجانب النص، وجهة الطفو تتبع اتجاه اللغة:
  // عربي → الصورة يمين والنص يلتف حواليها من الشمال وفوق وتحت
  // إنجليزي → الصورة شمال والنص يلتف حواليها من اليمين وفوق وتحت
  if (imgEl) {
    if (heroImage) {
      imgEl.src = heroImage;
      imgEl.style.display = 'block';
      if (currentLang === 'en') {
        imgEl.style.float = 'left';
        imgEl.style.margin = '0 20px 12px 0';
      } else {
        imgEl.style.float = 'right';
        imgEl.style.margin = '0 0 12px 20px';
      }
    }
    else { imgEl.style.display = 'none'; }
  }
}

async function loadHeroSettings() {
  try {
    if (!await waitForFirebase(15)) { _heroReady = true; renderHeroTitle(); if (window.dpSplash) dpSplash.mark('hero'); return; }
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'hero_settings'));
    if (snap.exists()) {
      const d = snap.data();
      if (Array.isArray(d.linesAr) && d.linesAr.length) heroLinesAr = d.linesAr;
      if (Array.isArray(d.linesEn) && d.linesEn.length) heroLinesEn = d.linesEn;
      heroExpiresAt = d.expiresAt || null;
      heroImage = d.image || null;
      saveHeroCache(true);
    } else {
      saveHeroCache(false); // لم يُحفظ هيرو بعد: يُستعمل النص الافتراضي
    }
    _heroReady = true;
    renderHeroTitle();
    if (window.dpSplash) dpSplash.mark('hero');
  } catch(e) {
    console.warn('Firebase loadHeroSettings:', e.message);
    _heroReady = true; // تعذّر التحميل: نعرض الموجود (الافتراضي أو المخزّن) بدل إخفاء القسم
    renderHeroTitle();
    if (window.dpSplash) dpSplash.mark('hero');
  }
}
// ============================
// نقاط الشراء الآلية — نسبة عامة تحوّل سعر المنتج لنقاط تلقائيًا
// (محفوظة بـ Firestore: store_data/auto_points_settings)
// كل منتج فيه خيار "نقاط يدوية" (manualPoints): true = يستخدم p.points كما هو،
// false = يتجاهل القيمة اليدوية ويحسب النقاط تلقائيًا من السعر × النسبة.
// ============================
var _autoPointsConfig = { enabled: false, percent: 0 };

async function loadAutoPointsConfig() {
  try {
    if (!await waitForFirebase(15)) return;
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'auto_points_settings'));
    if (snap.exists()) {
      const d = snap.data();
      _autoPointsConfig = { enabled: !!d.enabled, percent: Number(d.percent) || 0 };
    }
  } catch(e) {
    console.warn('Firebase loadAutoPointsConfig:', e.message);
  }
}

function getEffectivePoints(p) {
  if (!p) return 0;
  const useManual = p.manualPoints !== false;
  if (useManual) return p.points || 0;
  if (_autoPointsConfig.enabled && _autoPointsConfig.percent) {
    return Math.round((p.price || 0) * _autoPointsConfig.percent / 100);
  }
  return 0;
}

function loadAutoPointsConfigIntoForm() {
  const enabledEl = document.getElementById('autoPointsEnabled');
  const percentEl = document.getElementById('autoPointsPercent');
  if (enabledEl) enabledEl.checked = _autoPointsConfig.enabled;
  if (percentEl) percentEl.value = _autoPointsConfig.percent || '';
}

async function saveAutoPointsConfig() {
  if (!isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  const enabled = document.getElementById('autoPointsEnabled').checked;
  const percent = parseFloat(document.getElementById('autoPointsPercent').value) || 0;
  try {
    await window._fbSetDoc(window._fbDoc2('store_data', 'auto_points_settings'), { enabled, percent });
    _autoPointsConfig = { enabled, percent };
    showToast('✅ تم حفظ إعدادات النقاط الآلية', 'success');
    renderProducts();
  } catch(e) {
    showToast('❌ فشل الحفظ: ' + e.message, 'error');
  }
}
// ============================
// نقاط تلقائية من قيمة الطلب — تُضاف لرصيد العميل عند التسليم (منفصل عن نقاط الشراء أعلاه)
// (محفوظة بـ Firestore: store_data/earn_points_settings)
// includeOffers: احتساب النقاط على بنود عروض الكمية/الباقات
// includeDiscounted: احتساب النقاط على المنتجات ذات الخصم المؤقت أو الطلبات المشمولة بالخصم المخصص
// ============================
var _earnPointsConfig = { enabled: false, percent: 0, includeOffers: false, includeDiscounted: false };

async function loadEarnPointsConfig() {
  try {
    if (!await waitForFirebase(15)) return;
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'earn_points_settings'));
    if (snap.exists()) {
      const d = snap.data();
      _earnPointsConfig = {
        enabled: !!d.enabled,
        percent: Number(d.percent) || 0,
        includeOffers: !!d.includeOffers,
        includeDiscounted: !!d.includeDiscounted
      };
    }
  } catch(e) {
    console.warn('Firebase loadEarnPointsConfig:', e.message);
  }
}

function loadEarnPointsConfigIntoForm() {
  const enabledEl = document.getElementById('earnPointsEnabled');
  const percentEl = document.getElementById('earnPointsPercent');
  const offersEl = document.getElementById('earnPointsIncludeOffers');
  const discountedEl = document.getElementById('earnPointsIncludeDiscounted');
  if (enabledEl) enabledEl.checked = _earnPointsConfig.enabled;
  if (percentEl) percentEl.value = _earnPointsConfig.percent || '';
  if (offersEl) offersEl.checked = _earnPointsConfig.includeOffers;
  if (discountedEl) discountedEl.checked = _earnPointsConfig.includeDiscounted;
}

async function saveEarnPointsConfig() {
  if (!isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  const enabled = document.getElementById('earnPointsEnabled').checked;
  const percent = parseFloat(document.getElementById('earnPointsPercent').value) || 0;
  const includeOffers = document.getElementById('earnPointsIncludeOffers').checked;
  const includeDiscounted = document.getElementById('earnPointsIncludeDiscounted').checked;
  try {
    await window._fbSetDoc(window._fbDoc2('store_data', 'earn_points_settings'), { enabled, percent, includeOffers, includeDiscounted });
    _earnPointsConfig = { enabled, percent, includeOffers, includeDiscounted };
    showToast('✅ تم حفظ إعدادات النقاط التلقائية', 'success');
  } catch(e) {
    showToast('❌ فشل الحفظ: ' + e.message, 'error');
  }
}

// يحسب المبلغ المؤهل لاحتساب النقاط التلقائية من طلب معيّن، بعد تطبيق استثناءات العروض/الخصومات
function computeEarnPointsEligibleTotal(order) {
  if (!_earnPointsConfig.enabled || !_earnPointsConfig.percent) return 0;

  const hasOrderDiscount = order.originalTotal && order.originalTotal > order.total;

  if (hasOrderDiscount && !_earnPointsConfig.includeDiscounted) return 0;

  let eligible = 0;
  (order.items || []).forEach(item => {
    const qty = item.qty || 1;
    const lineTotal = (item.price || 0) * qty;

    const isOfferItem = item.isBundle || (item.basePrice && item.price < item.basePrice);
    if (isOfferItem && !_earnPointsConfig.includeOffers) return;

    if (!item.isBundle) {
      const p = products.find(x => x.id === item.id);
      const hasTempDiscount = p && p.old && p.old > p.price;
      if (hasTempDiscount && !_earnPointsConfig.includeDiscounted) return;
    }

    eligible += lineTotal;
  });

  if (hasOrderDiscount) {
    eligible = eligible * (order.total / order.originalTotal);
  }

  return eligible;
}

// ============================
// شريط صور الصفحة الرئيسية — صور مجدولة (بداية/نهاية اختيارية) مع رابط اختياري لمنتج أو قسم
// (محفوظة بـ Firestore: store_data/home_banner_slides). تُدمج ضمن نفس شريط الإعلان
// المتحرك الموجود أصلاً (adBannerSection) مع عروض الكمية/الباقات/النصوص.
// ============================
// تُحفظ نسخة من الشرائح على جهاز الزائر فيُرسم البانر فوراً في الزيارات التالية قبل وصول البيانات من الشبكة
var HOME_BANNER_CACHE_KEY = 'dentapro_home_banner_cache';
var homeBannerSlides = (function () {
  try { const c = JSON.parse(localStorage.getItem(HOME_BANNER_CACHE_KEY) || 'null'); return Array.isArray(c) ? c : []; }
  catch (e) { return []; }
})();

// يرجع true إن اختلفت الشرائح عمّا كان معروضاً (للتحديث فقط عند التغيّر)
async function loadHomeBannerSlides() {
  try {
    if (!await waitForFirebase(15)) return false;
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'home_banner_slides'));
    const fresh = (snap.exists() && Array.isArray(snap.data().slides)) ? snap.data().slides : [];
    const changed = JSON.stringify(fresh) !== JSON.stringify(homeBannerSlides);
    homeBannerSlides = fresh;
    try { localStorage.setItem(HOME_BANNER_CACHE_KEY, JSON.stringify(fresh)); } catch (e) {}
    return changed;
  } catch(e) {
    console.warn('Firebase loadHomeBannerSlides:', e.message);
    return false;
  }
}

// يرجع الصور "النشطة حالياً" فقط حسب موعد البداية/النهاية (بدون تاريخ = دائمة)
function getActiveHomeBannerSlides() {
  const now = new Date();
  return homeBannerSlides.filter(s => {
    if (s.startAt && new Date(s.startAt) > now) return false;
    if (s.endAt && new Date(s.endAt) < now) return false;
    return true;
  });
}

// إشعار الإدارة (داخل التطبيق + دفع للهاتف عبر الـ Worker) عند عبور المخزون حدّ "على وشك النفاد" أو الصفر
// يُرسل مرة واحدة فقط لحظة العبور (مثلاً من 6 إلى 5، أو من 1 إلى 0)، لا عند كل نقص لاحق
function notifyStockLevel(name, prev, next) {
  try {
    const T = (typeof LOW_STOCK_THRESHOLD !== 'undefined') ? LOW_STOCK_THRESHOLD : 5;
    let kind = null;
    if (prev > 0 && next <= 0) kind = 'out';
    else if (prev > T && next > 0 && next <= T) kind = 'low';
    if (!kind) return;
    const nm = String(name || '').slice(0, 60);
    createNotification({
      scope: 'admin',
      icon: kind === 'out' ? '⛔' : '⚠️',
      title: kind === 'out' ? 'منتج نفذ من المخزون' : 'منتج على وشك النفاد',
      message: kind === 'out' ? `${nm} — نفذت الكمية` : `${nm} — المتبقي ${next}`,
      link: `adminproducts:${kind}`,
    });
  } catch (e) { console.warn('stock notify:', e && e.message); }
}

async function reserveOrderStock(items) {
  if (!navigator.onLine) return { reserved: false };

  const flat = [];
  (items || []).forEach(item => {
    if (item.isBundle && item.bundleItems) {
      item.bundleItems.forEach(bi => flat.push({ productId: bi.productId, qty: (bi.qty||1) * (item.qty||1) }));
    } else if (item.id) {
      flat.push({ productId: item.id, qty: item.qty || 1 });
    }
  });
  const merged = {};
  flat.forEach(f => { merged[f.productId] = (merged[f.productId] || 0) + f.qty; });
  const entries = Object.entries(merged);
  if (!entries.length) return { reserved: true };

  let crossings = [];
  try {
    await window._fbRunTransaction(async (tx) => {
      crossings = []; // قد تُعاد المحاولة داخل الـ transaction
      const refs = entries.map(([id]) => window._fbDoc2('products', String(id)));
      const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
      for (let i = 0; i < entries.length; i++) {
        const [, qty] = entries[i];
        const snap = snaps[i];
        if (!snap.exists()) continue;
        const data = snap.data();
        if (data.stock === undefined || data.stock === null) continue;
        if (data.stock - qty < 0) {
          const err = new Error(`الكمية المتوفرة من "${data.ar || entries[i][0]}" غير كافية حالياً (متبقي ${data.stock})`);
          err.code = 'insufficient-stock';
          throw err;
        }
      }
      for (let i = 0; i < entries.length; i++) {
        const [, qty] = entries[i];
        const snap = snaps[i];
        if (!snap.exists()) continue;
        const data = snap.data();
        if (data.stock === undefined || data.stock === null) continue;
        tx.update(refs[i], { stock: data.stock - qty });
        crossings.push({ name: data.ar || entries[i][0], prev: data.stock, next: data.stock - qty });
      }
    });
    crossings.forEach(c => notifyStockLevel(c.name, c.prev, c.next));
    return { reserved: true };
  } catch(e) {
    if (e.code === 'insufficient-stock') throw e;
    console.warn('⚠️ تعذّر حجز المخزون ذرياً، سيُعتمد الخصم عند التسليم كخطة بديلة:', e.message);
    return { reserved: false };
  }
}

async function releaseOrderStock(items) {
  const flat = [];
  (items || []).forEach(item => {
    if (item.isBundle && item.bundleItems) {
      item.bundleItems.forEach(bi => flat.push({ productId: bi.productId, qty: (bi.qty||1) * (item.qty||1) }));
    } else if (item.id) {
      flat.push({ productId: item.id, qty: item.qty || 1 });
    }
  });
  const merged = {};
  flat.forEach(f => { merged[f.productId] = (merged[f.productId] || 0) + f.qty; });
  const entries = Object.entries(merged);
  if (!entries.length) return;

  try {
    await window._fbRunTransaction(async (tx) => {
      const refs = entries.map(([id]) => window._fbDoc2('products', String(id)));
      const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
      for (let i = 0; i < entries.length; i++) {
        const [, qty] = entries[i];
        const snap = snaps[i];
        if (!snap.exists()) continue;
        const data = snap.data();
        if (data.stock === undefined || data.stock === null) continue;
        tx.update(refs[i], { stock: data.stock + qty });
      }
    });
  } catch(e) {
    console.warn('⚠️ تعذّر استرجاع المخزون المحجوز لطلب ملغي:', e.message);
  }
}
// ============================
// أجور التوصيل الخاصة بكل عميل (محفوظة بـ Firestore: delivery_settings/{uid})
// enabled=false → مجاني دائماً. fee=null (غير محدد) → "غير محدد" (+ خدمة التوصيل). fee=0 → مجاني. fee=رقم → هذا المبلغ.
// ملاحظة: خصم التوصيل حسب مجموع الفاتورة لم يعد جزءاً من إعداد العميل — أصبح إعداداً عاماً واحداً
// (delivery_settings/_global) يطبَّق على جميع العملاء (مسجلين وغير مسجلين) ويُلغي أي تسعير خاص بالعميل.
// ============================
async function loadClientDeliverySettings(uid) {
  if (!uid) return null;
  try {
    if (!await waitForFirebase(15)) return null;
    const snap = await window._fbGetDoc(window._fbDoc2('delivery_settings', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e) {
    console.warn('loadClientDeliverySettings:', e.message);
    return null;
  }
}

function computeDeliveryFee(deliverySettings, subtotal) {
  if (!deliverySettings || !deliverySettings.enabled) return { fee: 0, determined: true };
  const fee = deliverySettings.fee;
  if (fee === null || fee === undefined) return { fee: null, determined: false };
  return { fee, determined: true };
}

// إعداد عام واحد للمتجر بالكامل (delivery_settings/_global)
// { discountEnabled: bool, tiers: [{minTotal, type:'free'|'fixed', value}] }
// لما discountEnabled=true: تُحسب الأجور من الدرجات فقط، وتُلغى تلقائياً أي أجور خاصة بأي عميل — للجميع.
async function loadGlobalDeliverySettings() {
  try {
    if (!await waitForFirebase(15)) return null;
    const snap = await window._fbGetDoc(window._fbDoc2('delivery_settings', '_global'));
    return snap.exists() ? snap.data() : null;
  } catch(e) {
    console.warn('loadGlobalDeliverySettings:', e.message);
    return null;
  }
}

function computeGlobalDeliveryFee(globalSettings, subtotal) {
  const tiers = Array.isArray(globalSettings.tiers) ? globalSettings.tiers : [];
  const applicable = tiers.filter(t => subtotal >= t.minTotal).sort((a,b) => b.minTotal - a.minTotal)[0];
  if (!applicable) return { fee: null, determined: false };
  if (applicable.type === 'free') return { fee: 0, determined: true };
  return { fee: applicable.value, determined: true }; // fixed
}
function deliveryLineHTML(deliveryFee, deliveryDetermined) {
  if (!deliveryDetermined) {
    return `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">+ ${t('خدمة التوصيل','delivery service')}</div>`;
  }
  if (!deliveryFee) return '';
  return `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">+ ${t('توصيل','Delivery')}: ${fmtPrice(deliveryFee)} ${t('د.أ','JD')}</div>`;
}
async function getNextId(counterKey, fallbackList) {
  const counterRef = window._fbDoc2('store_data', 'id_counters');
  return await window._fbRunTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists() ? snap.data() : {};
    let current = data[counterKey];
    if (current === undefined) {
      current = (fallbackList && fallbackList.length) ? Math.max(...fallbackList.map(x => x.id)) : 0;
    }
    const next = current + 1;
    tx.set(counterRef, { ...data, [counterKey]: next }, { merge: true });
    return next;
  });
}
var _heroEditImagePending = null;

function buildHeroLineRowHTML(prefix, i, placeholder) {
  return `
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
      <input type="text" id="hero${prefix}Text${i}" placeholder="${placeholder}" style="flex:1;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-family:inherit;font-size:13px">
      <input type="number" id="hero${prefix}Size${i}" value="26" min="10" max="60" title="حجم الخط" style="width:60px;padding:10px;border-radius:10px;border:1.5px solid var(--border);font-size:13px;text-align:center">
      <input type="color" id="hero${prefix}Color${i}" value="#123b62" title="لون النص" style="width:40px;height:40px;border-radius:8px;border:1.5px solid var(--border);padding:2px;cursor:pointer">
      <select id="hero${prefix}Align${i}" title="محاذاة السطر" style="padding:9px 6px;border-radius:10px;border:1.5px solid var(--border);font-family:inherit;font-size:12px;background:#fff;cursor:pointer">
        <option value="right">يمين</option>
        <option value="left">يسار</option>
        <option value="center">توسيط</option>
      </select>
    </div>`;
}

function openHeroTitleEditModal() {
  if (!isAdmin()) { showToast('⛔ هذا القسم خاص بمدير النظام فقط', 'error'); return; }
  _heroEditImagePending = heroImage;

  document.getElementById('heroLinesArContainer').innerHTML =
    [0,1,2,3].map(i => buildHeroLineRowHTML('LineAr', i, `سطر ${i+1} (اختياري)`)).join('');
  document.getElementById('heroLinesEnContainer').innerHTML =
    [0,1,2,3].map(i => buildHeroLineRowHTML('LineEn', i, `Line ${i+1} (optional)`)).join('');

  for (let i = 0; i < 4; i++) {
    const lAr = heroLinesAr[i] || emptyHeroLine();
    const lEn = heroLinesEn[i] || emptyHeroLine();
    document.getElementById(`heroLineArText${i}`).value = lAr.text || '';
    document.getElementById(`heroLineArSize${i}`).value = lAr.size || 26;
    document.getElementById(`heroLineArColor${i}`).value = lAr.color || '#123b62';
    document.getElementById(`heroLineArAlign${i}`).value = lAr.align || 'right';
    document.getElementById(`heroLineEnText${i}`).value = lEn.text || '';
    document.getElementById(`heroLineEnSize${i}`).value = lEn.size || 26;
    document.getElementById(`heroLineEnColor${i}`).value = lEn.color || '#123b62';
    document.getElementById(`heroLineEnAlign${i}`).value = lEn.align || 'left';
  }
  document.getElementById('heroExpiryInput').value = heroExpiresAt ? toDatetimeLocalValue(heroExpiresAt) : '';
  const preview = document.getElementById('heroImagePreview');
  if (heroImage) { preview.src = heroImage; preview.style.display = 'block'; }
  else { preview.style.display = 'none'; }
  document.getElementById('heroTitleEditModal').classList.add('open');
}
function closeHeroTitleEditModal() {
  document.getElementById('heroTitleEditModal').classList.remove('open');
}

function setHeroExpiryPreset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  document.getElementById('heroExpiryInput').value = toDatetimeLocalValue(d.toISOString());
}

async function handleHeroImageSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  showToast('⏳ جاري رفع الصورة...', '');
  try {
    const url = await uploadToCloudinary(file, 'dentapro_hero');
    _heroEditImagePending = url;
    const preview = document.getElementById('heroImagePreview');
    preview.src = url;
    preview.style.display = 'block';
    showToast('✅ تم رفع الصورة', 'success');
  } catch(e) {
    showToast('❌ فشل رفع الصورة: ' + e.message, 'error');
  }
}
function removeHeroImage() {
  _heroEditImagePending = null;
  document.getElementById('heroImagePreview').style.display = 'none';
}

async function saveHeroTitle() {
  const linesAr = [], linesEn = [];
  for (let i = 0; i < 4; i++) {
    linesAr.push({
      text: document.getElementById(`heroLineArText${i}`).value.trim(),
      size: parseInt(document.getElementById(`heroLineArSize${i}`).value) || 26,
      color: document.getElementById(`heroLineArColor${i}`).value || '#123b62',
      align: document.getElementById(`heroLineArAlign${i}`).value || 'right'
    });
    linesEn.push({
      text: document.getElementById(`heroLineEnText${i}`).value.trim(),
      size: parseInt(document.getElementById(`heroLineEnSize${i}`).value) || 26,
      color: document.getElementById(`heroLineEnColor${i}`).value || '#123b62',
      align: document.getElementById(`heroLineEnAlign${i}`).value || 'left'
    });
  }
  // سماح بالحفظ فارغاً بالكامل — هذا يخفي القسم كلياً من الصفحة الرئيسية (بدل ما يمنع الحفظ)
  const expiryVal = document.getElementById('heroExpiryInput').value;
  const expiresAt = expiryVal ? new Date(expiryVal).toISOString() : null;

  heroLinesAr = linesAr;
  heroLinesEn = linesEn;
  heroExpiresAt = expiresAt;
  heroImage = _heroEditImagePending;
  _heroReady = true;
  saveHeroCache(true);
  renderHeroTitle();
  closeHeroTitleEditModal();
  showToast('✅ تم حفظ التعديل', 'success');
  try {
    for (let i = 0; i < 15; i++) {
      if (window._fbDoc2 && window._fbSetDoc) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await window._fbSetDoc(
      window._fbDoc2('store_data', 'hero_settings'),
      { linesAr, linesEn, expiresAt, image: heroImage, updatedAt: new Date().toISOString() }
    );
  } catch(e) {
    console.warn('Firebase saveHeroTitle:', e.message);
    showToast('⚠️ تعذّر الحفظ على السحابة، التعديل ظاهر على جهازك فقط الآن', 'error');
  }
}

var DEFAULT_PRODUCTS = [
  {id:1,  cat:'dev',   icon:'🦷', brand:'ADEC',       ar:'كرسي أسنان احترافي A-dec 500',           en:'A-dec 500 Professional Dental Chair',     price:18500, old:21000, desc_ar:'كرسي متكامل مع وحدة ضوء وشاشة تحكم',       desc_en:'Complete unit with light and control screen',   badge:'الأكثر مبيعاً'},
  {id:2,  cat:'dev',   icon:'📡', brand:'PLANMECA',   ar:'جهاز أشعة بانورامي ProMax',              en:'ProMax Panoramic X-Ray',                  price:32000, old:38000, desc_ar:'أشعة رقمية عالية الدقة بدون فيلم',         desc_en:'Digital high-resolution filmless X-ray',        badge:'جديد'},
  {id:3,  cat:'dev',   icon:'⚡', brand:'SIRONA',     ar:'جهاز الأوتوكلاف DAC Premium',            en:'DAC Premium Autoclave',                   price:8900,  old:null,  desc_ar:'تعقيم بالبخار 17 لتر معتمد Class B',      desc_en:'17L Class B steam sterilizer',                  badge:null},
  {id:4,  cat:'hand',  icon:'🔍', brand:'HU-FRIEDY',  ar:'مجموعة أدوات فحص كاملة',                en:'Complete Examination Kit',                price:480,   old:620,   desc_ar:'مرايا + مجس + ملقط ستانلس ستيل',          desc_en:'Mirrors + probe + stainless forceps',           badge:'خصم 22%'},
  {id:5,  cat:'hand',  icon:'🔧', brand:'DENTSPLY',   ar:'ملفات قنوات روتاري ProTaper Gold',       en:'ProTaper Gold Rotary Files',              price:320,   old:null,  desc_ar:'طقم كامل 6 ملفات NiTi عالي المرونة',      desc_en:'6-file NiTi set, high flexibility',             badge:null},
  {id:6,  cat:'mat',   icon:'💉', brand:'3M ESPE',    ar:'مادة حشو كومبوزيت Filtek Supreme',       en:'Filtek Supreme Composite',                price:185,   old:220,   desc_ar:'كومبوزيت نانو هايبرد شفاف وقوي',           desc_en:'Nano-hybrid composite, translucent & strong',   badge:'الأكثر مبيعاً'},
  {id:7,  cat:'mat',   icon:'🧪', brand:'ULTRADENT',  ar:'جيل تبييض Opalescence 35%',              en:'Opalescence Whitening 35%',               price:145,   old:null,  desc_ar:'تبييض احترافي سريع نتائج فورية',           desc_en:'Professional fast whitening, instant results',  badge:null},
  {id:8,  cat:'mat',   icon:'🧬', brand:'DENTSPLY',   ar:'مادة انطباع سيليكون Aquasil Ultra',      en:'Aquasil Ultra Impression Material',       price:265,   old:310,   desc_ar:'سيليكون VPS دقيق ومريح للمريض',            desc_en:'Precise VPS silicone, patient-friendly',        badge:null},
  {id:9,  cat:'prot',  icon:'🧤', brand:'SEMPERMED',  ar:'قفازات لاتكس طبية - صندوق 100',          en:'Medical Latex Gloves - Box 100',          price:38,    old:null,  desc_ar:'قفازات فحص معقمة مقاس S/M/L/XL',          desc_en:'Sterile examination gloves S/M/L/XL',           badge:null},
  {id:10, cat:'prot',  icon:'😷', brand:'3M',         ar:'كمامة N95 طبية معتمدة - علبة 20',        en:'Certified Medical N95 Mask - Box 20',     price:72,    old:90,    desc_ar:'كمامة N95 معتمدة NIOSH مريحة',             desc_en:'NIOSH-certified N95, comfortable fit',          badge:'خصم 20%'},
  {id:11, cat:'ortho', icon:'🔩', brand:'3M UNITEK',  ar:'براكيت تقويم معدني Mini Diamond',        en:'Mini Diamond Metal Brackets',             price:155,   old:null,  desc_ar:'براكيت MBT/Roth مقاس .022 طقم كامل',      desc_en:'MBT/Roth .022 full kit',                        badge:null},
  {id:12, cat:'impl',  icon:'🔬', brand:'STRAUMANN',  ar:'غرسة تيتانيوم Bone Level RC',           en:'Bone Level RC Titanium Implant',          price:1200,  old:1450,  desc_ar:'نظام BLT/BLC معتمد عالمياً مع أبتمنت',     desc_en:'Globally certified BLT/BLC with abutment',      badge:'الأكثر مبيعاً'},
  {id:13, cat:'home',  icon:'⚡', brand:'ORAL-B',     ar:'فرشاة أسنان كهربائية iO Series 9',       en:'iO Series 9 Electric Toothbrush',         price:620,   old:780,   desc_ar:'تقنية ذكية مع شاشة تتبع النظافة',          desc_en:'Smart tech with cleaning tracker display',      badge:'جديد'},
  {id:14, cat:'home',  icon:'💧', brand:'COLGATE',    ar:'غسول فم طبي Colgate Peroxyl',            en:'Colgate Peroxyl Medical Mouthwash',       price:28,    old:null,  desc_ar:'علاج قرح الفم وتطهير اللثة',               desc_en:'Treats mouth sores and gum disinfection',       badge:null},
  {id:15, cat:'dev',   icon:'📷', brand:'CARESTREAM', ar:'كاميرا داخل الفم CS 1500',              en:'CS 1500 Intraoral Camera',                price:4200,  old:5100,  desc_ar:'كاميرا HD لاسلكية مع برنامج متكامل',       desc_en:'Wireless HD camera with integrated software',   badge:'جديد'},
  {id:16, cat:'mat',   icon:'🩺', brand:'SEPTODONT',  ar:'تخدير موضعي Articaine 4%',              en:'Articaine 4% Local Anesthesia',           price:95,    old:null,  desc_ar:'أمبولات 1.7ml صندوق 50 أمبولة',            desc_en:'1.7ml cartridges, box of 50',                   badge:null},
];

function loadProducts() {
  try {
    const saved = localStorage.getItem('dentapro_products');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return DEFAULT_PRODUCTS.map(p => ({...p}));
}

// ============================
// PRODUCTS — Firestore Collection حقيقية (Pagination: limit() + startAfter())
// ============================
var FIRESTORE_PAGE_SIZE = 100;      // حجم كل صفحة تُجلب من Firestore (limit)
var _productsLastDoc = null;          // آخر مستند مُحمّل، يُستخدم في startAfter()
var _productsAllLoaded = false;       // true عند استنفاذ كل صفحات Firestore
var _productsCollectionReady = false; // true إذا كانت Collection الجديدة تحتوي بيانات فعلاً
var _ensureAllPromise = null;

async function waitForFirebase(maxTries = 30) {
  const ready = () => window._fbCollection && window._fbGetDocs && window._fbLimit;
  const total = maxTries * 5; // نفس مدة الانتظار الكلية السابقة، لكن بفحص كل 50ms بدل 250ms
  for (let i = 0; i < total; i++) {
    if (ready()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return !!ready();
}

// يجلب صفحة واحدة من Collection "products" باستخدام limit() الحقيقي، ومع startAfter() لما بعد أول صفحة
async function fetchProductsPage() {
  if (_productsAllLoaded) return [];
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
  if (!await waitForFirebase()) throw new Error('Firebase غير جاهز');
  // نرتب حسب معرّف المستند نفسه (__name__) بدل حقل id — موجود دايماً بكل مستند
  // بدون استثناء، فما فيه خطر إسقاط منتجات ناقصها الحقل أو نوعه مختلف
  const baseCol = window._fbCollection(window._db, 'products');
  const constraints = _productsLastDoc
    ? [window._fbOrderBy('__name__'), window._fbStartAfter(_productsLastDoc), window._fbLimit(FIRESTORE_PAGE_SIZE)]
    : [window._fbOrderBy('__name__'), window._fbLimit(FIRESTORE_PAGE_SIZE)];
  const q = window._fbQuery(baseCol, ...constraints);
  const snap = await window._fbGetDocs(q);

  if (snap.empty) { _productsAllLoaded = true; return []; }

  _productsLastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < FIRESTORE_PAGE_SIZE) _productsAllLoaded = true;

  const list = snap.docs.map(d => d.data());
  list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  return list;
}

// التحميل الأولي عند فتح المتجر: أول صفحة فقط من Firestore (لا يتم تحميل كل المنتجات دفعة واحدة)
async function loadProductsFromFirebase() {
  try {
    const firstPage = await fetchProductsPage();
    if (firstPage.length > 0) {
      products.length = 0;
      firstPage.forEach(p => products.push(p));
      _productsCollectionReady = true;
      cacheProductsLocally();
      renderProducts();
      renderCategories();
      console.log(`✅ تم تحميل أول صفحة (${products.length} منتج) عبر limit()`);
    } else {
      // الـ Collection فاضية أو غير موجودة بعد → نقرأ البنية القديمة (store_data/products) كتوافق رجعي
      await loadProductsLegacyFallback();
    }
    if (typeof updateAdminStats === 'function') updateAdminStats();
    if (typeof renderAdminTable === 'function' && document.getElementById('adminPanel')?.classList.contains('open')) {
      renderAdminTable();
    }
  } catch(e) {
    // فشل تحميل Collection الجديدة → جرّب البنية القديمة صامتاً قبل إظهار أي خطأ
    console.warn('⚠️ Firebase loadProducts (new collection):', e.message);
    try {
      await loadProductsLegacyFallback();
    } catch(e2) {
      console.warn('⚠️ Firebase loadProducts (legacy fallback):', e2.message);
      // لا نُظهر شاشة خطأ إذا كانت المنتجات موجودة محلياً (localStorage) — فقط عند عدم وجود أي بيانات نهائياً
      if (!products.length) {
        showErrorPage({
          icon: '📡',
          title: 'لا يوجد اتصال بالإنترنت',
          message: 'تعذّر تحميل المنتجات لعدم توفر اتصال بالإنترنت. تحقق من الشبكة وأعد المحاولة.',
        });
      }
    }
  }
}

// توافق رجعي: قراءة بنية المستند القديم (list array) وترحيلها تلقائياً لـ Collection عند وجود صلاحية أدمن
async function loadProductsLegacyFallback() {
  try {
    if (!await waitForFirebase(15)) return;
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'products'));
    if (snap.exists()) {
      const list = snap.data().list;
      if (Array.isArray(list) && list.length > 0) {
        products.length = 0;
        list.forEach(p => products.push(p));
        cacheProductsLocally();
        renderProducts();
        renderCategories();
        // تم تعطيل الترحيل التلقائي نهائياً لمنع استرجاع بيانات قديمة بالخطأ
      }
    }
  } catch(e) {
    console.warn('⚠️ Firebase loadProducts (legacy fallback):', e.message);
  }
}

// ترحيل لمرة واحدة من البنية القديمة (مستند واحد) إلى Collection حقيقية (كتابات مجمّعة Batched)
async function migrateProductsToCollection(list) {
  try {
    if (!window._fbWriteBatch) return;
    for (let i = 0; i < list.length; i += 400) {
      const batch = window._fbWriteBatch();
      list.slice(i, i + 400).forEach(p => batch.set(window._fbDoc2('products', String(p.id)), p));
      await batch.commit();
    }
    _productsLastDoc = null; _productsAllLoaded = false; _productsCollectionReady = true;
    console.log('✅ تم ترحيل', list.length, 'منتج إلى Collection حقيقية تدعم limit()/startAfter()');
  } catch(e) {
    console.warn('⚠️ فشل ترحيل المنتجات التلقائي:', e.message);
  }
}

// يجلب الصفحة التالية من Firestore (startAfter() حقيقي) ويضيفها للمصفوفة المحلية — تُستخدم في "تحميل المزيد" والتمرير اللامتناهي
async function loadMoreProductsFromServer() {
  if (_productsAllLoaded || !_productsCollectionReady) return false;
  try {
    const nextPage = await fetchProductsPage();
    if (nextPage.length > 0) {
      const existingIds = new Set(products.map(p => p.id));
      nextPage.forEach(p => { if (!existingIds.has(p.id)) products.push(p); });
      cacheProductsLocally();
      return true;
    }
    return false;
  } catch(e) {
    console.warn('⚠️ تحميل المزيد من المنتجات:', e.message);
    showToast('⚠️ تعذّر تحميل المزيد من المنتجات، تحقق من اتصال الإنترنت', 'error');
    return false;
  }
}

// يضمن تحميل كل المنتجات من السيرفر (صفحة تلو الأخرى) — مطلوب عند تفعيل بحث/فلتر/ترتيب أو فتح لوحة التحكم لضمان دقة النتائج على كامل الكتالوج
async function ensureAllProductsLoaded() {
  if (_productsAllLoaded || !_productsCollectionReady) return;
  if (_ensureAllPromise) return _ensureAllPromise;
  _ensureAllPromise = (async () => {
    while (!_productsAllLoaded) {
      const got = await loadMoreProductsFromServer();
      if (!got) break;
    }
  })();
  await _ensureAllPromise;
  _ensureAllPromise = null;
}

// حفظ منتج واحد فقط في Firestore (إضافة/تعديل) — كتابة جزئية بدل إعادة كتابة القائمة كاملة
// يرجع true/false ويضبط علم _syncFailed على المنتج المحلي ليبقى ظاهراً بالجدول لحد ما ينجح فعلياً
async function saveProductToFirebase(product) {
  try {
    if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
    if (!await waitForFirebase(15)) throw new Error('Firebase غير جاهز');
    const { _syncFailed, ...cleanProduct } = product;
    const ref = window._fbDoc2('products', String(product.id));
    await window._fbSetDoc(ref, cleanProduct);
    // setDoc وحدها ترجع "نجحت" فوراً من الكاش المحلي حتى بدون إنترنت فعلي —
    // نجبر تحقق حقيقي من وصول البيانات للسيرفر قبل ما نعتبرها نجحت فعلاً
    await window._fbGetDocFromServer(ref);
    delete product._syncFailed;
    cacheProductsLocally();
    if (typeof renderAdminTable === 'function') renderAdminTable();
    return true;
  } catch(e) {
    console.error('❌ saveProductToFirebase:', e.message);
    product._syncFailed = true;
    cacheProductsLocally();
    if (typeof renderAdminTable === 'function') renderAdminTable();
    showToast('⚠️ تم الحفظ محلياً فقط، فشل الحفظ في Firebase: ' + e.message, 'error');
    return false;
  }
}

// إعادة محاولة حفظ منتج فشلت مزامنته سابقاً — تُستدعى من زر "إعادة المزامنة" بالجدول
async function retryProductSync(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  showToast('⏳ جاري إعادة المحاولة...', '');
  await saveProductToFirebase(p);
}
window.retryProductSync = retryProductSync;

// حذف منتج واحد فقط من Firestore
async function deleteProductFromFirebase(id) {
  try {
    if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
    if (!await waitForFirebase(15)) throw new Error('Firebase غير جاهز');
    await window._fbDeleteDoc(window._fbDoc2('products', String(id)));
  } catch(e) {
    console.error('❌ deleteProductFromFirebase:', e.message);
    showToast('⚠️ تم الحذف محلياً فقط، فشل الحذف من Firebase: ' + e.message, 'error');
  }
}

// تخزين محلي سريع فقط (لا يلمس Firebase) — يُستخدم بعد كل تعديل لتفادي الوميض عند إعادة فتح الصفحة
function cacheProductsLocally() {
  try { localStorage.setItem('dentapro_products', JSON.stringify(products)); } catch(e) {}
  clearSearchIndex();
}

var products = loadProducts();

// =====================
// OFFERS DATA
// =====================
function loadOffers() {
  try {
    const saved = localStorage.getItem('dentapro_offers');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch(e) {}
  return [];
}

async function loadOffersFromFirebase() {
  try {
    for (let i = 0; i < 180; i++) {
      if (window._fbDoc2 && window._fbGetDoc) break;
      await new Promise(r => setTimeout(r, 50));
    }
    if (!window._fbDoc2 || !window._fbGetDoc) return;
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'offers'));
    if (snap.exists()) {
      const list = snap.data().list;
      if (Array.isArray(list)) {
        offers.length = 0;
        list.forEach(o => offers.push(o));
        localStorage.setItem('dentapro_offers', JSON.stringify(offers));
        renderOffers();
        renderProducts();
        initOffersTicker();
        if (document.getElementById('adminPanel')?.classList.contains('open')) {
          renderAdminOffers();
        }
        // مواد العروض ومقاساتها تُجلب بالخلفية (لا نؤخر ظهور الصفحة والبانر)، ونعيد الرسم فقط إن وصلت منتجات جديدة
        const _before = products.length;
        prefetchOfferSizeProducts().then(() => {
          if (products.length > _before) { renderOffers(); renderProducts(); initOffersTicker(); renderAdBanner(); }
        });
      }
    }
  } catch(e) {
    console.warn('Firebase loadOffers:', e.message);
  } finally {
    dpMarkDynReady('offers'); // العروض جاهزة (أو تعذّر تحميلها): لا نُبقي المنطقة مخفية
  }
}

async function saveOffers() {
  try { localStorage.setItem('dentapro_offers', JSON.stringify(offers)); } catch(e) {}
  try {
    for (let i = 0; i < 15; i++) {
      if (window._fbDoc2 && window._fbSetDoc) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await window._fbSetDoc(
      window._fbDoc2('store_data', 'offers'),
      { list: offers, updatedAt: new Date().toISOString() }
    );
  } catch(e) {
    console.warn('Firebase saveOffers:', e.message);
  }
}

var offers = loadOffers();

// =====================
// QUOTE REQUESTS (عروض الأسعار)
// =====================
function quotesRef() {
  return window._fbCollection(window._db, 'quotes');
}

async function createQuoteRequest(quote) {
  try {
    await window._fbSetDoc(window._fbDoc2('quotes', quote.id), quote);
    return quote.id;
  } catch(e) {
    console.error('createQuoteRequest:', e);
    throw e;
  }
}

function getGuestQuoteRefs() {
  try { return JSON.parse(localStorage.getItem('dentapro_guest_quote_refs') || '[]'); }
  catch(e) { return []; }
}

async function getGuestQuotes() {
  const refs = getGuestQuoteRefs();
  if (!refs.length) return [];
  const results = await Promise.all(refs.map(async r => {
    try {
      const snap = await window._fbGetDoc(window._fbDoc2('quotes', String(r.id)));
      return snap.exists() ? { _docId: snap.id, ...snap.data() } : null;
    } catch(e) { return null; }
  }));
  return results.filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function rememberGuestOrder(order) {
  if (!order || !order.id) return;
  try {
    const key = 'dentapro_guest_order_refs';
    const refs = JSON.parse(localStorage.getItem(key) || '[]');
    const next = refs.filter(r => r.id !== order.id);
    next.push({ id: order.id, phone: order.phone || '', createdAt: order.createdAt || new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(next.slice(-30)));
  } catch(e) { console.warn('guest order reference:', e); }
}

function getGuestOrderRefs() {
  try { return JSON.parse(localStorage.getItem('dentapro_guest_order_refs') || '[]'); }
  catch(e) { return []; }
}

async function getGuestOrders() {
  const refs = getGuestOrderRefs();
  if (!refs.length) return [];
  const results = await Promise.all(refs.map(async r => {
    try {
      const snap = await window._fbGetDoc(window._fbDoc2('orders', String(r.id)));
      return snap.exists() ? { _docId: snap.id, ...snap.data() } : null;
    } catch(e) { return null; }
  }));
  return results.filter(Boolean).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getClientQuotes(email) {
  try {
    for (let i = 0; i < 20; i++) {
      if (window._fbQuery && window._fbWhere && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 200));
    }
    const q = window._fbQuery(quotesRef(), window._fbWhere('clientEmail', '==', email));
    const snap = await window._fbGetDocs(q);
    const list = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  } catch(e) {
    console.error('getClientQuotes:', e);
    return [];
  }
}

async function getAllQuotes() {
  try {
    const q = window._fbQuery(quotesRef(), window._fbOrderBy('createdAt','desc'));
    const snap = await window._fbGetDocs(q);
    return snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
  } catch(e) {
    console.error('getAllQuotes:', e);
    return [];
  }
}

async function updateQuote(docId, data) {
  try {
    await window._fbUpdateDoc(window._fbDoc2('quotes', docId), data);
  } catch(e) {
    console.error('updateQuote:', e);
    throw e;
  }
}
function quoteFavoritesStorageKey() {
  return `dentapro_quote_favorites_${currentUser?.email || 'guest'}`;
}

function loadQuoteFavorites() {
  try { return JSON.parse(localStorage.getItem(quoteFavoritesStorageKey()) || '[]'); }
  catch (e) { return []; }
}

function saveQuoteFavoriteId(docId) {
  const ids = loadQuoteFavorites();
  if (!ids.includes(docId)) {
    ids.push(docId);
    localStorage.setItem(quoteFavoritesStorageKey(), JSON.stringify(ids));
  }
}

function removeQuoteFavoriteId(docId) {
  const ids = loadQuoteFavorites().filter(id => id !== docId);
  localStorage.setItem(quoteFavoritesStorageKey(), JSON.stringify(ids));
}
var QUOTE_STATUSES = {
  pending:   { label:'قيد المراجعة',     icon:'fa-clock',          color:'#c2410c', bg:'#fff7ed' },
  priced:    { label:'تم تحديد السعر',   icon:'fa-tag',            color:'#1d4ed8', bg:'#eff6ff' },
  accepted:  { label:'تم القبول',        icon:'fa-check-circle',   color:'#15803d', bg:'#f0fdf4' },
  rejected:  { label:'مرفوض',            icon:'fa-times-circle',   color:'#be123c', bg:'#fff1f2' },
  saved:     { label:'محفوظ بالمفضلة',   icon:'fa-bookmark',       color:'#7e22ce', bg:'#fdf4ff' },
};

function quoteStatusBadge(status) {
  const s = QUOTE_STATUSES[status] || QUOTE_STATUSES.pending;
  return `<span class="status-badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.color}33">
    <i class="fas ${s.icon}"></i> ${s.label}</span>`;
}

// =====================
// NOTIFICATIONS SYSTEM
// =====================
function notifsRef() {
  return window._fbCollection(window._db, 'notifications');
}

// إنشاء إشعار جديد
// scope: 'client' (لعميل محدد عبر targetEmail) | 'admin' (للأدمن فقط) | 'broadcast' (لكل العملاء)
async function createNotification({ scope, targetEmail = null, icon, title, message, link = null }) {
  try {
    const notifRef = await window._fbAddDoc(notifsRef(), {
      scope, targetEmail, icon, title, message, link,
      createdAt: new Date().toISOString(),
    });
    // إرسال إشعار دفع فعلي عبر Worker (يقرأ الإشعار من Firestore ولا يثق بمحتوى الطلب)
    if (window.PUSH_WORKER_URL && notifRef && notifRef.id) {
      fetch(window.PUSH_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notifRef.id }),
        keepalive: true,
      }).catch(() => {});
    }
  } catch(e) {
    console.warn('createNotification:', e.message);
  }
}

// جلب إشعارات شخص معيّن (عميل أو أدمن) + البث العام إن كان عميلاً
async function fetchNotificationsFor(email, isAdminUser) {
  try {
    for (let i = 0; i < 20; i++) {
      if (window._fbQuery && window._fbWhere && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 200));
    }
    let results = [];
    if (isAdminUser) {
      const q = window._fbQuery(notifsRef(), window._fbWhere('scope', '==', 'admin'));
      const snap = await window._fbGetDocs(q);
      results = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    } else {
      const qClient = window._fbQuery(notifsRef(), window._fbWhere('targetEmail', '==', email));
      const qBroadcast = window._fbQuery(notifsRef(), window._fbWhere('scope', '==', 'broadcast'));
      const [snapClient, snapBroadcast] = await Promise.all([
        window._fbGetDocs(qClient),
        window._fbGetDocs(qBroadcast)
      ]);
      results = [
        ...snapClient.docs.map(d => ({ _docId: d.id, ...d.data() })),
        ...snapBroadcast.docs.map(d => ({ _docId: d.id, ...d.data() }))
      ];
    }
    results.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results.slice(0, 30);
  } catch(e) {
    console.warn('fetchNotificationsFor:', e.message);
    return [];
  }
}

function readNotifsKey() {
  return `dentapro_read_notifs_${currentUser?.email || 'guest'}`;
}
function getReadNotifIds() {
  try { return JSON.parse(localStorage.getItem(readNotifsKey()) || '[]'); }
  catch(e) { return []; }
}
function markNotifIdRead(id) {
  const list = getReadNotifIds();
  if (!list.includes(id)) { list.push(id); localStorage.setItem(readNotifsKey(), JSON.stringify(list)); }
}
function isNotifRead(id) {
  return getReadNotifIds().includes(id);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff/60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff/3600)} ساعة`;
  return `منذ ${Math.floor(diff/86400)} يوم`;
}

var _cachedNotifs = [];

async function loadAndRenderNotifIcon() {
  const btn = document.getElementById('notifBtn');
  const msgBtn = document.getElementById('msgBtn');
  if (!currentUser) { btn.style.display = 'none'; if (msgBtn) msgBtn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  const isAdminUser = isStaff();
  if (msgBtn) {
    msgBtn.style.display = 'flex';
    msgBtn.title = isAdminUser ? 'رسائل العملاء' : 'تواصل مع الإدارة';

    // لا نأخذ مرجع openClientMessages أثناء تهيئة الجلسة؛
    // ملف الرسائل قد يُحمّل بعد products.js بسبب التحميل الديناميكي.
    // الاستدعاء المتأخر يمنع ReferenceError ويُبقي زر الرسائل يعمل بعد اكتمال التحميل.
    msgBtn.onclick = () => {
      const handler = isAdminUser
        ? window.openAdminMessagesPanel
        : window.openClientMessages;

      if (typeof handler === 'function') {
        handler();
      } else {
        console.warn('لم يتم تحميل معالج الرسائل بعد، ستتم المحاولة مرة أخرى.');
        setTimeout(() => {
          const retryHandler = isAdminUser
            ? window.openAdminMessagesPanel
            : window.openClientMessages;
          if (typeof retryHandler === 'function') retryHandler();
        }, 0);
      }
    };
  }
  _cachedNotifs = await fetchNotificationsFor(currentUser.email, isAdminUser);
  updateNotifBadge();
  if (isAdminUser) updateHeaderMsgBadge();
  else updateClientMsgBadge();
}

async function openAdminMessagesPanel() {
  if (!isStaff()) return;
  document.getElementById('adminPanel').classList.add('open');
  if (typeof window.loadAdminScriptsOnce === 'function') await window.loadAdminScriptsOnce();
  if (typeof switchAdminTab === 'function') switchAdminTab('messages');
}

// ── تتبّع قراءة محادثات العملاء (للأدمن) ──
function getAdminMsgReadMap() {
  try { return JSON.parse(localStorage.getItem('dentapro_admin_msg_read') || '{}'); }
  catch(e) { return {}; }
}
function markThreadRead(email, ts) {
  const map = getAdminMsgReadMap();
  map[email] = ts;
  localStorage.setItem('dentapro_admin_msg_read', JSON.stringify(map));
}
function isThreadRead(email, ts) {
  const map = getAdminMsgReadMap();
  return map[email] && new Date(map[email]) >= new Date(ts);
}

// ── تتبّع قراءة محادثة العميل مع الإدارة (من طرف العميل) ──
function getClientMsgReadMap() {
  try { return JSON.parse(localStorage.getItem('dentapro_client_msg_read') || '{}'); }
  catch(e) { return {}; }
}
function markClientMsgRead(email, ts) {
  const map = getClientMsgReadMap();
  map[email] = ts;
  localStorage.setItem('dentapro_client_msg_read', JSON.stringify(map));
}
function getClientMsgReadTs(email) {
  return getClientMsgReadMap()[email] || null;
}

async function updateClientMsgBadge() {
  if (!currentUser || isStaff()) return;
  const thread = await getClientMessageThread(currentUser.email);
  window._cachedClientThread = thread;
  const badge = document.getElementById('msgBadge');
  if (!badge) return;
  const readTs = getClientMsgReadTs(currentUser.email);
  const unreadCount = thread.filter(m =>
    m.fromRole === 'admin' && (!readTs || new Date(m.createdAt) > new Date(readTs))
  ).length;
  badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
}
async function updateHeaderMsgBadge() {
  try {
    const grouped = await getAllMessageThreadsForAdmin();
    window._cachedAdminThreads = grouped;
    const emails = Object.keys(grouped);
    const unread = emails.filter(e => {
      const last = grouped[e][grouped[e].length - 1];
      return last.fromRole === 'client' && !isThreadRead(e, last.createdAt);
    }).length;
    const badge = document.getElementById('msgBadge');
    if (badge) {
      badge.style.display = unread > 0 ? 'flex' : 'none';
      badge.textContent = unread > 9 ? '9+' : unread;
    }
    const adminBadgeEl = document.getElementById('adminMsgBadge');
    if (adminBadgeEl) adminBadgeEl.textContent = unread > 0 ? unread : '';
  } catch(e) { console.warn('updateHeaderMsgBadge:', e.message); }
}

function updateNotifBadge() {
  const unreadCount = _cachedNotifs.filter(n => !isNotifRead(n._docId)).length;
  const badge = document.getElementById('notifBadge');
  if (unreadCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
  } else {
    badge.style.display = 'none';
  }
  if (typeof updateBellState === 'function') updateBellState();
}

function renderNotifList() {
  const list = document.getElementById('notifList');
  if (!_cachedNotifs.length) {
    list.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash"></i>لا توجد إشعارات حالياً</div>`;
    return;
  }
  list.innerHTML = _cachedNotifs.map(n => {
    const unread = !isNotifRead(n._docId);
    return `
    <div class="notif-item ${unread?'unread':''}" onclick="onNotifClick('${escJsAttr(n._docId)}','${escJsAttr(n.link||'')}')">
      <div class="notif-item-icon">${escHtml(n.icon || '🔔')}</div>
      <div class="notif-item-content">
        <div class="notif-item-title">${escHtml(n.title)}</div>
        <div class="notif-item-msg">${escHtml(n.message)}</div>
        <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
      </div>
    </div>`;
  }).join('');
}

// تمنع هذه الأقفال تكرار نفس عملية النقر أو إرسال أكثر من طلب
// أثناء انتظار تحميل إشعارات Firebase.
let _notificationActionInProgress = false;
let _notificationDropdownLoading = false;

function onNotifClick(docId, link) {
  if (_notificationActionInProgress) return;
  _notificationActionInProgress = true;

  try {
    if (docId) markNotifIdRead(docId);
    updateNotifBadge();
    renderNotifList();
    closeNotifDropdown();

    if (!link) return;

    if (link.startsWith('page:')) {
      // لا نمرر قيمة الرابط مباشرة إلى showPage؛ رابط الإشعار بيانات خارجية
      // وقد يحتوي على اسم صفحة غير موجود، فيبقى المستخدم على شاشة فارغة.
      // إشعارات حالة الطلب يجب أن تفتح صفحة طلباتي دائماً.
      const requestedPage = link.slice('page:'.length).trim();
      const pageAliases = {
        orders: 'orders',
        order: 'orders',
        clientorders: 'orders',
        messages: 'messages',
        myquotes: 'myQuotes',
        quotes: 'myQuotes',
        home: 'home',
        favorites: 'favorites',
        reordered: 'reordered',
        trackorder: 'trackOrder',
      };
      const page = pageAliases[requestedPage.toLowerCase()];
      if (!page) {
        console.warn('مسار إشعار غير معروف:', requestedPage);
        showToast('⚠️ لا يمكن فتح وجهة هذا الإشعار حالياً', 'error');
        return;
      }
      // تأجيل التنقل إلى دورة الرسم التالية حتى تنتهي إعادة رسم القائمة.
      requestAnimationFrame(() => {
        if (page === 'orders' && typeof openClientOrders === 'function') {
          openClientOrders();
        } else {
          showPage(page);
        }
      });

    } else if (link.startsWith('adminorders:')) {
      if (isStaff()) {
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.add('open');
        switchAdminTab('orders');
      }

    } else if (link.startsWith('adminproducts:')) {
      if (isStaff()) {
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.add('open');
        switchAdminTab('products');
        const kind = link.slice('adminproducts:'.length).trim();
        if ((kind === 'low' || kind === 'out') && typeof setAdminStockFilter === 'function') {
          setTimeout(() => setAdminStockFilter(kind), 300);
        }
      }

    } else if (link.startsWith('adminquotes:')) {
      if (isStaff()) {
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.add('open');
        switchAdminTab('quotes');
      }

    } else if (link.startsWith('product:')) {
      const id = parseInt(link.replace('product:', '').trim(), 10);
      showPage('home');

      setTimeout(async () => {
        try {
          let p = products.find(x => x.id === id);
          if (!p) {
            await loadProductsFromFirebase();
            p = products.find(x => x.id === id);
          }
          if (p) openProductDetail(id);
          else showToast('⚠️ هذا المنتج غير متاح حالياً', 'error');
        } catch (e) {
          console.error('خطأ أثناء فتح المنتج من الإشعار:', e);
          showToast('⚠️ تعذر فتح المنتج حالياً', 'error');
        }
      }, 100);

    } else if (link.startsWith('clientmsg:')) {
      const email = link.replace('clientmsg:', '').trim();
      if (isStaff()) {
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.add('open');
        switchAdminTab('messages');
        setTimeout(() => openAdminThreadModal(email), 400);
      }
    }
  } catch (e) {
    console.error('خطأ أثناء معالجة الضغط على الإشعار:', e);
    showToast('⚠️ تعذر فتح الإشعار حالياً', 'error');
  } finally {
    // يحرر القفل بعد انتهاء أحداث الواجهة الحالية.
    setTimeout(() => { _notificationActionInProgress = false; }, 250);
  }
}

function markAllNotifsRead() {
  _cachedNotifs.forEach(n => {
    if (n && n._docId) markNotifIdRead(n._docId);
  });
  updateNotifBadge();
  renderNotifList();
  showToast('✅ تم تعليم الكل كمقروء', 'success');
}

// تعليم كل الإشعارات المرتبطة بقسم معيّن كمقروءة، فقط عند فتح ذلك القسم فعلياً
function markNotifsByLinkPrefixRead(prefixes) {
  if (!Array.isArray(prefixes)) return;

  let changed = false;
  _cachedNotifs.forEach(n => {
    if (!n || !n.link || !n._docId) return;
    if (prefixes.some(p => n.link.startsWith(p)) && !isNotifRead(n._docId)) {
      markNotifIdRead(n._docId);
      changed = true;
    }
  });

  if (changed) {
    updateNotifBadge();
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown && dropdown.classList.contains('open')) renderNotifList();
  }
}

async function toggleNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown || _notificationDropdownLoading) return;

  const willOpen = !dropdown.classList.contains('open');
  if (!willOpen) {
    dropdown.classList.remove('open');
    return;
  }

  // لا نرسل طلباً جديداً إذا كان الطلب السابق ما زال قيد التنفيذ.
  _notificationDropdownLoading = true;
  dropdown.classList.add('open');

  try {
    if (currentUser) {
      const notifications = await fetchNotificationsFor(
        currentUser.email,
        isStaff()
      );
      _cachedNotifs = Array.isArray(notifications) ? notifications : [];
      updateNotifBadge();
    }
    renderNotifList();
  } catch (e) {
    console.error('خطأ أثناء تحميل الإشعارات:', e);
    renderNotifList();
  } finally {
    _notificationDropdownLoading = false;
  }
}

function closeNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notifDropdown');
  const button = document.getElementById('notifBtn');
  if (!dropdown || !button) return;

  if (
    dropdown.classList.contains('open') &&
    !dropdown.contains(e.target) &&
    !button.contains(e.target)
  ) {
    e.stopPropagation();
    e.preventDefault();
    closeNotifDropdown();
  }
}, true);

// =====================
// OFFERS HELPERS
// =====================
function getActiveQtyOffer(productId) {
  return offers.find(o => o.type === 'qty' && o.active && o.productId === productId && !isOfferExpired(o)) || null;
}

// ===== منع قفزات التصميم (CLS): إظهار منطقة المنتجات والعروض دفعة واحدة بعد جاهزية بياناتها =====
var _dynReady = { products: false, offers: false };
function dpRevealDynamicArea() {
  const el = document.getElementById('dynamicArea');
  if (el) el.classList.remove('is-loading');
}
function dpMarkDynReady(key) {
  _dynReady[key] = true;
  if (window.dpSplash) dpSplash.mark(key); // خطوة تحميل مكتملة لشاشة الترحيب
  if (_dynReady.products && _dynReady.offers) dpRevealDynamicArea();
}
setTimeout(dpRevealDynamicArea, 5000); // أمان: لا تبقى المنطقة مخفية إن تعذّر تحميل أحد الأجزاء

// عرض الكمية على مادة متعددة المقاسات: يُحدَّد على المادة الرئيسية، ولكل شريحة مقاساتها المشمولة (sizeIds)
// (شريحة بلا sizeIds = كل المقاسات، للعروض القديمة). الأسعار قد تختلف بين المقاسات.
function getFamilyQtyOffer(product) {
  if (!product || !product.parentId) return null;
  return getActiveQtyOffer(product.parentId);
}

// هل المقاس مشمول بهذه الشريحة؟
function dpTierCovers(tier, productId) {
  if (!Array.isArray(tier.sizeIds) || !tier.sizeIds.length) return true;
  return tier.sizeIds.some(id => String(id) === String(productId));
}

// اتحاد المقاسات المشمولة بكل شرائح العرض (null = كل المقاسات)
function dpOfferSizeIds(offer) {
  const tiers = (offer && offer.tiers) || [];
  if (!tiers.length || tiers.some(tr => !Array.isArray(tr.sizeIds) || !tr.sizeIds.length)) return null;
  const set = new Set();
  tiers.forEach(tr => tr.sizeIds.forEach(id => set.add(id)));
  return [...set];
}

// سعر القطعة بعد العرض. قاعدة العرض: سعر القطعة = السعر الإجمالي للشريحة ÷ كميتها، ويُطبَّق على كل القطع المشمولة
// بغض النظر عن سعر كل مقاس. الشريحة المطبّقة = أعلى شريحة يبلغها مجموع قطع المقاسات المشمولة بها في السلة.
// lines (اختياري): أسطر بديلة عن السلة بصيغة { id, parentId, qty } (الطلب السريع مثلاً).
function getEffectiveUnitPrice(product, qty, lines) {
  const own = getActiveQtyOffer(product.id);                 // عرض خاص بهذا المنتج/المقاس (قديم أو منتج بلا مقاسات)
  const offer = own || getFamilyQtyOffer(product);
  if (!offer || !offer.tiers || !offer.tiers.length) return product.price;
  let best = null;
  offer.tiers.forEach(tr => {
    let covered = qty;
    if (!own) {
      if (!dpTierCovers(tr, product.id)) return;             // هذا المقاس غير مشمول بهذه الشريحة
      (lines || cart).forEach(it => {
        if (it.isBundle || it.parentId !== product.parentId || String(it.id) === String(product.id)) return;
        if (dpTierCovers(tr, it.id)) covered += it.qty;
      });
    }
    if (tr.qty <= covered && (!best || tr.qty > best.qty || (tr.qty === best.qty && tr.price < best.price))) best = tr;
  });
  if (!best) return product.price;
  return best.price / best.qty;
}

// أسماء المقاسات المشمولة بشريحة (فارغ لو الشريحة تشمل كل مقاسات المادة)
function dpTierSizesText(tr) {
  if (!Array.isArray(tr.sizeIds) || !tr.sizeIds.length) return '';
  const first = products.find(x => x.id === tr.sizeIds[0]);
  const parent = first && first.parentId ? products.find(x => x.id === first.parentId) : null;
  if (parent) { const n = getSizeChildren(parent).length; if (n && tr.sizeIds.length >= n) return ''; }
  const names = tr.sizeIds.map(id => { const k = products.find(x => x.id === id); return k ? (k.sizeLabel || k.ar) : ''; }).filter(Boolean);
  return names.length ? ` (${names.join('، ')})` : '';
}

// تحميل مقاسات المواد الداخلة بالعروض النشطة (المنتجات تُحمَّل بالصفحات، فقد لا تكون المقاسات بالذاكرة)
async function prefetchOfferSizeProducts() {
  try {
    const ids = [];
    offers.forEach(o => {
      if (!o.active) return;
      if (o.type === 'qty') { ids.push(o.productId); (o.tiers || []).forEach(tr => (tr.sizeIds || []).forEach(i => ids.push(i))); }
      if (o.type === 'bundle') (o.items || []).forEach(it => { ids.push(it.productId); (it.sizeIds || []).forEach(i => ids.push(i)); });
    });
    await fetchProductsByIds([...new Set(ids)]);
    const kidIds = [];
    [...new Set(ids)].forEach(id => { const p = products.find(x => x.id === id); if (p && p.hasSizes) (p.sizeIds || []).forEach(k => kidIds.push(k)); });
    await fetchProductsByIds([...new Set(kidIds)]);
  } catch (e) { console.warn('prefetchOfferSizeProducts:', e && e.message); }
}

// ===== OFFER EXPIRY HELPERS =====
function isOfferExpired(o) {
  return !!(o.expiresAt && new Date(o.expiresAt) <= new Date());
}

// يحوّل تاريخ الانتهاء إلى نهاية ذلك اليوم بالتوقيت المحلي إن كان تاريخاً بدون وقت،
// أو يتركه كما هو إن كان يحتوي وقتاً محدداً (datetime-local)
function normalizeOfferExpiry(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T') && dateStr.split('T')[1]) {
    return new Date(dateStr).toISOString();
  }
  const d = new Date(dateStr + 'T23:59:59');
  return d.toISOString();
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCountdown(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${t('ينتهي خلال','Ends in')} ${days}${t('ي','d')} ${hours}${t('س','h')} ${minutes}${t('د','m')}`;
  if (hours > 0) return `${t('ينتهي خلال','Ends in')} ${hours}${t('س','h')} ${minutes}${t('د','m')} ${seconds}${t('ث','s')}`;
  return `${t('ينتهي خلال','Ends in')} ${minutes}${t('د','m')} ${seconds}${t('ث','s')}`;
}

// يحذف تلقائياً أي عرض انتهى وقته من المصفوفة المحلية ومن Firebase
function cleanupExpiredOffers() {
  const before = offers.length;
  offers = offers.filter(o => !isOfferExpired(o));
  if (offers.length !== before) {
    saveOffers();
    renderOffers();
    renderProducts();
    initOffersTicker();
    if (document.getElementById('adminPanel')?.classList.contains('open')) renderAdminOffers();
  }
}

// يحدّث كل عدّادات الوقت الظاهرة بالصفحة كل ثانية، ويطلق الحذف عند الوصول للصفر
function tickOfferCountdowns() {
  document.querySelectorAll('.offer-countdown[data-expires]').forEach(el => {
    const label = formatCountdown(el.getAttribute('data-expires'));
    if (label === null) {
      cleanupExpiredOffers();
    } else {
      el.textContent = label;
    }
  });
  // فحص انتهاء بانر الصفحة الرئيسية بنفس العدّاد الثانوي الموجود أصلاً
  if (heroExpiresAt && !isHeroExpired.__wasHidden) {
    if (isHeroExpired()) {
      renderHeroTitle();
      isHeroExpired.__wasHidden = true;
    }
  }
}
setInterval(tickOfferCountdowns, 1000);
setInterval(cleanupExpiredOffers, 30000);

// مقاسات عنصر الباقة المسموحة (null = العنصر منتج بلا مقاسات)
function dpBundleItemKids(it) {
  const p = products.find(x => x.id === it.productId);
  if (!p || !p.hasSizes) return null;
  let kids = getSizeChildren(p);
  if (Array.isArray(it.sizeIds) && it.sizeIds.length) kids = kids.filter(k => it.sizeIds.some(i => String(i) === String(k.id)));
  return kids;
}

// السعر الأصلي للباقة منفردة؛ للمواد ذات المقاسات نحتسب أقل سعر مقاس مسموح (حتى لا يُبالَغ بالتوفير)
function getBundleOriginalPrice(bundle) {
  return (bundle.items || []).reduce((s, it) => {
    const kids = dpBundleItemKids(it);
    if (kids) {
      const prices = kids.map(k => parseFloat(k.price) || 0);
      return s + (prices.length ? Math.min(...prices) : 0) * it.qty;
    }
    const p = products.find(x => x.id === it.productId);
    return s + (p ? p.price * it.qty : 0);
  }, 0);
}

function isBundleInStock(bundle) {
  return (bundle.items || []).every(it => {
    const kids = dpBundleItemKids(it);
    if (kids) { // مادة بمقاسات: مجموع مخزون المقاسات المسموحة يكفي كمية العنصر
      let avail = 0;
      for (const k of kids) {
        if (k.stock === undefined || k.stock === null) return true;
        avail += Math.max(0, k.stock);
      }
      return avail >= (it.qty || 1);
    }
    const p = products.find(x => x.id === it.productId);
    if (!p) return false;
    // المخزون يجب أن يكفي كمية هذا العنصر في باقة واحدة على الأقل (وليس أكبر من صفر فقط)
    if (p.stock !== undefined && p.stock !== null && p.stock < (it.qty || 1)) return false;
    return true;
  });
}

function getActiveBundles() {
  return offers.filter(o => o.type === 'bundle' && o.active && !isOfferExpired(o) && isBundleInStock(o));
}

// يجيب فقط المنتجات المطلوبة (بمعرّفاتها) من Firestore مباشرة إذا لم تكن محمّلة أصلاً بالذاكرة —
// بدل تحميل الكتالوج بالكامل، فالأداء يبقى ثابتاً بغض النظر عن حجم المتجر (120 أو 1000 منتج)
async function fetchProductsByIds(ids) {
  const missing = ids.filter(id => !products.find(p => p.id === id));
  if (!missing.length) return;
  await Promise.all(missing.map(async (id) => {
    try {
      const snap = await window._fbGetDoc(window._fbDoc2('products', String(id)));
      if (snap.exists() && !products.find(p => p.id === id)) {
        products.push({ ...snap.data(), id });
      }
    } catch(e) { /* تجاهل بصمت — سيظهر تحذير المطابقة أدناه عند الحاجة */ }
  }));
}

async function getActiveQtyOfferProducts() {
  const activeQtyOffers = offers.filter(o => o.type === 'qty' && o.active && !isOfferExpired(o));
  await fetchProductsByIds(activeQtyOffers.map(o => o.productId));

  const result = activeQtyOffers
    .map(o => products.find(p => p.id === o.productId))
    .filter(p => p && !dpIsOut(p));
  return result;
}

function renderQtyOfferTableHTML(p) {
  const offer = getActiveQtyOffer(p.id);
  if (!offer) return '';
  const rows = offer.tiers.slice().sort((a,b)=>a.qty-b.qty).map(tr => {
    const unit = tr.price / tr.qty;
    return `
      <tr>
        <td style="padding:8px 10px;text-align:center;font-weight:700">${tr.qty}${dpTierSizesText(tr) ? `<div style="font-size:11px;font-weight:600;color:var(--text-muted)">${escHtml(dpTierSizesText(tr).trim())}</div>` : ''}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:800;color:var(--primary)">${fmtPrice(tr.price)} ${t('د.أ','JD')}</td>
        <td style="padding:8px 10px;text-align:center;color:var(--text-muted)">${fmtPrice(unit)} ${t('د.أ','JD')}</td>
      </tr>`;
  }).join('');
  return `
  <div style="margin:16px 0;background:#f0f8ff;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:14px">
    <div style="font-weight:800;font-size:14px;color:var(--primary-dark);margin-bottom:10px">🏷️ ${t('عرض الكمية','Quantity Offer')}</div>
    ${p.hasSizes ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${t('يُحسب العرض على مجموع كميات المقاسات المشمولة، وسعر القطعة = السعر الإجمالي ÷ الكمية','The offer is calculated on the total quantity of the included sizes; unit price = total price ÷ quantity')}</div>` : ''}
    ${offer.expiresAt ? `<div class="offer-countdown-badge"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${offer.expiresAt}">${formatCountdown(offer.expiresAt)||''}</span></div>` : ''}
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="font-size:12px;color:var(--text-muted)">
        <th style="padding:6px 10px">${t('الكمية','Qty')}</th>
        <th style="padding:6px 10px">${t('السعر الإجمالي','Total Price')}</th>
        <th style="padding:6px 10px">${t('سعر الوحدة','Unit Price')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// =====================
// STATE
// =====================
function loadCart() {
  try {
    const saved = localStorage.getItem('dentapro_cart');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch(e) {}
  return [];
}

function saveCart() {
  try { localStorage.setItem('dentapro_cart', JSON.stringify(cart)); } catch(e) {}
}

var cart = loadCart();
var currentLang = 'ar';
var currentCat = 'all';
var currentStep = 1;
var PRODUCTS_PAGE_SIZE = 30;
var productsDisplayLimit = PRODUCTS_PAGE_SIZE;
var locationData = { lat: null, lng: null, address: '', method: '' };
var orderSubmitted = false;

// =====================
// INIT
// =====================
// يتم تحميل هذا الملف ديناميكياً من app.js، وقد يصل بعد DOMContentLoaded.
// لذلك لا نعتمد على الحدث وحده حتى لا تفوت تهيئة المنتجات عند أول تحميل.
function runWhenDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

async function initializeProductsModule() {
  // منع تشغيل التهيئة أكثر من مرة إذا استدعاها app.js أو التشغيل الذاتي.
  if (window.__productsModuleStarted) return;
  window.__productsModuleStarted = true;

  renderCategories();
  populateCategorySelects();
  renderProducts();
  renderOffers();
  updateCartUI();
  renderCompareBar();
  renderHeroTitle();

  // البانر العلوي مستقل عن المنتجات والعروض: يُرسم فوراً من النسخة المخزّنة (إن وُجدت)، ثم يُحدَّث حال وصول بياناته
  // دون انتظار بقية التحميل (كان يظهر في آخر السلسلة).
  if (homeBannerSlides.length || offers.some(o => o.showInBanner)) { renderAdBanner(); if (window.dpSplash) dpSplash.mark('banner'); }
  loadHomeBannerSlides().then(changed => { if (changed) renderAdBanner(); if (window.dpSplash) dpSplash.mark('banner'); });

  // تحميل البيانات من Firebase
  // المنتجات أولاً لضمان توافرها قبل فلترة العروض المرتبطة بها
  await Promise.all([
    loadProductsFromFirebase(),
    loadCategoriesFromFirebase(),
    loadHeroSettings(),
    loadAutoPointsConfig(),
    loadEarnPointsConfig()
  ]);
  await loadOffersFromFirebase();

  // مزامنة السلة المحفوظة مع بيانات المنتجات الحالية (أسعار/توفر محدّثة)
  syncCartWithProducts();
  renderProducts();
  renderOffers();
  renderCategories();
  initOffersTicker();

  // بعد refresh قد تكون بعض الوحدات أزالت active من homePage.
  // أعد تفعيل الصفحة الرئيسية صراحة قبل معالجة أي رابط منتج مباشر.
  if (typeof showPage === 'function' && !new URLSearchParams(window.location.search).has('product')) {
    showPage('home');
  }

  // دعم فتح منتج مباشرة من رابط مشاركة
  openProductFromUrlIfPresent();

  // إشعار المنتجات الجديدة منذ آخر زيارة
  showNewProductsNotification();
  setLastVisitDate();

  // تحميل باقي المنتجات بالخلفية دون توقيف عرض الصفحة —
  // يضمن أن الأقسام والبحث وزر "عرض المزيد" تعمل على كامل الكتالوج
  renderAdBanner();

  const _loadRestOfCatalog = () => ensureAllProductsLoaded().then(() => {
    renderProducts();
    renderCategories();
    populateCategorySelects();
    if (!new URLSearchParams(window.location.search).has('product')) {
      document.getElementById('homePage')?.classList.add('active');
    }
  });
  // نؤجل تحميل بقية الكتالوج حتى يفرغ المتصفح من رسم الصفحة الأولى
  if ('requestIdleCallback' in window) requestIdleCallback(_loadRestOfCatalog, { timeout: 3000 });
  else setTimeout(_loadRestOfCatalog, 1500);
}

// يستدعيه app.js بعد تحميل جميع الوحدات، ويمنع تشغيل التهيئة قبل cart/auth/navigation.
window.initializeProductsModule = initializeProductsModule;

// products.js يُحمّل ديناميكياً وقد يسبق cart.js وauth-ui.js.
// ننتظر اكتمال الدوال المطلوبة ثم نشغّل التهيئة تلقائياً، حتى لو لم تُحدّث app.js.
(function bootProductsAfterAllModules() {
  let attempts = 0;
  const tryBoot = () => {
    if (window.__productsModuleStarted) return;
    const dependenciesReady =
      typeof window.updateCartUI === 'function' &&
      typeof window.renderCategories === 'function' &&
      typeof window.cldOptimize === 'function' &&
      typeof window.escHtml === 'function' &&
      typeof window.isStaff === 'function' &&
      document.getElementById('productsGrid');
    if (dependenciesReady) {
      initializeProductsModule().catch(err => console.error('Products init:', err));
      return;
    }
    if (++attempts < 120) setTimeout(tryBoot, 100);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBoot, { once: true });
  } else {
    setTimeout(tryBoot, 0);
  }
})();

function syncCartWithProducts() {
  if (!cart.length) return;
  let changed = false;
  cart = cart.filter(item => {
    if (item.isBundle) {
      const b = offers.find(o => o.id === item.bundleId && o.type === 'bundle');
      if (!b || !isBundleInStock(b)) { changed = true; return false; }
      if ((item.bundleItems || []).some(bi => !products.find(x => x.id === bi.productId))) { changed = true; return false; }
      if (b.bundlePrice !== item.price) { item.price = b.bundlePrice; changed = true; }
      return true;
    }
    const p = products.find(x => x.id === item.id);
    if (!p) { changed = true; return false; }
    const newUnitPrice = getEffectiveUnitPrice(p, item.qty);
    if (p.price !== item.basePrice || newUnitPrice !== item.price || p.icon !== item.icon || p.image !== item.image) {
      item.basePrice = p.price; item.price = newUnitPrice; item.icon = p.icon; item.image = p.image; item.points = getEffectivePoints(p);
      changed = true;
    }
    return true;
  });
  if (changed) {
    updateCartUI();
    renderProducts();
  }
}

// =====================
// LANGUAGE
// =====================
function toggleLang() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  const body = document.body;
  if (currentLang === 'en') {
    body.classList.add('en');
    body.setAttribute('dir','ltr');
    document.documentElement.setAttribute('lang','en');
    document.getElementById('langLabel').textContent = 'AR';
    document.getElementById('checkoutArrow').className = 'fas fa-arrow-right';
    document.getElementById('nextArrow').className = 'fas fa-arrow-right';
    document.getElementById('backArrow').className = 'fas fa-arrow-left';
  } else {
    body.classList.remove('en');
    body.setAttribute('dir','rtl');
    document.documentElement.setAttribute('lang','ar');
    document.getElementById('langLabel').textContent = 'EN';
    document.getElementById('checkoutArrow').className = 'fas fa-arrow-left';
    document.getElementById('nextArrow').className = 'fas fa-arrow-left';
    document.getElementById('backArrow').className = 'fas fa-arrow-right';
  }
  // Update all data-ar / data-en elements
  document.querySelectorAll('[data-ar]').forEach(el => {
    const val = el.getAttribute('data-' + currentLang);
    if (val) el.innerHTML = val;
  });
  // Re-render dynamic content
  renderCategories();
  renderProducts();
  renderOffers();
  updateCartUI();
  initOffersTicker();
  renderHeroTitle();
}
function fmtPrice(n) {
  n = Number(n) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function t(ar, en) {
  return currentLang === 'en' ? en : ar;
}

// =====================
// CATEGORIES
// =====================
async function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  // إن وُجدت منتجات معلَّمة للطلاب وغاب القسم (مثلاً لم يُحفظ بعد) نعرضه محلياً للعميل
  if (hasStudentProducts()) ensureStudentsCategory();
  const visibleCats = categories.filter(c =>
    c.id === 'all' ||
    (c.id === STUDENTS_CATEGORY.id ? hasStudentProducts() : products.filter(p => p.cat === c.id).length > 0)
  );

  const qtyProducts = await getActiveQtyOfferProducts();
  const bundles = getActiveBundles();
  const extraCards = [];
  if (bundles.length) {
    extraCards.push({
      id: '__cat_bundles',
      icon: '🎁',
      ar: 'الباقات',
      en: 'Bundles'
    });
  }
  if (qtyProducts.length) {
    extraCards.push({
      id: '__cat_qty_offers',
      icon: '🏷️',
      ar: 'عروض الكمية',
      en: 'Quantity Offers'
    });
  }

  const allCards = [
    ...extraCards,
    ...visibleCats
  ];

  const selectedLabel = currentLang==='en' ? 'Choose a category' : 'اختر القسم ( الكل)';
  const currentLabel = currentCat === 'all'
    ? selectedLabel
    : (allCards.find(c => c.id === currentCat)?.[currentLang==='en'?'en':'ar'] || selectedLabel);
  grid.innerHTML = `
    <select id="categorySelect" aria-label="${escHtml(selectedLabel)}" onchange="filterCat(this.value)">
      <option value="all">${escHtml(selectedLabel)}</option>
      ${allCards.filter(c => c.id !== 'all').map(c => `<option value="${escHtml(c.id)}" ${currentCat===c.id?'selected':''}>${escHtml(currentLang==='en'?c.en:c.ar)}</option>`).join('')}
    </select>
    <div class="category-picker-label">
      <span>${escHtml(currentLabel)}</span>
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </div>
  `;
}

function filterCat(id) {
  currentCat = id;
  productsDisplayLimit = PRODUCTS_PAGE_SIZE;
  renderCategories();
  renderProducts();
  scrollToProducts();
}
function goHome() {
  // إعادة تعيين كل الفلاتر والبحث والعودة الفعلية لأعلى الصفحة الرئيسية
  currentCat = 'all';
  productsDisplayLimit = PRODUCTS_PAGE_SIZE;

  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.value = '';
  hideSearchSuggestions();

  const priceMinEl = document.getElementById('filterPriceMin');
  const priceMaxEl = document.getElementById('filterPriceMax');
  const brandEl = document.getElementById('filterBrand');
  const inStockEl = document.getElementById('filterInStock');
  const sortEl = document.getElementById('sortSelect');
  if (priceMinEl) priceMinEl.value = '';
  if (priceMaxEl) priceMaxEl.value = '';
  if (brandEl) brandEl.value = 'all';
  if (inStockEl) inStockEl.checked = false;
  if (sortEl) sortEl.value = 'default';

  renderCategories();
  renderProducts();

  // نمسح موضع التمرير المحفوظ سابقاً للرئيسية، عشان زر "الرئيسية" يضمن الرجوع لأعلى الصفحة دايماً
  if (typeof pageScrollPositions === 'object' && pageScrollPositions) {
    delete pageScrollPositions['home'];
  }

  showPage('home');
  updateBottomNav('home');
  window.scrollTo(0, 0);
}
function loadMoreProducts() {
  productsDisplayLimit += PRODUCTS_PAGE_SIZE;
  renderProducts();
}

var _infiniteScrollObserver = null;

function setupInfiniteScroll() {
  if (_infiniteScrollObserver) _infiniteScrollObserver.disconnect();

  const sentinel = document.getElementById('loadMoreWrap');
  if (!sentinel) return;

  _infiniteScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const grid = document.getElementById('productsGrid');
        const totalFiltered = parseInt(grid.dataset.totalFiltered || '0');
        if (productsDisplayLimit < totalFiltered) {
          productsDisplayLimit += PRODUCTS_PAGE_SIZE;
          renderProducts();
        }
      }
    });
  }, { rootMargin: '600px' });

  _infiniteScrollObserver.observe(sentinel);
}

runWhenDomReady(() => {
  setupInfiniteScroll();
});

// =====================
// PRODUCTS
// =====================
// تطبيع النص العربي: يوحّد أشكال الألف والهمزة والتاء المربوطة لتحسين دقة البحث
function normalizeArabic(str) {
  if (!str) return '';
  return str.toString().toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '') // إزالة التشكيل
    .trim();
}
// ===== SEARCH INDEX (فهرسة مخزّنة لتسريع البحث في الكتالوجات الكبيرة) =====
var _searchIndexCache = {};

function clearSearchIndex() {
  _searchIndexCache = {};
}
function getProductSearchIndex(p) {
  let idx = _searchIndexCache[p.id];
  if (idx) return idx;
  const cat = categories.find(c => c.id === p.cat);
  idx = {
    nameAr: normalizeArabic(p.ar),
    nameEn: (p.en || '').toLowerCase(),
    brandAr: normalizeArabic(p.brand),
    brandEn: (p.brand || '').toLowerCase(),
    catAr: normalizeArabic(cat ? cat.ar : ''),
    catEn: (cat ? cat.en : '').toLowerCase(),
    descAr: normalizeArabic(p.desc_ar),
    descEn: (p.desc_en || '').toLowerCase(),
  };
  _searchIndexCache[p.id] = idx;
  return idx;
}
// البحث يعمل على المنتجات المحمّلة فقط؛ فإن بحث العميل قبل اكتمال تحميل الكتالوج نكمل التحميل ثم نعيد البحث
var _searchCatalogLoading = false;
function dpEnsureCatalogForSearch() {
  if (_productsAllLoaded || _searchCatalogLoading || typeof ensureAllProductsLoaded !== 'function') return;
  _searchCatalogLoading = true;
  ensureAllProductsLoaded().then(() => {
    _searchCatalogLoading = false;
    const v = (document.getElementById('searchInput') || {}).value;
    if (v && v.trim()) { renderProducts(); renderSearchSuggestions(); }
  }).catch(() => { _searchCatalogLoading = false; });
}

function productMatchesQuery(p, rawQuery) {
  const terms = rawQuery.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const idx = getProductSearchIndex(p);
  let score = 0;
  for (const term of terms) {
    const normT = normalizeArabic(term);
    const lowerT = term.toLowerCase();
    if (idx.nameAr.includes(normT) || idx.nameEn.includes(lowerT)) score += 10;
    else if (idx.brandAr.includes(normT) || idx.brandEn.includes(lowerT)) score += 5;
    else if (idx.descAr.includes(normT) || idx.descEn.includes(lowerT)) score += 1;
    else return 0;
  }
  const fullNorm = normalizeArabic(rawQuery);
  const fullLower = rawQuery.trim().toLowerCase();
  if (idx.nameAr.startsWith(fullNorm) || idx.nameEn.startsWith(fullLower)) score += 50;
  return score;
}

function debounce(fn, wait) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

function populateBrandFilter() {
  const sel = document.getElementById('filterBrand');
  if (!sel) return;
  const currentVal = sel.value || 'all';
  const brands = [...new Set(products.map(p => p.brand))].sort();
  sel.innerHTML = `<option value="all">${t('كل الماركات','All Brands')}</option>` +
    brands.map(b => `<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('');
  if (brands.includes(currentVal)) sel.value = currentVal;
}

function clearFilters() {
  document.getElementById('filterPriceMin').value = '';
  document.getElementById('filterPriceMax').value = '';
  document.getElementById('filterBrand').value = 'all';
  document.getElementById('filterInStock').checked = false;
  document.getElementById('sortSelect').value = 'default';
  productsDisplayLimit = PRODUCTS_PAGE_SIZE;
  renderProducts();
}

function toggleCompactView() {
  const isCompact = document.body.classList.toggle('compact-view');
  const icon = document.getElementById('fabViewToggleIcon');
  if (icon) icon.className = isCompact ? 'fas fa-th' : 'fas fa-th-large';
  localStorage.setItem('dentapro_compact_view', isCompact ? '1' : '0');
}
if (localStorage.getItem('dentapro_compact_view') === '1') {
  document.body.classList.add('compact-view');
}

function buildQtyOfferTiersText(p, offer) {
  // مادة بمقاسات مختلفة الأسعار: لا يوجد "سعر عادي" واحد نقارن به
  const showInstead = !(p.hasSizes && !sizesSamePrice(p));
  return offer.tiers.map(tr =>
    `${t('اشتري','Buy')} ${tr.qty} ${t('بسعر','for')} ${fmtPrice(tr.price)} ${t('د.أ','JD')}${showInstead ? ` ${t('بدلاً من','instead of')} ${fmtPrice(p.price * tr.qty)} ${t('د.أ','JD')}` : ''}${dpTierSizesText(tr)}`
  ).join(` ${t('أو','or')} `);
}

// ===================== المنتجات متعددة المقاسات =====================
// كل مقاس هو منتج فعلي مستقل (له سعره ومخزونه) مرتبط بالمنتج الرئيسي عبر parentId، ولا يظهر في القوائم.
// المنتج الرئيسي (hasSizes) يُعرض ببطاقة واحدة، وزرّها يفتح قائمة المقاسات والأسعار.
function dpIsChildOut(c) { return c.stock !== undefined && c.stock !== null && c.stock <= 0; }

function getSizeChildren(parent) {
  const order = (parent && parent.sizeIds) || [];
  return products.filter(x => x.parentId === parent.id).sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

// هل جميع مقاسات المنتج بنفس السعر؟ (عندها نعرضه كمادة واحدة بجانبها المقاسات المختارة)
function sizesSamePrice(parent) {
  const kids = getSizeChildren(parent);
  if (!kids.length) return false;
  const r = (v) => Math.round((parseFloat(v) || 0) * 1000);
  return kids.every(k => r(k.price) === r(kids[0].price));
}

// يجمّع أسطراً (سلة/طلب سريع/عرض سعر) حسب المنتج الرئيسي للمقاسات المتساوية السعر.
// يرجع مصفوفة عناصر: { parent, lines:[{line, idx}] } لمجموعة مقاسات، أو { line, idx } لسطر عادي (الترتيب محفوظ)
function dpGroupSizeLines(lines, getParentId) {
  const out = []; const seen = {};
  lines.forEach((line, idx) => {
    const pid = getParentId(line);
    const parent = pid ? products.find(x => x.id === pid) : null;
    if (parent && parent.hasSizes && sizesSamePrice(parent)) {
      if (!seen[pid]) { seen[pid] = { parent, lines: [] }; out.push(seen[pid]); }
      seen[pid].lines.push({ line, idx });
    } else {
      out.push({ line, idx });
    }
  });
  return out;
}

// ===== عرض بنود الطلبات/عروض الأسعار: مقاسات المادة الواحدة بنفس السعر تظهر بنداً واحداً وبجانبه المقاسات =====
// عرض فقط: البيانات تبقى سطراً لكل مقاس. يرجع نفس بنود الإدخال، وتُستبدل مجموعة المقاسات ببند واحد فيه:
// ar/en = اسم المادة، qty = مجموع الكميات، sizesLabel = "أحمر × 1 · أصفر × 2"
function dpDisplayItems(items) {
  if (!Array.isArray(items)) return items;
  const unitOf = (it) => (it.price !== undefined && it.price !== null) ? it.price : it.unitPrice;
  const r3 = (v) => Math.round((parseFloat(v) || 0) * 1000);
  const resolve = (it) => {
    if (it.isBundle || it.isCustom) return null;
    let parentId = it.parentId, label = it.sizeLabel;
    if (!parentId) { // طلبات قديمة بلا ربط محفوظ: نربطها بالمنتج الفعلي إن كان موجوداً
      const pid = it.id !== undefined ? it.id : it.productId;
      const prod = pid !== undefined && pid !== null ? products.find(x => String(x.id) === String(pid)) : null;
      if (prod && prod.parentId) { parentId = prod.parentId; label = label || prod.sizeLabel; }
    }
    return parentId && label ? { parentId, label } : null;
  };
  const byParent = {};
  items.forEach(it => { const r = resolve(it); if (r) (byParent[r.parentId] = byParent[r.parentId] || []).push({ it, r }); });
  const out = []; const done = {};
  items.forEach(it => {
    const r = resolve(it);
    if (!r) { out.push(it); return; }
    const g = byParent[r.parentId];
    const parent = products.find(x => String(x.id) === String(r.parentId));
    const kidsKnown = parent ? getSizeChildren(parent).length > 0 : false;
    const sameInOrder = g.every(x => r3(unitOf(x.it)) === r3(unitOf(g[0].it)) && (x.it.points || 0) === (g[0].it.points || 0));
    const familyOk = !kidsKnown || sizesSamePrice(parent); // عائلة أسعارها مختلفة: لا نجمّع
    if (!sameInOrder || !familyOk) { out.push(it); return; }
    const key = String(r.parentId);
    if (done[key]) return;
    done[key] = true;
    const strip = (name, label) => { const suf = ' — ' + label; return (name || '').endsWith(suf) ? name.slice(0, -suf.length) : (name || ''); };
    const allQty = g.every(x => x.it.qty);
    const totalQty = allQty ? g.reduce((sum, x) => sum + x.it.qty, 0) : null;
    out.push({
      ...g[0].it,
      ar: parent ? parent.ar : strip(g[0].it.ar, g[0].r.label),
      en: parent ? parent.en : strip(g[0].it.en, g[0].r.label),
      qty: totalQty,
      sizesLabel: g.map(x => x.r.label + (x.it.qty ? ' × ' + x.it.qty : '')).join(' · '),
      isSizeGroup: true,
    });
  });
  return out;
}

// سطر فرعي يعرض المقاسات المختارة تحت اسم المادة (أو فراغ إن لم يكن البند مجموعة مقاسات)
function dpSizesSub(item) {
  return item && item.sizesLabel
    ? `<span style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-top:2px">${escHtml(item.sizesLabel)}</span>`
    : '';
}

function dpIsOut(p) {
  if (p.hasSizes) { const kids = getSizeChildren(p); return kids.length === 0 || !kids.some(k => !dpIsChildOut(k)); }
  return p.stock !== undefined && p.stock !== null && p.stock <= 0;
}

// نص شرائح عرض الكمية: "10 بـ 8 · 20 بـ 15 د.أ"
function dpOfferTiersText(offer) {
  const tiers = (offer.tiers || []).slice().sort((a, b) => a.qty - b.qty);
  return tiers.map(tr => `${tr.qty} ${t('بـ', 'for')} ${fmtPrice(tr.price)}${dpTierSizesText(tr)}`).join(' · ') + ' ' + t('د.أ', 'JD');
}

var _sizePick = null; // { parentId, qty: { childId: number } }

// مقاسات قائمة الاختيار: مع opts.offerOnly (الضغط على "أضف للسلة" من بطاقة عرض كمية) تُعرض المقاسات المشمولة بالعرض فقط
function dpPickerKids(parent, opts) {
  let kids = getSizeChildren(parent);
  if (opts && opts.offerOnly) {
    const o = getActiveQtyOffer(parent.id);
    const ids = o ? dpOfferSizeIds(o) : null;
    if (ids) kids = kids.filter(k => ids.some(i => String(i) === String(k.id)));
  }
  return kids;
}

// عرض الكمية على مادة (أو بطاقة عرض): المادة بمقاسات تفتح قائمة المقاسات المشمولة فقط
function addOfferToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (p.hasSizes) { openSizePicker(p.id, { offerOnly: true }); return; }
  addToCart(id);
}

async function openSizePicker(parentId, opts) {
  const parent = products.find(x => x.id === parentId);
  if (!parent) return;
  try { await fetchProductsByIds(parent.sizeIds || []); } catch (e) {}
  const kids = dpPickerKids(parent, opts);
  if (!kids.length) { showToast('⚠️ ' + t('لا توجد مقاسات متاحة لهذا المنتج حالياً', 'No sizes available for this product'), 'error'); return; }
  _sizePick = { parentId, qty: {}, opts: opts || {} };
  const _samePrice = sizesSamePrice(parent);
  const _isCartMode = !(opts && opts.onConfirm);
  const old = document.getElementById('sizePickerModal'); if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'sizePickerModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '3200';
  modal.onclick = (e) => { if (e.target === modal) closeSizePicker(); };
  modal.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary))">
        <div class="modal-title"><i class="fas fa-list-ul"></i> <span>${escHtml(currentLang==='en' ? parent.en : parent.ar)}</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="closeSizePicker()"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding:16px 18px">
        ${_samePrice ? `<div style="font-weight:800;color:var(--primary-dark);margin-bottom:6px">${t('السعر', 'Price')}: ${fmtPrice(kids[0].price)} ${t('د.أ','JD')}</div>` : ''}
        ${getActiveQtyOffer(parent.id) ? `<div style="font-size:12px;font-weight:700;color:var(--success);background:#f0fff4;border-radius:10px;padding:6px 10px;margin-bottom:8px">🏷️ ${t('عرض كمية على مجموع المقاسات المشمولة', 'Quantity offer on the total of the included sizes')}: ${dpOfferTiersText(getActiveQtyOffer(parent.id))}</div>` : ''}
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">${t('اختر مقاساً أو أكثر، وحدّد الكمية لكل مقاس', 'Choose one or more sizes and set the quantity for each')}</div>
        <div id="sizePickerRows"></div>
        <button id="sizePickerAddBtn" type="button" onclick="confirmSizePicker()" disabled
          style="width:100%;margin-top:12px;padding:13px;border:none;border-radius:50px;background:var(--primary);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;opacity:.5">
          <i class="fas ${_isCartMode ? 'fa-cart-plus' : 'fa-plus'}"></i> ${_isCartMode ? t('إضافة للسلة', 'Add to cart') : t('إضافة', 'Add')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  dpRenderSizeRows();
}

function closeSizePicker() {
  const m = document.getElementById('sizePickerModal'); if (m) m.remove();
  _sizePick = null;
}

function dpRenderSizeRows() {
  if (!_sizePick) return;
  const parent = products.find(x => x.id === _sizePick.parentId);
  if (!parent) return;
  const kids = dpPickerKids(parent, _sizePick.opts);
  const _famOffer = getActiveQtyOffer(parent.id);
  const box = document.getElementById('sizePickerRows');
  if (!box) return;
  box.innerHTML = kids.map(k => {
    const out = dpIsChildOut(k);
    const q = _sizePick.qty[k.id] || 0;
    const sel = q > 0;
    const inCart = cart.find(c => c.id === k.id);
    return `
      <div onclick="${out ? '' : `dpSizeToggle(${k.id})`}"
        style="display:flex;align-items:center;gap:10px;padding:11px 12px;margin-bottom:8px;border-radius:12px;cursor:${out?'not-allowed':'pointer'};
               border:2px solid ${sel?'var(--primary)':'#dbe7f0'};background:${sel?'#eaf4fb':'#fff'};opacity:${out?0.5:1}">
        <div style="width:22px;height:22px;border-radius:6px;border:2px solid ${sel?'var(--primary)':'#9db7c9'};background:${sel?'var(--primary)':'#fff'};color:#fff;
                    display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${sel?'<i class="fas fa-check"></i>':''}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14px">${escHtml(k.sizeLabel || '')}</div>
          <div style="font-size:12px;color:var(--text-muted)">${out ? t('نفذت الكمية','Out of stock') : (inCart ? t('في السلة ','In cart ') + '(' + inCart.qty + ')' : '')}</div>
          ${(!out && getActiveQtyOffer(k.id)) ? `<div style="font-size:12px;font-weight:700;color:var(--success)">🏷️ ${dpOfferTiersText(getActiveQtyOffer(k.id))}</div>` : ''}
          ${(!out && _famOffer && (_famOffer.tiers || []).some(tr => dpTierCovers(tr, k.id))) ? `<div style="font-size:12px;font-weight:700;color:var(--success)">🏷️ ${t('ضمن العرض','Included in the offer')}</div>` : ''}
        </div>
        ${sizesSamePrice(parent) ? '' : `<div style="font-weight:800;color:var(--primary-dark);white-space:nowrap">${fmtPrice(k.price)} ${t('د.أ','JD')}</div>`}
        ${sel ? `
        <div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:6px">
          <button type="button" onclick="dpSizeQty(${k.id},-1)" style="width:28px;height:28px;border-radius:50%;border:1px solid #9db7c9;background:#fff;cursor:pointer;font-size:16px;line-height:1">−</button>
          <span style="min-width:22px;text-align:center;font-weight:800">${q}</span>
          <button type="button" onclick="dpSizeQty(${k.id},1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--primary);background:var(--primary);color:#fff;cursor:pointer;font-size:16px;line-height:1">+</button>
        </div>` : ''}
      </div>`;
  }).join('');
  const total = Object.values(_sizePick.qty).filter(n => n > 0).length;
  const btn = document.getElementById('sizePickerAddBtn');
  if (btn) { btn.disabled = total === 0; btn.style.opacity = total === 0 ? '.5' : '1'; }
}

function dpSizeToggle(childId) {
  if (!_sizePick) return;
  _sizePick.qty[childId] = (_sizePick.qty[childId] || 0) > 0 ? 0 : 1;
  dpRenderSizeRows();
}

function dpSizeQty(childId, delta) {
  if (!_sizePick) return;
  const k = products.find(x => x.id === childId);
  const cur = _sizePick.qty[childId] || 0;
  let next = cur + delta;
  if (next < 1) next = 1;
  const _noStockCap = _sizePick.opts && _sizePick.opts.mode === 'quote';
  if (!_noStockCap && k && k.stock !== undefined && k.stock !== null && next > k.stock) {
    showToast(t(`❌ الكمية المتوفرة: ${k.stock} فقط`, `❌ Only ${k.stock} in stock`), 'error');
    next = k.stock;
  }
  _sizePick.qty[childId] = next;
  dpRenderSizeRows();
}

function confirmSizePicker() {
  if (!_sizePick) return;
  const chosen = Object.entries(_sizePick.qty).filter(([, q]) => q > 0);
  if (!chosen.length) return;
  // وضع مخصص (الطلب السريع / طلب عرض السعر): نسلّم المقاسات المختارة للمستدعي بدل إضافتها للسلة
  const _onConfirm = _sizePick.opts && _sizePick.opts.onConfirm;
  if (_onConfirm) {
    const selections = chosen.map(([idStr, qty]) => ({ child: products.find(x => x.id === parseInt(idStr, 10)), qty }))
      .filter(sel => sel.child && !dpIsChildOut(sel.child));
    closeSizePicker();
    if (selections.length) _onConfirm(selections);
    return;
  }
  let added = 0;
  chosen.forEach(([idStr, qty]) => {
    const id = parseInt(idStr, 10);
    const k = products.find(x => x.id === id);
    if (!k || dpIsChildOut(k)) return;
    const existing = cart.find(x => String(x.id) === String(id));
    if (existing) { changeQty(id, qty); added++; return; }
    cart.push({ ...k, qty, basePrice: k.price, price: getEffectiveUnitPrice(k, qty), points: getEffectivePoints(k) });
    logActivity('add_to_cart', { productId: k.id, productName: k.ar });
    added++;
  });
  closeSizePicker();
  if (!added) return;
  showToast(`✅ ${t('أُضيف للسلة', 'Added to cart')} (${added})`, 'success', { center: true });
  updateCartUI();
  renderProducts();
  bumpCartIcon();
}

function productCardHTML(p) {
  const isSizes = !!p.hasSizes;
  const _sizeKids = isSizes ? getSizeChildren(p) : [];
  const _someSizeOffer = isSizes && !getActiveQtyOffer(p.id) && _sizeKids.some(k => getActiveQtyOffer(k.id));
  const _fromPrefix = (isSizes && !sizesSamePrice(p)) ? t('من ','From ') : ''; // نفس السعر لكل المقاسات: يظهر السعر عادياً
  const inCart = isSizes ? _sizeKids.some(k => cart.find(c => c.id === k.id)) : cart.find(c => c.id === p.id);
  const outOfStock = isSizes ? dpIsOut(p) : (p.stock !== undefined && p.stock !== null && p.stock <= 0);
  const hasQtyOffer = !!getActiveQtyOffer(p.id);
  const _qOffer = getActiveQtyOffer(p.id);
  const effPoints = getEffectivePoints(p);
  const qtyOfferTiersText = hasQtyOffer ? buildQtyOfferTiersText(p, _qOffer) : '';
  const compactOfferPrice = (_qOffer && _qOffer.tiers && _qOffer.tiers.length)
    ? (_qOffer.tiers[_qOffer.tiers.length-1].price / _qOffer.tiers[_qOffer.tiers.length-1].qty)
    : p.price;
  const adminQuickBtns = isStaff() ? `
      <div style="position:absolute;top:12px;right:12px;z-index:3;display:flex;gap:6px">
        <button onclick="event.stopPropagation();openEditProduct(${p.id})" title="تعديل سريع"
          style="width:32px;height:32px;border-radius:50%;background:#0a5c8a;color:#fff;border:2px solid #fff;
                 cursor:pointer;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.2)">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="event.stopPropagation();openDeleteConfirm(${p.id})" title="حذف سريع"
          style="width:32px;height:32px;border-radius:50%;background:#e53e3e;color:#fff;border:2px solid #fff;
                 cursor:pointer;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.2)">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>` : '';
  return `
    <div class="product-card${hasQtyOffer ? ' qty-offer-frame-static' : ''}" onclick="openProductDetail(${p.id})" style="cursor:pointer">
      ${adminQuickBtns}
      <button class="compare-toggle-btn ${isInCompare(p.id)?'active':''}"
        onclick="event.stopPropagation();toggleCompare(${p.id})" title="${t('أضف للمقارنة','Add to compare')}">
        <i class="fas fa-balance-scale"></i>
      </button>
      <button class="favorite-toggle-btn ${isFavorite(p.id)?'active':''}"
        onclick="event.stopPropagation();toggleFavorite(${p.id})" title="${t('أضف للمفضلة','Add to favorites')}">
        <i class="fas ${isFavorite(p.id)?'fa-heart':'fa-heart'}"></i>
      </button>
      ${isNewProduct(p)
        ? `<div class="product-badge" style="background:linear-gradient(135deg,var(--accent),#00a896)">🆕 ${t('وصل حديثاً','Just Arrived')}</div>`
        : (outOfStock
            ? `<div class="product-badge" style="background:#94a3b8">${t('نفذت الكمية','Out of stock')}</div>`
            : (p.badge ? `<div class="product-badge" style="${p.badge==='الأكثر مبيعاً'?'background:linear-gradient(135deg, var(--gold-light), var(--gold));box-shadow:0 3px 8px rgba(184,134,11,0.35)':''}">${t(escHtml(p.badge), p.badge==='جديد'?'New':p.badge==='الأكثر مبيعاً'?'Best Seller':escHtml(p.badge))}</div>` : ''))}
      <div class="product-img-wrap" onclick="event.stopPropagation();openProductDetail(${p.id})" title="${t('التفاصيل','Details')}" style="position:relative;cursor:pointer;${outOfStock?'opacity:0.5':''}">
        ${p.image
          ? `<img src="${escHtml(cldOptimize(p.image, 400))}" alt="${escHtml(p.ar)}" loading="lazy" decoding="async" />`
          : `<span class="emoji-fallback">${escHtml(p.icon || '')}</span>`
        }
        ${hasQtyOffer ? `<div class="qty-offer-ribbon-static">⏰ ${t('عرض لفترة محدودة','Limited time offer')}</div>` : ''}
        <div class="compact-price-bar">${_fromPrefix}${fmtPrice(compactOfferPrice)} ${t('د.أ','JD')}</div>
      </div>
      <div class="product-info">
        <div class="product-brand compact-hide"><i class="fas fa-check-circle"></i> ${escHtml(p.brand)}</div>
        <div class="product-name" onclick="event.stopPropagation();openProductDetail(${p.id})" style="cursor:pointer">${escHtml(p.en)}</div>
        ${isSizes ? `<div class="compact-hide" onclick="event.stopPropagation();${outOfStock?'':`openSizePicker(${p.id})`}" style="display:inline-block;margin:2px 0 6px;padding:3px 10px;border-radius:50px;background:#e8f3fb;color:#0a5c8a;font-size:12px;font-weight:700;cursor:${outOfStock?'default':'pointer'}"><i class="fas fa-list-ul"></i> ${t('اختر المقاس','Choose size')} (${_sizeKids.length})</div>` : ''}
        <div class="product-desc compact-hide">${escHtml(currentLang==='en'?p.desc_en:p.desc_ar)}</div>
        ${hasQtyOffer ? `
        <div class="qty-offer-highlight compact-hide">${qtyOfferTiersText}${isSizes ? `<div style="font-size:11px;font-weight:600">${t('يُحسب على مجموع كميات المقاسات','Counted across all sizes')}</div>` : ''}</div>` : ''}
        ${_someSizeOffer ? `<div class="compact-hide" style="display:inline-block;margin:0 0 6px;padding:3px 10px;border-radius:50px;background:#f0fff4;color:var(--success);font-size:12px;font-weight:700">🏷️ ${t('عرض كمية على بعض المقاسات','Quantity offer on some sizes')}</div>` : ''}
        <div class="cart-details-split compact-hide">
          <button class="split-cart-btn ${inCart?'added':''}" onclick="event.stopPropagation();${outOfStock?'':(isSizes?`openSizePicker(${p.id})`:`addToCart(${p.id})`)}"
            ${outOfStock?'disabled style="opacity:0.5;cursor:not-allowed"':''}
            title="${outOfStock?t('نفذت الكمية','Out of stock'):(isSizes?t('اختر المقاس','Choose size'):t('أضف للسلة','Add to Cart'))}">
            <i class="fas ${inCart?'fa-check':(outOfStock?'fa-ban':(isSizes?'fa-list-ul':'fa-plus'))}"></i> <i class="fas fa-shopping-cart cart-btn-label"></i>
          </button>
          <button class="split-details-btn" onclick="event.stopPropagation();openProductDetail(${p.id})">
            <span class="details-btn-label">${t('التفاصيل','Details')}</span>
          </button>
        </div>
        <div class="product-price-row">
          <div class="product-price-block">
            ${hasQtyOffer ? ((isSizes && !sizesSamePrice(p)) ? '' : `<div class="product-old-price">${fmtPrice(p.price)} ${t('د.أ','JD')}</div>`) : (p.old ? `<div class="product-old-price">${fmtPrice(p.old)} ${t('د.أ','JD')}</div>` : '')}
            <div class="product-price">${_fromPrefix?`<small style="font-size:12px">${_fromPrefix}</small>`:''}${fmtPrice(compactOfferPrice)} <small style="font-size:13px">${t('د.أ','JD')}</small></div>
          </div>
          <!-- نقاط المادة مخفية من البطاقة وتظهر داخل صفحة المادة فقط -->
          <button class="add-to-cart product-quick-add ${inCart?'added':''}" onclick="event.stopPropagation();${outOfStock?'':(isSizes?`openSizePicker(${p.id})`:`addToCart(${p.id})`)}"
            ${outOfStock?'disabled style="opacity:0.4;cursor:not-allowed"':''}
            title="${outOfStock?t('نفذت الكمية','Out of stock'):(isSizes?t('اختر المقاس','Choose size'):t('أضف للسلة','Add to Cart'))}">
            <i class="fas ${inCart?'fa-check':(outOfStock?'fa-ban':(isSizes?'fa-list-ul':'fa-cart-plus'))}"></i>
          </button>
        </div>
      </div>
    </div>`;
}

async function renderProducts() {
  populateBrandFilter();

  let list;
  if (currentCat === '__cat_bundles') {
    list = [];
  } else if (currentCat === '__cat_qty_offers') {
    list = await getActiveQtyOfferProducts();
  } else {
    const _visibleProducts = products.filter(p => !p.parentId); // المقاسات الفرعية لا تظهر ببطاقات مستقلة
    list = currentCat === 'all' ? _visibleProducts
         : currentCat === STUDENTS_CATEGORY.id ? _visibleProducts.filter(p => p.studentPack)
         : _visibleProducts.filter(p => p.cat === currentCat);
    list = [...list].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
      return db - da;
    });
  }
  const searchValRaw = document.getElementById('searchInput').value.trim();
  let filtered = list;
  let searchScores = null;
  if (searchValRaw) {
    dpEnsureCatalogForSearch();
    searchScores = {};
    filtered = list.filter(p => {
      const score = productMatchesQuery(p, searchValRaw);
      if (score > 0) { searchScores[p.id] = score; return true; }
      return false;
    });
  }

  const priceMin = parseFloat(document.getElementById('filterPriceMin')?.value);
  const priceMax = parseFloat(document.getElementById('filterPriceMax')?.value);
  if (!isNaN(priceMin)) filtered = filtered.filter(p => p.price >= priceMin);
  if (!isNaN(priceMax)) filtered = filtered.filter(p => p.price <= priceMax);

  const brandVal = document.getElementById('filterBrand')?.value;
  if (brandVal && brandVal !== 'all') filtered = filtered.filter(p => p.brand === brandVal);

  const inStockOnly = document.getElementById('filterInStock')?.checked;
  if (inStockOnly) filtered = filtered.filter(p => !dpIsOut(p));

  const sortVal = document.getElementById('sortSelect')?.value || 'default';
  if (sortVal === 'price_asc')    filtered = [...filtered].sort((a,b) => a.price - b.price);
  if (sortVal === 'price_desc')   filtered = [...filtered].sort((a,b) => b.price - a.price);
  if (sortVal === 'newest')       filtered = [...filtered].sort((a,b) => b.id - a.id);
  if (sortVal === 'bestselling')  filtered = [...filtered].sort((a,b) => (b.badge==='الأكثر مبيعاً'?1:0) - (a.badge==='الأكثر مبيعاً'?1:0));
  if (sortVal === 'default' && searchScores) {
    filtered = [...filtered].sort((a,b) => (searchScores[b.id]||0) - (searchScores[a.id]||0));
  }
  if (sortVal === 'default' && !searchScores) {
    const isOut = p => dpIsOut(p) ? 1 : 0;
    filtered = [...filtered].sort((a,b) => isOut(a) - isOut(b));
  }

  const countEl = document.getElementById('filterResultsCount');
  if (countEl) countEl.textContent = `${filtered.length} ${t('نتيجة','results')}`;

  const grid = document.getElementById('productsGrid');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (currentCat === '__cat_bundles') {
    const bundles = getActiveBundles();
    if (!bundles.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted)"><i class="fas fa-search" style="font-size:48px;opacity:0.3;margin-bottom:16px;display:block"></i>${t('لا توجد باقات','No bundles found')}</div>`;
    } else {
      grid.innerHTML = bundles.map(bundleCardHTML).join('');
    }
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    renderBadgeSections();
    return;
  }
  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted)"><i class="fas fa-search" style="font-size:48px;opacity:0.3;margin-bottom:16px;display:block"></i>${t('لا توجد نتائج','No results found')}</div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    renderBadgeSections();
    return;
  }
  const visibleProducts = filtered.slice(0, productsDisplayLimit);
  grid.dataset.totalFiltered = filtered.length;
  if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  grid.innerHTML = visibleProducts.map(p => productCardHTML(p)).join('');
  // أول صورتين فوق الطي: نحمّلهما فوراً بأولوية (التحميل الكسول يؤخر أكبر عنصر مرئي LCP)
  grid.querySelectorAll('img[loading="lazy"]').forEach((img, i) => {
    if (i < 2) { img.loading = 'eager'; img.setAttribute('fetchpriority', 'high'); }
  });
  renderBadgeSections();
  setupInfiniteScroll();
}

// أقسام الشارات في الصفحة الرئيسية: الشارة نص يكتبه الأدمن على المنتج، فيُولَّد قسم لكل شارة مختلفة موجودة فعلاً،
// وعنوان القسم هو نص الشارة نفسه. إن لم يوجد منتج بشارة فلا يظهر شيء. الأقسام مرتبة هجائياً لتبقى ثابتة.
function renderBadgeSections() {
  const wrap = document.getElementById('badgeSections');
  if (!wrap) return;
  if (!products.length) { wrap.innerHTML = ''; return; }
  const groups = new Map();
  products.forEach(p => {
    if (p.parentId) return;
    const b = (p.badge || '').trim();
    if (!b) return;
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(p);
  });
  wrap.innerHTML = [...groups.keys()].sort((a, c) => a.localeCompare(c, 'ar')).map(b => `
      <div class="badge-block" style="padding:24px 24px 8px">
        <div class="section-inner">
          <div class="section-header" style="text-align:right;margin-bottom:16px">
            <h2 class="section-title" style="margin-bottom:0">${escHtml(b)}</h2>
          </div>
          <div class="products-grid">${groups.get(b).slice(0, 8).map(p => productCardHTML(p)).join('')}</div>
        </div>
      </div>`).join('');
  dpMarkDynReady('products');
}


function renderSimilarProducts(product) {
  const wrap = document.getElementById('similarProductsWrap');
  const grid = document.getElementById('similarProductsGrid');
  if (!wrap || !grid) return;
  const sameCat = products.filter(p => !p.parentId && p.id !== product.id && p.cat === product.cat);
  let items = sameCat.slice(0, 6);
  if (items.length < 4) {
    const sameBrand = products.filter(p =>
      !p.parentId && p.id !== product.id && p.brand === product.brand && !items.find(i => i.id === p.id)
    );
    items = items.concat(sameBrand).slice(0, 6);
  }
  if (!items.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  grid.innerHTML = items.map(p => productCardHTML(p)).join('');
}

runWhenDomReady(() => {
  const searchEl = document.getElementById('searchInput');
  const searchBtnEl = document.querySelector('.header-search .search-btn');
  if (searchEl) {
    const debouncedSearchUpdate = debounce(() => {
      productsDisplayLimit = PRODUCTS_PAGE_SIZE;
      renderProducts();
      renderSearchSuggestions();
    }, 120);
    searchEl.addEventListener('input', debouncedSearchUpdate);
    searchEl.addEventListener('focus', renderSearchSuggestions);
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        productsDisplayLimit = PRODUCTS_PAGE_SIZE;
        hideSearchSuggestions();
        renderProducts();
        scrollToProducts();
      }
    });
  }
  if (searchBtnEl) {
    searchBtnEl.addEventListener('click', () => {
      productsDisplayLimit = PRODUCTS_PAGE_SIZE;
      hideSearchSuggestions();
      renderProducts();
      scrollToProducts();
    });
  }
  document.addEventListener('click', (e) => {
    const box = document.getElementById('searchSuggestions');
    if (box && box.style.display === 'block' && !box.contains(e.target) && e.target !== searchEl) {
      e.stopPropagation();
      e.preventDefault();
      hideSearchSuggestions();
    }
  }, true);
});

function positionSearchSuggestionsBox() {
  const box = document.getElementById('searchSuggestions');
  const inputEl = document.getElementById('searchInput');
  if (!box || !inputEl || box.style.display !== 'block') return;

  const inputRect = inputEl.getBoundingClientRect();
  box.style.top = inputRect.bottom + 'px';
  box.style.left = (inputRect.left + 10) + 'px';
  box.style.width = (inputRect.width - 20) + 'px';

  if (window.visualViewport) {
    const visibleBottom = window.visualViewport.height;
    const availableSpace = visibleBottom - inputRect.bottom - 16;
    box.style.maxHeight = Math.max(120, Math.min(340, availableSpace)) + 'px';
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', positionSearchSuggestionsBox);
}

function renderSearchSuggestions() {
  const box = document.getElementById('searchSuggestions');
  const inputEl = document.getElementById('searchInput');
  if (!box || !inputEl) return;
  const raw = inputEl.value.trim();
  if (!raw) { box.style.display = 'none'; return; }

  positionSearchSuggestionsBox();
  dpEnsureCatalogForSearch();

  const scored = [];
  for (const p of products) {
    if (p.parentId) continue;
    const score = productMatchesQuery(p, raw);
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a,b) => b.score - a.score);
  const matches = scored.slice(0, 30).map(s => s.p);

  if (!matches.length) {
    box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
      ${t('لا توجد نتائج مطابقة','No matching results')}</div>`;
    box.style.display = 'block';
    return;
  }

  box.innerHTML = matches.map(p => `
    <div onclick="selectSearchSuggestion(${p.id})"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f4f8"
      onmouseover="this.style.background='#f8fbfd'" onmouseout="this.style.background=''">
      <div style="width:36px;height:36px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,#f0f8ff,#e8f3fb);
                  display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden">
        ${p.image ? `<img src="${escHtml(cldOptimize(p.image,60))}" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : escHtml(p.icon || '')}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(p.en)}
        </div>
        <div style="font-size:11px;color:var(--text-muted)">${p.brand}</div>
      </div>
      <div style="font-weight:800;font-size:13px;color:var(--primary);flex-shrink:0">
        ${fmtPrice(p.price)} ${t('د.أ','JD')}
      </div>
    </div>`).join('');
  box.style.display = 'block';
}

function hideSearchSuggestions() {
  const box = document.getElementById('searchSuggestions');
  if (box) box.style.display = 'none';
}

function selectSearchSuggestion(id) {
  hideSearchSuggestions();
  document.getElementById('searchInput').value = '';
  renderProducts();
  showPage('home');
  setTimeout(() => openProductDetail(id), 50);
}

// =====================
// RENDER OFFERS SECTION
// =====================
var offersFilterMode = 'all'; // 'all' | 'bundle' | 'qty'

var offersSectionRevealed = true;

function goToOffersFiltered(mode) {
  offersFilterMode = mode;
  offersSectionRevealed = true;
  renderOffers();
  const section = document.getElementById('offersSection');
  if (section) section.scrollIntoView({behavior:'smooth', block:'start'});
}

function bundleCardHTML(b) {
  const original = getBundleOriginalPrice(b);
  const savings = original - b.bundlePrice;
  const miniIcons = (b.items || []).map(it => {
    const p = products.find(x => x.id === it.productId);
    if (!p) return '';
    return p.image
      ? `<img src="${escHtml(cldOptimize(p.image,60))}" style="width:30px;height:30px;border-radius:7px;object-fit:cover" loading="lazy">`
      : `<span style="font-size:20px">${escHtml(p.icon || '')}</span>`;
  }).join('');
  return `
    <div class="product-card offer-bundle-card qty-offer-frame">
      <div class="product-badge" style="background:linear-gradient(135deg,#f59e0b,#d97706)">🎁 ${t('باقة','Bundle')}</div>
      <div class="product-img-wrap qty-offer-icon-pulse" onclick="openBundleDetail(${b.id})" style="cursor:pointer">
        ${b.image ? `<img src="${escHtml(cldOptimize(b.image,400))}" alt="${escHtml(b.name_ar)}" loading="lazy">` : `<span class="emoji-fallback">${escHtml(b.icon||'🎁')}</span>`}
        <div class="qty-offer-ribbon compact-hide">⏰ ${t('عرض لفترة محدودة','Limited time offer')}</div>
        <div class="compact-price-bar">${fmtPrice(b.bundlePrice)} ${t('د.أ','JD')}</div>
      </div>
      <div class="product-info">
        <div class="product-name" onclick="event.stopPropagation();openBundleDetail(${b.id})" style="cursor:pointer">${escHtml(currentLang==='en'?b.name_en:b.name_ar)}</div>
        <div class="compact-hide" style="display:flex;gap:6px;margin:4px 0">${miniIcons}</div>
        <div class="product-desc compact-hide">${escHtml(currentLang==='en'?(b.desc_en||''):(b.desc_ar||''))}</div>
        ${savings>0?`<div class="qty-offer-highlight compact-hide">${t('بسعر','Price')} ${fmtPrice(b.bundlePrice)} ${t('د.أ','JD')} ${t('بدلاً من','instead of')} ${fmtPrice(original)} ${t('د.أ','JD')}</div>`:''}
        ${b.expiresAt ? `<div class="offer-countdown-badge mini compact-hide"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${b.expiresAt}">${formatCountdown(b.expiresAt)||''}</span></div>` : ''}
        <div class="product-price-row">
          <div>
            <div class="product-price">${fmtPrice(b.bundlePrice)} <small style="font-size:13px">${t('د.أ','JD')}</small></div>
            <div class="product-old-price">${fmtPrice(original)} ${t('د.أ','JD')}</div>
          </div>
          <button class="add-to-cart" onclick="event.stopPropagation();addBundleToCart(${b.id})" title="${t('أضف الباقة للسلة','Add bundle to cart')}">
            <i class="fas fa-cart-plus"></i>
          </button>
        </div>
      </div>
    </div>`;
}

async function renderOffers() {
  const section = document.getElementById('offersSection');
  const grid = document.getElementById('offersGrid');
  if (!section || !grid) return;

  const bundles = getActiveBundles();
  const qtyProducts = await getActiveQtyOfferProducts();

  if (!bundles.length && !qtyProducts.length) {
    section.style.display = 'none';
    return;
  }

  // لا تُظهر قسم العروض إلا بعد ضغط المستخدم على بطاقة الباقات/العروض
  if (!offersSectionRevealed) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const showBundles = offersFilterMode === 'all' || offersFilterMode === 'bundle';
  const showQty = offersFilterMode === 'all' || offersFilterMode === 'qty';

  let html = '';

  html += (showBundles ? bundles : []).map(bundleCardHTML).join('');

  html += (showQty ? qtyProducts : []).map(p => {
    const offer = getActiveQtyOffer(p.id);
    const bestTier = offer.tiers[offer.tiers.length-1];
    const unitPrice = bestTier.price / bestTier.qty;
    const allTiersText = buildQtyOfferTiersText(p, offer);
    return `
    <div class="product-card qty-offer-frame">
      <div class="product-badge" style="background:linear-gradient(135deg,var(--primary),var(--accent))">🏷️ ${t('عرض كمية','Qty Offer')}</div>
      <div class="product-img-wrap qty-offer-icon-pulse" onclick="openProductDetail(${p.id})" style="cursor:pointer" title="${t('التفاصيل','Details')}">
        ${p.image ? `<img src="${cldOptimize(p.image,400)}" alt="${escHtml(p.ar)}" loading="lazy">` : `<span class="emoji-fallback">${escHtml(p.icon || '')}</span>`}
        <div class="qty-offer-ribbon compact-hide">⏰ ${t('عرض لفترة محدودة','Limited time offer')}</div>
        <div class="compact-price-bar">${fmtPrice(unitPrice)} ${t('د.أ','JD')}</div>
      </div>
      <div class="product-info">
        <div class="product-name" onclick="event.stopPropagation();openProductDetail(${p.id})" style="cursor:pointer">${escHtml(p.en)}</div>
        <div class="qty-offer-highlight compact-hide">${allTiersText}</div>
        ${offer.expiresAt ? `<div class="offer-countdown-badge mini compact-hide"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${offer.expiresAt}">${formatCountdown(offer.expiresAt)||''}</span></div>` : ''}
        <div class="product-price-row">
          <div>
            <div class="product-price">${fmtPrice(unitPrice)} <small style="font-size:13px">${t('د.أ','JD')}</small></div>
            ${(p.hasSizes && !sizesSamePrice(p)) ? '' : `<div class="product-old-price">${fmtPrice(p.price)} ${t('د.أ','JD')}</div>`}
          </div>
          <button class="add-to-cart" onclick="event.stopPropagation();addOfferToCart(${p.id})" title="${t('أضف للسلة','Add to cart')}">
            <i class="fas fa-cart-plus"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = html;
}

// =====================
// BUNDLE SIZE PICKER — توزيع كمية كل عنصر في الباقة على مقاساته المسموحة
// =====================
function dpBundleSizesNote(it) {
  const kids = dpBundleItemKids(it);
  if (!kids || !kids.length) return '';
  return `<div style="font-size:11px;font-weight:600;color:var(--text-muted)">${t('المقاسات المتاحة','Available sizes')}: ${escHtml(kids.map(k => k.sizeLabel || k.ar).join('، '))}</div>`;
}

var _bundlePick = null; // { bundleId, alloc: { itemIdx: { childId: qty } } }

async function openBundleSizePicker(bundleId) {
  const b = offers.find(o => o.id === bundleId && o.type === 'bundle');
  if (!b) return;
  await prefetchOfferSizeProducts();
  _bundlePick = { bundleId, alloc: {} };
  const old = document.getElementById('bundlePickerModal'); if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'bundlePickerModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '3200';
  modal.onclick = (e) => { if (e.target === modal) closeBundleSizePicker(); };
  modal.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header" style="background:linear-gradient(135deg,#d97706,#f59e0b)">
        <div class="modal-title"><i class="fas fa-gift"></i> <span>${escHtml(currentLang==='en' ? b.name_en : b.name_ar)}</span></div>
        <button class="close-btn" aria-label="إغلاق" onclick="closeBundleSizePicker()"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding:16px 18px">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">${t('وزّع كمية كل مادة على المقاسات المتاحة لها', 'Distribute each item\'s quantity across its available sizes')}</div>
        <div id="bundlePickerBody"></div>
        <button id="bundlePickerAddBtn" type="button" onclick="confirmBundleSizePicker()" disabled
          style="width:100%;margin-top:12px;padding:13px;border:none;border-radius:50px;background:var(--primary);color:#fff;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;opacity:.5">
          <i class="fas fa-cart-plus"></i> ${t('إضافة الباقة للسلة', 'Add bundle to cart')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  dpRenderBundlePicker();
}

function closeBundleSizePicker() {
  const m = document.getElementById('bundlePickerModal'); if (m) m.remove();
  _bundlePick = null;
}

function dpBundleAllocSum(idx) {
  return Object.values((_bundlePick && _bundlePick.alloc[idx]) || {}).reduce((s, n) => s + n, 0);
}

function dpRenderBundlePicker() {
  if (!_bundlePick) return;
  const b = offers.find(o => o.id === _bundlePick.bundleId && o.type === 'bundle');
  const box = document.getElementById('bundlePickerBody');
  if (!b || !box) return;
  let ready = true;
  box.innerHTML = (b.items || []).map((it, idx) => {
    const p = products.find(x => x.id === it.productId);
    if (!p) return '';
    const kids = dpBundleItemKids(it);
    const name = escHtml(currentLang==='en' ? p.en : p.ar);
    if (!kids) return `<div style="padding:8px 12px;margin-bottom:8px;border-radius:12px;background:#f8fbfd;font-weight:700;font-size:13px">${name} <span style="color:var(--text-muted)">× ${it.qty}</span></div>`;
    const sum = dpBundleAllocSum(idx);
    if (sum !== it.qty) ready = false;
    const rows = kids.map(k => {
      const out = dpIsChildOut(k);
      const q = (_bundlePick.alloc[idx] || {})[k.id] || 0;
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:6px;border-radius:10px;border:1.5px solid ${q>0?'var(--primary)':'#dbe7f0'};background:${q>0?'#eaf4fb':'#fff'};opacity:${out?0.5:1}">
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:13px">${escHtml(k.sizeLabel || '')}</div>
            <div style="font-size:11px;color:var(--text-muted)">${out ? t('نفذت الكمية','Out of stock') : fmtPrice(k.price) + ' ' + t('د.أ','JD')}</div>
          </div>
          ${out ? '' : `
          <button type="button" onclick="dpBundleSizeQty(${idx},${k.id},-1)" style="width:28px;height:28px;border-radius:50%;border:1px solid #9db7c9;background:#fff;cursor:pointer;font-size:16px;line-height:1">−</button>
          <span style="min-width:20px;text-align:center;font-weight:800">${q}</span>
          <button type="button" onclick="dpBundleSizeQty(${idx},${k.id},1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--primary);background:var(--primary);color:#fff;cursor:pointer;font-size:16px;line-height:1">+</button>`}
        </div>`;
    }).join('');
    return `
      <div style="padding:10px 12px;margin-bottom:10px;border-radius:12px;border:1.5px solid #fde7b6;background:#fffaf0">
        <div style="display:flex;justify-content:space-between;gap:8px;font-weight:800;font-size:13px">
          <span>${name} × ${it.qty}</span>
          <span style="color:${sum===it.qty?'var(--success)':'#d97706'}">${sum} / ${it.qty}</span>
        </div>
        ${rows}
      </div>`;
  }).join('');
  const btn = document.getElementById('bundlePickerAddBtn');
  if (btn) { btn.disabled = !ready; btn.style.opacity = ready ? '1' : '.5'; }
}

function dpBundleSizeQty(idx, childId, delta) {
  if (!_bundlePick) return;
  const b = offers.find(o => o.id === _bundlePick.bundleId && o.type === 'bundle');
  const it = b && b.items[idx];
  if (!it) return;
  const a = _bundlePick.alloc[idx] = _bundlePick.alloc[idx] || {};
  const cur = a[childId] || 0;
  let next = cur + delta;
  if (next < 0) next = 0;
  if (delta > 0) {
    if (dpBundleAllocSum(idx) >= it.qty) return; // الكمية موزّعة بالكامل
    const k = products.find(x => x.id === childId);
    if (k && k.stock !== undefined && k.stock !== null && next > k.stock) {
      showToast(t(`❌ الكمية المتوفرة: ${k.stock} فقط`, `❌ Only ${k.stock} in stock`), 'error');
      return;
    }
  }
  if (next === 0) delete a[childId]; else a[childId] = next;
  dpRenderBundlePicker();
}

function confirmBundleSizePicker() {
  if (!_bundlePick) return;
  const b = offers.find(o => o.id === _bundlePick.bundleId && o.type === 'bundle');
  if (!b) return;
  const resolved = [];
  for (let idx = 0; idx < (b.items || []).length; idx++) {
    const it = b.items[idx];
    if (dpBundleItemKids(it)) {
      if (dpBundleAllocSum(idx) !== it.qty) return;
      Object.entries(_bundlePick.alloc[idx] || {}).forEach(([cid, q]) => resolved.push({ productId: parseInt(cid, 10), qty: q }));
    } else {
      resolved.push({ productId: it.productId, qty: it.qty });
    }
  }
  const id = _bundlePick.bundleId;
  closeBundleSizePicker();
  addBundleToCart(id, resolved);
}

// =====================
// BUNDLE DETAIL PAGE
// =====================
function openBundleDetail(id) {
  const b = offers.find(o => o.id === id && o.type === 'bundle');
  if (!b) return;

  const activeSection = document.querySelector('.page-section.active');
  lastPageBeforeDetail = activeSection ? activeSection.id : 'homePage';
  lastScrollYBeforeDetail = window.scrollY;

  const original = getBundleOriginalPrice(b);
  const savings = original - b.bundlePrice;
  const itemsRows = (b.items || []).map(it => {
    const p = products.find(x => x.id === it.productId);
    if (!p) return '';
    return `
      <div class="order-item-row">
        <div class="order-item-icon">${p.image ? `<img src="${escHtml(cldOptimize(p.image,60))}" style="width:100%;height:100%;object-fit:contain" loading="lazy">` : escHtml(p.icon || '')}</div>
        <div style="flex:1;font-weight:600;color:var(--primary-dark)">${escHtml(p.en)}${dpBundleSizesNote(it)}</div>
        <div style="color:var(--text-muted)">× ${it.qty}</div>
      </div>`;
  }).join('');

  document.getElementById('productDetailContent').innerHTML = `
    <div class="product-detail-grid">
      <div class="product-img-wrap product-detail-img">
        <div class="product-badge" style="background:linear-gradient(135deg,#f59e0b,#d97706)">🎁 ${t('باقة','Bundle')}</div>
        ${b.image ? `<img src="${escHtml(cldOptimize(b.image,600))}" alt="${escHtml(b.name_ar)}" loading="lazy">` : `<span class="emoji-fallback">${escHtml(b.icon||'🎁')}</span>`}
      </div>
      <div>
        <div class="product-name" style="font-size:22px;margin-bottom:8px">${escHtml(currentLang==='en'?b.name_en:b.name_ar)}</div>
        <div class="product-desc" style="margin-bottom:16px">${escHtml(currentLang==='en'?(b.desc_en||''):(b.desc_ar||''))}</div>
        <div class="product-price-row" style="margin-bottom:18px">
          <div>
            <div class="product-price" style="font-size:26px">${fmtPrice(b.bundlePrice)} <small style="font-size:14px">${t('د.أ','JD')}</small></div>
            <div class="product-old-price">${fmtPrice(original)} ${t('د.أ','JD')}</div>
            ${savings>0?`<div style="font-size:13px;font-weight:800;color:var(--success);margin-top:4px">${t('توفير','You save')} ${fmtPrice(savings)} ${t('د.أ','JD')}</div>`:''}
          </div>
        </div>
        ${b.expiresAt ? `<div class="offer-countdown-badge"><i class="fas fa-hourglass-half"></i> <span class="offer-countdown" data-expires="${b.expiresAt}">${formatCountdown(b.expiresAt)||''}</span></div>` : ''}
        ${b.points?`<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;padding:6px 12px;border-radius:50px;background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.05));border:1.5px solid rgba(245,158,11,0.35);width:fit-content"><span style="font-size:14px">🏆</span><span style="font-size:12px;font-weight:800;color:#d97706">${b.points} ${t('نقطة','pts')}</span></div>`:''}
        <div style="font-weight:800;font-size:14px;color:var(--primary-dark);margin-bottom:10px">${t('محتويات الباقة','Bundle Contents')}</div>
        <div class="order-items-list" style="margin-bottom:20px">${itemsRows}</div>
        <button class="btn-primary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px" onclick="addBundleToCart(${b.id})">
          <i class="fas fa-cart-plus"></i> ${t('أضف الباقة للسلة','Add bundle to cart')}
        </button>
      </div>
    </div>`;
  showPage('productDetail');
  history.replaceState(null, '', window.location.pathname);
}

// =====================
// NEW PRODUCTS NOTIFICATION
// =====================
function getLastVisitDate() {
  return localStorage.getItem('dentapro_last_visit') || null;
}

function setLastVisitDate() {
  localStorage.setItem('dentapro_last_visit', new Date().toISOString());
}

function getNewProductsSinceLastVisit() {
  const lastVisit = getLastVisitDate();
  if (!lastVisit) return [];
  return products.filter(p => !p.parentId && p.createdAt && new Date(p.createdAt) > new Date(lastVisit));
}

function showNewProductsNotification() {
  const newOnes = getNewProductsSinceLastVisit();
  if (!newOnes.length) return;

  const banner = document.createElement('div');
  banner.id = 'newProductsBanner';
  banner.style.cssText = `
    position: fixed; top: 90px; left: 50%; transform: translateX(-50%);
    z-index: 1800; background: linear-gradient(135deg, var(--accent), #00a896);
    color: #fff; padding: 14px 24px; border-radius: 50px;
    box-shadow: 0 8px 24px rgba(0,194,168,0.4);
    display: flex; align-items: center; gap: 12px; cursor: pointer;
    animation: slideIn 0.4s ease; font-weight: 700; font-size: 14px;
  `;
  banner.innerHTML = `
    <i class="fas fa-bell" style="font-size:18px"></i>
    <span>🎉 ${newOnes.length} منتج جديد أُضيف! اضغط للتصفح</span>
    <i class="fas fa-times" style="margin-right:4px;opacity:0.8" onclick="event.stopPropagation();document.getElementById('newProductsBanner').remove()"></i>
  `;
  banner.onclick = () => {
    banner.remove();
    scrollToProducts();
  };
  document.body.appendChild(banner);

  setTimeout(() => { if (document.getElementById('newProductsBanner')) banner.remove(); }, 8000);
}

function isNewProduct(p) {
  const lastVisit = getLastVisitDate();
  if (!lastVisit || !p.createdAt) return false;
  return new Date(p.createdAt) > new Date(lastVisit);
}
// =====================
// USER ACTIVITY LOG
// =====================
async function logActivity(type, details = {}) {
  if (!currentUser) return;
  const entry = {
    email: currentUser.email,
    name: currentUser.name,
    type, // 'login' | 'add_to_cart' | 'order_placed' | 'register' | 'profile_updated'
    details,
    createdAt: new Date().toISOString()
  };
  try {
    if (window._fbAddDoc && window._fbCollection && window._db) {
      await window._fbAddDoc(window._fbCollection(window._db, 'activity_log'), entry);
    }
  } catch(e) {
    console.warn('logActivity:', e.message);
  }
}

var ACTIVITY_LABELS = {
  login: { icon: 'fa-sign-in-alt', label: 'تسجيل دخول', color: '#0a5c8a' },
  register: { icon: 'fa-user-plus', label: 'إنشاء حساب', color: '#00c2a8' },
  add_to_cart: { icon: 'fa-cart-plus', label: 'أضاف منتج للسلة', color: '#1a8bbf' },
  order_placed: { icon: 'fa-shopping-bag', label: 'أرسل طلباً', color: '#22c55e' },
  profile_updated: { icon: 'fa-user-edit', label: 'حدّث ملفه الشخصي', color: '#f59e0b' },
};

function activityLabelHTML(type) {
  const a = ACTIVITY_LABELS[type] || { icon: 'fa-circle', label: type, color: '#5a7a90' };
  return `<i class="fas ${a.icon}" style="color:${a.color}"></i> ${a.label}`;
}
// =====================
// PRODUCT COMPARE
// =====================
function loadCompareList() {
  try {
    const saved = localStorage.getItem('dentapro_compare');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [];
}
var compareList = loadCompareList();

function saveCompareList() {
  localStorage.setItem('dentapro_compare', JSON.stringify(compareList));
}

function isInCompare(id) {
  return compareList.includes(id);
}

function toggleCompare(id) {
  if (isInCompare(id)) {
    compareList = compareList.filter(x => x !== id);
  } else {
    if (compareList.length >= 3) {
      showToast('⚠️ يمكنك مقارنة 3 منتجات كحد أقصى', 'error');
      return;
    }
    compareList.push(id);
  }
  saveCompareList();
  renderProducts();
  renderCompareBar();
}

function clearCompare() {
  compareList = [];
  saveCompareList();
  renderProducts();
  renderCompareBar();
}

function renderCompareBar() {
  const bar = document.getElementById('compareBar');
  const itemsDiv = document.getElementById('compareBarItems');
  if (!compareList.length) { bar.classList.remove('show'); return; }
  bar.classList.add('show');
  itemsDiv.innerHTML = compareList.map(id => {
    const p = products.find(x => x.id === id);
    if (!p) return '';
    return `
      <div class="compare-bar-chip">
        ${p.image ? `<img src="${escHtml(cldOptimize(p.image,60))}" loading="lazy">` : `<span class="emoji-mini">${escHtml(p.icon || '')}</span>`}
        <span style="font-size:12px;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.en)}</span>
        <button onclick="toggleCompare(${id})"><i class="fas fa-times-circle"></i></button>
      </div>`;
  }).join('');
}

function openComparePage() {
  if (compareList.length < 2) {
    showToast('⚠️ اختر منتجين على الأقل للمقارنة', 'error');
    return;
  }
  renderCompareTable();
  showPage('compare');
}

function renderCompareTable() {
  const wrap = document.getElementById('compareTableWrap');
  const items = compareList.map(id => products.find(x => x.id === id)).filter(Boolean);
  if (!items.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">لا توجد منتجات للمقارنة</div>`;
    return;
  }
  const rows = [
    { label: 'الصورة', render: p => p.image ? `<img src="${escHtml(cldOptimize(p.image,160))}" style="width:80px;height:80px;border-radius:10px;object-fit:cover" loading="lazy">` : `<span style="font-size:40px">${escHtml(p.icon || '')}</span>` },
    { label: 'الاسم', render: p => escHtml(p.en) },
    { label: 'الماركة', render: p => escHtml(p.brand) },
    { label: 'السعر', render: p => `<strong style="color:var(--primary)">${fmtPrice(p.price)} د.أ</strong>` },
    { label: 'السعر القديم', render: p => p.old ? `${fmtPrice(p.old)} د.أ` : '—' },
    { label: 'الحجم', render: p => p.unitQty ? escHtml(p.unitQty) : '—' },
    { label: 'بلد المنشأ', render: p => escHtml(p.country) || '—' },
    { label: 'نقاط الشراء', render: p => getEffectivePoints(p) ? `🏆 ${getEffectivePoints(p)}` : '—' },
    { label: 'المخزون', render: p => (p.stock !== undefined && p.stock !== null) ? p.stock : 'غير محدد' },
    { label: '', render: p => `<button class="btn-primary" style="padding:8px 18px;font-size:12px" onclick="addToCart(${p.id})">
        <i class="fas fa-cart-plus"></i> أضف للسلة</button>` },
  ];

  wrap.innerHTML = `
    <div class="compare-table-wrap">
      <table class="compare-table">
        ${rows.map(row => `
          <tr>
            <th>${row.label}</th>
            ${items.map(p => `<td>${row.render(p)}</td>`).join('')}
          </tr>`).join('')}
      </table>
    </div>`;
}

// =====================
// FAVORITES
// =====================
function loadFavoritesList() {
  try {
    const saved = localStorage.getItem('dentapro_favorites');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [];
}
var favoritesList = loadFavoritesList();

function saveFavoritesList() {
  localStorage.setItem('dentapro_favorites', JSON.stringify(favoritesList));
}

function isFavorite(id) {
  return favoritesList.includes(id);
}

function toggleFavorite(id) {
  if (isFavorite(id)) {
    favoritesList = favoritesList.filter(x => x !== id);
    showToast('💔 تمت الإزالة من المفضلة', '');
  } else {
    favoritesList.push(id);
    showToast('❤️ تمت الإضافة للمفضلة', 'success');
  }
  saveFavoritesList();
  renderProducts();
  if (document.getElementById('favoritesPage')?.classList.contains('active')) {
    renderFavoritesPage();
  }
}

function openFavoritesPage() {
  showPage('favorites');
  renderFavoritesPage();
}

async function renderFavoriteQuotes() {
  const section = document.getElementById('favoriteQuotesSection');
  const list = document.getElementById('favoriteQuotesList');
  if (!section || !list) return;
  if (!currentUser) { section.style.display = 'none'; return; }

  const localIds = loadQuoteFavorites().map(String);
  let quotes = [];
  try {
    quotes = await getClientQuotes(currentUser.email);
    window._cachedMyQuotes = quotes;
  } catch (e) {
    console.warn('renderFavoriteQuotes:', e);
  }
  if (Array.isArray(window._cachedMyQuotes)) {
    const byId = new Map(quotes.map(q => [String(q._docId), q]));
    window._cachedMyQuotes.forEach(q => {
      if (!byId.has(String(q._docId))) quotes.push(q);
    });
  }
  const savedQuotes = quotes.filter(q => q.status === 'saved' || localIds.includes(String(q._docId)));

  if (!savedQuotes.length) { section.style.display = 'none'; list.innerHTML = ''; return; }
  section.style.display = 'block';
  list.innerHTML = savedQuotes.map(q => {
    const total = (q.items || []).reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.qty || 1)), 0);
    const names = (q.items || []).slice(0, 3).map(item => escHtml(item.ar || item.en || '')).join('، ');
    return `<div style="background:#fff;border:1px solid #e9d5ff;border-radius:16px;padding:16px;box-shadow:var(--shadow-sm)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div><strong style="color:#7e22ce">عرض السعر #${escHtml(q.id || q._docId)}</strong>
          <div style="font-size:12px;color:var(--text-muted);margin-top:5px">${names}${(q.items || []).length > 3 ? ' وآخرون' : ''}</div></div>
        <strong style="color:var(--primary)">${fmtPrice(total)} د.أ</strong>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn-primary" style="padding:8px 18px;font-size:12px" onclick="acceptQuote('${q._docId}')">
          <i class="fas fa-check"></i> أوافق وأكمل الطلب
        </button>
        <button onclick="removeQuoteFromFavorites('${q._docId}')" style="padding:8px 18px;border-radius:50px;background:#fff5f5;color:var(--danger);border:2px solid #fecaca;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">
          <i class="fas fa-trash"></i> حذف من المفضلة
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderFavoritesPage() {
  const wrap = document.getElementById('favoritesGrid');
  if (!wrap) return;
  renderFavoriteQuotes();
  const items = favoritesList.map(id => products.find(x => x.id === id)).filter(Boolean);
  if (!items.length) {
    wrap.innerHTML = `
      <div class="empty-orders" style="grid-column:1/-1">
        <i class="fas fa-heart"></i>
        <h3>${t('لا توجد منتجات في المفضلة','No favorite products yet')}</h3>
        <p>${t('أضف منتجات للمفضلة بالضغط على القلب','Tap the heart icon to add favorites')}</p>
        <button class="btn-primary" style="margin-top:16px" onclick="showPage('home')">${t('تسوّق الآن','Shop Now')}</button>
      </div>`;
    return;
  }
  wrap.innerHTML = items.map(p => {
    const inCart = cart.find(c => c.id === p.id);
    const outOfStock = p.stock !== undefined && p.stock !== null && p.stock <= 0;
    return `
    <div class="product-card">
      <button class="favorite-toggle-btn active" style="top:12px"
        onclick="toggleFavorite(${p.id})" title="${t('إزالة من المفضلة','Remove from favorites')}">
        <i class="fas fa-heart"></i>
      </button>
      <div class="product-img-wrap" onclick="openProductDetail(${p.id})" style="cursor:pointer;${outOfStock?'opacity:0.5':''}" title="${t('التفاصيل','Details')}">
        ${p.image
          ? `<img src="${escHtml(cldOptimize(p.image, 400))}" alt="${escHtml(p.ar)}" loading="lazy" decoding="async" />`
          : `<span class="emoji-fallback">${escHtml(p.icon || '')}</span>`}
      </div>
      <div class="product-info">
        <div class="product-brand">${escHtml(p.brand)}</div>
        <div class="product-name" onclick="openProductDetail(${p.id})" style="cursor:pointer">${escHtml(p.en)}</div>
        <button onclick="openProductDetail(${p.id})" style="margin:8px 0 6px;padding:5px 12px;border-radius:50px;background:transparent;border:1.5px solid var(--primary-light);color:var(--primary);font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:6px;width:fit-content">
          <i class="fas fa-info-circle"></i> ${t('التفاصيل','Details')}
        </button>
        <div class="product-desc">${escHtml(currentLang==='en'?p.desc_en:p.desc_ar)}</div>
        <div class="product-price-row">
          <div>
            <div class="product-price">${fmtPrice(p.price)} <small style="font-size:13px">${t('د.أ','JD')}</small></div>
            ${p.old ? `<div class="product-old-price">${fmtPrice(p.old)} ${t('د.أ','JD')}</div>` : ''}
          </div>
          <button class="add-to-cart ${inCart?'added':''}" onclick="${outOfStock?'':`addToCart(${p.id})`}"
            ${outOfStock?'disabled style="opacity:0.4;cursor:not-allowed"':''}>
            <i class="fas ${inCart?'fa-check':(outOfStock?'fa-ban':'fa-cart-plus')}"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// =====================
// MY QUOTES PAGE (CLIENT)
// =====================
// =====================
// REORDERED PRODUCTS PAGE (CLIENT)
// =====================
var _reorderSortMode = 'recent';
var _cachedReorderData = null;

async function updateLatestSectionButton() {
  const section = document.getElementById('latestProductsSection');
  const btnText = document.getElementById('reorderEntryBtnText');
  if (!section || !btnText) return;
  if (!currentUser || currentUser.role !== 'client') {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  const clinic = currentUser.clinic || currentUser.name || '';
  btnText.textContent = `${t('المنتجات التي طلبتها','Products you ordered from')} ${clinic} ${t('سابقاً','before')}`;
}

async function openReorderedProductsPage() {
  if (!currentUser) { openAuthModal('login'); return; }
  showPage('reordered');
  await renderReorderedProductsPage();
}

async function fetchReorderData() {
  if (_cachedReorderData) return _cachedReorderData;
  const q = window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', currentUser.email));
  const snap = await window._fbGetDocs(q);
  const myOrders = snap.docs.map(d => d.data());

  const map = {}; // productId -> { product, count, lastDate }
  myOrders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!item.id) return; // تجاهل المواد المخصصة بدون معرّف منتج حقيقي
      const key = String(item.id);
      if (!map[key]) map[key] = { id: item.id, count: 0, lastDate: o.createdAt };
      map[key].count += 1;
      if (new Date(o.createdAt) > new Date(map[key].lastDate)) map[key].lastDate = o.createdAt;
    });
  });

  const ids = Object.keys(map).map(k => isNaN(k) ? k : parseInt(k));
  await fetchProductsByIds(ids);

  const result = Object.values(map)
    .map(entry => {
      const product = products.find(p => String(p.id) === String(entry.id));
      return product ? { product, count: entry.count, lastDate: entry.lastDate } : null;
    })
    .filter(Boolean);

  _cachedReorderData = result;
  return result;
}

function setReorderSort(mode) {
  _reorderSortMode = mode;
  const recentBtn = document.getElementById('reorderSortRecentBtn');
  const freqBtn = document.getElementById('reorderSortFrequentBtn');
  const activeStyle = 'background:var(--primary);color:#fff;border-color:var(--primary-light)';
  const inactiveStyle = 'background:#fff;color:var(--text-muted);border-color:var(--border)';
  if (recentBtn) recentBtn.style.cssText = recentBtn.style.cssText.split(';')[0] + ';padding:8px 16px;border-radius:50px;border:1.5px solid;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;' + (mode==='recent'?activeStyle:inactiveStyle);
  if (freqBtn) freqBtn.style.cssText = freqBtn.style.cssText.split(';')[0] + ';padding:8px 16px;border-radius:50px;border:1.5px solid;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;' + (mode==='frequent'?activeStyle:inactiveStyle);
  renderReorderedProductsPage();
}

async function renderReorderedProductsPage() {
  const grid = document.getElementById('reorderedProductsGrid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:4px"></div>جاري التحميل...</div>`;

  let data = await fetchReorderData();
  if (!data.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-muted)"><i class="fas fa-box-open" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px"></i>لم تطلب أي منتج بعد</div>`;
    return;
  }

  data = [...data].sort((a, b) => _reorderSortMode === 'frequent'
    ? b.count - a.count
    : new Date(b.lastDate) - new Date(a.lastDate));

  grid.innerHTML = data.map(entry => reorderedCardHTML(entry.product)).join('');
}

function reorderedCardHTML(p) {
  const inCart = cart.find(c => String(c.id) === String(p.id));
  const outOfStock = p.stock !== undefined && p.stock !== null && p.stock <= 0;
  return `
    <div class="product-card" onclick="openProductDetail(${p.id})" style="cursor:pointer;height:190px">
      <div class="product-img-wrap" style="height:150px;position:relative">
        ${p.image ? `<img src="${escHtml(cldOptimize(p.image,300))}" alt="${escHtml(p.en)}" loading="lazy" style="width:100%;height:100%;object-fit:contain">` : `<span class="emoji-fallback">${escHtml(p.icon || '')}</span>`}
        <div style="position:absolute;bottom:0;left:0;right:0;height:55px;background:linear-gradient(to top, rgba(0,0,0,0.28), transparent);pointer-events:none"></div>
        <div style="position:absolute;bottom:8px;left:8px;background:linear-gradient(135deg,var(--primary),var(--primary-light));color:#fff;font-weight:800;font-size:12px;padding:5px 12px;border-radius:50px;width:fit-content">
          ${fmtPrice(p.price)} ${t('د.أ','JD')}
        </div>
        <button onclick="event.stopPropagation();${outOfStock?'':`addToCart(${p.id})`}" ${outOfStock?'disabled style="opacity:0.4"':''}
          style="position:absolute;bottom:8px;right:12px;width:36px;height:36px;border-radius:50%;border:none;background:#fff;color:var(--primary);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
          <i class="fas ${inCart?'fa-check':(outOfStock?'fa-ban':'fa-cart-plus')}"></i>
        </button>
      </div>
      <div class="product-info" style="padding:8px 10px">
        <div class="product-name" style="font-size:13px;margin:0;line-height:1.25">${escHtml(p.en)}</div>
      </div>
    </div>`;
}

async function openMyQuotesPage() {
  if (!currentUser && !getGuestQuoteRefs().length) { openAuthModal('login'); return; }
  showPage('myQuotes');
  renderMyQuotesPage();
}

async function renderMyQuotesPage() {
  const container = document.getElementById('myQuotesList');
  container.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text-muted)">
      <div class="spinner" style="margin:0 auto 14px;width:28px;height:28px;border-width:4px"></div>
      جاري تحميل عروض الأسعار...
    </div>`;

  const quotes = currentUser ? await getClientQuotes(currentUser.email) : await getGuestQuotes();
  window._cachedMyQuotes = quotes;

  let myOrdersForLink = [];
  try {
    const oq = currentUser ? window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', currentUser.email)) : null;
    if (oq) { const osnap = await window._fbGetDocs(oq); myOrdersForLink = osnap.docs.map(d => d.data()); }
  } catch(e) { myOrdersForLink = []; }
  function findMyLinkedOrder(q) {
    return myOrdersForLink.find(o =>
      o.sourceQuoteId === q.id || o.id === ('DP-' + String(q.id || '').replace('QT-', ''))
    );
  }

  if (!quotes.length) {
    container.innerHTML = `
      <div class="empty-orders">
        <i class="fas fa-file-invoice-dollar"></i>
        <h3>لا توجد طلبات عروض أسعار بعد</h3>
        <p>اطلب عرض سعر لأي مادة من الصفحة الرئيسية</p>
        <button class="btn-primary" style="margin-top:16px" onclick="showPage('home')">تسوّق الآن</button>
      </div>`;
    return;
  }

  container.innerHTML = quotes.map(q => {
    const date = new Date(q.createdAt).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'long', day:'numeric' });
    const isPriced = q.status === 'priced' || q.status === 'saved';
    const itemsSubtotal = isPriced ? getQuoteItemsTotal(q) : 0;
    const totalPriced = isPriced ? getQuoteTotal(q) : 0;

    const itemsHtml = dpDisplayItems(q.items).map(i => `
      <div class="order-item-row">
        <div class="order-item-icon">${i.image ? `<img src="${escHtml(cldOptimize(i.image,60))}" style="width:100%;height:100%;object-fit:contain" loading="lazy">` : escHtml(i.icon || '')}</div>
        <div style="flex:1;font-weight:600;color:var(--primary-dark)">${escHtml(i.ar)}${dpSizesSub(i)}</div>
        <div style="color:var(--text-muted)">${i.qty ? `× ${escHtml(String(i.qty))}` : t('الكمية غير محددة','Qty not specified')}</div>
        ${isPriced ? `<div style="font-weight:800;color:var(--primary)">${fmtPrice((i.unitPrice||0))} د.أ${i.qty?` × ${i.qty} = ${fmtPrice(((i.unitPrice||0)*i.qty))} د.أ`:''}</div>` : ''}
      </div>`).join('');

    let actionsHtml = '';
    if (q.status === 'priced') {
      actionsHtml = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn-primary" style="padding:9px 20px;font-size:13px" onclick="acceptQuote('${escJsAttr(q._docId)}')">
            <i class="fas fa-check"></i> أوافق وأكمل الطلب
          </button>
          <button onclick="rejectQuote('${escJsAttr(q._docId)}')" style="padding:9px 20px;border-radius:50px;background:#fff5f5;color:var(--danger);border:2px solid #fecaca;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
            <i class="fas fa-times"></i> رفض العرض
          </button>
          <button onclick="saveQuoteToFavorites('${escJsAttr(q._docId)}')" style="padding:9px 20px;border-radius:50px;background:#fdf4ff;color:#7e22ce;border:2px solid #e9d5ff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
            <i class="fas fa-bookmark"></i> حفظ بالمفضلة لاحقاً
          </button>
        </div>`;
    } else if (q.status === 'saved') {
      actionsHtml = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn-primary" style="padding:9px 20px;font-size:13px" onclick="acceptQuote('${escJsAttr(q._docId)}')">
            <i class="fas fa-check"></i> أوافق وأكمل الطلب الآن
          </button>
          <button onclick="rejectQuote('${escJsAttr(q._docId)}')" style="padding:9px 20px;border-radius:50px;background:#fff5f5;color:var(--danger);border:2px solid #fecaca;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">
            <i class="fas fa-times"></i> رفض العرض
          </button>
        </div>`;
    } else if (q.status === 'accepted') {
      const linkedOrder = findMyLinkedOrder(q);
      const orderStatus = linkedOrder ? (linkedOrder.status || 'pending') : 'pending';
      actionsHtml = `
        <div style="margin-top:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <div style="font-size:13px;color:#15803d;font-weight:700"><i class="fas fa-check-circle"></i> تمت الموافقة على العرض</div>
            ${statusBadgeHTML(orderStatus)}
          </div>
          ${trackStepsHTML(orderStatus)}
        </div>`;
    } else if (q.status === 'rejected') {
      actionsHtml = `<div style="margin-top:10px;font-size:13px;color:var(--danger);font-weight:700"><i class="fas fa-times-circle"></i> تم رفض هذا العرض</div>`;
    } else if (q.status === 'pending') {
      actionsHtml = `<div style="margin-top:10px;font-size:13px;color:#c2410c;font-weight:700"><i class="fas fa-clock"></i> سيتم الرد على طلبك بعرض السعر قريباً</div>`;
    }

    return `
    <div class="order-track-card">
      <div class="order-track-header">
        <div>
          <div class="order-track-num"><i class="fas fa-file-invoice-dollar" style="color:var(--primary-light)"></i> #${escHtml(q.id)}</div>
          <div class="order-track-date">📅 ${date}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          ${quoteStatusBadge(q.status)}
          ${isPriced || q.status==='saved' ? `<div class="order-track-total">${fmtPrice(totalPriced)} د.أ</div>` : ''}
        </div>
      </div>
      <div class="order-track-body">
        <div class="order-items-list">${itemsHtml}</div>
        ${(isPriced || q.status === 'saved') ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:flex;flex-direction:column;gap:5px;font-size:13px">
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>المجموع</span><span>${fmtPrice(itemsSubtotal)} د.أ</span></div>
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)">
            <span>التوصيل</span>
            <span>${q.deliveryDetermined ? (q.deliveryFee ? `${fmtPrice(q.deliveryFee)} د.أ` : 'مجاني') : t('سيتم تحديدها لاحقاً','To be determined')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:800;color:var(--primary)"><span>المجموع النهائي</span><span>${fmtPrice(totalPriced)} د.أ</span></div>
        </div>` : ''}
        ${q.notes ? `<div style="margin-top:12px;padding:10px 14px;background:#f8fbfd;border-radius:10px;font-size:13px;color:var(--text-muted)"><i class="fas fa-sticky-note" style="color:var(--accent2)"></i> ${escHtml(q.notes)}</div>` : ''}
        ${actionsHtml}
      </div>
    </div>`;
  }).join('');
}

async function acceptQuote(docId) {
  const quotes = window._cachedMyQuotes || [];
  const q = quotes.find(x => x._docId === docId);
  if (!q) return;
  if (!confirm('سيتم إرسال طلبك للإدارة بناءً على الأسعار المحددة. هل تريد المتابعة؟')) return;

  const items = q.items.map(item => ({
    productId: item.productId,
    ...(item.parentId ? { parentId: item.parentId, sizeLabel: item.sizeLabel || '' } : {}),
    ar: item.ar,
    en: item.en,
    icon: item.icon,
    image: item.image || null,
    isCustom: item.isCustom || false,
    qty: item.qty || 1,
    unitPrice: item.unitPrice || 0,
  }));

  window._qoQuoteDocId = docId;
  window._qoQuoteIdStr = q.id;
  window._qoQuoteDeliveryFee = q.deliveryFee ?? null;
  window._qoQuoteDeliveryDetermined = !!q.deliveryDetermined;
  proceedQuickOrderCheckout(items, false);
}

async function rejectQuote(docId) {
  if (!confirm('هل أنت متأكد من رفض عرض السعر؟')) return;
  try {
    await updateQuote(docId, { status: 'rejected' });
    showToast('🚫 تم رفض العرض', '');
    renderMyQuotesPage();
  } catch(e) {
    showToast('❌ حدث خطأ، تحقق من الاتصال', 'error');
  }
}

async function saveQuoteToFavorites(docId) {
  if (!navigator.onLine) {
    showToast('❌ لا يوجد اتصال بالإنترنت حالياً', 'error');
    return;
  }
  saveQuoteFavoriteId(String(docId));
  if (Array.isArray(window._cachedMyQuotes)) {
    const cached = window._cachedMyQuotes.find(q => String(q._docId) === String(docId));
    if (cached) cached.status = 'saved';
  }
  let synced = true;
  try {
    await updateQuote(docId, { status: 'saved' });
  } catch(e) {
    synced = false;
    console.warn('تعذر مزامنة حالة العرض مع Firebase، تم حفظه محلياً:', e);
  }
  showToast(synced ? '🔖 تم حفظ عرض السعر في المفضلة' : '🔖 تم حفظ العرض في مفضلتك على هذا الجهاز', 'success');
  await renderMyQuotesPage();
  await renderFavoriteQuotes();
}
  async function removeQuoteFromFavorites(docId) {
  if (!confirm('هل تريد إزالة عرض السعر هذا من المفضلة؟')) return;
  removeQuoteFavoriteId(String(docId));
  if (Array.isArray(window._cachedMyQuotes)) {
    const cached = window._cachedMyQuotes.find(q => String(q._docId) === String(docId));
    if (cached && cached.status === 'saved') cached.status = 'priced';
  }
  try {
    await updateQuote(docId, { status: 'priced' });
  } catch(e) {
    console.warn('تعذر تحديث الحالة على Firebase، تمت الإزالة محلياً فقط:', e);
  }
  showToast('🗑️ تم حذف عرض السعر من المفضلة', '');
  await renderFavoriteQuotes();
}
// =====================
// PRODUCT DETAIL PAGE
// =====================
var lastPageBeforeDetail = 'homePage';
var lastScrollYBeforeDetail = 0;

function openProductDetail(id, _isRefresh) {
  window.lastViewedProductId = id;
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!_isRefresh) {
    const activeSection = document.querySelector('.page-section.active');
    lastPageBeforeDetail = activeSection ? activeSection.id : 'homePage';
    lastScrollYBeforeDetail = window.scrollY;
  }

  const inCart = cart.find(x => x.id === id);
  const outOfStock = p.stock !== undefined && p.stock !== null && p.stock <= 0;
  const galleryImages = [p.image, ...(p.images||[])].filter(Boolean);
  const container = document.getElementById('productDetailContent');
  container.innerHTML = `
    <div class="product-detail-grid">
      <div>
        <div class="product-img-wrap" id="pdImageWrap" style="height:340px;border-radius:var(--radius);overflow:hidden;position:relative">
          ${p.badge ? `<div class="product-badge">${t(escHtml(p.badge), p.badge==='جديد'?'New':p.badge==='الأكثر مبيعاً'?'Best Seller':escHtml(p.badge))}</div>` : ''}
          ${galleryImages.length
            ? `<img id="pdMainImg" src="${escHtml(cldOptimize(galleryImages[0], 600))}" alt="${escHtml(p.ar)}" loading="lazy" decoding="async" style="transition:transform .25s ease;transform-origin:center center" />`
            : `<span class="emoji-fallback">${escHtml(p.icon || '')}</span>`}
        </div>
        ${galleryImages.length > 1 ? `
        <div class="pd-gallery-thumbs">
          ${galleryImages.map((img,idx) => `
            <div class="pd-gallery-thumb ${idx===0?'active':''}" onclick="switchGalleryImage(this,'${escJsAttr(img)}')">
              <img src="${escHtml(cldOptimize(img,120))}" loading="lazy">
            </div>`).join('')}
        </div>` : ''}
      </div>
      <div>
        <div class="product-name" style="font-size:22px;margin-bottom:8px">${escHtml(p.en)}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button onclick="shareProductWhatsApp(${p.id})"
            style="padding:6px 14px;border-radius:50px;background:#e8fdf2;color:#16a34a;
                   border:1.5px solid #bbf7d0;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;
                   display:flex;align-items:center;gap:6px">
            <i class="fab fa-whatsapp"></i> ${t('مشاركة','Share')}
          </button>
          <button onclick="copyProductLink(${p.id})"
            style="padding:6px 14px;border-radius:50px;background:#f0f8ff;color:var(--primary);
                   border:1.5px solid var(--border);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;
                   display:flex;align-items:center;gap:6px">
            <i class="fas fa-link"></i> ${t('نسخ الرابط','Copy Link')}
          </button>
        </div>
        ${getEffectivePoints(p) ? `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;
                    padding:6px 12px;border-radius:50px;
                    background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.05));
                    border:1.5px solid rgba(245,158,11,0.35);width:fit-content">
          <span style="font-size:14px">🏆</span>
          <span style="font-size:12px;font-weight:800;color:#d97706">
            ${getEffectivePoints(p)} ${t('نقطة','pts')}
          </span>
        </div>` : ''}
        ${renderQtyOfferTableHTML(p)}
        <div class="product-price-row" style="margin-bottom:18px">
          <div>
            <div class="product-price" style="font-size:26px">${fmtPrice(p.price)} <small style="font-size:14px">${t('د.أ','JD')}</small></div>
            ${p.unitQty ? `<div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-top:2px">${escHtml(p.unitQty)}</div>` : ''}
            ${p.old ? `<div class="product-old-price">${fmtPrice(p.old)} ${t('د.أ','JD')}</div>` : ''}
          </div>
        </div>
        ${outOfStock ? `<div style="background:#fff5f5;border:1.5px solid #fecaca;color:#e53e3e;border-radius:10px;
                    padding:10px 14px;margin-bottom:14px;font-weight:800;text-align:center">
          ${t('عذراً، نفذت كمية هذا المنتج حاليًا','Sorry, this product is currently out of stock')}
        </div>` : ''}
        <button class="btn-primary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px"
          onclick="${outOfStock?'':`addToCart(${p.id}); openProductDetail(${p.id}, true)`}"
          ${outOfStock&&!inCart?'disabled style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0.5;cursor:not-allowed"':''}>
          <i class="fas ${inCart?'fa-trash-alt':(outOfStock?'fa-ban':'fa-cart-plus')}"></i>
          ${inCart ? t('إزالة من السلة','Remove from cart') : (outOfStock ? t('غير متوفر','Unavailable') : t('أضف للسلة','Add to cart'))}
        </button>

        <div class="pd-tabs">
          <button class="pd-tab-btn active" id="pdTabBtnDesc" onclick="switchProductTab('desc')">
            <i class="fas fa-align-right"></i> ${t('الوصف','Description')}
          </button>
          <button class="pd-tab-btn" id="pdTabBtnSpecs" onclick="switchProductTab('specs')">
            <i class="fas fa-list-ul"></i> ${t('المواصفات','Specifications')}
          </button>
          <button class="pd-tab-btn" id="pdTabBtnReviews" onclick="switchProductTab('reviews')">
            <i class="fas fa-star"></i> ${t('التقييمات','Reviews')}
          </button>
        </div>

        <div class="pd-tab-panel active" id="pdTabPanelDesc">
          <div class="product-desc" style="font-size:14px;line-height:1.9;-webkit-line-clamp:unset;display:block;overflow:visible;white-space:pre-line">${escHtml(currentLang==='en'?p.desc_en:p.desc_ar)}</div>
        </div>

        <div class="pd-tab-panel" id="pdTabPanelSpecs">
          <table class="pd-specs-table">
            <tr><td>${t('الماركة','Brand')}</td><td>${escHtml(p.brand)}</td></tr>
            ${p.country ? `<tr><td>${t('بلد المنشأ','Origin')}</td><td>${escHtml(p.country)}</td></tr>` : ''}
            <tr><td>${t('القسم','Category')}</td><td>${escHtml((categories.find(c=>c.id===p.cat)||{}).ar || p.cat)}</td></tr>
            ${p.unitQty ? `<tr><td>${t('الحجم','Size')}</td><td>${escHtml(p.unitQty)}</td></tr>` : ''}
            ${getEffectivePoints(p) ? `<tr><td>${t('نقاط الشراء','Purchase Points')}</td><td>🏆 ${getEffectivePoints(p)}</td></tr>` : ''}
            ${(p.stock !== undefined && p.stock !== null) ? `<tr><td>${t('المخزون','Stock')}</td><td>${p.stock}</td></tr>` : ''}
          </table>
        </div>

        <div class="pd-tab-panel" id="pdTabPanelReviews">
          <div class="pd-reviews-empty">
            <i class="fas fa-comment-slash"></i>
            <div style="font-weight:700;color:var(--text)">${t('لا توجد تقييمات مكتوبة بعد','No written reviews yet')}</div>
            <div style="font-size:13px;margin-top:4px">${t('كن أول من يشارك تجربته مع هذا المنتج','Be the first to share your experience')}</div>
          </div>
        </div>
      </div>
    </div>
    <div id="similarProductsWrap" style="display:none;margin-top:40px;max-width:1100px">
      <div class="section-header" style="text-align:right;margin-bottom:20px">
        <div class="section-tag">✨ <span data-ar="قد يعجبك أيضاً" data-en="You May Also Like">قد يعجبك أيضاً</span></div>
        <h2 class="section-title" style="margin-bottom:0;font-size:20px"><span data-ar="منتجات مشابهة" data-en="Similar Products">منتجات مشابهة</span></h2>
      </div>
      <div class="products-grid" id="similarProductsGrid"></div>
    </div>
  `;
  if (!_isRefresh) showPage('productDetail');
  if (!_isRefresh) history.replaceState(null, '', getProductShareUrl(id));
  renderSimilarProducts(p);
}

function closeProductDetail() {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const previousPage = document.getElementById(lastPageBeforeDetail) || document.getElementById('homePage');
  if (previousPage) previousPage.classList.add('active');
  window.scrollTo(0, lastScrollYBeforeDetail);
  history.replaceState(null, '', window.location.pathname);
}

function switchProductTab(tab) {
  const tabs = { desc:'Desc', specs:'Specs', reviews:'Reviews' };
  Object.keys(tabs).forEach(key => {
    const btn = document.getElementById(`pdTabBtn${tabs[key]}`);
    const panel = document.getElementById(`pdTabPanel${tabs[key]}`);
    if (btn) btn.classList.toggle('active', key === tab);
    if (panel) panel.classList.toggle('active', key === tab);
  });
}

function switchGalleryImage(el, url) {
  const mainImg = document.getElementById('pdMainImg');
  if (mainImg) mainImg.src = cldOptimize(url, 600);
  document.querySelectorAll('.pd-gallery-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function getProductShareUrl(id) {
  return `${window.location.origin}${window.location.pathname}?product=${id}`;
}

function shareProductWhatsApp(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const url = getProductShareUrl(id);
  const text = encodeURIComponent(
    `🦷 ${p.en}\n${fmtPrice(p.price)} ${t('د.أ','JD')}\n${url}`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

async function copyProductLink(id) {
  const url = getProductShareUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    showToast('✅ تم نسخ رابط المنتج', 'success');
  } catch (e) {
    showToast(url, '');
  }
}

// فتح المنتج تلقائياً إذا كان الرابط يحتوي ?product=ID
function openProductFromUrlIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const pid = parseInt(params.get('product'));
  if (pid && products.find(p => p.id === pid)) {
    openProductDetail(pid);
  }
}

// =====================
// إشعار الأدمن بالطلبات المعلّقة عند الدخول
// =====================
async function notifyPendingOrdersOnLogin() {
  try {
    const q = window._fbQuery(window._fbOrdersRef(), window._fbWhere('status', '==', 'pending'));
    const snap = await window._fbGetDocs(q);
    const count = snap.size;
    if (count === 0) return;

    showToast(`🔔 لديك ${count} طلب قيد الانتظار`, 'success');

    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('🔔 طلبات قيد الانتظار', {
        body: `لديك ${count} طلب يحتاج للمراجعة في DentaPro`,
        icon: '🦷'
      });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('🔔 طلبات قيد الانتظار', {
          body: `لديك ${count} طلب يحتاج للمراجعة في DentaPro`,
          icon: '🦷'
        });
      }
    }
  } catch (e) {
    console.warn('notifyPendingOrdersOnLogin:', e);
  }
}

// =====================
// CART
