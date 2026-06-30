import { useEffect, useRef, useState } from 'react';
import './ChatbotWidget.css';

const CHATBOT_API_URL = (
  import.meta.env.VITE_CHATBOT_API_URL || 'http://127.0.0.1:5000'
).replace(/\/+$/, '');

const CHATBOT_IMAGE = 'https://cellphones.com.vn/media/wysiwyg/ant-smile.png';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const DIRECT_NAME_KEYS = [
  'userName',
  'username',
  'fullName',
  'displayName',
  'name',
];

const USER_OBJECT_KEYS = [
  'currentUser',
  'user',
  'authUser',
  'account',
];

const normalizeUserName = (value) => String(value || '').trim();

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const extractNameFromObject = (value) => {
  if (!value || typeof value !== 'object') return '';

  return normalizeUserName(
    value.fullName
      || value.displayName
      || value.name
      || value.username
      || value.userName
      || value.user?.fullName
      || value.user?.displayName
      || value.user?.name
      || value.user?.username,
  );
};

const readStoredUserName = () => {
  if (typeof window === 'undefined') return '';

  try {
    for (const key of DIRECT_NAME_KEYS) {
      const value = normalizeUserName(window.localStorage.getItem(key));
      if (value) return value;
    }

    for (const key of USER_OBJECT_KEYS) {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) continue;

      try {
        const parsedValue = JSON.parse(rawValue);
        const name = extractNameFromObject(parsedValue);
        if (name) return name;
      } catch {
        // Bỏ qua nếu giá trị trong localStorage không phải JSON hợp lệ.
      }
    }
  } catch {
    // Trình duyệt có thể chặn localStorage trong một số chế độ riêng tư.
  }

  return '';
};

const createWelcomeMessage = (userName = '') => {
  const safeUserName = escapeHtml(normalizeUserName(userName));

  return {
    id: 'welcome',
    role: 'bot',
    html: safeUserName
      ? `Xin chào <strong>${safeUserName}</strong> 👋 Mình là Mochi. Bạn cần mình giúp tìm sản phẩm công nghệ nào không?`
      : 'Xin chào 👋 Mình là Mochi. Bạn cần mình giúp tìm sản phẩm công nghệ nào không?',
  };
};

const createMessageId = () => (
  `${Date.now()}-${Math.random().toString(16).slice(2)}`
);

