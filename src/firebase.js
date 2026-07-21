import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBYkUHgM9Xk9cwRrinOCJ7RvcYGyJeYapE",
  authDomain: "escadmin-c7655.firebaseapp.com",
  projectId: "escadmin-c7655",
  storageBucket: "escadmin-c7655.firebasestorage.app",
  messagingSenderId: "549798320602",
  appId: "1:549798320602:web:13988c72dea248d540c8e3",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db };
export default app;
