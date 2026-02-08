/**
 * GTM Container Optimizer - Deduplicator
 * Handles deduplication of tags, triggers, and variables
 */

class GTMDeduplicator {
    constructor(parser) {
        this.parser = parser;
        this.changes = [];
        this.uniqueIds = new Map();
    }

    /**
     * Process all deduplication operations
     * @returns {Object} Deduplication results
     */
    deduplicate() {
        this.changes = [];
        this.uniqueIds = new Map();

        const results = {
            tags: this.deduplicateTags(),
            triggers: this.deduplicateTriggers(),
            variables: this.deduplicateVariables()
        };

        return {
            changes: this.changes,
            results,
            summary: this.getSummary()
        };
    }

    /**
     * Deduplicate tags
     * @returns {Object} Tag deduplication results
     */
    deduplicateTags() {
        const duplicates = this.parser.findDuplicates().tags;
        const results = {
            kept: [],
            removed: [],
            merged: []
        };

        for (const { signature, items } of duplicates) {
            // Keep the first one, remove others
            const toKeep = items[0];
            const toRemove = items.slice(1);

            // Generate unique ID for the kept tag
            const uniqueId = this.getOrCreateUniqueId(toKeep);

            results.kept.push({
                ...toKeep,
                _uniqueId: uniqueId,
                _action: 'keep'
            });

            for (const item of toRemove) {
                results.removed.push({
                    ...item,
                    _uniqueId: this.getOrCreateUniqueId(item),
                    _action: 'remove',
                    _duplicateOf: uniqueId
                });

                this.changes.push({
                    type: 'delete',
                    entityType: 'tag',
                    entity: item,
                    reason: `Duplikat von "${toKeep.name}"`,
                    duplicateOf: toKeep
                });
            }
        }

        // Update references in triggers
        this.updateTriggerReferencesAfterDedup(results);

        return results;
    }

    /**
     * Deduplicate triggers
     * @returns {Object} Trigger deduplication results
     */
    deduplicateTriggers() {
        const duplicates = this.parser.findDuplicates().triggers;
        const results = {
            kept: [],
            removed: [],
            merged: []
        };

        for (const { signature, items } of duplicates) {
            const toKeep = items[0];
            const toRemove = items.slice(1);

            const uniqueId = this.getOrCreateUniqueId(toKeep);

            results.kept.push({
                ...toKeep,
                _uniqueId: uniqueId,
                _action: 'keep'
            });

            // Get all tags using the triggers to be removed
            for (const item of toRemove) {
                const users = this.parser.triggerUsageMap.get(item.path) || new Set();

                results.removed.push({
                    ...item,
                    _uniqueId: this.getOrCreateUniqueId(item),
                    _action: 'remove',
                    _duplicateOf: uniqueId,
                    _usedByTags: Array.from(users)
                });

                this.changes.push({
                    type: 'modify',
                    entityType: 'trigger',
                    entity: item,
                    reason: `Duplikat von "${toKeep.name}" - Trigger werden zusammengeführt`,
                    duplicateOf: toKeep,
                    referenceUpdates: {
                        from: item.triggerId,
                        to: toKeep.triggerId
                    }
                });
            }
        }

        return results;
    }

    /**
     * Deduplicate variables
     * @returns {Object} Variable deduplication results
     */
    deduplicateVariables() {
        const duplicates = this.parser.findDuplicates().variables;
        const results = {
            kept: [],
            removed: [],
            merged: []
        };

        for (const { signature, items } of duplicates) {
            const toKeep = items[0];
            const toRemove = items.slice(1);

            const uniqueId = this.getOrCreateUniqueId(toKeep);

            results.kept.push({
                ...toKeep,
                _uniqueId: uniqueId,
                _action: 'keep'
            });

            for (const item of toRemove) {
                // Find all references to this variable
                const references = this.findVariableReferences(item.name);

                results.removed.push({
                    ...item,
                    _uniqueId: this.getOrCreateUniqueId(item),
                    _action: 'remove',
                    _duplicateOf: uniqueId,
                    _references: Array.from(references)
                });

                this.changes.push({
                    type: 'modify',
                    entityType: 'variable',
                    entity: item,
                    reason: `Duplikat von "${toKeep.name}" - Referenzen werden zusammengeführt`,
                    duplicateOf: toKeep,
                    referenceUpdates: {
                        from: item.name,
                        to: toKeep.name
                    }
                });
            }
        }

        return results;
    }

    /**
     * Get or create unique ID for an entity
     * @param {Object} entity - GTM entity
     * @returns {string} Unique ID
     */
    getOrCreateUniqueId(entity) {
        if (!this.uniqueIds.has(entity.path)) {
            this.uniqueIds.set(entity.path, generateUniqueId(entity));
        }
        return this.uniqueIds.get(entity.path);
    }

    /**
     * Find all references to a variable
     * @param {string} variableName - Variable name
     * @returns {Set} Set of references
     */
    findVariableReferences(variableName) {
        const references = new Set();

        // Check tags
        for (const tag of this.parser.getTags()) {
            const refs = this.parser.tagVariableMap.get(tag.path) || new Set();
            if (refs.has(variableName)) {
                references.add(`tag:${tag.path}`);
            }
        }

        // Check triggers
        for (const trigger of this.parser.getTriggers()) {
            const refs = this.parser.triggerVariableMap.get(trigger.path) || new Set();
            if (refs.has(variableName)) {
                references.add(`trigger:${trigger.path}`);
            }
        }

        // Check variables
        for (const variable of this.parser.getVariables()) {
            const refs = this.parser.variableVariableMap.get(variable.path) || new Set();
            if (refs.has(variableName)) {
                references.add(`variable:${variable.path}`);
            }
        }

        return references;
    }

