/**
 * GTM Container Optimizer - Main Optimizer
 * Coordinates all optimization operations
 */

class GTMOptimizer {
    constructor(parser) {
        this.parser = parser;
        this.rulesEngine = new GTMRulesEngine(parser);
        this.deduplicator = new GTMDeduplicator(parser);
        this.ssgPrep = new GTMServerSidePrep(parser);
        this.changes = [];
        this.optimizationLog = [];
    }

    /**
     * Run full optimization analysis
     * @param {Object} options - Optimization options
     * @returns {Object} Full analysis results
     */
    analyze(options = {}) {
        const {
            checkUnused = true,
            checkDuplicates = true,
            checkBestPractices = true,
            checkSSGReadiness = true
        } = options;

        // Run rules engine
        const analysis = this.rulesEngine.analyze();

        // Collect additional info
        const info = this.parser.getContainerInfo();
        const duplicates = this.parser.findDuplicates();
        const unused = {
            tags: this.parser.getUnusedTags(),
            triggers: this.parser.getUnusedTriggers(),
            variables: this.parser.getUnusedVariables()
        };

        return {
            ...analysis,
            containerInfo: info,
            duplicates,
            unused,
            recommendations: this.generateRecommendations(analysis)
        };
    }

    /**
     * Generate optimization recommendations
     * @param {Object} analysis - Analysis results
     * @returns {Array} Recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        const { issues, scores } = analysis;

        // Generate recommendations based on scores
        if (scores.performance < 70) {
            recommendations.push({
                priority: 'high',
                category: 'performance',
                title: 'Performance-Optimierung durchführen',
                description: 'Der Container hat einen niedrigen Performance-Score. Es sollten unnötige Tags entfernt und Trigger optimiert werden.',
                estimatedImpact: 'Hoch'
            });
        }

        if (scores.cleanup < 70) {
            recommendations.push({
                priority: 'high',
                category: 'cleanup',
                title: 'Container bereinigen',
                description: 'Es gibt viele ungenutzte oder doppelte Elemente, die entfernt werden sollten.',
                estimatedImpact: 'Mittel'
            });
        }

        if (scores.privacy < 70) {
            recommendations.push({
                priority: 'critical',
                category: 'privacy',
                title: 'Datenschutz-Konformität verbessern',
                description: 'Es fehlt ein Consent-Management oder PII-Daten werden nicht korrekt behandelt.',
                estimatedImpact: 'Kritisch'
            });
        }

        if (scores.ssgReadiness < 60) {
            recommendations.push({
                priority: 'medium',
                category: 'migration',
                title: 'Auf Server-Side GTM vorbereiten',
                description: 'Der Container ist nicht gut für eine Migration zu Server-Side GTM vorbereitet.',
                estimatedImpact: 'Mittel'
            });
        }

        return recommendations;
    }

    /**
     * Apply selected fixes
     * @param {Array} selectedIssueIds - IDs of issues to fix
     * @returns {Object} Modified container and changes
     */
    applyFixes(selectedIssueIds) {
        this.changes = [];
        const container = deepClone(this.parser.getContainer());

        // Get all issues
        const analysis = this.rulesEngine.analyze();
        const issuesToFix = analysis.issues.filter(issue =>
            selectedIssueIds.includes(issue.id)
        );

        // Apply fixes
        for (const issue of issuesToFix) {
            if (!issue.fixable) continue;

            switch (issue.action) {
                case 'delete':
                    this.applyDelete(container, issue);
                    break;
                case 'deduplicate':
                    this.applyDeduplication(container, issue);
                    break;
                case 'modify':
                    this.applyModify(container, issue);
                    break;
            }
        }

        return {
            container,
            changes: this.changes,
            summary: this.getChangesSummary()
        };
    }

