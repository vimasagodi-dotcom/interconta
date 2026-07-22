// Global State
let saftData = null;
let charts = {
    monthly: null,
    tax: null,
    customers: null,
    products: null
};

// UI Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadView = document.getElementById('upload-view');
const appSidebar = document.getElementById('app-sidebar');
const appHeader = document.getElementById('app-header');
const btnReload = document.getElementById('btn-reload');
const loadingOverlay = document.getElementById('loading-overlay');
const filenameDisplay = document.getElementById('filename-display');

// Nav Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Detail Drawer
const drawerBackdrop = document.getElementById('drawer-backdrop');
const invoiceDrawer = document.getElementById('invoice-drawer');
const drawerCloseBtn = document.getElementById('drawer-close-btn');

// Formatter Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// ----------------------------------------------------
// File Upload & Drag and Drop Handling
// ----------------------------------------------------
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

if (btnReload) {
    btnReload.addEventListener('click', () => {
        // Reset state & show upload view
        saftData = null;
        uploadView.style.display = 'flex';
        appSidebar.style.display = 'none';
        appHeader.style.display = 'none';
        fileInput.value = '';
        
        // Destroy old charts
        Object.keys(charts).forEach(key => {
            if (charts[key]) {
                charts[key].destroy();
                charts[key] = null;
            }
        });
    });
}

function handleFileSelect(file) {
    if (!file.name.endsWith('.xml')) {
        alert('Por favor, selecione um ficheiro XML SAF-T válido.');
        return;
    }

    // Show loading
    loadingOverlay.classList.add('active');
    document.getElementById('loading-text').textContent = `A ler ficheiro "${file.name}"...`;

    // Process file after a tiny delay so UI updates
    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                document.getElementById('loading-text').textContent = 'A interpretar dados do XML SAF-T...';
                
                // Parse XML
                const xmlText = e.target.result;
                saftData = SafTParser.parse(xmlText);
                
                // Update UI with parsed data
                filenameDisplay.textContent = file.name;
                updateUI(saftData);
                
                // Toggle view
                uploadView.style.display = 'none';
                appSidebar.style.display = 'flex';
                appHeader.style.display = 'flex';
                
                // Switch to dashboard tab initially
                switchTab('dashboard');
                
            } catch (err) {
                console.error(err);
                alert(`Erro ao ler o SAF-T: ${err.message}`);
            } finally {
                loadingOverlay.classList.remove('active');
            }
        };

        reader.onerror = function() {
            alert('Erro ao ler o ficheiro.');
            loadingOverlay.classList.remove('active');
        };

        reader.readAsText(file);
    }, 100);
}

// ----------------------------------------------------
// Tab Navigation Handling
// ----------------------------------------------------
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const tabName = item.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update menu highlight
    navItems.forEach(i => {
        if (i.getAttribute('data-tab') === tabName) {
            i.classList.add('active');
        } else {
            i.classList.remove('active');
        }
    });

    // Update tab visibility
    tabContents.forEach(c => {
        if (c.id === `tab-${tabName}`) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });

    // Update Header title
    const titles = {
        dashboard: 'Painel Geral',
        invoices: 'Explorador de Faturas',
        customers: 'Base de Clientes',
        products: 'Catálogo de Produtos',
        audit: 'Relatório de Auditoria',
        vat: 'Resumo de IVA'
    };
    document.getElementById('current-tab-title').textContent = titles[tabName] || 'Painel';

    // Trigger charts update if needed
    if (tabName === 'dashboard') {
        renderCharts(saftData);
    }
}

// ----------------------------------------------------
// Core UI Update
// ----------------------------------------------------
function updateUI(data) {
    // 1. Company Information
    document.getElementById('comp-name').textContent = data.header.companyName || 'Empresa Desconhecida';
    document.getElementById('comp-address').textContent = 
        `${data.header.address.detail || ''}, ${data.header.address.postalCode || ''} ${data.header.address.city || ''}, ${data.header.address.country || ''}`.trim() || 'Morada não definida';
    document.getElementById('comp-nif').textContent = data.header.taxRegistrationNumber || 'N/A';
    document.getElementById('comp-year').textContent = data.header.fiscalYear || 'N/A';
    document.getElementById('comp-period').textContent = `${formatDate(data.header.startDate)} a ${formatDate(data.header.endDate)}`;
    document.getElementById('comp-version').textContent = data.header.schemaVersion || 'N/A';

    // 2. KPI Cards
    document.getElementById('kpi-net-sales').textContent = formatCurrency(data.totals.netSales);
    document.getElementById('kpi-tax-amount').textContent = formatCurrency(data.totals.taxAmount);
    document.getElementById('kpi-gross-sales').textContent = formatCurrency(data.totals.grossSales);
    document.getElementById('kpi-invoice-count').textContent = data.totals.activeInvoiceCount;
    document.getElementById('kpi-cancelled-sub').textContent = `${data.totals.cancelledInvoiceCount} faturas canceladas`;

    // 3. Populate Search Filters & Listeners
    setupSearchFilters(data);

    // 4. Render Tables initially
    renderInvoicesList(data.invoices);
    renderCustomersList(Object.values(data.customers));
    renderProductsList(Object.values(data.products));
    renderAuditAlerts(data);
    renderVatSummary(data);

    // 5. Create Icons
    lucide.createIcons();
}

