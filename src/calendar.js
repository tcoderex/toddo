/**
 * Inject demo data into localStorage if none exists.
 * This ensures the calendar displays tasks and categories for first-time users.
 */
(function injectDemoDataIfNeeded() {
  try {
    if (!localStorage.getItem('todos') || !localStorage.getItem('categories')) {
      // Demo categories
      const demoCategories = [
        { id: 1, name: "Work", color: "#1976d2", parent_id: null },
        { id: 2, name: "Personal", color: "#43a047", parent_id: null },
        { id: 3, name: "Errands", color: "#fbc02d", parent_id: 2 }, // Subcategory of Personal
      ];
      // Demo tasks
      const demoTasks = [
        { id: 1001, text: "Finish project report", completed: false, category: demoCategories[0], calendarDay: "Monday" },
        { id: 1002, text: "Team meeting", completed: false, category: demoCategories[0], calendarDay: "Tuesday" },
        { id: 1003, text: "Buy groceries", completed: false, category: demoCategories[2], calendarDay: null },
        { id: 1004, text: "Call plumber", completed: false, category: demoCategories[1], calendarDay: null },
        { id: 1005, text: "Read a book", completed: false, category: demoCategories[1], calendarDay: "Sunday" },
        { id: 1006, text: "Gym session", completed: false, category: demoCategories[1], calendarDay: "Friday" },
        { id: 1007, text: "Dentist appointment", completed: false, category: null, calendarDay: null },
      ];
      localStorage.setItem('categories', JSON.stringify(demoCategories));
      localStorage.setItem('todos', JSON.stringify(demoTasks));
      console.log('Demo data injected into localStorage for calendar.');
    }
  } catch (e) {
    console.error('Failed to inject demo data:', e);
  }
})();

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
  console.warn('Calendar: Not running in a Tauri environment. Using localStorage for data.');
  // Provide mock functions that use localStorage for web environment
  invoke = async (cmd, args) => {
    console.warn(`Mock invoke (localStorage): ${cmd}`, args);
    if (cmd === 'load_todos') {
        return JSON.parse(localStorage.getItem('todos') || '[]');
    }
    if (cmd === 'load_categories') {
        return JSON.parse(localStorage.getItem('categories') || '[]');
    }
    if (cmd === 'save_todos') {
        // Mock save just logs, actual save happens in saveTaskAssignments directly
        console.log('Mock save_todos called with:', args?.todos?.length, 'todos');
        return null;
    }
     if (cmd === 'save_categories') {
        console.log('Mock save_categories called with:', args?.categories?.length, 'categories');
        return null;
    }
    return null; // Default mock response
  };
  // Mock emit/listen remain simple placeholders
  emit = (evt, payload) => console.warn(`Mock emit: ${evt}`, payload);
  listen = (evt, handler) => console.warn(`Mock listen registration: ${evt}`);
  WebviewWindow = undefined; // Explicitly undefined
}


// --- DOM Elements ---
const unassignedTasksList = document.getElementById('unassigned-tasks');
const dayColumns = document.querySelectorAll('.day-column');
const taskLists = document.querySelectorAll('.task-list'); // Includes unassigned

// --- State ---
let tasks = []; // Will hold all tasks
let categories = []; // Will hold all categories
let draggedItem = null; // To keep track of the item being dragged

// --- Functions ---

/**
 * Get contrast color (black or white) based on background color.
 * (Copied from main.js for styling category elements)
 */
