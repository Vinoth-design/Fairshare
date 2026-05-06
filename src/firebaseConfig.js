import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace the values here with your actual Web App credentials
// To find this: Firebase Console -> Settings icon (top left) -> General -> Scroll down to "Your apps", create a Web App (</>), and copy the config here.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA9M-0d-FDXUqBhho7ytFHsJNklYziNLvY",
  authDomain: "fairshare-cloud-ad0c2.firebaseapp.com",
  projectId: "fairshare-cloud-ad0c2",
  storageBucket: "fairshare-cloud-ad0c2.firebasestorage.app",
  messagingSenderId: "249195241548",
  appId: "1:249195241548:web:1d4eaacda63f89f8c0d4e9",
  measurementId: "G-6HBK7W80SN"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
