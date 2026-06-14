import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import { auth, messaging } from "../firebase";
import { api } from "../api";
import app from "../firebase";

export const AuthContext = createContext(null);

const db = getFirestore(app);
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const heartbeatRef = useRef(null);
  const prevUidRef = useRef(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !VAPID_KEY) {
      return;
    }

    const registerToken = async () => {
      try {
        if (!messaging) return;
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        const rolePayload = role || "distress";
        const departmentPayload = department || role || "distress";
        await api.post("/api/register-device", {
          role: rolePayload,
          department: departmentPayload,
          fcm_token: fcmToken,
          uid: user.uid,
        });
      } catch (error) {
        console.warn("FCM registration skipped:", error);
      }
    };

    registerToken();
  }, [role, department, user]);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          try {
            if (firebaseUser) {
              console.log("[Auth] UID:", firebaseUser.uid);
              const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
              console.log("[Auth] Doc exists:", userDoc.exists());
              if (userDoc.exists()) {
                console.log("[Auth] Doc data:", userDoc.data());
              }
              const fetchedRole = userDoc.exists()
                ? userDoc.data().role || null
                : null;
              const fetchedDepartment = userDoc.exists()
                ? userDoc.data().department || fetchedRole
                : null;
              console.log("[Auth] Fetched role:", fetchedRole, "department:", fetchedDepartment);
              setRole(fetchedRole);
              setDepartment(fetchedDepartment);
              setUser(firebaseUser);

              prevUidRef.current = firebaseUser.uid;
              await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/availability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: firebaseUser.uid, is_available: true })
              }).catch(() => {});

              clearInterval(heartbeatRef.current);
              heartbeatRef.current = setInterval(async () => {
                await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/heartbeat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uid: firebaseUser.uid })
                }).catch(() => {});
              }, 60000);
            } else {
              const prevUid = prevUidRef.current;
              prevUidRef.current = null;

              clearInterval(heartbeatRef.current);
              heartbeatRef.current = null;

              if (prevUid) {
                await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/availability`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uid: prevUid, is_available: false })
                }).catch(() => {});
              }

              setUser(null);
              setRole(null);
              setDepartment(null);
            }
          } catch (err) {
            console.error("[Auth] Firestore fetch error:", err);
            setUser(firebaseUser || null);
            setRole(null);
            setDepartment(null);
          } finally {
            setLoading(false);
          }
        },
        () => {
          setUser(null);
          setRole(null);
          setDepartment(null);
          setLoading(false);
        },
      );
    } catch {
      setUser(null);
      setRole(null);
      setDepartment(null);
      setLoading(false);
    }

    return () => {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      unsubscribe();
    };
  }, []);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, role, department, loading, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