function getContrastColor(hexColor) {
  if (!hexColor) return '#000000'; // Default to black if no color
  hexColor = hexColor.replace('#', '');
  if (hexColor.length === 3) {
      hexColor = hexColor.split('').map(char => char + char).join('');
  }
  if (hexColor.length !== 6) return '#000000'; // Invalid hex
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// --- Category Helper Functions (Adapted from main.js) ---

/**
 * Get all root categories (those without a parent).
 * @returns {Array<object>}
 */
function getRootCategories() {
  return categories.filter(category => !category.parent_id);
}

/**
 * Get subcategories for a given parent category ID.
 * @param {number} parentId
 * @returns {Array<object>}
 */
function getSubcategories(parentId) {
  // Ensure parentId is treated as a number if category IDs are numbers
  const numParentId = typeof parentId === 'string' ? parseInt(parentId, 10) : parentId;
  return categories.filter(category => category.parent_id === numParentId);
}


// --- Task Rendering Functions ---

/**
 * Renders a single task item.
 * @param {object} task - The task object.
 * @returns {HTMLElement} - The list item element.
 */
function createTaskElement(task) {
    const li = document.createElement('li');
    li.textContent = task.text;
    li.classList.add('task-item');
    if (task.completed) {
        li.classList.add('completed'); // Add class if task is completed
    }
    li.draggable = true;
    li.dataset.taskId = task.id; // Store task ID
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragend', handleDragEnd);
    return li;
}

/**
 * Renders all tasks, grouping unassigned tasks by category.
 */
function renderTasks() {
    // Clear existing tasks from all lists (day columns and unassigned container)
    taskLists.forEach(list => list.innerHTML = ''); // Clears day columns + #unassigned-tasks UL
    unassignedTasksList.innerHTML = ''; // Explicitly clear unassigned container

    // Separate tasks
    const assignedTasks = tasks.filter(task => task.calendarDay);
    const unassignedTasks = tasks.filter(task => !task.calendarDay);

    // Render assigned tasks into day columns
    assignedTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        const targetList = document.getElementById(`${task.calendarDay.toLowerCase()}-tasks`);
        if (targetList) {
            targetList.appendChild(taskElement);
        } else {
            // Fallback: If assigned day is somehow invalid, treat as unassigned for rendering
            renderUnassignedGrouped(task, unassignedTasksList); // Add to grouped list
        }
    });

    // Render unassigned tasks grouped by category
    renderUnassignedGrouped(unassignedTasks, unassignedTasksList);
}

/**
 * Renders unassigned tasks grouped by category into the target element.
 * @param {Array<object>} unassignedTasks - Array of tasks without a calendarDay.
 * @param {HTMLElement} targetElement - The container element (e.g., #unassigned-tasks).
 */
function renderUnassignedGrouped(unassignedTasks, targetElement) {
    // Group tasks by category ID (null for uncategorized)
    const grouped = unassignedTasks.reduce((acc, task) => {
        const categoryId = task.category ? task.category.id : 'uncategorized';
        if (!acc[categoryId]) {
            acc[categoryId] = {
                category: task.category, // Store category info (or null)
                tasks: []
            };
        }
        acc[categoryId].tasks.push(task);
        return acc;
    }, {});

    // Get root categories + 'uncategorized' if it exists
    const rootCategoryIds = getRootCategories().map(c => c.id);
    if (grouped['uncategorized']) {
        rootCategoryIds.push('uncategorized');
    }

    // Sort root categories (optional, e.g., alphabetically)
    rootCategoryIds.sort((a, b) => {
        if (a === 'uncategorized') return 1;
        if (b === 'uncategorized') return -1;
        const catA = categories.find(c => c.id === a)?.name || '';
        const catB = categories.find(c => c.id === b)?.name || '';
        return catA.localeCompare(catB);
    });

    // Render each category group recursively
    rootCategoryIds.forEach(catId => {
        if (grouped[catId]) { // Only render if there are tasks for this root/uncategorized
             renderCategoryGroupRecursive(catId, grouped, targetElement, 0);
        }
    });
}

/**
 * Recursively renders a category group and its tasks/subcategories.
 * @param {string|number} categoryId - The ID of the category ('uncategorized' for no category).
 * @param {object} groupedTasks - The pre-grouped tasks object.
 * @param {HTMLElement} parentElement - The element to append this group to.
 * @param {number} level - The nesting level for indentation.
 */
