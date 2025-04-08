// Check if we're running in a Tauri environment
const isTauri = window.__TAURI__ !== undefined;

// Import Tauri APIs if available
let invoke;
let emit;
let listen;
let WebviewWindow; // Keep this if needed for window interactions

if (isTauri) {
  try {
    // Dynamically import necessary Tauri modules
    const tauriCore = window.__TAURI__.core;
    const tauriEvent = window.__TAURI__.event;
    const tauriWindow = window.__TAURI__.window;

    invoke = tauriCore.invoke;
    emit = tauriEvent.emit;
    listen = tauriEvent.listen;
    WebviewWindow = tauriWindow.WebviewWindow; // Assign if needed

    console.log('Calendar: Tauri environment detected. APIs initialized.');

  } catch (e) {
    console.error('Calendar: Error initializing Tauri APIs:', e);
    // Fallback or error handling if APIs aren't available as expected
    isTauri = false; // Assume not Tauri if init fails
  }
} else {
  console.warn('Calendar: Not running in a Tauri environment.');
  // Provide mock functions for web environment if needed for basic testing
  invoke = async (cmd, args) => { console.warn(`Mock invoke: ${cmd}`, args); return []; };
  emit = (evt, payload) => console.warn(`Mock emit: ${evt}`, payload);
  listen = (evt, handler) => console.warn(`Mock listen registration: ${evt}`);
  // WebviewWindow would typically be undefined here
}


// --- DOM Elements ---
const unassignedTasksList = document.getElementById('unassigned-tasks');
const dayColumns = document.querySelectorAll('.day-column');
const taskLists = document.querySelectorAll('.task-list'); // Includes unassigned

// --- State ---
let tasks = []; // Will hold all tasks (active, non-deleted)
let draggedItem = null; // To keep track of the item being dragged

// --- Functions ---

/**
 * Renders a single task item.
 * @param {object} task - The task object.
 * @returns {HTMLElement} - The list item element.
 */
function createTaskElement(task) {
    const li = document.createElement('li');
    li.textContent = task.text;
    li.classList.add('task-item');
    li.draggable = true;
    li.dataset.taskId = task.id; // Store task ID
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragend', handleDragEnd);
    return li;
}

/**
 * Renders all tasks into the appropriate lists (unassigned or day columns).
 */
function renderTasks() {
    // Clear existing tasks from all lists
    taskLists.forEach(list => list.innerHTML = '');

    tasks.forEach(task => {
        const taskElement = createTaskElement(task);
        if (task.calendarDay) {
            const targetList = document.getElementById(`${task.calendarDay.toLowerCase()}-tasks`);
            if (targetList) {
                targetList.appendChild(taskElement);
            } else {
                // If day is invalid or list not found, put in unassigned
                unassignedTasksList.appendChild(taskElement);
                task.calendarDay = null; // Clear invalid day
            }
        } else {
            unassignedTasksList.appendChild(taskElement);
        }
    });
}

/**
 * Loads tasks using Tauri invoke.
 */
async function loadTasks() {
    console.log('Calendar: Loading tasks via invoke...');
    try {
        // Use invoke to get the canonical list of todos from the backend
        const allTodos = await invoke('load_todos');
        // Load all tasks and ensure they have a calendarDay property (even if null)
        tasks = allTodos.map(task => ({
            ...task,
            calendarDay: task.calendarDay || null // Ensure property exists
        }));
        console.log('Calendar: Loaded all tasks:', tasks);
        renderTasks();
    } catch (error) {
        console.error("Calendar: Error loading tasks via invoke:", error);
        tasks = []; // Reset tasks on error
        renderTasks(); // Render empty state
        // Optionally display an error message to the user
        // alert("Failed to load tasks for the calendar.");
    }

    // Example: Request tasks from main window if needed (keep for reference)
    // await emit('request-tasks-for-calendar');
    // await listen('tasks-for-calendar', (event) => {
    //     tasks = event.payload;
    //     renderTasks();
    // });
}

/**
 * Saves the updated task assignments back to the backend via invoke.
 */
async function saveTaskAssignments() {
    console.log('Calendar: Saving task assignments via invoke...');
    try {
        // 1. Get the full, current list of todos from the backend
        const allCurrentTodos = await invoke('load_todos');

        // 2. Create a map of the calendar tasks for quick lookup
        const calendarTaskMap = new Map(tasks.map(task => [task.id, task]));

        // 3. Merge the calendarDay updates into the full list
        const todosToSave = allCurrentTodos.map(existingTodo => {
            const calendarVersion = calendarTaskMap.get(existingTodo.id);
            if (calendarVersion) {
                // If the task exists in the calendar view, update its calendarDay
                return { ...existingTodo, calendarDay: calendarVersion.calendarDay };
            }
            // Otherwise, keep the existing todo as is
            return existingTodo;
        });

        // 4. Save the entire updated list back to the backend
        await invoke('save_todos', { todos: todosToSave });
        console.log('Calendar: Successfully saved updated task assignments.');

        // 5. Notify the main window that assignments changed
        //    We send the *filtered* list currently shown in the calendar
        //    so the main window knows which tasks were potentially affected.
        await emit('calendar-assignments-updated', { updatedTasks: tasks });
        console.log('Calendar: Emitted calendar-assignments-updated event.');

    } catch (error) {
        console.error("Calendar: Error saving task assignments via invoke:", error);
        // Optionally display an error message
        // alert("Failed to save calendar assignments.");
    }
}

