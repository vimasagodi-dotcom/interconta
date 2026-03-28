$clientId = "pt508433797_c297231-18f4586c85d79f99"
$clientSecret = "3aa2b2eadd90362d5c5f7c5d331f64bb"
$code = "3055c38d4c57b2498c06bda52377c7bad97730661da54864798840fed5c2414f"
$redirectUri = "https://oauth.pstmn.io/v1/callback"
$tokenUrl = "https://app17.toconline.pt/oauth/token"

$body = @{
    grant_type = "authorization_code"
    client_id = $clientId
    client_secret = $clientSecret
    code = $code
    redirect_uri = $redirectUri
}

# The documentation said Authorization header with Basic auth might be needed, or just body
# Let's try body first as it's common for simplified OAuth
$headers = @{
    "Accept" = "application/json"
    "User-Agent" = "Internal-Admin-Cli"
}

Write-Host "Exchanging code for tokens..."
try {
    $response = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $body -Headers $headers -ErrorAction Stop
    Write-Host "SUCCESS!"
    $response | ConvertTo-Json
} catch {
    Write-Host "Error occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        $_.ErrorDetails.Message | Write-Host
    }
}