// ----------------------------------------------------
// Dynamic Search & Filtering Setup
// ----------------------------------------------------
function setupSearchFilters(data) {
    // Invoices filtering
    const invSearch = document.getElementById('invoice-search');
    const invType = document.getElementById('filter-invoice-type');
    const invStatus = document.getElementById('filter-invoice-status');

    const filterInvoices = () => {
        const query = invSearch.value.toLowerCase().trim();
        const type = invType.value;
        const status = invStatus.value;

        const filtered = data.invoices.filter(inv => {
            const matchesQuery = inv.invoiceNo.toLowerCase().includes(query) || 
                                 inv.customerName.toLowerCase().includes(query) || 
                                 inv.customerTaxId.includes(query);
            const matchesType = type === '' || inv.invoiceType === type;
            const matchesStatus = status === '' || inv.status === status;
            return matchesQuery && matchesType && matchesStatus;
        });

        renderInvoicesList(filtered);
    };

    invSearch.replaceWith(invSearch.cloneNode(true));
    invType.replaceWith(invType.cloneNode(true));
    invStatus.replaceWith(invStatus.cloneNode(true));

    document.getElementById('invoice-search').addEventListener('input', filterInvoices);
    document.getElementById('filter-invoice-type').addEventListener('change', filterInvoices);
    document.getElementById('filter-invoice-status').addEventListener('change', filterInvoices);

    // Customers filtering
    const custSearch = document.getElementById('customer-search');
    const filterCustomers = () => {
        const query = custSearch.value.toLowerCase().trim();
        const filtered = Object.values(data.customers).filter(c => {
            return c.companyName.toLowerCase().includes(query) || c.taxId.includes(query);
        });
        renderCustomersList(filtered);
    };
    custSearch.replaceWith(custSearch.cloneNode(true));
    document.getElementById('customer-search').addEventListener('input', filterCustomers);

    // Products filtering
    const prodSearch = document.getElementById('product-search');
    const filterProducts = () => {
        const query = prodSearch.value.toLowerCase().trim();
        const filtered = Object.values(data.products).filter(p => {
            return p.code.toLowerCase().includes(query) || p.description.toLowerCase().includes(query);
        });
        renderProductsList(filtered);
    };
    prodSearch.replaceWith(prodSearch.cloneNode(true));
    document.getElementById('product-search').addEventListener('input', filterProducts);
}

// ----------------------------------------------------
// Render Data Lists/Tables
// ----------------------------------------------------
function renderInvoicesList(invoices) {
    const tbody = document.querySelector('#invoices-table tbody');
    tbody.innerHTML = '';

    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhuma fatura encontrada.</td></tr>';
        return;
    }

    // Performance protection: limit rows to 500
    const limit = 500;
    const toRender = invoices.slice(0, limit);

    toRender.forEach(inv => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', () => openInvoiceDrawer(inv.invoiceNo));

        let badgeClass = 'badge-success';
        let statusText = 'Normal';
        if (inv.status === 'A') {
            badgeClass = 'badge-danger';
            statusText = 'Cancelada';
        } else if (inv.invoiceType === 'NC') {
            badgeClass = 'badge-warning';
            statusText = 'Crédito';
        }

        tr.innerHTML = `
            <td><strong>${inv.invoiceNo}</strong></td>
            <td>${formatDate(inv.invoiceDate)}</td>
            <td><div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${inv.customerName}</div></td>
            <td>${inv.customerTaxId}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
            <td style="text-align: right;">${formatCurrency(inv.netTotal)}</td>
            <td style="text-align: right;">${formatCurrency(inv.taxPayable)}</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(inv.grossTotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (invoices.length > limit) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="8" style="text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic;">A mostrar as primeiras ${limit} faturas de um total de ${invoices.length}. Por favor, refine a sua pesquisa para encontrar faturas específicas.</td>`;
        tbody.appendChild(tr);
    }
}

