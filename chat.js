// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAa6iZDF9wEa_CF2LDU_TEsZF6uxdDCWxg",
  authDomain: "chat01-baa5d.firebaseapp.com",
  databaseURL: "https://chat01-baa5d-default-rtdb.firebaseio.com",
  projectId: "chat01-baa5d",
  storageBucket: "chat01-baa5d.appspot.com",
  messagingSenderId: "333929510718"
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
  attachButton: document.getElementById('attachButton'),
  fileInput: document.getElementById('fileInput'),
  typingIndicator: document.getElementById('typingIndicator'),
  nameModal: document.getElementById('nameModal'),
  userNameInput: document.getElementById('userNameInput'),
  submitNameBtn: document.getElementById('submitNameBtn'),
  startRecording: document.getElementById('startRecording'),
  stopRecording: document.getElementById('stopRecording'),
  recordingStatus: document.getElementById('recordingStatus'),
  darkModeToggle: document.getElementById('darkModeToggle'),
  replyPreview: document.getElementById('replyPreview'),
  replyContent: document.querySelector('.reply-content'),
  cancelReply: document.getElementById('cancelReply'),
  mentionSuggestions: document.getElementById('mentionSuggestions'),
  logoutButton: document.getElementById('logoutButton')
};

// App State
const appState = {
  currentUser: {
    id: null,
    name: null
  },
  isTyping: false,
  lastTypingTime: 0,
  expiryTimer: null,
  currentReply: null,
  onlineUsers: {},
  mediaRecorder: null,
  audioChunks: [],
  MESSAGE_EXPIRY_MINUTES: 900,
  darkMode: localStorage.getItem('darkMode') === 'true'
};

// Firebase References
const dbRefs = {
  messages: database.ref('messages'),
  typing: database.ref('typing'),
  users: database.ref('users')
};

// Initialize App
function init() {
  updateDarkMode();
  setupEventListeners();
  initAuthentication();
  checkMediaRecorderSupport();
}

// Authentication
function initAuthentication() {
  auth.onAuthStateChanged(user => {
    if (user) {
      appState.currentUser.id = user.uid;
      elements.logoutButton.style.display = 'block';
      checkForStoredName();
    } else {
      showNameModal();
    }
  });
}

function checkForStoredName() {
  const storedName = localStorage.getItem('chatUserName');
  if (storedName) {
    appState.currentUser.name = storedName;
    updateUserPresence(true);
    loadMessages();
  } else {
    showNameModal();
  }
}

function handleNameSubmit() {
  const userName = elements.userNameInput.value.trim();
  if (!userName) return;

  auth.signInAnonymously()
    .then(() => {
      appState.currentUser.name = userName;
      localStorage.setItem('chatUserName', userName);
      updateUserPresence(true);
      hideNameModal();
      sendSystemMessage(`${userName} joined the chat`, 'join');
      loadMessages();
    })
    .catch(error => {
      console.error("Auth error:", error);
      alert("Error joining chat");
    });
}

function updateUserPresence(isOnline) {
  if (!appState.currentUser.id || !appState.currentUser.name) return;
  
  const updateData = {
    name: appState.currentUser.name,
    isOnline: isOnline,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  };
  
  if (isOnline) {
    updateData.joinedAt = firebase.database.ServerValue.TIMESTAMP;
    dbRefs.users.child(appState.currentUser.id).onDisconnect().update({
      isOnline: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }
  
  dbRefs.users.child(appState.currentUser.id).update(updateData);
}

// Message Functions
function sendMessage() {
  const messageText = elements.messageInput.value.trim();
  if (!messageText) return;

  const timestamp = Date.now();
  const messageData = {
    text: messageText,
    senderId: appState.currentUser.id,
    senderName: appState.currentUser.name,
    timestamp: timestamp,
    expiry: timestamp + (appState.MESSAGE_EXPIRY_MINUTES * 60 * 1000),
    type: 'text'
  };

  if (appState.currentReply) {
    messageData.replyTo = {
      messageId: appState.currentReply.id,
      senderName: appState.currentReply.senderName,
      text: appState.currentReply.text || (appState.currentReply.type === 'image' ? 'Image' : 'Voice message'),
      type: appState.currentReply.type
    };
  }

  dbRefs.messages.push().set(messageData)
    .then(() => {
      elements.messageInput.value = '';
      elements.sendButton.disabled = true;
      updateTyping(false);
      cancelReply();
      hideMentionSuggestions();
    });
}

function displayMessage(message, messageId, isExpired = false) {
  if (message.deleted || isExpired) return;
  
  const messageElement = document.createElement('div');
  let messageContent = '';
  const timeString = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Reply indicator
  if (message.replyTo) {
    messageContent += `
      <div class="reply-indicator">
        Replying to ${message.replyTo.senderName}
        <div class="replied-message">
          ${message.replyTo.text || message.replyTo.type}
        </div>
      </div>
    `;
  }

  // Message content
  switch (message.type) {
    case 'voice':
      messageElement.className = `message ${message.senderId === appState.currentUser.id ? 'sent' : 'received'}`;
      messageContent += `
        <audio controls src="${message.audioData}"></audio>
        <span class="timestamp">${timeString} • ${message.senderName}</span>
        <span class="voice-duration">${message.duration}s</span>
      `;
      break;
      
    case 'image':
      messageElement.className = `message ${message.senderId === appState.currentUser.id ? 'sent' : 'received'}`;
      messageContent += `
        <img src="${message.imageUrl}" class="message-image" alt="Sent image">
        <span class="timestamp">${timeString} • ${message.senderName}</span>
      `;
      break;
      
    default:
      messageElement.className = `message ${message.senderId === appState.currentUser.id ? 'sent' : 'received'}`;
      messageContent += `
        <div class="message-text">${parseMentions(escapeHtml(message.text))}</div>
        <span class="timestamp">${timeString} • ${message.senderName}</span>
      `;
  }

  // Delete button for user's messages
  if (!isExpired && message.senderId === appState.currentUser.id && message.type !== 'system') {
    messageContent += `
      <div class="message-actions">
        <button class="delete-btn" data-message-id="${messageId}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
  }

  messageElement.innerHTML = messageContent;
  messageElement.dataset.messageId = messageId;
  elements.messagesContainer.appendChild(messageElement);
  
  // Add delete handler if applicable
  const deleteBtn = messageElement.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(deleteBtn.dataset.messageId);
    });
  }
  
  scrollToBottom();
}

// [Additional helper functions would follow...]
// setupReplyHandlers(), parseMentions(), handleFileUpload(), etc.

// Initialize the app
document.addEventListener('DOMContentLoaded', init);
