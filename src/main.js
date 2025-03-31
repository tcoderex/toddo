// Check if we're running in a Tauri environment
const isTauri = window.__TAURI__ !== undefined;

// Import Tauri APIs if available
let invoke;
let WebviewWindowConstructor;
let tauriVersion = 'unknown';

if (isTauri) {
  try {
    // Import core API for invoke
    invoke = window.__TAURI__.core.invoke;

    // Log available APIs to help with debugging
    console.log('Tauri window API:', window.__TAURI__.window);
    console.log('Full Tauri API:', window.__TAURI__);

    // Try to determine the Tauri version
    if (window.__TAURI__.app && window.__TAURI__.app.getVersion) {
      window.__TAURI__.app.getVersion().then(version => {
        console.log('Tauri version:', version);
        tauriVersion = version;
      }).catch(err => {
        console.error('Error getting Tauri version:', err);
      });
    }

    // Try to get the WebviewWindow constructor
    if (window.__TAURI__.window) {
      if (typeof window.__TAURI__.window.WebviewWindow === 'function') {
        WebviewWindowConstructor = window.__TAURI__.window.WebviewWindow;
        console.log('WebviewWindow constructor found');
      } else {
        console.warn('WebviewWindow constructor not found');
      }
    }

    // Set up event listener for todos-updated event from trash window
    if (window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
      window.__TAURI__.event.listen('todos-updated', () => {
        console.log('Received todos-updated event from Tauri');
        loadTodos();
      });
      console.log('Registered Tauri event listener for todos-updated');
    }
  } catch (e) {
    console.error('Error initializing Tauri APIs:', e);
  }
} else {
  console.warn('Not running in a Tauri environment');

  // Create a mock invoke function for non-Tauri environments
  invoke = async (command, args) => {
    console.warn(`Mock invoke called: ${command}`, args);
    if (command === 'load_todos') return [];
    if (command === 'load_categories') return [];
    if (command === 'load_trash') return [];
    return null;
  };
}

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
let sortBy = 'name'; // Default sort: 'name', 'date'
let sortDirection = 'asc'; // Default direction: 'asc', 'desc'
let sortTarget = 'tasks'; // Default target: 'tasks', 'categories'

// DOM elements
let todoInput;
let sortTargetButtons; // Button group for sort target (tasks or categories)
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

