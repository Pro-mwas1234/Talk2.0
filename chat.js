// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAa6iZDF9wEa_CF2LDU_TEsZF6uxdDCWxg",
    authDomain: "chat01-baa5d.firebaseapp.com",
    databaseURL: "https://chat01-baa5d-default-rtdb.firebaseio.com",
    projectId: "chat01-baa5d",
    storageBucket: "chat01-baa5d.firebasestorage.app",
    messagingSenderId: "333929510718",
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM elements
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
    mentionSuggestions: document.getElementById('mentionSuggestions')
};

// App state
let currentUser = {
    id: 'user-' + Math.random().toString(36).substr(2, 9),
    name: null
};
let isTyping = false;
let lastTypingTime = 0;
let expiryTimer = null;
let currentReply = null;
let onlineUsers = {};
const MESSAGE_EXPIRY_MINUTES = 900;

// Voice recording variables
let mediaRecorder;
let audioChunks = [];

// Dark mode state
let darkMode = localStorage.getItem('darkMode') === 'true';

// Firebase references
const messagesRef = database.ref('messages');
const typingRef = database.ref('typing');
const usersRef = database.ref('users');

// Initialize app
function init() {
    updateDarkMode();
    showNameModal();
    setupEventListeners();
    
    // Check for MediaRecorder support
    if (!window.MediaRecorder) {
        elements.startRecording.style.display = 'none';
        console.warn("Voice recording not supported in this browser");
    }
}

// Dark mode functions
function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    updateDarkMode();
}

function updateDarkMode() {
    document.body.classList.toggle('dark-mode', darkMode);
    elements.darkModeToggle.innerHTML = darkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    elements.darkModeToggle.title = darkMode ? 'Switch to light mode' : 'Switch to dark mode';
}

// Show name modal
function showNameModal() {
    elements.nameModal.style.display = 'flex';
    elements.userNameInput.focus();
}

// Hide name modal
function hideNameModal() {
    elements.nameModal.style.display = 'none';
}

// Setup event listeners
function setupEventListeners() {
    // Dark mode toggle
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    
    // Name submission
    elements.submitNameBtn.addEventListener('click', handleNameSubmit);
    elements.userNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleNameSubmit();
    });

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
    
    // Mention functionality
    elements.messageInput.addEventListener('input', handleMentionInput);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.mention-suggestion') && 
            e.target !== elements.messageInput) {
            hideMentionSuggestions();
        }
    });
}

// Handle name submission
function handleNameSubmit() {
    const userName = elements.userNameInput.value.trim();
    if (userName) {
        currentUser.name = userName;
        localStorage.setItem('chatUserName', userName);
        hideNameModal();
        
        // Add user to online list
        usersRef.child(currentUser.id).set({
            name: userName,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            isOnline: true
        }).then(() => {
            // Setup disconnect handler
            usersRef.child(currentUser.id).onDisconnect().update({
                isOnline: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        });
        
        // Send join notification
        sendSystemMessage(`${userName} joined the chat`, 'join');
        loadMessages();
    }
}

// Send message with expiry timestamp
function sendMessage() {
    const messageText = elements.messageInput.value.trim();
    if (messageText) {
        const timestamp = Date.now();
        const messageData = {
            text: messageText,
            senderId: currentUser.id,
            senderName: currentUser.name,
            timestamp: timestamp,
            expiry: timestamp + (MESSAGE_EXPIRY_MINUTES * 60 * 1000),
            type: 'text'
        };

        // Add reply data if replying
        if (currentReply) {
            messageData.replyTo = {
                messageId: currentReply.id,
                senderName: currentReply.senderName,
                text: currentReply.text || (currentReply.type === 'image' ? 'Image' : 'Voice message'),
                type: currentReply.type
            };
        }

        messagesRef.push().set(messageData).then(() => {
            elements.messageInput.value = '';
            elements.sendButton.disabled = true;
            updateTyping(false);
            cancelReply(); // Clear reply after sending
            hideMentionSuggestions();
        });
    }
}

// Handle file upload with expiry
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageUrl = event.target.result;
            const timestamp = Date.now();
            messagesRef.push().set({
                imageUrl: imageUrl,
                senderId: currentUser.id,
                senderName: currentUser.name,
                timestamp: timestamp,
                expiry: timestamp + (MESSAGE_EXPIRY_MINUTES * 60 * 1000),
                type: 'image'
            });
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
}

// Voice recording functions
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
        const base64Audio = reader.result; // Full data URL
        const duration = Math.round(audioBlob.size / 1000); // Approximate duration
        
        messagesRef.push().set({
            type: 'voice',
            audioData: base64Audio,
            duration: duration,
            senderId: currentUser.id,
            senderName: currentUser.name,
            timestamp: Date.now(),
            expiry: Date.now() + (MESSAGE_EXPIRY_MINUTES * 60 * 1000)
        });
        
        // Reset UI
        elements.startRecording.style.display = 'block';
        elements.stopRecording.style.display = 'none';
        elements.recordingStatus.style.display = 'none';
        audioChunks = [];
    };
    
    reader.readAsDataURL(audioBlob);
}

