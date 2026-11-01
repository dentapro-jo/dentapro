// نظام بانر الإعلانات الرئيسي — يُعرض لكل زوار الموقع في الصفحة الرئيسية
// نُقل من js/admin/products.js لأنه عرض عام وليس أداة إدارة، رغم أن الإدارة تتحكم بمحتواه
// (إدارة الشرائح نفسها — إضافة/تعديل/حذف — بقيت في js/admin/products.js ضمن renderAdminHomeBanner)

var _adBannerInterval = null;
var _adBannerOffers = [];
var _adBannerIndex = 0;

var _adBannerTouchStartX = null;
var _adBannerTouchCurrentX = null;
var _adBannerTouchDragging = false;
var _adBannerTouchMoved = false;
var _adBannerDragOffset = 0;

var _adBannerTransitionTimer = null;
var _adBannerSig = ''; // بصمة الشرائح المعروضة حالياً: نتجنب إعادة الرسم وإعادة الشريط للبداية إن لم يتغير شيء

async function renderAdBanner() {
  const section = document.getElementById('adBannerSection');
  const slide = document.getElementById('adBannerSlide');

  if (!section || !slide) return;

  const bannerQtyOffers = offers.filter(o =>
    o.type === 'qty' &&
    o.active &&
    !isOfferExpired(o) &&
    o.showInBanner
  );

  const bannerBundles = offers.filter(o =>
    o.type === 'bundle' &&
    o.active &&
    !isOfferExpired(o) &&
    o.showInBanner
  );

  const bannerTexts = offers.filter(o =>
    o.type === 'text' &&
    o.active &&
    !isOfferExpired(o) &&
    o.showInBanner
  );

  const bannerImages = getActiveHomeBannerSlides();

  if (
    !bannerQtyOffers.length &&
    !bannerBundles.length &&
    !bannerTexts.length &&
    !bannerImages.length
  ) {
    section.style.display = 'none';

    if (_adBannerInterval) {
      clearInterval(_adBannerInterval);
      _adBannerInterval = null;
    }

    return;
  }

  await fetchProductsByIds([
    ...bannerQtyOffers.map(o => o.productId),
    ...bannerBundles.flatMap(o =>
      o.items.map(it => it.productId)
    )
  ]);

  const qtySlides = bannerQtyOffers
    .map(o => ({
      kind: 'qty',
      offer: o,
      product: products.find(p => p.id === o.productId)
    }))
    .filter(x => x.product);

  const bundleSlides = bannerBundles
    .map(o => ({
      kind: 'bundle',
      offer: o,
      bundleProducts: o.items
        .map(it => products.find(p => p.id === it.productId))
        .filter(Boolean)
    }))
    .filter(x => x.bundleProducts.length);

  const textSlides = bannerTexts.map(o => ({
    kind: 'text',
    offer: o
  }));

  const imageSlides = bannerImages.map(s => ({
    kind: 'image',
    slideData: s
  }));

  _adBannerOffers = [
    ...qtySlides,
    ...bundleSlides,
    ...textSlides,
    ...imageSlides
  ];

  if (!_adBannerOffers.length) {
    section.style.display = 'none';
    _adBannerSig = '';
    return;
  }

  // البصمة تشمل محتوى الشرائح واللغة، فأي تعديل من الأدمن أو تبديل اللغة يعيد الرسم كما كان
  const _sig = (typeof currentLang !== 'undefined' ? currentLang : '') + '|' + JSON.stringify(_adBannerOffers.map(x =>
    [x.kind, x.offer || x.slideData || null, x.product ? [x.product.id, x.product.price] : null,
     x.bundleProducts ? x.bundleProducts.map(p => [p.id, p.price]) : null]));
  if (_sig === _adBannerSig && section.style.display === 'block') return; // لا تغيير: اترك الشريط يعمل كما هو
  _adBannerSig = _sig;

  section.style.display = 'block';
  _adBannerIndex = 0;

  showAdBannerSlide(1);
  initAdBannerSwipe();
  restartAdBannerAutoplay();
}

function restartAdBannerAutoplay() {
  if (_adBannerInterval) {
    clearInterval(_adBannerInterval);
    _adBannerInterval = null;
  }

  if (_adBannerOffers.length > 1) {
    _adBannerInterval = setInterval(() => {
      _adBannerIndex =
        (_adBannerIndex + 1) % _adBannerOffers.length;

      showAdBannerSlide(1);
    }, 4500);
  }
}

function stopAdBannerAutoplay() {
  if (_adBannerInterval) {
    clearInterval(_adBannerInterval);
    _adBannerInterval = null;
  }
}