// --- Drag and Drop Handlers ---

function handleDragStart(e) {
    draggedItem = e.target;
    setTimeout(() => e.target.style.opacity = '0.5', 0); // Make it semi-transparent
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.taskId); // Pass task ID
    console.log('Drag Start:', e.target.dataset.taskId);
}

function handleDragEnd(e) {
    setTimeout(() => {
        if (draggedItem) {
            draggedItem.style.opacity = '1'; // Restore opacity
        }
        draggedItem = null;
    }, 0);

    // Remove drop target styling
    taskLists.forEach(list => list.classList.remove('drop-target'));
    console.log('Drag End');
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    // console.log('Drag Over:', e.target.closest('.task-list'));
}

function handleDragEnter(e) {
    e.preventDefault();
    const targetList = e.target.closest('.task-list');
    if (targetList && targetList !== draggedItem?.parentNode) {
        targetList.classList.add('drop-target');
        // console.log('Drag Enter:', targetList.id);
    }
}

function handleDragLeave(e) {
    const targetList = e.target.closest('.task-list');
    if (targetList && targetList !== draggedItem?.parentNode) {
        // Check if the relatedTarget (where the mouse is going) is outside the list
         if (!targetList.contains(e.relatedTarget)) {
            targetList.classList.remove('drop-target');
            // console.log('Drag Leave:', targetList.id);
         }
    } else if (e.target === document.body) { // Handle leaving the window body
         taskLists.forEach(list => list.classList.remove('drop-target'));
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling

    const targetList = e.target.closest('.task-list');
    const taskId = e.dataTransfer.getData('text/plain'); // Get ID from data transfer

    // Ensure taskId is treated consistently (e.g., as a number if IDs are numbers)
    // Note: Task IDs from Date.now() are numbers, but dataset/dataTransfer might make them strings.
    const taskIdValue = parseInt(taskId, 10); // Convert to number for comparison/lookup
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`); // Find the element being dragged

    console.log('Drop on:', targetList?.id, 'Task ID:', taskIdValue);

    if (targetList && taskElement && targetList !== taskElement.parentNode) {
        targetList.classList.remove('drop-target');
        targetList.appendChild(taskElement); // Move the element visually

        // Update task data in the local 'tasks' state array
        const taskIndex = tasks.findIndex(t => t.id === taskIdValue);
        if (taskIndex > -1) {
            const dayColumn = targetList.closest('.day-column');
            const newDay = dayColumn ? dayColumn.dataset.day : null; // Assign day or null if unassigned

            tasks[taskIndex].calendarDay = newDay; // Update the state

            console.log(`Task ${taskIdValue} moved to ${newDay || 'Unassigned'}`);
            saveTaskAssignments(); // Save the entire updated state to backend
        } else {
            console.error("Dropped task not found in state:", taskIdValue);
            // Optionally reload tasks to resync if state is inconsistent
            // loadTasks();
        }
    } else if (targetList) {
         targetList.classList.remove('drop-target'); // Remove styling even if drop is on same list
    } else {
        console.log("Drop target is not a valid task list.");
    }

    // Ensure draggedItem opacity is reset if dragend didn't fire correctly
    if (draggedItem) {
         draggedItem.style.opacity = '1';
    }
    draggedItem = null; // Clear dragged item reference
}


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('Calendar window loaded.');
    loadTasks();

    // Add dragover/dragenter/dragleave/drop listeners to all potential drop zones (task lists)
    taskLists.forEach(list => {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('dragenter', handleDragEnter);
        list.addEventListener('dragleave', handleDragLeave);
        list.addEventListener('drop', handleDrop);
    });

    // Listen for updates from the main window (e.g., if a task is added/deleted)
    listen('tasks-updated', (event) => {
        console.log('Received task update from main window:', event.payload);
        // Reload tasks to reflect changes
        loadTasks();
    });

    // Notify main window that calendar is ready (optional)
    emit('calendar-window-ready');
});

// Handle window closing - maybe save state? (Tauri might handle this)
window.addEventListener('beforeunload', () => {
    console.log('Calendar window closing.');
    // Potentially save state if needed, though drop handler saves incrementally
});
