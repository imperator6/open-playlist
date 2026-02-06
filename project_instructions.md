## PROJECT INSTRUCTIONS (GLOBAL – ALWAYS APPLY)

## Purpose
This file defines non-negotiable global rules for all code generated in this project.
All instructions below must be followed unless explicitly overridden.

## GENERAL PRINCIPLES
- Write clean, readable, maintainable code.
- Prefer clarity over cleverness.
- Follow modern best practices.
- Avoid unnecessary complexity or dependencies.

## FRONTEND & UI RULES
- All web pages MUST be mobile-first and responsive.
- The UI must work correctly on small screens (≥360px wide).
- No horizontal scrolling or zooming should be required on mobile.
- Do NOT use fixed widths for layout containers.
- Prefer CSS Flexbox and CSS Grid.
- Use relative units (%, rem, em, vw, vh) instead of px when possible.

## MOBILE USABILITY
- Inputs must not require retyping after form submission.
- Forms should preserve user input on validation errors.
- Touch targets must be finger-friendly (minimum ~44px height).
- Avoid hover-only interactions; mobile must be fully usable without hover.
- Text must remain readable without zooming.
- On iOS Safari, ensure input font size is 16px or larger to prevent auto-zoom.

## ACCESSIBILITY (A11Y)
- Use semantic HTML elements where possible.
- Ensure sufficient color contrast.
- Inputs must have labels.
- Buttons and interactive elements must be keyboard accessible.
- Avoid relying solely on color to convey information.

## CSS & LAYOUT
- Use mobile-first media queries (min-width).
- Avoid absolute positioning unless necessary.
- Avoid hard-coded heights that may break on small screens.
- Layout must adapt gracefully to different screen sizes.

## JAVASCRIPT
- Use modern JavaScript (ES6+).
- Avoid blocking the main thread.
- Do not break functionality on mobile devices.
- Handle errors gracefully.

## SPOTIFY API (SERVER-ONLY)
- All calls to the Spotify Web API MUST be done on the server (never in browser JS).
- The client may only call local server endpoints (e.g., /api/...) that proxy Spotify requests.
- Use server-side caching for frequently polled data (e.g., playback/queue) to reduce Spotify rate-limit risk.
- Never expose Spotify access tokens, refresh tokens, or client secrets to the client.
- If a new feature needs Spotify data, create/extend a server endpoint first, then update the client to use it.

## APP DOCUMENTATION (MANDATORY)
- Maintain a short, high-level app summary in APP_SUMMARY.md (Markdown).
- After any technical change, update APP_SUMMARY.md if behavior, routes, data flow, or UI features changed.
- Keep it concise and structured so another AI can rebuild the app from scratch.

## SERVER-SIDE LOGGING (MANDATORY)
- All server-side applications MUST implement structured logging.
- Use log levels consistently: DEBUG, INFO, WARN, ERROR.
- Do NOT use console.log for production logging.
- Whenever the server calls the Spotify API, emit a DEBUG log message that clearly indicates it is connecting to Spotify.
- Logs must include:
  - Timestamp (ISO 8601)
  - Log level
  - Service or module name
  - Message
- Errors MUST log:
  - Error message
  - Stack trace (when available)
  - Relevant request or operation context

## SECURITY & PRIVACY (LOGGING)
- NEVER log sensitive data:
  - Passwords
  - Authentication tokens
  - API keys
  - Personal identifiable information (PII)
- Sanitize or redact user input before logging if necessary.
- Logging must not expose internal system secrets.

## LOGGING BEHAVIOR
- Use INFO logs for normal application flow.
- Use WARN logs for recoverable or unexpected situations.
- Use ERROR logs for failures that require investigation.
- Avoid excessive logging in high-frequency code paths.
- Logging must not significantly impact performance.


## OUTPUT EXPECTATIONS
- Generated code should be production-ready unless stated otherwise.
- Do not include placeholder TODOs unless explicitly requested.
- If assumptions are required, choose reasonable defaults and proceed.

## IMPORTANT
These rules have higher priority than individual task instructions.
If a task conflicts with these rules, ask me.




