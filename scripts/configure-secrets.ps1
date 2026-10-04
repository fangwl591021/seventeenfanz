$ErrorActionPreference = 'Stop'

function Set-WorkerSecret {
  param([Parameter(Mandatory = $true)][string]$Name)
  $secureValue = Read-Host "Enter $Name" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($plainValue)) { throw "$Name cannot be empty" }
    $plainValue | npx.cmd wrangler secret put $Name
    if ($LASTEXITCODE -ne 0) { throw "Failed to set $Name" }
  }
  finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plainValue = $null
  }
}

Set-WorkerSecret 'LINE_CHANNEL_SECRET'
Set-WorkerSecret 'LINE_CHANNEL_ACCESS_TOKEN'
Set-WorkerSecret 'GEMINI_API_KEY'
Set-WorkerSecret 'ADMIN_ACCESS_KEY'

Write-Host 'All four Worker secrets are configured. Tell Codex to continue verification and enable collection.'