function renderCustomersList(customers) {
    const tbody = document.querySelector('#customers-table tbody');
    tbody.innerHTML = '';

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    // Sort by sales descending
    const sorted = [...customers].sort((a, b) => b.totalSpent - a.totalSpent);
    
    // Performance protection: limit to 200
    const limit = 200;
    const toRender = sorted.slice(0, limit);

    toRender.forEach(c => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'default';
        tr.innerHTML = `
            <td><code>${c.id}</code></td>
            <td><strong>${c.companyName}</strong></td>
            <td>${c.taxId}</td>
            <td>${c.city || 'N/A'}</td>
            <td style="text-align: center;">${c.invoiceCount}</td>
            <td style="text-align: right; font-weight: 600; color: var(--primary);">${formatCurrency(c.totalSpent)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (sorted.length > limit) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic;">A mostrar os primeiros ${limit} clientes de ${sorted.length} (ordenados por faturação).</td>`;
        tbody.appendChild(tr);
    }
}

function renderProductsList(products) {
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Nenhum artigo encontrado.</td></tr>';
        return;
    }

    // Sort by revenue descending
    const sorted = [...products].sort((a, b) => b.totalSales - a.totalSales);
    
    // Performance protection: limit to 200
    const limit = 200;
    const toRender = sorted.slice(0, limit);

    toRender.forEach(p => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'default';
        tr.innerHTML = `
            <td><code>${p.code}</code></td>
            <td><strong>${p.description}</strong></td>
            <td>${p.group || 'Geral'}</td>
            <td style="text-align: center;">${p.totalQty.toFixed(0)}</td>
            <td style="text-align: right; font-weight: 600; color: var(--secondary);">${formatCurrency(p.totalSales)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (sorted.length > limit) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic;">A mostrar os primeiros ${limit} produtos de ${sorted.length} (ordenados por receita).</td>`;
        tbody.appendChild(tr);
    }
}

function renderAuditAlerts(data) {
    const container = document.getElementById('audit-alerts-list');
    container.innerHTML = '';

    let dCount = 0, wCount = 0, iCount = 0;
    
    if (data.auditAlerts.length === 0) {
        container.innerHTML = `
            <div class="alert-item info" style="background-color: var(--success-glow); border-color: var(--success);">
                <div class="alert-item-icon" style="color: var(--success);"><i data-lucide="sparkles"></i></div>
                <div class="alert-item-body">
                    <h4 style="color: var(--success);">Excelente! Nenhuma inconsistência encontrada.</h4>
                    <p>O ficheiro SAF-T passou todas as validações estruturais e de integridade fiscal.</p>
                </div>
            </div>
        `;
        document.getElementById('audit-count-danger').textContent = '0';
        document.getElementById('audit-count-warning').textContent = '0';
        document.getElementById('audit-count-info').textContent = '0';
        lucide.createIcons();
        return;
    }

    data.auditAlerts.forEach(alert => {
        let icon = 'info';
        if (alert.type === 'danger') {
            dCount++;
            icon = 'alert-octagon';
        } else if (alert.type === 'warning') {
            wCount++;
            icon = 'alert-triangle';
        } else {
            iCount++;
            icon = 'info';
        }

        const div = document.createElement('div');
        div.className = `alert-item ${alert.type}`;
        div.innerHTML = `
            <div class="alert-item-icon"><i data-lucide="${icon}"></i></div>
            <div class="alert-item-body">
                <h4>${alert.type === 'danger' ? 'Inconsistência Crítica' : alert.type === 'warning' ? 'Aviso Fiscal' : 'Informação'}</h4>
                <p>${alert.message}</p>
            </div>
        `;
        container.appendChild(div);
    });

    document.getElementById('audit-count-danger').textContent = dCount;
    document.getElementById('audit-count-warning').textContent = wCount;
    document.getElementById('audit-count-info').textContent = iCount;
    
    lucide.createIcons();
}

