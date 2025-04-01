# Run script for Toddo application with optimizations

Write-Host "Starting Toddo with performance optimizations..." -ForegroundColor Cyan

# Set environment variables for optimization
$env:RUSTFLAGS = "-C target-cpu=native"
$env:CARGO_PROFILE_RELEASE_LTO = "true"
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "1"
$env:CARGO_PROFILE_RELEASE_OPT_LEVEL = "3"

# Run in release mode
Write-Host "Running in release mode..." -ForegroundColor Yellow
Push-Location src-tauri
cargo tauri dev --release
$runResult = $LASTEXITCODE
Pop-Location
if ($runResult -ne 0) {
    Write-Host "Failed to start application" -ForegroundColor Red
    exit $runResult
}

Write-Host "Application closed" -ForegroundColor Green
