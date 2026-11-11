// DentaPro domain module: extracted from the original implementation.
// LOCATION
// =====================
function switchLocMethod(method) {
  document.querySelectorAll('.loc-method-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn' + method.charAt(0).toUpperCase() + method.slice(1))?.classList.add('active');
  if (method === 'manual') {
    const input = document.getElementById('addressInput');
    if (input) setTimeout(() => input.focus(), 50);
  }
}

function onAddressType() {
  const val = document.getElementById('addressInput').value.trim();
  if (val.length > 5) {
    // كتابة عنوان جديد يدوياً بدل موقع الملف الشخصي: لا نُبقي إحداثيات الموقع القديم لأنها لم تعد تطابق العنوان
    if (String(locationData.method || '').startsWith('profile')) { locationData.lat = null; locationData.lng = null; }
    locationData.address = val;
    locationData.method = 'manual';
    document.getElementById('locationConfirm').classList.add('show');
    document.getElementById('locationConfirmText').textContent = `📍 ${val}`;
    document.getElementById('locationError').classList.remove('show');
  }
}

function getGPSLocation() {
  switchLocMethod('GPS');
  if (!navigator.geolocation) {
    showToast(t('المتصفح لا يدعم GPS','Browser does not support GPS'), 'error');
    return;
  }
  document.getElementById('gpsLoading').classList.add('show');
  document.getElementById('locationConfirm').classList.remove('show');
  navigator.geolocation.getCurrentPosition(
    pos => {
      locationData.lat = pos.coords.latitude.toFixed(5);
      locationData.lng = pos.coords.longitude.toFixed(5);
      locationData.address = `${t('خط العرض','Lat')}: ${locationData.lat}, ${t('خط الطول','Lng')}: ${locationData.lng}`;
      locationData.method = 'gps';
      document.getElementById('gpsLoading').classList.remove('show');
      showLocationOnMap(locationData.lat, locationData.lng);
      document.getElementById('locationConfirm').classList.add('show');
      document.getElementById('locationConfirmText').textContent = `✅ ${t('تم تحديد موقعك بنجاح!','Location detected successfully!')}`;
      document.getElementById('locationError').classList.remove('show');
      showToast(t('✅ تم تحديد موقعك بنجاح','✅ Location detected!'), 'success');
    },
    err => {
      document.getElementById('gpsLoading').classList.remove('show');
      showToast(t('تعذر الحصول على الموقع. يرجى إدخاله يدوياً.','Could not get location. Please enter manually.'), 'error');
    }
  );
}

// يعرض الموقع فعلياً على خريطة داخل المربع بدل نص "تم تحديد الموقع"
function showLocationOnMap(lat, lng) {
  const box = document.getElementById('mapPreview');
  box.classList.add('located');
  box.style.padding = '0';
  box.style.overflow = 'hidden';
  const la = parseFloat(lat), ln = parseFloat(lng);
  box.innerHTML = `
    <iframe
      src="https://www.openstreetmap.org/export/embed.html?bbox=${(ln-0.006)}%2C${(la-0.004)}%2C${(ln+0.006)}%2C${(la+0.004)}&layer=mapnik&marker=${la}%2C${ln}"
      style="width:100%;height:100%;border:0;pointer-events:none"
      loading="lazy" title="map"></iframe>`;
}

var _pickerMap = null;
var _pickerGPS = null; // موقع المستخدم الحالي عند فتح الخريطة (لا يُحفظ في locationData إلا بعد التأكيد)
var _pickerMarker = null;

var _leafletLoaded = false;
function loadLeafletIfNeeded() {
  if (_leafletLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => { _leafletLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

// يجلب موقع المستخدم الحالي؛ لا يفشل أبداً: يرجع {lat,lng} أو null
function getPickerGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });
}

// ===== نافذة خريطة واحدة مشتركة لكل الاستخدامات =====
// السياق: 'cart' = السلة/الطلب العادي، 'qo' = الطلب السريع، 'reg' = التسجيل لأول مرة، 'ep' = تعديل الملف الشخصي
var _pickerContext = 'cart';
var _pickerUserMoved = false; // هل لمس المستخدم الخريطة قبل وصول موقعه؟

