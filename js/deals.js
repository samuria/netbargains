// Configuration
const DEV_MODE = false; // Set to false for production
const LOCAL_API_URL = 'http://127.0.0.1:8000/api/v1';
const PROD_API_URL = 'https://netbargains-1fbe06becf08.herokuapp.com/api/v1';
const API_BASE_URL = DEV_MODE ? LOCAL_API_URL : PROD_API_URL;

// State
let currentPlans = [];
let allProviders = [];
let currentPage = 1;
let pageSize = 20;
let totalPlans = 0;
let isLoading = false;
let currentFilters = {};
let sortColumn = 'total_savings';
let sortDirection = 'desc';

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const noResultsEl = document.getElementById('no-results');
const plansContainer = document.getElementById('plans-container');
const providerFilter = document.getElementById('provider-filter');
const speedFilter = document.getElementById('speed-filter');
const priceFilter = document.getElementById('price-filter');
const promoTypeFilter = document.getElementById('promo-type-filter');
const minSavingsFilter = document.getElementById('min-savings-filter');
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
    await loadDeals();
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
    // Filter controls
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('retry-btn').addEventListener('click', loadDeals);

    // Pagination controls
    firstBtn.addEventListener('click', () => goToPage(1));
    prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
    nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
    lastBtn.addEventListener('click', () => goToPage(getTotalPages()));
    pageSizeSelect.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        loadDeals();
    });

    // Enter key on price filter
    priceFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    minSavingsFilter.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    // Column sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = column === 'total_savings' ? 'desc' : 'asc';
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

        localStorage.setItem('dealsFiltersExpanded', newExpanded.toString());
    });
}

// Load filter preferences from localStorage
function loadFilterPreferences() {
    const filtersExpanded = localStorage.getItem('dealsFiltersExpanded');
    const isMobile = window.innerWidth <= 768;

    // Default to collapsed on mobile, expanded on desktop
    const defaultExpanded = !isMobile;

    // Use stored preference if available, otherwise use default
    const shouldExpand = filtersExpanded !== null ? filtersExpanded === 'true' : defaultExpanded;

    if (!shouldExpand) {
        filterContainer.classList.add('collapsed');
        toggleFiltersBtn.setAttribute('aria-expanded', 'false');
        toggleFiltersBtn.innerHTML = '<span class="toggle-icon">▶</span> Show Filters';
    }
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

    return `${API_BASE_URL}/plans/deals?${params.toString()}`;
}

// Load deals
async function loadDeals() {
    if (isLoading) return;

    isLoading = true;

    // Only show loading and clear content if we don't have static content
    const hasStaticContent = document.querySelectorAll('.static-content').length > 0;

    if (!hasStaticContent) {
        if (currentPage === 1 || currentPlans.length === 0) {
            showLoading();
            plansContainer.innerHTML = '';
        } else {
            showTableLoadingOverlay();
        }
    }

    hideError();
    hideNoResults();

    try {
        const url = buildApiUrl();
        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to load deals');

        const responseData = await response.json();

        // Extract data from paginated response
        let allDeals = responseData.items;
        totalPlans = responseData.total;

        // Calculate total savings and promo price for each plan if not provided by API
        allDeals.forEach(plan => {
            if (!plan.total_savings && plan.promo_value) {
                plan.total_savings = calculateTotalSavings(plan);
            }
            if (!plan.promo_price) {
                plan.promo_price = calculatePromoPrice(plan);
            }
        });

        // Apply client-side filters for promo_type and min_savings
        if (currentFilters.promo_type) {
            allDeals = allDeals.filter(plan =>
                plan.promo_type && plan.promo_type.toLowerCase() === currentFilters.promo_type.toLowerCase()
            );
        }

        if (currentFilters.min_savings) {
            allDeals = allDeals.filter(plan => {
                const savings = plan.total_savings || 0;
                return savings >= currentFilters.min_savings;
            });
        }

        currentPlans = allDeals;

        // Note: Client-side filtering may affect the total count, but we'll use server count for now

        sortPlans();

        // Remove static content only after we have real data
        document.querySelectorAll('.static-content').forEach(el => el.remove());

        renderPlans(currentPlans);
        updatePaginationControls();
        updateSortIcons();
        hideLoading();
        hideTableLoadingOverlay();

        if (currentPlans.length === 0) {
            showNoResults();
        }
    } catch (error) {
        console.error('Error loading deals:', error);
        hideLoading();
        showError();
    } finally {
        isLoading = false;
    }
}

