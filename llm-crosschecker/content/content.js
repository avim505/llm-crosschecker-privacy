// content/content.js
// Runs on ChatGPT and Claude pages
// Detects AI responses and injects verification UI

// ── Detect which site we are on ───────────────────────────────────────────────
const SITE = {
  isChatGPT:
    window.location.hostname.includes("chatgpt.com") ||
    window.location.hostname.includes("chat.openai.com"),
  isClaude: window.location.hostname.includes("claude.ai"),
  isGemini: window.location.hostname.includes("gemini.google.com"),
};

console.log("LLM Checker loaded on:", window.location.hostname);
console.log("Is ChatGPT:", SITE.isChatGPT);
console.log("Is Claude:", SITE.isClaude);
console.log("Is Gemini:", SITE.isGemini);

// ── Selectors — multiple fallbacks for each platform ─────────────────────────
const SELECTORS = {
  chatgpt: [
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"] .prose',
    '[data-message-author-role="assistant"]',
    ".agent-turn .prose",
    ".agent-turn",
    '[class*="assistant"] .markdown',
    '[class*="Message"] .markdown',
  ],
  claude: [
    // Current Claude.ai DOM (2025)
    '[data-testid="assistant-message"] .prose',
    '[data-testid="assistant-message"]',
    ".font-claude-message",
    '[class*="font-claude"]',
    '[class*="assistant-message"]',
    // Fallbacks for older or alternate Claude layouts
    '[class*="AssistantMessage"]',
    '[class*="assistant"] .prose',
    ".prose-base",
  ],
  gemini: [
    // Gemini (gemini.google.com) response containers
    ".model-response-text",
    "message-content",
    ".response-container-scrollable .response-content",
    "[data-response-id]",
    ".chat-history .model-response",
    '[class*="response-text"]',
    '[class*="model-response"]',
  ],
};

