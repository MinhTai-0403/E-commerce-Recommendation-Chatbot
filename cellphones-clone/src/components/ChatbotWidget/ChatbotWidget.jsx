import { useEffect, useRef, useState } from 'react';

import { getAuthToken } from '../../services/apiAuth';
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
  'smember_user',
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
    || value.full_name
    || value.displayName
    || value.name
    || value.username
    || value.userName
    || value.user?.fullName
    || value.user?.full_name
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
        // Bỏ qua giá trị localStorage không phải JSON hợp lệ.
      }
    }
  } catch {
    // Một số chế độ riêng tư có thể chặn localStorage.
  }

  return '';
};

const createWelcomeMessage = (userName = '') => {
  const safeUserName = escapeHtml(normalizeUserName(userName));

  return {
    id: 'welcome',
    role: 'bot',
    html: safeUserName
      ? (
        `Xin chào <strong>${safeUserName}</strong> 👋<br>`
        + 'Mình là Mochi, trợ lý mua sắm của bạn. '
        + 'Bạn đang muốn tìm sản phẩm công nghệ nào?'
      )
      : (
        'Xin chào 👋<br>'
        + 'Mình là Mochi, trợ lý mua sắm của bạn. '
        + 'Bạn đang muốn tìm sản phẩm công nghệ nào?'
      ),
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
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [storedUserName, setStoredUserName] = useState(() => readStoredUserName());
  const [loading, setLoading] = useState(false);

  const activeUserName = normalizeUserName(userName) || storedUserName;

  const [messages, setMessages] = useState(() => [
    createWelcomeMessage(normalizeUserName(userName) || readStoredUserName()),
  ]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const dragDepthRef = useRef(0);

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

  const addBotMessage = (html, metadata = {}) => {
    const suggestionKeys = new Set();
    const suggestions = (
      Array.isArray(metadata.suggestions) ? metadata.suggestions : []
    ).map((item) => {
      if (item && typeof item === 'object') {
        const label = String(item.label || item.message || '').trim();
        const value = String(item.message || item.value || label).trim();
        return { label, value };
      }

      const value = String(item || '').trim();
      return { label: value, value };
    }).filter((item) => {
      const key = `${item.label}\u0000${item.value}`;
      if (!item.label || !item.value || suggestionKeys.has(key)) return false;
      suggestionKeys.add(key);
      return true;
    }).slice(0, 10);

    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'bot',
        html,
        responseType: String(metadata.responseType || ''),
        suggestions,
      },
    ]);
  };

  const selectImageFile = (file) => {
    if (!file) return false;

    if (!file.type.startsWith('image/')) {
      addBotMessage('Bạn hãy chọn một file ảnh hợp lệ nhé.');
      return false;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      addBotMessage('Ảnh không được lớn hơn 5 MB.');
      return false;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setSelectedFile(file);
      setImagePreview(String(reader.result || ''));
      textareaRef.current?.focus();
    };

    reader.onerror = () => {
      addBotMessage('Mình không thể đọc ảnh này. Bạn thử chọn ảnh khác nhé.');
    };

    reader.readAsDataURL(file);
    return true;
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    const accepted = selectImageFile(file);

    if (!accepted) {
      event.target.value = '';
    }
  };

  const hasDraggedFiles = (event) => (
    Array.from(event.dataTransfer?.types || []).includes('Files')
  );

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!hasDraggedFiles(event)) return;

    dragDepthRef.current += 1;
    setIsDraggingImage(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    if (hasDraggedFiles(event)) {
      setIsDraggingImage(true);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingImage(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setIsDraggingImage(false);

    const file = event.dataTransfer?.files?.[0];
    selectImageFile(file);
  };

  const handlePaste = (event) => {
    const imageFile = Array.from(event.clipboardData?.files || [])
      .find((file) => file.type.startsWith('image/'));

    if (imageFile) {
      event.preventDefault();
      selectImageFile(imageFile);
    }
  };

  const sendMessage = async (presetMessage = '') => {
    const text = String(presetMessage || message).trim();

    if ((!text && !selectedFile) || loading) return;

    const fileToSend = selectedFile;
    const previewToKeep = imagePreview;
    const authToken = getAuthToken();

    const userMessage = {
      id: createMessageId(),
      role: 'user',
      text: text || 'Tìm giúp tôi sản phẩm tương tự trong ảnh này.',
      image: previewToKeep,
    };

    setMessages((current) => [...current, userMessage]);
    setMessage('');
    clearSelectedFile();
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
          headers: authToken
            ? { Authorization: `Bearer ${authToken}` }
            : {},
          body: formData,
        });
      } else {
        response = await fetch(`${CHATBOT_API_URL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken
              ? { Authorization: `Bearer ${authToken}` }
              : {}),
          },
          body: JSON.stringify({
            message: text,
            user_name: activeUserName || null,
          }),
        });
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.reply
          || data.error
          || `Máy chủ phản hồi lỗi HTTP ${response.status}`,
        );
      }

      addBotMessage(
        data.reply || 'Mình chưa nhận được nội dung phản hồi.',
        {
          responseType: data.response_type,
          suggestions: data.suggestions,
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Đã xảy ra lỗi không xác định.';

      addBotMessage(
        'Mình chưa thể kết nối tới máy chủ chatbot. '
        + 'Bạn kiểm tra Flask đang chạy ở cổng 5000 nhé.'
        + `<br><small>${escapeHtml(errorMessage)}</small>`,
      );
    } finally {
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

  const visibleMessages = messages.map((item) => (
    item.id === 'welcome' ? createWelcomeMessage(activeUserName) : item
  ));

  return (
    <div className="chatbot-widget">
      {isOpen && (
        <section
          className={`chatbot-panel ${isDraggingImage ? 'is-dragging' : ''}`}
          aria-label="Trợ lý mua sắm AI"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDraggingImage && (
            <div className="chatbot-drop-overlay" aria-hidden="true">
              <div className="chatbot-drop-card">
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <strong>Thả ảnh vào đây</strong>
                <span>Ảnh sẽ được xem trước trước khi gửi</span>
              </div>
            </div>
          )}

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
            {visibleMessages.map((item) => (
              <div
                key={item.id}
                className={`chatbot-message-row ${item.role}`}
              >
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
                    <>
                      <div dangerouslySetInnerHTML={{ __html: item.html }} />

                      {item.suggestions?.length > 0 && (
                        <div
                          className="chatbot-inline-suggestions"
                          aria-label="Tiêu chí gợi ý"
                        >
                          {item.suggestions.map((suggestion) => (
                            <button
                              type="button"
                              key={`${suggestion.label}-${suggestion.value}`}
                              onClick={() => sendMessage(suggestion.value)}
                              disabled={loading}
                            >
                              {suggestion.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
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

          <div className="chatbot-input-area">
            {imagePreview && (
              <div className="chatbot-image-preview">
                <img src={imagePreview} alt="Ảnh chuẩn bị gửi" />

                <div className="chatbot-image-preview-info">
                  <strong>Ảnh đã sẵn sàng</strong>
                  <span>{selectedFile?.name}</span>
                </div>

                <button
                  type="button"
                  onClick={clearSelectedFile}
                  aria-label="Xóa ảnh"
                  disabled={loading}
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
                aria-label="Chọn ảnh sản phẩm"
                title="Chọn hoặc kéo thả ảnh"
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
                onPaste={handlePaste}
                placeholder={
                  imagePreview
                    ? 'Nhập thêm yêu cầu cho ảnh...'
                    : 'Nhập nhu cầu hoặc kéo ảnh vào đây...'
                }
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
          </div>
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