function ChatbotWidget({ userName = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [storedUserName, setStoredUserName] = useState(() => readStoredUserName());
  const activeUserName = normalizeUserName(userName) || storedUserName;
  const [messages, setMessages] = useState(() => [
    createWelcomeMessage(normalizeUserName(userName) || readStoredUserName()),
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, isOpen]);

  useEffect(() => {
    const syncStoredUserName = () => {
      setStoredUserName(readStoredUserName());
    };

    syncStoredUserName();
    window.addEventListener('storage', syncStoredUserName);
    window.addEventListener('auth-changed', syncStoredUserName);

    return () => {
      window.removeEventListener('storage', syncStoredUserName);
      window.removeEventListener('auth-changed', syncStoredUserName);
    };
  }, []);

  useEffect(() => {
    setMessages((current) => current.map((item) => (
      item.id === 'welcome' ? createWelcomeMessage(activeUserName) : item
    )));
  }, [activeUserName]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '42px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 92)}px`;
  }, [message]);

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setImagePreview('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addBotMessage = (html) => {
    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'bot',
        html,
      },
    ]);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addBotMessage('Vui lòng chọn một file ảnh hợp lệ.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      addBotMessage('Ảnh không được lớn hơn 5 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedFile(file);
      setImagePreview(String(reader.result || ''));
    };

    reader.onerror = () => {
      addBotMessage('Không thể đọc file ảnh này. Vui lòng chọn ảnh khác.');
      event.target.value = '';
    };

    reader.readAsDataURL(file);
  };

  const sendMessage = async (presetMessage = '') => {
    const text = String(presetMessage || message).trim();
    if ((!text && !selectedFile) || loading) return;

    const fileToSend = selectedFile;
    const previewToKeep = imagePreview;

    const userMessage = {
      id: createMessageId(),
      role: 'user',
      text: text || 'Tìm giúp tôi sản phẩm tương tự trong ảnh này.',
      image: previewToKeep,
    };

    setMessages((current) => [...current, userMessage]);
    setMessage('');
    setLoading(true);

    try {
      let response;

      if (fileToSend) {
        const formData = new FormData();
        formData.append('file', fileToSend);
        formData.append(
          'message',
          text || 'Tìm giúp tôi sản phẩm tương tự như ảnh này',
        );

        if (activeUserName) {
          formData.append('user_name', activeUserName);
        }

        response = await fetch(`${CHATBOT_API_URL}/upload`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(`${CHATBOT_API_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            user_name: activeUserName || null,
          }),
        });
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.reply || data.error || `HTTP ${response.status}`);
      }

      addBotMessage(data.reply || 'Mình chưa nhận được nội dung phản hồi.');
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Đã xảy ra lỗi không xác định.';

      addBotMessage(
        `Không thể kết nối chatbot. Hãy kiểm tra Flask đang chạy ở cổng 5000.`
        + `<br><small>${escapeHtml(errorMessage)}</small>`,
      );
    } finally {
      clearSelectedFile();
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const toggleChatbot = () => {
    setStoredUserName(readStoredUserName());
    setIsOpen((current) => !current);
  };

  return (
    <div className="chatbot-widget">
      {isOpen && (
        <section className="chatbot-panel" aria-label="Trợ lý mua sắm AI">
          <header className="chatbot-header">
            <div className="chatbot-header-identity">
              <span className="chatbot-avatar chatbot-avatar-header">
                <img src={CHATBOT_IMAGE} alt="Chatbot Mochi" />
              </span>
              <div>
                <strong>Mochi - Trợ lý mua sắm AI</strong>
                <span><i /> Đang trực tuyến</span>
              </div>
            </div>

            <button
              type="button"
              className="chatbot-close"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng chatbot"
            >
              ×
            </button>
          </header>

          <div className="chatbot-messages">
            {messages.map((item) => (
              <div key={item.id} className={`chatbot-message-row ${item.role}`}>
                {item.role === 'bot' && (
                  <span className="chatbot-avatar chatbot-avatar-message">
                    <img src={CHATBOT_IMAGE} alt="" />
                  </span>
                )}

                <div className={`chatbot-message ${item.role}`}>
                  {item.image && (
                    <img
                      className="chatbot-sent-image"
                      src={item.image}
                      alt="Ảnh sản phẩm đã gửi"
                    />
                  )}

                  {item.role === 'bot' ? (
                    <div dangerouslySetInnerHTML={{ __html: item.html }} />
                  ) : (
                    <p>{item.text}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chatbot-message-row bot">
                <span className="chatbot-avatar chatbot-avatar-message">
                  <img src={CHATBOT_IMAGE} alt="" />
                </span>
                <div
                  className="chatbot-message bot chatbot-typing"
                  aria-label="Chatbot đang trả lời"
                >
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 && (
            <div className="chatbot-suggestions">
              {[
                'Tìm laptop học tập',
                'Tai nghe không dây',
                'Đồng hồ thông minh',
              ].map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {imagePreview && (
            <div className="chatbot-image-preview">
              <img src={imagePreview} alt="Ảnh chuẩn bị gửi" />
              <span>{selectedFile?.name}</span>
              <button
                type="button"
                onClick={clearSelectedFile}
                aria-label="Xóa ảnh"
              >
                ×
              </button>
            </div>
          )}

          <footer className="chatbot-composer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              hidden
            />

            <button
              type="button"
              className="chatbot-attach"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Gửi ảnh sản phẩm"
              disabled={loading}
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập nhu cầu sản phẩm..."
              rows="1"
              disabled={loading}
            />

            <button
              type="button"
              className="chatbot-send"
              onClick={() => sendMessage()}
              disabled={loading || (!message.trim() && !selectedFile)}
              aria-label="Gửi tin nhắn"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </footer>
        </section>
      )}

      <button
        type="button"
        className={`chatbot-launcher ${isOpen ? 'open' : ''}`}
        onClick={toggleChatbot}
        aria-label={isOpen ? 'Đóng trợ lý mua sắm' : 'Mở trợ lý mua sắm'}
      >
        {isOpen ? (
          <span className="chatbot-launcher-close">×</span>
        ) : (
          <>
            <img src={CHATBOT_IMAGE} alt="Trợ lý mua sắm AI" />
            <span className="chatbot-launcher-badge">1</span>
          </>
        )}
      </button>
    </div>
  );
}

export default ChatbotWidget;
