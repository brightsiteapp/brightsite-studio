# BrightSite mobile app

React Native + Expo prototype for the BrightSite customer onboarding flow.

## Run locally

```bash
npm install
npm run web
```

Open the local URL at an iPhone-sized viewport. To run in Apple's simulator on a Mac:

```bash
npm run ios
```

## Prototype interactions

- Swipe cards up and down to move through onboarding.
- Tap or drag along the left icon rail to jump between information cards.
- On **Choose your design**, swipe sideways to change template.
- Use the right controls to change colour, font, and enter text/section editing mode.
- Continue through domain, plan, payment preview, and publishing dashboard.

The current build is a visual and interaction prototype. Authentication, uploads, live domain pricing, Stripe PaymentSheet, Supabase persistence, and publishing will be connected in the integration stage.

## Validation

```bash
npm run check
```
