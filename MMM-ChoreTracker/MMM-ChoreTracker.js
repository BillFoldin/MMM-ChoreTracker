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
    currencySymbol: "$",
    parentPin: "1234",
    pollInterval: 60000, // 60s fallback poll
    showCompletedTasks: true,
    allowChildNoteAuthoring: true,
    databaseDirectory: "data"
  },

  // Internal component state
  profiles: [],
  tasks: [],
  payoutRecords: [],
  selectedProfileId: null, // active child ID when viewing child chore modal
  childModalTab: "assigned", // "assigned" | "up_for_grabs"
  activeModal: null, // null | 'child_chores' | 'task_detail' | 'who_completed' | 'pin_pad' | 'parent_panel'
  activeTaskId: null,
  completingTaskId: null,
  isParentUnlocked: false,
  pinInput: "",
  pinError: "",
  parentActiveTab: "approvals", // 'approvals' | 'create_task' | 'payout_engine' | 'history'
  serverDate: "",

  // In-module task creation draft
  newTaskDraft: {
    title: "",
    category: "monetized",
    reward_amount: "5.00",
    assigned_to: "up_for_grabs",
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    initial_note: ""
  },

  // Payout calculation state
  payoutFilterProfileId: "",
  payoutRangeDays: 7,

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

    // Transmit config to backend helper and request initial database load
    this.sendSocketNotification("CONFIG", this.config);
    this.sendSocketNotification("GET_INITIAL_DATA");

    // Periodic safety sync interval
    const self = this;
    setInterval(function () {
      self.sendSocketNotification("GET_INITIAL_DATA");
    }, this.config.pollInterval);
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
   * Generates the pure vanilla DOM tree for MagicMirror²
   */
  closeModal: function () {
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
   * Builds top header with title, family counters, and Parent Mode button
   */
  buildHeader: function () {
    const header = document.createElement("div");
    header.className = "ct-header";

    // Left title group
    const left = document.createElement("div");
    left.className = "ct-header-left";

    const iconBox = document.createElement("div");
    iconBox.className = "ct-module-icon";
    iconBox.innerText = "✨";
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
    routineStat.innerText = `✓ ${completedCount}/${this.tasks.length} Done`;
    statsPills.appendChild(routineStat);

    // Available Bounty sum ($)
    const availableBounty = this.tasks
      .filter((t) => t.category === "monetized" && !t.is_completed)
      .reduce((sum, t) => sum + (parseFloat(t.reward_amount) || 0), 0);

    const bountyStat = document.createElement("div");
    bountyStat.className = "ct-stat-pill emerald";
    bountyStat.innerText = `⚡ ${this.config.currencySymbol}${availableBounty.toFixed(2)} Open`;
    statsPills.appendChild(bountyStat);
    right.appendChild(statsPills);

    // Parent Mode lock button
    const parentBtn = document.createElement("button");
    parentBtn.className = `ct-btn-parent ${this.isParentUnlocked ? "unlocked" : ""}`;
    parentBtn.innerHTML = this.isParentUnlocked
      ? `<span>🔓</span> Parent Mode`
      : `<span>🔒</span> Parent Lock`;

    const self = this;
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
      "linear-gradient(135deg, #ec4899, #be185d)"  // Pink
    ];

    this.profiles.forEach((profile, index) => {
      const childTasks = self.tasks.filter((t) => t.assigned_to === profile.id);
      const totalCount = childTasks.length;
      const doneCount = childTasks.filter((t) =>
        t.category === "routine" ? t.is_completed_today : t.is_completed
      ).length;
      const pendingCount = totalCount - doneCount;

      const card = document.createElement("div");
      card.className = "ct-kid-card";

      // Avatar circle with first letter of name
      const initial = (profile.name || "C").charAt(0).toUpperCase();
      const gradient = avatarGradients[index % avatarGradients.length];

      const avatar = document.createElement("div");
      avatar.className = "ct-kid-avatar";
      avatar.style.background = gradient;
      avatar.innerText = initial;
      card.appendChild(avatar);

      // Child name
      const name = document.createElement("h3");
      name.className = "ct-kid-name";
      name.innerText = profile.name;
      card.appendChild(name);

      // Status text
      const status = document.createElement("div");
      status.className = "ct-kid-status";
      if (totalCount === 0) {
        status.innerText = "No chores assigned";
      } else if (pendingCount === 0) {
        status.innerHTML = `<span style="color:#10b981;">🎉 All ${totalCount} Done!</span>`;
      } else {
        status.innerHTML = `<span style="color:#38bdf8;">${doneCount} of ${totalCount} Done</span> • <strong style="color:#f59e0b;">${pendingCount} Due</strong>`;
      }
      card.appendChild(status);

      // Progress bar
      const bar = document.createElement("div");
      bar.className = "ct-kid-progress-bar";
      const fill = document.createElement("div");
      fill.className = "ct-kid-progress-fill";
      const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      card.appendChild(bar);

      // Tap hint
      const hint = document.createElement("div");
      hint.className = "ct-kid-tap-hint";
      hint.innerHTML = `<span>View chores</span> <span>→</span>`;
      card.appendChild(hint);

      // Clicking opens this child's chores modal
      card.addEventListener("click", function () {
        self.selectedProfileId = profile.id;
        self.childModalTab = "assigned";
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
    grabsAvatar.innerText = "⚡";
    grabsCard.appendChild(grabsAvatar);

    const grabsName = document.createElement("h3");
    grabsName.className = "ct-kid-name";
    grabsName.innerText = "Up For Grabs";
    grabsCard.appendChild(grabsName);

    const grabsStatus = document.createElement("div");
    grabsStatus.className = "ct-kid-status";
    grabsStatus.innerHTML = `<span style="color:#d8b4fe;">${openGrabs.length} Open Bounties</span> • <strong style="color:#10b981;">${self.config.currencySymbol}${grabsTotal.toFixed(2)}</strong>`;
    grabsCard.appendChild(grabsStatus);

    const grabsBar = document.createElement("div");
    grabsBar.className = "ct-kid-progress-bar";
    const grabsFill = document.createElement("div");
    grabsFill.className = "ct-kid-progress-fill";
    grabsFill.style.background = "linear-gradient(90deg, #a855f7, #10b981)";
    grabsFill.style.width = openGrabs.length > 0 ? "100%" : "0%";
    grabsBar.appendChild(grabsFill);
    grabsCard.appendChild(grabsBar);

    const grabsHint = document.createElement("div");
    grabsHint.className = "ct-kid-tap-hint";
    grabsHint.innerHTML = `<span>Claim bounties</span> <span>→</span>`;
    grabsCard.appendChild(grabsHint);

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
   * Child Chores Modal
   * Triggered when a kid's card/name is clicked on the main screen.
   * Displays that specific child's items with completion toggles, notes, and bounties.
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

    const backBtn = document.createElement("button");
    backBtn.className = "ct-btn-close-modal";
    backBtn.innerHTML = `← Back`;
    backBtn.setAttribute("aria-label", "Back to dashboard");
    backBtn.addEventListener("click", function () {
      self.closeModal();
    });
    headerLeft.appendChild(backBtn);

    const titleGroup = document.createElement("div");
    titleGroup.className = "ct-modal-title";

    const initial = isUpForGrabsView ? "⚡" : (childName || "C").charAt(0).toUpperCase();
    titleGroup.innerHTML = `
      <div class="ct-avatar-circle" style="background:${isUpForGrabsView ? "#8b5cf6" : "#3b82f6"}; width:38px; height:38px; font-size:16px;">
        ${initial}
      </div>
      <div>
        <div style="font-size:19px; line-height:1.2; font-weight:700;">${childName}'s Chores</div>
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

    // Body
    const body = document.createElement("div");
    body.className = "ct-modal-body";

    // Navigation sub-tabs (Assigned vs Available Bounties) if not purely up_for_grabs
    if (!isUpForGrabsView) {
      const tabsBar = document.createElement("div");
      tabsBar.style.display = "flex";
      tabsBar.style.gap = "8px";
      tabsBar.style.marginBottom = "4px";

      const assignedTasksCount = this.tasks.filter((t) => t.assigned_to === childId).length;
      const openBountiesCount = this.tasks.filter((t) => t.assigned_to === "up_for_grabs" && !t.is_completed).length;

      const myBtn = document.createElement("button");
      myBtn.className = `ct-tab-btn ${this.childModalTab === "assigned" ? "active" : ""}`;
      myBtn.style.padding = "8px 14px";
      myBtn.style.minHeight = "40px";
      myBtn.style.fontSize = "13px";
      myBtn.innerText = `${childName}'s Tasks (${assignedTasksCount})`;
      myBtn.addEventListener("click", function () {
        self.childModalTab = "assigned";
        self.updateDom(100);
      });
      tabsBar.appendChild(myBtn);

      const grabsBtn = document.createElement("button");
      grabsBtn.className = `ct-tab-btn ${this.childModalTab === "up_for_grabs" ? "active" : ""}`;
      grabsBtn.style.padding = "8px 14px";
      grabsBtn.style.minHeight = "40px";
      grabsBtn.style.fontSize = "13px";
      grabsBtn.innerText = `⚡ Up For Grabs (${openBountiesCount})`;
      grabsBtn.addEventListener("click", function () {
        self.childModalTab = "up_for_grabs";
        self.updateDom(100);
      });
      tabsBar.appendChild(grabsBtn);

      body.appendChild(tabsBar);
    }

    // Filter tasks based on view
    let targetTasks = [];
    if (isUpForGrabsView || this.childModalTab === "up_for_grabs") {
      targetTasks = this.tasks.filter((t) => t.assigned_to === "up_for_grabs");
    } else {
      targetTasks = this.tasks.filter((t) => t.assigned_to === childId);
    }

    // Tasks list
    const tasksList = document.createElement("div");
    tasksList.className = "ct-tasks-grid";

    if (targetTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-empty-state";
      empty.innerHTML = `
        <p style="font-size: 28px; margin: 0 0 10px 0;">🎉</p>
        <p>No chores pending here! Great job!</p>
      `;
      tasksList.appendChild(empty);
    } else {
      targetTasks.forEach((task) => {
        const isRoutine = task.category === "routine";
        const isDone = isRoutine ? Boolean(task.is_completed_today) : Boolean(task.is_completed);

        const card = document.createElement("div");
        card.className = `ct-task-card ${isDone ? "completed" : ""}`;

        // Top row
        const cardTop = document.createElement("div");
        cardTop.className = "ct-card-top";

        const titleGroup = document.createElement("div");
        titleGroup.className = "ct-card-title-group";

        const title = document.createElement("h3");
        title.className = "ct-card-title";
        title.innerText = task.title;
        titleGroup.appendChild(title);

        // Badges row
        const badgesRow = document.createElement("div");
        badgesRow.className = "ct-badges-row";

        // Category badge
        const catBadge = document.createElement("span");
        if (isRoutine) {
          catBadge.className = "ct-badge ct-badge-routine";
          catBadge.innerText = "Routine Expectation";
        } else {
          catBadge.className = "ct-badge ct-badge-monetized";
          catBadge.innerText = `${self.config.currencySymbol}${(parseFloat(task.reward_amount) || 0).toFixed(2)} Bounty`;
        }
        badgesRow.appendChild(catBadge);

        // Monetized approval status badge
        if (!isRoutine && task.is_completed) {
          const statusBadge = document.createElement("span");
          if (task.is_approved) {
            statusBadge.className = "ct-badge ct-badge-approved";
            statusBadge.innerText = "✓ Approved for Payout";
          } else {
            statusBadge.className = "ct-badge ct-badge-approval";
            statusBadge.innerText = "⏳ Needs Parent Approval";
          }
          badgesRow.appendChild(statusBadge);
        }

        titleGroup.appendChild(badgesRow);
        cardTop.appendChild(titleGroup);

        // Complete check button
        const checkBtn = document.createElement("button");
        checkBtn.className = "ct-btn-card-check";
        checkBtn.setAttribute("aria-label", "Toggle Complete");
        checkBtn.innerHTML = isDone ? "✓" : "";
        checkBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          // If task is up_for_grabs or unassigned, and not yet completed, prompt who did it!
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
        notesIndicator.innerHTML = `💬 ${notesCount} ${notesCount === 1 ? "Note" : "Notes"}`;
        cardBottom.appendChild(notesIndicator);

        // Claim button if up_for_grabs and viewed by a specific child
        if (task.assigned_to === "up_for_grabs" && !isUpForGrabsView && childId) {
          const claimBtn = document.createElement("button");
          claimBtn.className = "ct-badge ct-badge-grabs";
          claimBtn.style.cursor = "pointer";
          claimBtn.style.padding = "4px 10px";
          claimBtn.innerText = `⚡ Claim for ${childName}`;
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

        // Clicking card body opens the full detail/notes modal
        card.addEventListener("click", function () {
          self.activeTaskId = task.id;
          self.activeModal = "task_detail";
          self.updateDom(200);
        });

        tasksList.appendChild(card);
      });
    }

    body.appendChild(tasksList);
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
        <strong style="color:#fff;">${task.assigned_to === "up_for_grabs" ? "⚡ Up For Grabs" : assignedProfile ? assignedProfile.name : "Assigned"}</strong>
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
      claimBtn.innerText = `⚡ Claim Chore for ${currentChild ? currentChild.name : "Me"}`;
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
    completeBtn.innerText = isDone ? "↩ Mark as Incomplete" : "✓ Mark as Completed";
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

        bubble.innerHTML = `
          <div class="ct-note-meta">
            <span class="ct-note-author">${n.author || "Family"}</span>
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
    title.innerText = "⭐ Who completed this chore?";
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
    title.innerText = "🔒 Parent Access";
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

    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"];

    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = `ct-num-key ${key === "Clear" || key === "⌫" ? "action-key" : ""}`;
      btn.innerText = key;

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        self.pinError = "";
        if (key === "Clear") {
          self.pinInput = "";
        } else if (key === "⌫") {
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
    title.innerText = "👑 Parent Administration Console";
    header.appendChild(title);

    // Lock button
    const lockBtn = document.createElement("button");
    lockBtn.className = "ct-btn-close-modal";
    lockBtn.innerText = "🔒 Lock & Exit";
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
      { id: "approvals", label: "Task Approvals" },
      { id: "create_task", label: "Create Chore" },
      { id: "payout_engine", label: "Payout & Audit" },
      { id: "history", label: "Payout Log" }
    ];

    tabDefinitions.forEach((tab) => {
      const tBtn = document.createElement("button");
      tBtn.className = `ct-tab-btn ${self.parentActiveTab === tab.id ? "active" : ""}`;
      tBtn.innerText = tab.label;
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
    } else if (this.parentActiveTab === "create_task") {
      body.appendChild(this.buildCreateTaskTab());
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
      empty.innerHTML = `
        <p style="font-size: 26px; margin: 0 0 6px 0;">✨</p>
        <p>No monetized chores waiting for approval right now!</p>
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

      topRow.innerHTML = `
        <div>
          <h4 style="margin:0 0 4px 0; font-size:17px; color:#fff;">${task.title}</h4>
          <span style="font-size:13px; color:#94a3b8;">Completed by: <strong style="color:#38bdf8;">${assignedChild ? assignedChild.name : "Unassigned"}</strong></span>
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
        noteBox.innerHTML = `<strong>${lastNote.author}:</strong> "${lastNote.text}"`;
        item.appendChild(noteBox);
      }

      // Actions row
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";

      const approveBtn = document.createElement("button");
      approveBtn.className = "ct-btn-success";
      approveBtn.style.flex = "1";
      approveBtn.innerText = `✓ Approve & Queue for Payout (${self.config.currencySymbol}${(parseFloat(task.reward_amount) || 0).toFixed(2)})`;
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
      revisionBtn.innerText = "↩ Needs Revision";
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
   * Chore Creation Form Tab
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
    titleInput.placeholder = "e.g., Wash dishes, Walk the dog...";
    titleInput.value = this.newTaskDraft.title;
    titleInput.addEventListener("input", function (e) {
      self.newTaskDraft.title = e.target.value;
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
    routineBtn.className = `ct-btn-secondary ${this.newTaskDraft.category === "routine" ? "ct-btn-primary" : ""}`;
    routineBtn.style.flex = "1";
    routineBtn.innerText = "Routine Expectation ($0.00)";
    routineBtn.addEventListener("click", function () {
      self.newTaskDraft.category = "routine";
      self.updateDom(50);
    });

    const monetizedBtn = document.createElement("button");
    monetizedBtn.className = `ct-btn-secondary ${this.newTaskDraft.category === "monetized" ? "ct-btn-primary" : ""}`;
    monetizedBtn.style.flex = "1";
    monetizedBtn.innerText = "Monetized Bounty ($)";
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
      rewardGroup.appendChild(rewardInput);
      form.appendChild(rewardGroup);
    } else {
      // If Routine: Days of Week recurrence chips
      const daysGroup = document.createElement("div");
      daysGroup.className = "ct-form-group";
      daysGroup.innerHTML = `<label class="ct-form-label">Recurring Days of Week</label>`;

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
        chip.className = `ct-day-chip ${isSelected ? "selected" : ""}`;
        chip.innerText = item.label;

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

      daysGroup.appendChild(daysSelector);
      form.appendChild(daysGroup);
    }

    // Assigned To dropdown
    const assignGroup = document.createElement("div");
    assignGroup.className = "ct-form-group";
    assignGroup.innerHTML = `<label class="ct-form-label">Assign Chore To</label>`;

    const assignSelect = document.createElement("select");
    assignSelect.className = "ct-select";

    const optGrabs = document.createElement("option");
    optGrabs.value = "up_for_grabs";
    optGrabs.innerText = "⚡ Up For Grabs (Open Bounty)";
    assignSelect.appendChild(optGrabs);

    this.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.innerText = `👤 ${p.name}`;
      if (self.newTaskDraft.assigned_to === p.id) opt.selected = true;
      assignSelect.appendChild(opt);
    });

    assignSelect.addEventListener("change", function (e) {
      self.newTaskDraft.assigned_to = e.target.value;
    });

    assignGroup.appendChild(assignSelect);
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
    noteGroup.appendChild(noteInput);
    form.appendChild(noteGroup);

    // Save button
    const submitBtn = document.createElement("button");
    submitBtn.className = "ct-btn-primary";
    submitBtn.innerText = "💾 Save & Publish Chore to Mirror";
    submitBtn.addEventListener("click", function () {
      if (!self.newTaskDraft.title.trim()) {
        alert("Please enter a chore title.");
        return;
      }

      self.sendSocketNotification("CREATE_TASK", {
        title: self.newTaskDraft.title,
        category: self.newTaskDraft.category,
        reward_amount: self.newTaskDraft.reward_amount,
        assigned_to: self.newTaskDraft.assigned_to,
        days_of_week: self.newTaskDraft.days_of_week,
        initial_note: self.newTaskDraft.initial_note
      });

      // Reset draft
      self.newTaskDraft = {
        title: "",
        category: "monetized",
        reward_amount: "5.00",
        assigned_to: "up_for_grabs",
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        initial_note: ""
      };

      self.parentActiveTab = "approvals";
      self.updateDom(200);
    });

    form.appendChild(submitBtn);

    return form;
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
    label.innerText = "Select Child:";
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
      <div>
        <div class="ct-payout-amount-label">Verified Total Payout Due</div>
        <div style="font-size:14px; color:#cbd5e1; margin-top:4px;">
          ${approvedTasks.length} Approved ${approvedTasks.length === 1 ? "Chore" : "Chores"} Ready for Payout
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
        row.innerHTML = `
          <span>✓ ${t.title}</span>
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
      payoutBtn.innerText = `💰 Process Payout (${self.config.currencySymbol}${totalDue.toFixed(2)}) & Write Audit Log`;

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
      empty.innerHTML = `<p>No payout audit records found yet.</p>`;
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

      card.innerHTML = `
        <div>
          <div style="font-weight:700; font-size:16px; color:#fff;">
            👤 ${profile ? profile.name : rec.profile_id}
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
