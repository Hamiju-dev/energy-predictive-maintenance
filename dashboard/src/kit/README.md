# PV UI kit

Components, charts and design tokens from the ewf dashboard, for reuse in other React sites.

## Requirements

React 18 or 19, Tailwind CSS 4, and:

```bash
npm install framer-motion lucide-react clsx tailwind-merge @fontsource-variable/geist @fontsource-variable/geist-mono
```

## Setup

1. Copy this folder into your project, for example to `src/kit/`.
2. Import the tokens once, in your main stylesheet or entry file: `import "./kit/tokens.css";`. It loads Tailwind, the fonts, the colour tokens (light and dark) and the focus ring.
3. Dark mode: add the class `dark` to `<html>`.
4. Wrap the app in `<MotionConfig reducedMotion="user">` from framer-motion so motion follows the system setting.

If your site already imports Tailwind, remove the first line of `tokens.css`.

## Contents

| Folder | File | Use |
|---|---|---|
| `ui/` | `card.tsx` | Card with one header row: title, meta, info tooltip, actions |
| | `button.tsx` | Primary, secondary, ghost, danger; sizes sm, md, lg, icon; loading |
| | `badge.tsx` | Neutral, accent and status tones; dot with pulse; values roll on change |
| | `alert.tsx` | Info, good, warning, critical; dismissible |
| | `segmented.tsx` | Pill radio group with a gliding thumb; arrow keys |
| | `switch.tsx` | Toggle with optional series colour |
| | `select.tsx` | Dropdown with descriptions; full keyboard support |
| | `field.tsx` | Number field with unit and hint; text field |
| | `tooltip.tsx` | `Tip`: tooltip on hover, focus and tap |
| | `sheet.tsx` | Side panel with backdrop and focus handling |
| | `stepper.tsx` | `Stepper` and `StepPanels` for wizards |
| | `accordion.tsx` | Multi-open accordion |
| | `file-drop.tsx` | Drop zone with type and size checks; hands the file to `onFile` |
| | `command-palette.tsx` | Ctrl/Cmd K palette with groups |
| | `skeleton.tsx` | `Skeleton`, `SkeletonReveal` |
| | `loader.tsx` | `LineLoader` progress bar |
| | `animated-number.tsx` | Number that counts to its new value |
| `charts/` | `TimeChart.tsx` | Time series: lines, range band, filled area, reference lines, shaded spans, night shading, crosshair tooltip, arrow-key reading |
| | `Heatmap.tsx` | Days × 15-minute cells, sequential colour scale |
| `lib/` | `utils.ts` | `cn` (class merge), `clamp` |
| | `motion.ts` | Spring presets |
| | `chart.ts` | Paths, nice ticks, element width, outside-click |
| | `format.ts`, `time.ts`, `clock.ts` | Number, unit and time-zone formatting |

## Examples

```tsx
import { Card } from "./kit/ui/card";
import { TimeChart } from "./kit/charts/TimeChart";

<Card title="AC power" meta="MW · 15 min" info="Mean per 15 minutes">
  <TimeChart
    t={times}                       // UTC milliseconds, 15-minute steps
    tz="Europe/Berlin"
    unit="MW"
    series={[
      { key: "a", label: "Model A", color: "var(--m-ifs)", values: a },
      { key: "mean", label: "Mean", color: "var(--m-blend)", values: mean, width: 2.4 },
    ]}
    band={{ lo: min, hi: max, label: "Range" }}
    refLines={[{ value: 7.7, label: "Limit 7.7 MW" }]}
    ariaLabel="AC power forecast"
  />
</Card>
```

```tsx
import { Segmented } from "./kit/ui/segmented";

<Segmented label="Period" value={period} onChange={setPeriod}
  options={[{ value: "d", label: "Day" }, { value: "w", label: "Week" }]} />
```

## Design rules

- Colour follows the series: `--m-ifs`, `--m-aifs`, `--m-gfs`, `--m-blend`, checked for colour-blind safety on the light and dark surfaces. Add new series colours only after checking them.
- Status colours (`--good`, `--warning`, `--critical`) always come with an icon and a word.
- One y-axis per chart. Dashed lines only for references.
- Cards in one grid row stretch to the same height; keep titles to one or two words and put explanations in `info`.
