// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDQ3-lEUPs00pULoClMun1gQyiFxUBajW4",
    authDomain: "chat-d7eb8.firebaseapp.com",
    databaseURL: "https://chat-d7eb8-default-rtdb.firebaseio.com",
    projectId: "chat-d7eb8",
    storageBucket: "chat-d7eb8.appspot.com",
    messagingSenderId: "963082833966"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const usersRef = database.ref('users');
const usernameOwnersRef = database.ref('usernameOwners');

// DOM Elements
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    authModal: document.getElementById('authModal'),
    authTabs: document.getElementById('authTabs'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    registerName: document.getElementById('registerName'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerBtn: document.getElementById('registerBtn'),
    usernameStatus: document.getElementById('usernameStatus'),
    currentUsername: document.getElementById('currentUsername')
};

// App State
let currentUser = null;

// Initialize App
function init() {
    setupAuth();
    setupEventListeners();
    
    auth.onAuthStateChanged(user => {
        if (user) {
            loadUserProfile(user.uid);
        } else {
            showAuthModal();
        }
    });
}

// Auth Functions
function setupAuth() {
    // Tab switching
    elements.authTabs.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            elements.authTabs.querySelector('.active').classList.remove('active');
            tab.classList.add('active');
            elements.loginForm.style.display = tab.dataset.tab === 'login' ? 'flex' : 'none';
            elements.registerForm.style.display = tab.dataset.tab === 'register' ? 'flex' : 'none';
        });
    });

    // Login
    elements.loginBtn.addEventListener('click', handleLogin);
    
    // Register
    elements.registerBtn.addEventListener('click', handleRegister);
    elements.registerName.addEventListener('input', checkUsernameAvailability);
}

function loadUserProfile(uid) {
    usersRef.child(uid).once('value').then(snapshot => {
        const userData = snapshot.val();
        if (userData && userData.username) {
            currentUser = {
                uid: uid,
                username: userData.username,
                email: userData.email
            };
            elements.currentUsername.textContent = userData.username;
            hideAuthModal();
            loadMessages();
        } else {
            auth.signOut();
            alert('Invalid user profile');
        }
    });
}

function checkUsernameAvailability() {
    const username = elements.registerName.value.trim();
    if (username.length < 3 || username.length > 15) {
        elements.usernameStatus.textContent = 'Must be 3-15 characters';
        elements.usernameStatus.className = 'taken';
        return;
    }

    usernameOwnersRef.child(username).once('value').then(snapshot => {
        if (snapshot.exists()) {
            elements.usernameStatus.textContent = 'Username taken';
            elements.usernameStatus.className = 'taken';
        } else {
            elements.usernameStatus.textContent = 'Username available';
            elements.usernameStatus.className = 'available';
        }
    });
}

function handleLogin() {
    const email = elements.loginEmail.value;
    const password = elements.loginPassword.value;
    
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            alert("Login failed: " + error.message);
        });
}

function handleRegister() {
    const username = elements.registerName.value.trim();
    const email = elements.registerEmail.value;
    const password = elements.registerPassword.value;
    
    if (!username || username.length < 3 || username.length > 15) {
        alert('Username must be 3-15 characters');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }

    // Claim username atomically
    usernameOwnersRef.child(username).transaction(current => {
        if (current === null) return auth.uid;
        return; // Abort if username taken
    }).then(result => {
        if (!result.committed) throw new Error('Username already taken');
        
        return auth.createUserWithEmailAndPassword(email, password);
    }).then(userCredential => {
        // Save user profile
        return usersRef.child(userCredential.user.uid).set({
            username: username,
            email: email,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
    }).then(() => {
        alert('Registration successful! Please login');
        elements.authTabs.querySelector('[data-tab="login"]').click();
        elements.registerName.value = '';
        elements.registerEmail.value = '';
        elements.registerPassword.value = '';
        elements.usernameStatus.textContent = '';
    }).catch(error => {
        alert("Registration failed: " + error.message);
    });
}

// Message Functions
function loadMessages() {
    database.ref('messages').orderByChild('timestamp').on('child_added', snapshot => {
        const message = snapshot.val();
        displayMessage(message);
    });
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
    messageElement.innerHTML = `
        <div>
            <span class="message-username">${message.senderName}</span>
            <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="message-text">${message.text}</div>
    `;
    elements.messagesContainer.appendChild(messageElement);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function sendMessage() {
    const messageText = elements.messageInput.value.trim();
    if (!messageText || !currentUser) return;

    const message = {
        text: messageText,
        senderId: currentUser.uid,
        senderName: currentUser.username,
        timestamp: Date.now()
    };

    database.ref('messages').push(message)
        .then(() => {
            elements.messageInput.value = '';
        })
        .catch(error => {
            alert("Failed to send message: " + error.message);
        });
}

// UI Functions
function showAuthModal() {
    elements.authModal.style.display = 'flex';
    elements.loginEmail.focus();
}

function hideAuthModal() {
    elements.authModal.style.display = 'none';
}

function setupEventListeners() {
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
