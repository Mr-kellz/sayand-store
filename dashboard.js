import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ⚠️ Paste your real firebaseConfig block here!
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
// ==================== TAB SWITCHING LOGIC ====================
const navLinks = document.querySelectorAll('.nav-link[data-tab]');
const sections = document.querySelectorAll('.dashboard-section');
const pageTitle = document.getElementById('page-title');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        // 1. Remove active styling from all links and hide all sections
        navLinks.forEach(l => l.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        // 2. Add active styling to the clicked link
        link.classList.add('active');

        // 3. Find the matching section and show it
        const targetId = link.getAttribute('data-tab');
        document.getElementById(`section-${targetId}`).classList.add('active');

        // 4. Update the large page title to match the tab
        pageTitle.textContent = link.textContent;
    });
});