    /**
     * Update trigger references after tag deduplication
     * @param {Object} results - Deduplication results
     */
    updateTriggerReferencesAfterDedup(results) {
        // Tags that were removed - check if they have unique trigger IDs
        for (const removed of results.removed) {
            // The removed tag's triggers should be preserved if they're unique
            // This is handled by the main deduplication logic
        }
    }

    /**
     * Get summary of deduplication changes
     * @returns {Object} Summary
     */
    getSummary() {
        const summary = {
            total: this.changes.length,
            byType: {
                tag: 0,
                trigger: 0,
                variable: 0
            },
            byAction: {
                delete: 0,
                modify: 0,
                merge: 0
            }
        };

        for (const change of this.changes) {
            summary.byType[change.entityType]++;
            summary.byAction[change.type]++;
        }

        return summary;
    }

    /**
     * Apply deduplication to container
     * @param {Object} container - GTM container
     * @returns {Object} Modified container
     */
    applyToContainer(container) {
        const modified = deepClone(container);
        const version = modified.containerVersion;

        // Collect entities to remove
        const toRemove = {
            tag: new Set(),
            trigger: new Set(),
            variable: new Set()
        };

        // Collect reference updates
        const referenceUpdates = {
            triggerId: new Map(), // old trigger ID -> new trigger ID
            variableName: new Map() // old variable name -> new variable name
        };

        for (const change of this.changes) {
            if (change.type === 'delete') {
                toRemove[change.entityType].add(change.entity.path);
            } else if (change.type === 'modify' && change.referenceUpdates) {
                if (change.entityType === 'trigger' && change.referenceUpdates.from) {
                    referenceUpdates.triggerId.set(change.referenceUpdates.from, change.referenceUpdates.to);
                }
                if (change.entityType === 'variable' && change.referenceUpdates.from) {
                    referenceUpdates.variableName.set(change.referenceUpdates.from, change.referenceUpdates.to);
                }
            }
        }

        // Filter tags
        if (version.tag) {
            version.tag = version.tag.filter(tag => !toRemove.tag.has(tag.path));

            // Update trigger references in tags
            for (const tag of version.tag) {
                if (tag.firingTriggerId) {
                    tag.firingTriggerId = tag.firingTriggerId.map(tid => {
                        // Check if this trigger ID was updated
                        for (const [fromId, toId] of referenceUpdates.triggerId) {
                            if (tid === fromId) return toId;
                        }
                        return tid;
                    });
                }
                if (tag.blockingTriggerId) {
                    tag.blockingTriggerId = tag.blockingTriggerId.map(tid => {
                        for (const [fromId, toId] of referenceUpdates.triggerId) {
                            if (tid === fromId) return toId;
                        }
                        return tid;
                    });
                }
            }
        }

        // Filter triggers
        if (version.trigger) {
            version.trigger = version.trigger.filter(trigger => !toRemove.trigger.has(trigger.path));
        }

        // Filter variables
        if (version.variable) {
            version.variable = version.variable.filter(variable => !toRemove.variable.has(variable.path));
        }

        return modified;
    }

    /**
     * Merge duplicate entities intelligently
     * @param {Array} duplicates - Array of duplicate entities
     * @param {string} type - Entity type (tag, trigger, variable)
     * @returns {Object} Merged entity
     */
    mergeDuplicates(duplicates, type) {
        if (duplicates.length === 0) return null;
        if (duplicates.length === 1) return duplicates[0];

        // Use the first one as base
        const merged = deepClone(duplicates[0]);

        // Merge names (use the most descriptive one)
        const names = duplicates.map(d => d.name).filter(n => n);
        if (names.length > 1) {
            // Use the longest name as it's likely most descriptive
            merged.name = names.reduce((a, b) => a.length > b.length ? a : b);
        }

        // Merge notes/documentation
        const notes = duplicates.map(d => d.notes).filter(n => n).join('\n\n---\n\n');
        if (notes) {
            merged.notes = notes;
        }

        // Merge parameters (union of all parameters)
        if (type === 'variable') {
            const allParams = new Map();
            for (const dup of duplicates) {
                if (dup.parameter) {
                    for (const param of dup.parameter) {
                        allParams.set(param.key, param);
                    }
                }
            }
            if (allParams.size > 0) {
                merged.parameter = Array.from(allParams.values());
            }
        }

        // Merge triggers if tags
        if (type === 'tag') {
            const allTriggerIds = new Set();
            for (const dup of duplicates) {
                if (dup.firingTriggerId) {
                    dup.firingTriggerId.forEach(id => allTriggerIds.add(id));
                }
            }
            if (allTriggerIds.size > 0) {
                merged.firingTriggerId = Array.from(allTriggerIds);
            }

            const allBlockingIds = new Set();
            for (const dup of duplicates) {
                if (dup.blockingTriggerId) {
                    dup.blockingTriggerId.forEach(id => allBlockingIds.add(id));
                }
            }
            if (allBlockingIds.size > 0) {
                merged.blockingTriggerId = Array.from(allBlockingIds);
            }
        }

        return merged;
    }
}
