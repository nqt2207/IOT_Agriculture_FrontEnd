
import {
  useState,
  useEffect,
  useRef,
  type KeyboardEvent,
} from 'react';

import './AIChatWidget.css';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatApiResponse {
  statusCode: number;
  message: string;
  data: {
    reply: string;
  } | null;
}

// API configuration
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ''
).replace(/\/+$/, '');

const API_PREFIX = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

const CHAT_API_URL = `${API_PREFIX}/ai/chat`;

function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      content:
        'Xin chào! Tôi là Farm AI Assistant. Tôi có thể giúp bạn tìm hiểu và phân tích dữ liệu nông trại. Bạn muốn biết điều gì?',
    },
  ]);

  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isTyping, isOpen]);

  // Gửi câu hỏi tới NestJS + Gemini
  const sendMessage = async () => {
    const question = input.trim();

    if (!question || isTyping) return;

    // Lấy access token đã lưu khi đăng nhập
    const accessToken =
      localStorage.getItem('accessToken');

    if (!accessToken) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content:
            'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại để sử dụng Farm AI.',
        },
      ]);

      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: question,
    };

    // Lấy lịch sử trước khi thêm câu hỏi hiện tại
    // Không gửi lời chào mặc định
    const history = messages
      .slice(1)
      .slice(-12)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: question,
          history,
        }),
      });

      const result: ChatApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            `Request failed with status ${response.status}`,
        );
      }

      if (!result.data?.reply) {
        throw new Error(
          'Backend không trả về nội dung phản hồi.',
        );
      }

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.data.reply,
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);
    } catch (error) {
      console.error('Farm AI error:', error);

      let errorMessage =
        'Không thể kết nối với Farm AI. Vui lòng thử lại sau.';

      if (error instanceof TypeError) {
        errorMessage =
          'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng hoặc địa chỉ API.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Xin lỗi, đã xảy ra lỗi: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="ai-chat-widget">
      {isOpen && (
        <div className="ai-chat-window">
          <div className="ai-chat-header">
            <div className="ai-chat-header-info">
              <div className="ai-chat-avatar">✦</div>

              <div>
                <div className="ai-chat-title">
                  Farm AI Assistant
                </div>

                <div className="ai-chat-subtitle">
                  <span className="ai-online-dot" />
                  AI Assistant · Gemini
                </div>
              </div>
            </div>

            <div className="ai-chat-header-actions">
              <button
                type="button"
                className="ai-header-button"
                title="Thu nhỏ"
                onClick={() => setIsOpen(false)}
              >
                −
              </button>

              <button
                type="button"
                className="ai-header-button"
                title="Đóng"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="ai-chat-messages">
            <div className="ai-chat-date">
              BẮT ĐẦU CUỘC TRÒ CHUYỆN
            </div>

            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-message-row ${
                  message.role === 'user'
                    ? 'user-message-row'
                    : ''
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="ai-message-avatar">
                    ✦
                  </div>
                )}

                <div
                  className={`ai-message ${
                    message.role === 'user'
                      ? 'ai-user-message'
                      : 'ai-assistant-message'
                  }`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="ai-message-row">
                <div className="ai-message-avatar">
                  ✦
                </div>

                <div className="ai-message ai-assistant-message ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-suggestions">
            <button
              type="button"
              onClick={() =>
                setInput(
                  'Nhiệt độ hôm nay của farm thế nào?',
                )
              }
              disabled={isTyping}
            >
              🌡️ Nhiệt độ hôm nay
            </button>

            <button
              type="button"
              onClick={() =>
                setInput(
                  'Tình trạng bồn nước hiện tại?',
                )
              }
              disabled={isTyping}
            >
              💧 Trạng thái bồn nước
            </button>
          </div>

          <div className="ai-chat-input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi của bạn..."
              rows={1}
              disabled={isTyping}
            />

            <button
              type="button"
              className="ai-send-button"
              onClick={sendMessage}
              disabled={!input.trim() || isTyping}
              title="Gửi tin nhắn"
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </button>
          </div>

          <div className="ai-chat-footer">
            Farm AI Assistant · Powered by Gemini
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          className="ai-chat-fab"
          onClick={() => setIsOpen(true)}
          title="Chat với Farm AI"
          aria-label="Mở Farm AI Assistant"
        >
          <svg
            viewBox="0 0 24 24"
            width="27"
            height="27"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 13.9 9.1 20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3Z" />
            <path d="m19 14 1.1 3.1L23 18l-2.9.9L19 22l-.9-3.1L15 18l3.1-.9L19 14Z" />
          </svg>

          <span className="ai-chat-fab-label">
            Ask AI
          </span>
        </button>
      )}
    </div>
  );
}

export default AIChatWidget;
