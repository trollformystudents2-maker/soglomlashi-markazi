/**
 * SHIFO NUR - Sog'lomlashtirish Markazi CRM
 * Frontend Application Logic
 */

// Global State
let allServices = [];
let allPatients = [];
let todayQueue = [];
let currentCategoryFilter = 'all';
let currentQueueStatusFilter = 'all';
let selectedAppointmentForPayment = null;
let currentPatientDetail = null;

// Chart instances
let dailyRevChartInstance = null;
let servicesPieChartInstance = null;

// Initialize app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    // Set default dates
    const todayStr = getTodayDateStr();
    const datePicker = document.getElementById('queueDatePicker');
    if (datePicker) datePicker.value = todayStr;
    const bookDateInput = document.getElementById('bookDate');
    if (bookDateInput) bookDateInput.value = todayStr;
    const recordDateInput = document.getElementById('recordDate');
    if (recordDateInput) recordDateInput.value = todayStr;

    // Load initial data
    await loadServices();
    await loadDashboardStats();
    await loadQueueData();
    await loadPatientsList();
});

// Helper: Get Today's YYYY-MM-DD
function getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Format number into so'm currency
function formatSum(amount) {
    if (amount === undefined || amount === null) return '0 so\'m';
    return Number(amount).toLocaleString('uz-UZ') + ' so\'m';
}

// Tab Switching
function switchTab(tabName) {
    const tabs = ['dashboard', 'queue', 'patients', 'medical-records', 'finance', 'services'];
    tabs.forEach(t => {
        const content = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (content) {
            if (t === tabName) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        }
        if (btn) {
            if (t === tabName) {
                btn.className = "tab-button inline-flex items-center px-3 py-2 rounded-lg text-emerald-700 bg-emerald-50 font-semibold transition";
            } else {
                btn.className = "tab-button inline-flex items-center px-3 py-2 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition";
            }
        }
    });

    if (tabName === 'dashboard') loadDashboardStats();
    if (tabName === 'queue') loadQueueData();
    if (tabName === 'patients') loadPatientsList();
    if (tabName === 'medical-records') loadMedicalRecords();
    if (tabName === 'finance') loadFinanceReport();
    if (tabName === 'services') renderServicesTab();
}

// ================= API CALLS & LOADERS =================

// 1. Load Services
async function loadServices() {
    try {
        const res = await fetch('/api/services');
        allServices = await res.json();
        renderServiceBookingCheckboxes();
    } catch (err) {
        console.error("Xizmatlarni yuklashda xatolik:", err);
    }
}

// 2. Load Dashboard Stats & Charts
async function loadDashboardStats() {
    try {
        const targetDate = document.getElementById('queueDatePicker')?.value || getTodayDateStr();
        const res = await fetch(`/api/stats?target_date=${targetDate}`);
        const data = await res.json();

        // Update Top Navigation Capacity Widget (Max 20 bemor)
        const topCount = data.today.count;
        const topCapacity = data.today.max_capacity; // 20
        const topPercent = data.today.percentage;

        document.getElementById('topCapacityText').textContent = `${topCount} / ${topCapacity} bemor`;
        const topBar = document.getElementById('topCapacityBar');
        topBar.style.width = `${topPercent}%`;

        const topBadge = document.getElementById('topCapacityBadge');
        if (topCount >= topCapacity) {
            topBadge.textContent = "Limit to'ldi!";
            topBadge.className = "text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800";
            topBar.className = "bg-red-500 h-full rounded-full transition-all duration-500";
            document.getElementById('capacityWarningBanner')?.classList.remove('hidden');
        } else if (topCount >= 16) {
            topBadge.textContent = `${data.today.remaining} ta joy qoldi`;
            topBadge.className = "text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800";
            topBar.className = "bg-amber-500 h-full rounded-full transition-all duration-500";
            document.getElementById('capacityWarningBanner')?.classList.add('hidden');
        } else {
            topBadge.textContent = "Joy bor";
            topBadge.className = "text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800";
            topBar.className = "bg-emerald-500 h-full rounded-full transition-all duration-500";
            document.getElementById('capacityWarningBanner')?.classList.add('hidden');
        }

        // Update KPI Cards
        document.getElementById('dashTodayCount').textContent = `${topCount} / ${topCapacity}`;
        document.getElementById('dashRemainingText').textContent = `${data.today.remaining} ta bo'sh joy mavjud`;
        document.getElementById('dashCapacityBar').style.width = `${topPercent}%`;

        document.getElementById('dashTodayRevenue').textContent = formatSum(data.today.revenue);
        document.getElementById('dashExpectedRevenue').textContent = `Kutilayotgan: ${formatSum(data.today.expected_revenue)}`;

        document.getElementById('dashMonthRevenue').textContent = formatSum(data.month.revenue);
        document.getElementById('dashMonthVisits').textContent = `${data.month.total_visits} ta muolaja seansi`;

        document.getElementById('dashWomenCount').textContent = data.today.women_count;
        document.getElementById('dashChildrenCount').textContent = data.today.children_count;
        document.getElementById('dashTotalPatients').textContent = `Umumiy baza: ${data.total_patients} nafar bemor`;

        // Update Queue Badge count in tab
        document.getElementById('queueBadgeCount').textContent = topCount;

        // Render Charts
        renderDailyRevenueChart(data.daily_trend);
        renderServicesPieChart(data.services_breakdown);

    } catch (err) {
        console.error("Dashboard yuklashda xatolik:", err);
    }
}

