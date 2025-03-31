const { invoke } = window.__TAURI__.core;
const { WebviewWindow } = window.__TAURI__.window; // Import for potential future use (Trash window)

// Todo app state
let todos = [];
let trashedTodos = [];
let categories = [];
let currentFilter = 'all';
let draggedItem = null; // The actual DOM element being dragged
let draggedItemId = null; // The ID of the todo being dragged
let placeholder = null; // Placeholder element
let isGroupedByCategory = false;
let foldedCategories = new Set();
let sortBy = 'position'; // Default sort: 'position', 'name', 'date'
let sortDirection = 'asc'; // Default direction: 'asc', 'desc'

// DOM elements
let todoInput;
let sortByButtons; // Button group for sort criteria
let sortDirectionButtons; // Button group for sort direction
let groupByToggle;
let todoList;
let itemsLeftSpan;
let filterAllBtn;
let filterActiveBtn;
let filterCompletedBtn;
let clearCompletedBtn;
let dueDateInput;
let categorySelect;
let viewTrashBtn; // Added for trash window logic

// Load todos from storage
async function loadTodos() {
  try {
    console.log('Loading todos...');
    todos = await invoke('load_todos');
    console.log('Loaded todos:', todos);
    // Ensure position is a number and sort
    todos = todos.map(t => ({ ...t, position: Number(t.position) || 0 }));
    todos.sort((a, b) => a.position - b.position);
    renderTodos();
  } catch (error) {
    console.error('Error loading todos:', error);
    todos = [];
  }
}

// Save todos to storage
async function saveTodos() {
  try {
    // Ensure positions are sequential before saving
    todos.forEach((todo, index) => {
        todo.position = index;
    });
    console.log('Saving todos:', JSON.stringify(todos));
    await invoke('save_todos', { todos: todos });
    console.log('Todos saved successfully');
  } catch (error) {
    console.error('Error saving todos:', error);
    console.error('Error details:', JSON.stringify(error));
  }
}

// Save trashed todos to storage
async function saveTrash() {
  try {
    console.log('Saving trash:', JSON.stringify(trashedTodos));
    await invoke('save_trash', { todos: trashedTodos });
    console.log('Trash saved successfully');
  } catch (error) {
    console.error('Error saving trash:', error);
    console.error('Error details:', JSON.stringify(error));
  }
}

// Load trashed todos from storage
async function loadTrash() {
  try {
    console.log('Loading trash...');
    trashedTodos = await invoke('load_trash');
    console.log('Loaded trash:', trashedTodos);
    // No need to render trash here initially, handled by button click
  } catch (error) {
    console.error('Error loading trash:', error);
    trashedTodos = [];
  }
}

// Load categories from storage via Tauri
async function loadCategories() {
  try {
    console.log('Loading categories...');
    categories = await invoke('load_categories');
    console.log('Loaded categories:', categories);
    renderCategoryDropdown();
  } catch (error) {
    console.error('Error loading categories:', error);
    categories = [];
    renderCategoryDropdown();
  }
}

// Save categories to storage via Tauri
async function saveCategories() {
  try {
    console.log('Saving categories:', JSON.stringify(categories));
    await invoke('save_categories', { categories: categories });
    console.log('Categories saved successfully');
  } catch (error) {
    console.error('Error saving categories:', error);
    console.error('Error details:', JSON.stringify(error));
  }
}


// Add a new category and save
function addCategory(name, color = getRandomColor()) {
  if (name.trim() === '') return;

  const newCategory = {
    id: Date.now(),
    name: name.trim(),
    color: color
  };

  categories.push(newCategory);
  saveCategories();
  renderCategoryDropdown();
  return newCategory;
}

