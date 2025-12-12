// CONFIGURAÇÃO DA API
const API_KEY = '044de61c';
const API_URL = `https://api.hgbrasil.com/finance/stock_price?key=${API_KEY}&symbol=`;

// Banco de dados local com nomes das ações
const stockDatabase = {
    'PETR4': { name: 'Petrobras', color: '#2e5bff' },
    'VALE3': { name: 'Vale', color: '#00c853' },
    'ITUB4': { name: 'Itaú Unibanco', color: '#ff3d00' },
    'BBDC4': { name: 'Bradesco', color: '#ff9800' },
    'ABEV3': { name: 'Ambev', color: '#9c27b0' },
    'WEGE3': { name: 'WEG', color: '#00bcd4' },
    'MGLU3': { name: 'Magazine Luiza', color: '#e91e63' },
    'BBAS3': { name: 'Banco do Brasil', color: '#4caf50' },
    'B3SA3': { name: 'B3', color: '#ffc107' },
    'RENT3': { name: 'Localiza', color: '#3f51b5' }
};

// Carteira do usuário
let portfolio = JSON.parse(localStorage.getItem('financeel_portfolio')) || [];

// Elementos DOM
const stockCodeInput = document.getElementById('stockCode');
const stockQuantityInput = document.getElementById('stockQuantity');
const stockPriceInput = document.getElementById('stockPrice');
const addStockBtn = document.getElementById('addStockBtn');
const portfolioBody = document.getElementById('portfolioBody');
const totalPortfolioValue = document.getElementById('totalPortfolioValue');
const dailyChange = document.getElementById('dailyChange');
const refreshBtn = document.getElementById('refreshBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const portfolioChartCtx = document.getElementById('portfolioChart').getContext('2d');

// Gráfico e cache de preços
let portfolioChart = null;
let priceCache = JSON.parse(localStorage.getItem('price_cache')) || {};
let lastUpdate = localStorage.getItem('last_update') || '';

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    loadPortfolio();
    await updateAllPrices();
    updatePortfolioDisplay();
    updateChart();
    showLastUpdate();
});