// Add this after your existing variable declarations
let floatingControls;
let originalControlsBar;
let lastScrollPosition = 0;
const SCROLL_THRESHOLD = 100; // Adjust this value as needed

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

    // Ensure all categories have a created_at property for sorting
    categories = categories.map(category => {
      if (!category.created_at) {
        // If no created_at, use ID as a fallback (since it's likely a timestamp)
        return {
          ...category,
          created_at: new Date(parseInt(category.id)).toISOString()
        };
      }
      return category;
    });

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
function addCategory(name, color = getRandomColor(), parentId = null) {
  if (name.trim() === '') return;

  const newCategory = {
    id: Date.now(),
    name: name.trim(),
    color: color,
    parent_id: parentId,
    created_at: new Date().toISOString() // Add creation date for sorting
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

// Get all root categories (those without a parent)
function getRootCategories() {
  return categories.filter(category => !category.parent_id);
}

// Get subcategories for a given parent category ID
function getSubcategories(parentId) {
  return categories.filter(category => category.parent_id === parentId);
}

// Render the category dropdown with hierarchy
function renderCategoryDropdown() {
  const categorySelect = document.getElementById('category-select');
  if (!categorySelect) return;
  const currentVal = categorySelect.value; // Preserve selection if possible

  categorySelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a category (optional)';
  categorySelect.appendChild(defaultOption);

  // Add root categories first
  const rootCategories = getRootCategories();
  rootCategories.forEach(category => {
    addCategoryOption(categorySelect, category, 0);

    // Add subcategories recursively
    addSubcategoryOptions(categorySelect, category.id, 1);
  });

  const newOption = document.createElement('option');
  newOption.value = 'new';
  newOption.textContent = '+ Add new category';
  categorySelect.appendChild(newOption);

  const newSubOption = document.createElement('option');
  newSubOption.value = 'new-sub';
  newSubOption.textContent = '+ Add new subcategory';
  categorySelect.appendChild(newSubOption);

  // Try to restore previous selection
  if (categories.some(c => c.id.toString() === currentVal)) {
      categorySelect.value = currentVal;
  }
}

// Helper function to add a category option to the select element
function addCategoryOption(selectElement, category, level) {
  const option = document.createElement('option');
  option.value = category.id;

  // Add indentation based on level
  const indent = '\u00A0\u00A0'.repeat(level); // Non-breaking spaces for indentation
  const prefix = level > 0 ? '└─ ' : '';
  option.textContent = indent + prefix + category.name;

  option.style.color = category.color;
  option.dataset.level = level;
  option.dataset.parentId = category.parent_id || '';
  selectElement.appendChild(option);
}

// Recursively add subcategory options
function addSubcategoryOptions(selectElement, parentId, level) {
  const subcategories = getSubcategories(parentId);
  subcategories.forEach(subcategory => {
    addCategoryOption(selectElement, subcategory, level);
    // Recursively add children of this subcategory
    addSubcategoryOptions(selectElement, subcategory.id, level + 1);
  });
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

  // 2. Sort filtered todos - only if we're sorting tasks
  if (sortTarget === 'tasks') {
    filteredTodos.sort((a, b) => {
      let compareA, compareB;
      switch (sortBy) {
        case 'name': compareA = a.text.toLowerCase(); compareB = b.text.toLowerCase(); break;
        case 'date': compareA = a.created_at || ''; compareB = b.created_at || ''; break;
        default: compareA = a.text.toLowerCase(); compareB = b.text.toLowerCase(); break;
      }
      let comparison = 0;
      if (compareA > compareB) comparison = 1;
      else if (compareA < compareB) comparison = -1;
      return sortDirection === 'desc' ? (comparison * -1) : comparison;
    });
  }

  console.log('Sorted & Filtered todos:', filteredTodos.length);

  // 3. Render based on grouping
  if (isGroupedByCategory) {
    // Group filtered todos by category
    const groupedTodos = filteredTodos.reduce((acc, todo) => {
      const categoryId = todo.category ? todo.category.id.toString() : 'uncategorized';
      if (!acc[categoryId]) {
        acc[categoryId] = { category: todo.category, todos: [] };
      }
      acc[categoryId].todos.push(todo);
      return acc;
    }, {});

    // Get all root categories first
    let rootCategoryIds = categories
      .filter(cat => !cat.parent_id)
      .map(cat => cat.id.toString());

    // Add 'uncategorized' to the list of root categories if it has todos
    if (groupedTodos['uncategorized']) {
      rootCategoryIds.push('uncategorized');
    }

    // Filter categories based on current filter
    if (currentFilter !== 'all') {
      // For 'active' filter, only show categories with active todos
      // For 'completed' filter, only show categories with completed todos
      rootCategoryIds = rootCategoryIds.filter(categoryId => {
        // Check if this category or any of its subcategories has todos matching the filter
        return hasTodosMatchingFilter(categoryId, groupedTodos, currentFilter);
      });
    }

    // Sort root categories if we're sorting categories
    if (sortTarget === 'categories') {
      rootCategoryIds.sort((a, b) => {
        // Always put uncategorized at the end regardless of sort direction
        if (a === 'uncategorized') return 1;
        if (b === 'uncategorized') return -1;

        // Find the category objects
        const categoryA = categories.find(c => c.id.toString() === a);
        const categoryB = categories.find(c => c.id.toString() === b);

        if (!categoryA || !categoryB) return 0;

        let compareA, compareB;
        switch (sortBy) {
          case 'name':
            compareA = categoryA.name.toLowerCase();
            compareB = categoryB.name.toLowerCase();
            break;
          case 'date':
            // If categories have a created_at property, use it; otherwise, use ID as a fallback
            // (since ID is likely a timestamp from Date.now())
            compareA = categoryA.created_at || categoryA.id.toString();
            compareB = categoryB.created_at || categoryB.id.toString();
            break;
          default:
            compareA = categoryA.name.toLowerCase();
            compareB = categoryB.name.toLowerCase();
            break;
        }

        let comparison = 0;
        if (compareA > compareB) comparison = 1;
        else if (compareA < compareB) comparison = -1;
        return sortDirection === 'desc' ? (comparison * -1) : comparison;
      });
    } else {
      // If we're not sorting categories, just sort alphabetically
      rootCategoryIds.sort((a, b) => {
        if (a === 'uncategorized') return 1;
        if (b === 'uncategorized') return -1;
        const catA = categories.find(c => c.id.toString() === a)?.name || '';
        const catB = categories.find(c => c.id.toString() === b)?.name || '';
        return catA.localeCompare(catB);
      });
    }

    // Render root categories and their subcategories
    rootCategoryIds.forEach(categoryId => {
      renderCategoryGroup(categoryId, groupedTodos, todoList, 0);
    });
  } else {
    // Flat List Rendering
    const flatListUl = document.createElement('ul');
    filteredTodos.forEach(todo => flatListUl.appendChild(createTodoElement(todo)));
    addDragDropListenersToList(flatListUl);
    todoList.appendChild(flatListUl);
  }

  // Update items left count
  const activeCount = todos.filter(todo => !todo.completed).length;
  itemsLeftSpan.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
}

function createCategoryHeader(categoryId, categoryName, color, todos, isSubcategory = false) {
    const header = document.createElement('div');
    header.className = 'category-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0'); // Make it focusable
    header.setAttribute('aria-expanded', !foldedCategories.has(categoryId));

    // Title section
    const titleSection = document.createElement('div');
    titleSection.className = 'category-title-section';

    const foldIcon = document.createElement('span');
    foldIcon.className = 'category-fold-icon';
    foldIcon.textContent = foldedCategories.has(categoryId) ? '►' : '▼';
    foldIcon.setAttribute('aria-hidden', 'true');
    titleSection.appendChild(foldIcon);

    const colorDot = document.createElement('span');
    colorDot.className = 'category-color-dot';
    colorDot.style.backgroundColor = color || '#666';
    colorDot.setAttribute('aria-hidden', 'true');
    titleSection.appendChild(colorDot);

    const title = document.createElement('span');
    title.className = 'category-title';
    title.textContent = categoryName || 'Uncategorized';
    title.id = `category-title-${categoryId}`;
    if (isSubcategory) {
        title.classList.add('subcategory-title');
    }
    titleSection.appendChild(title);

    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = `(${todos.length})`;
    count.id = `category-count-${categoryId}`;
    titleSection.appendChild(count);

    header.appendChild(titleSection);

    // Actions section
    const actionsSection = document.createElement('div');
    actionsSection.className = 'category-actions';

    // Complete all button
    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'category-action-btn complete';
    completeBtn.innerHTML = '✓';
    completeBtn.id = `complete-btn-${categoryId}`;
    completeBtn.title = 'Complete all tasks';
    completeBtn.setAttribute('aria-label', 'Complete all tasks in category');

    // Activate all button
    const activateBtn = document.createElement('button');
    activateBtn.type = 'button';
    activateBtn.className = 'category-action-btn activate';
    activateBtn.innerHTML = '○';
    activateBtn.id = `activate-btn-${categoryId}`;
    activateBtn.title = 'Activate all tasks';
    activateBtn.setAttribute('aria-label', 'Activate all tasks in category');

    // Improved click handlers with stopPropagation
    completeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCategoryTodos(categoryId, true);
    });

    activateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCategoryTodos(categoryId, false);
    });

    actionsSection.appendChild(completeBtn);
    actionsSection.appendChild(activateBtn);
    header.appendChild(actionsSection);

    // Add smooth click handling for the entire header
    header.addEventListener('click', (e) => {
        // Only toggle if clicking the header itself or title section
        if (e.target === header ||
            e.target === titleSection ||
            e.target === foldIcon ||
            e.target === title ||
            e.target === count) {
            toggleCategoryFold(categoryId, header.closest('.category-group'));
        }
    });

    // Add keyboard support
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCategoryFold(categoryId, header.closest('.category-group'));
        }
    });

    return header;
}

