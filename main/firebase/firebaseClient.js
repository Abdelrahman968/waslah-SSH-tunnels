'use strict';

const { initializeApp } = require('firebase/app');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} = require('firebase/auth');
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} = require('firebase/firestore');
const { firebaseConfig, isConfigured } = require('./firebaseConfig');
const { encryptServerRecord, decryptServerRecord } = require('./serverCrypto');

let app = null;
let auth = null;
let db = null;
let currentUser = null;

function ensureInitialized() {
  if (!isConfigured()) {
    throw new Error(
      'FIREBASE_NOT_CONFIGURED: fill in main/firebase/firebaseConfig.js with your project settings first.'
    );
  }
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
}

/**
 * Creates the account plus its `users/{uid}` profile document in one call.
 * The profile document is always created with role "user" — the Firestore
 * rules only allow a self-created document to have role == "user", so
 * there is no client-side path to self-granting admin. See
 * firebase/firestore.rules for the enforcement and firebaseConfig.js for
 * the one-time manual step to make a specific account admin.
 */
async function signUp(email, password, username = null) {
  ensureInitialized();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email,
    username: username || null,
    role: 'free',
    vipExpiresAt: null,
    guestTrialUsedAt: null,
    createdAt: Date.now(),
  });
  if (username) {
    try {
      await setDoc(doc(db, 'usernames', username), { uid: cred.user.uid, email });
    } catch {
      // Username already taken (rules reject the create) — account still
      // works fine by email, it just has no username shortcut. Not fatal.
    }
  }
  await sendEmailVerification(cred.user);
  currentUser = cred.user;
  return getPublicUser();
}

async function resendVerification() {
  ensureInitialized();
  if (!currentUser) throw new Error('NOT_SIGNED_IN');
  await sendEmailVerification(currentUser);
}

async function resetPassword(email) {
  ensureInitialized();
  await sendPasswordResetEmail(auth, email);
}

/**
 * Accepts either an email or a username. If the identifier doesn't
 * contain '@', it's resolved via the public `usernames/{username}`
 * lookup first, then signed in with the resulting email — Firebase Auth
 * itself only ever authenticates by email under the hood.
 */
async function signIn(identifier, password) {
  ensureInitialized();
  let email = identifier;
  if (!identifier.includes('@')) {
    const snap = await getDoc(doc(db, 'usernames', identifier));
    if (!snap.exists()) throw new Error('USERNAME_NOT_FOUND');
    email = snap.data().email;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  currentUser = cred.user;
  return getPublicUser();
}

async function signOutUser() {
  ensureInitialized();
  await signOut(auth);
  currentUser = null;
}

async function getPublicUser() {
  if (!currentUser) return null;
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  const profile = snap.exists() ? snap.data() : { role: 'user' };
  return {
    uid: currentUser.uid,
    email: currentUser.email,
    role: profile.role || 'user',
  };
}

function getCurrentUser() {
  return currentUser ? getPublicUser() : Promise.resolve(null);
}

async function requestVip() {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user) throw new Error('NOT_SIGNED_IN');
  const ref = await addDoc(collection(db, 'vipRequests'), {
    uid: user.uid,
    email: user.email,
    status: 'pending',
    requestedAt: Date.now(),
    reviewedAt: null,
    reviewedBy: null,
  });
  return ref.id;
}

