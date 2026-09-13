// Eight presentation systems. This module deliberately has no business copy,
// services, prices or category rules: changing a design cannot change content.
function templateDesignCSS() {
  return `
  /* Readable navigation and actions across every font, palette and screen. */
  body{font-size:17px}
  .nav{font-size:16px;gap:26px}.brand{font-size:26px}.brand small{font-size:11px}
  .button,.text-link,.category-jumps a,.project summary{font-size:16px;line-height:1.35}
  .button{min-height:50px;padding:15px 24px;font-weight:600}
  .card-foot{font-size:14px;line-height:1.4}.card-content p,.directory-card p{font-size:15px}
  .eyebrow{font-size:12px}.mobile-nav{font-size:17px}.mobile-nav a{min-height:48px}
  .contact-details span,.hours p,footer nav{font-size:14px}
  .hero-copy .hero-title{line-height:1.1}.hero-copy .button{font-size:16px}
  .service-card,.membership-card,.project,.directory-card{min-width:0}
  .hero-copy[style*="relative"]{background:var(--header)}
  .hero-copy[style*="relative"] .hero-title{color:var(--ink)}
  .hero-copy[style*="relative"] .eyebrow{color:var(--accent)}
  .hero-copy[style*="relative"] .hero-actions .button{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
  .hero-copy[style*="relative"] .hero-actions .secondary{background:transparent;color:var(--accent)}
  .layout-minimal .section{padding:80px 0}
  .layout-minimal .section-heading h2{font-size:clamp(34px,4vw,58px);letter-spacing:-.055em}
  .layout-minimal .service-card{box-shadow:none;border-radius:12px}
  .layout-minimal .service-card:hover{transform:translateY(-3px);box-shadow:none}
  .layout-minimal .gallery{grid-template-columns:repeat(3,1fr);gap:20px}
  .layout-minimal .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:4/3;transform:none;border-radius:12px}
  .layout-minimal .reviews{display:grid;grid-template-columns:repeat(3,1fr)}
  .layout-minimal .review-card:nth-child(n){display:flex;grid-column:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
  .layout-minimal .review-card blockquote{font-size:25px}
  .layout-minimal .reservation-ticket{transform:none;margin-left:0;border-radius:12px}
  .layout-minimal .membership-card:nth-child(2),.layout-minimal .expertise-cards .service-card:nth-child(even){transform:none}
  .layout-minimal .reveal{transform:none;transition:opacity .45s ease}

  /* Editorial: a magazine spine, large serif type and staggered photo essays. */
  .layout-editorial .container{width:min(1320px,100% - 88px)}
  .layout-editorial .site-header{border-bottom:2px solid var(--ink)}
  .layout-editorial .button{border-radius:0;background:transparent;color:var(--accent);border-width:0 0 2px;padding:14px 0}
  .layout-editorial .nav .button{padding:14px 18px;border:1px solid var(--accent)}
  .layout-editorial .signature .container:first-child{position:relative}
  .layout-editorial .section-heading h2{font-size:clamp(48px,6.5vw,94px);font-weight:400;line-height:1.02;letter-spacing:-.065em}
  .layout-editorial .signature .intro-pair{display:block;max-width:780px;margin-bottom:64px;border-top:1px solid var(--ink);padding-top:30px}
  .layout-editorial .signature .intro-pair>.text-link{margin-top:25px}
  .layout-editorial .service-grid,.layout-editorial .membership-grid{grid-template-columns:1.2fr 1fr;gap:54px 7%}
  .layout-editorial .service-card{border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible}
  .layout-editorial .service-card:nth-child(even){margin-top:85px}
  .layout-editorial .service-card:hover{transform:none;box-shadow:none}
  .layout-editorial .card-picture{aspect-ratio:5/4;overflow:hidden}
  .layout-editorial .card-content{padding:25px 0 0;border-bottom:1px solid var(--ink)}
  .layout-editorial .card-content h3{font-size:42px;max-width:18ch;font-weight:400}
  .layout-editorial .card-content p{max-width:38ch}
  .layout-editorial .card-foot{padding:20px 0;border-top:0}
  .layout-editorial .card-number{padding:20px 0;border-top:1px solid var(--ink);font-size:18px}
  .layout-editorial .story-photo{border-radius:0;min-height:550px}
  .layout-editorial .gallery{grid-template-columns:1.2fr .8fr;gap:50px 7%;align-items:start}
  .layout-editorial .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:4/5;border-radius:0;transform:none}
  .layout-editorial .gallery-demo:nth-child(even){margin-top:100px;aspect-ratio:1}
  .layout-editorial .reviews{display:block;border-top:1px solid var(--ink)}
  .layout-editorial .review-card:nth-child(n){display:grid;grid-template-columns:140px 1fr 180px;align-items:center;gap:32px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;padding:36px 0}
  .layout-editorial .review-card blockquote{font-size:34px;margin:0}
  .layout-editorial .review-card p{margin:0}
  .layout-editorial .closing{background:var(--bg);color:var(--ink);border-top:1px solid var(--ink)}
  .layout-editorial .closing h2{font-size:clamp(60px,10vw,140px);font-weight:400}
  .layout-editorial .closing .eyebrow{color:var(--accent)}
  .layout-editorial .closing .button{background:var(--accent);color:var(--on-accent);padding:20px 28px}

  /* Bold: oversized display type, square blocks and a strong two-column grid. */
  .layout-bold .container{width:min(1320px,100% - 64px)}
  .layout-bold .site-header{background:var(--bg);border-bottom:2px solid var(--accent)}
  .layout-bold .button{border-radius:0;box-shadow:none;font-size:18px;padding:16px 25px}
  .layout-bold .signature .section-heading{max-width:1100px}
  .layout-bold .signature h2{font-size:clamp(66px,10vw,144px);letter-spacing:-.025em;line-height:.94;text-transform:uppercase}
  .layout-bold .service-grid,.layout-bold .membership-grid{grid-template-columns:repeat(2,1fr);gap:3px}
  .layout-bold .service-card{border-radius:0;border:0;background:var(--surface)}
  .layout-bold .service-card:nth-child(3n+2){background:var(--accent);color:var(--on-accent)}
  .layout-bold .service-card:nth-child(3n+2) p,.layout-bold .service-card:nth-child(3n+2) .card-foot,.layout-bold .service-card:nth-child(3n+2) .card-number{color:var(--on-accent)}
  .layout-bold .service-card:nth-child(3n+2) .card-foot{border-color:color-mix(in srgb,var(--on-accent) 35%,transparent)}
  .layout-bold .card-picture{aspect-ratio:16/9;filter:saturate(.85)}
  .layout-bold .card-content{padding:36px}
  .layout-bold .card-content h3{font-size:54px;letter-spacing:0;text-transform:uppercase}
  .layout-bold .card-content p{max-width:38ch}
  .layout-bold .service-card:hover{transform:none;box-shadow:inset 0 -6px 0 var(--accent)}
  .layout-bold .story{border-top:3px solid var(--accent)}
  .layout-bold .story h2{font-size:clamp(60px,7vw,100px);text-transform:uppercase;letter-spacing:-.015em}
  .layout-bold .story-photo{border-radius:0}
  .layout-bold .gallery{grid-template-columns:repeat(3,1fr);gap:3px}
  .layout-bold .gallery-demo:nth-child(n){aspect-ratio:1;grid-column:auto;border-radius:0;transform:none}
  .layout-bold .gallery-demo:first-child{grid-column:span 2;grid-row:span 2;aspect-ratio:1}
  .layout-bold .reviews{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
  .layout-bold .review-card:nth-child(n){display:flex;grid-column:auto;border-radius:0;border:0;border-top:5px solid var(--accent);padding:32px;background:var(--surface)}
  .layout-bold blockquote{font-size:34px;letter-spacing:.01em}
  .layout-bold .closing h2{font-size:clamp(80px,14vw,190px);text-transform:uppercase;letter-spacing:-.02em;line-height:.85}
  .layout-bold .reveal{transform:translateY(40px);transition:opacity .45s ease,transform .65s cubic-bezier(.16,1,.3,1)}

  /* Luxe: sculpted images, floating panels and a more spacious salon-like pace. */
  .layout-luxe .section{padding:120px 0}
  .layout-luxe .signature .intro-pair{display:flex;align-items:center;flex-direction:column;text-align:center;margin-bottom:65px}
  .layout-luxe .signature .section-heading{max-width:850px}
  .layout-luxe .section-heading h2{font-size:clamp(55px,7vw,100px);font-weight:400;line-height:1}
  .layout-luxe .section-heading p{margin-left:auto;margin-right:auto}
  .layout-luxe .button{border-radius:999px;padding:16px 27px}
  .layout-luxe .service-grid{grid-template-columns:repeat(4,1fr);gap:24px;align-items:start}
  .layout-luxe .service-card{border-radius:150px 150px 24px 24px;border:0;box-shadow:0 20px 45px color-mix(in srgb,var(--accent) 8%,transparent)}
  .layout-luxe .service-card:nth-child(even){margin-top:65px}
  .layout-luxe .card-picture{aspect-ratio:3/4}
  .layout-luxe .card-content{padding:28px 22px;text-align:center}
  .layout-luxe .card-content h3{font-size:34px;font-weight:400}
  .layout-luxe .card-foot{justify-content:center;flex-direction:column;gap:12px}
  .layout-luxe .card-number{padding:50px 28px 0;justify-content:center}
  .layout-luxe .story-grid,.layout-luxe .professional-story,.layout-luxe .automotive-story{grid-template-columns:1.15fr .85fr;gap:0;align-items:center}
  .layout-luxe .story-photo{border-radius:45% 45% 12px 12px;min-height:580px}
  .layout-luxe .story-grid>div:last-child,.layout-luxe .professional-story>div:last-child,.layout-luxe .automotive-story>div:last-child{background:var(--card);padding:48px;margin-left:-50px;border-radius:24px;position:relative;box-shadow:0 20px 50px color-mix(in srgb,var(--accent) 8%,transparent)}
  .layout-luxe .story h2{font-size:clamp(48px,5vw,70px);font-weight:400}
  .layout-luxe .gallery{grid-template-columns:1fr 1.25fr 1fr;gap:24px;align-items:center}
  .layout-luxe .gallery-demo:nth-child(n){grid-column:auto;border-radius:160px 160px 20px 20px;aspect-ratio:3/4;transform:none}
  .layout-luxe .gallery-demo:nth-child(2),.layout-luxe .gallery-demo:nth-child(5){aspect-ratio:3/5;border-radius:24px}
  .layout-luxe .reviews{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .layout-luxe .review-card:nth-child(n){display:flex;grid-column:auto;border:0;background:var(--card);border-radius:24px;padding:36px}
  .layout-luxe .review-card blockquote{font-size:30px;font-weight:400}
  .layout-luxe .closing{width:calc(100% - 48px);margin:24px auto;border-radius:45px}
  .layout-luxe .closing h2{font-weight:400}
  .layout-luxe .reveal{transform:translateY(20px);transition:opacity 1s ease,transform 1.1s cubic-bezier(.2,.7,.2,1)}

  /* Kinetic: wide immersive cards that move with ordinary vertical scrolling. */
  .layout-kinetic .container{width:min(1320px,100% - 64px)}
  .layout-kinetic .signature .section-heading{max-width:1000px}
  .layout-kinetic .signature .section-heading h2{font-size:clamp(54px,7.8vw,110px);line-height:1.02;letter-spacing:-.07em;font-weight:600}
  .layout-kinetic .signature .intro-pair{align-items:end}
  .layout-kinetic .service-card{border-radius:24px;box-shadow:none;border:1px solid var(--line)}
  .layout-kinetic .card-content h3{font-size:40px;letter-spacing:-.06em}
  .layout-kinetic .card-picture{aspect-ratio:16/10}
  .layout-kinetic .story{border-radius:60px 60px 0 0}
  .layout-kinetic .story-photo{border-radius:30px}
  .layout-kinetic .gallery{grid-template-columns:1.3fr .7fr;gap:35px}
  .layout-kinetic .gallery-demo:nth-child(n){grid-column:auto;border-radius:24px;aspect-ratio:4/3;transform:none}
  .layout-kinetic .gallery-demo:nth-child(even){aspect-ratio:3/4;margin-top:100px}
  .layout-kinetic .reviews{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .layout-kinetic .review-card:nth-child(n){display:flex;background:var(--card);padding:40px;border:1px solid var(--line);border-radius:24px}
  .layout-kinetic .review-card:first-child{grid-column:1/-1;background:var(--accent);color:var(--on-accent)}
  .layout-kinetic .review-card:first-child .review-stars,.layout-kinetic .review-card:first-child p{color:var(--on-accent)}
  .layout-kinetic .review-card:first-child blockquote{font-size:clamp(32px,4vw,54px);max-width:34ch}
  .layout-kinetic .closing{border-radius:60px 60px 0 0}
  .motion-track{position:relative;min-width:0}
  .motion-sticky{position:sticky;top:calc(var(--header-height) + 18px);overflow:clip;padding-bottom:18px}
  .layout-kinetic .motion-rail{display:flex!important;flex-wrap:nowrap;gap:26px!important;will-change:transform;margin:0!important}
  .layout-kinetic .motion-rail> *{flex:0 0 min(46vw,600px);margin:0!important;padding-top:0;transform:none!important}
  .layout-kinetic .motion-rail .card-picture,.layout-kinetic .motion-rail .project-image{height:clamp(170px,28vh,300px);aspect-ratio:auto}
  .layout-kinetic .motion-rail .card-content{padding:24px 30px}
  .layout-kinetic .motion-rail .card-content p{margin:15px 0 22px}
  .layout-kinetic .motion-rail .membership-card{padding:30px}
  .layout-kinetic .motion-rail .project-title{margin:20px 0}
  .layout-kinetic .motion-rail .project-title h3{font-size:28px}
  .layout-kinetic .signature .expertise-grid:has(.motion-track),.layout-kinetic .signature .automotive-grid:has(.motion-track){display:block}
  .layout-kinetic .expertise-intro:has(+ .motion-track){position:static;margin-bottom:45px}
  .scroll-progress{position:fixed;top:0;left:0;height:3px;width:100%;background:var(--accent);transform-origin:left;transform:scaleX(0);z-index:25;pointer-events:none}
  .layout-kinetic .reveal{transform:translateY(32px);transition:opacity .55s ease,transform .8s cubic-bezier(.16,1,.3,1)}

  .layout-bold .reveal.in,.layout-luxe .reveal.in,.layout-kinetic .reveal.in{transform:none}
  @media(min-width:1101px){.layout-editorial .story-copy,.layout-editorial .professional-story>div:last-child{position:sticky;top:110px}.layout-editorial .story-grid,.layout-editorial .professional-story{align-items:start}}
  @media(max-width:1100px){
    .nav{gap:16px;font-size:15px}.nav .button{font-size:15px;padding:13px 16px}.brand{max-width:30%;font-size:22px}
    .layout-luxe .service-grid{grid-template-columns:repeat(2,1fr)}
    .layout-luxe .story-grid>div:last-child,.layout-luxe .professional-story>div:last-child,.layout-luxe .automotive-story>div:last-child{padding:30px;margin-left:-25px}
    .layout-editorial .review-card:nth-child(n){grid-template-columns:1fr;gap:20px}
  }
  @media(max-width:900px){
    .layout-kinetic .motion-sticky{position:static;overflow:visible}
    .layout-kinetic .motion-rail{overflow-x:auto;scroll-snap-type:x mandatory;transform:none!important;padding-bottom:20px;will-change:auto}
    .layout-kinetic .motion-rail> *{flex-basis:82%;scroll-snap-align:center}
    .motion-track{height:auto!important}
  }
  @media(max-width:760px){
    .header-inner{gap:10px}.brand{font-size:21px;max-width:none}.header-action{font-size:14px!important;min-height:44px;padding:11px 14px!important}
    .hero-copy .button{font-size:15px}.hero-title{font-size:36px}.button,.text-link{font-size:16px;min-height:46px}
    .hero-actions{gap:10px}.hero-actions .button{padding:13px 17px}
    .card-content p{font-size:15px}.card-foot{font-size:14px}.eyebrow{font-size:11px}
    .layout-minimal .container,.layout-editorial .container,.layout-bold .container,.layout-luxe .container,.layout-kinetic .container{width:calc(100% - 36px)}
    .layout-minimal .section,.layout-editorial .section,.layout-bold .section,.layout-luxe .section,.layout-kinetic .section{padding:64px 0}
    .layout-editorial .section-heading h2{font-size:52px}.layout-editorial .signature .intro-pair{margin-bottom:35px;padding-top:25px}
    .layout-editorial .service-grid,.layout-editorial .membership-grid{grid-template-columns:1fr;gap:40px}
    .layout-editorial .service-card:nth-child(even){margin-top:0}
    .layout-editorial .card-content h3{font-size:36px}.layout-editorial .card-picture{aspect-ratio:5/4}
    .layout-editorial .story-photo{min-height:0;height:400px}
    .layout-editorial .gallery{gap:25px 14px}.layout-editorial .gallery-demo:nth-child(even){margin-top:40px}
    .layout-bold .signature h2{font-size:64px}.layout-bold .service-grid,.layout-bold .membership-grid{grid-template-columns:1fr;gap:12px}
    .layout-bold .card-content{padding:28px}.layout-bold .card-content h3{font-size:46px}
    .layout-bold .story h2{font-size:58px}.layout-bold .closing h2{font-size:80px}
    .layout-bold .gallery{grid-template-columns:1fr 1fr}.layout-bold .gallery-demo:first-child{grid-column:span 2;grid-row:auto;aspect-ratio:4/3}
    .layout-luxe .signature .intro-pair{margin-bottom:40px}.layout-luxe .section-heading h2{font-size:60px}
    .layout-luxe .service-grid{grid-template-columns:1fr;gap:32px}
    .layout-luxe .service-card{border-radius:160px 160px 24px 24px}
    .layout-luxe .service-card:nth-child(even){margin-top:0}
    .layout-luxe .card-picture{aspect-ratio:4/3}.layout-luxe .card-content{padding:28px}
    .layout-luxe .card-content h3{font-size:38px}
    .layout-luxe .story-grid,.layout-luxe .professional-story,.layout-luxe .automotive-story{grid-template-columns:1fr;gap:0}
    .layout-luxe .story-photo{min-height:0;height:400px}
    .layout-luxe .story-grid>div:last-child,.layout-luxe .professional-story>div:last-child,.layout-luxe .automotive-story>div:last-child{margin:-50px 12px 0;padding:30px}
    .layout-luxe .gallery{grid-template-columns:1fr 1fr;gap:16px}.layout-luxe .gallery-demo:nth-child(n){aspect-ratio:3/4}
    .layout-luxe .closing{width:calc(100% - 24px);border-radius:30px}
    .layout-kinetic .signature .section-heading h2{font-size:50px}
    .layout-kinetic .signature .intro-pair{align-items:start}
    .layout-kinetic .motion-rail .card-content h3{font-size:32px}.layout-kinetic .motion-rail .card-content{padding:24px}
    .layout-kinetic .gallery{grid-template-columns:1fr 1fr;gap:18px}.layout-kinetic .gallery-demo:nth-child(even){margin-top:45px}
    .layout-kinetic .story,.layout-kinetic .closing{border-radius:30px 30px 0 0}
    .layout-minimal .reviews,.layout-bold .reviews,.layout-luxe .reviews,.layout-kinetic .reviews{grid-template-columns:1fr}
    .layout-kinetic .review-card:nth-child(n){padding:28px}
    .layout-minimal .gallery{grid-template-columns:1fr 1fr;gap:12px}
  }
  @media(max-width:380px){.brand{font-size:18px}.header-inner{gap:7px}.header-action{padding:10px 11px!important}.hero-actions .button{width:100%}}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1!important;transform:none!important}.motion-track{height:auto!important}.motion-sticky{position:static}.layout-kinetic .motion-rail{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));transform:none!important;will-change:auto}.layout-kinetic .motion-rail> *{min-width:0}.scroll-progress{display:none}}
  @media(prefers-reduced-motion:reduce) and (max-width:760px){.layout-kinetic .motion-rail{grid-template-columns:1fr}}
  ${studioLayoutCSS()}
  /* Services / prices page — compact menu rows across every visual style. */
  .service-directory{padding-top:32px}.service-group{margin-bottom:52px}.group-heading{margin-bottom:16px}
  .directory-grid{display:block!important;border-top:1px solid var(--line)}
  .directory-card{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(130px,.34fr) auto!important;align-items:center;gap:18px!important;padding:15px 4px!important;margin:0!important;border:0!important;border-bottom:1px solid var(--line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transform:none!important}
  .directory-card h3{font-size:clamp(18px,2vw,23px)!important;line-height:1.15;margin:0!important;font-weight:500}
  .directory-card p{margin:0!important;font-size:14px!important;color:var(--muted)}
  .directory-card .text-link{grid-column:3;align-self:center!important;margin:0!important;padding:7px 0;font-size:12px;white-space:nowrap}
  @media(max-width:600px){
    .service-directory{padding-top:24px}.service-group{margin-bottom:42px}.group-heading{margin-bottom:12px}
    .directory-card{grid-template-columns:minmax(0,1fr) auto!important;gap:6px 14px!important;padding:14px 0!important}
    .directory-card h3{font-size:19px!important}.directory-card p{grid-column:1;font-size:13px!important}
    .directory-card .text-link{grid-column:2;grid-row:1/3;font-size:11px}
  }
  `;
}

