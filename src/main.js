const { invoke } = window.__TAURI__.core;

// Todo app state
let todos = [];
let trashedTodos = [];
let categories = [];
let currentFilter = 'all';
let draggedItem = null;
let isGroupedByCategory = false;
let foldedCategories = new Set();
let sortBy = 'position'; // Default sort: 'position', 'name'
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

// Load todos from storage
async function loadTodos() {
  try {
    console.log('Loading todos...');
    todos = await invoke('load_todos');
    console.log('Loaded todos:', todos);
    // Sort todos by position
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
    renderTrash();
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
    // Fallback to default if loading fails? Or just empty? Let's start empty.
    categories = [];
    renderCategoryDropdown(); // Render empty dropdown
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
    // Ensure ID is a number (u64 in Rust) - Date.now() is fine
    id: Date.now(),
    name: name.trim(),
    color: color
  };

  categories.push(newCategory);
  saveCategories(); // Save after adding
  renderCategoryDropdown();
  return newCategory; // Return the category object as before
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
  // Remove the # if it exists
  hexColor = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Render the category dropdown
function renderCategoryDropdown() {
  const categorySelect = document.getElementById('category-select');
  if (!categorySelect) return;

  // Clear existing options
  categorySelect.innerHTML = '';

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a category (optional)';
  categorySelect.appendChild(defaultOption);

  // Add categories
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.style.color = category.color;
    categorySelect.appendChild(option);
  });

  // Add option to create new category
  const newOption = document.createElement('option');
  newOption.value = 'new';
  newOption.textContent = '+ Add new category';
  categorySelect.appendChild(newOption);
}

// Add a new todo
function addTodo(text, dueDate = null, categoryId = null) {
  if (text.trim() === '') return;

  // Find the selected category
  let category = null;
  if (categoryId && categoryId !== 'new') {
    category = categories.find(c => c.id.toString() === categoryId.toString());
  }

  const newTodo = {
    id: Date.now(),
    text: text.trim(),
    completed: false,
    created_at: new Date().toISOString(), // Add creation timestamp
    due_date: dueDate,
    category: category ? { id: category.id, name: category.name, color: category.color } : null,
    position: todos.length
  };

  todos.push(newTodo);
  saveTodos();
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
  const todoToTrash = todos.find(todo => todo.id === id);
  if (todoToTrash) {
    // Add to trashed todos
    trashedTodos.push({
      ...todoToTrash,
      trashedAt: new Date().toISOString()
    });

    // Remove from active todos
    todos = todos.filter(todo => todo.id !== id);

    saveTodos();
    saveTrash();
    renderTodos();
  }
}

// Restore a todo from trash
function restoreTodo(id) {
  const todoToRestore = trashedTodos.find(todo => todo.id === id);
  if (todoToRestore) {
    // Remove trashedAt property
    const { trashedAt, ...restoredTodo } = todoToRestore;

    // Add back to active todos
    todos.push(restoredTodo);

    // Remove from trash
    trashedTodos = trashedTodos.filter(todo => todo.id !== id);

    saveTodos();
    saveTrash();
    renderTodos();
    renderTrash();
  }
}

// Permanently delete a todo from trash
function permanentlyDeleteTodo(id) {
  trashedTodos = trashedTodos.filter(todo => todo.id !== id);
  saveTrash();
  renderTrash();
}

// Clear all completed todos
function clearCompleted() {
  todos = todos.filter(todo => !todo.completed);
  saveTodos();
  renderTodos();
}

// Set the current filter
function setFilter(filter) {
  currentFilter = filter;

  // Update active filter button
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
  li.draggable = true; // Make items draggable

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
  // Add double-click listener for editing
  span.addEventListener('dblclick', () => editTodo(todo.id));


  textContainer.appendChild(span);

  // Add due date if exists
  if (todo.due_date) {
    const dueDate = document.createElement('span');
    dueDate.className = 'todo-due-date';
    dueDate.textContent = `Due: ${todo.due_date}`;
    textContainer.appendChild(dueDate);
  }

  // Add category if exists
  if (todo.category) {
    const categorySpan = document.createElement('span');
    categorySpan.className = 'todo-category';
    categorySpan.textContent = todo.category.name;
    categorySpan.style.backgroundColor = todo.category.color;
    categorySpan.style.color = getContrastColor(todo.category.color);
    textContainer.appendChild(categorySpan);
  }

  // Add created date
  if (todo.created_at) {
      const createdDate = document.createElement('span');
      createdDate.className = 'todo-created-date';
      // Format the date nicely (e.g., Mar 30, 2025 8:40 PM)
      try {
          const dateObj = new Date(todo.created_at);
          createdDate.textContent = `Added: ${dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit'})}`;
          createdDate.title = dateObj.toISOString(); // Full date in tooltip
      } catch (e) {
          createdDate.textContent = 'Added: Invalid Date'; // Fallback
      }
      textContainer.appendChild(createdDate);
  }


  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-delete';
  deleteBtn.textContent = 'Move to Trash';
  deleteBtn.addEventListener('click', () => trashTodo(todo.id));

  li.appendChild(checkbox);
  li.appendChild(textContainer);
  li.appendChild(deleteBtn);

  // Add drag-and-drop listeners
  li.addEventListener('dragstart', handleDragStart);
  li.addEventListener('dragover', handleDragOver);
  li.addEventListener('drop', handleDrop);
  li.addEventListener('dragend', handleDragEnd);


  return li;
}


