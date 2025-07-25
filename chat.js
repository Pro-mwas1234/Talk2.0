// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrltFCORxJ5HpGMlho7FWj1Pk1G0BjLso",
  authDomain: "nini-1bbf7.firebaseapp.com",
  projectId: "nini-1bbf7",
  storageBucket: "nini-1bbf7.appspot.com",
  messagingSenderId: "330113060420",
  appId: "1:330113060420:web:7eca36a70c81c63237b611",
  measurementId: "G-ZMCHFDQGDV"
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
  chatTitle: document.getElementById('chatTitle'),
  notificationBadge: document.querySelector('.notification-badge'),
  undoToast: document.getElementById('undoToast'),
  undoDelete: document.getElementById('undoDelete')
};

// App State
let currentUser = {
  id: null,
  name: null,
  username: null,
  isAuthenticated: false
};

let isTyping = false;
let lastTypingTime = 0;
let expiryTimer = null;
let replyingTo = null;
let onlineUsers = {};
let mediaRecorder;
let audioChunks = [];
const TYPING_TIMEOUT = 3000;
const MESSAGE_EXPIRY_MINUTES = 525000;
let failedAuthAttempts = 0;
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_TIMEOUT = 30000;
let lastMessageTimestamp = 0;
let notificationPermission = false;
let unreadCount = 0;
let lastDeletedMessage = null;
let undoTimeout = null;
const UNDO_TIMEOUT = 5000;
const notificationSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');

// Firebase References
const messagesRef = database.ref('messages');
const typingRef = database.ref('typing');
const usersRef = database.ref('users');
const usernamesRef = database.ref('usernames');

// Message Status Constants
const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read'
};

// Initialize App
function init() {
  checkNotificationPermission();
  auth.onAuthStateChanged(handleAuthStateChange);
  setupAuth();
  setupUsernameSelection();
  updateDarkMode();
  setupEventListeners();
  setupMobileFeatures();
  detectIOS();
  setupEmojiPicker();
  
  if (!window.MediaRecorder && elements.startRecording) {
    elements.startRecording.style.display = 'none';
    console.warn("Voice recording not supported in this browser");
  }
  
  window.addEventListener('focus', () => {
    markMessagesAsRead();
    resetUnreadCount();
  });
}

// Message Functions with Status Tracking
function sendMessage() {
  const messageText = elements.messageInput.value.trim();
  if (!messageText || !currentUser.id) return;

  const messageData = {
    text: messageText,
    senderId: currentUser.id,
    senderName: currentUser.username,
    timestamp: Date.now(),
    status: MESSAGE_STATUS.SENT,
    readBy: {}
  };

  if (replyingTo) {
    messageData.replyTo = replyingTo;
  }

  const newMessageRef = messagesRef.push();
  const messageId = newMessageRef.key;

  // Optimistically display message
  displayMessage({
    ...messageData,
    id: messageId
  }, true);

  // Send to Firebase
  newMessageRef.set(messageData)
    .then(() => {
      // Update status to delivered
      newMessageRef.update({ status: MESSAGE_STATUS.DELIVERED });
      
      // Setup status listener
      setupMessageStatusListener(messageId);
      
      if (elements.messageInput) elements.messageInput.value = '';
      if (elements.sendButton) elements.sendButton.disabled = true;
      updateTyping(false);
      
      if (replyingTo) {
        cancelReply();
      }
    })
    .catch(error => {
      console.error("Error sending message:", error);
      markMessageAsFailed(messageId);
    });
}

function setupMessageStatusListener(messageId) {
  messagesRef.child(messageId).on('value', (snapshot) => {
    const message = snapshot.val();
    if (!message) return;
    
    updateMessageStatusUI(messageId, message.status, message.readBy);
  });
}