// Original BrightSite layouts, informed by broad editorial/portfolio design
// patterns. No Framer source, components, copy or template assets are bundled.
function studioLayoutCSS() {
  return `
  ${softLayoutCSS()}
  ${sereneLayoutCSS()}
  ${organicLayoutCSS()}
  ${editorialStudioCSS()}
  ${noirLayoutCSS()}
  ${perspectiveLayoutCSS()}
  ${lumeLayoutCSS()}
  ${indexLayoutCSS()}
  ${studioProLayoutCSS()}
  ${fluxLayoutCSS()}
  ${bloomLayoutCSS()}
  @media(max-width:760px){.layout-lume .button,.layout-index .button{font-size:15px}.layout-lume .header-action,.layout-index .header-action{font-size:14px}.layout-studio .studio-hero{padding:16px}.layout-studio .studio-marquee{position:static;order:3;font-size:100px}}
  /* Minimal — a quiet information column beside an image-led portfolio. */
  .layout-minimal .container{width:min(1440px,100% - 48px)}
  .layout-minimal .site-header{background:var(--bg);border-color:var(--line)}
  .layout-minimal .hero{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr);gap:36px;align-items:center;padding:36px 24px 54px;background:var(--bg)}
  .layout-minimal .brand-scene{grid-column:2;grid-row:1;border-radius:10px}
  .layout-minimal .hero-copy{position:static!important;grid-column:1;grid-row:1;padding:20px 12px;background:none}
  .layout-minimal .hero-title{font-size:clamp(36px,4vw,62px);max-width:16ch;line-height:1.08;color:var(--ink);font-weight:500}
  .layout-minimal .hero-copy .eyebrow{color:var(--accent);font-size:11px}
  .layout-minimal .button{border-radius:999px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);box-shadow:none;font-size:16px;padding:14px 22px}
  .layout-minimal .hero-actions .secondary{background:transparent;color:var(--ink);border-color:var(--line)}
  .layout-minimal .signature>.container{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr);gap:48px;align-items:start}
  .layout-minimal .signature .intro-pair{display:block;position:sticky;top:110px;margin:0}
  .layout-minimal .signature .intro-pair .text-link{margin-top:28px}
  .layout-minimal .signature .section-heading{margin-bottom:32px}
  .layout-minimal .section-heading h2{font-size:clamp(36px,4vw,56px);font-weight:500;line-height:1.1}
  .layout-minimal .service-grid,.layout-minimal .expertise-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
  .layout-minimal .card-picture{aspect-ratio:4/5}
  .layout-minimal .service-card{border:0;border-radius:10px;background:var(--surface)}
  .layout-minimal .card-content{padding:25px}.layout-minimal .card-content h3{font-size:30px}
  .layout-minimal .gallery{grid-template-columns:1fr 1fr;align-items:start;gap:24px}
  .layout-minimal .gallery-demo:nth-child(n){aspect-ratio:4/5;border-radius:10px}
  .layout-minimal .gallery-demo:nth-child(even){aspect-ratio:1}
  .layout-minimal .review-card:nth-child(n){background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:30px 0}
  .layout-minimal .closing{background:var(--bg);color:var(--ink);border-top:1px solid var(--line)}
  .layout-minimal .closing .eyebrow{color:var(--accent)}
  .layout-minimal .closing .button{background:var(--accent);color:var(--on-accent)}
  .layout-minimal .closing h2{font-size:clamp(48px,7vw,92px)}
  .layout-minimal .page-intro{background:var(--bg);border-bottom:1px solid var(--line)}
  .layout-minimal .directory-card,.layout-minimal .contact-card{border-radius:10px;background:var(--surface)}
  .layout-minimal .directory-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  @media(max-width:900px){
    .layout-minimal .hero{display:flex;flex-direction:column;gap:0;padding:18px 18px 35px;align-items:stretch}
    .layout-minimal .hero-copy{padding:28px 0 0}.layout-minimal .hero-title{font-size:44px;max-width:18ch}
    .layout-minimal .signature>.container{display:block}.layout-minimal .signature .intro-pair{position:static;margin-bottom:36px}
    .layout-minimal .signature .section-heading{margin-bottom:28px}
    .layout-minimal .container{width:calc(100% - 36px)}
    .layout-minimal .directory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media(max-width:560px){
    .layout-minimal .service-grid,.layout-minimal .expertise-cards,.layout-minimal .directory-grid{grid-template-columns:1fr}
    .layout-minimal .card-picture{aspect-ratio:4/3}.layout-minimal .card-content{padding:26px}
    .layout-minimal .gallery{gap:12px}.layout-minimal .gallery-demo:nth-child(n){aspect-ratio:3/4}
  }
  `;
}