// Get a random color for new categories
function getRandomColor() {
  const colors = [
    '#ff5555', '#ff8855', '#ffbb55', '#ffee55', '#bbff55',
    '#88ff55', '#55ff55', '#55ffaa', '#55ffff', '#55aaff',
    '#5555ff', '#8855ff', '#bb55ff', '#ff55ff', '#ff55aa'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Get contrast color (black or white) based on background color
function getContrastColor(hexColor) {
  hexColor = hexColor.replace('#', '');
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Render the category dropdown
function renderCategoryDropdown() {
  const categorySelect = document.getElementById('category-select');
  if (!categorySelect) return;
  const currentVal = categorySelect.value; // Preserve selection if possible

  categorySelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a category (optional)';
  categorySelect.appendChild(defaultOption);

  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.style.color = category.color;
    categorySelect.appendChild(option);
  });

  const newOption = document.createElement('option');
  newOption.value = 'new';
  newOption.textContent = '+ Add new category';
  categorySelect.appendChild(newOption);

  // Try to restore previous selection
  if (categories.some(c => c.id.toString() === currentVal)) {
      categorySelect.value = currentVal;
  }
}

// Add a new todo
function addTodo(text, dueDate = null, categoryId = null) {
  if (text.trim() === '') return;

  let category = null;
  if (categoryId && categoryId !== 'new' && categoryId !== '') {
    category = categories.find(c => c.id.toString() === categoryId.toString());
  }

  const newTodo = {
    id: Date.now(),
    text: text.trim(),
    completed: false,
    created_at: new Date().toISOString(),
    due_date: dueDate,
    category: category ? { id: category.id, name: category.name, color: category.color } : null,
    position: todos.length // Position will be updated on save
  };

  todos.push(newTodo);
  saveTodos(); // Save updates positions
  renderTodos();
  todoInput.value = '';
  dueDateInput.value = '';
  document.getElementById('category-select').value = '';
}

// Toggle todo completion status
function toggleTodo(id) {
  todos = todos.map(todo => {
    if (todo.id === id) {
      return { ...todo, completed: !todo.completed };
    }
    return todo;
  });
  saveTodos();
  renderTodos();
}

// Move a todo to trash
function trashTodo(id) {
  const todoToTrashIndex = todos.findIndex(todo => todo.id === id);
  if (todoToTrashIndex > -1) {
    const [todoToTrash] = todos.splice(todoToTrashIndex, 1); // Remove and get item
    trashedTodos.push({
      ...todoToTrash,
      trashedAt: new Date().toISOString()
    });
    saveTodos(); // Save updated positions
    saveTrash();
    renderTodos();
  }
}

// Restore/Delete functions removed from main.js - Handled in trash.js via backend commands

// Clear all completed todos
function clearCompleted() {
  const completedTodos = todos.filter(todo => todo.completed);
  // Move completed to trash instead of deleting directly
  completedTodos.forEach(todo => {
      trashedTodos.push({
          ...todo,
          trashedAt: new Date().toISOString()
      });
  });
  todos = todos.filter(todo => !todo.completed);
  saveTodos(); // Save updated positions
  saveTrash(); // Save the newly trashed items
  renderTodos();
}

// Set the current filter
function setFilter(filter) {
  currentFilter = filter;
  filterAllBtn.classList.toggle('active', filter === 'all');
  filterActiveBtn.classList.toggle('active', filter === 'active');
  filterCompletedBtn.classList.toggle('active', filter === 'completed');
  renderTodos();
}

// Helper to create a single todo list item element
function createTodoElement(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.setAttribute('data-id', todo.id);
  li.draggable = true;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = todo.completed;
  checkbox.addEventListener('change', () => toggleTodo(todo.id));

  const textContainer = document.createElement('div');
  textContainer.className = 'todo-text-container';

  const span = document.createElement('span');
  span.className = `todo-text ${todo.completed ? 'completed' : ''}`;
  span.textContent = todo.text;
  span.addEventListener('dblclick', () => editTodo(todo.id));
  textContainer.appendChild(span);

  if (todo.due_date) {
    const dueDate = document.createElement('span');
    dueDate.className = 'todo-due-date';
    dueDate.textContent = `Due: ${todo.due_date}`;
    textContainer.appendChild(dueDate);
  }

  if (todo.category) {
    const categorySpan = document.createElement('span');
    categorySpan.className = 'todo-category';
    categorySpan.textContent = todo.category.name;
    categorySpan.style.backgroundColor = todo.category.color;
    categorySpan.style.color = getContrastColor(todo.category.color);
    textContainer.appendChild(categorySpan);
  }

  if (todo.created_at) {
      const createdDate = document.createElement('span');
      createdDate.className = 'todo-created-date';
      try {
          const dateObj = new Date(todo.created_at);
          createdDate.textContent = `Added: ${dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit'})}`;
          createdDate.title = dateObj.toISOString();
      } catch (e) {
          createdDate.textContent = 'Added: Invalid Date';
      }
      textContainer.appendChild(createdDate);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-delete';
  deleteBtn.innerHTML = '🗑️'; // Use trash icon
  deleteBtn.title = 'Move to Trash'; // Tooltip
  deleteBtn.addEventListener('click', () => trashTodo(todo.id));

  li.appendChild(checkbox);
  li.appendChild(textContainer);
  li.appendChild(deleteBtn);

  // Add drag listeners to the item itself
  li.addEventListener('dragstart', handleDragStart);
  li.addEventListener('dragend', handleDragEnd);

  return li;
}


// Render todos based on current filter and grouping state
function renderTodos() {
  console.log(`Rendering todos. Grouped: ${isGroupedByCategory}, Sort: ${sortBy} ${sortDirection}`);

  // Ensure todoList is available
  if (!todoList) {
      console.error("todoList element not found during render!");
      return;
  }

  // Remove trash container if it exists (legacy)
  document.getElementById('trash-container')?.remove();
  todoList.style.display = 'block'; // Ensure main list is visible

  // Detach listeners before clearing to avoid memory leaks with old nodes
  // This might be overkill if innerHTML = '' is sufficient, but safer.
  Array.from(todoList.querySelectorAll('ul')).forEach(ul => {
      ul.removeEventListener('dragover', handleDragOver);
      ul.removeEventListener('dragenter', handleDragEnter);
      ul.removeEventListener('dragleave', handleDragLeave);
      ul.removeEventListener('drop', handleDrop);
  });

  todoList.innerHTML = ''; // Clear the main list container

  // 1. Filter todos
  let filteredTodos = todos.filter(todo => {
    if (currentFilter === 'active') return !todo.completed;
    if (currentFilter === 'completed') return todo.completed;
    return true;
  });

  // 2. Sort filtered todos
  filteredTodos.sort((a, b) => {
    let compareA, compareB;
    switch (sortBy) {
      case 'name': compareA = a.text.toLowerCase(); compareB = b.text.toLowerCase(); break;
      case 'date': compareA = a.created_at || ''; compareB = b.created_at || ''; break;
      case 'position': default: compareA = a.position; compareB = b.position; break;
    }
    let comparison = 0;
    if (compareA > compareB) comparison = 1;
    else if (compareA < compareB) comparison = -1;
    return sortDirection === 'desc' ? (comparison * -1) : comparison;
  });

  console.log('Sorted & Filtered todos:', filteredTodos.length);

  // 3. Render based on grouping
  if (isGroupedByCategory) {
    const groupedTodos = filteredTodos.reduce((acc, todo) => {
      const categoryId = todo.category ? todo.category.id.toString() : 'uncategorized';
      if (!acc[categoryId]) {
        acc[categoryId] = { category: todo.category, todos: [] };
      }
      acc[categoryId].todos.push(todo);
      return acc;
    }, {});

    const sortedGroupKeys = Object.keys(groupedTodos).sort((a, b) => {
        if (a === 'uncategorized') return 1;
        if (b === 'uncategorized') return -1;
        const catA = groupedTodos[a].category?.name || '';
        const catB = groupedTodos[b].category?.name || '';
        return catA.localeCompare(catB);
    });

    sortedGroupKeys.forEach(categoryId => {
      const groupData = groupedTodos[categoryId];
      const category = groupData.category;
      const categoryName = category ? category.name : 'Uncategorized';
      const categoryColor = category ? category.color : '#cccccc';

      const groupDiv = document.createElement('div');
      groupDiv.className = 'category-group';
      groupDiv.dataset.categoryId = categoryId;

      const header = document.createElement('div');
      header.className = 'category-group-header';
      const colorIndicator = document.createElement('span');
      colorIndicator.className = 'category-color-indicator';
      colorIndicator.style.backgroundColor = categoryColor;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-name';
      nameSpan.textContent = categoryName;
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'toggle-icon';
      toggleIcon.textContent = foldedCategories.has(categoryId) ? '▶' : '▼';
      header.appendChild(colorIndicator);
      header.appendChild(nameSpan);
      header.appendChild(toggleIcon);

      const groupList = document.createElement('ul');
      groupList.className = 'category-group-list';
      groupData.todos.forEach(todo => groupList.appendChild(createTodoElement(todo)));

      addDragDropListenersToList(groupList); // Add listeners to this specific UL

      if (foldedCategories.has(categoryId)) {
        groupDiv.classList.add('folded');
      }

      header.addEventListener('click', () => toggleCategoryFold(categoryId, groupDiv));
      groupDiv.appendChild(header);
      groupDiv.appendChild(groupList);
      todoList.appendChild(groupDiv);
    });
  } else {
    // Flat List Rendering
    const flatListUl = document.createElement('ul'); // Create a single UL for the flat list
    filteredTodos.forEach(todo => flatListUl.appendChild(createTodoElement(todo)));
    addDragDropListenersToList(flatListUl); // Add listeners to the single UL
    todoList.appendChild(flatListUl); // Append the UL to the main container
  }

  // Update items left count
  const activeCount = todos.filter(todo => !todo.completed).length;
  itemsLeftSpan.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
}

// Toggle category fold state
function toggleCategoryFold(categoryId, groupElement) {
    const isFolded = foldedCategories.has(categoryId);
    if (isFolded) {
        foldedCategories.delete(categoryId);
        groupElement.classList.remove('folded');
        groupElement.querySelector('.toggle-icon').textContent = '▼';
    } else {
        foldedCategories.add(categoryId);
        groupElement.classList.add('folded');
        groupElement.querySelector('.toggle-icon').textContent = '▶';
    }
    saveFoldedState();
}


// Edit a todo
function editTodo(id) {
  const todo = todos.find(todo => todo.id === id);
  if (!todo) return;
  const li = document.querySelector(`#todo-list li[data-id="${id}"]`); // More specific selector
  if (!li) return;

  const textContainer = li.querySelector('.todo-text-container');
  const originalContent = textContainer.innerHTML; // Save original content
  textContainer.innerHTML = ''; // Clear for edit form

  const editForm = document.createElement('form');
  editForm.className = 'todo-edit-form';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'todo-edit-input';
  textInput.value = todo.text;

  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.className = 'todo-edit-due-date';
  dueDateInput.value = todo.due_date || '';

  const categorySelectEdit = document.createElement('select'); // Use different var name
  categorySelectEdit.className = 'todo-edit-category category-select'; // Reuse class
  categorySelectEdit.setAttribute('aria-label', 'Select category');

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a category (optional)';
  categorySelectEdit.appendChild(defaultOption);

  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.style.color = category.color;
    if (todo.category && todo.category.id === category.id) {
      option.selected = true;
    }
    categorySelectEdit.appendChild(option);
  });

  const newOption = document.createElement('option');
  newOption.value = 'new';
  newOption.textContent = '+ Add new category';
  categorySelectEdit.appendChild(newOption);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'todo-edit-save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button'); // Add Cancel button
  cancelBtn.type = 'button';
  cancelBtn.className = 'todo-edit-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
      textContainer.innerHTML = originalContent; // Restore original content
      // Re-attach dblclick listener if needed (might be complex)
      // For simplicity, we rely on the next render to fix listeners
  });


  editForm.appendChild(textInput);
  editForm.appendChild(dueDateInput);
  editForm.appendChild(categorySelectEdit);
  editForm.appendChild(saveBtn);
  editForm.appendChild(cancelBtn); // Add cancel button to form

  categorySelectEdit.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      document.getElementById('category-modal').style.display = 'block';
      document.getElementById('category-modal').dataset.editFormId = id;
      document.getElementById('category-modal').dataset.editText = textInput.value;
      document.getElementById('category-modal').dataset.editDueDate = dueDateInput.value || '';
      // Optionally hide the edit form while modal is open
      editForm.style.display = 'none';
    }
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newText = textInput.value;
    const newDueDate = dueDateInput.value ? dueDateInput.value : null;
    const newCategoryId = categorySelectEdit.value;

    if (newCategoryId === 'new') {
      // Modal handling logic (already present)
       document.getElementById('category-modal').style.display = 'block';
       document.getElementById('category-modal').dataset.editFormId = id;
       document.getElementById('category-modal').dataset.editText = newText;
       document.getElementById('category-modal').dataset.editDueDate = newDueDate || '';
       editForm.style.display = 'none'; // Hide form
    } else {
      updateTodo(id, newText, newDueDate, newCategoryId);
      // renderTodos() is called within updateTodo
    }
  });

  textContainer.appendChild(editForm);
  textInput.focus();
}

