import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { initializeFirestore, persistentLocalCache, collection, addDoc, getDocs, doc, getDoc, getDocFromServer, setDoc, updateDoc, deleteDoc, query, orderBy, where, onSnapshot, limit, startAfter, writeBatch, runTransaction }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
           sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile,
           deleteUser, EmailAuthProvider, reauthenticateWithCredential, updateEmail }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDVVEzXPlfJAD7NSV0tGHzzsx8LiyK2i4w",
    authDomain: "dentapro-db2f6.firebaseapp.com",
    projectId: "dentapro-db2f6",
    storageBucket: "dentapro-db2f6.firebasestorage.app",
    messagingSenderId: "834989089132",
    appId: "1:834989089132:web:91172f8e00c616fa291349",
    measurementId: "G-HTL7R7C59S"
  };

  const app  = initializeApp(firebaseConfig);
  const db   = initializeFirestore(app, {
    localCache: persistentLocalCache()
  });
  const auth = getAuth(app);

  // [DP-READ-MONITOR:BEGIN] ─────────────────────────────────────────────────────────
  // مراقب قراءات Firestore — للاختبار فقط. لا يعمل إلا إذا فُتح المتجر برابط فيه ?debug=1
  // (ويبقى مفعّلاً في نفس التبويب فقط). بدونه تبقى كل الدوال هي نفسها الأصلية بلا أي تغليف.
  // للإزالة لاحقاً: احذف هذه الكتلة كاملة وأعد _getDoc/_getDocs/_getDocFromServer/_onSnap إلى أسمائها الأصلية.
  function dpInstallReadMonitor(raw) {
    const SENSITIVE = new Set(['users','points','orders','quotes','credit_payments','coupon_clients','coupon_targets',
      'coupon_phones','coupon_uses','messages','notifications','fcm_tokens','activity_log','delivery_settings']);
    const maskPath = (p) => {
      const segs = String(p || '').split('/');
      if (segs.length >= 2 && SENSITIVE.has(segs[0]) && !String(segs[1]).startsWith('_')) return segs[0] + '/*';
      return segs.join('/');
    };
    const SS_KEY = 'dp_read_trace';
    let rows = [];
    try { const old = JSON.parse(sessionStorage.getItem(SS_KEY) || '[]'); if (Array.isArray(old)) rows = old; } catch (e) {}
    let ui = null;

    const persist = () => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(rows.slice(-800))); } catch (e) {} };
    const roleNow = () => {
      const r = window._currentRole;
      return r === undefined ? 'unknown' : (r || 'visitor');
    };
    function dpCaller() {
      try {
        const lines = String(new Error().stack || '').split('\n').slice(1);
        const out = [];
        for (const ln of lines) {
          if (/dpW_|dpCaller|dpRec|dpInstallReadMonitor/.test(ln)) continue;
          const m = ln.match(/at (?:async )?([^\s(]+) \((?:.*\/)?([^\/?:)]+)(?:\?[^:)]*)?:(\d+):\d+\)/) ||
                    ln.match(/at (?:async )?()(?:.*\/)?([^\/?:)\s]+)(?:\?[^:)]*)?:(\d+):\d+/) ||
                    ln.match(/^([^@]*)@(?:.*\/)?([^\/?:]+)(?:\?[^:]*)?:(\d+):\d+/);
          if (m) out.push((m[1] || 'anon') + '@' + m[2] + ':' + m[3]);
          if (out.length >= 2) break;
        }
        return out.join(' < ');
      } catch (e) { return ''; }
    }
    function dq(q) {
      try {
        const qq = q && q._query;
        if (!qq) return maskPath(q && q.path) || 'query';
        const f = (qq.filters || []).map(x => ((x.field && x.field.canonicalString) ? x.field.canonicalString() : '?') + ' ' + (x.op || '')).join(', ');
        const ob = (qq.explicitOrderBy || []).map(x => x.field.canonicalString() + ' ' + x.dir).join(', ');
        return maskPath(qq.path.canonicalString()) + (f ? ' [where ' + f + ']' : '') + (ob ? ' [order ' + ob + ']' : '') +
               (qq.limit != null ? ' [limit ' + qq.limit + ']' : '');
      } catch (e) { return 'query'; }
    }
    function rec(row) {
      row.t = Date.now();
      row.role = roleNow();
      rows.push(row);
      if (rows.length > 3000) rows = rows.slice(-2000);
      persist();
      if (ui) ui.refresh();
    }

    function wrapDoc(opName, fn, fromServer) {
      return function dpW_doc(ref, ...rest) {
        const t0 = performance.now();
        const where = dpCaller();
        const label = maskPath(ref && ref.path);
        return fn(ref, ...rest).then(snap => {
          const cache = fromServer ? false : !!(snap.metadata && snap.metadata.fromCache);
          rec({ op: opName, label, where, docs: snap.exists() ? 1 : 0, billed: cache ? 0 : 1, cache, ms: Math.round(performance.now() - t0) });
          return snap;
        }, err => {
          rec({ op: opName, label, where, docs: 0, billed: 0, err: String((err && (err.code || err.message)) || err) });
          throw err;
        });
      };
    }
    function dpW_getDocs(q, ...rest) {
      const t0 = performance.now();
      const where = dpCaller();
      const label = dq(q);
      return raw.getDocs(q, ...rest).then(snap => {
        const cache = !!(snap.metadata && snap.metadata.fromCache);
        rec({ op: 'getDocs', label, where, docs: snap.size, billed: cache ? 0 : Math.max(1, snap.size), cache, ms: Math.round(performance.now() - t0) });
        return snap;
      }, err => {
        rec({ op: 'getDocs', label, where, docs: 0, billed: 0, err: String((err && (err.code || err.message)) || err) });
        throw err;
      });
    }
    function dpW_onSnapshot(q, a, b, ...rest) {
      if (typeof a !== 'function') return raw.onSnapshot(q, a, b, ...rest);
      const label = dq(q);
      const where = dpCaller();
      let serverSeen = false;
      rec({ op: 'listen:start', label, where, docs: 0, billed: 0 });
      const unsub = raw.onSnapshot(q, (snap) => {
        const cache = !!(snap.metadata && snap.metadata.fromCache);
        const ch = snap.docChanges().length;
        let billed = 0;
        if (!cache) { billed = serverSeen ? ch : snap.size; serverSeen = true; }
        rec({ op: 'snapshot', label, where, docs: snap.size, changes: ch, billed, cache, est: true });
        a(snap);
      }, (err) => {
        rec({ op: 'snapshot:error', label, where, docs: 0, billed: 0, err: String((err && (err.code || err.message)) || err) });
        if (typeof b === 'function') b(err);
      }, ...rest);
      return function dpW_unsub() {
        rec({ op: 'listen:stop', label, where, docs: 0, billed: 0 });
        return unsub();
      };
    }

    // ── التقرير: مجموعات حسب الخطوة (بين كل علامتين) ثم حسب (العملية + الاستعلام + المستدعي)
    function report() {
      const steps = [{ name: 'البداية', rows: [] }];
      rows.forEach(r => {
        if (r.op === 'MARK') steps.push({ name: r.label, rows: [] });
        else steps[steps.length - 1].rows.push(r);
      });
      const lines = [];
      let grand = 0, grandDocs = 0, grandCalls = 0;
      lines.push('DP READ TRACE  ' + new Date().toISOString() + '  ' + (document.documentElement.innerHTML.match(/\?v=r\d+/) || ['?v=?'])[0]);
      lines.push('billed* = تقدير القراءات المفوترة (لا يشمل runTransaction/writeBatch). المستمعات تقديرية.');
      steps.forEach(s => {
        if (!s.rows.length && s.name === 'البداية') return;
        const g = {};
        let tb = 0, td = 0, tc = 0;
        s.rows.forEach(r => {
          if (r.op === 'listen:start' || r.op === 'listen:stop') {
            const k = r.op + ' | ' + r.label + ' | ' + r.where;
            g[k] = g[k] || { n: 0, d: 0, b: 0, c: 0, role: r.role };
            g[k].n++;
            return;
          }
          const k = r.op + ' | ' + r.label + ' | ' + r.where + (r.err ? ' | ERR ' + r.err : '');
          g[k] = g[k] || { n: 0, d: 0, b: 0, c: 0, role: r.role };
          g[k].n++; g[k].d += (r.docs || 0); g[k].b += (r.billed || 0); if (r.cache) g[k].c++;
          tb += (r.billed || 0); td += (r.docs || 0); tc++;
        });
        grand += tb; grandDocs += td; grandCalls += tc;
        lines.push('');
        lines.push('== ' + s.name + ' ==  billed*=' + tb + '  docs=' + td + '  calls=' + tc);
        Object.keys(g).sort((x, y) => g[y].b - g[x].b || g[y].d - g[x].d).forEach(k => {
          const v = g[k];
          lines.push('  x' + v.n + '  docs=' + v.d + '  billed*=' + v.b + (v.c ? '  cache=' + v.c : '') + '  [' + v.role + ']  ' + k);
        });
      });
      lines.push('');
      lines.push('المجموع: billed*=' + grand + '  docs=' + grandDocs + '  calls=' + grandCalls);
      return lines.join('\n');
    }
    const total = () => rows.reduce((s, r) => s + (r.billed || 0), 0);
    function mark(name) { rec({ op: 'MARK', label: String(name || 'خطوة'), docs: 0, billed: 0 }); }
    function reset() { rows = []; persist(); if (ui) ui.refresh(); }

    // ── واجهة صغيرة (شارة عائمة + لوحة)
    function mountUI() {
      if (!document.body || document.getElementById('dpReadsBadge')) return;
      const badge = document.createElement('button');
      badge.id = 'dpReadsBadge';
      badge.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:2147483000;background:#111;color:#0f0;border:1px solid #0f0;' +
        'border-radius:18px;padding:6px 10px;font:12px/1.2 monospace;opacity:.92;direction:ltr';
      const panel = document.createElement('div');
      panel.id = 'dpReadsPanel';
      panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:62vh;z-index:2147483001;background:#0b0b0b;color:#ddd;display:none;' +
        'flex-direction:column;border-top:2px solid #0f0;direction:rtl';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:6px;padding:6px;flex-wrap:wrap';
      const pre = document.createElement('pre');
      pre.style.cssText = 'flex:1;overflow:auto;margin:0;padding:6px;font:10px/1.35 monospace;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-all';
      const mkBtn = (txt, fn) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.style.cssText = 'background:#222;color:#fff;border:1px solid #555;border-radius:8px;padding:6px 10px;font:13px sans-serif';
        b.onclick = fn;
        bar.appendChild(b);
        return b;
      };
      let stepN = 0;
      mkBtn('علّم خطوة', () => { stepN++; const n = window.prompt('اسم الخطوة', 'خطوة ' + stepN); if (n !== null) mark(n || ('خطوة ' + stepN)); });
      mkBtn('صفّر', () => { if (window.confirm('تصفير العداد؟')) reset(); });
      mkBtn('انسخ التقرير', async () => {
        const txt = report();
        try { await navigator.clipboard.writeText(txt); window.alert('تم النسخ'); }
        catch (e) { pre.textContent = txt; window.getSelection && window.getSelection().selectAllChildren(pre); window.alert('انسخ النص يدوياً'); }
      });
      mkBtn('إغلاق', () => { panel.style.display = 'none'; });
      panel.appendChild(bar); panel.appendChild(pre);
      badge.onclick = () => { panel.style.display = 'flex'; pre.textContent = report(); };
      document.body.appendChild(badge); document.body.appendChild(panel);
      ui = {
        refresh() {
          badge.textContent = '📊 ' + total();
          if (panel.style.display !== 'none') pre.textContent = report();
        }
      };
      ui.refresh();
    }
    if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI, { once: true });

    window.dpReads = { rows: () => rows, mark, reset, report, total };
    console.log('📊 مراقب القراءات مفعّل (?debug=1)');
    return {
      getDoc: wrapDoc('getDoc', raw.getDoc, false),
      getDocFromServer: wrapDoc('getDocFromServer', raw.getDocFromServer, true),
      getDocs: dpW_getDocs,
      onSnapshot: dpW_onSnapshot
    };
  }

  let _getDoc = getDoc, _getDocs = getDocs, _getDocFromServer = getDocFromServer, _onSnap = onSnapshot;
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') sessionStorage.setItem('dp_debug', '1');
    if (sessionStorage.getItem('dp_debug') === '1') {
      const w = dpInstallReadMonitor({ getDoc, getDocs, getDocFromServer, onSnapshot });
      _getDoc = w.getDoc; _getDocs = w.getDocs; _getDocFromServer = w.getDocFromServer; _onSnap = w.onSnapshot;
    }
  } catch (e) { console.warn('⚠️ تعذّر تفعيل مراقب القراءات:', e && e.message); }
  // [DP-READ-MONITOR:END] ───────────────────────────────────────────────────────────


  window._auth            = auth;
  window._fbCreateUser    = createUserWithEmailAndPassword;
  window._fbSignIn        = signInWithEmailAndPassword;
  window._fbSendPasswordResetEmail = sendPasswordResetEmail;
  window._fbSignOut       = signOut;
  window._fbAuthState     = onAuthStateChanged;
  window._fbUpdateProfile = updateProfile;
  window._fbDeleteUser        = deleteUser;
  window._fbEmailAuthProvider = EmailAuthProvider;
  window._fbReauthenticate    = reauthenticateWithCredential;
