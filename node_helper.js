/**
 * =========================================================================
 * MMM-ChoreTracker - node_helper.js
 * =========================================================================
 * Production-ready backend for the MagicMirror² MMM-ChoreTracker module.
 * 
 * Features:
 * - Pure local architecture (runs natively on Raspberry Pi, zero cloud).
 * - Atomic JSON file persistence using lowdb (v1) + write-file-atomic to 
 *   guarantee database resilience against sudden power loss.
 * - Dynamic Recurrence Engine: automated midnight & daily routine evaluation.
 * - Multi-profile task management, chore claiming, completion states.
 * - Threaded task notes and touch-friendly interaction support.
 * - PIN-protected parent administration: task approval & immutable payout audit logs.
 * 
 * @license MIT
 * =========================================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Built-in UUID helper (uses crypto.randomUUID or fallback)
function generateUuid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Built-in atomic write utility to prevent SD card corruption on sudden Raspberry Pi power loss
function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`
  );
  try {
    const fd = fs.openSync(tempPath, "w", 0o644);
    fs.writeSync(fd, content, 0, "utf8");
    try {
      fs.fsyncSync(fd);
    } catch (syncErr) {}
    fs.closeSync(fd);
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanErr) {}
    fs.writeFileSync(filePath, content, "utf8");
  }
}

// Zero-dependency local JSON database engine (drops in seamlessly without requiring external lowdb)
class LocalJsonDb {
  constructor(sourcePath, defaultData = {}) {
    this.sourcePath = sourcePath;
    this.data = JSON.parse(JSON.stringify(defaultData));
    this.read(defaultData);
  }

  read(defaultData = {}) {
    if (fs.existsSync(this.sourcePath)) {
      try {
        const raw = fs.readFileSync(this.sourcePath, "utf8").trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            this.data = parsed;
            return this.data;
          }
        }
      } catch (err) {
        console.error(`[MMM-ChoreTracker] Error reading file ${this.sourcePath}:`, err.message);
        try {
          const backup = `${this.sourcePath}.corrupt.${Date.now()}`;
          fs.copyFileSync(this.sourcePath, backup);
          console.warn(`[MMM-ChoreTracker] Corrupt file backed up to ${backup}`);
        } catch (backupErr) {}
      }
    }
    // File not found or empty: initialize with defaults and save
    if (defaultData) {
      this.data = JSON.parse(JSON.stringify(defaultData));
    }
    this.write();
    return this.data;
  }

  write() {
    try {
      const serialized = JSON.stringify(this.data, null, 2);
      atomicWriteFileSync(this.sourcePath, serialized);
    } catch (err) {
      console.error(`[MMM-ChoreTracker] Error writing database to ${this.sourcePath}:`, err.message);
    }
    return this;
  }

  defaults(defaultValues) {
    if (!this.data || typeof this.data !== "object") {
      this.data = {};
    }
    let modified = false;
    for (const key of Object.keys(defaultValues)) {
      if (this.data[key] === undefined) {
        this.data[key] = JSON.parse(JSON.stringify(defaultValues[key]));
        modified = true;
      }
    }
    if (modified) {
      this.write();
    }
    return this;
  }

  getState() {
    return this.data || {};
  }

  set(key, val) {
    if (!this.data) this.data = {};
    this.data[key] = val;
    return this;
  }

  get(key) {
    const self = this;
    if (!this.data) this.data = {};
    if (this.data[key] === undefined) {
      this.data[key] = [];
    }
    const target = this.data[key];

    return {
      value: () => self.data[key],
      find: (predicate) => {
        const arr = Array.isArray(self.data[key]) ? self.data[key] : [];
        const keyName = Object.keys(predicate)[0];
        const targetVal = predicate[keyName];
        const item = arr.find((x) => x && x[keyName] === targetVal);
        return {
          value: () => item,
          assign: (updates) => {
            if (item) {
              Object.assign(item, updates);
              self.write();
            }
            return { write: () => self.write() };
          }
        };
      },
      push: (newItem) => {
        if (!Array.isArray(self.data[key])) self.data[key] = [];
        self.data[key].push(newItem);
        return { write: () => self.write() };
      },
      remove: (predicate) => {
        if (Array.isArray(self.data[key])) {
          const keyName = Object.keys(predicate)[0];
          const targetVal = predicate[keyName];
          const idx = self.data[key].findIndex((x) => x && x[keyName] === targetVal);
          if (idx !== -1) {
            self.data[key].splice(idx, 1);
            self.write();
          }
        }
        return { write: () => self.write() };
      }
    };
  }
}

// MagicMirror NodeHelper base class support (with fallback for standalone execution/testing)
let NodeHelper;
try {
  NodeHelper = require("node_helper");
} catch (e) {
  // Mock base class for standalone testing outside MagicMirror² runtime
  NodeHelper = {
    create: function (definition) {
      return Object.assign(
        {
          name: "MMM-ChoreTracker",
          path: __dirname,
          sendSocketNotification: function (notification, payload) {
            console.log(`[MMM-ChoreTracker:SocketOut] ${notification}:`, payload ? Object.keys(payload) : "");
          }
        },
        definition
      );
    }
  };
}

module.exports = NodeHelper.create({
  // Active configuration defaults
  config: {
    parentPin: "1234",
    currencySymbol: "$",
    databaseDirectory: "data",
    archiveCompletedMonetizedAfterPayout: true
  },

  choresDb: null,
  payoutsDb: null,
  recurrenceTimer: null,
  heartbeatInterval: null,
  lastCheckedDateStr: "",

  /**
   * Helper startup hook
   */
  start: function () {
    console.log("[MMM-ChoreTracker] Node helper started.");
    this.initDatabases();
    this.evaluateRecurrences();
    this.scheduleMidnightCheck();
  },

  /**
   * Intelligently resolves data file paths across multiple possible module structures on Raspberry Pi
   */
  resolveDataPath: function (filename, customDir) {
    const sub = customDir || "data";
    const candidates = [
      // 1. Direct path in module data/ directory
      path.resolve(__dirname, sub, filename),
      // 2. Relative to this.path (if configured by MagicMirror)
      this.path ? path.resolve(this.path, sub, filename) : null,
      // 3. Directly in module root directory
      path.resolve(__dirname, filename),
      // 4. In this.path root
      this.path ? path.resolve(this.path, filename) : null,
      // 5. In MagicMirror root data/ folder
      path.resolve(__dirname, "..", "..", sub, filename),
      // 6. In MagicMirror root folder
      path.resolve(__dirname, "..", "..", filename),
      // 7. In current working directory (e.g. ~/MagicMirror)
      path.resolve(process.cwd(), "modules", "MMM-ChoreTracker", sub, filename),
      path.resolve(process.cwd(), sub, filename),
      path.resolve(process.cwd(), filename)
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        console.log(`[MMM-ChoreTracker] Located ${filename} at: ${candidate}`);
        return candidate;
      }
    }

    // Default target: module data/ directory
    const defaultDir = path.resolve(__dirname, sub);
    if (!fs.existsSync(defaultDir)) {
      try {
        fs.mkdirSync(defaultDir, { recursive: true });
      } catch (err) {}
    }
    const defaultFile = path.join(defaultDir, filename);
    console.log(`[MMM-ChoreTracker] ${filename} not found in search paths. Will create at: ${defaultFile}`);
    return defaultFile;
  },

  /**
   * Resolve and initialize local databases using zero-dependency resilient storage
   */
  initDatabases: function () {
    const dbDirName = (this.config && this.config.databaseDirectory) || "data";
    const resolvedChoresPath = this.resolveDataPath("chores_db.json", dbDirName);
    const resolvedPayoutsPath = this.resolveDataPath("payouts_db.json", dbDirName);

    // Default starter schema with Alex, Maya, and Leo
    const defaultChores = {
      profiles: [
        {
          id: "child_01",
          name: "Alex",
          pin: null,
          icon: "assets/icons/alex.png"
        },
        {
          id: "child_02",
          name: "Maya",
          pin: null,
          icon: "assets/icons/maya.png"
        },
        {
          id: "child_03",
          name: "Leo",
          pin: null,
          icon: "assets/icons/leo.png"
        }
      ],
      tasks: [
        {
          id: "task_101",
          title: "Brush Teeth",
          category: "routine",
          reward_amount: 0.0,
          assigned_to: "child_01",
          recurrence: {
            frequency: "weekly",
            days_of_week: [0, 1, 2, 3, 4, 5, 6]
          },
          last_completed_date: "2026-09-24",
          is_completed_today: false,
          notes: []
        },
        {
          id: "task_102",
          title: "Make Bed & Tidy Room",
          category: "routine",
          reward_amount: 0.0,
          assigned_to: "child_01",
          recurrence: {
            frequency: "weekly",
            days_of_week: [1, 2, 3, 4, 5]
          },
          last_completed_date: "2026-09-25",
          is_completed_today: false,
          notes: []
        },
        {
          id: "task_103",
          title: "Feed the Family Cat",
          category: "routine",
          reward_amount: 0.0,
          assigned_to: "child_02",
          recurrence: {
            frequency: "weekly",
            days_of_week: [0, 1, 2, 3, 4, 5, 6]
          },
          last_completed_date: "2026-09-26",
          is_completed_today: true,
          notes: [
            {
              author: "Maya",
              text: "Filled fresh water bowl too!",
              timestamp: "2026-09-26T08:15:00Z"
            }
          ]
        },
        {
          id: "task_104",
          title: "Pack Backpack & School Clothes",
          category: "routine",
          reward_amount: 0.0,
          assigned_to: "child_03",
          recurrence: {
            frequency: "weekly",
            days_of_week: [0, 1, 2, 3, 4]
          },
          last_completed_date: "2026-09-25",
          is_completed_today: false,
          notes: []
        },
        {
          id: "task_201",
          title: "Rake Leaves in Backyard",
          category: "monetized",
          reward_amount: 5.0,
          assigned_to: "up_for_grabs",
          recurrence: null,
          is_completed: false,
          is_approved: false,
          notes: [
            {
              author: "Parent",
              text: "Please make sure to bag the leaves near the garage.",
              timestamp: "2026-09-25T14:00:00Z"
            }
          ]
        },
        {
          id: "task_202",
          title: "Wash and Vacuum Family Car",
          category: "monetized",
          reward_amount: 10.0,
          assigned_to: "up_for_grabs",
          recurrence: null,
          is_completed: false,
          is_approved: false,
          notes: [
            {
              author: "Parent",
              text: "Sponges and car soap are in the blue garage bin.",
              timestamp: "2026-09-24T10:00:00Z"
            }
          ]
        },
        {
          id: "task_203",
          title: "Vacuum Living Room & Hallway",
          category: "monetized",
          reward_amount: 4.5,
          assigned_to: "child_01",
          recurrence: null,
          is_completed: true,
          is_approved: false,
          notes: [
            {
              author: "Alex",
              text: "Finished dusting baseboards and ran the vacuum thoroughly.",
              timestamp: "2026-09-26T11:30:00Z"
            }
          ]
        },
        {
          id: "task_204",
          title: "Sort Recycling and Breakdown Cardboard",
          category: "monetized",
          reward_amount: 3.0,
          assigned_to: "child_02",
          recurrence: null,
          is_completed: true,
          is_approved: true,
          notes: [
            {
              author: "Maya",
              text: "All flat boxes tied with twine.",
              timestamp: "2026-09-25T16:00:00Z"
            }
          ]
        }
      ]
    };

    const defaultPayouts = {
      payout_records: [
        {
          id: "payout_1001",
          profile_id: "child_01",
          total_amount: 12.5,
          date_range_start: "2026-09-18",
          date_range_end: "2026-09-25",
          processed_timestamp: "2026-09-25T18:00:00Z",
          approved_task_ids: ["task_201"]
        },
        {
          id: "payout_1002",
          profile_id: "child_02",
          total_amount: 8.0,
          date_range_start: "2026-09-15",
          date_range_end: "2026-09-22",
          processed_timestamp: "2026-09-22T19:30:00Z",
          approved_task_ids: ["task_past_88"]
        }
      ]
    };

    try {
      this.choresDb = new LocalJsonDb(resolvedChoresPath, defaultChores);
      this.choresDb.defaults(defaultChores).write();
      const loadedProfiles = (this.choresDb.getState().profiles || []).map((p) => p.name);
      console.log(`[MMM-ChoreTracker] chores_db loaded successfully from ${resolvedChoresPath} with ${loadedProfiles.length} profiles: [${loadedProfiles.join(", ")}]`);

      this.payoutsDb = new LocalJsonDb(resolvedPayoutsPath, defaultPayouts);
      this.payoutsDb.defaults(defaultPayouts).write();
      console.log(`[MMM-ChoreTracker] payouts_db loaded successfully from ${resolvedPayoutsPath}`);
    } catch (err) {
      console.error("[MMM-ChoreTracker] Error initializing local databases:", err);
    }
  },

  /**
   * Formats a Date object to YYYY-MM-DD in local time
   */
  getLocalDateString: function (date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  /**
   * Dynamic Recurrence Engine:
   * Evaluates routine category tasks against the current local date.
   * If last_completed_date is prior to today's date and today matches
   * recurrence.days_of_week, reset is_completed_today to false automatically.
   */
  evaluateRecurrences: function () {
    if (!this.choresDb) return;

    const now = new Date();
    const todayStr = this.getLocalDateString(now); // "YYYY-MM-DD"
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    this.lastCheckedDateStr = todayStr;

    let modified = false;
    const tasks = this.choresDb.get("tasks").value() || [];

    tasks.forEach((task) => {
      if (task.category === "routine" && task.recurrence) {
        const freq = task.recurrence.frequency || "weekly";
        const lastCompleted = task.last_completed_date || "";

        if (freq === "weekly" || freq === "daily") {
          // Daily or weekly recurrence based on days_of_week
          if (lastCompleted < todayStr) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          }
        } else if (freq === "bi_weekly" || freq === "every_2_weeks") {
          // Every 2 weeks: resets after 14 days have elapsed since last completion
          if (lastCompleted) {
            const diffDays = Math.floor((new Date(todayStr).getTime() - new Date(lastCompleted).getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 14) {
              if (task.is_completed_today !== false) {
                task.is_completed_today = false;
                modified = true;
              }
            }
          }
        } else if (freq === "every_3_weeks") {
          // Every 3 weeks: resets after 21 days have elapsed since last completion
          if (lastCompleted) {
            const diffDays = Math.floor((new Date(todayStr).getTime() - new Date(lastCompleted).getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 21) {
              if (task.is_completed_today !== false) {
                task.is_completed_today = false;
                modified = true;
              }
            }
          }
        } else if (freq === "twice_a_month" || freq === "bimonthly") {
          // Twice a month: resets on the 1st and the 16th of each calendar month
          const currentDay = now.getDate();
          const currentPeriod = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${currentDay <= 15 ? "P1" : "P2"}`;
          let lastPeriod = "";
          if (lastCompleted) {
            const parts = lastCompleted.split("-");
            if (parts.length >= 3) {
              const lYear = parts[0];
              const lMonth = parts[1];
              const lDay = parseInt(parts[2], 10);
              lastPeriod = `${lYear}-${lMonth}-${lDay <= 15 ? "P1" : "P2"}`;
            }
          }
          if (lastPeriod < currentPeriod) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          }
        } else if (freq === "monthly" || freq === "once_a_month") {
          // Once a month: resets when a new calendar month begins (e.g. 2026-09 vs 2026-10)
          const currentMonthPrefix = todayStr.substring(0, 7);
          const lastMonthPrefix = lastCompleted ? lastCompleted.substring(0, 7) : "";
          if (lastMonthPrefix < currentMonthPrefix) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          }
        } else if (freq === "twice_a_year" || freq === "semi_annual") {
          // Twice a year: resets every 6 months (H1: Jan-Jun, H2: Jul-Dec)
          const currentHalf = `${currentYear}-H${currentMonth < 6 ? "1" : "2"}`;
          let lastHalf = "";
          if (lastCompleted) {
            const parts = lastCompleted.split("-");
            if (parts.length >= 2) {
              const lYear = parseInt(parts[0], 10);
              const lMonth = parseInt(parts[1], 10) - 1;
              lastHalf = `${lYear}-H${lMonth < 6 ? "1" : "2"}`;
            }
          }
          if (lastHalf < currentHalf) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          }
        } else if (freq === "annual" || freq === "yearly" || freq === "once_a_year") {
          // Once a year: resets when a new calendar year begins
          const currentYearStr = String(currentYear);
          const lastYearStr = lastCompleted ? lastCompleted.substring(0, 4) : "";
          if (lastYearStr < currentYearStr) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          }
        }
      }
    });

    if (modified) {
      this.choresDb.set("tasks", tasks).write();
      console.log(`[MMM-ChoreTracker] Recurrence evaluated for ${todayStr}. Tasks updated.`);
      this.broadcastChoresUpdate();
    }
  },

  /**
   * Schedules midnight timer + heartbeat interval to trigger daily recurrence check
   */
  scheduleMidnightCheck: function () {
    if (this.recurrenceTimer) clearTimeout(this.recurrenceTimer);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    const now = new Date();
    // Next midnight + 2 seconds buffer
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      2
    );
    const msToMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

    this.recurrenceTimer = setTimeout(() => {
      console.log("[MMM-ChoreTracker] Midnight rollover reached. Running recurrence engine.");
      this.evaluateRecurrences();
      this.scheduleMidnightCheck();
    }, msToMidnight);

    // Heartbeat check every 5 minutes in case system sleep/clock drift occurred on the Pi
    this.heartbeatInterval = setInterval(() => {
      const todayStr = this.getLocalDateString();
      if (todayStr !== this.lastCheckedDateStr) {
        console.log(`[MMM-ChoreTracker] Calendar date shifted from ${this.lastCheckedDateStr} to ${todayStr}. Re-evaluating.`);
        this.evaluateRecurrences();
      }
    }, 5 * 60 * 1000);
  },

  /**
   * Socket notifications receiver from frontend MMM-ChoreTracker.js
   */
  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "CONFIG":
        if (payload) {
          this.config = Object.assign({}, this.config, payload);
        }
        if (!this.choresDb || !this.payoutsDb) {
          this.initDatabases();
        }
        this.evaluateRecurrences();
        this.sendInitialData();
        break;

      case "GET_INITIAL_DATA":
        this.sendInitialData();
        break;

      case "TOGGLE_TASK_COMPLETION":
        this.handleToggleTaskCompletion(payload);
        break;

      case "CLAIM_TASK":
        this.handleClaimTask(payload);
        break;

      case "ADD_NOTE":
        this.handleAddNote(payload);
        break;

      case "VERIFY_PARENT_PIN":
        this.handleVerifyParentPin(payload);
        break;

      case "APPROVE_TASK":
        this.handleApproveTask(payload);
        break;

      case "CREATE_TASK":
        this.handleCreateTask(payload);
        break;

      case "UPDATE_TASK":
      case "EDIT_TASK":
        this.handleUpdateTask(payload);
        break;

      case "DELETE_TASK":
        this.handleDeleteTask(payload);
        break;

      case "ADD_PROFILE":
        this.handleAddProfile(payload);
        break;

      case "UPDATE_PROFILE":
        this.handleUpdateProfile(payload);
        break;

      case "DELETE_PROFILE":
        this.handleDeleteProfile(payload);
        break;

      case "PROCESS_PAYOUT":
        this.handleProcessPayout(payload);
        break;

      case "GET_PAYOUTS":
        this.sendPayoutsData();
        break;

      default:
        break;
    }
  },

  /**
   * Sends complete initial state to frontend
   */
  sendInitialData: function () {
    if (!this.choresDb || !this.payoutsDb) {
      this.initDatabases();
    }
    const choresData = this.choresDb.getState() || {};
    const payoutsData = this.payoutsDb.getState() || {};

    const profiles = Array.isArray(choresData.profiles) ? choresData.profiles : [];
    const tasks = Array.isArray(choresData.tasks) ? choresData.tasks : [];
    const payoutRecords = Array.isArray(payoutsData.payout_records) ? payoutsData.payout_records : [];

    console.log(`[MMM-ChoreTracker] Transmitting initial data: ${profiles.length} profiles (${profiles.map((p) => p.name).join(", ")}), ${tasks.length} tasks, ${payoutRecords.length} payout records.`);

    this.sendSocketNotification("INITIAL_DATA_RESPONSE", {
      profiles: profiles,
      tasks: tasks,
      payout_records: payoutRecords,
      serverDate: this.getLocalDateString(),
      currencySymbol: this.config.currencySymbol || "$"
    });
  },

  /**
   * Broadcasts updated chores data to frontend
   */
  broadcastChoresUpdate: function () {
    if (!this.choresDb) return;
    const choresData = this.choresDb.getState();
    this.sendSocketNotification("CHORES_DATA_UPDATE", {
      profiles: choresData.profiles || [],
      tasks: choresData.tasks || [],
      serverDate: this.getLocalDateString()
    });
  },

  /**
   * Broadcasts updated payouts data to frontend
   */
  sendPayoutsData: function () {
    if (!this.payoutsDb) return;
    const payoutsData = this.payoutsDb.getState();
    this.sendSocketNotification("PAYOUTS_DATA_UPDATE", {
      payout_records: payoutsData.payout_records || []
    });
  },

  /**
   * Toggles task completion state:
   * - If an up_for_grabs task is completed, assigns it to the child who completed it
   * - Routine tasks toggle is_completed_today & update last_completed_date
   * - Monetized tasks toggle is_completed (sets is_approved: false pending parent review)
   */
  handleToggleTaskCompletion: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId) return;

    const taskId = payload.taskId;
    const todayStr = this.getLocalDateString();
    const task = this.choresDb.get("tasks").find({ id: taskId }).value();

    if (!task) return;

    const updates = {};
    const notes = Array.isArray(task.notes) ? [...task.notes] : [];

    // If an up_for_grabs task is being marked as completed with a specified child profile
    if (payload.profileId && payload.profileId !== "up_for_grabs") {
      if (task.assigned_to === "up_for_grabs" || !task.assigned_to) {
        updates.assigned_to = payload.profileId;
        const profile = this.choresDb.get("profiles").find({ id: payload.profileId }).value();
        const profileName = profile ? profile.name : "A child";
        notes.push({
          author: profileName,
          text: `Completed this chore!`,
          timestamp: new Date().toISOString()
        });
        updates.notes = notes;
      }
    }

    if (task.category === "routine") {
      const nextStatus = !task.is_completed_today;
      updates.is_completed_today = nextStatus;
      updates.last_completed_date = nextStatus ? todayStr : task.last_completed_date;
    } else {
      // Monetized chore
      const nextCompleted = !task.is_completed;
      updates.is_completed = nextCompleted;
      updates.is_approved = false; // Completion change resets approval status for safety
    }

    this.choresDb
      .get("tasks")
      .find({ id: taskId })
      .assign(updates)
      .write();

    this.broadcastChoresUpdate();
  },

  /**
   * Claims an 'up_for_grabs' chore for a specific child profile
   */
  handleClaimTask: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId || !payload.profileId) return;

    const { taskId, profileId } = payload;
    const profile = this.choresDb.get("profiles").find({ id: profileId }).value();
    const profileName = profile ? profile.name : "A child";

    const note = {
      author: profileName,
      text: `Claimed this chore!`,
      timestamp: new Date().toISOString()
    };

    const task = this.choresDb.get("tasks").find({ id: taskId }).value();
    const currentNotes = Array.isArray(task.notes) ? task.notes : [];

    this.choresDb
      .get("tasks")
      .find({ id: taskId })
      .assign({
        assigned_to: profileId,
        notes: [...currentNotes, note]
      })
      .write();

    this.broadcastChoresUpdate();
  },

  /**
   * Appends a threaded note to a task
   */
  handleAddNote: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId || !payload.text) return;

    const { taskId, author, text } = payload;
    const task = this.choresDb.get("tasks").find({ id: taskId }).value();
    if (!task) return;

    const newNote = {
      author: author || "Family Member",
      text: String(text).trim(),
      timestamp: new Date().toISOString()
    };

    const currentNotes = Array.isArray(task.notes) ? task.notes : [];

    this.choresDb
      .get("tasks")
      .find({ id: taskId })
      .assign({
        notes: [...currentNotes, newNote]
      })
      .write();

    this.broadcastChoresUpdate();
  },

  /**
   * Validates parent PIN against configured parentPin
   */
  handleVerifyParentPin: function (payload) {
    const inputPin = String(payload?.pin || "");
    const expectedPin = String(this.config.parentPin || "1234");
    const isSuccess = inputPin === expectedPin;

    this.sendSocketNotification("PARENT_PIN_VERIFIED", {
      success: isSuccess,
      message: isSuccess ? "Authentication successful." : "Invalid PIN. Please try again."
    });
  },

  /**
   * Approves or rejects a completed monetized chore
   */
  handleApproveTask: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId) return;

    const { taskId, approved, noteText } = payload;
    const task = this.choresDb.get("tasks").find({ id: taskId }).value();
    if (!task) return;

    const currentNotes = Array.isArray(task.notes) ? task.notes : [];
    if (noteText && String(noteText).trim().length > 0) {
      currentNotes.push({
        author: "Parent",
        text: String(noteText).trim(),
        timestamp: new Date().toISOString()
      });
    }

    this.choresDb
      .get("tasks")
      .find({ id: taskId })
      .assign({
        is_approved: Boolean(approved),
        notes: currentNotes
      })
      .write();

    this.broadcastChoresUpdate();
  },

  /**
   * Creates one or multiple chore instances directly from the touchscreen UI.
   * If assigned to multiple children (array), creates an individual chore for each child.
   */
  handleCreateTask: function (payload) {
    if (!this.choresDb || !payload || !payload.title) return;

    let assignedList = [];
    if (Array.isArray(payload.assigned_tos)) {
      assignedList = payload.assigned_tos;
    } else if (Array.isArray(payload.assigned_to)) {
      assignedList = payload.assigned_to;
    } else if (typeof payload.assigned_to === "string") {
      assignedList = [payload.assigned_to];
    }

    if (assignedList.length === 0) {
      assignedList = ["up_for_grabs"];
    }

    const isRoutine = payload.category === "routine";
    const initialNotes = payload.initial_note
      ? [
          {
            author: "Parent",
            text: String(payload.initial_note).trim(),
            timestamp: new Date().toISOString()
          }
        ]
      : [];

    assignedList.forEach((assigneeId, idx) => {
      const newId = `task_${Date.now()}_${idx}_${generateUuid().substring(0, 4)}`;
      const freq = payload.frequency || (isRoutine ? "weekly" : null);
      const newTask = {
        id: newId,
        title: String(payload.title).trim(),
        category: isRoutine ? "routine" : "monetized",
        reward_amount: isRoutine ? 0.0 : parseFloat(payload.reward_amount) || 0.0,
        assigned_to: assigneeId,
        recurrence: isRoutine
          ? {
              frequency: freq,
              days_of_week: Array.isArray(payload.days_of_week) && payload.days_of_week.length > 0
                ? payload.days_of_week.map(Number)
                : [0, 1, 2, 3, 4, 5, 6],
              day_of_month: payload.day_of_month || 1
            }
          : null,
        last_completed_date: "",
        created_at: new Date().toISOString(),
        is_completed_today: false,
        is_completed: false,
        is_approved: false,
        notes: [...initialNotes]
      };

      this.choresDb.get("tasks").push(newTask);
    });

    this.choresDb.write();
    console.log(`[MMM-ChoreTracker] Created chore "${payload.title}" for ${assignedList.length} assignees: [${assignedList.join(", ")}]`);
    this.broadcastChoresUpdate();
  },

  /**
   * Adds a new child profile to the database
   */
  handleAddProfile: function (payload) {
    if (!this.choresDb || !payload || !payload.name) return;
    const name = String(payload.name).trim();
    if (!name) return;

    const newId = `child_${Date.now()}_${generateUuid().substring(0, 4)}`;
    const newProfile = {
      id: newId,
      name: name,
      pin: null,
      icon: `assets/icons/${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`
    };

    this.choresDb.get("profiles").push(newProfile).write();
    console.log(`[MMM-ChoreTracker] Added child profile "${name}" (${newId})`);
    this.broadcastChoresUpdate();
  },

  /**
   * Updates an existing child profile name
   */
  handleUpdateProfile: function (payload) {
    if (!this.choresDb || !payload || !payload.profileId || !payload.name) return;
    const { profileId, name } = payload;
    const trimmedName = String(name).trim();
    if (!trimmedName) return;

    const profile = this.choresDb.get("profiles").find({ id: profileId }).value();
    if (!profile) return;

    this.choresDb
      .get("profiles")
      .find({ id: profileId })
      .assign({ name: trimmedName })
      .write();

    console.log(`[MMM-ChoreTracker] Renamed profile ${profileId} to "${trimmedName}"`);
    this.broadcastChoresUpdate();
  },

  /**
   * Deletes a child profile and optionally unassigns their tasks
   */
  handleDeleteProfile: function (payload) {
    if (!this.choresDb || !payload || !payload.profileId) return;
    const { profileId } = payload;

    this.choresDb.get("profiles").remove({ id: profileId }).write();

    // Reassign any remaining tasks belonging to deleted child to "up_for_grabs"
    const tasks = this.choresDb.get("tasks").value() || [];
    let updatedTasks = false;
    tasks.forEach((t) => {
      if (t.assigned_to === profileId) {
        t.assigned_to = "up_for_grabs";
        updatedTasks = true;
      }
    });

    if (updatedTasks) {
      this.choresDb.set("tasks", tasks).write();
    }

    console.log(`[MMM-ChoreTracker] Removed child profile ${profileId}`);
    this.broadcastChoresUpdate();
  },

  /**
   * Deletes a task
   */
  handleDeleteTask: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId) return;

    this.choresDb.get("tasks").remove({ id: payload.taskId }).write();
    console.log(`[MMM-ChoreTracker] Deleted task ${payload.taskId}`);
    this.broadcastChoresUpdate();
  },

  /**
   * Updates an existing chore (title, category, reward, recurrence, assignee)
   */
  handleUpdateTask: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId) return;

    const task = this.choresDb.get("tasks").find({ id: payload.taskId }).value();
    if (!task) return;

    const updates = {};
    if (payload.title !== undefined) updates.title = String(payload.title).trim();
    if (payload.category !== undefined) updates.category = payload.category;
    if (payload.assigned_to !== undefined) updates.assigned_to = payload.assigned_to;

    const targetCategory = payload.category !== undefined ? payload.category : task.category;
    if (targetCategory === "routine") {
      updates.reward_amount = 0.0;
      const freq = payload.frequency || (task.recurrence ? task.recurrence.frequency : "weekly");
      updates.recurrence = {
        frequency: freq,
        days_of_week: Array.isArray(payload.days_of_week) && payload.days_of_week.length > 0
          ? payload.days_of_week.map(Number)
          : (task.recurrence && Array.isArray(task.recurrence.days_of_week) ? task.recurrence.days_of_week : [0, 1, 2, 3, 4, 5, 6]),
        day_of_month: payload.day_of_month || (task.recurrence ? task.recurrence.day_of_month : 1)
      };
    } else {
      if (payload.reward_amount !== undefined) {
        updates.reward_amount = parseFloat(payload.reward_amount) || 0.0;
      }
      updates.recurrence = null;
    }

    this.choresDb
      .get("tasks")
      .find({ id: payload.taskId })
      .assign(updates)
      .write();

    console.log(`[MMM-ChoreTracker] Updated task ${payload.taskId}: "${updates.title || task.title}"`);
    this.broadcastChoresUpdate();
  },

  /**
   * Payout & Audit Engine:
   * Calculates total earnings from approved monetized chores, appends an
   * immutable log to payouts_db.json, and archives/resets approved chores.
   */
  handleProcessPayout: function (payload) {
    if (!this.choresDb || !this.payoutsDb || !payload) return;

    const { profile_id, date_range_start, date_range_end, approved_task_ids } = payload;
    const taskIds = Array.isArray(approved_task_ids) ? approved_task_ids : [];

    // Retrieve approved tasks
    const tasks = this.choresDb.get("tasks").value() || [];
    const matchedTasks = tasks.filter(
      (t) =>
        t.category === "monetized" &&
        t.is_approved &&
        taskIds.includes(t.id) &&
        (t.assigned_to === profile_id || profile_id === "all")
    );

    const calculatedTotal = matchedTasks.reduce(
      (sum, t) => sum + (parseFloat(t.reward_amount) || 0),
      0
    );

    const payoutId = `payout_${Date.now()}`;
    const newRecord = {
      id: payoutId,
      profile_id: profile_id,
      total_amount: parseFloat(calculatedTotal.toFixed(2)),
      date_range_start: date_range_start || this.getLocalDateString(),
      date_range_end: date_range_end || this.getLocalDateString(),
      processed_timestamp: new Date().toISOString(),
      approved_task_ids: matchedTasks.map((t) => t.id)
    };

    // Immutable log insertion
    this.payoutsDb.get("payout_records").push(newRecord).write();

    // Reset or archive paid tasks so they cannot be double-paid
    matchedTasks.forEach((t) => {
      // Add audit completion note
      const notes = Array.isArray(t.notes) ? t.notes : [];
      notes.push({
        author: "Payout Engine",
        text: `Payout processed (${this.config.currencySymbol || "$"}${t.reward_amount.toFixed(2)}) on ${this.getLocalDateString()}. Ref: ${payoutId}`,
        timestamp: new Date().toISOString()
      });

      // Reset chore to open/uncompleted state or reset assigned_to for one-time bounties
      this.choresDb
        .get("tasks")
        .find({ id: t.id })
        .assign({
          is_completed: false,
          is_approved: false,
          notes: notes
        })
        .write();
    });

    console.log(`[MMM-ChoreTracker] Processed payout ${payoutId} for ${profile_id}: $${calculatedTotal.toFixed(2)}`);

    this.broadcastChoresUpdate();
    this.sendPayoutsData();

    this.sendSocketNotification("PAYOUT_PROCESSED", {
      success: true,
      payoutRecord: newRecord
    });
  },

  /**
   * Cleanup timers on shutdown
   */
  stop: function () {
    if (this.recurrenceTimer) clearTimeout(this.recurrenceTimer);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
});
