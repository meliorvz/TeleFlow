/**
 * TeleFlow - Frontend JavaScript
 */

// State
const state = {
    currentPage: 'dashboard',
    conversations: [],
    allConversations: [],
    selectedRecipients: new Set(),
    ws: null,
};

// API Helper
async function api(method, path, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`/api${path}`, options);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Request failed');
    }

    return response.json();
}

// Navigation
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    state.currentPage = page;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'conversations': 'Conversations',
        'reports': 'Reports',
        'bulk-send': 'Bulk Send',
        'import-export': 'Import / Export',
        'settings': 'Settings',
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    // Load page data
    loadPageData(page);
}

async function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'conversations':
            await loadConversations();
            break;
        case 'reports':
            await loadReports();
            break;
        case 'bulk-send':
            await loadBulkSendRecipients();
            break;
        case 'settings':
            await loadSettings();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const status = await api('GET', '/status');

        document.getElementById('stat-conversations').textContent = status.conversations_count;
        document.getElementById('stat-unread').textContent = status.unread_count;
        document.getElementById('stat-caught-up').textContent = status.caught_up_at
            ? formatDate(status.caught_up_at)
            : 'Never';
        document.getElementById('stat-llm').textContent = status.llm_enabled ? 'Enabled' : 'Disabled';

        // Update connection status
        updateConnectionStatus(status.telegram_connected);

        // Show auth modal if not connected
        if (!status.telegram_connected) {
            document.getElementById('auth-modal').classList.remove('hidden');
        }

        // Load latest report
        const reportData = await api('GET', '/reports/latest');
        renderLatestReport(reportData.report);
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

function renderLatestReport(report) {
    const container = document.getElementById('latest-report');

    if (!report || !report.data) {
        container.innerHTML = '<p class="empty-state">No reports yet. Generate one to get started.</p>';
        return;
    }

    const data = report.data;
    let html = '';

    // Reply Now section
    if (data.sections.reply_now && data.sections.reply_now.length > 0) {
        html += `
            <div class="report-section">
                <div class="report-section-title">
                    <span>🔴</span> Reply Now (${data.sections.reply_now.length})
                </div>
                ${data.sections.reply_now.map(item => renderReportItem(item, 'high')).join('')}
            </div>
        `;
    }

    // Review section
    if (data.sections.review && data.sections.review.length > 0) {
        html += `
            <div class="report-section">
                <div class="report-section-title">
                    <span>🟡</span> Review (${data.sections.review.length})
                </div>
                ${data.sections.review.map(item => renderReportItem(item, 'medium')).join('')}
            </div>
        `;
    }

    // Low priority section
    if (data.sections.low_priority && data.sections.low_priority.length > 0) {
        html += `
            <div class="report-section">
                <div class="report-section-title">
                    <span>🟢</span> Low Priority (${data.sections.low_priority.length})
                </div>
                ${data.sections.low_priority.map(item => renderReportItem(item, 'low')).join('')}
            </div>
        `;
    }

    if (!html) {
        html = '<p class="empty-state">All caught up! 🎉</p>';
    }

    container.innerHTML = html;
}

function renderReportItem(item, urgencyClass) {
    return `
        <div class="report-item">
            <div class="report-item-header">
                <span class="report-item-name">${escapeHtml(item.display_name)}</span>
                <span class="urgency-score urgency-${urgencyClass}">${item.urgency_score}</span>
            </div>
            <div class="report-item-summary">${escapeHtml(item.summary)}</div>
            <div class="report-item-reasoning">${escapeHtml(item.reasoning)}</div>
        </div>
    `;
}

// Conversations
async function loadConversations() {
    const container = document.getElementById('conversations-list');
    container.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const params = new URLSearchParams();

        const search = document.getElementById('search-input').value;
        if (search) params.set('search', search);

        const priority = document.getElementById('filter-priority').value;
        if (priority) params.set('priority', priority);

        if (document.getElementById('filter-unread').checked) {
            params.set('unread_only', 'true');
        }

        if (document.getElementById('filter-vip').checked) {
            params.set('is_vip', 'true');
        }

        const data = await api('GET', `/conversations?${params.toString()}`);
        state.conversations = data.conversations;

        if (data.conversations.length === 0) {
            container.innerHTML = '<p class="empty-state">No conversations found</p>';
            return;
        }

        container.innerHTML = data.conversations.map(conv => renderConversationCard(conv)).join('');

        // Add event listeners
        container.querySelectorAll('.toggle-thread').forEach(btn => {
            btn.addEventListener('click', () => toggleThreadSection(btn.dataset.uuid));
        });

        container.querySelectorAll('.toggle-reply').forEach(btn => {
            btn.addEventListener('click', () => toggleReplySection(btn.dataset.uuid));
        });

        container.querySelectorAll('.send-reply').forEach(btn => {
            btn.addEventListener('click', () => sendReply(btn.dataset.uuid));
        });

        container.querySelectorAll('.toggle-vip').forEach(btn => {
            btn.addEventListener('click', () => toggleVip(btn.dataset.uuid));
        });
    } catch (error) {
        container.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
    }
}

