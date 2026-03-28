$url = "https://rzktszngtyfswthgvbsf.supabase.co"
$key = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}

$authBody = @{
    "email" = "araujoraquel@sapo.pt"
    "password" = "Interconta2026*"
    "email_confirm" = $true
    "user_metadata" = @{ "name" = "Raquel Martins Araújo"; "role" = "colaborador" }
} | ConvertTo-Json -Depth 5

Write-Host "Creating auth record for Raquel..."
try {
    $authRes = Invoke-RestMethod -Uri "$url/auth/v1/admin/users" -Method Post -Headers $headers -Body $authBody -UserAgent "curl/7.81.0"
    $raquelId = $authRes.id
    Write-Host "Created Raquel Auth ID: $raquelId"

    $colabBody = @{
        "id" = $raquelId
        "name" = "Raquel Martins Araújo"
        "email" = "araujoraquel@sapo.pt"
        "phone" = ""
        "role" = "colaborador"
        "ferias_transitadas" = 0
    } | ConvertTo-Json -Depth 5

    Write-Host "Creating colab record for Raquel..."
    $colabRes = Invoke-RestMethod -Uri "$url/rest/v1/colaboradores" -Method Post -Headers $headers -Body $colabBody -UserAgent "curl/7.81.0"
    Write-Host "Raquel Success!"
} catch {
    Write-Host "Error creating Raquel:"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd()
    } else {
        Write-Host $_.Exception.Message
    }
}

Write-Host "Updating Vitor ferias_transitadas to 6..."
try {
    $patchBody = '{"ferias_transitadas": 6}'
    Invoke-RestMethod -Uri "$url/rest/v1/colaboradores?email=eq.vimasagodi@gmail.com" -Method Patch -Headers $headers -Body $patchBody -UserAgent "curl/7.81.0"
    Write-Host "Vitor updated!"
} catch {
    Write-Host "Error updating Vitor:"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd()
    } else {
        Write-Host $_.Exception.Message
    }
}