// رسالة حالة تحديد الموقع الحالي داخل نافذة الخريطة
function dpSetPickerGpsStatus(state) {
  const el = document.getElementById('mapPickerGpsStatus');
  if (!el) return;
  const m = {
    loading: ['⏳ ' + t('جارٍ تحديد موقعك الحالي...', 'Detecting your current location...'), 'var(--text-muted)'],
    ok: ['✅ ' + t('تم الانتقال لموقعك الحالي، حرّك الدبوس لاختيار الموقع المناسب', 'Moved to your location — drag the pin to adjust'), 'var(--success)'],
    fail: ['⚠️ ' + t('تعذر تحديد موقعك الحالي (فعّل إذن الموقع)، اختر الموقع يدوياً على الخريطة', 'Could not detect your location (enable location permission) — pick it on the map'), '#d97706']
  }[state];
  el.textContent = m[0]; el.style.color = m[1];
}

// ينقل الخريطة والدبوس لموقع المستخدم الحالي
function dpPickerGoTo(pos, zoom) {
  if (!_pickerMap || !_pickerMarker) return;
  _pickerMap.invalidateSize();
  _pickerMap.setView([pos.lat, pos.lng], zoom);
  _pickerMarker.setLatLng([pos.lat, pos.lng]);
  dpPickerReverse();
}

// ===== البحث عن عنوان واسم المنطقة (Nominatim / OpenStreetMap) =====
var _pickerArea = '';      // اسم المنطقة لموقع الدبوس الحالي (إن عُرف)
var _pickerRevToken = 0;
var _pickerRevTimer = null;

