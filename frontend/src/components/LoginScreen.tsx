/**
 * Login screen component.
 * Shows when user is not authenticated.
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../utils/notifications';
import './LoginScreen.css';

export function LoginScreen() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
      notify.success('Welcome to Cascade!');
    } catch (error: any) {
      notify.error(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        {/* Header with logo and tagline */}
        <div className="login-header">
          <img src="/cascade_logo.png" alt="Cascade" className="login-logo" />
          <h1>Cascade</h1>
          <h2 className="login-tagline">Plan smarter, ship faster</h2>
          <p className="login-description">
            Visual project scheduling with automatic dependency management.
            See what's critical, plan for delays, never miss a deadline.
          </p>
        </div>

        {/* Google Sign In */}
        <div className="login-form">
          <button
            className="btn-google"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>

        {/* Feature highlights */}
        <div className="login-features">
          <div className="feature">
            <span className="feature-icon">📊</span>
            <h3>Critical Path Analysis</h3>
            <p>Identify which tasks will delay your project</p>
          </div>
          <div className="feature">
            <span className="feature-icon">🔗</span>
            <h3>Smart Dependencies</h3>
            <p>Dates automatically adjust when blockers shift</p>
          </div>
          <div className="feature">
            <span className="feature-icon">🔮</span>
            <h3>What-If Planning</h3>
            <p>Simulate changes without breaking your schedule</p>
          </div>
        </div>

        {/* Mobile notice - only visible on small screens */}
        <div className="mobile-notice">
          <span className="mobile-notice-icon">💻</span>
          <p>For the best experience with drag-and-drop graph editing, try Cascade on desktop.</p>
        </div>

        {/* Developer credit */}
        <div className="login-footer">
          <p>
            Built by{' '}
            <a href="https://aryamaan.dev" target="_blank" rel="noopener noreferrer">
              Aryamaan Saha
            </a>
          </p>
          <div className="login-footer-links">
            <a href="https://github.com/aryamaansaha/cascade" target="_blank" rel="noopener noreferrer" title="GitHub">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a href="https://www.linkedin.com/in/aryamaansaha/" target="_blank" rel="noopener noreferrer" title="LinkedIn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a href="mailto:as7482@columbia.edu?subject=Cascade Feedback" title="Email">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