function renderConversationCard(conv) {
    const badges = [];
    if (conv.is_vip) badges.push('<span class="badge badge-vip">VIP</span>');
    if (conv.priority === 'high') badges.push('<span class="badge badge-priority-high">High</span>');
    if (conv.priority === 'low') badges.push('<span class="badge badge-priority-low">Low</span>');
    if (conv.unread_count > 0) badges.push(`<span class="badge badge-unread">${conv.unread_count}</span>`);

    return `
        <div class="conversation-card" data-uuid="${conv.uuid}">
            <div class="conversation-header">
                <div>
                    <div class="conversation-name">${escapeHtml(conv.display_name)}</div>
                    ${conv.username ? `<div class="conversation-username">@${escapeHtml(conv.username)}</div>` : ''}
                </div>
                <div class="conversation-badges">${badges.join('')}</div>
            </div>
            <div class="conversation-preview">${escapeHtml(conv.last_message_preview || '')}</div>
            <div class="conversation-actions">
                <button class="btn btn-sm btn-secondary toggle-thread" data-uuid="${conv.uuid}">View Thread</button>
                <button class="btn btn-sm btn-secondary toggle-reply" data-uuid="${conv.uuid}">Reply</button>
                <button class="btn btn-sm btn-secondary toggle-vip" data-uuid="${conv.uuid}">
                    ${conv.is_vip ? 'Remove VIP' : 'Mark VIP'}
                </button>
            </div>
            <div class="thread-section hidden" id="thread-${conv.uuid}">
                <div class="thread-messages" id="thread-messages-${conv.uuid}">
                    <p class="empty-state">Loading messages...</p>
                </div>
            </div>
            <div class="reply-section hidden" id="reply-${conv.uuid}">
                <div class="reply-input">
                    <input type="text" class="input" id="reply-text-${conv.uuid}" placeholder="Type your reply...">
                    <button class="btn btn-primary send-reply" data-uuid="${conv.uuid}">Send</button>
                </div>
            </div>
        </div>
    `;
}

function toggleReplySection(uuid) {
    const section = document.getElementById(`reply-${uuid}`);
    section.classList.toggle('hidden');
}

async function toggleThreadSection(uuid) {
    const section = document.getElementById(`thread-${uuid}`);
    const messagesDiv = document.getElementById(`thread-messages-${uuid}`);

    section.classList.toggle('hidden');

    // Load messages if showing
    if (!section.classList.contains('hidden')) {
        try {
            const data = await api('GET', `/conversations/${uuid}/messages?limit=20`);

            if (data.messages.length === 0) {
                messagesDiv.innerHTML = '<p class="empty-state">No cached messages. Try syncing.</p>';
                return;
            }

            // Reverse to show oldest first
            const messages = data.messages.reverse();

            messagesDiv.innerHTML = messages.map(m => `
                <div class="thread-message">
                    <div class="thread-message-header">
                        <span class="thread-sender">${escapeHtml(m.sender_name || 'Unknown')}</span>
                        <span class="thread-time">${formatDate(m.date)}</span>
                    </div>
                    <div class="thread-text">${escapeHtml(m.text || '[Media]')}</div>
                </div>
            `).join('');
        } catch (error) {
            messagesDiv.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
        }
    }
}

async function sendReply(uuid) {
    const input = document.getElementById(`reply-text-${uuid}`);
    const text = input.value.trim();

    if (!text) return;

    try {
        await api('POST', `/conversations/${uuid}/reply`, { text });
        input.value = '';
        showToast('Reply sent!');
    } catch (error) {
        showToast('Failed to send: ' + error.message);
    }
}

