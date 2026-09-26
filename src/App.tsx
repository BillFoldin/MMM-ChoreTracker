import React, { useState, useEffect } from "react";
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
  Info,
  X
} from "lucide-react";

interface Note {
  author: string;
  text: string;
  timestamp: string;
}

interface Recurrence {
  frequency: string;
  days_of_week: number[];
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
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [parentActiveTab, setParentActiveTab] = useState<"approvals" | "create_task" | "payout_engine" | "history">("approvals");
  const [payoutProfileId, setPayoutProfileId] = useState("child_01");

  // In-Module Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<"routine" | "monetized">("monetized");
  const [newReward, setNewReward] = useState("5.00");
  const [newAssignedTo, setNewAssignedTo] = useState("up_for_grabs");
  const [newDays, setNewDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [newNote, setNewNote] = useState("");

  // Quick note draft
  const [customNoteText, setCustomNoteText] = useState("");

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Summary counts
  const completedCount = tasks.filter((t) =>
    t.category === "routine" ? t.is_completed_today : t.is_completed
  ).length;

  const openBountySum = tasks
    .filter((t) => t.category === "monetized" && !t.is_completed)
    .reduce((sum, t) => sum + t.reward_amount, 0);

  // Active child & active task & completing task
  const activeChild = profiles.find((p) => p.id === selectedChildId);
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const completingTask = tasks.find((t) => t.id === completingTaskId);

  // Child's chore tasks list
  const childTasks = selectedChildId
    ? selectedChildId === "up_for_grabs" || childModalTab === "up_for_grabs"
      ? tasks.filter((t) => t.assigned_to === "up_for_grabs")
      : tasks.filter((t) => t.assigned_to === selectedChildId)
    : [];

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

  // Handle PIN Keypad
  const handlePinKey = (key: string) => {
    setPinError("");
    if (key === "Clear") {
      setPinInput("");
    } else if (key === "⌫") {
      setPinInput((prev) => prev.slice(0, -1));
    } else if (pinInput.length < 4) {
      const next = pinInput + key;
      setPinInput(next);
      if (next.length === 4) {
        if (next === "1234") {
          setIsParentUnlocked(true);
          setActiveModal("parent_panel");
          setPinInput("");
        } else {
          setPinError("Incorrect PIN (Default is 1234)");
          setPinInput("");
        }
      }
    }
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

  // Create chore
  const handleCreateChore = () => {
    if (!newTitle.trim()) return;
    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory,
      reward_amount: newCategory === "routine" ? 0 : parseFloat(newReward) || 0,
      assigned_to: newAssignedTo,
      recurrence:
        newCategory === "routine"
          ? { frequency: "weekly", days_of_week: newDays }
          : null,
      last_completed_date: "",
      is_completed_today: false,
      is_completed: false,
      is_approved: false,
      notes: newNote.trim()
        ? [
            {
              author: "Parent",
              text: newNote.trim(),
              timestamp: new Date().toISOString()
            }
          ]
        : []
    };

    setTasks((prev) => [newTask, ...prev]);
    setNewTitle("");
    setNewReward("5.00");
    setNewNote("");
    setParentActiveTab("approvals");
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
                <span>Touchscreen Smart Mirror View: <strong>Click any child's name to open their chores modal!</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSimulateMidnight}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition font-medium border border-slate-700"
                  title="Triggers the midnight routine recurrence engine"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                  Test Midnight Recurrence
                </button>
              </div>
            </div>

            {/* Smart Mirror Frame */}
            <div className="w-full max-w-4xl bg-black rounded-3xl border-8 border-slate-800 shadow-2xl relative overflow-hidden flex flex-col min-h-[620px]">
              {/* Subtle glass reflection overlay */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.04]"></div>

              {/* Standard MagicMirror Top Bar (Clock & Weather) */}
              <div className="p-6 border-b border-white/5 flex justify-between items-start text-white select-none">
                <div>
                  <div className="text-4xl font-extralight tracking-tight font-mono">
                    {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="text-sm text-slate-400 font-medium">
                    {currentTime.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light">68°F ☀️</div>
                  <div className="text-xs text-slate-400">Clear Skies • Living Room Mirror</div>
                </div>
              </div>

              {/* MMM-ChoreTracker Module Container (mounted in mirror) */}
              <div className="flex-1 p-6 relative flex flex-col justify-between">
                <div>
                  {/* Module Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xl shadow-lg shadow-sky-500/20">
                        ✨
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">Family Chore Tracker</h2>
                        <p className="text-xs text-slate-400">Select a kid below to view or check off chores</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 px-3 py-1.5 rounded-full text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {completedCount}/{tasks.length} Done
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold">
                          <DollarSign className="w-3.5 h-3.5" />
                          ${openBountySum.toFixed(2)} Open
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (isParentUnlocked) {
                            setActiveModal("parent_panel");
                          } else {
                            setPinInput("");
                            setPinError("");
                            setActiveModal("pin_pad");
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition border ${
                          isParentUnlocked
                            ? "bg-purple-500/20 border-purple-500 text-purple-300"
                            : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                        }`}
                      >
                        {isParentUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        {isParentUnlocked ? "Parent Mode" : "Parent Lock"}
                      </button>
                    </div>
                  </div>

                  {/* MAIN SCREEN: KIDS CARDS (ONLY KIDS' NAMES SHOWN - SLEEK & COMPACT) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 max-w-3xl mx-auto w-full">
                    {profiles.map((p, idx) => {
                      const childTasks = tasks.filter((t) => t.assigned_to === p.id);
                      const total = childTasks.length;
                      const done = childTasks.filter((t) =>
                        t.category === "routine" ? t.is_completed_today : t.is_completed
                      ).length;
                      const pending = total - done;
                      const pct = total > 0 ? (done / total) * 100 : 0;
                      const grad = avatarGradients[idx % avatarGradients.length];

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedChildId(p.id);
                            setChildModalTab("assigned");
                            setActiveModal("child_chores");
                          }}
                          className="group cursor-pointer rounded-xl p-3.5 sm:p-4 border border-white/10 bg-slate-900/90 hover:bg-slate-800/90 hover:border-sky-400 hover:-translate-y-0.5 transition-all duration-150 flex flex-col items-center text-center shadow-lg select-none"
                        >
                          <div
                            className={`w-12 h-12 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-lg font-black text-white shadow-md mb-2 group-hover:scale-105 transition-transform`}
                          >
                            {p.name.charAt(0)}
                          </div>

                          <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-sky-300 transition">
                            {p.name}
                          </h3>

                          <div className="text-[11px] text-slate-400 font-medium mb-2 leading-tight">
                            {total === 0 ? (
                              <span>No chores</span>
                            ) : pending === 0 ? (
                              <span className="text-emerald-400 font-bold">🎉 All {total} Done!</span>
                            ) : (
                              <span>
                                <strong className="text-sky-400">{done}/{total} Done</strong> • <span className="text-amber-400 font-semibold">{pending} Due</span>
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2.5">
                            <div
                              className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                            View chores <ChevronRight className="w-3.5 h-3.5" />
                          </span>
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
                          className="group cursor-pointer rounded-xl p-3.5 sm:p-4 border border-purple-500/40 bg-purple-950/20 hover:bg-purple-900/30 hover:border-purple-400 hover:-translate-y-0.5 transition-all duration-150 flex flex-col items-center text-center shadow-lg select-none"
                        >
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-lg font-black text-white shadow-md mb-2 group-hover:scale-105 transition-transform">
                            ⚡
                          </div>

                          <h3 className="text-base font-bold text-white mb-0.5 group-hover:text-purple-300 transition">
                            Up For Grabs
                          </h3>

                          <div className="text-[11px] text-purple-200 font-medium mb-2 leading-tight">
                            {openGrabs.length} Bounties • <strong className="text-emerald-400 font-bold">${grabsSum.toFixed(2)}</strong>
                          </div>

                          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2.5">
                            <div
                              className="h-full bg-gradient-to-r from-purple-400 to-emerald-400 rounded-full transition-all"
                              style={{ width: openGrabs.length > 0 ? "100%" : "0%" }}
                            />
                          </div>

                          <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                            Claim bounties <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-6 text-center text-xs text-slate-500">
                  Touch any profile above to inspect assigned chores, claim rewards, or post notes.
                </div>

                {/* MODAL 1: Child Chores Modal (Brought up when clicking a child's name) */}
                {activeModal === "child_chores" && selectedChildId && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 flex items-center justify-center">
                    <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[92%] overflow-y-auto">
                      {/* Modal Header */}
                      <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white shadow-md">
                            {selectedChildId === "up_for_grabs" ? "⚡" : activeChild?.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-xl text-white">
                              {selectedChildId === "up_for_grabs" ? "Up For Grabs Bounties" : `${activeChild?.name}'s Chores`}
                            </h3>
                            <p className="text-xs text-slate-400">
                              {selectedChildId === "up_for_grabs"
                                ? "Open tasks anyone in the family can claim & complete"
                                : `Tap the checkmark to mark as completed`}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setActiveModal(null);
                            setSelectedChildId(null);
                          }}
                          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 text-sm font-bold"
                          title="Close and return to kids screen"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Navigation Sub-Tabs (Child's Assigned Tasks vs Up For Grabs) */}
                      {selectedChildId !== "up_for_grabs" && (
                        <div className="flex gap-2 bg-black/40 p-1 rounded-xl">
                          <button
                            onClick={() => setChildModalTab("assigned")}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                              childModalTab === "assigned"
                                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {activeChild?.name}'s Tasks ({tasks.filter((t) => t.assigned_to === selectedChildId).length})
                          </button>
                          <button
                            onClick={() => setChildModalTab("up_for_grabs")}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                              childModalTab === "up_for_grabs"
                                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            ⚡ Available Up For Grabs ({tasks.filter((t) => t.assigned_to === "up_for_grabs" && !t.is_completed).length})
                          </button>
                        </div>
                      )}

                      {/* Task Items List */}
                      <div className="space-y-3">
                        {childTasks.length === 0 ? (
                          <div className="py-12 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                            <div className="text-3xl mb-2">🎉</div>
                            <p className="text-slate-300 font-medium">No chores here! All caught up!</p>
                          </div>
                        ) : (
                          childTasks.map((task) => {
                            const isRoutine = task.category === "routine";
                            const isDone = isRoutine ? Boolean(task.is_completed_today) : Boolean(task.is_completed);

                            return (
                              <div
                                key={task.id}
                                onClick={() => {
                                  setActiveTaskId(task.id);
                                  setActiveModal("task_detail");
                                }}
                                className={`group cursor-pointer rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 select-none ${
                                  isDone
                                    ? "bg-emerald-950/20 border-emerald-500/40 opacity-75"
                                    : "bg-slate-800/90 border-white/10 hover:border-sky-400 hover:bg-slate-750"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <h4
                                      className={`font-semibold text-base leading-snug text-white mb-2 ${
                                        isDone ? "line-through text-slate-400" : ""
                                      }`}
                                    >
                                      {task.title}
                                    </h4>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {isRoutine ? (
                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-400 uppercase tracking-wider">
                                          Routine Expectation
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                                          ${task.reward_amount.toFixed(2)} Bounty
                                        </span>
                                      )}

                                      {!isRoutine && task.is_completed && (
                                        task.is_approved ? (
                                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500 text-emerald-400">
                                            ✓ Approved for Payout
                                          </span>
                                        ) : (
                                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500 text-amber-400">
                                            ⏳ Needs Parent Approval
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </div>

                                  {/* Touch Complete Circle */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInitiateComplete(task.id);
                                    }}
                                    className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-lg font-bold transition shrink-0 ${
                                      isDone
                                        ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                                        : "border-white/20 hover:border-sky-400 bg-white/5 text-transparent"
                                    }`}
                                  >
                                    ✓
                                  </button>
                                </div>

                                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {task.notes.length} {task.notes.length === 1 ? "Note" : "Notes"}
                                  </span>

                                  {task.assigned_to === "up_for_grabs" && selectedChildId !== "up_for_grabs" ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClaimChore(task.id);
                                      }}
                                      className="bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      Claim for {activeChild?.name}
                                    </button>
                                  ) : (
                                    <span className="text-slate-500 group-hover:text-sky-400 transition flex items-center gap-1">
                                      Tap for notes &amp; details <ChevronRight className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL 2: Task Detail & Threaded Notes Modal */}
                {activeModal === "task_detail" && activeTask && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 flex items-center justify-center">
                    <div className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-4 shadow-2xl max-h-full overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <h3 className="font-bold text-lg text-white">{activeTask.title}</h3>
                        <button
                          onClick={() => {
                            if (selectedChildId) {
                              setActiveModal("child_chores");
                            } else {
                              setActiveModal(null);
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="bg-white/5 rounded-xl p-3.5 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Type:</span>
                          <strong className={activeTask.category === "routine" ? "text-sky-400" : "text-emerald-400"}>
                            {activeTask.category === "routine" ? "Routine Expectation" : "Monetized Bounty"}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Reward:</span>
                          <strong className="text-emerald-400 font-bold">
                            {activeTask.category === "routine" ? "$0.00" : `$${activeTask.reward_amount.toFixed(2)}`}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Assigned To:</span>
                          <strong className="text-white">
                            {activeTask.assigned_to === "up_for_grabs"
                              ? "⚡ Up For Grabs"
                              : profiles.find((p) => p.id === activeTask.assigned_to)?.name || "Assigned"}
                          </strong>
                        </div>
                      </div>

                      {/* Action Buttons: Claim Chore & Complete Chore */}
                      <div className="flex flex-wrap gap-2.5">
                        {activeTask.assigned_to === "up_for_grabs" && selectedChildId && selectedChildId !== "up_for_grabs" && (
                          <button
                            onClick={() => handleClaimChore(activeTask.id)}
                            className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Claim for {activeChild?.name}
                          </button>
                        )}

                        {(() => {
                          const isDone = activeTask.category === "routine"
                            ? Boolean(activeTask.is_completed_today)
                            : Boolean(activeTask.is_completed);

                          return (
                            <button
                              onClick={() => {
                                handleInitiateComplete(activeTask.id);
                              }}
                              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md ${
                                isDone
                                  ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                              }`}
                            >
                              {isDone ? "↩ Mark as Incomplete" : "✓ Mark as Completed"}
                            </button>
                          );
                        })()}
                      </div>

                      {/* Notes Thread */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                          Threaded Notes &amp; Updates
                        </h4>
                        <div className="bg-black/40 border border-white/10 rounded-xl p-3 max-h-48 overflow-y-auto space-y-2">
                          {activeTask.notes.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-2">
                              No notes posted yet. Leave instructions or completion updates!
                            </p>
                          ) : (
                            activeTask.notes.map((n, i) => (
                              <div
                                key={i}
                                className={`p-2.5 rounded-lg text-xs ${
                                  n.author.toLowerCase().includes("parent")
                                    ? "bg-purple-950/40 border-l-2 border-purple-500"
                                    : "bg-slate-800 border-l-2 border-sky-400"
                                }`}
                              >
                                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                                  <strong className="text-white">{n.author}</strong>
                                  <span>{new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                                <p className="text-slate-200">{n.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Add Note */}
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add note..."
                            value={customNoteText}
                            onChange={(e) => setCustomNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddNote(activeTask.id, customNoteText);
                            }}
                            className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                          />
                          <button
                            onClick={() => handleAddNote(activeTask.id, customNoteText)}
                            className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL: Who Completed This? (Attribution Modal for Up For Grabs / Unassigned Chores) */}
                {activeModal === "who_completed" && completingTask && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 flex items-center justify-center animate-in fade-in duration-150">
                    <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4 shadow-2xl">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-sm font-bold">
                            ⭐
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-white">Who completed this chore?</h3>
                            <p className="text-[11px] text-purple-300 font-medium">Select who gets the credit &amp; reward</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setCompletingTaskId(null);
                            if (selectedChildId) {
                              setActiveModal("child_chores");
                            } else {
                              setActiveModal(null);
                            }
                          }}
                          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Task Summary Banner */}
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-xs text-white">{completingTask.title}</div>
                          <div className="text-[11px] text-slate-400">
                            {completingTask.category === "routine" ? "Routine Expectation" : "Up For Grabs Bounty"}
                          </div>
                        </div>
                        <div className="text-emerald-400 font-bold text-sm px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                          {completingTask.category === "routine" ? "$0.00" : `$${completingTask.reward_amount.toFixed(2)}`}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 font-medium">
                        Touch the kid who finished this task:
                      </p>

                      {/* Grid of Children */}
                      <div className="grid grid-cols-3 gap-2.5">
                        {profiles.map((p, idx) => {
                          const grad = avatarGradients[idx % avatarGradients.length];
                          return (
                            <button
                              key={p.id}
                              onClick={() => handleCompleteAsChild(completingTask.id, p.id)}
                              className="group p-2.5 rounded-xl border border-white/10 bg-slate-800/80 hover:bg-slate-750 hover:border-sky-400 hover:scale-105 transition-all flex flex-col items-center gap-1.5 cursor-pointer shadow-md text-center"
                            >
                              <div
                                className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-sm font-black text-white shadow-md group-hover:shadow-sky-500/30 transition`}
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
                        onClick={() => {
                          setCompletingTaskId(null);
                          if (selectedChildId) {
                            setActiveModal("child_chores");
                          } else {
                            setActiveModal(null);
                          }
                        }}
                        className="w-full py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* MODAL 3: 4-Digit PIN Keypad */}
                {activeModal === "pin_pad" && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 flex items-center justify-center">
                    <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-xs p-6 flex flex-col items-center gap-4 shadow-2xl">
                      <div className="w-full flex justify-between items-center">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <Lock className="w-4 h-4 text-sky-400" />
                          Parent Access
                        </div>
                        <button
                          onClick={() => {
                            setActiveModal(null);
                            setPinInput("");
                          }}
                          className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-300"
                        >
                          ✕
                        </button>
                      </div>

                      <p className="text-xs text-slate-400 text-center">
                        Enter your 4-digit security PIN to unlock administrative controls.
                      </p>

                      <div className="flex gap-3 my-2">
                        {[0, 1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${
                              idx < pinInput.length
                                ? "bg-sky-400 border-sky-400 scale-110 shadow-lg shadow-sky-400/50"
                                : "border-slate-600 bg-transparent"
                            }`}
                          />
                        ))}
                      </div>

                      {pinError && <div className="text-xs text-red-400 font-semibold">{pinError}</div>}

                      <div className="grid grid-cols-3 gap-2.5 w-full">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"].map((k) => (
                          <button
                            key={k}
                            onClick={() => handlePinKey(k)}
                            className={`h-14 rounded-2xl font-bold flex items-center justify-center active:scale-95 transition ${
                              k === "Clear" || k === "⌫"
                                ? "bg-white/5 hover:bg-white/10 text-slate-400 text-xs"
                                : "bg-white/10 hover:bg-white/20 text-white text-xl"
                            }`}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL 4: Parent Administration Console */}
                {activeModal === "parent_panel" && (
                  <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 p-4 flex items-center justify-center">
                    <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[92%] overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">👑</span>
                          <h3 className="font-bold text-lg text-white">Parent Administration Console</h3>
                        </div>
                        <button
                          onClick={() => {
                            setIsParentUnlocked(false);
                            setActiveModal(null);
                          }}
                          className="bg-white/10 hover:bg-white/20 text-slate-300 font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Lock &amp; Exit
                        </button>
                      </div>

                      {/* Parent Console Tabs */}
                      <div className="flex bg-black/40 p-1 rounded-xl gap-1">
                        {[
                          { id: "approvals", label: "Approvals" },
                          { id: "create_task", label: "Create Chore" },
                          { id: "payout_engine", label: "Payout & Audit" },
                          { id: "history", label: "Payout Ledger" }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setParentActiveTab(tab.id as any)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                              parentActiveTab === tab.id
                                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Approvals Tab */}
                      {parentActiveTab === "approvals" && (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-400">
                            Review completed monetized chores before they become eligible for allowance payouts.
                          </p>

                          {tasks.filter((t) => t.category === "monetized" && t.is_completed && !t.is_approved).length === 0 ? (
                            <div className="p-8 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                              <span className="text-2xl block mb-1">✨</span>
                              <span className="text-xs text-slate-400">No monetized chores waiting for parent approval!</span>
                            </div>
                          ) : (
                            tasks
                              .filter((t) => t.category === "monetized" && t.is_completed && !t.is_approved)
                              .map((t) => {
                                const child = profiles.find((p) => p.id === t.assigned_to);
                                return (
                                  <div
                                    key={t.id}
                                    className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3"
                                  >
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-bold text-white text-sm">{t.title}</h4>
                                        <p className="text-xs text-slate-400">
                                          Completed by: <strong className="text-sky-400">{child?.name || "Unassigned"}</strong>
                                        </p>
                                      </div>
                                      <div className="text-lg font-black text-emerald-400">
                                        ${t.reward_amount.toFixed(2)}
                                      </div>
                                    </div>

                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleApprove(t.id)}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Approve (${t.reward_amount.toFixed(2)})
                                      </button>
                                      <button
                                        onClick={() => handleRequestRevision(t.id)}
                                        className="bg-white/10 hover:bg-white/20 text-slate-300 font-semibold py-2 px-3 rounded-xl text-xs"
                                      >
                                        Needs Revision
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      )}

                      {/* Chore Creation Tab */}
                      {parentActiveTab === "create_task" && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-bold text-slate-300 block mb-1">Chore Title</label>
                            <input
                              type="text"
                              value={newTitle}
                              onChange={(e) => setNewTitle(e.target.value)}
                              placeholder="e.g., Wash family car, Clean room..."
                              className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-bold text-slate-300 block mb-1">Category</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setNewCategory("routine")}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                                  newCategory === "routine"
                                    ? "bg-sky-500/20 border-sky-400 text-sky-300"
                                    : "bg-white/5 border-white/10 text-slate-400"
                                }`}
                              >
                                Routine Expectation ($0.00)
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewCategory("monetized")}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
                                  newCategory === "monetized"
                                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                                    : "bg-white/5 border-white/10 text-slate-400"
                                }`}
                              >
                                Monetized Bounty ($)
                              </button>
                            </div>
                          </div>

                          {newCategory === "monetized" ? (
                            <div>
                              <label className="text-xs font-bold text-slate-300 block mb-1">Reward Amount ($)</label>
                              <input
                                type="number"
                                step="0.50"
                                value={newReward}
                                onChange={(e) => setNewReward(e.target.value)}
                                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="text-xs font-bold text-slate-300 block mb-1">Recurrence Days</label>
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
                                      className={`flex-1 py-2 rounded-lg text-xs font-bold border ${
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
                            </div>
                          )}

                          <div>
                            <label className="text-xs font-bold text-slate-300 block mb-1">Assign To</label>
                            <select
                              value={newAssignedTo}
                              onChange={(e) => setNewAssignedTo(e.target.value)}
                              className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
                            >
                              <option value="up_for_grabs">⚡ Up For Grabs (Open Bounty)</option>
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  👤 {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={handleCreateChore}
                            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/20"
                          >
                            <Plus className="w-4 h-4" />
                            Publish Chore to Mirror Screen
                          </button>
                        </div>
                      )}

                      {/* Payout Tab */}
                      {parentActiveTab === "payout_engine" && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-300">Select Child:</label>
                            <select
                              value={payoutProfileId}
                              onChange={(e) => setPayoutProfileId(e.target.value)}
                              className="bg-black/50 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white flex-1"
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
                                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 flex justify-between items-center">
                                  <div>
                                    <div className="text-[11px] font-bold uppercase text-emerald-400">
                                      Verified Total Payout Due
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {approved.length} approved chores ready for payout
                                    </div>
                                  </div>
                                  <div className="text-3xl font-black text-emerald-400">
                                    ${total.toFixed(2)}
                                  </div>
                                </div>

                                {approved.length > 0 && (
                                  <button
                                    onClick={handleProcessPayout}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                                  >
                                    <DollarSign className="w-4 h-4" />
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
                        <div className="space-y-3">
                          {payouts.map((rec) => {
                            const prof = profiles.find((p) => p.id === rec.profile_id);
                            return (
                              <div
                                key={rec.id}
                                className="p-3.5 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center text-xs"
                              >
                                <div>
                                  <div className="font-bold text-white text-sm">
                                    👤 {prof?.name || rec.profile_id}
                                  </div>
                                  <div className="text-slate-400 text-[11px] mt-0.5">
                                    Ref: <code className="text-sky-300">{rec.id}</code> • {new Date(rec.processed_timestamp).toLocaleDateString()}
                                  </div>
                                </div>
                                <div className="text-lg font-black text-emerald-400">
                                  ${rec.total_amount.toFixed(2)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
 * Clicking a child opens the full chore modal.
 */
Module.register("MMM-ChoreTracker", {
  defaults: {
    title: "Family Chore Tracker",
    currencySymbol: "$",
    parentPin: "1234",
    pollInterval: 60000,
    showCompletedTasks: true,
    databaseDirectory: "data"
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-choretracker";
    wrapper.appendChild(this.buildHeader());
    wrapper.appendChild(this.buildKidsDashboard()); // Kids Dashboard view

    if (this.activeModal === "child_chores" && this.selectedProfileId) {
      wrapper.appendChild(this.buildChildChoresModal(this.selectedProfileId));
    }
    return wrapper;
  },

  buildKidsDashboard: function () {
    // Generates the prominent touch cards for Alex, Maya, Leo & Up For Grabs
    ...
  },

  buildChildChoresModal: function (childId) {
    // Generates the modal with that specific child's chore list
    ...
  }
});`}

                {selectedFile === "node_helper.js" && `/**
 * MMM-ChoreTracker - node_helper.js
 * Atomic file persistence with lowdb v1 + write-file-atomic fsync adapter.
 */
const fs = require("fs");
const path = require("path");
const writeFileAtomic = require("write-file-atomic");
const low = require("lowdb");
const { v4: uuidv4 } = require("uuid");
const NodeHelper = require("node_helper");

class AtomicFileSync { ... }
module.exports = NodeHelper.create({ ... });`}

                {selectedFile === "MMM-ChoreTracker.css" && `/* Kids Dashboard styles with large touch targets */
.ct-kids-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}
.ct-kid-card { ... }
.ct-kid-avatar { ... }
...`}

                {selectedFile === "package.json" && `{\n  "name": "MMM-ChoreTracker",\n  "version": "1.0.0",\n  "dependencies": {\n    "lowdb": "^1.0.0",\n    "uuid": "^9.0.0",\n    "write-file-atomic": "^5.0.0"\n  }\n}`}
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
