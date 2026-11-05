// DentaPro domain module: extracted from the original implementation.
// AUTH SYSTEM
// =====================
var currentUser = null;


function getActiveClientSession() {
  return currentUser && currentUser.role === 'client' ? currentUser : null;
}

function normalizeClientPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('009627')) return '9627' + digits.slice(6);
  if (digits.startsWith('9627')) return digits;
  if (digits.startsWith('07')) return '9627' + digits.slice(2);
  return digits;
}

async function findRegisteredClientByPhone(phone) {
  const normalized = normalizeClientPhone(phone);
  if (!normalized) return null;
  try {
    if (window._fbGetDocs && window._fbCollection && window._db) {
      const snap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
      const found = snap.docs.map(d => ({ ...d.data(), uid: d.id }))
        .find(u => u.role === 'client' && normalizeClientPhone(u.phone) === normalized);
      if (found) {
        return {
          role: 'client', uid: found.uid, email: found.email || '',
          name: found.firstName || found.name || 'عميل', clinic: found.clinic || '',
          phone: found.phone || phone,
          profileLocationText: found.profileLocationText || '',
    altPhone: found.altPhone || '',
          profileLocationLat: found.profileLocationLat || null,
          profileLocationLng: found.profileLocationLng || null
        };
      }
    }
  } catch (e) {
    console.warn('Phone client lookup failed:', e.message);
  }
  const localUsers = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
  const found = localUsers.find(u => u.role === 'client' && normalizeClientPhone(u.phone) === normalized);
  return found ? {
    role: 'client', uid: found.uid || null, email: found.email || '',
    name: found.firstName || found.name || 'عميل', clinic: found.clinic || '',
    phone: found.phone || phone,
    profileLocationText: found.profileLocationText || '',
    altPhone: found.altPhone || '',
    profileLocationLat: found.profileLocationLat || null,
    profileLocationLng: found.profileLocationLng || null
  } : null;
}

async function autofillClientByPhone(phoneId, nameId, clinicId) {
  const phoneEl = document.getElementById(phoneId);
  if (!phoneEl || normalizeClientPhone(phoneEl.value).length < 7) return null;
  const client = await findRegisteredClientByPhone(phoneEl.value.trim());
  window._guestResolvedClient = client || null;
  if (!client) return null;
  const nameEl = document.getElementById(nameId);
  const clinicEl = document.getElementById(clinicId);
  if (nameEl && !nameEl.value.trim()) nameEl.value = client.name || '';
  if (clinicEl && !clinicEl.value.trim()) clinicEl.value = client.clinic || '';
  showToast('✅ تم التعرف على بياناتك من رقم الهاتف', 'success');
  return client;
}

// مراقب حالة الجلسة - Firebase Auth
// الوحدة تُحمّل ديناميكياً، لذلك قد يكون حدث load قد وقع قبل تحميلها.
async function initializeAuthStateListener() {
  for (let i = 0; i < 30; i++) {
    if (typeof window._fbAuthState === 'function' && window._auth) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (typeof window._fbAuthState !== 'function' || !window._auth) {
    console.warn('⚠️ تعذّر تهيئة مراقب حالة الدخول: Firebase Auth غير متاح');
    return;
  }
  window._fbAuthState(window._auth, async (fbUser) => {
    if (fbUser) {
      let resolved;
      try {
        resolved = await resolveUserRole(fbUser);
      } catch(e) {
        if (e.code === 'account-disabled') {
          console.warn('⛔ محاولة دخول لحساب معطّل:', fbUser.email);
          await window._fbSignOut(window._auth);
          showToast('⛔ تم إيقاف هذا الحساب من قبل الإدارة', 'error');
          return;
        }
        console.warn('⚠️ تعذّر تحديد صلاحية المستخدم، سيتم اعتباره عميلاً:', e.message);
        resolved = { role: 'client', name: fbUser.displayName || 'عميل', clinic: '', phone: '' };
      }
      currentUser = { ...resolved, email: fbUser.email, uid: fbUser.uid };
      if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        notifyPendingOrdersOnLogin();
      }
      localStorage.setItem('dentapro_session', JSON.stringify(currentUser));
      renderAuthHeader();
      loadAndRenderNotifIcon();
      enablePushNotifications();
      if (currentUser.role === 'client') { renderPointsInHeader(); updateLatestSectionButton(); }
    } else {
      currentUser = null;
      localStorage.removeItem('dentapro_session');
      renderAuthHeader();
      document.getElementById('notifBtn').style.display = 'none';
    }
  });
}