// 3. Render Daily Revenue Chart
function renderDailyRevenueChart(trendData) {
    const ctx = document.getElementById('dailyRevenueChart');
    if (!ctx) return;

    if (dailyRevChartInstance) {
        dailyRevChartInstance.destroy();
    }

    const labels = trendData.length > 0 ? trendData.map(d => d.pay_date.substring(5)) : ['Bugun'];
    const values = trendData.length > 0 ? trendData.map(d => d.daily_sum) : [0];

    dailyRevChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tushum (so\'m)',
                data: values,
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: '#059669',
                borderWidth: 1.5,
                borderRadius: 8,
                hoverBackgroundColor: '#047857'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return 'Tushum: ' + Number(ctx.raw).toLocaleString('uz-UZ') + ' so\'m';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(val) {
                            return (val / 1000) + ' ming';
                        }
                    },
                    grid: { color: '#f1f5f9' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// 4. Render Services Breakdown Pie Chart
function renderServicesPieChart(breakdown) {
    const ctx = document.getElementById('servicesPieChart');
    const legendContainer = document.getElementById('servicesLegendList');
    if (!ctx) return;

    if (servicesPieChartInstance) {
        servicesPieChartInstance.destroy();
    }

    const palette = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'];

    const labels = breakdown.map(b => b.service_name);
    const dataValues = breakdown.map(b => b.total_sum);

    if (labels.length === 0) {
        labels.push("Hozircha xizmat yo'q");
        dataValues.push(1);
    }

    servicesPieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: palette.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.label + ': ' + Number(ctx.raw).toLocaleString('uz-UZ') + ' so\'m';
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });

    // Render legend list
    if (legendContainer) {
        legendContainer.innerHTML = breakdown.slice(0, 4).map((b, idx) => `
            <div class="flex items-center justify-between">
                <span class="flex items-center">
                    <span class="w-2.5 h-2.5 rounded-full mr-2" style="background-color: ${palette[idx % palette.length]}"></span>
                    ${b.service_name}
                </span>
                <span class="font-bold text-slate-700">${formatSum(b.total_sum)}</span>
            </div>
        `).join('');
    }
}

// 5. Load Today's Queue Data & Render
async function loadQueueData() {
    try {
        const targetDate = document.getElementById('queueDatePicker')?.value || getTodayDateStr();
        const res = await fetch(`/api/appointments?target_date=${targetDate}`);
        const data = await res.json();
        todayQueue = data.appointments || [];

        // Update Quota status banner in Queue tab
        const count = data.total_booked;
        const max = data.max_capacity; // 20
        const percent = Math.min(100, Math.round((count / max) * 100));

        const quotaTitle = document.getElementById('queueQuotaTitle');
        const quotaBadge = document.getElementById('queueQuotaBadge');
        const progressBar = document.getElementById('queueProgressBar');
        const percentLabel = document.getElementById('queuePercentLabel');

        if (quotaTitle) quotaTitle.textContent = `${targetDate} sanasida: ${count} / ${max} bemor band qilindi`;
        if (percentLabel) percentLabel.textContent = `Bandlik darajasi: ${percent}% (${max - count > 0 ? (max - count) + ' ta bo\'sh joy' : 'To\'lgan'})`;
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.className = count >= max ? "bg-red-500 h-full rounded-full transition-all duration-500" : (count >= 16 ? "bg-amber-500 h-full rounded-full transition-all duration-500" : "bg-emerald-500 h-full rounded-full transition-all duration-500");
        }
        if (quotaBadge) {
            if (count >= max) {
                quotaBadge.textContent = "Kunlik me'yor to'ldi (20/20)";
                quotaBadge.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-red-100 text-red-800";
            } else if (count >= 16) {
                quotaBadge.textContent = `Oz qoldi (${max - count} ta o'rin)`;
                quotaBadge.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800";
            } else {
                quotaBadge.textContent = "Bo'sh joylar mavjud";
                quotaBadge.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800";
            }
        }

        // Status counts for filters
        const countAll = todayQueue.length;
        const countWait = todayQueue.filter(a => a.status === 'kutmoqda').length;
        const countInProc = todayQueue.filter(a => a.status === 'muolajada').length;
        const countDone = todayQueue.filter(a => a.status === 'yakunlandi').length;

        if (document.getElementById('countFilterAll')) document.getElementById('countFilterAll').textContent = countAll;
        if (document.getElementById('countFilterWaiting')) document.getElementById('countFilterWaiting').textContent = countWait;
        if (document.getElementById('countFilterInProc')) document.getElementById('countFilterInProc').textContent = countInProc;
        if (document.getElementById('countFilterDone')) document.getElementById('countFilterDone').textContent = countDone;

        renderQueueTables();

    } catch (err) {
        console.error("Navbatlarni yuklashda xatolik:", err);
    }
}

// 6. Filter Queue Status
function filterQueueStatus(status) {
    currentQueueStatusFilter = status;
    document.querySelectorAll('.queue-filter-btn').forEach(btn => {
        if (btn.getAttribute('data-status') === status) {
            btn.className = "queue-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white shadow-sm";
        } else {
            btn.className = "queue-filter-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50";
        }
    });
    renderQueueTables();
}

