const { invoke } = window.__TAURI__.core;
const { getCurrent, emit } = window.__TAURI__.window; // To close the window and emit events

let trashedTodos = [];
let trashListElement;
let emptyTrashBtn;

// Load and render trash items when the window loads
window.addEventListener('DOMContentLoaded', async () => {
    trashListElement = document.getElementById('trash-list');
    emptyTrashBtn = document.getElementById('empty-trash');

    if (!trashListElement || !emptyTrashBtn) {
        console.error('Required elements not found in trash.html');
        return;
    }

    emptyTrashBtn.addEventListener('click', handleEmptyTrash);

    // Listen for updates from the main window (optional but good practice)
    // const appWindow = WebviewWindow.getByLabel('main'); // Assuming main window has label 'main'
    // appWindow?.listen('trash-updated', async () => {
    //     console.log('Trash Window: Received trash-updated event');
    //     await loadAndRenderTrash();
    // });


    await loadAndRenderTrash();
});

// Load trash data from the backend
async function loadTrashData() {
    try {
        console.log('Trash Window: Loading trash...');
        // This command needs to be implemented in the Rust backend (src-tauri/src/main.rs)
        // It should read the trash.json file and return its contents.
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
        trashListElement.innerHTML = '<li>Trash is empty.</li>';
        emptyTrashBtn.disabled = true;
        return;
    }

    // Sort by trashed date (newest first)
    const sortedTrash = [...trashedTodos].sort((a, b) => {
        const dateA = a.trashedAt ? new Date(a.trashedAt).getTime() : 0;
        const dateB = b.trashedAt ? new Date(b.trashedAt).getTime() : 0;
        return dateB - dateA; // Newest first
    });

    // Create list items
    sortedTrash.forEach(todo => {
        const li = document.createElement('li');
        li.className = 'trash-item'; // Reuse class from main styles if applicable

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


        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'trash-restore'; // Reuse class
        restoreBtn.textContent = 'Restore';
        restoreBtn.title = 'Restore Item';
        restoreBtn.addEventListener('click', () => handleRestore(todo.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'trash-delete'; // Reuse class
        deleteBtn.textContent = 'Delete Permanently';
        deleteBtn.title = 'Delete Permanently';
        deleteBtn.addEventListener('click', () => handleDelete(todo.id));

        const buttonContainer = document.createElement('div'); // Container for buttons
        buttonContainer.className = 'trash-item-actions';
        buttonContainer.appendChild(restoreBtn);
        buttonContainer.appendChild(deleteBtn);

        li.appendChild(textSpan);
        li.appendChild(dateSpan);
        li.appendChild(buttonContainer);

        trashListElement.appendChild(li);
    });

    emptyTrashBtn.disabled = false;
}

// Combined load and render function
async function loadAndRenderTrash() {
    await loadTrashData();
    renderTrashList();
}

// Handle restoring a single item
async function handleRestore(id) {
    console.log(`Trash Window: Restoring item ${id}`);
    try {
        // This command needs to be implemented in Rust.
        // It should find the item in trash.json, remove it,
        // add it back to todos.json, and save both files.
        await invoke('restore_todo_item', { id: id });
        // Notify the main window that todos have changed
        await emit('todos-updated');
        // Refresh the trash list in this window
        await loadAndRenderTrash();
    } catch (error) {
        console.error(`Trash Window: Error restoring item ${id}:`, error);
        // Show error to user?
    }
}

// Handle permanently deleting a single item
async function handleDelete(id) {
    console.log(`Trash Window: Deleting item ${id}`);
    if (confirm(`Are you sure you want to permanently delete this item?`)) {
        try {
            // This command needs to be implemented in Rust.
            // It should find the item in trash.json, remove it, and save the file.
            await invoke('delete_todo_item_permanently', { id: id });
            // Refresh the trash list in this window
            await loadAndRenderTrash();
        } catch (error) {
            console.error(`Trash Window: Error deleting item ${id}:`, error);
            // Show error to user?
        }
    }
}

// Handle emptying the entire trash
async function handleEmptyTrash() {
    console.log('Trash Window: Emptying trash');
    if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
        try {
            // This command needs to be implemented in Rust.
            // It should clear the trash.json file.
            await invoke('empty_trash_bin');
            // Refresh the trash list in this window
            await loadAndRenderTrash();
        } catch (error) {
            console.error('Trash Window: Error emptying trash:', error);
            // Show error to user?
        }
    }
}
