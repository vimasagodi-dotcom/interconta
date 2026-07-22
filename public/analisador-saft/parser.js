/**
 * SAF-T XML Parser for Portugal (SAF-T PT)
 * Handles parsing SAF-T XML files client-side using browser's DOMParser.
 */
class SafTParser {
    /**
     * Parses SAF-T XML content and returns a structured JavaScript object.
     * @param {string} xmlString - The XML content of the SAF-T file.
     * @returns {Object} Parsed data.
     */
    static parse(xmlString) {
        const domParser = new DOMParser();
        const xmlDoc = domParser.parseFromString(xmlString, 'text/xml');

        // Check for XML parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Erro ao processar XML: ' + parserError.textContent);
        }

        const data = {
            header: {},
            customers: {},
            products: {},
            invoices: [],
            totals: {
                netSales: 0,
                grossSales: 0,
                taxAmount: 0,
                invoiceCount: 0,
                activeInvoiceCount: 0,
                cancelledInvoiceCount: 0
            },
            monthlySales: {}, // YYYY-MM -> Net Sales
            taxSales: {},     // Tax rate -> Net Sales
            vatSummary: {},   // DocumentType -> TaxCategory -> {incid, iva}
            auditAlerts: []
        };

        // 1. Parse Header
        this._parseHeader(xmlDoc, data);

        // 2. Parse Customers
        this._parseCustomers(xmlDoc, data);

        // 3. Parse Products
        this._parseProducts(xmlDoc, data);

        // 4. Parse Invoices and compile totals/charts data
        this._parseInvoices(xmlDoc, data);

        // 5. Run Audit checks
        this._runAudit(data);