function softLayoutCSS() {
  return `
  .layout-soft .container{width:min(1240px,100% - 72px)}
  .layout-soft .site-header{background:var(--bg)}
  .layout-soft .hero{display:flex;flex-direction:column-reverse;background:var(--bg);padding:36px 36px 20px;gap:36px}
  .layout-soft .hero-copy{position:static!important;background:transparent;text-align:center;padding:35px 20px 12px}
  .layout-soft .hero-copy .inner{max-width:900px}
  .layout-soft .hero-title{font-size:clamp(48px,6.2vw,86px);line-height:1.04;max-width:18ch;margin:22px auto 32px;color:var(--ink);font-weight:600}
  .layout-soft .hero-copy .eyebrow{display:inline-block;background:var(--surface);color:var(--accent);padding:10px 22px;border-radius:50px}
  .layout-soft .hero-actions{justify-content:center}
  .layout-soft .brand-scene{width:min(1240px,100%);margin:auto;border-radius:32px;border:6px solid var(--card)}
  .layout-soft .button{border-radius:999px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);box-shadow:none}
  .layout-soft .hero-actions .secondary{background:var(--card);color:var(--ink);border-color:var(--line)}
  .layout-soft .section-heading h2{font-size:clamp(40px,4.4vw,66px);line-height:1.12;font-weight:600}
  .layout-soft .signature .intro-pair{flex-direction:column;text-align:center;align-items:center}
  .layout-soft .signature .section-heading{margin-left:auto;margin-right:auto;text-align:center}
  .layout-soft .section-heading p{margin-left:auto;margin-right:auto}
  .layout-soft .service-grid,.layout-soft .expertise-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
  .layout-soft .service-card{border:6px solid var(--card);border-radius:28px;background:var(--surface);box-shadow:none}
  .layout-soft .service-card:has(.card-picture){display:grid;grid-template-columns:.8fr 1fr}
  .layout-soft .card-picture{height:100%;aspect-ratio:auto;min-height:280px;border-radius:21px}
  .layout-soft .card-content{padding:30px 24px}.layout-soft .card-content h3{font-size:30px;line-height:1.12}
  .layout-soft .card-foot{flex-wrap:wrap;gap:10px}
  .layout-soft .story{margin:20px 24px;border-radius:40px}
  .layout-soft .story-photo{border-radius:28px}.layout-soft .story h2{font-size:clamp(38px,4vw,58px);line-height:1.12}
  .layout-soft .gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .layout-soft .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:1;border-radius:28px;transform:none;border:5px solid var(--card)}
  .layout-soft .reviews{grid-template-columns:1.2fr 1fr;gap:20px}
  .layout-soft .review-card:nth-child(n){display:flex;border:0;border-radius:28px;background:var(--surface);padding:35px}
  .layout-soft .review-card:first-child{grid-row:span 2;justify-content:center;background:var(--card)}
  .layout-soft .review-card:first-child blockquote{font-size:38px}.layout-soft .review-card:first-child p{margin-top:15px}
  .layout-soft .closing{margin:24px;border-radius:40px;text-align:center}
  .layout-soft .closing-grid{display:flex;align-items:center;flex-direction:column;gap:24px}
  .layout-soft .closing h2{font-size:clamp(48px,6vw,82px);font-weight:600}
  .layout-soft .page-intro{background:var(--bg);text-align:center}.layout-soft .page-intro .section-heading{margin:auto}
  .layout-soft .directory-card,.layout-soft .contact-card{border:4px solid var(--card);border-radius:28px;background:var(--surface)}
  .layout-soft .category-jumps a{background:var(--card);border-radius:30px}.layout-soft .map{border-radius:28px}
  @media(max-width:900px){
    .layout-soft .hero{flex-direction:column;padding:18px;gap:0}.layout-soft .brand-scene{border-radius:20px;border-width:3px}
    .layout-soft .hero-copy{padding:30px 0 15px}.layout-soft .hero-title{font-size:48px;max-width:18ch}
    .layout-soft .service-card:has(.card-picture){display:flex}.layout-soft .card-picture{height:auto;min-height:0;aspect-ratio:4/3}
    .layout-soft .container{width:calc(100% - 36px)}.layout-soft .story{margin:12px;border-radius:28px}
    .layout-soft .closing{margin:12px;border-radius:28px}
  }
  @media(max-width:600px){
    .layout-soft .service-grid,.layout-soft .expertise-cards,.layout-soft .reviews,.layout-soft .directory-grid{grid-template-columns:1fr}
    .layout-soft .review-card:first-child{grid-row:auto}.layout-soft .review-card:first-child blockquote{font-size:30px}
    .layout-soft .gallery{grid-template-columns:1fr 1fr;gap:10px}.layout-soft .gallery-demo:nth-child(n){border-radius:18px;border-width:3px}
  }
  `;
}

function sereneLayoutCSS() {
  return `
  .layout-serene .hero{border-radius:0 0 50% 50% / 0 0 65px 65px;overflow:hidden}
  .layout-serene .hero-copy{padding:30px 48px 70px}
  .layout-serene .hero-title{font-size:clamp(48px,5.3vw,76px);font-weight:400;line-height:.97;max-width:22ch}
  .layout-serene .button{border-radius:999px;padding:16px 27px;box-shadow:none;transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s}
  .layout-serene .button:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 14px 30px color-mix(in srgb,var(--accent) 30%,transparent)}
  .layout-serene .site-header{background:color-mix(in srgb,var(--header) 88%,transparent);transition:box-shadow .35s ease,top .35s ease}
  .layout-serene .site-header.is-scrolled{box-shadow:0 18px 40px color-mix(in srgb,var(--ink) 12%,transparent)}
  .layout-serene .brand{font-family:var(--heading);font-size:32px;font-weight:500;font-style:italic}
  .layout-serene .section{padding:115px 0}
  .layout-serene .hero-title em,.layout-serene .hero-title i{font-style:italic;font-weight:400}
  .layout-serene .signature .intro-pair{align-items:center;flex-direction:column;text-align:center;margin-bottom:60px}
  .layout-serene .signature .section-heading{margin-left:auto;margin-right:auto;text-align:center}
  .layout-serene .section-heading h2{font-size:clamp(50px,5.5vw,82px);font-weight:400;letter-spacing:-.035em}
  .layout-serene .section-heading p{margin-left:auto;margin-right:auto}
  .layout-serene .service-grid,.layout-serene .expertise-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:42px}
  .layout-serene .service-card{border:0;border-radius:18px;background:var(--card);overflow:hidden;box-shadow:none}
  .layout-serene .card-picture{aspect-ratio:16/10}.layout-serene .card-content{padding:32px}
  .layout-serene .card-content h3{font-size:42px;font-weight:400}
  .layout-serene .story{border-radius:50% 50% 0 0 / 60px 60px 0 0;background:var(--surface)}
  .layout-serene .story-photo{border-radius:50% 50% 20px 20px;min-height:520px}
  .layout-serene .story h2{font-size:clamp(46px,5vw,72px);font-weight:400}
  .layout-serene .reviews{grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}
  .layout-serene .review-card:nth-child(n){display:flex;border:0;background:var(--surface);border-radius:22px;padding:36px}
  .layout-serene .review-card blockquote{font-size:30px;font-weight:400}
  .layout-serene .gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
  .layout-serene .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:4/5;transform:none;border-radius:18px}
  .layout-serene .gallery-demo:nth-child(3n+2){border-radius:50% 50% 18px 18px}
  .layout-serene .closing{border-radius:50% 50% 0 0 / 60px 60px 0 0;text-align:center}
  .layout-serene .closing-grid{display:flex;flex-direction:column;align-items:center;gap:25px}
  .layout-serene .closing h2{font-size:clamp(62px,8vw,110px);font-weight:400}
  .layout-serene .page-intro{text-align:center;border-radius:0 0 50% 50% / 0 0 45px 45px}
  .layout-serene .page-intro .section-heading{margin:auto}
  .layout-serene .directory-card,.layout-serene .contact-card{border:0;border-radius:22px;background:var(--surface);padding:34px}
  .layout-serene .directory-card h3{font-size:32px}.layout-serene .contact-card h2{font-size:56px}
  .layout-serene .map{border-radius:24px}.layout-serene .reveal{transition-duration:1s;transform:translateY(30px) scale(.98)}
  .layout-serene .reveal.in{transform:none}
  .layout-serene .brand-scene{will-change:transform;transform-origin:center 40%}
  @media(min-width:901px){
    .layout-serene .site-header{top:18px;left:50%;transform:translateX(-50%);width:calc(100% - 48px);max-width:1180px;border-radius:999px;border-bottom:0;box-shadow:0 10px 30px color-mix(in srgb,var(--ink) 8%,transparent)}
    .layout-serene .site-header .header-inner{width:100%;max-width:none;padding:0 14px 0 30px}
    .layout-serene .page{padding-top:calc(var(--header-height) + 30px)}
  }
  @media(max-width:900px){
    .layout-serene .hero{border-radius:0 0 50% 50% / 0 0 35px 35px}
    .layout-serene .hero-copy{position:static!important;padding:30px 24px 52px;text-align:center;background:var(--header)}
    .layout-serene .hero-title{font-size:54px;color:var(--ink);max-width:17ch;margin:18px auto 28px}
    .layout-serene .hero-copy .eyebrow{color:var(--accent)}.layout-serene .hero-actions{justify-content:center}
    .layout-serene .section{padding:72px 0}.layout-serene .story-photo{min-height:0}
    .layout-serene .service-grid,.layout-serene .expertise-cards{gap:22px}
  }
  @media(max-width:600px){
    .layout-serene .service-grid,.layout-serene .expertise-cards,.layout-serene .reviews,.layout-serene .directory-grid{grid-template-columns:1fr}
    .layout-serene .section-heading h2{font-size:52px}.layout-serene .card-content{padding:28px}.layout-serene .card-content h3{font-size:38px}
    .layout-serene .gallery{grid-template-columns:1fr 1fr;gap:12px}.layout-serene .gallery-demo:nth-child(n){border-radius:18px;aspect-ratio:3/4}
    .layout-serene .closing,.layout-serene .story{border-radius:50% 50% 0 0 / 28px 28px 0 0}
  }
  `;
}

