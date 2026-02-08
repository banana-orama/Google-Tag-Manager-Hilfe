/**
 * GTM Container Optimizer - UI Controller
 * Handles all UI interactions and rendering
 */

class GTMUIController {
    constructor() {
        this.parser = null;
        this.optimizer = null;
        this.currentAnalysis = null;
        this.selectedIssues = new Set();
        this.currentTab = 'issues';
        this.currentFilter = 'all';
        this.originalFilename = null;
    }

    /**
     * Initialize UI
     */
    init() {
        this.bindEvents();
        this.setupDragDrop();
    }

    /**
     * Bind all UI events
     */
    bindEvents() {
        // File input
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        // JSON input
        document.getElementById('jsonInput').addEventListener('input', (e) => {
            this.handleJsonInput(e);
        });

        // Paste button
        document.getElementById('pasteBtn').addEventListener('click', () => {
            this.handlePaste();
        });

        // Analyze button
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.runAnalysis();
        });

        // Demo button
        document.getElementById('loadDemoBtn').addEventListener('click', () => {
            this.loadDemoData();
        });

        // Back button
        document.getElementById('backBtn').addEventListener('click', () => {
            this.showUploadSection();
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportOptimizedContainer();
        });

        // Audit report button
        document.getElementById('reportBtn')?.addEventListener('click', () => {
            this.exportAuditReport();
        });

        // Change log button
        document.getElementById('changeLogBtn')?.addEventListener('click', () => {
            this.exportChangeLog();
        });

        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget.dataset.tab);
            });
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.currentTarget.dataset.severity || e.currentTarget.dataset.category);
            });
        });

        // Select all issues
        document.getElementById('selectAllIssuesBtn')?.addEventListener('click', () => {
            this.toggleSelectAllIssues();
        });

        // Fix selected issues
        document.getElementById('fixSelectedBtn')?.addEventListener('click', () => {
            this.fixSelectedIssues();
        });

        // Modal
        document.getElementById('modalClose')?.addEventListener('click', () => {
            this.closeModal();
        });
        document.getElementById('modalBackdrop')?.addEventListener('click', () => {
            this.closeModal();
        });
        document.getElementById('modalCancel')?.addEventListener('click', () => {
            this.closeModal();
        });
        document.getElementById('modalAction')?.addEventListener('click', () => {
            this.applyModalAction();
        });
    }

    /**
     * Setup drag and drop
     */
    setupDragDrop() {
        const uploadSection = document.getElementById('uploadSection');
        const uploadCard = uploadSection?.querySelector('.upload-card');

        if (!uploadCard) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadCard.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadCard.addEventListener(eventName, () => {
                uploadCard.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadCard.addEventListener(eventName, () => {
                uploadCard.classList.remove('drag-over');
            });
        });

        uploadCard.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileDrop(files[0]);
            }
        });
    }

    /**
     * Handle file selection
     */
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = file.name;
            this.originalFilename = file.name;
            await this.loadFile(file);
        }
    }

    /**
     * Handle file drop
     */
    async handleFileDrop(file) {
        document.getElementById('fileName').textContent = file.name;
        this.originalFilename = file.name;
        await this.loadFile(file);
    }

    /**
     * Load file and parse
     */
    async loadFile(file) {
        try {
            const content = await readFileAsText(file);
            document.getElementById('jsonInput').value = content;
            this.validateAndEnableAnalyze();
        } catch (error) {
            this.showToast('error', 'Fehler', 'Die Datei konnte nicht gelesen werden.');
        }
    }

    /**
     * Handle JSON input
     */
    handleJsonInput(event) {
        this.validateAndEnableAnalyze();
    }

    /**
     * Handle paste
     */
    async handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            document.getElementById('jsonInput').value = text;
            this.validateAndEnableAnalyze();
            this.showToast('success', 'Eingefügt', 'Der JSON-Code wurde aus der Zwischenablage eingefügt.');
        } catch (error) {
            this.showToast('error', 'Fehler', 'Der Zugriff auf die Zwischenablage ist nicht möglich.');
        }
    }

    /**
     * Validate and enable analyze button
     */
    validateAndEnableAnalyze() {
        const jsonInput = document.getElementById('jsonInput').value.trim();
        const analyzeBtn = document.getElementById('analyzeBtn');

        if (jsonInput.length > 0) {
            try {
                const data = JSON.parse(jsonInput);
                if (data.containerVersion) {
                    analyzeBtn.disabled = false;
                    return;
                }
            } catch (e) {
                // Invalid JSON
            }
        }
        analyzeBtn.disabled = true;
    }

    /**
     * Load demo data
     */
    loadDemoData() {
        const demoData = this.generateDemoContainer();
        document.getElementById('jsonInput').value = JSON.stringify(demoData, null, 2);
        this.originalFilename = null;
        this.validateAndEnableAnalyze();
        this.showToast('success', 'Demo geladen', 'Demodaten wurden geladen. Klicke auf "Container analysieren".');
    }

    /**
     * Generate demo container for testing
     */
    generateDemoContainer() {
        return {
            "exportFormatVersion": 2,
            "exportTime": new Date().toISOString(),
            "containerVersion": {
                "path": "accounts/1234567890/containers/987654321/versions/1",
                "accountId": "1234567890",
                "containerId": "987654321",
                "containerVersionId": "1",
                "container": {
                    "path": "accounts/1234567890/containers/987654321",
                    "accountId": "1234567890",
                    "containerId": "987654321",
                    "name": "Demo Web Container",
                    "publicId": "GTM-DEMO01",
                    "usageContext": ["WEB"],
                    "fingerprint": "1234567890"
                },
                "tag": [
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "tagId": "1",
                        "name": "GA4 - Pageview",
                        "type": "gaawe",
                        "parameter": [
                            { "type": "BOOLEAN", "key": "sendEcommerceData", "value": "true" },
                            { "type": "TEMPLATE", "key": "eventName", "value": "page_view" },
                            { "type": "TEMPLATE", "key": "measurementId", "value": "G-XXXXXXXXXX" }
                        ],
                        "firingTriggerId": ["2147479553"],
                        "fingerprint": "1"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "tagId": "2",
                        "name": "Unused Tag - Should Delete",
                        "type": "html",
                        "parameter": [
                            { "type": "TEMPLATE", "key": "html", "value": "<!-- This tag is unused -->" }
                        ],
                        "firingTriggerId": [],
                        "fingerprint": "2"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "tagId": "3",
                        "name": "GA4 - Pageview Duplicate",
                        "type": "gaawe",
                        "parameter": [
                            { "type": "BOOLEAN", "key": "sendEcommerceData", "value": "true" },
                            { "type": "TEMPLATE", "key": "eventName", "value": "page_view" },
                            { "type": "TEMPLATE", "key": "measurementId", "value": "G-XXXXXXXXXX" }
                        ],
                        "firingTriggerId": ["2147479553"],
                        "fingerprint": "3"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "tagId": "4",
                        "name": "Legacy Universal Analytics",
                        "type": "ua",
                        "parameter": [
                            { "type": "TEMPLATE", "key": "trackingId", "value": "UA-12345-1" }
                        ],
                        "firingTriggerId": ["2147479553"],
                        "fingerprint": "4"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "tagId": "5",
                        "name": "Custom Script with eval",
                        "type": "html",
                        "parameter": [
                            { "type": "TEMPLATE", "key": "html", "value": "<script>eval('some code');</script>" }
                        ],
                        "firingTriggerId": ["2147479553"],
                        "fingerprint": "5"
                    }
                ],
                "trigger": [
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "triggerId": "2147479553",
                        "name": "All Pages",
                        "type": "PAGE_VIEW",
                        "filter": [],
                        "fingerprint": "1"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "triggerId": "2",
                        "name": "Unused Trigger",
                        "type": "CUSTOM_EVENT",
                        "customEventFilter": [
                            {
                                "type": "CONTAINS",
                                "parameter": [
                                    { "type": "TEMPLATE", "key": "arg0", "value": "{{_event}}" },
                                    { "type": "TEMPLATE", "key": "arg1", "value": "custom_event" }
                                ]
                            }
                        ],
                        "fingerprint": "2"
                    }
                ],
                "variable": [
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "variableId": "1",
                        "name": "Unused Variable",
                        "type": "jsm",
                        "parameter": [
                            { "type": "TEMPLATE", "key": "name", "value": "unusedData" }
                        ],
                        "fingerprint": "1"
                    },
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "variableId": "2",
                        "name": "page URL with spaces",
                        "type": "v",
                        "parameter": [
                            { "type": "TEMPLATE", "key": "name", "value": "pageURL" }
                        ],
                        "fingerprint": "2"
                    }
                ],
                "folder": [
                    {
                        "accountId": "1234567890",
                        "containerId": "987654321",
                        "folderId": "1",
                        "name": "Empty Folder",
                        "fingerprint": "1"
                    }
                ]
            }
        };
    }

    /**
     * Run analysis
     */
    runAnalysis() {
        const jsonInput = document.getElementById('jsonInput').value;

        this.showToast('info', 'Analysiere...', 'Der Container wird analysiert.');

        setTimeout(() => {
            try {
                // Initialize parser
                this.parser = new GTMParser();

                if (!this.parser.parse(jsonInput)) {
                    const errors = this.parser.getErrors();
                    this.showToast('error', 'Parse-Fehler', errors[0]?.message || 'Ungültiges Format');
                    return;
                }

                // Initialize optimizer
                this.optimizer = new GTMOptimizer(this.parser);

                // Run analysis
                this.currentAnalysis = this.optimizer.analyze();

                // Update UI
                this.showResultsSection();
                this.renderResults();

                this.showToast('success', 'Analyse abgeschlossen', 'Der Container wurde erfolgreich analysiert.');

            } catch (error) {
                console.error(error);
                this.showToast('error', 'Fehler', 'Die Analyse ist fehlgeschlagen.');
            }
        }, 100);
    }

    /**
     * Show upload section
     */
    showUploadSection() {
        document.getElementById('uploadSection').classList.remove('hidden');
        document.getElementById('resultsSection').classList.add('hidden');
        this.resetState();
    }

    /**
     * Show results section
     */
    showResultsSection() {
        document.getElementById('uploadSection').classList.add('hidden');
        document.getElementById('resultsSection').classList.remove('hidden');
    }

    /**
     * Reset state
     */
    resetState() {
        this.parser = null;
        this.optimizer = null;
        this.currentAnalysis = null;
        this.selectedIssues.clear();
        this.originalFilename = null;
    }

    /**
     * Render results
     */
    renderResults() {
        const analysis = this.currentAnalysis;
        const info = analysis.containerInfo;

        // Update container info
        document.getElementById('containerName').textContent = info.name;
        document.getElementById('containerId').textContent = info.containerPublicId;
        document.getElementById('sourceFilename').textContent = this.originalFilename || '-';
        document.getElementById('exportDate').textContent = formatDate(new Date());

        // Update scores
        const scores = analysis.scores;
        this.animateScore('overallScore', scores.overall);
        this.updateScoreFill('overallScoreFill', scores.overall);

        this.animateScore('cleanupScore', scores.cleanup);
        this.animateScore('performanceScore', scores.performance);
        this.animateScore('structureScore', scores.structure);
        this.animateScore('securityScore', scores.security);
        this.animateScore('ssgScore', scores.ssgReadiness);

        // Update badges
        document.getElementById('issuesBadge').textContent = analysis.issues.length;
        document.getElementById('suggestionsBadge').textContent = analysis.suggestions.length;
        document.getElementById('changesBadge').textContent = '0';

        // Render inventory
        this.renderInventory(info);

        // Render issues
        this.renderIssues(analysis.issues);

        // Render suggestions
        this.renderSuggestions(analysis.suggestions);

        // Render SSG tab
        this.renderSSGTab();

        // Reset changes
        this.renderChanges([]);
    }

    /**
     * Animate score
     */
    animateScore(elementId, targetScore) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const duration = 1000;
        const start = 0;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3); // ease out cubic
            const currentScore = Math.round(start + (targetScore - start) * easeProgress);

            element.textContent = currentScore;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Update score fill
     */
    updateScoreFill(elementId, score) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.width = score + '%';
        }
    }

    /**
     * Render inventory
     */
    renderInventory(info) {
        document.getElementById('tagCount').textContent = info.tagCount;
        document.getElementById('triggerCount').textContent = info.triggerCount;
        document.getElementById('variableCount').textContent = info.variableCount;
        document.getElementById('templateCount').textContent = info.templateCount;

        // Render tag inventory
        const tags = this.parser.getTags();
        this.renderInventoryList('tagInventory', tags, 'tag');

        // Render trigger inventory
        const triggers = this.parser.getTriggers();
        this.renderInventoryList('triggerInventory', triggers, 'trigger');

        // Render variable inventory
        const variables = this.parser.getVariables();
        this.renderInventoryList('variableInventory', variables, 'variable');

        // Render template inventory
        const templates = this.parser.getTemplates();
        this.renderInventoryList('templateInventory', templates, 'template');
    }

    /**
     * Render inventory list
     */
    renderInventoryList(containerId, items, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div class="inventory-empty">Keine Elemente</div>';
            return;
        }

        container.innerHTML = items.map(item => {
            const typeLabel = getTagType ? getTagType(item) : item.type;
            const status = this.getItemStatus(item);

            return `
                <div class="inventory-item">
                    <span class="inventory-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                    <div class="inventory-item-meta">
                        <span class="inventory-item-type">${typeLabel}</span>
                        <span class="status-badge ${status.class}">${status.label}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Get item status
     */
    getItemStatus(item) {
        // Check if unused
        const unused = {
            tag: this.parser.getUnusedTags(),
            trigger: this.parser.getUnusedTriggers(),
            variable: this.parser.getUnusedVariables()
        };

        const typeMap = {
            'tag': 'tag',
            'trigger': 'trigger',
            'variable': 'variable'
        };

        const itemType = typeMap[item.tagId ? 'tag' : item.triggerId ? 'trigger' : 'variable'];

        if (itemType && unused[itemType]) {
            if (unused[itemType].some(u => u.path === item.path)) {
                return { class: 'unused', label: 'Ungenutzt' };
            }
        }

        return { class: 'ok', label: 'OK' };
    }

    /**
     * Render issues
     */
    renderIssues(issues) {
        const container = document.getElementById('issuesList');
        if (!container) return;

        const filteredIssues = this.filterIssues(issues);

        if (filteredIssues.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Probleme gefunden! 🎉</div>';
            return;
        }

        container.innerHTML = filteredIssues.map(issue => `
            <div class="issue-card" data-issue-id="${issue.id}" data-severity="${issue.severity}">
                <input type="checkbox" class="issue-checkbox" ${issue.fixable ? '' : 'disabled'}
                       ${this.selectedIssues.has(issue.id) ? 'checked' : ''}
                       data-issue-id="${issue.id}">
                <div class="issue-content">
                    <div class="issue-header">
                        <span class="issue-title">${escapeHtml(issue.title)}</span>
                        <span class="issue-severity ${issue.severity}">${getSeverityLabel(issue.severity)}</span>
                    </div>
                    <p class="issue-description">${escapeHtml(issue.description)}</p>
                    <div class="issue-location">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        ${escapeHtml(issue.location)}
                    </div>
                </div>
                <div class="issue-actions">
                    ${issue.fixable ? `
                        <button class="btn btn-sm" onclick="UI.showIssueDetails('${issue.id}')">
                            Details
                        </button>
                    ` : `
                        <span class="issue-not-fixable">Manuell erforderlich</span>
                    `}
                </div>
            </div>
        `).join('');

        // Bind checkbox events
        container.querySelectorAll('.issue-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedIssues.add(e.target.dataset.issueId);
                } else {
                    this.selectedIssues.delete(e.target.dataset.issueId);
                }
                this.updateChangesBadge();
            });
        });
    }

    /**
     * Filter issues
     */
    filterIssues(issues) {
        if (this.currentFilter === 'all') return issues;
        return issues.filter(issue => issue.severity === this.currentFilter);
    }

    /**
     * Render suggestions
     */
    renderSuggestions(suggestions) {
        const container = document.getElementById('suggestionsList');
        if (!container) return;

        if (suggestions.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Vorschläge!</div>';
            return;
        }

        container.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion-card">
                <div class="suggestion-header">
                    <div class="suggestion-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="suggestion-title">${escapeHtml(suggestion.title)}</h3>
                        <span class="suggestion-impact ${suggestion.impact}">${this.getImpactLabel(suggestion.impact)}</span>
                    </div>
                </div>
                <p class="suggestion-description">${escapeHtml(suggestion.description)}</p>
                ${suggestion.recommendation ? `
                    <p><strong>Empfehlung:</strong> ${escapeHtml(suggestion.recommendation)}</p>
                ` : ''}
                ${suggestion.steps ? `
                    <div class="suggestion-steps">
                        <h4>Schritte:</h4>
                        <ol>
                            ${suggestion.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                        </ol>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Get impact label
     */
    getImpactLabel(impact) {
        const labels = {
            'high': 'Hohe Auswirkung',
            'medium': 'Mittlere Auswirkung',
            'low': 'Geringe Auswirkung'
        };
        return labels[impact] || impact;
    }

    /**
     * Render SSG tab
     */
    renderSSGTab() {
        if (!this.optimizer) return;

        const migrationPlan = this.optimizer.prepareSSGMigration();
        this.renderSSGVendorOptions(migrationPlan);

        // Render migration steps
        const stepsContainer = document.getElementById('migrationSteps');
        if (stepsContainer) {
            stepsContainer.innerHTML = migrationPlan.migrationSteps.map(step => `
                <div class="migration-step">
                    <div class="migration-step-number">${step.step}</div>
                    <div class="migration-step-content">
                        <h4>${escapeHtml(step.title)}</h4>
                        <p>${escapeHtml(step.description)}</p>
                        <small>Dauer: ${escapeHtml(step.duration)}</small>
                    </div>
                </div>
            `).join('');
        }

    }

    /**
     * Render vendor selection options for SSG
     */
    renderSSGVendorOptions(migrationPlan) {
        const container = document.getElementById('ssgVendorOptions');
        if (!container) return;

        const vendors = migrationPlan.vendorsDetected || [];
        if (vendors.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Anbieter erkannt.</div>';
            return;
        }

        container.innerHTML = vendors.map(v => `
            <label class="ssg-vendor-option ${v.supported ? '' : 'disabled'}">
                <input type="checkbox" data-vendor="${escapeHtml(v.key)}" ${v.supported ? 'checked' : 'disabled'}>
                <span class="ssg-vendor-name">${escapeHtml(v.label)}</span>
                ${v.supported ? '' : '<span class="ssg-vendor-note">nicht unterstützt</span>'}
            </label>
        `).join('');
    }

    /**
     * Render changes
     */
    renderChanges(changes) {
        const container = document.getElementById('changesList');
        if (!container) return;

        const summary = {
            delete: changes.filter(c => c.type === 'delete').length,
            modify: changes.filter(c => c.type === 'modify').length,
            create: changes.filter(c => c.type === 'create').length
        };

        document.getElementById('deleteCount').textContent = summary.delete;
        document.getElementById('modifyCount').textContent = summary.modify;
        document.getElementById('createCount').textContent = summary.create;

        if (changes.length === 0) {
            container.innerHTML = '<div class="empty-state">Keine Änderungen geplant. Wähle Probleme aus, um sie zu beheben.</div>';
            return;
        }

        container.innerHTML = changes.map(change => `
            <div class="change-item ${change.type}">
                <span class="change-type ${change.type}">${change.type}</span>
                <div class="change-details">
                    <div class="change-name">${escapeHtml(change.entity?.name || 'Unknown')}</div>
                    <div class="change-reason">${escapeHtml(change.reason)}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update changes badge
     */
    updateChangesBadge() {
        document.getElementById('changesBadge').textContent = this.selectedIssues.size;
    }

    /**
     * Switch tab
     */
    switchTab(tabId) {
        this.currentTab = tabId;

        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === tabId + 'Tab');
        });
    }

    /**
     * Set filter
     */
    setFilter(filter) {
        this.currentFilter = filter;

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const value = btn.dataset.severity || btn.dataset.category;
            btn.classList.toggle('active', value === filter || (filter === 'all' && value === 'all'));
        });

        // Re-render issues
        if (this.currentAnalysis) {
            this.renderIssues(this.currentAnalysis.issues);
        }
    }

    /**
     * Toggle select all issues
     */
    toggleSelectAllIssues() {
        const checkboxes = document.querySelectorAll('.issue-checkbox:not(:disabled)');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
            if (!allChecked) {
                this.selectedIssues.add(cb.dataset.issueId);
            } else {
                this.selectedIssues.delete(cb.dataset.issueId);
            }
        });

        this.updateChangesBadge();
    }

    /**
     * Fix selected issues
     */
    fixSelectedIssues() {
        if (this.selectedIssues.size === 0) {
            this.showToast('warning', 'Keine Auswahl', 'Bitte wähle mindestens ein Problem aus.');
            return;
        }

        const result = this.optimizer.applyFixes(Array.from(this.selectedIssues));

        this.renderChanges(result.changes);

        this.showToast(
            'success',
            'Änderungen geplant',
            `${result.changes.length} Änderungen wurden geplant.`
        );

        // Switch to changes tab
        this.switchTab('changes');
    }

    /**
     * Export optimized container
     */
    exportOptimizedContainer() {
        if (!this.optimizer) return;

        this.showToast('info', 'Erstelle Export...', 'Der optimierte Container wird erstellt.');

        setTimeout(() => {
            const optimized = this.optimizer.generateOptimizedContainer({
                removeUnused: true,
                deduplicate: true
            });

            const filename = this.originalFilename || `GTM-${this.parser.getContainerInfo().containerPublicId}-optimized.json`;
            downloadJson(optimized, filename);

            this.showToast('success', 'Export erfolgreich', 'Der optimierte Container wurde heruntergeladen.');
        }, 500);
    }

    /**
     * Export audit report (HTML)
     */
    exportAuditReport() {
        if (!this.currentAnalysis || !this.parser) {
            this.showToast('warning', 'Kein Audit', 'Bitte zuerst einen Container analysieren.');
            return;
        }

        const info = this.currentAnalysis.containerInfo;
        const scores = this.currentAnalysis.scores;
        const issues = this.currentAnalysis.issues || [];
        const suggestions = this.currentAnalysis.suggestions || [];
        const unused = this.currentAnalysis.unused || { tags: [], triggers: [], variables: [] };
        const duplicates = this.currentAnalysis.duplicates || { tags: [], triggers: [], variables: [] };

        const beforeCounts = this.getEntityCounts(this.parser.getContainer());
        const optimized = this.optimizer.generateOptimizedContainer({
            removeUnused: true,
            deduplicate: true
        });
        const afterCounts = this.getEntityCounts(optimized);

        const changeLog = this.buildAutoCleanupChangeLog();

        const reportHtml = this.buildAuditReportHtml({
            info,
            scores,
            beforeCounts,
            afterCounts,
            unused,
            duplicates,
            issues,
            suggestions,
            changeLog
        });

        const filename = `${this.getBaseFilename()}-audit-report.html`;
        downloadText(reportHtml, filename, 'text/html');
        this.showToast('success', 'Report erstellt', 'Der Audit-Report wurde heruntergeladen.');
    }

    /**
     * Export change log (JSON)
     */
    exportChangeLog() {
        if (!this.currentAnalysis || !this.parser) {
            this.showToast('warning', 'Kein Audit', 'Bitte zuerst einen Container analysieren.');
            return;
        }

        const changeLog = this.buildAutoCleanupChangeLog();
        const payload = {
            generatedAt: new Date().toISOString(),
            sourceFilename: this.originalFilename || null,
            container: this.currentAnalysis.containerInfo,
            changes: changeLog
        };

        const filename = `${this.getBaseFilename()}-change-log.json`;
        downloadJson(payload, filename);
        this.showToast('success', 'Change-Log erstellt', 'Das Änderungsprotokoll wurde heruntergeladen.');
    }

    /**
     * Build auto-cleanup change log (unused + deduplication)
     * @returns {Array} Change log entries
     */
    buildAutoCleanupChangeLog() {
        const changes = [];
        const unused = this.currentAnalysis?.unused || { tags: [], triggers: [], variables: [] };

        for (const tag of unused.tags || []) {
            changes.push({
                type: 'delete',
                entityType: 'tag',
                entity: tag,
                reason: 'Ungenutzter Tag'
            });
        }
        for (const trigger of unused.triggers || []) {
            changes.push({
                type: 'delete',
                entityType: 'trigger',
                entity: trigger,
                reason: 'Ungenutzter Trigger'
            });
        }
        for (const variable of unused.variables || []) {
            changes.push({
                type: 'delete',
                entityType: 'variable',
                entity: variable,
                reason: 'Ungenutzte Variable'
            });
        }

        const deduplicator = new GTMDeduplicator(this.parser);
        const dedupResults = deduplicator.deduplicate();
        changes.push(...(dedupResults.changes || []));

        return changes;
    }

    /**
     * Get base filename for exports
     * @returns {string}
     */
    getBaseFilename() {
        const name = this.originalFilename || `GTM-${this.parser.getContainerInfo().containerPublicId}`;
        return name.replace(/\.json$/i, '');
    }

    /**
     * Get counts of entities in a container
     * @param {Object} container
     * @returns {Object}
     */
    getEntityCounts(container) {
        const version = container?.containerVersion || {};
        return {
            tags: (version.tag || []).filter(t => !t.liveOnly).length,
            triggers: (version.trigger || []).filter(t => !t.liveOnly).length,
            variables: (version.variable || []).filter(v => !v.liveOnly).length,
            folders: (version.folder || []).length,
            templates: (version.customTemplate || []).length
        };
    }

    /**
     * Build audit report HTML
     * @param {Object} data
     * @returns {string}
     */
    buildAuditReportHtml(data) {
        const {
            info,
            scores,
            beforeCounts,
            afterCounts,
            unused,
            duplicates,
            issues,
            suggestions,
            changeLog
        } = data;

        const issueRows = issues.map(i => `
            <tr>
                <td>${escapeHtml(i.severity || '')}</td>
                <td>${escapeHtml(i.category || '')}</td>
                <td>${escapeHtml(i.title || '')}</td>
                <td>${escapeHtml(i.description || '')}</td>
            </tr>
        `).join('');

        const suggestionRows = suggestions.map(s => `
            <tr>
                <td>${escapeHtml(s.priority || '')}</td>
                <td>${escapeHtml(s.category || '')}</td>
                <td>${escapeHtml(s.title || '')}</td>
                <td>${escapeHtml(s.description || '')}</td>
            </tr>
        `).join('');

        const changeRows = (changeLog || []).map(c => `
            <tr>
                <td>${escapeHtml(c.type || '')}</td>
                <td>${escapeHtml(c.entityType || '')}</td>
                <td>${escapeHtml(c.entity?.name || '')}</td>
                <td>${escapeHtml(c.reason || '')}</td>
            </tr>
        `).join('');

        return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GTM Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; margin: 24px; }
    h1, h2 { margin: 0 0 8px; }
    .meta { margin-bottom: 16px; color: #444; }
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
    .card h3 { margin: 0 0 8px; font-size: 14px; color: #666; }
    .card .value { font-size: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
    th { background: #f6f6f6; text-align: left; }
    .small { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>GTM Audit Report</h1>
  <div class="meta">
    <div><strong>Container:</strong> ${escapeHtml(info?.name || '')}</div>
    <div><strong>Public ID:</strong> ${escapeHtml(info?.containerPublicId || '')}</div>
    <div><strong>Datei:</strong> ${escapeHtml(this.originalFilename || '-')}</div>
    <div><strong>Exportzeit:</strong> ${escapeHtml(new Date().toISOString())}</div>
  </div>

  <h2>Scores</h2>
  <div class="grid">
    <div class="card"><h3>Gesamt</h3><div class="value">${scores?.overall ?? 0}</div></div>
    <div class="card"><h3>Cleanup</h3><div class="value">${scores?.cleanup ?? 0}</div></div>
    <div class="card"><h3>Performance</h3><div class="value">${scores?.performance ?? 0}</div></div>
    <div class="card"><h3>Security</h3><div class="value">${scores?.security ?? 0}</div></div>
    <div class="card"><h3>SSG</h3><div class="value">${scores?.ssgReadiness ?? 0}</div></div>
  </div>

  <h2>Bestand (Vorher/Nachher)</h2>
  <table>
    <thead><tr><th>Typ</th><th>Vorher</th><th>Nachher (Auto-Cleanup)</th></tr></thead>
    <tbody>
      <tr><td>Tags</td><td>${beforeCounts.tags}</td><td>${afterCounts.tags}</td></tr>
      <tr><td>Trigger</td><td>${beforeCounts.triggers}</td><td>${afterCounts.triggers}</td></tr>
      <tr><td>Variablen</td><td>${beforeCounts.variables}</td><td>${afterCounts.variables}</td></tr>
      <tr><td>Ordner</td><td>${beforeCounts.folders}</td><td>${afterCounts.folders}</td></tr>
      <tr><td>Templates</td><td>${beforeCounts.templates}</td><td>${afterCounts.templates}</td></tr>
    </tbody>
  </table>

  <h2>Unused & Duplicates</h2>
  <div class="small">Unused: Tags ${unused.tags?.length || 0}, Trigger ${unused.triggers?.length || 0}, Variablen ${unused.variables?.length || 0}</div>
  <div class="small">Duplikate: Tags ${duplicates.tags?.length || 0}, Trigger ${duplicates.triggers?.length || 0}, Variablen ${duplicates.variables?.length || 0}</div>

  <h2>Issues</h2>
  <table>
    <thead><tr><th>Severity</th><th>Category</th><th>Titel</th><th>Beschreibung</th></tr></thead>
    <tbody>${issueRows || '<tr><td colspan="4">Keine Issues</td></tr>'}</tbody>
  </table>

  <h2>Empfehlungen</h2>
  <table>
    <thead><tr><th>Priorität</th><th>Category</th><th>Titel</th><th>Beschreibung</th></tr></thead>
    <tbody>${suggestionRows || '<tr><td colspan="4">Keine Empfehlungen</td></tr>'}</tbody>
  </table>

  <h2>Auto-Cleanup Change-Log</h2>
  <table>
    <thead><tr><th>Aktion</th><th>Typ</th><th>Name</th><th>Grund</th></tr></thead>
    <tbody>${changeRows || '<tr><td colspan="4">Keine Änderungen</td></tr>'}</tbody>
  </table>
</body>
</html>`;
    }

    /**
     * Generate and display SSG containers
     */
    exportSSGContainers() {
        if (!this.optimizer) return;

        this.showToast('info', 'Generiere...', 'Der Server-Side Container wird erstellt.');

        setTimeout(() => {
            try {
                const selectedVendors = this.getSelectedSSGVendors();
                const bundle = this.optimizer.generateSSGExportBundle(selectedVendors);

                // Store for later download
                this.ssgExportBundle = bundle;

                // Show summary
                this.renderSSGExportSummary(bundle.summary);

                this.showToast('success', 'Fertig!', 'Server-Side Container wurde generiert.');
            } catch (error) {
                console.error('SSG Generation Error:', error);
                this.showToast('error', 'Fehler', 'Der Server-Side Container konnte nicht erstellt werden: ' + error.message);
            }
        }, 200);
    }

    /**
     * Get selected vendors for SSG export
     * @returns {Array<string>}
     */
    getSelectedSSGVendors() {
        const selected = [];
        document.querySelectorAll('#ssgVendorOptions input[type="checkbox"]:checked')
            .forEach(cb => selected.push(cb.dataset.vendor));
        return selected;
    }

    /**
     * Render SSG export summary
     */
    renderSSGExportSummary(summary) {
        const container = document.getElementById('ssgExportResults');
        if (!container) return;

        container.classList.remove('hidden');

        // Build tag mapping table
        let tagMappingHtml = '';
        if (summary.tagMapping && summary.tagMapping.length > 0) {
            tagMappingHtml = `
                <div class="ssg-mapping-section">
                    <h4>Tag-Zuordnung (Client → Server)</h4>
                    <div class="ssg-mapping-list">
                        ${summary.tagMapping.map(m => `
                            <div class="ssg-mapping-item">
                                <span class="ssg-mapping-original">${escapeHtml(m.original)}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                    <polyline points="12 5 19 12 12 19"/>
                                </svg>
                                <span class="ssg-mapping-server">${escapeHtml(m.serverSide)}</span>
                                <span class="ssg-mapping-type">${escapeHtml(m.type)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Build placeholders list
        let placeholdersHtml = '';
        if (summary.placeholders && summary.placeholders.length > 0) {
            placeholdersHtml = `
                <div class="ssg-placeholder-section">
                    <h4>Auszufuellende Platzhalter</h4>
                    <p class="ssg-placeholder-hint">Diese Konstanten muessen nach dem Import im Server-Container mit den richtigen Werten befuellt werden:</p>
                    <div class="ssg-placeholder-list">
                        ${summary.placeholders.map(p => `
                            <div class="ssg-placeholder-item">
                                <span class="ssg-placeholder-name">{{${escapeHtml(p.name)}}}</span>
                                <span class="ssg-placeholder-value">${escapeHtml(p.placeholder)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="ssg-export-summary">
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.tagsCreated}</span>
                    <span class="stat-label">Tags</span>
                </div>
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.triggersCreated}</span>
                    <span class="stat-label">Trigger</span>
                </div>
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.constantsCreated}</span>
                    <span class="stat-label">Konstanten</span>
                </div>
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.eventDataVarsCreated}</span>
                    <span class="stat-label">Event-Data Var.</span>
                </div>
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.clientsCreated}</span>
                    <span class="stat-label">Clients</span>
                </div>
                <div class="ssg-export-stat">
                    <span class="stat-value">${summary.templatesCreated || 0}</span>
                    <span class="stat-label">Templates</span>
                </div>
            </div>

            ${tagMappingHtml}
            ${placeholdersHtml}

            <div class="ssg-export-actions">
                <button class="btn btn-primary btn-large" onclick="UI.downloadServerContainer()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Server-Container herunterladen
                </button>
                <button class="btn btn-success btn-large" onclick="UI.downloadModifiedClientContainer()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Client-Container (SSG-ready) herunterladen
                </button>
            </div>
        `;
    }

    /**
     * Download server-side container
     */
    downloadServerContainer() {
        if (!this.ssgExportBundle) {
            this.showToast('error', 'Fehler', 'Bitte zuerst den Server-Side Container generieren.');
            return;
        }

        const info = this.parser.getContainerInfo();
        const filename = `${this.getBaseFilename()}-server-side.json`;
        downloadJson(this.ssgExportBundle.serverContainer, filename);
        this.showToast('success', 'Download', 'Server-Side Container wurde heruntergeladen.');
    }

    /**
     * Download modified client container
     */
    downloadModifiedClientContainer() {
        if (!this.ssgExportBundle) {
            this.showToast('error', 'Fehler', 'Bitte zuerst den Server-Side Container generieren.');
            return;
        }

        const info = this.parser.getContainerInfo();
        const filename = this.originalFilename || `GTM-${info.containerPublicId}-client-ssg-ready.json`;
        downloadJson(this.ssgExportBundle.clientContainer, filename);
        this.showToast('success', 'Download', 'Client-Container (SSG-ready) wurde heruntergeladen.');
    }

    /**
     * Show issue details
     */
    showIssueDetails(issueId) {
        const issue = this.currentAnalysis?.issues.find(i => i.id === issueId);
        if (!issue) return;

        document.getElementById('modalTitle').textContent = issue.title;
        document.getElementById('modalBody').innerHTML = `
            <div class="issue-details">
                <p><strong>Beschreibung:</strong> ${escapeHtml(issue.description)}</p>
                <p><strong>Schweregrad:</strong> ${getSeverityLabel(issue.severity)}</p>
                <p><strong>Kategorie:</strong> ${getCategoryLabel(issue.category)}</p>
                <p><strong>Ort:</strong> <code>${escapeHtml(issue.location)}</code></p>
                ${issue.recommendation ? `<p><strong>Empfehlung:</strong> ${escapeHtml(issue.recommendation)}</p>` : ''}
            </div>
        `;

        document.getElementById('modal').classList.remove('hidden');
    }

    /**
     * Close modal
     */
    closeModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    /**
     * Apply modal action
     */
    applyModalAction() {
        // Implementation depends on modal context
        this.closeModal();
    }

    /**
     * Show toast notification
     */
    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
            warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
        };

        toast.innerHTML = `
            <svg class="toast-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${icons[type] || icons.info}
            </svg>
            <div class="toast-content">
                <div class="toast-title">${escapeHtml(title)}</div>
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        container.appendChild(toast);

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        });

        // Auto remove
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
}

// Global UI instance
const UI = new GTMUIController();
