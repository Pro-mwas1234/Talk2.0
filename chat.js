// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDQ3-lEUPs00pULoClMun1gQyiFxUBajW4",
  authDomain: "chat-d7eb8.firebaseapp.com",
  databaseURL: "https://chat-d7eb8-default-rtdb.firebaseio.com",
  projectId: "chat-d7eb8",
  storageBucket: "chat-d7eb8.firebasestorage.app",
  messagingSenderId: "963082833966",
  appId: "1:963082833966:web:2e66cff175cb6ae8a64fbf"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// DOM elements
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    attachButton: document.getElementById('attachButton'),
    fileInput: document.getElementById('fileInput'),
    typingIndicator: document.getElementById('typingIndicator'),
    typingUsers: document.getElementById('typingUsers'),
    nameModal: document.getElementById('nameModal'),
    userNameInput: document.getElementById('userNameInput'),
    submitNameBtn: document.getElementById('submitNameBtn'),
    startRecording: document.getElementById('startRecording'),
    stopRecording: document.getElementById('stopRecording'),
    recordingStatus: document.getElementById('recordingStatus'),
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
    submitUsernameBtn: document.getElementById('submitUsernameBtn')
};

// App state
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
const MESSAGE_EXPIRY_MINUTES = 900;
const TYPING_TIMEOUT = 3000;

// Firebase references
const messagesRef = database.ref('messages');
const typingRef = database.ref('typing');
const usersRef = database.ref('users');

// Initialize app
function init() {
    setupAuth();
    setupUsernameSelection();
    updateDarkMode();
    setupEventListeners();
    setupMobileFeatures();
    detectIOS();
    
    if (!window.MediaRecorder) {
        elements.startRecording.style.display = 'none';
        console.warn("Voice recording not supported in this browser");
    }
}

// Dark mode functions
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

// Authentication functions
function setupAuth() {
    // Switch between login/register tabs
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

    // Auth state listener
    auth.onAuthStateChanged(handleAuthStateChange);
}

function handleLogin() {
    const email = elements.loginEmail.value;
    const password = elements.loginPassword.value;
    
    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            alert(error.message);
        });
}

