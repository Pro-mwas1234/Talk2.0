// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQ3-lEUPs00pULoClMun1gQyiFxUBajW4",
  authDomain: "chat-d7eb8.firebaseapp.com",
  databaseURL: "https://chat-d7eb8-default-rtdb.firebaseio.com",
  projectId: "chat-d7eb8",
  storageBucket: "chat-d7eb8.firebasestorage.app",
  messagingSenderId: "963082833966",
  appId: "1:963082833966:web:2e66cff175cb6ae8a64fbf"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// DOM Elements
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    emojiButton: document.getElementById('emojiButton'),
    emojiPicker: document.getElementById('emojiPicker'),
    attachButton: document.getElementById('attachButton'),
    fileInput: document.getElementById('fileInput'),
    typingIndicator: document.getElementById('typingIndicator'),
    typingUsers: document.getElementById('typingUsers'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    replyPreview: document.getElementById('replyPreview'),
    cancelReply: document.getElementById('cancelReply'),
    onlineUsersToggle: document.getElementById('onlineUsersToggle'),
    onlineUsersPanel: document.getElementById('onlineUsersPanel'),
    onlineUsersList: document.getElementById('onlineUsersList'),
    authModal: document.getElementById('authModal'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    registerName: document.getElementById('registerName'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerBtn: document.getElementById('registerBtn'),
    authTabs: document.getElementById('authTabs'),
    usernameModal: document.getElementById('usernameModal'),
    usernameInput: document.getElementById('usernameInput'),
    usernameAvailability: document.getElementById('usernameAvailability'),
    submitUsernameBtn: document.getElementById('submitUsernameBtn'),
    startRecording: document.getElementById('startRecording'),
    stopRecording: document.getElementById('stopRecording'),
    recordingStatus: document.getElementById('recordingStatus'),
    chatTitle: document.getElementById('chatTitle')
};

// App State
let currentUser = {
    id: null,
    name: null,
    username: null
};
let isTyping = false;
let lastTypingTime = 0;
let expiryTimer = null;
let replyingTo = null;
let onlineUsers = {};
let mediaRecorder;
let audioChunks = [];
const TYPING_TIMEOUT = 3000;
const MESSAGE_EXPIRY_MINUTES = 900;

// Firebase References
const messagesRef = database.ref('messages');
const typingRef = database.ref('typing');
const usersRef = database.ref('users');
const usernamesRef = database.ref('usernames');

// Initialize App
function init() {
    auth.onAuthStateChanged(handleAuthStateChange);
    setupAuth();
    setupUsernameSelection();
    updateDarkMode();
    setupEventListeners();
    setupMobileFeatures();
    detectIOS();
    setupEmojiPicker();
    
    if (!window.MediaRecorder) {
        elements.startRecording.style.display = 'none';
        console.warn("Voice recording not supported in this browser");
    }
}

// Authentication Functions
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

    // Login handler
    elements.loginBtn.addEventListener('click', handleLogin);
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Register handler
    elements.registerBtn.addEventListener('click', handleRegister);
    elements.registerPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleRegister();
    });
}

async function handleLogin() {
    const email = elements.loginEmail.value;
    const password = elements.loginPassword.value;
    
    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log("User logged in:", userCredential.user);
    } catch (error) {
        console.error("Login error:", error);
        alert(getAuthErrorMessage(error.code));
    }
}