function organicLayoutCSS() {
  return `
  .layout-organic .container{width:min(1360px,100% - 64px)}
  .layout-organic .hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);align-items:center;margin:22px;border-radius:20px;background:var(--surface);overflow:hidden}
  .layout-organic .brand-scene{height:auto;aspect-ratio:16/9}
  .layout-organic .hero-copy{position:static!important;background:transparent;padding:38px}
  .layout-organic .hero-copy .eyebrow{color:var(--accent);letter-spacing:.12em}
  .layout-organic .hero-title{font-size:clamp(38px,4vw,60px);line-height:1.07;max-width:16ch;color:var(--ink);margin:24px 0 30px;font-weight:500}
  .layout-organic .button{border-radius:10px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);box-shadow:none}
  .layout-organic .hero-actions .secondary{background:transparent;color:var(--ink);border-color:var(--line)}
  .layout-organic .section-heading h2{font-size:clamp(40px,4.5vw,66px);line-height:1.12;letter-spacing:-.05em}
  .layout-organic .signature .section-heading{max-width:680px}
  .layout-organic .service-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;align-items:start}
  .layout-organic .service-card{background:transparent;border:0;border-radius:0;overflow:visible;box-shadow:none}
  .layout-organic .card-picture{aspect-ratio:3/4;border-radius:12px;overflow:hidden}
  .layout-organic .card-content{background:var(--card);position:relative;margin:-36px 12px 0;padding:25px 20px;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 28px color-mix(in srgb,var(--ink) 6%,transparent)}
  .layout-organic .card-number+.card-content{margin-top:18px}
  .layout-organic .card-content h3{font-size:27px;line-height:1.15}.layout-organic .card-foot{flex-direction:column;align-items:start}
  .layout-organic .story{background:var(--accent);color:var(--on-accent);margin-top:35px}
  .layout-organic .story h2{font-size:clamp(42px,5vw,72px);line-height:1.1}
  .layout-organic .story p,.layout-organic .story .eyebrow,.layout-organic .story .steps b,.layout-organic .story small{color:var(--on-accent)}
  .layout-organic .story .steps p{border-color:color-mix(in srgb,var(--on-accent) 25%,transparent)}
  .layout-organic .story .button{background:var(--on-accent);color:var(--accent);border-color:var(--on-accent)}
  .layout-organic .story-photo{border-radius:12px}
  .layout-organic .story .coverage-card,.layout-organic .story .reservation-ticket,.layout-organic .story .trainer-card,.layout-organic .story .credential-cards article{background:var(--accent);color:var(--on-accent);border-color:color-mix(in srgb,var(--on-accent) 30%,transparent)}
  .layout-organic .gallery{display:grid;grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:38%;gap:24px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:22px}
  .layout-organic .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:4/5;border-radius:12px;transform:none;scroll-snap-align:start}
  .layout-organic .gallery-demo:nth-child(even){aspect-ratio:1}
  .layout-organic .reviews{grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
  .layout-organic .review-card:nth-child(n){display:flex;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:32px}
  .layout-organic .review-card blockquote{font-size:27px}
  .layout-organic .closing{background:var(--surface);color:var(--ink)}
  .layout-organic .closing .eyebrow{color:var(--accent)}.layout-organic .closing .button{background:var(--accent);color:var(--on-accent)}
  .layout-organic .closing h2{font-size:clamp(50px,7vw,92px);line-height:1.05}
  .layout-organic .page-intro{margin:22px;border-radius:20px;background:var(--surface)}
  .layout-organic .directory-card{background:var(--card);border-radius:12px;border-top:4px solid var(--accent)}
  .layout-organic .contact-card{border-radius:12px;border:1px solid var(--line)}
  @media(min-width:1101px){.layout-organic .story-grid{align-items:start}.layout-organic .story-photo{position:sticky;top:110px}}
  @media(max-width:1100px){.layout-organic .service-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.layout-organic .hero-copy{padding:26px}}
  @media(max-width:900px){
    .layout-organic .hero{display:block;margin:16px}.layout-organic .hero-copy{padding:30px 22px}
    .layout-organic .hero-title{font-size:46px;max-width:20ch}.layout-organic .hero-actions{gap:12px}
    .layout-organic .container{width:calc(100% - 36px)}.layout-organic .gallery{grid-auto-columns:76%;gap:16px}
    .layout-organic .page-intro{margin:16px}
  }
  @media(max-width:600px){
    .layout-organic .service-grid,.layout-organic .expertise-cards,.layout-organic .reviews,.layout-organic .directory-grid{grid-template-columns:1fr}
    .layout-organic .card-picture{aspect-ratio:4/3}.layout-organic .card-content{margin:-30px 16px 0;padding:28px}.layout-organic .card-content h3{font-size:32px}
    .layout-organic .section-heading h2{font-size:44px}
  }
  `;
}

function editorialStudioCSS() {
  return `
  .layout-editorial .hero{display:flex;flex-direction:column-reverse;background:var(--bg);padding:40px 44px 50px;gap:40px}
  .layout-editorial .hero-copy{position:static!important;background:none;padding:25px 0;text-align:center}
  .layout-editorial .hero-copy .inner{max-width:1100px}
  .layout-editorial .hero-copy .eyebrow{color:var(--accent)}
  .layout-editorial .hero-title{font-size:clamp(64px,7.8vw,112px);font-weight:400;color:var(--ink);line-height:1.02;letter-spacing:-.06em;max-width:20ch;margin:25px auto 35px}
  .layout-editorial .hero-actions{justify-content:center}
  .layout-editorial .brand-scene{width:100%;border-radius:0}
  .layout-editorial .button{padding:15px 24px;border:1px solid var(--accent);border-radius:999px;background:var(--accent);color:var(--on-accent);box-shadow:none}
  .layout-editorial .nav .button{border-radius:999px}
  .layout-editorial .hero-actions .secondary{background:transparent;color:var(--accent);border-color:var(--accent)}
  .layout-editorial .site-header{border-bottom:1px solid var(--line);background:var(--bg)}
  .layout-editorial .brand{font-family:var(--heading);font-size:30px;font-weight:400}
  .layout-editorial .signature .intro-pair{display:flex;align-items:center;flex-direction:column;text-align:center;max-width:none;border:0;padding:0;margin-bottom:64px}
  .layout-editorial .signature .section-heading{max-width:900px}
  .layout-editorial .signature .section-heading p{margin-left:auto;margin-right:auto}
  .layout-editorial .service-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:44px 30px}
  .layout-editorial .service-card:nth-child(n){margin:0;overflow:hidden;background:var(--card)}
  .layout-editorial .service-card:first-child{grid-column:1/-1;display:grid;grid-template-columns:1.35fr 1fr;align-items:center;background:var(--surface)}
  .layout-editorial .service-card:first-child .card-picture{height:100%;aspect-ratio:16/10;min-height:370px}
  .layout-editorial .service-card:first-child .card-content{padding:48px;border:0}
  .layout-editorial .card-content{padding:28px;border:1px solid var(--line);border-top:0}
  .layout-editorial .card-content h3{font-size:38px;line-height:1.08}
  .layout-editorial .service-card:first-child .card-content h3{font-size:clamp(44px,4.4vw,64px)}
  .layout-editorial .card-picture{aspect-ratio:4/5}
  .layout-editorial .card-number{padding:30px}.layout-editorial .card-number+.card-content{border-top:1px solid var(--line)}
  .layout-editorial .service-card:first-child:has(.card-number){display:flex}
  .layout-editorial .reviews{display:grid;grid-template-columns:1fr 1fr;border:0;gap:36px}
  .layout-editorial .review-card:nth-child(n){display:flex;gap:0;padding:35px 0;border-top:1px solid var(--line);border-bottom:0}
  .layout-editorial .review-card:first-child{grid-column:1/-1;max-width:1000px;margin:0 auto;text-align:center;align-items:center}
  .layout-editorial .review-card:first-child blockquote{font-size:clamp(38px,4.4vw,62px);line-height:1.18}
  .layout-editorial .review-card blockquote{margin:24px 0 30px}
  .layout-editorial .review-card p{margin-top:auto}
  .layout-editorial .page-intro{background:var(--bg);text-align:center;border-bottom:1px solid var(--line)}
  .layout-editorial .page-intro .section-heading{max-width:1100px;margin:auto}
  .layout-editorial .page-intro .section-heading p{margin-left:auto;margin-right:auto}
  .layout-editorial .directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
  .layout-editorial .directory-card{background:var(--card);border-radius:0;border:1px solid var(--line);padding:35px}
  .layout-editorial .directory-card h3{font-size:34px}
  .layout-editorial .contact-card{border-radius:0;background:var(--surface);border:1px solid var(--line)}
  .layout-editorial .contact-section h2{font-weight:400;font-size:clamp(48px,5.5vw,80px)}
  .layout-editorial .map{border-radius:0}
  @media(max-width:900px){
    .layout-editorial .hero{flex-direction:column;padding:18px;gap:0}
    .layout-editorial .hero-copy{padding:30px 0 15px}.layout-editorial .hero-title{font-size:52px;max-width:20ch;line-height:1.06}
    .layout-editorial .service-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px}
    .layout-editorial .service-card:first-child{grid-template-columns:1fr 1fr}
    .layout-editorial .service-card:first-child .card-content{padding:28px}
    .layout-editorial .service-card:first-child .card-picture{min-height:280px}
  }
  @media(max-width:600px){
    .layout-editorial .service-grid,.layout-editorial .directory-grid,.layout-editorial .reviews{grid-template-columns:1fr}
    .layout-editorial .service-card:first-child{display:flex;grid-column:auto}.layout-editorial .service-card:first-child .card-picture{height:auto;min-height:0;aspect-ratio:4/3}
    .layout-editorial .card-picture{aspect-ratio:4/3}.layout-editorial .card-content h3{font-size:36px}
    .layout-editorial .review-card:first-child{grid-column:auto}
    .layout-editorial .section-heading h2{font-size:50px}
  }
  @supports(animation-timeline:view()){
    @media(prefers-reduced-motion:no-preference){
      .layout-editorial .gallery-demo img{animation:editorial-drift linear both;animation-timeline:view();animation-range:entry 0% exit 100%}
      @keyframes editorial-drift{from{transform:translateY(-3%) scale(1.1)}to{transform:translateY(3%) scale(1.1)}}
    }
  }
  `;
}

