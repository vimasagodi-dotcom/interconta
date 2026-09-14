"""
Extrator em Lote do e-Fatura (Autoridade Tributaria de Portugal)
Suporta Faturas de Compras (Adquirente) e Vendas (Emitente)
Desenvolvido para contornar o limite de 300 faturas da AT atraves de intervalos semanais/quinzenais.
"""

import os
import sys
import time
import glob
import argparse
from datetime import datetime, timedelta

def install_and_import(package):
    import importlib
    try:
        return importlib.import_module(package)
    except ImportError:
        import subprocess
        print(f"A instalar dependencia necessaria: {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        return importlib.import_module(package)

def run_extractor(tipo="compras", start_date_str="2025-01-01", end_date_str="2025-12-31", delta_days=7, output_dir="./downloads_efatura", nif_empresa=""):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright nao instalado. A tentar instalar...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "openpyxl", "pandas"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright

    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    delta = timedelta(days=delta_days)

    tipo_str = "compras" if tipo.lower() in ["compras", "adquirente"] else "vendas"
    folder_name = f"{tipo_str}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"
    if nif_empresa:
        folder_name = f"{nif_empresa}_{folder_name}"
    
    target_dir = os.path.abspath(os.path.join(output_dir, folder_name))
    os.makedirs(target_dir, exist_ok=True)

    print("=" * 65)
    print("  INTERCONTA - EXTRATOR EM LOTE DO E-FATURA (AT)")
    print("=" * 65)
    print(f"-> Tipo de Documentos: {tipo_str.upper()}")
    if nif_empresa:
        print(f"-> NIF Empresa:        {nif_empresa}")
    print(f"-> Intervalo Total:    {start_date.strftime('%d/%m/%Y')} ate {end_date.strftime('%d/%m/%Y')}")
    print(f"-> Fragmentacao Lote:  {delta_days} dias (anti-limite 300 AT)")
    print(f"-> Pasta de Destino:   {target_dir}")
    print("=" * 65)

    downloaded_files = []

    with sync_playwright() as p:
        print("\nA iniciar navegador Chromium...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # URL de login AT
        login_url = "https://www.acesso.gov.pt/v2/login?skin=efatura"
        page.goto(login_url)
        print("\nPor favor efetue a autenticacao no browser (Senha AT ou Chave Movel Digital)...")

        # URL alvo conforme tipo
        target_url = "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosAdquirente.action" if tipo_str == "compras" \
            else "https://faturas.portaldasfinancas.gov.pt/consultarDocumentosEmitente.action"

        # Aguardar que o utilizador faca login e aceda ao portal
        print("A aguardar que o login seja concluido...")
        logged_in = False
        for _ in range(120): # 2 minutos de timeout
            current_url = page.url.lower()
            if "portaldasfinancas.gov.pt" in current_url and "login" not in current_url:
                logged_in = True
                break
            time.sleep(1)

        if not logged_in:
            input("Pressione [ENTER] nesta consola assim que tiver concluido o login e estiver na pagina de faturas...")

        # Navega para a pagina especifica de consulta
        print(f"\nA navegar para a pagina de consulta de {tipo_str}...")
        page.goto(target_url)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        current_start = start_date
        batch_num = 1

        while current_start <= end_date:
            current_end = min(current_start + delta - timedelta(days=1), end_date)
            
            s_date_str = current_start.strftime("%Y-%m-%d")
            e_date_str = current_end.strftime("%Y-%m-%d")
            s_display = current_start.strftime("%d-%m-%Y")
            e_display = current_end.strftime("%d-%m-%Y")
            
            print(f"\n[Lote {batch_num}] A extrair periodo de {s_display} a {e_display}...")

            try:
                # Preencher datas (seletores comuns no portal das financas)
                # Seletores comumente usados no e-fatura:
                selectors_start = ["#dataInicio", "input[name='dataInicio']", "#dataEmissaoInicio", "input[name='dataEmissaoInicio']"]
                selectors_end = ["#dataFim", "input[name='dataFim']", "#dataEmissaoFim", "input[name='dataEmissaoFim']"]
                
                # Tentar preencher data inicio
                for sel in selectors_start:
                    if page.locator(sel).count() > 0 and page.locator(sel).is_visible():
                        page.fill(sel, "")
                        page.fill(sel, s_date_str)
                        break

                # Tentar preencher data fim
                for sel in selectors_end:
                    if page.locator(sel).count() > 0 and page.locator(sel).is_visible():
                        page.fill(sel, "")
                        page.fill(sel, e_date_str)
                        break

                # Clicar no botao de pesquisar
                search_btn_selectors = [
                    "button:has-text('Pesquisar')", 
                    "input[value='Pesquisar']", 
                    "#pesquisarBtn", 
                    "button[type='submit']",
                    ".btn-search"
                ]
                for btn_sel in search_btn_selectors:
                    if page.locator(btn_sel).count() > 0 and page.locator(btn_sel).is_visible():
                        page.click(btn_sel)
                        break
                
                time.sleep(2)
                page.wait_for_load_state("networkidle")

                # Clicar em Exportar para Excel / CSV
                export_selectors = [
                    "a:has-text('Exportar para Excel')",
                    "button:has-text('Exportar para Excel')",
                    "a:has-text('Exportar para CSV')",
                    "a:has-text('Exportar')",
                    "button:has-text('Exportar')",
                    ".btn-export",
                    "#exportExcel",
                    "#exportCsv"
                ]

                download_triggered = False
                for exp_sel in export_selectors:
                    if page.locator(exp_sel).count() > 0 and page.locator(exp_sel).is_visible():
                        try:
                            with page.expect_download(timeout=10000) as download_info:
                                page.click(exp_sel)
                            download = download_info.value
                            dest_filename = f"faturas_{tipo_str}_{s_date_str}_{e_date_str}" + os.path.splitext(download.suggested_filename)[1]
                            dest_path = os.path.join(target_dir, dest_filename)
                            download.save_as(dest_path)
                            print(f"  -> Sucesso! Ficheiro guardado: {dest_filename}")
                            downloaded_files.append(dest_path)
                            download_triggered = True
                            break
                        except Exception as dl_err:
                            pass

                if not download_triggered:
                    print(f"  -> Aviso: Botao de exportacao nao detetado ou sem resultados para {s_display} a {e_display}.")

                time.sleep(2) # Pausa de seguranca para evitar rate-limiting da AT

            except Exception as e:
                print(f"  -> Erro no lote {s_display} a {e_display}: {e}")

            current_start = current_end + timedelta(days=1)
            batch_num += 1

        print("\n" + "=" * 65)
        print("  Extracao em lote concluida com sucesso!")
        print(f"  Total de ficheiros descarregados: {len(downloaded_files)}")
        print("=" * 65)

        browser.close()

    # Consolidar ficheiros se existirem ficheiros descarregados
    if downloaded_files:
        consolidate_files(downloaded_files, target_dir, tipo_str, start_date_str, end_date_str)
    else:
        print("\nNenhum ficheiro foi descarregado para consolidacao.")

def consolidate_files(files, target_dir, tipo_str, start_date_str, end_date_str):
    print("\nA iniciar consolidacao automatica dos ficheiros...")
    try:
        import pandas as pd
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"])
        import pandas as pd

    all_dfs = []
    for f in files:
        try:
            if f.endswith('.csv'):
                # Ficheiros CSV do e-fatura tipicamente usam separador ';' e encoding latin1 ou utf-8
                try:
                    df = pd.read_csv(f, sep=';', encoding='utf-8')
                except Exception:
                    df = pd.read_csv(f, sep=';', encoding='latin1')
            else:
                df = pd.read_excel(f)
            
            if not df.empty:
                all_dfs.append(df)
        except Exception as read_err:
            print(f"Aviso ao ler {os.path.basename(f)}: {read_err}")

    if not all_dfs:
        print("Nao foi possivel carregar dados validos para consolidar.")
        return

    combined_df = pd.concat(all_dfs, ignore_index=True)
    initial_len = len(combined_df)
    
    # Remover duplicados (por exemplo faturas duplicadas na fronteira de datas)
    combined_df.drop_duplicates(inplace=True)
    final_len = len(combined_df)

    def clean_currency(x):
        if isinstance(x, str):
            return float(x.replace(' €', '').replace('.', '').replace(',', '.'))
        return x

    if 'Emitente' in combined_df.columns:
        split_emitente = combined_df['Emitente'].str.split(' - ', n=1, expand=True)
        combined_df['NIF Emitente'] = split_emitente[0] if len(split_emitente.columns) > 0 else ''
        combined_df['Nome Emitente'] = split_emitente[1] if len(split_emitente.columns) > 1 else ''
    else:
        combined_df['NIF Emitente'] = ''
        combined_df['Nome Emitente'] = ''

    combined_df['NIF Adquirente'] = ''
    combined_df['Nome Adquirente'] = ''

    if 'Nº Fatura / ATCUD' in combined_df.columns:
        split_col = combined_df['Nº Fatura / ATCUD'].str.split(' / ', n=1, expand=True)
        combined_df['Nº Documento'] = split_col[0] if len(split_col.columns) > 0 else ''
        combined_df['ATCUD'] = split_col[1] if len(split_col.columns) > 1 else ''
    else:
        combined_df['Nº Documento'] = ''
        combined_df['ATCUD'] = ''

    if 'Data Emissão' in combined_df.columns:
        combined_df['Data Emissão'] = pd.to_datetime(combined_df['Data Emissão'], format='%d-%m-%Y', errors='coerce').dt.strftime('%Y-%m-%d')
    else:
        combined_df['Data Emissão'] = ''
    
    combined_df['Data Registo AT'] = combined_df['Data Emissão']

    if 'Base Tributável' in combined_df.columns:
        combined_df['Base Tributável (€)'] = combined_df['Base Tributável'].apply(clean_currency)
    else:
        combined_df['Base Tributável (€)'] = 0.0

    if 'IVA' in combined_df.columns:
        combined_df['Valor IVA (€)'] = combined_df['IVA'].apply(clean_currency)
    else:
        combined_df['Valor IVA (€)'] = 0.0

    if 'Total' in combined_df.columns:
        combined_df['Total com IVA (€)'] = combined_df['Total'].apply(clean_currency)
    else:
        combined_df['Total com IVA (€)'] = 0.0

    def calc_taxa(row):
        base = row['Base Tributável (€)']
        iva = row['Valor IVA (€)']
        if base and base != 0:
            return f"{round((iva / base) * 100)}%"
        return "0%"
    combined_df['Taxa IVA'] = combined_df.apply(calc_taxa, axis=1)

    rename_cols = {
        'Tipo': 'Tipo Doc',
        'Situação': 'Estado',
        'Setor': 'Setor Atividade'
    }
    combined_df.rename(columns=rename_cols, inplace=True)

    final_cols = [
        'NIF Emitente', 'Nome Emitente', 'NIF Adquirente', 'Nome Adquirente',
        'Tipo Doc', 'Nº Documento', 'Data Emissão', 'Data Registo AT', 'ATCUD',
        'Base Tributável (€)', 'Taxa IVA', 'Valor IVA (€)', 'Total com IVA (€)',
        'Estado', 'Setor Atividade'
    ]
    for col in final_cols:
        if col not in combined_df.columns:
            combined_df[col] = ''
    
    combined_df = combined_df[final_cols]

    # Calcular totais por fornecedor
    pivot_df = combined_df.copy()
    pivot_df['Total com IVA (€)'] = pd.to_numeric(pivot_df['Total com IVA (€)'], errors='coerce').fillna(0)
    
    def get_doc_group(tipo):
        tipo_str = str(tipo).lower()
        if 'nota de cr' in tipo_str or 'devolu' in tipo_str:
            return 'Notas de Crédito'
        return 'Faturas'
        
    pivot_df['Doc Group'] = pivot_df['Tipo Doc'].apply(get_doc_group)
    
    totais = pd.pivot_table(pivot_df, 
                            values='Total com IVA (€)', 
                            index=['NIF Emitente', 'Nome Emitente'], 
                            columns=['Doc Group'], 
                            aggfunc='sum', 
                            fill_value=0).reset_index()
    
    if 'Faturas' not in totais.columns:
        totais['Faturas'] = 0.0
    if 'Notas de Crédito' not in totais.columns:
        totais['Notas de Crédito'] = 0.0
        
    totais['Total Líquido'] = totais['Faturas'] - totais['Notas de Crédito']

    consolidated_filename = f"CONSOLIDADO_FATURAS_{tipo_str.upper()}_{start_date_str}_{end_date_str}.xlsx"
    consolidated_path = os.path.join(target_dir, consolidated_filename)

    try:
        with pd.ExcelWriter(consolidated_path, engine='openpyxl') as writer:
            combined_df.to_excel(writer, sheet_name='Faturas', index=False)
            totais.to_excel(writer, sheet_name='Totais por Fornecedor', index=False)
        print(f"\n[SUCESSO] Ficheiro consolidado unico gerado com formatação Anexo 1 e Totais!")
        print(f"Ficheiro: {consolidated_path}")
        print(f"Total de linhas consolidadas: {final_len} (removidos {initial_len - final_len} duplicados)")
    except Exception as save_err:
        print(f"Erro ao gravar ficheiro consolidado Excel: {save_err}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extrator de Faturas do Portal das Financas (e-Fatura) em Lote")
    parser.add_argument("--tipo", choices=["compras", "vendas"], default="compras", help="Tipo de faturas (compras ou vendas)")
    parser.add_argument("--inicio", default="2025-01-01", help="Data de inicio no formato AAAA-MM-DD")
    parser.add_argument("--fim", default="2025-12-31", help="Data de fim no formato AAAA-MM-DD")
    parser.add_argument("--dias", type=int, default=7, help="Numero de dias por cada lote (padrao: 7)")
    parser.add_argument("--nif", default="", help="NIF da empresa para organizacao de pastas")
    parser.add_argument("--destino", default="./downloads_efatura", help="Diretoria de destino dos ficheiros")

    args = parser.parse_args()

    run_extractor(
        tipo=args.tipo,
        start_date_str=args.inicio,
        end_date_str=args.fim,
        delta_days=args.dias,
        output_dir=args.destino,
        nif_empresa=args.nif
    )
