// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrltFCORxJ5HpGMlho7FWj1Pk1G0BjLso",
  authDomain: "nini-1bbf7.firebaseapp.com",
  databaseURL: "https://nini-1bbf7-default-rtdb.firebaseio.com",
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
const state = {
  currentUser: {
    id: null,
    name: null,
    username: null,
    joinTime: null,
    isAuthenticated: false
  },
  isTyping: false,
  lastTypingTime: 0,
  expiryTimer: null,
  replyingTo: null,
  onlineUsers: {},
  mediaRecorder: null,
  audioChunks: [],
  failedAuthAttempts: 0,
  lastMessageTimestamp: 0,
  unreadCount: 0,
  lastDeletedMessage: null,
  undoTimeout: null,
  notificationPermission: false
};

// Constants
const TYPING_TIMEOUT = 3000;
const UNDO_TIMEOUT = 5000;
const MESSAGE_EXPIRY_MINUTES = 525000;
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_TIMEOUT = 30000;
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
  setupEventListeners();
  checkNotificationPermission();
  auth.onAuthStateChanged(handleAuthStateChange);
  updateDarkMode();
  setupAuth();
  setupUsernameSelection();
  setupMobileFeatures();
  detectIOS();
  setupEmojiPicker();
  
  // Check for MediaRecorder support
  if (!window.MediaRecorder && elements.startRecording) {
    elements.startRecording.style.display = 'none';
    console.warn("Voice recording not supported in this browser");
  }
  
  // Reset unread count when window gains focus
  window.addEventListener('focus', () => {
    resetUnreadCount();
    markMessagesAsRead();
  });
}

/* ====================== */
/* MESSAGE FUNCTIONALITY  */
/* ====================== */

function sendMessage() {
  const messageText = elements.messageInput.value.trim();
  if (!messageText || !state.currentUser.id) return;

  const messageData = {
    text: messageText,
    senderId: state.currentUser.id,
    senderName: state.currentUser.username,
    timestamp: Date.now(),
    status: MESSAGE_STATUS.SENT,
    readBy: {}
  };

  if (state.replyingTo) {
    messageData.replyTo = state.replyingTo;
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
      newMessageRef.update({ status: MESSAGE_STATUS.DELIVERED });
      setupMessageStatusListener(messageId);
      
      elements.messageInput.value = '';
      elements.sendButton.disabled = true;
      updateTyping(false);
      
      if (state.replyingTo) cancelReply();
    })
    .catch(error => {
      console.error("Error sending message:", error);
      markMessageAsFailed(messageId);
    });
}

function displayMessage(message, isCurrentUser = false) {
  const messageElement = document.createElement('div');
  
  // Determine message alignment based on sender
  const messageClass = isCurrentUser ? 'message sent' : 'message received';
  messageElement.className = messageClass;
  messageElement.dataset.messageId = message.id;

  const timeString = new Date(message.timestamp).toLocaleTimeString([], 
    { hour: '2-digit', minute: '2-digit' });

  let messageContent = `
    <div class="message-header">
      <span class="message-username">${message.senderName}</span>
    </div>
    <div class="message-text">${escapeHtml(message.text)}</div>
    <span class="timestamp">${timeString}</span>
  `;

  // Add status ticks only for sent messages
  if (isCurrentUser) {
    messageContent += `
      <span class="message-status ${message.status}">
        ${renderStatusTicks(message.status)}
      </span>
    `;
  }

  // Add message actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  
  if (!isCurrentUser) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-btn';
    replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
    replyBtn.title = 'Reply to this message';
    replyBtn.addEventListener('click', () => {
      setupReply(message.id, message.text, message.senderName);
    });
    actionsDiv.appendChild(replyBtn);
  } else {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = 'Delete message';
    deleteBtn.addEventListener('click', () => deleteMessage(message.id));
    actionsDiv.appendChild(deleteBtn);
  }
  
  messageElement.innerHTML += messageContent + actionsDiv.outerHTML;
  elements.messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

function renderStatusTicks(status) {
  switch(status) {
    case MESSAGE_STATUS.SENT: 
      return '<div class="tick"></div>';
    case MESSAGE_STATUS.DELIVERED: 
      return '<div class="tick"></div><div class="tick"></div>';
    case MESSAGE_STATUS.READ: 
      return '<div class="tick" style="color: var(--primary-color)"></div><div class="tick" style="color: var(--primary-color)"></div>';
    default: 
      return '';
  }
}