if (document.readyState === 'complete') {
  initializeAuthStateListener();
} else {
  window.addEventListener('load', initializeAuthStateListener, { once: true });
}

// يحدد دور المستخدم الحقيقي (admin / manager / client) من مستند Firestore users/{uid}
// البريد الإداري الثابت يبقى كحساب احتياطي (bootstrap) لضمان وجود أدمن دائماً حتى لو فشلت قراءة Firestore
async function resolveUserRole(fbUser) {
  if (fbUser.email === ADMIN_EMAIL) {
    // الصلاحية ثابتة (admin) دائماً؛ أما الاسم والعيادة والهاتف والموقع فتُقرأ من مستند الحساب كي تبقى بعد التحديث
    // (كانت تُعاد قيمة ثابتة فتضيع تعديلات الملف الشخصي بعد تحديث الصفحة)
    let d = {};
    try {
      const snap = await window._fbGetDoc(window._fbDoc2('users', fbUser.uid));
      if (snap.exists()) d = snap.data();
    } catch (e) { console.warn('⚠️ Firestore users/{uid} (admin):', e.message); }
    return {
      role: 'admin',
      name: d.firstName || 'المدير',
      clinic: d.clinic || '',
      phone: d.phone || '',
      altPhone: d.altPhone || '',
      profileLocationText: d.profileLocationText || '',
      profileLocationLat: d.profileLocationLat || null,
      profileLocationLng: d.profileLocationLng || null
    };
  }
  try {
    const snap = await window._fbGetDoc(window._fbDoc2('users', fbUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.disabled) {
        const err = new Error('هذا الحساب معطّل من قبل الإدارة');
        err.code = 'account-disabled';
        throw err;
      }
      const role = (data.role === 'admin' || data.role === 'manager') ? data.role : 'client';
      return {
        role,
        name: data.firstName || fbUser.displayName || (role==='manager' ? 'مدير فرعي' : 'عميل'),
        clinic: data.clinic || '',
        phone: data.phone || '',
        profileLocationText: data.profileLocationText || '',
    altPhone: data.altPhone || '',
        profileLocationLat: data.profileLocationLat || null,
        profileLocationLng: data.profileLocationLng || null
      };
    }
  } catch(e) {
    if (e.code === 'account-disabled') throw e;
    console.warn('⚠️ Firestore users/{uid}:', e.message);
  }
  // احتياطي: نسخة محلية قديمة (تتوافق مع البيانات السابقة فقط، لا تُستخدم لتحديد صلاحيات حساسة)
  const users = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
  const profile = users.find(u => u.email === fbUser.email) || {};
  return {
    role: 'client',
    name: profile.firstName || fbUser.displayName || 'عميل',
    clinic: profile.clinic || '',
    phone: profile.phone || '',
    profileLocationText: profile.profileLocationText || '',
    altPhone: profile.altPhone || '',
    profileLocationLat: profile.profileLocationLat || null,
    profileLocationLng: profile.profileLocationLng || null
  };
}

// اختصارات للتحقق من الصلاحيات تُستخدم في كل الواجهة
function hasVerifiedFirebaseSession() {
  const authUid = window._auth?.currentUser?.uid;
  return !!currentUser && !!authUid && currentUser.uid === authUid;
}
function isAdmin()   { return hasVerifiedFirebaseSession() && currentUser.role === 'admin'; }
function isManager()  { return hasVerifiedFirebaseSession() && currentUser.role === 'manager'; }
function isStaff()    { return isAdmin() || isManager(); }

// تحميل الجلسة المحلية فوراً (لتجنب الوميض)
function restoreLocalSession() {
  const saved = localStorage.getItem('dentapro_session');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      renderAuthHeader();
      loadAndRenderNotifIcon();
      if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'manager') {
        showClientWelcome(currentUser);
        renderPointsInHeader();
      }
    } catch(e) {}
  } else { renderAuthHeader(); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreLocalSession, { once: true });
} else {
  restoreLocalSession();
}