async function handleRegister() {
    const name = elements.registerName.value.trim();
    const email = elements.registerEmail.value;
    const password = elements.registerPassword.value;
    
    if (!name || !email || !password) {
        alert('Please fill all fields');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }

    try {
        // 1. Create auth account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // 2. Store basic user info without username first
        await usersRef.child(userCredential.user.uid).set({
            displayName: name,
            email: email,
            isOnline: false, // Not fully registered yet
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // 3. Hide auth modal and show username modal
        hideAuthModals();
        showUsernameModal();
        
        // 4. Set current user (without username yet)
        currentUser = {
            id: userCredential.user.uid,
            name: name,
            username: null
        };

    } catch (error) {
        console.error("Registration error:", error);
        alert(getAuthErrorMessage(error.code));
    }
}

async function saveUsername() {
    const username = elements.usernameInput.value.trim();
    
    if (username.length < 3 || username.length > 15) {
        alert('Username must be 3-15 characters');
        return;
    }

    try {
        // Check if username exists (case insensitive)
        const snapshot = await usersRef.orderByChild('usernameLower').equalTo(username.toLowerCase()).once('value');
        
        if (snapshot.exists()) {
            alert('Username is already taken');
            return;
        }

        // Update user with username
        await usersRef.child(currentUser.id).update({
            username: username,
            usernameLower: username.toLowerCase(),
            isOnline: true // Now fully registered
        });

        // Add to usernames collection for uniqueness check
        await usernamesRef.child(username.toLowerCase()).set(currentUser.id);

        // Update current user
        currentUser.username = username;
        currentUser.name = username;
        
        // Hide modals and initialize chat
        hideUsernameModal();
        loadMessages();
        setupPresence();
        
    } catch (error) {
        console.error("Error saving username:", error);
        alert("Error saving username. Please try again.");
    }
}

async function handleAuthStateChange(user) {
    if (user) {
        currentUser.id = user.uid;
        
        try {
            const snapshot = await usersRef.child(user.uid).once('value');
            const userData = snapshot.val();
            
            if (!userData) {
                // User auth exists but no database record
                await auth.signOut();
                showAuthModal();
                return;
            }
            
            if (userData.username) {
                // Fully registered user
                currentUser.name = userData.username;
                currentUser.username = userData.username;
                hideAuthModals();
                loadMessages();
                setupPresence();
            } else {
                // Needs to set username
                hideAuthModals();
                showUsernameModal();
            }
        } catch (error) {
            console.error("Error checking user data:", error);
            await auth.signOut();
            showAuthModal();
        }
    } else {
        // No user signed in
        currentUser = { id: null, name: null, username: null };
        showAuthModal();
    }
}

function getAuthErrorMessage(errorCode) {
    switch(errorCode) {
        case 'auth/invalid-email': return 'Invalid email address';
        case 'auth/user-disabled': return 'Account disabled';
        case 'auth/user-not-found': return 'Account not found';
        case 'auth/wrong-password': return 'Incorrect password';
        case 'auth/email-already-in-use': return 'Email already in use';
        case 'auth/weak-password': return 'Password too weak';
        case 'auth/operation-not-allowed': return 'Email/password accounts not enabled';
        default: return 'Authentication error';
    }
}

// Username Management
function setupUsernameSelection() {
    elements.usernameInput.addEventListener('input', debounce(checkUsernameAvailability, 500));
    elements.submitUsernameBtn.addEventListener('click', saveUsername);
}

function checkUsernameAvailability() {
    const username = elements.usernameInput.value.trim();
    
    if (username.length < 3 || username.length > 15) {
        elements.usernameAvailability.textContent = 'Username must be 3-15 characters';
        elements.usernameAvailability.className = 'username-taken';
        return;
    }

    usersRef.orderByChild('usernameLower').equalTo(username.toLowerCase()).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                elements.usernameAvailability.textContent = 'Username already taken';
                elements.usernameAvailability.className = 'username-taken';
            } else {
                elements.usernameAvailability.textContent = 'Username available';
                elements.usernameAvailability.className = 'username-available';
            }
        });
}

