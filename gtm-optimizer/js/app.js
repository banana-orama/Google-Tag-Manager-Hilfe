/**
 * GTM Container Optimizer - Main App Entry Point
 */

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI
    UI.init();

    // Add drag-over styles
    const style = document.createElement('style');
    style.textContent = `
        .drag-over {
            border-color: var(--color-primary) !important;
            background: var(--color-bg-active) !important;
            transform: scale(1.02);
        }
        .empty-state {
            text-align: center;
            padding: var(--spacing-2xl);
            color: var(--color-text-secondary);
        }
        .inventory-item-meta {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: var(--spacing-xs);
        }
        .inventory-empty {
            padding: var(--spacing-md);
            text-align: center;
            color: var(--color-text-muted);
        }
        .issue-not-fixable {
            font-size: var(--font-size-xs);
            color: var(--color-text-muted);
            font-style: italic;
        }
        .issue-details {
            display: flex;
            flex-direction: column;
            gap: var(--spacing-sm);
        }
        .issue-details code {
            background: var(--color-bg-hover);
            padding: var(--spacing-xs) var(--spacing-sm);
            border-radius: var(--radius-sm);
            font-family: 'Consolas', monospace;
            font-size: var(--font-size-sm);
        }
        .ssg-tags-info p {
            margin-bottom: var(--spacing-sm);
        }
    `;
    document.head.appendChild(style);

    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('demo')) {
        UI.loadDemoData();
    }
});

// Service Worker registration for offline capability (optional)
if ('serviceWorker' in navigator) {
    // Uncomment to enable service worker
    // navigator.serviceWorker.register('/sw.js');
}