// Render todos based on current filter and grouping state
function renderTodos() {
  console.log(`Rendering todos. Grouped: ${isGroupedByCategory}, Sort: ${sortBy} ${sortDirection}`);

  // Hide trash container and show todo list
  document.getElementById('trash-container').style.display = 'none';
  todoList.style.display = 'block';

  todoList.innerHTML = ''; // Clear the main list container

  // 1. Filter todos based on the active filter (All, Active, Completed)
  let filteredTodos = todos.filter(todo => {
    if (currentFilter === 'active') return !todo.completed;
    if (currentFilter === 'completed') return todo.completed;
    return true; // 'all' filter
  });

  // 2. Sort the filtered todos based on current settings
  filteredTodos.sort((a, b) => {
    let compareA, compareB;

    switch (sortBy) {
      case 'name':
        compareA = a.text.toLowerCase();
        compareB = b.text.toLowerCase();
        break;
      case 'date':
        // Compare ISO date strings directly
        compareA = a.created_at || ''; // Handle potential missing data
        compareB = b.created_at || '';
        break;
      case 'position': // Default / fallback
      default:
        compareA = a.position;
        compareB = b.position;
        break;
      // Add cases for 'dueDate', 'categoryName' later if needed
    }

    let comparison = 0;
    if (compareA > compareB) {
      comparison = 1;
    } else if (compareA < compareB) {
      comparison = -1;
    }

    return sortDirection === 'desc' ? (comparison * -1) : comparison;
  });


  console.log('Sorted & Filtered todos:', filteredTodos.length);

  // 3. Render based on grouping state
  if (isGroupedByCategory) {
    // --- Grouped Rendering ---
    const groupedTodos = filteredTodos.reduce((acc, todo) => {
      const categoryId = todo.category ? todo.category.id.toString() : 'uncategorized';
      if (!acc[categoryId]) {
        acc[categoryId] = {
          category: todo.category, // Store category info (null for uncategorized)
          todos: []
        };
      }
      acc[categoryId].todos.push(todo);
      return acc;
    }, {});

    console.log('Grouped todos:', groupedTodos);

    // Sort categories (optional, e.g., alphabetically, or keep insertion order)
    const sortedGroupKeys = Object.keys(groupedTodos).sort((a, b) => {
        if (a === 'uncategorized') return 1; // Put uncategorized last
        if (b === 'uncategorized') return -1;
        const catA = groupedTodos[a].category?.name || '';
        const catB = groupedTodos[b].category?.name || '';
        return catA.localeCompare(catB);
    });


    sortedGroupKeys.forEach(categoryId => {
      const groupData = groupedTodos[categoryId];
      const category = groupData.category;
      const categoryName = category ? category.name : 'Uncategorized';
      const categoryColor = category ? category.color : '#cccccc'; // Default color for uncategorized

      const groupDiv = document.createElement('div');
      groupDiv.className = 'category-group';
      groupDiv.dataset.categoryId = categoryId; // Store ID for folding logic

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
      toggleIcon.textContent = '▼'; // Down arrow for expanded

      header.appendChild(colorIndicator);
      header.appendChild(nameSpan);
      header.appendChild(toggleIcon);

      const groupList = document.createElement('ul');
      groupList.className = 'category-group-list';

      // NOTE: Sorting is already done on filteredTodos *before* grouping.
      // The reduce operation preserves the order within each group.
      // No need to sort groupData.todos again here unless the primary sort
      // was different (e.g., sort categories first, then items within).

      groupData.todos.forEach(todo => {
        groupList.appendChild(createTodoElement(todo));
      });

      // Check folded state and apply class/icon
      if (foldedCategories.has(categoryId)) {
        groupDiv.classList.add('folded');
        toggleIcon.textContent = '▶'; // Right arrow for folded
      }

      // Add click listener to header for folding
      header.addEventListener('click', () => {
        toggleCategoryFold(categoryId, groupDiv);
      });

      groupDiv.appendChild(header);
      groupDiv.appendChild(groupList);
      todoList.appendChild(groupDiv); // Append the whole group to the main list
    });

  } else {
    // --- Flat List Rendering ---
    // Sorting was already done above
    filteredTodos.forEach(todo => {
      todoList.appendChild(createTodoElement(todo));
    });
  }

  // Update items left count (remains the same regardless of grouping)
  const activeCount = todos.filter(todo => !todo.completed).length;
  itemsLeftSpan.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
}