async function toggleVip(uuid) {
    const conv = state.conversations.find(c => c.uuid === uuid);
    if (!conv) return;

    try {
        await api('PATCH', `/conversations/${uuid}`, { is_vip: !conv.is_vip });
        await loadConversations(); // Reload
    } catch (error) {
        showToast('Failed to update: ' + error.message);
    }
}

// Reports
async function loadReports() {
    const container = document.getElementById('reports-list');
    container.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const data = await api('GET', '/reports');

        if (data.reports.length === 0) {
            container.innerHTML = '<p class="empty-state">No reports yet</p>';
            return;
        }

        container.innerHTML = data.reports.map(report => `
            <div class="card" style="margin-bottom: 12px;">
                <h3>Report #${report.id}</h3>
                <p>Generated: ${formatDate(report.created_at)}</p>
                <p>Covers since: ${formatDate(report.covers_since)}</p>
                <button class="btn btn-secondary btn-sm" onclick="viewReport(${report.id})">View</button>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
    }
}

async function viewReport(id) {
    try {
        const data = await api('GET', `/reports/${id}`);
        renderLatestReport(data.report);
        navigateTo('dashboard');
    } catch (error) {
        showToast('Failed to load report');
    }
}

// Bulk Send
async function loadBulkSendRecipients() {
    const container = document.getElementById('bulk-recipients-list');
    container.innerHTML = '<p class="empty-state">Loading...</p>';

    state.selectedRecipients.clear();
    updateSelectedCount();

    try {
        const data = await api('GET', '/conversations?limit=200');

        state.allConversations = data.conversations; // Store for ID matching

        container.innerHTML = data.conversations.map(conv => `
            <div class="recipient-item" data-uuid="${conv.uuid}">
                <input type="checkbox" id="recv-${conv.uuid}">
                <label for="recv-${conv.uuid}">${escapeHtml(conv.display_name)}</label>
            </div>
        `).join('');

        container.querySelectorAll('.recipient-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                }
                toggleRecipient(item.dataset.uuid);
            });
        });
    } catch (error) {
        container.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
    }
}

function toggleRecipient(uuid) {
    if (state.selectedRecipients.has(uuid)) {
        state.selectedRecipients.delete(uuid);
    } else {
        state.selectedRecipients.add(uuid);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = state.selectedRecipients.size;
    document.getElementById('selected-count').textContent = count;
    document.getElementById('bulk-next-1').disabled = count === 0;
}

// Bulk Send Wizard Steps
document.getElementById('bulk-next-1')?.addEventListener('click', () => {
    document.getElementById('bulk-step-1').classList.add('hidden');
    document.getElementById('bulk-step-2').classList.remove('hidden');
});

document.getElementById('bulk-back-2')?.addEventListener('click', () => {
    document.getElementById('bulk-step-2').classList.add('hidden');
    document.getElementById('bulk-step-1').classList.remove('hidden');
});

document.getElementById('bulk-preview')?.addEventListener('click', async () => {
    const template = document.getElementById('bulk-template').value;

    if (!template.trim()) {
        showToast('Please enter a message template');
        return;
    }

    try {
        const data = await api('POST', '/bulk-send/preview', {
            conversation_uuids: Array.from(state.selectedRecipients),
            template,
        });

        const previewList = document.getElementById('bulk-preview-list');
        previewList.innerHTML = data.recipients.map(r => `
            <div class="preview-item">
                <div class="preview-item-name">${escapeHtml(r.display_name)}</div>
                <div class="preview-item-message">${escapeHtml(r.rendered_message)}</div>
            </div>
        `).join('');

        document.getElementById('confirm-code').textContent = data.confirmation_code;

        document.getElementById('bulk-step-2').classList.add('hidden');
        document.getElementById('bulk-step-3').classList.remove('hidden');
    } catch (error) {
        showToast('Preview failed: ' + error.message);
    }
});

document.getElementById('bulk-back-3')?.addEventListener('click', () => {
    document.getElementById('bulk-step-3').classList.add('hidden');
    document.getElementById('bulk-step-2').classList.remove('hidden');
});

document.getElementById('confirm-input')?.addEventListener('input', (e) => {
    const expected = document.getElementById('confirm-code').textContent;
    document.getElementById('bulk-send').disabled = e.target.value !== expected;
});

document.getElementById('bulk-send')?.addEventListener('click', async () => {
    const template = document.getElementById('bulk-template').value;
    const confirmCode = document.getElementById('confirm-input').value;

    try {
        await api('POST', '/bulk-send/execute', {
            conversation_uuids: Array.from(state.selectedRecipients),
            template,
            confirmation_code: confirmCode,
        });

        showToast('Bulk send started!');

        // Reset wizard
        document.getElementById('bulk-step-3').classList.add('hidden');
        document.getElementById('bulk-step-1').classList.remove('hidden');
        document.getElementById('bulk-template').value = '';
        document.getElementById('confirm-input').value = '';
        state.selectedRecipients.clear();
        loadBulkSendRecipients();
    } catch (error) {
        showToast('Failed: ' + error.message);
    }
});

// Bulk Send - Load IDs from textarea
document.getElementById('bulk-load-ids')?.addEventListener('click', async () => {
    const idsInput = document.getElementById('bulk-ids-input').value.trim();
    if (!idsInput) {
        showToast('Please enter some IDs');
        return;
    }

    // Parse IDs (comma or newline separated)
    const ids = idsInput.split(/[,\n]/).map(id => id.trim()).filter(id => id);

    // Try to match with loaded conversations
    const container = document.getElementById('bulk-recipients-list');
    const items = container.querySelectorAll('.recipient-item');
    let matchCount = 0;

    items.forEach(item => {
        const uuid = item.dataset.uuid;
        const checkbox = item.querySelector('input[type="checkbox"]');

        // Match by UUID or by chat ID (tg_id)
        const conv = state.conversations?.find(c => c.uuid === uuid);
        const tgIdMatch = conv && ids.includes(String(conv.tg_id));
        const uuidMatch = ids.includes(uuid);

        if (uuidMatch || tgIdMatch) {
            checkbox.checked = true;
            state.selectedRecipients.add(uuid);
            matchCount++;
        }
    });

    updateSelectedCount();
    showToast(`Loaded ${matchCount} of ${ids.length} IDs`);
});

// Participant export by chat
document.getElementById('export-participants-by-chat')?.addEventListener('click', async () => {
    const chatsInput = document.getElementById('export-participants-chats').value.trim();
    if (!chatsInput) {
        showToast('Please enter chat UUIDs');
        return;
    }

    const chatIds = chatsInput.split(/[,\n]/).map(id => id.trim()).filter(id => id);

    try {
        const response = await fetch(`/api/csv/participants/by-chats?chat_uuids=${encodeURIComponent(chatIds.join(','))}`);

        if (!response.ok) {
            throw new Error('Export failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'participants_by_chat.csv';
        a.click();
        URL.revokeObjectURL(url);

        showToast('Export downloaded!');
    } catch (error) {
        showToast('Export failed: ' + error.message);
    }
});

// Settings
async function loadSettings() {
    try {
        const status = await api('GET', '/status');
        const config = await api('GET', '/config');

        // Telegram settings
        document.getElementById('telegram-settings').innerHTML = status.telegram_connected
            ? `<p>✅ Connected as ${status.user?.first_name || 'Unknown'} (@${status.user?.username || 'N/A'})</p>`
            : `<p>⚠️ Not connected</p><button class="btn btn-primary" onclick="showAuthModal()">Connect</button>`;

        // LLM settings
        document.getElementById('llm-settings').innerHTML = config.llm_enabled
            ? `<p>✅ Enabled (${config.llm_model})</p><p>Report cadence: ${config.report_cadence}</p>`
            : `<p>⚠️ Not configured. Set OPENROUTER_API_KEY in config.env</p>`;
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Auth
function showAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

document.getElementById('auth-phone-btn')?.addEventListener('click', async () => {
    const phone = document.getElementById('auth-phone').value;

    try {
        const data = await api('POST', '/auth/start', { phone });

        if (data.status === 'already_authorized') {
            document.getElementById('auth-modal').classList.add('hidden');
            loadDashboard();
            return;
        }

        document.getElementById('auth-step-phone').classList.add('hidden');
        document.getElementById('auth-step-code').classList.remove('hidden');
    } catch (error) {
        document.getElementById('auth-error').textContent = error.message;
        document.getElementById('auth-error').classList.remove('hidden');
    }
});

document.getElementById('auth-code-btn')?.addEventListener('click', async () => {
    const code = document.getElementById('auth-code').value;

    try {
        const data = await api('POST', '/auth/code', { code });

        if (data.status === '2fa_required') {
            document.getElementById('auth-step-code').classList.add('hidden');
            document.getElementById('auth-step-2fa').classList.remove('hidden');
            return;
        }

        document.getElementById('auth-modal').classList.add('hidden');
        loadDashboard();
    } catch (error) {
        document.getElementById('auth-error').textContent = error.message;
        document.getElementById('auth-error').classList.remove('hidden');
    }
});

document.getElementById('auth-2fa-btn')?.addEventListener('click', async () => {
    const password = document.getElementById('auth-password').value;

    try {
        await api('POST', '/auth/2fa', { password });
        document.getElementById('auth-modal').classList.add('hidden');
        loadDashboard();
    } catch (error) {
        document.getElementById('auth-error').textContent = error.message;
        document.getElementById('auth-error').classList.remove('hidden');
    }
});

// Actions
document.getElementById('sync-btn')?.addEventListener('click', async () => {
    try {
        await api('POST', '/sync');
        showToast('Sync started...');
    } catch (error) {
        showToast('Sync failed: ' + error.message);
    }
});

document.getElementById('caught-up-btn')?.addEventListener('click', async () => {
    try {
        await api('POST', '/caught-up');
        showToast('Marked as caught up!');
        loadDashboard();
    } catch (error) {
        showToast('Failed: ' + error.message);
    }
});

document.getElementById('generate-report-btn')?.addEventListener('click', async () => {
    try {
        await api('POST', '/reports/generate');
        showToast('Report generation started...');
    } catch (error) {
        showToast('Failed: ' + error.message);
    }
});

document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear the message cache?')) return;

    try {
        await api('DELETE', '/cache/messages');
        showToast('Cache cleared!');
    } catch (error) {
        showToast('Failed: ' + error.message);
    }
});

// CSV Import
document.getElementById('import-conversations')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/csv/conversations/import', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        const resultDiv = document.getElementById('import-result');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
            <h3>Import Result</h3>
            <p>Imported: ${data.imported}</p>
            <p>Skipped: ${data.skipped}</p>
            ${data.errors.length > 0 ? `<p>Errors: ${data.errors.join(', ')}</p>` : ''}
        `;
    } catch (error) {
        showToast('Import failed: ' + error.message);
    }

    e.target.value = '';
});

