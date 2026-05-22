// background.js
// LLM Cross-Checker — Background Service Worker
// API calls go to your backend server
// ExtensionPay handles subscription management
importScripts("ExtPay.js");

// ── Import ExtPay ─────────────────────────────────────────────────────────────
const extpay = ExtPay("llm-cross-checker");
extpay.startBackground();

// ── Backend URL ───────────────────────────────────────────────────────────────
// Update this after deploying to Render
const BACKEND_URL = "https://llm-crosschecker-backend.onrender.com";

// ── Generate or retrieve unique install ID ────────────────────────────────────
async function getInstallId() {
  const stored = await chrome.storage.local.get(["installId"]);
  if (stored.installId) return stored.installId;

  const id = "llmc_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  await chrome.storage.local.set({ installId: id });
  return id;
}

// ── Get user status from backend ──────────────────────────────────────────────
async function getUserStatus(paid) {
  try {
    const installId = await getInstallId();
    const response = await fetch(
      `${BACKEND_URL}/api/auth/status/${installId}`,
      {
        headers: { "x-paid": paid ? "true" : "false" },
      },
    );
    const data = await response.json();
    await chrome.storage.local.set({ userStatus: data });
    return data;
  } catch (error) {
    console.error("Failed to get user status:", error);
    return null;
  }
}

// ── Save BYOK keys to backend ─────────────────────────────────────────────────
async function saveBYOKKeys(keys) {
  const installId = await getInstallId();
  const response = await fetch(`${BACKEND_URL}/api/auth/byok/${installId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(keys),
  });
  return response.json();
}

// ── Remove BYOK keys from backend ─────────────────────────────────────────────
async function removeBYOKKeys() {
  const installId = await getInstallId();
  const response = await fetch(`${BACKEND_URL}/api/auth/byok/${installId}`, {
    method: "DELETE",
  });
  return response.json();
}

// ── Main message handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Check if user has paid ──────────────────────────────────────────────────
  if (message.type === "CHECK_PAID") {
    extpay
      .getUser()
      .then((user) => {
        sendResponse({ paid: user.paid });
      })
      .catch(() => {
        sendResponse({ paid: false });
      });
    return true;
  }

  // ── Open ExtensionPay payment page ──────────────────────────────────────────
  if (message.type === "OPEN_PAYMENT") {
    extpay.openPaymentPage();
    sendResponse({ success: true });
    return true;
  }

  // ── Open ExtensionPay login page ────────────────────────────────────────────
  if (message.type === "OPEN_LOGIN") {
    extpay.openLoginPage();
    sendResponse({ success: true });
    return true;
  }

  // ── Get user status from backend ────────────────────────────────────────────
  if (message.type === "GET_STATUS") {
    extpay
      .getUser()
      .then((user) => {
        getUserStatus(user.paid).then((status) => {
          sendResponse({ ...status, paid: user.paid });
        });
      })
      .catch(() => {
        getUserStatus(false).then((status) => {
          sendResponse({ ...status, paid: false });
        });
      });
    return true;
  }

  // ── Verify response — main feature ──────────────────────────────────────────
  if (message.type === "VERIFY_RESPONSE") {
    extpay
      .getUser()
      .then((user) => {
        getInstallId().then((installId) => {
          fetch(`${BACKEND_URL}/api/verify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-install-id": installId,
            },
            body: JSON.stringify({
              text: message.text.slice(0, 10000),
              installId: installId,
              paid: user.paid,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error === "limit_reached") {
                sendResponse({
                  success: false,
                  limitReached: true,
                  message: data.message,
                  checksUsed: data.checksUsed,
                  checksLimit: data.checksLimit,
                });
              } else {
                sendResponse({ success: true, ...data });
              }
            })
            .catch((error) => {
              sendResponse({ success: false, error: error.message });
            });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: "Could not verify payment status",
        });
      });
    return true;
  }

  // ── Save BYOK keys ──────────────────────────────────────────────────────────
  if (message.type === "SAVE_BYOK") {
    saveBYOKKeys(message.keys)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // ── Remove BYOK keys ────────────────────────────────────────────────────────
  if (message.type === "REMOVE_BYOK") {
    removeBYOKKeys()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // ── Get settings ────────────────────────────────────────────────────────────
  if (message.type === "GET_SETTINGS") {
    chrome.storage.sync.get(["enabledModels", "autoCheck"], (settings) => {
      sendResponse(settings);
    });
    return true;
  }
});

// ── On install — initialize user ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  extpay.getUser().then((user) => {
    getUserStatus(user.paid);
  });
});

// ── Listen for payment events from ExtensionPay ───────────────────────────────
// Fires automatically when user pays or trial starts
extpay.onPaid.addListener((user) => {
  console.log("User paid:", user);
  getUserStatus(true);
  chrome.storage.local.set({ userPaid: true });
});