function noirLayoutCSS() {
  return `
  .layout-bold .container{width:min(1380px,100% - 48px)}
  .layout-bold .site-header{background:var(--bg);border-bottom:1px solid var(--line)}
  .layout-bold .brand{font-family:var(--heading);font-size:32px;font-weight:400}
  .layout-bold .noir-stage{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(0,1fr);gap:18px;margin:20px}
  .layout-bold .hero{border-radius:16px;overflow:hidden;background:var(--surface)}
  .layout-bold .hero-copy{position:static!important;background:var(--surface);padding:28px 36px 36px}
  .layout-bold .hero-copy .eyebrow{color:var(--accent)}
  .layout-bold .hero-title{font-size:clamp(45px,5vw,72px);font-weight:400;text-transform:uppercase;line-height:.98;letter-spacing:-.035em;max-width:24ch;color:var(--ink);margin:20px 0 26px}
  .layout-bold .button{font-size:16px;border-radius:8px;background:var(--accent);color:var(--on-accent);border:1px solid var(--accent);box-shadow:none}
  .layout-bold .hero-actions .secondary{background:transparent;color:var(--accent);border-color:var(--line)}
  .noir-links{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:18px;min-width:0}
  .noir-tile{position:relative;overflow:hidden;border-radius:16px;display:block;min-height:160px;background:var(--surface);border:1px solid var(--line)}
  .noir-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .65s ease}
  .noir-tile:hover .noir-photo{transform:scale(1.04)}
  .noir-tile span{position:absolute;right:0;bottom:0;max-width:100%;background:var(--bg);color:var(--ink);padding:17px 24px;border-radius:16px 0 0 0;font-family:var(--heading);font-size:26px;line-height:1.2}
  .layout-bold .signature .section-heading{max-width:850px}
  .layout-bold .signature h2{font-size:clamp(54px,6vw,88px);font-weight:400;line-height:1.02;letter-spacing:-.04em;text-transform:none}
  .layout-bold .service-grid,.layout-bold .membership-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
  .layout-bold .service-card:nth-child(n){background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;box-shadow:none}
  .layout-bold .service-card:nth-child(n) p{color:var(--muted)}
  .layout-bold .service-card:nth-child(n) .card-foot,.layout-bold .service-card:nth-child(n) .card-number{color:var(--accent);border-color:var(--line)}
  .layout-bold .card-picture{aspect-ratio:16/10;filter:none}
  .layout-bold .card-content h3{font-size:44px;font-weight:400;text-transform:none;letter-spacing:-.035em}
  .layout-bold .story{background:var(--bg);border-top:1px solid var(--line)}
  .layout-bold .story h2{font-size:clamp(48px,5.5vw,78px);font-weight:400;text-transform:none;letter-spacing:-.035em}
  .layout-bold .story-photo{border-radius:16px}
  .layout-bold .gallery-section{background:var(--bg)}
  .layout-bold .gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .layout-bold .gallery-demo:nth-child(n){grid-column:auto;grid-row:auto;aspect-ratio:3/4;border-radius:16px}
  .layout-bold .reviews{gap:18px}
  .layout-bold .review-card:nth-child(n){border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:32px}
  .layout-bold .review-card blockquote{font-size:31px;font-weight:400}
  .layout-bold .closing{margin:20px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink)}
  .layout-bold .closing h2{font-size:clamp(60px,8vw,110px);font-weight:400;line-height:1;text-transform:uppercase;letter-spacing:-.025em}
  .layout-bold .closing .eyebrow{color:var(--accent)}.layout-bold .closing .button{background:var(--accent);color:var(--on-accent)}
  .layout-bold .page-intro{margin:20px;border-radius:16px;background:var(--surface)}
  .layout-bold .page-intro h2{font-size:clamp(52px,6vw,88px);font-weight:400}
  .layout-bold .directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
  .layout-bold .directory-card,.layout-bold .contact-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:34px}
  .layout-bold .directory-card h3{font-size:35px}
  .layout-bold .contact-section h2{font-weight:400;font-size:clamp(48px,5vw,72px)}
  .layout-bold .location-section{background:var(--bg)}
  @media(max-width:900px){
    .layout-bold .noir-stage{grid-template-columns:1fr;margin:16px;gap:16px}
    .noir-links{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto;gap:12px}
    .noir-tile{min-height:180px}.noir-tile span{padding:12px;font-size:20px}
    .layout-bold .hero-copy{padding:28px 22px}.layout-bold .hero-title{font-size:48px;max-width:20ch}
    .layout-bold .container{width:calc(100% - 36px)}
  }
  @media(max-width:600px){
    .layout-bold .service-grid,.layout-bold .membership-grid,.layout-bold .directory-grid{grid-template-columns:1fr}
    .layout-bold .gallery{grid-template-columns:1fr 1fr;gap:12px}
    .layout-bold .signature h2{font-size:52px}.layout-bold .card-content{padding:28px}.layout-bold .card-content h3{font-size:38px}
    .noir-links{grid-template-columns:1fr;gap:12px}.noir-tile{min-height:155px}.noir-tile span{font-size:25px;padding:14px 22px}
    .layout-bold .closing,.layout-bold .page-intro{margin:16px}
  }
  `;
}

function lumeLayoutCSS() {
  return `
  .layout-lume .container{width:min(1420px,100% - 64px)}
  .layout-lume .site-header{background:color-mix(in srgb,var(--header) 78%,transparent);border:0;backdrop-filter:blur(18px)}
  .layout-lume .brand{font-family:var(--heading);font-size:30px;font-weight:500}.layout-lume .nav{font-size:10px;text-transform:uppercase;letter-spacing:.14em}
  .layout-lume .hero{min-height:calc(100vh - var(--header-height));display:grid;place-items:center;background:var(--header);overflow:hidden}
  .layout-lume .brand-scene{width:100%;height:calc(100vh - var(--header-height));object-fit:contain;grid-area:1/1;background:var(--header)}
  .layout-lume .hero-copy{position:absolute!important;inset:60% 0 0;width:100%;padding:3vh 5vw 4vh;background:linear-gradient(0deg,rgba(5,8,8,.9),transparent);z-index:2}
  .layout-lume .hero-copy .inner{max-width:1420px}.layout-lume .hero-copy .eyebrow{color:#fff;letter-spacing:.2em}
  .layout-lume .hero-title{font-size:clamp(54px,7.8vw,116px);font-weight:400;line-height:.88;max-width:11ch;color:#fff;margin:22px 0 34px;letter-spacing:-.055em}
  .layout-lume .button{border-radius:0;text-transform:uppercase;letter-spacing:.11em;font-size:10px;padding:17px 22px}
  .layout-lume .hero-actions .secondary{color:#fff;border-color:rgba(255,255,255,.65);background:transparent}
  .lume-trust{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--line);background:var(--bg)}
  .lume-trust span{padding:24px 4vw;border-right;border-right:1px solid var(--line);text-transform:uppercase;letter-spacing:.14em;font-size:9px;text-align:center}.lume-trust span:last-child{border:0}
  .layout-lume .signature{padding-top:140px}.layout-lume .signature .intro-pair{display:grid;grid-template-columns:1.2fr .8fr;align-items:end}
  .layout-lume .section-heading h2{font-size:clamp(56px,7vw,104px);font-weight:400;line-height:.92;max-width:12ch}
  .layout-lume .service-grid,.layout-lume .expertise-cards{grid-template-columns:repeat(3,1fr);gap:clamp(22px,3vw,46px);margin-top:70px}
  .layout-lume .service-card{border:0;border-radius:0;background:transparent}.layout-lume .card-picture{aspect-ratio:4/5}.layout-lume .card-content{padding:24px 0;border-bottom:1px solid var(--line)}
  .layout-lume .card-content h3{font-size:36px;font-weight:400}.layout-lume .story{background:var(--header);color:#fff}.layout-lume .story p,.layout-lume .story .eyebrow{color:rgba(255,255,255,.72)}
  .layout-lume .story h2{font-size:clamp(52px,6vw,88px);font-weight:400}.layout-lume .story-photo{border-radius:0}
  .layout-lume .gallery-section{background:var(--bg);overflow:hidden}.layout-lume .gallery{display:grid;grid-auto-flow:column;grid-auto-columns:38%;grid-template-columns:none;overflow-x:auto;scroll-snap-type:x mandatory;gap:24px;padding-bottom:24px}
  .layout-lume .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:3/4;border-radius:0;scroll-snap-align:start}.layout-lume .reviews{grid-template-columns:1.5fr .75fr .75fr}
  .layout-lume .review-card{border-radius:0;background:transparent;border-width:1px 0 0;padding:34px 0}.layout-lume .review-card:first-child blockquote{font-size:48px}
  .layout-lume .closing{background:var(--header);padding:130px 0}.layout-lume .closing h2{font-size:clamp(70px,10vw,150px);font-weight:400;line-height:.86}
  .layout-lume .page-intro{background:var(--header);color:#fff}.layout-lume .page-intro p{color:rgba(255,255,255,.7)}
  .layout-lume .directory-card,.layout-lume .contact-card,.layout-lume .map{border-radius:0}
  .layout-lume .lume-difference{padding:150px 0}.lume-title-row{display:flex;justify-content:space-between;gap:50px;align-items:end;margin-bottom:72px}.layout-lume .lume-title-row .section-heading{max-width:920px}
  .lume-feature{display:grid;grid-template-columns:1.3fr .7fr;gap:48px;align-items:start}.lume-feature-image{position:sticky;top:110px;min-height:690px;overflow:hidden}.lume-feature-image img{width:100%;height:100%;min-height:690px;object-fit:cover}
  .lume-service-list{display:grid}.lume-service{display:grid;grid-template-columns:38px 110px 1fr;grid-template-rows:auto auto;gap:8px 18px;align-items:center;padding:24px 0;border-top:1px solid var(--line)}.lume-service>span{font-size:9px;letter-spacing:.15em}.lume-service-photo{grid-row:1/3;grid-column:2;aspect-ratio:1;overflow:hidden}.lume-service-photo img{width:100%;height:100%;object-fit:cover}.lume-service h3{font-size:26px;font-weight:400}.lume-service p{font-size:11px}
  .layout-lume .lume-legacy{background:var(--header);color:#fff;padding:150px 0}.lume-legacy-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:10vw;align-items:center}.lume-legacy-grid h2{font-size:clamp(58px,7vw,108px);font-weight:400;line-height:.88}.lume-legacy-grid p{color:rgba(255,255,255,.7);max-width:46ch;margin:34px 0}.lume-legacy-image{min-height:720px}.lume-legacy-image img{width:100%;height:100%;min-height:720px;object-fit:cover}
  .lume-facts{background:var(--header);color:#fff;border-top:1px solid rgba(255,255,255,.2)}.lume-facts>.container{display:grid;grid-template-columns:repeat(3,1fr)}.lume-facts article{padding:55px 35px;border-right:1px solid rgba(255,255,255,.2);display:grid;gap:28px}.lume-facts article:last-child{border:0}.lume-facts strong{font-family:var(--heading);font-size:74px;font-weight:400}.lume-facts span{font-size:10px;text-transform:uppercase;letter-spacing:.14em}
  .layout-lume .lume-process{padding:150px 0}.lume-process-grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line)}.lume-process-grid article{padding:48px 38px 70px 0;border-right:1px solid var(--line)}.lume-process-grid article+article{padding-left:38px}.lume-process-grid article:last-child{border:0}.lume-process-grid span{font-size:10px}.lume-process-grid h3{font-size:38px;font-weight:400;margin:70px 0 20px}.lume-process-grid p{font-size:13px}
  .layout-lume .lume-heritage{padding:150px 0;background:var(--surface)}.lume-heritage-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:9vw;align-items:center}.lume-heritage-image{min-height:650px}.lume-heritage-image img{width:100%;height:100%;min-height:650px;object-fit:cover}.lume-heritage-grid h2{font-size:clamp(56px,6.5vw,96px);font-weight:400;line-height:.9}.lume-heritage-grid p{margin:30px 0;max-width:42ch}
  @media(max-width:760px){.layout-lume .container{width:calc(100% - 36px)}.layout-lume .hero{min-height:0;display:flex;flex-direction:column}.layout-lume .brand-scene{height:auto}.layout-lume .hero-copy{position:relative!important;inset:auto;padding:34px 18px;background:var(--header)}.layout-lume .hero-title{font-size:52px}.lume-trust{grid-template-columns:1fr}.lume-trust span{border-right:0;border-bottom:1px solid var(--line)}.lume-title-row{display:flex;align-items:flex-start;margin-bottom:40px}.lume-feature,.lume-legacy-grid,.lume-heritage-grid{grid-template-columns:1fr;gap:42px}.lume-feature-image{position:static;min-height:0}.lume-feature-image img,.lume-legacy-image img,.lume-heritage-image img{min-height:0;aspect-ratio:4/3}.lume-service{grid-template-columns:28px 80px 1fr}.lume-facts>.container,.lume-process-grid{grid-template-columns:1fr}.lume-facts article,.lume-process-grid article,.lume-process-grid article+article{border-right:0;border-bottom:1px solid rgba(255,255,255,.2);padding:34px 0}.lume-facts strong{font-size:55px}.lume-process-grid h3{margin:35px 0 15px}.layout-lume .lume-difference,.layout-lume .lume-legacy,.layout-lume .lume-process,.layout-lume .lume-heritage{padding:85px 0}.layout-lume .gallery{grid-auto-columns:80%}.layout-lume .reviews{grid-template-columns:1fr}.layout-lume .closing{padding:80px 0}}
  `;
}

