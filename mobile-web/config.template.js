window.__WMS_MOBILE_CONFIG__ = {
  apiBaseUrl: "https://api.example.com",
  authMode: "cognito", // "mock" | "cognito"
  environment: "dev",
  cognito: {
    domain: "your-domain.auth.us-east-1.amazoncognito.com",
    clientId: "your-client-id",
    redirectUri: "http://localhost:4173/index.html",
    logoutUri: "http://localhost:4173/index.html",
    scope: "openid email profile",
  },
};