function dpNominatimLang() { return (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ar'; }

// اسم مختصر مقروء من نتيجة Nominatim: الشارع، الحي، المدينة
function dpShortAddress(r) {
  const a = r.address || {};
  const parts = [a.road || a.pedestrian, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.county || a.state]
    .filter(Boolean);
  const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
  return uniq.length ? uniq.join('، ') : (r.display_name || '').split(',').slice(0, 3).join('،').trim();
}

// يجلب اسم المنطقة لموقع الدبوس (بتأخير بسيط حتى لا تُرسل طلبات أثناء السحب)
function dpPickerReverse() {
  const el = document.getElementById('mapPickerArea');
  _pickerArea = '';
  if (!_pickerMarker) return;
  if (el) el.textContent = '⏳ ' + t('جارٍ معرفة اسم المنطقة...', 'Finding area name...');
  clearTimeout(_pickerRevTimer);
  const tok = ++_pickerRevToken;
  _pickerRevTimer = setTimeout(async () => {
    const p = _pickerMarker.getLatLng();
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=${dpNominatimLang()}&lat=${p.lat}&lon=${p.lng}`);
      const data = await res.json();
      if (tok !== _pickerRevToken) return;
      _pickerArea = data && !data.error ? dpShortAddress(data) : '';
    } catch (e) { if (tok !== _pickerRevToken) return; _pickerArea = ''; }
    if (el) el.textContent = _pickerArea ? '📍 ' + _pickerArea : '';
  }, 600);
}

async function searchPickerAddress() {
  const q = (document.getElementById('mapPickerSearch').value || '').trim();
  const box = document.getElementById('mapPickerResults');
  if (q.length < 2) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:var(--text-muted)">⏳ ${t('جارٍ البحث...', 'Searching...')}</div>`;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=jo&accept-language=${dpNominatimLang()}&q=${encodeURIComponent(q)}`);
    const list = await res.json();
    if (!list.length) { box.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:var(--text-muted)">${t('لا توجد نتائج، جرّب اسماً آخر', 'No results, try another name')}</div>`; return; }
    window._pickerSearchResults = list;
    box.innerHTML = list.map((r, i) => `
      <div onclick="pickSearchResult(${i})" style="padding:10px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #eef3f7">
        <div style="font-weight:700;color:var(--primary-dark)">${escHtml(dpShortAddress(r))}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml((r.display_name || '').slice(0, 90))}</div>
      </div>`).join('');
  } catch (e) {
    box.innerHTML = `<div style="padding:10px 12px;font-size:13px;color:#d97706">${t('تعذر البحث الآن، حدّد الموقع على الخريطة', 'Search unavailable, pick on the map')}</div>`;
  }
}

function pickSearchResult(i) {
  const r = (window._pickerSearchResults || [])[i];
  if (!r) return;
  _pickerUserMoved = true;
  document.getElementById('mapPickerResults').style.display = 'none';
  dpPickerGoTo({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) }, 17);
}

// تُرسم الخريطة فوراً (على الموقع المحفوظ أو عمّان) ثم تنتقل لموقع المستخدم الحالي عند وصوله
async function openMapPicker(context) {
  _pickerContext = context || 'cart';
  await loadLeafletIfNeeded();
  if (_pickerContext === 'cart') switchLocMethod('MapPick');
  document.getElementById('mapPickerModal').classList.add('open');
  _pickerUserMoved = false;
  _pickerGPS = null;
  _pickerArea = '';
  const _ar = document.getElementById('mapPickerArea'); if (_ar) _ar.textContent = '';
  const _rs = document.getElementById('mapPickerResults'); if (_rs) _rs.style.display = 'none';
  const _si = document.getElementById('mapPickerSearch'); if (_si) _si.value = '';
  dpSetPickerGpsStatus('loading');
  setTimeout(initPickerMap, 50);
  const myToken = ++_pickerGpsToken;
  const pos = await getPickerGPS();
  if (myToken !== _pickerGpsToken) return; // فُتحت الخريطة من جديد
  dpSetPickerGpsStatus(pos ? 'ok' : 'fail');
  if (!pos) return;
  _pickerGPS = pos;
  const open = document.getElementById('mapPickerModal').classList.contains('open');
  if (open && !_pickerUserMoved) dpPickerGoTo(pos, 15);
}
var _pickerGpsToken = 0;

// زر "موقعي الحالي" داخل الخريطة
async function locateOnPicker() {
  dpSetPickerGpsStatus('loading');
  const pos = await getPickerGPS();
  if (!pos) { dpSetPickerGpsStatus('fail'); return; }
  _pickerUserMoved = true;
  dpPickerGoTo(pos, 16);
  dpSetPickerGpsStatus('ok');
}

function closeMapPicker() {
  _pickerGpsToken++;
  document.getElementById('mapPickerModal').classList.remove('open');
}

// آخر موقع محفوظ حسب السياق (لفتح الخريطة عليه قبل وصول الموقع الحالي)
function dpPickerSavedPos() {
  let lat, lng;
  if (_pickerContext === 'cart') { lat = locationData.lat; lng = locationData.lng; }
  else if (_pickerContext === 'qo') { lat = qoLocationData.lat; lng = qoLocationData.lng; }
  else { lat = document.getElementById(_pickerContext + 'LocationLat')?.value; lng = document.getElementById(_pickerContext + 'LocationLng')?.value; }
  lat = parseFloat(lat); lng = parseFloat(lng);
  return (isFinite(lat) && isFinite(lng)) ? { lat, lng } : { lat: 31.9539, lng: 35.9106 };
}

function initPickerMap() {
  const d = _pickerGPS || dpPickerSavedPos(); // لو وصل الموقع الحالي قبل رسم الخريطة نستخدمه
  if (!_pickerMap) {
    _pickerMap = L.map('leafletPickerMap').setView([d.lat, d.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(_pickerMap);
    _pickerMarker = L.marker([d.lat, d.lng], { draggable: true }).addTo(_pickerMap);
    _pickerMap.on('click', (e) => { _pickerUserMoved = true; _pickerMarker.setLatLng(e.latlng); dpPickerReverse(); });
    _pickerMarker.on('dragend', dpPickerReverse);
    _pickerMap.on('dragstart', () => { _pickerUserMoved = true; });
    _pickerMarker.on('dragstart', () => { _pickerUserMoved = true; });
  } else {
    _pickerMap.invalidateSize();
    if (!_pickerUserMoved) { _pickerMap.setView([d.lat, d.lng], _pickerGPS ? 15 : 13); _pickerMarker.setLatLng([d.lat, d.lng]); }
  }
}

function confirmMapPick() {
  if (!_pickerMarker) return;
  const pos = _pickerMarker.getLatLng();
  const lat = pos.lat.toFixed(5), lng = pos.lng.toFixed(5);
  const coordsOnly = `${t('خط العرض','Lat')}: ${lat}, ${t('خط الطول','Lng')}: ${lng}`;
  // العنوان المحفوظ: اسم المنطقة (إن عُرف) + الإحداثيات
  const coords = _pickerArea ? `${_pickerArea} (${lat}, ${lng})` : coordsOnly;
  const ctx = _pickerContext;

  if (ctx === 'cart') {
    locationData.lat = lat; locationData.lng = lng; locationData.address = coords; locationData.method = 'map';
    showLocationOnMap(lat, lng);
    document.getElementById('locationConfirm').classList.add('show');
    document.getElementById('locationConfirmText').textContent = `✅ ${t('تم تحديد موقعك من الخريطة','Location selected from map')}${_pickerArea ? ' — ' + _pickerArea : ''}`;
    document.getElementById('locationError').classList.remove('show');
  } else if (ctx === 'qo') {
    qoLocationData.lat = lat; qoLocationData.lng = lng; qoLocationData.address = coords; qoLocationData.method = 'map';
    const box = document.getElementById('qoMapPreview');
    box.classList.add('located');
    box.innerHTML = `
      <i class="fas fa-map-marker-alt" style="color:var(--success)"></i>
      <div class="map-placeholder-text" style="color:var(--primary-dark)">${_pickerArea ? escHtml(_pickerArea) : 'تم تحديد الموقع من الخريطة'}</div>
      <div class="map-coords">📍 ${lat}, ${lng}</div>`;
    document.getElementById('qoLocationConfirm').classList.add('show');
    document.getElementById('qoLocationConfirmText').textContent = `✅ تم تحديد موقعك من الخريطة بنجاح!`;
    document.getElementById('qoLocationError').classList.remove('show');
  } else { // 'reg' أو 'ep'
    document.getElementById(ctx + 'LocationLat').value = lat;
    document.getElementById(ctx + 'LocationLng').value = lng;
    // نعبّئ وصف العنوان باسم المنطقة إن كان الحقل فارغاً (لا نستبدل ما كتبه العميل)
    const txt = document.getElementById(ctx + 'LocationText');
    if (txt && !txt.value.trim() && _pickerArea) txt.value = _pickerArea;
    const statusEl = document.getElementById(ctx + 'LocationStatus');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success)"></i>
        <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:var(--primary);text-decoration:underline">عرض الموقع المحفوظ على خرائط جوجل</a>`;
    }
  }
  closeMapPicker();
  showToast(t('✅ تم تحديد الموقع من الخريطة','✅ Location selected from map'), 'success');
}

function updateCharCount() {
  const val = document.getElementById('orderNotes').value;
  document.getElementById('charCount').textContent = val.length;
}

// =====================
// SUBMIT ORDER
// =====================
async function submitOrder() {
  if (!validateStep(3)) { currentStep=3; renderModalStep(); return; }

  // حاجز أخير: لا إرسال قبل اكتمال ظهور تفاصيل المواد وطرق الدفع في خطوة التأكيد
  if (window._confirmReady === false) {
    showToast('⏳ ' + t('انتظر لحظات حتى تكتمل تفاصيل الطلب وطرق الدفع ثم أرسل', 'Please wait for the order details and payment methods to load, then submit'), 'error');
    return;
  }

  const btn = document.getElementById('btnSubmit');
  if (btn.disabled) return; // منع النقر المتكرر أثناء تنفيذ الطلب

  btn.disabled = true;
  const btnOriginalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

  try {

  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  let orderNum = `DP-${ts}-${rand}`;

  const totalPoints = cart.reduce((s, i) => s + ((i.points || 0) * i.qty), 0);
  const payWithPoints = window._selectedPayMethod === 'points';
  const payOnCredit = window._selectedPayMethod === 'credit';

  // ملاحظة: لم نعد نخصم النقاط هنا — تُخصم تلقائياً فقط عند تأكيد التسليم من الأدمن

  const submittedPhone = formatPhoneForWhatsApp(document.getElementById('countryCode').value + document.getElementById('phoneNumber').value);
  const matchedClient = (!currentUser && typeof findRegisteredClientByPhone === 'function')
    ? await findRegisteredClientByPhone(submittedPhone) : null;
  const linkedClient = currentUser || matchedClient || null;

  const orderClientEmail = linkedClient ? (linkedClient.email || 'guest') : 'guest';
  const orderPhone = linkedClient ? (linkedClient.phone || submittedPhone) : submittedPhone;

  // لو الدفع بالنقاط: المبلغ النقدي المطلوب فعلياً هو بس قيمة المواد
  // اللي ما بتدعم الدفع بالنقاط (مو مجموع السلة الكامل) — لتفادي "تهريب"
  // مواد بالمجان تحت غطاء الدفع بالنقاط
  const cashOnlyItems = payWithPoints ? cart.filter(i => !i.points || i.points === 0) : cart;
  const rawTotal = payWithPoints
    ? cashOnlyItems.reduce((s, i) => s + i.price * i.qty, 0)
    : getTotal();
  // كود الخصم: نتحقق منه من الخادم مرة أخيرة قبل حجز المخزون (قد يكون انتهى أو استُنفد منذ إدخاله)
  if (window._couponState && window._couponState.code) {
    const cv = await dpValidateCouponForClient(window._couponState.code);
    if (!cv.ok) {
      btn.disabled = false;
      btn.innerHTML = btnOriginalHTML;
      dpClearCoupon();
      updateCartUI();
      showToast('🎟️ ' + cv.reason + ' — ' + t('أُزيل الكود، راجع الإجمالي ثم أعد الإرسال', 'code removed, review the total and resubmit'), 'error');
      return;
    }
    window._couponState.data = cv.data;
  }
  const discountResult = await computeCartDiscountWithCoupon(cashOnlyItems, orderClientEmail, orderPhone);
  const subtotalForDelivery = discountResult ? discountResult.total : Math.round(rawTotal * 100) / 100;

  const deliveryResult = await computeCartDeliveryPreview(subtotalForDelivery, orderPhone, linkedClient, { coupon: true });
  const finalTotal = deliveryResult.determined ? subtotalForDelivery + (deliveryResult.fee || 0) : subtotalForDelivery;

  // الذمم: نتأكد من الخادم أن الحد المتبقي يكفي قبل حجز المخزون
  if (payOnCredit) {
    const cr = await dpLoadMyCredit();
    if (!cr.enabled || finalTotal > dpCreditAvailable(cr)) {
      btn.disabled = false;
      btn.innerHTML = btnOriginalHTML;
      window._selectedPayMethod = 'money';
      renderConfirmDetails();
      showToast('🧾 ' + t('رصيدك المتاح في الذمم لا يكفي لهذا الطلب، اختر طريقة دفع أخرى', 'Your available credit is not enough for this order'), 'error');
      return;
    }
  }

  const order = {
    id:          orderNum,
    clientName:  linkedClient ? (linkedClient.name || document.getElementById('doctorName').value) : document.getElementById('doctorName').value,
    clientEmail: orderClientEmail,
    clientUid:   linkedClient ? (linkedClient.uid || null) : null,
    clinic:      linkedClient ? (linkedClient.clinic || document.getElementById('clinicName').value) : document.getElementById('clinicName').value,
    doctor:      linkedClient ? (linkedClient.name || document.getElementById('doctorName').value) : document.getElementById('doctorName').value,
    phone:       orderPhone,
    ...(((document.getElementById('altPhone') || {}).value || '').trim() ? { altPhone: document.getElementById('altPhone').value.trim() } : {}),
    address:     locationData.address || document.getElementById('addressInput').value,
    locationLat: locationData.lat || null,
    locationLng: locationData.lng || null,
    notes:       document.getElementById('orderNotes').value,
    items:       cart.map(i => ({
      id:i.id, ...(i.parentId ? { parentId: i.parentId, sizeLabel: i.sizeLabel || '' } : {}), ar:i.ar, en:i.en, icon:i.icon, price:i.price, qty:i.qty, points:i.points||0,
      basePrice: i.basePrice || null,
      isBundle: i.isBundle || false,
      bundleItems: i.isBundle ? i.bundleItems : undefined
    })),
    total:       finalTotal,
    deliveryFee: deliveryResult.determined ? (deliveryResult.fee || 0) : null,
    deliveryDetermined: deliveryResult.determined,
    totalPoints: totalPoints,
    payMethod:   payWithPoints ? 'points' : (payOnCredit ? 'credit' : 'money'),
    pointsDeducted: false,
    status:      'pending',
    createdAt:   new Date().toISOString(),
    ...(discountResult ? { originalTotal: discountResult.originalTotal, discountPercent: discountResult.discountPercent } : {}),
    ...(discountResult && discountResult.couponCode ? { couponCode: discountResult.couponCode, couponDiscount: discountResult.couponDiscount, couponEligibleTotal: discountResult.couponEligibleTotal } : {})
  };

  // محاولة الحفظ في Firebase — إن فشلت نعيد المحاولة مرة واحدة بعد تأخير بسيط
  // تنظيف الـ order من أي قيم undefined — Firestore يرفضها تماماً
  function stripUndefinedDeep(obj) {
    if (Array.isArray(obj)) {
      return obj.map(stripUndefinedDeep);
    } else if (obj !== null && typeof obj === 'object') {
      const clean = {};
      Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val === undefined) return; // نتجاهل الحقل بدل ما نرسله undefined
        clean[key] = stripUndefinedDeep(val);
      });
      return clean;
    }
    return obj;
  }
  const cleanOrder = stripUndefinedDeep(order);

  if (window.SERVER_ORDER_CREATION_ENABLED) {
    // مسار الخادم: الدالة تحسب السعر/الخصم/التوصيل/المخزون بنفسها وتنشئ الطلب
    try {
      const serverResult = await window._fbCreateOrderFn({
        items: cart.map(i => ({
          id: i.id, qty: i.qty,
          isBundle: i.isBundle || false,
          bundleItems: i.isBundle ? i.bundleItems : undefined,
        })),
        clinic: cleanOrder.clinic, doctor: cleanOrder.doctor,
        phone: cleanOrder.phone, address: cleanOrder.address,
        locationLat: cleanOrder.locationLat, locationLng: cleanOrder.locationLng,
        notes: cleanOrder.notes,
        payMethod: cleanOrder.payMethod,
        sourceQuoteId: null,
        idempotencyKey: window._currentOrderIdempotencyKey,
      });
      orderNum = serverResult.data.orderNum;
      cleanOrder.id = orderNum;
      cleanOrder.total = serverResult.data.total;
      cleanOrder.totalPoints = serverResult.data.totalPoints;
      if (cleanOrder.clientEmail === 'guest') rememberGuestOrder(cleanOrder);
    } catch(serverErr) {
      btn.disabled = false;
      btn.innerHTML = btnOriginalHTML;
      showToast(`❌ ${serverErr.message}`, 'error');
      return;
    }
  } else {
    // المسار المحلي الحالي (سيُزال لاحقاً بعد التأكد من عمل مسار الخادم بثقة)
    try {
      const stockResult = await reserveOrderStock(cleanOrder.items);
      cleanOrder.stockReserved = stockResult.reserved;
    } catch(stockErr) {
      btn.disabled = false;
      btn.innerHTML = btnOriginalHTML;
      showToast(`❌ ${stockErr.message}`, 'error');
      return;
    }

    // مع تفعيل persistentLocalCache، عملية addDoc تنجح فوراً محلياً حتى بدون إنترنت
    // وتُرسل تلقائياً لـ Firebase بمجرد عودة الاتصال — لا داعي لاعتبارها فشلاً
    try {
      // طلب بكود خصم: يُكتب مع سجل الاستعمال والعدّادات في دفعة واحدة ذرّية تتحقق منها القواعد
      const writeOrder = () => cleanOrder.couponCode
        ? dpSetOrderWithCoupon(orderNum, cleanOrder)
        : window._fbSetDoc(window._fbDoc2('orders', orderNum), cleanOrder);
      try {
        await writeOrder();
      } catch (ePerm) {
        // إن لم تُحدَّث قواعد Firestore بعد لتقبل altPhone، نرسل الطلب بدونه بدل أن يفشل الطلب كله
        if (ePerm && ePerm.code === 'permission-denied' && cleanOrder.altPhone) {
          delete cleanOrder.altPhone;
          await writeOrder();
        } else { throw ePerm; }
      }
      if (cleanOrder.clientEmail === 'guest') rememberGuestOrder(cleanOrder);
      console.log(navigator.onLine ? '✅ تم الحفظ في Firebase' : '📦 تم حفظ الطلب محلياً، سيُرسل تلقائياً عند عودة الاتصال');
    } catch(e) {
      console.error('❌ Firebase error:', e.code || e.message, e);
      // أي فشل بعد حجز المخزون: نُرجع الكميات المحجوزة، وإلا يتناقص مخزون المواد مع كل محاولة فاشلة دون طلب فعلي
      if (cleanOrder.stockReserved) {
        try { await releaseOrderStock(cleanOrder.items); } catch (er) { console.warn('releaseOrderStock:', er && er.message); }
      }
      if (cleanOrder.couponCode) {
        // فشل اعتماد الكود: نُزيل الكود ليراجع العميل الإجمالي
        const denied = e && e.code === 'permission-denied';
        dpClearCoupon();
        updateCartUI();
        showToast(denied
          ? '🎟️ ' + t('تعذّر اعتماد كود الخصم (ربما انتهى أو استُنفد). أُزيل الكود، راجع الإجمالي ثم أعد الإرسال', 'The discount code could not be applied (expired or used up). It was removed, review the total and resubmit')
          : '❌ تعذّر إرسال الطلب' + (e && e.code ? ' (' + e.code + ')' : '') + '، تحقق من اتصال الإنترنت وحاول مجدداً', 'error');
        btn.disabled = false;
        btn.innerHTML = btnOriginalHTML;
        return;
      }
      showToast('❌ تعذّر إرسال الطلب' + (e && e.code ? ' (' + e.code + ')' : '') + '، تحقق من اتصال الإنترنت وحاول مجدداً', 'error');
      btn.disabled = false;
      btn.innerHTML = btnOriginalHTML;
      return;
    }
  }

  createNotification({
    scope: 'admin',
    icon: '🛒',
    title: 'طلب جديد',
    message: `طلب جديد من ${order.clinic || order.doctor} بقيمة ${fmtPrice(order.total)} د.أ`,
    link: 'adminorders:open',
  });