// Calculate total savings based on promo type
function calculateTotalSavings(plan) {
    if (!plan.promo_value) return 0;

    switch (plan.promo_type?.toLowerCase()) {
        case 'discount':
            return plan.promo_value * (plan.promo_duration || 1);
        case 'free_months':
            return plan.monthly_price * plan.promo_value;
        case 'setup_waived':
            return plan.setup_fee || 0;
        default:
            return plan.promo_value;
    }
}

// Calculate promotional price (price during promo period)
function calculatePromoPrice(plan) {
    if (!plan.promo_value || !plan.promo_type) return plan.monthly_price;

    switch (plan.promo_type?.toLowerCase()) {
        case 'discount':
            return Math.max(0, plan.monthly_price - plan.promo_value);
        case 'free_months':
            return 0; // Free means $0
        case 'setup_waived':
            return plan.monthly_price; // Setup fee doesn't affect monthly price
        default:
            return plan.monthly_price;
    }
}

// Navigate to specific page
async function goToPage(page) {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        await loadDeals();
    }
}

// Get total number of pages
function getTotalPages() {
    return Math.max(1, Math.ceil(totalPlans / pageSize));
}

// Sort plans
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

// Apply filters
function applyFilters() {
    const providerId = providerFilter.value;
    const speed = speedFilter.value;
    const maxPrice = priceFilter.value;
    const promoType = promoTypeFilter.value;
    const minSavings = minSavingsFilter.value;

    currentFilters = {};

    if (providerId) {
        currentFilters.provider_id = providerId;
    }

    if (speed) {
        currentFilters.speed = parseInt(speed);
    }

    if (maxPrice) {
        currentFilters.max_price = parseFloat(maxPrice);
    }

    // Client-side filters
    if (promoType) {
        currentFilters.promo_type = promoType;
    }

    if (minSavings) {
        currentFilters.min_savings = parseFloat(minSavings);
    }

    console.log('Applied filters:', currentFilters);

    currentPage = 1;
    totalPlans = 0;
    loadDeals();
}

// Clear all filters
function clearFilters() {
    providerFilter.value = '';
    speedFilter.value = '';
    priceFilter.value = '';
    promoTypeFilter.value = '';
    minSavingsFilter.value = '';
    currentFilters = {};
    currentPage = 1;
    totalPlans = 0;
    loadDeals();
}

// Update pagination controls
function updatePaginationControls() {
    const totalPages = getTotalPages();

    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${currentPlans.length} deals shown)`;

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
    const totalSavings = plan.total_savings || calculateTotalSavings(plan);
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);

    // Create provider cell with link if website is available
    const providerCell = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="provider-link">${plan.provider_name || 'Unknown'}</a>`
        : (plan.provider_name || 'Unknown');

    // Create plan name cell with setup fee info icon if applicable
    const setupFeeIcon = plan.setup_fee > 0
        ? `<span class="setup-fee-info" title="Setup fee: $${plan.setup_fee.toFixed(2)}" style="margin-left: 5px; color: #ff6600; font-weight: bold; font-size: 14px; cursor: help; background: #fff3e0; padding: 0 4px; border-radius: 3px;">ⓘ</span>`
        : '';
    const planNameCell = `${plan.plan_name}${setupFeeIcon}`;

    return `
        <tr class="deal-row">
            <td class="provider-cell">${providerCell}</td>
            <td class="plan-cell" title="${plan.plan_name}">${planNameCell}</td>
            <td class="speed-cell">${formatSpeed(plan)}</td>
            <td class="price-cell">$${plan.monthly_price.toFixed(2)}</td>
            <td class="promo-price-cell">$${promoPrice.toFixed(2)}</td>
            <td class="promo-cell">${formatPromotion(plan)}</td>
            <td class="savings-cell">$${totalSavings.toFixed(0)}</td>
            <td class="contract-cell">${plan.contract_length ? `${plan.contract_length}mo` : 'No lock'}</td>
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
    if (!plan.promo_value || !plan.promo_type) return 'Special Offer';

    switch (plan.promo_type.toLowerCase()) {
        case 'discount':
            return `$${plan.promo_value.toFixed(2)} off ${plan.promo_duration ? `for ${plan.promo_duration}mo` : ''}`;
        case 'free_months':
            return `${plan.promo_value} months free`;
        case 'setup_waived':
            return 'Free setup';
        case 'bonus':
            return plan.promo_details || 'Bonus inclusion';
        default:
            return plan.promo_details || plan.promo_type;
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