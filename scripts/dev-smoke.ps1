# Signs in against the local Auth emulator and requests each page, printing the status code.
# Usage: ./scripts/dev-smoke.ps1 -Paths "/dashboard","/products"
param([string[]]$Paths = @("/dashboard"))

$base = "http://localhost:3000"
$token = (Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key" `
  -ContentType "application/json" `
  -Body (@{ email = "admin@sahoo.test"; password = "SahooAdmin#2026"; returnSecureToken = $true } | ConvertTo-Json)).idToken
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -Method Post -Uri "$base/api/auth/session" -WebSession $session -ContentType "application/json" `
  -Headers @{ Origin = $base } -Body (@{ idToken = $token } | ConvertTo-Json) -UseBasicParsing | Out-Null

foreach ($path in $Paths) {
  try {
    $res = Invoke-WebRequest -Uri "$base$path" -WebSession $session -UseBasicParsing -MaximumRedirection 0
    "$($res.StatusCode) $path"
  } catch {
    "$($_.Exception.Response.StatusCode.value__) $path"
  }
}