function updateMessageStatusUI(messageId, status, readBy = {}) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageElement) return;

  const statusElement = messageElement.querySelector('.message-status');
  if (!statusElement) return;

  // Update status icon
  statusElement.className = `message-status ${status}`;
  statusElement.innerHTML = status === MESSAGE_STATUS.READ 
    ? '<i class="fas fa-check-double"></i>' 
    : '<i class="fas fa-check"></i>';

  // Update read receipts if available
  if (status === MESSAGE_STATUS.READ && Object.keys(readBy).length > 0) {
    updateReadReceipts(messageElement, readBy);
  }
}

function updateReadReceipts(messageElement, readBy) {
  let receiptsHtml = '<div class="read-receipts">';
  Object.keys(readBy).forEach(userId => {
    receiptsHtml += '<div class="read-receipt" title="Read"></div>';
  });
  receiptsHtml += '</div>';
  
  const existingReceipts = messageElement.querySelector('.read-receipts');
  if (existingReceipts) {
    existingReceipts.innerHTML = receiptsHtml;
  } else {
    messageElement.querySelector('.timestamp').insertAdjacentHTML('afterend', receiptsHtml);
  }
}

function markMessageAsFailed(messageId) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.classList.add('error');
    setTimeout(() => messageElement.classList.remove('error'), 1000);
  }
}

function markMessagesAsRead() {
  const unreadMessages = document.querySelectorAll('.message.received:not(.read)');
  
  unreadMessages.forEach(msg => {
    const messageId = msg.dataset.messageId;
    if (!messageId) return;
    
    messagesRef.child(messageId).update({
      status: MESSAGE_STATUS.READ,
      [`readBy/${currentUser.id}`]: true
    });
    
    msg.classList.add('read');
  });
}

// Notification System
function checkNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      notificationPermission = permission === 'granted';
      if (!notificationPermission) {
        console.log('Notification permission denied');
      }
    });
  }
}

function showNotification(message) {
  // Don't notify if already read by current user
  if (message.readBy && message.readBy[currentUser.id]) return;
  
  // Don't notify about your own messages
  if (message.senderId === currentUser.id) return;
  
  // Don't notify when window is focused
  if (document.hasFocus()) return;

  if (notificationPermission) {
    try {
      const notification = new Notification('New Message', {
        body: `${message.senderName}: ${message.text || '[Media]'}`,
        icon: 'https://img.icons8.com/cotton/100/filled-chat--v1.png'
      });
      
      notificationSound.play().catch(e => console.log("Notification sound error:", e));
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.log("Notification error:", error);
    }
  }
  
  // Update badge count
  updateNotificationBadge();
}

function updateNotificationBadge() {
  if (!elements.notificationBadge) return;
  
  unreadCount++;
  elements.notificationBadge.textContent = unreadCount;
  elements.notificationBadge.style.display = 'flex';
}

function resetUnreadCount() {
  unreadCount = 0;
  if (elements.notificationBadge) {
    elements.notificationBadge.style.display = 'none';
  }
}


// Initialize App
function init() {
    checkNotificationPermission();
    auth.onAuthStateChanged(handleAuthStateChange);
    setupAuth();
    setupUsernameSelection();
    updateDarkMode();
    setupEventListeners();
    setupMobileFeatures();
    detectIOS();
    setupEmojiPicker();
    
    if (!window.MediaRecorder && elements.startRecording) {
        elements.startRecording.style.display = 'none';
        console.warn("Voice recording not supported in this browser");
    }
    
    window.addEventListener('focus', resetUnreadCount);
}

// Authentication Functions
function setupAuth() {
    if (!elements.authTabs) return;

    elements.authTabs.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            elements.authTabs.querySelector('.active')?.classList.remove('active');
            tab.classList.add('active');
            if (elements.loginForm) {
                elements.loginForm.style.display = tab.dataset.tab === 'login' ? 'flex' : 'none';
            }
            if (elements.registerForm) {
                elements.registerForm.style.display = tab.dataset.tab === 'register' ? 'flex' : 'none';
            }
        });
    });

    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', handleLogin);
    }
    if (elements.loginPassword) {
        elements.loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    if (elements.registerBtn) {
        elements.registerBtn.addEventListener('click', handleRegister);
    }
    if (elements.registerPassword) {
        elements.registerPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleRegister();
        });
    }

    const resetLink = document.createElement('a');
    resetLink.href = '#';
    resetLink.textContent = 'Forgot password?';
    resetLink.className = 'reset-password';
    resetLink.addEventListener('click', handlePasswordReset);
    if (elements.loginForm) {
        elements.loginForm.appendChild(resetLink);
    }
}