    /**
     * Apply delete action
     * @param {Object} container - Container to modify
     * @param {Object} issue - Issue to fix
     */
    applyDelete(container, issue) {
        const version = container.containerVersion;

        switch (issue.type) {
            case 'tag':
                if (version.tag) {
                    const index = version.tag.findIndex(t => t.path === issue.location);
                    if (index !== -1) {
                        const removed = version.tag.splice(index, 1)[0];
                        this.changes.push({
                            type: 'delete',
                            entityType: 'tag',
                            entity: removed,
                            reason: issue.title
                        });
                    }
                }
                break;

            case 'trigger':
                if (version.trigger) {
                    const index = version.trigger.findIndex(t => t.path === issue.location);
                    if (index !== -1) {
                        const removed = version.trigger.splice(index, 1)[0];
                        this.changes.push({
                            type: 'delete',
                            entityType: 'trigger',
                            entity: removed,
                            reason: issue.title
                        });
                    }
                }
                break;

            case 'variable':
                if (version.variable) {
                    const index = version.variable.findIndex(v => v.path === issue.location);
                    if (index !== -1) {
                        const removed = version.variable.splice(index, 1)[0];
                        this.changes.push({
                            type: 'delete',
                            entityType: 'variable',
                            entity: removed,
                            reason: issue.title
                        });
                    }
                }
                break;

            case 'folder':
                if (version.folder) {
                    const index = version.folder.findIndex(f => f.path === issue.location);
                    if (index !== -1) {
                        const removed = version.folder.splice(index, 1)[0];
                        this.changes.push({
                            type: 'delete',
                            entityType: 'folder',
                            entity: removed,
                            reason: issue.title
                        });
                    }
                }
                break;

            case 'template':
                if (version.customTemplate) {
                    const index = version.customTemplate.findIndex(t => t.templateId === issue.entity.templateId);
                    if (index !== -1) {
                        const removed = version.customTemplate.splice(index, 1)[0];
                        this.changes.push({
                            type: 'delete',
                            entityType: 'template',
                            entity: removed,
                            reason: issue.title
                        });
                    }
                }
                break;
        }
    }

    /**
     * Apply deduplication
     * @param {Object} container - Container to modify
     * @param {Object} issue - Issue to fix
     */
    applyDeduplication(container, issue) {
        const dedupResults = this.deduplicator.deduplicate();

        // Apply the deduplication results to container
        const modified = this.deduplicator.applyToContainer(container);

        // Copy changes back
        Object.assign(container, modified);
        this.changes.push(...dedupResults.changes);
    }

    /**
     * Apply modification
     * @param {Object} container - Container to modify
     * @param {Object} issue - Issue to fix
     */
    applyModify(container, issue) {
        // Implementation depends on specific modification
        // This is a placeholder for future modifications
    }

    /**
     * Get summary of all changes
     * @returns {Object} Changes summary
     */
    getChangesSummary() {
        const summary = {
            total: this.changes.length,
            byType: {
                tag: { delete: 0, modify: 0, create: 0 },
                trigger: { delete: 0, modify: 0, create: 0 },
                variable: { delete: 0, modify: 0, create: 0 },
                folder: { delete: 0, modify: 0, create: 0 },
                template: { delete: 0, modify: 0, create: 0 }
            }
        };

        for (const change of this.changes) {
            if (summary.byType[change.entityType]) {
                summary.byType[change.entityType][change.type]++;
            }
        }

        return summary;
    }

    /**
     * Prepare for Server-Side GTM migration
     * @returns {Object} Migration plan and SSG container structure
     */
    prepareSSGMigration() {
        return this.ssgPrep.generateMigrationPlan();
    }