function renderCategoryGroupRecursive(categoryId, groupedTasks, parentElement, level) {
    const categoryInfo = categoryId === 'uncategorized'
        ? { id: 'uncategorized', name: 'Uncategorized', color: '#888888' }
        : categories.find(c => c.id === categoryId);

    if (!categoryInfo) return; // Should not happen if logic is correct

    const groupData = groupedTasks[categoryId];
    const tasksInCategory = groupData ? groupData.tasks : [];
    const subcategories = getSubcategories(categoryId); // Get direct children

    // Only render the group if it has tasks or subcategories with tasks
    const hasTasks = tasksInCategory.length > 0;
    const hasSubcategoriesWithTasks = subcategories.some(sub => groupedTasks[sub.id]);

    if (!hasTasks && !hasSubcategoriesWithTasks) {
        return; // Don't render empty category branches
    }

    const groupContainer = document.createElement('div');
    groupContainer.className = `category-group-unassigned level-${level}`;

    // Create header for the category
    const header = createCategoryHeaderElement(categoryInfo, tasksInCategory.length, level);
    groupContainer.appendChild(header);

    // Create list for tasks directly in this category
    const taskListElement = document.createElement('ul');
    taskListElement.className = 'task-list category-task-list'; // Add specific class
    // Add drop handling to this list as well
    taskListElement.addEventListener('dragover', handleDragOver);
    taskListElement.addEventListener('dragenter', handleDragEnter);
    taskListElement.addEventListener('dragleave', handleDragLeave);
    taskListElement.addEventListener('drop', handleDrop); // Reuse drop handler

    tasksInCategory.forEach(task => {
        taskListElement.appendChild(createTaskElement(task));
    });
    groupContainer.appendChild(taskListElement); // Append task list

    // Recursively render subcategories
    if (subcategories.length > 0) {
        const subcategoryContainer = document.createElement('div');
        subcategoryContainer.className = 'subcategories-container-unassigned';
        subcategories.forEach(sub => {
            // Only recurse if the subcategory actually has tasks associated with it
            if (groupedTasks[sub.id]) {
                renderCategoryGroupRecursive(sub.id, groupedTasks, subcategoryContainer, level + 1);
            }
        });
        // Only append subcategory container if it actually contains something
        if (subcategoryContainer.children.length > 0) {
             groupContainer.appendChild(subcategoryContainer);
        }
    }

    parentElement.appendChild(groupContainer);
}

/**
 * Creates the header element for a category group in the unassigned list.
 * @param {object} categoryInfo - Category object (or mock for uncategorized).
 * @param {number} taskCount - Number of tasks directly in this category.
 * @param {number} level - Nesting level.
 * @returns {HTMLElement} - The header div element.
 */
function createCategoryHeaderElement(categoryInfo, taskCount, level) {
    const header = document.createElement('div');
    header.className = 'category-header-unassigned';
    header.style.marginLeft = `${level * 15}px`; // Indentation

    const colorDot = document.createElement('span');
    colorDot.className = 'category-color-dot';
    colorDot.style.backgroundColor = categoryInfo.color;

    const title = document.createElement('span');
    title.className = 'category-title-unassigned';
    title.textContent = categoryInfo.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'category-count-unassigned';
    countSpan.textContent = ` (${taskCount})`;

    header.appendChild(colorDot);
    header.appendChild(title);
    if (taskCount > 0) { // Only show count if there are tasks
        header.appendChild(countSpan);
    }

    // Optional: Add fold/unfold functionality later if needed

    return header;
}


/**
/**
 * Loads tasks and categories using Tauri invoke.
 * Renamed from loadTasks to loadData as it now loads more.
 */
