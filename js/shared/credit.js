// الذمم (البيع الآجل) — الحساب المشترك بين العميل والأدمن.
// رصيد العميل لا يُخزَّن: يُحسب دائماً من فواتير الذمم ودفعات السداد (مصدر واحد للحقيقة).

function dpRound2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// orders: طلبات العميل (أي طريقة دفع)، payments: دفعاته. يرجع { invoices, outstanding }
function dpCreditCompute(orders, payments) {
  const byOrder = {};
  (payments || []).forEach(p => { (byOrder[p.orderId] = byOrder[p.orderId] || []).push(p); });
  const invoices = [];
  (orders || []).forEach(o => {
    if (o.payMethod !== 'credit') return;
    const cancelled = (o.status || 'pending') === 'cancelled';
    const pays = (byOrder[o.id] || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    if (cancelled && !pays.length) return; // فاتورة ملغاة بلا دفعات لا تظهر
    const total = cancelled ? 0 : dpRound2(o.total);
    const paid = dpRound2(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    invoices.push({ order: o, id: o.id, date: o.createdAt, total, cancelled, payments: pays, paid, remaining: dpRound2(total - paid) });
  });
  invoices.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { invoices, outstanding: dpRound2(invoices.reduce((s, i) => s + i.remaining, 0)) };
}

// ائتمان العميل الحالي (للسلة): هل الذمم مفعّلة؟ الحد؟ المتبقي عليه؟
async function dpLoadMyCredit() {
  const res = { uid: currentUser && currentUser.uid, enabled: false, limit: 0, outstanding: 0 };
  try {
    const uSnap = await window._fbGetDocFromServer(window._fbDoc2('users', currentUser.uid));
    const u = uSnap.exists() ? uSnap.data() : {};
    res.enabled = u.creditEnabled === true;
    res.limit = Number(u.creditLimit) || 0;
    if (res.enabled) {
      const oq = window._fbQuery(window._fbOrdersRef(), window._fbWhere('clientEmail', '==', currentUser.email));
      const pq = window._fbQuery(window._fbCollection(window._db, 'credit_payments'), window._fbWhere('clientUid', '==', currentUser.uid));
      const [os, ps] = await Promise.all([window._fbGetDocs(oq), window._fbGetDocs(pq)]);
      res.outstanding = dpCreditCompute(os.docs.map(d => d.data()), ps.docs.map(d => d.data())).outstanding;
    }
  } catch (e) { res.enabled = false; res.error = true; }
  window._myCredit = res;
  return res;
}

function dpCreditAvailable(c) {
  return c && c.enabled ? Math.max(0, dpRound2(c.limit - c.outstanding)) : 0;
}