// 7. Render Queue Tables (Dashboard preview & Main Queue tab)
function renderQueueTables() {
    const dashBody = document.getElementById('dashQueueTableBody');
    const mainBody = document.getElementById('mainQueueTableBody');

    let filtered = todayQueue;
    if (currentQueueStatusFilter !== 'all') {
        filtered = todayQueue.filter(a => a.status === currentQueueStatusFilter);
    }

    if (dashBody) {
        dashBody.innerHTML = todayQueue.length === 0 ? `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-400">
                    <i class="fa-regular fa-calendar-xmark text-3xl mb-2 block text-slate-300"></i>
                    Bugun hali bemorlar navbatga yozilmagan.
                </td>
            </tr>
        ` : todayQueue.slice(0, 7).map(app => renderQueueTableRow(app, false)).join('');
    }

    if (mainBody) {
        mainBody.innerHTML = filtered.length === 0 ? `
            <tr>
                <td colspan="9" class="text-center py-10 text-slate-400">
                    <i class="fa-regular fa-clipboard text-3xl mb-2 block text-slate-300"></i>
                    Ushbu holat bo'yicha navbatlar topilmadi.
                </td>
            </tr>
        ` : filtered.map(app => renderQueueTableRow(app, true)).join('');
    }
}

// Helper: Single Queue row HTML
function renderQueueTableRow(app, isDetailed) {
    const isWoman = app.category === 'ayol';
    const categoryBadge = isWoman 
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-pink-50 text-pink-700 border border-pink-200"><i class="fa-solid fa-person-dress mr-1"></i> Ayol</span>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-200"><i class="fa-solid fa-child mr-1"></i> Bola</span>`;

    // Status Badge
    let statusBadge = '';
    if (app.status === 'kutmoqda') {
        statusBadge = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-waiting"><i class="fa-regular fa-clock mr-1"></i> Kutmoqda</span>`;
    } else if (app.status === 'muolajada') {
        statusBadge = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-progress pulse-live"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Muolajada</span>`;
    } else if (app.status === 'yakunlandi') {
        statusBadge = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-completed"><i class="fa-solid fa-circle-check mr-1"></i> Yakunlandi</span>`;
    } else {
        statusBadge = `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold badge-cancelled">Bekor</span>`;
    }

    // Payment Badge
    const isPaid = app.payment_status === 'tolangan';
    const paymentBadge = isPaid
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i> To'langan</span>`
        : `<button onclick="openPaymentModal(${app.id}, '${app.full_name}', '${(app.services || []).map(s => s.service_name).join(', ')}', ${app.total_amount})" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition"><i class="fa-solid fa-receipt mr-1"></i> To'lov qilish</button>`;

    // Services list string
    const servicesStr = (app.services || []).map(s => `<span class="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs mr-1 mb-1 font-medium">${s.service_name} (${formatSum(s.price)})</span>`).join('');

    // Arrival / Departure
    const arrivalDeparture = `
        <div class="text-xs">
            <span class="text-slate-500">K:</span> <strong>${app.arrival_time || '--:--'}</strong>
            <span class="text-slate-300 mx-1">|</span>
            <span class="text-slate-500">Ch:</span> <strong>${app.departure_time || '--:--'}</strong>
        </div>
    `;

    return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="px-5 py-3.5 font-bold text-slate-900">
                <span class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-emerald-800 border border-slate-200">
                    #${app.queue_number}
                </span>
            </td>
            <td class="px-5 py-3.5">
                <div class="font-bold text-slate-900 cursor-pointer hover:text-emerald-600" onclick="viewPatientDetail(${app.patient_id})">${app.full_name}</div>
                <div class="text-xs text-slate-400 font-mono">${app.card_number} • ${app.phone}</div>
            </td>
            <td class="px-5 py-3.5">
                ${categoryBadge}
                <div class="text-xs text-slate-500 mt-0.5">${app.age} yosh</div>
            </td>
            <td class="px-5 py-3.5 max-w-xs">
                ${servicesStr}
                <div class="text-xs font-bold text-emerald-700 mt-0.5">Jami: ${formatSum(app.total_amount)}</div>
            </td>
            ${isDetailed ? `<td class="px-5 py-3.5 text-xs text-slate-600 font-medium">${app.scheduled_time || 'Rejalashtirilmagan'}</td>` : ''}
            <td class="px-5 py-3.5">
                ${arrivalDeparture}
            </td>
            <td class="px-5 py-3.5">
                ${statusBadge}
            </td>
            <td class="px-5 py-3.5">
                ${paymentBadge}
            </td>
            <td class="px-5 py-3.5 text-right whitespace-nowrap">
                <div class="flex items-center justify-end space-x-1.5">
                    ${app.status === 'kutmoqda' ? `
                        <button onclick="changeAppointmentStatus(${app.id}, 'muolajada')" title="Muolajaga chaqirish" class="p-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 text-xs font-semibold">
                            <i class="fa-solid fa-play mr-1"></i> Chaqirish
                        </button>
                    ` : ''}

                    ${app.status === 'muolajada' ? `
                        <button onclick="changeAppointmentStatus(${app.id}, 'yakunlandi')" title="Muolajani yakunlash va ketish" class="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold">
                            <i class="fa-solid fa-check mr-1"></i> Yakunlash
                        </button>
                    ` : ''}

                    <button onclick="previewReceipt(${app.id})" title="Chek chiqarish" class="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs">
                        <i class="fa-solid fa-receipt"></i>
                    </button>

                    <button onclick="viewPatientDetail(${app.patient_id})" title="Tibbiy kartani ko'rish" class="p-1.5 rounded-lg bg-slate-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                        <i class="fa-solid fa-file-medical"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// 8. Change Appointment Status (Real-time Arrival / Departure tracking)