// Update a todo
function updateTodo(id, text, dueDate, categoryId) {
  if (text.trim() === '') {
      // Optionally re-render to cancel edit if text is empty
      renderTodos();
      return;
  };

  let category = null;
  if (categoryId && categoryId !== 'new' && categoryId !== '') {
    category = categories.find(c => c.id.toString() === categoryId.toString());
  }

  todos = todos.map(todo => {
    if (todo.id === id) {
      return {
        ...todo,
        text: text.trim(),
        due_date: dueDate,
        category: category ? { id: category.id, name: category.name, color: category.color } : null
      };
    }
    return todo;
  });

  saveTodos();
  renderTodos(); // Re-render the list to show updated item
}

// Function to open the separate trash window
function openTrashWindow() {
    // Check if window already exists
    let trashWin = WebviewWindow.getByLabel('trashWindow');

    if (trashWin) {
        // If window exists, try to focus it
        trashWin.setFocus().catch(console.error);
    } else {
        // If not, create it
        trashWin = new WebviewWindow('trashWindow', {
            url: 'trash.html', // Path to the new trash HTML file
        title: 'Trash Bin',
        width: 600,
        height: 400,
        resizable: true,
        decorations: true, // Show window decorations (close, minimize, etc.)
    });

    // Optional: Listen for the window closing event
    trashWin.once('tauri://destroyed', () => {
        console.log('Trash window closed');
        // Reload trash data in main process memory when window closes
        loadTrash();
    });

    // Optional: Listen for errors during window creation
    trashWin.once('tauri://error', (e) => {
        console.error('Failed to create trash window:', e);
        // Optionally inform the user
        alert('Could not open the trash window.');
        });
    } // End of else block (window doesn't exist)
} // End of openTrashWindow function


