// popup/popup.js

const EXTPAY_ID = "your-extensionpay-id-here"; // get from extensionpay.com

document.addEventListener("DOMContentLoaded", async () => {
  await loadUserStatus();
  setupBYOK();
  setupUpgradeButton();
  setupAutoCheckToggle();
});

async function loadUserStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
      if (!status) {
        resolve();
        return;
      }

      const planBadge = document.getElementById("planBadge");

      if (status.plan === "pro") {
        planBadge.textContent = "⚡ Pro Plan";
        planBadge.style.color = "#3fb950";
        document.getElementById("freeUsageSection").style.display = "none";
        document.getElementById("proSection").style.display = "block";
        document.getElementById("totalChecks").textContent =
          `${status.totalChecks?.toLocaleString() || 0} total checks performed`;
      } else if (status.plan === "byok") {
        planBadge.textContent = "🔑 BYOK Plan";
        planBadge.style.color = "#a371f7";
        document.getElementById("freeUsageSection").style.display = "none";
        document.getElementById("proSection").style.display = "block";
        document.getElementById("byokActive").style.display = "block";
        document.getElementById("byokForm").style.display = "none";
      } else {
        // Free plan
        planBadge.textContent = "Free Plan";
        planBadge.style.color = "#8b949e";
        document.getElementById("freeUsageSection").style.display = "block";
        document.getElementById("proSection").style.display = "none";

        const used = status.checksUsed || 0;
        const limit = status.checksLimit || 10;
        const pct = Math.round((used / limit) * 100);

        document.getElementById("usageBarFill").style.width =
          `${Math.min(pct, 100)}%`;
        document.getElementById("usageBarFill").style.background =
          pct >= 90 ? "#f85149" : pct >= 70 ? "#ffa657" : "#3fb950";
        document.getElementById("usageText").textContent =
          `${used} of ${limit} free checks used this month`;
      }

      resolve();
    });
  });
}

function setupUpgradeButton() {
  const btn = document.getElementById("upgradeBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // This opens ExtensionPay's hosted payment page
    chrome.runtime.sendMessage({ type: "OPEN_PAYMENT" });
  });
}

// Check payment status when popup opens
async function checkPaymentStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CHECK_PAID" }, (response) => {
      resolve(response?.paid || false);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const paid = await checkPaymentStatus();

  if (paid) {
    // Show pro UI
    document.getElementById("planBadge").textContent = "⚡ Pro Plan";
    document.getElementById("planBadge").style.color = "#3fb950";
    document.getElementById("freeUsageSection").style.display = "none";
    document.getElementById("proSection").style.display = "block";
  } else {
    // Show free UI
    document.getElementById("planBadge").textContent = "Free Plan";
    document.getElementById("freeUsageSection").style.display = "block";
    document.getElementById("proSection").style.display = "none";
  }

  setupBYOK();
  setupUpgradeButton();
});

function setupAutoCheckToggle() {
  const toggle = document.getElementById("autoCheckToggle");
  if (!toggle) return;

  // Load saved value
  chrome.storage.sync.get(["autoCheck"], (settings) => {
    toggle.checked = settings.autoCheck === true;
  });

  // Persist on change — content script reacts via chrome.storage.onChanged
  toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ autoCheck: toggle.checked });
  });
}

function setupBYOK() {
  const saveBtn = document.getElementById("saveBYOKBtn");
  const removeBtn = document.getElementById("removeBYOKBtn");

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const keys = {
        anthropicKey: document.getElementById("byok-anthropic").value.trim(),
        openaiKey: document.getElementById("byok-openai").value.trim(),
        geminiKey: document.getElementById("byok-gemini").value.trim(),
        cohereKey: document.getElementById("byok-cohere").value.trim(),
        groqKey: document.getElementById("byok-groq").value.trim(),
        deepseekKey: document.getElementById("byok-deepseek").value.trim(),
      };

      if (
        !keys.anthropicKey &&
        !keys.openaiKey &&
        !keys.geminiKey &&
        !keys.cohereKey &&
        !keys.groqKey &&
        !keys.deepseekKey
      ) {
        document.getElementById("byokStatus").textContent =
          "Please enter at least one API key";
        document.getElementById("byokStatus").style.color = "#f85149";
        return;
      }

      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;

      chrome.runtime.sendMessage({ type: "SAVE_BYOK", keys }, (result) => {
        saveBtn.textContent = "Save Keys";
        saveBtn.disabled = false;

        if (result?.success) {
          document.getElementById("byokStatus").textContent =
            "✓ Keys saved successfully";
          document.getElementById("byokStatus").style.color = "#3fb950";
          setTimeout(() => loadUserStatus(), 500);
        } else {
          document.getElementById("byokStatus").textContent =
            "Error saving keys";
          document.getElementById("byokStatus").style.color = "#f85149";
        }
      });
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "REMOVE_BYOK" }, () => {
        loadUserStatus();
      });
    });
  }
}
