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
  window._fbGetDoc     = getDoc;
  window._fbSetDoc     = setDoc;
window._fbGetDocFromServer = getDocFromServer;
  window._fbDeleteDoc  = deleteDoc;
  window._fbDoc2       = (col, id) => doc(db, col, id);
  window._fbCollection = collection;
  window._fbOrdersRef  = () => collection(db, 'orders');
  window._fbAddDoc     = addDoc;
  window._fbGetDocs    = getDocs;
  window._fbDoc        = (id) => doc(db, 'orders', id);
  window._fbUpdateDoc  = updateDoc;
  window._fbQuery      = query;
  window._fbOrderBy    = orderBy;
  window._fbWhere      = where;
  window._fbOnSnapshot = onSnapshot;
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
            const uSnap = await getDoc(doc(db, 'users', fbUser.uid));
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
        _ordersUnsub = onSnapshot(q, (snap) => {
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
        _messagesUnsub = onSnapshot(msgsQ, () => {
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
          _notifsUnsub.push(onSnapshot(limited, notify, (err) => {
            console.warn('⚠️ مراقبة الإشعارات:', err.message);
            if (err && err.code === 'failed-precondition' && auth.currentUser && auth.currentUser.uid === fbUser.uid) {
              _notifsUnsub[slot] = onSnapshot(query(collection(db, 'notifications'), where(field, '==', value)), notify,
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
