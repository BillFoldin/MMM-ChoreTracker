# MMM-ChoreTracker

**MMM-ChoreTracker** is a complete, production-ready, touch-friendly [MagicMirror²](https://magicmirror.builders/) module designed for Raspberry Pi smart mirrors. It tracks family chores, reinforces daily expectations, manages allowance bounties, and provides a PIN-protected parent administration and payout audit system.

---

## 🌟 Key Features

1. **100% Local Execution & Atomic Disk Persistence**:
   - Zero cloud or external database dependencies.
   - Built on `lowdb` (v1.0.0) with a custom **atomic file write adapter** powered by `write-file-atomic` with explicit `fsync: true`. Prevents JSON file corruption on sudden Raspberry Pi power loss or SD card latency.

2. **Dynamic Recurrence Engine**:
   - Automated routine chore evaluations at midnight.
   - Routines automatically reset `is_completed_today: false` based on configured `days_of_week`.
   - Built-in 5-minute heartbeat to handle Raspberry Pi clock drifts or sleep cycles.

3. **Kids Dashboard Main View & Modal Navigation**:
   - The main mirror screen cleanly displays compact, sleek cards for each child (e.g. Alex, Maya, Leo) and an "Up For Grabs" open bounty card with their avatar and daily completion progress.
   - Touching any child's name, task, or function opens a dedicated full-screen modal that takes over the entire screen for a seamless, edge-to-edge touchscreen experience with clear navigation and close buttons.
   - **Up For Grabs Attribution Prompt ("Who Did It?")**: Whenever an open bounty or up-for-grabs chore is marked completed, a full-screen modal prompts for the child who did the work, ensuring the reward and completion credit are accurately attributed to them for parental audit and payout.
   - Touching the back (←) or close (✕) button returns directly to the minimalist kids dashboard.

4. **Clear Visual Distinction & Badging**:
   - **Routine Expectations**: Non-monetary standard family duties ($0.00) with scheduled recurring days.
   - **Monetized Bounties**: High-contrast reward amounts (`$X.XX Bounty`) with completion and parent approval states.

5. **Threaded Chore Notes**:
   - Full modal with real-time threaded notes and instructions between parents and children.
   - Touchscreen quick-comment chips for instant touch communication without tedious keyboard typing.

6. **PIN-Protected Parent Administration Dashboard**:
   - 4-digit touchscreen numeric keypad with dot masks and feedback.
   - **Task Approvals**: Review completed monetized chores and queue them for payout.
   - **Chore Creator**: Add new routine or monetized chores directly from the mirror screen.
   - **Payout & Audit Engine**: Calculates earnings, generates immutable logs in `payouts_db.json`, and archives/resets paid chores to prevent double payouts.
   - **Payout History Log**: Full historical ledger of all past allowances paid out.

---

## 📦 File Structure

```text
modules/MMM-ChoreTracker/
├── MMM-ChoreTracker.js       # Frontend module lifecycle, DOM renderers, and touch dialogs
├── MMM-ChoreTracker.css      # Dark-mode high-contrast touchscreen styles (deep blacks, large hit zones)
├── node_helper.js            # Node.js backend, atomic file adapter, recurrence engine, and lowdb logic
├── package.json              # Module manifest and dependencies
├── data/
│   ├── chores_db.json        # Profiles, routines, monetized tasks, and threaded notes
│   └── payouts_db.json       # Immutable payout history and audit records
└── README.md                 # Documentation and config reference
```

---

## 🚀 Installation

1. Navigate to your MagicMirror `modules` directory:
   ```bash
   cd ~/MagicMirror/modules
   git clone https://github.com/your-username/MMM-ChoreTracker.git
   cd MMM-ChoreTracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Add the module configuration to your `~/MagicMirror/config/config.js` file:
   ```javascript
   {
     module: "MMM-ChoreTracker",
     position: "top_center", // or "middle_center", "lower_third", "bottom_left"
     config: {
       title: "Family Chore Tracker",
       currencySymbol: "$",
       parentPin: "1234",          // 4-digit security PIN for parent panel
       pollInterval: 60000,        // Sync interval in milliseconds
       showCompletedTasks: true,
       databaseDirectory: "data"   // Relative to module directory
     }
   }
   ```

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `title` | `String` | `"Family Chore Tracker"` | Header title displayed on the mirror. |
| `currencySymbol` | `String` | `"$"` | Currency prefix (`$`, `€`, `£`, etc.). |
| `parentPin` | `String` | `"1234"` | 4-digit PIN for parent administrative panel access. |
| `pollInterval` | `Number` | `60000` | Safety background refresh interval in ms (1 minute). |
| `showCompletedTasks` | `Boolean`| `true` | Show completed chores in strikethrough/dimmed state. |
| `databaseDirectory` | `String` | `"data"` | Folder where JSON databases are stored. |

---

## 🛡️ Atomic Write Reliability Guarantee

Raspberry Pis frequently experience power interruptions when unplugged without running `sudo shutdown`. Standard Node.js `fs.writeFileSync` can truncate or zero-out JSON files during mid-write power loss.

**MMM-ChoreTracker** uses `write-file-atomic` with `fsync: true`:
1. Writes new state to a temporary file in the target directory (`chores_db.json.tmp.*`).
2. Issues an `fsync` syscall to force the Linux kernel to flush buffers to the physical SD card / NVMe drive.
3. Atomically renames the temporary file over the target database file using atomic POSIX rename (`fs.rename`).
4. If a syntax error is ever encountered upon startup, an automatic `.corrupt.<timestamp>` snapshot is archived before loading defaults to ensure zero unrecoverable loss.

---

## 📜 License
MIT License. Open source and free for home and family smart mirror projects.