async function handleLogin() {
    if (failedAuthAttempts >= MAX_AUTH_ATTEMPTS) {
        alert(`Too many attempts. Please wait ${AUTH_TIMEOUT/1000} seconds.`);
        return;
    }

    const email = elements.loginEmail?.value.trim() || '';
    const password = elements.loginPassword?.value || '';

    if (!validateEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        failedAuthAttempts = 0;
        return userCredential;
    } catch (error) {
        failedAuthAttempts++;
        console.error("Login error:", error);
        alert(getEnhancedAuthErrorMessage(error.code));
        
        if (failedAuthAttempts >= MAX_AUTH_ATTEMPTS) {
            setTimeout(() => {
                failedAuthAttempts = 0;
            }, AUTH_TIMEOUT);
        }
        throw error;
    }
}

async function handleRegister() {
    const name = elements.registerName?.value.trim() || '';
    const email = elements.registerEmail?.value.trim() || '';
    const password = elements.registerPassword?.value || '';

    if (!name || !email || !password) {
        alert('Please fill all fields');
        return;
    }

    if (!validateEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        const methods = await auth.fetchSignInMethodsForEmail(email);
        if (methods.length > 0) {
            throw new Error('auth/email-already-in-use');
        }

        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await usersRef.child(userCredential.user.uid).set({
            displayName: name,
            email: email,
            isOnline: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });

        hideAuthModals();
        showUsernameModal();
        currentUser.id = userCredential.user.uid;
        currentUser.name = name;
        return userCredential;
    } catch (error) {
        console.error("Registration error:", error);
        alert(getEnhancedAuthErrorMessage(error.code || error.message));
        throw error;
    }
}

