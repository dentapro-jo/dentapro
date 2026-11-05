const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForFirebase(timeoutMs = 9000) {
  const started = Date.now();
  while (!window._db && Date.now() - started < timeoutMs) await wait(100);
  return Boolean(window._db);
}

export function getFirebaseContext() {
  return {
    db: window._db || null,
    auth: window._auth || null,
    getDoc: window._fbGetDoc || null,
    setDoc: window._fbSetDoc || null,
    getDocs: window._fbGetDocs || null,
    addDoc: window._fbAddDoc || null,
    updateDoc: window._fbUpdateDoc || null,
    deleteDoc: window._fbDeleteDoc || null,
    collection: window._fbCollection || null,
    doc: window._fbDoc2 || null,
    query: window._fbQuery || null,
    where: window._fbWhere || null,
    orderBy: window._fbOrderBy || null,
    onSnapshot: window._fbOnSnapshot || null,
  };
}

export async function getDocument(collectionName, documentId) {
  if (!await waitForFirebase()) throw new Error('Firebase is not ready');
  const api = getFirebaseContext();
  return api.getDoc(api.doc(collectionName, documentId));
}

export async function setDocument(collectionName, documentId, data) {
  if (!await waitForFirebase()) throw new Error('Firebase is not ready');
  const api = getFirebaseContext();
  return api.setDoc(api.doc(collectionName, documentId), data);
}