function setupMessageStatusListener(messageId) {
  messagesRef.child(messageId).on('value', snapshot => {
    const message = snapshot.val();
    if (!message) return;
    
    updateMessageStatusUI(messageId, message.status, message.readBy);
    
    // Mark as read if current user views it
    if (!message.readBy[state.currentUser.id] && 
        message.senderId !== state.currentUser.id) {
      messagesRef.child(messageId).update({
        [`readBy/${state.currentUser.id}`]: true,
        status: MESSAGE_STATUS.READ
      });
    }
  });
}

function updateMessageStatusUI(messageId, status, readBy = {}) {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageElement) return;

  const statusElement = messageElement.querySelector('.message-status');
  if (!statusElement) return;

  statusElement.className = `message-status ${status}`;
  statusElement.innerHTML = renderStatusTicks(status);

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
      [`readBy/${state.currentUser.id}`]: true
    });
    
    msg.classList.add('read');
  });
}

/* ====================== */
/* NOTIFICATION SYSTEM    */
/* ====================== */

function checkNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      state.notificationPermission = permission === 'granted';
      if (!state.notificationPermission) {
        console.log('Notification permission denied');
      }
    });
  }
}

function showNotification(message) {
  // Don't notify if:
  // - Message is from current user
  // - Message was sent before user joined
  // - Message is already read
  if (message.senderId === state.currentUser.id || 
      (state.currentUser.joinTime && message.timestamp < state.currentUser.joinTime) ||
      message.readBy?.[state.currentUser.id]) {
    return;
  }

  if (state.notificationPermission) {
    try {
      const notification = new Notification(`New message from ${message.senderName}`, {
        body: message.text || '[Media]',
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
  
  state.unreadCount++;
  elements.notificationBadge.textContent = state.unreadCount;
  elements.notificationBadge.style.display = 'flex';
}

function resetUnreadCount() {
  state.unreadCount = 0;
  if (elements.notificationBadge) {
    elements.notificationBadge.style.display = 'none';
  }
}

/* ====================== */
/* AUTHENTICATION SYSTEM  */
/* ====================== */

function setupAuth() {
  if (!elements.authTabs) return;

  // Tab switching between login/register
  elements.authTabs.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      elements.authTabs.querySelector('.active')?.classList.remove('active');
      tab.classList.add('active');
      
      if (tab.dataset.tab === 'login') {
        elements.loginForm.style.display = 'flex';
        elements.registerForm.style.display = 'none';
      } else {
        elements.loginForm.style.display = 'none';
        elements.registerForm.style.display = 'flex';
      }
    });
  });

  // Form submissions
  elements.loginBtn.addEventListener('click', handleLogin);
  elements.registerBtn.addEventListener('click', handleRegister);
  
  // Enter key support
  elements.loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  elements.registerPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleRegister();
  });

  // Password reset link
  const resetLink = document.createElement('a');
  resetLink.href = '#';
  resetLink.textContent = 'Forgot password?';
  resetLink.className = 'reset-password';
  resetLink.addEventListener('click', handlePasswordReset);
  elements.loginForm.appendChild(resetLink);
}

async function handleLogin() {
  if (state.failedAuthAttempts >= MAX_AUTH_ATTEMPTS) {
    alert(`Too many attempts. Please wait ${AUTH_TIMEOUT/1000} seconds.`);
    return;
  }

  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  if (!validateEmail(email)) {
    alert('Please enter a valid email address');
    return;
  }

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    state.failedAuthAttempts = 0;
    return userCredential;
  } catch (error) {
    state.failedAuthAttempts++;
    console.error("Login error:", error);
    alert(getAuthErrorMessage(error.code));
    
    if (state.failedAuthAttempts >= MAX_AUTH_ATTEMPTS) {
      setTimeout(() => {
        state.failedAuthAttempts = 0;
      }, AUTH_TIMEOUT);
    }
    throw error;
  }
}