async function changeAppointmentStatus(appId, newStatus) {
    try {
        const res = await fetch(`/api/appointments/${appId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            await loadQueueData();
            await loadDashboardStats();
        }
    } catch (err) {
        console.error("Holatni yangilashda xatolik:", err);
    }
}

// ================= PATIENT DIRECTORY =================

// 9. Load Patients List
async function loadPatientsList() {
    try {
        const searchVal = document.getElementById('patientSearchInput')?.value || '';
        const res = await fetch(`/api/patients?q=${encodeURIComponent(searchVal)}&category=${currentCategoryFilter}`);
        allPatients = await res.json();

        // Update counts
        const allRes = await fetch('/api/patients');
        const allData = await allRes.json();
        const total = allData.length;
        const women = allData.filter(p => p.category === 'ayol').length;
        const kids = allData.filter(p => p.category === 'bola').length;

        if (document.getElementById('patientCountAll')) document.getElementById('patientCountAll').textContent = total;
        if (document.getElementById('patientCountWomen')) document.getElementById('patientCountWomen').textContent = women;
        if (document.getElementById('patientCountKids')) document.getElementById('patientCountKids').textContent = kids;

        renderPatientsTable();
        populatePatientSelectDropdowns();

    } catch (err) {
        console.error("Bemorlarni yuklashda xatolik:", err);
    }
}

// 10. Filter Patient Category (Ayollar / Bolalar)
function filterPatientCategory(cat) {
    currentCategoryFilter = cat;
    ['all', 'ayol', 'bola'].forEach(c => {
        const btn = document.getElementById(`patientCat-${c}`);
        if (btn) {
            if (c === cat) {
                btn.className = "patient-cat-btn px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white shadow-sm";
            } else {
                btn.className = "patient-cat-btn px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
            }
        }
    });
    loadPatientsList();
}

// 11. Render Patients Table
function renderPatientsTable() {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;

    if (allPatients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-12 text-slate-400">
                    <i class="fa-solid fa-users-slash text-4xl mb-2 text-slate-300 block"></i>
                    Bemorlar topilmadi. "Yangi Bemor" tugmasi orqali ro'yxatga oling.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allPatients.map(p => {
        const isWoman = p.category === 'ayol';
        const catBadge = isWoman
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-pink-50 text-pink-700 border border-pink-200"><i class="fa-solid fa-person-dress mr-1"></i> Ayol</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-50 text-cyan-700 border border-cyan-200"><i class="fa-solid fa-child mr-1"></i> Bola</span>`;

        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                <td class="px-5 py-3.5 font-mono text-xs font-bold text-slate-700">${p.card_number}</td>
                <td class="px-5 py-3.5 font-bold text-slate-900 cursor-pointer hover:text-emerald-600" onclick="viewPatientDetail(${p.id})">
                    ${p.full_name}
                </td>
                <td class="px-5 py-3.5">
                    ${catBadge}
                    <span class="text-xs text-slate-500 ml-1">${p.age} yosh</span>
                </td>
                <td class="px-5 py-3.5 font-mono text-xs text-slate-600">${p.phone}</td>
                <td class="px-5 py-3.5 text-xs text-slate-600 max-w-xs truncate" title="${p.initial_diagnosis || ''}">
                    ${p.initial_diagnosis || '<span class="text-slate-400">Belgilanmagan</span>'}
                </td>
                <td class="px-5 py-3.5 text-xs font-semibold text-slate-800">${p.total_visits} marta</td>
                <td class="px-5 py-3.5 text-xs font-bold text-emerald-600">${formatSum(p.total_spent)}</td>
                <td class="px-5 py-3.5 text-right whitespace-nowrap">
                    <button onclick="viewPatientDetail(${p.id})" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 mr-1">
                        <i class="fa-solid fa-id-card mr-1"></i> Karta
                    </button>
                    <button onclick="bookForSpecificPatient(${p.id})" class="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200">
                        <i class="fa-solid fa-plus mr-1"></i> Navbat
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 12. Populate Patient Select Dropdowns (in Appointment booking and Medical records modals)
function populatePatientSelectDropdowns() {
    const bookSelect = document.getElementById('bookPatientSelect');
    const recordSelect = document.getElementById('recordPatientSelect');

    const optionsHtml = allPatients.map(p => `
        <option value="${p.id}">${p.full_name} (${p.category === 'ayol' ? 'Ayol' : 'Bola'}, ${p.age} yosh) - ${p.card_number}</option>
    `).join('');

    if (bookSelect) bookSelect.innerHTML = optionsHtml;
    if (recordSelect) recordSelect.innerHTML = optionsHtml;
}

// 13. Submit New Patient Form
async function submitNewPatient(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('patientFullName').value,
        category: document.getElementById('patientCategory').value,
        gender: document.getElementById('patientGender').value,
        age: parseInt(document.getElementById('patientAge').value) || 0,
        phone: document.getElementById('patientPhone').value,
        address: document.getElementById('patientAddress').value,
        initial_diagnosis: document.getElementById('patientInitialDiagnosis').value,
        blood_group: document.getElementById('patientBloodGroup').value,
        allergies: document.getElementById('patientAllergies').value,
        notes: ''
    };

    try {
        const res = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeModal('newPatientModal');
            document.getElementById('newPatientForm').reset();
            await loadPatientsList();
            await loadDashboardStats();
            alert("Bemor muvaffaqiyatli ro'yxatga olindi!");
        }
    } catch (err) {
        console.error("Bemor saqlashda xatolik:", err);
    }
}

// 14. View Patient Detailed Medical Profile
async function viewPatientDetail(patientId) {
    try {
        const res = await fetch(`/api/patients/${patientId}`);
        const data = await res.json();
        currentPatientDetail = data;

        const p = data.patient;
        document.getElementById('patientDetailName').textContent = p.full_name;
        document.getElementById('patientDetailCardBadge').textContent = p.card_number;
        document.getElementById('patientDetailSub').textContent = `${p.category === 'ayol' ? 'Ayol' : 'Bola'} • ${p.age} yosh • ${p.phone}`;
        document.getElementById('patientDetailAddress').textContent = p.address || 'Kiritilmagan';
        document.getElementById('patientDetailBlood').textContent = `${p.blood_group || 'Noma\'lum'} • Allergiya: ${p.allergies || 'Yo\'q'}`;
        document.getElementById('patientDetailSpent').textContent = formatSum(data.total_spent);

        // Avatar icon
        const avatar = document.getElementById('patientDetailAvatar');
        if (p.category === 'ayol') {
            avatar.className = "w-12 h-12 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center text-2xl font-bold";
            avatar.innerHTML = '<i class="fa-solid fa-person-dress"></i>';
        } else {
            avatar.className = "w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-600 flex items-center justify-center text-2xl font-bold";
            avatar.innerHTML = '<i class="fa-solid fa-child"></i>';
        }

        // Timeline of Medical Records
        const timeline = document.getElementById('patientRecordsTimeline');
        if (data.medical_records.length === 0) {
            timeline.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 text-xs text-slate-500 italic">Hali tibbiy yozuvlar kiritilmagan. Yuqoridagi "Qayd qo'shish" tugmasini bosing.</div>`;
        } else {
            timeline.innerHTML = data.medical_records.map(r => `
                <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-bold text-slate-500">${r.record_date}</span>
                            <h5 class="font-bold text-slate-900 text-sm mt-0.5">Tashxis: ${r.diagnosis}</h5>
                        </div>
                        <span class="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">${r.doctor_name || 'Shifokor'}</span>
                    </div>
                    ${r.complaints ? `<p class="text-xs text-slate-600 mt-2"><strong>Shikoyatlar:</strong> ${r.complaints}</p>` : ''}
                    ${r.prescribed_procedures ? `<p class="text-xs text-slate-600 mt-1"><strong>Buyurilgan muolajalar:</strong> ${r.prescribed_procedures}</p>` : ''}
                    ${r.recommendations ? `<p class="text-xs text-slate-600 mt-1"><strong>Tavsiyalar:</strong> ${r.recommendations}</p>` : ''}
                </div>
            `).join('');
        }

        // Past Visits Table
        const visitsBody = document.getElementById('patientVisitsTableBody');
        if (data.appointments.length === 0) {
            visitsBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-slate-400">Tashriflar tarixi mavjud emas.</td></tr>`;
        } else {
            visitsBody.innerHTML = data.appointments.map(a => `
                <tr class="border-b border-slate-100">
                    <td class="px-4 py-2 font-medium">${a.appointment_date}</td>
                    <td class="px-4 py-2">${a.services_names || 'Muolaja'}</td>
                    <td class="px-4 py-2 font-bold text-slate-800">${formatSum(a.total_amount)}</td>
                    <td class="px-4 py-2">
                        <span class="px-2 py-0.5 rounded text-xs ${a.status === 'yakunlandi' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${a.status}</span>
                    </td>
                    <td class="px-4 py-2 text-right">
                        <button onclick="previewReceipt(${a.id})" class="text-emerald-600 hover:text-emerald-800"><i class="fa-solid fa-receipt"></i> Chek</button>
                    </td>
                </tr>
            `).join('');
        }

        openModal('patientDetailModal');

    } catch (err) {
        console.error("Bemor ma'lumotlarini yuklashda xatolik:", err);
    }
}

// 15. Quick booking shortcut from patient profile
function bookForSpecificPatient(patientId) {
    openBookAppointmentModal();
    const select = document.getElementById('bookPatientSelect');
    if (select) select.value = patientId;
}

// ================= APPOINTMENT & QUEUE BOOKING (MAX 20) =================

// 16. Render Service Checkboxes in Booking Modal
function renderServiceBookingCheckboxes() {
    const container = document.getElementById('bookServicesList');
    if (!container) return;

    container.innerHTML = allServices.map(s => `
        <label class="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 cursor-pointer transition">
            <div class="flex items-center space-x-2.5">
                <input type="checkbox" name="bookingService" value="${s.id}" data-price="${s.price}" class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" onchange="calculateBookingLiveTotal()">
                <div>
                    <span class="text-sm font-semibold text-slate-800">${s.name}</span>
                    <span class="text-xs text-slate-400 block">${s.description || ''}</span>
                </div>
            </div>
            <span class="text-sm font-bold text-emerald-600">${formatSum(s.price)}</span>
        </label>
    `).join('');
}

// 17. Live Total Calculator when checking services
function calculateBookingLiveTotal() {
    const checked = document.querySelectorAll('input[name="bookingService"]:checked');
    let total = 0;
    checked.forEach(cb => {
        total += parseFloat(cb.getAttribute('data-price') || 0);
    });
    document.getElementById('bookLiveTotal').textContent = formatSum(total);
}

// 18. Check Capacity for Chosen Booking Date (20 patients quota)
async function checkDateCapacity() {
    const targetDate = document.getElementById('bookDate')?.value || getTodayDateStr();
    try {
        const res = await fetch(`/api/appointments?target_date=${targetDate}`);
        const data = await res.json();
        const alertBox = document.getElementById('bookingModalCapacityAlert');
        if (data.total_booked >= 20) {
            alertBox.classList.remove('hidden');
        } else {
            alertBox.classList.add('hidden');
        }
    } catch (err) {
        console.error("Sana quvvatini tekshirishda xatolik:", err);
    }
}

// 19. Submit Book Appointment
async function submitBookAppointment(e) {
    e.preventDefault();
    const patientId = parseInt(document.getElementById('bookPatientSelect').value);
    const appointmentDate = document.getElementById('bookDate').value;
    const scheduledTime = document.getElementById('bookTime').value;
    const notes = document.getElementById('bookNotes').value;

    const checked = document.querySelectorAll('input[name="bookingService"]:checked');
    const serviceIds = Array.from(checked).map(cb => parseInt(cb.value));

    if (serviceIds.length === 0) {
        alert("Iltimos, bemor uchun kamida 1 ta muolajani tanlang!");
        return;
    }

    const payload = {
        patient_id: patientId,
        appointment_date: appointmentDate,
        scheduled_time: scheduledTime,
        service_ids: serviceIds,
        notes: notes,
        force_over_limit: true // allow user to book if they intentionally proceeded
    };

    try {
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('bookAppointmentModal');
            document.getElementById('bookAppointmentForm').reset();
            calculateBookingLiveTotal();
            await loadQueueData();
            await loadDashboardStats();
            alert(`Muvaffaqiyatli! Bemor ${data.queue_number}-navbat raqami bilan yozildi.`);
        } else {
            alert(data.message || "Navbatga yozishda xatolik yuz berdi");
        }
    } catch (err) {
        console.error("Navbat yozishda xatolik:", err);
    }
}