async function listMyVipRequests() {
  ensureInitialized();
  if (!currentUser) throw new Error('NOT_SIGNED_IN');
  const q = query(collection(db, 'vipRequests'), where('uid', '==', currentUser.uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listAllVipRequests() {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');
  const snap = await getDocs(collection(db, 'vipRequests'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Approving/rejecting is done here, by an authenticated admin, rather than
 * only through the console — safe because the Firestore rules require
 * isAdmin() for both the vipRequests update AND the users/{uid} role
 * change, so this call only succeeds server-side if the caller really is
 * an admin.
 */
async function reviewVipRequest(requestId, targetUid, approve, vipDays = 30) {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');

  await updateDoc(doc(db, 'vipRequests', requestId), {
    status: approve ? 'approved' : 'rejected',
    reviewedAt: Date.now(),
    reviewedBy: user.email,
  });

  if (approve) {
    await updateDoc(doc(db, 'users', targetUid), {
      role: 'vip',
      vipExpiresAt: Date.now() + vipDays * 24 * 60 * 60 * 1000,
    });
  }
}

async function startGuestSession() {
  ensureInitialized();
  const cred = await signInAnonymously(auth);
  currentUser = cred.user;
  const q = query(collection(db, 'servers'), where('tier', '==', 'free'));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('NO_FREE_SERVERS_AVAILABLE');
  const docs = snap.docs;
  const pick = docs[Math.floor(Math.random() * docs.length)];
  return decryptServerRecord({ id: pick.id, ...pick.data() });
}

async function endGuestSession() {
  if (currentUser?.isAnonymous) {
    await signOut(auth);
    currentUser = null;
  }
}

async function sendChatMessage(text, targetUid = null) {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user) throw new Error('NOT_SIGNED_IN');
  const threadUid = targetUid || user.uid; // admin replying passes the user's uid; user sending uses their own
  const from = targetUid && targetUid !== user.uid ? 'admin' : 'user';
  if (from === 'admin' && user.role !== 'admin') throw new Error('ADMIN_ONLY');

  await addDoc(collection(db, 'supportChats', threadUid, 'messages'), {
    from,
    text,
    sentAt: Date.now(),
  });
  await setDoc(doc(db, 'chatThreads', threadUid), {
    uid: threadUid,
    email: from === 'user' ? user.email : (await getDoc(doc(db, 'users', threadUid))).data()?.email || '',
    lastMessageAt: Date.now(),
    lastMessageText: text,
    lastMessageFrom: from,
  }, { merge: true });
}

function subscribeToChat(targetUid, onUpdate) {
  ensureInitialized();
  const q = query(collection(db, 'supportChats', targetUid, 'messages'), orderBy('sentAt', 'asc'));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

async function listChatThreads() {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');
  const snap = await getDocs(collection(db, 'chatThreads'));
  return snap.docs.map((d) => d.data()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

function subscribeServers(onUpdate) {
  ensureInitialized();
  return onSnapshot(collection(db, 'servers'), (snap) => {
    onUpdate(snap.docs.map((d) => decryptServerRecord({ id: d.id, ...d.data() })));
  });
}

function subscribeVipRequests(onUpdate) {
  ensureInitialized();
  return onSnapshot(collection(db, 'vipRequests'), (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

function subscribeUsers(onUpdate) {
  ensureInitialized();
  return onSnapshot(collection(db, 'users'), (snap) => {
    onUpdate(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

async function listAllUsers() {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function listSharedServers() {
  ensureInitialized();
  if (!currentUser) throw new Error('NOT_SIGNED_IN');
  const snap = await getDocs(collection(db, 'servers'));
  return snap.docs.map((d) => decryptServerRecord({ id: d.id, ...d.data() }));
}

/**
 * Adding actually succeeds or fails based on the Firestore rules (only
 * role == "admin" can write to `servers`), not on anything checked here —
 * this client-side check is just for a faster, friendlier error message.
 * The username/password are encrypted before they ever leave this
 * function — see serverCrypto.js for what that does and doesn't protect
 * against.
 */
async function addSharedServer(serverData) {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');
  const ref = await addDoc(collection(db, 'servers'), {
    ...encryptServerRecord(serverData),
    addedBy: user.email,
    addedAt: Date.now(),
  });
  return ref.id;
}

async function deleteSharedServer(id) {
  ensureInitialized();
  const user = await getPublicUser();
  if (!user || user.role !== 'admin') throw new Error('ADMIN_ONLY');
  await deleteDoc(doc(db, 'servers', id));
}

module.exports = {
  isConfigured,
  signUp,
  signIn,
  signOutUser,
  getCurrentUser,
  resendVerification,
  resetPassword,
  requestVip,
  listMyVipRequests,
  listAllVipRequests,
  reviewVipRequest,
  startGuestSession,
  endGuestSession,
  sendChatMessage,
  subscribeToChat,
  listChatThreads,
  listAllUsers,
  subscribeServers,
  subscribeVipRequests,
  subscribeUsers,
  listSharedServers,
  addSharedServer,
  deleteSharedServer,
};
