var OPTIPIE_SELECTORS = {
    dialog: {
        container: "div[data-name='indicator-properties-dialog']",
        content: "div[data-name='indicator-properties-dialog'] div[class*='content' i]",
        okButton: ["button[data-name='submit-button' i]", "span[class*='submit' i] button"],
    },
    toolbar: {
        intervals: "#header-toolbar-intervals",
        intervalsMenu: "#header-toolbar-intervals div[class*='menuContent' i]",
        intervalsArrow: "#header-toolbar-intervals div[class*='arrow' i]",
        intervalItem: (value) => `div[data-value='${value}']`
    },
    strategy: {
        group: "div[class*=strategyGroup]",
        reportTitleButton: ["button[data-strategy-title*='report' i]", "div[class*='strategyGroup' i] button"],
        settingsButton: [
            "div[aria-label*='settings' i]",
            'div[aria-keyshortcuts*="+P"]',
            'div[aria-keyshortcuts*="+ P"]',
            "div[class*='mainContent' i] > div:nth-child(2) div[role*='menuItem' i]"
        ],
        timePeriodGroup: "div[class*=innerWrap] div[class*=group]",
        selectedPeriod: "button[aria-checked*=true]",
        valueDiv: "div[class*=value]"
    },
    backtesting: {
        deepHistory: [
            "div[class*=backtesting i] div[class*=deephistory i]",
            "div[class*=backtesting i] div[class*=deep-history i]"
        ],
        updatedButton: "div[data-qa-id*='backtesting-updated' i] button",
        deepBacktestingSpan: "span[class*='deepBacktesting' i]",
        emptyState: "div[class*='emptyStateIcon' i]",
        reportContainer: "div div[class^='containerCell' i] > div:nth-child(2)",
        reportValue: "[class*='value' i]",
        reportCurrency: "[class*='currency' i]",
        reportChange: "[class*='change' i]"
    },
    inputs: {
        // This query is complex and relies on multiple parts
        generated: `` // To be constructed dynamically in script.js using dialog.content
    }
};

// Helper for inputsQuery since it depends on the container
OPTIPIE_SELECTORS.inputs.generated = `${OPTIPIE_SELECTORS.dialog.content} input:not([aria-activedescendant*='time_input' i]), ${OPTIPIE_SELECTORS.dialog.content} button[role*='combobox' i], ${OPTIPIE_SELECTORS.dialog.content} div[data-name*='color' i]`;
