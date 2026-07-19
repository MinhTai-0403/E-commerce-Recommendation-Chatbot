import { useEffect, useRef } from 'react';
import { loginWithGoogle } from '../../services/apiAuth';

const GOOGLE_SCRIPT_ID = 'google-identity-services';
let googleScriptPromise;
let credentialHandler;
let initializedClientId = '';

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(GOOGLE_SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = GOOGLE_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', () => resolve(window.google), { once: true });
    script.addEventListener('error', () => reject(new Error('Không thể tải dịch vụ đăng nhập Google.')), { once: true });
  });

  return googleScriptPromise;
}

export default function GoogleAuthButton({
  mode = 'login',
  onSuccess,
  onError,
  onLoadingChange,
}) {
  const containerRef = useRef(null);
  const callbacksRef = useRef({ onSuccess, onError, onLoadingChange });

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, onLoadingChange };
  }, [onError, onLoadingChange, onSuccess]);

  useEffect(() => {
    let mounted = true;
    const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

    if (!clientId) {
      callbacksRef.current.onError?.('Đăng nhập Google hiện chưa khả dụng.');
      return undefined;
    }

    const handleCredential = async (response) => {
      if (!mounted || !response?.credential) return;
      callbacksRef.current.onLoadingChange?.(true);
      try {
        const payload = await loginWithGoogle(response.credential);
        if (mounted) callbacksRef.current.onSuccess?.(payload);
      } catch (error) {
        if (mounted) callbacksRef.current.onError?.(error.message || 'Không thể đăng nhập bằng Google.');
      } finally {
        if (mounted) callbacksRef.current.onLoadingChange?.(false);
      }
    };

    loadGoogleIdentityServices()
      .then((google) => {
        if (!mounted || !google?.accounts?.id || !containerRef.current) return;
        credentialHandler = handleCredential;

        if (initializedClientId !== clientId) {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => credentialHandler?.(response),
            use_fedcm_for_prompt: true,
          });
          initializedClientId = clientId;
        }

        containerRef.current.replaceChildren();
        google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.max(220, Math.floor(containerRef.current.clientWidth || 260)),
          locale: 'vi',
        });
      })
      .catch((error) => {
        if (mounted) callbacksRef.current.onError?.(error.message || 'Không thể tải đăng nhập Google.');
      });

    return () => {
      mounted = false;
      if (credentialHandler === handleCredential) credentialHandler = undefined;
    };
  }, [mode]);

  return <div className="google-auth-button" ref={containerRef} aria-label="Đăng nhập bằng Google" />;
}
