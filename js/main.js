// Configuration
const LOCAL_API_URL = 'http://127.0.0.1:8000/v1';
const PROD_API_URL = 'https://api.netbargains.com.au/v1';
const DEV_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = DEV_MODE ? LOCAL_API_URL : PROD_API_URL;

// State
let currentPlans = [];
let allProviders = [];
let selectedProviders = [];
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
const providerOptions = document.getElementById('provider-options');
const providerList = document.getElementById('provider-list');
const providerSearch = document.getElementById('provider-search');
const speedFilter = document.getElementById('speed-filter');
const priceFilter = document.getElementById('price-filter');
const contractFilter = document.getElementById('contract-filter');
const wirelessFilter = document.getElementById('wireless-filter');
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
            font-family: Verdana, Geneva, sans-serif;
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
    providerList.innerHTML = '';

    // Add "Clear All" option at the top
    const clearAllOption = document.createElement('div');
    clearAllOption.className = 'multi-select-clear-all';
    clearAllOption.innerHTML = `
        <button type="button" class="clear-all-btn">Clear All Providers</button>
    `;
    providerList.appendChild(clearAllOption);

    allProviders.forEach(provider => {
        const option = document.createElement('label');
        option.className = 'multi-select-option';
        option.setAttribute('for', `provider-${provider.id}`);
        option.setAttribute('data-provider-name', provider.name.toLowerCase());
        option.innerHTML = `
            <input type="checkbox" id="provider-${provider.id}" value="${provider.id}">
            <span>${provider.name}</span>
        `;
        providerList.appendChild(option);
    });

    // Add event listeners for multi-select
    setupMultiSelectEvents();
}

// Setup multi-select events
function setupMultiSelectEvents() {
    const display = providerFilter.querySelector('.multi-select-display');

    // Toggle dropdown
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        providerFilter.classList.toggle('open');
        if (providerFilter.classList.contains('open')) {
            providerSearch.focus();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!providerFilter.contains(e.target)) {
            providerFilter.classList.remove('open');
        }
    });

    // Handle checkbox changes
    providerList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateSelectedProviders();
            updateProviderDisplay();

            // Clear search and show all options after selection
            providerSearch.value = '';
            providerList.querySelectorAll('.multi-select-option').forEach(option => {
                option.style.display = 'flex';
            });
        }
    });

    // Handle search input
    providerSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const options = providerList.querySelectorAll('.multi-select-option');

        options.forEach(option => {
            const providerName = option.getAttribute('data-provider-name');
            if (providerName.includes(searchTerm)) {
                option.style.display = 'flex';
            } else {
                option.style.display = 'none';
            }
        });
    });

    // Prevent dropdown from closing when clicking on search input
    providerSearch.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Handle "Clear All" button
    const clearAllBtn = providerList.querySelector('.clear-all-btn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Uncheck all provider checkboxes
            providerList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Update state and display
            selectedProviders = [];
            updateProviderDisplay();

            // Clear search and show all options
            providerSearch.value = '';
            providerList.querySelectorAll('.multi-select-option').forEach(option => {
                option.style.display = 'flex';
            });
        });
    }
}

// Update selected providers array
function updateSelectedProviders() {
    selectedProviders = Array.from(providerList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);
}

// Update provider display text
function updateProviderDisplay() {
    const display = providerFilter.querySelector('.multi-select-display');
    if (selectedProviders.length === 0) {
        display.textContent = 'All Providers';
    } else {
        const selectedNames = selectedProviders.map(id => {
            const provider = allProviders.find(p => p.id == id);
            return provider ? provider.name : '';
        }).filter(name => name).join(', ');

        display.textContent = selectedNames;
    }
}

// Build URL with filters
function buildApiUrl() {
    const endpoint = '/plans/latest';
    const skip = (currentPage - 1) * pageSize;

    const params = new URLSearchParams({
        skip: skip.toString(),
        limit: pageSize.toString()
    });

    // Add filters
    if (currentFilters.provider_ids && currentFilters.provider_ids.length > 0) {
        currentFilters.provider_ids.forEach(id => {
            params.append('provider_id', id);
        });
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

        const responseData = await response.json();

        // Extract data from paginated response
        currentPlans = responseData.items;
        totalPlans = responseData.total;

        // Calculate promo price for each plan if not provided by API
        currentPlans.forEach(plan => {
            if (!plan.promo_price) {
                plan.promo_price = calculatePromoPrice(plan);
            }
        });

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
    updateSelectedProviders();
    const speed = speedFilter.value;
    const maxPrice = priceFilter.value;
    const contractLength = contractFilter.value;
    const fixedWireless = wirelessFilter.value;
    const minDownload = minDownloadFilter.value;
    const maxDownload = maxDownloadFilter.value;
    const minUpload = minUploadFilter.value;

    // Build filters object
    currentFilters = {};

    if (selectedProviders.length > 0) {
        currentFilters.provider_ids = selectedProviders;
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
    // Clear provider checkboxes
    providerList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedProviders = [];
    updateProviderDisplay();

    // Clear search
    providerSearch.value = '';
    providerList.querySelectorAll('.multi-select-option').forEach(option => {
        option.style.display = 'flex';
    });

    speedFilter.value = '';
    priceFilter.value = '';
    contractFilter.value = '';
    wirelessFilter.value = '';
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
    const promoPrice = plan.promo_price || calculatePromoPrice(plan);

    // Create provider cell with link if website is available
    const providerCell = plan.provider_website
        ? `<a href="${plan.provider_website}" target="_blank" rel="noopener noreferrer" class="provider-link">${plan.provider_name || 'Unknown'}</a>`
        : (plan.provider_name || 'Unknown');

    // Create fixed wireless indicator if applicable
    const fixedWirelessIcon = plan.fixed_wireless
        ? `<span class="fixed-wireless-info" title="Fixed Wireless NBN" style="margin-left: 5px; color: #8b5cf6; font-weight: bold; font-size: 8px; cursor: help; background: #f3f0ff; padding: 1px 4px; border-radius: 3px;">FW</span>`
        : '';

    const businessPlanIcon = plan.business_plan
        ? `<span class="business_plan_info" title="Business Plan" style="margin-left: 5px; color: #5c92f6; font-weight: bold; font-size: 8px; cursor: help; background: #f3f0ff; padding: 1px 4px; border-radius: 3px;">B</span>`
        : '';

    const planNameCell = `${plan.plan_name}${businessPlanIcon}${fixedWirelessIcon}`;

    return `
        <tr>
            <td class="provider-cell">${providerCell}</td>
            <td class="plan-cell" title="${plan.plan_name}">${planNameCell}</td>
            <td class="speed-cell">${formatSpeed(plan)}</td>
            <td class="price-cell">$${plan.monthly_price.toFixed(2)}</td>
            <td class="promo-price-cell ${hasPromo ? '' : 'no-promo'}">${hasPromo ? `$${promoPrice.toFixed(2)}` : '-'}</td>
            <td class="promo-cell ${hasPromo ? '' : 'no-promo'}">
                ${hasPromo ? formatPromotion(plan) : '-'}
            </td>
            <td class="contract-cell">${plan.contract_length ? `${plan.contract_length}mo` : '-'}</td>
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
            return `$${plan.promo_value.toFixed(2)} off ${plan.promo_duration ? `${plan.promo_duration}mo` : ''}`;
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