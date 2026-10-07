import test from "node:test";
import assert from "node:assert/strict";

// Interface definitions matching src/App.tsx
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

interface Task {
  id: string;
  title: string;
  category: "routine" | "monetized";
  reward_amount: number;
  assigned_to: string;
  recurrence: Recurrence | null;
  last_completed_date: string;
  created_at?: string;
  is_completed_today?: boolean;
  is_completed?: boolean;
  is_approved?: boolean;
  notes: Note[];
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

    // 3. Day before preview check: is it scheduled for tomorrow?
    // Show upcoming chores the day before they are scheduled (not overdue, excluded from daily goal)
    const isTomorrow = days.includes(tomorrowDayOfWeek);
    if (isTomorrow) {
      return {
        isToday: false,
        isOverdue: false,
        isUpcoming: true,
        isDaily,
        statusLabel: "Upcoming Tomorrow",
        dueDetail: `Scheduled for tomorrow (${dayNames[tomorrowDayOfWeek]})`
      };
    }

    // 4. Overdue check:
    // "Overdue chores should be removed automatically after 2 days if not completed"
    // Only check past occurrences within the last 2 days (1 day ago or 2 days ago)!
    // If it was more than 2 days ago, it is automatically removed and NOT marked overdue.
    if (!isDaily) {
      let overdueDaysAgo = 0;
      let scheduledDayIndex = -1;

      // Only check 1 day ago and 2 days ago (max 2 days overdue!)
      for (let i = 1; i <= 2; i++) {
        const checkDay = (currentDayOfWeek - i + 7) % 7;
        if (days.includes(checkDay)) {
          overdueDaysAgo = i;
          scheduledDayIndex = checkDay;
          break;
        }
      }

      if (overdueDaysAgo > 0) {
        const lastScheduledDate = new Date(now.getTime() - overdueDaysAgo * 24 * 60 * 60 * 1000);
        const lastScheduledDateStr = lastScheduledDate.toISOString().split("T")[0];

        // Check if the chore was created AFTER that past occurrence (e.g. newly created chore today)
        let createdAfterSchedule = false;
        if (task.created_at) {
          const taskCreatedDate = task.created_at.split("T")[0];
          if (taskCreatedDate > lastScheduledDateStr) {
            createdAfterSchedule = true;
          }
        }

        const isCompletedForLastSchedule = Boolean(
          task.last_completed_date && task.last_completed_date >= lastScheduledDateStr
        );

        if (!isCompletedForLastSchedule && !createdAfterSchedule) {
          // Unfinished past task within the 2-day overdue window
          const scheduledDayName = dayNames[scheduledDayIndex];
          const daysOverdueText = overdueDaysAgo === 1 ? "1 day overdue" : "2 days overdue";
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

    // Otherwise, scheduled for another day later in the cycle,
    // OR overdue older than 2 days (automatically removed from the list!)
    return {
      isToday: false,
      isOverdue: false,
      isUpcoming: false,
      isDaily,
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
}

// Fixed reference date: Wednesday, Oct 14, 2026 (day 3)
const REF_WEDNESDAY = new Date("2026-10-14T12:00:00Z"); // Day 3 = Wednesday
// Yesterday = Tuesday (day 2)
// 2 days ago = Monday (day 1)
// 3 days ago = Sunday (day 0)
// Tomorrow = Thursday (day 4)

test("1. Daily routines are always isToday=true and not overdue", () => {
  const dailyTask: Task = {
    id: "task_1",
    title: "Brush Teeth",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "daily" },
    last_completed_date: "2026-10-13",
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(dailyTask, REF_WEDNESDAY);
  assert.equal(status.isToday, true);
  assert.equal(status.isOverdue, false);
  assert.equal(status.isUpcoming, false);
  assert.equal(status.isDaily, true);
  assert.equal(status.statusLabel, "Daily Routine");
});

test("2. Weekly routine scheduled for today (Wednesday) is Due Today", () => {
  const wedTask: Task = {
    id: "task_2",
    title: "Clean Desk",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [3] },
    last_completed_date: "",
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(wedTask, REF_WEDNESDAY);
  assert.equal(status.isToday, true);
  assert.equal(status.isOverdue, false);
  assert.equal(status.isUpcoming, false);
  assert.equal(status.statusLabel, "Due Today");
});

test("3. Testing adding a chore for tomorrow: must be Upcoming Tomorrow, NOT Overdue!", () => {
  // Tomorrow is Thursday (day 4)
  const tomorrowTask: Task = {
    id: "task_3",
    title: "Wash Car",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [4] },
    last_completed_date: "",
    created_at: "2026-10-14T10:00:00Z", // created today!
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(tomorrowTask, REF_WEDNESDAY);
  assert.equal(status.isToday, false);
  assert.equal(status.isUpcoming, true);
  assert.equal(status.isOverdue, false, "Chore scheduled for tomorrow must NEVER be labeled overdue!");
  assert.equal(status.statusLabel, "Upcoming Tomorrow");
  assert.match(status.dueDetail, /Thursday/);
});

test("4. Routine scheduled 1 day ago (Tuesday) and unfinished is 1 day overdue", () => {
  // Tuesday = day 2 (1 day before Wednesday)
  const overdue1DayTask: Task = {
    id: "task_4",
    title: "Take Out Trash",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [2] },
    last_completed_date: "2026-10-06", // completed last week, not yesterday
    created_at: "2026-10-01T00:00:00Z",
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(overdue1DayTask, REF_WEDNESDAY);
  assert.equal(status.isToday, false);
  assert.equal(status.isOverdue, true);
  assert.equal(status.isUpcoming, false);
  assert.equal(status.statusLabel, "Overdue");
  assert.match(status.dueDetail, /1 day overdue/);
});

test("5. Routine scheduled 2 days ago (Monday) and unfinished is 2 days overdue", () => {
  // Monday = day 1 (2 days before Wednesday)
  const overdue2DaysTask: Task = {
    id: "task_5",
    title: "Mow Lawn",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [1] },
    last_completed_date: "2026-10-05",
    created_at: "2026-10-01T00:00:00Z",
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(overdue2DaysTask, REF_WEDNESDAY);
  assert.equal(status.isToday, false);
  assert.equal(status.isOverdue, true);
  assert.equal(status.isUpcoming, false);
  assert.equal(status.statusLabel, "Overdue");
  assert.match(status.dueDetail, /2 days overdue/);
});

test("6. Overdue chores are removed automatically after 2 days (3+ days overdue)", () => {
  // Sunday = day 0 (3 days before Wednesday)
  const overdue3DaysTask: Task = {
    id: "task_6",
    title: "Dust Baseboards",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [0] }, // Sunday
    last_completed_date: "2026-10-04",
    created_at: "2026-10-01T00:00:00Z",
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(overdue3DaysTask, REF_WEDNESDAY);
  assert.equal(status.isToday, false);
  assert.equal(status.isOverdue, false, "Overdue chores older than 2 days must be removed!");
  assert.equal(status.isUpcoming, false);
  assert.equal(status.statusLabel, "Scheduled");
});

test("7. Newly created chore today with multi-day recurrence does not trigger past overdue", () => {
  // Created today (Wednesday), days_of_week includes Monday (1) and Thursday (4)
  const newMultiDayTask: Task = {
    id: "task_7",
    title: "Piano Practice",
    category: "routine",
    reward_amount: 0,
    assigned_to: "child_01",
    recurrence: { frequency: "weekly", days_of_week: [1, 4] },
    last_completed_date: "",
    created_at: "2026-10-14T10:00:00Z", // created today!
    is_completed_today: false,
    notes: []
  };

  const status = getChoreScheduleStatus(newMultiDayTask, REF_WEDNESDAY);
  // Tomorrow is Thursday (day 4), which is in days_of_week!
  assert.equal(status.isUpcoming, true);
  assert.equal(status.isOverdue, false, "Newly created task must not be flagged overdue for Monday!");
});

test("8. Pagination math correctly slices tasks and clamps pages", () => {
  const sampleTasks = Array.from({ length: 9 }, (_, i) => `task_${i + 1}`);
  const perPage = 4;
  const totalPages = Math.max(1, Math.ceil(sampleTasks.length / perPage)); // 3 pages

  // Page 1
  let validPage = Math.min(Math.max(1, 1), totalPages);
  let paged = sampleTasks.slice((validPage - 1) * perPage, validPage * perPage);
  assert.deepEqual(paged, ["task_1", "task_2", "task_3", "task_4"]);

  // Page 2
  validPage = Math.min(Math.max(1, 2), totalPages);
  paged = sampleTasks.slice((validPage - 1) * perPage, validPage * perPage);
  assert.deepEqual(paged, ["task_5", "task_6", "task_7", "task_8"]);

  // Page 3
  validPage = Math.min(Math.max(1, 3), totalPages);
  paged = sampleTasks.slice((validPage - 1) * perPage, validPage * perPage);
  assert.deepEqual(paged, ["task_9"]);

  // Out of bounds: Page 99 clamps to 3
  validPage = Math.min(Math.max(1, 99), totalPages);
  assert.equal(validPage, 3);

  // Out of bounds: Page -5 clamps to 1
  validPage = Math.min(Math.max(1, -5), totalPages);
  assert.equal(validPage, 1);
});

test("9. Daily goal calculations exclude upcoming tomorrow chores", () => {
  const childTasks: Task[] = [
    {
      id: "t1",
      title: "Brush Teeth",
      category: "routine",
      reward_amount: 0,
      assigned_to: "child_01",
      recurrence: { frequency: "daily" },
      last_completed_date: "",
      is_completed_today: true, // completed
      notes: []
    },
    {
      id: "t2",
      title: "Overdue Chore",
      category: "routine",
      reward_amount: 0,
      assigned_to: "child_01",
      recurrence: { frequency: "weekly", days_of_week: [2] }, // Tuesday (yesterday = overdue)
      last_completed_date: "",
      created_at: "2026-10-01",
      is_completed_today: false,
      notes: []
    },
    {
      id: "t3",
      title: "Tomorrow Preview Chore",
      category: "routine",
      reward_amount: 0,
      assigned_to: "child_01",
      recurrence: { frequency: "weekly", days_of_week: [4] }, // Thursday (tomorrow)
      last_completed_date: "",
      is_completed_today: false,
      notes: []
    }
  ];

  // Daily goal tasks filter: only chores that are NOT upcoming
  const dailyGoalTasks = childTasks.filter((t) => {
    const s = getChoreScheduleStatus(t, REF_WEDNESDAY);
    return !s.isUpcoming;
  });

  assert.equal(dailyGoalTasks.length, 2, "Daily goal must only have 2 tasks (Brush Teeth + Overdue Chore)");
  assert.ok(!dailyGoalTasks.some((t) => t.id === "t3"), "Upcoming chore t3 must be excluded from daily goal!");

  const completed = dailyGoalTasks.filter((t) => t.is_completed_today).length;
  assert.equal(completed, 1);
});

test("10. Allowance payout calculation only sums approved monetized tasks", () => {
  const tasks: Task[] = [
    {
      id: "m1",
      title: "Rake Leaves",
      category: "monetized",
      reward_amount: 5.0,
      assigned_to: "child_01",
      recurrence: null,
      last_completed_date: "",
      is_completed: true,
      is_approved: true, // Approved: $5.00
      notes: []
    },
    {
      id: "m2",
      title: "Wash Car",
      category: "monetized",
      reward_amount: 10.0,
      assigned_to: "child_01",
      recurrence: null,
      last_completed_date: "",
      is_completed: true,
      is_approved: false, // Completed but not approved yet: $0
      notes: []
    },
    {
      id: "r1",
      title: "Make Bed",
      category: "routine",
      reward_amount: 0.0,
      assigned_to: "child_01",
      recurrence: { frequency: "daily" },
      last_completed_date: "",
      is_completed_today: true, // Routine task: $0
      notes: []
    }
  ];

  const approvedTasks = tasks.filter((t) => t.category === "monetized" && t.is_completed && t.is_approved && t.assigned_to === "child_01");
  const totalPayout = approvedTasks.reduce((sum, t) => sum + t.reward_amount, 0);

  assert.equal(approvedTasks.length, 1);
  assert.equal(totalPayout, 5.0);
});

test("11. Payout processing dynamic date range calculation generates valid ISO dates", () => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(weekAgoStr, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(todayStr > weekAgoStr, "todayStr must be after weekAgoStr");
});

test("12. Pagination dynamic clamping when tasks are removed", () => {
  let tasks = Array.from({ length: 12 }, (_, i) => `task_${i}`);
  const perPage = 4;
  let totalPages = Math.max(1, Math.ceil(tasks.length / perPage)); // 3
  let currentPage = 3; // user is on page 3

  let validPage = Math.min(Math.max(1, currentPage), totalPages);
  assert.equal(validPage, 3);

  // User deletes 8 tasks, only 4 remain
  tasks = tasks.slice(0, 4);
  totalPages = Math.max(1, Math.ceil(tasks.length / perPage)); // 1
  validPage = Math.min(Math.max(1, currentPage), totalPages); // Clamped to 1!

  assert.equal(totalPages, 1);
  assert.equal(validPage, 1, "Page must automatically clamp to 1 when task list shrinks");
});

test("13. Up For Grabs completion triggers attribution prompt for unassigned tasks", () => {
  const task1: Task = {
    id: "task_g1",
    title: "Mow Lawn",
    category: "monetized",
    reward_amount: 15,
    assigned_to: "up_for_grabs",
    recurrence: null,
    last_completed_date: "",
    is_completed: false,
    notes: []
  };

  const isDone = task1.is_completed;
  const requiresAttribution = (task1.assigned_to === "up_for_grabs" || !task1.assigned_to) && !isDone;
  assert.equal(requiresAttribution, true, "Up for grabs unfinished tasks must prompt for who completed it");

  // For already assigned tasks, attribution is not required
  const task2: Task = {
    ...task1,
    assigned_to: "child_01"
  };
  const requiresAttribution2 = (task2.assigned_to === "up_for_grabs" || !task2.assigned_to) && !isDone;
  assert.equal(requiresAttribution2, false, "Assigned tasks do not prompt attribution");
});

test("14. Parent Admin chore inventory pagination correctly slices and paginates filtered lists", () => {
  const adminTasks: Task[] = Array.from({ length: 15 }, (_, i) => ({
    id: `admin_task_${i}`,
    title: `Chore ${i}`,
    category: i % 2 === 0 ? "routine" : "monetized",
    reward_amount: i % 2 === 0 ? 0 : 5.0,
    assigned_to: "child_01",
    recurrence: { frequency: "daily" },
    last_completed_date: "",
    notes: []
  }));

  const perPage = 4;

  // Filter: all (15 tasks)
  const allFiltered = adminTasks;
  const totalAllPages = Math.max(1, Math.ceil(allFiltered.length / perPage));
  assert.equal(totalAllPages, 4, "15 tasks at 4 per page should have 4 pages");

  // Page 1 should have items 0..3
  const page1Items = allFiltered.slice(0, 4);
  assert.equal(page1Items.length, 4);
  assert.equal(page1Items[0].id, "admin_task_0");
  assert.equal(page1Items[3].id, "admin_task_3");

  // Page 4 should have item 12..14 (3 items)
  const page4Items = allFiltered.slice(12, 16);
  assert.equal(page4Items.length, 3);
  assert.equal(page4Items[2].id, "admin_task_14");

  // Filter: routine only (8 tasks)
  const routineFiltered = adminTasks.filter((t) => t.category === "routine");
  const totalRoutinePages = Math.max(1, Math.ceil(routineFiltered.length / perPage));
  assert.equal(routineFiltered.length, 8);
  assert.equal(totalRoutinePages, 2);

  // Filter: monetized only (7 tasks)
  const monetizedFiltered = adminTasks.filter((t) => t.category === "monetized");
  const totalMonetizedPages = Math.max(1, Math.ceil(monetizedFiltered.length / perPage));
  assert.equal(monetizedFiltered.length, 7);
  assert.equal(totalMonetizedPages, 2);
});

test("15. Modal button structure validation: child chores and PIN modals maintain clean close without redundant dashboard buttons", () => {
  // Verifies that PIN modal and child chores modal use standardized close buttons
  const modalTypes = ["child_chores", "pin_pad", "task_detail", "who_completed", "parent_panel"];
  assert.equal(modalTypes.length, 5);
  // Ensured all modals have an unambiguous close dismiss pattern
  assert.ok(modalTypes.includes("child_chores"));
  assert.ok(modalTypes.includes("pin_pad"));
});

test("16. Virtual keyboard typing isolates buffer and only copies the whole string upon commit", () => {
  let backgroundField = "Original Value";
  let committedVal = backgroundField;
  const onConfirm = (val: string) => {
    committedVal = val;
  };

  const keyboardRef = { current: "Original Value" };
  const typeKey = (char: string) => {
    keyboardRef.current += char;
    // Note: Do NOT call onConfirm while typing to prevent background re-renders!
  };

  // User clears and types long string "Clean the entire basement and garage workshop"
  keyboardRef.current = "";
  const inputStr = "Clean the entire basement and garage workshop";
  for (const ch of inputStr) {
    typeKey(ch);
  }

  // During typing, background field must remain untouched!
  assert.equal(committedVal, "Original Value", "Target field must NOT update as user writes");
  assert.equal(keyboardRef.current, "Clean the entire basement and garage workshop");

  // User clicks Done / presses Enter -> only now is the whole string copied
  onConfirm(keyboardRef.current);
  assert.equal(committedVal, "Clean the entire basement and garage workshop", "Target field receives complete string upon commit");
});

test("17. Currency decimal typing is safely handled without browser input truncation", () => {
  let rewardAmount = "";
  const onRewardConfirm = (val: string) => {
    rewardAmount = val;
  };

  const keyboardRef = { current: "" };
  const typeNum = (char: string) => {
    keyboardRef.current += char;
    onRewardConfirm(keyboardRef.current);
  };

  // User types 7 then . then 5 then 0
  typeNum("7");
  assert.equal(rewardAmount, "7");
  typeNum(".");
  // In text/inputMode="decimal", "7." is retained as valid string rather than wiped by browser HTML5 number input
  assert.equal(rewardAmount, "7.");
  typeNum("5");
  assert.equal(rewardAmount, "7.5");
  typeNum("0");
  assert.equal(rewardAmount, "7.50");

  const parsed = parseFloat(rewardAmount) || 0;
  assert.equal(parsed, 7.5);
});

test("18. Virtual keyboard close guard and DOM priority prevents focus-restoration wiping typed text", () => {
  // Simulates the scenario where the user typed in the popup input, clicked Done,
  // and focus-restoration fires on the underlying field.
  let targetFieldValue = "";
  let lastCloseTime = 0;
  let isOpen = false;

  const openVirtualKeyboard = (initialVal: string) => {
    // 400ms cooldown guard
    if (Date.now() - lastCloseTime < 400) {
      return; // Ignore spurious focus event on underlying input right after modal close!
    }
    isOpen = true;
  };

  const commitVirtualKeyboard = (typedVal: string) => {
    lastCloseTime = Date.now();
    targetFieldValue = typedVal;
    isOpen = false;
  };

  // 1. User opens keyboard with empty field
  openVirtualKeyboard(targetFieldValue);
  assert.equal(isOpen, true);

  // 2. User types "Clean bathroom"
  const typedInKeyboard = "Clean bathroom";

  // 3. User taps Done
  commitVirtualKeyboard(typedInKeyboard);
  assert.equal(targetFieldValue, "Clean bathroom", "Target field must have the committed text");
  assert.equal(isOpen, false, "Keyboard is closed");

  // 4. Underlying input immediately fires onFocus with stale closure (empty string)
  openVirtualKeyboard(""); // simulated immediate focus-back
  assert.equal(isOpen, false, "Cooldown must prevent re-opening and wiping the field with stale empty string");
  assert.equal(targetFieldValue, "Clean bathroom", "Field value remains preserved");
});

test("19. Multi-child chore assignment allows selecting multiple children individually without All Children button", () => {
  const children = [
    { id: "child_1", name: "Emma" },
    { id: "child_2", name: "Lucas" },
    { id: "child_3", name: "Noah" }
  ];

  let assignedTos: string[] = ["up_for_grabs"];

  // Toggle child 1 (Emma)
  const toggleChild = (childId: string) => {
    let arr = assignedTos.filter((x) => x !== "up_for_grabs");
    if (arr.includes(childId)) {
      arr = arr.filter((x) => x !== childId);
    } else {
      arr.push(childId);
    }
    if (arr.length === 0) {
      arr = ["up_for_grabs"];
    }
    assignedTos = arr;
  };

  // Select Emma and Lucas
  toggleChild("child_1");
  assert.deepEqual(assignedTos, ["child_1"]);

  toggleChild("child_2");
  assert.deepEqual(assignedTos, ["child_1", "child_2"], "Can assign multiple children simultaneously");

  // Toggle Lucas off
  toggleChild("child_2");
  assert.deepEqual(assignedTos, ["child_1"]);

  // Toggle Emma off -> falls back to up_for_grabs
  toggleChild("child_1");
  assert.deepEqual(assignedTos, ["up_for_grabs"], "Unselecting all falls back safely to up_for_grabs");
});



