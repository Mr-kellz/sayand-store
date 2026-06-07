import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD00XzBiIM2OQQQVmygspFIWxjExDwkldk",
    authDomain: "sayand-store.firebaseapp.com",
    projectId: "sayand-store",
    storageBucket: "sayand-store.firebasestorage.app",
    messagingSenderId: "232440912424",
    appId: "1:232440912424:web:bc33272b30af8bd5e4731d",
    measurementId: "G-91D7EK03BK",
    databaseURL: "https://sayand-store-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

let isLoginMode = true;
const form = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const nameFields = document.getElementById('name-fields');
const authButton = document.getElementById('auth-button');
const toggleMode = document.getElementById('toggle-mode');
const errorMessage = document.getElementById('error-message');

toggleMode.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authButton.textContent = "SIGN IN";
        toggleMode.textContent = "Need an account? Sign up here.";
        nameFields.classList.add('hidden');
        document.getElementById('forgot-password').style.display = 'block';
    } else {
        authButton.textContent = "CREATE ACCOUNT";
        toggleMode.textContent = "Already have an account? Sign in here.";
        nameFields.classList.remove('hidden');
        document.getElementById('forgot-password').style.display = 'none';
    }
    errorMessage.textContent = ""; 
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

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
        } else if (error.code === 'auth/too-many-requests') {
            cleanMessage = "Too many attempts. Please try again later.";
        }
        errorMessage.textContent = cleanMessage;
    };

    if (isLoginMode) {
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                if (!user.emailVerified) {
                    errorMessage.innerHTML = 'Please verify your email before signing in. <a href="#" id="resend-link" style="text-decoration:underline;color:#666;">Resend email</a>';
                    document.getElementById('resend-link').addEventListener('click', (ev) => {
                        ev.preventDefault();
                        sendEmailVerification(user).then(() => {
                            errorMessage.textContent = "Verification email resent. Check your inbox.";
                        });
                    });
                    firebase.auth().signOut();
                    return;
                }
                window.location.href = "dashboard.html";
            })
            .catch(handleError);
    } else {
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        if (!firstName || !lastName) {
            errorMessage.textContent = "Please enter your first and last name.";
            return;
        }
        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                const fullName = `${firstName} ${lastName}`;
                return updateProfile(user, { displayName: fullName }).then(() => {
                    return sendEmailVerification(user).then(() => {
                        return set(ref(db, 'users/' + user.uid), {
                            firstName: firstName,
                            lastName: lastName,
                            fullName: fullName,
                            email: email,
                            emailVerified: false,
                            createdAt: new Date().toISOString()
                        });
                    });
                }).then(() => {
                    errorMessage.style.color = "#16a34a";
                    errorMessage.textContent = "Account created! Please check your email to verify before signing in.";
                    isLoginMode = true;
                    authButton.textContent = "SIGN IN";
                    toggleMode.textContent = "Need an account? Sign up here.";
                    nameFields.classList.add('hidden');
                    document.getElementById('forgot-password').style.display = 'block';
                });
            })
            .catch(handleError);
    }
});

// Forgot Password
document.getElementById('forgot-password').addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
        errorMessage.textContent = "Please enter your email address first, then click Forgot Password.";
        return;
    }
    sendPasswordResetEmail(auth, email)
        .then(() => {
            errorMessage.style.color = "#16a34a";
            errorMessage.textContent = "Password reset email sent. Check your inbox.";
        })
        .catch((err) => {
            errorMessage.textContent = err.message.replace("Firebase:", "");
        });
});

document.getElementById('google-login').addEventListener('click', () => {
    signInWithPopup(auth, googleProvider)
        .then((result) => {
            const user = result.user;
            if (user) {
                const name = user.displayName || '';
                const parts = name.split(' ');
                const firstName = parts[0] || '';
                const lastName = parts.slice(1).join(' ') || '';
                set(ref(db, 'users/' + user.uid), {
                    firstName: firstName,
                    lastName: lastName,
                    fullName: name,
                    email: user.email,
                    emailVerified: true,
                    lastLogin: new Date().toISOString()
                }).catch(() => {});
            }
            window.location.href = "dashboard.html";
        })
        .catch((error) => errorMessage.textContent = error.message.replace("Firebase:", ""));
});

document.getElementById('apple-login').addEventListener('click', (e) => {
    e.preventDefault();
    const appleBtn = document.getElementById('apple-login');
    appleBtn.innerHTML = `
        <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" alt="Apple" style="opacity: 0.4;">
        <span style="color: #999;">COMING SOON</span>
    `;
    appleBtn.style.borderColor = "#eee";
    appleBtn.style.cursor = "not-allowed";
    appleBtn.style.backgroundColor = "#fafafa";
    errorMessage.textContent = ""; 
});