// Shared, pure demo-site generator — no DOM access, no UI logic.
// Included by both index.html (the live builder) and preview.html (a
// standalone, shareable rendering of one generated site from a URL param),
// so both stay byte-for-byte the same generator instead of drifting apart.
  // Each category has its own proven visual system. The customer is matched
  // automatically; template choice remains an internal design decision.
  const DEMO_LAYOUTS = [
    {id:'editorial',name:'Professional Services',detail:'Magazine grids & oversized type',tier:'Essential'},
    {id:'bold',name:'Automotive',detail:'Immersive image panels & refined contrast',font:'Cormorant Garamond',tier:'Essential'},
    {id:'kinetic',name:'Home & Garden',detail:'Sculpted split hero & scrolling showcases',font:'Lora',tier:'Essential'},
    {id:'serene',name:'Health & Wellness',detail:'Full-screen cinematic hero & flowing sections',font:'Cormorant Garamond',round:'18px',tier:'Essential'},
    {id:'index',name:'Directory & Listings',detail:'Ultra-minimal directory & typographic grid',font:'Manrope',round:'0px',tier:'Pro'},
    {id:'studio',name:'Fitness',detail:'Bold portfolio marquee & case-study chapters',font:'Bebas Neue',round:'0px',tier:'Pro'},
    {id:'flux',name:'Creative',detail:'Parallax hero, kinetic type & magnetic cards',font:'Sora',round:'6px',tier:'Pro'},
    {id:'bloom',name:'Aesthetics & Skin',detail:'Full-bleed parallax hero & pastel colour blocks',font:'Fraunces',round:'28px',tier:'Pro'},
    {id:'torque',name:'Trades & Construction',detail:'Industrial dark hero, angled tags & bold type',font:'Bebas Neue',round:'2px',tier:'Pro'},
    {id:'minimal',name:'General Business',detail:'Quiet information column beside a portfolio',font:'Manrope',round:'12px',tier:'Pro'},
    {id:'luxe',name:'Hair & Beauty',detail:'Sculpted images & floating panels',font:'Cormorant Garamond',round:'28px',tier:'Pro'},
    {id:'soft',name:'Food & Drink',detail:'Rounded capsule cards on a gentle palette',font:'Quicksand',round:'24px',tier:'Pro'},
    {id:'organic',name:'Pet Care',detail:'Warm blocks & a scrolling photo strip',font:'DM Serif Display',round:'12px',tier:'Pro'}
  ];
  const DEMO_FONTS = [
    {id:'classic',name:'Classic',family:'Cormorant Garamond'},
    {id:'modern',name:'Modern',family:'Manrope'},
    {id:'editorial',name:'Editorial',family:'Fraunces'},
    {id:'warm',name:'Warm',family:'Lora'},
    {id:'strong',name:'Strong',family:'Bebas Neue'},
    {id:'clean',name:'Clean',family:'Montserrat'}
  ];
  // Every category gets its own distinct template — no two share a look.
  function demoLayoutForCategory(cat) {
    return ({hairbeauty:'luxe',aesthetics:'bloom',health:'serene',trades:'torque',homegarden:'kinetic',fooddrink:'soft',fitness:'studio',creative:'flux',professional:'editorial',automotive:'bold',pets:'organic'})[cat] || 'minimal';
  }
  // Business content is selected only from the user's industry, never from
  // their visual template. Keep this mapping independent of recommendations.
  function demoContentForCategory(cat) {
    return ({hairbeauty:'salon',aesthetics:'salon',health:'salon',trades:'trades',homegarden:'trades',fooddrink:'restaurant',fitness:'fitness',creative:'creative',professional:'professional',automotive:'automotive',pets:'salon'})[cat] || 'professional';
  }
  function G(name, items) { return { name, items }; } // items: [label, price] pairs
  const BUSINESS_TYPES = [
    { label: 'Hair & Beauty', cat: 'hairbeauty', photo: 'hair-beauty-hero.jpg', theme: '#a89a92',
      tagline: 'Hair and beauty, done properly',
      desc: '{name} is a friendly, modern salon where every visit starts with a proper consultation, not a rushed guess. Whatever you’re after, our team takes the time to get it right.',
      groups: [
        G('Hair', [['Cuts & styling', 'From £32'], ['Colour & balayage', 'From £68'], ['Blow-dry', 'From £22'], ['Keratin treatment', 'From £85'], ['Hair extensions', 'From £150']]),
        G('Nails', [['Manicure', 'From £22'], ['Pedicure', 'From £28'], ['Gel extensions', 'From £38'], ['Nail art', 'From £8'], ['Acrylic infills', 'From £25']]),
        G('Facials & Skin', [['Classic facial', 'From £35'], ['Deep cleanse facial', 'From £45'], ['Micro-needling', 'From £90'], ['Chemical peel', 'From £65'], ['LED light therapy', 'From £30']]),
        G('Waxing', [['Full leg wax', 'From £25'], ['Underarm wax', 'From £10'], ['Bikini wax', 'From £18'], ['Facial wax', 'From £8'], ['Back & chest wax', 'From £22']]),
        G('Brows & Lashes', [['Brow shape & tint', 'From £15'], ['Lash lift', 'From £35'], ['Classic lashes', 'From £45'], ['Russian volume lashes', 'From £60'], ['Lash tint', 'From £12']]),
        G('Makeup & Tanning', [['Occasion makeup', 'From £35'], ['Bridal makeup', 'From £85'], ['Spray tan', 'From £25'], ['Makeup lesson', 'From £45'], ['Party makeup', 'From £30']])
      ] },
    { label: 'Aesthetics', cat: 'aesthetics', photo: 'aesthetics-hero.jpg', theme: '#ada7a3',
      tagline: 'Advanced treatments, honest advice',
      desc: '{name} offers professional-grade aesthetic treatments in a private, clinical setting. Every treatment starts with a proper consultation, so you know exactly what to expect.',
      groups: [
        G('Injectables', [['Anti-wrinkle treatment', 'From £150'], ['Dermal fillers', 'From £180'], ['Lip filler', 'From £160'], ['Jaw filler', 'From £250'], ['Profhilo', 'From £220']]),
        G('Skin Treatments', [['Chemical peel', 'From £65'], ['Microneedling', 'From £90'], ['Dermaplaning', 'From £45'], ['HydraFacial', 'From £75'], ['LED light therapy', 'From £30']]),
        G('Laser', [['Laser hair removal', 'From £35'], ['Skin resurfacing', 'From £120'], ['Pigmentation removal', 'From £80'], ['Thread vein removal', 'From £60'], ['Tattoo removal', 'From £50/session']]),
        G('Body', [['Fat dissolving injections', 'From £180'], ['Body contouring', 'From £150'], ['Cellulite treatment', 'From £90'], ['Skin tightening', 'From £120'], ['Body wrap', 'From £55']]),
        G('Advanced Facials', [['CACI facial', 'From £55'], ['Oxygen facial', 'From £60'], ['Radiofrequency facial', 'From £85'], ['Vitamin C facial', 'From £50'], ['Anti-ageing facial', 'From £70']]),
        G('Consultations', [['Skin consultation', 'Free'], ['Patch test', 'Free'], ['Treatment planning', 'Free'], ['Follow-up review', 'From £20'], ['Virtual consultation', 'Free']])
      ] },
    { label: 'Health & Wellness', cat: 'health', photo: 'health-wellness-hero.webp', theme: '#9e826b',
      tagline: 'Feel better, move better',
      desc: '{name} helps you feel and move better, with treatments built around what your body actually needs — not a generic routine.',
      groups: [
        G('Massage', [['Swedish massage', 'From £45'], ['Deep tissue massage', 'From £55'], ['Sports massage', 'From £50'], ['Hot stone massage', 'From £60'], ['Pregnancy massage', 'From £50']]),
        G('Physiotherapy', [['Initial assessment', 'From £55'], ['Sports injury treatment', 'From £50'], ['Rehab programme', 'Get a quote'], ['Postural assessment', 'From £40'], ['Follow-up session', 'From £40']]),
        G('Alternative Therapies', [['Acupuncture', 'From £40'], ['Reflexology', 'From £35'], ['Reiki', 'From £40'], ['Cupping therapy', 'From £45'], ['Aromatherapy', 'From £40']]),
        G('Mental Wellness', [['Counselling session', 'From £50'], ['Mindfulness coaching', 'From £45'], ['Stress management', 'From £45'], ['Life coaching', 'From £60'], ['Group therapy', 'From £25']]),
        G('Nutrition', [['Nutrition consultation', 'From £45'], ['Meal planning', 'From £35'], ['Weight management', 'From £40'], ['Food intolerance testing', 'From £75'], ['Follow-up review', 'From £30']]),
        G('Clinics', [['Health screening', 'From £60'], ['Blood pressure check', 'From £15'], ['Vaccination', 'From £25'], ['Travel clinic', 'From £35'], ['General consultation', 'From £40']])
      ] },
    { label: 'Fitness', cat: 'fitness', photo: 'fitness-hero.jpg', theme: '#c8322a',
      tagline: 'Training plans built around real life',
      desc: '{name} builds training plans around real life, not just the gym. Whether it’s 1-to-1 coaching, group sessions or nutrition advice, the goal is progress you can actually stick to.',
      groups: [
        G('Personal Training', [['1-to-1 training', 'From £45'], ['Couples training', 'From £65'], ['Small group training', 'From £20'], ['Online coaching', 'From £60/mo'], ['Assessment session', 'From £25']]),
        G('Classes', [['HIIT class', 'From £12'], ['Yoga class', 'From £10'], ['Spin class', 'From £12'], ['Pilates class', 'From £12'], ['Boxing class', 'From £14']]),
        G('Nutrition & Body', [['Nutrition plan', 'From £80'], ['Body composition scan', 'From £25'], ['Meal prep guidance', 'From £40'], ['Supplement advice', 'Free'], ['Progress review', 'From £20']]),
        G('Memberships', [['Monthly membership', 'From £35/mo'], ['Annual membership', 'From £350/yr'], ['Day pass', 'From £10'], ['Class pack (10)', 'From £90'], ['Student membership', 'From £25/mo']]),
        G('Recovery', [['Sports massage', 'From £45'], ['Stretching session', 'From £25'], ['Recovery room access', 'From £15'], ['Ice bath', 'From £15'], ['Cryotherapy', 'From £35']]),
        G('Specialist', [['Pre/post-natal training', 'From £45'], ['Youth training', 'From £30'], ['Senior fitness', 'From £30'], ['Rehab training', 'From £45'], ['Sports-specific training', 'From £50']])
      ] },
    { label: 'Automotive', cat: 'automotive', photo: 'automotive-hero.jpg', theme: '#7f8790',
      tagline: 'Honest, no-nonsense car care',
      desc: '{name} is your local garage for honest, no-nonsense car care. Our qualified team explains what your car actually needs — and nothing it doesn’t.',
      groups: [
        G('Servicing', [['Full service', 'From £120'], ['Interim service', 'From £80'], ['MOT testing', 'From £45'], ['Diagnostics', 'From £60'], ['Oil change', 'From £45']]),
        G('Repairs', [['Brake repair', 'From £150'], ['Clutch replacement', 'From £350'], ['Suspension repair', 'From £120'], ['Exhaust repair', 'From £80'], ['Engine repair', 'Get a quote']]),
        G('Tyres & Wheels', [['Tyre fitting', 'From £25'], ['Wheel alignment', 'From £45'], ['Wheel balancing', 'From £20'], ['Puncture repair', 'From £15'], ['Tyre pressure check', 'Free']]),
        G('Valeting', [['Full valet', 'From £60'], ['Interior detail', 'From £80'], ['Exterior wash', 'From £15'], ['Engine bay clean', 'From £30'], ['Ceramic coating', 'From £250']]),
        G('Air Con & Electrics', [['Air con regas', 'From £50'], ['Battery replacement', 'From £80'], ['Electrical diagnostics', 'From £45'], ['Alternator repair', 'From £150'], ['Starter motor repair', 'From £150']]),
        G('Bodywork', [['Dent removal', 'From £60'], ['Scratch repair', 'From £50'], ['Paint correction', 'From £150'], ['Bumper repair', 'From £120'], ['Alloy wheel refurb', 'From £45']])
      ] },
    { label: 'Trades', cat: 'trades', photo: 'trades-hero.jpg', theme: '#6b625c',
      tagline: 'Fast, fully qualified tradework',
      desc: '{name} is on call for the jobs that can’t wait, and the projects that can. Fully qualified, fully insured, and always upfront about pricing before we start.',
      groups: [
        G('Plumbing', [['Emergency call-out', 'From £75'], ['Boiler repair', 'From £150'], ['Boiler installation', 'Get a quote'], ['Leak detection', 'From £65'], ['Tap & toilet repair', 'From £55']]),
        G('Electrical', [['Rewiring', 'Get a quote'], ['Fuse box upgrade', 'From £350'], ['Socket & switch fitting', 'From £45'], ['PAT testing', 'From £3 per item'], ['EV charger install', 'From £650']]),
        G('Building', [['Extensions', 'Get a quote'], ['Loft conversions', 'Get a quote'], ['Renovations', 'Get a quote'], ['Groundwork', 'Get a quote'], ['Plastering', 'From £250']]),
        G('Roofing', [['Roof repair', 'From £150'], ['Re-roofing', 'Get a quote'], ['Guttering', 'From £120'], ['Flat roof repair', 'From £180'], ['Chimney repair', 'From £200']]),
        G('Locksmith & Security', [['Lock changes', 'From £65'], ['Emergency lockout', 'From £85'], ['Key cutting', 'From £5'], ['Security upgrades', 'Get a quote'], ['uPVC door repair', 'From £75']]),
        G('Cleaning', [['Domestic cleaning', 'From £15/hr'], ['End of tenancy clean', 'From £120'], ['Carpet cleaning', 'From £45'], ['Window cleaning', 'From £15'], ['Office cleaning', 'From £18/hr']])
      ] },
    { label: 'Home & Garden', cat: 'homegarden', photo: 'home-garden-hero.jpg', theme: '#6b7a4a',
      tagline: 'Spaces people love spending time in',
      desc: '{name} designs and maintains outdoor spaces people actually want to spend time in. From a one-off tidy-up to a full redesign, we work with your space, not against it.',
      groups: [
        G('Garden Design', [['Design consultation', 'From £75'], ['Planting plan', 'From £120'], ['Landscape design', 'Get a quote'], ['Patio design', 'From £90'], ['3D garden visual', 'From £150']]),
        G('Maintenance', [['Lawn care', 'From £35'], ['Hedge trimming', 'From £45'], ['Weeding & tidy-up', 'From £40'], ['Seasonal clean-up', 'From £80'], ['Regular maintenance visit', 'From £30']]),
        G('Landscaping', [['Tree surgery', 'From £150'], ['Fencing', 'From £45/m'], ['Patio & decking', 'Get a quote'], ['Turfing', 'From £25/m²'], ['Drainage work', 'Get a quote']]),
        G('Interior', [['Interior design consultation', 'From £85'], ['Home staging', 'Get a quote'], ['Curtains & blinds', 'From £120'], ['Furniture assembly', 'From £40'], ['Room makeover', 'Get a quote']]),
        G('Renovation', [['Kitchen fitting', 'Get a quote'], ['Bathroom renovation', 'Get a quote'], ['Painting & decorating', 'From £200'], ['Flooring', 'From £25/m²'], ['Plastering', 'From £250']]),
        G('Outdoor Living', [['Garden building install', 'Get a quote'], ['Outdoor lighting', 'From £150'], ['Water features', 'From £250'], ['BBQ area build', 'Get a quote'], ['Furniture assembly', 'From £45']])
      ] },
    { label: 'Food & Drink', cat: 'fooddrink', photo: 'food-drink-hero.jpg', theme: '#7a5c3d',
      tagline: 'Made properly, every time',
      desc: '{name} makes everything properly, with ingredients that matter. A spot for people who care about what they’re eating and drinking.',
      groups: [
        G('Bakery', [['Fresh bread', 'From £3.50'], ['Pastries', 'From £2.80'], ['Custom cakes', 'From £35'], ['Cupcakes', 'From £2.50'], ['Celebration cakes', 'From £55']]),
        G('Cafe', [['Coffee & drinks', 'From £3'], ['Breakfast & brunch', 'From £6.50'], ['Sandwiches & light bites', 'From £5.50'], ['Afternoon tea', 'From £18'], ['Loyalty card', 'Free']]),
        G('Dining', [['A la carte dining', 'From £18'], ['Set menu', 'From £25'], ['Sunday roast', 'From £16'], ['Tasting menu', 'From £45'], ['Private dining', 'Get a quote']]),
        G('Takeaway & Delivery', [['Takeaway', 'From £12'], ['Delivery', 'From £14'], ['Click & collect', 'From £10'], ['Meal deals', 'From £15'], ['Party platters', 'From £35']]),
        G('Events & Catering', [['Private events', 'Get a quote'], ['Wedding catering', 'Get a quote'], ['Corporate catering', 'Get a quote'], ['Buffet catering', 'From £12/head'], ['Drinks packages', 'Get a quote']]),
        G('Drinks', [['Cocktails', 'From £9'], ['Wine list', 'From £24/bottle'], ['Craft beer', 'From £5'], ['Coffee subscription', 'From £15/mo'], ['Tasting sessions', 'From £25']])
      ] },
    { label: 'Professional Services', cat: 'professional', photo: 'professional-services-hero.jpg', theme: '#7a6952',
      tagline: 'Clear advice, no jargon',
      desc: '{name} keeps things straightforward, with clear advice and deadlines that never sneak up on you. One trusted team, from start to finish.',
      groups: [
        G('Accounting', [['Tax returns', 'From £150'], ['Bookkeeping', 'From £40/mo'], ['VAT returns', 'From £60'], ['Payroll', 'From £25/mo'], ['Annual accounts', 'From £250']]),
        G('Business Advice', [['Business planning', 'From £150'], ['Start-up advice', 'From £75'], ['Growth strategy', 'Get a quote'], ['Financial forecasting', 'From £120'], ['Advisory session', 'From £75/hr']]),
        G('Legal', [['Contract review', 'From £120'], ['Will writing', 'From £150'], ['Conveyancing', 'Get a quote'], ['Legal consultation', 'From £60'], ['Dispute resolution', 'Get a quote']]),
        G('Property', [['Property sales', 'Get a quote'], ['Lettings', 'Get a quote'], ['Valuations', 'Free valuation'], ['Property management', 'Get a quote'], ['Land & new build', 'Get a quote']]),
        G('Financial', [['Mortgage advice', 'Free'], ['Pension advice', 'From £150'], ['Investment advice', 'Get a quote'], ['Insurance advice', 'Free'], ['Financial planning', 'From £200']]),
        G('Consulting', [['Strategy consulting', 'Get a quote'], ['IT consulting', 'From £85/hr'], ['HR consulting', 'From £75/hr'], ['Marketing consulting', 'From £75/hr'], ['Project management', 'Get a quote']])
      ] },
    { label: 'Creative', cat: 'creative', photo: 'creative-hero.jpg', theme: '#544e45',
      tagline: 'The moments that actually matter',
      desc: '{name} captures the moments that actually matter. A relaxed, professional approach that means natural results every time.',
      groups: [
        G('Photography', [['Portraits', 'From £120'], ['Family sessions', 'From £150'], ['Weddings', 'From £950'], ['Newborn photography', 'From £180'], ['Event photography', 'From £250']]),
        G('Commercial', [['Product photography', 'From £200'], ['Commercial shoots', 'Get a quote'], ['Branding photography', 'From £250'], ['Real estate photography', 'From £120'], ['Food photography', 'From £180']]),
        G('Video', [['Wedding videography', 'From £850'], ['Promotional video', 'Get a quote'], ['Event videography', 'From £300'], ['Drone footage', 'From £150'], ['Video editing', 'From £50/hr']]),
        G('Design', [['Logo design', 'From £250'], ['Brand identity', 'From £600'], ['Print design', 'From £120'], ['Web design', 'Get a quote'], ['Social media graphics', 'From £80']]),
        G('Editing & Retouching', [['Photo editing', 'From £5/image'], ['Retouching', 'From £15/image'], ['Album design', 'From £150'], ['Colour grading', 'From £80'], ['Video editing', 'From £50/hr']]),
        G('Prints & Products', [['Framed prints', 'From £35'], ['Photo books', 'From £65'], ['Canvas prints', 'From £45'], ['Digital downloads', 'From £10'], ['Prop hire', 'From £20']])
      ] },
    { label: 'Pets', cat: 'pets', photo: 'pets-hero.jpg', theme: '#ca7281',
      tagline: 'Calm, gentle care for your pet',
      desc: '{name} gives your pet a calm, gentle experience from start to finish. Always handled with patience and care.',
      groups: [
        G('Grooming', [['Full groom', 'From £35'], ['Bath & brush', 'From £20'], ['Nail trim', 'From £10'], ['De-shedding treatment', 'From £15'], ['Puppy introduction groom', 'From £18']]),
        G('Styling', [['Breed-specific trim', 'From £40'], ['Hand stripping', 'From £45'], ['Teeth cleaning', 'From £15'], ['Ear cleaning', 'From £8'], ['Creative grooming', 'From £25']]),
        G('Health & Care', [['Flea treatment', 'From £12'], ['Anal gland expression', 'From £10'], ['Skin & coat treatment', 'From £15'], ['Health check', 'From £20'], ['Microchipping', 'From £20']]),
        G('Boarding & Daycare', [['Dog boarding', 'From £25/night'], ['Cat boarding', 'From £18/night'], ['Doggy daycare', 'From £20/day'], ['Dog walking', 'From £12'], ['Pet sitting', 'From £15/visit']]),
        G('Training', [['Puppy training', 'From £45'], ['Obedience training', 'From £40'], ['Behaviour consultation', 'From £65'], ['Group classes', 'From £15'], ['1-to-1 training', 'From £50']]),
        G('Extras', [['Pet taxi', 'From £15'], ['Photography session', 'From £45'], ['Spa treatment', 'From £30'], ['Pawdicure', 'From £8'], ['Aromatherapy', 'From £12']])
      ] },
    { label: 'Other', cat: 'other',
      tagline: 'Tell us what makes you different',
      desc: '{name} is a business that cares about doing things properly — tell us more about what makes you different and this paragraph will describe it.',
      groups: [
        G('General Services', [['Consultation', 'Free'], ['Custom service', 'Get a quote'], ['Callout', 'Get a quote'], ['One-off project', 'Get a quote'], ['Assessment', 'From £25']]),
        G('Ongoing', [['Ongoing support', 'Get a quote'], ['Maintenance plan', 'Get a quote'], ['Subscription service', 'Get a quote'], ['Regular visit', 'Get a quote'], ['Membership', 'Get a quote']]),
        G('Specialist', [['Specialist service', 'Get a quote'], ['Advanced service', 'Get a quote'], ['Premium service', 'Get a quote'], ['Bespoke service', 'Get a quote'], ['Priority service', 'Get a quote']]),
        G('Add-ons', [['Add-on service', 'Get a quote'], ['Upgrade', 'Get a quote'], ['Extra', 'Get a quote'], ['Enhancement', 'Get a quote'], ['Extension', 'Get a quote']]),
        G('Consultation', [['Initial consultation', 'Free'], ['Follow-up', 'Get a quote'], ['Review session', 'Get a quote'], ['Planning session', 'Get a quote'], ['Assessment', 'Get a quote']]),
        G('Custom', [['Bespoke project', 'Get a quote'], ['Custom order', 'Get a quote'], ['Special request', 'Get a quote'], ['Tailored package', 'Get a quote'], ['Made to measure', 'Get a quote']])
      ] }
  ];

  // Six real, category-relevant demo photographs for every generated site.
  // These are deliberately treated as temporary content: the preview labels
  // them as demo images and promises they will be replaced before launch.
  const GALLERY_PHOTO_IDS = {
    hairbeauty: ['1560066984-138dadb4c035','1521590832167-7bcbfaa6381f','1522337360788-8b13dee7a37e','1562322140-8baeececf3df','1487412947147-5cebf100ffc2','1600948836101-f9ffda59d250'],
    aesthetics: ['1570172619644-dfd03ed5d881','1616394584738-fc6e612e71b9','1515377905703-c4788e51af15','1620916566398-39f1143ab7be','1519823551278-64ac92734fb1','1540555700478-4be289fbecef'],
    health: ['1576091160399-112ba8d25d1d','1538108149393-fbbd81895907','1579684385127-1ef15d508118','1471864190281-a93a3070b6de','1519494026892-80bbd2d6fd0d','1516841273335-e39b37888115'],
    fitness: ['1534438327276-14e5300c3a48','1571019613454-1cb2f99b2d8b','1581009146145-b5ef050c2e1e','1517836357463-d25dfeac3438','1534258936925-c58bed479fcb','1540497077202-7c8a3999166f'],
    automotive: ['1487754180451-c456f719a1fc','1503376780353-7e6692767b70','1492144534655-ae79c964c9d7','1504222490345-c075b6008014','1486262715619-67b85e0b08d3','1525609004556-c46c7d6cf023'],
    trades: ['1504307651254-35680f356dfd','1541888946425-d81bb19240f5','1503387762-592deb58ef4e','1531835551805-16d864c8d311','1581578731548-c64695cc6952','1504917595217-d4dc5ebe6122'],
    homegarden: ['1416879595882-3373a0480b5b','1585320806297-9794b3e4eeae','1558904541-efa843a96f01','1598902108854-10e335adac99','1558618666-fcd25c85cd64','1466692476868-aef1dfb1e735'],
    fooddrink: ['1517248135467-4c7edcad34c4','1552566626-52f8b828add9','1414235077428-338989a2e8c0','1565299624946-b28f40a0ae38','1504674900247-0877df9cc836','1559339352-11d035aa65de'],
    professional: ['1497366754035-f200968a6e72','1497366811353-6870744d04b2','1524758631624-e2822e304c36','1497366216548-37526070297c','1497366412874-3415097a27e7','1531497865144-0464ef8fb9a9'],
    creative: ['1549490349-8643362247b5','1541961017774-22349e4a1262','1500530855697-b586d89ba3ee','1455390582262-044cdead277a','1513364776144-60967b0f800f','1547891654-e66ed7ebb968'],
    pets: ['1552053831-71594a27632d','1587300003388-59208cc962cb','1548199973-03cce0bbc87b','1517849845537-4d257902454a','1537151625747-768eb6cf92b2','1558788353-f76d92427f16'],
    office: ['1497366754035-f200968a6e72','1497366811353-6870744d04b2','1524758631624-e2822e304c36','1497366216548-37526070297c','1497366412874-3415097a27e7','1531497865144-0464ef8fb9a9']
  };

  function galleryPhotoUrl(id) {
    return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=82`;
  }
  // spare photos held in reserve per category: if a gallery image fails to
  // load (dead Unsplash id, hotlink block) the front-end swaps in one of
  // these rather than leaving a blank/black tile
  const GALLERY_SPARE_IDS = {
    hairbeauty: ['1580618672591-eb180b1a973f','1522336572468-97b06e8ef143'],
    aesthetics: ['1512290923902-8a9f81dc236c','1583911860205-72f8ac8ddcbe'],
    health: ['1666214280391-8ff5bd3c0bf0','1505751172876-fa1923c5c528'],
    fitness: ['1517960413843-0aee8e2b3285','1526506118085-60ce8714f8c5'],
    automotive: ['1478357750242-42c8f26c9d8b','1519641471654-76ce0107ad1b'],
    trades: ['1541976590-713941681591','1416339306562-c4d80f3f9911'],
    homegarden: ['1560184897-a6a1e6a76d84','1524758631624-e2822e304c36'],
    fooddrink: ['1466978913421-dad2ebd01d17','1544148103-0773bf10d330'],
    professional: ['1521737711867-e3b97375f902','1552664730-d307ca884978'],
    creative: ['1517245386807-bb43f82c33c4','1454165804606-c3d57bc86b40'],
    pets: ['1544568100-847a948585b9','1543466835-00a7907e9de1'],
    office: ['1521737711867-e3b97375f902','1552664730-d307ca884978']
  };
  function flattenGroups(t) {
    const items = t.groups.reduce((all, g) => all.concat(g.items), []);
    return { services: items.map(i => i[0]), prices: items.map(i => i[1]) };
  }
  function typeInfo(label) { return BUSINESS_TYPES.find(t => t.label === label); }

  // ---- colour picker: turn one chosen swatch into a light/base/dark trio ----
  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  function tonesFromHex(hex) {
    const [h, s] = hexToHsl(hex);
    return {
      light: hslToHex(h, Math.max(s - 14, 16), 86),
      base: hex,
      dark: hslToHex(h, Math.min(s + 2, 70), 44)
    };
  }
  function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  // customers type answers however they like ("isla spa", "HULL") — title
  // case them for anywhere they're displayed, so the generated site reads
  // as professionally as a real one, regardless of typing habits.
  function toTitleCase(s) {
    return (s || '').replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  function buildDemoHTML(rawD) {
    return buildFreshDemoHTML(rawD);
  }