// User Presence
function setupPresence() {
    usersRef.child(currentUser.id).update({
        isOnline: true,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    usersRef.child(currentUser.id).onDisconnect().update({
        isOnline: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    setInterval(() => {
        if (currentUser.id) {
            usersRef.child(currentUser.id).update({
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }, 30000);

    usersRef.orderByChild('isOnline').equalTo(true).on('value', (snapshot) => {
        onlineUsers = {};
        elements.onlineUsersList.innerHTML = '';
        
        snapshot.forEach((childSnapshot) => {
            const user = childSnapshot.val();
            onlineUsers[childSnapshot.key] = user;
            
            if (childSnapshot.key !== currentUser.id) {
                const userElement = document.createElement('div');
                userElement.className = 'online-user';
                userElement.innerHTML = `
                    <span class="status-indicator"></span>
                    <span class="user-name">${user.username || user.displayName || 'Anonymous'}</span>
                `;
                elements.onlineUsersList.appendChild(userElement);
            }
        });
    });
}

// Message Functions
function sendMessage() {
    const messageText = elements.messageInput.value.trim();
    if (!messageText || !currentUser.id) return;

    const timestamp = Date.now();
    const messageData = {
        text: messageText,
        senderId: currentUser.id,
        senderName: currentUser.username || currentUser.name,
        timestamp: timestamp,
        type: 'text',
        status: 'sent'
    };
    
    if (replyingTo) {
        messageData.replyTo = replyingTo;
    }

    const newMessageRef = messagesRef.push();
    newMessageRef.set(messageData)
        .then(() => {
            newMessageRef.update({ status: 'delivered' });
            elements.messageInput.value = '';
            elements.sendButton.disabled = true;
            updateTyping(false);
            
            if (replyingTo) {
                cancelReply();
            }
        })
        .catch(error => {
            console.error("Error sending message:", error);
        });
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
        alert('Please select an image file');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const timestamp = Date.now();
        const messageData = {
            imageUrl: event.target.result,
            senderId: currentUser.id,
            senderName: currentUser.username || currentUser.name,
            timestamp: timestamp,
            type: 'image'
        };
        
        if (replyingTo) {
            messageData.replyTo = replyingTo;
        }

        messagesRef.push().set(messageData)
            .then(() => {
                if (replyingTo) {
                    cancelReply();
                }
            })
            .catch(error => {
                console.error("Error uploading image:", error);
            });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// Typing Indicators
function updateTyping(typing) {
    if (!currentUser.id) return;
    
    if (typing !== isTyping) {
        isTyping = typing;
        typingRef.child(currentUser.id).set(isTyping ? currentUser.username || currentUser.name : null);
    }
    
    clearTimeout(lastTypingTime);
    if (typing) {
        lastTypingTime = setTimeout(() => {
            updateTyping(false);
        }, TYPING_TIMEOUT);
    }
}

// Message Display
function loadMessages() {
    clearTimeout(expiryTimer);
    
    messagesRef.orderByChild('timestamp').on('child_added', (snapshot) => {
        const message = snapshot.val();
        const isExpired = isMessageExpired(message);
        displayMessage(message, snapshot.key, isExpired);
        
        if (!expiryTimer && !isExpired) {
            setExpiryTimer(message.timestamp);
        }
        
        scrollToBottom();
    });

    typingRef.on('value', (snapshot) => {
        const typingData = snapshot.val() || {};
        elements.typingUsers.innerHTML = '';
        
        const activeTypers = Object.entries(typingData)
            .filter(([userId, userName]) => 
                userName && 
                userId !== currentUser.id && 
                onlineUsers[userId]
            );
        
        if (activeTypers.length > 0) {
            activeTypers.forEach(([userId, userName]) => {
                const typingElement = document.createElement('div');
                typingElement.className = 'typing-user';
                typingElement.textContent = userName;
                elements.typingUsers.appendChild(typingElement);
            });
            elements.typingIndicator.style.display = 'block';
        } else {
            elements.typingIndicator.style.display = 'none';
        }
    });
}

function displayMessage(message, messageId, isExpired = false) {
    if (message.deleted || isExpired) return;
    
    const messageElement = document.createElement('div');
    let messageContent = '';
    
    const timeString = new Date(message.timestamp).toLocaleTimeString([], 
        { hour: '2-digit', minute: '2-digit' });

    if (message.replyTo) {
        messagesRef.child(message.replyTo).once('value', (snapshot) => {
            const originalMessage = snapshot.val();
            if (originalMessage) {
                const replyText = originalMessage.text 
                    ? escapeHtml(originalMessage.text.substring(0, 50)) + 
                      (originalMessage.text.length > 50 ? '...' : '')
                    : '[Media]';
                
                const replyHtml = `
                    <div class="message-reply">
                        Replying to <span class="reply-sender">${originalMessage.senderName}</span>: ${replyText}
                    </div>
                `;
                
                if (messageElement.innerHTML.includes('message-reply')) {
                    messageElement.querySelector('.message-reply').outerHTML = replyHtml;
                } else {
                    messageElement.innerHTML = replyHtml + messageElement.innerHTML;
                }
            }
        });
    }

    if (message.type === 'voice') {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <audio controls src="${message.audioData}"></audio>
            <span class="timestamp">${timeString}</span>
        `;
    } 
    else if (message.type === 'image') {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <img src="${message.imageUrl}" class="message-image" alt="Sent image">
            <span class="timestamp">${timeString}</span>
        `;
    }
    else if (message.senderId) {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <div class="message-text">${escapeHtml(message.text)}</div>
            <span class="timestamp">${timeString}</span>
        `;
        
        if (message.senderId === currentUser.id && message.status) {
            messageContent += `
                <span class="message-status ${message.status}" title="${message.status === 'delivered' ? 'Delivered' : 'Read'}"></span>
            `;
        }
    } 
    else {
        messageElement.className = `message system ${message.type || ''}`;
        messageContent = message.text;
    }

    if (!isExpired && message.senderId && message.type !== 'system') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        if (message.senderId !== currentUser.id) {
            const replyBtn = document.createElement('button');
            replyBtn.className = 'reply-btn';
            replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
            replyBtn.title = 'Reply to this message';
            replyBtn.addEventListener('click', () => {
                setupReply(messageId, message.text || '[Media]', message.senderName);
            });
            actionsDiv.appendChild(replyBtn);
        }
        
        if (message.senderId === currentUser.id) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete message';
            deleteBtn.dataset.messageId = messageId;
            deleteBtn.addEventListener('click', () => deleteMessage(messageId));
            actionsDiv.appendChild(deleteBtn);
        }
        
        messageContent += actionsDiv.outerHTML;
    }

    messageElement.innerHTML += messageContent;
    elements.messagesContainer.appendChild(messageElement);
    
    if (message.senderId !== currentUser.id && !message.read) {
        messagesRef.child(messageId).update({ read: true });
    }
}

// Message Management
function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        messagesRef.child(messageId).update({ deleted: true });
    }
}

function setupReply(messageId, messageText, senderName) {
    replyingTo = messageId;
    elements.replyPreview.style.display = 'block';
    elements.replyPreview.querySelector('.reply-preview-text').textContent = 
        `Replying to ${senderName}: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`;
    elements.messageInput.focus();
}

function cancelReply() {
    elements.replyPreview.style.display = 'none';
    replyingTo = null;
}

// Voice Recording
function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = processRecording;
            mediaRecorder.start(100);
            
            elements.startRecording.style.display = 'none';
            elements.stopRecording.style.display = 'block';
            elements.recordingStatus.style.display = 'block';
        })
        .catch(err => {
            console.error("Recording failed:", err);
            alert("Microphone access required for voice messages");
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

function processRecording() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    const reader = new FileReader();
    
    reader.onload = () => {
        const timestamp = Date.now();
        const messageData = {
            type: 'voice',
            audioData: reader.result,
            duration: Math.round(audioBlob.size / 1000),
            senderId: currentUser.id,
            senderName: currentUser.username || currentUser.name,
            timestamp: timestamp
        };
        
        if (replyingTo) {
            messageData.replyTo = replyingTo;
        }

        messagesRef.push().set(messageData)
            .then(() => {
                if (replyingTo) {
                    cancelReply();
                }
            })
            .catch(error => {
                console.error("Error sending voice message:", error);
            });
        
        elements.startRecording.style.display = 'block';
        elements.stopRecording.style.display = 'none';
        elements.recordingStatus.style.display = 'none';
        audioChunks = [];
    };
    
    reader.readAsDataURL(audioBlob);
}

// Emoji Picker
function setupEmojiPicker() {
    elements.emojiButton.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.emojiPicker.classList.toggle('active');
    });

    elements.emojiPicker.addEventListener('emoji-click', (event) => {
        const emoji = event.detail.unicode;
        elements.messageInput.value += emoji;
        elements.emojiPicker.classList.remove('active');
        elements.messageInput.focus();
    });

    document.addEventListener('click', (e) => {
        if (!elements.emojiButton.contains(e.target) && !elements.emojiPicker.contains(e.target)) {
            elements.emojiPicker.classList.remove('active');
        }
    });
}

// Utility Functions
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function isMessageExpired(message) {
    if (!message.timestamp) return false;
    const messageAge = (Date.now() - message.timestamp) / (1000 * 60);
    return messageAge > MESSAGE_EXPIRY_MINUTES;
}

function setExpiryTimer(oldestMessageTime) {
    const timeElapsed = (Date.now() - oldestMessageTime) / (1000 * 60);
    const timeRemaining = (MESSAGE_EXPIRY_MINUTES - timeElapsed) * 60 * 1000;
    
    if (timeRemaining > 0) {
        expiryTimer = setTimeout(() => {
            cleanExpiredMessages();
        }, timeRemaining);
    }
}

function cleanExpiredMessages() {
    messagesRef.once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        const now = Date.now();
        
        Object.keys(messages).forEach((key) => {
            const message = messages[key];
            if (message.timestamp && (now - message.timestamp) > (MESSAGE_EXPIRY_MINUTES * 60 * 1000)) {
                messagesRef.child(key).remove();
            }
        });
        
        sendSystemMessage('Old messages have been cleared');
        expiryTimer = null;
    });
}

function sendSystemMessage(text, type = 'system') {
    const messageElement = document.createElement('div');
    messageElement.className = `message system ${type}`;
    messageElement.textContent = text;
    elements.messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }, 100);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu, match => match);
}

// UI Helpers
function setupEventListeners() {
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !elements.sendButton.disabled) {
            sendMessage();
        }
    });
    elements.messageInput.addEventListener('input', () => {
        elements.sendButton.disabled = elements.messageInput.value.trim() === '';
        updateTyping(elements.messageInput.value.trim() !== '');
    });
    elements.attachButton.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileUpload);
    elements.startRecording.addEventListener('click', startRecording);
    elements.stopRecording.addEventListener('click', stopRecording);
    elements.cancelReply.addEventListener('click', cancelReply);
    elements.onlineUsersToggle.addEventListener('click', toggleOnlineUsersPanel);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && replyingTo) {
            cancelReply();
        }
    });
}

function toggleOnlineUsersPanel() {
    elements.onlineUsersPanel.classList.toggle('show');
    
    if (elements.onlineUsersPanel.classList.contains('show')) {
        const clickHandler = (e) => {
            if (!elements.onlineUsersPanel.contains(e.target) && e.target !== elements.onlineUsersToggle) {
                elements.onlineUsersPanel.classList.remove('show');
                document.removeEventListener('click', clickHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', clickHandler);
        }, 10);
    }
}

function setupMobileFeatures() {
    const keyboardHelper = document.querySelector('.mobile-keyboard-helper');
    let isKeyboardOpen = false;
    
    window.addEventListener('resize', () => {
        const newState = window.innerHeight < window.outerHeight;
        if (newState !== isKeyboardOpen) {
            isKeyboardOpen = newState;
            keyboardHelper.style.height = isKeyboardOpen ? '300px' : '0';
            if (!isKeyboardOpen) scrollToBottom();
        }
    });
    
    document.addEventListener('touchstart', function() {}, {passive: true});
    
    let lastTouch = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouch <= 300) {
            event.preventDefault();
        }
        lastTouch = now;
    }, {passive: false});
    
    if ('ontouchstart' in window) {
        elements.onlineUsersToggle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            toggleOnlineUsersPanel();
        });
    }
}

function detectIOS() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
        document.body.classList.add('ios');
        elements.messageInput.style.fontSize = '16px';
    }
}

// Dark Mode
function toggleDarkMode() {
    const darkMode = !document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', darkMode);
    updateDarkMode();
}

function updateDarkMode() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', darkMode);
    elements.darkModeToggle.innerHTML = darkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    elements.darkModeToggle.title = darkMode ? 'Switch to light mode' : 'Switch to dark mode';
}

// Modal Control
function showAuthModal() {
    elements.authModal.classList.add('show');
    elements.loginEmail.focus();
}

function hideAuthModals() {
    elements.authModal.classList.remove('show');
    elements.usernameModal.classList.remove('show');
}

function showUsernameModal() {
    elements.usernameModal.classList.add('show');
    elements.usernameInput.focus();
}

function hideUsernameModal() {
    elements.usernameModal.classList.remove('show');
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
    if (currentUser.id) {
        usersRef.child(currentUser.id).update({
            isOnline: false,
            lastActive: firebase.database.ServerValue.TIMESTAMP
        });
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', init);
