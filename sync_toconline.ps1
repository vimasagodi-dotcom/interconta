$sbUrl = "https://rzktszngtyfswthgvbsf.supabase.co"
$sbKey = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"
$tocToken = "17-297231-1483007-ea4a2f8c7c8771a9190855b950910f4ebfd5f3e064ea9f6138a36f69277bb6b0"
$tocUrl = "https://app17.toconline.pt/api/v1/commercial_sales_documents"

$sbHeaders = @{
    "apikey" = $sbKey
    "Authorization" = "Bearer $sbKey"
    "Content-Type" = "application/json"
    "User-Agent" = "Internal-Admin-Cli/1.0"
}

$tocHeaders = @{
    "Authorization" = "Bearer $tocToken"
    "Accept" = "application/json"
    "User-Agent" = "Internal-Admin-Cli/1.0"
}

Write-Host "Fetching clients to map NIFs..."
try {
    $clients = Invoke-RestMethod -Uri "$sbUrl/rest/v1/clientes?select=id,nif,name" -Method Get -Headers $sbHeaders
    $nifMap = @{}
    foreach ($c in $clients) {
        if ($c.nif) { $nifMap[$c.nif] = $c }
    }
} catch {
    Write-Host "Error fetching clients:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) { $_.ErrorDetails.Message | Write-Host }
    exit
}

Write-Host "Fetching TOConline documents..."
try {
    $tocDocs = Invoke-RestMethod -Uri $tocUrl -Method Get -Headers $tocHeaders

    $movements = @()
    foreach ($doc in $tocDocs) {
        # Normalização do NIF (remover espaços se houver)
        $nif = $doc.customer_tax_registration_number.Trim()
        
        if ($nifMap.ContainsKey($nif)) {
            $client = $nifMap[$nif]
            $tipo = "fatura"
            # Tipos do TOC: FT, FR, FS, RC (Recibo), RE (Recibo), etc.
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
        Write-Host "Pushing to Supabase table 'movimentos_faturacao'..."
        # resolution=merge-duplicates doesn't exist in PostgREST default, but we have `on_conflict` in the URL
        # or just use headers to handle upsert.
        
        $sbUpsertHeaders = $sbHeaders.Clone()
        $sbUpsertHeaders.Add("Prefer", "resolution=merge-duplicates")
        
        $body = $movements | ConvertTo-Json -Depth 5
        $resPush = Invoke-RestMethod -Uri "$sbUrl/rest/v1/movimentos_faturacao" -Method Post -Headers $sbUpsertHeaders -Body $body
        Write-Host "SUCCESS: Movements imported/updated!"
    } else {
        Write-Host "No relevant movements found for our clients."
    }
} catch {
    Write-Host "Error in sync process:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) { $_.ErrorDetails.Message | Write-Host }
}
