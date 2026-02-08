/**
 * GTM Container Optimizer - Utility Functions
 */

/**
 * Generates a unique ID for deduplication
 * @param {*} item - GTM entity (tag, trigger, variable)
 * @returns {string} Unique hash
 */
function generateUniqueId(item) {
    if (!item) return '';

    const str = JSON.stringify({
        type: item.type,
        name: item.name,
        parameter: item.parameter,
        filter: item.filter,
        triggerId: item.triggerId,
        fingerprint: item.fingerprint
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'uid_' + Math.abs(hash).toString(36);
}

/**
 * Deep clones an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));

    const clonedObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}

/**
 * Debounce function for performance optimization
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format date to German locale
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Get entity type label in German
 * @param {string} type - Entity type
 * @returns {string} German label
 */
function getEntityTypeLabel(type) {
    const labels = {
        'tag': 'Tag',
        'trigger': 'Trigger',
        'variable': 'Variable',
        'template': 'Vorlage',
        'folder': 'Ordner',
        'builtIn': 'Integriert'
    };
    return labels[type] || type;
}

/**
 * Get category label in German
 * @param {string} category - Category key
 * @returns {string} German label
 */
function getCategoryLabel(category) {
    const labels = {
        'cleanup': 'Bereinigung',
        'performance': 'Performance',
        'structure': 'Struktur',
        'security': 'Sicherheit',
        'privacy': 'Datenschutz',
        'maintainability': 'Wartbarkeit',
        'duplication': 'Duplizierung',
        'unused': 'Ungenutzte Elemente',
        'best-practice': 'Best Practice',
        'ssg-readiness': 'Server-Side Bereit'
    };
    return labels[category] || category;
}

/**
 * Get severity label in German
 * @param {string} severity - Severity level
 * @returns {string} German label
 */
function getSeverityLabel(severity) {
    const labels = {
        'critical': 'Kritisch',
        'high': 'Hoch',
        'medium': 'Mittel',
        'low': 'Niedrig',
        'info': 'Info'
    };
    return labels[severity] || severity;
}

/**
 * Calculate score from issues
 * @param {Array} issues - Array of issues
 * @param {number} totalElements - Total number of elements checked
 * @returns {number} Score from 0-100
 */
function calculateScore(issues, totalElements = 100) {
    if (totalElements === 0) return 100;

    const severityWeights = {
        'critical': 10,
        'high': 5,
        'medium': 2,
        'low': 1
    };

    let penalty = 0;
    for (const issue of issues) {
        penalty += severityWeights[issue.severity] || 1;
    }

    const score = Math.max(0, 100 - (penalty / totalElements * 100));
    return Math.round(score);
}

/**
 * Determine score grade
 * @param {number} score - Score value
 * @returns {string} Grade (A-F)
 */
function getScoreGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

/**
 * Get score color class
 * @param {number} score - Score value
 * @returns {string} Color class
 */
function getScoreColor(score) {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'error';
}

/**
 * Download JSON file
 * @param {Object} data - Data to download
 * @param {string} filename - Filename
 */
function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download text file
 * @param {string} content - Content to download
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
function downloadText(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Read file as text
 * @param {File} file - File to read
 * @returns {Promise<string>} File content
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

/**
 * Parse JSON safely
 * @param {string} str - JSON string
 * @returns {Object|null} Parsed object or null
 */
function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

/**
 * Check if value is defined and not null
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isDefined(value) {
    return value !== undefined && value !== null;
}

/**
 * Get nested property safely
 * @param {Object} obj - Object
 * @param {string} path - Dot notation path
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Property value or default
 */
function getNestedProperty(obj, path, defaultValue = null) {
    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
        if (result && typeof result === 'object' && key in result) {
            result = result[key];
        } else {
            return defaultValue;
        }
    }
    return result;
}

/**
 * Flatten nested array
 * @param {Array} arr - Array to flatten
 * @returns {Array} Flattened array
 */
function flattenArray(arr) {
    return arr.reduce((flat, item) => {
        return flat.concat(Array.isArray(item) ? flattenArray(item) : item);
    }, []);
}

/**
 * Remove undefined values from object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
function removeUndefined(obj) {
    const cleaned = {};
    for (const key in obj) {
        if (obj[key] !== undefined) {
            cleaned[key] = typeof obj[key] === 'object' ? removeUndefined(obj[key]) : obj[key];
        }
    }
    return cleaned;
}

/**
 * Create a diff of two objects
 * @param {Object} oldObj - Original object
 * @param {Object} newObj - Modified object
 * @returns {Object} Diff object
 */
function createDiff(oldObj, newObj) {
    const diff = {};

    for (const key in newObj) {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            diff[key] = {
                old: oldObj[key],
                new: newObj[key]
            };
        }
    }

    return diff;
}

/**
 * Group array by key
 * @param {Array} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
function groupBy(arr, key) {
    return arr.reduce((groups, item) => {
        const group = item[key];
        groups[group] = groups[group] || [];
        groups[group].push(item);
        return groups;
    }, {});
}

/**
 * Sort array by key
 * @param {Array} arr - Array to sort
 * @param {string} key - Key to sort by
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array} Sorted array
 */
function sortBy(arr, key, order = 'asc') {
    return [...arr].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];

        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * Extract tag type from GTM tag
 * @param {Object} tag - GTM tag object
 * @returns {string} Tag type
 */
function getTagType(tag) {
    return tag?.type || 'unknown';
}

/**
 * Extract trigger type from GTM trigger
 * @param {Object} trigger - GTM trigger object
 * @returns {string} Trigger type
 */
function getTriggerType(trigger) {
    return trigger?.type || 'unknown';
}

/**
 * Extract variable type from GTM variable
 * @param {Object} variable - GTM variable object
 * @returns {string} Variable type
 */
function getVariableType(variable) {
    return variable?.type || 'unknown';
}

/**
 * Check if entity is built-in
 * @param {Object} entity - GTM entity
 * @returns {boolean}
 */
function isBuiltIn(entity) {
    return entity?.tagManagerUrl?.includes('/builtins/') ||
           entity?.type?.startsWith('k') || // GTM built-in types start with 'k'
           false;
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateUniqueId,
        deepClone,
        debounce,
        formatDate,
        formatNumber,
        escapeHtml,
        getEntityTypeLabel,
        getCategoryLabel,
        getSeverityLabel,
        calculateScore,
        getScoreGrade,
        getScoreColor,
        downloadJson,
        downloadText,
        readFileAsText,
        safeJsonParse,
        isDefined,
        getNestedProperty,
        flattenArray,
        removeUndefined,
        createDiff,
        groupBy,
        sortBy,
        getTagType,
        getTriggerType,
        getVariableType,
        isBuiltIn
    };
}