// Update typing status
function updateTyping(typing) {
    if (typing !== isTyping) {
        isTyping = typing;
        typingRef.child(currentUser.id).set(isTyping ? currentUser.name : null);
    }
    lastTypingTime = Date.now();
}

// Load messages with expiry check
function loadMessages() {
    clearTimeout(expiryTimer);
    
    messagesRef.orderByChild('timestamp').on('child_added', (snapshot) => {
        const message = snapshot.val();
        const isExpired = isMessageExpired(message);
        displayMessage(message, snapshot.key, isExpired);
        setupReplyHandlers();
        setupMentionHandlers();
        
        if (!expiryTimer && !isExpired) {
            setExpiryTimer(message.timestamp);
        }
        
        scrollToBottom();
    });

    // Typing indicators
    typingRef.on('value', (snapshot) => {
        const typingData = snapshot.val() || {};
        const typingUsers = Object.values(typingData).filter(name => name !== currentUser.name);
        
        if (typingUsers.length > 0) {
            elements.typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
            elements.typingIndicator.style.display = 'block';
        } else {
            elements.typingIndicator.style.display = 'none';
        }
    });

    // User presence
    usersRef.orderByChild('isOnline').equalTo(true).on('value', (snapshot) => {
        onlineUsers = snapshot.val() || {};
        updateMentionsInMessages();
        
        // Send online notifications
        snapshot.forEach(child => {
            if (child.key !== currentUser.id) {
                const user = child.val();
                sendSystemMessage(`${user.name} is online`, 'join');
            }
        });
    });

    usersRef.orderByChild('isOnline').equalTo(false).on('child_changed', (snapshot) => {
        const user = snapshot.val();
        sendSystemMessage(`${user.name} left the chat`, 'leave');
    });
}

// Check if message is expired
function isMessageExpired(message) {
    if (!message.timestamp) return false;
    const messageAge = (Date.now() - message.timestamp) / (1000 * 60);
    return messageAge > MESSAGE_EXPIRY_MINUTES;
}

// Set timer for message expiration
function setExpiryTimer(oldestMessageTime) {
    const timeElapsed = (Date.now() - oldestMessageTime) / (1000 * 60);
    const timeRemaining = (MESSAGE_EXPIRY_MINUTES - timeElapsed) * 60 * 1000;
    
    if (timeRemaining > 0) {
        expiryTimer = setTimeout(() => {
            cleanExpiredMessages();
        }, timeRemaining);
    }
}

// Clean up expired messages
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

// Display message with expiry state
function displayMessage(message, messageId, isExpired = false) {
    if (message.deleted || isExpired) return;
    
    const messageElement = document.createElement('div');
    let messageContent = '';
    
    const timeString = new Date(message.timestamp).toLocaleTimeString([], 
        { hour: '2-digit', minute: '2-digit' });

    // Add reply indicator if this is a reply
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

    if (message.type === 'voice') {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent += `
            <audio controls src="${message.audioData}"></audio>
            <span class="timestamp">${timeString} • ${message.senderName}</span>
            <span class="voice-duration">${message.duration}s</span>
        `;
    } 
    else if (message.type === 'image') {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent += `
            <img src="${message.imageUrl}" class="message-image" alt="Sent image">
            <span class="timestamp">${timeString} • ${message.senderName}</span>
        `;
    }
    else if (message.senderId) {
        messageElement.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
        messageContent += `
            <div class="message-text">${parseMentions(escapeHtml(message.text))}</div>
            <span class="timestamp">${timeString} • ${message.senderName}</span>
        `;
    } 
    else {
        messageElement.className = `message system ${message.type || ''}`;
        messageContent = message.text;
    }

    // Add delete button for user's non-expired messages
    if (!isExpired && message.senderId === currentUser.id && message.type !== 'system') {
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
    
    // Add delete listener if applicable
    const deleteBtn = messageElement.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteMessage(deleteBtn.dataset.messageId));
    }
    
    scrollToBottom();
}

