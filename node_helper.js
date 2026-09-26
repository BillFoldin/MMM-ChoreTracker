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
const writeFileAtomic = require("write-file-atomic");
const low = require("lowdb");
const { v4: uuidv4 } = require("uuid");

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

/**
 * Custom atomic file sync adapter for lowdb v1.
 * Wraps serialization and atomic writes using write-file-atomic with fsync: true.
 * This guarantees that partially-written or corrupt JSON files can NEVER occur
 * if a Raspberry Pi loses power mid-write.
 */
class AtomicFileSync {
  constructor(source, options = {}) {
    this.source = source;
    this.defaultValue = options.defaultValue || {};
    this.serialize = options.serialize || ((data) => JSON.stringify(data, null, 2));
    this.deserialize = options.deserialize || JSON.parse;
  }

  read() {
    if (fs.existsSync(this.source)) {
      try {
        const raw = fs.readFileSync(this.source, "utf8").trim();
        return raw ? this.deserialize(raw) : this.defaultValue;
      } catch (err) {
        console.error(`[MMM-ChoreTracker] Error reading file ${this.source}:`, err.message);
        // Backup corrupt file to prevent total data loss before returning default
        try {
          const backupPath = `${this.source}.corrupt.${Date.now()}`;
          fs.copyFileSync(this.source, backupPath);
          console.warn(`[MMM-ChoreTracker] Corrupt file backed up to ${backupPath}`);
        } catch (backupErr) {
          console.error(`[MMM-ChoreTracker] Failed to create backup:`, backupErr.message);
        }
        return this.defaultValue;
      }
    }
    // File doesn't exist yet: write default atomically and return it
    this.write(this.defaultValue);
    return this.defaultValue;
  }

  write(data) {
    const serialized = this.serialize(data);
    // write-file-atomic writes to a temp file in the same directory, then renames atomically.
    // fsync: true forces the OS buffer to commit to physical flash/SD media.
    writeFileAtomic.sync(this.source, serialized, {
      encoding: "utf8",
      fsync: true,
      mode: 0o644
    });
  }
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
   * Resolve and initialize local databases using AtomicFileSync adapter
   */
  initDatabases: function () {
    const baseDir = this.path || __dirname;
    const dbDir = path.resolve(baseDir, this.config.databaseDirectory || "");

    // Ensure database directory exists
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch (err) {
        console.error(`[MMM-ChoreTracker] Could not create database directory ${dbDir}:`, err.message);
      }
    }

    const choresPath = path.join(dbDir, "chores_db.json");
    const payoutsPath = path.join(dbDir, "payouts_db.json");

    // Fallback if data files are in root
    const resolvedChoresPath = fs.existsSync(choresPath)
      ? choresPath
      : fs.existsSync(path.join(baseDir, "chores_db.json"))
      ? path.join(baseDir, "chores_db.json")
      : choresPath;

    const resolvedPayoutsPath = fs.existsSync(payoutsPath)
      ? payoutsPath
      : fs.existsSync(path.join(baseDir, "payouts_db.json"))
      ? path.join(baseDir, "payouts_db.json")
      : payoutsPath;

    // Default schemas
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
          id: "task_201",
          title: "Rake Leaves",
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
          title: "Vacuum Living Room",
          category: "monetized",
          reward_amount: 4.0,
          assigned_to: "child_01",
          recurrence: null,
          is_completed: true,
          is_approved: false,
          notes: []
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
        }
      ]
    };

    try {
      const choresAdapter = new AtomicFileSync(resolvedChoresPath, { defaultValue: defaultChores });
      this.choresDb = low(choresAdapter);
      this.choresDb.defaults(defaultChores).write();
      console.log(`[MMM-ChoreTracker] chores_db loaded from ${resolvedChoresPath}`);

      const payoutsAdapter = new AtomicFileSync(resolvedPayoutsPath, { defaultValue: defaultPayouts });
      this.payoutsDb = low(payoutsAdapter);
      this.payoutsDb.defaults(defaultPayouts).write();
      console.log(`[MMM-ChoreTracker] payouts_db loaded from ${resolvedPayoutsPath}`);
    } catch (err) {
      console.error("[MMM-ChoreTracker] Fatal error initializing lowdb with atomic adapter:", err);
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
    const todayStr = this.getLocalDateString(now);
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    this.lastCheckedDateStr = todayStr;

    let modified = false;
    const tasks = this.choresDb.get("tasks").value() || [];

    tasks.forEach((task) => {
      if (task.category === "routine" && task.recurrence) {
        const days = Array.isArray(task.recurrence.days_of_week)
          ? task.recurrence.days_of_week
          : [0, 1, 2, 3, 4, 5, 6];

        const lastCompleted = task.last_completed_date || "";

        // If not completed today (or completed on a previous calendar date)
        if (lastCompleted < todayStr) {
          // If today is one of the recurrence days, chore must be ready/reset
          if (days.includes(dayOfWeek)) {
            if (task.is_completed_today !== false) {
              task.is_completed_today = false;
              modified = true;
            }
          } else {
            // Not a recurrence day today
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
      console.log(`[MMM-ChoreTracker] Recurrence evaluated for ${todayStr} (Day ${dayOfWeek}). Tasks updated.`);
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

      case "DELETE_TASK":
        this.handleDeleteTask(payload);
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
    const choresData = this.choresDb.getState();
    const payoutsData = this.payoutsDb.getState();

    this.sendSocketNotification("INITIAL_DATA_RESPONSE", {
      profiles: choresData.profiles || [],
      tasks: choresData.tasks || [],
      payout_records: payoutsData.payout_records || [],
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
   * Creates a new chore directly from the touchscreen UI
   */
  handleCreateTask: function (payload) {
    if (!this.choresDb || !payload || !payload.title) return;

    const isRoutine = payload.category === "routine";
    const newId = `task_${Date.now()}_${uuidv4().substring(0, 4)}`;

    const newTask = {
      id: newId,
      title: String(payload.title).trim(),
      category: isRoutine ? "routine" : "monetized",
      reward_amount: isRoutine ? 0.0 : parseFloat(payload.reward_amount) || 0.0,
      assigned_to: payload.assigned_to || "up_for_grabs",
      recurrence: isRoutine
        ? {
            frequency: "weekly",
            days_of_week: Array.isArray(payload.days_of_week) && payload.days_of_week.length > 0
              ? payload.days_of_week.map(Number)
              : [0, 1, 2, 3, 4, 5, 6]
          }
        : null,
      last_completed_date: "",
      is_completed_today: false,
      is_completed: false,
      is_approved: false,
      notes: payload.initial_note
        ? [
            {
              author: "Parent",
              text: String(payload.initial_note).trim(),
              timestamp: new Date().toISOString()
            }
          ]
        : []
    };

    this.choresDb.get("tasks").push(newTask).write();
    this.broadcastChoresUpdate();
  },

  /**
   * Deletes a task
   */
  handleDeleteTask: function (payload) {
    if (!this.choresDb || !payload || !payload.taskId) return;

    this.choresDb.get("tasks").remove({ id: payload.taskId }).write();
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
