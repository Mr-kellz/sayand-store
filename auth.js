import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ⚠️ IMPORTANT: Replace this with your actual firebaseConfig object from firebase-config.js
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

// Setup Providers for Social Login
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

let isLoginMode = true;
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authButton = document.getElementById('auth-button');
const toggleMode = document.getElementById('toggle-mode');
const errorMessage = document.getElementById('error-message');

// Switch between Login and Sign Up
toggleMode.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authButton.textContent = "SIGN IN";
        toggleMode.textContent = "Need an account? Sign up here.";
    } else {
        authButton.textContent = "CREATE ACCOUNT";
        toggleMode.textContent = "Already have an account? Sign in here.";
    }
    errorMessage.textContent = ""; 
});

// Handle Email/Password Form
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    // Helper function to translate ugly Firebase errors into clean English
    const handleError = (error) => {
        let cleanMessage = "An error occurred. Please try again.";
        if (error.code === 'auth/email-already-in-use') {
            cleanMessage = "This email is already registered. Please sign in instead.";
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            cleanMessage = "Incorrect email or password.";
        } else if (error.code === 'auth/weak-password') {
            cleanMessage = "Password must be at least 6 characters long.";
        } else if (error.code === 'auth/invalid-email') {
            cleanMessage = "Please enter a valid email address.";
        }
        errorMessage.textContent = cleanMessage;
    };

    if (isLoginMode) {
        signInWithEmailAndPassword(auth, email, password)
            .then(() => window.location.href = "dashboard.html")
            .catch(handleError);
    } else {
        createUserWithEmailAndPassword(auth, email, password)
            .then(() => window.location.href = "dashboard.html")
            .catch(handleError);
    }
});


// Handle Google Login
document.getElementById('google-login').addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
        .then(() => window.location.href = "dashboard.html")
        .catch((error) => errorMessage.textContent = error.message.replace("Firebase:", ""));
});

// Handle Apple Login (Coming Soon Feature)
document.getElementById('apple-login').addEventListener('click', (e) => {
    e.preventDefault(); // Stops the broken Firebase popup from opening
    
    const appleBtn = document.getElementById('apple-login');
    const errorMessage = document.getElementById('error-message');
    
    // Change the button aesthetic to look disabled
    appleBtn.innerHTML = `
        <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" alt="Apple" style="opacity: 0.4;">
        <span style="color: #999;">COMING SOON</span>
    `;
    appleBtn.style.borderColor = "#eee";
    appleBtn.style.cursor = "not-allowed";
    appleBtn.style.backgroundColor = "#fafafa";
    
    // Clear any red errors that might be on the screen
    errorMessage.textContent = ""; 
});