// Reply functionality
function setupReplyHandlers() {
    document.querySelectorAll('.message').forEach(message => {
        message.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.user-mention')) return;
            
            const messageId = message.dataset.messageId;
            if (messageId) {
                const messageRef = database.ref('messages/' + messageId);
                messageRef.once('value').then(snapshot => {
                    const messageData = snapshot.val();
                    setReply(messageData, messageId);
                });
            }
        });
    });
}

function setReply(message, messageId) {
    currentReply = { id: messageId, ...message };
    
    // Update UI
    elements.replyContent.textContent = message.text || 
        (message.type === 'image' ? 'Image' : 'Voice message');
    elements.replyPreview.style.display = 'block';
    elements.messageInput.focus();
}

function cancelReply() {
    currentReply = null;
    elements.replyPreview.style.display = 'none';
}

// Mention functionality
function parseMentions(text) {
    if (!text) return text;
    
    return text.replace(/@(\w+)/g, (match, username) => {
        const user = Object.values(onlineUsers).find(u => 
            u.name.toLowerCase() === username.toLowerCase()
        );
        
        if (user) {
            return `<span class="user-mention" data-user-id="${user.id}">@${username}</span>`;
        }
        return match;
    });
}

function setupMentionHandlers() {
    document.querySelectorAll('.user-mention').forEach(mention => {
        mention.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = mention.dataset.userId;
            if (userId && onlineUsers[userId]) {
                elements.messageInput.value = `${elements.messageInput.value}@${onlineUsers[userId].name} `;
                elements.messageInput.focus();
            }
        });
    });
}

function updateMentionsInMessages() {
    document.querySelectorAll('.message-text').forEach(element => {
        const originalText = element.dataset.originalText || element.textContent;
        element.dataset.originalText = originalText;
        element.innerHTML = parseMentions(escapeHtml(originalText));
    });
    setupMentionHandlers();
}

function handleMentionInput() {
    const cursorPos = elements.messageInput.selectionStart;
    const textBeforeCursor = elements.messageInput.value.substring(0, cursorPos);
    const atSymbolIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atSymbolIndex >= 0 && !/\s/.test(textBeforeCursor.substring(atSymbolIndex + 1))) {
        const partialName = textBeforeCursor.substring(atSymbolIndex + 1);
        showMentionSuggestions(partialName);
    } else {
        hideMentionSuggestions();
    }
}

function showMentionSuggestions(partialName) {
    elements.mentionSuggestions.innerHTML = '';
    
    const matchingUsers = Object.values(onlineUsers).filter(user =>
        user.name.toLowerCase().includes(partialName.toLowerCase()) &&
        user.id !== currentUser.id
    );
    
    if (matchingUsers.length > 0) {
        matchingUsers.forEach(user => {
            const suggestion = document.createElement('div');
            suggestion.className = 'mention-suggestion-item';
            suggestion.textContent = user.name;
            suggestion.addEventListener('click', () => {
                insertMention(user);
            });
            elements.mentionSuggestions.appendChild(suggestion);
        });
        elements.mentionSuggestions.style.display = 'block';
    } else {
        hideMentionSuggestions();
    }
}

function hideMentionSuggestions() {
    elements.mentionSuggestions.style.display = 'none';
}

function insertMention(user) {
    const input = elements.messageInput;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = input.value.substring(0, cursorPos);
    const atSymbolIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atSymbolIndex >= 0) {
        const newText = 
            input.value.substring(0, atSymbolIndex) + 
            '@' + user.name + ' ' + 
            input.value.substring(cursorPos);
        
        input.value = newText;
        input.selectionStart = atSymbolIndex + user.name.length + 2;
        input.selectionEnd = atSymbolIndex + user.name.length + 2;
    }
    
    hideMentionSuggestions();
    input.focus();
}

// Send system message
function sendSystemMessage(text, type = 'system') {
    const messageElement = document.createElement('div');
    messageElement.className = `message system ${type}`;
    messageElement.textContent = text;
    elements.messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

// Delete message
function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        messagesRef.child(messageId).remove();
    }
}

// Scroll to bottom
function scrollToBottom() {
    setTimeout(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }, 100);
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    usersRef.child(currentUser.id).update({
        isOnline: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
});

// Initialize the app
document.addEventListener('DOMContentLoaded', init);