logActivity('order_placed', { orderId: orderNum, total: getTotal() });
  document.getElementById('orderNumberDisplay').textContent = '#' + orderNum;
  const subtotalLine = discountResult
    ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:13px;font-weight:600;margin-inline-end:6px">${fmtPrice(discountResult.originalTotal)} ${t('د.أ','JD')}</span>${fmtPrice(subtotalForDelivery)} ${t('د.أ','JD')} <span style="font-size:11px;color:#e53e3e;font-weight:800">(${t('خصم','off')} ${discountResult.discountPercent}%)</span>`
    : `${t('المجموع','Subtotal')}: ${fmtPrice(subtotalForDelivery)} ${t('د.أ','JD')}`;
  document.getElementById('orderTotalDisplay').innerHTML = subtotalLine + deliveryLineHTML(order.deliveryFee, order.deliveryDetermined) +
    (order.deliveryDetermined ? `<div style="font-weight:900;margin-top:6px">${t('الإجمالي','Total')}: ${fmtPrice(order.total)} ${t('د.أ','JD')}</div>` : '');
  document.querySelector('.modal-steps').style.display = 'none';
  ['modalStep1','modalStep2','modalStep3','modalStep4'].forEach(id =>
    document.getElementById(id).style.display = 'none'
  );
  document.getElementById('modalFooter').style.display  = 'none';
  document.getElementById('successScreen').classList.add('show');
  orderSubmitted = true;
  clearCart();
  showToast(t('🎉 تم إرسال طلبك بنجاح!','🎉 Order submitted successfully!'), 'success');

  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOriginalHTML;
  }
}

