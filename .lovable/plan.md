# Charts: one pivot source, RON-verified, drawn in white

## What you saw

The `P` line at 4,469.70 and `R1` at 4,542.87 are drawn by TradingView's own built-in
"Pivots Traditional Auto" study, which the chart widget loads on every symbol. RON's
"Levels & pivots" overlay is a completely separate source and only lists pivots that RON
actually sealed into its snapshot, so the chart can show pivot lines that RON cannot explain.

RON already computes traditional pivots server-side from the previous completed session
(`P`, `R1-R3`, `S1-S3` from that session's high/low/close), but it currently seals only the
three levels nearest to price, so most of them never reach the overlay.

## The fix

1. Drop TradingView's pivot study from the chart widget, so nothing is drawn that RON
   did not verify.
2. Have RON seal the full traditional pivot set (P and R1-R3, S1-S3) from the last
   completed session instead of only the nearest three, keeping the existing formula and
   completed-session provenance untouched.
3. Show every sealed pivot in the "Levels & pivots" overlay in white, with a white line
   swatch, so pivots read as a neutral structural reference and stay visually distinct from
   jade support and red resistance.
4. Update the overlay footnote so it no longer credits TradingView's study, and state that
   pivots come from RON's last completed session.

## Result

One source of truth: every pivot price on the Charts page is a RON-verified value RON can
explain, rendered in white, and no unexplained third-party lines remain on the chart.

## Technical notes

- `src/components/dashboard/TradingViewWidget.tsx` — remove
  `studies: ["PivotPointsStandard@tv-basicstudies"]`.
- `supabase/functions/_shared/ron-technical-annotation-detector-v1.ts` — in `addPivots`,
  emit all seven candidates rather than the nearest three; touched/lifecycle logic per
  level is unchanged.
- `src/lib/chart-levels.ts` — raise the per-kind cap so a full pivot set plus S/R fits, and
  keep pivot labels as `Pivot P` / `Pivot R1` etc.; update `LEVEL_OVERLAY_NOTE`.
- `src/components/dashboard/ChartLevelsOverlay.tsx` — pivot style becomes white
  (`#FFFFFF`, white-tinted border/background).
- Existing chart-level and annotation tests are updated to cover the seven-level emission
  and the white pivot styling.
