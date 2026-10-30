import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext.jsx';
import { normalizeError } from '@/services/api.js';

export function GoogleIcon({ className = 'h-5 w-5', ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

/**
 * Modern Google Sign-In Button supporting Google Identity Services (GIS)
 * Seamlessly authenticates via backend /api/auth/google
 */
export function GoogleSignInButton({
  text = 'Continue with Google',
  onSuccess,
  onError,
  className = '',
}) {
  const { loginWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const hiddenBtnRef = useRef(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    // Dynamically load Google Identity Services SDK if not already loaded
    if (!window.google?.accounts?.id) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initGis();
      document.head.appendChild(script);
    } else {
      initGis();
    }

    function initGis() {
      if (!clientId || !window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (hiddenBtnRef.current) {
          window.google.accounts.id.renderButton(hiddenBtnRef.current, {
            theme: 'outline',
            size: 'large',
            type: 'standard',
          });
        }
      } catch (err) {
        console.warn('[GoogleAuth] init failed', err);
      }
    }
  }, [clientId]);

  const handleCredentialResponse = async (response) => {
    if (!response?.credential) {
      onError?.('Google authentication did not provide credentials');
      return;
    }

    setSubmitting(true);
    try {
      const user = await loginWithGoogle(response.credential);
      toast.success(`Welcome ${user.firstName || 'back'}!`);
      onSuccess?.(user);
    } catch (err) {
      const normalized = normalizeError(err);
      onError?.(normalized.message);
      toast.error(normalized.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClick = () => {
    if (!clientId) {
      toast.info('Google Sign-In is ready! To connect your Google Project, add your VITE_GOOGLE_CLIENT_ID to your environment variables.', {
        duration: 6000,
      });
      return;
    }

    if (window.google?.accounts?.id) {
      try {
        // Trigger Google One Tap or click rendered button for popup
        const nativeBtn = hiddenBtnRef.current?.querySelector('div[role="button"]');
        if (nativeBtn) {
          nativeBtn.click();
        } else {
          window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              // Fallback to token client popup if One Tap is suppressed
              if (window.google.accounts.oauth2) {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                  client_id: clientId,
                  scope: 'openid email profile',
                  callback: async (tokenRes) => {
                    if (tokenRes.access_token) {
                      setSubmitting(true);
                      try {
                        const user = await loginWithGoogle({ accessToken: tokenRes.access_token });
                        toast.success(`Welcome ${user.firstName || 'back'}!`);
                        onSuccess?.(user);
                      } catch (err) {
                        const normalized = normalizeError(err);
                        onError?.(normalized.message);
                        toast.error(normalized.message);
                      } finally {
                        setSubmitting(false);
                      }
                    }
                  },
                });
                tokenClient.requestAccessToken();
              }
            }
          });
        }
      } catch (err) {
        console.warn('[GoogleAuth] trigger error', err);
      }
    } else {
      toast.error('Google service is still loading. Please try again in a moment.');
    }
  };

  return (
    <>
      {/* Hidden container where official Google element mounts for secure popups */}
      <div ref={hiddenBtnRef} className="hidden" aria-hidden="true" />

      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className={`relative flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text-strong)] shadow-xs transition-all duration-150 hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        {submitting ? (
          <span className="flex items-center gap-2 text-[var(--text-muted)]">
            <svg className="h-4 w-4 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Signing in with Google...
          </span>
        ) : (
          <>
            <GoogleIcon className="h-5 w-5 shrink-0" />
            <span>{text}</span>
          </>
        )}
      </button>
    </>
  );
}