// --- Drag and Drop Handlers ---

// Helper to add listeners to a list container (ul)
function addDragDropListenersToList(listElement) {
    // Remove existing listeners first to prevent duplicates on re-render
    listElement.removeEventListener('dragover', handleDragOver);
    listElement.removeEventListener('dragenter', handleDragEnter);
    listElement.removeEventListener('dragleave', handleDragLeave);
    listElement.removeEventListener('drop', handleDrop);

    // Add fresh listeners
    listElement.addEventListener('dragover', handleDragOver);
    listElement.addEventListener('dragenter', handleDragEnter);
    listElement.addEventListener('dragleave', handleDragLeave);
    listElement.addEventListener('drop', handleDrop);
}

// Create placeholder element
function createPlaceholder() {
    if (!placeholder) {
        placeholder = document.createElement('li');
        placeholder.className = 'drag-placeholder';
        if (draggedItem) {
            placeholder.style.height = `${draggedItem.offsetHeight}px`;
        }
    }
    return placeholder;
}

// Get the element to insert before, filtering out dragging item and placeholder
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging):not(.drag-placeholder)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


function handleDragStart(e) {
    // Prevent dragging if an input field inside the item has focus
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
        e.preventDefault();
        return;
    }

    draggedItem = e.target; // The li element
    draggedItemId = parseInt(draggedItem.dataset.id);
    // Use setTimeout to ensure the 'dragging' class is applied after the drag image is generated
    setTimeout(() => {
        draggedItem.classList.add('dragging');
    }, 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItemId); // Essential for identifying the item
    console.log(`Drag Start: ID ${draggedItemId}`);
    createPlaceholder(); // Create placeholder once drag starts
}

