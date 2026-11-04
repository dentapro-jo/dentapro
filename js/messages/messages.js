// DentaPro domain module: extracted from the original implementation.
// =====================
// MESSAGING SYSTEM (Admin ↔ Clients)
// =====================
function messagesRef() {
  return window._fbCollection(window._db, 'messages');
}

async function sendAdminMessage(clientEmail, text, imageUrl = null) {
  const msg = {
    clientEmail,
    fromRole: 'admin',
    fromName: 'فريق DentaPro',
    text: text || '',
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString(),
  };
  await window._fbAddDoc(messagesRef(), msg);

  const previewMsg = text ? (text.length > 60 ? text.slice(0,60)+'…' : text) : '📷 صورة';
  if (clientEmail === 'broadcast') {
    await createNotification({
      scope: 'broadcast',
      icon: imageUrl ? '📷' : '📢',
      title: 'رسالة من إدارة DentaPro',
      message: previewMsg,
      link: 'page:messages',
    });
  } else {
    await createNotification({
      scope: 'client',
      targetEmail: clientEmail,
      icon: imageUrl ? '📷' : '💬',
      title: 'رد جديد من الإدارة',
      message: previewMsg,
      link: 'page:messages',
    });
  }
}

async function sendClientMessage(text, imageUrl = null) {
  if (!currentUser) return;
  const msg = {
    clientEmail: currentUser.email,
    fromRole: 'client',
    fromName: currentUser.name || currentUser.email,
    text: text || '',
    imageUrl: imageUrl || null,
    createdAt: new Date().toISOString(),
  };
  await window._fbAddDoc(messagesRef(), msg);
  const previewMsg = text ? (text.length>60?text.slice(0,60)+'…':text) : '📷 صورة';
  await createNotification({
    scope: 'admin',
    icon: imageUrl ? '📷' : '💬',
    title: 'استفسار جديد من عميل',
    message: `${currentUser.name || currentUser.email}: ${previewMsg}`,
    link: `clientmsg:${currentUser.email}`,
  });
}

async function getClientMessageThread(email) {
  try {
    for (let i = 0; i < 20; i++) {
      if (window._fbQuery && window._fbWhere && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 200));
    }
    const qMine = window._fbQuery(messagesRef(), window._fbWhere('clientEmail','==', email));
    const qBroadcast = window._fbQuery(messagesRef(), window._fbWhere('clientEmail','==','broadcast'));
    const [s1, s2] = await Promise.all([window._fbGetDocs(qMine), window._fbGetDocs(qBroadcast)]);
    const list = [
      ...s1.docs.map(d => ({_docId:d.id, ...d.data()})),
      ...s2.docs.map(d => ({_docId:d.id, ...d.data()})),
    ];
    list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    return list;
  } catch(e) {
    console.warn('getClientMessageThread:', e.message);
    return [];
  }
}

async function getAllMessageThreadsForAdmin() {
  try {
    const snap = await window._fbGetDocs(messagesRef());
    const all = snap.docs.map(d => ({_docId:d.id, ...d.data()}));
    const grouped = {};
    const broadcastMsgs = [];
    all.forEach(m => {
      if (m.clientEmail === 'broadcast') { broadcastMsgs.push(m); return; }
      if (!grouped[m.clientEmail]) grouped[m.clientEmail] = [];
      grouped[m.clientEmail].push(m);
    });

    if (broadcastMsgs.length) {
      // ندمج رسائل البث بمحادثة كل عميل له تاريخ رسائل موجود أصلاً
      Object.keys(grouped).forEach(email => {
        broadcastMsgs.forEach(bm => grouped[email].push({ ...bm, clientEmail: email }));
      });

      // وننشئ محادثة لأي عميل مسجّل ما تواصل معه الإدمن أبداً بشكل فردي،
      // بس استقبل رسائل بث بس — حتى يظهر بقائمة المحادثات أصلاً
      try {
        const allUsers = await fetchAllUsersList();
        allUsers.filter(u => u.role === 'client' && u.email).forEach(u => {
          if (!grouped[u.email]) {
            grouped[u.email] = broadcastMsgs.map(bm => ({ ...bm, clientEmail: u.email }));
          }
        });
      } catch (e) {
        console.warn('getAllMessageThreadsForAdmin: fetchAllUsersList failed:', e.message);
      }
    }

    Object.values(grouped).forEach(arr => arr.sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt)));
    return grouped;
  } catch(e) {
    console.warn('getAllMessageThreadsForAdmin:', e.message);
    return {};
  }
}

