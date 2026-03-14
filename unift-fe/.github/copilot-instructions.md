# GitHub Copilot Instructions — UniFT Frontend

This document defines conventions, patterns, and rules for AI coding agents working on the **UniFT Frontend** codebase. Follow everything here precisely — it encodes the established design system and architectural decisions of this project.

---

## 1. Project Stack

| Concern | Tool |
|---|---|
| Framework | React 19 + TypeScript ~5.9 |
| Build | Vite v8 |
| Styling | Tailwind CSS v4.2 + `@tailwindcss/forms` |
| Config | `tailwind.config.ts` (TypeScript, NOT `.js`) |
| Path aliases | `@/` → `src/`, `@/components`, `@/pages`, `@/hooks`, `@/utils`, `@/config`, `@/types` |
| Routing | **No router library.** Pages are switched via `URLSearchParams('page')` in `App.tsx` |
| Icons | Material Symbols Outlined (Google Fonts CDN variable font) |
| Fonts | IBM Plex Sans (UI body) + IBM Plex Mono (labels, data, buttons) |

---

## 2. Design System

### Color Tokens

Always use these exact hex values. Never use arbitrary Tailwind grays for structural colors.

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#1C1E1A` | Root background |
| `surface` | `#232620` | Cards, panels, sidebars, headers |
| `recessed` | `#161814` | Inputs, inset backgrounds, locked rows |
| `primary` | `#E07B39` | Orange accent: CTA buttons, active states, progress |
| `text-warm` | `#E8E4DC` | Default body text |
| `status-ok` | `#5a9e6f` | Success / done states |
| `status-err` | `#c03939` | Error / fail states |
| `border-muted` | `#3a3a34` | All borders between panels |

> **Never use `gray-*` or `zinc-*` Tailwind palette colors for structural UI.** Use `slate-*` only for text tone variations (e.g. `text-slate-400`, `text-slate-600`), never for backgrounds or borders.

### Border Radius

Near-zero by design: `rounded` = `0.125rem` (2px). Use `rounded` everywhere — never `rounded-md`, `rounded-lg`, etc. unless the design explicitly calls for it.

### Typography

- **Labels / overlines**: `label` CSS utility — 10px IBM Plex Mono, uppercase, `#6b6960`. Orange variant: `label-o`.
- **Body text**: IBM Plex Sans, 13px base, `text-warm`
- **Data / codes / paths**: `font-mono` (IBM Plex Mono), small size (`text-xs` or `text-[11px]`)
- **Section headings**: `text-xl` or `text-2xl`, `font-bold tracking-tight uppercase text-slate-100`
- **Buttons**: `font-mono`, `uppercase`, `tracking-widest`, `text-[10px]` or `text-xs`

---

## 3. CSS Utility Classes (defined in `src/index.css`)

These are custom `@layer utilities`. Use them exactly as named — do not recreate them inline.

| Class | Purpose |
|---|---|
| `depth-recessed` | Inset surface: dark bg + asymmetric borders (dark top/left, light bottom/right) |
| `depth-input` | Inset input field depth with inset shadow |
| `panel-depth` | Floating panel drop shadow |
| `label` | 10px mono uppercase label, muted color |
| `label-o` | Same as `label` but orange (`#E07B39`) |
| `prog-track` | 2px progress bar track (background) |
| `prog-fill` | 2px orange fill bar with transition |
| `prog-done` | 2px green fill bar (completed state) |
| `badge-active` | Orange tinted badge |
| `badge-done` | Green tinted badge |
| `badge-fail` | Red tinted badge |
| `badge-queue` | Muted/neutral badge |
| `badge-info` | Blue tinted badge |
| `animate-pulse-border` | Pulsing orange border animation (upload drop zone) |
| `scanline` | CRT scanline overlay effect (media player) |
| `cursor` | Blinking terminal cursor |
| `permission-checkbox` | Custom styled checkbox (20px square, recessed bg, orange when checked) |
| `custom-scrollbar` | Thin 4px scrollbar, hidden track, orange on hover |
| `row-active` | Table row active highlight |
| `row-idle` | Table row idle/dimmed state |
| `fade-in`, `delay-100` etc. | Entrance animations |

---

## 4. Component API Reference

### `<Badge variant="active|done|fail|queue|info|default">`
Maps directly to CSS utility classes above. Never use old variant names like `success`, `error`, `warning`.

### `<Button variant="primary|secondary|ghost|danger" size="sm|md|lg">`
- `primary`: `bg-[#E07B39]` orange fill, white text
- `secondary`: transparent with `border-[#3a3a34]`, `text-slate-300`
- `ghost`: no border, transparent
- `danger`: red toned
- All buttons: `font-mono`, `uppercase`, `tracking-widest`

