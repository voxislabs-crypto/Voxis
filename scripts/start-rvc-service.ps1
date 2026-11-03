# Start the local RVC voice service if it is not already healthy.
# Login shortcut: shell:startup -> "Voxis RVC Service.lnk"
# Stop: end the python process that is listening on port 7861.

$ErrorActionPreference = "Stop"

$ServiceDir = "X:\Voxis\voice-services\rvc-service"
$Python = Join-Path $ServiceDir "Scripts\python.exe"
$ServiceScript = Join-Path $ServiceDir "service.py"
$Log = Join-Path $ServiceDir "service-autostart.log"
$ErrLog = Join-Path $ServiceDir "service-autostart.err.log"
$NoteLog = Join-Path $ServiceDir "service-autostart.notes.log"
$HealthUrl = "http://127.0.0.1:7861/health"

function Test-RvcHealthy {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Write-Note([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
  Add-Content -Path $NoteLog -Value $line
}

if (Test-RvcHealthy) {
  exit 0
}

$listening = $null
try {
  $listening = Get-NetTCPConnection -LocalPort 7861 -State Listen -ErrorAction SilentlyContinue
} catch {
  $listening = $null
}
if ($listening) {
  Write-Note "Port 7861 is in use but /health failed. Not starting a second copy."
  exit 1
}

if (-not (Test-Path $Python)) {
  Write-Note "Python not found at $Python"
  exit 1
}
if (-not (Test-Path $ServiceScript)) {
  Write-Note "service.py not found at $ServiceScript"
  exit 1
}

Write-Note "Starting RVC service."
Start-Process -FilePath $Python `
  -ArgumentList @("-u", $ServiceScript) `
  -WorkingDirectory $ServiceDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $Log `
  -RedirectStandardError $ErrLog

$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Seconds 1
  if (Test-RvcHealthy) {
    exit 0
  }
} while ((Get-Date) -lt $deadline)

exit 1
