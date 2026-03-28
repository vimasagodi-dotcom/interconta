# TOConline Sync Engine with Auto-Refresh
$envPath = "c:\Users\Utilizador\Desktop\ANTIGRAVITY AI\office-owl-assist-main\.env"
$sbUrl = "https://rzktszngtyfswthgvbsf.supabase.co"
$sbKey = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"

# Carregar credenciais do .env
$envContent = Get-Content $envPath
$clientId = ($envContent | Select-String "TOC_CLIENT_ID=").ToString().Split("=")[1].Trim()
$clientSecret = ($envContent | Select-String "TOC_CLIENT_SECRET=").ToString().Split("=")[1].Trim()
$refreshToken = ($envContent | Select-String "TOC_REFRESH_TOKEN=").ToString().Split("=")[1].Trim()
$accessToken = ($envContent | Select-String "TOC_ACCESS_TOKEN=").ToString().Split("=")[1].Trim()

function Refresh-Token {
    Write-Host "Refreshing TOConline access token..."
    $body = @{
        grant_type = "refresh_token"
        refresh_token = $refreshToken
        client_id = $clientId
        client_secret = $clientSecret
    }
    try {
        $res = Invoke-RestMethod -Uri "https://app17.toconline.pt/oauth/token" -Method Post -Body $body -ErrorAction Stop
        $global:accessToken = $res.access_token
        $global:refreshToken = $res.refresh_token
        
        # Update .env file
        $newEnv = Get-Content $envPath
        $newEnv = $newEnv -replace "TOC_ACCESS_TOKEN=.*", "TOC_ACCESS_TOKEN=$($global:accessToken)"
        $newEnv = $newEnv -replace "TOC_REFRESH_TOKEN=.*", "TOC_REFRESH_TOKEN=$($global:refreshToken)"
        $newEnv | Set-Content $envPath
        
        Write-Host "Token refreshed and saved to .env."
        return $true
    } catch {
        Write-Host "Failed to refresh token: $($_.Exception.Message)"
        return $false
    }
}

function Fetch-And-Sync {
    $sbHeaders = @{ "apikey" = $sbKey; "Authorization" = "Bearer $sbKey"; "Content-Type" = "application/json"; "User-Agent" = "Internal-Admin-Cli/1.0" }
    $tocHeaders = @{ "Authorization" = "Bearer $accessToken"; "Accept" = "application/json"; "User-Agent" = "Internal-Admin-Cli/1.0" }

    Write-Host "Fetching clients..."
    $clients = Invoke-RestMethod -Uri "$sbUrl/rest/v1/clientes?select=id,nif,avenca_automatica" -Method Get -Headers $sbHeaders
    $clientMap = @{}
    foreach ($c in $clients) { if ($c.nif) { $clientMap[$c.nif.Trim()] = $c } }

    Write-Host "Fetching TOConline sales documents..."
    try {
        $tocDocs = Invoke-RestMethod -Uri "https://app17.toconline.pt/api/v1/commercial_sales_documents" -Method Get -Headers $tocHeaders -ErrorAction Stop
    } catch {
        if ($_.Exception.Message -match "401") {
            if (Refresh-Token) {
                # Retry once
                $tocHeaders["Authorization"] = "Bearer $accessToken"
                $tocDocs = Invoke-RestMethod -Uri "https://app17.toconline.pt/api/v1/commercial_sales_documents" -Method Get -Headers $tocHeaders
            } else { throw $_ }
        } else { throw $_ }
    }

    $movements = @()
    foreach ($doc in $tocDocs) {
        # Only 2026 onwards
        if ([datetime]$doc.date -lt [datetime]"2026-01-01") { continue }

        $nif = $doc.customer_tax_registration_number.Trim()
        if ($clientMap.ContainsKey($nif)) {
            $client = $clientMap[$nif]
            # SKIP "AVENÇAS" from TOConline ONLY IF the client has "Lançar Automaticamente" enabled
            $docNo = $doc.document_no
            $custName = $doc.customer_business_name.ToLower()
            $isTocAvenca = ($docNo -match "AV" -or $custName -match "avença" -or ($doc.document_type -eq "FT" -and $docNo -match "/A"))
            
            if ($isTocAvenca -and $client.avenca_automatica -ne $false) {
                Write-Host "Skipping TOConline Avença for $($client.nif) (Auto-launch enabled): $docNo"
                continue
            }

            $tipo = "fatura"
            if ($doc.document_type -match "RE|RC") { $tipo = "pagamento" }
            $val = [double]$doc.gross_total
            if ($tipo -eq "pagamento") { $val = -$val }

            $movements += @{
                client_id = $client.id
                toconline_id = $doc.id.ToString()
                tipo = $tipo
                data = $doc.date
                descricao = "$($doc.document_no) - $($doc.customer_business_name)"
                valor = $val
                pdf_link = $doc.public_link
            }
        }
    }

    Write-Host "Mapped $($movements.Count) movements."
    if ($movements.Count -gt 0) {
        $sbHeaders.Add("Prefer", "resolution=merge-duplicates")
        $body = $movements | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$sbUrl/rest/v1/movimentos_faturacao" -Method Post -Headers $sbHeaders -Body $body
        Write-Host "Sync Complete!"
    }
}

try {
    Fetch-And-Sync
} catch {
    Write-Host "FATAL ERROR: $($_.Exception.Message)"
}
