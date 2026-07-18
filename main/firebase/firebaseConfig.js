'use strict';

/**
 * Firebase client configuration.
 *
 * These values are NOT secret — Firebase's client-side config (apiKey,
 * authDomain, etc.) is meant to be public; the actual access control is
 * enforced entirely by the Firestore Security Rules deployed on your
 * project (see firebase/firestore.rules in this repo), not by hiding this
 * object. Do not treat this file as a credential to protect.
 *
 * SETUP STEPS (one-time, done in the Firebase Console, not in code):
 *   1. Go to https://console.firebase.google.com and create a project.
 *   2. Build > Authentication > Get started > enable "Email/Password".
 *   3. Build > Firestore Database > Create database (production mode).
 *   4. Firestore > Rules tab > paste the contents of
 *      `firebase/firestore.rules` from this repo > Publish.
 *   5. Project settings (gear icon) > General > "Your apps" > Add app >
 *      Web app (</>) > copy the config object it gives you into the
 *      object below.
 *   6. Sign up once inside Waslah with the account you want to be admin.
 *   7. In the Firestore console, open the `users/<your-uid>` document
 *      that sign-up created, and manually change its `role` field from
 *      "user" to "admin". This step is deliberately manual — see the
 *      security rules file for why client code is never allowed to set
 *      its own role.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAVJJZayguOWuosluiTM52uWoV5ekl9pk4',
  authDomain: 'wasla-e0a5b.firebaseapp.com',
  projectId: 'wasla-e0a5b',
  storageBucket: 'wasla-e0a5b.firebasestorage.app',
  messagingSenderId: '642780622095',
  appId: '1:642780622095:web:bd3a0a3a0225d9045c227a',
  measurementId: 'G-Y2PCW9N0K3',
};

const isConfigured = () =>
  Object.values(firebaseConfig).every((v) => typeof v === 'string' && !v.includes('REPLACE_ME'));

module.exports = { firebaseConfig, isConfigured };