    /**
     * Generate optimized container with all fixes applied
     * @param {Object} options - Optimization options
     * @returns {Object} Optimized container
     */
    generateOptimizedContainer(options = {}) {
        const {
            removeUnused = true,
            deduplicate = true,
            addDescriptions = false,
            organizeFolders = false
        } = options;

        let container = deepClone(this.parser.getContainer());
        const version = container.containerVersion;

        // Remove unused elements
        if (removeUnused) {
            const unused = {
                tags: this.parser.getUnusedTags(),
                triggers: this.parser.getUnusedTriggers(),
                variables: this.parser.getUnusedVariables()
            };

            // Remove unused tags
            if (version.tag && unused.tags.length > 0) {
                const unusedPaths = new Set(unused.tags.map(t => t.path));
                version.tag = version.tag.filter(t => !unusedPaths.has(t.path));
            }

            // Remove unused triggers
            if (version.trigger && unused.triggers.length > 0) {
                const unusedPaths = new Set(unused.triggers.map(t => t.path));
                version.trigger = version.trigger.filter(t => !unusedPaths.has(t.path));
            }

            // Remove unused variables
            if (version.variable && unused.variables.length > 0) {
                const unusedPaths = new Set(unused.variables.map(v => v.path));
                version.variable = version.variable.filter(v => !unusedPaths.has(v.path));
            }
        }

        // Deduplicate
        if (deduplicate) {
            const deduplicator = new GTMDeduplicator(this.parser);
            const deduped = deduplicator.applyToContainer(container);
            Object.assign(container, deduped);
        }

        // Update container version info
        version.containerVersionId = this.generateNewVersionId(version.containerVersionId);
        version.fingerprint = this.generateNewFingerprint();

        return container;
    }

    /**
     * Generate new version ID
     * @param {string} currentId - Current version ID
     * @returns {string} New version ID
     */
    generateNewVersionId(currentId) {
        // GTM version IDs are timestamps
        const match = currentId?.match(/(\d+)/);
        if (match) {
            const current = parseInt(match[1]);
            return currentId.replace(/\d+/, Date.now().toString());
        }
        return Date.now().toString();
    }

    /**
     * Generate new fingerprint
     * @returns {string} New fingerprint
     */
    generateNewFingerprint() {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * Generate Server-Side GTM container
     * @returns {Object} Server-side container JSON
     */
    generateSSGContainer(selectedVendors = []) {
        const analysis = this.ssgPrep.analyzeContainerForSSG();
        analysis.selectedVendors = Array.isArray(selectedVendors) ? selectedVendors : [];
        const generator = new GTMServerSideGenerator(this.parser, analysis);
        return generator.generate();
    }

    /**
     * Generate SSG export bundle (server + modified client container)
     * @returns {Object} Bundle with serverContainer, clientContainer, and summary
     */
    generateSSGExportBundle(selectedVendors = []) {
        const analysis = this.ssgPrep.analyzeContainerForSSG();
        analysis.selectedVendors = Array.isArray(selectedVendors) ? selectedVendors : [];
        const generator = new GTMServerSideGenerator(this.parser, analysis);

        const serverContainer = generator.generate();
        const clientContainer = generator.generateModifiedClientContainer();
        const summary = generator.getSummary();

        return {
            serverContainer,
            clientContainer,
            summary
        };
    }

    /**
     * Generate comparison report
     * @param {Object} original - Original container
     * @param {Object} optimized - Optimized container
     * @returns {Object} Comparison report
     */
    generateComparisonReport(original, optimized) {
        const origVersion = original.containerVersion;
        const optVersion = optimized.containerVersion;

        return {
            original: {
                tags: origVersion.tag?.filter(t => !t.liveOnly).length || 0,
                triggers: origVersion.trigger?.filter(t => !t.liveOnly).length || 0,
                variables: origVersion.variable?.filter(v => !v.liveOnly).length || 0,
                folders: origVersion.folder?.length || 0,
                templates: origVersion.customTemplate?.length || 0
            },
            optimized: {
                tags: optVersion.tag?.filter(t => !t.liveOnly).length || 0,
                triggers: optVersion.trigger?.filter(t => !t.liveOnly).length || 0,
                variables: optVersion.variable?.filter(v => !v.liveOnly).length || 0,
                folders: optVersion.folder?.length || 0,
                templates: optVersion.customTemplate?.length || 0
            },
            reductions: {
                tags: (origVersion.tag?.length || 0) - (optVersion.tag?.length || 0),
                triggers: (origVersion.trigger?.length || 0) - (optVersion.trigger?.length || 0),
                variables: (origVersion.variable?.length || 0) - (optVersion.variable?.length || 0)
            }
        };
    }
}
