# BrightSite templates

The templates are original BrightSite implementations, rebuilt around three
downloaded demo sites. Their code, components, text, branding and photography
are not bundled; the generator continues to use its own content and images.

| Picker name | Direction | Reference studied |
| --- | --- | --- |
| Modern Salon | Cream-paper editorial presentation, simple image cards and quiet typography | Muse Hull |
| Garden Services | Green, image-led local-service website with rounded calls to action | MGS Beverley |
| Local Trades | Clear red-accent service site with strong calls to action | Brian Griffin Electrical |

Category data and page labels are selected by `demoContentForCategory`,
independently of the visual template. The generator recommends a sensible
starting template by industry, but every template remains available to choose.

Every design retains three views: home, category services/pricing and contact.
The shared content includes six gallery demos, three labelled sample reviews,
opening hours and a location map. No unsupported qualifications, client counts
or statistics were imported from the references.

Hero photographs retain their complete 16:9 composition with `object-fit:
contain`. Split layouts keep text outside the image. Overlay layouts protect
the upper 54%; oversized copy moves below and switches to readable colours.
Only ordinary gallery images receive gentle hover effects, never the 3D logo.

All surfaces use the shared palette variables. Explicit font choices also
update buttons. Appearance changes preserve the live document and scroll
position. Reduced-motion preferences disable reveals.

## Checks

- `npm run test:builder`: live builder controls, font/palette updates without
  reload, scroll preservation, real composited hero, three-template screenshots,
  desktop/phone preview sizing, mobile navigation and all three pages. Lead/email
  calls are intercepted.
- `npm run test:templates`: offline matrix of every business category across
  three designs at desktop and mobile sizes, checking content, prices, maps,
  gallery/review counts, horizontal overflow and the protected hero area.