async function handleRegister() {
  const name = elements.registerName.value.trim();
  const email = elements.registerEmail.value.trim();
  const password = elements.registerPassword.value;

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
      isOnline: true,
      joinTime: Date.now()
    });

    state.currentUser.id = userCredential.user.uid;
    state.currentUser.name = name;
    hideAuthModals();
    showUsernameModal();
    return userCredential;
  } catch (error) {
    console.error("Registration error:", error);
    alert(getAuthErrorMessage(error.code || error.message));
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
    alert(getAuthErrorMessage(error.code));
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAuthErrorMessage(code) {
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
  return messages[code] || messages['default'];
}

/* ====================== */
/* USERNAME MANAGEMENT    */
/* ====================== */

function setupUsernameSelection() {
  if (!elements.usernameInput || !elements.submitUsernameBtn) return;
  
  elements.usernameInput.addEventListener('input', debounce(checkUsernameAvailability, 500));
  elements.submitUsernameBtn.addEventListener('click', saveUsername);
}

async function checkUsernameAvailability() {
  const username = elements.usernameInput.value.trim();
  
  if (!username.match(/^[a-zA-Z0-9_]{3,15}$/)) {
    elements.usernameAvailability.textContent = '3-15 alphanumeric characters';
    elements.usernameAvailability.className = 'username-taken';
    return;
  }

  try {
    const snapshot = await usernamesRef.child(username.toLowerCase()).once('value');
    if (snapshot.exists()) {
      elements.usernameAvailability.textContent = 'Username taken';
      elements.usernameAvailability.className = 'username-taken';
    } else {
      elements.usernameAvailability.textContent = 'Username available';
      elements.usernameAvailability.className = 'username-available';
    }
  } catch (error) {
    console.error("Error checking username:", error);
    elements.usernameAvailability.textContent = 'Error checking';
    elements.usernameAvailability.className = 'username-taken';
  }
}

async function saveUsername() {
  const username = elements.usernameInput.value.trim();
  
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
    updates[`usernames/${username.toLowerCase()}`] = state.currentUser.id;
    updates[`users/${state.currentUser.id}/username`] = username;
    updates[`users/${state.currentUser.id}/usernameLower`] = username.toLowerCase();
    updates[`users/${state.currentUser.id}/isOnline`] = true;

    await database.ref().update(updates);

    state.currentUser.username = username;
    state.currentUser.isAuthenticated = true;
    hideUsernameModal();
    loadMessages();
    setupPresence();
  } catch (error) {
    console.error("Username save error:", error);
    elements.usernameAvailability.textContent = 'Error saving username';
    elements.usernameAvailability.className = 'username-taken';
    alert(error.message.includes('taken') 
      ? 'Username already taken. Please choose another.' 
      : 'Error saving username. Please try again.');
  }
}

/* ====================== */
/* USER PRESENCE          */
/* ====================== */