// ================= PAYMENT & RECEIPT =================

// 20. Open Payment Modal
function openPaymentModal(appId, patientName, servicesStr, totalAmount) {
    selectedAppointmentForPayment = appId;
    document.getElementById('payModalPatient').textContent = patientName;
    document.getElementById('payModalServices').textContent = servicesStr;
    document.getElementById('payModalAmount').textContent = formatSum(totalAmount);
    openModal('paymentModal');
}

// 21. Confirm Payment and Print Receipt
async function confirmPaymentAndPrint() {
    if (!selectedAppointmentForPayment) return;
    const method = document.querySelector('input[name="payMethod"]:checked')?.value || 'naqd';

    try {
        const res = await fetch(`/api/appointments/${selectedAppointmentForPayment}/payment`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_status: 'tolangan',
                payment_method: method,
                notes: 'Kassada to\'langan'
            })
        });

        if (res.ok) {
            closeModal('paymentModal');
            await previewReceipt(selectedAppointmentForPayment);
            await loadQueueData();
            await loadDashboardStats();
        }
    } catch (err) {
        console.error("To'lovni tasdiqlashda xatolik:", err);
    }
}

// 22. Preview and Print Receipt
async function previewReceipt(appId) {
    try {
        const res = await fetch(`/api/receipt/${appId}`);
        const data = await res.json();

        document.getElementById('recReceiptNo').textContent = data.receipt_no;
        document.getElementById('recDateTime').textContent = data.date_time;
        document.getElementById('recQueueNo').textContent = data.queue_number;
        document.getElementById('recPatientName').textContent = data.patient.full_name;
        document.getElementById('recCardNo').textContent = data.patient.card_number;
        document.getElementById('recCategory').textContent = data.patient.category;

        const servicesTable = document.getElementById('recServicesList');
        servicesTable.innerHTML = data.services.map(s => `
            <tr>
                <td style="padding: 3px 0;">${s.service_name}</td>
                <td style="text-align: right; padding: 3px 0; font-weight: bold;">${formatSum(s.price)}</td>
            </tr>
        `).join('');

        document.getElementById('recTotalAmount').textContent = formatSum(data.total_amount);
        document.getElementById('recPaymentMethod').textContent = data.payment_method === 'naqd' ? 'Naqd pul' : (data.payment_method === 'karta' ? 'Bank kartasi' : 'Click / Payme');

        const printable = document.getElementById('printableReceipt');
        printable.classList.remove('hidden');
        window.scrollTo(0, 0);

    } catch (err) {
        console.error("Chekni chiqarishda xatolik:", err);
    }
}