async function loadData() {
    console.log('Calendar: Loading tasks and categories via invoke...');
    try {
        // Load both in parallel
        const [allTodos, loadedCategories] = await Promise.all([
            invoke('load_todos'),
            invoke('load_categories')
        ]);

        // Process tasks: ensure calendarDay exists
        tasks = allTodos.map(task => ({
            ...task,
            calendarDay: task.calendarDay || null
        }));

        // Process categories: ensure created_at exists (for potential future sorting)
        categories = loadedCategories.map(category => ({
            ...category,
            created_at: category.created_at || new Date(parseInt(category.id)).toISOString()
        }));

        console.log('Calendar: Loaded all tasks:', tasks.length);
        console.log('Calendar: Loaded all categories:', categories.length);
        renderTasks(); // Render everything now that data is loaded
    } catch (error) {
        console.error("Calendar: Error loading data via invoke:", error);
        tasks = [];
        categories = [];
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
    console.log('Calendar: Saving task assignments...');
    try {
        let allCurrentTodos;
        // 1. Get the full, current list of todos (from backend or localStorage)
        if (isTauri) {
            allCurrentTodos = await invoke('load_todos');
        } else {
            allCurrentTodos = JSON.parse(localStorage.getItem('todos') || '[]');
        }

        // 2. Create a map of the calendar tasks for quick lookup
        // Ensure IDs are consistent (using numbers here based on Date.now())
        const calendarTaskMap = new Map(tasks.map(task => [parseInt(task.id, 10), task]));

        // 3. Merge the calendarDay updates into the full list
        const todosToSave = allCurrentTodos.map(existingTodo => {
            // Ensure consistent ID type for lookup
            const calendarVersion = calendarTaskMap.get(parseInt(existingTodo.id, 10));
            if (calendarVersion) {
                // If the task exists in the calendar view, update its calendarDay
                // Make sure to preserve other properties of existingTodo
                return { ...existingTodo, calendarDay: calendarVersion.calendarDay };
            }
            // Otherwise, keep the existing todo as is (including its potential calendarDay)
            return existingTodo;
        });

        // 4. Save the entire updated list back (to backend or localStorage)
        if (isTauri) {
            await invoke('save_todos', { todos: todosToSave });
            console.log('Calendar: Successfully saved updated task assignments via invoke.');
        } else {
            localStorage.setItem('todos', JSON.stringify(todosToSave));
            console.log('Calendar: Successfully saved updated task assignments to localStorage.');
            // Simulate backend save call for consistency if needed by other logic
            await invoke('save_todos', { todos: todosToSave }); // Calls the mock which just logs
        }


        // 5. Notify the main window that assignments changed (using mock emit if not Tauri)
        //    We send the *full* list currently shown in the calendar state (`tasks`)
        //    so the main window knows which tasks were potentially affected in this view.
        emit('calendar-assignments-updated', { updatedTasks: tasks }); // Use mock emit if not Tauri
        console.log('Calendar: Emitted calendar-assignments-updated event.');

    } catch (error) {
        console.error("Calendar: Error saving task assignments:", error);
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
    loadData(); // Call the renamed function

    // Add dragover/dragenter/dragleave/drop listeners to DAY COLUMN task lists initially
    // Listeners for category lists are added dynamically in renderCategoryGroupRecursive
    dayColumns.forEach(col => {
        const list = col.querySelector('.task-list');
        if (list) {
            list.addEventListener('dragover', handleDragOver);
            list.addEventListener('dragenter', handleDragEnter);
            list.addEventListener('dragleave', handleDragLeave);
            list.addEventListener('drop', handleDrop);
        }
    });
    // Add listeners to the main unassigned container (for dropping back into uncategorized root)
    unassignedTasksList.addEventListener('dragover', handleDragOver);
    unassignedTasksList.addEventListener('dragenter', handleDragEnter);
    unassignedTasksList.addEventListener('dragleave', handleDragLeave);
    unassignedTasksList.addEventListener('drop', handleDrop);


    // Listen for updates from the main window (e.g., if a task is added/deleted/category changed)
    listen('tasks-updated', (event) => {
        console.log('Received task update from main window:', event.payload);
        // Reload all data to reflect changes
        loadData();
    });
    listen('categories-updated', (event) => {
        console.log('Received category update from main window:', event.payload);
        // Reload all data to reflect changes
        loadData();
    });

    // Notify main window that calendar is ready (optional)
    emit('calendar-window-ready');
});

// Handle window closing - maybe save state? (Tauri might handle this)
window.addEventListener('beforeunload', () => {
    console.log('Calendar window closing.');
    // Potentially save state if needed, though drop handler saves incrementally
});
