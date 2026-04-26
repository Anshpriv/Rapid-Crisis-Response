import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getToken } from 'firebase/messaging'

import { auth, messaging } from '../firebase'
import { api } from '../api'

const styles = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: 'radial-gradient(circle at 20% 20%, #1f2a44 0%, #121a2f 45%, #0b1020 100%)',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#1a1a2e',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    borderRadius: '16px',
    boxShadow: '0 20px 45px rgba(0, 0, 0, 0.42)',
    padding: '28px 24px',
  },
  title: {
    margin: 0,
    marginBottom: '18px',
    color: '#f8fafc',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  form: {
    display: 'grid',
    gap: '12px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#0f172a',
    color: '#f1f5f9',
    borderRadius: '10px',
    padding: '11px 12px',
    fontSize: '0.95rem',
    outline: 'none',
  },
  button: {
    marginTop: '6px',
    border: 'none',
    borderRadius: '10px',
    background: '#ef4444',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '0.95rem',
    padding: '11px 12px',
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.75,
    cursor: 'not-allowed',
  },
  error: {
    color: '#ef4444',
    margin: '2px 0 0',
    fontSize: '0.9rem',
  },
}

export default function LoginPage() {
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
        if (permission === 'granted') {
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
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Crisis Response - Staff Login</h1>
        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="email"
            placeholder="Staff email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.disabledButton : {}),
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  )
}
