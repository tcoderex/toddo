use tauri::{AppHandle, Manager, Wry, WindowEvent, WebviewWindowBuilder, WebviewUrl}; // <-- Use Webview builders
use std::fs::{self, File};
use std::io::Read;
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
    parent_id: Option<u64>, // Parent category ID for subcategories
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
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "trashedAt")]
    trashed_at: Option<String>, // Timestamp when the item was trashed
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

// Read data from a JSON file with improved performance
fn read_data<T: for<'de> Deserialize<'de>>(app: &AppHandle<Wry>, filename: &str) -> Result<Vec<T>, String> {
    let path = get_data_path(app, filename)?;
    if !path.exists() {
        println!("Backend: Data file '{}' not found, returning empty list.", filename);
        return Ok(Vec::new()); // Return empty vec if file doesn't exist
    }

    // Use a buffered reader for better performance with larger files
    let file = File::open(&path).map_err(|e| format!("Failed to open {}: {}", filename, e))?;
    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);

    // For very small files, use a simple read_to_string approach
    if file_size < 1024 * 10 { // Less than 10KB
        let mut contents = String::new();
        let mut buffered = std::io::BufReader::new(file);
        buffered.read_to_string(&mut contents).map_err(|e| format!("Failed to read {}: {}", filename, e))?;

        if contents.trim().is_empty() {
            println!("Backend: Data file '{}' is empty, returning empty list.", filename);
            return Ok(Vec::new()); // Return empty vec if file is empty
        }

        return serde_json::from_str(&contents).map_err(|e| format!("Failed to parse {}: {}", filename, e));
    }

    // For larger files, use from_reader which is more efficient for larger data
    let buffered = std::io::BufReader::new(file);
    serde_json::from_reader(buffered).map_err(|e| format!("Failed to parse {}: {}", filename, e))
}

// Write data to a JSON file with improved performance
fn write_data<T: Serialize>(app: &AppHandle<Wry>, filename: &str, data: &[T]) -> Result<(), String> {
    let path = get_data_path(app, filename)?;

    // Create file with buffered writer for better performance
    let file = File::create(&path).map_err(|e| format!("Failed to create/open {}: {}", filename, e))?;
    let buffered = std::io::BufWriter::new(file);

    // Use to_writer directly instead of to_string + write_all for better performance
    // Only use pretty formatting for small data sets to improve performance
    if data.len() < 100 {
        serde_json::to_writer_pretty(buffered, data).map_err(|e| format!("Failed to write data to {}: {}", filename, e))?;
    } else {
        serde_json::to_writer(buffered, data).map_err(|e| format!("Failed to write data to {}: {}", filename, e))?;
    }

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

// Get trash data for the trash window
#[tauri::command]
fn get_trash_data(app: AppHandle<Wry>) -> Result<Vec<Todo>, String> {
    println!("Backend: Getting trash data...");
    let trash = read_data::<Todo>(&app, "trash.json")?;
    println!("Backend: Retrieved {} trashed todos.", trash.len());
    Ok(trash)
}

// Permanently delete a todo item from trash
#[tauri::command]
fn delete_todo_item_permanently(app: AppHandle<Wry>, id: u64) -> Result<(), String> {
    println!("Backend: Permanently deleting todo item {}...", id);

    // Load current trash
    let mut trash = read_data::<Todo>(&app, "trash.json")?;

    // Remove the item with the given id
    let original_len = trash.len();
    trash.retain(|todo| todo.id != id);

    // Check if an item was actually removed
    if trash.len() == original_len {
        return Err(format!("Item with id {} not found in trash", id));
    }

    // Save the updated trash
    write_data(&app, "trash.json", &trash)?;
    println!("Backend: Todo item {} permanently deleted.", id);
    Ok(())
}

// Restore a todo item from trash to todos
#[tauri::command]
fn restore_todo_item(app: AppHandle<Wry>, id: u64) -> Result<(), String> {
    println!("Backend: Restoring todo item {}...", id);

    // Load current trash and todos
    let mut trash = read_data::<Todo>(&app, "trash.json")?;
    let mut todos = read_data::<Todo>(&app, "todos.json")?;

    // Find the item to restore
    let item_index = trash.iter().position(|todo| todo.id == id);

    match item_index {
        Some(index) => {
            // Remove from trash and add to todos
            let mut item = trash.remove(index);
            // Remove the trashedAt field
            item.trashed_at = None;
            todos.push(item);

            // Save both files
            write_data(&app, "trash.json", &trash)?;
            write_data(&app, "todos.json", &todos)?;

            println!("Backend: Todo item {} restored.", id);
            Ok(())
        },
        None => Err(format!("Item with id {} not found in trash", id))
    }
}

// Empty the trash bin (delete all items)
#[tauri::command]
fn empty_trash_bin(app: AppHandle<Wry>) -> Result<(), String> {
    println!("Backend: Emptying trash bin...");

    // Save an empty array to trash.json
    let empty_trash: Vec<Todo> = Vec::new();
    write_data(&app, "trash.json", &empty_trash)?;

    println!("Backend: Trash bin emptied.");
    Ok(())
}

// Command to open the trash window
#[tauri::command]
async fn open_trash_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("Backend: Opening trash window...");
    // Check if window already exists
    if app_handle.get_webview_window("trashWindow").is_some() {
        println!("Backend: Trash window already exists, focusing...");
        if let Some(window) = app_handle.get_webview_window("trashWindow") {
            window.set_focus().map_err(|e| format!("Failed to focus trash window: {}", e))?;
        }
        return Ok(()); // Window already exists, do nothing more
    }

    // Create the window if it doesn't exist using WebviewWindowBuilder
    match WebviewWindowBuilder::new(
        &app_handle,
        "trashWindow", // Unique identifier
        WebviewUrl::App("trash.html".into()) // Use WebviewUrl::App for bundled assets
    )
    .title("Trash")
    .inner_size(800.0, 600.0) // Set initial size (use f64)
    .build() {
        Ok(_) => {
            println!("Backend: Trash window opened successfully.");
            Ok(())
        },
        Err(e) => {
            let err_msg = format!("Failed to build trash window: {}", e);
            println!("Backend Error: {}", err_msg);
            Err(err_msg)
        }
    }
}