// ينظف رقم الهاتف ليكون بصيغة دولية صحيحة لرابط واتساب
// يتعامل مع: +962..., 00962..., 962... (بدون رمز)، 0790408680 (محلي أردني بصفر)، 790408680 (محلي بدون صفر)
function formatPhoneForWhatsApp(fullPhone) {
  if (!fullPhone) return '';
  let clean = fullPhone.replace(/[^\d+]/g, ''); // إزالة كل شيء غير الأرقام و +

  // تحويل صيغة "00" الدولية إلى "+" أولاً (مثال: 00962... → +962...)
  if (clean.startsWith('00')) {
    clean = '+' + clean.slice(2);
  }

  const knownCodes = ['962','966','971','965','973','974','968','213','216','212'];

  // لو الرقم يحتوي على + (رمز دولة مدمج بالبداية زي +962...)
  if (clean.startsWith('+')) {
    clean = clean.slice(1);
    for (const code of knownCodes) {
      if (clean.startsWith(code)) {
        let rest = clean.slice(code.length);
        if (rest.startsWith('0')) rest = rest.slice(1);
        return code + rest;
      }
    }
    return clean;
  }

  // لو الرقم ما فيه + أو 00 لكنه يبدأ برمز دولة معروف مباشرة (مثال: 962790408680)
  for (const code of knownCodes) {
    if (clean.startsWith(code)) {
      let rest = clean.slice(code.length);
      if (rest.startsWith('0')) rest = rest.slice(1);
      return code + rest;
    }
  }

  // رقم محلي أردني مجرد بدون أي رمز دولة (مثال: 0790408680 أو 790408680)
  // نفترض رمز الأردن تلقائياً بما أن معظم العملاء أردنيون
  if (clean.startsWith('0') && clean.length === 10) {
    return '962' + clean.slice(1);
  }
  if (!clean.startsWith('0') && clean.length === 9) {
    return '962' + clean;
  }

  return clean;
}

