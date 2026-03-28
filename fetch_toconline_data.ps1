$accessToken = "17-297231-1483007-ea4a2f8c7c8771a9190855b950910f4ebfd5f3e064ea9f6138a36f69277bb6b0"
$apiUrl = "https://app17.toconline.pt/api/v1/commercial_sales_documents"

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Accept" = "application/json"
    "Content-Type" = "application/vnd.api+json"
    "User-Agent" = "Internal-Admin-Cli"
}

Write-Host "Fetching sales documents from TOConline..."
try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "SUCCESS!"
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        $_.ErrorDetails.Message | Write-Host
    }
}
