import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ⚠️ Paste your real firebaseConfig block here!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "sayand-store.firebaseapp.com",
    projectId: "sayand-store",
    storageBucket: "sayand-store.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const displayEmail = document.getElementById('display-email');
const signOutBtn = document.getElementById('sign-out-btn');

// THE BOUNCER: Check if the user is allowed to be here
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in, show their email on the dashboard
        displayEmail.textContent = `Logged in as: ${user.email}`;
    } else {
        // User is NOT logged in, kick them back to the login page
        window.location.href = "login.html";
    }
});

// Handle the Sign Out button
signOutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        // Sign-out successful, the bouncer (onAuthStateChanged) will automatically redirect them
        console.log("User signed out.");
    }).catch((error) => {
        console.error("Sign out error:", error);
    });
});