function indexLayoutCSS() {
  return `
  html:has(body.layout-index){overflow-x:clip;max-width:100vw}.layout-index{overflow-x:clip;max-width:100vw}.layout-index .container{width:min(1500px,100% - 48px)}.layout-index .site-header{background:var(--bg);border-bottom:1px solid var(--ink)}
  .layout-index .brand{font-size:16px;text-transform:uppercase;letter-spacing:.12em}.layout-index .nav{text-transform:uppercase;letter-spacing:.1em;font-size:9px}
  .layout-index .button{border-radius:0;background:var(--ink);border-color:var(--ink);color:var(--bg);text-transform:uppercase;letter-spacing:.12em;font-size:9px}
  .layout-index .hero{display:grid;grid-template-columns:1.15fr .85fr;background:var(--bg);border-bottom:1px solid var(--ink);padding:24px}
  .layout-index .hero-copy{position:static!important;grid-column:1;grid-row:1;padding:3vw 2vw;background:none;display:flex;align-items:flex-end}
  .layout-index .brand-scene{grid-column:2;grid-row:1;border-left:1px solid var(--ink);padding-left:24px;align-self:center}
  .layout-index .hero-copy .eyebrow{color:var(--ink);font-size:9px}.layout-index .hero-title{color:var(--ink);font-size:clamp(70px,9vw,142px);line-height:.8;letter-spacing:-.085em;max-width:8ch;text-transform:uppercase;margin:20px 0 40px}
  .layout-index .hero-actions .secondary{background:transparent;color:var(--ink);border-color:var(--ink)}
  .layout-index .section{padding:80px 0}.layout-index .section-heading h2{font-size:clamp(50px,7vw,105px);line-height:.88;text-transform:uppercase;letter-spacing:-.07em}
  .layout-index .signature .intro-pair{border-bottom:1px solid var(--ink);padding-bottom:44px}
  .layout-index .service-grid,.layout-index .expertise-cards{display:block}
  .layout-index .service-card{display:grid;grid-template-columns:80px 1fr;border:0;border-bottom:1px solid var(--ink);border-radius:0;background:transparent;align-items:center;padding:22px 0}
  .layout-index .card-picture{display:none}.layout-index .card-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);grid-column:2;padding:0;align-items:center;min-width:0}.layout-index .card-content h3{font-size:30px;overflow-wrap:anywhere}.layout-index .card-content p{margin:0}.layout-index .card-foot{border:0;padding:0;margin:0;justify-self:end;min-width:0}.layout-index .card-number{padding:0;grid-column:1}.index-no{grid-column:1;font-size:10px;letter-spacing:.12em}
  .layout-index .story{background:var(--ink);color:var(--bg)}.layout-index .story p,.layout-index .story .eyebrow{color:color-mix(in srgb,var(--bg) 70%,transparent)}.layout-index .story-photo{border-radius:0;filter:grayscale(1)}
  .layout-index .gallery{grid-template-columns:repeat(12,1fr);gap:8px}.layout-index .gallery-demo:nth-child(n){border-radius:0;grid-column:span 4;aspect-ratio:4/5}.layout-index .gallery-demo:nth-child(1),.layout-index .gallery-demo:nth-child(5){grid-column:span 8;aspect-ratio:16/9}
  .layout-index .review-card:nth-child(n){border:0;border-top:1px solid var(--ink);border-radius:0;background:transparent;padding:28px 0}.layout-index .closing{background:var(--bg);color:var(--ink);border-top:1px solid var(--ink)}.layout-index .closing h2{font-size:clamp(80px,12vw,180px);line-height:.78;text-transform:uppercase}
  .layout-index .directory-grid{display:block}.layout-index .directory-card{display:grid;grid-template-columns:1fr auto;border:0;border-top:1px solid var(--ink);border-radius:0;background:transparent;padding:24px 0}.layout-index .directory-card .text-link{grid-column:2;grid-row:1/3}.layout-index .contact-card,.layout-index .map{border-radius:0}
  @media(max-width:760px){.layout-index .container{width:calc(100% - 32px)}.layout-index .hero{display:flex;flex-direction:column;padding:16px}.layout-index .brand-scene{border:0;padding:0}.layout-index .hero-copy{padding:28px 0}.layout-index .hero-title{font-size:58px}.layout-index .service-card{grid-template-columns:32px minmax(0,1fr)}.layout-index .card-content{display:block}.layout-index .card-content p{margin:12px 0}.layout-index .card-foot{justify-self:start;overflow-wrap:anywhere}.layout-index .gallery{grid-template-columns:1fr 1fr}.layout-index .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:3/4}.layout-index .closing h2{font-size:72px}}
  `;
}

function studioProLayoutCSS() {
  return `
  html:has(body.layout-studio){overflow-x:clip}.layout-studio{overflow-x:clip;background:var(--bg)}.layout-studio .container{width:min(1440px,100% - 56px)}
  .layout-studio .site-header{background:var(--bg);border-bottom:2px solid var(--ink)}.layout-studio .brand{font-family:var(--heading);font-size:28px;text-transform:uppercase;letter-spacing:.02em}.layout-studio .nav{text-transform:uppercase;font-size:10px;letter-spacing:.12em}.layout-studio .button{border-radius:0;background:var(--ink);border:2px solid var(--ink);color:var(--bg);text-transform:uppercase;letter-spacing:.1em;font-size:11px}
  .layout-studio .studio-hero{background:var(--bg);display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr);grid-template-rows:auto auto;min-height:calc(100vh - var(--header-height));padding:28px 28px 190px;border-bottom:2px solid var(--ink);gap:28px}
  .layout-studio .studio-hero .hero-copy{position:static!important;grid-column:1;grid-row:1;background:transparent;padding:32px 18px 0}.layout-studio .studio-hero .hero-copy p{font-family:var(--heading);font-size:clamp(28px,3vw,48px);line-height:1.02;text-transform:uppercase;color:var(--ink);max-width:18ch}.layout-studio .studio-hero .hero-copy .eyebrow{margin-top:50px;color:var(--ink)}
  .layout-studio .studio-hero .brand-scene{grid-column:2;grid-row:1/3;align-self:center;width:100%;border:2px solid var(--ink)}.studio-marquee{position:absolute;left:28px;right:0;bottom:25px;display:flex;width:max-content;gap:6vw;font-family:var(--heading);font-size:clamp(90px,14vw,220px);line-height:.72;text-transform:uppercase;letter-spacing:-.04em;white-space:nowrap}
  .layout-studio .section{padding:130px 0}.studio-section-head{display:grid;grid-template-columns:1fr auto;align-items:end;border-bottom:2px solid var(--ink);padding-bottom:40px;margin-bottom:50px}.layout-studio .section-heading h2{font-size:clamp(64px,8vw,125px);line-height:.8;text-transform:uppercase;letter-spacing:-.04em}.layout-studio .section-heading p{font-family:'DM Sans',sans-serif;text-transform:none;font-size:14px;letter-spacing:0}
  .studio-projects{display:grid;grid-template-columns:1fr 1fr;gap:70px 24px}.studio-project{display:grid;grid-template-columns:45px 1fr auto;align-items:end;border-bottom:2px solid var(--ink);padding-bottom:20px}.studio-project>div{grid-column:1/-1;aspect-ratio:16/10;overflow:hidden;margin-bottom:22px}.studio-project:nth-child(2n)>div{aspect-ratio:4/5}.studio-project img{width:100%;height:100%;object-fit:cover;filter:saturate(.8);transition:filter .25s,transform .6s}.studio-project:hover img{filter:saturate(1.1);transform:scale(1.025)}.studio-project span{font-size:10px}.studio-project h3{font-size:42px;text-transform:uppercase;line-height:.85}.studio-project p{font-size:11px;color:var(--ink)}
  .studio-achievements{background:var(--ink);color:var(--bg);padding:140px 0}.studio-achievements .eyebrow{color:var(--bg)}.studio-achievements h2{font-size:clamp(78px,11vw,170px);line-height:.76;text-transform:uppercase;letter-spacing:-.04em}.studio-numbers{display:grid;grid-template-columns:repeat(3,1fr);margin-top:100px;border-top:1px solid color-mix(in srgb,var(--bg) 45%,transparent)}.studio-numbers article{padding:38px 30px 0 0;border-right:1px solid color-mix(in srgb,var(--bg) 45%,transparent)}.studio-numbers article+article{padding-left:30px}.studio-numbers strong{font-family:var(--heading);font-size:88px;font-weight:400}.studio-numbers p{color:color-mix(in srgb,var(--bg) 75%,transparent);text-transform:uppercase;letter-spacing:.12em;font-size:10px}
  .studio-about>.container{display:grid;grid-template-columns:1fr 1fr;gap:8vw;align-items:center}.studio-about-image{min-height:720px;overflow:hidden}.studio-about-image img{width:100%;height:100%;min-height:720px;object-fit:cover}.studio-about h2{font-size:clamp(65px,8vw,120px);line-height:.78;text-transform:uppercase}.studio-about p{max-width:48ch;margin:35px 0}
  .layout-studio .review-section{background:var(--bg)}.layout-studio .reviews{display:block}.layout-studio .review-card:nth-child(n){display:grid;grid-template-columns:80px 1fr 180px;align-items:center;border:0;border-top:2px solid var(--ink);border-radius:0;background:transparent;padding:36px 0}.layout-studio .review-card blockquote,.layout-studio .review-card:first-child blockquote{font-size:36px;margin:0}.layout-studio .review-card p{color:var(--ink)}
  .layout-studio .gallery-section{background:var(--ink);color:var(--bg)}.layout-studio .gallery-section p,.layout-studio .gallery-section .eyebrow{color:var(--bg)}.layout-studio .gallery{grid-template-columns:repeat(3,1fr);gap:12px}.layout-studio .gallery-demo:nth-child(n){grid-column:auto;border-radius:0;aspect-ratio:4/5}.layout-studio .gallery-demo:nth-child(2),.layout-studio .gallery-demo:nth-child(5){transform:translateY(55px)}
  .layout-studio .closing{background:var(--bg);color:var(--ink);border-top:2px solid var(--ink)}.layout-studio .closing h2{font-size:clamp(95px,14vw,210px);line-height:.72;text-transform:uppercase}.layout-studio .closing .eyebrow{color:var(--ink)}.layout-studio .page-intro{background:var(--ink);color:var(--bg)}.layout-studio .page-intro p{color:color-mix(in srgb,var(--bg) 70%,transparent)}.layout-studio .directory-card,.layout-studio .contact-card,.layout-studio .map{border-radius:0}
  @media(max-width:760px){.layout-studio .container{width:calc(100% - 32px)}.layout-studio .button{font-size:15px}.layout-studio .header-action{font-size:14px}.layout-studio .studio-hero{display:flex;flex-direction:column;min-height:0;padding:16px}.layout-studio .studio-hero .brand-scene{order:1}.layout-studio .studio-hero .hero-copy{order:2;padding:20px 0}.layout-studio .studio-hero .hero-copy p{font-size:30px}.studio-marquee{order:3;font-size:100px}.layout-studio .section{padding:80px 0}.studio-section-head{display:flex;align-items:flex-start}.studio-projects{grid-template-columns:1fr;gap:55px}.studio-project:nth-child(2n)>div{aspect-ratio:16/10}.studio-project h3{font-size:34px}.studio-numbers{grid-template-columns:1fr;margin-top:60px}.studio-numbers article,.studio-numbers article+article{border-right:0;border-bottom:1px solid color-mix(in srgb,var(--bg) 45%,transparent);padding:28px 0}.studio-about>.container{grid-template-columns:1fr}.studio-about-image,.studio-about-image img{min-height:0}.studio-about-image img{aspect-ratio:4/3}.layout-studio .review-card:nth-child(n){grid-template-columns:1fr;gap:18px}.layout-studio .review-card blockquote,.layout-studio .review-card:first-child blockquote{font-size:30px}.layout-studio .gallery{grid-template-columns:1fr 1fr}.layout-studio .gallery-demo:nth-child(2),.layout-studio .gallery-demo:nth-child(5){transform:none}}
  `;
}

