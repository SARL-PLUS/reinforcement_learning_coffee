document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();

        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// In a real scenario, you would fetch this link or have it injected by a backend.
const googleFormLink = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform'; 
const linkElement = document.getElementById('google-form-link');
if(linkElement) {
    // You can uncomment the line below when you have your Google Form link
    // linkElement.href = googleFormLink;
}

// Load events from Google Sheet and render into the main schedule list
(function loadScheduleFromSheet() {
    const target = document.getElementById('schedule-list');
    if (!target) return;

    const sheetId = '1d9mY-ZdecDYc6HToxOdW3T8OqfTEnK07pExCXUc4NWg';
    const gid = '0';
    // gviz returns JSON wrapped in a function; we'll parse it safely from text
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

    const todayMidnight = () => new Date(new Date().toDateString());

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Parse multiple Sheet date formats: gviz Date(YYYY,MM,DD), ISO, and numeric serial
    function parseSheetDate(val) {
        if (val == null) return null;

        let v = val;

        // Numeric serial (Sheets days since 1899-12-30)
        if (typeof v === 'number') {
            const base = new Date(Date.UTC(1899, 11, 30));
            const d = new Date(base.getTime() + v * 86400000);
            return d;
        }

        if (typeof v === 'string') {
            const trimmed = v.trim();

            // Matches Date(2025,9,3) where month is 0-based
            const m = trimmed.match(/^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
            if (m) {
                const year = parseInt(m[1], 10);
                const monthZero = parseInt(m[2], 10);
                const day = parseInt(m[3], 10);
                return new Date(year, monthZero, day);
            }

            // ISO or other parseable formats
            const iso = new Date(trimmed);
            if (!isNaN(iso.getTime())) return iso;

            // Try dd/mm/yyyy or dd.mm.yyyy
            const m2 = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
            if (m2) {
                const d = parseInt(m2[1], 10);
                const mo = parseInt(m2[2], 10) - 1;
                const y = parseInt(m2[3].length === 2 ? ('20' + m2[3]) : m2[3], 10);
                const dt = new Date(y, mo, d);
                if (!isNaN(dt.getTime())) return dt;
            }
        }

        // As a fallback, let Date try
        const fallback = new Date(v);
        return isNaN(fallback.getTime()) ? null : fallback;
    }

    // Decide if the first data row is actually a header row when column labels are missing
    function detectHeaderFromFirstRow(rowValues) {
        if (!rowValues || !rowValues.length) return false;
        // Heuristics: header row tends to be short strings with no numbers-only values
        let stringy = 0;
        for (const v of rowValues) {
            if (v == null) continue;
            const s = String(v).trim();
            if (!s) continue;
            if (/^\d+([./-]\d+)*$/.test(s)) return false; // looks like numeric/date content
            stringy++;
        }
        return stringy >= Math.min(2, rowValues.length); // at least 2 stringy fields
    }

    // Normalize a Date to UTC midnight
    function utcMidnight(d) {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }

    // Get current time from the internet (UTC); fallback to local time if unavailable
    async function getNetworkNow() {
        try {
            const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { cache: 'no-store' });
            if (!res.ok) throw new Error('time fetch failed');
            const data = await res.json();
            // Example: "2025-09-29T12:34:56.789123+00:00"
            return new Date(data.datetime);
        } catch (e) {
            // Fallback to client clock if network time not available
            return new Date();
        }
    }

    function renderItems(items) {
        target.innerHTML = '';

        // Header row
        const header = document.createElement('div');
        header.className = 'schedule-item schedule-header';
        header.innerHTML = `
            <span class="date">Date</span>
            <span class="topic">Topic</span>
            <span class="speaker">Name — Institution</span>
            <span class="details-header">Link</span>
        `;
        target.appendChild(header);

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'schedule-loading';
            empty.textContent = 'No events found.';
            target.appendChild(empty);
            return;
        }

        // Sort by date descending (newest first)
        items.sort((a, b) => {
            const ad = a.dateObj ? a.dateObj.getTime() : -Infinity;
            const bd = b.dateObj ? b.dateObj.getTime() : -Infinity;
            return bd - ad;
        });

        for (const evt of items) {
            const item = document.createElement('div');
            item.className = `schedule-item ${evt.statusClass}`.trim();
            const linkHtml = evt.link
                ? `<a href="${escapeHtml(evt.link)}" class="details-link" target="_blank" rel="noopener">Details</a>`
                : '';
            // Single line: Date | Topic | Speaker | Link
            item.innerHTML = `
                <span class="date">${escapeHtml(evt.dateStr)}</span>
                <span class="topic">${escapeHtml(evt.topic)}</span>
                <span class="speaker">${escapeHtml(evt.speaker)}</span>
                ${linkHtml || '<span></span>'}
            `;
            target.appendChild(item);
        }
    }

    fetch(url)
        .then(res => res.text())
        .then(text => {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('Malformed response from Google');
            const data = JSON.parse(text.slice(start, end + 1));

            const table = data.table || {};
            const colsRaw = table.cols || [];
            const rowsRaw = table.rows || [];

            // Extract raw cell values as {v,f}, pick f (formatted) when present
            const rows = rowsRaw.map(r => (r.c || []).map(c => {
                if (!c) return '';
                if (typeof c.f !== 'undefined' && c.f !== null && c.f !== '') return c.f;
                return typeof c.v !== 'undefined' ? c.v : '';
            }));

            // Column labels from the table (can be empty)
            let labels = colsRaw.map(c => String((c.label || c.id || '')).trim());

            // If labels are empty, try to detect header from first row
            const labelsMissing = labels.every(s => !s);
            if (labelsMissing && rows.length > 0 && detectHeaderFromFirstRow(rows[0])) {
                labels = rows[0].map(v => String(v || '').trim());
                rows.shift(); // remove header row from data
            }

            // Build a mapping from intent -> column index
            const indexOfFirst = (cands) => {
                // exact match by label first
                for (const c of cands) {
                    const i = labels.findIndex(l => l.toLowerCase() === c);
                    if (i !== -1) return i;
                }
                // partial contains
                for (const c of cands) {
                    const i = labels.findIndex(l => l.toLowerCase().includes(c));
                    if (i !== -1) return i;
                }
                return -1;
            };

            // Map the simplified columns: Date, Name, Institution, Topic (optional), Link
            let dateIdx = indexOfFirst(['date']);
            let nameIdx = indexOfFirst(['name']);
            let institutionIdx = indexOfFirst(['institution', 'affiliation', 'org', 'university']);
            let topicIdx = indexOfFirst(['topic']);
            let linkIdx = indexOfFirst(['link', 'url']);

            // Optional details/notes column if present
            let descIdx = indexOfFirst(['description', 'abstract', 'notes', 'info', 'summary', 'overview', 'detail text']);

            // Fallback positions if labels are missing: A=Date, B=Name, C=Institution, D=Topic, E=Link, F=Description
            if (dateIdx < 0) dateIdx = 0;
            if (nameIdx < 0) nameIdx = 1;
            if (institutionIdx < 0) institutionIdx = 2;
            if (topicIdx < 0) topicIdx = 3;
            if (linkIdx < 0) linkIdx = 4;
            if (descIdx < 0) descIdx = 5;

            const items = [];
            for (const row of rows) {
                const rawDate = row[dateIdx];
                const name = row[nameIdx] != null ? String(row[nameIdx]) : '';
                const institution = row[institutionIdx] != null ? String(row[institutionIdx]) : '';
                const topicRaw = row[topicIdx] != null ? String(row[topicIdx]) : '';
                const link = row[linkIdx] != null ? String(row[linkIdx]) : '';

                // Skip completely empty rows
                if (![rawDate, name, institution, topicRaw, link].some(v => v && String(v).trim())) continue;

                // Skip any header-like row (e.g., "Date | Name | Institution | Topic (optional) | Link")
                const norm = (s) => String(s || '').toLowerCase().trim();
                const v0 = norm(rawDate);
                const v1 = norm(name);
                const v2 = norm(institution);
                const v3 = norm(topicRaw);
                const v4 = norm(link);

                const containsAny = (s, arr) => arr.some(tok => s.includes(tok));
                const headerMatches =
                    (containsAny(v0, ['date']) ? 1 : 0) +
                    (containsAny(v1, ['name']) ? 1 : 0) +
                    (containsAny(v2, ['institution', 'affiliation', 'organization', 'org', 'university']) ? 1 : 0) +
                    (containsAny(v3, ['topic', 'title', 'subject']) ? 1 : 0) + // matches "topic (optional)"
                    (containsAny(v4, ['link', 'url']) ? 1 : 0);
                if (headerMatches >= 4) continue;

                const dateObj = parseSheetDate(rawDate);
                // Display string for date
                let dateStr = typeof rawDate === 'string' ? rawDate : (dateObj ? dateObj.toISOString().slice(0,10) : '');

                const topic = topicRaw && topicRaw.trim() ? topicRaw : 'Topic TBA';
                const speaker = [name, institution].filter(Boolean).join(' — ');

                const today = todayMidnight();
                const isUpcoming = !!(dateObj && dateObj >= today);
                const statusClass = isUpcoming ? 'status-upcoming' : 'status-past';

                items.push({
                    dateStr,
                    dateObj,
                    topic,
                    speaker,
                    link: link && link.startsWith('http') ? link : '',
                    statusClass
                });
            }

            // Fetch current time online (UTC) and render with highlight; fallback to local time if needed
            getNetworkNow()
                .then(now => {
                    const nowTs = utcMidnight(now).getTime();
                    renderItems(items, nowTs);
                })
                .catch(() => {
                    const nowTs = utcMidnight(new Date()).getTime();
                    renderItems(items, nowTs);
                });
        })
        .catch(err => {
            console.error('Failed to load schedule from sheet:', err);
            target.innerHTML = '<div class="schedule-error">Could not load additional events right now.</div>';
        });
})();
