$ErrorActionPreference = 'Stop'

$port = 5050

try {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Write-Host ("[api:dev] Stopping process on port {0}: {1} (PID {2})" -f $port, $process.ProcessName, $processId)
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
  }

  if ($processIds.Count -gt 0) {
    Start-Sleep -Milliseconds 800
  }
}
catch {
  Write-Warning ("Could not release port {0}: {1}" -f $port, $_.Exception.Message)
}

$remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($remaining) {
  $remainingPids = @($remaining | Select-Object -ExpandProperty OwningProcess -Unique)
  Write-Error ("Port {0} is still in use by PID(s): {1}. Run PowerShell as Administrator and try again." -f $port, ($remainingPids -join ', '))
  exit 1
}

Write-Host ("[api:dev] Starting API at http://localhost:{0}" -f $port)
node src/server/api-server.js
