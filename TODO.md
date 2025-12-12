# Dashboard Feature Implementation TODO

## Completed Tasks
- [x] Analyze codebase and create implementation plan
- [x] Get user approval for plan

## Pending Tasks
- [ ] Update package.json to add recharts and html2canvas dependencies
- [ ] Update src/extension.ts to add 'openDashboard' message handler
- [ ] Create webview/src/components/Dashboard.tsx component with:
  - Modal overlay UI
  - Column selection (multi-select checkboxes)
  - Chart type dropdown (Bar, Line, Pie, Scatter)
  - Recharts rendering logic
  - Download chart as PNG functionality
  - Back button to close modal
- [ ] Update webview/src/index.tsx to:
  - Add Dashboard button alongside existing controls
  - Add state for dashboard modal
  - Pass current data and columns to dashboard
  - Handle modal open/close
- [ ] Update webview/src/index.css for any additional styling
- [ ] Install new dependencies (npm install)
- [ ] Build and test the extension
- [ ] Verify chart rendering and download functionality
- [ ] Ensure no CSS/JS interference with parent UI