// MOSTRAR ÚLTIMA ATUALIZAÇÃO
function showLastUpdate() {
    if (lastUpdate) {
        const now = new Date();
        const updateTime = new Date(lastUpdate);
        const diffMinutes = Math.floor((now - updateTime) / (1000 * 60));
        
        let timeText = '';
        if (diffMinutes < 1) timeText = 'agora mesmo';
        else if (diffMinutes < 60) timeText = `há ${diffMinutes} minutos`;
        else timeText = `há ${Math.floor(diffMinutes/60)} horas`;
        
        // Adicionar badge de atualização
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Atualizar (${timeText})`;
    }
}

// BUSCAR PREÇO REAL DA API
async function fetchStockPrice(stockCode) {
    try {
        console.log(`Buscando ${stockCode}...`);
        
        const response = await fetch(`${API_URL}${stockCode}`);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.results && data.results[stockCode]) {
            const result = data.results[stockCode];
            
            // Preço atual (prioridade: regular, então offer, então price)
            const price = result.regular_market_price || 
                         result.offer_price || 
                         result.price || 
                         0;
            
            // Nome completo se disponível
            const name = result.name || stockDatabase[stockCode]?.name || stockCode;
            
            // Atualizar cache
            priceCache[stockCode] = {
                price: price,
                name: name,
                updated: new Date().toISOString(),
                change: result.change_percent || 0
            };
            
            console.log(`${stockCode}: R$ ${price}`);
            return price;
        } else {
            console.warn(`Ação ${stockCode} não encontrada na API`);
            return null;
        }
    } catch (error) {
        console.error(`Erro ao buscar ${stockCode}:`, error);
        
        // Se falhar, usar cache ou valor padrão
        if (priceCache[stockCode]) {
            console.log(`Usando cache para ${stockCode}`);
            return priceCache[stockCode].price;
        }
        
        // Valor de fallback para demonstração
        const fallbackPrices = {
            'PETR4': 32.85, 'VALE3': 69.50, 'ITUB4': 33.25,
            'BBDC4': 14.30, 'ABEV3': 14.80, 'WEGE3': 36.90,
            'MGLU3': 2.18, 'BBAS3': 56.60, 'B3SA3': 11.25,
            'RENT3': 46.45
        };
        
        return fallbackPrices[stockCode] || 1.00;
    }
}

// ATUALIZAR TODOS OS PREÇOS
async function updateAllPrices() {
    showLoading(true);
    
    // Coletar todas as ações únicas (carteira + ações conhecidas)
    const allStocks = new Set([
        ...portfolio.map(item => item.code),
        ...Object.keys(stockDatabase)
    ]);
    
    const stockArray = Array.from(allStocks);
    
    // Atualizar em lote (a API HG Brasil aceita múltiplos símbolos)
    if (stockArray.length > 0) {
        try {
            const symbols = stockArray.join(',');
            const response = await fetch(`${API_URL}${symbols}`);
            const data = await response.json();
            
            if (data.results) {
                for (const [code, result] of Object.entries(data.results)) {
                    const price = result.regular_market_price || result.price || 0;
                    const name = result.name || stockDatabase[code]?.name || code;
                    
                    priceCache[code] = {
                        price: price,
                        name: name,
                        updated: new Date().toISOString(),
                        change: result.change_percent || 0
                    };
                    
                    // Atualizar nome no banco de dados local
                    if (stockDatabase[code]) {
                        stockDatabase[code].name = name;
                    }
                }
                
                // Salvar cache
                lastUpdate = new Date().toISOString();
                localStorage.setItem('price_cache', JSON.stringify(priceCache));
                localStorage.setItem('last_update', lastUpdate);
            }
        } catch (error) {
            console.error('Erro ao atualizar em lote:', error);
            // Se falhar, buscar uma por uma
            await updatePricesOneByOne(stockArray);
        }
    }
    
    showLoading(false);
    return true;
}

// ATUALIZAR PREÇOS UM POR UM (fallback)
async function updatePricesOneByOne(stockArray) {
    for (const code of stockArray) {
        await fetchStockPrice(code);
        // Esperar um pouco para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Salvar cache
    lastUpdate = new Date().toISOString();
    localStorage.setItem('price_cache', JSON.stringify(priceCache));
    localStorage.setItem('last_update', lastUpdate);
}

// MOSTRAR/OCULTAR CARREGAMENTO
function showLoading(show) {
    const refreshBtn = document.getElementById('refreshBtn');
    if (show) {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
        refreshBtn.disabled = true;
    } else {
        refreshBtn.disabled = false;
        showLastUpdate();
    }
}

// ADICIONAR AÇÃO À CARTEIRA
addStockBtn.addEventListener('click', async function() {
    const code = stockCodeInput.value.trim().toUpperCase();
    const quantity = parseInt(stockQuantityInput.value);
    const avgPrice = parseFloat(stockPriceInput.value) || null;
    
    if (!code || !quantity || quantity <= 0) {
        alert('Por favor, preencha o código e quantidade corretamente.');
        return;
    }
    
    // Buscar preço atual
    const currentPrice = await fetchStockPrice(code);
    
    if (!currentPrice || currentPrice <= 0) {
        alert(`Não foi possível obter o preço de ${code}. Verifique o código.`);
        return;
    }
    
    // Verificar se a ação já está na carteira
    const existingIndex = portfolio.findIndex(item => item.code === code);
    
    if (existingIndex >= 0) {
        // Atualizar quantidade e preço médio
        const existing = portfolio[existingIndex];
        const totalQuantity = existing.quantity + quantity;
        
        // Calcular novo preço médio ponderado
        if (avgPrice && existing.avgPrice) {
            const totalCost = (existing.quantity * existing.avgPrice) + (quantity * avgPrice);
            portfolio[existingIndex].avgPrice = totalCost / totalQuantity;
        } else if (avgPrice && !existing.avgPrice) {
            portfolio[existingIndex].avgPrice = avgPrice;
        }
        
        portfolio[existingIndex].quantity = totalQuantity;
        portfolio[existingIndex].name = priceCache[code]?.name || code;
    } else {
        // Adicionar nova ação
        const color = stockDatabase[code]?.color || getRandomColor();
        portfolio.push({
            code: code,
            name: priceCache[code]?.name || code,
            quantity: quantity,
            avgPrice: avgPrice,
            color: color
        });
    }
    
    // Limpar inputs
    stockCodeInput.value = '';
    stockQuantityInput.value = '100';
    stockPriceInput.value = '';
    stockCodeInput.focus();
    
    // Atualizar display e salvar
    updatePortfolioDisplay();
    savePortfolio();
    updateChart();
    
    // Feedback
    addStockBtn.innerHTML = '<i class="fas fa-check"></i> Adicionado!';
    setTimeout(() => {
        addStockBtn.innerHTML = '<i class="fas fa-plus"></i> Adicionar à Carteira';
    }, 1000);
});

// ATUALIZAR COTAÇÕES
refreshBtn.addEventListener('click', async function() {
    const success = await updateAllPrices();
    
    if (success) {
        updatePortfolioDisplay();
        updateChart();
        
        // Feedback visual
        refreshBtn.innerHTML = '<i class="fas fa-check"></i> Atualizado!';
        refreshBtn.classList.add('btn-primary');
        refreshBtn.classList.remove('btn-secondary');
        
        setTimeout(() => {
            refreshBtn.classList.remove('btn-primary');
            refreshBtn.classList.add('btn-secondary');
            showLastUpdate();
        }, 2000);
    } else {
        alert('Erro ao atualizar cotações. Verifique sua conexão.');
    }
});

// RESTANTE DO CÓDIGO PERMANECE IGUAL...
// (funções savePortfolio, loadPortfolio, updatePortfolioDisplay, 
// removeStock, updateChart, etc. - mantêm a mesma lógica)

// SALVAR CARTEIRA
function savePortfolio() {
    localStorage.setItem('financeel_portfolio', JSON.stringify(portfolio));
}

// CARREGAR CARTEIRA
function loadPortfolio() {
    const saved = localStorage.getItem('financeel_portfolio');
    if (saved) {
        portfolio = JSON.parse(saved);
    }
}

// ATUALIZAR EXIBIÇÃO DA CARTEIRA
function updatePortfolioDisplay() {
    portfolioBody.innerHTML = '';
    
    if (portfolio.length === 0) {
        portfolioBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <i class="fas fa-box-open"></i>
                    <p>Sua carteira está vazia. Adicione suas ações para começar!</p>
                </td>
            </tr>
        `;
        
        totalPortfolioValue.textContent = 'R$ 0,00';
        dailyChange.textContent = '+ R$ 0,00 (0.00%)';
        dailyChange.className = 'amount positive';
        return;
    }
    
    let totalValue = 0;
    let totalCost = 0;
    let totalChange = 0;
    
    portfolio.forEach((item, index) => {
        const cachedData = priceCache[item.code];
        const currentPrice = cachedData?.price || 0;
        const currentValue = item.quantity * currentPrice;
        const costBasis = item.avgPrice ? item.quantity * item.avgPrice : 0;
        const profit = item.avgPrice ? currentValue - costBasis : 0;
        const profitPercent = item.avgPrice && costBasis > 0 ? (profit / costBasis) * 100 : 0;
        
        totalValue += currentValue;
        totalCost += costBasis;
        totalChange += profit;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${item.code}</strong><br>
                <small>${item.name}</small>
                ${cachedData?.change ? `<br><small class="change-indicator ${cachedData.change >= 0 ? 'positive' : 'negative'}">
                    ${cachedData.change >= 0 ? '↗' : '↘'} ${Math.abs(cachedData.change).toFixed(2)}%
                </small>` : ''}
            </td>
            <td>${item.quantity.toLocaleString('pt-BR')}</td>
            <td>R$ ${currentPrice.toFixed(2).replace('.', ',')}</td>
            <td>${item.avgPrice ? 'R$ ' + (costBasis).toFixed(2).replace('.', ',') : 'N/A'}</td>
            <td><strong>R$ ${currentValue.toFixed(2).replace('.', ',')}</strong></td>
            <td class="variation-cell ${profit >= 0 ? 'positive' : 'negative'}">
                ${item.avgPrice ? 
                    `${profit >= 0 ? '+' : ''}R$ ${profit.toFixed(2).replace('.', ',')}<br>
                    <small>(${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)</small>` 
                    : 'N/A'}
            </td>
            <td>
                <button class="delete-btn" onclick="removeStock(${index})" title="Remover ação">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        portfolioBody.appendChild(row);
    });
    
    // Atualizar totais
    totalPortfolioValue.textContent = `R$ ${totalValue.toFixed(2).replace('.', ',')}`;
    
    const totalProfitPercent = totalCost > 0 ? ((totalChange / totalCost) * 100) : 0;
    dailyChange.textContent = `${totalChange >= 0 ? '+' : ''}R$ ${totalChange.toFixed(2).replace('.', ',')} (${totalChange >= 0 ? '+' : ''}${totalProfitPercent.toFixed(2)}%)`;
    dailyChange.className = `amount ${totalChange >= 0 ? 'positive' : 'negative'}`;
}