// ── Create the verify button ──────────────────────────────────────────────────
function createVerifyButton() {
  const btn = document.createElement("button");
  btn.className = "llm-checker-btn";
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
    Cross-Check
  `;
  return btn;
}

// ── Create loading panel ──────────────────────────────────────────────────────
function createLoadingPanel() {
  const panel = document.createElement("div");
  panel.className = "llm-checker-panel loading";
  panel.innerHTML = `
    <div class="llm-checker-header">
      <span class="llm-checker-logo">🔍</span>
      <span>Cross-checking across AI models...</span>
    </div>
    <div class="llm-checker-loading">
      <div class="llm-checker-spinner"></div>
      <span>Querying multiple AI models simultaneously</span>
    </div>
  `;
  return panel;
}

// ── Create results panel ──────────────────────────────────────────────────────
function createResultsPanel(data) {
  const { results, overall, plan, usage } = data;
  const panel = document.createElement("div");
  panel.className = "llm-checker-panel";

  const modelResults = results
    .map((r) => {
      // Locked model (free tier)
      if (r.locked) {
        return `
        <div class="llm-checker-model locked">
          <div class="llm-checker-model-header">
            <span class="llm-checker-model-name">${r.model}</span>
            <span class="llm-checker-model-verdict" style="color:#8b949e;">🔒 Pro Only</span>
          </div>
          <div class="llm-checker-model-summary" style="color:#8b949e;">
            Upgrade to Pro to unlock this model
          </div>
        </div>`;
      }

      // API error
      if (r.error && !r.locked) {
        return `
        <div class="llm-checker-model error">
          <div class="llm-checker-model-header">
            <span class="llm-checker-model-name">${r.model}</span>
            <span class="llm-checker-model-verdict" style="color:#f85149;">API Error</span>
          </div>
          <div class="llm-checker-model-summary" style="color:#8b949e;">${r.error}</div>
        </div>`;
      }

      const v = r.result;
      const verdictColor =
        {
          ACCURATE: "#3fb950",
          PARTIALLY_ACCURATE: "#d29922",
          INACCURATE: "#f85149",
          UNVERIFIABLE: "#8b949e",
        }[v.verdict] || "#8b949e";

      const issuesList = v.issues?.length
        ? v.issues.map((i) => `<li>${i}</li>`).join("")
        : "";
      const contextList = v.missing_context?.length
        ? v.missing_context.map((c) => `<li>${c}</li>`).join("")
        : "";

      return `
      <div class="llm-checker-model">
        <div class="llm-checker-model-header">
          <span class="llm-checker-model-name">${r.model}</span>
          <span class="llm-checker-model-verdict" style="color:${verdictColor}">
            ${v.verdict.replace(/_/g, " ")}
          </span>
          <span class="llm-checker-confidence">${v.confidence}% confident</span>
        </div>
        <div class="llm-checker-model-summary">${v.summary}</div>
        ${v.bias_detected ? `<div class="llm-checker-bias">⚠️ Bias: ${v.bias_description}</div>` : ""}
        ${issuesList ? `<ul class="llm-checker-issues">${issuesList}</ul>` : ""}
        ${contextList ? `<div class="llm-checker-context"><strong>Missing context:</strong><ul>${contextList}</ul></div>` : ""}
      </div>`;
    })
    .join("");

  // Usage bar for free users
  const usageBar =
    plan === "free" && usage?.checksLimit
      ? `
    <div class="llm-checker-usage-bar">
      <span>${usage.checksUsed}/${usage.checksLimit} free checks used this month</span>
      <a href="#" class="llm-checker-upgrade-link" id="upgradeLink">Upgrade to Pro</a>
    </div>`
      : "";

  panel.innerHTML = `
    <div class="llm-checker-header">
      <span class="llm-checker-logo">🔍</span>
      <span class="llm-checker-title">LLM Cross-Checker Results</span>
      <button class="llm-checker-close">✕</button>
    </div>

    <div class="llm-checker-overall" style="border-left: 4px solid ${overall.color}">
      <div class="llm-checker-verdict" style="color: ${overall.color}">
        ${overall.verdict}
      </div>
      <div class="llm-checker-verdict-msg">${overall.message}</div>
      <div class="llm-checker-avg-confidence">
        Average confidence: ${overall.confidence}%
        <div class="llm-checker-conf-bar">
          <div class="llm-checker-conf-fill"
               style="width:${overall.confidence}%; background:${overall.color}">
          </div>
        </div>
      </div>
    </div>

    <div class="llm-checker-models">
      <div class="llm-checker-models-title">Individual Model Assessments</div>
      ${modelResults}
    </div>

    ${usageBar}

    <div class="llm-checker-footer">
      Checked ${results.filter((r) => !r.error && !r.locked).length} of ${results.length} models
      ${plan === "free" ? ' — <a href="#" id="upgradeFooter" style="color:#58a6ff;">Upgrade for all 4 models</a>' : ""}
    </div>
  `;

  // Close button
  panel.querySelector(".llm-checker-close").addEventListener("click", () => {
    panel.remove();
  });

  // Upgrade links open payment page
  panel.querySelectorAll("#upgradeLink, #upgradeFooter").forEach((el) => {
    el?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "OPEN_PAYMENT" });
    });
  });

  return panel;
}

// ── Create limit reached panel ────────────────────────────────────────────────
function createLimitPanel(response) {
  const panel = document.createElement("div");
  panel.className = "llm-checker-limit-panel";
  panel.innerHTML = `
    <div class="llm-checker-limit-icon">🔒</div>
    <div class="llm-checker-limit-title">Free limit reached</div>
    <div class="llm-checker-limit-msg">${response.message}</div>
    <div class="llm-checker-limit-usage">
      ${response.checksUsed}/${response.checksLimit} checks used this month
    </div>
    <button class="llm-checker-upgrade-btn" id="limitUpgradeBtn">
      ⚡ Upgrade to Pro — $4.99/month
    </button>
    <div style="font-size:11px;color:#8b949e;margin-top:8px;">
      Or bring your own API keys for $1.99/month
    </div>
  `;

  panel.querySelector("#limitUpgradeBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PAYMENT" });
  });

  return panel;
}

// ── Inject verify button into a response element ──────────────────────────────
function injectVerifyButton(responseEl) {
  if (responseEl.dataset.llmCheckerInjected === "true") return;

  // Walk up ancestors to check if any container for this message was already
  // processed. We mark containers with data-llm-checker-done at injection time,
  // so this catches cases where two different nested elements belong to the same
  // message (e.g. [class*="font-claude"] matching both outer and inner divs).
  let node = responseEl.parentNode;
  while (node && node !== document.body) {
    if (node.dataset && node.dataset.llmCheckerDone === "true") return;
    node = node.parentNode;
  }

  // Find the best named container to mark, so all children of this message
  // are covered by a single marker going forward.
  const messageContainer =
    responseEl.closest('[data-message-author-role="assistant"]') ||
    responseEl.closest('[data-testid="assistant-message"]') ||
    responseEl.closest("[data-response-id]") ||
    responseEl.closest("message-content") ||
    responseEl.parentNode;

  messageContainer.dataset.llmCheckerDone = "true";
  responseEl.dataset.llmCheckerInjected = "true";

  const btn = createVerifyButton();
  const wrapper = document.createElement("div");
  wrapper.className = "llm-checker-wrapper";
  wrapper.appendChild(btn);

  responseEl.parentNode.insertBefore(wrapper, responseEl.nextSibling);

  btn.addEventListener("click", async () => {
    // ── Extract text from response ──────────────────────────────────────────
    let text = "";

    // Try markdown/prose child first
    const markdownEl = responseEl.querySelector(
      '.markdown, .prose, [class*="markdown"], [class*="prose"], .message-content',
    );
    if (markdownEl) {
      text = markdownEl.innerText || markdownEl.textContent;
    }

    // Fall back to full element text
    if (!text || text.length < 10) {
      text = responseEl.innerText || responseEl.textContent;
    }

    // Fall back to all paragraphs
    if (!text || text.length < 10) {
      const paras = responseEl.querySelectorAll("p, li, h1, h2, h3, h4, span");
      text = Array.from(paras)
        .map((p) => p.innerText)
        .join(" ");
    }

    console.log("LLM Checker extracted text length:", text?.length);

    if (!text || text.length < 10) {
      alert("Could not extract response text. Please try again.");
      return;
    }

    // Remove existing panel
    const existing = wrapper.querySelector(
      ".llm-checker-panel, .llm-checker-limit-panel",
    );
    if (existing) existing.remove();

    // Show loading
    btn.disabled = true;
    btn.innerHTML = "⏳ Checking...";
    const loadingPanel = createLoadingPanel();
    wrapper.appendChild(loadingPanel);

    // Send to background worker
    chrome.runtime.sendMessage(
      { type: "VERIFY_RESPONSE", text: text.slice(0, 4000) },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError.message);
          loadingPanel.remove();
          btn.disabled = false;
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Cross-Check`;
          return;
        }

        loadingPanel.remove();
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Cross-Check Again`;

        if (response?.limitReached) {
          wrapper.appendChild(createLimitPanel(response));
          return;
        }

        if (response?.success) {
          wrapper.appendChild(createResultsPanel(response));
        } else {
          const errorDiv = document.createElement("div");
          errorDiv.className = "llm-checker-error";
          errorDiv.textContent = `Error: ${response?.error || "Unknown error occurred"}`;
          wrapper.appendChild(errorDiv);
        }
      },
    );
  });
}

// ── Scan page for AI responses ────────────────────────────────────────────────
function scanForResponses() {
  const selectorList = SITE.isChatGPT
    ? SELECTORS.chatgpt
    : SITE.isGemini
    ? SELECTORS.gemini
    : SELECTORS.claude;

  for (const selector of selectorList) {
    const responses = document.querySelectorAll(selector);
    if (responses.length > 0) {
      let injected = 0;
      responses.forEach((el) => {
        const text = el.innerText || el.textContent || "";
        if (text.trim().length > 20) {
          injectVerifyButton(el);
          injected++;
        }
      });
      if (injected > 0) {
        console.log(
          `LLM Checker: injected ${injected} button(s) using selector: ${selector}`,
        );
        break;
      }
    }
  }
}

// ── MutationObserver — watches for new responses ──────────────────────────────
const observer = new MutationObserver(() => {
  clearTimeout(window.llmCheckerTimer);
  window.llmCheckerTimer = setTimeout(() => {
    scanForResponses();
  }, 800);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial scan
setTimeout(scanForResponses, 1000);