document.getElementById('import-participants')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/csv/participants/import', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        const resultDiv = document.getElementById('import-result');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = `
            <h3>Import Result</h3>
            <p>Imported: ${data.imported}</p>
            <p>Skipped: ${data.skipped}</p>
            ${data.errors.length > 0 ? `<p>Errors: ${data.errors.join(', ')}</p>` : ''}
        `;
    } catch (error) {
        showToast('Import failed: ' + error.message);
    }

    e.target.value = '';
});

// Filters
document.getElementById('search-input')?.addEventListener('input', debounce(loadConversations, 300));
document.getElementById('filter-priority')?.addEventListener('change', loadConversations);
document.getElementById('filter-unread')?.addEventListener('change', loadConversations);
document.getElementById('filter-vip')?.addEventListener('change', loadConversations);

// WebSocket
function initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'job_update') {
            handleJobUpdate(data.job);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(initWebSocket, 3000);
    };

    state.ws = ws;
}

function handleJobUpdate(job) {
    const toast = document.getElementById('job-toast');
    const message = document.getElementById('job-message');
    const progress = document.getElementById('job-progress');

    if (job.status === 'running') {
        toast.classList.remove('hidden');
        message.textContent = job.progress_message || `${job.type}...`;

        if (job.progress_total > 0) {
            const percent = (job.progress_current / job.progress_total) * 100;
            progress.style.width = `${percent}%`;
        }
    } else if (job.status === 'completed') {
        message.textContent = `${job.type} completed!`;
        progress.style.width = '100%';

        setTimeout(() => {
            toast.classList.add('hidden');
            progress.style.width = '0%';
        }, 2000);

        // Refresh current page
        loadPageData(state.currentPage);
    } else if (job.status === 'failed') {
        message.textContent = `${job.type} failed: ${job.error}`;

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 5000);
    }
}

// Utilities
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-status');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('span:last-child');

    dot.classList.toggle('connected', connected);
    text.textContent = connected ? 'Connected' : 'Disconnected';
}

function showToast(message) {
    const toast = document.getElementById('job-toast');
    const messageEl = document.getElementById('job-message');

    messageEl.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initWebSocket();
    loadDashboard();
});