function toggleCategoryTodos(categoryId, setCompleted) {
    const updateTodosInCategory = (categoryId) => {
        todos.forEach(todo => {
            if (categoryId === 'uncategorized' && !todo.category) {
                todo.completed = setCompleted;
            } else if (todo.category && todo.category.id.toString() === categoryId) {
                todo.completed = setCompleted;
            }
        });
    };

    // Update the specified category
    updateTodosInCategory(categoryId);

    // If it's a parent category, also update all its subcategories
    const subcategories = categories.filter(cat => cat.parent_id === parseInt(categoryId));
    subcategories.forEach(subcat => {
        updateTodosInCategory(subcat.id.toString());
    });

    saveTodos();
    renderTodos();
}

function renderCategoryGroup(categoryId, groupedTodos, parentElement, level = 0) {
    const hasSubcategories = categories.some(cat => cat.parent_id === parseInt(categoryId));
    const todos = groupedTodos[categoryId]?.todos || [];
    const category = categories.find(c => c.id.toString() === categoryId);
    const isSubcategory = level > 0;

    const groupDiv = document.createElement('div');
    groupDiv.className = `category-group${isSubcategory ? ' subcategory' : ''}`;

    // Create and add the new header with controls
    const header = createCategoryHeader(
        categoryId,
        category?.name,
        category?.color,
        todos,
        isSubcategory
    );

    groupDiv.appendChild(header);

    if (todos.length > 0) {
        const todosList = document.createElement('ul');
        todosList.className = 'category-todos';

        todos.forEach(todo => {
            todosList.appendChild(createTodoElement(todo));
        });

        if (foldedCategories.has(categoryId)) {
            todosList.style.display = 'none';
        }

        groupDiv.appendChild(todosList);
    }

    parentElement.appendChild(groupDiv);

    // Add click handler for folding/unfolding
    header.querySelector('.category-title-section').addEventListener('click', () => {
        toggleCategoryFold(categoryId, groupDiv);
    });

    // Render subcategories if any
    if (hasSubcategories) {
        const subcategoriesContainer = document.createElement('div');
        subcategoriesContainer.className = 'subcategories-container';
        if (foldedCategories.has(categoryId)) {
            subcategoriesContainer.style.display = 'none';
        }

        const subcategoryIds = categories
            .filter(cat => cat.parent_id === parseInt(categoryId))
            .map(cat => cat.id.toString());

        subcategoryIds.forEach(subId => {
            renderCategoryGroup(subId, groupedTodos, subcategoriesContainer, level + 1);
        });

        groupDiv.appendChild(subcategoriesContainer);
    }
}

// Check if a category or any of its subcategories has todos matching the filter
function hasTodosMatchingFilter(categoryId, groupedTodos, filter) {
    // Check if this category has todos matching the filter
    if (groupedTodos[categoryId]) {
        // For 'active' filter, we need at least one active todo
        // For 'completed' filter, we need at least one completed todo
        // Since filteredTodos is already filtered by the current filter,
        // if there are any todos in this category, it means they match the filter
        return true;
    }

    // Check subcategories recursively
    const subcategoryIds = categories
        .filter(cat => cat.parent_id === parseInt(categoryId))
        .map(cat => cat.id.toString());

    // If any subcategory has matching todos, return true
    return subcategoryIds.some(subId => hasTodosMatchingFilter(subId, groupedTodos, filter));
}