function adBannerNav(dir) {
  if (!_adBannerOffers.length) return;

  _adBannerIndex =
    (_adBannerIndex + dir + _adBannerOffers.length) %
    _adBannerOffers.length;

  showAdBannerSlide(dir);
  restartAdBannerAutoplay();
}

function initAdBannerSwipe() {
  const slide = document.getElementById('adBannerSlide');

  if (!slide || slide.dataset.swipeBound) return;

  slide.dataset.swipeBound = '1';

  slide.addEventListener(
    'touchstart',
    e => {
      if (!e.touches || !e.touches.length) return;

      stopAdBannerAutoplay();

      _adBannerTouchStartX = e.touches[0].clientX;
      _adBannerTouchCurrentX = _adBannerTouchStartX;
      _adBannerTouchDragging = true;
      _adBannerTouchMoved = false;
      _adBannerDragOffset = 0;

      const inner =
        document.getElementById('adBannerSlideInner');

      if (inner) {
        inner.style.transition = 'none';
      }
    },
    { passive: true }
  );

  slide.addEventListener(
    'touchmove',
    e => {
      if (
        !_adBannerTouchDragging ||
        _adBannerTouchStartX === null ||
        !e.touches ||
        !e.touches.length
      ) {
        return;
      }

      const currentX = e.touches[0].clientX;
      const dx = currentX - _adBannerTouchStartX;

      _adBannerTouchCurrentX = currentX;
      _adBannerDragOffset = dx;

      if (Math.abs(dx) > 5) {
        _adBannerTouchMoved = true;
      }

      const inner =
        document.getElementById('adBannerSlideInner');

      if (inner) {
        inner.style.transition = 'none';
        inner.style.transform = `translateX(${dx}px)`;
      }

      if (Math.abs(dx) > 8 && e.cancelable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  slide.addEventListener(
    'touchend',
    e => {
      if (
        !_adBannerTouchDragging ||
        _adBannerTouchStartX === null
      ) {
        return;
      }

      const endX =
        e.changedTouches && e.changedTouches.length
          ? e.changedTouches[0].clientX
          : _adBannerTouchCurrentX;

      const dx = endX - _adBannerTouchStartX;

      _adBannerTouchStartX = null;
      _adBannerTouchCurrentX = null;
      _adBannerTouchDragging = false;

      const minimumSwipeDistance = 40;

      if (Math.abs(dx) < minimumSwipeDistance) {
        const inner =
          document.getElementById('adBannerSlideInner');

        if (inner) {
          inner.style.transition =
            'transform 0.2s ease-out';
          inner.style.transform = 'translateX(0)';
        }

        _adBannerDragOffset = 0;
        _adBannerTouchMoved = false;

        restartAdBannerAutoplay();
        return;
      }

      if (dx < 0) {
        adBannerNav(1);
      } else {
        adBannerNav(-1);
      }

      _adBannerDragOffset = 0;
      _adBannerTouchMoved = false;
    },
    { passive: true }
  );

  slide.addEventListener(
    'touchcancel',
    () => {
      if (!_adBannerTouchDragging) return;

      const inner =
        document.getElementById('adBannerSlideInner');

      if (inner) {
        inner.style.transition =
          'transform 0.2s ease-out';
        inner.style.transform = 'translateX(0)';
      }

      _adBannerTouchStartX = null;
      _adBannerTouchCurrentX = null;
      _adBannerTouchDragging = false;
      _adBannerTouchMoved = false;
      _adBannerDragOffset = 0;

      restartAdBannerAutoplay();
    },
    { passive: true }
  );
}

function showAdBannerSlide(direction = 1) {
  const inner =
    document.getElementById('adBannerSlideInner');

  if (!inner || !_adBannerOffers.length) return;

  if (_adBannerTransitionTimer) {
    clearTimeout(_adBannerTransitionTimer);
    _adBannerTransitionTimer = null;
  }

  const current = _adBannerOffers[_adBannerIndex];

  const exitX = direction === 1 ? '-100%' : '100%';
  const enterX = direction === 1 ? '100%' : '-100%';

  inner.style.transition =
    'transform 0.28s ease-out';
  inner.style.transform =
    `translateX(${exitX})`;

  _adBannerTransitionTimer = setTimeout(() => {
    _adBannerTransitionTimer = null;

    if (current.kind === 'bundle') {
      renderBannerBundleSlide(inner, current);
    } else if (current.kind === 'text') {
      renderBannerTextSlide(inner, current);
    } else if (current.kind === 'image') {
      renderBannerImageSlide(inner, current);
    } else {
      renderBannerQtySlide(inner, current);
    }

    inner.style.transition = 'none';
    inner.style.transform =
      `translateX(${enterX})`;

    void inner.offsetWidth;

    inner.style.transition =
      'transform 0.28s ease-out';
    inner.style.transform = 'translateX(0)';

    updateAdBannerDots();
  }, 200);
}
// نقاط التنقل تحت شريط الصور — تعرض عدد الشرائح والشريحة النشطة، وتدعم الضغط للانتقال المباشر
function updateAdBannerDots() {
  const dotsEl = document.getElementById('adBannerDots');
  if (!dotsEl) return;
  if (_adBannerOffers.length <= 1) { dotsEl.innerHTML = ''; dotsEl.style.display = 'none'; return; }
  dotsEl.style.display = 'flex';
  dotsEl.innerHTML = _adBannerOffers.map((_, i) => `
    <button onclick="adBannerGoTo(${i})" aria-label="الشريحة ${i+1}"
      style="width:${i===_adBannerIndex?'22px':'8px'};height:8px;border-radius:50px;border:none;padding:0;cursor:pointer;
      background:${i===_adBannerIndex?'#0a5c8a':'#334155'};transition:width 0.25s ease"></button>
  `).join('');
}

function adBannerGoTo(index) {
  if (index === _adBannerIndex) return;
  _adBannerIndex = index;
  showAdBannerSlide();
  restartAdBannerAutoplay();
}

function renderBannerTextSlide(slide, current) {
  const { offer } = current;
  const text = currentLang === 'en' ? (offer.textEn || offer.text) : offer.text;
  const imgUrl = offer.image ? cldOptimize(offer.image, 700) : '';

  slide.removeAttribute('onclick');
  slide.style.cursor = 'default';

  if (imgUrl) {
    slide.innerHTML = `
      <div style="width:42%;flex-shrink:0;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;padding:12px">
        <img src="${imgUrl}" alt="announcement" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain">
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0 26px;background:#fff;min-width:0">
        <p style="font-size:19px;font-weight:800;color:var(--primary-dark);line-height:1.5;margin:0">${escHtml(text)}</p>
      </div>`;
  } else {
    slide.innerHTML = `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:0 32px;
        background:linear-gradient(135deg,var(--primary),var(--primary-light))">
        <p style="font-size:22px;font-weight:800;color:#fff;line-height:1.5;margin:0;text-align:center">
          <i class="fas fa-bullhorn" style="margin-left:8px;opacity:0.85"></i>${escHtml(text)}
        </p>
      </div>`;
  }
}

// صورة شريط الصفحة الرئيسية — تعرض الصورة كاملة العرض، مع رابط اختياري لمنتج أو قسم
function renderBannerImageSlide(slide, current) {
  const s = current.slideData;
  const imgUrl = cldOptimize(s.image, 1000);

  if (s.linkType === 'product' && s.linkTarget) {
    slide.setAttribute('onclick', `openProductDetail(${s.linkTarget})`);
    slide.style.cursor = 'pointer';
  } else if (s.linkType === 'category' && s.linkTarget) {
    slide.setAttribute('onclick', `filterCat('${s.linkTarget}')`);
    slide.style.cursor = 'pointer';
  } else if (s.linkType === 'url' && s.linkTarget) {
    const safeUrl = s.linkTarget.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    slide.setAttribute('onclick', `window.open('${safeUrl}','_blank')`);
    slide.style.cursor = 'pointer';
  } else if (s.linkType === 'qtyoffer' && s.linkTarget) {
    slide.setAttribute('onclick', `openProductDetail(${s.linkTarget})`);
    slide.style.cursor = 'pointer';
  } else if (s.linkType === 'bundle' && s.linkTarget) {
    slide.setAttribute('onclick', `openBundleDetail(${s.linkTarget})`);
    slide.style.cursor = 'pointer';
  } else {
    slide.removeAttribute('onclick');
    slide.style.cursor = 'default';
  }

  slide.innerHTML = `<img src="${imgUrl}" alt="banner" width="1000" height="180" fetchpriority="high" decoding="async" style="width:100%;height:100%;object-fit:cover">`;
}
function renderBannerQtySlide(slide, current) {
  const { offer, product: p } = current;
  const bestTier = offer.tiers[offer.tiers.length - 1];
  const unitPrice = bestTier.price / bestTier.qty;
  const discountPct = p.price > 0 ? Math.round((1 - unitPrice / p.price) * 100) : 0;
  const imgUrl = p.image ? cldOptimize(p.image, 500) : '';

  slide.setAttribute('onclick', `openProductDetail(${p.id})`);
  slide.innerHTML = `
    <div style="width:42%;flex-shrink:0;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;padding:12px">
      ${imgUrl ? `<img src="${imgUrl}" alt="offer" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain">` : `<span style="font-size:56px">${escHtml(p.icon || '')}</span>`}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;padding:0 26px;background:#fff">
      ${discountPct > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:50px;background:rgba(229,62,62,0.1);color:#e53e3e;font-size:13px;font-weight:800">
        <i class="fas fa-bolt" style="font-size:11px"></i> ${t('خصم','SAVE')} ${discountPct}%
      </span>` : ''}
      <div style="display:flex;align-items:baseline;gap:6px">
        <span style="font-size:36px;font-weight:900;color:#e53e3e;letter-spacing:-0.5px">${fmtPrice(unitPrice)}</span>
        <span style="font-size:16px;font-weight:700;color:#e53e3e">${t('د.أ','JD')}</span>
      </div>
      <span style="font-size:16px;color:var(--text-muted);text-decoration:line-through;font-weight:600">${fmtPrice(p.price)} ${t('د.أ','JD')}</span>
    </div>`;
}

function bundleImageBoxHTML(p, size) {
  const imgUrl = p.image ? cldOptimize(p.image, size * 2) : '';
  return `<div style="width:${size}px;height:${size}px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#fff;display:flex;align-items:center;justify-content:center;padding:4px">
    ${imgUrl ? `<img src="${imgUrl}" alt="${escHtml(p.en)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain">` : `<span style="font-size:${Math.round(size*0.4)}px">${escHtml(p.icon || '')}</span>`}
  </div>`;
}

function bundlePlusIconHTML(absolute) {
  const pos = absolute ? 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' : '';
  return `<span style="${pos}color:var(--primary);font-size:32px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:2">+</span>`;
}

function bundleImagesLayoutHTML(products) {
  const list = products.filter(p => !p.parentId).slice(0, 4);

  if (list.length <= 1) {
    return bundleImageBoxHTML(list[0], 100);
  }
  if (list.length === 2) {
    return `<div style="display:flex;align-items:center;gap:10px">
      ${bundleImageBoxHTML(list[0], 84)}
      ${bundlePlusIconHTML(false)}
      ${bundleImageBoxHTML(list[1], 84)}
    </div>`;
  }
  if (list.length === 3) {
    return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
      ${bundleImageBoxHTML(list[0], 68)}
      <div style="display:flex;gap:6px">
        ${bundleImageBoxHTML(list[1], 68)}
        ${bundleImageBoxHTML(list[2], 68)}
      </div>
      ${bundlePlusIconHTML(true)}
    </div>`;
  }
  // 4 منتجات
  return `<div style="position:relative;display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
    ${list.map(p => bundleImageBoxHTML(p, 66)).join('')}
    ${bundlePlusIconHTML(true)}
  </div>`;
}

function renderBannerBundleSlide(slide, current) {
  const { offer, bundleProducts } = current;
  const original = getBundleOriginalPrice(offer);
  const bundlePrice = offer.bundlePrice;
  const discountPct = original > 0 ? Math.round((1 - bundlePrice / original) * 100) : 0;

  slide.setAttribute('onclick', `openBundleDetail(${offer.id})`);
  slide.innerHTML = `
    <div style="width:56%;flex-shrink:0;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;padding:10px">
      ${bundleImagesLayoutHTML(bundleProducts)}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;padding:0 12px;background:#fff;min-width:0">
      <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:50px;background:rgba(16,185,129,0.1);color:var(--success);font-size:12px;font-weight:800;white-space:nowrap">
        <i class="fas fa-box-open" style="font-size:10px"></i> ${t('باقة','Bundle')}${discountPct > 0 ? ` — ${discountPct}%` : ''}
      </span>
      <div style="display:flex;align-items:baseline;gap:5px">
        <span style="font-size:28px;font-weight:900;color:#e53e3e;letter-spacing:-0.5px">${fmtPrice(bundlePrice)}</span>
        <span style="font-size:14px;font-weight:700;color:#e53e3e">${t('د.أ','JD')}</span>
      </div>
      <span style="font-size:14px;color:var(--text-muted);text-decoration:line-through;font-weight:600">${fmtPrice(original)} ${t('د.أ','JD')}</span>
    </div>`;
}