function handleDrawerAuthClick() {
  if (currentUser) { doLogout(); } else { openAuthModal('login'); }
}

function updateDrawerAuthButton() {
  const icon = document.getElementById('drawerAuthIcon');
  const label = document.getElementById('drawerAuthLabel');
  if (!icon || !label) return;
  if (currentUser) {
    icon.className = 'fas fa-sign-out-alt';
    label.textContent = t('تسجيل الخروج','Log Out');
  } else {
    icon.className = 'fas fa-sign-in-alt';
    label.textContent = t('تسجيل الدخول','Log In');
  }
}

function updateBottomNavAccountButton() {
  const icon = document.getElementById('bottomNavAccountIcon');
  const label = document.getElementById('bottomNavAccountLabel');
  if (!icon || !label) return;
  if (currentUser && isStaff()) {
    icon.className = 'fas fa-bars';
    label.style.display = 'none';
  } else {
    icon.className = 'fas fa-home';
    label.textContent = t('الرئيسية','Home');
    label.style.display = 'block';
  }
}

function renderAuthHeader() {
  updateBottomNavAccountButton();
  updateDrawerAuthButton();
  const area = document.getElementById('authHeaderArea');
  if (!currentUser) {
    area.innerHTML = `
      <button class="auth-btn filled" onclick="openAuthModal('login')">
        <i class="fas fa-sign-in-alt"></i>
        <span>دخول</span>
      </button>`;
    return;
  }
  const isAdminRole = currentUser.role === 'admin';
  const isManagerRole = currentUser.role === 'manager';
  const avatarBg = isAdminRole ? 'linear-gradient(135deg,#0a5c8a,#062f45)' : (isManagerRole ? 'linear-gradient(135deg,#d97706,#b45309)' : 'linear-gradient(135deg,#0a5c8a,#00c2a8)');
  const avatarIcon = isAdminRole ? '🔧' : (isManagerRole ? '🗂️' : '👤');
  const roleLabel = isAdminRole ? 'مدير النظام' : (isManagerRole ? 'مدير فرعي' : 'عميل');

  const displayName = escHtml(currentUser.name || currentUser.email || 'حسابي');
  const isStaffUser = isStaff();
  const chipClickHandler = isStaffUser ? 'openAccountMenu()' : 'goHome()';
  area.innerHTML = `
    <div class="user-chip" role="button" tabindex="0"
      onclick="${chipClickHandler}"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${chipClickHandler};}">
      <div class="user-avatar" style="background:${avatarBg}">${avatarIcon}</div>
      <div style="min-width:0">
        <div class="user-chip-name">${displayName}</div>
        <div class="user-chip-role">${roleLabel}</div>
      </div>
      <i class="fas fa-chevron-down" style="font-size:10px;color:var(--text-muted);margin-inline-start:2px"></i>
    </div>`;
}

function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('loginIdentifier').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('regError').style.display = 'none';
  document.getElementById('authModal').classList.add('open');
}
function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register')));
  document.getElementById('authLoginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('authRegisterForm').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('authModalTitle').textContent = tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
}
var ADMIN_EMAIL = 'moh.a.alkh@gmail.com';
var ADMIN_CREDENTIALS = { email: ADMIN_EMAIL, role: 'admin', name: 'المدير' };

