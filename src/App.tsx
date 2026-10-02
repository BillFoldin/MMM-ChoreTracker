import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  CheckCircle2,
  Lock,
  Unlock,
  DollarSign,
  Calendar,
  Clock,
  MessageSquare,
  Plus,
  ShieldCheck,
  FileCode2,
  Tv,
  BookOpen,
  Copy,
  Check,
  Users,
  AlertTriangle,
  RotateCcw,
  Send,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Info,
  X,
  ArrowLeft,
  ArrowDown,
  Keyboard,
  History,
  ListChecks,
  SlidersHorizontal,
  Edit3,
  User,
  RefreshCw,
  Award,
  Zap,
  Layers,
  PlusCircle,
  UserPlus,
  Sun,
  Delete,
  AlertCircle
} from "lucide-react";

interface Note {
  author: string;
  text: string;
  timestamp: string;
}

interface Recurrence {
  frequency: string;
  days_of_week?: number[];
  day_of_month?: number;
}

function getRecurrenceLabel(recurrence: Recurrence | null): string {
  if (!recurrence) return "Routine";
  const freq = recurrence.frequency || "weekly";
  if (freq === "weekly" || freq === "daily") {
    const days = recurrence.days_of_week || [0, 1, 2, 3, 4, 5, 6];
    if (days.length === 7) return "Daily";
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return "Weekdays";
    if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days.map((d) => dayNames[d]).join(", ");
  }
  if (freq === "bi_weekly" || freq === "every_2_weeks") return "Every 2 Weeks";
  if (freq === "every_3_weeks") return "Every 3 Weeks";
  if (freq === "twice_a_month" || freq === "bimonthly") return "Twice a Month";
  if (freq === "monthly" || freq === "once_a_month") return "Once a Month";
  if (freq === "twice_a_year" || freq === "semi_annual") return "Twice a Year";
  if (freq === "yearly" || freq === "annual") return "Once a Year";
  return freq;
}

interface ChoreScheduleStatus {
  isToday: boolean;
  isOverdue: boolean;
  isUpcoming: boolean;
  isDaily: boolean;
  statusLabel: string;
  dueDetail: string;
}

