$url = "https://rzktszngtyfswthgvbsf.supabase.co"
$key = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
}

$authBody = @{
    "email" = "madalenafcn@gmail.com"
    "password" = "Interconta2026*"
    "email_confirm" = $true
    "user_metadata" = @{ "name" = "Madalena Ferreira da Costa Meira"; "role" = "colaborador" }
} | ConvertTo-Json -Depth 5

Write-Host "Creating auth record for Madalena..."
try {
    $authRes = Invoke-RestMethod -Uri "$url/auth/v1/admin/users" -Method Post -Headers $headers -Body $authBody -UserAgent "curl/7.81.0"
    $mId = $authRes.id
    Write-Host "Created Madalena Auth ID: $mId"

    $colabBody = @{
        "id" = $mId
        "name" = "Madalena Ferreira da Costa Meira"
        "email" = "madalenafcn@gmail.com"
        "phone" = ""
        "role" = "colaborador"
        "ferias_transitadas" = 0
    } | ConvertTo-Json -Depth 5

    Write-Host "Creating colab record for Madalena..."
    $colabRes = Invoke-RestMethod -Uri "$url/rest/v1/colaboradores" -Method Post -Headers $headers -Body $colabBody -UserAgent "curl/7.81.0"
    Write-Host "Madalena Success!"
} catch {
    Write-Host "Error creating Madalena:"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd()
    } else {
        Write-Host $_.Exception.Message
    }
}