async function doLogin() {
  const id = document.getElementById('loginIdentifier').value.trim();
  const pass = document.getElementById('loginPassword').value;
  document.getElementById('loginError').style.display = 'none';

  if (!id || !pass) {
    document.getElementById('loginErrorMsg').textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
    document.getElementById('loginError').style.display = 'flex';
    return;
  }

  if (!navigator.onLine) {
    document.getElementById('loginErrorMsg').textContent = '📡 لا يوجد اتصال بالإنترنت، يرجى التحقق من الشبكة والمحاولة مجدداً';
    document.getElementById('loginError').style.display = 'flex';
    return;
  }

  try {
    let signInEmail = id;
    // لو المُدخل مش بريد إلكتروني (ما فيه @)، نعتبره رقم هاتف ونلاقي البريد المرتبط فيه
    if (!id.includes('@')) {
      const matched = await findRegisteredClientByPhone(id);
      if (!matched || !matched.email) {
        document.getElementById('loginErrorMsg').textContent = 'ما لقينا حساب مرتبط بهذا الرقم';
        document.getElementById('loginError').style.display = 'flex';
        return;
      }
      signInEmail = matched.email;
    }
    const cred = await window._fbSignIn(window._auth, signInEmail, pass);
    const fbUser = cred.user;
    const resolved = await resolveUserRole(fbUser);
    loginSuccess({ ...resolved, email: fbUser.email, uid: fbUser.uid });
  } catch(e) {
    console.error('Login error:', e.code || e.message);
    let msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    if (e.code === 'auth/too-many-requests') msg = '⏳ محاولات كثيرة، حاول لاحقاً';
    else if (e.code === 'auth/network-request-failed') msg = '📡 تعذّر الاتصال بالخادم، تحقق من اتصال الإنترنت';
    else if (e.code === 'auth/user-disabled') msg = '🚫 هذا الحساب معطّل، تواصل مع الإدارة';
    else if (e.code === 'auth/invalid-email') msg = 'صيغة البريد الإلكتروني غير صحيحة';
    document.getElementById('loginErrorMsg').textContent = msg;
    document.getElementById('loginError').style.display = 'flex';
  }
}

function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('dentapro_session', JSON.stringify(user));
  closeAuthModal();
  renderAuthHeader();
  loadAndRenderNotifIcon();
  showToast(`👋 أهلاً ${user.name}!`, 'success');
  if (user.role === 'admin' || user.role === 'manager') {
    setTimeout(async () => {
      document.getElementById('adminPanel').classList.add('open');
      applyAdminUIPermissions();
      if (typeof window.loadAdminScriptsOnce === 'function') await window.loadAdminScriptsOnce();
      await ensureAllProductsLoaded();
      if (typeof updateAdminStats === 'function') updateAdminStats();
      if (typeof renderAdminTable === 'function') renderAdminTable();
    }, 400);
  } else {
    showClientWelcome(user);
    renderPointsInHeader();
    logActivity('login');
  }
}

function showClientWelcome(user) {
  const existing = document.getElementById('clientWelcomeBanner');
  if (existing) existing.remove();
  const host = document.getElementById('sessionWelcomeHost') || document.querySelector('.hero-content');
  if (!host) return;
  const banner = document.createElement('div');
  banner.id = 'clientWelcomeBanner';
  banner.className = 'welcome-banner';
  banner.style.marginBottom = '0';
  banner.innerHTML = `
    <i class="fas fa-hand-sparkles"></i>
    <div>
      <div style="font-weight:800;font-size:15px;color:var(--primary-dark)">أهلاً بك ${user.name}!</div>
    </div>`;
  host.appendChild(banner);
}

function detectRegLocation() {
  if (!navigator.geolocation) {
    showToast(t('المتصفح لا يدعم تحديد الموقع','Browser does not support location'), 'error');
    return;
  }
  const statusEl = document.getElementById('regLocationStatus');
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري تحديد موقعك...`;
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      document.getElementById('regLocationLat').value = lat;
      document.getElementById('regLocationLng').value = lng;
      statusEl.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success)"></i>
        <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:var(--primary);text-decoration:underline">عرض الموقع على خرائط جوجل</a>`;
      showToast(t('✅ تم تحديد موقعك بنجاح','✅ Location detected!'), 'success');
    },
    err => {
      statusEl.innerHTML = `<span style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> تعذر تحديد الموقع، حاول مجدداً</span>`;
    }
  );
}