function sendWhatsApp() {
  const clinic = document.getElementById('clinicName').value;
  const doctor = document.getElementById('doctorName').value;
  const phone = document.getElementById('countryCode').value + document.getElementById('phoneNumber').value;
  const addr = locationData.address || document.getElementById('addressInput').value;
  const notes = document.getElementById('orderNotes').value;
  const items = dpDisplayItems(cart).map(i=>`• ${currentLang==='en'?i.en:i.ar}${i.sizesLabel ? ` (${i.sizesLabel})` : ''} × ${i.qty} = ${fmtPrice((i.price*i.qty))} ${t('د.أ','JD')}`).join('\n');
  const msg = encodeURIComponent(
    `🦷 *DentaPro - ${t('طلب جديد','New Order')}*\n\n` +
    `🏥 ${t('العيادة','Clinic')}: ${clinic}\n` +
    `👨‍⚕️ ${t('الطبيب','Doctor')}: ${doctor}\n` +
    `📞 ${t('الهاتف','Phone')}: ${phone}\n` +
    `📍 ${t('الموقع','Location')}: ${addr}\n` +
    `${notes ? `🗒️ ${t('ملاحظات','Notes')}: ${notes}\n` : ''}` +
    `\n📦 ${t('المنتجات','Products')}:\n${items}\n\n` +
    `💰 ${t('الإجمالي','Total')}: ${fmtPrice(getTotal())} ${t('د.أ','JD')}`
  );
  window.open(`https://wa.me/962790408680?text=${msg}`, '_blank');
}
// =====================
