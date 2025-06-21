// Configuration
const DEV_MODE = false; // Set to false for production
const LOCAL_API_URL = 'http://127.0.0.1:8000/api/v1';
const PROD_API_URL = 'https://netbargains-1fbe06becf08.herokuapp.com/api/v1';
const API_BASE_URL = DEV_MODE ? LOCAL_API_URL : PROD_API_URL;

// State
let currentTab = 'latest';
let currentPlans = [];
let allProviders = [];
let currentPage = 1;
let pageSize = 20;
let totalPlans = 0;
let isLoading = false;
let currentFilters = {};
let sortColumn = 'monthly_price';
let sortDirection = 'asc';

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const noResultsEl = document.getElementById('no-results');
const plansContainer = document.getElementById('plans-container');
const providerFilter = document.getElementById('provider-filter');
const speedFilter = document.getElementById('speed-filter');
const priceFilter = document.getElementById('price-filter');
const contractFilter = document.getElementById('contract-filter');
const wirelessFilter = document.getElementById('wireless-filter');
const dataFilter = document.getElementById('data-filter');
const minDownloadFilter = document.getElementById('min-download-filter');
const maxDownloadFilter = document.getElementById('max-download-filter');
const minUploadFilter = document.getElementById('min-upload-filter');
const firstBtn = document.getElementById('first-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const lastBtn = document.getElementById('last-btn');
const pageInfo = document.getElementById('page-info');
const pageSizeSelect = document.getElementById('page-size');
const toggleFiltersBtn = document.getElementById('toggle-filters');
const filterContainer = document.getElementById('filter-container');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    showDevModeIndicator();
    loadFilterPreferences();
    await loadProviders();
    await loadPlans();
});

