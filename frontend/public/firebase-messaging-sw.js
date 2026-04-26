importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

if (self.FIREBASE_CONFIG?.apiKey) {
  firebase.initializeApp(self.FIREBASE_CONFIG);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "Emergency Alert";
    const options = {
      body: payload?.notification?.body || "New alert received.",
    };

    self.registration.showNotification(title, options);
  });
}