async function doRegister() {
  const firstName = document.getElementById('regFirstName').value.trim();
  const clinic    = document.getElementById('regClinic').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const phone     = document.getElementById('regPhone').value.trim();
  const password  = document.getElementById('regPassword').value;
  const locationText = document.getElementById('regLocationText').value.trim();
  const locationLat  = document.getElementById('regLocationLat').value || null;
  const locationLng  = document.getElementById('regLocationLng').value || null;

  const showRegError = (msg) => {
    document.getElementById('regErrorMsg').textContent = msg;
    document.getElementById('regError').style.display = 'flex';
  };

  const passwordConfirm = document.getElementById('regPasswordConfirm').value;
  if (!firstName || !clinic || !phone || !password) return showRegError('يرجى ملء جميع الحقول المطلوبة');
  if (email && !/\S+@\S+\.\S+/.test(email)) return showRegError('البريد الإلكتروني غير صحيح');
  if (password.length < 8) return showRegError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  if (password !== passwordConfirm) return showRegError('كلمتا المرور غير متطابقتين');

  const { email: finalEmail, isReal: hasRealEmail } = resolveGuestEmail(email, phone);

  try {
    const cred = await window._fbCreateUser(window._auth, finalEmail, password);
    const fbUser = cred.user;

    await window._fbUpdateProfile(fbUser, { displayName: firstName });

    // حفظ بيانات العميل الإضافية في Firestore
    await window._fbSetDoc(
      window._fbDoc2('users', fbUser.uid),
      { firstName, clinic, email: finalEmail, phone, role: 'client', hasRealEmail,
        profileLocationText: locationText, profileLocationLat: locationLat, profileLocationLng: locationLng,
        createdAt: new Date().toISOString() }
    );

    // حفظ محلي أيضاً للتوافق
    const users = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    if (!users.find(u => u.email === finalEmail)) {
      users.push({ firstName, clinic, email: finalEmail, phone, role: 'client', uid: fbUser.uid, hasRealEmail,
        profileLocationText: locationText, profileLocationLat: locationLat, profileLocationLng: locationLng,
        createdAt: Date.now() });
      localStorage.setItem('dentapro_users', JSON.stringify(users));
    }

    document.getElementById('regError').style.display = 'none';
    loginSuccess({ role: 'client', name: firstName, clinic, email: finalEmail, phone, hasRealEmail,
      profileLocationText: locationText, profileLocationLat: locationLat, profileLocationLng: locationLng,
      uid: fbUser.uid });
    logActivity('register');
  } catch(e) {
    console.error('Register error:', e.code);
    let msg = 'حدث خطأ، حاول مرة أخرى';
    if (e.code === 'auth/email-already-in-use') msg = 'هذا البريد مسجل مسبقاً';
    if (e.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة جداً';
    if (e.code === 'auth/invalid-email') msg = 'البريد الإلكتروني غير صحيح';
    showRegError(msg);
  }
}

// تحويل بريد الزائر لبريد داخلي وهمي لو ما أدخل بريد حقيقي — نفس رقم هاتفه كأساس
function resolveGuestEmail(rawEmail, phone) {
  const trimmed = (rawEmail || '').trim();
  if (trimmed && /\S+@\S+\.\S+/.test(trimmed)) return { email: trimmed, isReal: true };
  const digits = (typeof normalizeClientPhone === 'function' ? normalizeClientPhone(phone) : phone.replace(/\D/g,'')) || phone.replace(/\D/g,'');
  return { email: `${digits}@dentapro.local`, isReal: false };
}

// إنشاء حساب عميل حقيقي تلقائياً لزائر جديد وقت الطلب (لا يُستدعى إذا كان مسجّل دخول أو متطابق برقم هاتفه مسبقاً)
async function createGuestAccountIfNeeded(rawEmail, password, passwordConfirm, name, clinic, phone) {
  if (!password || password.length < 8) {
    return { ok: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (password !== passwordConfirm) {
    return { ok: false, message: 'كلمتا المرور غير متطابقتين' };
  }
  const { email, isReal } = resolveGuestEmail(rawEmail, phone);

  try {
    const cred = await window._fbCreateUser(window._auth, email, password);
    const fbUser = cred.user;
    await window._fbUpdateProfile(fbUser, { displayName: name });

    await window._fbSetDoc(
      window._fbDoc2('users', fbUser.uid),
      { firstName: name, clinic, email, phone, role: 'client', hasRealEmail: isReal, createdAt: new Date().toISOString() }
    );

    const users = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    if (!users.find(u => u.email === email)) {
      users.push({ firstName: name, clinic, email, phone, role: 'client', uid: fbUser.uid, hasRealEmail: isReal, createdAt: Date.now() });
      localStorage.setItem('dentapro_users', JSON.stringify(users));
    }

    loginSuccess({ role: 'client', name, clinic, email, phone, uid: fbUser.uid, hasRealEmail: isReal });
    logActivity('register');
    return { ok: true };
  } catch(e) {
    console.error('createGuestAccountIfNeeded error:', e.code);
    let msg = 'تعذر إنشاء الحساب، حاول مرة أخرى';
    if (e.code === 'auth/email-already-in-use') msg = 'هذا البريد مسجل مسبقاً — سجّل دخولك بدل ما تكمل كزائر';
    if (e.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة جداً';
    return { ok: false, message: msg };
  }
}

async function doLogout() {
  try {
    await window._fbSignOut(window._auth);
  } catch(e) { console.warn('Signout error:', e); }
  if (window.storePushLogout) window.storePushLogout();
  currentUser = null;
  if (typeof dpClearCoupon === 'function') dpClearCoupon();
  localStorage.removeItem('dentapro_session');
  renderAuthHeader();
  document.getElementById('notifBtn').style.display = 'none';
  const msgBtn = document.getElementById('msgBtn');
  if (msgBtn) msgBtn.style.display = 'none';
  closeNotifDropdown();
  const banner = document.getElementById('clientWelcomeBanner');
  if (banner) banner.remove();
  showToast('👋 تم تسجيل الخروج', '');
}

async function openAdminDirect() {
  if (!isStaff()) {
    showToast('⛔ غير مصرح لك بالدخول', 'error'); return;
  }
  document.getElementById('adminPanel').classList.add('open');
  applyAdminUIPermissions();
  showToast('🔄 جاري تحميل كل المنتجات...', '');
  if (typeof window.loadAdminScriptsOnce === 'function') await window.loadAdminScriptsOnce();
  await ensureAllProductsLoaded(); // لوحة التحكم تحتاج كل المنتجات (إحصائيات/جدول/بحث دقيق)
  if (typeof updateAdminStats === 'function') updateAdminStats();
  if (typeof renderAdminTable === 'function') renderAdminTable();
}

function togglePassVis(fieldId, icon) {
  const field = document.getElementById(fieldId);
  const isPass = field.type === 'password';
  field.type = isPass ? 'text' : 'password';
  icon.className = `fas fa-${isPass ? 'eye-slash' : 'eye'} input-icon`;
  icon.style.cssText = 'cursor:pointer;pointer-events:all';
}

// استرجاع كلمة المرور — يشتغل بالبريد الإلكتروني حصراً حتى لو العميل كتب رقم هاتفه بخانة الدخول
async function sendPasswordReset() {
  const id = document.getElementById('loginIdentifier').value.trim();
  document.getElementById('loginError').style.display = 'none';
  if (!id) {
    document.getElementById('loginErrorMsg').textContent = 'اكتب بريدك الإلكتروني أو رقم هاتفك بخانة الدخول أولاً';
    document.getElementById('loginError').style.display = 'flex';
    return;
  }

  let resetEmail = id;
  if (!id.includes('@')) {
    const matched = await findRegisteredClientByPhone(id);
    if (!matched || !matched.email || matched.hasRealEmail === false) {
      document.getElementById('loginErrorMsg').textContent = 'استرجاع كلمة المرور يحتاج بريد إلكتروني حقيقي مسجّل — أضفه من صفحة "تعديل الملف" أولاً';
      document.getElementById('loginError').style.display = 'flex';
      return;
    }
    resetEmail = matched.email;
  }

  try {
    await window._fbSendPasswordResetEmail(window._auth, resetEmail);
    showToast('✅ تم إرسال رابط استعادة كلمة المرور لبريدك', 'success');
  } catch(e) {
    document.getElementById('loginErrorMsg').textContent = 'تعذر إرسال رابط الاستعادة، تأكد من صحة البريد/الرقم المدخل';
    document.getElementById('loginError').style.display = 'flex';
  }
}

function checkPassStrength(val) {
  const fill = document.getElementById('passStrengthFill');
  const text = document.getElementById('passStrengthText');
  if (!val) { fill.style.width='0'; text.textContent=''; return; }
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { w:'25%', color:'#e53e3e', label:'ضعيفة' },
    { w:'50%', color:'#f59e0b', label:'مقبولة' },
    { w:'75%', color:'#3b82f6', label:'جيدة' },
    { w:'100%', color:'#22c55e', label:'قوية 💪' },
  ];
  const lvl = levels[score - 1] || levels[0];
  fill.style.width = lvl.w;
  fill.style.background = lvl.color;
  text.textContent = `قوة كلمة المرور: ${lvl.label}`;
  text.style.color = lvl.color;
}
// =====================