// ----------------------------------------------------
// Details Drawer Functions
// ----------------------------------------------------
function openInvoiceDrawer(invoiceNo) {
    const inv = saftData.invoices.find(i => i.invoiceNo === invoiceNo);
    if (!inv) return;

    // Populate header details
    document.getElementById('drawer-invoice-no').textContent = inv.invoiceNo;
    document.getElementById('detail-date').textContent = formatDate(inv.invoiceDate);
    
    const docTypes = { FT: 'Fatura', FS: 'Fatura Simplificada', FR: 'Fatura-Recibo', NC: 'Nota de Crédito', ND: 'Nota de Débito' };
    document.getElementById('detail-type').textContent = docTypes[inv.invoiceType] || inv.invoiceType;
    document.getElementById('detail-customer-name').textContent = inv.customerName;
    document.getElementById('detail-customer-nif').textContent = inv.customerTaxId;

    const badge = document.getElementById('detail-status-badge');
    badge.className = 'badge';
    if (inv.status === 'A') {
        badge.classList.add('badge-danger');
        badge.textContent = 'Cancelada';
    } else {
        badge.classList.add('badge-success');
        badge.textContent = 'Ativa';
    }

    // Populate lines table
    const tbody = document.getElementById('drawer-lines-body');
    tbody.innerHTML = '';
    
    inv.lines.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${l.productDescription}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">Cód: ${l.productCode} | IVA: ${l.taxPercentage}%</div>
            </td>
            <td style="text-align: center;">${l.quantity.toFixed(0)}</td>
            <td style="text-align: right;">${formatCurrency(l.unitPrice)}</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(l.netTotal)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Populate totals
    document.getElementById('detail-net-total').textContent = formatCurrency(inv.netTotal);
    document.getElementById('detail-tax-total').textContent = formatCurrency(inv.taxPayable);
    document.getElementById('detail-gross-total').textContent = formatCurrency(inv.grossTotal);

    // Open animations
    drawerBackdrop.classList.add('open');
    invoiceDrawer.classList.add('open');
    lucide.createIcons();
}

function closeInvoiceDrawer() {
    drawerBackdrop.classList.remove('open');
    invoiceDrawer.classList.remove('open');
}

if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', closeInvoiceDrawer);
    drawerBackdrop.addEventListener('click', closeInvoiceDrawer);
}

