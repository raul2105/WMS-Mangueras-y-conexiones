/* eslint-disable no-console */
const { execFileSync } = require("node:child_process");

const DEFAULT_USERS = [
  { key: "SYSTEM_ADMIN", email: "admin@scmayher.com", expectedRole: "SYSTEM_ADMIN", passwordEnv: "MOBILE_SYSTEM_ADMIN_PASSWORD" },
  { key: "MANAGER", email: "manager@scmayher.com", expectedRole: "MANAGER", passwordEnv: "MOBILE_MANAGER_PASSWORD" },
  { key: "WAREHOUSE_OPERATOR", email: "operator@scmayher.com", expectedRole: "WAREHOUSE_OPERATOR", passwordEnv: "MOBILE_WAREHOUSE_OPERATOR_PASSWORD" },
  { key: "SALES_EXECUTIVE", email: "sales@scmayher.com", expectedRole: "SALES_EXECUTIVE", passwordEnv: "MOBILE_SALES_EXECUTIVE_PASSWORD" },
];

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback) {
  const value = String(process.env[name] || "").trim();
  return value || fallback;
}

function awsJson(args, env) {
  const stdout = execFileSync("aws", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function run() {
  const clientId = requireEnv("MOBILE_USER_POOL_CLIENT_ID");
  const apiBaseUrl = requireEnv("MOBILE_API_BASE_URL").replace(/\/+$/, "");
  const awsProfile = optionalEnv("AWS_PROFILE", "default");
  const awsRegion = optionalEnv("AWS_REGION", "us-east-1");
  const env = { ...process.env, AWS_PAGER: "", AWS_REGION: awsRegion };

  for (const user of DEFAULT_USERS) {
    const password = requireEnv(user.passwordEnv);
    const auth = awsJson(
      [
        "cognito-idp",
        "initiate-auth",
        "--auth-flow",
        "USER_PASSWORD_AUTH",
        "--client-id",
        clientId,
        "--auth-parameters",
        `USERNAME=${user.email},PASSWORD=${password}`,
        "--profile",
        awsProfile,
        "--region",
        awsRegion,
      ],
      env,
    );

    const idToken = auth?.AuthenticationResult?.IdToken;
    if (!idToken) {
      throw new Error(`Missing IdToken for ${user.email}`);
    }

    const me = await fetchJson(`${apiBaseUrl}/v1/mobile/me/permissions`, idToken);
    if (!me.response.ok) {
      throw new Error(`me/permissions failed for ${user.email}: ${me.response.status}`);
    }

    const roleCodes = Array.isArray(me.payload?.roleCodes) ? me.payload.roleCodes : [];
    if (!roleCodes.includes(user.expectedRole)) {
      throw new Error(`Role mismatch for ${user.email}: expected ${user.expectedRole}, got ${roleCodes.join(",")}`);
    }

    console.log(`login-ok=${user.email} roles=${roleCodes.join(",")} expected=${user.expectedRole}`);
  }

  console.log("[smoke] mobile auth validation OK");
}

run().catch((error) => {
  console.error(`[smoke] FAILED: ${error.message}`);
  process.exit(1);
});
