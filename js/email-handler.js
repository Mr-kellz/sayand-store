// ===== CUSTOM EMAIL HANDLER FOR SAYAND =====
// This bypasses Firebase's locked templates entirely

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD00XzBiIM2OQQQVmygspFIWxjExDwkldk",
    authDomain: "sayand-store.firebaseapp.com",
    projectId: "sayand-store",
    storageBucket: "sayand-store.firebasestorage.app",
    messagingSenderId: "232440912424",
    appId: "1:232440912424:web:bc33272b30af8bd5e4731d",
    measurementId: "G-91D7EK03BK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Custom password reset with branded email
export async function sendCustomPasswordReset(email) {
    const actionCodeSettings = {
        url: 'https://sayand-store.web.app/auth-action.html',
        handleCodeInApp: false
    };
    
    // Firebase sends the email, but we redirect to our branded page
    return sendPasswordResetEmail(auth, email, actionCodeSettings);
}

// Generate a password reset link for custom email sending
export async function generateResetLink(email) {
    // This requires Admin SDK, so we'll use a different approach
    // We'll create a custom token and handle it in auth-action.html
    return null;
}