### `<Card depth="raised|flat|recessed" accentLeft={boolean}>`
- `accentLeft`: adds 3px left orange border

### `<Input label? iconName? icon? placeholder className>`
- Always uses `depth-input` styling
- `label` prop renders `<label className="label">` above
- `iconName` accepts a Material Symbol name string

### `<Header breadcrumb={BreadcrumbSegment[]} rightContent?>`
- `breadcrumb` is an array of `{ label: string; icon?: string }` — replaces old `title`/`subtitle` string props
- Sub-exports: `HeaderSearch`, `HeaderAvatar`
- The logo renders: orange square + terminal icon + `UniFT//OS` in mono

### `<Sidebar items={SidebarItem[]} footer?>`
- `SidebarItem.href` is **optional**
- Active item: `border-l-[3px] border-primary bg-white/5`
- Sub-export: `StorageBar` (green <75%, orange <90%, red ≥90%)

### `<Layout>` / `<MainContent>` / `<ContentPanel>`
- `Layout`: `h-screen flex flex-col`
- `MainContent`: `flex-1 overflow-auto`
- `ContentPanel`: padded wrapper

---

## 5. Page Patterns

### Layout Strategy

Pages fall into two categories:

| Category | Pages | Description |
|---|---|---|
| **Standalone** (no Layout wrapper) | `HomePage`, `LoginPage`, `UploadPanelPage`, `TransferHistoryPage`, `MediaPlayerPage`, `AdminPermissionsPage` | Self-contained `h-screen` layouts with their own nav/header |
| **Layout-wrapped** | `FileBrowserPage` | Uses `<Layout>`, `<Header>`, `<Sidebar>`, `<MainContent>` |

### Routing

Add new pages to `App.tsx` by:
1. Adding a value to the `Page` type union
2. Adding a `case` to the `renderPage()` switch
3. Navigating with `window.location.href = '?page=<name>'`

```tsx
// Navigate between pages
window.location.href = '?page=browser';
```

---

## 6. TypeScript Conventions

### Interface/Type Placement
- Define interfaces **locally at the top of the file**, not in `src/types/index.ts`, unless they are shared across 3+ files.
- Use `interface` for object shapes, `type` for unions/aliases.

### Component Props
- Always define a named `interface` for component props (not inline types).
- Use `React.ReactNode` for slot props, not `JSX.Element`.

### State
- No external state management (no Redux, Zustand, etc.).
- Use `useState` for local UI state. Use `useReducer` only if state has 3+ interconnected fields.
- Mock data lives in module-level `MOCK_*` or `INITIAL_*` constants at the top of the file.

### Generics and `as const`
- Use `as const` for static option arrays.
- Prefer `(field: 'r' | 'w' | 'x')` union types over `string` for enum-like props.

---

## 7. File Organization

```
src/
├── components/
│   ├── layout/       # Layout, Header, Sidebar + sub-components
│   │   └── index.ts  # Re-exports everything including types
│   └── ui/           # Badge, Button, Card, Input, LoadingSpinner
│       └── index.ts  # Re-exports everything
├── pages/
│   ├── index.ts      # Re-exports every page component
│   └── *.tsx         # One file per page
├── hooks/            # useAuth, useAsync, useLocalStorage
├── utils/            # apiClient, helpers
├── config/           # api.config, routes.config, theme.config
├── types/            # Shared interfaces (used by 3+ files)
├── assets/           # Static images
├── App.tsx           # Root: routing only, no logic
├── App.css           # Minimal app-level overrides
├── index.css         # Full design system (DO NOT split)
└── main.tsx          # React DOM mount point
```

**Rules:**
- Each page is one `.tsx` file. No sub-page folders.
- Component files export a single named export (not default).
- `pages/index.ts` and `components/*/index.ts` must be updated whenever a new component is added.

---

## 8. Icon Usage

Icons come from **Material Symbols Outlined** via `<span className="material-symbols-outlined">`.

```tsx
// Correct
<span className="material-symbols-outlined text-xl">folder_open</span>

// For filled icons (FILL=1), use style prop
<span
  className="material-symbols-outlined"
  style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
>
  play_circle
</span>
```

- Default rendering: `FILL 0, wght 300` (set globally in `index.css`)
- Size classes: `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`

---

## 9. Styling Principles

