// ──────────────────────────────────────────────────────────────────────────
// Reinforcement Learning Coffee — Main Script
// ──────────────────────────────────────────────────────────────────────────

// ── Smooth Scroll for Anchor Links ──────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
            // Close mobile menu if open
            closeMobileMenu();
        }
    });
});

// ── Mobile Hamburger Menu ───────────────────────────────────────────────
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');
const overlay = document.querySelector('.nav-overlay');

function closeMobileMenu() {
    hamburger?.classList.remove('active');
    navLinks?.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

hamburger?.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
    overlay?.classList.toggle('active');
    document.body.style.overflow = isOpen ? 'hidden' : '';
});

overlay?.addEventListener('click', closeMobileMenu);

// ── Scroll-Reveal via IntersectionObserver ──────────────────────────────
const revealSections = document.querySelectorAll('section:not(#hero)');

if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                sectionObserver.unobserve(entry.target); // fire once
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    revealSections.forEach(sec => sectionObserver.observe(sec));
} else {
    // Fallback: show everything
    revealSections.forEach(sec => sec.classList.add('visible'));
}

// ── Load Schedule from Google Sheet ─────────────────────────────────────
(function loadScheduleFromSheet() {
    const target = document.getElementById('schedule-list');
    if (!target) return;

    const sheetId = '1d9mY-ZdecDYc6HToxOdW3T8OqfTEnK07pExCXUc4NWg';
    const gid = '0';
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
            return new Date(base.getTime() + v * 86400000);
        }

        if (typeof v === 'string') {
            const trimmed = v.trim();

            // gviz Date(2025,9,3) — month is 0-based
            const m = trimmed.match(/^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
            if (m) return new Date(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));

            // ISO or other parseable formats
            const iso = new Date(trimmed);
            if (!isNaN(iso.getTime())) return iso;

            // dd/mm/yyyy or dd.mm.yyyy
            const m2 = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
            if (m2) {
                const d = parseInt(m2[1]);
                const mo = parseInt(m2[2]) - 1;
                const y = parseInt(m2[3].length === 2 ? ('20' + m2[3]) : m2[3]);
                const dt = new Date(y, mo, d);
                if (!isNaN(dt.getTime())) return dt;
            }
        }

        const fallback = new Date(v);
        return isNaN(fallback.getTime()) ? null : fallback;
    }

    // Detect if first data row is actually a header
    function detectHeaderFromFirstRow(rowValues) {
        if (!rowValues || !rowValues.length) return false;
        let stringy = 0;
        for (const v of rowValues) {
            if (v == null) continue;
            const s = String(v).trim();
            if (!s) continue;
            if (/^\d+([./-]\d+)*$/.test(s)) return false;
            stringy++;
        }
        return stringy >= Math.min(2, rowValues.length);
    }

    function renderItems(items) {
        target.innerHTML = '';

        // Header row
        const header = document.createElement('div');
        header.className = 'schedule-header';
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

        // Find next upcoming event for the "NEXT" badge
        const today = todayMidnight();
        let nextUpItem = null;
        for (const evt of items) {
            if (evt.dateObj && evt.dateObj >= today) {
                if (!nextUpItem || evt.dateObj < nextUpItem.dateObj) {
                    nextUpItem = evt;
                }
            }
        }

        for (const evt of items) {
            const item = document.createElement('div');
            let classes = `schedule-item ${evt.statusClass}`;
            if (evt === nextUpItem) classes += ' next-up';
            item.className = classes.trim();

            const linkHtml = evt.link
                ? `<a href="${escapeHtml(evt.link)}" class="details-link" target="_blank" rel="noopener">Details</a>`
                : '';

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
            if (start === -1 || end === -1) throw new Error('Malformed response');
            const data = JSON.parse(text.slice(start, end + 1));

            const table = data.table || {};
            const colsRaw = table.cols || [];
            const rowsRaw = table.rows || [];

            const rows = rowsRaw.map(r => (r.c || []).map(c => {
                if (!c) return '';
                if (typeof c.f !== 'undefined' && c.f !== null && c.f !== '') return c.f;
                return typeof c.v !== 'undefined' ? c.v : '';
            }));

            let labels = colsRaw.map(c => String((c.label || c.id || '')).trim());
            const labelsMissing = labels.every(s => !s);
            if (labelsMissing && rows.length > 0 && detectHeaderFromFirstRow(rows[0])) {
                labels = rows[0].map(v => String(v || '').trim());
                rows.shift();
            }

            const indexOfFirst = (cands) => {
                for (const c of cands) {
                    const i = labels.findIndex(l => l.toLowerCase() === c);
                    if (i !== -1) return i;
                }
                for (const c of cands) {
                    const i = labels.findIndex(l => l.toLowerCase().includes(c));
                    if (i !== -1) return i;
                }
                return -1;
            };

            let dateIdx = indexOfFirst(['date']);
            let nameIdx = indexOfFirst(['name']);
            let institutionIdx = indexOfFirst(['institution', 'affiliation', 'org', 'university']);
            let topicIdx = indexOfFirst(['topic']);
            let linkIdx = indexOfFirst(['link', 'url']);

            if (dateIdx < 0) dateIdx = 0;
            if (nameIdx < 0) nameIdx = 1;
            if (institutionIdx < 0) institutionIdx = 2;
            if (topicIdx < 0) topicIdx = 3;
            if (linkIdx < 0) linkIdx = 4;

            const items = [];
            const today = todayMidnight();

            for (const row of rows) {
                const rawDate = row[dateIdx];
                const name = row[nameIdx] != null ? String(row[nameIdx]) : '';
                const institution = row[institutionIdx] != null ? String(row[institutionIdx]) : '';
                const topicRaw = row[topicIdx] != null ? String(row[topicIdx]) : '';
                const link = row[linkIdx] != null ? String(row[linkIdx]) : '';

                if (![rawDate, name, institution, topicRaw, link].some(v => v && String(v).trim())) continue;

                // Skip header-like rows
                const norm = (s) => String(s || '').toLowerCase().trim();
                const v0 = norm(rawDate), v1 = norm(name), v2 = norm(institution), v3 = norm(topicRaw), v4 = norm(link);
                const containsAny = (s, arr) => arr.some(tok => s.includes(tok));
                const headerMatches =
                    (containsAny(v0, ['date']) ? 1 : 0) +
                    (containsAny(v1, ['name']) ? 1 : 0) +
                    (containsAny(v2, ['institution', 'affiliation', 'organization', 'org', 'university']) ? 1 : 0) +
                    (containsAny(v3, ['topic', 'title', 'subject']) ? 1 : 0) +
                    (containsAny(v4, ['link', 'url']) ? 1 : 0);
                if (headerMatches >= 4) continue;

                const dateObj = parseSheetDate(rawDate);
                let dateStr = typeof rawDate === 'string' ? rawDate : (dateObj ? dateObj.toISOString().slice(0, 10) : '');
                const topic = topicRaw && topicRaw.trim() ? topicRaw : 'Topic TBA';
                const speaker = [name, institution].filter(Boolean).join(' — ');
                const isUpcoming = !!(dateObj && dateObj >= today);
                const statusClass = isUpcoming ? 'status-upcoming' : 'status-past';

                items.push({ dateStr, dateObj, topic, speaker, link: link && link.startsWith('http') ? link : '', statusClass });
            }

            renderItems(items);
        })
        .catch(err => {
            console.error('Failed to load schedule from sheet:', err);
            target.innerHTML = '<div class="schedule-error">Could not load events right now. Please try again later.</div>';
        });
})();
