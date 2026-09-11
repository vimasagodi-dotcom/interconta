@echo off
chcp 65001 >nul
title Interconta - Extrator e-Fatura AT

echo ====================================================================
echo                 INTERCONTA - EXTRATOR E-FATURA
echo ====================================================================
echo.
echo A verificar se o Python esta instalado no sistema...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Python nao foi encontrado no PATH.
    echo Por favor instale o Python a partir de https://www.python.org e marque
    echo a opcao "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

echo [OK] Python detetado!
echo.
echo A verificar e instalar dependencias (playwright, pandas, openpyxl)...
pip install playwright pandas openpyxl requests >nul 2>&1
python -m playwright install chromium >nul 2>&1

echo.
echo ====================================================================
echo  Configuracao da Extracao:
echo ====================================================================
echo.
set /p TIPO="Escolha o Tipo [1 = Compras / Adquirente, 2 = Vendas / Emitente] (Padrao: 1): "
if "%TIPO%"=="2" (
    set TIPO_ARG=vendas
) else (
    set TIPO_ARG=compras
)

set /p ANO="Indique o Ano pretendido (Ex: 2025 ou 2024) [Padrao: 2025]: "
if "%ANO%"=="" set ANO=2025

set /p DIAS="Intervalo de dias por lote (Anti-limite 300 AT) [Padrao: 7]: "
if "%DIAS%"=="" set DIAS=7

set /p NIF="NIF da Empresa (opcional): "

set INICIO=%ANO%-01-01
set FIM=%ANO%-12-31

echo.
echo ====================================================================
echo  A iniciar o extrator Playwright para %TIPO_ARG% do ano %ANO%...
echo ====================================================================
echo.

python "%~dp0efatura_extractor.py" --tipo %TIPO_ARG% --inicio %INICIO% --fim %FIM% --dias %DIAS% --nif "%NIF%"

echo.
echo ====================================================================
echo  Processo terminado!
echo ====================================================================
pause
