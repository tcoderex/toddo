// Check if we're running in a Tauri environment
const isTauri = window.__TAURI__ !== undefined;

// Initialize variables for Tauri APIs
let invoke;
let getCurrent;
let emit;

// Set up Tauri APIs if available, otherwise use mock implementations
if (isTauri) {
    try {
        invoke = window.__TAURI__.core.invoke;
        const windowAPI = window.__TAURI__.window;
        getCurrent = windowAPI.getCurrent;

        // Set up emit function - try to use event.emit if available, otherwise fall back to window.emit
        if (window.__TAURI__.event && typeof window.__TAURI__.event.emit === 'function') {
            emit = window.__TAURI__.event.emit;
            console.log('Using Tauri event.emit for communication');
        } else if (windowAPI.emit) {
            emit = windowAPI.emit;
            console.log('Using Tauri window.emit for communication');
        } else {
            console.warn('No Tauri emit function found, using fallback');
            emit = (event) => {
                console.warn(`Fallback emit called: ${event}`);
                // Try to communicate with opener window if available
                if (window.opener && !window.opener.closed) {
                    window.opener.postMessage({ event, source: 'trash-window' }, '*');
                }
            };
        }

        console.log('Tauri APIs initialized successfully');
    } catch (error) {
        console.error('Error initializing Tauri APIs:', error);
        setupMockApis();
    }
} else {
    console.warn('Not running in a Tauri environment, using mock APIs');
    setupMockApis();
}

// Set up mock implementations for non-Tauri environments
function setupMockApis() {
    // Mock invoke function with more realistic behavior
    invoke = async (command, args) => {
        console.warn(`Mock invoke called: ${command}`, args);

        if (command === 'get_trash_data') {
            // Return the current trashedTodos if available, otherwise empty array
            return trashedTodos.length > 0 ? trashedTodos : [];
        }

        if (command === 'restore_todo_item') {
            // Simulate restoring an item by removing it from trashedTodos
            const id = args.id;
            console.log(`Mock restoring item ${id}`);

            // Find the item in trashedTodos
            const itemIndex = trashedTodos.findIndex(todo => todo.id === id);
            if (itemIndex !== -1) {
                // Remove the item from trashedTodos
                const [restoredItem] = trashedTodos.splice(itemIndex, 1);
                console.log(`Mock restored item:`, restoredItem);

                // Notify the main window about the restored item
                if (window.opener && !window.opener.closed) {
                    window.opener.postMessage({
                        action: 'restoreItem',
                        item: restoredItem,
                        source: 'trash-window'
                    }, '*');
                }
            }
            return true;
        }

        if (command === 'delete_todo_item_permanently') {
            // Simulate deleting an item by removing it from trashedTodos
            const id = args.id;
            const itemIndex = trashedTodos.findIndex(todo => todo.id === id);
            if (itemIndex !== -1) {
                trashedTodos.splice(itemIndex, 1);
            }
            return true;
        }

        if (command === 'empty_trash_bin') {
            // Clear all items
            trashedTodos = [];
            return true;
        }

        return null;
    };

    // Mock window functions
    getCurrent = () => ({
        close: () => window.close(),
    });

    // Mock emit function
    emit = (event, payload) => {
        console.warn(`Mock emit called: ${event}`, payload);
        // Try to communicate with opener window if available
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ event, payload, source: 'trash-window' }, '*');
        }
    };
}

let trashedTodos = [];
let trashListElement;
let emptyTrashBtn;
let closeTrashBtn;
let sortButtons;
let selectAllBtn;
let deselectAllBtn;
let deleteSelectedBtn;
let restoreSelectedBtn;
let selectedCountSpan;

// Track selected items and current sort
let selectedItems = new Set();
let currentSort = 'date-desc'; // Default sort

