---
name: frontend
description: UI work - UX states, accessibility, forms, state, API integration, performance, security.
---
# /frontend
- Use the design system; reuse components before creating.
- States: loading, empty, error, success, partial, slow/offline.
- Accessibility WCAG 2.2 AA: semantic HTML, labels, keyboard, focus, contrast; ARIA only when needed.
- Forms: client + server validation, clear messages, keep input, block double submit.
- State minimal and local; server state via the project's cache/query layer; one source of truth.
- Responsive; project browser matrix; localization (no hard-coded strings, RTL, locale formats).
- Performance: bundle size, lazy loading, Core Web Vitals.
- Security: no raw HTML injection, CSP, avoid tokens in localStorage.
- Observability: client error reporting, key UX events.
