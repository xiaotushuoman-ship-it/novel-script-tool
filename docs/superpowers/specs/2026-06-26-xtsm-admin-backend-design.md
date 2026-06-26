# XTSM Admin Backend Design

## Goal

Build the first admin backend inside `xtsm_admin` as an independent FastAPI project. The first version provides a modern admin shell with a left sidebar and three menu pages: 首页, 工作流, and API接入.

## Chosen Approach

Use FastAPI to serve both the static admin UI and JSON API endpoints.

This keeps the first version small and runnable while leaving clear extension points for real workflow and API integration logic later.

## Project Structure

```text
xtsm_admin/
  app/
    main.py
    routers/
      dashboard.py
      workflows.py
      integrations.py
    static/
      index.html
      styles.css
      app.js
  tests/
    test_app.py
  requirements.txt
  README.md
```

## UI Design

The admin UI is a single-page shell:

- A persistent left sidebar with `首页`, `工作流`, and `API接入`.
- A top content header that changes with the active page.
- Main content panels rendered by JavaScript when the user clicks a sidebar item.
- A modern work-focused style: restrained colors, compact cards, clear status blocks, and predictable navigation.

## Pages

`首页` shows overview cards, API status, workflow count, daily call count, and sample recent activity.

`工作流` shows workflow cards, status labels, and simple action buttons for future create/run behavior.

`API接入` shows integration status, endpoint cards, configuration panels, and a test connection action.

## API Design

The first version exposes demo JSON endpoints:

- `GET /api/dashboard`
- `GET /api/workflows`
- `GET /api/integrations/status`

Responses use simple structured JSON with `data` fields and predictable keys. This lets the frontend be wired now while real data sources can be added later.

## Error Handling

The backend returns structured JSON errors for API failures.

The frontend handles loading, empty, and error states for each page. If an API call fails, the active page shows a clear inline error instead of leaving blank content.

## Testing

Use `pytest` with FastAPI's test client to verify:

- The admin HTML entrypoint is served.
- Static assets are reachable.
- Each demo API returns the expected shape.

Manual browser verification covers:

- The admin page loads.
- Sidebar menu clicks switch between 首页, 工作流, and API接入.
- The visual layout is usable on desktop and narrow viewports.

## Out of Scope

- Authentication and permissions.
- Persistent database storage.
- Real third-party API calls.
- Full workflow execution logic.

These can be added after the skeleton is running.