function handleDragEnter(e) {
    e.preventDefault();
    const listElement = e.target.closest('ul');
    // Highlight target list if dragging over it
    if (listElement && draggedItem && listElement.contains(e.target)) {
       listElement.classList.add('drag-over-active');
    }
}

function handleDragLeave(e) {
    const listElement = e.target.closest('ul');
    // Remove highlight if cursor leaves the list boundaries
    if (listElement && !listElement.contains(e.relatedTarget)) {
        listElement.classList.remove('drag-over-active');
        placeholder?.remove(); // Remove placeholder if leaving list entirely
    }
}


function handleDragOver(e) {
    e.preventDefault(); // Crucial to allow dropping
    e.dataTransfer.dropEffect = 'move';

    const listElement = e.target.closest('ul');
    if (!listElement || !draggedItem) return;

    // Ensure placeholder exists and has the correct height
    const currentPlaceholder = createPlaceholder();
    if (placeholder.style.height !== `${draggedItem.offsetHeight}px`) {
         placeholder.style.height = `${draggedItem.offsetHeight}px`;
    }

    const afterElement = getDragAfterElement(listElement, e.clientY);

    // Insert placeholder at the correct position
    if (afterElement == null) {
        // Append to end if no element is below the cursor
        if (!listElement.lastElementChild || (listElement.lastElementChild !== currentPlaceholder && listElement.lastElementChild !== draggedItem)) {
             listElement.appendChild(currentPlaceholder);
        }
    } else {
        // Insert before the element determined by getDragAfterElement
        if (afterElement !== currentPlaceholder.nextSibling) {
             listElement.insertBefore(currentPlaceholder, afterElement);
        }
    }
}