// Toggle category fold state
function toggleCategoryFold(categoryId, groupElement) {
    const isFolded = foldedCategories.has(categoryId);
    const foldIcon = groupElement.querySelector('.category-fold-icon');
    const todosList = groupElement.querySelector('.category-todos');
    const subcategoriesContainer = groupElement.querySelector('.subcategories-container');

    if (isFolded) {
        foldedCategories.delete(categoryId);
        groupElement.classList.remove('folded');
        if (foldIcon) {
            foldIcon.textContent = '▼';
        }
        if (todosList) {
            todosList.style.display = 'block';
        }
        if (subcategoriesContainer) {
            subcategoriesContainer.style.display = 'block';
        }
    } else {
        foldedCategories.add(categoryId);
        groupElement.classList.add('folded');
        if (foldIcon) {
            foldIcon.textContent = '►';
        }
        if (todosList) {
            todosList.style.display = 'none';
        }
        if (subcategoriesContainer) {
            subcategoriesContainer.style.display = 'none';
        }
    }

    saveFoldedState();
}


// Edit a todo
function editTodo(id) {
  const todo = todos.find(todo => todo.id === id);
  if (!todo) return;
  const li = document.querySelector(`#todo-list li[data-id="${id}"]`); // More specific selector
  if (!li) return;

  // Check if this todo is already being edited
  const existingForm = li.querySelector('.todo-edit-form');
  if (existingForm) {
    // Already in edit mode, focus on the input field instead
    const input = existingForm.querySelector('.todo-edit-input');
    if (input) input.focus();
    return;
  }

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

  const newSubOption = document.createElement('option');
  newSubOption.value = 'new-sub';
  newSubOption.textContent = '+ Add new subcategory';
  categorySelectEdit.appendChild(newSubOption);

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

      // Re-attach the double-click event listener to the span
      const span = textContainer.querySelector('.todo-text');
      if (span) {
          span.addEventListener('dblclick', () => editTodo(todo.id));
      }
  });


  editForm.appendChild(textInput);
  editForm.appendChild(dueDateInput);
  editForm.appendChild(categorySelectEdit);
  editForm.appendChild(saveBtn);
  editForm.appendChild(cancelBtn); // Add cancel button to form

  // Create color picker for category (initially hidden)
  const categoryColorContainer = document.createElement('div');
  categoryColorContainer.className = 'category-color-container';
  categoryColorContainer.style.display = 'none';
  categoryColorContainer.style.marginTop = '5px';

  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Category Color:';
  colorLabel.style.display = 'block';
  colorLabel.style.marginBottom = '5px';
  categoryColorContainer.appendChild(colorLabel);

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'category-color-edit';
  colorInput.value = todo.category ? todo.category.color : '#55aaff';
  categoryColorContainer.appendChild(colorInput);

  // Insert color picker after category select
  editForm.insertBefore(categoryColorContainer, saveBtn);

  categorySelectEdit.addEventListener('change', (e) => {
    const modal = document.getElementById('category-modal');
    const selectedValue = e.target.value;

    if (selectedValue === 'new') {
      // Regular category
      document.getElementById('category-modal-title').textContent = 'Add New Category';
      document.getElementById('parent-category-group').style.display = 'none';
      modal.dataset.isSubcategory = 'false';
      modal.dataset.editFormId = id;
      modal.dataset.editText = textInput.value;
      modal.dataset.editDueDate = dueDateInput.value || '';
      // Optionally hide the edit form while modal is open
      editForm.style.display = 'none';
      modal.style.display = 'block';
    } else if (selectedValue === 'new-sub') {
      // Subcategory
      document.getElementById('category-modal-title').textContent = 'Add New Subcategory';
      document.getElementById('parent-category-group').style.display = 'block';
      modal.dataset.isSubcategory = 'true';
      modal.dataset.editFormId = id;
      modal.dataset.editText = textInput.value;
      modal.dataset.editDueDate = dueDateInput.value || '';

      // Populate parent category dropdown
      const parentSelect = document.getElementById('parent-category-select');
      parentSelect.innerHTML = '';

      // Add all categories as potential parents
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        option.style.color = category.color;
        parentSelect.appendChild(option);
      });

      // Optionally hide the edit form while modal is open
      editForm.style.display = 'none';
      modal.style.display = 'block';
    } else if (selectedValue !== '') {
      // Show color picker when a category is selected
      categoryColorContainer.style.display = 'block';
      // Set the color picker to the selected category's color
      const selectedCategory = categories.find(c => c.id.toString() === selectedValue);
      if (selectedCategory) {
        colorInput.value = selectedCategory.color;
      }
    } else {
      // Hide color picker when no category is selected
      categoryColorContainer.style.display = 'none';
    }
  });

  // Show color picker if a category is already selected
  if (todo.category) {
    categoryColorContainer.style.display = 'block';
  }

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newText = textInput.value;
    const newDueDate = dueDateInput.value ? dueDateInput.value : null;
    const newCategoryId = categorySelectEdit.value;
    const newCategoryColor = colorInput.value;

    if (newCategoryId === 'new') {
      // Modal handling logic (already present)
       document.getElementById('category-modal').style.display = 'block';
       document.getElementById('category-modal').dataset.editFormId = id;
       document.getElementById('category-modal').dataset.editText = newText;
       document.getElementById('category-modal').dataset.editDueDate = newDueDate || '';
       editForm.style.display = 'none'; // Hide form
    } else if (newCategoryId !== '' && newCategoryId !== 'new-sub') {
      // Update the category color if a category is selected and color is changed
      updateTodo(id, newText, newDueDate, newCategoryId, newCategoryColor);
      // renderTodos() is called within updateTodo
    } else {
      // No category selected
      updateTodo(id, newText, newDueDate, newCategoryId);
    }
  });

  textContainer.appendChild(editForm);
  textInput.focus();
}

