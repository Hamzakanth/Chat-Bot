document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.querySelector('.input-area__textarea');
  const themeToggle = document.querySelector('.theme-toggle');
  const sendBtn = document.querySelector('.input-area__send');
  const newChatBtn = document.getElementById('new-chat-btn');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const sidebarList = document.querySelector('.sidebar__list');
  const topbarTitle = document.querySelector('.topbar__title');

  // Session storage (localStorage)
  let sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
  let currentSessionId = localStorage.getItem('current_session_id') || null;

  function generateId() {
    return 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function saveSessions() {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }

  function findSession(id) {
    return sessions.find(s => s.id === id);
  }

  function createSession(title = 'New Chat') {
    const id = generateId();
    const session = { id, title, created_at: new Date().toISOString(), messages: [] };
    sessions.unshift(session);
    saveSessions();
    setCurrentSession(id);
    renderRecentList();
  }

  function setCurrentSession(id) {
    currentSessionId = id;
    localStorage.setItem('current_session_id', id);
    const session = findSession(id);
    renderChat(session);
    updateTopbarTitle(session);
    highlightActiveInSidebar();
  }

  function renderRecentList() {
    if (!sidebarList) return;
    sidebarList.innerHTML = '';
    sessions.forEach(session => {
      const li = document.createElement('li');
      li.className = 'sidebar__item';
      li.dataset.id = session.id;
      const title = session.title || (session.messages && session.messages[0] && session.messages[0].text) || 'New Chat';
      li.textContent = title.length > 40 ? title.slice(0, 37) + '...' : title;
      li.addEventListener('click', () => setCurrentSession(session.id));
      sidebarList.appendChild(li);
    });
    highlightActiveInSidebar();
  }

  function highlightActiveInSidebar() {
    if (!sidebarList) return;
    const items = sidebarList.querySelectorAll('li');
    items.forEach(li => li.classList.toggle('sidebar__item--active', li.dataset.id === currentSessionId));
  }

  function updateTopbarTitle(session) {
    if (!topbarTitle) return;
    const title = session && session.title ? session.title : 'New Chat';
    topbarTitle.textContent = title;
  }

  function renderChat(session) {
    const chat = document.querySelector('.chat');
    if (!chat) return;
    chat.innerHTML = '';
    if (!session) return;
    (session.messages || []).forEach(m => addMessage(m.text, m.sender));
    chat.scrollTop = chat.scrollHeight;
  }

  function addMessage(text, sender) {
    const chat = document.querySelector('.chat');
    if (!chat) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message--${sender}`;

    if (sender === 'ai') {
      messageDiv.innerHTML = `
        <div class="message__avatar">AI</div>
        <div class="message__bubble">${escapeHTML(text)}</div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="message__bubble">${escapeHTML(text)}</div>
      `;
    }

    chat.appendChild(messageDiv);
    chat.scrollTop = chat.scrollHeight;
    return messageDiv;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  function isDummyMessage(text) {
    if (!text) return false;
    // Detect the specific dummy pattern like "Can you write the dark mode CSS for this?"
    const patterns = [/^can you write.*dark mode/i, /dark mode css/i];
    return patterns.some(r => r.test(text));
  }

  function saveMessageToSession(text, sender) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    if (isDummyMessage(trimmed)) return; // skip known dummy lines

    if (!currentSessionId) {
      createSession();
    }
    let session = findSession(currentSessionId);
    if (!session) {
      createSession();
      session = findSession(currentSessionId);
    }
    session.messages = session.messages || [];
    session.messages.push({ sender, text: trimmed, time: new Date().toISOString() });
    updateSessionTitle(session);
    saveSessions();
    renderRecentList();
  }

  function updateSessionTitle(session) {
    if (!session || !session.messages || !session.messages.length) return;
    const lastUser = [...session.messages].reverse().find(m => m.sender === 'user');
    const last = lastUser || session.messages[session.messages.length - 1];
    if (!last) return;
    let title = last.text;
    if (title.length > 60) title = title.slice(0, 57) + '...';
    session.title = title;
  }

  // Auto-resize textarea and enter-to-send
  if (textarea) {
    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      if (this.value === '') this.style.height = 'auto';
    });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  async function handleSend() {
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    saveMessageToSession(text, 'user');
    textarea.value = '';
    textarea.style.height = 'auto';

    const aiMessageDiv = addMessage('...', 'ai');
    const bubble = aiMessageDiv.querySelector('.message__bubble');

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) throw new Error('Network response error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let botText = '';
      bubble.innerHTML = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        botText += decoder.decode(value, { stream: true });
        bubble.innerHTML = escapeHTML(botText).replace(/\n/g, '<br>');
        aiMessageDiv.parentElement.scrollTop = aiMessageDiv.parentElement.scrollHeight;
      }

      // Save final AI message
      saveMessageToSession(botText, 'ai');
    } catch (error) {
      bubble.innerHTML = 'Error: ' + error.message;
    }
  }

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (newChatBtn) newChatBtn.addEventListener('click', () => createSession());
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => createSession());

  // Theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
    });
  }

  // Initialize view
  if (!sessions.length) {
    createSession();
  } else {
    renderRecentList();
    if (!currentSessionId || !findSession(currentSessionId)) {
      setCurrentSession(sessions[0].id);
    } else {
      setCurrentSession(currentSessionId);
    }
  }
});