        return data;
    }

    /**
     * Helper to get text content of a selector.
     */
    static _cleanText(text) {
        if (!text) return '';
        // Normalize Unicode, remove common corruption characters, collapse whitespace
        return text
            .normalize('NFKD')
            .replace(/\uFFFD/g, '') // remove replacement character �
            .replace(/\s+/g, ' ')
            .trim();
    }

    static _getText(parent, selector, defaultValue = '') {
        const el = parent.querySelector(selector);
        return el ? this._cleanText(el.textContent) : defaultValue;
    }

    /**
     * Helper to get float value.
     */
    static _getFloat(parent, selector, defaultValue = 0) {
        const text = this._getText(parent, selector);
        const parsed = parseFloat(text);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Parses Header information
     */
    static _parseHeader(xmlDoc, data) {
        const headerNode = xmlDoc.querySelector('Header');
        if (!headerNode) {
            data.auditAlerts.push({
                type: 'danger',
                message: 'O cabeçalho (Header) do SAF-T não foi encontrado.'
            });
            return;
        }

        data.header = {
            schemaVersion: this._getText(headerNode, 'AuditFileSchemaVersion'),
            companyName: this._getText(headerNode, 'CompanyName'),
            taxRegistrationNumber: this._getText(headerNode, 'TaxRegistrationNumber'),
            fiscalYear: this._getText(headerNode, 'FiscalYear'),
            startDate: this._getText(headerNode, 'StartDate'),
            endDate: this._getText(headerNode, 'EndDate'),
            currencyCode: this._getText(headerNode, 'CurrencyCode', 'EUR'),
            dateCreated: this._getText(headerNode, 'DateCreated'),
            address: {
                detail: this._getText(headerNode, 'CompanyAddress > AddressDetail'),
                city: this._getText(headerNode, 'CompanyAddress > City'),
                postalCode: this._getText(headerNode, 'CompanyAddress > PostalCode'),
                country: this._getText(headerNode, 'CompanyAddress > Country')
            }
        };
    }

    /**
     * Parses Customers
     */
    static _parseCustomers(xmlDoc, data) {
        const customerNodes = xmlDoc.querySelectorAll('MasterFiles > Customer');
        customerNodes.forEach(node => {
            const id = this._getText(node, 'CustomerID');
            const taxId = this._getText(node, 'CustomerTaxID');
            const companyName = this._getText(node, 'CompanyName');
            
            data.customers[id] = {
                id,
                taxId,
                companyName,
                addressDetail: this._getText(node, 'BillingAddress > AddressDetail'),
                city: this._getText(node, 'BillingAddress > City'),
                postalCode: this._getText(node, 'BillingAddress > PostalCode'),
                country: this._getText(node, 'BillingAddress > Country'),
                totalSpent: 0,
                invoiceCount: 0
            };
        });
    }

    /**
     * Parses Products
     */
    static _parseProducts(xmlDoc, data) {
        const productNodes = xmlDoc.querySelectorAll('MasterFiles > Product');
        productNodes.forEach(node => {
            const code = this._getText(node, 'ProductCode');
            data.products[code] = {
                code,
                group: this._getText(node, 'ProductGroup'),
                description: this._getText(node, 'ProductDescription'),
                totalQty: 0,
                totalSales: 0
            };
        });
    }

    /**
     * Parses Invoices
     */
    static _parseInvoices(xmlDoc, data) {
        const invoiceNodes = xmlDoc.querySelectorAll('SourceDocuments > SalesInvoices > Invoice');
        
        invoiceNodes.forEach(node => {
            const invoiceNo = this._getText(node, 'InvoiceNo');
            const invoiceType = this._getText(node, 'InvoiceType');
            const customerId = this._getText(node, 'CustomerID');
            const invoiceDate = this._getText(node, 'InvoiceDate');
            const status = this._getText(node, 'DocumentStatus > InvoiceStatus');
            
            const netTotal = this._getFloat(node, 'DocumentTotals > NetTotal');
            const grossTotal = this._getFloat(node, 'DocumentTotals > GrossTotal');
            const taxPayable = this._getFloat(node, 'DocumentTotals > TaxPayable');

            const isCancelled = status === 'A';

            const invoiceObj = {
                invoiceNo,
                invoiceType,
                customerId,
                customerName: data.customers[customerId]?.companyName || `Cliente #${customerId}`,
                customerTaxId: data.customers[customerId]?.taxId || 'N/A',
                invoiceDate,
                status, // 'N' = Normal, 'A' = Cancelado
                netTotal,
                grossTotal,
                taxPayable,
                lines: []
            };

            // Parse invoice lines
            const lineNodes = node.querySelectorAll('Line');
            lineNodes.forEach(lineNode => {
                const productCode = this._getText(lineNode, 'ProductCode');
                const quantity = this._getFloat(lineNode, 'Quantity');
                const unitPrice = this._getFloat(lineNode, 'UnitPrice');
                const creditAmt = this._getFloat(lineNode, 'CreditAmount');
                const debitAmt = this._getFloat(lineNode, 'DebitAmount');
                
                const lineNet = creditAmt || -debitAmt || (quantity * unitPrice);

                const taxPercentage = this._getFloat(lineNode, 'Tax > TaxPercentage');

                invoiceObj.lines.push({
                    lineNumber: this._getText(lineNode, 'LineNumber'),
                    productCode,
                    productDescription: this._getText(lineNode, 'ProductDescription') || data.products[productCode]?.description || productCode,
                    quantity,
                    unitPrice,
                    netTotal: lineNet,
                    taxPercentage
                });

                // Update product stats if document is active (not cancelled)
                if (!isCancelled && productCode) {
                    if (!data.products[productCode]) {
                        // Dynamically create product if not in MasterFiles
                        data.products[productCode] = {
                            code: productCode,
                            group: 'Desconhecido',
                            description: this._getText(lineNode, 'ProductDescription') || productCode,
                            totalQty: 0,
                            totalSales: 0
                        };
                    }
                    data.products[productCode].totalQty += quantity;
                    data.products[productCode].totalSales += lineNet;
                }

                // Agrupar no Resumo de IVA se o documento estiver ativo
                if (!isCancelled) {
                    const taxCode = this._getText(lineNode, 'Tax > TaxCode');
                    let lineTax = this._getFloat(lineNode, 'Tax > TaxAmount');
                    if (lineTax === 0 && taxPercentage > 0) {
                        lineTax = lineNet * (taxPercentage / 100);
                    }

                    let category = 'outros';
                    if (taxPercentage === 0 || taxCode === 'ISE') {
                        category = 'isento';
                    } else if (taxCode === 'RED' || taxPercentage === 6 || taxPercentage === 5 || taxPercentage === 4) {
                        category = 'reduzido';
                    } else if (taxCode === 'INT' || taxPercentage === 13 || taxPercentage === 12 || taxPercentage === 9) {
                        category = 'intermedio';
                    } else if (taxCode === 'NOR' || taxPercentage === 23 || taxPercentage === 22 || taxPercentage === 16) {
                        category = 'normal';
                    }

                    if (!data.vatSummary[invoiceType]) {
                        data.vatSummary[invoiceType] = {
                            isento: { incid: 0, iva: 0 },
                            reduzido: { incid: 0, iva: 0 },
                            intermedio: { incid: 0, iva: 0 },
                            normal: { incid: 0, iva: 0 },
                            outros: { incid: 0, iva: 0 }
                        };
                    }

                    data.vatSummary[invoiceType][category].incid += lineNet;
                    data.vatSummary[invoiceType][category].iva += lineTax;
                }
            });

            // Store invoice
            data.invoices.push(invoiceObj);

            // Accumulate metrics if not cancelled
            if (!isCancelled) {
                data.totals.netSales += netTotal;
                data.totals.grossSales += grossTotal;
                data.totals.taxAmount += taxPayable;
                data.totals.activeInvoiceCount++;

                // Customer stats
                if (data.customers[customerId]) {
                    data.customers[customerId].totalSpent += netTotal;
                    data.customers[customerId].invoiceCount++;
                }

                // Monthly sales mapping (YYYY-MM)
                if (invoiceDate && invoiceDate.length >= 7) {
                    const month = invoiceDate.substring(0, 7);
                    data.monthlySales[month] = (data.monthlySales[month] || 0) + netTotal;
                }

                // Tax sales mapping
                // For simplicity, aggregate based on document totals or lines
                invoiceObj.lines.forEach(l => {
                    const rateStr = `${l.taxPercentage}%`;
                    data.taxSales[rateStr] = (data.taxSales[rateStr] || 0) + l.netTotal;
                });
            } else {
                data.totals.cancelledInvoiceCount++;
            }

            data.totals.invoiceCount++;
        });

        // Sort invoices chronologically by date
        data.invoices.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
    }

    /**
     * Checks if a Portuguese NIF is valid using the control digit algorithm.
     */
    static isValidNIF(nif) {
        if (!nif) return false;
        nif = nif.trim();
        if (nif.length !== 9 || isNaN(parseInt(nif))) return false;
        
        // Portuguese NIFs start with specific numbers
        const validPrefixes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        if (!validPrefixes.includes(nif[0])) return false;

        let sum = 0;
        for (let i = 0; i < 8; i++) {
            sum += parseInt(nif[i]) * (9 - i);
        }
        
        const remainder = sum % 11;
        const controlDigit = remainder < 2 ? 0 : 11 - remainder;
        
        return controlDigit === parseInt(nif[8]);
    }

    /**
     * Performs tax & accounting audit verification.
     */
    static _runAudit(data) {
        // Audit 1: Verify Company NIF
        const compNif = data.header.taxRegistrationNumber;
        if (compNif && !this.isValidNIF(compNif)) {
            data.auditAlerts.push({
                type: 'warning',
                code: 'COMP_NIF_INVALID',
                message: `O NIF da empresa declarante (${compNif}) parece inválido segundo as regras portuguesas.`
            });
        }

        // Audit 2: Check Customer NIFs
        let invalidCustomerNifs = 0;
        Object.values(data.customers).forEach(c => {
            // NIF '999999990' is the standard consumer (consumidor final)
            if (c.taxId && c.taxId !== '999999990' && !this.isValidNIF(c.taxId)) {
                invalidCustomerNifs++;
            }
        });
        if (invalidCustomerNifs > 0) {
            data.auditAlerts.push({
                type: 'info',
                code: 'CUST_NIF_INVALID',
                message: `Foram encontrados ${invalidCustomerNifs} cliente(s) com NIFs inválidos ou incorretos (excluindo Consumidor Final).`
            });
        }

        // Audit 3: Check invoice numbering sequence
        // We group invoices by series (e.g. "FT A/") and check if there are gaps
        const seriesMap = {};
        data.invoices.forEach(inv => {
            const parts = inv.invoiceNo.split('/');
            if (parts.length === 2) {
                const series = parts[0];
                const number = parseInt(parts[1]);
                if (!isNaN(number)) {
                    if (!seriesMap[series]) {
                        seriesMap[series] = [];
                    }
                    seriesMap[series].push({ number, invoiceNo: inv.invoiceNo });
                }
            }
        });

        Object.keys(seriesMap).forEach(series => {
            const numbers = seriesMap[series].sort((a, b) => a.number - b.number);
            const gaps = [];
            for (let i = 0; i < numbers.length - 1; i++) {
                const current = numbers[i].number;
                const next = numbers[i+1].number;
                if (next > current + 1) {
                    for (let g = current + 1; g < next; g++) {
                        gaps.push(`${series}/${g}`);
                    }
                }
            }
            if (gaps.length > 0) {
                const gapDisplay = gaps.slice(0, 3).join(', ') + (gaps.length > 3 ? ` e mais ${gaps.length - 3}` : '');
                data.auditAlerts.push({
                    type: 'danger',
                    code: 'INVOICE_SEQUENCE_GAP',
                    message: `Salto detetado na sequência numérica da série ${series}. Faturas em falta: ${gapDisplay}.`
                });
            }
        });

        // Audit 4: Cancelled invoices check
        if (data.totals.cancelledInvoiceCount > 0) {
            data.auditAlerts.push({
                type: 'info',
                code: 'CANCELLED_INVOICES',
                message: `Este ficheiro contém ${data.totals.cancelledInvoiceCount} faturas canceladas (Estado 'A'), cujo valor foi excluído do volume de faturação.`
            });
        }

        // Audit 5: Check empty values or anomalies
        let anomalies = 0;
        data.invoices.forEach(inv => {
            if (inv.status !== 'A' && inv.grossTotal < 0) {
                anomalies++;
            }
        });
        if (anomalies > 0) {
            data.auditAlerts.push({
                type: 'warning',
                code: 'NEGATIVE_INVOICE',
                message: `Detetada(s) ${anomalies} fatura(s) ativa(s) com valor bruto negativo.`
            });
        }
    }
}
window.SafTParser = SafTParser;