// Update a todo
function updateTodo(id, text, dueDate, categoryId, categoryColor) {
  if (text.trim() === '') {
      // Optionally re-render to cancel edit if text is empty
      renderTodos();
      return;
  };

  let category = null;
  if (categoryId && categoryId !== 'new' && categoryId !== '') {
    category = categories.find(c => c.id.toString() === categoryId.toString());

    // If a new color was provided and it's different from the current category color, update it
    if (category && categoryColor && category.color !== categoryColor) {
      // Update the category color in the categories array
      categories = categories.map(c => {
        if (c.id === category.id) {
          return { ...c, color: categoryColor };
        }
        return c;
      });

      // Save the updated categories
      saveCategories();

      // Update the local category reference with the new color
      category.color = categoryColor;
    }
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
    try {
        // Use a simple approach that should work in any environment
        console.log('Opening trash window');

        // Try to use window.open which works in both browser and Tauri environments
        const trashWindow = window.open('trash.html', 'trashWindow', 'width=600,height=400,resizable=yes');

        if (trashWindow) {
            console.log('Successfully opened trash window');

            // Add a simple event listener for when the window closes
            if (trashWindow.addEventListener) {
                trashWindow.addEventListener('beforeunload', () => {
                    console.log('Trash window is closing');
                    // Reload trash data when the window closes
                    loadTrash();
                });
            }

            // Try to focus the window
            if (trashWindow.focus) {
                trashWindow.focus();
            }
        } else {
            // window.open can return null if popup blockers are enabled
            console.error('Failed to open trash window - popup may have been blocked');
            alert('Could not open the trash window. Please check if popup blockers are enabled.');
        }
    } catch (error) {
        console.error('Error opening trash window:', error);
        alert('Could not open the trash window. Error: ' + error.message);
    }
}


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


function handleDragEnd() {
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
    const storedSortTarget = localStorage.getItem('sortTarget');

    sortBy = storedSortBy || 'name';
    // If the stored sort is 'position', change it to 'name' since position is removed
    if (sortBy === 'position') sortBy = 'name';

    sortDirection = storedSortDirection || 'asc';
    sortTarget = storedSortTarget || 'tasks';

    console.log(`Loaded sort state: ${sortTarget} by ${sortBy} ${sortDirection}`);
}

function saveSortState() {
    localStorage.setItem('sortBy', sortBy);
    localStorage.setItem('sortDirection', sortDirection);
    localStorage.setItem('sortTarget', sortTarget);
    console.log(`Saved sort state: ${sortTarget} by ${sortBy} ${sortDirection}`);
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
  sortTargetButtons = document.querySelectorAll('.sort-target-btn');
  sortByButtons = document.querySelectorAll('.sort-by-btn');
  sortDirectionButtons = document.querySelectorAll('.sort-direction-btn');
  viewTrashBtn = document.querySelector('#view-trash-btn'); // Get trash button

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

  sortTargetButtons.forEach(button => {
    button.addEventListener('click', () => {
      sortTarget = button.dataset.target;
      saveSortState();
      updateSortButtonsUI();
      renderTodos();
    });
  });

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
    sortTargetButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === sortTarget));
    sortByButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.sort === sortBy));
    sortDirectionButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.direction === sortDirection));
  }

  categorySelect.addEventListener('change', (e) => {
    const modal = document.getElementById('category-modal');
    if (e.target.value === 'new') {
      // Regular category
      document.getElementById('category-modal-title').textContent = 'Add New Category';
      document.getElementById('parent-category-group').style.display = 'none';
      modal.dataset.isSubcategory = 'false';
      modal.style.display = 'block';
    } else if (e.target.value === 'new-sub') {
      // Subcategory
      document.getElementById('category-modal-title').textContent = 'Add New Subcategory';
      document.getElementById('parent-category-group').style.display = 'block';
      modal.dataset.isSubcategory = 'true';

      // Populate parent category dropdown
      const parentSelect = document.getElementById('parent-category-select');
      parentSelect.innerHTML = '';

      // Add all categories as potential parents
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        option.style.color = category.color;
        parentSelect.appendChild(option);
      });

      modal.style.display = 'block';
    }
  });

  const closeBtn = document.querySelector('#category-modal .close'); // More specific selector
  closeBtn.addEventListener('click', () => {
    const modal = document.getElementById('category-modal');
    modal.style.display = 'none';
    // Restore edit form if it was hidden
    if (modal.dataset.editFormId) {
        const form = document.querySelector(`.todo-item[data-id="${modal.dataset.editFormId}"] .todo-edit-form`);
        if (form) form.style.display = ''; // Show form again
    }

    // Clear all modal data attributes
    delete modal.dataset.editFormId;
    delete modal.dataset.editText;
    delete modal.dataset.editDueDate;
    delete modal.dataset.editCategoryId;
    delete modal.dataset.isSubcategory;

    categorySelect.value = ''; // Reset main category select
  });

  const saveCategoryBtn = document.getElementById('save-category-btn');
  saveCategoryBtn.addEventListener('click', () => {
    const categoryName = document.getElementById('category-name').value;
    const categoryColor = document.getElementById('category-color').value;
    const modal = document.getElementById('category-modal');
    const isSubcategory = modal.dataset.isSubcategory === 'true';
    const isEditing = modal.dataset.editCategoryId !== undefined;

    if (categoryName.trim() === '') {
      alert('Please enter a category name'); return;
    }

    let parentId = null;
    if (isSubcategory) {
      const parentSelect = document.getElementById('parent-category-select');
      parentId = parseInt(parentSelect.value);
      if (!parentId) {
        alert('Please select a parent category'); return;
      }
    }

    // Handle editing existing category
    if (isEditing) {
      const categoryId = parseInt(modal.dataset.editCategoryId);
      const categoryIndex = categories.findIndex(c => c.id === categoryId);

      if (categoryIndex !== -1) {
        // Update the category
        categories[categoryIndex].name = categoryName;
        categories[categoryIndex].color = categoryColor;
        categories[categoryIndex].parent_id = parentId;

        // Save and update UI
        saveCategories();
        renderCategoryDropdown();
        renderCategoryList();
        renderTodos(); // Re-render todos to update category colors
      }
    } else {
      // Add new category
      const newCategory = addCategory(categoryName, categoryColor, parentId);

      // Check if we were editing a todo when opening the modal
      if (modal.dataset.editFormId) {
        const todoId = parseInt(modal.dataset.editFormId);
        const text = modal.dataset.editText;
        const dueDate = modal.dataset.editDueDate || null;
        updateTodo(todoId, text, dueDate, newCategory.id.toString()); // Update with new category ID
      }
    }

    // Close modal and clean up
    modal.style.display = 'none';
    document.getElementById('category-name').value = ''; // Reset modal form

    // Clear edit data
    delete modal.dataset.editFormId;
    delete modal.dataset.editText;
    delete modal.dataset.editDueDate;
    delete modal.dataset.editCategoryId;
    delete modal.dataset.isSubcategory;

    // Check if we were adding a new todo and we have a new category (not editing)
    if (!isEditing && todoForm.dataset.pendingText) {
      const text = todoForm.dataset.pendingText;
      const dueDate = todoForm.dataset.pendingDueDate || null;
      addTodo(text, dueDate, newCategory.id.toString());
      delete todoForm.dataset.pendingText;
      delete todoForm.dataset.pendingDueDate;
    } else if (!isEditing) {
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

  // Listen for messages from the trash window
  window.addEventListener('message', (event) => {
    // Check if the message is from our trash window
    if (event.data && event.data.source === 'trash-window') {
      console.log('Received message from trash window:', event.data);

      // If the trash window emitted a todos-updated event, reload todos
      if (event.data.event === 'todos-updated') {
        console.log('Reloading todos after trash window update');
        loadTodos();
        // Also reload trash data
        loadTrash();
      }

      // Handle restored item from trash window (for non-Tauri environment)
      if (event.data.action === 'restoreItem' && event.data.item) {
        console.log('Restoring item from trash window:', event.data.item);
        const restoredItem = event.data.item;

        // Remove the trashedAt property
        delete restoredItem.trashedAt;

        // Add the item back to todos
        todos.push(restoredItem);

        // Save todos
        saveTodos();

        // Re-render todos
        renderTodos();

        // Remove from trashedTodos
        trashedTodos = trashedTodos.filter(todo => todo.id !== restoredItem.id);
        saveTrash();
      }

      // Handle multiple restored items from trash window (for non-Tauri environment)
      if (event.data.action === 'restoreMultipleItems' && Array.isArray(event.data.items) && event.data.items.length > 0) {
        console.log('Restoring multiple items from trash window:', event.data.items);

        // Process each restored item
        event.data.items.forEach(item => {
          // Remove the trashedAt property
          delete item.trashedAt;

          // Add the item back to todos
          todos.push(item);

          // Remove from trashedTodos
          trashedTodos = trashedTodos.filter(todo => todo.id !== item.id);
        });

        // Save todos and trash
        saveTodos();
        saveTrash();

        // Re-render todos
        renderTodos();
      }

      // If the trash window is requesting trash data
      if (event.data.action === 'getTrashData') {
        console.log('Trash window requested trash data');
        // Send the trash data to the trash window
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({
            action: 'setTrashData',
            source: 'main-window',
            data: trashedTodos
          }, '*');
        }
      }
    }
  });

  // Create floating controls
  createFloatingControls();

  // Initialize scroll handling
  initializeScrollHandling();

  // Load initial data
  await loadCategories();
  await loadTodos(); // Renders the initial list
  await loadTrash(); // Load trash data into memory
});