// ----------------------------------------------------
// Chart.js Chart Rendering
// ----------------------------------------------------
function renderCharts(data) {
    // Use outfit styling
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.color = 'hsl(215, 20%, 65%)';
    Chart.defaults.borderColor = 'hsla(217, 32%, 18%, 0.3)';

    // 1. Monthly Sales Chart
    const monthlyCtx = document.getElementById('chart-monthly').getContext('2d');
    if (charts.monthly) charts.monthly.destroy();

    const monthlyLabels = Object.keys(data.monthlySales).sort();
    const monthlyValues = monthlyLabels.map(l => data.monthlySales[l]);

    const primaryGradient = monthlyCtx.createLinearGradient(0, 0, 0, 300);
    primaryGradient.addColorStop(0, 'hsla(190, 100%, 50%, 0.4)');
    primaryGradient.addColorStop(1, 'hsla(190, 100%, 50%, 0.02)');

    charts.monthly = new Chart(monthlyCtx, {
        type: 'line',
        data: {
            labels: monthlyLabels.map(l => {
                const parts = l.split('-');
                const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                return `${months[parseInt(parts[1])-1]} ${parts[0]}`;
            }),
            datasets: [{
                label: 'Volume Faturação',
                data: monthlyValues,
                borderColor: 'hsl(190, 100%, 50%)',
                backgroundColor: primaryGradient,
                fill: true,
                tension: 0.3,
                borderWidth: 2,
                pointBackgroundColor: 'hsl(190, 100%, 50%)',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Faturação: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });

    // 2. Tax Distribution Chart (Pie/Doughnut)
    const taxCtx = document.getElementById('chart-tax').getContext('2d');
    if (charts.tax) charts.tax.destroy();

    const taxLabels = Object.keys(data.taxSales);
    const taxValues = taxLabels.map(l => data.taxSales[l]);

    charts.tax = new Chart(taxCtx, {
        type: 'doughnut',
        data: {
            labels: taxLabels,
            datasets: [{
                data: taxValues,
                backgroundColor: [
                    'hsl(190, 100%, 50%)',
                    'hsl(270, 90%, 65%)',
                    'hsl(142, 70%, 50%)',
                    'hsl(45, 100%, 50%)',
                    'hsl(350, 85%, 60%)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 15 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Vendas: ${formatCurrency(ctx.parsed)}`
                    }
                }
            },
            cutout: '70%'
        }
    });

    // 3. Top Customers Chart (Horizontal Bar)
    const custCtx = document.getElementById('chart-top-customers').getContext('2d');
    if (charts.customers) charts.customers.destroy();

    const topCustomers = Object.values(data.customers)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5);

    charts.customers = new Chart(custCtx, {
        type: 'bar',
        data: {
            labels: topCustomers.map(c => c.companyName.substring(0, 20) + (c.companyName.length > 20 ? '...' : '')),
            datasets: [{
                data: topCustomers.map(c => c.totalSpent),
                backgroundColor: 'hsla(270, 90%, 65%, 0.75)',
                hoverBackgroundColor: 'hsl(270, 90%, 65%)',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Total Compras: ${formatCurrency(ctx.parsed.x)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });

    // 4. Top Products Chart (Horizontal Bar)
    const prodCtx = document.getElementById('chart-top-products').getContext('2d');
    if (charts.products) charts.products.destroy();

    const topProducts = Object.values(data.products)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 5);

    charts.products = new Chart(prodCtx, {
        type: 'bar',
        data: {
            labels: topProducts.map(p => p.description.substring(0, 20) + (p.description.length > 20 ? '...' : '')),
            datasets: [{
                data: topProducts.map(p => p.totalSales),
                backgroundColor: 'hsla(142, 70%, 50%, 0.75)',
                hoverBackgroundColor: 'hsl(142, 70%, 50%)',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Total Faturado: ${formatCurrency(ctx.parsed.x)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });
}

// ----------------------------------------------------
// VAT Summary Table Rendering
// ----------------------------------------------------
function renderVatSummary(data) {
    const tbody = document.querySelector('#vat-summary-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const docTypes = Object.keys(data.vatSummary).sort();
    
    // Running grand totals
    const grandTotals = {
        isento: { incid: 0, iva: 0 },
        reduzido: { incid: 0, iva: 0 },
        intermedio: { incid: 0, iva: 0 },
        normal: { incid: 0, iva: 0 },
        outros: { incid: 0, iva: 0 },
        total: { incid: 0, iva: 0 }
    };

    if (docTypes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: var(--text-muted);">Nenhum dado de IVA encontrado.</td></tr>';
        return;
    }

    // Helper to format table cells
    const formatCell = (val) => {
        if (val === 0) return '0,00';
        return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    docTypes.forEach(type => {
        const row = data.vatSummary[type];
        
        // Sum category values for row total
        const rowTotalIncid = row.isento.incid + row.reduzido.incid + row.intermedio.incid + row.normal.incid + row.outros.incid;
        const rowTotalIva = row.isento.iva + row.reduzido.iva + row.intermedio.iva + row.normal.iva + row.outros.iva;

        // Accumulate grand totals
        ['isento', 'reduzido', 'intermedio', 'normal', 'outros'].forEach(cat => {
            grandTotals[cat].incid += row[cat].incid;
            grandTotals[cat].iva += row[cat].iva;
        });
        grandTotals.total.incid += rowTotalIncid;
        grandTotals.total.iva += rowTotalIva;

        const tr = document.createElement('tr');
        tr.style.cursor = 'default';
        tr.innerHTML = `
            <td><strong>${type}</strong></td>
            <td style="text-align: right;">${formatCell(row.isento.incid)}</td>
            <td style="text-align: right;">${formatCell(row.isento.iva)}</td>
            <td style="text-align: right;">${formatCell(row.reduzido.incid)}</td>
            <td style="text-align: right;">${formatCell(row.reduzido.iva)}</td>
            <td style="text-align: right;">${formatCell(row.intermedio.incid)}</td>
            <td style="text-align: right;">${formatCell(row.intermedio.iva)}</td>
            <td style="text-align: right;">${formatCell(row.normal.incid)}</td>
            <td style="text-align: right;">${formatCell(row.normal.iva)}</td>
            <td style="text-align: right;">${formatCell(row.outros.incid)}</td>
            <td style="text-align: right;">${formatCell(row.outros.iva)}</td>
            <td style="text-align: right; background-color: rgba(255,255,255,0.02); font-weight: 500;">${formatCell(rowTotalIncid)}</td>
            <td style="text-align: right; background-color: rgba(255,255,255,0.02); font-weight: 500;">${formatCell(rowTotalIva)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Grand total row
    const trTotal = document.createElement('tr');
    trTotal.style.cursor = 'default';
    trTotal.style.backgroundColor = 'var(--bg-surface-elevated)';
    trTotal.style.fontWeight = 'bold';
    trTotal.style.borderTop = '2px solid var(--border-color)';
    trTotal.style.borderBottom = '2px solid var(--border-color)';
    
    trTotal.innerHTML = `
        <td>Total geral:</td>
        <td style="text-align: right;">${formatCell(grandTotals.isento.incid)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.isento.iva)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.reduzido.incid)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.reduzido.iva)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.intermedio.incid)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.intermedio.iva)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.normal.incid)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.normal.iva)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.outros.incid)}</td>
        <td style="text-align: right;">${formatCell(grandTotals.outros.iva)}</td>
        <td style="text-align: right; background-color: rgba(255,255,255,0.04); color: var(--primary);">${formatCell(grandTotals.total.incid)}</td>
        <td style="text-align: right; background-color: rgba(255,255,255,0.04); color: var(--primary);">${formatCell(grandTotals.total.iva)}</td>
    `;
    tbody.appendChild(trTotal);
}

// ----------------------------------------------------
// Print Functionality
// ----------------------------------------------------

/**
 * Opens a new print-friendly window containing the given table HTML.
 * @param {string} title - Title shown at top of the printed page.
 * @param {string} tableOuterHTML - The full HTML of the table element.
 * @param {string} subtitle - Optional subtitle/description line.
 */
function printTable(title, tableOuterHTML, subtitle = '') {
    const companyName = saftData?.header?.companyName || '';
    const period = saftData
        ? `${formatDate(saftData.header.startDate)} a ${formatDate(saftData.header.endDate)}`
        : '';

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    font-size: 11px;
                    color: #111;
                    padding: 24px 32px;
                    background: #fff;
                }
                .print-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 2px solid #222;
                    padding-bottom: 12px;
                    margin-bottom: 16px;
                }
                .print-header .left h1 {
                    font-size: 18px;
                    font-weight: 700;
                    color: #111;
                }
                .print-header .left p {
                    font-size: 12px;
                    color: #555;
                    margin-top: 2px;
                }
                .print-header .right {
                    text-align: right;
                    font-size: 11px;
                    color: #555;
                }
                .print-header .right strong {
                    display: block;
                    font-size: 13px;
                    color: #111;
                    font-weight: 600;
                }
                .subtitle {
                    font-size: 12px;
                    color: #555;
                    margin-bottom: 14px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                th {
                    background-color: #1a1a2e;
                    color: #fff;
                    padding: 7px 8px;
                    text-align: left;
                    font-weight: 600;
                    border: 1px solid #ccc;
                }
                td {
                    padding: 6px 8px;
                    border: 1px solid #ddd;
                    vertical-align: middle;
                }
                tr:nth-child(even) td { background-color: #f5f5f5; }
                tr:last-child td {
                    font-weight: 700;
                    background-color: #eef2ff !important;
                    border-top: 2px solid #aaa;
                }
                .print-footer {
                    margin-top: 20px;
                    font-size: 10px;
                    color: #888;
                    border-top: 1px solid #ddd;
                    padding-top: 8px;
                    display: flex;
                    justify-content: space-between;
                }
                @media print {
                    body { padding: 10px; }
                    button { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <div class="left">
                    <h1>${title}</h1>
                    <p>SAF-T Analyzer &mdash; Processamento 100% Local</p>
                </div>
                <div class="right">
                    <strong>${companyName}</strong>
                    <span>Período: ${period}</span>
                </div>
            </div>
            ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
            ${tableOuterHTML}
            <div class="print-footer">
                <span>Gerado em: ${new Date().toLocaleString('pt-PT')}</span>
                <span>Analisador SAF-T &mdash; Dados 100% processados localmente</span>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Wire up print buttons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // VAT print button
    const btnPrintVat = document.getElementById('print-vat');
    if (btnPrintVat) {
        btnPrintVat.addEventListener('click', () => {
            const table = document.getElementById('vat-summary-table');
            if (!table || !saftData) {
                alert('Carregue um ficheiro SAF-T primeiro.');
                return;
            }
            printTable(
                'Resumo de IVA por Tipo de Documento',
                table.outerHTML,
                'Valores de incidência e imposto (IVA) organizados por taxa de IVA e tipo de documento.'
            );
        });
    }

    // Products print button
    const btnPrintProducts = document.getElementById('print-products');
    if (btnPrintProducts) {
        btnPrintProducts.addEventListener('click', () => {
            const table = document.getElementById('products-table');
            if (!table || !saftData) {
                alert('Carregue um ficheiro SAF-T primeiro.');
                return;
            }
            printTable(
                'Listagem de Produtos / Artigos',
                table.outerHTML,
                'Lista de produtos com quantidade vendida e total faturado.'
            );
        });
    }
});
