$url = "https://rzktszngtyfswthgvbsf.supabase.co"
$key = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
}

$authBody = @{
    "email" = "vimasagodi@gmail.com"
    "password" = "Interconta2026*"
    "email_confirm" = $true
    "user_metadata" = @{ "name" = "Vitor Manuel dos Santos Gomes Dias"; "role" = "colaborador" }
} | ConvertTo-Json -Depth 5

Write-Host "Creating auth record..."
try {
    $authRes = Invoke-RestMethod -Uri "$url/auth/v1/admin/users" -Method Post -Headers $headers -Body $authBody
    $userId = $authRes.id
    Write-Host "Created user ID: $userId"

    $colabBody = @{
        "id" = $userId
        "name" = "Vitor Manuel dos Santos Gomes Dias"
        "email" = "vimasagodi@gmail.com"
        "phone" = "968070090"
        "role" = "colaborador"
        "status" = "ativo"
    } | ConvertTo-Json -Depth 5

    Write-Host "Creating colab record..."
    $colabRes = Invoke-RestMethod -Uri "$url/rest/v1/colaboradores" -Method Post -Headers $headers -Body $colabBody
    Write-Host "Success!"
} catch {
    Write-Host "Error occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message
    }
}