function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling

    const listElement = placeholder?.closest('ul'); // Get list from placeholder's final position

    if (!draggedItemId || !placeholder || !listElement) {
        console.warn("Drop cancelled: Missing dragged item ID, placeholder, or target list.");
        cleanupDragState();
        return;
    }

    console.log(`Drop: ID ${draggedItemId} into list`, listElement);

    // --- Calculate Indices ---
    // Index where the placeholder is, which is the target drop index
    const targetVisualIndex = Array.from(listElement.children).indexOf(placeholder);
    // Find the original todo item in the *data* array
    const originalDataIndex = todos.findIndex(todo => todo.id === draggedItemId);

    if (originalDataIndex === -1) {
        console.error("Dragged todo not found in data array!");
        cleanupDragState();
        return;
    }

    // --- Update Data Array ---
    // 1. Remove the item from its original position in the data array
    const [draggedTodo] = todos.splice(originalDataIndex, 1);

    // 2. Insert the item at the new position in the data array
    //    The visual index corresponds directly to the data index *after* removal,
    //    but we need to account for the placeholder itself if it wasn't the dragged item.
    //    However, since we re-calculate all positions below, inserting at the visual index
    //    before recalculation is simpler.
    todos.splice(targetVisualIndex, 0, draggedTodo);

    // 3. Update positions sequentially for *all* todos
    todos.forEach((todo, index) => {
        todo.position = index;
    });

    console.log("Updated todos array after drop:", todos.map(t => ({id: t.id, pos: t.position})));

    // --- Cleanup and Re-render ---
    saveTodos(); // Save the new order (includes updated positions)
    renderTodos(); // Re-render based on the updated data array
    cleanupDragState(); // Do cleanup *after* potential re-render starts
}


function handleDragEnd(e) {
    console.log(`Drag End: ID ${draggedItemId}`);
    // Cleanup is important regardless of whether drop was successful
    cleanupDragState();
}