// Show dev mode indicator
function showDevModeIndicator() {
    if (DEV_MODE) {
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            background: #ff6600;
            color: white;
            padding: 4px 8px;
            font-size: 10px;
            font-family: monospace;
            z-index: 9999;
            border-bottom-left-radius: 3px;
        `;
        indicator.textContent = 'DEV MODE - Local API';
        document.body.appendChild(indicator);
        console.log('🔧 Development Mode: Using local API at', LOCAL_API_URL);
    } else {
        console.log('🚀 Production Mode: Using deployed API at', PROD_API_URL);
    }
}

// Event Listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentTab = e.target.dataset.tab;
            currentPage = 1;
            totalPlans = 0;
            updateActiveTab();
            loadPlans();
        });
    });

    // Filter controls
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('retry-btn').addEventListener('click', loadPlans);

    // Pagination controls
    firstBtn.addEventListener('click', () => goToPage(1));
    prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
    lastBtn.addEventListener('click', () => goToPage(getTotalPages()));
    pageSizeSelect.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        loadPlans();
    });

    // Enter key on price filter
    priceFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    // Column sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const column = header.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            sortPlans();
            renderPlans(currentPlans);
            updateSortIcons();
        });
    });

    // Filter toggle
    toggleFiltersBtn.addEventListener('click', () => {
        const isExpanded = toggleFiltersBtn.getAttribute('aria-expanded') === 'true';
        const newExpanded = !isExpanded;

        toggleFiltersBtn.setAttribute('aria-expanded', newExpanded.toString());

        if (newExpanded) {
            filterContainer.classList.remove('collapsed');
            toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▼</span> Hide Filters';
        } else {
            filterContainer.classList.add('collapsed');
            toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▶</span> Show Filters';
        }

        // Save preference to localStorage
        localStorage.setItem('filtersExpanded', newExpanded.toString());
    });
}

// Load filter preferences from localStorage
function loadFilterPreferences() {
    const filtersExpanded = localStorage.getItem('filtersExpanded');

    // Default to expanded (true) if no preference is stored
    if (filtersExpanded === 'false') {
        filterContainer.classList.add('collapsed');
        toggleFiltersBtn.setAttribute('aria-expanded', 'false');
        toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▶</span> Show Filters';
    }
}

// Update active tab styling
function updateActiveTab() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === currentTab) {
            btn.classList.add('active');
        }
    });
}

// Load providers for filter dropdown
async function loadProviders() {
    try {
        const response = await fetch(`${API_BASE_URL}/providers/`);
        if (!response.ok) throw new Error('Failed to load providers');

        allProviders = await response.json();
        populateProviderFilter();
    } catch (error) {
        console.error('Error loading providers:', error);
    }
}

// Populate provider filter dropdown
function populateProviderFilter() {
    providerFilter.innerHTML = '<option value="">All Providers</option>';
    allProviders.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        providerFilter.appendChild(option);
    });
}

// Build URL with filters
function buildApiUrl() {
    const endpoint = currentTab === 'deals' ? '/plans/deals' : '/plans/latest';
    const skip = (currentPage - 1) * pageSize;

    const params = new URLSearchParams({
        skip: skip.toString(),
        limit: pageSize.toString()
    });

    // Add filters
    if (currentFilters.provider_id) {
        params.append('provider_id', currentFilters.provider_id);
    }
    if (currentFilters.speed) {
        params.append('speed', currentFilters.speed);
    }
    if (currentFilters.max_price) {
        params.append('max_price', currentFilters.max_price);
    }
    if (currentFilters.contract_length !== undefined) {
        params.append('contract_length', currentFilters.contract_length);
    }
    if (currentFilters.fixed_wireless !== undefined) {
        params.append('fixed_wireless', currentFilters.fixed_wireless);
    }
    if (currentFilters.unlimited_data !== undefined) {
        params.append('unlimited_data', currentFilters.unlimited_data);
    }
    if (currentFilters.min_download_speed) {
        params.append('min_download_speed', currentFilters.min_download_speed);
    }
    if (currentFilters.max_download_speed) {
        params.append('max_download_speed', currentFilters.max_download_speed);
    }
    if (currentFilters.min_upload_speed) {
        params.append('min_upload_speed', currentFilters.min_upload_speed);
    }

    return `${API_BASE_URL}${endpoint}?${params.toString()}`;
}

// Load plans based on current tab and page
async function loadPlans() {
    if (isLoading) return;

    // Show loading state without clearing table for pagination
    if (currentPage === 1 || currentPlans.length === 0) {
        showLoading();
        plansContainer.innerHTML = '';
    } else {
        showTableLoadingOverlay();
    }
    hideError();
    hideNoResults();

    isLoading = true;

    try {
        const url = buildApiUrl();
        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to load plans');

        currentPlans = await response.json();

        // Estimate total count (this is a limitation without backend total count)
        // If we get fewer than pageSize, we're on the last page
        if (currentPlans.length < pageSize) {
            totalPlans = ((currentPage - 1) * pageSize) + currentPlans.length;
        } else {
            // We don't know the exact total, so estimate based on current page
            totalPlans = Math.max(totalPlans, (currentPage * pageSize) + 1);
        }

        sortPlans();
        renderPlans(currentPlans);
        updatePaginationControls();
        updateSortIcons();
        hideLoading();
        hideTableLoadingOverlay();

        if (currentPlans.length === 0) {
            showNoResults();
        }
    } catch (error) {
        console.error('Error loading plans:', error);
        hideLoading();
        showError();
    } finally {
        isLoading = false;
    }
}

// Navigate to specific page
async function goToPage(page) {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        await loadPlans();
    }
}

// Get total number of pages
function getTotalPages() {
    return Math.max(1, Math.ceil(totalPlans / pageSize));
}

// Sort plans client-side
function sortPlans() {
    currentPlans.sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = sortDirection === 'asc' ? Infinity : -Infinity;
        if (bValue === null || bValue === undefined) bValue = sortDirection === 'asc' ? Infinity : -Infinity;

        // String comparison for text fields
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }

        if (sortDirection === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
    });
}

// Update sort icons
function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = '';
    });

    const activeHeader = document.querySelector(`[data-sort="${sortColumn}"] .sort-icon`);
    if (activeHeader) {
        activeHeader.textContent = sortDirection === 'asc' ? '▲' : '▼';
    }
}

// Apply filters and reload data from server
function applyFilters() {
    const providerId = providerFilter.value;
    const speed = speedFilter.value;
    const maxPrice = priceFilter.value;
    const contractLength = contractFilter.value;
    const fixedWireless = wirelessFilter.value;
    const dataLimit = dataFilter.value;
    const minDownload = minDownloadFilter.value;
    const maxDownload = maxDownloadFilter.value;
    const minUpload = minUploadFilter.value;

    // Build filters object
    currentFilters = {};

    if (providerId) {
        currentFilters.provider_id = providerId;
    }

    if (speed) {
        // Now using exact speed match instead of ranges
        currentFilters.speed = parseInt(speed);
    }

    if (maxPrice) {
        currentFilters.max_price = parseFloat(maxPrice);
    }

    if (contractLength !== '') {
        currentFilters.contract_length = parseInt(contractLength);
    }

    if (fixedWireless) {
        currentFilters.fixed_wireless = fixedWireless === 'true';
    }

    if (dataLimit === 'unlimited') {
        currentFilters.unlimited_data = true;
    }

    if (minDownload) {
        currentFilters.min_download_speed = parseInt(minDownload);
    }

    if (maxDownload) {
        currentFilters.max_download_speed = parseInt(maxDownload);
    }

    if (minUpload) {
        currentFilters.min_upload_speed = parseInt(minUpload);
    }

    // Reset to first page and reload data
    currentPage = 1;
    totalPlans = 0;
    loadPlans();
}

// Clear all filters
function clearFilters() {
    providerFilter.value = '';
    speedFilter.value = '';
    priceFilter.value = '';
    contractFilter.value = '';
    wirelessFilter.value = '';
    dataFilter.value = '';
    minDownloadFilter.value = '';
    maxDownloadFilter.value = '';
    minUploadFilter.value = '';
    currentFilters = {};
    currentPage = 1;
    totalPlans = 0;
    loadPlans();
}

// Update pagination controls
function updatePaginationControls() {
    const totalPages = getTotalPages();

    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${currentPlans.length} plans shown)`;

    firstBtn.disabled = currentPage <= 1;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages || currentPlans.length < pageSize;
    lastBtn.disabled = currentPage >= totalPages || currentPlans.length < pageSize;
}

// Show table loading overlay
function showTableLoadingOverlay() {
    const tableContainer = document.querySelector('.plans-table-container');
    let overlay = document.getElementById('table-loading-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'table-loading-overlay';
        overlay.innerHTML = `
            <div class="table-loading-content">
                <div class="table-loading-spinner"></div>
                <span>Loading...</span>
            </div>
        `;
        tableContainer.style.position = 'relative';
        tableContainer.appendChild(overlay);
    }

    overlay.style.display = 'flex';
}

function hideTableLoadingOverlay() {
    const overlay = document.getElementById('table-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Render plans in the table
function renderPlans(plans) {
    plansContainer.innerHTML = plans.map(plan => createPlanRow(plan)).join('');
}

// Create a plan table row HTML
function createPlanRow(plan) {
    const hasPromo = plan.promo_value && plan.promo_type;
    const isDeals = currentTab === 'deals';
    const rowClass = isDeals ? 'deal-row' : '';

    // Create provider cell with link if website is available
    const providerCell = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="provider-link">${plan.provider_name || 'Unknown'}</a>`
        : (plan.provider_name || 'Unknown');

    return `
        <tr class="${rowClass}">
            <td class="provider-cell">${providerCell}</td>
            <td class="plan-cell" title="${plan.plan_name}">${plan.plan_name}</td>
            <td class="speed-cell">${formatSpeed(plan)}</td>
            <td class="price-cell">$${plan.monthly_price.toFixed(2)}</td>
            <td class="promo-cell ${hasPromo ? '' : 'no-promo'}">
                ${hasPromo ? formatPromotion(plan) : '-'}
            </td>
            <td class="contract-cell">${plan.contract_length ? `${plan.contract_length}mo` : 'No lock'}</td>
            <td class="setup-cell ${plan.setup_fee > 0 ? 'has-fee' : ''}">
                ${plan.setup_fee > 0 ? `$${plan.setup_fee.toFixed(2)}` : 'Free'}
            </td>
            <td class="data-cell">${plan.data_limit || 'Unlimited'}</td>
        </tr>
    `;
}

// Format speed display
function formatSpeed(plan) {
    if (plan.speed_tier) {
        return plan.speed_tier;
    }
    if (plan.download_speed && plan.upload_speed) {
        return `${plan.download_speed}/${plan.upload_speed}`;
    }
    if (plan.download_speed) {
        return `${plan.download_speed} Mbps`;
    }
    return 'N/A';
}

// Format promotion text
function formatPromotion(plan) {
    if (!plan.promo_value || !plan.promo_type) return '';

    switch (plan.promo_type.toLowerCase()) {
        case 'discount':
            return `$${plan.promo_value} off ${plan.promo_duration ? `${plan.promo_duration}mo` : ''}`;
        case 'free_months':
            return `${plan.promo_value} months free`;
        default:
            return `${plan.promo_type}`;
    }
}

// UI State Management
function showLoading() {
    loadingEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

function showError() {
    errorEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideError() {
    errorEl.classList.add('hidden');
}

function showNoResults() {
    noResultsEl.classList.remove('hidden');
    plansContainer.innerHTML = '';
}

function hideNoResults() {
    noResultsEl.classList.add('hidden');
}

// Utility function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
    }).format(amount);
}