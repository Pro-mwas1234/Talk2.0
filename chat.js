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
  startRecording: document.getElementById('startRecording'),
  stopRecording: document.getElementById('stopRecording'),
  recordingStatus: document.getElementById('recordingStatus'),
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
  replyingTo: null,
  onlineUsers: {},
  mediaRecorder: null,
  audioChunks: [],
  unreadCount: 0,
  lastDeletedMessage: null,
  undoTimeout: null
};

// Constants
const TYPING_TIMEOUT = 3000;
const UNDO_TIMEOUT = 5000;
const MESSAGE_EXPIRY_MINUTES = 525000;

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
  
  // Check for MediaRecorder support
  if (!window.MediaRecorder) {
    elements.startRecording.style.display = 'none';
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
  messageElement.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
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

  // Add status ticks for sent messages
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
      if (permission === 'granted') {
        console.log('Notification permission granted');
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
      message.timestamp < state.currentUser.joinTime ||
      message.readBy?.[state.currentUser.id]) {
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(`New message from ${message.senderName}`, {
      body: message.text || '[Media]',
      icon: 'icon.png'
    });
    
    // Update unread count
    state.unreadCount++;
    updateNotificationBadge();
  }
}

function updateNotificationBadge() {
  if (state.unreadCount > 0) {
    elements.notificationBadge.textContent = state.unreadCount;
    elements.notificationBadge.style.display = 'flex';
  } else {
    elements.notificationBadge.style.display = 'none';
  }
}

function resetUnreadCount() {
  state.unreadCount = 0;
  updateNotificationBadge();
}

/* ====================== */
/* AUTHENTICATION SYSTEM  */
/* ====================== */

function setupAuth() {
  // Tab switching between login/register
  elements.authTabs.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      elements.authTabs.querySelector('.active').classList.remove('active');
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
}

async function handleLogin() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return userCredential;
  } catch (error) {
    console.error("Login error:", error);
    alert(getAuthErrorMessage(error.code));
    throw error;
  }
}

async function handleRegister() {
  const name = elements.registerName.value.trim();
  const email = elements.registerEmail.value.trim();
  const password = elements.registerPassword.value;

  try {
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
    return userCredential;
  } catch (error) {
    console.error("Registration error:", error);
    alert(getAuthErrorMessage(error.code));
    throw error;
  }
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/invalid-email': 'Invalid email address',
    'auth/user-disabled': 'Account disabled',
    'auth/user-not-found': 'Account not found',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'Email already in use',
    'auth/weak-password': 'Password must be at least 6 characters',
    'default': 'Authentication failed. Please try again.'
  };
  return messages[code] || messages['default'];
}

/* ====================== */
/* VOICE MESSAGING        */
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
      
      // UI updates
      elements.startRecording.style.display = 'none';
      elements.stopRecording.style.display = 'block';
      elements.recordingStatus.style.display = 'flex';
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
    const messageData = {
      type: 'voice',
      audioData: reader.result,
      senderId: state.currentUser.id,
      senderName: state.currentUser.name,
      timestamp: Date.now(),
      status: MESSAGE_STATUS.SENT
    };

    if (state.replyingTo) {
      messageData.replyTo = state.replyingTo;
    }

    messagesRef.push().set(messageData)
      .then(() => {
        if (state.replyingTo) cancelReply();
      });
  };
  
  reader.readAsDataURL(audioBlob);
  state.audioChunks = [];
}

/* ====================== */
/* UTILITY FUNCTIONS      */
/* ====================== */

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scrollToBottom() {
  setTimeout(() => {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }, 100);
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