// REMOVER AÇÃO
function removeStock(index) {
    if (confirm(`Remover ${portfolio[index].code} da carteira?`)) {
        portfolio.splice(index, 1);
        updatePortfolioDisplay();
        savePortfolio();
        updateChart();
    }
}

// ATUALIZAR GRÁFICO
function updateChart() {
    if (portfolio.length === 0) {
        if (portfolioChart) {
            portfolioChart.destroy();
            portfolioChart = null;
        }
        document.getElementById('chartLegend').innerHTML = '<p class="empty-chart">Adicione ações para ver o gráfico de distribuição</p>';
        return;
    }
    
    const labels = portfolio.map(item => item.code);
    const data = portfolio.map(item => {
        const cachedData = priceCache[item.code];
        const currentPrice = cachedData?.price || 0;
        return item.quantity * currentPrice;
    });
    const colors = portfolio.map(item => item.color);
    const names = portfolio.map(item => item.name);
    
    // Atualizar legenda
    const legendHtml = portfolio.map((item, index) => `
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${colors[index]}"></div>
            <span class="legend-text">${item.code} - ${names[index]}</span>
        </div>
    `).join('');
    
    document.getElementById('chartLegend').innerHTML = legendHtml;
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    portfolioChart = new Chart(portfolioChartCtx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: 'white',
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// GERAR COR ALEATÓRIA
function getRandomColor() {
    const colors = [
        '#2e5bff', '#00c853', '#ff3d00', '#ff9800', '#9c27b0',
        '#00bcd4', '#e91e63', '#4caf50', '#ffc107', '#3f51b5',
        '#795548', '#607d8b', '#8bc34a', '#ff5722', '#009688'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// EVENTO ENTER NO CAMPO DE CÓDIGO
stockCodeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addStockBtn.click();
    }
});

// AUTO-SUGESTÃO
stockCodeInput.addEventListener('input', function() {
    const value = this.value.toUpperCase();
    if (value.length >= 2) {
        // Poderíamos implementar sugestões aqui
    }
});

//SEM OS VALORES REAIS

/*// Banco de dados de ações com preços simulados
const stockDatabase = {
    'PETR4': { name: 'Petrobras', price: 32.50, color: '#2e5bff' },
    'VALE3': { name: 'Vale', price: 68.90, color: '#00c853' },
    'ITUB4': { name: 'Itaú Unibanco', price: 33.10, color: '#ff3d00' },
    'BBDC4': { name: 'Bradesco', price: 14.25, color: '#ff9800' },
    'ABEV3': { name: 'Ambev', price: 14.80, color: '#9c27b0' },
    'WEGE3': { name: 'WEG', price: 36.75, color: '#00bcd4' },
    'MGLU3': { name: 'Magazine Luiza', price: 2.15, color: '#e91e63' },
    'BBAS3': { name: 'Banco do Brasil', price: 56.40, color: '#4caf50' },
    'B3SA3': { name: 'B3', price: 11.20, color: '#ffc107' },
    'RENT3': { name: 'Localiza', price: 46.30, color: '#3f51b5' }
};

// Carteira do usuário (armazenada no localStorage)
let portfolio = JSON.parse(localStorage.getItem('financeel_portfolio')) || [];

// Elementos DOM
const stockCodeInput = document.getElementById('stockCode');
const stockQuantityInput = document.getElementById('stockQuantity');
const stockPriceInput = document.getElementById('stockPrice');
const addStockBtn = document.getElementById('addStockBtn');
const portfolioBody = document.getElementById('portfolioBody');
const totalPortfolioValue = document.getElementById('totalPortfolioValue');
const dailyChange = document.getElementById('dailyChange');
const refreshBtn = document.getElementById('refreshBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const portfolioChartCtx = document.getElementById('portfolioChart').getContext('2d');

// Gráfico
let portfolioChart = null;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    loadPortfolio();
    updatePortfolioDisplay();
    updateChart();
    
    // Simular variação de preços (para demonstração)
    simulatePriceChanges();
});

// Adicionar ação à carteira
addStockBtn.addEventListener('click', function() {
    const code = stockCodeInput.value.trim().toUpperCase();
    const quantity = parseInt(stockQuantityInput.value);
    const avgPrice = parseFloat(stockPriceInput.value) || null;
    
    if (!code || !quantity || quantity <= 0) {
        alert('Por favor, preencha o código e quantidade corretamente.');
        return;
    }
    
    // Verificar se a ação existe no banco de dados
    if (!stockDatabase[code]) {
        // Se não existir, criar uma entrada com preço aleatório
        const randomPrice = (Math.random() * 100 + 10).toFixed(2);
        stockDatabase[code] = { 
            name: code, 
            price: parseFloat(randomPrice), 
            color: getRandomColor() 
        };
    }
    
    // Verificar se a ação já está na carteira
    const existingIndex = portfolio.findIndex(item => item.code === code);
    
    if (existingIndex >= 0) {
        // Atualizar quantidade e preço médio se existir
        const existing = portfolio[existingIndex];
        const totalQuantity = existing.quantity + quantity;
        
        // Calcular novo preço médio ponderado
        if (avgPrice && existing.avgPrice) {
            const totalCost = (existing.quantity * existing.avgPrice) + (quantity * avgPrice);
            portfolio[existingIndex].avgPrice = totalCost / totalQuantity;
        } else if (avgPrice && !existing.avgPrice) {
            portfolio[existingIndex].avgPrice = avgPrice;
        }
        
        portfolio[existingIndex].quantity = totalQuantity;
    } else {
        // Adicionar nova ação
        portfolio.push({
            code: code,
            name: stockDatabase[code].name,
            quantity: quantity,
            avgPrice: avgPrice,
            color: stockDatabase[code].color
        });
    }
    
    // Limpar inputs
    stockCodeInput.value = '';
    stockQuantityInput.value = '100';
    stockPriceInput.value = '';
    
    // Atualizar display e salvar
    updatePortfolioDisplay();
    savePortfolio();
    updateChart();
});

// Atualizar cotações
refreshBtn.addEventListener('click', function() {
    simulatePriceChanges();
    updatePortfolioDisplay();
    updateChart();
    
    // Feedback visual
    refreshBtn.innerHTML = '<i class="fas fa-check"></i> Cotações Atualizadas!';
    refreshBtn.classList.add('btn-primary');
    refreshBtn.classList.remove('btn-secondary');
    
    setTimeout(() => {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Cotações';
        refreshBtn.classList.remove('btn-primary');
        refreshBtn.classList.add('btn-secondary');
    }, 2000);
});

// Salvar carteira
saveBtn.addEventListener('click', function() {
    savePortfolio();
    
    // Feedback visual
    saveBtn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
    setTimeout(() => {
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Carteira';
    }, 1500);
});

// Limpar carteira
clearBtn.addEventListener('click', function() {
    if (confirm('Tem certeza que deseja limpar toda a carteira? Esta ação não pode ser desfeita.')) {
        portfolio = [];
        updatePortfolioDisplay();
        savePortfolio();
        updateChart();
    }
});

// Função para atualizar a exibição da carteira
function updatePortfolioDisplay() {
    // Limpar tabela
    portfolioBody.innerHTML = '';
    
    if (portfolio.length === 0) {
        // Mostrar mensagem de carteira vazia
        portfolioBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <i class="fas fa-box-open"></i>
                    <p>Sua carteira está vazia. Adicione suas ações para começar!</p>
                </td>
            </tr>
        `;
        
        totalPortfolioValue.textContent = 'R$ 0,00';
        dailyChange.textContent = '+ R$ 0,00 (0.00%)';
        dailyChange.className = 'amount positive';
        return;
    }
    
    let totalValue = 0;
    let totalCost = 0;
    let totalChange = 0;
    
    // Adicionar cada ação à tabela
    portfolio.forEach((item, index) => {
        const stockInfo = stockDatabase[item.code] || { price: 0, name: item.code, color: '#ccc' };
        const currentPrice = stockInfo.price;
        const currentValue = item.quantity * currentPrice;
        const costBasis = item.avgPrice ? item.quantity * item.avgPrice : 0;
        const profit = item.avgPrice ? currentValue - costBasis : 0;
        const profitPercent = item.avgPrice ? (profit / costBasis) * 100 : 0;
        
        totalValue += currentValue;
        totalCost += costBasis;
        totalChange += profit;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${item.code}</strong><br>
                <small>${stockInfo.name}</small>
            </td>
            <td>${item.quantity.toLocaleString('pt-BR')}</td>
            <td>R$ ${currentPrice.toFixed(2).replace('.', ',')}</td>
            <td>${item.avgPrice ? 'R$ ' + (costBasis).toFixed(2).replace('.', ',') : 'N/A'}</td>
            <td><strong>R$ ${currentValue.toFixed(2).replace('.', ',')}</strong></td>
            <td class="variation-cell ${profit >= 0 ? 'positive' : 'negative'}">
                ${item.avgPrice ? 
                    `${profit >= 0 ? '+' : ''}R$ ${profit.toFixed(2).replace('.', ',')}<br>
                    <small>(${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%)</small>` 
                    : 'N/A'}
            </td>
            <td>
                <button class="delete-btn" onclick="removeStock(${index})" title="Remover ação">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        portfolioBody.appendChild(row);
    });
    
    // Atualizar totais
    totalPortfolioValue.textContent = `R$ ${totalValue.toFixed(2).replace('.', ',')}`;
    
    const totalProfitPercent = totalCost > 0 ? ((totalChange / totalCost) * 100) : 0;
    dailyChange.textContent = `${totalChange >= 0 ? '+' : ''}R$ ${totalChange.toFixed(2).replace('.', ',')} (${totalChange >= 0 ? '+' : ''}${totalProfitPercent.toFixed(2)}%)`;
    dailyChange.className = `amount ${totalChange >= 0 ? 'positive' : 'negative'}`;
}

// Função para remover uma ação
function removeStock(index) {
    if (confirm(`Remover ${portfolio[index].code} da carteira?`)) {
        portfolio.splice(index, 1);
        updatePortfolioDisplay();
        savePortfolio();
        updateChart();
    }
}

// Função para salvar a carteira no localStorage
function savePortfolio() {
    localStorage.setItem('financeel_portfolio', JSON.stringify(portfolio));
}

// Função para carregar a carteira do localStorage
function loadPortfolio() {
    const saved = localStorage.getItem('financeel_portfolio');
    if (saved) {
        portfolio = JSON.parse(saved);
    }
}

// Função para simular mudanças de preço (para demonstração)
function simulatePriceChanges() {
    for (const code in stockDatabase) {
        // Alteração aleatória entre -3% e +3%
        const changePercent = (Math.random() * 6 - 3) / 100;
        stockDatabase[code].price = Math.max(0.01, stockDatabase[code].price * (1 + changePercent));
    }
}

// Função para atualizar o gráfico
function updateChart() {
    if (portfolio.length === 0) {
        // Destruir gráfico se existir
        if (portfolioChart) {
            portfolioChart.destroy();
            portfolioChart = null;
        }
        
        // Limpar legenda
        document.getElementById('chartLegend').innerHTML = '<p class="empty-chart">Adicione ações para ver o gráfico de distribuição</p>';
        return;
    }
    
    // Preparar dados para o gráfico
    const labels = portfolio.map(item => item.code);
    const data = portfolio.map(item => {
        const stockInfo = stockDatabase[item.code] || { price: 0 };
        return item.quantity * stockInfo.price;
    });
    const colors = portfolio.map(item => item.color);
    const names = portfolio.map(item => item.name);
    
    // Atualizar legenda
    const legendHtml = portfolio.map((item, index) => `
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${colors[index]}"></div>
            <span class="legend-text">${item.code} - ${names[index]}</span>
        </div>
    `).join('');
    
    document.getElementById('chartLegend').innerHTML = legendHtml;
    
    // Destruir gráfico anterior se existir
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    // Criar novo gráfico
    portfolioChart = new Chart(portfolioChartCtx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: 'white',
                borderWidth: 2,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Usamos nossa própria legenda
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: R$ ${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Função para gerar cores aleatórias
function getRandomColor() {
    const colors = [
        '#2e5bff', '#00c853', '#ff3d00', '#ff9800', '#9c27b0',
        '#00bcd4', '#e91e63', '#4caf50', '#ffc107', '#3f51b5',
        '#795548', '#607d8b', '#8bc34a', '#ff5722', '#009688'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Permitir pressionar Enter para adicionar ação
stockCodeInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addStockBtn.click();
    }
});

// Auto-completar sugestões de ações
stockCodeInput.addEventListener('input', function() {
    const value = this.value.toUpperCase();
    if (value.length >= 2) {
        // Aqui você poderia implementar sugestões em tempo real
    }
});*/