window._fbUpdateEmail       = updateEmail;
  // إعداد Firebase Cloud Messaging بعد اكتمال الواجهة؛ مكتبة Messaging كبيرة
  // ولا يحتاجها معظم الزوار في لحظة الرسم الأولى.
  const FCM_VAPID_KEY = "BEOJcmas6Rpa_BT3UXB4d3Sjx9dNuAa4-N6s7Fm2MsjCoHudMD46W3wWEzZmUSapX4DSuN7Tt6QLtAxBBW91CPw";
  window._fcmGetTokenFn = null;
  const initMessaging = async () => {
    try {
      const { getMessaging, getToken, onMessage, isSupported } =
        await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js");
      if (!await isSupported()) { console.warn('⚠️ هذا المتصفح لا يدعم Firebase Messaging'); return; }
      const messaging = getMessaging(app);
      window._fcmMessaging = messaging;
      window._fcmGetTokenFn = async (swRegistration) => {
        try {
          return await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: swRegistration });
        } catch(e) {
          console.warn('⚠️ فشل جلب FCM token:', e.message);
          return null;
        }
      };
      onMessage(messaging, (payload) => {
        // إشعار يصل والموقع مفتوح فعلياً بالمقدمة — نعرضه كـ toast بدل إشعار نظام مكرر
        if (typeof window._onForegroundFCMMessage === 'function') {
          window._onForegroundFCMMessage(payload);
        }
      });
    } catch(e) { console.warn('⚠️ تعذّر تحميل Firebase Messaging:', e.message); }
  };
  (window.requestIdleCallback || ((cb) => setTimeout(cb, 1800)))(initMessaging, { timeout: 4000 });

  window._db           = db;
  window._fbGetDoc     = _getDoc;
  window._fbSetDoc     = setDoc;