// Command to show the main window when loading is complete
#[tauri::command]
fn show_main_window(app: AppHandle<Wry>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| format!("Failed to show window: {}", e))?;
        window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
    } else {
        return Err("Main window not found".to_string());
    }
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
            save_categories,
            get_trash_data,
            delete_todo_item_permanently,
            restore_todo_item,
            empty_trash_bin,
            show_main_window,
            open_trash_window // <-- Register the new command
        ])
        .on_window_event(|window, event| match event { // <-- Corrected signature and match target
            WindowEvent::CloseRequested { api: _, .. } => { // <-- Mark api as unused
                if window.label() == "main" { // <-- Use 'window' directly
                    println!("Main window close requested. Exiting application.");
                    // Explicitly close all windows before exiting
                    if let Some(main_window) = window.app_handle().get_webview_window("main") {
                        main_window.close().unwrap_or_else(|e| println!("Error closing main window: {}", e));
                    }
                    if let Some(trash_window) = window.app_handle().get_webview_window("trashWindow") {
                        trash_window.close().unwrap_or_else(|e| println!("Error closing trash window: {}", e));
                    }
                    window.app_handle().exit(0); // <-- Use 'window' to get app_handle
                } else {
                    // Allow other windows to close normally. Tauri default behavior
                    // will exit if this is the last window.
                    println!("Window '{}' close requested. Allowing default behavior.", window.label()); // <-- Use 'window'
                    // We don't call api.prevent_close()
                }
            }
            _ => {}
        })
        .setup(|app| {
            // Keep main window hidden until explicitly shown from JavaScript
            if let Some(_main_window) = app.get_webview_window("main") {
                println!("Main window initialized and hidden until loading completes");
            }
            // Removed the native splash screen call and the delayed window showing logic.
            // The frontend (main.js) is now solely responsible for calling show_main_window.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
