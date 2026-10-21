# Confidence Calculator

Compare A/B test results, see how each version is doing, and plan what to test next.

[**Open the calculator →**](https://confidence.nickyreinert.de)

![The calculator comparing a control with a variant](assets/confidence-calculator.jpg)

## What it does

- Compares visitors and conversions for your control and test versions
- Shows conversion rates, lift, and confidence at a glance
- Estimates how many visitors you may need and charts your projections
- Imports data pasted from a spreadsheet or report
- Shares your test setup with a link
- **Deep dive:** paste daily numbers to see how the test developed and catch common problems
- **Quick tour:** press **?** in the header for a short walk-through

## Try sample data

Use the fictional [sample data](demo-data.csv) to try an A/B test:

1. Open the calculator and choose **Import**.
2. Copy the contents of `demo-data.csv` and paste them into the box.
3. Choose the control row if needed, then select **Apply**.

## Projections

![Charts showing confidence over time and traffic sensitivity](assets/projections.jpg)

## Deep dive

Turn on **Deep dive** in the header and import one row per group and day — e.g. an Adobe Workspace table with *Experience → Day*.

![Deep dive with checks, daily traffic, confidence and uplift over time](assets/deep-dive.jpg)

- **Checks:** split changing over time, fading effect, full weeks, traffic piling up on a few days
- **Charts:** traffic per day, actual confidence over time, uplift over time
- **Breakdowns:** weekday, day of month, month
- **Better projections:** based on the last 7, 14 or 28 days (or all days) instead of the average since the start

Try it with the fictional [daily sample data](demo-daily.csv) — a test that looks like a clear win, until the Deep dive shows the effect wearing off.

**Note:** Confidence is a guide for comparing results, not a guarantee that a version will perform better.