// Load and render trash items when the window loads
window.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    trashListElement = document.getElementById('trash-list');
    emptyTrashBtn = document.getElementById('empty-trash');
    closeTrashBtn = document.getElementById('close-trash-window');
    sortButtons = document.querySelectorAll('.trash-sort-btn');
    selectAllBtn = document.getElementById('select-all-btn');
    deselectAllBtn = document.getElementById('deselect-all-btn');
    deleteSelectedBtn = document.getElementById('delete-selected');
    restoreSelectedBtn = document.getElementById('restore-selected');
    selectedCountSpan = document.getElementById('selected-count');

    if (!trashListElement || !emptyTrashBtn) {
        console.error('Required elements not found in trash.html');
        return;
    }

    // Add event listener for the empty trash button
    emptyTrashBtn.addEventListener('click', handleEmptyTrash);

    // Add event listener for the close button
    if (closeTrashBtn) {
        closeTrashBtn.addEventListener('click', () => {
            console.log('Closing trash window');
            if (isTauri && getCurrent) {
                try {
                    const currentWindow = getCurrent();
                    currentWindow.close();
                } catch (error) {
                    console.error('Error closing window:', error);
                    window.close(); // Fallback
                }
            } else {
                window.close();
            }
        });
    }

    // Add event listeners for sort buttons
    sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            sortButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Update current sort
            currentSort = button.dataset.sort;

            // Re-render the list with the new sort
            renderTrashList();
        });
    });

    // Add event listeners for selection buttons
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', selectAll);
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', deselectAll);
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    }

    if (restoreSelectedBtn) {
        restoreSelectedBtn.addEventListener('click', handleRestoreSelected);
    }

    // Listen for messages from the main window
    window.addEventListener('message', (event) => {
        // Check if the message is from our main window
        if (event.data && event.data.source === 'main-window') {
            console.log('Received message from main window:', event.data);

            // If the main window is sending trash data
            if (event.data.action === 'setTrashData' && Array.isArray(event.data.data)) {
                console.log('Received trash data from main window');
                trashedTodos = event.data.data;
                renderTrashList();
            }
        }
    });

    await loadAndRenderTrash();
});

// Load trash data from the backend
async function loadTrashData() {
    try {
        console.log('Trash Window: Loading trash...');

        // Try to get trash data from the opener window if available
        if (!isTauri && window.opener && !window.opener.closed) {
            try {
                // Request trash data from the opener window
                window.opener.postMessage({ action: 'getTrashData', source: 'trash-window' }, '*');

                // For now, just return an empty array
                // In a real implementation, we would wait for a response
                trashedTodos = [];
                return;
            } catch (e) {
                console.error('Error requesting trash data from opener:', e);
            }
        }

        // If we're in a Tauri environment or couldn't get data from opener,
        // try to use the invoke function
        trashedTodos = await invoke('get_trash_data');
        console.log('Trash Window: Loaded trash:', trashedTodos);
    } catch (error) {
        console.error('Trash Window: Error loading trash data:', error);
        trashedTodos = [];
        if (trashListElement) {
            trashListElement.innerHTML = '<li class="error-message">Could not load trash items.</li>';
        }
    }
}

// Render the list of trashed items
function renderTrashList() {
    if (!trashListElement) return;
    trashListElement.innerHTML = ''; // Clear current list

    if (trashedTodos.length === 0) {
        trashListElement.innerHTML = '<li class="empty-trash-message"><span class="material-icons">delete_outline</span> Trash is empty.</li>';
        emptyTrashBtn.disabled = true;
        // Reset selection
        selectedItems.clear();
        updateSelectionUI();
        return;
    }

    // Sort the trash items based on the current sort option
    const sortedTrash = [...trashedTodos].sort((a, b) => {
        const [sortBy, sortDirection] = currentSort.split('-');

        if (sortBy === 'date') {
            const dateA = a.trashedAt ? new Date(a.trashedAt).getTime() : 0;
            const dateB = b.trashedAt ? new Date(b.trashedAt).getTime() : 0;
            return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
        } else if (sortBy === 'name') {
            const nameA = a.text ? a.text.toLowerCase() : '';
            const nameB = b.text ? b.text.toLowerCase() : '';
            return sortDirection === 'desc'
                ? nameB.localeCompare(nameA)
                : nameA.localeCompare(nameB);
        }

        // Default to date descending
        const dateA = a.trashedAt ? new Date(a.trashedAt).getTime() : 0;
        const dateB = b.trashedAt ? new Date(b.trashedAt).getTime() : 0;
        return dateB - dateA;
    });

    // Create list items
    sortedTrash.forEach(todo => {
        const li = document.createElement('li');
        li.className = 'trash-item';
        if (selectedItems.has(todo.id.toString())) {
            li.classList.add('selected');
        }

        // Create checkbox for selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'trash-checkbox';
        checkbox.dataset.id = todo.id;
        checkbox.checked = selectedItems.has(todo.id.toString());
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedItems.add(todo.id.toString());
                li.classList.add('selected');
            } else {
                selectedItems.delete(todo.id.toString());
                li.classList.remove('selected');
            }
            updateSelectionUI();
        });

        // Create content container
        const contentDiv = document.createElement('div');
        contentDiv.className = 'trash-item-content';

        const textSpan = document.createElement('span');
        textSpan.className = 'trash-text';
        textSpan.textContent = todo.text;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'trash-date';
        try {
            const trashedDate = new Date(todo.trashedAt);
            dateSpan.textContent = `Trashed: ${trashedDate.toLocaleDateString()}`;
        } catch {
            dateSpan.textContent = 'Trashed: Invalid Date';
        }

        contentDiv.appendChild(textSpan);
        contentDiv.appendChild(dateSpan);

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'trash-restore';
        restoreBtn.innerHTML = '<span class="material-icons">restore</span> Restore';
        restoreBtn.title = 'Restore Item';
        restoreBtn.addEventListener('click', () => handleRestore(todo.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'trash-delete';
        deleteBtn.innerHTML = '<span class="material-icons">delete_forever</span> Delete';
        deleteBtn.title = 'Delete Permanently';
        deleteBtn.addEventListener('click', () => handleDelete(todo.id));

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'trash-item-actions';
        buttonContainer.appendChild(restoreBtn);
        buttonContainer.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(contentDiv);
        li.appendChild(buttonContainer);

        trashListElement.appendChild(li);
    });

    emptyTrashBtn.disabled = false;
    updateSelectionUI();
}