// Toggle category fold state
function toggleCategoryFold(categoryId, groupElement) {
    if (foldedCategories.has(categoryId)) {
        foldedCategories.delete(categoryId);
        groupElement.classList.remove('folded');
        groupElement.querySelector('.toggle-icon').textContent = '▼';
    } else {
        foldedCategories.add(categoryId);
        groupElement.classList.add('folded');
        groupElement.querySelector('.toggle-icon').textContent = '▶';
    }
    // Save the updated folded state
    saveFoldedState();
}


// Edit a todo
function editTodo(id) {
  const todo = todos.find(todo => todo.id === id);
  if (!todo) return;

  const li = document.querySelector(`li[data-id="${id}"]`);
  if (!li) return;

  const textContainer = li.querySelector('.todo-text-container');
  textContainer.innerHTML = '';

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

  const categorySelect = document.createElement('select');
  categorySelect.className = 'todo-edit-category category-select';
  categorySelect.setAttribute('aria-label', 'Select category');

  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a category (optional)';
  categorySelect.appendChild(defaultOption);

  // Add categories
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.style.color = category.color;

    // Select the current category if it exists
    if (todo.category && todo.category.id === category.id) {
      option.selected = true;
    }

    categorySelect.appendChild(option);
  });

  // Add option to create new category
  const newOption = document.createElement('option');
  newOption.value = 'new';
  newOption.textContent = '+ Add new category';
  categorySelect.appendChild(newOption);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'todo-edit-save';
  saveBtn.textContent = 'Save';

  editForm.appendChild(textInput);
  editForm.appendChild(dueDateInput);
  editForm.appendChild(categorySelect);
  editForm.appendChild(saveBtn);

  // Handle category select change
  categorySelect.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      // Show the category modal
      document.getElementById('category-modal').style.display = 'block';
      // Store the form for later
      document.getElementById('category-modal').dataset.editFormId = id;
      document.getElementById('category-modal').dataset.editText = textInput.value;
      document.getElementById('category-modal').dataset.editDueDate = dueDateInput.value || '';
    }
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Only use date and category values if they're not empty
    const dueDate = dueDateInput.value ? dueDateInput.value : null;
    const categoryId = categorySelect.value;

    if (categoryId === 'new') {
      // Show the category modal
      document.getElementById('category-modal').style.display = 'block';
      // Store the form for later
      document.getElementById('category-modal').dataset.editFormId = id;
      document.getElementById('category-modal').dataset.editText = textInput.value;
      document.getElementById('category-modal').dataset.editDueDate = dueDateInput.value || '';
    } else {
      updateTodo(id, textInput.value, dueDate, categoryId);
    }
  });

  textContainer.appendChild(editForm);
  textInput.focus();
}

// Update a todo
function updateTodo(id, text, dueDate, categoryId) {
  if (text.trim() === '') return;

  // Find the selected category
  let category = null;
  if (categoryId && categoryId !== 'new') {
    category = categories.find(c => c.id.toString() === categoryId.toString());
  }

  todos = todos.map(todo => {
    if (todo.id === id) {
      return {
        ...todo,
        text: text.trim(),
        due_date: dueDate, // Already handled as null if empty
        category: category ? { id: category.id, name: category.name, color: category.color } : null
      };
    }
    return todo;
  });

  saveTodos();
  renderTodos();
}