function createFloatingControls() {
    // Create floating controls container
    floatingControls = document.createElement('div');
    floatingControls.className = 'floating-sort-controls';

    // Create sort icon
    const sortIcon = document.createElement('span');
    sortIcon.className = 'sort-icon';
    sortIcon.textContent = '↕️';
    floatingControls.appendChild(sortIcon);

    // Clone the original controls structure
    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'sort-controls-wrapper';

    // Create sort target controls
    const targetGroup = document.createElement('div');
    targetGroup.className = 'control-group sort-target-group';

    const targetLabel = document.createElement('span');
    targetLabel.className = 'control-label';
    targetLabel.textContent = 'Sort:';
    targetGroup.appendChild(targetLabel);

    ['tasks', 'categories'].forEach(target => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `control-btn sort-target-btn ${sortTarget === target ? 'active' : ''}`;
        btn.dataset.target = target;
        btn.textContent = target.charAt(0).toUpperCase() + target.slice(1);
        btn.onclick = () => {
            sortTarget = target;
            saveSortState();
            updateFloatingControlsUI();
            renderTodos();
        };
        targetGroup.appendChild(btn);
    });

    // Create sort by controls
    const sortByGroup = document.createElement('div');
    sortByGroup.className = 'control-group sort-by-group';

    const byLabel = document.createElement('span');
    byLabel.className = 'control-label';
    byLabel.textContent = 'By:';
    sortByGroup.appendChild(byLabel);

    [['name', 'Name'], ['date', 'Date']].forEach(([value, text]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `control-btn sort-by-btn ${sortBy === value ? 'active' : ''}`;
        btn.dataset.sort = value;
        btn.textContent = text;
        btn.onclick = () => {
            sortBy = value;
            saveSortState();
            updateFloatingControlsUI();
            renderTodos();
        };
        sortByGroup.appendChild(btn);
    });

    // Create direction controls
    const directionGroup = document.createElement('div');
    directionGroup.className = 'control-group sort-direction-group';

    ['asc', 'desc'].forEach(direction => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `control-btn sort-direction-btn ${sortDirection === direction ? 'active' : ''}`;
        btn.dataset.direction = direction;
        btn.textContent = direction === 'asc' ? '▲' : '▼';
        btn.onclick = () => {
            sortDirection = direction;
            saveSortState();
            updateFloatingControlsUI();
            renderTodos();
        };
        directionGroup.appendChild(btn);
    });

    // Append all groups to wrapper
    controlsWrapper.appendChild(targetGroup);
    controlsWrapper.appendChild(sortByGroup);
    controlsWrapper.appendChild(directionGroup);
    floatingControls.appendChild(controlsWrapper);

    // Add to document
    document.body.appendChild(floatingControls);

    // Store reference to original controls bar
    originalControlsBar = document.querySelector('.view-controls-bar');

    // Initial UI update
    updateFloatingControlsUI();
}