function perspectiveLayoutCSS() {
  return `
  .layout-kinetic .container{width:min(1320px,100% - 72px)}
  .layout-kinetic .site-header{background:var(--bg);border-bottom:1px solid var(--line)}
  .layout-kinetic .brand{font-family:var(--heading);font-weight:500}
  .layout-kinetic .hero{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);align-items:center;gap:36px;padding:48px 36px;background:var(--bg)}
  .layout-kinetic .brand-scene{grid-column:2;grid-row:1;border-radius:32px}
  .layout-kinetic .hero-copy{position:static!important;grid-column:1;grid-row:1;background:var(--surface);padding:45px 35px;border-radius:32px}
  .layout-kinetic .hero-copy .eyebrow{color:var(--accent);letter-spacing:.12em}
  .layout-kinetic .hero-title{color:var(--ink);font-size:clamp(40px,4.5vw,66px);line-height:1.1;max-width:17ch;font-weight:400;letter-spacing:-.05em;margin:26px 0 32px}
  .layout-kinetic .button{border-radius:999px;background:var(--accent);color:var(--on-accent);border-color:var(--accent);padding:16px 24px;box-shadow:none}
  .layout-kinetic .hero-actions .secondary{background:var(--card);color:var(--ink);border-color:var(--line)}
  .layout-kinetic .signature .section-heading{max-width:940px}
  .layout-kinetic .signature .section-heading h2{font-size:clamp(50px,5.6vw,82px);line-height:1.08;font-weight:400;letter-spacing:-.05em}
  .layout-kinetic .service-card{border-radius:28px;border:1px solid var(--line);background:var(--surface)}
  .layout-kinetic .card-content h3{font-size:39px;font-weight:400;letter-spacing:-.04em;line-height:1.1}
  .layout-kinetic .motion-rail .card-content{padding:30px}
  .layout-kinetic .motion-rail .card-picture{height:clamp(200px,32vh,340px)}
  .layout-kinetic .story{border-radius:44px;margin:20px 24px;background:var(--surface)}
  .layout-kinetic .story h2{font-size:clamp(44px,5vw,72px);font-weight:400;letter-spacing:-.04em}
  .layout-kinetic .story-photo{border-radius:28px}
  .layout-kinetic .gallery-section{background:var(--bg)}
  .layout-kinetic .gallery{grid-template-columns:1.2fr .8fr;gap:35px 50px}
  .layout-kinetic .gallery-demo:nth-child(n){border-radius:28px;aspect-ratio:4/3}
  .layout-kinetic .gallery-demo:nth-child(even){aspect-ratio:3/4;margin-top:80px}
  .layout-kinetic .review-card:first-child{padding:56px;border-radius:32px}
  .layout-kinetic .review-card:first-child blockquote{font-size:clamp(36px,4.2vw,60px);font-weight:400;max-width:34ch}
  .layout-kinetic .review-card blockquote{font-size:30px}
  .layout-kinetic .closing{margin:24px;border-radius:44px}
  .layout-kinetic .closing h2{font-size:clamp(54px,7vw,100px);font-weight:400;line-height:1.06}
  .layout-kinetic .page-intro{margin:28px 24px;border-radius:32px}
  .layout-kinetic .page-intro .section-heading{max-width:950px}
  .layout-kinetic .page-intro h2{font-size:clamp(48px,5.6vw,80px);font-weight:400}
  .layout-kinetic .directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
  .layout-kinetic .directory-card{border-radius:24px;background:var(--surface);border:1px solid var(--line);padding:35px}
  .layout-kinetic .directory-card h3{font-size:32px}
  .layout-kinetic .contact-card{border-radius:30px;padding:44px;background:var(--surface)}
  .layout-kinetic .contact-section h2{font-size:clamp(45px,5vw,72px);font-weight:400}
  .layout-kinetic .map{border-radius:30px}
  @media(max-width:1000px){.layout-kinetic .hero-copy{padding:32px 24px}.layout-kinetic .hero{gap:24px;padding:32px 24px}}
  @media(max-width:900px){
    .layout-kinetic .hero{display:flex;flex-direction:column;align-items:stretch;padding:18px;gap:18px}
    .layout-kinetic .brand-scene{border-radius:22px}.layout-kinetic .hero-copy{padding:32px 24px;border-radius:22px}
    .layout-kinetic .hero-title{font-size:44px;max-width:20ch}
    .layout-kinetic .container{width:calc(100% - 36px)}
    .layout-kinetic .story,.layout-kinetic .closing{margin:12px;border-radius:28px}
    .layout-kinetic .motion-rail .card-content{padding:26px}
    .layout-kinetic .page-intro{margin:18px;border-radius:22px}
  }
  @media(max-width:600px){
    .layout-kinetic .directory-grid{grid-template-columns:1fr}.layout-kinetic .signature .section-heading h2{font-size:48px}
    .layout-kinetic .gallery{grid-template-columns:1fr 1fr;gap:14px}.layout-kinetic .gallery-demo:nth-child(n){border-radius:18px}
    .layout-kinetic .gallery-demo:nth-child(even){margin-top:40px}
    .layout-kinetic .review-card:first-child{padding:32px}.layout-kinetic .review-card:first-child blockquote{font-size:34px}
    .layout-kinetic .contact-card{padding:28px}
  }
  `;
}

// Flux: a dark, kinetic layout — parallax hero image, a scrolling marquee
// eyebrow and cards that tilt toward the pointer. Content and structure are
// unchanged from the standard layout; only presentation and motion differ.
function fluxLayoutCSS() {
  return `
  .layout-flux .container{width:min(1320px,100% - 64px)}
  .layout-flux .site-header{background:color-mix(in srgb,var(--header) 80%,transparent);border-bottom:1px solid var(--line)}
  .layout-flux .hero{overflow:clip}
  .layout-flux .brand-scene{will-change:transform;transform:scale(1.08)}
  .layout-flux .hero-title{font-size:clamp(40px,6vw,88px);letter-spacing:-.05em;font-weight:600}
  .layout-flux .button{border-radius:999px;box-shadow:none}
  .layout-flux .marquee-strip{overflow:hidden;white-space:nowrap;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface)}
  .layout-flux .marquee-track{display:inline-flex;gap:48px;will-change:transform;font-family:var(--heading);font-size:22px;letter-spacing:-.02em;color:var(--accent)}
  .layout-flux .marquee-track span{display:inline-flex;align-items:center;gap:48px}
  .layout-flux .signature .section-heading h2{font-size:clamp(46px,6.5vw,92px);letter-spacing:-.06em;line-height:.98}
  .layout-flux .service-grid,.layout-flux .membership-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;perspective:1200px}
  .layout-flux .service-card{border-radius:18px;border:1px solid var(--line);background:var(--card);transform:perspective(900px) rotateX(0) rotateY(0);transition:transform .25s ease,box-shadow .25s ease}
  .layout-flux .service-card:hover{box-shadow:0 24px 50px color-mix(in srgb,var(--accent) 18%,transparent)}
  .layout-flux .card-picture{aspect-ratio:5/4}
  .layout-flux .card-content h3{font-size:30px;letter-spacing:-.03em}
  .layout-flux .story{background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .layout-flux .story-photo{border-radius:18px}
  .layout-flux .gallery{grid-template-columns:repeat(4,1fr);gap:14px}
  .layout-flux .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:3/4;border-radius:14px}
  .layout-flux .gallery-demo:first-child,.layout-flux .gallery-demo:nth-child(6){grid-column:span 1;aspect-ratio:3/4}
  .layout-flux .review-card:nth-child(n){border-radius:16px}
  .layout-flux .closing{background:var(--accent);border-radius:32px;width:calc(100% - 48px);margin:24px auto}
  .layout-flux .closing h2{font-size:clamp(46px,7vw,96px);letter-spacing:-.04em}
  .layout-flux .reveal{transform:translateY(28px) scale(.985);transition:opacity .6s ease,transform .7s cubic-bezier(.16,1,.3,1)}
  @media(max-width:1100px){.layout-flux .service-grid,.layout-flux .membership-grid{grid-template-columns:1fr}.layout-flux .gallery{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:760px){.layout-flux .container{width:calc(100% - 36px)}.layout-flux .closing{width:calc(100% - 24px);border-radius:22px}.layout-flux .marquee-track{font-size:16px;gap:28px}.layout-flux .marquee-track span{gap:28px}}
  @media(prefers-reduced-motion:reduce){.layout-flux .brand-scene{transform:none}.layout-flux .marquee-track{animation:none!important}}
  `;
}