// Render the trash view
function renderTrash() {
  console.log('Rendering trash:', trashedTodos);

  // Show trash container and hide todo list
  const trashContainer = document.getElementById('trash-container');
  trashContainer.style.display = 'block';
  todoList.style.display = 'none';

  // Clear the trash list
  const trashList = document.getElementById('trash-list');
  trashList.innerHTML = '';

  // Sort trashed todos by trashed date (newest first)
  const sortedTrash = [...trashedTodos].sort((a, b) => {
    return new Date(b.trashedAt) - new Date(a.trashedAt);
  });

  // Create trash items
  sortedTrash.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'trash-item';

    const textSpan = document.createElement('span');
    textSpan.className = 'trash-text';
    textSpan.textContent = todo.text;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'trash-date';
    const trashedDate = new Date(todo.trashedAt);
    dateSpan.textContent = `Trashed: ${trashedDate.toLocaleDateString()}`;

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'trash-restore';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restoreTodo(todo.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'trash-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => permanentlyDeleteTodo(todo.id));

    li.appendChild(textSpan);
    li.appendChild(dateSpan);
    li.appendChild(restoreBtn);
    li.appendChild(deleteBtn);

    trashList.appendChild(li);
  });

  // Update empty trash button state
  const emptyTrashBtn = document.getElementById('empty-trash');
  emptyTrashBtn.disabled = trashedTodos.length === 0;
}

// Handle drag start
function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

// Handle drag over
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.target.closest('li');
  if (target && target !== draggedItem) {
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const isAfter = y > rect.height / 2;

    if (isAfter) {
      todoList.insertBefore(draggedItem, target.nextSibling);
    } else {
      todoList.insertBefore(draggedItem, target);
    }
  }
}

// Handle drop
function handleDrop(e) {
  e.stopPropagation();
  return false;
}

// Handle drag end
function handleDragEnd() {
  this.classList.remove('dragging');

  // Update positions
  const items = todoList.querySelectorAll('li');
  const newOrder = Array.from(items).map(item => parseInt(item.getAttribute('data-id')));

  // Create a position map
  const positionMap = {};
  newOrder.forEach((id, index) => {
    positionMap[id] = index;
  });

  // Update todos with new positions
  todos = todos.map(todo => ({
    ...todo,
    position: positionMap[todo.id] !== undefined ? positionMap[todo.id] : todo.position
  }));

  saveTodos();
}

// --- Local Storage Helpers ---
function loadGroupingState() {
    const storedState = localStorage.getItem('isGroupedByCategory');
    isGroupedByCategory = storedState === 'true'; // Convert string back to boolean
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
            foldedCategories = new Set(); // Reset on error
        }
    } else {
        foldedCategories = new Set(); // Default to empty set
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
    sortBy = storedSortBy || 'position'; // Default to position if not found
    sortDirection = storedSortDirection || 'asc'; // Default to asc if not found
    console.log(`Loaded sort state: ${sortBy} ${sortDirection}`);
}

function saveSortState() {
    localStorage.setItem('sortBy', sortBy);
    localStorage.setItem('sortDirection', sortDirection);
    console.log(`Saved sort state: ${sortBy} ${sortDirection}`);
}


