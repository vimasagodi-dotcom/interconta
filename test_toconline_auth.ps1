$clientId = "pt508433797_c297231-18f4586c85d79f99"
$clientSecret = "3aa2b2eadd90362d5c5f7c5d331f64bb"
$baseUrl = "https://app17.toconline.pt/oauth/token"

# Testando Client Credentials (menos provável de funcionar para dados comerciais)
$body = @{
    grant_type = "client_credentials"
    client_id = $clientId
    client_secret = $clientSecret
}

Write-Host "Tentando obter Token via Client Credentials..."
try {
    $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Body $body -ErrorAction Stop
    Write-Host "Sucesso!"
    $response | ConvertTo-Json
} catch {
    Write-Host "Falha no Client Credentials (esperado)."
    Write-Host $_.Exception.Message
    $_.ErrorDetails.Message | Write-Host
}

# Link para o utilizador autorizar (Authorization Code Flow)
$authUrl = "https://app17.toconline.pt/oauth/auth?client_id=$clientId&redirect_uri=https://oauth.pstmn.io/v1/callback&response_type=code&scope=commercial"
Write-Host "`nPara o fluxo de Código de Autorização, o utilizador deve abrir este link:"
Write-Host $authUrl