// Helper to reset drag state
function cleanupDragState() {
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
    placeholder?.remove(); // Use optional chaining
    // Remove highlight from all potential lists
    document.querySelectorAll('.drag-over-active').forEach(el => el.classList.remove('drag-over-active'));

    // Reset state variables
    draggedItem = null;
    draggedItemId = null;
    placeholder = null;
}


// --- Local Storage Helpers ---
function loadGroupingState() {
    const storedState = localStorage.getItem('isGroupedByCategory');
    isGroupedByCategory = storedState === 'true';
    console.log('Loaded grouping state:', isGroupedByCategory);
}

function saveGroupingState() {
    localStorage.setItem('isGroupedByCategory', isGroupedByCategory);
    console.log('Saved grouping state:', isGroupedByCategory);
}

function loadFoldedState() {
    const storedState = localStorage.getItem('foldedCategories');
    if (storedState) {
        try {
            const foldedArray = JSON.parse(storedState);
            foldedCategories = new Set(foldedArray);
        } catch (e) {
            console.error("Failed to parse folded categories state:", e);
            foldedCategories = new Set();
        }
    } else {
        foldedCategories = new Set();
    }
    console.log('Loaded folded state:', foldedCategories);
}

function saveFoldedState() {
    const foldedArray = Array.from(foldedCategories);
    localStorage.setItem('foldedCategories', JSON.stringify(foldedArray));
    console.log('Saved folded state:', foldedArray);
}

function loadSortState() {
    const storedSortBy = localStorage.getItem('sortBy');
    const storedSortDirection = localStorage.getItem('sortDirection');
    sortBy = storedSortBy || 'position';
    sortDirection = storedSortDirection || 'asc';
    console.log(`Loaded sort state: ${sortBy} ${sortDirection}`);
}

function saveSortState() {
    localStorage.setItem('sortBy', sortBy);
    localStorage.setItem('sortDirection', sortDirection);
    console.log(`Saved sort state: ${sortBy} ${sortDirection}`);
}