function setupPresence() {
  if (!state.currentUser.id) return;

  const userStatusRef = usersRef.child(state.currentUser.id);
  
  userStatusRef.update({
    isOnline: true,
    lastActive: firebase.database.ServerValue.TIMESTAMP
  });

  userStatusRef.onDisconnect().update({
    isOnline: false,
    lastActive: firebase.database.ServerValue.TIMESTAMP
  });

  const presenceInterval = setInterval(() => {
    if (state.currentUser.id) {
      userStatusRef.update({
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });
    } else {
      clearInterval(presenceInterval);
    }
  }, 30000);

  usersRef.orderByChild('isOnline').equalTo(true).on('value', (snapshot) => {
    state.onlineUsers = {};
    if (elements.onlineUsersList) {
      elements.onlineUsersList.innerHTML = '';
    }
    
    snapshot.forEach((childSnapshot) => {
      const user = childSnapshot.val();
      if (!user) return;
      
      state.onlineUsers[childSnapshot.key] = user;
      
      if (childSnapshot.key !== state.currentUser.id && elements.onlineUsersList) {
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

/* ====================== */
/* TYPING INDICATORS      */
/* ====================== */

function updateTyping(typing) {
  if (!state.currentUser.id) return;
  
  if (typing !== state.isTyping) {
    state.isTyping = typing;
    typingRef.child(state.currentUser.id).set(state.isTyping ? state.currentUser.username : null);
  }
  
  clearTimeout(state.lastTypingTime);
  if (typing) {
    state.lastTypingTime = setTimeout(() => {
      updateTyping(false);
    }, TYPING_TIMEOUT);
  }
}

/* ====================== */
/* MESSAGE LOADING        */
/* ====================== */

function loadMessages() {
  clearTimeout(state.expiryTimer);
  
  messagesRef.orderByChild('timestamp').on('child_added', (snapshot) => {
    const message = snapshot.val();
    const isExpired = isMessageExpired(message);
    
    if (message.senderId !== state.currentUser.id && 
        message.timestamp > state.lastMessageTimestamp) {
      state.lastMessageTimestamp = message.timestamp;
      showNotification(message);
    }
    
    displayMessage(message, snapshot.key, isExpired);
    
    if (!state.expiryTimer && !isExpired) {
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
        userId !== state.currentUser.id && 
        state.onlineUsers[userId]
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

/* ====================== */
/* REPLIES                */
/* ====================== */

function setupReply(messageId, messageText, senderName) {
  if (state.replyingTo) {
    const previousMessage = document.querySelector(`[data-message-id="${state.replyingTo}"]`);
    if (previousMessage) previousMessage.classList.remove('replying-to');
  }

  state.replyingTo = messageId;
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
  if (state.replyingTo) {
    const originalMessage = document.querySelector(`[data-message-id="${state.replyingTo}"]`);
    if (originalMessage) originalMessage.classList.remove('replying-to');
  }
  if (elements.replyPreview) {
    elements.replyPreview.style.display = 'none';
  }
  state.replyingTo = null;
}

/* ====================== */
/* VOICE RECORDING        */
/* ====================== */

function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      state.mediaRecorder = new MediaRecorder(stream);
      state.audioChunks = [];
      
      state.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };
      
      state.mediaRecorder.onstop = processRecording;
      state.mediaRecorder.start(100);
      
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
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

function processRecording() {
  const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
  const reader = new FileReader();
  
  reader.onload = () => {
    const timestamp = Date.now();
    const messageData = {
      type: 'voice',
      audioData: reader.result,
      duration: Math.round(audioBlob.size / 1000),
      senderId: state.currentUser.id,
      senderName: state.currentUser.username,
      timestamp: timestamp,
      status: MESSAGE_STATUS.SENT
    };
    
    if (state.replyingTo) {
      messageData.replyTo = state.replyingTo;
    }

    messagesRef.push().set(messageData)
      .then(() => {
        if (state.replyingTo) {
          cancelReply();
        }
      })
      .catch(error => {
        console.error("Error sending voice message:", error);
      });
    
    if (elements.startRecording) elements.startRecording.style.display = 'block';
    if (elements.stopRecording) elements.stopRecording.style.display = 'none';
    if (elements.recordingStatus) elements.recordingStatus.style.display = 'none';
    state.audioChunks = [];
  };
  
  reader.readAsDataURL(audioBlob);
}

/* ====================== */
/* FILE UPLOADS           */
/* ====================== */

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.match('image.*')) {
    alert('Please select an image file');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const messageData = {
      imageUrl: event.target.result,
      senderId: state.currentUser.id,
      senderName: state.currentUser.username,
      timestamp: Date.now(),
      type: 'image',
      status: MESSAGE_STATUS.SENT
    };
    
    if (state.replyingTo) {
      messageData.replyTo = state.replyingTo;
    }

    messagesRef.push().set(messageData)
      .then(() => {
        if (state.replyingTo) {
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

/* ====================== */
/* MESSAGE DELETION       */
/* ====================== */

async function deleteMessage(messageId) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageElement) return;
  
  try {
    state.lastDeletedMessage = {
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
    
    state.undoTimeout = setTimeout(() => {
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
  if (!state.lastDeletedMessage) return;
  
  clearTimeout(state.undoTimeout);
  hideUndoToast();
  
  try {
    await messagesRef.child(state.lastDeletedMessage.id).update({
      deleted: false,
      deletedAt: null
    });
    
    if (!document.querySelector(`[data-message-id="${state.lastDeletedMessage.id}"]`)) {
      elements.messagesContainer.appendChild(state.lastDeletedMessage.element);
    }
    
  } catch (error) {
    console.error("Undo failed:", error);
    alert('Failed to undo deletion. Please try again.');
  }
  
  state.lastDeletedMessage = null;
}

/* ====================== */
/* EMOJI PICKER          */
/* ====================== */

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

/* ====================== */
/* UTILITY FUNCTIONS      */
/* ====================== */

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
    state.expiryTimer = setTimeout(() => {
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
    state.expiryTimer = null;
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

/* ====================== */
/* UI HELPERS             */
/* ====================== */

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
    if (e.key === 'Escape' && state.replyingTo) {
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

/* ====================== */
/* DARK MODE              */
/* ====================== */

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

/* ====================== */
/* MODAL CONTROL          */
/* ====================== */

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

/* ====================== */
/* AUTH STATE HANDLER     */
/* ====================== */

async function handleAuthStateChange(user) {
  console.log("Auth state changed:", user);
  
  if (user) {
    state.currentUser.id = user.uid;
    
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
        state.currentUser.name = userData.username;
        state.currentUser.username = userData.username;
        state.currentUser.joinTime = userData.joinTime || Date.now();
        state.currentUser.isAuthenticated = true;
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
    state.currentUser = { 
      id: null, 
      name: null, 
      username: null,
      joinTime: null,
      isAuthenticated: false 
    };
    showAuthModal();
  }
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
  if (state.currentUser.id) {
    usersRef.child(state.currentUser.id).update({
      isOnline: false,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', init);
