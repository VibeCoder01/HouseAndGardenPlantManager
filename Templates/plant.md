---
id: {{id}}
type: plant
common: {{common}}
latin: {{latin}}
acquired: {{date}}
location: {{location}}
light: {{light}}
env:
  humidity_pct:
  temp_c:
pot:
  diameter_mm: {{pot_diameter_mm}}
  volume_l: {{pot_volume_l}}
  medium: {{medium}}
growth_phase: auto
seasonal_overrides:
  - months: [11,12,1,2]
    water_factor: 0.6
    fertilise: pause
care:
  water:
    check: combo
    target_rule: pot_10pct_or_runoff
    interval_days_hint: {{water_interval_days_hint}}
    last:
    flush_salts_months: 4
  fertilise:
    during: active_only
    cadence: monthly
    last:
    product: balanced_10-10-10
  prune:
    interval_days_hint: 90
    last:
  repot:
    last:
    guidance: spring_preferred
status: active
water_quality:
  rest_tap_24h: false
drought_stressed: false
tags: [houseplant]
---
# {{common}}

- Latin: {{latin}}
- Location: {{location}}

## Notes