window._fbGetDocFromServer = _getDocFromServer;
  window._fbDeleteDoc  = deleteDoc;
  window._fbDoc2       = (col, id) => doc(db, col, id);
  window._fbCollection = collection;
  window._fbOrdersRef  = () => collection(db, 'orders');
  window._fbAddDoc     = addDoc;
  window._fbGetDocs    = _getDocs;
  window._fbDoc        = (id) => doc(db, 'orders', id);
  window._fbUpdateDoc  = updateDoc;
  window._fbQuery      = query;
  window._fbOrderBy    = orderBy;
  window._fbWhere      = where;
  window._fbOnSnapshot = _onSnap;
  window._fbLimit      = limit;
  window._fbStartAfter = startAfter;
  window._fbWriteBatch = () => writeBatch(db);
  window._fbIsOnline   = () => navigator.onLine;
  window._fbRunTransaction = (updateFn) => runTransaction(db, updateFn);

  // Cloud Function لإنشاء الطلب من الخادم (السعر/الخصم/المخزون تُحسب هناك)
  // معطّلة افتراضياً (SERVER_ORDER_CREATION_ENABLED = false) لحد ما تُنشر الدالة فعلياً على Blaze
  window._fbCreateOrderFn = null;
  if (window.SERVER_ORDER_CREATION_ENABLED === true) {
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js")
      .then(({ getFunctions, httpsCallable }) => {
        window._fbCreateOrderFn = httpsCallable(getFunctions(app), 'createOrder');
      })
      .catch(e => console.warn('⚠️ تعذّر تحميل Firebase Functions:', e.message));
  }

  // التخزين المحلي مُفعَّل تلقائياً عبر persistentLocalCache() في إعداد Firestore

  let _ordersUnsub = null;
  let _messagesUnsub = null;
  let _notifsUnsub = [];

  window.addEventListener('load', () => {
    onAuthStateChanged(auth, async (fbUser) => {
      if (_ordersUnsub)   { _ordersUnsub();   _ordersUnsub = null; }
      if (_messagesUnsub) { _messagesUnsub(); _messagesUnsub = null; }
      if (_notifsUnsub.length) { _notifsUnsub.forEach(u => u()); _notifsUnsub = []; }
      if (!fbUser) { window._currentRole = null; return; }
      try {
        // استخدام نفس نتيجة الصلاحية اللي جابها auth-ui.js (لو جاهزة) بدل قراءة Firestore مرة ثانية
        let role = 'customer';
        if (typeof window.resolveUserRole === 'function') {
          try {
            const resolved = await window.resolveUserRole(fbUser);
            role = resolved.role || 'customer';
          } catch(roleErr) {
            console.warn('⚠️ تعذّر جلب صلاحية المستخدم عبر resolveUserRole:', roleErr.message);
          }
        } else if (fbUser.email === 'moh.a.alkh@gmail.com') {
          role = 'admin';
        } else {
          try {
            const uSnap = await _getDoc(doc(db, 'users', fbUser.uid));
            if (uSnap.exists() && uSnap.data().role) role = uSnap.data().role;
          } catch(roleErr) {
            console.warn('⚠️ تعذّر جلب صلاحية المستخدم من Firestore:', roleErr.message);
          }
        }
        window._currentRole = role;
        const isStaffUser = (role === 'admin' || role === 'manager');
        // تحميل كود لوحة الإدارة (admin/products.js وأخواتها) فقط الآن، بعد تأكيد الدور فعلياً
        if (isStaffUser && typeof window.loadAdminScriptsOnce === 'function') {
          window.loadAdminScriptsOnce();
        }
        // تحديد عدد الطلبات المراقَبة لحظياً لتفادي تجميد الصفحة عند تراكم آلاف الطلبات
        const q = isStaffUser
          ? query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50))
          : query(collection(db, 'orders'), where('clientEmail', '==', fbUser.email));
        // debounce: onSnapshot قد يطلق عدة أحداث متتالية بسرعة (من الكاش ثم من السيرفر)،
        // فبدل ما نعيد رسم القوائم الثقيلة في كل مرة، ننتظر لحظة قصيرة وننفّذ آخر تحديث فقط
        let _ordersSnapDebounce = null;
        _ordersUnsub = _onSnap(q, (snap) => {
          const pending = snap.docs.filter(d => !['delivered','cancelled'].includes(d.data().status)).length;
          const badge = document.getElementById('adminOrdersBadge');
          if (badge) badge.textContent = pending > 0 ? pending : '';

          clearTimeout(_ordersSnapDebounce);
          _ordersSnapDebounce = setTimeout(() => {
            const adminOpen  = document.getElementById('adminPanel')?.classList.contains('open');
            const ordersOpen = document.getElementById('ordersPage')?.classList.contains('active');
            if (adminOpen  && typeof renderAdminOrders  === 'function') renderAdminOrders();
            if (ordersOpen && typeof renderClientOrders === 'function') renderClientOrders();
          }, 300);
        }, (err) => console.warn('⚠️ مراقبة الطلبات:', err.message));

        // مراقبة الرسائل لحظياً (لتحديث شارة الإشعار فوراً)
        const msgsQ = isStaffUser
          ? collection(db, 'messages')
          : query(collection(db, 'messages'), where('clientEmail', 'in', [fbUser.email, 'broadcast']));
        _messagesUnsub = _onSnap(msgsQ, () => {
          if (typeof window._onMessagesUpdate === 'function') window._onMessagesUpdate();
        }, (err) => console.warn('⚠️ مراقبة الرسائل:', err.message));

        // مراقبة جرس الإشعارات لحظياً (طلب جديد / تغيير حالة / منتج جديد)
        _notifsUnsub.forEach(u => u());
        _notifsUnsub = [];
        // نراقب أحدث N إشعاراً فقط (بدل المجموعة كاملة) لتقليل القراءات.
        // يحتاج فهرساً مركباً (الحقل + createdAt)؛ إن لم يكن منشأً بعد نرجع للاستعلام القديم مؤقتاً.
        const watchNotifs = (field, value, n) => {
          const notify = () => { if (typeof window._onNotificationsUpdate === 'function') window._onNotificationsUpdate(); };
          const slot = _notifsUnsub.length;
          const limited = query(collection(db, 'notifications'), where(field, '==', value), orderBy('createdAt', 'desc'), limit(n));
          _notifsUnsub.push(_onSnap(limited, notify, (err) => {
            console.warn('⚠️ مراقبة الإشعارات:', err.message);
            if (err && err.code === 'failed-precondition' && auth.currentUser && auth.currentUser.uid === fbUser.uid) {
              _notifsUnsub[slot] = _onSnap(query(collection(db, 'notifications'), where(field, '==', value)), notify,
                (err2) => console.warn('⚠️ مراقبة الإشعارات:', err2.message));
            }
          }));
        };
        if (isStaffUser) {
          watchNotifs('scope', 'admin', 20);
        } else {
          watchNotifs('targetEmail', fbUser.email, 5);
          watchNotifs('scope', 'broadcast', 5);
        }
      } catch(e) { console.warn('Listener:', e); }
    });
  });

  // بعد اكتمال تحميل كود لوحة الإدارة (admin/products.js وأخواتها)، نعيد رسم أي واجهة
  // إدارية كانت قد فُتحت أو طُلبت قبل اكتمال التحميل (نادراً ما يحدث، لكن ممكن على شبكة بطيئة)
  document.addEventListener('dp:admin-scripts-ready', () => {
    const adminOpen  = document.getElementById('adminPanel')?.classList.contains('open');
    const ordersOpen = document.getElementById('ordersPage')?.classList.contains('active');
    if (adminOpen  && typeof window.renderAdminOrders  === 'function') window.renderAdminOrders();
    if (ordersOpen && typeof window.renderClientOrders === 'function') window.renderClientOrders();
    if (typeof window.renderPointsInHeader === 'function') window.renderPointsInHeader();
  });
