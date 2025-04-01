use tauri::{AppHandle, Manager, Wry};
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

// Ultra-simplified splash screen implementation using PowerShell
#[cfg(target_os = "windows")]
fn show_native_splash() {
    use std::process::Command;
    use std::thread;

    // Launch a PowerShell script to show a very simple splash screen
    thread::spawn(move || {
        let script = r#"
            # Hide console window
            Add-Type -Name Window -Namespace Console -MemberDefinition '
            [DllImport("Kernel32.dll")]
            public static extern IntPtr GetConsoleWindow();
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, Int32 nCmdShow);
            '
            $consolePtr = [Console.Window]::GetConsoleWindow()
            [void][Console.Window]::ShowWindow($consolePtr, 0) # 0 = SW_HIDE

            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing

            # Google Colors
            $googleBlue = [System.Drawing.Color]::FromArgb(66, 133, 244)    # #4285F4
            $googleRed = [System.Drawing.Color]::FromArgb(234, 67, 53)      # #EA4335
            $googleYellow = [System.Drawing.Color]::FromArgb(251, 188, 5)   # #FBBC05
            $googleGreen = [System.Drawing.Color]::FromArgb(52, 168, 83)    # #34A853
            $backgroundColor = [System.Drawing.Color]::FromArgb(244, 244, 244) # #F4F4F4

            # Create main form
            $form = New-Object System.Windows.Forms.Form
            $form.Text = 'Toddo'
            $form.Size = New-Object System.Drawing.Size(400, 250)
            $form.StartPosition = 'CenterScreen'
            $form.FormBorderStyle = 'None'
            $form.BackColor = $backgroundColor
            $form.TopMost = $true

            # Create title label
            $titleLabel = New-Object System.Windows.Forms.Label
            $titleLabel.Text = 'Toddo'
            $titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
            $titleLabel.ForeColor = $googleBlue
            $titleLabel.AutoSize = $true
            $titleLabel.Location = New-Object System.Drawing.Point(150, 30)
            $form.Controls.Add($titleLabel)

            # Create loading label
            $loadingLabel = New-Object System.Windows.Forms.Label
            $loadingLabel.Text = 'Loading...'
            $loadingLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10)
            $loadingLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 100)
            $loadingLabel.AutoSize = $true
            $loadingLabel.Location = New-Object System.Drawing.Point(165, 70)
            $form.Controls.Add($loadingLabel)

            # Create Google-colored bars (fixed sizes to avoid arithmetic)
            # Blue bar
            $blueBar = New-Object System.Windows.Forms.Panel
            $blueBar.Size = New-Object System.Drawing.Size(70, 4)
            $blueBar.Location = New-Object System.Drawing.Point(50, 110)
            $blueBar.BackColor = $googleBlue
            $form.Controls.Add($blueBar)

            # Red bar
            $redBar = New-Object System.Windows.Forms.Panel
            $redBar.Size = New-Object System.Drawing.Size(70, 4)
            $redBar.Location = New-Object System.Drawing.Point(125, 110)
            $redBar.BackColor = $googleRed
            $form.Controls.Add($redBar)

            # Yellow bar
            $yellowBar = New-Object System.Windows.Forms.Panel
            $yellowBar.Size = New-Object System.Drawing.Size(70, 4)
            $yellowBar.Location = New-Object System.Drawing.Point(200, 110)
            $yellowBar.BackColor = $googleYellow
            $form.Controls.Add($yellowBar)

            # Green bar
            $greenBar = New-Object System.Windows.Forms.Panel
            $greenBar.Size = New-Object System.Drawing.Size(70, 4)
            $greenBar.Location = New-Object System.Drawing.Point(275, 110)
            $greenBar.BackColor = $googleGreen
            $form.Controls.Add($greenBar)

            # Create Google logo circles (fixed positions)
            # Blue circle
            $blueCircle = New-Object System.Windows.Forms.Panel
            $blueCircle.Size = New-Object System.Drawing.Size(15, 15)
            $blueCircle.Location = New-Object System.Drawing.Point(170, 130)
            $blueCircle.BackColor = $googleBlue
            $form.Controls.Add($blueCircle)

            # Red circle
            $redCircle = New-Object System.Windows.Forms.Panel
            $redCircle.Size = New-Object System.Drawing.Size(15, 15)
            $redCircle.Location = New-Object System.Drawing.Point(190, 130)
            $redCircle.BackColor = $googleRed
            $form.Controls.Add($redCircle)

            # Yellow circle
            $yellowCircle = New-Object System.Windows.Forms.Panel
            $yellowCircle.Size = New-Object System.Drawing.Size(15, 15)
            $yellowCircle.Location = New-Object System.Drawing.Point(210, 130)
            $yellowCircle.BackColor = $googleYellow
            $form.Controls.Add($yellowCircle)

            # Green circle
            $greenCircle = New-Object System.Windows.Forms.Panel
            $greenCircle.Size = New-Object System.Drawing.Size(15, 15)
            $greenCircle.Location = New-Object System.Drawing.Point(190, 150)
            $greenCircle.BackColor = $googleGreen
            $form.Controls.Add($greenCircle)

            # Animation variables
            $animationStep = 0

            # Create animation timer
            $animTimer = New-Object System.Windows.Forms.Timer
            $animTimer.Interval = 300 # 3.3fps
            $animTimer.Add_Tick({
                # Update loading text with dots animation
                $dotsCount = $animationStep % 4
                $dots = '.' * $dotsCount
                $loadingLabel.Text = "Loading$dots"
                $animationStep++
            })

            # Auto-close timer (reduced by 50% to 1250ms)
            $closeTimer = New-Object System.Windows.Forms.Timer
            $closeTimer.Interval = 1250
            $closeTimer.Add_Tick({
                $form.Close()
            })

            # Start timers
            $animTimer.Start()
            $closeTimer.Start()

            # Show form
            $form.Show()

            # Run application
            [System.Windows.Forms.Application]::Run($form)
        "#;

        let _ = Command::new("powershell")
            .args(["-WindowStyle", "Hidden", "-Command", script])
            .spawn();
    });
}

// For non-Windows platforms, provide a simple no-op implementation
#[cfg(not(target_os = "windows"))]
fn show_native_splash() {
    // No-op for non-Windows platforms
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
            show_main_window
        ])
        .setup(|app| {
            // Show native splash screen
            #[cfg(target_os = "windows")]
            {
                // Launch native splash screen
                show_native_splash();
            }

            // Keep main window hidden until explicitly shown from JavaScript
            if let Some(_main_window) = app.get_webview_window("main") {
                println!("Main window initialized and hidden until loading completes");
            }

            // Set a timeout to show the main window after a delay
            if let Some(main_window) = app.get_webview_window("main") {
                let main_window_clone = main_window.clone();
                std::thread::spawn(move || {
                    // Wait for a short time to allow the splash screen to show (reduced by 50% to 1500ms)
                    std::thread::sleep(std::time::Duration::from_millis(1500));

                    // Show the main window
                    println!("Showing main window after delay");
                    if let Err(e) = main_window_clone.show() {
                        println!("Failed to show main window: {}", e);
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