// Initialize the app
window.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM content loaded');

  // Load UI states
  loadGroupingState();
  loadFoldedState();
  loadSortState();

  // Get DOM elements
  todoInput = document.querySelector('#todo-input');
  todoList = document.querySelector('#todo-list'); // This is the main container (e.g., a div)
  itemsLeftSpan = document.querySelector('#items-left');
  filterAllBtn = document.querySelector('#filter-all');
  filterActiveBtn = document.querySelector('#filter-active');
  filterCompletedBtn = document.querySelector('#filter-completed');
  clearCompletedBtn = document.querySelector('#clear-completed');
  dueDateInput = document.querySelector('#todo-due-date');
  categorySelect = document.getElementById('category-select');
  groupByToggle = document.getElementById('group-by-category-toggle');
  sortByButtons = document.querySelectorAll('.sort-by-btn');
  sortDirectionButtons = document.querySelectorAll('.sort-direction-btn');
  viewTrashBtn = document.querySelector('#view-trash'); // Get trash button

  // Set initial UI states
  if (groupByToggle) groupByToggle.checked = isGroupedByCategory;
  updateSortButtonsUI();

  // Add event listeners
  const todoForm = document.querySelector('#todo-form');
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value;
    const dueDate = dueDateInput.value || null;
    const categoryId = categorySelect.value;
    if (categoryId === 'new') {
      document.getElementById('category-modal').style.display = 'block';
      todoForm.dataset.pendingText = text;
      todoForm.dataset.pendingDueDate = dueDate || '';
    } else {
      addTodo(text, dueDate, categoryId);
    }
  });

  const addButton = document.querySelector('#add-todo-btn');
  addButton.addEventListener('click', () => { // Backup click handler
      const text = todoInput.value;
      const dueDate = dueDateInput.value || null;
      const categoryId = categorySelect.value;
      if (categoryId === 'new') {
          document.getElementById('category-modal').style.display = 'block';
          todoForm.dataset.pendingText = text;
          todoForm.dataset.pendingDueDate = dueDate || '';
      } else {
          addTodo(text, dueDate, categoryId);
      }
  });


  if (groupByToggle) {
      groupByToggle.addEventListener('change', (e) => {
          isGroupedByCategory = e.target.checked;
          saveGroupingState();
          renderTodos();
      });
  }

  sortByButtons.forEach(button => {
    button.addEventListener('click', () => {
      sortBy = button.dataset.sort;
      saveSortState();
      updateSortButtonsUI();
      renderTodos();
    });
  });

  sortDirectionButtons.forEach(button => {
    button.addEventListener('click', () => {
      sortDirection = button.dataset.direction;
      saveSortState();
      updateSortButtonsUI();
      renderTodos();
    });
  });

  function updateSortButtonsUI() {
    sortByButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.sort === sortBy));
    sortDirectionButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.direction === sortDirection));
  }

  categorySelect.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      document.getElementById('category-modal').style.display = 'block';
    }
  });

  const closeBtn = document.querySelector('.modal .close'); // More specific selector
  closeBtn.addEventListener('click', () => {
    const modal = document.getElementById('category-modal');
    modal.style.display = 'none';
    // Restore edit form if it was hidden
    if (modal.dataset.editFormId) {
        const form = document.querySelector(`.todo-item[data-id="${modal.dataset.editFormId}"] .todo-edit-form`);
        if (form) form.style.display = ''; // Show form again
        // Clear edit data
        delete modal.dataset.editFormId;
        delete modal.dataset.editText;
        delete modal.dataset.editDueDate;
    }
    categorySelect.value = ''; // Reset main category select
  });

  const saveCategoryBtn = document.getElementById('save-category-btn');
  saveCategoryBtn.addEventListener('click', () => {
    const categoryName = document.getElementById('category-name').value;
    const categoryColor = document.getElementById('category-color').value;
    const modal = document.getElementById('category-modal');

    if (categoryName.trim() === '') {
      alert('Please enter a category name'); return;
    }

    const newCategory = addCategory(categoryName, categoryColor);
    modal.style.display = 'none';
    document.getElementById('category-name').value = ''; // Reset modal form

    // Check if we were editing a todo when opening the modal
    if (modal.dataset.editFormId) {
      const todoId = parseInt(modal.dataset.editFormId);
      const text = modal.dataset.editText;
      const dueDate = modal.dataset.editDueDate || null;
      updateTodo(todoId, text, dueDate, newCategory.id.toString()); // Update with new category ID
      // Clear edit data
      delete modal.dataset.editFormId;
      delete modal.dataset.editText;
      delete modal.dataset.editDueDate;
    }
    // Check if we were adding a new todo
    else if (todoForm.dataset.pendingText) {
      const text = todoForm.dataset.pendingText;
      const dueDate = todoForm.dataset.pendingDueDate || null;
      addTodo(text, dueDate, newCategory.id.toString());
      delete todoForm.dataset.pendingText;
      delete todoForm.dataset.pendingDueDate;
    } else {
      categorySelect.value = newCategory.id.toString(); // Select new category in main form
    }
  });

  window.addEventListener('click', (e) => { // Close modal on outside click
    const modal = document.getElementById('category-modal');
    if (e.target === modal) {
      closeBtn.click(); // Trigger close logic
    }
  });

  filterAllBtn.addEventListener('click', () => setFilter('all'));
  filterActiveBtn.addEventListener('click', () => setFilter('active'));
  filterCompletedBtn.addEventListener('click', () => setFilter('completed'));
  clearCompletedBtn.addEventListener('click', clearCompleted);

  // Trash button listener - Opens new window
  viewTrashBtn.addEventListener('click', openTrashWindow);

  // Listen for 'todos-updated' event from trash window to refresh main list
  const { listen } = window.__TAURI__.event;
  listen('todos-updated', () => {
      console.log('Main Window: Received todos-updated event');
      loadTodos(); // Reload and re-render the main todo list
  });


  // Load initial data
  await loadCategories();
  await loadTodos(); // Renders the initial list
  await loadTrash(); // Load trash data into memory
});