function closeReceiptPreview() {
    document.getElementById('printableReceipt').classList.add('hidden');
}

// ================= MEDICAL RECORDS & AMBULATORY CARD =================

// 23. Load Medical Records Tab
async function loadMedicalRecords() {
    try {
        const searchVal = document.getElementById('medicalSearchInput')?.value || '';
        const res = await fetch(`/api/medical-records?q=${encodeURIComponent(searchVal)}`);
        const records = await res.json();

        const container = document.getElementById('medicalRecordsContainer');
        if (!container) return;

        if (records.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
                    <i class="fa-solid fa-notes-medical text-4xl mb-2 text-slate-300 block"></i>
                    Kasallik tarixi yozuvlari topilmadi.
                </div>
            `;
            return;
        }

        container.innerHTML = records.map(r => `
            <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover-lift">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                            <i class="fa-solid fa-stethoscope"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-900 text-base">${r.full_name}</h4>
                            <div class="text-xs text-slate-400 font-mono">${r.card_number} • ${r.phone} • ${r.age} yosh</div>
                        </div>
                    </div>
                    <div class="text-xs text-slate-500 flex items-center space-x-2">
                        <span><i class="fa-regular fa-calendar mr-1"></i> ${r.record_date}</span>
                        <span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">${r.doctor_name || 'Dr. Nilufar Karimova'}</span>
                    </div>
                </div>

                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div class="p-3 rounded-xl bg-slate-50">
                        <span class="font-bold text-slate-700 block uppercase mb-1 text-[10px]">Asosiy Shikoyatlar:</span>
                        <p class="text-slate-600">${r.complaints || 'Shikoyat kiritilmagan'}</p>
                    </div>
                    <div class="p-3 rounded-xl bg-slate-50">
                        <span class="font-bold text-slate-700 block uppercase mb-1 text-[10px]">Obyektiv Ko'rik / Ko'rsatkichlar:</span>
                        <p class="text-slate-600">${r.objective_findings || 'Ko\'rik o\'tkazilgan'}</p>
                    </div>
                </div>

                <div class="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                    <span class="font-bold text-emerald-900 block uppercase mb-0.5 text-[10px]">Klinik Tashxis:</span>
                    <p class="text-emerald-950 font-semibold text-sm">${r.diagnosis}</p>
                    ${r.prescribed_procedures ? `<p class="text-emerald-800 mt-1"><strong>Buyurilgan muolaja:</strong> ${r.prescribed_procedures}</p>` : ''}
                    ${r.recommendations ? `<p class="text-emerald-800 mt-1"><strong>Tavsiyalar:</strong> ${r.recommendations}</p>` : ''}
                </div>

                <div class="mt-3 flex justify-end space-x-2">
                    <button onclick="viewPatientDetail(${r.patient_id})" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                        <i class="fa-solid fa-folder-open mr-1"></i> To'liq kartani ko'rish
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Tibbiy qaydlarni yuklashda xatolik:", err);
    }
}

// 24. Open Add Record Modal for Current Patient
function openAddRecordForCurrentPatient() {
    if (!currentPatientDetail) return;
    openModal('newMedicalRecordModal');
    const select = document.getElementById('recordPatientSelect');
    if (select) select.value = currentPatientDetail.patient.id;
}

// 25. Submit Medical Record
async function submitMedicalRecord(e) {
    e.preventDefault();
    const payload = {
        patient_id: parseInt(document.getElementById('recordPatientSelect').value),
        record_date: document.getElementById('recordDate').value,
        complaints: document.getElementById('recordComplaints').value,
        objective_findings: document.getElementById('recordObjective').value,
        diagnosis: document.getElementById('recordDiagnosis').value,
        prescribed_procedures: document.getElementById('recordProcedures').value,
        recommendations: document.getElementById('recordRecommendations').value,
        doctor_name: "Dr. Nilufar Karimova"
    };

    try {
        const res = await fetch('/api/medical-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal('newMedicalRecordModal');
            document.getElementById('newMedicalRecordForm').reset();
            await loadMedicalRecords();
            if (currentPatientDetail) {
                await viewPatientDetail(currentPatientDetail.patient.id);
            }
            alert("Tibbiy qayd muvaffaqiyatli saqlandi!");
        }
    } catch (err) {
        console.error("Tibbiy qaydni saqlashda xatolik:", err);
    }
}

// 26. Print Ambulatory Medical Card
function printPatientMedicalCard() {
    if (!currentPatientDetail) return;
    const p = currentPatientDetail.patient;

    document.getElementById('printMedCardNo').textContent = p.card_number;
    document.getElementById('printMedName').textContent = p.full_name;
    document.getElementById('printMedAge').textContent = `${p.category === 'ayol' ? 'Ayol' : 'Bola'}, ${p.age} yosh`;
    document.getElementById('printMedPhone').textContent = p.phone;
    document.getElementById('printMedBlood').textContent = p.blood_group || 'Noma\'lum';
    document.getElementById('printMedAddress').textContent = p.address || 'Kiritilmagan';
    document.getElementById('printMedAllergies').textContent = p.allergies || 'Mavjud emas';

    const recordsContainer = document.getElementById('printMedRecordsBody');
    if (currentPatientDetail.medical_records.length === 0) {
        recordsContainer.innerHTML = `<p style="font-style: italic; color: #64748b;">Hozircha tibbiy qaydlar kiritilmagan.</p>`;
    } else {
        recordsContainer.innerHTML = currentPatientDetail.medical_records.map((r, i) => `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: bold; font-size: 11px; color: #065f46;">#${i+1}. Sana: ${r.record_date} • Shifokor: ${r.doctor_name || 'Dr. Nilufar Karimova'}</div>
                <div style="margin-top: 4px;"><strong>Tashxis:</strong> ${r.diagnosis}</div>
                ${r.complaints ? `<div style="margin-top: 2px;"><strong>Shikoyatlar:</strong> ${r.complaints}</div>` : ''}
                ${r.prescribed_procedures ? `<div style="margin-top: 2px;"><strong>Muolajalar:</strong> ${r.prescribed_procedures}</div>` : ''}
                ${r.recommendations ? `<div style="margin-top: 2px;"><strong>Tavsiyalar:</strong> ${r.recommendations}</div>` : ''}
            </div>
        `).join('');
    }

    document.getElementById('printableMedicalCard').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function closeMedCardPreview() {
    document.getElementById('printableMedicalCard').classList.add('hidden');
}

// ================= FINANCE & REVENUE REPORT =================

// 27. Load Finance Report Tab
async function loadFinanceReport() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('finTodayRev').textContent = formatSum(data.today.revenue);
        document.getElementById('finMonthRev').textContent = formatSum(data.month.revenue);
        document.getElementById('finAvgCheck').textContent = formatSum(data.month.avg_bill);
        document.getElementById('finMonthPatients').textContent = `${data.month.total_visits} nafar`;

        // Payment Methods breakdown
        const payList = document.getElementById('paymentMethodsList');
        if (payList) {
            const totalMonthly = data.month.revenue || 1;
            payList.innerHTML = data.payment_methods.map(pm => {
                const name = pm.payment_method === 'naqd' ? 'Naqd Pul' : (pm.payment_method === 'karta' ? 'Bank Kartasi (Humo/Uzcard)' : 'Click / Payme');
                const icon = pm.payment_method === 'naqd' ? 'fa-money-bill-wave text-emerald-600' : (pm.payment_method === 'karta' ? 'fa-credit-card text-blue-600' : 'fa-mobile-screen-button text-cyan-600');
                const percent = Math.round((pm.total_amount / totalMonthly) * 100);

                return `
                    <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div class="flex justify-between items-center mb-1">
                            <span class="flex items-center text-sm font-semibold text-slate-800">
                                <i class="fa-solid ${icon} mr-2"></i> ${name}
                            </span>
                            <span class="font-bold text-slate-900">${formatSum(pm.total_amount)} (${percent}%)</span>
                        </div>
                        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div class="bg-emerald-500 h-full rounded-full" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Services Finance Table
        const srvBody = document.getElementById('servicesFinanceTableBody');
        if (srvBody) {
            srvBody.innerHTML = data.services_breakdown.map(sb => `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="py-2.5 px-3 font-semibold text-slate-800">${sb.service_name}</td>
                    <td class="py-2.5 px-3 text-slate-600">${sb.session_count} seans</td>
                    <td class="py-2.5 px-3 text-right font-bold text-emerald-600">${formatSum(sb.total_sum)}</td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error("Moliya yuklashda xatolik:", err);
    }
}

// 28. Export Finance Data to CSV
function exportFinanceData() {
    let csv = "Xizmat Nomi,Narxi,Tarif,Tavsif\n";
    allServices.forEach(s => {
        csv += `"${s.name}",${s.price},"${s.category}","${s.description}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `shifo_nur_moliya_${getTodayDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printFinanceSummary() {
    window.print();
}

// ================= SERVICES TAB & CATALOG =================

// 29. Render Services Tab
function renderServicesTab() {
    const grid = document.getElementById('servicesCardGrid');
    if (!grid) return;

    const icons = {
        'Fizioterapiya': 'fa-person-walking',
        'Gidro vanna': 'fa-water',
        'Darsonval terapiya': 'fa-bolt',
        'Elektroforez': 'fa-wave-square',
        'Ignaterapiya': 'fa-wand-magic-sparkles',
        'Gelmentterapiya': 'fa-shield-virus'
    };

    grid.innerHTML = allServices.map(s => {
        const icon = icons[s.name] || 'fa-notes-medical';
        return `
            <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover-lift flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-3">
                        <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 font-mono">
                            ${s.duration_min} daqiqa
                        </span>
                    </div>
                    <h3 class="font-bold text-slate-900 text-lg">${s.name}</h3>
                    <p class="text-xs text-slate-500 mt-1 leading-relaxed">${s.description || 'Markazimizning ixtisoslashgan muolajasi'}</p>
                </div>

                <div class="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-slate-400 block">Belgilangan narx</span>
                        <span class="text-xl font-extrabold text-emerald-600">${formatSum(s.price)}</span>
                    </div>
                    <button onclick="openBookAppointmentModal()" class="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs transition">
                        Yozilish <i class="fa-solid fa-arrow-right ml-1"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 30. Reseed demo data
async function reseedDemoData() {
    if (!confirm("Haqiqatan ham namunaviy ma'lumotlarni qayta tiklamoqchimisiz?")) return;
    try {
        const res = await fetch('/api/seed-data', { method: 'POST' });
        if (res.ok) {
            alert("Namunaviy ma'lumotlar qayta yuklandi!");
            location.reload();
        }
    } catch (err) {
        console.error("Qayta yuklashda xatolik:", err);
    }
}

// ================= MODAL HELPERS =================

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function openNewPatientModal() {
    openModal('newPatientModal');
}

function openBookAppointmentModal() {
    checkDateCapacity();
    openModal('bookAppointmentModal');
}

function openNewMedicalRecordModal() {
    openModal('newMedicalRecordModal');
}

function toggleGenderOptions() {
    const cat = document.getElementById('patientCategory').value;
    const genderSelect = document.getElementById('patientGender');
    if (cat === 'ayol') {
        genderSelect.value = 'ayol';
    } else {
        genderSelect.value = 'ogil_bola';
    }
}