function initializeScrollHandling() {
    let timeout;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

        // Clear any existing timeout
        clearTimeout(timeout);

        // Show/hide floating controls based on scroll position
        if (currentScroll > SCROLL_THRESHOLD) {
            floatingControls.classList.add('visible');
            originalControlsBar.classList.add('hidden');
        } else {
            // Add a small delay before hiding to prevent flickering
            timeout = setTimeout(() => {
                floatingControls.classList.remove('visible');
                originalControlsBar.classList.remove('hidden');
            }, 150);
        }

        lastScrollPosition = currentScroll;
    });
}

// New function to update floating controls UI
function updateFloatingControlsUI() {
    if (!floatingControls) return;

    // Update target buttons
    floatingControls.querySelectorAll('.sort-target-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === sortTarget);
    });

    // Update sort by buttons
    floatingControls.querySelectorAll('.sort-by-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === sortBy);
    });

    // Update direction buttons
    floatingControls.querySelectorAll('.sort-direction-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.direction === sortDirection);
    });

    // Also update the original controls if they exist
    if (originalControlsBar) {
        originalControlsBar.querySelectorAll('.sort-target-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === sortTarget);
        });
        originalControlsBar.querySelectorAll('.sort-by-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortBy);
        });
        originalControlsBar.querySelectorAll('.sort-direction-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.direction === sortDirection);
        });
    }
}

// Category Management Functions
function openCategoryManagement() {
  const modal = document.getElementById('category-management-modal');
  modal.style.display = 'block';
  renderCategoryList();
}

