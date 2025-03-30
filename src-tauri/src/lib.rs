use tauri::{AppHandle, Manager, Wry};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
// Removed: use std::sync::Mutex;
use serde::{Deserialize, Serialize};
// Removed: use once_cell::sync::Lazy;

// --- Structs ---
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Category {
    id: u64, // Using u64 consistent with Todo id from JS Date.now()
    name: String,
    color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Todo {
    id: u64,
    text: String,
    completed: bool,
    created_at: String, // Added creation timestamp (ISO string)
    due_date: Option<String>,
    // Store the full category object or just the ID? Storing object for simplicity now.
    category: Option<Category>,
    position: usize,
}

// --- State Management (Optional - could remove if only using files) ---
// We'll primarily rely on files, but keep these if needed for caching or complex logic later.
// static TODOS: Lazy<Mutex<Vec<Todo>>> = Lazy::new(|| Mutex::new(Vec::new()));
// static CATEGORIES: Lazy<Mutex<Vec<Category>>> = Lazy::new(|| Mutex::new(Vec::new()));

// --- Helper Functions ---

// Get the path to the data file (todos.json or categories.json)
fn get_data_path(app: &AppHandle<Wry>, filename: &str) -> Result<PathBuf, String> {
    let data_dir_result = app.path().app_data_dir(); // This returns Result<PathBuf, tauri::Error>

    // Explicitly handle the Result using match
    let data_dir = match data_dir_result {
        Ok(path) => path, // If Ok(path), use the path
        Err(e) => return Err(format!("Failed to get app data directory: {}", e)), // If Err, return a formatted error
    };

    // Proceed with the existing logic if we got a valid path
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;
    }
    Ok(data_dir.join(filename))
}

// Read data from a JSON file
fn read_data<T: for<'de> Deserialize<'de>>(app: &AppHandle<Wry>, filename: &str) -> Result<Vec<T>, String> {
    let path = get_data_path(app, filename)?;
    if !path.exists() {
        println!("Backend: Data file '{}' not found, returning empty list.", filename);
        return Ok(Vec::new()); // Return empty vec if file doesn't exist
    }

    let mut file = File::open(&path).map_err(|e| format!("Failed to open {}: {}", filename, e))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).map_err(|e| format!("Failed to read {}: {}", filename, e))?;

    if contents.trim().is_empty() {
        println!("Backend: Data file '{}' is empty, returning empty list.", filename);
        return Ok(Vec::new()); // Return empty vec if file is empty
    }

    serde_json::from_str(&contents).map_err(|e| format!("Failed to parse {}: {}", filename, e))
}

// Write data to a JSON file
fn write_data<T: Serialize>(app: &AppHandle<Wry>, filename: &str, data: &[T]) -> Result<(), String> {
    let path = get_data_path(app, filename)?;
    let json_data = serde_json::to_string_pretty(data).map_err(|e| format!("Failed to serialize data for {}: {}", filename, e))?;

    let mut file = File::create(&path).map_err(|e| format!("Failed to create/open {}: {}", filename, e))?;
    file.write_all(json_data.as_bytes()).map_err(|e| format!("Failed to write to {}: {}", filename, e))?;
    Ok(())
}


// --- Tauri Commands ---

// Load todos from todos.json
#[tauri::command]
fn load_todos(app: AppHandle<Wry>) -> Result<Vec<Todo>, String> {
    println!("Backend: Loading todos from file...");
    let todos = read_data::<Todo>(&app, "todos.json")?;
    println!("Backend: Loaded {} todos from file.", todos.len());
    Ok(todos)
}

// Save todos to todos.json
#[tauri::command]
fn save_todos(app: AppHandle<Wry>, todos: Vec<Todo>) -> Result<(), String> {
    println!("Backend: Saving {} todos to file...", todos.len());
    // Optional: Log details if needed
    // for (i, todo) in todos.iter().enumerate() {
    //     println!("Backend: Todo {}: id={}, text={}", i, todo.id, todo.text);
    // }
    write_data(&app, "todos.json", &todos)?;
    println!("Backend: Todos saved successfully to file.");
    Ok(())
}

// Load trashed todos from trash.json
#[tauri::command]
fn load_trash(app: AppHandle<Wry>) -> Result<Vec<Todo>, String> {
    println!("Backend: Loading trash from file...");
    let trash = read_data::<Todo>(&app, "trash.json")?;
    println!("Backend: Loaded {} trashed todos from file.", trash.len());
    Ok(trash)
}

// Save trashed todos to trash.json
#[tauri::command]
fn save_trash(app: AppHandle<Wry>, todos: Vec<Todo>) -> Result<(), String> {
    println!("Backend: Saving {} todos to trash file...", todos.len());
    write_data(&app, "trash.json", &todos)?;
    println!("Backend: Trash saved successfully to file.");
    Ok(())
}

// Load categories from categories.json
#[tauri::command]
fn load_categories(app: AppHandle<Wry>) -> Result<Vec<Category>, String> {
    println!("Backend: Loading categories from file...");
    let categories = read_data::<Category>(&app, "categories.json")?;
    println!("Backend: Loaded {} categories from file.", categories.len());
    Ok(categories)
}

// Save categories to categories.json
#[tauri::command]
fn save_categories(app: AppHandle<Wry>, categories: Vec<Category>) -> Result<(), String> {
    println!("Backend: Saving {} categories to file...", categories.len());
    write_data(&app, "categories.json", &categories)?;
    println!("Backend: Categories saved successfully to file.");
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init()) // Use the original opener plugin
        .invoke_handler(tauri::generate_handler![
            load_todos,
            save_todos,
            load_trash,
            save_trash,
            load_categories,
            save_categories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
