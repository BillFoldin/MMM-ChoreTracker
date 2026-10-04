/**
 * =========================================================================
 * MMM-ChoreTracker - MMM-ChoreTracker.js
 * =========================================================================
 * Production-ready MagicMirror² Frontend Module.
 * 
 * Features:
 * - Pure vanilla JavaScript DOM manipulation with standard MagicMirror socket messaging.
 * - Kids Dashboard Main Screen: displays only the kids' names and avatars with 
 *   touchable profile cards.
 * - Child Chore Modal: clicking any kid's card opens a full modal displaying their
 *   assigned routine & monetized chores plus available up-for-grabs bounties.
 * - High-contrast visual badges: Routine Expectations vs Monetized Bounties ($X.XX).
 * - Instant completion toggling and threaded notes.
 * - PIN-protected parent administration dashboard for approvals, chore creation,
 *   and immutable payout audit logging.
 * 
 * @license MIT
 * =========================================================================
 */

Module.register("MMM-ChoreTracker", {
  // Module configuration defaults
  defaults: {
    title: "Family Chore Tracker",
    showTitleArea: false, // Default: ultra-compact layout for coexisting with large calendars
    showParentButton: true, // Display discrete Parent Mode lock button
    currencySymbol: "$",
    parentPin: "1234",
    pollInterval: 60000, // 60s fallback poll
    showCompletedTasks: true,
    allowChildNoteAuthoring: true,
    choresPerPage: 4,
    databaseDirectory: "data"
  },

  // Internal component state
  profiles: [],
  tasks: [],
  payoutRecords: [],
  selectedProfileId: null, // active child ID when viewing child chore modal
  childModalTab: "assigned", // "assigned" | "up_for_grabs"
  childModalPage: 1, // 1-based pagination page for chores list
  choresPerPage: 4, // Amount of chores per page shown
  activeModal: null, // null | 'child_chores' | 'task_detail' | 'who_completed' | 'pin_pad' | 'parent_panel'
  activeTaskId: null,
  completingTaskId: null,
  isParentUnlocked: false,
  pinInput: "",
  pinError: "",
  parentActiveTab: "approvals", // 'approvals' | 'manage_chores' | 'create_task' | 'children' | 'payout_engine' | 'history'
  manageChoresFilter: "all", // "all" | "routine" | "monetized"
  editingTaskId: null,
  editingTaskDraft: null,
  serverDate: "",

  // In-module task creation draft
  newTaskDraft: {
    title: "",
    category: "routine",
    frequency: "weekly", // "weekly" | "monthly" | "twice_a_year" | "yearly"
    reward_amount: "5.00",
    assigned_to: ["up_for_grabs"], // Array of selected child IDs or ['up_for_grabs']
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    initial_note: ""
  },

  // Payout calculation state
  payoutFilterProfileId: "",
  payoutRangeDays: 7,

  // On-screen Digital / Virtual Keyboard State
  virtualKeyboard: {
    isOpen: false,
    targetInput: null,
    title: "",
    value: "",
    type: "text",
    mode: "alpha", // "alpha" | "symbols" | "numbers"
    isShift: false,
    onChange: null,
    onConfirm: null
  },

  /**
   * Return required stylesheet
   */
  getStyles: function () {
    return ["MMM-ChoreTracker.css"];
  },

  /**
   * Module lifecycle startup
   */
  start: function () {
    Log.info(`[${this.name}] Starting module...`);
    this.serverDate = new Date().toISOString().split("T")[0];

    // Initialize global on-screen virtual keyboard listener for any touch screen inputs
    this.initGlobalVirtualKeyboardListener();

    // Transmit config to backend helper and request initial database load
    this.sendSocketNotification("CONFIG", this.config);
    this.sendSocketNotification("GET_INITIAL_DATA");

    // Fast-retry polling on boot in case the socket connection took a moment to handshake
    const self = this;
    [500, 1500, 3000, 6000, 10000].forEach((delay) => {
      setTimeout(() => {
        if (!self.profiles || self.profiles.length === 0) {
          Log.info(`[${self.name}] Retrying initial data fetch (${delay}ms)...`);
          self.sendSocketNotification("CONFIG", self.config);
          self.sendSocketNotification("GET_INITIAL_DATA");
        }
      }, delay);
    });

    // Periodic safety sync interval
    setInterval(function () {
      self.sendSocketNotification("GET_INITIAL_DATA");
    }, this.config.pollInterval);
  },

  /**
   * MagicMirror global notification handler:
   * Re-requests data once all modules have finished booting and sockets are hot
   */
  notificationReceived: function (notification, payload, sender) {
    if (notification === "ALL_MODULES_STARTED" || notification === "DOM_OBJECTS_CREATED") {
      this.sendSocketNotification("CONFIG", this.config);
      this.sendSocketNotification("GET_INITIAL_DATA");
    }
  },

  /**
   * MagicMirror Socket listener
   */
  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "INITIAL_DATA_RESPONSE":
        if (payload) {
          this.profiles = payload.profiles || [];
          this.tasks = payload.tasks || [];
          this.payoutRecords = payload.payout_records || [];
          if (payload.serverDate) this.serverDate = payload.serverDate;
          if (this.profiles.length > 0 && !this.payoutFilterProfileId) {
            this.payoutFilterProfileId = this.profiles[0].id;
          }
          this.updateDom(250);
        }
        break;

      case "CHORES_DATA_UPDATE":
        if (payload) {
          if (payload.profiles) this.profiles = payload.profiles;
          if (payload.tasks) this.tasks = payload.tasks;
          if (payload.serverDate) this.serverDate = payload.serverDate;
          this.updateDom(250);
        }
        break;

      case "PAYOUTS_DATA_UPDATE":
        if (payload && payload.payout_records) {
          this.payoutRecords = payload.payout_records;
          this.updateDom(250);
        }
        break;

      case "PARENT_PIN_VERIFIED":
        if (payload && payload.success) {
          this.isParentUnlocked = true;
          this.pinError = "";
          this.pinInput = "";
          this.activeModal = "parent_panel";
          this.updateDom(150);
        } else {
          this.pinError = (payload && payload.message) || "Invalid PIN. Try again.";
          this.pinInput = "";
          const overlay = document.getElementById("ct-body-modal-overlay");
          if (overlay && this.activeModal === "pin_pad") {
            const errEl = overlay.querySelector(".ct-pin-error");
            if (errEl) errEl.innerText = this.pinError;
            const dots = overlay.querySelectorAll(".ct-pin-dot");
            dots.forEach((dot) => dot.classList.remove("filled"));
          } else {
            this.updateDom(150);
          }
        }
        break;

      case "PAYOUT_PROCESSED":
        if (payload && payload.success) {
          this.pinError = "";
          this.updateDom(250);
        }
        break;

      default:
        break;
    }
  },

  /**
   * Digital / On-Screen Virtual Keyboard System:
   * Enables 100% touch typing on Raspberry Pi smart mirrors without requiring
   * a hardwired physical keyboard.
   */
  initGlobalVirtualKeyboardListener: function () {
    if (this._vkGlobalInit) return;
    this._vkGlobalInit = true;
    const self = this;

    const isTargetInput = function (el) {
      if (!el) return false;
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      return tag === "input" || tag === "textarea";
    };

    const handleGlobalTrigger = function (e) {
      const target = e.target;
      if (!isTargetInput(target)) return;
      if (target.getAttribute("data-no-vk") === "true") return;

      // Don't re-open if already typing in this target
      if (self.virtualKeyboard && self.virtualKeyboard.isOpen && self.virtualKeyboard.targetInput === target) {
        return;
      }

      const title = target.getAttribute("data-vk-title") || target.placeholder || "Enter text";
      const type = target.getAttribute("data-vk-type") || (target.type === "number" ? "number" : "text");

      self.openVirtualKeyboard({
        targetInput: target,
        title: title,
        type: type,
        value: target.value || ""
      });
    };

    // Global listener on focusin and pointerdown ensures ANY touched field opens the keyboard
    document.addEventListener("focusin", handleGlobalTrigger);
    document.addEventListener("pointerdown", function (e) {
      if (isTargetInput(e.target)) {
        handleGlobalTrigger(e);
      }
    });
  },

  attachVirtualKeyboard: function (element, title, type = "text", onChange = null, onConfirm = null) {
    if (!element) return;
    const self = this;

    const openHandler = function (e) {
      if (e) {
        e.stopPropagation();
      }
      self.openVirtualKeyboard({
        targetInput: element,
        title: title || element.placeholder || "Enter text",
        type: type,
        value: element.value || "",
        onChange: onChange,
        onConfirm: onConfirm
      });
    };

    element.style.cursor = "pointer";
    element.setAttribute("data-vk-attached", "true");
    if (title) element.setAttribute("data-vk-title", title);
    if (type) element.setAttribute("data-vk-type", type);

    // Multi-event binding for maximum Raspberry Pi touch screen compatibility
    element.addEventListener("pointerdown", openHandler);
    element.addEventListener("click", openHandler);
    element.addEventListener("focus", openHandler);
    element.addEventListener("touchend", function (e) {
      openHandler(e);
    });
  },

  openVirtualKeyboard: function (options) {
    this.virtualKeyboard = {
      isOpen: true,
      targetInput: options.targetInput || null,
      title: options.title || "Virtual Keyboard",
      value: options.value !== undefined ? String(options.value) : (options.targetInput ? options.targetInput.value : ""),
      type: options.type || "text",
      mode: options.type === "number" ? "numbers" : "alpha",
      isShift: false,
      onChange: options.onChange || null,
      onConfirm: options.onConfirm || null
    };
    this.renderVirtualKeyboard();
  },

  closeVirtualKeyboard: function () {
    const existing = document.getElementById("ct-virtual-keyboard-root");
    if (existing) {
      existing.remove();
    }
    this.virtualKeyboard.isOpen = false;
    this.virtualKeyboard.targetInput = null;
  },

  renderVirtualKeyboard: function () {
    const self = this;
    let container = document.getElementById("ct-virtual-keyboard-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "ct-virtual-keyboard-root";
      container.className = "ct-virtual-keyboard-backdrop";
      document.body.appendChild(container);
    } else {
      container.innerHTML = "";
      // Ensure it is ALWAYS the last child of document.body so it is physically in front of all modals
      document.body.appendChild(container);
    }

    // Explicit inline styles guaranteeing top-level visibility regardless of parent or modal CSS
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.right = "0";
    container.style.bottom = "0";
    container.style.width = "100vw";
    container.style.height = "100vh";
    container.style.zIndex = "2147483647"; // Max 32-bit integer z-index
    container.style.background = "rgba(0, 0, 0, 0.65)";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.justifyContent = "flex-end";
    container.style.pointerEvents = "auto";
    container.style.touchAction = "manipulation";

    const kb = document.createElement("div");
    kb.className = "ct-virtual-keyboard";
    kb.style.position = "relative";
    kb.style.zIndex = "2147483647";
    kb.style.pointerEvents = "auto";
    kb.style.touchAction = "manipulation";
    kb.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    kb.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });

    // Fast-touch key event binder for Raspberry Pi touchscreens
    const bindKeyAction = function (btn, action) {
      let handledPointer = false;
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        handledPointer = true;
        action();
      });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (handledPointer) {
          handledPointer = false;
          return;
        }
        action();
      });
    };

    // Top Bar with label and close button
    const topBar = document.createElement("div");
    topBar.className = "ct-vk-topbar";

    const titleEl = document.createElement("div");
    titleEl.className = "ct-vk-title";
    titleEl.innerHTML = `<span>⌨️</span> <strong>${this.virtualKeyboard.title}</strong>`;
    topBar.appendChild(titleEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ct-vk-close-btn";
    closeBtn.innerText = "✕ Close";
    bindKeyAction(closeBtn, function () {
      self.closeVirtualKeyboard();
    });
    topBar.appendChild(closeBtn);
    kb.appendChild(topBar);

    // Live preview display row
    const previewRow = document.createElement("div");
    previewRow.className = "ct-vk-preview-row";

    const previewDisplay = document.createElement("div");
    previewDisplay.className = "ct-vk-preview-display";
    previewDisplay.innerText = this.virtualKeyboard.value || "";
    
    const cursor = document.createElement("span");
    cursor.className = "ct-vk-cursor";
    previewDisplay.appendChild(cursor);
    previewRow.appendChild(previewDisplay);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ct-vk-clear-btn";
    clearBtn.innerText = "⌫ Clear";
    bindKeyAction(clearBtn, function () {
      self.virtualKeyboard.value = "";
      self.syncVirtualKeyboardValue();
    });
    previewRow.appendChild(clearBtn);
    kb.appendChild(previewRow);

    // Keys container
    const keysContainer = document.createElement("div");
    keysContainer.className = "ct-vk-keys-container";

    if (this.virtualKeyboard.mode === "numbers") {
      // NUMPAD MODE
      const numRows = [
        ["1", "2", "3", "+$1.00"],
        ["4", "5", "6", "+$5.00"],
        ["7", "8", "9", "+$10.00"],
        [".", "0", "⌫ Del", "✓ Done"]
      ];

      numRows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "ct-vk-row";
        row.forEach((key) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ct-vk-key";

          if (key === "✓ Done") {
            btn.classList.add("key-done");
          } else if (key === "⌫ Del") {
            btn.classList.add("key-action");
          } else if (key.startsWith("+")) {
            btn.classList.add("key-quick-amount");
          }

          btn.innerText = key;
          bindKeyAction(btn, function () {
            if (key === "✓ Done") {
              self.commitVirtualKeyboard();
            } else if (key === "⌫ Del") {
              self.virtualKeyboard.value = self.virtualKeyboard.value.slice(0, -1);
              self.syncVirtualKeyboardValue();
            } else if (key.startsWith("+")) {
              const addVal = parseFloat(key.replace(/[^\d.]/g, "")) || 0;
              const cur = parseFloat(self.virtualKeyboard.value) || 0;
              self.virtualKeyboard.value = (cur + addVal).toFixed(2);
              self.syncVirtualKeyboardValue();
            } else {
              self.virtualKeyboard.value += key;
              self.syncVirtualKeyboardValue();
            }
          });
          rowEl.appendChild(btn);
        });
        keysContainer.appendChild(rowEl);
      });

      // Bottom switch row to full QWERTY
      const switchRow = document.createElement("div");
      switchRow.className = "ct-vk-row";
      const switchBtn = document.createElement("button");
      switchBtn.type = "button";
      switchBtn.className = "ct-vk-key key-switch";
      switchBtn.innerText = "⌨ Switch to Full ABC Keyboard";
      bindKeyAction(switchBtn, function () {
        self.virtualKeyboard.mode = "alpha";
        self.renderVirtualKeyboard();
      });
      switchRow.appendChild(switchBtn);
      keysContainer.appendChild(switchRow);

    } else if (this.virtualKeyboard.mode === "symbols") {
      // SYMBOLS MODE
      const symbolRows = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
        ["-", "_", "=", "+", "[", "]", "{", "}", "\\", "/"],
        [":", ";", "\"", "'", "<", ">", "?", "!", "⌫ Del"],
        ["ABC", ",", "␣ Space", ".", "✓ Done"]
      ];

      symbolRows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "ct-vk-row";
        row.forEach((key) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ct-vk-key";

          if (key === "✓ Done") {
            btn.classList.add("key-done");
          } else if (key === "⌫ Del") {
            btn.classList.add("key-action");
          } else if (key === "ABC") {
            btn.classList.add("key-mode");
          } else if (key === "␣ Space") {
            btn.classList.add("key-space");
          }

          btn.innerText = key;
          bindKeyAction(btn, function () {
            if (key === "✓ Done") {
              self.commitVirtualKeyboard();
            } else if (key === "⌫ Del") {
              self.virtualKeyboard.value = self.virtualKeyboard.value.slice(0, -1);
              self.syncVirtualKeyboardValue();
            } else if (key === "ABC") {
              self.virtualKeyboard.mode = "alpha";
              self.renderVirtualKeyboard();
            } else if (key === "␣ Space") {
              self.virtualKeyboard.value += " ";
              self.syncVirtualKeyboardValue();
            } else {
              self.virtualKeyboard.value += key;
              self.syncVirtualKeyboardValue();
            }
          });
          rowEl.appendChild(btn);
        });
        keysContainer.appendChild(rowEl);
      });

    } else {
      // ALPHA QWERTY MODE
      const isShift = self.virtualKeyboard.isShift;
      const alphaRows = [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
        ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
        ["⇧ Shift", "z", "x", "c", "v", "b", "n", "m", "⌫ Del"],
        ["?123", ",", "␣ Space", ".", "✓ Done"]
      ];

      alphaRows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "ct-vk-row";
        row.forEach((key) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ct-vk-key";

          let displayKey = key;
          if (key.length === 1 && /[a-z]/i.test(key)) {
            displayKey = isShift ? key.toUpperCase() : key.toLowerCase();
          }

          if (key === "✓ Done") {
            btn.classList.add("key-done");
          } else if (key === "⌫ Del") {
            btn.classList.add("key-action");
          } else if (key === "⇧ Shift") {
            btn.classList.add("key-shift");
            if (isShift) btn.classList.add("active");
          } else if (key === "?123") {
            btn.classList.add("key-mode");
          } else if (key === "␣ Space") {
            btn.classList.add("key-space");
          }

          btn.innerText = displayKey;
          bindKeyAction(btn, function () {
            if (key === "✓ Done") {
              self.commitVirtualKeyboard();
            } else if (key === "⌫ Del") {
              self.virtualKeyboard.value = self.virtualKeyboard.value.slice(0, -1);
              self.syncVirtualKeyboardValue();
            } else if (key === "⇧ Shift") {
              self.virtualKeyboard.isShift = !self.virtualKeyboard.isShift;
              self.renderVirtualKeyboard();
            } else if (key === "?123") {
              self.virtualKeyboard.mode = "symbols";
              self.renderVirtualKeyboard();
            } else if (key === "␣ Space") {
              self.virtualKeyboard.value += " ";
              self.syncVirtualKeyboardValue();
            } else {
              self.virtualKeyboard.value += displayKey;
              if (self.virtualKeyboard.isShift) {
                self.virtualKeyboard.isShift = false;
                self.renderVirtualKeyboard();
              } else {
                self.syncVirtualKeyboardValue();
              }
            }
          });
          rowEl.appendChild(btn);
        });
        keysContainer.appendChild(rowEl);
      });
    }

    kb.appendChild(keysContainer);
    container.appendChild(kb);

    container.addEventListener("click", function (e) {
      if (e.target === container) {
        self.commitVirtualKeyboard();
      }
    });
  },

  syncVirtualKeyboardValue: function () {
    const val = this.virtualKeyboard.value;
    const preview = document.querySelector(".ct-vk-preview-display");
    if (preview) {
      preview.innerText = val;
      const cursor = document.createElement("span");
      cursor.className = "ct-vk-cursor";
      preview.appendChild(cursor);
    }
    if (this.virtualKeyboard.targetInput) {
      this.virtualKeyboard.targetInput.value = val;
      this.virtualKeyboard.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (typeof this.virtualKeyboard.onChange === "function") {
      this.virtualKeyboard.onChange(val);
    }
  },

  commitVirtualKeyboard: function () {
    const val = this.virtualKeyboard.value;
    if (this.virtualKeyboard.targetInput) {
      this.virtualKeyboard.targetInput.value = val;
      this.virtualKeyboard.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      this.virtualKeyboard.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (typeof this.virtualKeyboard.onConfirm === "function") {
      this.virtualKeyboard.onConfirm(val);
    }
    this.closeVirtualKeyboard();
  },

  /**
   * Generates the pure vanilla DOM tree for MagicMirror²
   */
  closeModal: function () {
    this.closeVirtualKeyboard();
    const existing = document.getElementById("ct-body-modal-overlay");
    if (existing) existing.remove();
    this.activeModal = null;
    this.selectedProfileId = null;
    this.activeTaskId = null;
    this.completingTaskId = null;
    this.pinInput = "";
    this.pinError = "";
    this.updateDom(150);
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-choretracker";

    // Clean up any stale body modal overlay
    const existing = document.getElementById("ct-body-modal-overlay");
    if (existing) {
      existing.remove();
    }

    // Header bar
    wrapper.appendChild(this.buildHeader());

    // Main screen: Kids Dashboard (only displays names and summary cards of kids)
    wrapper.appendChild(this.buildKidsDashboard());

    // Overlay Modals - full screen viewport takeover mounted directly to document.body
    let modalEl = null;
    if (this.activeModal === "who_completed" && this.completingTaskId) {
      modalEl = this.buildWhoCompletedModal(this.completingTaskId);
    } else if (this.activeModal === "child_chores" && this.selectedProfileId) {
      modalEl = this.buildChildChoresModal(this.selectedProfileId);
    } else if (this.activeModal === "task_detail" && this.activeTaskId) {
      modalEl = this.buildTaskModal(this.activeTaskId);
    } else if (this.activeModal === "pin_pad") {
      modalEl = this.buildPinModal();
    } else if (this.activeModal === "parent_panel") {
      modalEl = this.buildParentPanel();
    }

    if (modalEl) {
      modalEl.id = "ct-body-modal-overlay";
      if (typeof document !== "undefined" && document.body) {
        document.body.appendChild(modalEl);
      } else {
        wrapper.appendChild(modalEl);
      }
    }

    return wrapper;
  },

  /**
   * Builds top header:
   * By default (compact mode), omits the bulky title, subtitle, icon, and summary pills,
   * rendering ONLY the discrete Parent Mode button to conserve vertical screen space.
   */
  buildHeader: function () {
    const self = this;

    // Compact Mode (Default): Only render the Parent Mode button
    if (!this.config.showTitleArea) {
      if (!this.config.showParentButton) {
        return document.createDocumentFragment();
      }

      const compactBar = document.createElement("div");
      compactBar.className = "ct-compact-bar";

      const unlockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
      const lockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

      const parentBtn = document.createElement("button");
      parentBtn.className = `ct-btn-parent compact ${this.isParentUnlocked ? "unlocked" : ""}`;
      parentBtn.innerHTML = this.isParentUnlocked
        ? `${unlockSvg}<span>Parent Mode</span>`
        : `${lockSvg}<span>Parent Mode</span>`;

      parentBtn.addEventListener("click", function () {
        if (self.isParentUnlocked) {
          self.activeModal = "parent_panel";
        } else {
          self.pinInput = "";
          self.pinError = "";
          self.activeModal = "pin_pad";
        }
        self.updateDom(200);
      });

      compactBar.appendChild(parentBtn);
      return compactBar;
    }

    // Full Title Area (Only if explicitly enabled via config: { showTitleArea: true })
    const header = document.createElement("div");
    header.className = "ct-header";

    // Left title group
    const left = document.createElement("div");
    left.className = "ct-header-left";

    const iconBox = document.createElement("div");
    iconBox.className = "ct-module-icon";
    iconBox.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>`;
    left.appendChild(iconBox);

    const titleGroup = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "ct-title";
    title.innerText = this.config.title;

    const subtitle = document.createElement("p");
    subtitle.className = "ct-subtitle";
    const dateFormatted = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    subtitle.innerText = `${dateFormatted} • Tap a child to view chores`;

    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);
    left.appendChild(titleGroup);
    header.appendChild(left);

    // Right action group
    const right = document.createElement("div");
    right.className = "ct-header-right";

    // Summary stats
    const statsPills = document.createElement("div");
    statsPills.className = "ct-summary-pills";

    // Count completed today across all tasks
    const completedCount = this.tasks.filter((t) =>
      t.category === "routine" ? t.is_completed_today : t.is_completed
    ).length;
    const routineStat = document.createElement("div");
    routineStat.className = "ct-stat-pill sky";
    const checkStatSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    routineStat.innerHTML = `${checkStatSvg}<span>${completedCount}/${this.tasks.length} Done</span>`;
    statsPills.appendChild(routineStat);

    // Available Bounty sum ($)
    const availableBounty = this.tasks
      .filter((t) => t.category === "monetized" && !t.is_completed)
      .reduce((sum, t) => sum + (parseFloat(t.reward_amount) || 0), 0);

    const bountyStat = document.createElement("div");
    bountyStat.className = "ct-stat-pill emerald";
    const boltStatSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
    bountyStat.innerHTML = `${boltStatSvg}<span>${this.config.currencySymbol}${availableBounty.toFixed(2)} Open</span>`;
    statsPills.appendChild(bountyStat);
    right.appendChild(statsPills);

    // Parent Mode lock button
    const parentBtn = document.createElement("button");
    parentBtn.className = `ct-btn-parent ${this.isParentUnlocked ? "unlocked" : ""}`;
    const headerUnlockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
    const headerLockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    parentBtn.innerHTML = this.isParentUnlocked
      ? `${headerUnlockSvg}<span>Parent Mode</span>`
      : `${headerLockSvg}<span>Parent Lock</span>`;

    parentBtn.addEventListener("click", function () {
      if (self.isParentUnlocked) {
        self.activeModal = "parent_panel";
      } else {
        self.pinInput = "";
        self.pinError = "";
        self.activeModal = "pin_pad";
      }
      self.updateDom(200);
    });

    right.appendChild(parentBtn);
    header.appendChild(right);

    return header;
  },

  /**
   * Main Screen: Kids Dashboard
   * Instead of listing chores on the main screen, this shows prominent touchable
   * cards with each kid's name, avatar, and quick progress indicator.
   */
  buildKidsDashboard: function () {
    const grid = document.createElement("div");
    grid.className = "ct-kids-grid";

    const self = this;

    // Distinct background colors for kids' avatars
    const avatarGradients = [
      "linear-gradient(135deg, #3b82f6, #1d4ed8)", // Blue
      "linear-gradient(135deg, #a855f7, #7e22ce)", // Purple
      "linear-gradient(135deg, #f59e0b, #d97706)", // Amber
      "linear-gradient(135deg, #ec4899, #be185d)" // Pink
    ];

    if (!this.profiles || this.profiles.length === 0) {
      const emptyCard = document.createElement("div");
      emptyCard.className = "ct-kid-card";
      emptyCard.style.gridColumn = "1 / -1";
      emptyCard.style.textAlign = "center";
      emptyCard.style.padding = "24px 16px";
      emptyCard.innerHTML = `
        <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
        <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">Loading Chore Profiles...</h3>
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">Syncing with node_helper and data/chores_db.json</p>
        <button type="button" class="ct-empty-retry-btn" style="padding: 8px 18px; border-radius: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; font-size: 12px; font-weight: 600; cursor: pointer;">
          ↻ Tap to Retry Sync
        </button>
      `;
      const retryBtn = emptyCard.querySelector(".ct-empty-retry-btn");
      if (retryBtn) {
        retryBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          self.sendSocketNotification("CONFIG", self.config);
          self.sendSocketNotification("GET_INITIAL_DATA");
        });
      }
      grid.appendChild(emptyCard);
    }

    this.profiles.forEach((profile, index) => {
      const allChildTasks = self.tasks.filter((t) => t.assigned_to === profile.id);
      // Daily Goal tasks: only chores assigned for today or overdue from previous days (upcoming excluded!)
      const dailyTasks = allChildTasks.filter((t) => {
        const s = self.getChoreScheduleStatus(t);
        return s.isToday || s.isOverdue;
      });
      const totalCount = dailyTasks.length;
      const doneCount = dailyTasks.filter((t) =>
        t.category === "routine" ? t.is_completed_today : t.is_completed
      ).length;
      const pendingCount = totalCount - doneCount;

      const overdueCount = dailyTasks.filter((t) => {
        const s = self.getChoreScheduleStatus(t);
        const isDone = t.category === "routine" ? Boolean(t.is_completed_today) : Boolean(t.is_completed);
        return s.isOverdue && !isDone;
      }).length;

      const upcomingCount = allChildTasks.filter((t) => {
        const s = self.getChoreScheduleStatus(t);
        return s.isUpcoming;
      }).length;

      const card = document.createElement("div");
      card.className = "ct-kid-card";

      // Avatar circle with integrated child name
      const gradient = avatarGradients[index % avatarGradients.length];

      const avatar = document.createElement("div");
      avatar.className = "ct-kid-avatar";
      avatar.style.background = gradient;
      avatar.innerText = profile.name;
      card.appendChild(avatar);

      // Status text
      const status = document.createElement("div");
      status.className = "ct-kid-status";
      if (overdueCount > 0) {
        const warnSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        status.innerHTML = `<span style="color:#ef4444; font-weight:700;">${warnSvg}${overdueCount} Overdue</span> • <span style="color:#94a3b8;">${doneCount}/${totalCount} Goal</span>`;
      } else if (totalCount === 0) {
        status.innerText = "No chores today";
      } else if (pendingCount === 0) {
        const checkStarSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#10b981" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        status.innerHTML = `<span style="color:#10b981;">${checkStarSvg}All ${totalCount} Done!</span>`;
      } else {
        status.innerHTML = `<span style="color:#38bdf8;">${doneCount}/${totalCount} Done</span> • <strong style="color:#f59e0b;">${pendingCount} Due</strong>`;
      }

      if (upcomingCount > 0) {
        const upTag = document.createElement("div");
        upTag.style.fontSize = "9px";
        upTag.style.color = "#a5b4fc";
        upTag.style.marginTop = "2px";
        upTag.innerText = `+${upcomingCount} upcoming tomorrow`;
        status.appendChild(upTag);
      }
      card.appendChild(status);

      // Progress bar
      const bar = document.createElement("div");
      bar.className = "ct-kid-progress-bar";
      const fill = document.createElement("div");
      fill.className = "ct-kid-progress-fill";
      const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
      fill.style.width = `${pct}%`;
      if (overdueCount > 0) {
        fill.style.background = "linear-gradient(90deg, #ef4444, #f59e0b)";
      }
      bar.appendChild(fill);
      card.appendChild(bar);

      // Clicking opens this child's chores modal
      card.addEventListener("click", function () {
        self.selectedProfileId = profile.id;
        self.childModalTab = "assigned";
        self.childModalPage = 1;
        self.activeModal = "child_chores";
        self.updateDom(200);
      });

      grid.appendChild(card);
    });

    // Also add an "Up For Grabs" card so open community bounties are readily accessible
    const openGrabs = self.tasks.filter(
      (t) => t.assigned_to === "up_for_grabs" && !t.is_completed
    );
    const grabsTotal = openGrabs.reduce((sum, t) => sum + (parseFloat(t.reward_amount) || 0), 0);

    const grabsCard = document.createElement("div");
    grabsCard.className = "ct-kid-card grabs-card";

    const grabsAvatar = document.createElement("div");
    grabsAvatar.className = "ct-kid-avatar";
    grabsAvatar.style.background = "linear-gradient(135deg, #8b5cf6, #6d28d9)";
    const grabsAvatarBoltSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
    grabsAvatar.innerHTML = `${grabsAvatarBoltSvg}<span>Bounties</span>`;
    grabsCard.appendChild(grabsAvatar);

    const grabsStatus = document.createElement("div");
    grabsStatus.className = "ct-kid-status";
    grabsStatus.innerHTML = `<span style="color:#d8b4fe;">${openGrabs.length} Open</span> • <strong style="color:#10b981;">${self.config.currencySymbol}${grabsTotal.toFixed(2)}</strong>`;
    grabsCard.appendChild(grabsStatus);

    const grabsBar = document.createElement("div");
    grabsBar.className = "ct-kid-progress-bar";
    const grabsFill = document.createElement("div");
    grabsFill.className = "ct-kid-progress-fill";
    grabsFill.style.background = "linear-gradient(90deg, #a855f7, #10b981)";
    grabsFill.style.width = openGrabs.length > 0 ? "100%" : "0%";
    grabsBar.appendChild(grabsFill);
    grabsCard.appendChild(grabsBar);

    // (View chores link removed to save vertical space)

    grabsCard.addEventListener("click", function () {
      self.selectedProfileId = "up_for_grabs";
      self.childModalTab = "up_for_grabs";
      self.activeModal = "child_chores";
      self.updateDom(200);
    });

    grid.appendChild(grabsCard);

    return grid;
  },

  /**
   * Evaluates chore schedule status for a task
   */
  getChoreScheduleStatus: function (task) {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const tomorrowDayOfWeek = (currentDayOfWeek + 1) % 7;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    if (task.category === "monetized") {
      const isDone = Boolean(task.is_completed);
      return {
        isToday: !isDone || task.is_completed,
        isOverdue: false,
        isUpcoming: false,
        isDaily: false,
        statusLabel: isDone ? "Completed Bounty" : "Active Bounty",
        dueDetail: "Open Bounty"
      };
    }

    const recurrence = task.recurrence;
    if (!recurrence) {
      return {
        isToday: true,
        isOverdue: false,
        isUpcoming: false,
        isDaily: true,
        statusLabel: "Daily Routine",
        dueDetail: "Due Today"
      };
    }

    const freq = recurrence.frequency || "weekly";
    const days = recurrence.days_of_week && recurrence.days_of_week.length > 0
      ? recurrence.days_of_week
      : [0, 1, 2, 3, 4, 5, 6];
    const isDaily = freq === "daily" || (freq === "weekly" && days.length === 7);

    if (freq === "weekly" || freq === "daily") {
      // 1. Assigned for today
      if (days.includes(currentDayOfWeek)) {
        return {
          isToday: true,
          isOverdue: false,
          isUpcoming: false,
          isDaily: isDaily,
          statusLabel: isDaily ? "Daily Routine" : "Due Today",
          dueDetail: isDaily ? "Daily" : `Today (${dayNames[currentDayOfWeek]})`
        };
      }

      // 2. Completed today
      if (task.is_completed_today) {
        return {
          isToday: true,
          isOverdue: false,
          isUpcoming: false,
          isDaily: isDaily,
          statusLabel: "Completed Today",
          dueDetail: "Completed"
        };
      }

      // 3. Day before preview: if scheduled for tomorrow, show as upcoming tomorrow (not overdue!)
      if (days.includes(tomorrowDayOfWeek)) {
        return {
          isToday: false,
          isOverdue: false,
          isUpcoming: true,
          isDaily: isDaily,
          statusLabel: "Upcoming Tomorrow",
          dueDetail: `Scheduled for tomorrow (${dayNames[tomorrowDayOfWeek]})`
        };
      }

      // 4. For non-daily weekly tasks: check if past occurrence within last 2 days was left unfinished (Overdue!)
      // Overdue chores should be removed automatically after 2 days if not completed
      if (!isDaily) {
        let daysAgo = 0;
        let scheduledDayIndex = -1;
        // Only check 1 day ago and 2 days ago (max 2 days overdue!)
        for (let i = 1; i <= 2; i++) {
          const checkDay = (currentDayOfWeek - i + 7) % 7;
          if (days.includes(checkDay)) {
            daysAgo = i;
            scheduledDayIndex = checkDay;
            break;
          }
        }

        if (daysAgo > 0) {
          const lastScheduledDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          const lastScheduledDateStr = lastScheduledDate.toISOString().split("T")[0];

          // Check if chore was created after that past date
          let createdAfterSchedule = false;
          if (task.created_at) {
            const taskCreatedDate = String(task.created_at).split("T")[0];
            if (taskCreatedDate > lastScheduledDateStr) {
              createdAfterSchedule = true;
            }
          }

          const isCompletedForLastSchedule = Boolean(
            task.last_completed_date && task.last_completed_date >= lastScheduledDateStr
          );

          if (!isCompletedForLastSchedule && !createdAfterSchedule) {
            const scheduledDayName = dayNames[scheduledDayIndex];
            const daysOverdueText = daysAgo === 1 ? "1 day overdue" : "2 days overdue";
            return {
              isToday: false,
              isOverdue: true,
              isUpcoming: false,
              isDaily: false,
              statusLabel: "Overdue",
              dueDetail: `Overdue (${daysOverdueText} • ${scheduledDayName})`
            };
          }
        }
      }

      // Otherwise, scheduled for another day later in cycle,
      // OR overdue older than 2 days (automatically removed from active list!)
      return {
        isToday: false,
        isOverdue: false,
        isUpcoming: false,
        isDaily: isDaily,
        statusLabel: "Scheduled",
        dueDetail: "Scheduled for later"
      };
    }

    // Non-weekly routines
    if (task.is_completed_today) {
      return {
        isToday: true,
        isOverdue: false,
        isUpcoming: false,
        isDaily: false,
        statusLabel: "Completed This Period",
        dueDetail: "Completed"
      };
    }

    // Overdue chores should be removed automatically after 2 days if not completed
    if (task.last_completed_date) {
      const lastDate = new Date(task.last_completed_date);
      const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 2) {
        return {
          isToday: false,
          isOverdue: false,
          isUpcoming: false,
          isDaily: false,
          statusLabel: "Expired",
          dueDetail: "Removed after 2 days"
        };
      }
      return {
        isToday: false,
        isOverdue: true,
        isUpcoming: false,
        isDaily: false,
        statusLabel: "Overdue",
        dueDetail: `Overdue (${diffDays}d ago)`
      };
    }

    return {
      isToday: true,
      isOverdue: false,
      isUpcoming: false,
      isDaily: false,
      statusLabel: "Due This Period",
      dueDetail: "Due This Period"
    };
  },

  /**
   * Child Chores Modal
   * Displays paginated chores with forward/backward icons, per-page setting,
   * overdue marked red, and upcoming chores excluded from daily goal.
   */
  buildChildChoresModal: function (childId) {
    const self = this;
    const isUpForGrabsView = childId === "up_for_grabs";
    const childProfile = this.profiles.find((p) => p.id === childId);
    const childName = isUpForGrabsView ? "Up For Grabs" : childProfile ? childProfile.name : "Child";

    const backdrop = document.createElement("div");
    backdrop.className = "ct-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "ct-modal-window";

    // Header
    const header = document.createElement("div");
    header.className = "ct-modal-header";

    const headerLeft = document.createElement("div");
    headerLeft.style.display = "flex";
    headerLeft.style.alignItems = "center";
    headerLeft.style.gap = "14px";

    const titleGroup = document.createElement("div");
    titleGroup.className = "ct-modal-title";

    const userSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    const boltSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
    const childIconSvg = isUpForGrabsView ? boltSvg : userSvg;

    titleGroup.innerHTML = `
      <div class="ct-avatar-badge" style="background:${isUpForGrabsView ? "linear-gradient(135deg, #7c3aed, #9333ea)" : "linear-gradient(135deg, #0284c7, #2563eb)"}; width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(0,0,0,0.4); flex-shrink:0;">
        ${childIconSvg}
      </div>
      <div>
        <div style="font-size:20px; line-height:1.2; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px;">
          <span>${childName}'s Chores</span>
        </div>
        <div style="font-size:12px; font-weight:500; color:#94a3b8;">${isUpForGrabsView ? "Open bounties for anyone in the family" : "Tap checkmark to complete • Tap chore for notes"}</div>
      </div>
    `;
    headerLeft.appendChild(titleGroup);
    header.appendChild(headerLeft);

    // Close button (returns to the main kids dashboard)
    const closeBtn = document.createElement("button");
    closeBtn.className = "ct-btn-close-modal";
    closeBtn.innerText = "✕ Close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", function () {
      self.closeModal();
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body (Paginated without forced scrolling)
    const body = document.createElement("div");
    body.className = "ct-modal-body";

    // Filter tasks based on view:
    // Show chores only assigned for that day + unfinished non-daily tasks (overdue) + upcoming chores the day before
    let targetTasks = [];
    if (isUpForGrabsView || this.childModalTab === "up_for_grabs") {
      targetTasks = this.tasks.filter((t) => t.assigned_to === "up_for_grabs");
    } else {
      const rawTasks = this.tasks.filter((t) => t.assigned_to === childId);
      targetTasks = rawTasks.filter((t) => {
        const s = self.getChoreScheduleStatus(t);
        return s.isToday || s.isOverdue || s.isUpcoming;
      });
    }

    // Daily Goal tasks: exclude upcoming chores!
    const dailyGoalTasks = isUpForGrabsView || this.childModalTab === "up_for_grabs"
      ? []
      : targetTasks.filter((t) => !self.getChoreScheduleStatus(t).isUpcoming);
    const dailyGoalTotal = dailyGoalTasks.length;
    const dailyGoalDone = dailyGoalTasks.filter((t) =>
      t.category === "routine" ? t.is_completed_today : t.is_completed
    ).length;

    const overdueCount = targetTasks.filter((t) => {
      const s = self.getChoreScheduleStatus(t);
      const isDone = t.category === "routine" ? Boolean(t.is_completed_today) : Boolean(t.is_completed);
      return s.isOverdue && !isDone;
    }).length;

    const upcomingCount = targetTasks.filter((t) => self.getChoreScheduleStatus(t).isUpcoming).length;

    // Toolbar (Tabs, Goal / Overdue stats, and Per-Page setting)
    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.alignItems = "center";
    toolbar.style.justifyContent = "space-between";
    toolbar.style.gap = "8px";
    toolbar.style.marginBottom = "4px";

    // Sub-tabs if viewing a specific kid
    if (!isUpForGrabsView) {
      const tabsBar = document.createElement("div");
      tabsBar.style.display = "flex";
      tabsBar.style.gap = "6px";

      const myBtn = document.createElement("button");
      myBtn.className = `ct-tab-btn ${this.childModalTab === "assigned" ? "active" : ""}`;
      myBtn.style.padding = "6px 12px";
      myBtn.style.minHeight = "36px";
      myBtn.style.fontSize = "12px";
      myBtn.innerText = `${childName}'s Tasks (${targetTasks.length})`;
      myBtn.addEventListener("click", function () {
        self.childModalTab = "assigned";
        self.childModalPage = 1;
        self.updateDom(100);
      });
      tabsBar.appendChild(myBtn);

      const openBountiesCount = this.tasks.filter((t) => t.assigned_to === "up_for_grabs" && !t.is_completed).length;
      const grabsBtn = document.createElement("button");
      grabsBtn.className = `ct-tab-btn ${this.childModalTab === "up_for_grabs" ? "active" : ""}`;
      grabsBtn.style.padding = "6px 12px";
      grabsBtn.style.minHeight = "36px";
      grabsBtn.style.fontSize = "12px";
      const tabBoltSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
      grabsBtn.innerHTML = `${tabBoltSvg}<span>Up For Grabs (${openBountiesCount})</span>`;
      grabsBtn.addEventListener("click", function () {
        self.childModalTab = "up_for_grabs";
        self.childModalPage = 1;
        self.updateDom(100);
      });
      tabsBar.appendChild(grabsBtn);

      toolbar.appendChild(tabsBar);
    }

    // Stats and Per-Page settings container
    const rightControls = document.createElement("div");
    rightControls.style.display = "flex";
    rightControls.style.flexWrap = "wrap";
    rightControls.style.alignItems = "center";
    rightControls.style.gap = "8px";

    if (!isUpForGrabsView && this.childModalTab === "assigned") {
      const goalBadge = document.createElement("span");
      goalBadge.className = "ct-badge ct-badge-routine";
      goalBadge.style.padding = "4px 8px";
      goalBadge.innerHTML = `Daily Goal: ${dailyGoalDone}/${dailyGoalTotal} Done`;
      rightControls.appendChild(goalBadge);

      if (overdueCount > 0) {
        const overdueBadge = document.createElement("span");
        overdueBadge.className = "ct-badge ct-badge-danger";
        overdueBadge.style.padding = "4px 8px";
        const alertIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        overdueBadge.innerHTML = `${alertIconSvg}${overdueCount} Overdue`;
        rightControls.appendChild(overdueBadge);
      }

      if (upcomingCount > 0) {
        const upcomingBadge = document.createElement("span");
        upcomingBadge.className = "ct-badge ct-badge-upcoming";
        upcomingBadge.style.padding = "4px 8px";
        upcomingBadge.style.background = "rgba(99, 102, 241, 0.2)";
        upcomingBadge.style.color = "#a5b4fc";
        upcomingBadge.style.border = "1px solid rgba(99, 102, 241, 0.4)";
        const calSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
        upcomingBadge.innerHTML = `${calSvg}${upcomingCount} Tomorrow (Not in goal)`;
        rightControls.appendChild(upcomingBadge);
      }
    }

    // Setting: Chores Per Page Selector
    const perPageBox = document.createElement("div");
    perPageBox.className = "ct-per-page-selector";
    perPageBox.style.display = "flex";
    perPageBox.style.alignItems = "center";
    perPageBox.style.gap = "4px";
    perPageBox.style.background = "rgba(0, 0, 0, 0.4)";
    perPageBox.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    perPageBox.style.borderRadius = "8px";
    perPageBox.style.padding = "3px 6px";
    perPageBox.style.fontSize = "11px";
    perPageBox.innerHTML = `<span style="color:#94a3b8; font-weight:600; margin-right:2px;">Per page:</span>`;

    const pageSize = this.choresPerPage || this.config.choresPerPage || 4;
    [2, 4, 6, 8].forEach((size) => {
      const btn = document.createElement("button");
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.borderRadius = "6px";
      btn.style.border = "none";
      btn.style.fontSize = "11px";
      btn.style.fontWeight = "bold";
      btn.style.cursor = "pointer";
      btn.style.transition = "all 0.15s ease";
      if (pageSize === size) {
        btn.style.background = "#0ea5e9";
        btn.style.color = "#ffffff";
      } else {
        btn.style.background = "rgba(255, 255, 255, 0.08)";
        btn.style.color = "#cbd5e1";
      }
      btn.innerText = size;
      btn.addEventListener("click", function () {
        self.choresPerPage = size;
        self.childModalPage = 1;
        self.updateDom(100);
      });
      perPageBox.appendChild(btn);
    });
    rightControls.appendChild(perPageBox);
    toolbar.appendChild(rightControls);
    body.appendChild(toolbar);

    // Pagination calculations
    const totalTasksCount = targetTasks.length;
    const totalPages = Math.max(1, Math.ceil(totalTasksCount / pageSize));
    this.childModalPage = Math.min(Math.max(1, this.childModalPage || 1), totalPages);
    const startIndex = (this.childModalPage - 1) * pageSize;
    const pagedTasks = targetTasks.slice(startIndex, startIndex + pageSize);

    // Tasks list grid
    const tasksList = document.createElement("div");
    tasksList.className = "ct-tasks-grid";

    if (totalTasksCount === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty-state";
      const emptySparkleSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="#10b981" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      empty.innerHTML = `
        <div style="width:52px; height:52px; border-radius:50%; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); display:flex; align-items:center; justify-content:center; margin:0 auto 10px auto;">${emptySparkleSvg}</div>
        <p>No chores pending here! Great job!</p>
      `;
      tasksList.appendChild(empty);
    } else {
      pagedTasks.forEach((task) => {
        const isRoutine = task.category === "routine";
        const isDone = isRoutine ? Boolean(task.is_completed_today) : Boolean(task.is_completed);
        const scheduleStatus = self.getChoreScheduleStatus(task);
        const isOverdue = scheduleStatus.isOverdue && !isDone;
        const isUpcoming = scheduleStatus.isUpcoming;

        const card = document.createElement("div");
        card.className = `ct-task-card ${isDone ? "completed" : ""} ${isOverdue ? "ct-task-overdue" : ""} ${isUpcoming ? "ct-task-upcoming" : ""}`;
        if (isOverdue) {
          card.style.borderColor = "#ef4444";
          card.style.background = "rgba(239, 68, 68, 0.12)";
        } else if (isUpcoming) {
          card.style.borderColor = "rgba(99, 102, 241, 0.5)";
          card.style.background = "rgba(99, 102, 241, 0.08)";
        }

        // Top row
        const cardTop = document.createElement("div");
        cardTop.className = "ct-card-top";

        const titleGroup = document.createElement("div");
        titleGroup.className = "ct-card-title-group";

        // Title Row
        const titleRow = document.createElement("div");
        titleRow.className = "ct-card-title-row";

        const title = document.createElement("h3");
        title.className = "ct-card-title";
        title.innerText = task.title;
        titleRow.appendChild(title);

        // Overdue Badge in Red
        if (isOverdue) {
          const overdueBadge = document.createElement("span");
          overdueBadge.className = "ct-badge ct-badge-danger";
          const alertIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
          overdueBadge.innerHTML = `${alertIconSvg}Overdue`;
          titleRow.appendChild(overdueBadge);
        }

        // Upcoming Badge
        if (isUpcoming) {
          const upBadge = document.createElement("span");
          upBadge.className = "ct-badge ct-badge-upcoming";
          upBadge.style.background = "rgba(99, 102, 241, 0.25)";
          upBadge.style.color = "#c7d2fe";
          upBadge.style.border = "1px solid rgba(99, 102, 241, 0.5)";
          const calSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
          upBadge.innerHTML = `${calSvg}Upcoming Tomorrow`;
          titleRow.appendChild(upBadge);
        }

        // Category & Bounty Badge
        const catBadge = document.createElement("span");
        if (isRoutine) {
          catBadge.className = "ct-badge ct-badge-routine";
          catBadge.innerText = "Routine";
        } else {
          catBadge.className = "ct-badge ct-badge-monetized";
          catBadge.innerText = `${self.config.currencySymbol}${(parseFloat(task.reward_amount) || 0).toFixed(2)} Bounty`;
        }
        titleRow.appendChild(catBadge);

        // Monetized approval status badge
        if (!isRoutine && task.is_completed) {
          const statusBadge = document.createElement("span");
          if (task.is_approved) {
            statusBadge.className = "ct-badge ct-badge-approved";
            const checkMiniSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            statusBadge.innerHTML = `${checkMiniSvg}<span>Approved</span>`;
          } else {
            statusBadge.className = "ct-badge ct-badge-approval";
            const clockMiniSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            statusBadge.innerHTML = `${clockMiniSvg}<span>Needs Approval</span>`;
          }
          titleRow.appendChild(statusBadge);
        }

        titleGroup.appendChild(titleRow);

        // Detail text
        if (isOverdue) {
          const detail = document.createElement("div");
          detail.style.fontSize = "11px";
          detail.style.color = "#f87171";
          detail.style.fontWeight = "600";
          detail.style.marginTop = "2px";
          detail.innerText = `${scheduleStatus.dueDetail} • Needs completion`;
          titleGroup.appendChild(detail);
        } else if (isUpcoming) {
          const detail = document.createElement("div");
          detail.style.fontSize = "11px";
          detail.style.color = "#a5b4fc";
          detail.style.fontWeight = "500";
          detail.style.marginTop = "2px";
          detail.innerText = `${scheduleStatus.dueDetail} • Not in daily goal`;
          titleGroup.appendChild(detail);
        }

        cardTop.appendChild(titleGroup);

        // Complete check button
        const checkBtn = document.createElement("button");
        checkBtn.className = "ct-btn-card-check";
        checkBtn.setAttribute("aria-label", "Toggle Complete");
        const checkBtnSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        checkBtn.innerHTML = isDone ? checkBtnSvg : "";
        if (isOverdue && !isDone) {
          checkBtn.style.borderColor = "rgba(239, 68, 68, 0.6)";
          checkBtn.style.background = "rgba(239, 68, 68, 0.15)";
        }
        checkBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if ((task.assigned_to === "up_for_grabs" || childId === "up_for_grabs" || !task.assigned_to) && !isDone) {
            self.completingTaskId = task.id;
            self.activeModal = "who_completed";
            self.updateDom(150);
          } else {
            self.sendSocketNotification("TOGGLE_TASK_COMPLETION", {
              taskId: task.id,
              profileId: childId
            });
          }
        });
        cardTop.appendChild(checkBtn);
        card.appendChild(cardTop);

        // Card bottom (notes & details action)
        const cardBottom = document.createElement("div");
        cardBottom.className = "ct-card-bottom";

        const notesCount = (task.notes || []).length;
        const notesIndicator = document.createElement("div");
        notesIndicator.className = "ct-card-notes-count";
        const noteSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        notesIndicator.innerHTML = `${noteSvg}<span>${notesCount} ${notesCount === 1 ? "Note" : "Notes"}</span>`;
        cardBottom.appendChild(notesIndicator);

        if (task.assigned_to === "up_for_grabs" && !isUpForGrabsView && childId) {
          const claimBtn = document.createElement("button");
          claimBtn.className = "ct-badge ct-badge-grabs";
          claimBtn.style.cursor = "pointer";
          claimBtn.style.padding = "4px 10px";
          const grabBoltSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="vertical-align:middle; margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
          claimBtn.innerHTML = `${grabBoltSvg} Claim for ${childName}`;
          claimBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            self.sendSocketNotification("CLAIM_TASK", {
              taskId: task.id,
              profileId: childId
            });
          });
          cardBottom.appendChild(claimBtn);
        } else {
          const tapHint = document.createElement("span");
          tapHint.style.fontSize = "12px";
          tapHint.innerText = "Tap for details & notes →";
          cardBottom.appendChild(tapHint);
        }

        card.appendChild(cardBottom);

        // Touch-scroll protection
        let touchStartY = 0;
        let isTouchDragging = false;

        card.addEventListener("touchstart", function (e) {
          if (e.touches && e.touches.length > 0) {
            touchStartY = e.touches[0].clientY;
            isTouchDragging = false;
          }
        }, { passive: true });

        card.addEventListener("touchmove", function (e) {
          if (e.touches && e.touches.length > 0) {
            if (Math.abs(e.touches[0].clientY - touchStartY) > 8) {
              isTouchDragging = true;
            }
          }
        }, { passive: true });

        card.addEventListener("click", function () {
          if (isTouchDragging) {
            isTouchDragging = false;
            return;
          }
          self.activeTaskId = task.id;
          self.activeModal = "task_detail";
          self.updateDom(200);
        });

        tasksList.appendChild(card);
      });
    }

    body.appendChild(tasksList);

    // Bottom Pagination Bar with Icons to go Forward and Backward
    const paginationBar = document.createElement("div");
    paginationBar.className = "ct-pagination-bar";
    paginationBar.style.display = "flex";
    paginationBar.style.alignItems = "center";
    paginationBar.style.justifyContent = "space-between";
    paginationBar.style.flexWrap = "wrap";
    paginationBar.style.gap = "8px";
    paginationBar.style.paddingTop = "10px";
    paginationBar.style.borderTop = "1px solid rgba(255, 255, 255, 0.12)";
    paginationBar.style.marginTop = "auto";

    const navLeft = document.createElement("div");
    navLeft.style.display = "flex";
    navLeft.style.alignItems = "center";
    navLeft.style.gap = "8px";

    // Backward Button with Icon
    const prevBtn = document.createElement("button");
    prevBtn.className = "ct-page-btn";
    prevBtn.style.padding = "6px 12px";
    prevBtn.style.borderRadius = "8px";
    prevBtn.style.background = "rgba(255, 255, 255, 0.1)";
    prevBtn.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    prevBtn.style.color = "#fff";
    prevBtn.style.cursor = "pointer";
    prevBtn.style.display = "flex";
    prevBtn.style.alignItems = "center";
    prevBtn.style.gap = "4px";
    prevBtn.style.fontSize = "12px";
    prevBtn.style.fontWeight = "bold";
    if (this.childModalPage <= 1) {
      prevBtn.style.opacity = "0.3";
      prevBtn.style.pointerEvents = "none";
    }
    const prevSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    prevBtn.innerHTML = `${prevSvg}<span>Previous</span>`;
    prevBtn.addEventListener("click", function () {
      if (self.childModalPage > 1) {
        self.childModalPage--;
        self.updateDom(100);
      }
    });
    navLeft.appendChild(prevBtn);

    // Page indicator
    const pageLabel = document.createElement("span");
    pageLabel.style.fontSize = "12px";
    pageLabel.style.fontWeight = "bold";
    pageLabel.style.color = "#ffffff";
    pageLabel.innerHTML = `Page ${this.childModalPage} of ${totalPages} <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(${totalTasksCount} chores)</span>`;
    navLeft.appendChild(pageLabel);

    // Forward Button with Icon
    const nextBtn = document.createElement("button");
    nextBtn.className = "ct-page-btn";
    nextBtn.style.padding = "6px 12px";
    nextBtn.style.borderRadius = "8px";
    nextBtn.style.background = "rgba(255, 255, 255, 0.1)";
    nextBtn.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    nextBtn.style.color = "#fff";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.display = "flex";
    nextBtn.style.alignItems = "center";
    nextBtn.style.gap = "4px";
    nextBtn.style.fontSize = "12px";
    nextBtn.style.fontWeight = "bold";
    if (this.childModalPage >= totalPages) {
      nextBtn.style.opacity = "0.3";
      nextBtn.style.pointerEvents = "none";
    }
    const nextSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    nextBtn.innerHTML = `<span>Next</span>${nextSvg}`;
    nextBtn.addEventListener("click", function () {
      if (self.childModalPage < totalPages) {
        self.childModalPage++;
        self.updateDom(100);
      }
    });
    navLeft.appendChild(nextBtn);
    paginationBar.appendChild(navLeft);

    // Page numeric buttons
    if (totalPages > 1) {
      const pageNumGroup = document.createElement("div");
      pageNumGroup.style.display = "flex";
      pageNumGroup.style.alignItems = "center";
      pageNumGroup.style.gap = "4px";

      for (let p = 1; p <= totalPages; p++) {
        const pBtn = document.createElement("button");
        pBtn.style.width = "28px";
        pBtn.style.height = "28px";
        pBtn.style.borderRadius = "6px";
        pBtn.style.border = "none";
        pBtn.style.fontSize = "12px";
        pBtn.style.fontWeight = "bold";
        pBtn.style.cursor = "pointer";
        if (p === this.childModalPage) {
          pBtn.style.background = "#0ea5e9";
          pBtn.style.color = "#fff";
        } else {
          pBtn.style.background = "rgba(255, 255, 255, 0.08)";
          pBtn.style.color = "#cbd5e1";
        }
        pBtn.innerText = p;
        const pageIdx = p;
        pBtn.addEventListener("click", function () {
          self.childModalPage = pageIdx;
          self.updateDom(100);
        });
        pageNumGroup.appendChild(pBtn);
      }
      paginationBar.appendChild(pageNumGroup);
    }

    body.appendChild(paginationBar);
    modal.appendChild(body);
    backdrop.appendChild(modal);

    // Clicking outside modal closes it and returns to main screen
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        self.activeModal = null;
        self.selectedProfileId = null;
        self.updateDom(150);
      }
    });

    return backdrop;
  },

  /**
   * Builds Task Details & Threaded Notes Dialog
   */
  buildTaskModal: function (taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return document.createElement("div");

    const self = this;
    const backdrop = document.createElement("div");
    backdrop.className = "ct-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "ct-modal-window";

    // Header
    const header = document.createElement("div");
    header.className = "ct-modal-header";

    const headerLeft = document.createElement("div");
    headerLeft.style.display = "flex";
    headerLeft.style.alignItems = "center";
    headerLeft.style.gap = "14px";

    const backBtn = document.createElement("button");
    backBtn.className = "ct-btn-close-modal";
    backBtn.innerHTML = `← Back to Chores`;
    backBtn.setAttribute("aria-label", "Back to Chores");
    backBtn.addEventListener("click", function () {
      if (self.selectedProfileId) {
        self.activeModal = "child_chores";
        self.activeTaskId = null;
        self.updateDom(150);
      } else {
        self.closeModal();
      }
    });
    headerLeft.appendChild(backBtn);

    const title = document.createElement("h3");
    title.className = "ct-modal-title";
    title.innerText = task.title;
    headerLeft.appendChild(title);
    header.appendChild(headerLeft);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ct-btn-close-modal";
    closeBtn.innerText = "✕ Close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", function () {
      self.closeModal();
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "ct-modal-body";

    // Details strip
    const detailsBox = document.createElement("div");
    detailsBox.style.background = "rgba(255, 255, 255, 0.04)";
    detailsBox.style.padding = "14px";
    detailsBox.style.borderRadius = "var(--ct-radius-md)";
    detailsBox.style.display = "flex";
    detailsBox.style.flexDirection = "column";
    detailsBox.style.gap = "8px";

    const isRoutine = task.category === "routine";
    const assignedProfile = this.profiles.find((p) => p.id === task.assigned_to);

    detailsBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#94a3b8; font-size:14px;">Chore Type:</span>
        <strong style="color:${isRoutine ? "#38bdf8" : "#10b981"};">${isRoutine ? "Routine Expectation" : "Monetized Bounty"}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#94a3b8; font-size:14px;">Reward:</span>
        <strong style="font-size:17px; color:#10b981;">${isRoutine ? "$0.00 (Family Duty)" : self.config.currencySymbol + (parseFloat(task.reward_amount) || 0).toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#94a3b8; font-size:14px;">Assigned To:</span>
        <strong style="color:#fff; display:inline-flex; align-items:center; gap:4px;">${task.assigned_to === "up_for_grabs" ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>Up For Grabs</span>` : assignedProfile ? assignedProfile.name : "Assigned"}</strong>
      </div>
    `;

    // Recurrence details if routine
    if (isRoutine && task.recurrence) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const recurringDays = (task.recurrence.days_of_week || [])
        .map((d) => dayNames[d])
        .join(", ");
      const recLine = document.createElement("div");
      recLine.style.display = "flex";
      recLine.style.justifyContent = "space-between";
      recLine.innerHTML = `<span style="color:#94a3b8; font-size:14px;">Active Days:</span><strong style="color:#38bdf8;">${recurringDays || "Everyday"}</strong>`;
      detailsBox.appendChild(recLine);
    }

    body.appendChild(detailsBox);

    // Action buttons row (Claim Chore, Complete Chore)
    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.gap = "12px";
    actionsRow.style.flexWrap = "wrap";

    // Claim button if 'up_for_grabs' and child is selected
    if (task.assigned_to === "up_for_grabs" && this.selectedProfileId && this.selectedProfileId !== "up_for_grabs") {
      const currentChild = this.profiles.find((p) => p.id === this.selectedProfileId);
      const claimBtn = document.createElement("button");
      claimBtn.className = "ct-btn-primary";
      claimBtn.style.flex = "1";
      const claimBoltSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
      claimBtn.innerHTML = `${claimBoltSvg}<span>Claim Chore for ${currentChild ? currentChild.name : "Me"}</span>`;
      claimBtn.addEventListener("click", function () {
        self.sendSocketNotification("CLAIM_TASK", {
          taskId: task.id,
          profileId: self.selectedProfileId
        });
      });
      actionsRow.appendChild(claimBtn);
    }

    // Completion toggle button
    const isDone = isRoutine ? Boolean(task.is_completed_today) : Boolean(task.is_completed);
    const completeBtn = document.createElement("button");
    completeBtn.className = isDone ? "ct-btn-secondary" : "ct-btn-success";
    completeBtn.style.flex = "1";
    const undoSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
    const checkCompleteSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    completeBtn.innerHTML = isDone ? `${undoSvg}<span>Mark as Incomplete</span>` : `${checkCompleteSvg}<span>Mark as Completed</span>`;
    completeBtn.addEventListener("click", function () {
      if ((task.assigned_to === "up_for_grabs" || self.selectedProfileId === "up_for_grabs" || !task.assigned_to) && !isDone) {
        self.completingTaskId = task.id;
        self.activeModal = "who_completed";
        self.updateDom(150);
      } else {
        self.sendSocketNotification("TOGGLE_TASK_COMPLETION", {
          taskId: task.id,
          profileId: self.selectedProfileId || "child_01"
        });
        // Return to child modal if active
        if (self.selectedProfileId) {
          self.activeModal = "child_chores";
        } else {
          self.activeModal = null;
        }
        self.updateDom(200);
      }
    });
    actionsRow.appendChild(completeBtn);
    body.appendChild(actionsRow);

    // Threaded Notes Section
    const notesTitle = document.createElement("h4");
    notesTitle.style.margin = "10px 0 0 0";
    notesTitle.style.fontSize = "16px";
    notesTitle.style.color = "#cbd5e1";
    notesTitle.innerText = "Threaded Chore Notes & Updates";
    body.appendChild(notesTitle);

    const notesThread = document.createElement("div");
    notesThread.className = "ct-notes-thread";

    const taskNotes = Array.isArray(task.notes) ? task.notes : [];
    if (taskNotes.length === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.style.color = "#64748b";
      emptyNote.style.textAlign = "center";
      emptyNote.style.padding = "10px";
      emptyNote.innerText = "No notes posted yet. Add instructions or completion updates below!";
      notesThread.appendChild(emptyNote);
    } else {
      taskNotes.forEach((n) => {
        const bubble = document.createElement("div");
        const isParent = n.author && n.author.toLowerCase().includes("parent");
        bubble.className = `ct-note-bubble ${isParent ? "parent-note" : ""}`;

        const timeStr = n.timestamp
          ? new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";

        const parentIconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
        const childIconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        const authorSvg = isParent ? parentIconSvg : childIconSvg;

        bubble.innerHTML = `
          <div class="ct-note-meta">
            <span class="ct-note-author" style="display:inline-flex; align-items:center;">${authorSvg}${n.author || "Family"}</span>
            <span>${timeStr}</span>
          </div>
          <p class="ct-note-text">${n.text || ""}</p>
        `;
        notesThread.appendChild(bubble);
      });
    }
    body.appendChild(notesThread);

    // Add note form
    const addNoteForm = document.createElement("div");
    addNoteForm.style.display = "flex";
    addNoteForm.style.flexDirection = "column";
    addNoteForm.style.gap = "10px";

    // Quick preset comment chips for touchscreen ease
    const quickChips = document.createElement("div");
    quickChips.className = "ct-quick-chips";

    const activeChildObj = this.profiles.find((p) => p.id === this.selectedProfileId);
    const authorName = activeChildObj ? activeChildObj.name : "Parent";

    const sampleChips = [
      "All finished! ✨",
      "Trash emptied and bag replaced! 🗑️",
      "Vacuum canister emptied! 🧹",
      "Please inspect when you have a moment! 👀",
      "Need more supplies! ⚠️"
    ];

    sampleChips.forEach((phrase) => {
      const chip = document.createElement("button");
      chip.className = "ct-chip-btn";
      chip.innerText = phrase;
      chip.addEventListener("click", function () {
        self.sendSocketNotification("ADD_NOTE", {
          taskId: task.id,
          author: authorName,
          text: phrase
        });
      });
      quickChips.appendChild(chip);
    });
    addNoteForm.appendChild(quickChips);

    // Manual custom input row
    const inputRow = document.createElement("div");
    inputRow.style.display = "flex";
    inputRow.style.gap = "8px";

    const noteInput = document.createElement("input");
    noteInput.className = "ct-input";
    noteInput.style.flex = "1";
    noteInput.placeholder = `Add note as ${authorName}...`;
    self.attachVirtualKeyboard(noteInput, `Add Note as ${authorName}`, "text");

    const postBtn = document.createElement("button");
    postBtn.className = "ct-btn-primary";
    postBtn.style.padding = "10px 20px";
    postBtn.innerText = "Post";

    postBtn.addEventListener("click", function () {
      const val = noteInput.value.trim();
      if (!val) return;
      self.sendSocketNotification("ADD_NOTE", {
        taskId: task.id,
        author: authorName,
        text: val
      });
      noteInput.value = "";
    });

    inputRow.appendChild(noteInput);
    inputRow.appendChild(postBtn);
    addNoteForm.appendChild(inputRow);
    body.appendChild(addNoteForm);

    modal.appendChild(body);
    backdrop.appendChild(modal);

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        if (self.selectedProfileId) {
          self.activeModal = "child_chores";
        } else {
          self.activeModal = null;
        }
        self.updateDom(150);
      }
    });

    return backdrop;
  },

  /**
   * Attribution Modal: "Who completed this chore?"
   * Displayed when completing an unassigned / up-for-grabs task so the reward
   * and completion are accurately attributed to the child who did it.
   */
  buildWhoCompletedModal: function (taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return document.createElement("div");

    const self = this;
    const backdrop = document.createElement("div");
    backdrop.className = "ct-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "ct-modal-window ct-modal-medium";
    modal.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    const header = document.createElement("div");
    header.className = "ct-modal-header";

    const headerLeft = document.createElement("div");
    headerLeft.style.display = "flex";
    headerLeft.style.alignItems = "center";
    headerLeft.style.gap = "14px";

    const backBtn = document.createElement("button");
    backBtn.className = "ct-btn-close-modal";
    backBtn.innerHTML = `← Back`;
    backBtn.setAttribute("aria-label", "Back");
    backBtn.addEventListener("click", function () {
      self.completingTaskId = null;
      self.activeModal = self.selectedProfileId ? "child_chores" : null;
      self.updateDom(150);
    });
    headerLeft.appendChild(backBtn);

    const title = document.createElement("h3");
    title.className = "ct-modal-title";
    const starSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:6px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    title.innerHTML = `${starSvg}<span>Who completed this chore?</span>`;
    headerLeft.appendChild(title);
    header.appendChild(headerLeft);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ct-btn-close-modal";
    closeBtn.innerText = "✕ Close";
    closeBtn.addEventListener("click", function () {
      self.completingTaskId = null;
      self.activeModal = self.selectedProfileId ? "child_chores" : null;
      self.updateDom(150);
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "ct-modal-body";

    const infoBox = document.createElement("div");
    infoBox.style.background = "rgba(255, 255, 255, 0.05)";
    infoBox.style.padding = "12px 14px";
    infoBox.style.borderRadius = "var(--ct-radius-md)";
    infoBox.style.border = "1px solid var(--ct-border)";
    infoBox.innerHTML = `
      <div style="font-size:16px; font-weight:700; color:#fff;">${task.title}</div>
      <div style="font-size:13px; color:#10b981; font-weight:700; margin-top:2px;">
        ${task.category === "routine" ? "Routine Expectation" : self.config.currencySymbol + (parseFloat(task.reward_amount) || 0).toFixed(2) + " Bounty"}
      </div>
    `;
    body.appendChild(infoBox);

    const promptText = document.createElement("p");
    promptText.style.margin = "0";
    promptText.style.fontSize = "14px";
    promptText.style.color = "#cbd5e1";
    promptText.innerText = "Select which child completed this chore:";
    body.appendChild(promptText);

    const kidsGrid = document.createElement("div");
    kidsGrid.className = "ct-who-grid";

    const avatarGradients = [
      "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      "linear-gradient(135deg, #a855f7, #7e22ce)",
      "linear-gradient(135deg, #f59e0b, #d97706)",
      "linear-gradient(135deg, #ec4899, #be185d)"
    ];

    this.profiles.forEach((profile, idx) => {
      const btn = document.createElement("button");
      btn.className = "ct-who-btn";

      const avatar = document.createElement("div");
      avatar.className = "ct-who-avatar";
      avatar.style.background = avatarGradients[idx % avatarGradients.length];
      avatar.innerText = (profile.name || "C").charAt(0).toUpperCase();
      btn.appendChild(avatar);

      const name = document.createElement("span");
      name.className = "ct-who-name";
      name.innerText = profile.name;
      btn.appendChild(name);

      btn.addEventListener("click", function () {
        self.sendSocketNotification("TOGGLE_TASK_COMPLETION", {
          taskId: task.id,
          profileId: profile.id
        });
        self.completingTaskId = null;
        self.activeModal = self.selectedProfileId ? "child_chores" : null;
        self.updateDom(200);
      });

      kidsGrid.appendChild(btn);
    });

    body.appendChild(kidsGrid);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ct-btn-secondary";
    cancelBtn.innerText = "Cancel";
    cancelBtn.addEventListener("click", function () {
      self.completingTaskId = null;
      self.activeModal = self.selectedProfileId ? "child_chores" : null;
      self.updateDom(150);
    });
    body.appendChild(cancelBtn);

    modal.appendChild(body);
    backdrop.appendChild(modal);

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        self.completingTaskId = null;
        self.activeModal = self.selectedProfileId ? "child_chores" : null;
        self.updateDom(150);
      }
    });

    return backdrop;
  },

  /**
   * Builds the 4-digit PIN touch pad modal
   */
  buildPinModal: function () {
    const self = this;
    const backdrop = document.createElement("div");
    backdrop.className = "ct-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "ct-modal-window ct-modal-compact";
    modal.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // Header
    const header = document.createElement("div");
    header.className = "ct-modal-header";

    const title = document.createElement("h3");
    title.className = "ct-modal-title";
    const lockPinSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    title.innerHTML = `${lockPinSvg}<span>Parent Access</span>`;
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ct-btn-close-modal";
    closeBtn.innerText = "✕ Cancel";
    closeBtn.addEventListener("click", function () {
      self.closeModal();
    });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "ct-modal-body";
    body.style.alignItems = "center";

    const desc = document.createElement("p");
    desc.style.color = "#94a3b8";
    desc.style.margin = "0";
    desc.style.textAlign = "center";
    desc.style.fontSize = "15px";
    desc.innerText = "Enter your 4-digit security PIN to unlock approvals & payouts.";
    body.appendChild(desc);

    // 4 Dot indicators
    const pinDisplay = document.createElement("div");
    pinDisplay.className = "ct-pin-display";

    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("div");
      dot.className = `ct-pin-dot ${i < this.pinInput.length ? "filled" : ""}`;
      pinDisplay.appendChild(dot);
    }
    body.appendChild(pinDisplay);

    // Error message
    const errText = document.createElement("div");
    errText.className = "ct-pin-error";
    errText.innerText = this.pinError;
    body.appendChild(errText);

    function updatePinDisplayInPlace() {
      const dots = pinDisplay.querySelectorAll(".ct-pin-dot");
      dots.forEach((dot, idx) => {
        if (idx < self.pinInput.length) {
          dot.classList.add("filled");
        } else {
          dot.classList.remove("filled");
        }
      });
      errText.innerText = self.pinError || "";
    }

    // Numpad 0-9
    const keypad = document.createElement("div");
    keypad.className = "ct-numpad-grid";

    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "DEL"];

    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = `ct-num-key ${key === "Clear" || key === "DEL" ? "action-key" : ""}`;
      if (key === "DEL") {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>`;
      } else {
        btn.innerText = key;
      }

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        self.pinError = "";
        if (key === "Clear") {
          self.pinInput = "";
        } else if (key === "DEL") {
          self.pinInput = self.pinInput.slice(0, -1);
        } else if (self.pinInput.length < 4) {
          self.pinInput += key;
          // When 4 digits reached, immediately verify with backend
          if (self.pinInput.length === 4) {
            self.sendSocketNotification("VERIFY_PARENT_PIN", { pin: self.pinInput });
          }
        }
        // Direct in-place UI update: eliminates full screen flashing and lag!
        updatePinDisplayInPlace();
      });

      keypad.appendChild(btn);
    });

    body.appendChild(keypad);
    modal.appendChild(body);
    backdrop.appendChild(modal);

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        self.closeModal();
      }
    });

    return backdrop;
  },

  /**
   * Builds the Parent Administration Dashboard:
   * 1. Approvals Tab
   * 2. Chore Creation Form Tab
   * 3. Payout & Audit Engine Tab
   * 4. Payout History Tab
   */
  buildParentPanel: function () {
    const self = this;
    const backdrop = document.createElement("div");
    backdrop.className = "ct-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "ct-modal-window";

    // Header
    const header = document.createElement("div");
    header.className = "ct-modal-header";

    const title = document.createElement("h3");
    title.className = "ct-modal-title";
    const parentShieldSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:8px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
    title.innerHTML = `${parentShieldSvg}<span>Parent Administration Console</span>`;
    header.appendChild(title);

    // Lock button
    const lockBtn = document.createElement("button");
    lockBtn.className = "ct-btn-close-modal";
    const lockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    lockBtn.innerHTML = `${lockSvg}<span>Lock &amp; Exit</span>`;
    lockBtn.addEventListener("click", function () {
      self.isParentUnlocked = false;
      self.closeModal();
    });
    header.appendChild(lockBtn);
    modal.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "ct-modal-body";

    // Tab buttons
    const tabsBar = document.createElement("div");
    tabsBar.className = "ct-admin-tabs";

    const tabDefinitions = [
      {
        id: "approvals",
        label: "Approvals",
        iconSvg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`
      },
      {
        id: "manage_chores",
        label: "Manage Chores",
        iconSvg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
      },
      {
        id: "children",
        label: "Children",
        iconSvg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
      },
      {
        id: "payout_engine",
        label: "Payout & Audit",
        iconSvg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`
      },
      {
        id: "history",
        label: "Payout Log",
        iconSvg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
      }
    ];

    tabDefinitions.forEach((tab) => {
      const tBtn = document.createElement("button");
      tBtn.className = `ct-tab-btn ${self.parentActiveTab === tab.id ? "active" : ""}`;
      tBtn.innerHTML = `${tab.iconSvg}<span>${tab.label}</span>`;
      tBtn.addEventListener("click", function () {
        self.parentActiveTab = tab.id;
        self.updateDom(100);
      });
      tabsBar.appendChild(tBtn);
    });
    body.appendChild(tabsBar);

    // Tab Contents
    if (this.parentActiveTab === "approvals") {
      body.appendChild(this.buildApprovalsTab());
    } else if (this.parentActiveTab === "manage_chores" || this.parentActiveTab === "create_task") {
      body.appendChild(this.buildManageChoresTab());
    } else if (this.parentActiveTab === "children") {
      body.appendChild(this.buildChildrenTab());
    } else if (this.parentActiveTab === "payout_engine") {
      body.appendChild(this.buildPayoutEngineTab());
    } else if (this.parentActiveTab === "history") {
      body.appendChild(this.buildHistoryTab());
    }

    modal.appendChild(body);
    backdrop.appendChild(modal);

    return backdrop;
  },

  /**
   * Approvals Tab: review monetized tasks completed by children
   */
  buildApprovalsTab: function () {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "14px";

    const self = this;
    const pendingTasks = this.tasks.filter((t) => t.category === "monetized" && t.is_completed && !t.is_approved);

    if (pendingTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty-state";
      const sparklesSvg = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 10px auto;"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>`;
      empty.innerHTML = `
        ${sparklesSvg}
        <p style="margin:0; font-size:15px; font-weight:600; color:#fff;">All caught up!</p>
        <p style="margin:4px 0 0 0; font-size:13px; color:#94a3b8;">No monetized chores waiting for approval right now.</p>
      `;
      container.appendChild(empty);
      return container;
    }

    pendingTasks.forEach((task) => {
      const item = document.createElement("div");
      item.style.background = "rgba(255, 255, 255, 0.05)";
      item.style.border = "1px solid var(--ct-border)";
      item.style.borderRadius = "var(--ct-radius-md)";
      item.style.padding = "16px";
      item.style.display = "flex";
      item.style.flexDirection = "column";
      item.style.gap = "12px";

      const assignedChild = self.profiles.find((p) => p.id === task.assigned_to);

      const topRow = document.createElement("div");
      topRow.style.display = "flex";
      topRow.style.justifyContent = "space-between";
      topRow.style.alignItems = "center";

      const userSmallSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

      topRow.innerHTML = `
        <div>
          <h4 style="margin:0 0 4px 0; font-size:17px; color:#fff;">${task.title}</h4>
          <span style="font-size:13px; color:#94a3b8; display:inline-flex; align-items:center;">Completed by: <strong style="color:#38bdf8; margin-left:4px; display:inline-flex; align-items:center;">${userSmallSvg}${assignedChild ? assignedChild.name : "Unassigned"}</strong></span>
        </div>
        <div style="font-size:22px; font-weight:800; color:#10b981;">
          ${self.config.currencySymbol}${(parseFloat(task.reward_amount) || 0).toFixed(2)}
        </div>
      `;
      item.appendChild(topRow);

      // Latest note excerpt if any
      if (Array.isArray(task.notes) && task.notes.length > 0) {
        const lastNote = task.notes[task.notes.length - 1];
        const noteBox = document.createElement("div");
        noteBox.style.fontSize = "13px";
        noteBox.style.padding = "8px 12px";
        noteBox.style.background = "rgba(0,0,0,0.3)";
        noteBox.style.borderRadius = "var(--ct-radius-sm)";
        noteBox.style.color = "#cbd5e1";
        const noteIconInline = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        noteBox.innerHTML = `${noteIconInline}<strong>${lastNote.author}:</strong> "${lastNote.text}"`;
        item.appendChild(noteBox);
      }

      // Actions row
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";

      const approveBtn = document.createElement("button");
      approveBtn.className = "ct-btn-success";
      approveBtn.style.flex = "1";
      const checkApproveSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      approveBtn.innerHTML = `${checkApproveSvg}<span>Approve &amp; Queue for Payout (${self.config.currencySymbol}${(parseFloat(task.reward_amount) || 0).toFixed(2)})</span>`;
      approveBtn.addEventListener("click", function () {
        self.sendSocketNotification("APPROVE_TASK", {
          taskId: task.id,
          approved: true,
          noteText: "Approved by Parent. Great job!"
        });
      });
      actions.appendChild(approveBtn);

      const revisionBtn = document.createElement("button");
      revisionBtn.className = "ct-btn-secondary";
      const undoSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
      revisionBtn.innerHTML = `${undoSvg}<span>Needs Revision</span>`;
      revisionBtn.addEventListener("click", function () {
        self.sendSocketNotification("APPROVE_TASK", {
          taskId: task.id,
          approved: false,
          noteText: "Please check your work and re-complete."
        });
        self.sendSocketNotification("TOGGLE_TASK_COMPLETION", {
          taskId: task.id
        });
      });
      actions.appendChild(revisionBtn);

      item.appendChild(actions);
      container.appendChild(item);
    });

    return container;
  },

  /**
   * Manage Chores Tab:
   * Allows parents to view all routine chores & bounties, edit titles,
   * frequencies, schedules (weekly, monthly, twice a year, yearly), or remove them.
   */
  buildManageChoresTab: function () {
    const self = this;
    const container = document.createElement("div");
    container.className = "ct-manage-chores-container";

    // Header with filter pills and "+ New Chore" action
    const header = document.createElement("div");
    header.className = "ct-manage-chores-header";

    const titleBox = document.createElement("div");
    const listSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    titleBox.innerHTML = `
      <h4 style="margin:0; font-size:15px; font-weight:700; color:#fff; display:flex; align-items:center;">
        ${listSvg}<span>Family Chores Inventory (${this.tasks.length})</span>
      </h4>
      <p style="margin:2px 0 0 0; font-size:12px; color:#94a3b8;">Edit routine chore frequencies or remove obsolete chores</p>
    `;
    header.appendChild(titleBox);

    const filterActions = document.createElement("div");
    filterActions.style.display = "flex";
    filterActions.style.alignItems = "center";
    filterActions.style.gap = "8px";

    const filterPills = document.createElement("div");
    filterPills.className = "ct-filter-pills";

    const filters = [
      { id: "all", label: `All (${this.tasks.length})` },
      { id: "routine", label: `Routine (${this.tasks.filter((t) => t.category === "routine").length})` },
      { id: "monetized", label: `Bounties (${this.tasks.filter((t) => t.category === "monetized").length})` }
    ];

    filters.forEach((f) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `ct-filter-pill ${self.manageChoresFilter === f.id ? "active" : ""}`;
      pill.innerText = f.label;
      pill.addEventListener("click", function () {
        self.manageChoresFilter = f.id;
        self.updateDom(50);
      });
      filterPills.appendChild(pill);
    });
    filterActions.appendChild(filterPills);

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "ct-btn-primary";
    newBtn.style.padding = "6px 14px";
    newBtn.style.minHeight = "36px";
    newBtn.style.fontSize = "12.5px";
    const plusSmallSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    newBtn.innerHTML = `${plusSmallSvg}<span>${self.isCreatingChore ? "Close Creator" : "New Chore"}</span>`;
    newBtn.addEventListener("click", function () {
      self.isCreatingChore = !self.isCreatingChore;
      self.updateDom(50);
    });
    filterActions.appendChild(newBtn);

    header.appendChild(filterActions);
    container.appendChild(header);

    if (self.isCreatingChore || self.tasks.length === 0) {
      const creatorCard = document.createElement("div");
      creatorCard.className = "ct-card";
      creatorCard.style.marginBottom = "14px";
      creatorCard.style.borderColor = "rgba(56, 189, 248, 0.4)";
      const creatorBody = self.buildCreateTaskTab();
      creatorCard.appendChild(creatorBody);
      container.appendChild(creatorCard);
    }

    // Filter tasks
    let filteredTasks = this.tasks;
    if (this.manageChoresFilter === "routine") {
      filteredTasks = this.tasks.filter((t) => t.category === "routine");
    } else if (this.manageChoresFilter === "monetized") {
      filteredTasks = this.tasks.filter((t) => t.category === "monetized");
    }

    if (filteredTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty-state";
      empty.innerHTML = `
        <p style="margin:0; font-size:15px; font-weight:600; color:#fff;">No chores match this filter</p>
        <p style="margin:4px 0 0 0; font-size:13px; color:#94a3b8;">Tap '+ New Chore' to create a new routine chore or monetized bounty.</p>
      `;
      container.appendChild(empty);
      return container;
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    filteredTasks.forEach((chore) => {
      const isEditing = self.editingTaskId === chore.id;
      const card = document.createElement("div");
      card.className = "ct-chore-manage-card";

      if (isEditing) {
        // INLINE EDIT FORM
        const editForm = document.createElement("div");
        editForm.className = "ct-chore-inline-edit";

        const draft = self.editingTaskDraft || {
          title: chore.title,
          category: chore.category,
          frequency: (chore.recurrence && chore.recurrence.frequency) || "weekly",
          days_of_week: (chore.recurrence && chore.recurrence.days_of_week) || [0, 1, 2, 3, 4, 5, 6],
          reward_amount: String(chore.reward_amount || "5.00"),
          assigned_to: chore.assigned_to || "up_for_grabs"
        };

        // Title
        const titleGrp = document.createElement("div");
        titleGrp.className = "ct-form-group";
        titleGrp.style.marginBottom = "8px";
        titleGrp.innerHTML = `<label class="ct-form-label" style="font-size:12px;">Edit Chore Title</label>`;
        const titleInput = document.createElement("input");
        titleInput.className = "ct-input";
        titleInput.value = draft.title;
        titleInput.style.padding = "8px 12px";
        titleInput.style.minHeight = "40px";
        titleInput.addEventListener("input", function (e) {
          draft.title = e.target.value;
        });
        self.attachVirtualKeyboard(titleInput, "Edit Chore Title", "text", function (val) {
          draft.title = val;
        });
        titleGrp.appendChild(titleInput);
        editForm.appendChild(titleGrp);

        // Category Toggle
        const catGrp = document.createElement("div");
        catGrp.className = "ct-form-group";
        catGrp.style.marginBottom = "8px";
        catGrp.innerHTML = `<label class="ct-form-label" style="font-size:12px;">Category</label>`;
        const catRow = document.createElement("div");
        catRow.style.display = "flex";
        catRow.style.gap = "8px";

        const rBtn = document.createElement("button");
        rBtn.type = "button";
        rBtn.className = `ct-btn-secondary ${draft.category === "routine" ? "ct-btn-primary" : ""}`;
        rBtn.style.padding = "6px 12px";
        rBtn.style.minHeight = "36px";
        rBtn.style.fontSize = "12px";
        rBtn.innerText = "Routine ($0.00)";
        rBtn.addEventListener("click", function () {
          draft.category = "routine";
          self.updateDom(50);
        });

        const mBtn = document.createElement("button");
        mBtn.type = "button";
        mBtn.className = `ct-btn-secondary ${draft.category === "monetized" ? "ct-btn-primary" : ""}`;
        mBtn.style.padding = "6px 12px";
        mBtn.style.minHeight = "36px";
        mBtn.style.fontSize = "12px";
        mBtn.innerText = "Monetized Bounty ($)";
        mBtn.addEventListener("click", function () {
          draft.category = "monetized";
          self.updateDom(50);
        });

        catRow.appendChild(rBtn);
        catRow.appendChild(mBtn);
        catGrp.appendChild(catRow);
        editForm.appendChild(catGrp);

        // If routine: Recurrence frequency
        if (draft.category === "routine") {
          const freqGrp = document.createElement("div");
          freqGrp.className = "ct-form-group";
          freqGrp.style.marginBottom = "8px";
          freqGrp.innerHTML = `<label class="ct-form-label" style="font-size:12px;">Recurrence Schedule</label>`;

          const freqGrid = document.createElement("div");
          freqGrid.className = "ct-recurrence-grid";

          const freqOptions = [
            { id: "weekly", label: "Daily / Weekly" },
            { id: "bi_weekly", label: "Every 2 Weeks" },
            { id: "every_3_weeks", label: "Every 3 Weeks" },
            { id: "twice_a_month", label: "Twice a Month" },
            { id: "monthly", label: "Once a Month" },
            { id: "twice_a_year", label: "Twice a Year" },
            { id: "yearly", label: "Once a Year" }
          ];

          freqOptions.forEach((opt) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `ct-recurrence-chip ${draft.frequency === opt.id ? "selected" : ""}`;
            chip.innerText = opt.label;
            chip.addEventListener("click", function () {
              draft.frequency = opt.id;
              self.updateDom(50);
            });
            freqGrid.appendChild(chip);
          });
          freqGrp.appendChild(freqGrid);

          if (draft.frequency === "weekly") {
            const daysRow = document.createElement("div");
            daysRow.className = "ct-days-selector";
            daysRow.style.gap = "4px";

            [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
              const dChip = document.createElement("div");
              const isSel = (draft.days_of_week || []).includes(d);
              dChip.className = `ct-day-chip ${isSel ? "selected" : ""}`;
              dChip.style.height = "36px";
              dChip.style.fontSize = "12px";
              dChip.innerText = dayNames[d];
              dChip.addEventListener("click", function () {
                const arr = draft.days_of_week || [];
                if (arr.includes(d)) {
                  draft.days_of_week = arr.filter((x) => x !== d);
                } else {
                  draft.days_of_week = [...arr, d];
                }
                self.updateDom(50);
              });
              daysRow.appendChild(dChip);
            });
            freqGrp.appendChild(daysRow);
          } else if (draft.frequency === "bi_weekly") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const clockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            tip.innerHTML = `${clockSvg}<span>Resets 14 days after completion for regular bi-weekly tasks.</span>`;
            freqGrp.appendChild(tip);
          } else if (draft.frequency === "every_3_weeks") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const clockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            tip.innerHTML = `${clockSvg}<span>Resets 21 days after completion for rotating 3-week chore cycles.</span>`;
            freqGrp.appendChild(tip);
          } else if (draft.frequency === "twice_a_month") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const calSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
            tip.innerHTML = `${calSvg}<span>Resets twice a month (on the 1st and 16th of each calendar month).</span>`;
            freqGrp.appendChild(tip);
          } else if (draft.frequency === "monthly") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const calSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
            tip.innerHTML = `${calSvg}<span>Resets automatically at the start of each calendar month.</span>`;
            freqGrp.appendChild(tip);
          } else if (draft.frequency === "twice_a_year") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const refreshSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#a855f7;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
            tip.innerHTML = `${refreshSvg}<span>Resets every 6 months (Jan 1 &amp; Jul 1) for semi-annual household chores.</span>`;
            freqGrp.appendChild(tip);
          } else if (draft.frequency === "yearly") {
            const tip = document.createElement("div");
            tip.className = "ct-recurrence-tip";
            const starSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
            tip.innerHTML = `${starSvg}<span>Resets once a year on January 1st for annual maintenance tasks.</span>`;
            freqGrp.appendChild(tip);
          }

          editForm.appendChild(freqGrp);
        } else {
          // Monetized reward input
          const rewGrp = document.createElement("div");
          rewGrp.className = "ct-form-group";
          rewGrp.style.marginBottom = "8px";
          rewGrp.innerHTML = `<label class="ct-form-label" style="font-size:12px;">Reward Amount (${self.config.currencySymbol})</label>`;
          const rewInput = document.createElement("input");
          rewInput.type = "number";
          rewInput.step = "0.50";
          rewInput.className = "ct-input";
          rewInput.value = draft.reward_amount;
          rewInput.style.padding = "8px 12px";
          rewInput.style.minHeight = "40px";
          rewInput.addEventListener("input", function (e) {
            draft.reward_amount = e.target.value;
          });
          self.attachVirtualKeyboard(rewInput, "Reward Amount", "number", function (val) {
            draft.reward_amount = val;
          });
          rewGrp.appendChild(rewInput);
          editForm.appendChild(rewGrp);
        }

        // Assignee selection
        const assignGrp = document.createElement("div");
        assignGrp.className = "ct-form-group";
        assignGrp.style.marginBottom = "8px";
        assignGrp.innerHTML = `<label class="ct-form-label" style="font-size:12px;">Assigned To</label>`;
        const assignChips = document.createElement("div");
        assignChips.className = "ct-assign-chips-grid";

        const gChip = document.createElement("button");
        gChip.type = "button";
        gChip.className = `ct-assign-chip grabs ${draft.assigned_to === "up_for_grabs" ? "selected" : ""}`;
        gChip.style.padding = "6px 10px";
        gChip.style.fontSize = "12px";
        const boltMini = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
        gChip.innerHTML = `${boltMini}<span>Up For Grabs</span>`;
        gChip.addEventListener("click", function () {
          draft.assigned_to = "up_for_grabs";
          self.updateDom(50);
        });
        assignChips.appendChild(gChip);

        self.profiles.forEach((p) => {
          const cChip = document.createElement("button");
          cChip.type = "button";
          cChip.className = `ct-assign-chip ${draft.assigned_to === p.id ? "selected" : ""}`;
          cChip.style.padding = "6px 10px";
          cChip.style.fontSize = "12px";
          const userMini = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
          cChip.innerHTML = `${userMini}<span>${p.name}</span>`;
          cChip.addEventListener("click", function () {
            draft.assigned_to = p.id;
            self.updateDom(50);
          });
          assignChips.appendChild(cChip);
        });
        assignGrp.appendChild(assignChips);
        editForm.appendChild(assignGrp);

        // Edit form buttons (Save & Cancel)
        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "6px";

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "ct-btn-success";
        saveBtn.style.padding = "8px 16px";
        saveBtn.style.minHeight = "40px";
        saveBtn.style.fontSize = "13px";
        const saveCheck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        saveBtn.innerHTML = `${saveCheck}<span>Save Changes</span>`;
        saveBtn.addEventListener("click", function () {
          if (!draft.title.trim()) {
            alert("Chore title cannot be empty.");
            return;
          }
          self.sendSocketNotification("UPDATE_TASK", {
            taskId: chore.id,
            title: draft.title,
            category: draft.category,
            frequency: draft.frequency,
            days_of_week: draft.days_of_week,
            reward_amount: draft.reward_amount,
            assigned_to: draft.assigned_to
          });
          // Optimistically update local task
          chore.title = draft.title.trim();
          chore.category = draft.category;
          chore.assigned_to = draft.assigned_to;
          if (draft.category === "routine") {
            chore.reward_amount = 0;
            chore.recurrence = {
              frequency: draft.frequency,
              days_of_week: draft.days_of_week || [0, 1, 2, 3, 4, 5, 6]
            };
          } else {
            chore.reward_amount = parseFloat(draft.reward_amount) || 0;
            chore.recurrence = null;
          }
          self.editingTaskId = null;
          self.editingTaskDraft = null;
          self.updateDom(100);
        });

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "ct-btn-secondary";
        cancelBtn.style.padding = "8px 16px";
        cancelBtn.style.minHeight = "40px";
        cancelBtn.style.fontSize = "13px";
        cancelBtn.innerText = "Cancel";
        cancelBtn.addEventListener("click", function () {
          self.editingTaskId = null;
          self.editingTaskDraft = null;
          self.updateDom(50);
        });

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        editForm.appendChild(btnRow);

        card.appendChild(editForm);
      } else {
        // VIEW MODE CARD
        const mainRow = document.createElement("div");
        mainRow.className = "ct-chore-card-main";

        const titleArea = document.createElement("div");
        titleArea.className = "ct-chore-card-title-area";

        const title = document.createElement("div");
        title.className = "ct-chore-card-name";
        title.innerText = chore.title;
        titleArea.appendChild(title);

        // Category Badge
        const catBadge = document.createElement("span");
        if (chore.category === "routine") {
          catBadge.className = "ct-badge ct-badge-routine";
          catBadge.innerText = "Routine";
        } else {
          catBadge.className = "ct-badge ct-badge-monetized";
          catBadge.innerText = `${self.config.currencySymbol}${(parseFloat(chore.reward_amount) || 0).toFixed(2)} Bounty`;
        }
        titleArea.appendChild(catBadge);

        // Schedule / Recurrence Badge
        const schedBadge = document.createElement("span");
        schedBadge.className = "ct-badge";
        schedBadge.style.background = "rgba(255, 255, 255, 0.08)";
        schedBadge.style.color = "#cbd5e1";
        schedBadge.style.border = "1px solid rgba(255, 255, 255, 0.15)";

        if (chore.category === "routine" && chore.recurrence) {
          const freq = chore.recurrence.frequency;
          if (freq === "monthly") {
            const calMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
            schedBadge.innerHTML = `${calMiniSvg}<span>Once a Month</span>`;
          } else if (freq === "twice_a_year") {
            const refMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`;
            schedBadge.innerHTML = `${refMiniSvg}<span>Twice a Year</span>`;
          } else if (freq === "yearly") {
            const starMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
            schedBadge.innerHTML = `${starMiniSvg}<span>Once a Year</span>`;
          } else {
            const daysArr = chore.recurrence.days_of_week || [];
            const repMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
            if (daysArr.length === 7 || daysArr.length === 0) {
              schedBadge.innerHTML = `${repMiniSvg}<span>Daily (Everyday)</span>`;
            } else {
              const dayStr = daysArr.map((d) => dayNames[d]).join(", ");
              schedBadge.innerHTML = `${repMiniSvg}<span>${dayStr}</span>`;
            }
          }
        } else {
          schedBadge.innerHTML = `<span>On-Demand Bounty</span>`;
        }
        titleArea.appendChild(schedBadge);

        // Assignee badge
        const assignBadge = document.createElement("span");
        assignBadge.className = "ct-badge";
        assignBadge.style.background = "rgba(0, 0, 0, 0.3)";
        assignBadge.style.border = "1px solid rgba(255, 255, 255, 0.1)";

        if (chore.assigned_to === "up_for_grabs") {
          const boltMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
          assignBadge.innerHTML = `${boltMiniSvg}<span style="color:#d8b4fe;">Up For Grabs</span>`;
        } else {
          const childP = self.profiles.find((p) => p.id === chore.assigned_to);
          const userMiniSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
          assignBadge.innerHTML = `${userMiniSvg}<span style="color:#fff;">${childP ? childP.name : "Assigned"}</span>`;
        }
        titleArea.appendChild(assignBadge);

        mainRow.appendChild(titleArea);

        // Action buttons: Edit & Remove
        const actions = document.createElement("div");
        actions.className = "ct-chore-card-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ct-btn-edit-chore";
        const pencilSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        editBtn.innerHTML = `${pencilSvg}<span>Edit</span>`;
        editBtn.addEventListener("click", function () {
          self.editingTaskId = chore.id;
          self.editingTaskDraft = {
            title: chore.title,
            category: chore.category,
            frequency: (chore.recurrence && chore.recurrence.frequency) || "weekly",
            days_of_week: (chore.recurrence && chore.recurrence.days_of_week) || [0, 1, 2, 3, 4, 5, 6],
            reward_amount: String(chore.reward_amount || "5.00"),
            assigned_to: chore.assigned_to || "up_for_grabs"
          };
          self.updateDom(50);
        });
        actions.appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "ct-btn-delete-chore";
        const trashSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        delBtn.innerHTML = `${trashSvg}<span>Remove</span>`;
        delBtn.addEventListener("click", function () {
          if (confirm(`Are you sure you want to remove the chore "${chore.title}"?`)) {
            self.sendSocketNotification("DELETE_TASK", { taskId: chore.id });
            self.tasks = self.tasks.filter((t) => t.id !== chore.id);
            self.updateDom(100);
          }
        });
        actions.appendChild(delBtn);

        mainRow.appendChild(actions);
        card.appendChild(mainRow);
      }

      container.appendChild(card);
    });

    return container;
  },

  /**
   * Chore Creation Form Tab:
   * Supports Routine Expectations (Daily, Weekly, Once a Month, Twice a Year, Once a Year)
   * or Monetized Bounties with multi-child or up-for-grabs assignment.
   */
  buildCreateTaskTab: function () {
    const self = this;
    const form = document.createElement("div");
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "16px";

    // Title input
    const titleGroup = document.createElement("div");
    titleGroup.className = "ct-form-group";
    titleGroup.innerHTML = `<label class="ct-form-label">Chore Title</label>`;
    const titleInput = document.createElement("input");
    titleInput.className = "ct-input";
    titleInput.placeholder = "e.g., Wash dishes, Clean bedroom, Replace furnace filters...";
    titleInput.value = this.newTaskDraft.title;
    titleInput.addEventListener("input", function (e) {
      self.newTaskDraft.title = e.target.value;
    });
    self.attachVirtualKeyboard(titleInput, "Chore Title", "text", function (val) {
      self.newTaskDraft.title = val;
    });
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    // Category Selector
    const catGroup = document.createElement("div");
    catGroup.className = "ct-form-group";
    catGroup.innerHTML = `<label class="ct-form-label">Category</label>`;

    const catToggleRow = document.createElement("div");
    catToggleRow.style.display = "flex";
    catToggleRow.style.gap = "10px";

    const routineBtn = document.createElement("button");
    routineBtn.type = "button";
    routineBtn.className = `ct-btn-secondary ${this.newTaskDraft.category === "routine" ? "ct-btn-primary" : ""}`;
    routineBtn.style.flex = "1";
    const routineIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`;
    routineBtn.innerHTML = `${routineIconSvg}<span>Routine Expectation ($0.00)</span>`;
    routineBtn.addEventListener("click", function () {
      self.newTaskDraft.category = "routine";
      self.updateDom(50);
    });

    const monetizedBtn = document.createElement("button");
    monetizedBtn.type = "button";
    monetizedBtn.className = `ct-btn-secondary ${this.newTaskDraft.category === "monetized" ? "ct-btn-primary" : ""}`;
    monetizedBtn.style.flex = "1";
    const coinIconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
    monetizedBtn.innerHTML = `${coinIconSvg}<span>Monetized Bounty ($)</span>`;
    monetizedBtn.addEventListener("click", function () {
      self.newTaskDraft.category = "monetized";
      self.updateDom(50);
    });

    catToggleRow.appendChild(routineBtn);
    catToggleRow.appendChild(monetizedBtn);
    catGroup.appendChild(catToggleRow);
    form.appendChild(catGroup);

    // If Monetized: Reward amount input
    if (this.newTaskDraft.category === "monetized") {
      const rewardGroup = document.createElement("div");
      rewardGroup.className = "ct-form-group";
      rewardGroup.innerHTML = `<label class="ct-form-label">Reward Amount (${this.config.currencySymbol})</label>`;
      const rewardInput = document.createElement("input");
      rewardInput.type = "number";
      rewardInput.step = "0.50";
      rewardInput.className = "ct-input";
      rewardInput.value = this.newTaskDraft.reward_amount;
      rewardInput.addEventListener("input", function (e) {
        self.newTaskDraft.reward_amount = e.target.value;
      });
      self.attachVirtualKeyboard(rewardInput, `Reward Amount (${self.config.currencySymbol})`, "number", function (val) {
        self.newTaskDraft.reward_amount = val;
      });
      rewardGroup.appendChild(rewardInput);
      form.appendChild(rewardGroup);
    } else {
      // If Routine: Recurrence Frequency Selection (Daily/Weekly, Once a Month, Twice a Year, Once a Year)
      const freqGroup = document.createElement("div");
      freqGroup.className = "ct-form-group";
      freqGroup.innerHTML = `<label class="ct-form-label">Recurrence Frequency</label>`;

      const freqGrid = document.createElement("div");
      freqGrid.className = "ct-recurrence-grid";

      const currentFreq = self.newTaskDraft.frequency || "weekly";

      const freqList = [
        { id: "weekly", label: "Daily / Weekly" },
        { id: "bi_weekly", label: "Every 2 Weeks" },
        { id: "every_3_weeks", label: "Every 3 Weeks" },
        { id: "twice_a_month", label: "Twice a Month" },
        { id: "monthly", label: "Once a Month" },
        { id: "twice_a_year", label: "Twice a Year" },
        { id: "yearly", label: "Once a Year" }
      ];

      freqList.forEach((opt) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `ct-recurrence-chip ${currentFreq === opt.id ? "selected" : ""}`;
        chip.innerText = opt.label;
        chip.addEventListener("click", function () {
          self.newTaskDraft.frequency = opt.id;
          self.updateDom(50);
        });
        freqGrid.appendChild(chip);
      });
      freqGroup.appendChild(freqGrid);

      if (currentFreq === "weekly") {
        // Quick presets header for weekly scheduling
        const presetsRow = document.createElement("div");
        presetsRow.style.display = "flex";
        presetsRow.style.justifyContent = "space-between";
        presetsRow.style.alignItems = "center";
        presetsRow.style.marginBottom = "6px";

        const label = document.createElement("label");
        label.className = "ct-form-label";
        label.style.margin = "0";
        label.innerText = "Active Days of Week";
        presetsRow.appendChild(label);

        const presetsGroup = document.createElement("div");
        presetsGroup.style.display = "flex";
        presetsGroup.style.gap = "6px";

        const tomorrowDay = (new Date().getDay() + 1) % 7;
        const todayDay = new Date().getDay();

        // Tomorrow Only Preset
        const tmrwBtn = document.createElement("button");
        tmrwBtn.type = "button";
        tmrwBtn.className = "ct-btn-secondary";
        tmrwBtn.style.padding = "2px 8px";
        tmrwBtn.style.fontSize = "11px";
        const isTmrwOnly = (self.newTaskDraft.days_of_week || []).length === 1 && (self.newTaskDraft.days_of_week || [])[0] === tomorrowDay;
        if (isTmrwOnly) {
          tmrwBtn.style.borderColor = "rgba(99, 102, 241, 0.6)";
          tmrwBtn.style.color = "#c7d2fe";
          tmrwBtn.style.background = "rgba(99, 102, 241, 0.25)";
        }
        tmrwBtn.innerText = "✨ Tomorrow Only";
        tmrwBtn.addEventListener("click", function (e) {
          e.preventDefault();
          self.newTaskDraft.days_of_week = [tomorrowDay];
          self.updateDom(50);
        });
        presetsGroup.appendChild(tmrwBtn);

        // Today Only Preset
        const tdyBtn = document.createElement("button");
        tdyBtn.type = "button";
        tdyBtn.className = "ct-btn-secondary";
        tdyBtn.style.padding = "2px 8px";
        tdyBtn.style.fontSize = "11px";
        const isTdyOnly = (self.newTaskDraft.days_of_week || []).length === 1 && (self.newTaskDraft.days_of_week || [])[0] === todayDay;
        if (isTdyOnly) {
          tdyBtn.style.borderColor = "rgba(56, 189, 248, 0.6)";
          tdyBtn.style.color = "#7dd3fc";
          tdyBtn.style.background = "rgba(56, 189, 248, 0.2)";
        }
        tdyBtn.innerText = "Today Only";
        tdyBtn.addEventListener("click", function (e) {
          e.preventDefault();
          self.newTaskDraft.days_of_week = [todayDay];
          self.updateDom(50);
        });
        presetsGroup.appendChild(tdyBtn);

        // Everyday Preset
        const everyBtn = document.createElement("button");
        everyBtn.type = "button";
        everyBtn.className = "ct-btn-secondary";
        everyBtn.style.padding = "2px 8px";
        everyBtn.style.fontSize = "11px";
        everyBtn.innerText = "Everyday";
        everyBtn.addEventListener("click", function (e) {
          e.preventDefault();
          self.newTaskDraft.days_of_week = [0, 1, 2, 3, 4, 5, 6];
          self.updateDom(50);
        });
        presetsGroup.appendChild(everyBtn);

        presetsRow.appendChild(presetsGroup);
        freqGroup.appendChild(presetsRow);

        // Days of Week recurrence chips
        const daysSelector = document.createElement("div");
        daysSelector.className = "ct-days-selector";

        const days = [
          { d: 0, label: "Sun" },
          { d: 1, label: "Mon" },
          { d: 2, label: "Tue" },
          { d: 3, label: "Wed" },
          { d: 4, label: "Thu" },
          { d: 5, label: "Fri" },
          { d: 6, label: "Sat" }
        ];

        days.forEach((item) => {
          const chip = document.createElement("div");
          const isSelected = (self.newTaskDraft.days_of_week || []).includes(item.d);
          const isTomorrow = item.d === tomorrowDay;
          const isToday = item.d === todayDay;

          chip.className = `ct-day-chip ${isSelected ? "selected" : ""}`;
          chip.style.display = "flex";
          chip.style.flexDirection = "column";
          chip.style.alignItems = "center";
          chip.style.padding = "4px 2px";

          let subBadge = "";
          if (isTomorrow) {
            subBadge = `<span style="font-size:8px; font-weight:800; color:#a5b4fc; text-transform:uppercase; margin-top:2px;">Tmrw</span>`;
          } else if (isToday) {
            subBadge = `<span style="font-size:8px; font-weight:800; color:#fde68a; text-transform:uppercase; margin-top:2px;">Today</span>`;
          }

          chip.innerHTML = `<span>${item.label}</span>${subBadge}`;

          chip.addEventListener("click", function () {
            const arr = self.newTaskDraft.days_of_week || [];
            if (arr.includes(item.d)) {
              self.newTaskDraft.days_of_week = arr.filter((x) => x !== item.d);
            } else {
              self.newTaskDraft.days_of_week = [...arr, item.d];
            }
            self.updateDom(50);
          });

          daysSelector.appendChild(chip);
        });

        freqGroup.appendChild(daysSelector);
      } else if (currentFreq === "bi_weekly") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const clockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
        tip.innerHTML = `${clockSvg}<span>Bi-weekly routine: resets 14 days after completion for regular two-week chore cycles.</span>`;
        freqGroup.appendChild(tip);
      } else if (currentFreq === "every_3_weeks") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const clockSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
        tip.innerHTML = `${clockSvg}<span>Three-week routine: resets 21 days after completion for rotating household duties.</span>`;
        freqGroup.appendChild(tip);
      } else if (currentFreq === "twice_a_month") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const calSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
        tip.innerHTML = `${calSvg}<span>Twice a month routine: resets on the 1st and 16th of each calendar month.</span>`;
        freqGroup.appendChild(tip);
      } else if (currentFreq === "monthly") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const calSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#38bdf8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
        tip.innerHTML = `${calSvg}<span>Monthly routine: resets automatically at the start of every calendar month.</span>`;
        freqGroup.appendChild(tip);
      } else if (currentFreq === "twice_a_year") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const refreshSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px; color:#a855f7;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
        tip.innerHTML = `${refreshSvg}<span>Semi-annual routine: resets every 6 months (Jan 1 &amp; Jul 1) for seasonal tasks (smoke alarms, deep cleaning).</span>`;
        freqGroup.appendChild(tip);
      } else if (currentFreq === "yearly") {
        const tip = document.createElement("div");
        tip.className = "ct-recurrence-tip";
        const starSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:5px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        tip.innerHTML = `${starSvg}<span>Annual routine: resets once a year on January 1st for major annual maintenance.</span>`;
        freqGroup.appendChild(tip);
      }

      form.appendChild(freqGroup);
    }

    // Multi-Child Assign Chore To Selector
    const assignGroup = document.createElement("div");
    assignGroup.className = "ct-form-group";
    assignGroup.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <label class="ct-form-label" style="margin:0;">Assign Chore To</label>
        <span style="font-size:11px; color:#94a3b8;">Select one or multiple children</span>
      </div>
    `;

    const chipsGrid = document.createElement("div");
    chipsGrid.className = "ct-assign-chips-grid";

    const currentAssigned = Array.isArray(self.newTaskDraft.assigned_to)
      ? self.newTaskDraft.assigned_to
      : [self.newTaskDraft.assigned_to || "up_for_grabs"];

    // "Up For Grabs" Chip
    const grabsChip = document.createElement("button");
    grabsChip.type = "button";
    const isGrabs = currentAssigned.includes("up_for_grabs");
    grabsChip.className = `ct-assign-chip grabs ${isGrabs ? "selected" : ""}`;
    const boltChipSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="none" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
    grabsChip.innerHTML = `${boltChipSvg}<strong>Up For Grabs</strong> <small style="opacity:0.8;">(Open bounty)</small>`;
    grabsChip.addEventListener("click", function (e) {
      e.preventDefault();
      self.newTaskDraft.assigned_to = ["up_for_grabs"];
      self.updateDom(50);
    });
    chipsGrid.appendChild(grabsChip);

    // Each Child's Chip
    this.profiles.forEach((p) => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isSelected = currentAssigned.includes(p.id);
      chip.className = `ct-assign-chip ${isSelected ? "selected" : ""}`;
      const userChipSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin:0 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      const checkOrPlusSvg = isSelected
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      chip.innerHTML = `${checkOrPlusSvg}${userChipSvg}<strong>${p.name}</strong>`;

      chip.addEventListener("click", function (e) {
        e.preventDefault();
        let arr = currentAssigned.filter((x) => x !== "up_for_grabs");
        if (arr.includes(p.id)) {
          arr = arr.filter((x) => x !== p.id);
        } else {
          arr.push(p.id);
        }
        if (arr.length === 0) {
          arr = ["up_for_grabs"];
        }
        self.newTaskDraft.assigned_to = arr;
        self.updateDom(50);
      });

      chipsGrid.appendChild(chip);
    });

    assignGroup.appendChild(chipsGrid);

    // Helper button: Select All Children
    if (this.profiles.length > 1) {
      const helperRow = document.createElement("div");
      helperRow.style.display = "flex";
      helperRow.style.gap = "8px";
      helperRow.style.marginTop = "6px";

      const selectAllBtn = document.createElement("button");
      selectAllBtn.type = "button";
      selectAllBtn.className = "ct-btn-secondary";
      selectAllBtn.style.padding = "4px 10px";
      selectAllBtn.style.fontSize = "11.5px";
      const allUsersSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
      selectAllBtn.innerHTML = `${allUsersSvg}<span>Assign to All Children</span>`;
      selectAllBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.newTaskDraft.assigned_to = self.profiles.map((p) => p.id);
        self.updateDom(50);
      });
      helperRow.appendChild(selectAllBtn);
      assignGroup.appendChild(helperRow);
    }

    form.appendChild(assignGroup);

    // Initial Parent Note / Instructions
    const noteGroup = document.createElement("div");
    noteGroup.className = "ct-form-group";
    noteGroup.innerHTML = `<label class="ct-form-label">Initial Instructions / Notes (Optional)</label>`;

    const noteInput = document.createElement("textarea");
    noteInput.className = "ct-textarea";
    noteInput.rows = 2;
    noteInput.placeholder = "e.g., Use the green cleaning spray under the sink...";
    noteInput.value = this.newTaskDraft.initial_note;
    noteInput.addEventListener("input", function (e) {
      self.newTaskDraft.initial_note = e.target.value;
    });
    self.attachVirtualKeyboard(noteInput, "Initial Instructions / Notes", "text", function (val) {
      self.newTaskDraft.initial_note = val;
    });
    noteGroup.appendChild(noteInput);
    form.appendChild(noteGroup);

    // Save button
    const submitBtn = document.createElement("button");
    submitBtn.className = "ct-btn-primary";
    const saveChoreSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
    submitBtn.innerHTML = `${saveChoreSvg}<span>Save &amp; Publish Chore to Mirror</span>`;
    submitBtn.addEventListener("click", function () {
      if (!self.newTaskDraft.title.trim()) {
        alert("Please enter a chore title.");
        return;
      }

      const assignList = (Array.isArray(self.newTaskDraft.assigned_to) && self.newTaskDraft.assigned_to.length > 0)
        ? self.newTaskDraft.assigned_to
        : ["up_for_grabs"];

      self.sendSocketNotification("CREATE_TASK", {
        title: self.newTaskDraft.title,
        category: self.newTaskDraft.category,
        frequency: self.newTaskDraft.frequency || "weekly",
        reward_amount: self.newTaskDraft.reward_amount,
        assigned_tos: assignList,
        assigned_to: assignList[0],
        days_of_week: self.newTaskDraft.days_of_week,
        initial_note: self.newTaskDraft.initial_note
      });

      // Reset draft
      self.newTaskDraft = {
        title: "",
        category: "routine",
        frequency: "weekly",
        reward_amount: "5.00",
        assigned_to: ["up_for_grabs"],
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        initial_note: ""
      };

      self.parentActiveTab = "manage_chores";
      self.updateDom(200);
    });

    form.appendChild(submitBtn);

    return form;
  },

  /**
   * Children Management Tab:
   * Easily rename existing children or add new children to the family tracker.
   */
  buildChildrenTab: function () {
    const self = this;
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "16px";

    // 1. Add New Child Card
    const addCard = document.createElement("div");
    addCard.className = "ct-manage-child-card add-card";

    const addTitle = document.createElement("h4");
    addTitle.style.margin = "0 0 8px 0";
    addTitle.style.fontSize = "14px";
    addTitle.style.fontWeight = "700";
    addTitle.style.color = "#38bdf8";
    const plusChildSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    addTitle.innerHTML = `${plusChildSvg}<span>Add a New Child</span>`;
    addCard.appendChild(addTitle);

    const addRow = document.createElement("div");
    addRow.style.display = "flex";
    addRow.style.gap = "10px";

    const addInput = document.createElement("input");
    addInput.className = "ct-input";
    addInput.placeholder = "Enter child's name (e.g. Emma, Lucas, Noah)...";
    addInput.style.flex = "1";
    self.attachVirtualKeyboard(addInput, "New Child Name", "text");

    const addBtn = document.createElement("button");
    addBtn.className = "ct-btn-primary";
    const addIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    addBtn.innerHTML = `${addIconSvg}<span>Add Child</span>`;
    addBtn.style.whiteSpace = "nowrap";

    addBtn.addEventListener("click", function () {
      const name = addInput.value.trim();
      if (!name) return;
      self.sendSocketNotification("ADD_PROFILE", { name: name });
      addInput.value = "";
    });

    addInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        addBtn.click();
      }
    });

    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    addCard.appendChild(addRow);
    container.appendChild(addCard);

    // 2. Existing Children List
    const listHeader = document.createElement("div");
    listHeader.style.display = "flex";
    listHeader.style.justifyContent = "space-between";
    listHeader.style.alignItems = "center";
    const usersHeaderSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
    listHeader.innerHTML = `
      <h4 style="margin:0; font-size:14px; font-weight:700; color:#fff; display:flex; align-items:center;">
        ${usersHeaderSvg}<span>Family Children (${this.profiles.length})</span>
      </h4>
      <span style="font-size:11px; color:#94a3b8;">Edit names or manage profiles</span>
    `;
    container.appendChild(listHeader);

    const avatarGradients = [
      "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      "linear-gradient(135deg, #a855f7, #7e22ce)",
      "linear-gradient(135deg, #f59e0b, #d97706)",
      "linear-gradient(135deg, #ec4899, #be185d)"
    ];

    this.profiles.forEach((profile, idx) => {
      const childCard = document.createElement("div");
      childCard.className = "ct-manage-child-card";

      // Left: avatar badge (single letter initial)
      const avatar = document.createElement("div");
      avatar.className = "ct-kid-avatar";
      avatar.style.background = avatarGradients[idx % avatarGradients.length];
      avatar.innerHTML = `<span style="font-weight:800; font-size:15px; color:#fff;">${(profile.name || "C").charAt(0).toUpperCase()}</span>`;
      childCard.appendChild(avatar);

      // Middle: editable input for name
      const nameInput = document.createElement("input");
      nameInput.className = "ct-input";
      nameInput.value = profile.name;
      nameInput.style.flex = "1";
      nameInput.placeholder = "Child name...";
      self.attachVirtualKeyboard(nameInput, `Rename Child: ${profile.name}`, "text");

      // Right actions
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      // Save / Rename button
      const saveBtn = document.createElement("button");
      saveBtn.className = "ct-btn-secondary";
      const saveDiskSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
      saveBtn.innerHTML = `${saveDiskSvg}<span>Save Name</span>`;
      saveBtn.addEventListener("click", function () {
        const newName = nameInput.value.trim();
        if (!newName) return;
        self.sendSocketNotification("UPDATE_PROFILE", {
          profileId: profile.id,
          name: newName
        });
        const checkSaveSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        saveBtn.innerHTML = `${checkSaveSvg}<span style="color:#10b981;">Saved!</span>`;
        setTimeout(() => {
          saveBtn.innerHTML = `${saveDiskSvg}<span>Save Name</span>`;
        }, 1500);
      });
      actions.appendChild(saveBtn);

      // Remove button (if more than 1 child exists)
      if (self.profiles.length > 1) {
        const delBtn = document.createElement("button");
        delBtn.className = "ct-btn-danger";
        delBtn.style.padding = "6px 12px";
        const trashSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        delBtn.innerHTML = `${trashSvg}<span>Remove</span>`;
        delBtn.addEventListener("click", function () {
          if (confirm(`Are you sure you want to remove ${profile.name}? Any assigned chores will become Up For Grabs.`)) {
            self.sendSocketNotification("DELETE_PROFILE", { profileId: profile.id });
          }
        });
        actions.appendChild(delBtn);
      }

      childCard.appendChild(nameInput);
      childCard.appendChild(actions);
      container.appendChild(childCard);
    });

    return container;
  },

  /**
   * Payout & Audit Engine Tab:
   * Select child profile, calculate earnings from approved monetized chores,
   * write immutable record to payouts_db.json, and archive/reset approved chores.
   */
  buildPayoutEngineTab: function () {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "16px";

    const self = this;

    // Profile selector for payout
    const filterRow = document.createElement("div");
    filterRow.style.display = "flex";
    filterRow.style.gap = "12px";
    filterRow.style.alignItems = "center";

    const label = document.createElement("span");
    label.style.fontWeight = "600";
    label.style.fontSize = "15px";
    label.style.display = "inline-flex";
    label.style.alignItems = "center";
    const userSelectSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:5px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    label.innerHTML = `${userSelectSvg}<span>Select Child:</span>`;
    filterRow.appendChild(label);

    const select = document.createElement("select");
    select.className = "ct-select";
    select.style.flex = "1";

    this.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.innerText = p.name;
      if (p.id === self.payoutFilterProfileId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener("change", function (e) {
      self.payoutFilterProfileId = e.target.value;
      self.updateDom(100);
    });
    filterRow.appendChild(select);
    container.appendChild(filterRow);

    // Scan approved monetized tasks for selected child
    const approvedTasks = this.tasks.filter(
      (t) => t.category === "monetized" && t.is_approved && t.assigned_to === this.payoutFilterProfileId
    );

    const totalDue = approvedTasks.reduce(
      (sum, t) => sum + (parseFloat(t.reward_amount) || 0),
      0
    );

    // Big Payout Summary Box
    const payoutBox = document.createElement("div");
    payoutBox.className = "ct-payout-box";

    payoutBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:40px; height:40px; border-radius:50%; background:rgba(16, 185, 129, 0.2); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        </div>
        <div>
          <div class="ct-payout-amount-label">Verified Total Payout Due</div>
          <div style="font-size:14px; color:#cbd5e1; margin-top:4px;">
            ${approvedTasks.length} Approved ${approvedTasks.length === 1 ? "Chore" : "Chores"} Ready for Payout
          </div>
        </div>
      </div>
      <div class="ct-payout-amount-val">
        ${self.config.currencySymbol}${totalDue.toFixed(2)}
      </div>
    `;
    container.appendChild(payoutBox);

    // Itemized Audit List
    const auditTitle = document.createElement("h4");
    auditTitle.style.margin = "0";
    auditTitle.style.fontSize = "15px";
    auditTitle.style.color = "#cbd5e1";
    auditTitle.innerText = "Itemized Approved Chores Audit Breakdown";
    container.appendChild(auditTitle);

    const auditList = document.createElement("div");
    auditList.className = "ct-audit-list";

    if (approvedTasks.length === 0) {
      const emptyAudit = document.createElement("div");
      emptyAudit.style.textAlign = "center";
      emptyAudit.style.color = "#64748b";
      emptyAudit.style.padding = "20px";
      emptyAudit.innerText = "No approved monetized chores found for this child.";
      auditList.appendChild(emptyAudit);
    } else {
      approvedTasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "ct-audit-item";
        const checkAuditSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        row.innerHTML = `
          <span style="display:inline-flex; align-items:center;">${checkAuditSvg}${t.title}</span>
          <span class="ct-audit-price">${self.config.currencySymbol}${(parseFloat(t.reward_amount) || 0).toFixed(2)}</span>
        `;
        auditList.appendChild(row);
      });
    }
    container.appendChild(auditList);

    // Action button: Process Payout
    if (approvedTasks.length > 0) {
      const payoutBtn = document.createElement("button");
      payoutBtn.className = "ct-btn-success";
      const coinPayoutSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
      payoutBtn.innerHTML = `${coinPayoutSvg}<span>Process Payout (${self.config.currencySymbol}${totalDue.toFixed(2)}) &amp; Write Audit Log</span>`;

      payoutBtn.addEventListener("click", function () {
        const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const endDate = self.serverDate || new Date().toISOString().split("T")[0];

        self.sendSocketNotification("PROCESS_PAYOUT", {
          profile_id: self.payoutFilterProfileId,
          date_range_start: startDate,
          date_range_end: endDate,
          approved_task_ids: approvedTasks.map((t) => t.id)
        });

        self.parentActiveTab = "history";
        self.updateDom(250);
      });

      container.appendChild(payoutBtn);
    }

    return container;
  },

  /**
   * Payout History Tab: view immutable audit records from payouts_db.json
   */
  buildHistoryTab: function () {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "14px";

    const self = this;
    const records = this.payoutRecords || [];

    if (records.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty-state";
      const histEmptySvg = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 10px auto;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      empty.innerHTML = `${histEmptySvg}<p style="margin:0; font-size:15px; color:#cbd5e1;">No payout audit records found yet.</p><p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">Processed payouts will automatically appear in this permanent ledger.</p>`;
      container.appendChild(empty);
      return container;
    }

    // Sort descending by processed timestamp
    const sorted = [...records].reverse();

    sorted.forEach((rec) => {
      const card = document.createElement("div");
      card.style.background = "rgba(255, 255, 255, 0.04)";
      card.style.border = "1px solid var(--ct-border)";
      card.style.borderRadius = "var(--ct-radius-md)";
      card.style.padding = "14px 18px";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";

      const profile = self.profiles.find((p) => p.id === rec.profile_id);
      const dateStr = rec.processed_timestamp
        ? new Date(rec.processed_timestamp).toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: "numeric"
          })
        : rec.date_range_end || "";

      const userHistSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

      card.innerHTML = `
        <div>
          <div style="font-weight:700; font-size:16px; color:#fff; display:flex; align-items:center;">
            ${userHistSvg}
            <span>${profile ? profile.name : rec.profile_id}</span>
          </div>
          <div style="font-size:13px; color:#94a3b8; margin-top:3px;">
            Processed: ${dateStr} • Ref: <code>${rec.id}</code>
          </div>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">
            ${(rec.approved_task_ids || []).length} chores included (${rec.date_range_start || ""} to ${rec.date_range_end || ""})
          </div>
        </div>
        <div style="font-size:24px; font-weight:800; color:#10b981;">
          ${self.config.currencySymbol}${(parseFloat(rec.total_amount) || 0).toFixed(2)}
        </div>
      `;

      container.appendChild(card);
    });

    return container;
  }
});