function renderCategoryList() {
  const categoriesList = document.querySelector('.categories-list');
  categoriesList.innerHTML = '';

  // First render root categories
  const rootCategories = categories.filter(c => !c.parent_id);
  rootCategories.forEach(category => {
    const categoryElement = createCategoryListItem(category);
    categoriesList.appendChild(categoryElement);

    // Then render its subcategories
    const subcategories = categories.filter(c => c.parent_id === category.id);
    subcategories.forEach(subcategory => {
      const subcategoryElement = createCategoryListItem(subcategory, true);
      categoriesList.appendChild(subcategoryElement);
    });
  });
}

function createCategoryListItem(category, isSubcategory = false) {
  const item = document.createElement('div');
  item.className = `category-item ${isSubcategory ? 'subcategory-item' : ''}`;

  const colorDot = document.createElement('span');
  colorDot.className = 'category-color-dot';
  colorDot.style.backgroundColor = category.color;

  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category.name;

  const actions = document.createElement('div');
  actions.className = 'category-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'category-action-btn category-edit-btn';
  editBtn.textContent = '✎';
  editBtn.onclick = () => editCategory(category);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'category-action-btn category-delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.onclick = () => deleteCategory(category.id);

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  item.appendChild(colorDot);
  item.appendChild(name);
  item.appendChild(actions);

  return item;
}

function editCategory(category) {
  // Reuse existing category modal
  const modal = document.getElementById('category-modal');
  document.getElementById('category-modal-title').textContent = 'Edit Category';
  document.getElementById('category-name').value = category.name;
  document.getElementById('category-color').value = category.color;

  // Determine if this is a subcategory
  const isSubcategory = category.parent_id !== null && category.parent_id !== undefined;

  // Show or hide parent category dropdown
  const parentCategoryGroup = document.getElementById('parent-category-group');
  parentCategoryGroup.style.display = isSubcategory ? 'block' : 'none';

  // If it's a subcategory, populate the parent dropdown
  if (isSubcategory) {
    populateParentCategoryDropdown(category.id);
    document.getElementById('parent-category-select').value = category.parent_id;
  }

  // Set data attributes for the modal
  modal.dataset.editCategoryId = category.id;
  modal.dataset.isSubcategory = isSubcategory ? 'true' : 'false';
  modal.style.display = 'block';
}

// Helper function to populate the parent category dropdown
function populateParentCategoryDropdown(excludeCategoryId = null) {
  const parentSelect = document.getElementById('parent-category-select');
  parentSelect.innerHTML = '';

  // Add a default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a parent category';
  parentSelect.appendChild(defaultOption);

  // Add all categories as potential parents, excluding the current category being edited
  categories.forEach(category => {
    // Skip the current category and its subcategories to prevent circular references
    if (excludeCategoryId !== null) {
      // Skip the category itself
      if (category.id === excludeCategoryId) return;

      // Skip any subcategories of this category
      const isSubcategoryOf = (parentId, targetId) => {
        if (parentId === targetId) return true;
        const parent = categories.find(c => c.id === parentId);
        return parent && parent.parent_id ? isSubcategoryOf(parent.parent_id, targetId) : false;
      };

      // Skip if this category is a subcategory of the one being edited
      if (category.parent_id && isSubcategoryOf(category.parent_id, excludeCategoryId)) return;
    }

    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    option.style.color = category.color;
    parentSelect.appendChild(option);
  });
}

function deleteCategory(categoryId) {
  if (!confirm('Are you sure you want to delete this category? All todos in this category will become uncategorized.')) {
    return;
  }

  // Update todos that use this category
  todos.forEach(todo => {
    if (todo.category && todo.category.id === categoryId) {
      todo.category = null;
    }
  });

  // Remove the category and its subcategories
  categories = categories.filter(c => c.id !== categoryId && c.parent_id !== categoryId);

  saveCategories();
  saveTodos();
  renderCategoryList();
  renderTodos();
}

// Add event listeners
document.getElementById('manage-categories-btn').addEventListener('click', openCategoryManagement);

document.querySelector('#category-management-modal .close').addEventListener('click', () => {
  document.getElementById('category-management-modal').style.display = 'none';
});

document.getElementById('add-category-btn').addEventListener('click', () => {
  const modal = document.getElementById('category-modal');
  document.getElementById('category-modal-title').textContent = 'Add New Category';
  document.getElementById('parent-category-group').style.display = 'none';
  document.getElementById('category-name').value = '';
  document.getElementById('category-color').value = getRandomColor();
  delete modal.dataset.editCategoryId;
  modal.dataset.isSubcategory = 'false';
  modal.style.display = 'block';
});

document.getElementById('add-subcategory-btn').addEventListener('click', () => {
  const modal = document.getElementById('category-modal');
  document.getElementById('category-modal-title').textContent = 'Add New Subcategory';
  document.getElementById('parent-category-group').style.display = 'block';
  document.getElementById('category-name').value = '';
  document.getElementById('category-color').value = getRandomColor();
  delete modal.dataset.editCategoryId;
  modal.dataset.isSubcategory = 'true';

  // Populate parent category dropdown
  populateParentCategoryDropdown();

  modal.style.display = 'block';
});
