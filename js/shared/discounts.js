// دوال مشتركة لحساب الخصومات — تُستخدم من السلة (cart.js)، الدفع (checkout.js)،
// الموقع (location.js)، ولوحة الإدارة (admin/clients.js) معاً.
// نُقلت من js/admin/clients.js و js/orders/checkout.js لكسر التبعية الدائرية بينهما
// ولتحميل هذا المنطق لكل الزوار دون تحميل باقي كود لوحة الإدارة.

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-9);
}

// ============================
// الخصم المخصص — 3 مستويات شرائحية، كل مستوى له نسبة + قيمة تصنيف + عملاء معنيين
// ============================
var _customDiscountConfigCache = null;
var _customDiscountConfigCacheTime = 0;

async function loadCustomDiscountConfig() {
  if (_customDiscountConfigCache !== null && (Date.now() - _customDiscountConfigCacheTime) < 15000) {
    return _customDiscountConfigCache;
  }
  try {
    const snap = await window._fbGetDoc(window._fbDoc2('store_data', 'custom_discount_settings'));
    _customDiscountConfigCache = snap.exists() ? snap.data() : null;
    _customDiscountConfigCacheTime = Date.now();
    return _customDiscountConfigCache;
  } catch(e) {
    console.warn('loadCustomDiscountConfig:', e.message);
    return null;
  }
}

// تفريغ التخزين المؤقت فوراً بعد ما الإدمن يحفظ إعدادات جديدة، حتى ينعكس التغيير فورياً بدل انتظار 15 ثانية
function invalidateCustomDiscountConfigCache() {
  _customDiscountConfigCache = null;
  _customDiscountConfigCacheTime = 0;
}

// يحسب الخصم المخصص (لو مفعّل ومطابق للعميل بأحد المستويات الثلاثة) — نظام شرائح تصاعدية
// يرجع null لو ما فيه خصم ينطبق، أو {originalTotal, total, discountPercent} لو انطبق
async function computeCustomDiscount(rawTotal, clientEmail, clientPhone) {
  try {
    const cfg = await loadCustomDiscountConfig();
    if (!cfg || !cfg.enabled || !Array.isArray(cfg.tiers)) return null;

    const isEligible = (tier) => {
      // فحص انتهاء صلاحية المستوى (لو محدد وقت انتهاء وانقضى)
      if (tier.expiresAt && new Date(tier.expiresAt) <= new Date()) return false;
      if (tier.scope === 'all') return true;
      if (!tier.targetIds || !tier.targetIds.length) return false;
      return tier.targetIds.some(id => {
        if (id.startsWith('guest:')) return normalizePhone(clientPhone) === normalizePhone(id.slice(6));
        return id === clientEmail;
      });
    };

    const eligibleTiers = cfg.tiers.filter(isEligible).sort((a,b) => a.amount - b.amount);
    if (!eligibleTiers.length) return null;

    // نختار أعلى مستوى وصل المجموع لحده فعلاً (المجموع >= amount الخاص فيه)
    // لو المجموع ما وصل حتى أدنى مستوى، ما في خصم إطلاقاً
    let matchedTier = null;
    for (const t of eligibleTiers) {
      if (rawTotal >= t.amount) matchedTier = t;
    }
    if (!matchedTier || matchedTier.percent <= 0) return null;

    const discounted = Math.max(0, rawTotal - (rawTotal * matchedTier.percent / 100));
    return { originalTotal: rawTotal, total: Math.round(discounted * 100) / 100, discountPercent: matchedTier.percent };
  } catch(e) {
    console.warn('computeCustomDiscount:', e.message);
    return null;
  }
}

// نسخة خاصة بالسلة: بتفصل عروض الكمية والباقات عن باقي المنتجات حسب إعداد الأدمن
// (applyToOffers) قبل حساب الخصم. لو الإعداد "تطبيق على العروض" مفعّل (الافتراضي)،
// نفس سلوك computeGeneralDiscount العادي. لو معطّل، الخصم يُحسب فقط على المنتجات
// العادية، والعروض تُضاف بسعرها الكامل بدون خصم إضافي فوقها.
async function computeGeneralDiscountForCart(cartItems, clientEmail, clientPhone) {
  const cfg = await loadCustomDiscountConfig();
  if (!cfg || !cfg.enabled) return null;

  const isOfferItem = (item) => item.isBundle || (item.basePrice && item.price < item.basePrice);

  if (cfg.applyToOffers !== false) {
    const rawTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
    return computeCustomDiscount(rawTotal, clientEmail, clientPhone);
  }

  const offerTotal = cartItems.filter(isOfferItem).reduce((s, i) => s + i.price * i.qty, 0);
  const normalTotal = cartItems.filter(i => !isOfferItem(i)).reduce((s, i) => s + i.price * i.qty, 0);
  if (normalTotal <= 0) return null;

  const discountOnNormal = await computeCustomDiscount(normalTotal, clientEmail, clientPhone);
  if (!discountOnNormal) return null;

  return {
    originalTotal: offerTotal + normalTotal,
    total: Math.round((discountOnNormal.total + offerTotal) * 100) / 100,
    discountPercent: discountOnNormal.discountPercent
  };
}
