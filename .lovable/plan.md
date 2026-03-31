# Add "System Logs" Menu Item to CTO Sidebar

## What changes

1. `**src/components/layout/executiveSidebarConfig.ts**` — Add a new sidebar item `{ label: 'System Logs', icon: FileText, id: 'system-logs' }` to the CTO engineering section (after Developer Tools).
2. `**src/pages/cto/Dashboard.tsx**` — Pass `activeTab` to `CTODashboard` so the content switches based on sidebar selection. When `system-logs` is selected, render an empty placeholder panel.
3. `**src/components/executive/CTODashboard.tsx**` — Accept an optional `activeTab` prop. When `activeTab === 'system-logs'`, render a blank card with a "System Logs" heading. Otherwise render the existing dashboard content.

## Technical detail

- Import `FileText` from lucide-react in the sidebar config (already imported).
- The blank panel will be a simple `Card` with a title — no data fetching or logic.
- All existing CTO dashboard content remains unchanged for other tabs.
- follow the new architecture called event based architecture