function parametersFormatter(value, row, index) {
    // Backward compatibility: If value is a string, return it (sanitize if needed, but here we assume legacy data acceptance)
    if (typeof value === 'string') {
        return value;
    }

    // Safe Rendering for new JSON Array data
    if (Array.isArray(value)) {
        let htmlOutput = "";

        // Helper to escape HTML characters
        const escapeHtml = (unsafe) => {
            if (typeof unsafe !== 'string') return unsafe;
            return unsafe.replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        };

        value.forEach((param, i) => {
            let displayName = escapeHtml(param.name);
            let fullName = escapeHtml(param.name);
            let val = escapeHtml(param.value);
            let needsTooltip = false;

            if (fullName.length > 22) {
                displayName = displayName.substring(0, 22) + '...';
                needsTooltip = true;
            }

            let line = "";
            if (needsTooltip) {
                line += `<strong data-bs-toggle="tooltip" title="${fullName}">${displayName}</strong>: ${val}`;
            } else {
                line += `<strong>${displayName}</strong>: ${val}`;
            }

            if (i < value.length - 1) {
                line += "<br>";
            }
            htmlOutput += line;
        });

        return htmlOutput;
    }

    return "-";
}
