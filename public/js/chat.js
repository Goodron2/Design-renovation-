/**
 * AI Chat Component
 * Mock AI chat with Claude API integration placeholder
 */

class RenovationChat {
  constructor(options = {}) {
    this.messagesContainer = document.getElementById(options.messagesContainerId || 'chatMessages');
    this.inputElement = document.getElementById(options.inputId || 'chatInput');
    this.sendButton = document.getElementById(options.sendButtonId || 'sendChatBtn');
    this.projectId = null;
    this.getProjectContext = options.getProjectContext || (() => ({}));

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
    if (!message) return;

    // Clear input
    this.inputElement.value = '';

    // Add user message to UI
    this.addMessage(message, 'user');

    // Show typing indicator
    const typingIndicator = this.showTypingIndicator();

    try {
      // Get project context for AI
      const projectContext = this.getProjectContext();

      // Send to server
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId,
          message: message,
          projectContext: projectContext
        })
      });

      const data = await response.json();

      // Remove typing indicator
      this.removeTypingIndicator(typingIndicator);

      if (data.success) {
        this.addMessage(data.response, 'assistant');
      } else {
        this.addMessage('Извините, произошла ошибка. Попробуйте ещё раз.', 'assistant');
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.removeTypingIndicator(typingIndicator);
      this.addMessage('Ошибка соединения. Проверьте подключение к интернету.', 'assistant');
    }
  }

  /**
   * Add message to chat UI
   */
  addMessage(text, role) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}`;
    messageEl.innerHTML = `<p>${this.escapeHtml(text)}</p>`;

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

    // Add historical messages
    messages.forEach(msg => {
      this.addMessage(msg.message, msg.role);
    });
  }

  /**
   * Clear chat history
   */
  clearHistory() {
    this.messagesContainer.innerHTML = `
      <div class="chat-message assistant">
        <p>Здравствуйте! Я ваш помощник по планированию ремонта. Задавайте вопросы о материалах, стоимости или попросите рекомендации.</p>
      </div>
    `;
  }
}

/**
 * Claude API Integration Placeholder
 * Replace the mock responses in server.js with this when API key is available
 *
 * To integrate Claude API:
 * 1. Sign up at console.anthropic.com
 * 2. Get your API key
 * 3. Add to server environment: ANTHROPIC_API_KEY=your_key
 * 4. Install SDK: npm install @anthropic-ai/sdk
 * 5. Replace generateMockResponse() in server.js with:
 *
 * const Anthropic = require('@anthropic-ai/sdk');
 * const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * async function generateClaudeResponse(message, context) {
 *   const systemPrompt = `Вы - помощник по планированию ремонта квартир.
 *     Помогайте пользователям с выбором материалов, расчётом стоимости и рекомендациями.
 *     Отвечайте на русском языке. Будьте кратким и полезным.
 *
 *     Контекст проекта:
 *     - Количество комнат: ${context.rooms?.length || 0}
 *     - Общая площадь: ${context.totalArea || 0} м²
 *     - Текущая стоимость: ${context.totalCost || 0} ₽`;
 *
 *   const response = await anthropic.messages.create({
 *     model: 'claude-sonnet-4-20250514',
 *     max_tokens: 500,
 *     system: systemPrompt,
 *     messages: [{ role: 'user', content: message }]
 *   });
 *
 *   return response.content[0].text;
 * }
 */

// Export for use in other scripts
window.RenovationChat = RenovationChat;
