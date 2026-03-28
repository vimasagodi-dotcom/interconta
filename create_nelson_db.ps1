$url = "https://rzktszngtyfswthgvbsf.supabase.co"
$key = "sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0"
$userId = "c059f662-e982-4ba2-b734-81c7dabb070e"

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
    "User-Agent" = "Internal-Admin-Cli"
}

$colabBody = @{
    "id" = $userId
    "name" = "Nelson Jorge dos Santos Gomes Dias"
    "email" = "ne_dias@sapo.pt"
    "phone" = "968638564"
    "role" = "colaborador"
    "ferias_transitadas" = 0
} | ConvertTo-Json -Depth 5

Write-Host "Creating colab record for Nelson ($userId)..."
try {
    $colabRes = Invoke-RestMethod -Uri "$url/rest/v1/colaboradores" -Method Post -Headers $headers -Body $colabBody
    Write-Host "SUCCESS: Nelson created successfully in the database!"
} catch {
    Write-Host "Error occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message
    }
}