// Initialize the app
window.addEventListener('DOMContentLoaded', async () => { // Add async here
  console.log('DOM content loaded');

  // Load UI states from localStorage
  loadGroupingState();
  loadFoldedState();
  loadSortState();


  // Get DOM elements
  todoInput = document.querySelector('#todo-input');
  todoList = document.querySelector('#todo-list');
  itemsLeftSpan = document.querySelector('#items-left');
  filterAllBtn = document.querySelector('#filter-all');
  filterActiveBtn = document.querySelector('#filter-active');
  filterCompletedBtn = document.querySelector('#filter-completed');
  clearCompletedBtn = document.querySelector('#clear-completed');
  dueDateInput = document.querySelector('#todo-due-date');
  categorySelect = document.getElementById('category-select');
  groupByToggle = document.getElementById('group-by-category-toggle');
  // Get button collections
  sortByButtons = document.querySelectorAll('.sort-by-btn');
  sortDirectionButtons = document.querySelectorAll('.sort-direction-btn');


  // Set initial state of UI controls
  if (groupByToggle) {
      groupByToggle.checked = isGroupedByCategory;
  } else {
      console.error("Group by category toggle switch not found!");
  }
  // Set initial active sort buttons
  updateSortButtonsUI();


  // Add event listeners
  const todoForm = document.querySelector('#todo-form');
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value;
    const dueDate = dueDateInput.value || null;
    const categoryId = document.getElementById('category-select').value;

    if (categoryId === 'new') {
      // Show the category modal
      document.getElementById('category-modal').style.display = 'block';
      // Store the todo text and due date for later
      todoForm.dataset.pendingText = text;
      todoForm.dataset.pendingDueDate = dueDate || '';
    } else {
      addTodo(text, dueDate, categoryId);
    }
  });

  // Add button click handler as a backup
  const addButton = document.querySelector('#add-todo-btn');
  addButton.addEventListener('click', () => {
    const text = todoInput.value;
    const dueDate = dueDateInput.value || null;
    const categoryId = document.getElementById('category-select').value;

    if (categoryId === 'new') {
      // Show the category modal
      document.getElementById('category-modal').style.display = 'block';
      // Store the todo text and due date for later
      todoForm.dataset.pendingText = text;
      todoForm.dataset.pendingDueDate = dueDate || '';
    } else {
      addTodo(text, dueDate, categoryId);
    }
  });

  // Group by Category Toggle listener
  if (groupByToggle) {
      groupByToggle.addEventListener('change', (e) => {
          isGroupedByCategory = e.target.checked;
          saveGroupingState(); // Save the new state
          renderTodos(); // Re-render the list with the new grouping
      });
  }

  // Sort button listeners
  sortByButtons.forEach(button => {
    button.addEventListener('click', () => {
      sortBy = button.dataset.sort; // Get sort value from data attribute
      saveSortState();
      updateSortButtonsUI(); // Update visual state
      renderTodos();
    });
  });

  sortDirectionButtons.forEach(button => {
    button.addEventListener('click', () => {
      sortDirection = button.dataset.direction; // Get direction value
      saveSortState();
      updateSortButtonsUI(); // Update visual state
      renderTodos();
    });
  });

  // Helper function to update active state on sort buttons
  function updateSortButtonsUI() {
    sortByButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === sortBy);
    });
    sortDirectionButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.direction === sortDirection);
    });
  }


  // Category select change handler
  // Use the globally scoped categorySelect assigned earlier
  categorySelect.addEventListener('change', (e) => {
    if (e.target.value === 'new') {
      // Show the category modal
      document.getElementById('category-modal').style.display = 'block';
    }
  });

  // Modal close button
  const closeBtn = document.querySelector('.close');
  closeBtn.addEventListener('click', () => {
    document.getElementById('category-modal').style.display = 'none';
    // Reset the category select
    categorySelect.value = '';
  });

  // Save category button
  const saveCategoryBtn = document.getElementById('save-category-btn');
  saveCategoryBtn.addEventListener('click', () => {
    const categoryName = document.getElementById('category-name').value;
    const categoryColor = document.getElementById('category-color').value;
    const modal = document.getElementById('category-modal');

    if (categoryName.trim() === '') {
      alert('Please enter a category name');
      return;
    }

    const newCategory = addCategory(categoryName, categoryColor);
    modal.style.display = 'none';

    // Reset the form
    document.getElementById('category-name').value = '';

    // Check if we're editing a todo
    if (modal.dataset.editFormId) {
      const todoId = parseInt(modal.dataset.editFormId);
      const text = modal.dataset.editText;
      const dueDate = modal.dataset.editDueDate || null;

      // Update the todo with the new category
      updateTodo(todoId, text, dueDate, newCategory.id.toString());

      // Clear the edit data
      delete modal.dataset.editFormId;
      delete modal.dataset.editText;
      delete modal.dataset.editDueDate;
    }
    // If there's a pending todo, add it with the new category
    else if (todoForm.dataset.pendingText) {
      const text = todoForm.dataset.pendingText;
      const dueDate = todoForm.dataset.pendingDueDate || null;
      addTodo(text, dueDate, newCategory.id.toString());

      // Clear the pending data
      delete todoForm.dataset.pendingText;
      delete todoForm.dataset.pendingDueDate;
    } else {
      // Select the new category in the dropdown
      categorySelect.value = newCategory.id.toString();
    }
  });

  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('category-modal');
    if (e.target === modal) {
      modal.style.display = 'none';
      // Reset the category select
      categorySelect.value = '';
    }
  });

  filterAllBtn.addEventListener('click', () => setFilter('all'));
  filterActiveBtn.addEventListener('click', () => setFilter('active'));
  filterCompletedBtn.addEventListener('click', () => setFilter('completed'));
  clearCompletedBtn.addEventListener('click', clearCompleted);

  // Add event listeners for trash functionality
  document.getElementById('view-trash').addEventListener('click', renderTrash);
  document.getElementById('close-trash').addEventListener('click', renderTodos);
  document.getElementById('empty-trash').addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
      trashedTodos = [];
      saveTrash();
      renderTrash();
    }
  });

  // Load categories FIRST, then todos and trash
  await loadCategories();
  await loadTodos();
  await loadTrash();
});