function handleRegister() {
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

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Create user profile with temporary display name
            return usersRef.child(userCredential.user.uid).set({
                displayName: name,
                isOnline: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .catch(error => {
            alert(error.message);
        });
}

function handleAuthStateChange(user) {
    if (user) {
        // User signed in
        currentUser.id = user.uid;
        
        // Check if user has a username
        usersRef.child(user.uid).once('value')
            .then(snapshot => {
                const userData = snapshot.val();
                if (userData && userData.username) {
                    // User has username, proceed to chat
                    currentUser.name = userData.username;
                    currentUser.username = userData.username;
                    hideAuthModals();
                    loadMessages();
                    setupPresence();
                } else {
                    // No username set, show username modal
                    showUsernameModal();
                }
            });
    } else {
        // No user signed in
        showAuthModal();
    }
}

// Username management
function setupUsernameSelection() {
    elements.usernameInput.addEventListener('input', checkUsernameAvailability);
    elements.submitUsernameBtn.addEventListener('click', saveUsername);
}

function checkUsernameAvailability() {
    const username = elements.usernameInput.value.trim();
    
    if (username.length < 3 || username.length > 15) {
        elements.usernameAvailability.textContent = 'Username must be 3-15 characters';
        elements.usernameAvailability.className = 'username-taken';
        return;
    }

    usersRef.orderByChild('username').equalTo(username).once('value')
        .then(snapshot => {
            if (snapshot.exists() && Object.keys(snapshot.val())[0] !== currentUser.id) {
                elements.usernameAvailability.textContent = 'Username already taken';
                elements.usernameAvailability.className = 'username-taken';
            } else {
                elements.usernameAvailability.textContent = 'Username available';
                elements.usernameAvailability.className = 'username-available';
            }
        });
}

function saveUsername() {
    const username = elements.usernameInput.value.trim();
    
    if (username.length < 3 || username.length > 15) {
        alert('Username must be 3-15 characters');
        return;
    }

    // Check again right before saving
    usersRef.orderByChild('username').equalTo(username).once('value')
        .then(snapshot => {
            if (snapshot.exists() && Object.keys(snapshot.val())[0] !== currentUser.id) {
                alert('Username is already taken');
                return;
            }

            // Save username to user profile
            return usersRef.child(currentUser.id).update({
                username: username
            });
        })
        .then(() => {
            currentUser.name = username;
            currentUser.username = username;
            hideUsernameModal();
            loadMessages();
            setupPresence();
        })
        .catch(error => {
            console.error("Error saving username:", error);
            alert("Error saving username. Please try again.");
        });
}

// User presence
function setupPresence() {
    // Set user online
    usersRef.child(currentUser.id).update({
        isOnline: true,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    // Setup disconnect handler
    usersRef.child(currentUser.id).onDisconnect().update({
        isOnline: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    // Heartbeat to keep presence active
    setInterval(() => {
        if (currentUser.id) {
            usersRef.child(currentUser.id).update({
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }, 30000);

    // Load online users
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

// Message functions
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

    // Show loading indicator for mobile
    if ('ontouchstart' in window) {
        const loading = document.createElement('div');
        loading.className = 'message system';
        loading.textContent = 'Uploading image...';
        elements.messagesContainer.appendChild(loading);
        scrollToBottom();
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        // Remove loading indicator if exists
        if ('ontouchstart' in window) {
            const loadingElements = document.querySelectorAll('.message.system');
            const lastLoading = loadingElements[loadingElements.length - 1];
            if (lastLoading && lastLoading.textContent === 'Uploading image...') {
                elements.messagesContainer.removeChild(lastLoading);
            }
        }

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

// Typing indicators
function updateTyping(typing) {
    if (!currentUser.id) return;
    
    if (typing !== isTyping) {
        isTyping = typing;
        typingRef.child(currentUser.id).set(isTyping ? currentUser.username || currentUser.name : null);
    }
    
    // Reset typing timeout
    clearTimeout(lastTypingTime);
    if (typing) {
        lastTypingTime = setTimeout(() => {
            updateTyping(false);
        }, TYPING_TIMEOUT);
    }
}

// Message display
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

    // Typing indicators
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

    // Handle reply context if exists
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

    // Create message content based on type
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
        
        // Add status indicator for user's own messages
        if (message.senderId === currentUser.id && message.status) {
            messageContent += `
                <span class="message-status ${message.status}" title="${message.status === 'delivered' ? 'Delivered' : 'Read'}"></span>
            `;
        }
    } 
    else {
        // System message
        messageElement.className = `message system ${message.type || ''}`;
        messageContent = message.text;
    }

    // Add action buttons (reply, delete) if applicable
    if (!isExpired && message.senderId && message.type !== 'system') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        // Add reply button for received messages
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
        
        // Add delete button for user's own messages
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
    
    // Mark messages as read when displayed
    if (message.senderId !== currentUser.id && !message.read) {
        messagesRef.child(messageId).update({ read: true });
    }
}

// Message management
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

// Voice recording
function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = processRecording;
            mediaRecorder.start(100); // Collect data every 100ms
            
            // Update UI
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
            duration: Math.round(audioBlob.size / 1000), // Approximate duration in seconds
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
        
        // Reset UI
        elements.startRecording.style.display = 'block';
        elements.stopRecording.style.display = 'none';
        elements.recordingStatus.style.display = 'none';
        audioChunks = [];
    };
    
    reader.readAsDataURL(audioBlob);
}

// Utility functions
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
        .replace(/'/g, "&#039;");
}

// UI Helpers
function setupEventListeners() {
    // Dark mode toggle
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    
    // Message sending
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !elements.sendButton.disabled) {
            sendMessage();
        }
    });

    // Typing indicator
    elements.messageInput.addEventListener('input', () => {
        elements.sendButton.disabled = elements.messageInput.value.trim() === '';
        updateTyping(elements.messageInput.value.trim() !== '');
    });

    // File attachment
    elements.attachButton.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileUpload);
    
    // Voice recording
    elements.startRecording.addEventListener('click', startRecording);
    elements.stopRecording.addEventListener('click', stopRecording);
    
    // Reply functionality
    elements.cancelReply.addEventListener('click', cancelReply);
    
    // Online users panel
    elements.onlineUsersToggle.addEventListener('click', toggleOnlineUsersPanel);
    
    // Keyboard shortcuts
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
    
    // Better touch handling
    document.addEventListener('touchstart', function() {}, {passive: true});
    
    // Prevent double-tap zoom
    let lastTouch = 0;
    document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouch <= 300) {
            event.preventDefault();
        }
        lastTouch = now;
    }, {passive: false});
    
    // Mobile-specific event listeners
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

function showAuthModal() {
    elements.authModal.style.display = 'flex';
    elements.loginEmail.focus();
}

function hideAuthModals() {
    elements.authModal.style.display = 'none';
    elements.usernameModal.style.display = 'none';
}

function showUsernameModal() {
    elements.usernameModal.style.display = 'flex';
    elements.usernameInput.focus();
}

function hideUsernameModal() {
    elements.usernameModal.style.display = 'none';
}

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    if (currentUser.id) {
        usersRef.child(currentUser.id).update({
            isOnline: false,
            lastActive: firebase.database.ServerValue.TIMESTAMP
        });
    }
});

// Initialize the app
document.addEventListener('DOMContentLoaded', init);
