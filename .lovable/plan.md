## Change wallet hero badge label

In `src/components/wallet/UnifiedWalletHeroCard.tsx` (line 242), the purple "Payroll growing · 0.5% / day" badge currently reads:

```tsx
Payroll growing · {(payrollGrowth.dailyRate * 100).toFixed(1)}% / day
```

Replace the static label `Payroll growing` with `Balance growing`, keeping the dynamic rate suffix and the surrounding sparkle icon, parked amount, and earned amount untouched.

Result:
```
Balance growing · 0.5% / day
USh 5,000 parked · +USh 25 earned
```

No other files reference this string, and the underlying `payrollGrowth` data hook keeps its name (internal only — users never see it).