// Bloom: full-bleed parallax hero, big centred serif headings and alternating
// pastel colour-block sections with pill CTAs. Content and structure are
// unchanged from the standard layout; only presentation and motion differ.
function bloomLayoutCSS() {
  return `
  .layout-bloom .site-header{background:color-mix(in srgb,var(--header) 70%,transparent);backdrop-filter:blur(14px);border-bottom:0}
  .layout-bloom .hero{overflow:clip}
  .layout-bloom .brand-scene{will-change:transform}
  .layout-bloom .hero-copy{text-align:center}
  .layout-bloom .hero-copy .inner{max-width:900px;margin:auto}
  .layout-bloom .hero-copy .eyebrow{margin:0 auto 14px}
  .layout-bloom .hero-title{font-size:clamp(44px,6.5vw,88px);font-weight:400;line-height:1.03;max-width:16ch;margin:0 auto 26px}
  .layout-bloom .hero-actions{justify-content:center}
  .layout-bloom .button{border-radius:999px;padding:16px 30px;box-shadow:none;transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  .layout-bloom .button:hover{transform:translateY(-3px)}
  .layout-bloom .hero-actions .secondary{background:var(--bg);color:var(--ink);border-color:transparent}
  .layout-bloom .section{padding:120px 0}
  .layout-bloom .section-heading{max-width:720px;margin:0 auto 20px;text-align:center}
  .layout-bloom .section-heading h2{font-size:clamp(38px,5vw,64px);font-weight:400;letter-spacing:-.02em}
  .layout-bloom .section-heading p{margin:20px auto 0}
  .layout-bloom .signature .intro-pair{flex-direction:column;align-items:center;text-align:center;margin-bottom:56px}
  .layout-bloom .signature .intro-pair>.text-link{margin-top:22px}
  .layout-bloom .service-grid,.layout-bloom .expertise-cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
  .layout-bloom .service-card{border:0;border-radius:var(--radius);background:var(--card);box-shadow:none}
  .layout-bloom .card-picture{aspect-ratio:4/5}
  .layout-bloom .card-content{text-align:center;padding:26px 20px}
  .layout-bloom .card-content h3{font-size:26px;font-weight:400}
  .layout-bloom .card-foot{justify-content:center;border-top:0;flex-direction:column;gap:8px}
  .layout-bloom .story{background:color-mix(in srgb,var(--accent) 16%,var(--bg));border-radius:var(--radius);margin:0 24px;width:calc(100% - 48px)}
  .layout-bloom .story-photo{border-radius:calc(var(--radius) - 8px)}
  .layout-bloom .story h2{font-size:clamp(36px,4.5vw,56px);font-weight:400}
  .layout-bloom .steps p{border-color:color-mix(in srgb,var(--ink) 12%,transparent)}
  .layout-bloom .review-section{background:color-mix(in srgb,var(--accent) 10%,var(--bg))}
  .layout-bloom .reviews{grid-template-columns:repeat(3,minmax(0,1fr))}
  .layout-bloom .review-card:nth-child(n){border:0;background:var(--bg);border-radius:var(--radius);padding:34px}
  .layout-bloom .review-card blockquote{font-size:26px;font-weight:400}
  .layout-bloom .review-stamp{border-color:var(--accent);background:var(--card)}
  .layout-bloom .gallery{grid-template-columns:repeat(3,1fr);gap:18px}
  .layout-bloom .gallery-demo:nth-child(n){grid-column:auto;aspect-ratio:4/5;border-radius:var(--radius);transform:none}
  .layout-bloom .closing{background:color-mix(in srgb,var(--accent) 22%,var(--bg));color:var(--ink);border-radius:var(--radius);margin:0 24px 24px;width:calc(100% - 48px);text-align:center}
  .layout-bloom .closing-grid{flex-direction:column;align-items:center;display:flex;gap:22px}
  .layout-bloom .closing .eyebrow{color:var(--accent)}
  .layout-bloom .closing h2{font-size:clamp(44px,6vw,80px);font-weight:400}
  .layout-bloom .closing .button{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
  .layout-bloom .page-intro{text-align:center;background:color-mix(in srgb,var(--accent) 10%,var(--bg))}
  .layout-bloom .page-intro .section-heading{margin:auto}
  .layout-bloom .directory-card,.layout-bloom .contact-card{border:0;border-radius:var(--radius);background:var(--card)}
  .layout-bloom .map{border-radius:var(--radius)}
  .layout-bloom .reveal{transform:translateY(26px);transition:opacity .8s ease,transform .9s cubic-bezier(.16,1,.3,1)}
  @media(max-width:1100px){.layout-bloom .service-grid,.layout-bloom .expertise-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:900px){
    .layout-bloom .hero-copy{position:static!important;background:linear-gradient(0deg,var(--header),color-mix(in srgb,var(--header) 60%,transparent))}
    .layout-bloom .section{padding:72px 0}
    .layout-bloom .story,.layout-bloom .closing{margin:0 14px;width:calc(100% - 28px)}
  }
  @media(max-width:600px){
    .layout-bloom .service-grid,.layout-bloom .expertise-cards,.layout-bloom .reviews,.layout-bloom .directory-grid{grid-template-columns:1fr}
    .layout-bloom .gallery{grid-template-columns:1fr 1fr;gap:12px}
  }
  @media(prefers-reduced-motion:reduce){.layout-bloom .brand-scene{transform:none!important}}
  `;
}

function templateDesignMotion(layout) {
  // Returned as a self-contained script in the exported/shared website.
  return `
  const visualStyle=${JSON.stringify(layout)};
  const motionPreference=matchMedia('(prefers-reduced-motion:reduce)');
  if(visualStyle==='lume'){
    const hero=document.querySelector('.hero');
    document.querySelector('.gallery')?.setAttribute('aria-label','Featured collection — scroll to explore');
    if(!motionPreference.matches){
      let frame=0;const move=()=>{frame=0;const image=hero.querySelector('.brand-scene');const progress=Math.min(1,Math.max(0,scrollY/Math.max(1,hero.offsetHeight)));image.style.transform='scale('+(1+progress*.045)+')'};
      addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(move)},{passive:true});move();
    }
  }
  if(visualStyle==='index'){
    if(!motionPreference.matches){document.querySelectorAll('.signature .service-card').forEach(card=>{card.addEventListener('pointerenter',()=>card.style.transform='translateX(10px)');card.addEventListener('pointerleave',()=>card.style.transform='')})}
  }
  if(visualStyle==='studio'&&!motionPreference.matches){
    const marquee=document.querySelector('.studio-marquee');let frame=0;
    const move=()=>{frame=0;const hero=document.querySelector('.studio-hero');const progress=Math.min(1,Math.max(0,-hero.getBoundingClientRect().top/Math.max(1,hero.offsetHeight)));marquee.style.transform='translate3d('+(-progress*18)+'vw,0,0)'};
    addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(move)},{passive:true});move();
  }
  if(visualStyle==='studio'&&!motionPreference.matches){
    const marquee=document.querySelector('.studio-marquee');let frame=0;
    const move=()=>{frame=0;marquee.style.transform='translate3d('+(-Math.min(innerWidth*.45,scrollY*.32))+'px,0,0)'};
    addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(move)},{passive:true});move();
  }
  if(visualStyle==='bold'){
    const hero=document.querySelector('.hero'),stage=document.createElement('div');stage.className='noir-stage';hero.before(stage);stage.append(hero);
    const tiles=document.createElement('nav');tiles.className='noir-links';tiles.setAttribute('aria-label','Explore the website');stage.append(tiles);
    const serviceLink=document.querySelector('.site-header .nav [data-nav="services"]');
    [serviceLink.textContent,'Contact','Gallery'].forEach((label,index)=>{
      const tile=document.createElement('a');tile.className='noir-tile';tile.href=index===0?'#services':index===1?'#contact':'#gallery';
      const original=document.querySelectorAll('.gallery-demo img')[index],img=original.cloneNode();img.className='noir-photo';img.alt='';img.loading='eager';
      img.addEventListener('error',()=>{img.src=document.querySelector('.brand-scene').src},{once:true});
      const caption=document.createElement('span');caption.textContent=label;tile.append(img,caption);tiles.append(tile);
      tile.addEventListener('click',event=>{event.preventDefault();if(index===2){document.querySelector('.gallery-section').scrollIntoView({behavior:motionPreference.matches?'instant':'smooth'})}else{document.querySelector('.site-header .nav [data-nav="'+(index===0?'services':'contact')+'"]')?.click()}});
    });
  }
  if(visualStyle==='organic'){const gallery=document.querySelector('.gallery');gallery.tabIndex=0;gallery.setAttribute('role','region');gallery.setAttribute('aria-label','Photo gallery — scroll to explore')}
  if(visualStyle==='serene'){
    const header=document.querySelector('.site-header');
    let frame=0;const paintHeader=()=>{frame=0;header.classList.toggle('is-scrolled',scrollY>10)};
    addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(paintHeader)},{passive:true});paintHeader();
    const hero=document.querySelector('.hero'),scene=hero?.querySelector('.brand-scene');
    if(hero&&scene&&!motionPreference.matches){
      let frame2=0;const move=()=>{frame2=0;const progress=Math.min(1,Math.max(0,scrollY/Math.max(1,hero.offsetHeight)));scene.style.transform='scale('+(1+progress*.08)+') translateY('+(progress*24)+'px)'};
      addEventListener('scroll',()=>{if(!frame2)frame2=requestAnimationFrame(move)},{passive:true});move();
    }
  }
  if(visualStyle==='kinetic'){
    const rail=document.querySelector('.signature .service-grid,.signature .membership-grid,.signature .project-grid,.signature .expertise-cards');
    if(rail){
      const track=document.createElement('div');track.className='motion-track';
      const sticky=document.createElement('div');sticky.className='motion-sticky';
      rail.before(track);track.append(sticky);sticky.append(rail);rail.classList.add('motion-rail');
      let travel=0,frame=0;
      const paint=()=>{frame=0;if(motionPreference.matches||innerWidth<=900||!track.offsetParent){rail.style.transform='';return}const y=Math.max(0,Math.min(travel,parseFloat(getComputedStyle(sticky).top)-track.getBoundingClientRect().top));rail.style.transform='translate3d('+(-y)+'px,0,0)'};
      const measure=()=>{if(motionPreference.matches||innerWidth<=900){track.style.height='';rail.style.transform='';return}travel=Math.max(0,rail.scrollWidth-sticky.clientWidth);track.style.height=(sticky.offsetHeight+travel)+'px';paint()};
      const queue=()=>{if(!frame)frame=requestAnimationFrame(paint)};
      window.addEventListener('scroll',queue,{passive:true});window.addEventListener('resize',measure);motionPreference.addEventListener('change',measure);
      new ResizeObserver(measure).observe(sticky);document.fonts.ready.then(measure);rail.querySelectorAll('img').forEach(img=>img.addEventListener('load',measure));measure();
      rail.addEventListener('focusin',event=>{if(motionPreference.matches||innerWidth<=900)return;const card=event.target.closest('.service-card,.membership-card,.project');if(card){const start=track.getBoundingClientRect().top+scrollY-parseFloat(getComputedStyle(sticky).top);window.scrollTo({top:start+Math.min(travel,card.offsetLeft),behavior:'smooth'})}});
    }
  }
  if(['bold','kinetic'].includes(visualStyle)&&!motionPreference.matches){const progress=document.createElement('div');progress.className='scroll-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);let frame=0;const update=()=>{frame=0;const distance=document.documentElement.scrollHeight-innerHeight;progress.style.transform='scaleX('+(distance>0?Math.min(1,Math.max(0,scrollY/distance)):0)+')'};window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(update)},{passive:true});update()}
  if(visualStyle==='bloom'){
    const hero=document.querySelector('.hero'),scene=hero?.querySelector('.brand-scene');
    if(hero&&scene&&!motionPreference.matches){
      let frame=0;const move=()=>{frame=0;const progress=Math.min(1,Math.max(0,scrollY/Math.max(1,hero.offsetHeight)));scene.style.transform='scale(1.06) translateY('+(progress*40)+'px)'};
      addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(move)},{passive:true});move();
    }
  }
  if(visualStyle==='flux'){
    const hero=document.querySelector('.hero'),scene=hero?.querySelector('.brand-scene');
    if(hero&&scene&&!motionPreference.matches){
      let frame=0;const move=()=>{frame=0;const progress=Math.min(1,Math.max(0,scrollY/Math.max(1,hero.offsetHeight)));scene.style.transform='scale(1.08) translateY('+(progress*30)+'px)'};
      addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(move)},{passive:true});move();
    }
    const label=document.querySelector('.site-header .brand small')?.textContent||document.title;
    const strip=document.createElement('div');strip.className='marquee-strip';
    const track=document.createElement('div');track.className='marquee-track';
    const item=Array.from({length:8},()=>'<span>'+label+'</span>').join('');
    track.innerHTML=item;strip.append(track);hero?.after(strip);
    if(!motionPreference.matches){
      let x=0,frame2=0;const drift=()=>{frame2=0;x-=.4;if(-x>track.scrollWidth/2)x=0;track.style.transform='translate3d('+x+'px,0,0)';frame2=requestAnimationFrame(drift)};
      drift();
    }
    if(!motionPreference.matches&&matchMedia('(pointer:fine)').matches){
      document.querySelectorAll('.service-card').forEach(card=>{
        card.addEventListener('pointermove',event=>{const rect=card.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width-.5,py=(event.clientY-rect.top)/rect.height-.5;card.style.transform='perspective(900px) rotateX('+(-py*6)+'deg) rotateY('+(px*8)+'deg)'});
        card.addEventListener('pointerleave',()=>{card.style.transform=''});
      });
    }
  }
  `;
}
