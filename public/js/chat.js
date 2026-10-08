/**
 * AI Chat Component
 * Talks to /api/chat, which runs a real renovation/design assistant
 * (a cheap model behind hard per-IP and global daily caps).
 */

class RenovationChat {
  constructor(options = {}) {
    this.messagesContainer = document.getElementById(options.messagesContainerId || 'chatMessages');
    this.inputElement = document.getElementById(options.inputId || 'chatInput');
    this.sendButton = document.getElementById(options.sendButtonId || 'sendChatBtn');
    this.projectId = null;
    this.getProjectContext = options.getProjectContext || (() => ({}));
    this.history = [];      // recent turns: { role, content }
    this.sending = false;   // guard against double-send

    this.init();
  }

  /**
   * Initialize chat event listeners
   */
  init() {
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    if (this.inputElement) {
      this.inputElement.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendMessage();
        }
      });
    }
  }

  /**
   * Set project ID for saving chat history
   */
  setProjectId(projectId) {
    this.projectId = projectId;
  }

  /**
   * Send message to AI
   */
  async sendMessage() {
    const message = this.inputElement.value.trim();
    if (!message || this.sending) return;

    // Clear input and add the user message to the UI
    this.inputElement.value = '';
    this.addMessage(message, 'user');

    // Capture prior turns (without the new message, which the server adds itself)
    const historyToSend = this.history.slice(-6);
    this.history.push({ role: 'user', content: message });

    this.setSending(true);
    const typingIndicator = this.showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: this.projectId,
          message: message,
          projectContext: this.getProjectContext(),
          history: historyToSend
        })
      });

      const data = await response.json();
      this.removeTypingIndicator(typingIndicator);

      if (data.success) {
        this.addMessage(data.response, 'assistant');
        this.history.push({ role: 'assistant', content: data.response });
        if (this.history.length > 12) this.history = this.history.slice(-12);
      } else if (response.status === 429) {
        this.addMessage('Слишком много запросов. Подождите немного и попробуйте снова.', 'assistant');
      } else {
        this.addMessage(data.error || 'Извините, произошла ошибка. Попробуйте ещё раз.', 'assistant');
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.removeTypingIndicator(typingIndicator);
      this.addMessage('Ошибка соединения. Проверьте подключение к интернету.', 'assistant');
    } finally {
      this.setSending(false);
    }
  }

  /**
   * Toggle the sending state (disables input + button to avoid double-send).
   */
  setSending(sending) {
    this.sending = sending;
    if (this.sendButton) {
      this.sendButton.disabled = sending;
      this.sendButton.textContent = sending ? '...' : 'Отправить';
    }
    if (this.inputElement) this.inputElement.disabled = sending;
    if (!sending && this.inputElement) this.inputElement.focus();
  }

  /**
   * Add message to chat UI
   */
  addMessage(text, role) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}`;
    messageEl.innerHTML = `<p>${this.escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'chat-message assistant typing-indicator';
    indicator.innerHTML = `
      <p>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </p>
    `;

    // Add CSS for typing animation
    if (!document.querySelector('#typing-styles')) {
      const style = document.createElement('style');
      style.id = 'typing-styles';
      style.textContent = `
        .typing-indicator .dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          margin: 0 2px;
          background: #64748b;
          border-radius: 50%;
          animation: typing 1s infinite;
        }
        .typing-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
        }
      `;
      document.head.appendChild(style);
    }

    this.messagesContainer.appendChild(indicator);
    this.scrollToBottom();
    return indicator;
  }

  /**
   * Remove typing indicator
   */
  removeTypingIndicator(indicator) {
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }

  /**
   * Scroll chat to bottom
   */
  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Load chat history
   */
  loadHistory(messages) {
    // Clear existing messages except the first welcome message
    while (this.messagesContainer.children.length > 1) {
      this.messagesContainer.removeChild(this.messagesContainer.lastChild);
    }

    // Add historical messages and seed the in-memory history for context
    this.history = [];
    messages.forEach(msg => {
      this.addMessage(msg.message, msg.role);
      this.history.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.message });
    });
    this.history = this.history.slice(-12);
  }

  /**
   * Clear chat history
   */
  clearHistory() {
    this.history = [];
    this.messagesContainer.innerHTML = `
      <div class="chat-message assistant">
        <p>Здравствуйте! Я помощник по ремонту и дизайну от МастерДом. Опишите комнату или спросите про материалы, цвета, стиль и стоимость, и я помогу подобрать отделку и собрать смету.</p>
      </div>
    `;
  }
}

// Export for use in other scripts
window.RenovationChat = RenovationChat;