async function handlePasswordReset() {
    const email = prompt('Enter your email to reset password:');
    if (!email) return;

    if (!validateEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        alert('Password reset email sent! Check your inbox.');
    } catch (error) {
        console.error("Password reset error:", error);
        alert(getEnhancedAuthErrorMessage(error.code));
    }
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getEnhancedAuthErrorMessage(errorCode) {
    const messages = {
        'auth/invalid-email': 'Invalid email address format',
        'auth/user-disabled': 'Account disabled. Contact support.',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password. Try again or reset password.',
        'auth/email-already-in-use': 'Email already in use. Try logging in.',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/operation-not-allowed': 'Email/password accounts not enabled',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'default': 'Authentication failed. Please try again.'
    };
    return messages[errorCode] || messages['default'];
}

// Username Management
function setupUsernameSelection() {
    if (elements.usernameInput) {
        elements.usernameInput.addEventListener('input', debounce(checkUsernameAvailability, 500));
    }
    if (elements.submitUsernameBtn) {
        elements.submitUsernameBtn.addEventListener('click', saveUsername);
    }
}

async function checkUsernameAvailability() {
    const username = elements.usernameInput?.value.trim() || '';
    
    if (!username.match(/^[a-zA-Z0-9_]{3,15}$/)) {
        if (elements.usernameAvailability) {
            elements.usernameAvailability.textContent = '3-15 alphanumeric characters';
            elements.usernameAvailability.className = 'username-taken';
        }
        return;
    }

    try {
        const snapshot = await usernamesRef.child(username.toLowerCase()).once('value');
        if (elements.usernameAvailability) {
            if (snapshot.exists()) {
                elements.usernameAvailability.textContent = 'Username taken';
                elements.usernameAvailability.className = 'username-taken';
            } else {
                elements.usernameAvailability.textContent = 'Username available';
                elements.usernameAvailability.className = 'username-available';
            }
        }
    } catch (error) {
        console.error("Error checking username:", error);
        if (elements.usernameAvailability) {
            elements.usernameAvailability.textContent = 'Error checking';
            elements.usernameAvailability.className = 'username-taken';
        }
    }
}

async function saveUsername() {
    const username = elements.usernameInput?.value.trim() || '';
    
    if (!username.match(/^[a-zA-Z0-9_]{3,15}$/)) {
        alert('Username must be 3-15 alphanumeric characters');
        return;
    }

    try {
        const snapshot = await usernamesRef.child(username.toLowerCase()).once('value');
        if (snapshot.exists()) {
            throw new Error('Username already taken');
        }

        const updates = {};
        updates[`usernames/${username.toLowerCase()}`] = currentUser.id;
        updates[`users/${currentUser.id}/username`] = username;
        updates[`users/${currentUser.id}/usernameLower`] = username.toLowerCase();
        updates[`users/${currentUser.id}/isOnline`] = true;

        await database.ref().update(updates);

        currentUser.username = username;
        currentUser.isAuthenticated = true;
        hideUsernameModal();
        loadMessages();
        setupPresence();
    } catch (error) {
        console.error("Username save error:", error);
        if (elements.usernameAvailability) {
            elements.usernameAvailability.textContent = 'Error saving username';
            elements.usernameAvailability.className = 'username-taken';
        }
        alert(error.message.includes('taken') 
            ? 'Username already taken. Please choose another.' 
            : 'Error saving username. Please try again.');
    }
}

// User Presence
function setupPresence() {
    if (!currentUser.id) return;

    const userStatusRef = usersRef.child(currentUser.id);
    
    userStatusRef.update({
        isOnline: true,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    userStatusRef.onDisconnect().update({
        isOnline: false,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    const presenceInterval = setInterval(() => {
        if (currentUser.id) {
            userStatusRef.update({
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        } else {
            clearInterval(presenceInterval);
        }
    }, 30000);

    usersRef.orderByChild('isOnline').equalTo(true).on('value', (snapshot) => {
        onlineUsers = {};
        if (elements.onlineUsersList) {
            elements.onlineUsersList.innerHTML = '';
        }
        
        snapshot.forEach((childSnapshot) => {
            const user = childSnapshot.val();
            if (!user) return;
            
            onlineUsers[childSnapshot.key] = user;
            
            if (childSnapshot.key !== currentUser.id && elements.onlineUsersList) {
                const userElement = document.createElement('div');
                userElement.className = 'online-user';
                userElement.innerHTML = `
                    <span class="status-indicator"></span>
                    <span class="user-name">${user.username || user.displayName || 'Anonymous'}</span>
                    ${user.isTyping ? '<span class="typing-badge">typing...</span>' : ''}
                `;
                elements.onlineUsersList.appendChild(userElement);
            }
        });
        
        if (elements.onlineUsersList && elements.onlineUsersList.children.length === 0) {
            elements.onlineUsersList.innerHTML = '<div class="no-users">No other users online</div>';
        }
    });
}

// Message Functions
function sendMessage() {
    const messageText = elements.messageInput?.value.trim() || '';
    if (!messageText || !currentUser.id) return;

    const sanitizedText = escapeHtml(messageText).substring(0, 1000);
    const timestamp = Date.now();
    const messageData = {
        text: sanitizedText,
        senderId: currentUser.id,
        senderName: currentUser.username,
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
            if (elements.messageInput) elements.messageInput.value = '';
            if (elements.sendButton) elements.sendButton.disabled = true;
            updateTyping(false);
            
            if (replyingTo) {
                cancelReply();
            }
        })
        .catch(error => {
            console.error("Error sending message:", error);
            alert('Failed to send message. Please try again.');
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
            senderName: currentUser.username,
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
        typingRef.child(currentUser.id).set(isTyping ? currentUser.username : null);
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
        
        if (message.senderId !== currentUser.id && 
            message.timestamp > lastMessageTimestamp) {
            lastMessageTimestamp = message.timestamp;
            showNotification(message);
        }
        
        displayMessage(message, snapshot.key, isExpired);
        
        if (!expiryTimer && !isExpired) {
            setExpiryTimer(message.timestamp);
        }
        
        scrollToBottom();
    });

    typingRef.on('value', (snapshot) => {
        const typingData = snapshot.val() || {};
        if (elements.typingUsers) {
            elements.typingUsers.innerHTML = '';
        }
        
        const activeTypers = Object.entries(typingData)
            .filter(([userId, userName]) => 
                userName && 
                userId !== currentUser.id && 
                onlineUsers[userId]
            );
        
        if (activeTypers.length > 0 && elements.typingUsers) {
            activeTypers.forEach(([userId, userName]) => {
                const typingElement = document.createElement('div');
                typingElement.className = 'typing-user';
                typingElement.innerHTML = `
                    <span class="typing-dots">
                        <span></span><span></span><span></span>
                    </span>
                    ${userName} is typing
                `;
                elements.typingUsers.appendChild(typingElement);
            });
            if (elements.typingIndicator) {
                elements.typingIndicator.style.display = 'block';
            }
        } else if (elements.typingIndicator) {
            elements.typingIndicator.style.display = 'none';
        }
    });
}

function displayMessage(message, messageId, isExpired = false) {
    if (!elements.messagesContainer || message.deleted || isExpired) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
    messageElement.dataset.messageId = messageId;
    
    const timeString = new Date(message.timestamp).toLocaleTimeString([], 
        { hour: '2-digit', minute: '2-digit' });

    let messageContent = '';
    
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
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <div class="voice-message">
                <audio controls src="${message.audioData}"></audio>
            </div>
            <span class="timestamp">${timeString}</span>
        `;
    } 
    else if (message.type === 'image') {
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <img src="${message.imageUrl}" class="message-image" alt="Sent image">
            <span class="timestamp">${timeString}</span>
        `;
    }
    else if (message.senderId) {
        messageContent = `
            <div class="message-header">
                <span class="message-username">${message.senderName}</span>
            </div>
            <div class="message-text">${escapeHtml(message.text)}</div>
            <span class="timestamp">${timeString}</span>
        `;
        
        if (message.senderId === currentUser.id && message.status) {
            messageContent += `
                <span class="message-status ${message.status}">
                    <i class="fas fa-check${message.status === 'read' ? '-double' : ''}"></i>
                </span>
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
async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    try {
        lastDeletedMessage = {
            id: messageId,
            element: messageElement.cloneNode(true),
            data: await getMessageData(messageId)
        };
        
        messageElement.classList.add('deleting');
        const deleteBtn = messageElement.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        await messagesRef.child(messageId).update({ 
            deleted: true,
            deletedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showUndoToast();
        
        undoTimeout = setTimeout(() => {
            messageElement.remove();
            hideUndoToast();
        }, UNDO_TIMEOUT);
        
    } catch (error) {
        console.error("Delete failed:", error);
        messageElement.classList.remove('deleting');
        messageElement.classList.add('error');
        setTimeout(() => messageElement.classList.remove('error'), 1000);
        
        const deleteBtn = messageElement.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    }
}

async function getMessageData(messageId) {
    const snapshot = await messagesRef.child(messageId).once('value');
    return snapshot.val();
}

function showUndoToast() {
    if (!elements.undoToast) return;
    const toast = elements.undoToast;
    toast.style.display = 'flex';
    setTimeout(() => toast.style.opacity = '1', 10);
}

function hideUndoToast() {
    if (!elements.undoToast) return;
    const toast = elements.undoToast;
    toast.style.opacity = '0';
    setTimeout(() => toast.style.display = 'none', 300);
}

async function undoDelete() {
    if (!lastDeletedMessage) return;
    
    clearTimeout(undoTimeout);
    hideUndoToast();
    
    try {
        await messagesRef.child(lastDeletedMessage.id).update({
            deleted: false,
            deletedAt: null
        });
        
        if (!document.querySelector(`[data-message-id="${lastDeletedMessage.id}"]`)) {
            elements.messagesContainer.appendChild(lastDeletedMessage.element);
        }
        
    } catch (error) {
        console.error("Undo failed:", error);
        alert('Failed to undo deletion. Please try again.');
    }
    
    lastDeletedMessage = null;
}

function setupReply(messageId, messageText, senderName) {
    if (replyingTo) {
        const previousMessage = document.querySelector(`[data-message-id="${replyingTo}"]`);
        if (previousMessage) previousMessage.classList.remove('replying-to');
    }

    replyingTo = messageId;
    if (elements.replyPreview) {
        elements.replyPreview.style.display = 'flex';
        elements.replyPreview.querySelector('.reply-preview-text').innerHTML = `
            <span>Replying to <strong>${senderName}</strong>:</span>
            <span class="reply-content">${escapeHtml(truncateText(messageText, 50))}</span>
        `;
        
        elements.replyPreview.querySelector('.reply-content').onclick = () => {
            scrollToMessage(messageId);
        };
    }
    
    scrollToMessage(messageId, true);
}

function scrollToMessage(messageId, highlight = false) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    if (highlight) {
        messageElement.classList.add('replying-to');
        setTimeout(() => {
            messageElement.classList.remove('replying-to');
        }, 2000);
    }
    
    messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

function cancelReply() {
    if (replyingTo) {
        const originalMessage = document.querySelector(`[data-message-id="${replyingTo}"]`);
        if (originalMessage) originalMessage.classList.remove('replying-to');
    }
    if (elements.replyPreview) {
        elements.replyPreview.style.display = 'none';
    }
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
            
            if (elements.startRecording) elements.startRecording.style.display = 'none';
            if (elements.stopRecording) elements.stopRecording.style.display = 'block';
            if (elements.recordingStatus) elements.recordingStatus.style.display = 'block';
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
            senderName: currentUser.username,
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
        
        if (elements.startRecording) elements.startRecording.style.display = 'block';
        if (elements.stopRecording) elements.stopRecording.style.display = 'none';
        if (elements.recordingStatus) elements.recordingStatus.style.display = 'none';
        audioChunks = [];
    };
    
    reader.readAsDataURL(audioBlob);
}

// Emoji Picker
function setupEmojiPicker() {
    if (!elements.emojiButton || !elements.emojiPicker) return;

    elements.emojiButton.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.emojiPicker.classList.toggle('active');
    });

    elements.emojiPicker.addEventListener('emoji-click', (event) => {
        const emoji = event.detail.unicode;
        if (elements.messageInput) {
            elements.messageInput.value += emoji;
            elements.emojiPicker.classList.remove('active');
            elements.messageInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!elements.emojiButton?.contains(e.target) && !elements.emojiPicker?.contains(e.target)) {
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

function truncateText(text, length) {
    return text.length > length ? text.substring(0, length) + '...' : text;
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
    if (!elements.messagesContainer) return;
    const messageElement = document.createElement('div');
    messageElement.className = `message system ${type}`;
    messageElement.textContent = text;
    elements.messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

function scrollToBottom() {
    if (!elements.messagesContainer) return;
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
    if (elements.darkModeToggle) {
        elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    }
    if (elements.sendButton) {
        elements.sendButton.addEventListener('click', sendMessage);
    }
    if (elements.messageInput) {
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && elements.sendButton && !elements.sendButton.disabled) {
                sendMessage();
            }
        });
        elements.messageInput.addEventListener('input', () => {
            if (elements.sendButton) {
                elements.sendButton.disabled = elements.messageInput.value.trim() === '';
            }
            updateTyping(elements.messageInput.value.trim() !== '');
        });
    }
    if (elements.attachButton) {
        elements.attachButton.addEventListener('click', () => elements.fileInput?.click());
    }
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileUpload);
    }
    if (elements.startRecording) {
        elements.startRecording.addEventListener('click', startRecording);
    }
    if (elements.stopRecording) {
        elements.stopRecording.addEventListener('click', stopRecording);
    }
    if (elements.cancelReply) {
        elements.cancelReply.addEventListener('click', cancelReply);
    }
    if (elements.onlineUsersToggle) {
        elements.onlineUsersToggle.addEventListener('click', toggleOnlineUsersPanel);
    }
    if (elements.undoDelete) {
        elements.undoDelete.addEventListener('click', undoDelete);
    }
    
    if (elements.messagesContainer) {
        elements.messagesContainer.addEventListener('click', (e) => {
            const messageElement = e.target.closest('.message');
            if (!messageElement) {
                document.querySelectorAll('.message').forEach(msg => {
                    msg.classList.remove('active');
                });
                return;
            }
            
            document.querySelectorAll('.message').forEach(msg => {
                msg.classList.remove('active');
            });
            messageElement.classList.add('active');
        });
        
        elements.messagesContainer.addEventListener('click', (e) => {
            const replyBtn = e.target.closest('.reply-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            
            if (replyBtn) {
                e.stopPropagation();
                const messageElement = replyBtn.closest('.message');
                const messageId = messageElement.dataset.messageId;
                const messageText = messageElement.querySelector('.message-text')?.textContent || '[Media]';
                const senderName = messageElement.querySelector('.message-username')?.textContent || 'Unknown';
                setupReply(messageId, messageText, senderName);
            }
            
            if (deleteBtn) {
                e.stopPropagation();
                const messageId = deleteBtn.dataset.messageId;
                deleteMessage(messageId);
            }
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && replyingTo) {
            cancelReply();
        }
    });
}

function toggleOnlineUsersPanel() {
    if (!elements.onlineUsersPanel) return;
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
            if (keyboardHelper) {
                keyboardHelper.style.height = isKeyboardOpen ? '300px' : '0';
            }
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
    
    if ('ontouchstart' in window && elements.onlineUsersToggle) {
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
        if (elements.messageInput) {
            elements.messageInput.style.fontSize = '16px';
        }
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
    if (elements.darkModeToggle) {
        elements.darkModeToggle.innerHTML = darkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        elements.darkModeToggle.title = darkMode ? 'Switch to light mode' : 'Switch to dark mode';
    }
}

// Modal Control
function showAuthModal() {
    if (elements.authModal) {
        elements.authModal.classList.add('show');
        if (elements.loginEmail) elements.loginEmail.focus();
    }
}

function hideAuthModals() {
    if (elements.authModal) elements.authModal.classList.remove('show');
    if (elements.usernameModal) elements.usernameModal.classList.remove('show');
}

function showUsernameModal() {
    if (elements.usernameModal) {
        elements.usernameModal.classList.add('show');
        if (elements.usernameInput) elements.usernameInput.focus();
    }
}

function hideUsernameModal() {
    if (elements.usernameModal) elements.usernameModal.classList.remove('show');
}

// Auth State Handler
async function handleAuthStateChange(user) {
    console.log("Auth state changed:", user);
    
    if (user) {
        currentUser.id = user.uid;
        
        try {
            const snapshot = await usersRef.child(user.uid).once('value');
            const userData = snapshot.val();
            
            if (!userData) {
                await auth.signOut();
                showAuthModal();
                alert("Account not properly set up. Please register again.");
                return;
            }
            
            if (userData.username) {
                currentUser.name = userData.username;
                currentUser.username = userData.username;
                currentUser.isAuthenticated = true;
                hideAuthModals();
                loadMessages();
                setupPresence();
            } else {
                hideAuthModals();
                showUsernameModal();
            }
        } catch (error) {
            console.error("User data error:", error);
            await auth.signOut();
            showAuthModal();
            alert("Error loading user data. Please try again.");
        }
    } else {
        currentUser = { 
            id: null, 
            name: null, 
            username: null,
            isAuthenticated: false 
        };
        showAuthModal();
    }
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
