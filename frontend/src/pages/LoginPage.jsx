import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, messaging } from '../firebase'
import { api } from '../api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const { getFirestore, doc, getDoc } = await import('firebase/firestore')
      const { default: app } = await import('../firebase')
      const db = getFirestore(app)
      const userDoc = await getDoc(doc(db, 'users', credential.user.uid))
      const role = userDoc.exists() ? userDoc.data().role || 'general' : 'general'

      try {
        const permission = await Notification.requestPermission()
        if (permission === 'granted' && messaging) {
          const fcmToken = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          })
          await api.post('/api/register-device', {
            role,
            fcm_token: fcmToken,
          })
        }
      } catch (fcmError) {
        console.warn('FCM registration skipped:', fcmError)
        // Do not block login if FCM fails — auth succeeded
      }
    } catch (authError) {
      setError('Invalid credentials. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .login-page-container {
          display: flex;
          min-height: 100vh;
          font-family: "Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: var(--bg-main);
          color: var(--text-main);
        }
        
        .left-panel {
          display: none;
        }

        @media (min-width: 768px) {
          .left-panel {
            display: flex;
            flex: 1;
            margin: 28px 0 28px 28px;
            border-radius: 8px;
            background: #ffffff;
            border: 1px solid #a2a4a5;
            position: relative;
            flex-direction: column;
            justify-content: space-between;
            padding: 40px 42px;
            box-sizing: border-box;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
          }
        }

        .pattern-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
          background-size: 36px 36px;
          opacity: 0.34;
          pointer-events: none;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--text-main);
          z-index: 1;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .brand-icon {
          width: 32px;
          height: 32px;
          color: var(--red-main);
          display: grid;
          place-items: center;
        }

        .brand-icon-inner {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px;
        }

        .brand-icon-inner div {
          display: none;
        }

        .left-text {
          font-size: clamp(2.8rem, 5vw, 4.8rem);
          font-weight: 800;
          line-height: 0.98;
          color: var(--text-main);
          max-width: 86%;
          z-index: 1;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .left-text span {
          color: var(--red-main);
        }

        .right-side {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 40px 24px;
        }

        .form-container {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border: 1px solid #a2a4a5;
          border-radius: 8px;
          padding: 2rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
        }

        .title {
          color: var(--text-main);
          font-size: 2rem;
          font-weight: 800;
          margin: 0 0 28px;
          letter-spacing: 0;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .input-field {
          width: 100%;
          box-sizing: border-box;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
          color: var(--text-main);
          border-radius: 6px;
          padding: 0.9rem 1rem;
          font-size: 0.95rem;
          outline: none;
          font-family: inherit;
          font-weight: 600;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field::placeholder {
          color: var(--text-muted);
        }

        .input-field:focus {
          border-color: transparent;
          box-shadow: 0 0 0 2px var(--red-main);
        }

        .btn-primary {
          width: 100%;
          background-color: var(--red-main);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          padding: 0.95rem;
          font-size: 0.8rem;
          font-weight: 800;
          cursor: pointer;
          transition: opacity 0.2s;
          display: flex;
          justify-content: center;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: inherit;
        }

        .btn-primary:hover {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
          margin: 24px 0;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .divider::before, .divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #cbd5e1;
        }

        .divider:not(:empty)::before {
          margin-right: 16px;
        }

        .divider:not(:empty)::after {
          margin-left: 16px;
        }

        .btn-guest {
          width: 100%;
          background-color: transparent;
          color: var(--text-muted);
          border: 1px solid #5c5c5c;
          border-radius: 6px;
          padding: 0.95rem;
          font-size: 0.8rem;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: background-color 0.2s, color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-transform: uppercase;
          font-family: inherit;
        }

        .btn-guest:hover {
          background-color: #f1f5f9;
          color: var(--text-main);
        }

        .links-container {
          margin-top: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .link {
          color: var(--red-main);
          cursor: pointer;
          text-decoration: none;
          font-weight: 800;
        }
        
        .link:hover {
          text-decoration: underline;
        }

        .error-message {
          color: var(--red-main);
          background: #fee2e2;
          font-size: 0.9rem;
          padding: 0.85rem;
          border-radius: 6px;
          margin-bottom: 16px;
          text-align: center;
          font-weight: 700;
        }

        @media (max-width: 767px) {
          .right-side {
            padding: 24px 16px;
          }

          .form-container {
            padding: 1.5rem;
          }
        }
      `}</style>
      <div className="login-page-container">
        <div className="left-panel">
          <div className="pattern-overlay"></div>
          <div className="brand-logo">
            <div className="brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="4" x2="12" y2="20"></line>
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <line x1="6.34" y1="6.34" x2="17.66" y2="17.66"></line>
                <line x1="6.34" y1="17.66" x2="17.66" y2="6.34"></line>
              </svg>
            </div>
            Emergency Core
          </div>
          <div className="left-text">
            Rapid<br /><span>Crisis</span><br />Response
          </div>
        </div>

        <div className="right-side">
          <div className="form-container">
            <h1 className="title">Sign in</h1>

            <form onSubmit={handleLogin}>
              <div className="input-group">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-field"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="divider">or</div>

            <button
              type="button"
              onClick={() => navigate('/guest')}
              className="btn-guest"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Guest Access
            </button>

            <div className="links-container">
              <a href="#" className="link">Forgot password?</a>
              <div>No account? <a href="#" className="link">Sign up</a></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