// Combined load and render function
async function loadAndRenderTrash() {
    await loadTrashData();
    renderTrashList();
}

// Update the UI based on the current selection
function updateSelectionUI() {
    const count = selectedItems.size;

    // Update the selected count text
    if (selectedCountSpan) {
        selectedCountSpan.textContent = count === 1
            ? '1 item selected'
            : `${count} items selected`;
    }

    // Enable/disable buttons based on selection
    if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = count === 0;
    }

    if (restoreSelectedBtn) {
        restoreSelectedBtn.disabled = count === 0;
    }

    if (deselectAllBtn) {
        deselectAllBtn.disabled = count === 0;
    }

    // Update select all button state
    if (selectAllBtn) {
        const allCheckboxes = document.querySelectorAll('.trash-checkbox');
        const allSelected = allCheckboxes.length > 0 &&
                          Array.from(allCheckboxes).every(cb => cb.checked);
        selectAllBtn.disabled = allCheckboxes.length === 0;
        selectAllBtn.classList.toggle('all-selected', allSelected);
    }
}

// Add these helper functions for selection handling
function selectAll() {
    const checkboxes = document.querySelectorAll('.trash-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const itemId = checkbox.dataset.id;
        if (itemId) {
            selectedItems.add(itemId);
            checkbox.closest('.trash-item')?.classList.add('selected');
        }
    });
    updateSelectionUI();
}

function deselectAll() {
    const checkboxes = document.querySelectorAll('.trash-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.trash-item')?.classList.remove('selected');
    });
    selectedItems.clear();
    updateSelectionUI();
}

// Handle deleting selected items
async function handleDeleteSelected() {
    const count = selectedItems.size;
    if (count === 0) return;

    const confirmMessage = count === 1
        ? 'Are you sure you want to permanently delete the selected item?'
        : `Are you sure you want to permanently delete ${count} selected items?`;

    if (confirm(confirmMessage)) {
        try {
            let successCount = 0;
            const errors = [];

            // Delete each selected item one by one
            for (const id of selectedItems) {
                try {
                    await invoke('delete_todo_item_permanently', { id: parseInt(id) });
                    successCount++;
                } catch (error) {
                    errors.push(`Failed to delete item ${id}: ${error.message || 'Unknown error'}`);
                }
            }

            // Update the local trashedTodos array to remove successfully deleted items
            trashedTodos = trashedTodos.filter(todo => !selectedItems.has(todo.id.toString()));

            // Clear the selection set
            selectedItems.clear();

            // Re-render the list
            renderTrashList();

            // Show results to user
            if (successCount > 0) {
                console.log(`Successfully deleted ${successCount} items`);
            }
            if (errors.length > 0) {
                console.error('Errors during deletion:', errors);
                alert(`Deleted ${successCount} items, but encountered ${errors.length} errors.\n${errors.join('\n')}`);
            }
        } catch (error) {
            console.error('Error in handleDeleteSelected:', error);
            alert('An error occurred while deleting the selected items.');
        }
    }
}