1. **No inline style objects** unless applying CSS custom properties or `fontVariationSettings`.
2. **No `@apply` directives** in component files — use the pre-defined utility classes from `index.css`.
3. **Tailwind class strings** should be on a single line for short sets, or use template literal line-breaks for long sets (not array joins).
4. **Dark mode**: The entire app is always dark. The `dark` class is on the root `<div>` in `App.tsx`. Never add `dark:` variants — all styles should be dark-first.
5. **Transparency layers**: Use `bg-white/5` (5% white) for hover states, `bg-white/10` for borders when glass-morphism is needed.
6. **Opacity**: Prefer `text-slate-600` or `opacity-50` on a container over `text-opacity-*`.

---

## 10. Common Patterns

### Active nav item
```tsx
className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-all
  ${isActive
    ? 'bg-white/5 text-slate-100 border-l-[3px] border-[#E07B39]'
    : 'rounded text-slate-400 hover:text-slate-100 hover:bg-white/5'
  }`}
```

### Recessed input field
```tsx
<input
  className="w-full bg-[#161814] border border-[#3a3a34] rounded depth-input
    px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600
    focus:ring-1 focus:ring-[#E07B39]/40 outline-none transition-all"
/>
```

### Progress bar (inline)
```tsx
<div className="prog-track w-full">
  <div className="prog-fill" style={{ width: `${pct}%` }} />
</div>
```

### Orange CTA button
```tsx
<button className="flex items-center gap-2 px-6 py-2.5 bg-[#E07B39] rounded
  text-[10px] font-bold uppercase tracking-widest text-white font-mono
  shadow-lg shadow-[#E07B39]/10 hover:brightness-110 transition-all">
  <span className="material-symbols-outlined text-lg">save</span>
  Commit Changes
</button>
```

### Ghost/secondary button
```tsx
<button className="flex items-center gap-2 px-5 py-2.5 border border-[#3a3a34] rounded
  text-[10px] font-bold uppercase tracking-wider text-slate-300 font-mono
  hover:bg-white/5 transition-colors">
  <span className="material-symbols-outlined text-lg">download</span>
  Export Report
</button>
```

### Status dot indicator
```tsx
<span className="w-1.5 h-1.5 rounded-full bg-[#5a9e6f]" />  {/* ok */}
<span className="w-1.5 h-1.5 rounded-full bg-[#c03939]" />  {/* error */}
<span className="w-1.5 h-1.5 rounded-full bg-[#E07B39]" />  {/* warning */}
```

### Notification dot on icon
```tsx
<button className="p-2 hover:bg-white/5 rounded transition-colors relative">
  <span className="material-symbols-outlined text-slate-400">notifications</span>
  <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#E07B39] rounded-full" />
</button>
```

---

## 11. What NOT to Do

- ❌ Do not use `react-router-dom` or any routing library — routing is `URLSearchParams`-based.
- ❌ Do not use `className="bg-gray-900"` or `bg-zinc-*` — use `bg-[#1C1E1A]`, `bg-[#232620]`, `bg-[#161814]`.
- ❌ Do not use `rounded-md` / `rounded-lg` for structural elements — use `rounded` (2px).
- ❌ Do not use Space Grotesk — it has been removed. Only IBM Plex Sans + IBM Plex Mono.
- ❌ Do not use `success` / `error` / `warning` as Badge variants — use `done` / `fail` / `queue`.
- ❌ Do not use old Header props `title` / `subtitle` — use `breadcrumb: BreadcrumbSegment[]`.
- ❌ Do not wrap standalone pages in `<Layout>` — only `FileBrowserPage` uses the Layout wrapper.
- ❌ Do not write `export default function` — always use named exports: `export function PageName()`.
- ❌ Do not import from `react-icons` or any icon library — use Material Symbols `<span>` tags.
- ❌ Do not add `dark:` Tailwind variants — the entire app is always in dark mode.

---

## 12. Adding a New Page

1. Create `src/pages/NewPageName.tsx` with a named export `export function NewPageName()`.
2. Add `export { NewPageName } from './NewPageName'` to `src/pages/index.ts`.
3. Add `'new-page'` to the `Page` type in `src/App.tsx`.
4. Add a `case 'new-page': return <NewPageName />;` to the `renderPage()` switch.
5. Decide: does this page use `<Layout>` (file browser style) or is it standalone (h-screen, custom header)?

---

## 13. Adding a New UI Component

1. Create `src/components/ui/ComponentName.tsx` with a named export.
2. Export it from `src/components/ui/index.ts`.
3. If it introduces new CSS utilities, add them to `src/index.css` under `@layer utilities`.
4. If it introduces new Tailwind tokens, add them to `tailwind.config.ts`.