function openClientMessages() {
  if (!currentUser) { openAuthModal('login'); return; }
  showPage('messages');
}

async function renderClientMessagesThread() {
  const wrap = document.getElementById('clientMessagesThread');
  wrap.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px">
    <div class="spinner" style="margin:0 auto 10px;width:24px;height:24px;border-width:3px"></div>جاري التحميل...</div>`;
  const thread = await getClientMessageThread(currentUser.email);
  window._cachedClientThread = thread;
  if (!thread.length) {
    wrap.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:32px">
      <i class="fas fa-comments" style="font-size:40px;opacity:0.2;display:block;margin-bottom:10px"></i>
      لا توجد رسائل بعد، ابدأ بكتابة استفسارك بالأسفل</div>`;
    return;
  }
  wrap.innerHTML = thread.map(m => {
    const isAdmin = m.fromRole === 'admin';
    const time = timeAgo(m.createdAt);
    const imgHtml = m.imageUrl ? `<img src="${escHtml(cldOptimize(m.imageUrl,320))}" loading="lazy" onclick="window.open('${escJsAttr(m.imageUrl)}','_blank')"
      style="max-width:220px;max-height:220px;border-radius:10px;cursor:pointer;display:block;${m.text?'margin-bottom:6px':''}">` : '';
    return `
    <div style="display:flex;justify-content:${isAdmin?'flex-start':'flex-end'}">
      <div style="max-width:75%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.6;
        background:${isAdmin?'#f0f8ff':'linear-gradient(135deg,var(--primary),var(--primary-light))'};
        color:${isAdmin?'var(--text)':'#fff'}">
        ${isAdmin?`<div style="font-weight:800;font-size:11px;margin-bottom:4px;color:var(--primary)">${m.clientEmail==='broadcast'?'📢 ':''}${escHtml(m.fromName)}</div>`:''}
        ${imgHtml}
        ${m.text ? `<div>${escHtml(m.text)}</div>` : ''}
        <div style="font-size:10px;opacity:0.7;margin-top:4px;text-align:left">${time}</div>
      </div>
    </div>`;
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;

  // تعليم آخر رسالة كمقروءة فقط الآن (بعد فتح الصفحة فعلياً)
  markClientMsgRead(currentUser.email, thread[thread.length - 1].createdAt);
  updateClientMsgBadge();
}

// ── إرفاق صورة في رسائل العميل ──
let clientChatPendingImage = null;
function handleClientChatImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  clientChatPendingImage = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('clientChatImgPreview').src = e.target.result;
    document.getElementById('clientChatImgPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}
function clearClientChatImage() {
  clientChatPendingImage = null;
  const fileInput = document.getElementById('clientChatImgFile');
  const wrap = document.getElementById('clientChatImgPreviewWrap');
  if (fileInput) fileInput.value = '';
  if (wrap) wrap.style.display = 'none';
}

async function sendClientMessageFromInput() {
  const input = document.getElementById('clientMsgInput');
  const text = input.value.trim();
  if (!text && !clientChatPendingImage) return;

  let imageUrl = null;
  if (clientChatPendingImage) {
    showToast('⏳ جاري رفع الصورة...', '');
    try {
      imageUrl = await uploadToCloudinary(clientChatPendingImage, 'dentapro_customer_uploads');
    } catch(e) {
      showToast('❌ فشل رفع الصورة: ' + e.message, 'error');
      return;
    }
  }

  input.value = '';
  clearClientChatImage();
  await sendClientMessage(text, imageUrl);
  showToast('✅ تم إرسال رسالتك', 'success');
  renderClientMessagesThread();
}

async function renderAdminMessages() {
  const container = document.getElementById('adminMessagesList');
  container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">
    <div class="spinner" style="margin:0 auto 12px;width:28px;height:28px;border-width:4px"></div>جاري التحميل...</div>`;
  const grouped = await getAllMessageThreadsForAdmin();
  window._cachedAdminThreads = grouped;
  // ترتيب المحادثات حسب وقت آخر رسالة فيها (الأحدث أولاً)
  const emails = Object.keys(grouped).sort((a, b) => {
    const lastA = grouped[a][grouped[a].length - 1];
    const lastB = grouped[b][grouped[b].length - 1];
    return new Date(lastB.createdAt) - new Date(lastA.createdAt);
  });

  const unreadClients = emails.filter(e => {
    const last = grouped[e][grouped[e].length-1];
    return last.fromRole === 'client' && !isThreadRead(e, last.createdAt);
  }).length;
  const badge = document.getElementById('adminMsgBadge');
  if (badge) badge.textContent = unreadClients > 0 ? unreadClients : '';
  const headerBadge = document.getElementById('msgBadge');
  if (headerBadge) {
    headerBadge.style.display = unreadClients > 0 ? 'flex' : 'none';
    headerBadge.textContent = unreadClients > 9 ? '9+' : unreadClients;
  }

  if (!emails.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <i class="fas fa-comments" style="font-size:48px;opacity:0.2;display:block;margin-bottom:16px"></i>
      لا توجد رسائل من العملاء بعد</div>`;
    return;
  }
  container.innerHTML = emails.map(email => {
    const arr = grouped[email];
    const last = arr[arr.length-1];
    const clientName = arr.find(m=>m.fromRole==='client')?.fromName || email;
    return `
    <div class="points-admin-card" style="cursor:pointer" data-email="${escHtml(email)}" onclick="openAdminThreadModal(this.dataset.email)">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
        <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));
          display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;flex-shrink:0">${escHtml(clientName).charAt(0)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14px;color:var(--primary-dark)">${escHtml(clientName)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${escHtml(email)}</div>
          <div style="font-size:12px;color:var(--text);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px">
            ${last.fromRole==='admin'?'<i class="fas fa-reply" style="color:var(--text-muted)"></i> ':''}${escHtml(last.text)}
          </div>
        </div>
      </div>
      <span style="font-size:11px;color:var(--text-muted)">${timeAgo(last.createdAt)}</span>
    </div>`;
  }).join('');
}

function openAdminThreadModal(email) {
  email = email.trim(); // تنظيف إضافي
  window._openAdminThreadEmail = email; // لتحديث نفس المحادثة تلقائياً لما توصل رسالة جديدة
  const existing = document.getElementById('adminThreadModal');
  if (existing) existing.remove();
  const thread = (window._cachedAdminThreads || {})[email] || [];
  const clientName = thread.find(m=>m.fromRole==='client')?.fromName || email;
  const modal = document.createElement('div');
  modal.id = 'adminThreadModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '4000';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary))">
        <div class="modal-title"><i class="fas fa-comments"></i> محادثة مع ${escHtml(clientName)}</div>
        <button class="close-btn" onclick="window._openAdminThreadEmail=null;document.getElementById('adminThreadModal').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div id="adminThreadBody" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;margin-bottom:14px;padding:6px"></div>
        <div id="adminChatImgPreviewWrap" style="display:none;margin-bottom:10px;position:relative;width:fit-content">
          <img id="adminChatImgPreview" style="max-width:120px;max-height:120px;border-radius:10px;border:2px solid var(--border);display:block">
          <button onclick="clearAdminChatImage()" style="position:absolute;top:-8px;left:-8px;width:22px;height:22px;border-radius:50%;background:var(--danger);color:#fff;border:none;cursor:pointer;font-size:11px">✕</button>
        </div>
        <div style="display:flex;gap:10px">
          <input type="file" id="adminChatImgFile" accept="image/*" style="display:none" onchange="handleAdminChatImageSelect(event)">
          <button onclick="document.getElementById('adminChatImgFile').click()" title="إرفاق صورة"
            style="width:44px;height:44px;border-radius:50%;background:#f0f8ff;color:var(--primary);border:2px solid var(--border);cursor:pointer;flex-shrink:0">
            <i class="fas fa-paperclip"></i>
          </button>
          <input type="text" class="form-input" id="adminThreadInput" placeholder="اكتب ردك هنا..."
            onkeydown="if(event.key==='Enter'){event.preventDefault();sendAdminThreadReply('${escJsAttr(email)}')}">
          <button class="btn-primary" style="padding:0 24px;flex-shrink:0" onclick="sendAdminThreadReply('${escJsAttr(email)}')">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  clearAdminChatImage();
  renderAdminThreadBody(thread);
  if (thread.length) {
    markThreadRead(email, thread[thread.length - 1].createdAt);
    updateHeaderMsgBadge();
  }
}

function renderAdminThreadBody(thread) {
  const body = document.getElementById('adminThreadBody');
  if (!body) return;
  body.innerHTML = thread.map(m => {
    const isAdmin = m.fromRole === 'admin';
    const imgHtml = m.imageUrl ? `<img src="${escHtml(cldOptimize(m.imageUrl,320))}" loading="lazy" onclick="window.open('${escJsAttr(m.imageUrl)}','_blank')"
      style="max-width:220px;max-height:220px;border-radius:10px;cursor:pointer;display:block;${m.text?'margin-bottom:6px':''}">` : '';
    return `
    <div style="display:flex;justify-content:${isAdmin?'flex-end':'flex-start'}">
      <div style="max-width:75%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.6;
        background:${isAdmin?'linear-gradient(135deg,var(--primary),var(--primary-light))':'#f0f8ff'};
        color:${isAdmin?'#fff':'var(--text)'}">
        ${imgHtml}
        ${m.text ? `<div>${escHtml(m.text)}</div>` : ''}
        <div style="font-size:10px;opacity:0.7;margin-top:4px;text-align:left">${timeAgo(m.createdAt)}</div>
      </div>
    </div>`;
  }).join('');
  body.scrollTop = body.scrollHeight;
}

// ── إرفاق صورة في ردود الأدمن ──
let adminChatPendingImage = null;
function handleAdminChatImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  adminChatPendingImage = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('adminChatImgPreview').src = e.target.result;
    document.getElementById('adminChatImgPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}
function clearAdminChatImage() {
  adminChatPendingImage = null;
  const fileInput = document.getElementById('adminChatImgFile');
  const wrap = document.getElementById('adminChatImgPreviewWrap');
  if (fileInput) fileInput.value = '';
  if (wrap) wrap.style.display = 'none';
}

async function sendAdminThreadReply(email) {
  const input = document.getElementById('adminThreadInput');
  const text = input.value.trim();
  if (!text && !adminChatPendingImage) return;

  let imageUrl = null;
  if (adminChatPendingImage) {
    showToast('⏳ جاري رفع الصورة...', '');
    try {
      imageUrl = await uploadToCloudinary(adminChatPendingImage, 'dentapro_customer_uploads');
    } catch(e) {
      showToast('❌ فشل رفع الصورة: ' + e.message, 'error');
      return;
    }
  }

  input.value = '';
  clearAdminChatImage();
  await sendAdminMessage(email, text, imageUrl);
  // ما نحدّث المحادثة يدوياً هون — المستمع اللحظي (onSnapshot) رح يحدّثها
  // تلقائياً بمجرد ما الرسالة توصل فعلياً لقاعدة البيانات، لتفادي ظهورها مرتين
  showToast('✅ تم إرسال الرد', 'success');
}

let broadcastSelectedClients = [];

async function getAllClientsList() {
  try {
    for (let i = 0; i < 20; i++) {
      if (window._fbCollection && window._fbGetDocs) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const usersSnap = await window._fbGetDocs(window._fbCollection(window._db, 'users'));
    let users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.role === 'client');
    const localUsers = JSON.parse(localStorage.getItem('dentapro_users') || '[]');
    localUsers.forEach(lu => { if (!users.find(u => u.email === lu.email)) users.push(lu); });
    return users;
  } catch(e) {
    console.warn('getAllClientsList:', e.message);
    return [];
  }
}

async function openBroadcastMessageModal() {
  const existing = document.getElementById('broadcastMsgModal');
  if (existing) existing.remove();
  broadcastSelectedClients = [];
  window._broadcastMode = 'all';
  const modal = document.createElement('div');
  modal.id = 'broadcastMsgModal';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '4000';
  modal.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-header" style="background:linear-gradient(135deg,var(--primary-dark),var(--primary))">
        <div class="modal-title"><i class="fas fa-bullhorn"></i> إرسال رسالة للعملاء</div>
        <button class="close-btn" onclick="document.getElementById('broadcastMsgModal').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="auth-tabs" style="margin-bottom:18px">
          <button class="auth-tab active" id="bcTabAll" onclick="switchBroadcastMode('all')">
            <i class="fas fa-users"></i> جميع العملاء
          </button>
          <button class="auth-tab" id="bcTabSelect" onclick="switchBroadcastMode('select')">
            <i class="fas fa-user-check"></i> تحديد عملاء
          </button>
        </div>

        <div id="bcSelectWrap" style="display:none;margin-bottom:16px">
          <input type="text" class="form-input" id="bcClientSearch"
            placeholder="🔍 ابحث بالاسم أو البريد أو العيادة..." oninput="renderBroadcastClientList()">
          <div id="bcSelectedChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"></div>
          <div id="bcClientList" style="margin-top:10px;max-height:220px;overflow-y:auto;
               border:1px solid var(--border);border-radius:12px"></div>
        </div>

        <div class="form-group">
          <label class="form-label">نص الرسالة <span class="required">*</span></label>
          <textarea class="form-textarea" id="broadcastMsgText"
            placeholder="مثال: لدينا عرض خاص هذا الأسبوع على مواد التعقيم 🎉"></textarea>
        </div>
        <div id="broadcastError" style="display:none;color:var(--danger);font-size:13px;font-weight:700;
             padding:10px;background:#fff5f5;border-radius:8px">
          <i class="fas fa-exclamation-circle"></i> <span id="broadcastErrorMsg">يرجى كتابة نص الرسالة</span>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn-back" onclick="document.getElementById('broadcastMsgModal').remove()">إلغاء</button>
        <button class="btn-submit" onclick="sendBroadcastMessage()"><i class="fas fa-paper-plane"></i> إرسال</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  window._allClientsCache = await getAllClientsList();
}

function switchBroadcastMode(mode) {
  window._broadcastMode = mode;
  document.getElementById('bcTabAll').classList.toggle('active', mode === 'all');
  document.getElementById('bcTabSelect').classList.toggle('active', mode === 'select');
  document.getElementById('bcSelectWrap').style.display = mode === 'select' ? 'block' : 'none';
  if (mode === 'select') renderBroadcastClientList();
}

function renderBroadcastClientList() {
  const term = normalizeArabic(document.getElementById('bcClientSearch').value);
  const list = (window._allClientsCache || []).filter(u => {
    if (!term) return true;
    return normalizeArabic(u.firstName || u.name || '').includes(term) ||
           normalizeArabic(u.clinic || '').includes(term) ||
           (u.email || '').toLowerCase().includes(term);
  });
  const listEl = document.getElementById('bcClientList');
  if (!list.length) {
    listEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">لا يوجد عملاء مطابقون</div>`;
  } else {
    listEl.innerHTML = list.map(u => {
      const checked = broadcastSelectedClients.includes(u.email);
      return `
      <div onclick="toggleBroadcastClient('${escJsAttr(u.email)}')"
        style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
               border-bottom:1px solid #f0f4f8;${checked ? 'background:#f0f8ff' : ''}">
        <input type="checkbox" ${checked ? 'checked' : ''} style="pointer-events:none">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${escHtml(u.firstName || u.name || 'عميل')}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escHtml(u.clinic || '')} · ${escHtml(u.email)}</div>
        </div>
      </div>`;
    }).join('');
  }
  renderBroadcastChips();
}

function toggleBroadcastClient(email) {
  if (broadcastSelectedClients.includes(email)) {
    broadcastSelectedClients = broadcastSelectedClients.filter(e => e !== email);
  } else {
    broadcastSelectedClients.push(email);
  }
  renderBroadcastClientList();
}

function renderBroadcastChips() {
  const wrap = document.getElementById('bcSelectedChips');
  if (!wrap) return;
  if (!broadcastSelectedClients.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = broadcastSelectedClients.map(email => {
    const u = (window._allClientsCache || []).find(x => x.email === email);
    const name = u ? (u.firstName || u.name || email) : email;
    return `<span style="display:flex;align-items:center;gap:6px;background:#f0f8ff;border:1.5px solid var(--border);
      border-radius:50px;padding:4px 10px;font-size:12px;font-weight:700">
      ${escHtml(name)}
      <i class="fas fa-times-circle" style="cursor:pointer;color:var(--danger)"
        onclick="event.stopPropagation();toggleBroadcastClient('${escJsAttr(email)}');renderBroadcastClientList()"></i>
    </span>`;
  }).join('');
}

async function sendBroadcastMessage() {
  const text = document.getElementById('broadcastMsgText').value.trim();
  const showErr = msg => {
    document.getElementById('broadcastErrorMsg').textContent = msg;
    document.getElementById('broadcastError').style.display = 'block';
  };
  if (!text) return showErr('يرجى كتابة نص الرسالة');

  const mode = window._broadcastMode || 'all';
  if (mode === 'select' && !broadcastSelectedClients.length) {
    return showErr('يرجى تحديد عميل واحد على الأقل');
  }
  document.getElementById('broadcastError').style.display = 'none';

  const btn = document.querySelector('#broadcastMsgModal .btn-submit');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...'; }

  try {
    if (mode === 'all') {
      await sendAdminMessage('broadcast', text);
      showToast('✅ تم إرسال الرسالة لجميع العملاء', 'success');
    } else {
      for (const email of broadcastSelectedClients) {
        await sendAdminMessage(email, text);
      }
      showToast(`✅ تم إرسال الرسالة إلى ${broadcastSelectedClients.length} عميل`, 'success');
    }
    document.getElementById('broadcastMsgModal').remove();
    renderAdminMessages();
  } catch(e) {
    showErr('حدث خطأ، تحقق من الاتصال');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال'; }
  }
}
window._onMessagesUpdate = function() {
  if (!currentUser) return;
  if (isStaff()) {
    updateHeaderMsgBadge();
    const panelOpen = document.getElementById('adminPanel')?.classList.contains('open');
    const msgsTabOpen = document.getElementById('adminMessagesWrap')?.style.display !== 'none';
    if (panelOpen && msgsTabOpen) renderAdminMessages();
    if (document.getElementById('adminThreadModal')) {
      getAllMessageThreadsForAdmin().then(g => {
        window._cachedAdminThreads = g;
        if (window._openAdminThreadEmail) {
          renderAdminThreadBody(g[window._openAdminThreadEmail] || []);
        }
      });
    }
  } else {
    if (document.getElementById('messagesPage')?.classList.contains('active')) {
      renderClientMessagesThread();
    } else {
      updateClientMsgBadge();
    }
    loadAndRenderNotifIcon();
  }
};
(function() {
  let lastScroll = 0;
  const header = document.querySelector('header');

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;

    if (currentScroll <= 50) {
      // بالقرب من أعلى الصفحة: أظهر الشريط العلوي دائماً
      header.style.transform = 'translateY(0)';
    } else if (currentScroll > lastScroll) {
      // تمرير للأسفل: أخفِ الشريط العلوي للأعلى
      header.style.transform = 'translateY(-100%)';
    } else {
      // تمرير للأعلى (ولو قليلاً): أظهر الشريط العلوي
      header.style.transform = 'translateY(0)';
    }

    lastScroll = currentScroll;
  }, { passive: true });
})();

window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = window.dpSplash ? null : document.getElementById('splashScreen'); // dpSplash يتولى إغلاقها
    if (splash) {
      splash.style.opacity = '0';
      splash.style.visibility = 'hidden';
      setTimeout(() => splash.remove(), 500);
    }
  }, 450);
});