// Handle restoring selected items
async function handleRestoreSelected() {
    const count = selectedItems.size;
    if (count === 0) return;

    try {
        console.log(`Attempting to restore ${count} selected items:`, Array.from(selectedItems));

        // Restore each selected item one by one and track results
        let successCount = 0;
        const errors = [];
        const restoredItems = [];

        for (const id of selectedItems) {
            try {
                console.log(`Restoring item ${id}...`);

                // Find the item in trashedTodos before it's removed by the invoke call
                const itemToRestore = trashedTodos.find(todo => todo.id.toString() === id);
                if (itemToRestore) {
                    restoredItems.push({...itemToRestore}); // Save a copy for non-Tauri environments
                }

                // Call the backend to restore the item
                await invoke('restore_todo_item', { id: parseInt(id) });
                successCount++;
            } catch (error) {
                console.error(`Failed to restore item ${id}:`, error);
                errors.push(`Failed to restore item ${id}: ${error.message || 'Unknown error'}`);
            }
        }

        // Update the local trashedTodos array to remove successfully restored items
        trashedTodos = trashedTodos.filter(todo => !selectedItems.has(todo.id.toString()));

        // For non-Tauri environments, send all restored items to the main window
        if (!isTauri && window.opener && !window.opener.closed && restoredItems.length > 0) {
            window.opener.postMessage({
                action: 'restoreMultipleItems',
                items: restoredItems,
                source: 'trash-window'
            }, '*');
        }

        // Notify the main window that todos have changed
        if (typeof emit === 'function') {
            await emit('todos-updated');
        }

        // Clear the selection set
        selectedItems.clear();

        // Re-render the list
        renderTrashList();

        // Show results to user
        if (successCount > 0) {
            console.log(`Successfully restored ${successCount} items`);
        }
        if (errors.length > 0) {
            console.error('Errors during restoration:', errors);
            alert(`Restored ${successCount} items, but encountered ${errors.length} errors.\n${errors.join('\n')}`);
        }
    } catch (error) {
        console.error('Error in handleRestoreSelected:', error);
        alert('An error occurred while restoring the selected items.');
    }
}

// Handle restoring a single item
async function handleRestore(id) {
    console.log(`Trash Window: Restoring item ${id}`);
    try {
        // Find the item in trashedTodos before it's removed by the invoke call
        const itemToRestore = trashedTodos.find(todo => todo.id === id);

        // Call the Rust backend to restore the item
        await invoke('restore_todo_item', { id: id });

        // Remove the item from the local trashedTodos array
        trashedTodos = trashedTodos.filter(todo => todo.id !== id);

        // For non-Tauri environments, send the restored item to the main window
        if (!isTauri && window.opener && !window.opener.closed && itemToRestore) {
            window.opener.postMessage({
                action: 'restoreItem',
                item: {...itemToRestore}, // Send a copy
                source: 'trash-window'
            }, '*');
        }

        // Notify the main window that todos have changed
        if (typeof emit === 'function') {
            await emit('todos-updated');
        }

        // Re-render the list
        renderTrashList();

        console.log(`Successfully restored item ${id}`);
    } catch (error) {
        console.error(`Trash Window: Error restoring item ${id}:`, error);
        alert(`Error restoring item: ${error.message || 'Unknown error'}`);
    }
}

// Handle permanently deleting a single item
async function handleDelete(id) {
    console.log(`Trash Window: Deleting item ${id}`);
    if (confirm(`Are you sure you want to permanently delete this item?`)) {
        try {
            // Call the Rust backend to delete the item
            await invoke('delete_todo_item_permanently', { id: parseInt(id) });

            // Remove the item from the local trashedTodos array
            trashedTodos = trashedTodos.filter(todo => todo.id !== id);

            // Re-render the list
            renderTrashList();
        } catch (error) {
            console.error(`Trash Window: Error deleting item ${id}:`, error);
            alert(`Error deleting item: ${error.message || 'Unknown error'}`);
        }
    }
}

// Handle emptying the entire trash
async function handleEmptyTrash() {
    console.log('Trash Window: Emptying trash');
    if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
        try {
            // Call the Rust backend to empty the trash
            await invoke('empty_trash_bin');

            // Clear the local trashedTodos array
            trashedTodos = [];

            // Re-render the list
            renderTrashList();
        } catch (error) {
            console.error('Trash Window: Error emptying trash:', error);
            alert(`Error emptying trash: ${error.message || 'Unknown error'}`);
        }
    }
}
