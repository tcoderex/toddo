import { WebviewWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';

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
 * Loads tasks from localStorage (or potentially requests from main window).
 */
async function loadTasks() {
    try {
        // For now, assume tasks are in localStorage, similar to main.js
        // Filter out deleted tasks and potentially completed ones if desired
        const allTasks = JSON.parse(localStorage.getItem('todos') || '[]');
        tasks = allTasks.filter(task => !task.deleted); // Only show non-deleted tasks
        console.log('Loaded tasks for calendar:', tasks);
        renderTasks();
    } catch (error) {
        console.error("Error loading tasks for calendar:", error);
        // Handle error, maybe display a message
    }

    // Example: Request tasks from main window if needed
    // await emit('request-tasks-for-calendar');
    // await listen('tasks-for-calendar', (event) => {
    //     tasks = event.payload;
    //     renderTasks();
    // });
}

/**
 * Saves the updated task assignments back to storage.
 */
function saveTaskAssignments() {
    try {
        // Update the main tasks array in localStorage
        const allTasks = JSON.parse(localStorage.getItem('todos') || '[]');
        const updatedTasks = allTasks.map(existingTask => {
            const updatedTask = tasks.find(t => t.id === existingTask.id);
            return updatedTask ? updatedTask : existingTask; // Use updated task if found
        });
        localStorage.setItem('todos', JSON.stringify(updatedTasks));
        console.log('Saved task assignments:', tasks);

        // Optionally, notify the main window that assignments changed
        emit('calendar-assignments-updated', { updatedTasks: tasks });

    } catch (error) {
        console.error("Error saving task assignments:", error);
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
    const taskId = e.dataTransfer.getData('text/plain');
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`); // Find the original element

    console.log('Drop on:', targetList?.id, 'Task ID:', taskId);


    if (targetList && taskElement && targetList !== taskElement.parentNode) {
        targetList.classList.remove('drop-target');
        targetList.appendChild(taskElement); // Move the element

        // Update task data
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            const dayColumn = targetList.closest('.day-column');
            task.calendarDay = dayColumn ? dayColumn.dataset.day : null; // Assign day or null if unassigned
            console.log(`Task ${taskId} moved to ${task.calendarDay || 'Unassigned'}`);
            saveTaskAssignments(); // Save changes
        } else {
            console.error("Dropped task not found in state:", taskId);
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
