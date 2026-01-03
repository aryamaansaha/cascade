/**
 * Login screen component.
 * Shows when user is not authenticated.
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { notify } from '../utils/notifications';
import './LoginScreen.css';

export function LoginScreen() {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      notify.error('Please enter email and password');
      return;
    }

    try {
      setLoading(true);
      if (isSignUp) {
        await signUpWithEmail(email, password);
        notify.success('Account created! Welcome to Cascade!');
      } else {
        await loginWithEmail(email, password);
        notify.success('Welcome back!');
      }
    } catch (error: any) {
      const message = error.message?.includes('user-not-found')
        ? 'No account found with this email'
        : error.message?.includes('wrong-password')
        ? 'Incorrect password'
        : error.message?.includes('email-already-in-use')
        ? 'Email already in use'
        : error.message || 'Authentication failed';
      notify.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <img src="/cascade_logo.png" alt="Cascade" className="login-logo" />
          <h1>Cascade</h1>
          <p>Project scheduling with critical path analysis</p>
        </div>

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

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={handleEmailAuth}>
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={6}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <button
            className="btn-text"
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={loading}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}