function getChoreScheduleStatus(task: Task, now: Date = new Date()): ChoreScheduleStatus {
  const currentDayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const tomorrowDayOfWeek = (currentDayOfWeek + 1) % 7;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (task.category === "monetized") {
    const isDone = Boolean(task.is_completed);
    return {
      isToday: !isDone || Boolean(task.is_completed),
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
    // 1. Is it assigned for today?
    if (days.includes(currentDayOfWeek)) {
      return {
        isToday: true,
        isOverdue: false,
        isUpcoming: false,
        isDaily,
        statusLabel: isDaily ? "Daily Routine" : "Due Today",
        dueDetail: isDaily ? "Daily" : `Today (${dayNames[currentDayOfWeek]})`
      };
    }

    // 2. Completed today (e.g. child completed an overdue task earlier today)
    if (task.is_completed_today) {
      return {
        isToday: true,
        isOverdue: false,
        isUpcoming: false,
        isDaily,
        statusLabel: "Completed Today",
        dueDetail: "Completed"
      };
    }

    // 3. For non-daily weekly tasks: check if there is an unfinished past occurrence (Overdue!)
    if (!isDaily) {
      let daysAgo = 0;
      let scheduledDayIndex = -1;
      for (let i = 1; i <= 7; i++) {
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
        const isCompletedForLastSchedule = Boolean(
          task.last_completed_date && task.last_completed_date >= lastScheduledDateStr
        );

        if (!isCompletedForLastSchedule) {
          // Unfinished past task: leave on the list until completed and mark red as overdue!
          const scheduledDayName = dayNames[scheduledDayIndex];
          return {
            isToday: false,
            isOverdue: true,
            isUpcoming: false,
            isDaily: false,
            statusLabel: "Overdue",
            dueDetail: `Overdue (Scheduled for ${scheduledDayName})`
          };
        }
      }
    }

    // 4. Is it upcoming tomorrow (the day before it is scheduled)?
    if (days.includes(tomorrowDayOfWeek)) {
      return {
        isToday: false,
        isOverdue: false,
        isUpcoming: true,
        isDaily,
        statusLabel: "Upcoming Tomorrow",
        dueDetail: `Scheduled for tomorrow (${dayNames[tomorrowDayOfWeek]})`
      };
    }

    // Otherwise, scheduled for another day in the cycle
    return {
      isToday: false,
      isOverdue: false,
      isUpcoming: false,
      isDaily,
      statusLabel: "Scheduled",
      dueDetail: "Scheduled for later"
    };
  }

  // Non-weekly routines (bi_weekly, every_3_weeks, twice_a_month, monthly, twice_a_year, yearly):
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

  const isPastDue = Boolean(task.last_completed_date);
  return {
    isToday: !isPastDue,
    isOverdue: isPastDue,
    isUpcoming: false,
    isDaily: false,
    statusLabel: isPastDue ? "Overdue" : "Due This Period",
    dueDetail: isPastDue ? "Past Due" : getRecurrenceLabel(recurrence)
  };
}

interface Task {
  id: string;
  title: string;
  category: "routine" | "monetized";
  reward_amount: number;
  assigned_to: string; // profile_id or "up_for_grabs"
  recurrence: Recurrence | null;
  last_completed_date: string;
  is_completed_today?: boolean;
  is_completed?: boolean;
  is_approved?: boolean;
  notes: Note[];
}

interface Profile {
  id: string;
  name: string;
  pin: string | null;
  icon: string;
}

interface PayoutRecord {
  id: string;
  profile_id: string;
  total_amount: number;
  date_range_start: string;
  date_range_end: string;
  processed_timestamp: string;
  approved_task_ids: string[];
}

// Dedicated PIN Pad modal component with isolated local state.
// Prevents whole-app re-renders, eradicating screen flashing and input lag completely.
function PinPadModal({
  onSuccess,
  onCancel
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const pinRef = useRef("");

  const handleKey = (k: string) => {
    setError("");
    if (k === "Clear") {
      pinRef.current = "";
      setPin("");
      return;
    }
    if (k === "⌫") {
      pinRef.current = pinRef.current.slice(0, -1);
      setPin(pinRef.current);
      return;
    }
    if (pinRef.current.length < 4) {
      pinRef.current = pinRef.current + k;
      const next = pinRef.current;
      setPin(next);
      if (next.length === 4) {
        if (next === "1234") {
          pinRef.current = "";
          onSuccess();
        } else {
          setError("Incorrect PIN (Default is 1234)");
          pinRef.current = "";
          setPin("");
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        handleKey(e.key);
      } else if (e.key === "Backspace") {
        handleKey("⌫");
      } else if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[92vw] max-w-sm bg-slate-900 border border-white/20 rounded-3xl p-6 sm:p-8 flex flex-col items-center gap-5 shadow-2xl transition-none"
    >
      <div className="w-full flex justify-between items-center border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 font-bold text-lg text-white">
          <Lock className="w-5 h-5 text-sky-400" />
          Parent Access
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 font-bold transition-none cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Enter your 4-digit security PIN to unlock approvals and payouts.
      </p>

      {/* PIN dots - instantaneous with no transition lag */}
      <div className="flex gap-3 my-1">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={`w-5 h-5 rounded-full border-2 transition-none duration-0 ${
              idx < pin.length
                ? "bg-sky-400 border-sky-400"
                : "border-slate-600 bg-transparent"
            }`}
          />
        ))}
      </div>

      {error ? (
        <div className="text-xs text-red-400 font-semibold h-4 text-center">{error}</div>
      ) : (
        <div className="h-4 text-transparent text-xs select-none">ok</div>
      )}

      {/* Keypad with zero click animation for instantaneous response */}
      <div className="grid grid-cols-3 gap-3 w-full touch-manipulation select-none">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleKey(k)}
            style={{ WebkitTapHighlightColor: "transparent" }}
            className={`h-16 rounded-2xl font-bold flex items-center justify-center select-none cursor-pointer touch-manipulation transition-none duration-0 active:scale-100 transform-none ${
              k === "Clear" || k === "⌫"
                ? "bg-white/5 text-slate-300 text-sm gap-1"
                : "bg-white/10 text-white text-2xl"
            }`}
          >
            {k === "Clear" ? (
              <span className="flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </span>
            ) : k === "⌫" ? (
              <Delete className="w-5 h-5 text-rose-300" />
            ) : (
              k
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-xs font-semibold transition-none cursor-pointer"
      >
        Cancel &amp; Return to Dashboard
      </button>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"simulator" | "code" | "docs">("simulator");
  const [selectedFile, setSelectedFile] = useState<string>("MMM-ChoreTracker.js");
  const [copied, setCopied] = useState(false);

  // MagicMirror Module State
  const [profiles, setProfiles] = useState<Profile[]>([
    { id: "child_01", name: "Alex", pin: null, icon: "assets/icons/alex.png" },
    { id: "child_02", name: "Maya", pin: null, icon: "assets/icons/maya.png" },
    { id: "child_03", name: "Leo", pin: null, icon: "assets/icons/leo.png" }
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "task_101",
      title: "Brush Teeth (Morning & Night)",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_01",
      recurrence: { frequency: "weekly", days_of_week: [0, 1, 2, 3, 4, 5, 6] },
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
      recurrence: { frequency: "weekly", days_of_week: [1, 2, 3, 4, 5] },
      last_completed_date: "2026-09-25",
      is_completed_today: false,
      notes: []
    },
    {
      id: "task_105",
      title: "Take Out Recycling & Green Waste",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_01",
      recurrence: { frequency: "weekly", days_of_week: [4] }, // Thursday (yesterday - unfinished, so OVERDUE)
      last_completed_date: "2026-09-17",
      is_completed_today: false,
      notes: []
    },
    {
      id: "task_106",
      title: "Dust Shelves & Organize Desk",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_01",
      recurrence: { frequency: "weekly", days_of_week: [6] }, // Saturday (tomorrow - UPCOMING, not in daily goal)
      last_completed_date: "2026-09-19",
      is_completed_today: false,
      notes: []
    },
    {
      id: "task_103",
      title: "Feed the Family Cat",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_02",
      recurrence: { frequency: "weekly", days_of_week: [0, 1, 2, 3, 4, 5, 6] },
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
      title: "Pack School Bag & Homework",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_03",
      recurrence: { frequency: "weekly", days_of_week: [0, 1, 2, 3, 4] },
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
      last_completed_date: "",
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
      last_completed_date: "",
      is_completed: false,
      is_approved: false,
      notes: []
    },
    {
      id: "task_203",
      title: "Vacuum Living Room & Hallway",
      category: "monetized",
      reward_amount: 4.5,
      assigned_to: "child_01",
      recurrence: null,
      last_completed_date: "",
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
      title: "Sort Recycling & Breakdown Boxes",
      category: "monetized",
      reward_amount: 3.0,
      assigned_to: "child_02",
      recurrence: null,
      last_completed_date: "",
      is_completed: true,
      is_approved: true,
      notes: [
        {
          author: "Maya",
          text: "All flat boxes tied with twine.",
          timestamp: "2026-09-25T16:00:00Z"
        },
        {
          author: "Parent",
          text: "Super neat job Maya! Approved for your payout.",
          timestamp: "2026-09-25T17:30:00Z"
        }
      ]
    }
  ]);

  const [payouts, setPayouts] = useState<PayoutRecord[]>([
    {
      id: "payout_1001",
      profile_id: "child_01",
      total_amount: 12.5,
      date_range_start: "2026-09-18",
      date_range_end: "2026-09-25",
      processed_timestamp: "2026-09-25T18:00:00Z",
      approved_task_ids: ["task_201"]
    }
  ]);

  // Mirror UI State: Kids Dashboard Navigation
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childModalTab, setChildModalTab] = useState<"assigned" | "up_for_grabs">("assigned");
  const [activeModal, setActiveModal] = useState<
    "child_chores" | "task_detail" | "pin_pad" | "parent_panel" | "who_completed" | null
  >(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);
  const [parentActiveTab, setParentActiveTab] = useState<
    "approvals" | "manage_chores" | "children" | "payout_engine" | "history"
  >("manage_chores");
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [manageChoresFilter, setManageChoresFilter] = useState<"all" | "routine" | "monetized">("all");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editingChoreDraft, setEditingChoreDraft] = useState<{
    title: string;
    category: "routine" | "monetized";
    frequency: string;
    days_of_week: number[];
    reward_amount: string;
    assigned_to: string;
  } | null>(null);
  const [payoutProfileId, setPayoutProfileId] = useState("child_01");

  // In-Module Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<"routine" | "monetized">("routine");
  const [newFrequency, setNewFrequency] = useState<string>("weekly");
  const [newReward, setNewReward] = useState("5.00");
  const [newAssignedTos, setNewAssignedTos] = useState<string[]>(["up_for_grabs"]);
  const [newDays, setNewDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [newNote, setNewNote] = useState("");

  // Child management state
  const [newChildName, setNewChildName] = useState("");
  const [editingChildNames, setEditingChildNames] = useState<Record<string, string>>({});
  const [savedNameNoticeId, setSavedNameNoticeId] = useState<string | null>(null);

  // Quick note draft
  const [customNoteText, setCustomNoteText] = useState("");

  // Digital / On-Screen Virtual Keyboard state
  const [virtualKeyboard, setVirtualKeyboard] = useState<{
    isOpen: boolean;
    title: string;
    value: string;
    type: "text" | "number";
    mode: "alpha" | "symbols" | "numbers";
    isShift: boolean;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    value: "",
    type: "text",
    mode: "alpha",
    isShift: false,
    onConfirm: () => {}
  });

  const openVirtualKeyboard = (
    title: string,
    initialVal: string,
    type: "text" | "number" = "text",
    onConfirm: (val: string) => void
  ) => {
    setVirtualKeyboard({
      isOpen: true,
      title,
      value: initialVal || "",
      type,
      mode: type === "number" ? "numbers" : "alpha",
      isShift: false,
      onConfirm
    });
  };

  const closeVirtualKeyboard = () => {
    setVirtualKeyboard((prev) => ({ ...prev, isOpen: false }));
  };

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Layout configuration: Compact mode (no title area) vs Classic mode
  const [showTitleArea, setShowTitleArea] = useState(false);
  const [showCalendarSim, setShowCalendarSim] = useState(true);

  // Setting: Amount of chores per page shown (persisted in localStorage)
  const [choresPerPage, setChoresPerPage] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("ct_chores_per_page");
      if (saved) {
        const val = parseInt(saved, 10);
        if ([2, 4, 6, 8, 10, 12].includes(val)) return val;
      }
    } catch (e) {
      // ignore
    }
    return 4; // default 4 per page
  });

  const [chorePage, setChorePage] = useState<number>(1);

  // Reset page when switching child or tab
  useEffect(() => {
    setChorePage(1);
  }, [selectedChildId, childModalTab]);

  // Summary counts: daily goal across all children (excluding upcoming)
  const dailyGoalTasksAll = tasks.filter((t) => {
    if (t.assigned_to === "up_for_grabs") return false;
    const status = getChoreScheduleStatus(t, currentTime);
    return status.isToday || status.isOverdue;
  });
  const completedCount = dailyGoalTasksAll.filter((t) =>
    t.category === "routine" ? t.is_completed_today : t.is_completed
  ).length;

  const openBountySum = tasks
    .filter((t) => t.category === "monetized" && !t.is_completed)
    .reduce((sum, t) => sum + t.reward_amount, 0);

  // Active child & active task & completing task
  const activeChild = profiles.find((p) => p.id === selectedChildId);
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const completingTask = tasks.find((t) => t.id === completingTaskId);

  // Child's chore tasks list:
  // #2: Show chores only assigned for that day + unfinished non-daily tasks until completed (marked red as overdue)
  // #3: Show upcoming chores the day before scheduled, but do not count them as part of daily goal
  const rawChildTasks = selectedChildId
    ? selectedChildId === "up_for_grabs" || childModalTab === "up_for_grabs"
      ? tasks.filter((t) => t.assigned_to === "up_for_grabs")
      : tasks.filter((t) => t.assigned_to === selectedChildId)
    : [];

  const childTasks = selectedChildId === "up_for_grabs" || childModalTab === "up_for_grabs"
    ? rawChildTasks
    : rawChildTasks.filter((t) => {
        const status = getChoreScheduleStatus(t, currentTime);
        return status.isToday || status.isOverdue || status.isUpcoming;
      });

  // Daily goal tasks for the selected child (excludes upcoming!)
  const childDailyGoalTasks = selectedChildId === "up_for_grabs" || childModalTab === "up_for_grabs"
    ? []
    : childTasks.filter((t) => {
        const status = getChoreScheduleStatus(t, currentTime);
        return !status.isUpcoming;
      });

  const childDailyGoalTotal = childDailyGoalTasks.length;
  const childDailyGoalDone = childDailyGoalTasks.filter((t) =>
    t.category === "routine" ? t.is_completed_today : t.is_completed
  ).length;

  const childOverdueCount = childTasks.filter((t) => {
    const status = getChoreScheduleStatus(t, currentTime);
    const isDone = t.category === "routine" ? Boolean(t.is_completed_today) : Boolean(t.is_completed);
    return status.isOverdue && !isDone;
  }).length;

  const childUpcomingCount = childTasks.filter((t) => {
    const status = getChoreScheduleStatus(t, currentTime);
    return status.isUpcoming;
  }).length;

  // Pagination calculation
  const totalChoreCount = childTasks.length;
  const totalChorePages = Math.max(1, Math.ceil(totalChoreCount / choresPerPage));
  const validChorePage = Math.min(Math.max(1, chorePage), totalChorePages);
  const choreStartIndex = (validChorePage - 1) * choresPerPage;
  const paginatedChildTasks = childTasks.slice(choreStartIndex, choreStartIndex + choresPerPage);

  // Toggle complete initiator - checks if task is up for grabs, and if so asks who completed it!
  const handleInitiateComplete = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isDone = task.category === "routine" ? Boolean(task.is_completed_today) : Boolean(task.is_completed);

    // If up_for_grabs or unassigned and not completed yet, ask who completed it
    if ((task.assigned_to === "up_for_grabs" || !task.assigned_to) && !isDone) {
      setCompletingTaskId(taskId);
      setActiveModal("who_completed");
      return;
    }

    // Otherwise standard toggle
    handleToggleComplete(taskId);
  };

  // Toggle complete handler for assigned or completed tasks
  const handleToggleComplete = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const todayStr = new Date().toISOString().split("T")[0];
        if (t.category === "routine") {
          const next = !t.is_completed_today;
          return {
            ...t,
            is_completed_today: next,
            last_completed_date: next ? todayStr : t.last_completed_date
          };
        } else {
          return {
            ...t,
            is_completed: !t.is_completed,
            is_approved: false
          };
        }
      })
    );
  };

  // Called when a child is selected from "Who completed this?" modal
  const handleCompleteAsChild = (taskId: string, childId: string) => {
    const profile = profiles.find((p) => p.id === childId);
    const childName = profile ? profile.name : "A child";
    const todayStr = new Date().toISOString().split("T")[0];

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const notes = [
          ...t.notes,
          {
            author: childName,
            text: `Completed this up-for-grabs bounty!`,
            timestamp: new Date().toISOString()
          }
        ];
        if (t.category === "routine") {
          return {
            ...t,
            assigned_to: childId,
            is_completed_today: true,
            last_completed_date: todayStr,
            notes
          };
        } else {
          return {
            ...t,
            assigned_to: childId,
            is_completed: true,
            is_approved: false,
            notes
          };
        }
      })
    );

    setCompletingTaskId(null);
    if (selectedChildId) {
      setActiveModal("child_chores");
    } else {
      setActiveModal(null);
    }
  };

  // Claim chore
  const handleClaimChore = (taskId: string) => {
    if (!selectedChildId || selectedChildId === "up_for_grabs") return;
    const profile = profiles.find((p) => p.id === selectedChildId);
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          assigned_to: selectedChildId,
          notes: [
            ...t.notes,
            {
              author: profile?.name || "Child",
              text: `Claimed this chore!`,
              timestamp: new Date().toISOString()
            }
          ]
        };
      })
    );
  };

  // Add note
  const handleAddNote = (taskId: string, text: string) => {
    if (!text.trim()) return;
    const authorName = activeChild ? activeChild.name : "Parent";

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          notes: [
            ...t.notes,
            {
              author: authorName,
              text: text.trim(),
              timestamp: new Date().toISOString()
            }
          ]
        };
      })
    );
    setCustomNoteText("");
  };

  // Approve task
  const handleApprove = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          is_approved: true,
          notes: [
            ...t.notes,
            {
              author: "Parent",
              text: `Approved by Parent on ${new Date().toLocaleDateString()}. Great job!`,
              timestamp: new Date().toISOString()
            }
          ]
        };
      })
    );
  };

  // Request revision
  const handleRequestRevision = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          is_completed: false,
          is_approved: false,
          notes: [
            ...t.notes,
            {
              author: "Parent",
              text: "Needs revision. Please double check your work and re-complete.",
              timestamp: new Date().toISOString()
            }
          ]
        };
      })
    );
  };

  // Create chore (supports assigning to one, multiple, or all children simultaneously!)
  const handleCreateChore = () => {
    if (!newTitle.trim()) return;

    const assignees = newAssignedTos.length > 0 ? newAssignedTos : ["up_for_grabs"];
    const initialNotes = newNote.trim()
      ? [
          {
            author: "Parent",
            text: newNote.trim(),
            timestamp: new Date().toISOString()
          }
        ]
      : [];

    const newTasks: Task[] = assignees.map((assigneeId, idx) => ({
      id: `task_${Date.now()}_${idx}`,
      title: newTitle.trim(),
      category: newCategory,
      reward_amount: newCategory === "routine" ? 0 : parseFloat(newReward) || 0,
      assigned_to: assigneeId,
      recurrence:
        newCategory === "routine"
          ? { frequency: newFrequency, days_of_week: newDays }
          : null,
      last_completed_date: "",
      is_completed_today: false,
      is_completed: false,
      is_approved: false,
      notes: [...initialNotes]
    }));

    setTasks((prev) => [...newTasks, ...prev]);
    setNewTitle("");
    setNewReward("5.00");
    setNewNote("");
    setNewAssignedTos(["up_for_grabs"]);
    setParentActiveTab("manage_chores");
  };

  // Delete a chore from inventory
  const handleDeleteChore = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  // Update an existing chore
  const handleUpdateChore = (draft: {
    id: string;
    title: string;
    category: "routine" | "monetized";
    frequency: string;
    days_of_week: number[];
    reward_amount: number;
    assigned_to: string;
  }) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draft.id) {
          return {
            ...t,
            title: draft.title.trim(),
            category: draft.category,
            reward_amount: draft.category === "monetized" ? draft.reward_amount : 0,
            assigned_to: draft.assigned_to,
            recurrence:
              draft.category === "routine"
                ? { frequency: draft.frequency, days_of_week: draft.days_of_week }
                : null
          };
        }
        return t;
      })
    );
    setEditingTaskId(null);
    setEditingChoreDraft(null);
  };

  // Add a new child profile
  const handleAddChild = () => {
    const trimmed = newChildName.trim();
    if (!trimmed) return;
    const newProfile: Profile = {
      id: `child_${Date.now()}`,
      name: trimmed,
      pin: null,
      icon: `assets/icons/${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`
    };
    setProfiles((prev) => [...prev, newProfile]);
    setNewChildName("");
  };

  // Rename an existing child profile
  const handleRenameChild = (profileId: string) => {
    const updatedName = editingChildNames[profileId]?.trim();
    if (!updatedName) return;

    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, name: updatedName } : p))
    );

    setSavedNameNoticeId(profileId);
    setTimeout(() => {
      setSavedNameNoticeId(null);
    }, 2000);
  };

  // Delete a child profile
  const handleDeleteChild = (profileId: string) => {
    if (profiles.length <= 1) return;
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    setTasks((prev) =>
      prev.map((t) => (t.assigned_to === profileId ? { ...t, assigned_to: "up_for_grabs" } : t))
    );
  };

  // Process payout
  const handleProcessPayout = () => {
    const approved = tasks.filter(
      (t) => t.category === "monetized" && t.is_approved && t.assigned_to === payoutProfileId
    );
    if (approved.length === 0) return;

    const total = approved.reduce((sum, t) => sum + t.reward_amount, 0);
    const newRecord: PayoutRecord = {
      id: `payout_${Date.now()}`,
      profile_id: payoutProfileId,
      total_amount: parseFloat(total.toFixed(2)),
      date_range_start: "2026-09-19",
      date_range_end: "2026-09-26",
      processed_timestamp: new Date().toISOString(),
      approved_task_ids: approved.map((t) => t.id)
    };

    setPayouts((prev) => [newRecord, ...prev]);

    // Reset chores so they are not double-paid
    setTasks((prev) =>
      prev.map((t) => {
        if (approved.some((a) => a.id === t.id)) {
          return {
            ...t,
            is_completed: false,
            is_approved: false,
            notes: [
              ...t.notes,
              {
                author: "Payout Engine",
                text: `Payout of $${t.reward_amount.toFixed(2)} processed (${newRecord.id})!`,
                timestamp: new Date().toISOString()
              }
            ]
          };
        }
        return t;
      })
    );

    setParentActiveTab("history");
  };

  // Simulate Midnight Rollover
  const handleSimulateMidnight = () => {
    const todayDay = new Date().getDay();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.category === "routine" && t.recurrence) {
          const days = t.recurrence.days_of_week || [];
          if (days.includes(todayDay)) {
            return { ...t, is_completed_today: false };
          }
        }
        return t;
      })
    );
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const avatarGradients = [
    "from-blue-500 to-indigo-600",
    "from-purple-500 to-violet-600",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600"
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top App Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-black text-lg">
            MM²
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">MMM-ChoreTracker</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Kids Dashboard Mode
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Only kids' names on main screen • Touch to view individual chore lists
            </p>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "simulator"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Tv className="w-4 h-4" />
            Live Mirror Simulator
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "code"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            Module Code (4 Files)
          </button>
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "docs"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Architecture &amp; Config
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {activeTab === "simulator" && (
          <div className="flex-1 p-4 lg:p-8 flex flex-col items-center justify-start bg-radial from-slate-900 to-slate-950">
            {/* Control Bar for Simulator */}
            <div className="w-full max-w-4xl mb-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Touchscreen Smart Mirror View: <strong>Click any child to open their chores!</strong></span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTitleArea(!showTitleArea)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium border text-xs cursor-pointer ${
                    !showTitleArea
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                  }`}
                  title="Toggle Title Area on/off"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  Title Area: {!showTitleArea ? "Hidden (Compact Mode)" : "Shown (Full Header)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCalendarSim(!showCalendarSim)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium border text-xs cursor-pointer ${
                    showCalendarSim
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                  }`}
                  title="Toggle Simulated Calendar on/off"
                >
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  Calendar Space: {showCalendarSim ? "Visible" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={handleSimulateMidnight}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition font-medium border border-slate-700 cursor-pointer"
                  title="Triggers the midnight routine recurrence engine"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                  Test Midnight
                </button>
              </div>
            </div>

            {/* Smart Mirror Frame */}
            <div className="w-full max-w-4xl bg-black rounded-3xl border-8 border-slate-800 shadow-2xl relative overflow-hidden flex flex-col min-h-[580px]">
              {/* Subtle glass reflection overlay */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.04]"></div>

              {/* Standard MagicMirror Top Bar (Clock & Weather) */}
              <div className="p-5 border-b border-white/5 flex justify-between items-start text-white select-none">
                <div>
                  <div className="text-3xl sm:text-4xl font-extralight tracking-tight font-mono">
                    {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-400 font-medium">
                    {currentTime.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-light flex items-center justify-end gap-1.5">
                    <span>68°F</span>
                    <Sun className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>
                  <div className="text-[11px] text-slate-400">Clear Skies • Living Room Mirror</div>
                </div>
              </div>

              {/* Simulated Smart Mirror Large Calendar Widget */}
              {showCalendarSim && (
                <div className="mx-5 mt-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 select-none">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-[11px] font-bold text-slate-200 tracking-wider uppercase">
                        Family Schedule (Calendar Module)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">September 2026 • 4 Events Today</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-sky-950/40 border border-sky-500/20">
                      <div className="text-[9px] text-sky-400 font-semibold">08:30 AM</div>
                      <div className="font-medium text-white truncate text-[11px]">School Drop-off</div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/20">
                      <div className="text-[9px] text-emerald-400 font-semibold">03:45 PM</div>
                      <div className="font-medium text-white truncate text-[11px]">Soccer Practice (Alex & Maya)</div>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-500/20">
                      <div className="text-[9px] text-purple-400 font-semibold">05:15 PM</div>
                      <div className="font-medium text-white truncate text-[11px]">Piano Lesson (Maya)</div>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/20">
                      <div className="text-[9px] text-amber-400 font-semibold">06:30 PM</div>
                      <div className="font-medium text-white truncate text-[11px]">Family Dinner & Games</div>
                    </div>
                  </div>
                </div>
              )}

              {/* MMM-ChoreTracker Module Container (mounted in mirror) */}
              <div className="flex-1 p-5 relative flex flex-col justify-between">
                <div>
                  {/* Module Header: Compact Mode (No Title Area) vs Classic Mode */}
                  {!showTitleArea ? (
                    <div className="flex items-center justify-end mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isParentUnlocked) {
                            setActiveModal("parent_panel");
                          } else {
                            setActiveModal("pin_pad");
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                          isParentUnlocked
                            ? "bg-purple-500/20 border-purple-500 text-purple-300"
                            : "bg-white/10 border-white/20 text-slate-300 hover:text-white hover:bg-white/20"
                        }`}
                      >
                        {isParentUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        {isParentUnlocked ? "Parent Mode" : "Parent Mode"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/20 text-white">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold tracking-tight text-white">Family Chore Tracker</h2>
                          <p className="text-[11px] text-slate-400">Select a kid below to view or check off chores</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 text-sky-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          {completedCount}/{tasks.length} Done
                        </div>
                        <div className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-semibold">
                          <DollarSign className="w-3 h-3" />
                          ${openBountySum.toFixed(2)} Open
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isParentUnlocked) {
                              setActiveModal("parent_panel");
                            } else {
                              setActiveModal("pin_pad");
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                            isParentUnlocked
                              ? "bg-purple-500/20 border-purple-500 text-purple-300"
                              : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                          }`}
                        >
                          {isParentUnlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {isParentUnlocked ? "Parent Mode" : "Parent Lock"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MAIN SCREEN: KIDS CARDS (NAMES INTEGRATED INTO AVATAR - ULTRA COMPACT) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-3xl mx-auto w-full">
                    {profiles.map((p, idx) => {
                      const childAllTasks = tasks.filter((t) => t.assigned_to === p.id);
                      // Daily goal: only chores assigned for today or overdue from previous days (upcoming excluded!)
                      const childDailyTasks = childAllTasks.filter((t) => {
                        const s = getChoreScheduleStatus(t, currentTime);
                        return s.isToday || s.isOverdue;
                      });
                      const total = childDailyTasks.length;
                      const done = childDailyTasks.filter((t) =>
                        t.category === "routine" ? t.is_completed_today : t.is_completed
                      ).length;
                      const pending = total - done;
                      const pct = total > 0 ? (done / total) * 100 : 0;
                      const grad = avatarGradients[idx % avatarGradients.length];

                      const overdueCount = childDailyTasks.filter((t) => {
                        const s = getChoreScheduleStatus(t, currentTime);
                        const isDone = t.category === "routine" ? Boolean(t.is_completed_today) : Boolean(t.is_completed);
                        return s.isOverdue && !isDone;
                      }).length;

                      const upcomingCount = childAllTasks.filter((t) => {
                        const s = getChoreScheduleStatus(t, currentTime);
                        return s.isUpcoming;
                      }).length;

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedChildId(p.id);
                            setChildModalTab("assigned");
                            setActiveModal("child_chores");
                          }}
                          className={`group cursor-pointer rounded-xl p-2 sm:p-2.5 border transition-all duration-150 flex flex-col items-center text-center shadow-md select-none ${
                            overdueCount > 0
                              ? "border-rose-500/50 bg-rose-950/20 hover:bg-rose-900/30 hover:border-rose-400 hover:-translate-y-0.5"
                              : "border-white/10 bg-slate-900/90 hover:bg-slate-800/90 hover:border-sky-400 hover:-translate-y-0.5"
                          }`}
                        >
                          {/* Avatar Circle with Integrated Child Name */}
                          <div
                            className={`min-w-11 px-2.5 h-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-xs font-black text-white shadow-sm mb-1 group-hover:scale-105 transition-transform`}
                          >
                            {p.name}
                          </div>

                          <div className="text-[10px] text-slate-400 font-medium mb-1 leading-tight w-full">
                            {overdueCount > 0 ? (
                              <span className="text-rose-400 font-bold flex items-center justify-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                <span>{overdueCount} Overdue</span>
                                <span className="text-slate-400 font-normal">• {done}/{total} Goal</span>
                              </span>
                            ) : total === 0 ? (
                              <span>No chores today</span>
                            ) : pending === 0 ? (
                              <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>All {total} Done!</span>
                              </span>
                            ) : (
                              <span>
                                <strong className="text-sky-400">{done}/{total} Done</strong> • <span className="text-amber-400 font-semibold">{pending} Due</span>
                              </span>
                            )}

                            {upcomingCount > 0 && (
                              <span className="text-[9px] text-indigo-300/80 block mt-0.5">
                                +{upcomingCount} upcoming tomorrow
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                overdueCount > 0
                                  ? "bg-gradient-to-r from-rose-500 to-amber-400"
                                  : "bg-gradient-to-r from-sky-400 to-emerald-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Up For Grabs Card */}
                    {(() => {
                      const openGrabs = tasks.filter(
                        (t) => t.assigned_to === "up_for_grabs" && !t.is_completed
                      );
                      const grabsSum = openGrabs.reduce((s, t) => s + t.reward_amount, 0);

                      return (
                        <div
                          onClick={() => {
                            setSelectedChildId("up_for_grabs");
                            setChildModalTab("up_for_grabs");
                            setActiveModal("child_chores");
                          }}
                          className="group cursor-pointer rounded-xl p-2 sm:p-2.5 border border-purple-500/40 bg-purple-950/20 hover:bg-purple-900/30 hover:border-purple-400 hover:-translate-y-0.5 transition-all duration-150 flex flex-col items-center text-center shadow-md select-none"
                        >
                          {/* Avatar Circle with Integrated Name */}
                          <div className="min-w-11 px-2.5 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-xs font-black text-white shadow-sm mb-1 group-hover:scale-105 transition-transform gap-1">
                            <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            <span>Bounties</span>
                          </div>

                          <div className="text-[10px] text-purple-200 font-medium mb-1 leading-tight">
                            {openGrabs.length} Open • <strong className="text-emerald-400 font-bold">${grabsSum.toFixed(2)}</strong>
                          </div>

                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-400 to-emerald-400 rounded-full transition-all"
                              style={{ width: openGrabs.length > 0 ? "100%" : "0%" }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-3 text-center text-[11px] text-slate-500">
                  Touch any profile above to inspect assigned chores, claim rewards, or post notes.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Code & Files Tab */}
        {activeTab === "code" && (
          <div className="flex-1 p-6 max-w-6xl w-full mx-auto flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-bold text-white">Generated Production Files</h2>
                <p className="text-xs text-slate-400">
                  Ready to copy directly into <code className="text-sky-400">~/MagicMirror/modules/MMM-ChoreTracker/</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy Active File"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "MMM-ChoreTracker.js",
                "node_helper.js",
                "MMM-ChoreTracker.css",
                "package.json",
                "chores_db.json",
                "payouts_db.json"
              ].map((filename) => (
                <button
                  key={filename}
                  onClick={() => setSelectedFile(filename)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition border ${
                    selectedFile === filename
                      ? "bg-slate-800 text-sky-400 border-sky-500/50 shadow-sm"
                      : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  {filename}
                </button>
              ))}
            </div>

            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-xs overflow-auto max-h-[600px] text-slate-300">
              <div className="text-slate-500 text-[11px] mb-2 border-b border-slate-800 pb-2 flex justify-between">
                <span>File: /modules/MMM-ChoreTracker/{selectedFile}</span>
                <span>Language: {selectedFile.endsWith(".js") ? "JavaScript" : selectedFile.endsWith(".css") ? "CSS" : "JSON"}</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed">
                {selectedFile === "MMM-ChoreTracker.js" && `/**
 * MMM-ChoreTracker - MMM-ChoreTracker.js
 * Frontend module displaying Kids Dashboard on the main screen.
 * Ultra-compact mode: omits title area, rendering only Parent Mode button.
 */
Module.register("MMM-ChoreTracker", {
  defaults: {
    title: "Family Chore Tracker",
    showTitleArea: false, // Default: ultra-compact layout for large calendar displays
    showParentButton: true, // Only the Parent Mode button is shown in top bar
    currencySymbol: "$",
    parentPin: "1234",
    pollInterval: 60000,
    showCompletedTasks: true,
    databaseDirectory: "data"
  },

  buildHeader: function () {
    // When showTitleArea is false (default):
    // Only the sleek Parent Mode button is rendered!
    if (!this.config.showTitleArea) {
      const compactBar = document.createElement("div");
      compactBar.className = "ct-compact-bar";
      const parentBtn = document.createElement("button");
      parentBtn.className = "ct-btn-parent compact";
      parentBtn.innerHTML = "<span>🔒</span> Parent Mode";
      compactBar.appendChild(parentBtn);
      return compactBar;
    }
    // Otherwise renders full header if explicitly enabled in config
    ...
  },

  buildKidsDashboard: function () {
    // Generates sleek touch cards for Alex, Maya, Leo & Up For Grabs
    ...
  }
});`}

                {selectedFile === "node_helper.js" && `/**
 * MMM-ChoreTracker - node_helper.js
 * 100% Pure JavaScript (Zero external npm packages)
 * Resilient atomic writes with native fs + crypto
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const NodeHelper = require("node_helper");

class LocalJsonDb { ... }
module.exports = NodeHelper.create({ ... });`}

                {selectedFile === "MMM-ChoreTracker.css" && `/* Ultra-compact styles optimized for smart mirror screens alongside calendars */
.ct-compact-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}
.ct-btn-parent.compact {
  padding: 4px 12px;
  font-size: 11.5px;
  min-height: 28px;
}
.ct-kids-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
  gap: 8px;
}
.ct-kid-card {
  padding: 8px 8px;
  border-radius: 10px;
}`}

                {selectedFile === "package.json" && `{\n  "name": "MMM-ChoreTracker",\n  "version": "1.0.0",\n  "type": "commonjs",\n  "description": "Family chore tracking with zero external dependencies.",\n  "main": "MMM-ChoreTracker.js",\n  "dependencies": {}\n}`}
                {selectedFile === "chores_db.json" && JSON.stringify({ profiles, tasks }, null, 2)}
                {selectedFile === "payouts_db.json" && JSON.stringify({ payout_records: payouts }, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Docs Tab */}
        {activeTab === "docs" && (
          <div className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-6 text-sm text-slate-300">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Kids Dashboard Architecture</h2>
              <p className="text-slate-400">
                How the new main screen view works on MagicMirror²
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-sky-400 font-bold text-base">
                  <Users className="w-5 h-5" />
                  Kids Dashboard Main View
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Instead of cluttering the mirror face with a long list of all family chores, the main screen only shows the kids' names and avatars with completion progress bars.
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                  <CheckCircle2 className="w-5 h-5" />
                  Child Chore Modal
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Touching any kid's card brings up a dedicated full-screen modal showing their specific assigned routines, bounties, and threaded notes, with an easy (✕) close button to return to the clean dashboard.
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 md:col-span-2">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-base">
                  <ShieldCheck className="w-5 h-5" />
                  Zero-Dependency Bare-Bones Installation (No `npm install` Needed)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The module requires <strong>zero external npm packages</strong>. All persistence, atomic disk writes, recurrence evaluation, and UUID generation use Node.js core modules (<code>fs</code>, <code>path</code>, <code>crypto</code>). Simply clone or copy the folder into <code>~/MagicMirror/modules/MMM-ChoreTracker</code> and launch MagicMirror.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          MODAL OVERLAYS (Fills Most of Screen with Modern Ambient Backdrop)
          ========================================================================= */}

      {/* MODAL 1: Child Chores Modal (Fills Most of Screen) */}
      {activeModal === "child_chores" && selectedChildId && (
        <div
          onClick={() => {
            setActiveModal(null);
            setSelectedChildId(null);
          }}
          className="fixed inset-0 z-[100] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 md:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[94vw] max-w-5xl h-[88vh] max-h-[92vh] bg-slate-900 border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 sm:px-7 py-4 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setSelectedChildId(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-sm transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Dashboard</span>
                </button>
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xl font-black text-white shadow-lg shadow-sky-500/20 shrink-0">
                  {selectedChildId === "up_for_grabs" ? (
                    <Zap className="w-5 h-5 text-amber-300" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="font-bold text-xl sm:text-2xl text-white tracking-tight flex items-center gap-2">
                    {selectedChildId === "up_for_grabs" ? (
                      <Zap className="w-5 h-5 text-amber-300 shrink-0" />
                    ) : (
                      <User className="w-5 h-5 text-sky-400 shrink-0" />
                    )}
                    <span>{selectedChildId === "up_for_grabs" ? "Up For Grabs Bounties" : `${activeChild?.name}'s Chores`}</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedChildId === "up_for_grabs"
                      ? "Open tasks anyone in the family can claim & complete"
                      : "Tap the checkmark to mark complete • Tap chore card for notes & details"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setSelectedChildId(null);
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 transition cursor-pointer"
                title="Close and return to dashboard"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Paginated Content Body */}
            <div className="p-4 sm:p-6 md:p-7 flex flex-col justify-between flex-1 min-h-0 overflow-hidden gap-3">
              {/* Toolbar: Navigation Tabs, Daily Goal & Per-Page Setting */}
              <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                {selectedChildId !== "up_for_grabs" && (
                  <div className="flex gap-2 bg-slate-950/80 border border-white/10 p-1.5 rounded-2xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setChildModalTab("assigned")}
                      className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        childModalTab === "assigned"
                          ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <User className="w-4 h-4 shrink-0" />
                      <span>{activeChild?.name}'s Tasks ({childTasks.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChildModalTab("up_for_grabs")}
                      className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        childModalTab === "up_for_grabs"
                          ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Zap className="w-4 h-4 text-amber-300 shrink-0" />
                      <span>Available Up For Grabs ({tasks.filter((t) => t.assigned_to === "up_for_grabs" && !t.is_completed).length})</span>
                    </button>
                  </div>
                )}

                {/* Daily Goal & Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {childModalTab === "assigned" && selectedChildId !== "up_for_grabs" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>Daily Goal: {childDailyGoalDone}/{childDailyGoalTotal} Done</span>
                    </div>
                  )}

                  {childOverdueCount > 0 && childModalTab === "assigned" && selectedChildId !== "up_for_grabs" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>{childOverdueCount} Overdue</span>
                    </div>
                  )}

                  {childUpcomingCount > 0 && childModalTab === "assigned" && selectedChildId !== "up_for_grabs" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{childUpcomingCount} Upcoming Tomorrow (Not in goal)</span>
                    </div>
                  )}

                  {/* Setting: Chores Per Page Shown */}
                  <div className="flex items-center gap-1.5 bg-slate-950/70 border border-white/10 px-2.5 py-1 rounded-xl text-xs">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-300 font-semibold text-[11px] whitespace-nowrap">Per page:</span>
                    {[2, 4, 6, 8].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setChoresPerPage(size);
                          setChorePage(1);
                          try {
                            localStorage.setItem("ct_chores_per_page", String(size));
                          } catch (e) {}
                        }}
                        className={`w-7 h-7 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center ${
                          choresPerPage === size
                            ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                            : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                        }`}
                        title={`Show ${size} chores per page`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Task Items Grid (Paginated, No Scrolling) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 flex-1 content-start overflow-hidden">
                {childTasks.length === 0 ? (
                  <div className="col-span-full py-14 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">No chores pending here!</h3>
                    <p className="text-slate-400 text-sm">All caught up! Great job!</p>
                  </div>
                ) : (
                  paginatedChildTasks.map((task) => {
                    const isRoutine = task.category === "routine";
                    const isDone = isRoutine ? Boolean(task.is_completed_today) : Boolean(task.is_completed);
                    const scheduleStatus = getChoreScheduleStatus(task, currentTime);
                    const isOverdue = scheduleStatus.isOverdue && !isDone;
                    const isUpcoming = scheduleStatus.isUpcoming;

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          setActiveTaskId(task.id);
                          setActiveModal("task_detail");
                        }}
                        className={`group cursor-pointer rounded-2xl p-4 sm:p-4.5 border transition-all flex flex-col justify-between gap-2.5 select-none ${
                          isDone
                            ? "bg-emerald-950/20 border-emerald-500/40 opacity-80"
                            : isOverdue
                            ? "bg-rose-950/35 border-rose-500 hover:border-rose-400 hover:bg-rose-900/40 ring-1 ring-rose-500/50 shadow-lg shadow-rose-950/40"
                            : isUpcoming
                            ? "bg-indigo-950/25 border-indigo-500/40 hover:border-indigo-400 hover:bg-indigo-900/30 shadow-md"
                            : "bg-slate-900 border-white/10 hover:border-sky-400 hover:bg-slate-850 shadow-lg"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Title line with inline type of task, Overdue / Upcoming badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <h4
                                className={`font-bold text-base leading-snug ${
                                  isDone
                                    ? "line-through text-slate-400"
                                    : isOverdue
                                    ? "text-rose-100"
                                    : "text-white"
                                }`}
                              >
                                {task.title}
                              </h4>

                              {/* Overdue Badge in Red */}
                              {isOverdue && (
                                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-md bg-rose-600/30 border border-rose-500 text-rose-300 uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  <span>Overdue</span>
                                </span>
                              )}

                              {/* Upcoming Tomorrow Badge */}
                              {isUpcoming && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/25 border border-indigo-500/50 text-indigo-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-indigo-400" />
                                  <span>Upcoming Tomorrow</span>
                                </span>
                              )}

                              {isRoutine ? (
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider shrink-0 flex items-center gap-1 ${
                                    isOverdue
                                      ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                                      : isUpcoming
                                      ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                                      : "bg-sky-500/15 border-sky-500/30 text-sky-400"
                                  }`}
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>{getRecurrenceLabel(task.recurrence)}</span>
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0 font-mono flex items-center gap-1">
                                  <DollarSign className="w-3 h-3 text-emerald-400" />
                                  <span>${task.reward_amount.toFixed(2)} Bounty</span>
                                </span>
                              )}

                              {!isRoutine && task.is_completed && (
                                task.is_approved ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500 text-emerald-400 shrink-0 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Approved</span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500 text-amber-400 shrink-0 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>Needs Approval</span>
                                  </span>
                                )
                              )}
                            </div>

                            {/* Overdue / Upcoming helper subtext */}
                            {isOverdue && (
                              <p className="text-[11px] text-rose-300 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                                <span>{scheduleStatus.dueDetail} • Complete to clear overdue</span>
                              </p>
                            )}

                            {isUpcoming && (
                              <p className="text-[11px] text-indigo-300/90 font-medium mt-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span>{scheduleStatus.dueDetail} • Not in today's daily goal</span>
                              </p>
                            )}
                          </div>

                          {/* Touch Complete Circle Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInitiateComplete(task.id);
                            }}
                            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl font-bold transition shrink-0 cursor-pointer ${
                              isDone
                                ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                                : isOverdue
                                ? "border-rose-500/60 hover:border-rose-400 bg-rose-500/15 text-transparent hover:text-rose-200"
                                : "border-white/20 hover:border-sky-400 bg-white/5 text-transparent hover:text-white/40"
                            }`}
                            title={isDone ? "Mark incomplete" : "Mark completed"}
                          >
                            {isDone ? (
                              <Check className="w-6 h-6 stroke-[3]" />
                            ) : (
                              <span className={`w-4 h-4 rounded-full border ${isOverdue ? "border-rose-400/50" : "border-white/20"}`} />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                          <span className={`flex items-center gap-1.5 font-medium ${isOverdue ? "text-rose-300" : isUpcoming ? "text-indigo-300" : "text-sky-300"}`}>
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>{task.notes.length} {task.notes.length === 1 ? "note" : "notes"}</span>
                          </span>
                          <span className={`font-semibold group-hover:translate-x-0.5 transition flex items-center gap-1 ${isOverdue ? "text-rose-400" : isUpcoming ? "text-indigo-400" : "text-sky-400"}`}>
                            <span>Details &amp; Notes</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Pagination Bar with Forward/Backward Icons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChorePage((p) => Math.max(1, p - 1))}
                    disabled={validChorePage <= 1}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-25 disabled:pointer-events-none text-white font-bold text-xs sm:text-sm transition cursor-pointer border border-white/10"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 text-sky-400" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-1.5 px-2">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Page {validChorePage} of {totalChorePages}
                    </span>
                    {totalChoreCount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        ({choreStartIndex + 1}–{Math.min(choreStartIndex + choresPerPage, totalChoreCount)} of {totalChoreCount})
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setChorePage((p) => Math.min(totalChorePages, p + 1))}
                    disabled={validChorePage >= totalChorePages}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-25 disabled:pointer-events-none text-white font-bold text-xs sm:text-sm transition cursor-pointer border border-white/10"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4 text-sky-400" />
                  </button>
                </div>

                {/* Direct Page Jump Buttons */}
                {totalChorePages > 1 && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalChorePages }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        type="button"
                        onClick={() => setChorePage(pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                          validChorePage === pg
                            ? "bg-sky-500 text-white shadow-sm shadow-sky-500/40"
                            : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/15"
                        }`}
                      >
                        {pg}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Task Detail & Threaded Notes Modal (Fills Most of Screen) */}
      {activeModal === "task_detail" && activeTask && (
        <div
          onClick={() => {
            if (selectedChildId) {
              setActiveModal("child_chores");
            } else {
              setActiveModal(null);
            }
          }}
          className="fixed inset-0 z-[100] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 md:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[92vw] max-w-2xl max-h-[88vh] bg-slate-900 border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 sm:px-6 py-4 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedChildId) {
                      setActiveModal("child_chores");
                    } else {
                      setActiveModal(null);
                    }
                  }}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{selectedChildId ? "Back to Chores" : "Back"}</span>
                </button>
                <div className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-sky-400 shrink-0" />
                  <h3 className="font-bold text-lg sm:text-xl text-white">{activeTask.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedChildId) {
                    setActiveModal("child_chores");
                  } else {
                    setActiveModal(null);
                  }
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
              {/* Info Card */}
              <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Type:</span>
                  </span>
                  <strong className={activeTask.category === "routine" ? "text-sky-400" : "text-emerald-400"}>
                    {activeTask.category === "routine" ? "Routine Expectation" : "Monetized Bounty"}
                  </strong>
                </div>

                {activeTask.category === "routine" && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-sky-400" />
                      <span>Frequency:</span>
                    </span>
                    <strong className="text-sky-300 font-semibold">
                      {getRecurrenceLabel(activeTask.recurrence)}
                    </strong>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Reward:</span>
                  </span>
                  <strong className="text-emerald-400 font-bold text-base">
                    {activeTask.category === "routine" ? "$0.00" : `$${activeTask.reward_amount.toFixed(2)}`}
                  </strong>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-purple-400" />
                    <span>Assigned To:</span>
                  </span>
                  <strong className="text-white flex items-center gap-1">
                    {activeTask.assigned_to === "up_for_grabs" ? (
                      <>
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        <span className="text-purple-300">Up For Grabs</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-sky-400" />
                        <span>{profiles.find((p) => p.id === activeTask.assigned_to)?.name || "Assigned"}</span>
                      </>
                    )}
                  </strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                {activeTask.assigned_to === "up_for_grabs" && selectedChildId && selectedChildId !== "up_for_grabs" && (
                  <button
                    type="button"
                    onClick={() => handleClaimChore(activeTask.id)}
                    className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-md shadow-purple-600/20 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    Claim for {activeChild?.name}
                  </button>
                )}

                {(() => {
                  const isDone = activeTask.category === "routine"
                    ? Boolean(activeTask.is_completed_today)
                    : Boolean(activeTask.is_completed);

                  return (
                    <button
                      type="button"
                      onClick={() => {
                        handleInitiateComplete(activeTask.id);
                      }}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-md cursor-pointer ${
                        isDone
                          ? "bg-slate-850 hover:bg-slate-800 text-slate-200 border border-white/10"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                      }`}
                    >
                      {isDone ? (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Mark as Incomplete</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Mark as Completed</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>

              {/* Threaded Notes Feed */}
              <div className="flex-1 flex flex-col gap-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-sky-400" />
                  <span>Threaded Notes &amp; Updates</span>
                </h4>
                <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 flex-1 min-h-[140px] max-h-56 overflow-y-auto space-y-2.5">
                  {activeTask.notes.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No notes posted yet. Leave instructions or completion updates!
                    </p>
                  ) : (
                    activeTask.notes.map((n, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl text-xs ${
                          n.author.toLowerCase().includes("parent")
                            ? "bg-purple-950/40 border-l-4 border-purple-500"
                            : "bg-slate-800 border-l-4 border-sky-400"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            {n.author.toLowerCase().includes("parent") ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            )}
                            <span className={n.author.toLowerCase().includes("parent") ? "text-purple-300" : "text-sky-300"}>
                              {n.author}
                            </span>
                          </div>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </span>
                        </div>
                        <p className="text-slate-200">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Note Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add instructions or update note..."
                  value={customNoteText}
                  onChange={(e) => setCustomNoteText(e.target.value)}
                  onClick={() =>
                    openVirtualKeyboard("Chore Note", customNoteText, "text", (val) =>
                      setCustomNoteText(val)
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddNote(activeTask.id, customNoteText);
                  }}
                  className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleAddNote(activeTask.id, customNoteText)}
                  className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-4 py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Post</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Who Completed This? (Attribution Modal - Fills Most of Screen) */}
      {activeModal === "who_completed" && completingTask && (
        <div
          onClick={() => {
            setCompletingTaskId(null);
            if (selectedChildId) {
              setActiveModal("child_chores");
            } else {
              setActiveModal(null);
            }
          }}
          className="fixed inset-0 z-[100] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 md:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[92vw] max-w-md max-h-[88vh] bg-slate-900 border border-purple-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-base font-bold">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Who completed this chore?</h3>
                  <p className="text-xs text-purple-300 font-medium">Select who gets the credit &amp; reward</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletingTaskId(null);
                  if (selectedChildId) {
                    setActiveModal("child_chores");
                  } else {
                    setActiveModal(null);
                  }
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 text-xs font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white">{completingTask.title}</div>
                  <div className="text-xs text-slate-400">
                    {completingTask.category === "routine" ? "Routine Expectation" : "Up For Grabs Bounty"}
                  </div>
                </div>
                <div className="text-emerald-400 font-bold text-base px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                  {completingTask.category === "routine" ? "$0.00" : `$${completingTask.reward_amount.toFixed(2)}`}
                </div>
              </div>

              <p className="text-xs text-slate-300 font-medium">
                Touch the child who finished this task:
              </p>

              <div className="grid grid-cols-3 gap-3">
                {profiles.map((p, idx) => {
                  const grad = avatarGradients[idx % avatarGradients.length];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleCompleteAsChild(completingTask.id, p.id)}
                      className="group p-3.5 rounded-2xl border border-white/10 bg-slate-800/90 hover:bg-slate-750 hover:border-sky-400 hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-2 cursor-pointer shadow-md text-center"
                    >
                      <div
                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-base font-black text-white shadow-md group-hover:shadow-sky-500/30 transition`}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-sky-300 transition">
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCompletingTaskId(null);
                  if (selectedChildId) {
                    setActiveModal("child_chores");
                  } else {
                    setActiveModal(null);
                  }
                }}
                className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: 4-Digit PIN Keypad (Fills Most of Screen with Zero Flashing) */}
      {activeModal === "pin_pad" && (
        <div
          onClick={() => {
            setActiveModal(null);
          }}
          className="fixed inset-0 z-[100] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 md:p-8"
        >
          <PinPadModal
            onSuccess={() => {
              setIsParentUnlocked(true);
              setActiveModal("parent_panel");
            }}
            onCancel={() => {
              setActiveModal(null);
            }}
          />
        </div>
      )}

      {/* MODAL 5: Parent Administration Console (Fills Most of Screen) */}
      {activeModal === "parent_panel" && (
        <div
          onClick={() => {
            setIsParentUnlocked(false);
            setActiveModal(null);
          }}
          className="fixed inset-0 z-[100] bg-slate-950/85 flex items-center justify-center p-3 sm:p-5 md:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[94vw] max-w-5xl h-[88vh] max-h-[92vh] bg-slate-900 border border-purple-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 sm:px-7 py-4 bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-sky-400 shrink-0" />
                <div>
                  <h2 className="font-bold text-xl sm:text-2xl text-white tracking-tight">Parent Administration Console</h2>
                  <p className="text-xs text-slate-400">Review approvals, create tasks, process payouts &amp; audit history</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Setting: Chores Per Page Shown */}
                <div className="flex items-center gap-1.5 bg-slate-950/70 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-300 font-semibold text-xs whitespace-nowrap">Chores Per Page:</span>
                  {[2, 4, 6, 8].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setChoresPerPage(size);
                        setChorePage(1);
                        try {
                          localStorage.setItem("ct_chores_per_page", String(size));
                        } catch (e) {}
                      }}
                      className={`w-7 h-7 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center ${
                        choresPerPage === size
                          ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                          : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                      }`}
                      title={`Show ${size} chores per page`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsParentUnlocked(false);
                    setActiveModal(null);
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition shadow-lg shadow-purple-600/20 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  Lock &amp; Exit
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-6 md:p-7 flex flex-col gap-5 flex-1 overflow-y-auto">
              {/* Console Navigation Tabs */}
              <div className="flex bg-slate-950/80 border border-white/10 p-1.5 rounded-2xl gap-1.5 overflow-x-auto shrink-0">
              {[
                { id: "approvals", label: "Task Approvals", icon: CheckCircle2 },
                { id: "manage_chores", label: "Manage Chores", icon: SlidersHorizontal },
                { id: "children", label: "Manage Children", icon: Users },
                { id: "payout_engine", label: "Payout & Audit", icon: DollarSign },
                { id: "history", label: "Payout Ledger", icon: History }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setParentActiveTab(tab.id as any)}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
                      parentActiveTab === tab.id
                        ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Approvals Tab */}
            {parentActiveTab === "approvals" && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-slate-400">
                  Review completed monetized chores before they become eligible for allowance payouts.
                </p>

                {tasks.filter((t) => t.category === "monetized" && t.is_completed && !t.is_approved).length === 0 ? (
                  <div className="p-12 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-3xl">
                    <Sparkles className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                    <h4 className="font-bold text-white text-base mb-1">No monetized chores waiting for approval</h4>
                    <span className="text-xs text-slate-400">All submissions have been reviewed and approved!</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tasks
                      .filter((t) => t.category === "monetized" && t.is_completed && !t.is_approved)
                      .map((t) => {
                        const child = profiles.find((p) => p.id === t.assigned_to);
                        return (
                          <div
                            key={t.id}
                            className="p-5 rounded-2xl bg-slate-900 border border-white/10 flex flex-col justify-between gap-4 shadow-lg"
                          >
                            <div className="flex justify-between items-start gap-3">
                              <div>
                                <h4 className="font-bold text-white text-base">{t.title}</h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Completed by: <strong className="text-sky-400">{child?.name || "Unassigned"}</strong>
                                </p>
                              </div>
                              <div className="text-xl font-black text-emerald-400 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                ${t.reward_amount.toFixed(2)}
                              </div>
                            </div>

                            <div className="flex gap-2.5">
                              <button
                                onClick={() => handleApprove(t.id)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-md shadow-emerald-600/20"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Approve (${t.reward_amount.toFixed(2)})
                              </button>
                              <button
                                onClick={() => handleRequestRevision(t.id)}
                                className="bg-white/10 hover:bg-white/20 text-slate-300 font-semibold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <RotateCcw className="w-4 h-4 text-amber-400" />
                                <span>Needs Revision</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Manage Chores Tab (Create, Edit, Update, Delete & Advanced Schedules) */}
            {parentActiveTab === "manage_chores" && (
              <div className="space-y-5">
                {/* Header & Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-white/10 p-4 rounded-2xl">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                      <span>Family Chores Inventory ({tasks.length})</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Create, edit, reschedule, or remove routine expectations and bounties
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Filter Pills */}
                    <div className="flex bg-slate-950 border border-white/10 p-1 rounded-xl gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setManageChoresFilter("all")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          manageChoresFilter === "all"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>All ({tasks.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManageChoresFilter("routine")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          manageChoresFilter === "routine"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Routine ({tasks.filter((t) => t.category === "routine").length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManageChoresFilter("monetized")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          manageChoresFilter === "monetized"
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Bounties ({tasks.filter((t) => t.category === "monetized").length})</span>
                      </button>
                    </div>

                    {/* "+ Create New Chore" Button */}
                    <button
                      type="button"
                      onClick={() => setIsCreatingChore(!isCreatingChore)}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                        isCreatingChore
                          ? "bg-white/15 text-white border border-white/20"
                          : "bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20"
                      }`}
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>{isCreatingChore ? "Close Creator" : "New Chore"}</span>
                    </button>
                  </div>
                </div>

                {/* Inline Creation Card (Shown when toggled or if chore inventory is empty) */}
                {(isCreatingChore || tasks.length === 0) && (
                  <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 sm:p-7 space-y-4 shadow-xl">
                    <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-sky-400" />
                        <h4 className="font-bold text-white text-base">Create &amp; Schedule New Chore</h4>
                      </div>
                      {tasks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingChore(false)}
                          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5 text-sky-400" />
                        Chore Title
                      </label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onClick={() =>
                          openVirtualKeyboard("Chore Title", newTitle, "text", (val) =>
                            setNewTitle(val)
                          )
                        }
                        placeholder="e.g., Vacuum living room, Clean room, Empty dishwasher, Replace air filters..."
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">Category</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNewCategory("routine")}
                          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            newCategory === "routine"
                              ? "bg-sky-500/20 border-sky-400 text-sky-300"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                          Routine Expectation ($0.00)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewCategory("monetized")}
                          className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            newCategory === "monetized"
                              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          <DollarSign className="w-4 h-4" />
                          Monetized Bounty ($)
                        </button>
                      </div>
                    </div>

                    {newCategory === "monetized" ? (
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          Reward Bounty Amount ($)
                        </label>
                        <input
                          type="number"
                          step="0.50"
                          value={newReward}
                          onChange={(e) => setNewReward(e.target.value)}
                          onClick={() =>
                            openVirtualKeyboard("Reward Amount ($)", newReward, "number", (val) =>
                              setNewReward(val)
                            )
                          }
                          className="w-full bg-slate-950 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-400 cursor-pointer font-mono"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-sky-400" />
                            Recurrence Frequency &amp; Schedule
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { id: "weekly", label: "Daily / Weekly", icon: Calendar },
                              { id: "bi_weekly", label: "Every 2 Weeks", icon: Clock },
                              { id: "every_3_weeks", label: "Every 3 Weeks", icon: Clock },
                              { id: "twice_a_month", label: "Twice a Month", icon: Calendar },
                              { id: "monthly", label: "Once a Month", icon: Calendar },
                              { id: "twice_a_year", label: "Twice a Year", icon: RefreshCw },
                              { id: "yearly", label: "Once a Year", icon: Sparkles }
                            ].map((opt) => {
                              const OptIcon = opt.icon;
                              const isSel = newFrequency === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setNewFrequency(opt.id)}
                                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                    isSel
                                      ? "bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm"
                                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                                  }`}
                                >
                                  <OptIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {newFrequency === "weekly" ? (
                          <div>
                            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Active Days of Week</label>
                            <div className="flex gap-1.5">
                              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, dIdx) => {
                                const sel = newDays.includes(dIdx);
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                      setNewDays((prev) =>
                                        sel ? prev.filter((x) => x !== dIdx) : [...prev, dIdx]
                                      );
                                    }}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                      sel
                                        ? "bg-sky-600 border-sky-400 text-white"
                                        : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
                                    }`}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300 flex items-center gap-2">
                            <Info className="w-4 h-4 shrink-0 text-sky-400" />
                            <span>
                              {newFrequency === "bi_weekly" && "Resets 14 days after completion for regular bi-weekly tasks."}
                              {newFrequency === "every_3_weeks" && "Resets 21 days after completion for rotating 3-week chore cycles."}
                              {newFrequency === "twice_a_month" && "Resets twice a month (on the 1st and 16th of each calendar month)."}
                              {newFrequency === "monthly" && "Resets automatically at the start of each calendar month on the 1st."}
                              {newFrequency === "twice_a_year" && "Resets every 6 months (January 1st & July 1st) for semi-annual chores."}
                              {newFrequency === "yearly" && "Resets once a year on January 1st for annual home maintenance."}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Multi-Child Assignment Chips */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          Assign Chore To
                        </label>
                        <span className="text-[11px] text-slate-400">Select one or multiple children</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {/* Up For Grabs */}
                        <button
                          type="button"
                          onClick={() => setNewAssignedTos(["up_for_grabs"])}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                            newAssignedTos.includes("up_for_grabs")
                              ? "bg-purple-600/30 border-purple-400 text-purple-200 shadow-md shadow-purple-600/20"
                              : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Up For Grabs (Open Bounty)</span>
                        </button>

                        {/* Each Child Chip */}
                        {profiles.map((p) => {
                          const isSel = newAssignedTos.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                let updated = newAssignedTos.filter((x) => x !== "up_for_grabs");
                                if (updated.includes(p.id)) {
                                  updated = updated.filter((x) => x !== p.id);
                                } else {
                                  updated.push(p.id);
                                }
                                if (updated.length === 0) {
                                  updated = ["up_for_grabs"];
                                }
                                setNewAssignedTos(updated);
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                                isSel
                                  ? "bg-sky-600/30 border-sky-400 text-sky-200 shadow-md shadow-sky-600/20"
                                  : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                              }`}
                            >
                              {isSel ? (
                                <Check className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                              ) : (
                                <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <User className="w-3.5 h-3.5 text-sky-400" />
                              <span>{p.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {profiles.length > 1 && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setNewAssignedTos(profiles.map((p) => p.id))}
                            className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 py-1 px-2.5 rounded-lg bg-white/5 border border-white/10 cursor-pointer flex items-center gap-1"
                          >
                            <Users className="w-3 h-3" />
                            <span>Assign to All Children ({profiles.length})</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={handleCreateChore}
                        className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Publish Chore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingChore(false)}
                        className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Chores Inventory List */}
                <div className="space-y-3">
                  {(() => {
                    let filtered = tasks;
                    if (manageChoresFilter === "routine") {
                      filtered = tasks.filter((t) => t.category === "routine");
                    } else if (manageChoresFilter === "monetized") {
                      filtered = tasks.filter((t) => t.category === "monetized");
                    }

                    if (filtered.length === 0) {
                      return (
                        <div className="p-12 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-3xl">
                          <Sparkles className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                          <h4 className="font-bold text-white text-base mb-1">No chores found for this filter</h4>
                          <span className="text-xs text-slate-400 block mb-3">
                            Click "+ New Chore" above to add your first chore.
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsCreatingChore(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white font-bold text-xs shadow-md cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            Create Chore
                          </button>
                        </div>
                      );
                    }

                    return filtered.map((task) => {
                      const isEditing = editingTaskId === task.id && editingChoreDraft;
                      const isRoutine = task.category === "routine";
                      const assignedChild = profiles.find((p) => p.id === task.assigned_to);

                      if (isEditing && editingChoreDraft) {
                        return (
                          <div
                            key={task.id}
                            className="p-5 rounded-2xl bg-slate-900 border-2 border-sky-400 space-y-4 shadow-xl"
                          >
                            <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                                <Edit3 className="w-4 h-4" />
                                Editing Chore: {task.title}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTaskId(null);
                                  setEditingChoreDraft(null);
                                }}
                                className="text-slate-400 hover:text-white transition cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-300 block mb-1">Chore Title</label>
                              <input
                                type="text"
                                value={editingChoreDraft.title}
                                onChange={(e) =>
                                  setEditingChoreDraft((prev) => prev ? { ...prev, title: e.target.value } : null)
                                }
                                onClick={() =>
                                  openVirtualKeyboard("Edit Title", editingChoreDraft.title, "text", (val) =>
                                    setEditingChoreDraft((prev) => prev ? { ...prev, title: val } : null)
                                  )
                                }
                                className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-400 cursor-pointer"
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingChoreDraft((prev) => prev ? { ...prev, category: "routine" } : null)
                                }
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                  editingChoreDraft.category === "routine"
                                    ? "bg-sky-500/20 border-sky-400 text-sky-300"
                                    : "bg-white/5 border-white/10 text-slate-400"
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                Routine Expectation
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingChoreDraft((prev) => prev ? { ...prev, category: "monetized" } : null)
                                }
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                  editingChoreDraft.category === "monetized"
                                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                                    : "bg-white/5 border-white/10 text-slate-400"
                                }`}
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                Monetized Bounty
                              </button>
                            </div>

                            {editingChoreDraft.category === "routine" ? (
                              <div className="space-y-2.5">
                                <label className="text-xs font-bold text-slate-300 block">Recurrence Schedule</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {[
                                    { id: "weekly", label: "Daily / Weekly" },
                                    { id: "bi_weekly", label: "Every 2 Weeks" },
                                    { id: "every_3_weeks", label: "Every 3 Weeks" },
                                    { id: "twice_a_month", label: "Twice a Month" },
                                    { id: "monthly", label: "Once a Month" },
                                    { id: "twice_a_year", label: "Twice a Year" },
                                    { id: "yearly", label: "Once a Year" }
                                  ].map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() =>
                                        setEditingChoreDraft((prev) => prev ? { ...prev, frequency: opt.id } : null)
                                      }
                                      className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                        editingChoreDraft.frequency === opt.id
                                          ? "bg-sky-500/20 border-sky-400 text-sky-200"
                                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>

                                {editingChoreDraft.frequency === "weekly" ? (
                                  <div className="flex gap-1 pt-1">
                                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, dIdx) => {
                                      const sel = editingChoreDraft.days_of_week.includes(dIdx);
                                      return (
                                        <button
                                          key={day}
                                          type="button"
                                          onClick={() => {
                                            setEditingChoreDraft((prev) => {
                                              if (!prev) return null;
                                              const updated = sel
                                                ? prev.days_of_week.filter((x) => x !== dIdx)
                                                : [...prev.days_of_week, dIdx];
                                              return { ...prev, days_of_week: updated };
                                            });
                                          }}
                                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                            sel
                                              ? "bg-sky-600 border-sky-400 text-white"
                                              : "bg-white/5 border-white/10 text-slate-500"
                                          }`}
                                        >
                                          {day}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="p-2.5 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300">
                                    {editingChoreDraft.frequency === "bi_weekly" && "Resets 14 days after completion for bi-weekly tasks."}
                                    {editingChoreDraft.frequency === "every_3_weeks" && "Resets 21 days after completion for 3-week chore cycles."}
                                    {editingChoreDraft.frequency === "twice_a_month" && "Resets on the 1st and 16th of each calendar month."}
                                    {editingChoreDraft.frequency === "monthly" && "Resets automatically on the 1st of every calendar month."}
                                    {editingChoreDraft.frequency === "twice_a_year" && "Resets every 6 months (Jan 1 & Jul 1) for semi-annual chores."}
                                    {editingChoreDraft.frequency === "yearly" && "Resets once a year on January 1st for annual maintenance."}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <label className="text-xs font-bold text-slate-300 block mb-1">Reward Bounty ($)</label>
                                <input
                                  type="number"
                                  step="0.50"
                                  value={editingChoreDraft.reward_amount}
                                  onChange={(e) =>
                                    setEditingChoreDraft((prev) => prev ? { ...prev, reward_amount: e.target.value } : null)
                                  }
                                  onClick={() =>
                                    openVirtualKeyboard("Reward Amount ($)", editingChoreDraft.reward_amount, "number", (val) =>
                                      setEditingChoreDraft((prev) => prev ? { ...prev, reward_amount: val } : null)
                                    )
                                  }
                                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-400 cursor-pointer font-mono"
                                />
                              </div>
                            )}

                            <div>
                              <label className="text-xs font-bold text-slate-300 block mb-1">Assigned Child</label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingChoreDraft((prev) => prev ? { ...prev, assigned_to: "up_for_grabs" } : null)
                                  }
                                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                                    editingChoreDraft.assigned_to === "up_for_grabs"
                                      ? "bg-purple-600/30 border-purple-400 text-purple-200"
                                      : "bg-slate-950 border-white/10 text-slate-400"
                                  }`}
                                >
                                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                                  <span>Up For Grabs</span>
                                </button>
                                {profiles.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      setEditingChoreDraft((prev) => prev ? { ...prev, assigned_to: p.id } : null)
                                    }
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                                      editingChoreDraft.assigned_to === p.id
                                        ? "bg-sky-600/30 border-sky-400 text-sky-200"
                                        : "bg-slate-950 border-white/10 text-slate-400"
                                    }`}
                                  >
                                    <User className="w-3.5 h-3.5 text-sky-400" />
                                    <span>{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateChore({
                                    id: task.id,
                                    title: editingChoreDraft.title,
                                    category: editingChoreDraft.category,
                                    frequency: editingChoreDraft.frequency,
                                    days_of_week: editingChoreDraft.days_of_week,
                                    reward_amount: parseFloat(editingChoreDraft.reward_amount) || 0,
                                    assigned_to: editingChoreDraft.assigned_to
                                  })
                                }
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                                <span>Save Changes</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTaskId(null);
                                  setEditingChoreDraft(null);
                                }}
                                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={task.id}
                          className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-white/10 flex flex-col justify-between gap-3 shadow-md hover:border-white/20 transition"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-white text-base leading-snug">{task.title}</h4>
                                {isRoutine ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                                    <Clock className="w-3 h-3 text-sky-400" />
                                    <span>{getRecurrenceLabel(task.recurrence)}</span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono flex items-center gap-1 shrink-0">
                                    <DollarSign className="w-3 h-3 text-emerald-400" />
                                    <span>${task.reward_amount.toFixed(2)} Bounty</span>
                                  </span>
                                )}

                                {!isRoutine && task.is_completed && (
                                  task.is_approved ? (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500 text-emerald-400 shrink-0 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Approved
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500 text-amber-400 shrink-0 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Needs Approval
                                    </span>
                                  )
                                )}
                              </div>

                              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 pt-1">
                                <span className="flex items-center gap-1">
                                  {task.assigned_to === "up_for_grabs" ? (
                                    <>
                                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                                      <strong className="text-purple-300">Up For Grabs</strong>
                                    </>
                                  ) : (
                                    <>
                                      <User className="w-3.5 h-3.5 text-sky-400" />
                                      <span>Assigned to: <strong className="text-sky-300">{assignedChild?.name || "Unassigned"}</strong></span>
                                    </>
                                  )}
                                </span>

                                <span className="flex items-center gap-1 text-slate-400">
                                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                                  <span>{task.notes.length} {task.notes.length === 1 ? "note" : "notes"}</span>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTaskId(task.id);
                                  setEditingChoreDraft({
                                    title: task.title,
                                    category: task.category,
                                    frequency: task.recurrence?.frequency || "weekly",
                                    days_of_week: task.recurrence?.days_of_week || [0, 1, 2, 3, 4, 5, 6],
                                    reward_amount: task.reward_amount.toFixed(2),
                                    assigned_to: task.assigned_to
                                  });
                                }}
                                className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-sky-500/30"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              {deletingTaskId === task.id ? (
                                <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-500/40 px-2.5 py-1 rounded-xl">
                                  <span className="text-[11px] font-bold text-rose-300">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteChore(task.id);
                                      setDeletingTaskId(null);
                                    }}
                                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer shadow-sm transition"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Yes</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingTaskId(null)}
                                    className="bg-white/10 hover:bg-white/20 text-slate-300 font-bold px-1.5 py-1 rounded-lg text-[11px] cursor-pointer flex items-center transition"
                                    title="Cancel delete"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeletingTaskId(task.id)}
                                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-rose-500/20"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Manage Children Tab */}
            {parentActiveTab === "children" && (
              <div className="max-w-2xl space-y-5">
                {/* Add Child Card */}
                <div className="bg-slate-900 border border-sky-500/30 rounded-3xl p-5 sm:p-6 space-y-3">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                    <UserPlus className="w-4 h-4" />
                    Add a New Child to Tracker
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newChildName}
                      onChange={(e) => setNewChildName(e.target.value)}
                      onClick={() =>
                        openVirtualKeyboard("New Child Name", newChildName, "text", (val) =>
                          setNewChildName(val)
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddChild();
                      }}
                      placeholder="Enter child's name (e.g. Emma, Lucas, Noah)..."
                      className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleAddChild}
                      className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md shadow-sky-500/20 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add Child
                    </button>
                  </div>
                </div>

                {/* Existing Children List */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-sky-400" />
                      Family Children ({profiles.length})
                    </h4>
                    <span className="text-xs text-slate-400">Rename or manage profiles</span>
                  </div>

                  {profiles.map((p, idx) => {
                    const grad = avatarGradients[idx % avatarGradients.length];
                    const childChoresCount = tasks.filter((t) => t.assigned_to === p.id).length;
                    const currentInputVal = editingChildNames[p.id] !== undefined ? editingChildNames[p.id] : p.name;
                    const isSaved = savedNameNoticeId === p.id;

                    return (
                      <div
                        key={p.id}
                        className="p-4 bg-slate-900 border border-white/10 rounded-2xl flex flex-wrap sm:flex-nowrap items-center gap-3 shadow-md"
                      >
                        <div
                          className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm`}
                        >
                          {p.name.charAt(0)}
                        </div>

                        <input
                          type="text"
                          value={currentInputVal}
                          onChange={(e) =>
                            setEditingChildNames((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          onClick={() =>
                            openVirtualKeyboard(`Rename Child: ${p.name}`, currentInputVal, "text", (val) =>
                              setEditingChildNames((prev) => ({ ...prev, [p.id]: val }))
                            )
                          }
                          placeholder="Child name..."
                          className="flex-1 min-w-[140px] bg-slate-950 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-400 cursor-pointer"
                        />

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-400 font-medium px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                            {childChoresCount} chores
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRenameChild(p.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                              isSaved
                                ? "bg-emerald-600/30 border-emerald-400 text-emerald-300"
                                : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                            }`}
                          >
                            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                            {isSaved ? "Saved!" : "Save Name"}
                          </button>

                          {profiles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteChild(p.id)}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 transition flex items-center gap-1 cursor-pointer"
                              title="Remove child"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Payout Tab */}
            {parentActiveTab === "payout_engine" && (
              <div className="max-w-2xl bg-slate-900 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-5">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 shrink-0">
                    <User className="w-3.5 h-3.5 text-sky-400" />
                    Select Child:
                  </label>
                  <select
                    value={payoutProfileId}
                    onChange={(e) => setPayoutProfileId(e.target.value)}
                    className="bg-slate-950 border border-white/15 rounded-xl px-4 py-2 text-sm text-white flex-1 focus:outline-none focus:border-sky-400 cursor-pointer"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const approved = tasks.filter(
                    (t) => t.category === "monetized" && t.is_approved && t.assigned_to === payoutProfileId
                  );
                  const total = approved.reduce((sum, t) => sum + t.reward_amount, 0);

                  return (
                    <>
                      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-5 flex justify-between items-center">
                        <div>
                          <div className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4" />
                            <span>Verified Total Payout Due</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {approved.length} approved chores ready for payout
                          </div>
                        </div>
                        <div className="text-4xl font-black text-emerald-400">
                          ${total.toFixed(2)}
                        </div>
                      </div>

                      {approved.length > 0 && (
                        <button
                          onClick={handleProcessPayout}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition active:scale-95 cursor-pointer"
                        >
                          <DollarSign className="w-5 h-5" />
                          Process Payout (${total.toFixed(2)}) &amp; Commit to Audit Log
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Ledger History Tab */}
            {parentActiveTab === "history" && (
              <div className="max-w-2xl space-y-3">
                {payouts.length === 0 ? (
                  <div className="p-12 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-3xl">
                    <History className="w-8 h-8 text-sky-400 mx-auto mb-2" />
                    <h4 className="font-bold text-white text-base mb-1">No payouts processed yet</h4>
                    <span className="text-xs text-slate-400">Processed allowances will appear in this audit log.</span>
                  </div>
                ) : (
                  payouts.map((rec) => {
                    const prof = profiles.find((p) => p.id === rec.profile_id);
                    return (
                      <div
                        key={rec.id}
                        className="p-4 bg-slate-900 border border-white/10 rounded-2xl flex justify-between items-center text-xs sm:text-sm shadow-md"
                      >
                        <div>
                          <div className="font-bold text-white text-base flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-sky-400" />
                            <span>{prof?.name || rec.profile_id}</span>
                          </div>
                          <div className="text-slate-400 text-xs mt-0.5">
                            Ref: <code className="text-sky-300">{rec.id}</code> • {new Date(rec.processed_timestamp).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-xl font-black text-emerald-400">
                          ${rec.total_amount.toFixed(2)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* DIGITAL ON-SCREEN VIRTUAL KEYBOARD OVERLAY */}
      {virtualKeyboard.isOpen && (
        <div
          onClick={closeVirtualKeyboard}
          className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-xs flex flex-col justify-end p-2 sm:p-4 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl mx-auto bg-slate-900 border border-white/20 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3"
          >
            {/* Top Bar */}
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 font-bold">
                <Keyboard className="w-4 h-4 text-sky-400" />
                <span>Typing:</span>
                <span className="text-sky-400 font-black">{virtualKeyboard.title}</span>
              </div>
              <button
                type="button"
                onClick={closeVirtualKeyboard}
                className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 bg-white/10 rounded-full cursor-pointer transition flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            {/* Live Preview Display with Cursor and Clear */}
            <div className="flex items-center gap-3 bg-slate-950 border border-sky-400/40 rounded-2xl px-4 py-3 shadow-inner">
              <div className="flex-1 font-mono text-base sm:text-lg text-white font-semibold flex items-center min-h-[28px] break-all">
                <span>{virtualKeyboard.value}</span>
                <span className="inline-block w-0.5 h-5 bg-sky-400 ml-1 animate-pulse" />
              </div>
              {virtualKeyboard.value && (
                <button
                  type="button"
                  onClick={() => {
                    setVirtualKeyboard((prev) => ({ ...prev, value: "" }));
                    virtualKeyboard.onConfirm("");
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 bg-rose-500/10 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Keys Grid */}
            {virtualKeyboard.mode === "numbers" ? (
              /* NUMPAD MODE FOR CURRENCY/NUMBERS */
              <div className="space-y-2">
                {[
                  ["1", "2", "3", "+$1.00"],
                  ["4", "5", "6", "+$5.00"],
                  ["7", "8", "9", "+$10.00"],
                  [".", "0", "⌫ Del", "✓ Done"]
                ].map((row, rIdx) => (
                  <div key={rIdx} className="flex gap-2">
                    {row.map((key) => {
                      const isDone = key === "✓ Done";
                      const isDel = key === "⌫ Del";
                      const isQuick = key.startsWith("+");
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (isDone) {
                              virtualKeyboard.onConfirm(virtualKeyboard.value);
                              closeVirtualKeyboard();
                            } else if (isDel) {
                              const nextVal = virtualKeyboard.value.slice(0, -1);
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else if (isQuick) {
                              const add = parseFloat(key.replace(/[^\d.]/g, "")) || 0;
                              const cur = parseFloat(virtualKeyboard.value) || 0;
                              const nextVal = (cur + add).toFixed(2);
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else {
                              const nextVal = virtualKeyboard.value + key;
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            }
                          }}
                          className={`flex-1 py-3.5 rounded-xl font-bold text-sm sm:text-base transition cursor-pointer active:scale-95 ${
                            isDone
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex-[1.4]"
                              : isDel
                              ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                              : isQuick
                              ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-white/10 hover:bg-white/20 text-white"
                          }`}
                        >
                          {isDone ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>Done</span>
                            </span>
                          ) : isDel ? (
                            <span className="flex items-center justify-center gap-1">
                              <Delete className="w-4 h-4 text-rose-300" />
                              <span>Del</span>
                            </span>
                          ) : (
                            key
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setVirtualKeyboard((prev) => ({ ...prev, mode: "alpha" }))}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Keyboard className="w-4 h-4" />
                  <span>Switch to Full ABC Keyboard</span>
                </button>
              </div>
            ) : virtualKeyboard.mode === "symbols" ? (
              /* SYMBOLS MODE */
              <div className="space-y-1.5 sm:space-y-2">
                {[
                  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
                  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
                  ["-", "_", "=", "+", "[", "]", "{", "}", "\\", "/"],
                  [":", ";", "\"", "'", "<", ">", "?", "⌫ Del"],
                  ["ABC", ",", "␣ Space", ".", "✓ Done"]
                ].map((row, rIdx) => (
                  <div key={rIdx} className="flex gap-1.5 sm:gap-2">
                    {row.map((key) => {
                      const isDone = key === "✓ Done";
                      const isDel = key === "⌫ Del";
                      const isSpace = key === "␣ Space";
                      const isABC = key === "ABC";
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (isDone) {
                              virtualKeyboard.onConfirm(virtualKeyboard.value);
                              closeVirtualKeyboard();
                            } else if (isDel) {
                              const nextVal = virtualKeyboard.value.slice(0, -1);
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else if (isABC) {
                              setVirtualKeyboard((prev) => ({ ...prev, mode: "alpha" }));
                            } else if (isSpace) {
                              const nextVal = virtualKeyboard.value + " ";
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else {
                              const nextVal = virtualKeyboard.value + key;
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            }
                          }}
                          className={`min-h-[44px] sm:min-h-[48px] py-2.5 rounded-xl font-bold text-sm sm:text-base transition cursor-pointer active:scale-95 ${
                            isDone
                              ? "flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                              : isSpace
                              ? "flex-[4] bg-white/10 hover:bg-white/20 text-slate-400"
                              : isDel
                              ? "flex-[1.4] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                              : isABC
                              ? "flex-[1.4] bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                              : "flex-1 bg-white/10 hover:bg-white/20 text-white"
                          }`}
                        >
                          {isDone ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>Done</span>
                            </span>
                          ) : isDel ? (
                            <span className="flex items-center justify-center gap-1">
                              <Delete className="w-4 h-4 text-rose-300" />
                              <span>Del</span>
                            </span>
                          ) : isSpace ? (
                            <span>Space</span>
                          ) : (
                            key
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              /* QWERTY ALPHA MODE */
              <div className="space-y-1.5 sm:space-y-2">
                {[
                  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
                  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
                  ["⇧ Shift", "z", "x", "c", "v", "b", "n", "m", "⌫ Del"],
                  ["?123", ",", "␣ Space", ".", "✓ Done"]
                ].map((row, rIdx) => (
                  <div key={rIdx} className="flex gap-1.5 sm:gap-2">
                    {row.map((key) => {
                      const isDone = key === "✓ Done";
                      const isDel = key === "⌫ Del";
                      const isSpace = key === "␣ Space";
                      const isShift = key === "⇧ Shift";
                      const isSymbols = key === "?123";
                      let displayKey = key;
                      if (key.length === 1 && /[a-z]/i.test(key)) {
                        displayKey = virtualKeyboard.isShift ? key.toUpperCase() : key.toLowerCase();
                      }

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (isDone) {
                              virtualKeyboard.onConfirm(virtualKeyboard.value);
                              closeVirtualKeyboard();
                            } else if (isDel) {
                              const nextVal = virtualKeyboard.value.slice(0, -1);
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else if (isShift) {
                              setVirtualKeyboard((prev) => ({ ...prev, isShift: !prev.isShift }));
                            } else if (isSymbols) {
                              setVirtualKeyboard((prev) => ({ ...prev, mode: "symbols" }));
                            } else if (isSpace) {
                              const nextVal = virtualKeyboard.value + " ";
                              setVirtualKeyboard((prev) => ({ ...prev, value: nextVal }));
                              virtualKeyboard.onConfirm(nextVal);
                            } else {
                              const nextVal = virtualKeyboard.value + displayKey;
                              setVirtualKeyboard((prev) => ({
                                ...prev,
                                value: nextVal,
                                isShift: false
                              }));
                              virtualKeyboard.onConfirm(nextVal);
                            }
                          }}
                          className={`min-h-[44px] sm:min-h-[48px] py-2.5 rounded-xl font-bold text-sm sm:text-base transition cursor-pointer active:scale-95 ${
                            isDone
                              ? "flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                              : isSpace
                              ? "flex-[4] bg-white/10 hover:bg-white/20 text-slate-400"
                              : isDel
                              ? "flex-[1.4] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                              : isShift
                              ? `flex-[1.4] ${virtualKeyboard.isShift ? "bg-sky-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`
                              : isSymbols
                              ? "flex-[1.4] bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                              : "flex-1 bg-white/10 hover:bg-white/20 text-white"
                          }`}
                        >
                          {isDone ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>Done</span>
                            </span>
                          ) : isDel ? (
                            <span className="flex items-center justify-center gap-1">
                              <Delete className="w-4 h-4 text-rose-300" />
                              <span>Del</span>
                            </span>
                          ) : isSpace ? (
                            <span>Space</span>
                          ) : (
                            displayKey
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
