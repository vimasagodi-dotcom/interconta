$body = '{"id":"8c933b88-ce69-4c66-b3f3-d440e05d457d", "name":"Vitor Manuel dos Santos Gomes Dias", "email":"vimasagodi@gmail.com", "phone":"968070090", "role":"colaborador"}'
try {
  Invoke-RestMethod -Uri 'https://rzktszngtyfswthgvbsf.supabase.co/rest/v1/colaboradores' -Method Post -Headers @{'apikey'='sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0'; 'Authorization'='Bearer sb_secret_kfa8tWGTKmfc_Z8uSgVzAw_c0PqZQu0'; 'Content-Type'='application/json'} -Body $body -UserAgent 'curl/7.81.0'
  Write-Host "Success inserting colab"
} catch {
  Write-Host "ERROR:"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  Write-Host $reader.ReadToEnd()
}
