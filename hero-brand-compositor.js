(function (global) {
  'use strict';

  const scriptUrl = document.currentScript && document.currentScript.src;
  const assetBase = scriptUrl
    ? new URL('img/hero-logo-ready/', scriptUrl).href
    : 'img/hero-logo-ready/';

  // Per-image placement. `panel` is the usable surface in normalised coords —
  // the flat side of the van, the blank stretch of wall, the facade — measured
  // off each photograph rather than a single generic position. cx/cy is its
  // centre, w/h its extent, and the lockup is fitted inside and clamped to it,
  // so the name cannot drift over windows, doors, wheels or shelving.
  const SCENES = {
    // blank plaster wall right of the mirrors
    hairbeauty: { image: 'hair-beauty.webp', panel: { cx: .72, cy: .32, w: .34, h: .23 }, surface: 'luxury-wall', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .82 },
    // wall panel above and behind the reception desk
    aesthetics: { image: 'aesthetics.webp', panel: { cx: .51, cy: .32, w: .38, h: .23 }, surface: 'luxury-wall', light: 'upper-right', perspective: 0, blend: 'multiply', opacity: .80 },
    // wide bare wall to the right of the treatment bed
    health: { image: 'health-wellness.webp', panel: { cx: .72, cy: .35, w: .38, h: .22 }, surface: 'interior-wall', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .82 },
    // dark gym wall — light ink, kept clear of the rig on the right
    fitness: { image: 'fitness.webp', panel: { cx: .50, cy: .38, w: .40, h: .24 }, surface: 'industrial-wall', light: 'upper-left', perspective: 0, blend: 'screen', opacity: .94, filter: 'brightness(1.22) contrast(.92) saturate(1.08)' },
    // flat side panel of the van, behind the cab and above the sill
    automotive: { image: 'automotive.webp', panel: { cx: .635, cy: .455, w: .35, h: .18 }, surface: 'vehicle', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .90 },
    // van side panel, between the window line and the lower stripe
    trades: { image: 'trades.webp', panel: { cx: .635, cy: .45, w: .35, h: .18 }, surface: 'vehicle', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .90 },
    // rendered facade right of the timber doorway
    homegarden: { image: 'home-garden.webp', panel: { cx: .69, cy: .43, w: .27, h: .18 }, surface: 'exterior', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .82 },
    // wall above the counter, below the pendant lights
    fooddrink: { image: 'food-drink.webp', panel: { cx: .51, cy: .35, w: .34, h: .18 }, surface: 'hospitality-wall', light: 'upper-right', perspective: 0, blend: 'multiply', opacity: .82 },
    // marble wall behind the reception desk
    professional: { image: 'professional-services.webp', panel: { cx: .50, cy: .31, w: .32, h: .21 }, surface: 'luxury-wall', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .80 },
    // large empty studio wall on the right
    creative: { image: 'creative.webp', panel: { cx: .74, cy: .35, w: .34, h: .24 }, surface: 'studio-wall', light: 'upper-left', perspective: 0, blend: 'multiply', opacity: .82 },
    // pink salon wall, clear of the shelf and the plant
    pets: { image: 'pets.webp', panel: { cx: .73, cy: .27, w: .30, h: .20 }, surface: 'interior-wall', light: 'upper-right', perspective: 0, blend: 'multiply', opacity: .82 }
  };

  const CATEGORY_ALIASES = {
    'hair & beauty': 'hairbeauty', hairbeauty: 'hairbeauty',
    aesthetics: 'aesthetics',
    'health & wellness': 'health', health: 'health',
    fitness: 'fitness', automotive: 'automotive', trades: 'trades',
    'home & garden': 'homegarden', homegarden: 'homegarden',
    'food & drink': 'fooddrink', fooddrink: 'fooddrink',
    'professional services': 'professional', professional: 'professional',
    creative: 'creative', pets: 'pets', other: 'professional'
  };

  function sceneKey(category) {
    return CATEGORY_ALIASES[String(category || 'other').trim().toLowerCase()] || 'professional';
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let temporaryUrl = null;
      image.decoding = 'async';
      image.onload = () => {
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
        resolve(image);
      };
      image.onerror = () => {
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
        reject(new Error('The hero or logo image could not be loaded.'));
      };
      if (source instanceof Blob) {
        temporaryUrl = URL.createObjectURL(source);
        image.src = temporaryUrl;
      } else {
        image.crossOrigin = 'anonymous';
        image.src = source;
      }
    });
  }

  function fitInside(sourceWidth, sourceHeight, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    return { width: sourceWidth * scale, height: sourceHeight * scale };
  }

  function makeLogoLayer(logo, width, height, lightInk) {
    const layer = document.createElement('canvas');
    layer.width = Math.max(1, Math.round(width));
    layer.height = Math.max(1, Math.round(height));
    const ctx = layer.getContext('2d');
    ctx.drawImage(logo, 0, 0, layer.width, layer.height);

    // On a dark wall, convert the artwork to warm white so even dark uploaded
    // logos remain readable. Light-wall scenes retain the brand's own colours.
    if (lightInk) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#f6f2ea';
      ctx.fillRect(0, 0, layer.width, layer.height);
    }
    return layer;
  }

  function setFont(ctx, weight, size, tracking) {
    ctx.font = `${weight} ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    // letterSpacing is not in every engine; ignored where unsupported
    try { ctx.letterSpacing = `${tracking}px`; } catch (error) { /* older Safari */ }
  }

  function colourParts(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim());
    if (!match) return null;
    const number = Number.parseInt(match[1], 16);
    return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
  }

  function shadeColour(value, amount) {
    const colour = colourParts(value);
    if (!colour) return value;
    const channel = number => Math.max(0, Math.min(255, Math.round(number + (amount < 0 ? number : 255 - number) * amount)));
    return `rgb(${channel(colour.r)},${channel(colour.g)},${channel(colour.b)})`;
  }

  function colourAlpha(value, alpha) {
    const colour = colourParts(value);
    return colour ? `rgba(${colour.r},${colour.g},${colour.b},${alpha})` : value;
  }

  const BRAND_PROFILES = {
    hairbeauty: { family: 'Georgia, serif', weight: 700, width: .96, tracking: .12, case: 'title', shape: 'flowing', material: 'brass' },
    aesthetics: { family: 'Georgia, serif', weight: 600, width: 1.02, tracking: .16, case: 'title', shape: 'refined', material: 'polished' },
    health: { family: 'Arial, sans-serif', weight: 700, width: .98, tracking: .04, case: 'title', shape: 'organic', material: 'acrylic' },
    fitness: { family: 'Arial Narrow, Arial, sans-serif', weight: 900, width: .78, tracking: .015, case: 'upper', shape: 'power', material: 'steel' },
    automotive: { family: 'Arial, sans-serif', weight: 900, width: 1.12, tracking: .015, case: 'upper', shape: 'technical', material: 'vinyl' },
    trades: { family: 'Arial, sans-serif', weight: 900, width: .94, tracking: .025, case: 'upper', shape: 'built', material: 'vinyl' },
    homegarden: { family: 'Georgia, serif', weight: 700, width: .98, tracking: .07, case: 'title', shape: 'crafted', material: 'painted-metal' },
    fooddrink: { family: 'Georgia, serif', weight: 700, width: .97, tracking: .065, case: 'title', shape: 'character', material: 'brass' },
    professional: { family: 'Georgia, serif', weight: 700, width: .98, tracking: .12, case: 'title', shape: 'refined', material: 'polished' },
    creative: { family: 'Arial, sans-serif', weight: 800, width: 1.03, tracking: -.015, case: 'mixed', shape: 'experimental', material: 'acrylic' },
    pets: { family: 'Arial, sans-serif', weight: 800, width: .98, tracking: .035, case: 'title', shape: 'friendly', material: 'acrylic' }
  };

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function analyseName(value, profile) {
    const clean = String(value || 'Your Business').trim().replace(/\s+/g, ' ');
    const letters = clean.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const pairs = ['TT','LL','OO','EE','SS','NN','AV','VA','LY','TH','ST','AR','RI'];
    const repeatedPair = pairs.find(pair => letters.includes(pair));
    const initials = clean.split(' ').map(word => word[0]).filter(Boolean).slice(0, 3).join('').toUpperCase();
    const symmetric = [...letters].reverse().join('') === letters;
    const hash = stableHash(`${clean}|${profile.shape}`);
    const candidates = [];
    if (repeatedPair) candidates.push({ type: 'bridge', pair: repeatedPair });
    if (initials.length > 1) candidates.push({ type: 'monogram', initials });
    if (symmetric || /(A|M|O|V|W|X)/.test(letters)) candidates.push({ type: 'feature', letter: letters[(hash >>> 5) % Math.max(1, letters.length)] });
    if (profile.shape === 'technical' || profile.shape === 'power' || profile.shape === 'built') candidates.push({ type: 'notch' });
    if (profile.shape === 'flowing' || profile.shape === 'organic' || profile.shape === 'friendly') candidates.push({ type: 'sweep' });
    if (profile.shape === 'experimental' || profile.shape === 'character') candidates.push({ type: 'offset' });
    const count = 1 + (hash % Math.min(3, Math.max(1, candidates.length)));
    const start = candidates.length ? (hash >>> 8) % candidates.length : 0;
    const modifications = [];
    for (let i = 0; i < candidates.length && modifications.length < count; i++) {
      const item = candidates[(start + i) % candidates.length];
      if (!modifications.some(existing => existing.type === item.type)) modifications.push(item);
    }
    return { clean, letters, initials, hash, modifications };
  }

  function displayName(name, profile) {
    if (profile.case === 'upper') return name.toUpperCase();
    if (profile.case === 'title') return name.toLowerCase().replace(/(^|[\s&/\-’'])([a-z])/g, (_, gap, char) => gap + char.toUpperCase());
    return name;
  }

  function fontString(profile, size) {
    return `${profile.weight} ${size}px ${profile.family}`;
  }

  function trackedWidth(ctx, text, tracking) {
    return ctx.measureText(text).width + Math.max(0, text.length - 1) * tracking;
  }

  function drawTrackedText(ctx, text, x, y, tracking, maxWidth) {
    const widths = [...text].map(char => ctx.measureText(char).width);
    const natural = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * tracking;
    const scale = Math.min(1, maxWidth / Math.max(1, natural));
    ctx.save();
    ctx.translate(x - natural * scale / 2, y);
    ctx.scale(scale, 1);
    let cursor = 0;
    [...text].forEach((char, index) => {
      ctx.fillText(char, cursor, 0);
      if (ctx._brandStroke) ctx.strokeText(char, cursor, 0);
      cursor += widths[index] + tracking;
    });
    ctx.restore();
    return natural * scale;
  }

  // Break a name across at most two lines at the most balanced word gap, so a
  // long name gets shorter lines instead of shrinking away to nothing.
  function splitName(words) {
    if (words.length < 2) return [words.join(' ')];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const diff = Math.abs(a.length - b.length);
      if (!best || diff < best.diff) best = { diff, lines: [a, b] };
    }
    return best.lines;
  }

  // Measures the region the lockup will cover and returns whether it sits on a
  // light or dark surface, plus how much local variation there is. A busy or
  // mid-tone surface gets a shadow; a clean one does not need it.
  function readSurface(ctx, box, fallbackLight) {
    try {
      const x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
      const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
      const data = ctx.getImageData(x, y, w, h).data;
      let total = 0, count = 0, min = 255, max = 0;
      // sample on a grid rather than every pixel — plenty for a mean
      for (let i = 0; i < data.length; i += 4 * 16) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        total += l; count++;
        if (l < min) min = l;
        if (l > max) max = l;
      }
      const mean = total / Math.max(1, count);
      return { light: mean < 128, busy: (max - min) > 118, mean };
    } catch (error) {
      // a cross-origin uploaded hero taints the canvas; fall back to the scene
      return { light: fallbackLight, busy: false, mean: fallbackLight ? 40 : 210 };
    }
  }

  function drawLockup(ctx, name, location, box, fallbackLight, options) {
    const settings = options || {};
    const nameText = String(name || 'Your Business').trim().toUpperCase();
    const placeText = String(location || '').trim().toUpperCase();
    const logoHint = String(settings.logoHint || '').trim();

    // Keep equal breathing room on every side. All measuring, wrapping and
    // centring happens inside this inset box, so a short or long name shares
    // the exact same visual centre and never leans toward an edge.
    const insetX = box.width * .07;
    const insetY = box.height * .07;
    box = {
      x: box.x + insetX,
      y: box.y + insetY,
      width: box.width - insetX * 2,
      height: box.height - insetY * 2
    };

    // Start from the panel height and shrink until the name fits the width. Try
    // one line first; if that would drive the type too small, use two.
    const maxSize = Math.round(box.height * (placeText || logoHint ? .35 : .46));
    const minSize = Math.max(18, Math.round(box.height * .16));
    let lines = [nameText];
    let size = maxSize;

    const fits = (candidate, px) => {
      setFont(ctx, 700, px, px * .06);
      return candidate.every(line => ctx.measureText(line).width <= box.width);
    };

    while (size > minSize && !fits(lines, size)) size -= 2;
    if (size <= minSize && nameText.split(/\s+/).length > 1) {
      lines = splitName(nameText.split(/\s+/));
      size = maxSize;
      while (size > minSize && !fits(lines, size)) size -= 2;
    }
    // Two name lines plus the logo hint and location need a slightly tighter
    // cap so the complete sign always remains inside shallow van/facade panels.
    if (lines.length > 1 && (placeText || logoHint)) {
      size = Math.min(size, Math.round(box.height * .29));
      while (size > minSize && !fits(lines, size)) size -= 2;
    }

    // The logo prompt and location stay deliberately quieter than the raised
    // business name, preserving a believable sign hierarchy on the wall.
    let hintSize = Math.max(11, Math.round(size * .27));
    if (logoHint) {
      setFont(ctx, 500, hintSize, hintSize * .04);
      while (hintSize > 10 && ctx.measureText(logoHint).width > box.width) {
        hintSize -= 1;
        setFont(ctx, 500, hintSize, hintSize * .04);
      }
    }
    let placeSize = Math.round(size * .34);
    if (placeText) {
      setFont(ctx, 500, placeSize, placeSize * .16);
      while (placeSize > 11 && ctx.measureText(placeText).width > box.width) {
        placeSize -= 1;
        setFont(ctx, 500, placeSize, placeSize * .16);
      }
    }

    // Centre on the real glyph box, not on em-boxes. Cap height and descender
    // depth vary with the name, so measuring the actual ink is what keeps the
    // lockup optically centred whether it is one short word or two long lines.
    setFont(ctx, 700, size, size * .06);
    const nameMetrics = lines.map(line => ctx.measureText(line));
    const nameAscent = Math.max(...nameMetrics.map(m => m.actualBoundingBoxAscent || size * .72));
    const nameDescent = Math.max(...nameMetrics.map(m => m.actualBoundingBoxDescent || size * .08));
    const lineStep = nameAscent + nameDescent + size * .22;

    let hintAscent = 0, hintDescent = 0;
    if (logoHint) {
      setFont(ctx, 500, hintSize, hintSize * .04);
      const hm = ctx.measureText(logoHint);
      hintAscent = hm.actualBoundingBoxAscent || hintSize * .72;
      hintDescent = hm.actualBoundingBoxDescent || hintSize * .08;
    }
    let placeAscent = 0, placeDescent = 0;
    if (placeText) {
      setFont(ctx, 500, placeSize, placeSize * .16);
      const pm = ctx.measureText(placeText);
      placeAscent = pm.actualBoundingBoxAscent || placeSize * .72;
      placeDescent = pm.actualBoundingBoxDescent || placeSize * .08;
    }
    // gap between the two halves of the lockup: close enough to read as one
    // unit, open enough to separate them
    const hintGap = logoHint ? size * .25 : 0;
    const placeGap = placeText ? size * .20 : 0;

    const blockHeight =
      nameAscent + (lines.length - 1) * lineStep + nameDescent +
      (logoHint ? hintGap + hintAscent + hintDescent : 0) +
      (placeText ? placeGap + placeAscent + placeDescent : 0);

    const surface = readSurface(ctx, box, fallbackLight);
    const lightLetters = surface.light;
    const customInk = colourParts(settings.signColour) ? settings.signColour : null;
    const ink = customInk || (lightLetters ? '#fffdf7' : '#25211f');
    const edge = customInk ? shadeColour(customInk, -.56) : (lightLetters ? '#c9c5bc' : '#080706');
    const highlight = customInk ? shadeColour(customInk, .62) : (lightLetters ? 'rgba(255,255,255,.78)' : 'rgba(255,255,255,.32)');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const cx = box.x + box.width / 2;
    const blockTop = box.y + box.height / 2 - blockHeight / 2;
    let baseline = blockTop + nameAscent;

    setFont(ctx, 700, size, size * .06);

    // Build the wordmark as raised dimensional lettering rather than flat
    // canvas type. Repeated offset passes form the side face, the blurred pass
    // anchors it to the wall, and a fine top-left stroke catches room light.
    const depth = Math.max(2, Math.min(8, Math.round(size * .055)));
    ctx.shadowColor = 'rgba(0,0,0,.48)';
    ctx.shadowBlur = Math.max(8, size * .11);
    ctx.shadowOffsetX = depth * 1.25;
    ctx.shadowOffsetY = depth * 1.55;
    ctx.fillStyle = edge;
    for (let layer = depth; layer >= 1; layer--) {
      lines.forEach((line, i) => {
        ctx.fillText(line, cx + layer, baseline + i * lineStep + layer, box.width);
      });
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = ink;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx, baseline, box.width);
    });
    ctx.strokeStyle = highlight;
    ctx.lineWidth = Math.max(.65, size * .009);
    lines.forEach((line, i) => ctx.strokeText(line, cx - .6, baseline + i * lineStep - .6, box.width));

    baseline += (lines.length - 1) * lineStep;

    if (logoHint) {
      setFont(ctx, 500, hintSize, hintSize * .04);
      ctx.fillStyle = colourAlpha(ink, .78);
      ctx.shadowColor = lightLetters ? 'rgba(0,0,0,.34)' : 'rgba(255,255,255,.22)';
      ctx.shadowBlur = Math.max(2, hintSize * .08);
      ctx.shadowOffsetY = 1;
      baseline += nameDescent + hintGap + hintAscent;
      ctx.fillText(logoHint, cx, baseline, box.width);
      baseline += hintDescent;
    } else {
      baseline += nameDescent;
    }

    if (placeText) {
      setFont(ctx, 500, placeSize, placeSize * .16);
      ctx.fillStyle = ink;
      ctx.shadowColor = lightLetters ? 'rgba(0,0,0,.42)' : 'rgba(255,255,255,.30)';
      ctx.shadowBlur = Math.max(3, placeSize * .1);
      ctx.shadowOffsetY = 1;
      ctx.globalAlpha = (ctx.globalAlpha || 1) * .72;   // lighter visual weight
      ctx.fillText(placeText, cx, baseline + placeGap + placeAscent, box.width);
    }
    ctx.restore();
  }

  // Builds a repeatable identity from the category, actual name, selected site
  // style and palette. It is intentionally procedural: the same business gets
  // the same mark on every render, while names in one category do not collapse
  // into one template.
  function drawProceduralLockupLegacy(ctx, name, location, box, fallbackLight, options) {
    const settings = options || {};
    const key = sceneKey(settings.category);
    const scene = SCENES[key];
    const baseProfile = BRAND_PROFILES[key] || BRAND_PROFILES.professional;
    const layoutAdjustments = {
      bold: { width: .84, tracking: .01, weight: 900 }, studio: { width: .80, tracking: .01, weight: 900 },
      luxe: { width: 1.02, tracking: .17, weight: 600 }, editorial: { width: .98, tracking: .11, weight: 600 },
      soft: { width: 1, tracking: .06 }, serene: { width: 1.01, tracking: .13, weight: 600 },
      organic: { width: 1, tracking: .065 }, kinetic: { width: 1.06, tracking: 0 },
      minimal: { width: .96, tracking: .08 }, index: { width: .94, tracking: .045 }
    };
    const profile = Object.assign({}, baseProfile, layoutAdjustments[settings.layout] || {});
    if (settings.fontFamily) profile.family = `${settings.fontFamily}, ${profile.family}`;
    const analysis = analyseName(name, profile);
    const title = displayName(analysis.clean, profile);
    const words = title.split(/\s+/);
    let lines = [title];
    if (title.length > 17 && words.length > 1) lines = splitName(words);

    const inset = scene.surface === 'vehicle' ? .055 : .075;
    const inner = { x: box.x + box.width * inset, y: box.y + box.height * .09, width: box.width * (1 - inset * 2), height: box.height * .82 };
    const hasSubline = Boolean(String(location || '').trim());
    let size = Math.round(inner.height * (lines.length > 1 ? .34 : hasSubline ? .48 : .60));
    const minimum = Math.max(18, Math.round(inner.height * .19));
    const fit = () => {
      ctx.font = fontString(profile, size);
      const tracking = size * profile.tracking;
      return lines.every(line => trackedWidth(ctx, line, tracking) * profile.width <= inner.width);
    };
    while (size > minimum && !fit()) size -= 2;

    const surface = readSurface(ctx, inner, fallbackLight);
    const paletteInk = colourParts(settings.signColour) ? settings.signColour : null;
    let face = paletteInk || (surface.light ? '#f7f3e9' : '#272421');
    if (profile.material === 'brass' && !paletteInk) face = surface.light ? '#ead79d' : '#9b713b';
    if (profile.material === 'steel' && !paletteInk) face = '#e8e9e5';
    const edge = shadeColour(face, profile.material === 'vinyl' ? -.22 : -.52);
    const shine = shadeColour(face, .66);
    const shadowDirection = scene.light === 'upper-right' ? -1 : 1;
    const depth = profile.material === 'vinyl' ? 0 : profile.material === 'painted-metal' ? 3 : profile.material === 'steel' ? 7 : 4;
    const tracking = size * profile.tracking;
    const lineStep = size * .92;
    const titleHeight = size * .74 + (lines.length - 1) * lineStep;
    const subSize = Math.max(10, Math.round(size * .22));
    const subGap = hasSubline ? size * .25 : 0;
    const totalHeight = titleHeight + (hasSubline ? subGap + subSize : 0);
    const centreX = inner.x + inner.width / 2;
    let baseline = inner.y + (inner.height - totalHeight) / 2 + size * .72;

    ctx.save();
    // A small measured shear follows the photographed plane. Keeping this
    // affine and subtle prevents the mark looking like a floating overlay.
    ctx.translate(centreX, 0);
    ctx.transform(1, scene.perspective || 0, 0, 1, -centreX, 0);
    ctx.font = fontString(profile, size);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const drawLines = (fill, dx, dy, alpha) => {
      ctx.fillStyle = fill;
      ctx.globalAlpha = alpha;
      ctx._brandStroke = false;
      lines.forEach((line, index) => {
        ctx.save();
        ctx.translate(centreX + dx, baseline + index * lineStep);
        ctx.scale(profile.width, 1);
        drawTrackedText(ctx, line, 0, dy, tracking, inner.width / profile.width);
        ctx.restore();
      });
    };

    if (profile.material === 'vinyl') {
      ctx.shadowColor = 'rgba(0,0,0,.24)';
      ctx.shadowBlur = Math.max(1, size * .018);
      ctx.shadowOffsetX = shadowDirection * 1.2;
      ctx.shadowOffsetY = 1.4;
      drawLines(face, 0, 0, .92);
      ctx.shadowColor = 'transparent';
      drawLines(shine, 0, -.45, .16);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.42)';
      ctx.shadowBlur = Math.max(5, size * (surface.busy ? .13 : .09));
      ctx.shadowOffsetX = shadowDirection * depth * 1.15;
      ctx.shadowOffsetY = depth * 1.35;
      for (let layer = depth; layer >= 1; layer--) drawLines(edge, shadowDirection * layer, layer, .94);
      ctx.shadowColor = 'transparent';
      drawLines(face, 0, 0, .98);
      ctx.strokeStyle = colourAlpha(shine, profile.material === 'polished' ? .58 : .30);
      ctx.lineWidth = Math.max(.6, size * .009);
      ctx._brandStroke = true;
      lines.forEach((line, index) => {
        ctx.save();
        ctx.translate(centreX - shadowDirection * .55, baseline + index * lineStep - .7);
        ctx.scale(profile.width, 1);
        drawTrackedText(ctx, line, 0, 0, tracking, inner.width / profile.width);
        ctx.restore();
      });
      ctx._brandStroke = false;
    }

    // Name-aware signature details. Only the selected 1–3 compatible moves
    // are drawn, so the result feels authored rather than randomly decorated.
    analysis.modifications.forEach((modification, index) => {
      const y = baseline - size * .10 + index * size * .035;
      ctx.globalAlpha = .92;
      ctx.fillStyle = face;
      ctx.strokeStyle = face;
      ctx.lineWidth = Math.max(1.3, size * .035);
      ctx.lineCap = profile.shape === 'technical' || profile.shape === 'power' ? 'square' : 'round';
      if (modification.type === 'notch') {
        ctx.save();
        ctx.fillStyle = edge;
        ctx.globalAlpha = .86;
        const nx = centreX + inner.width * (((analysis.hash >>> 12) % 30) / 100 - .15);
        ctx.beginPath(); ctx.moveTo(nx, y - size * .62); ctx.lineTo(nx + size * .16, y - size * .62); ctx.lineTo(nx - size * .02, y - size * .40); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (modification.type === 'sweep') {
        ctx.beginPath();
        ctx.moveTo(centreX - inner.width * .25, baseline + size * .18);
        ctx.bezierCurveTo(centreX - inner.width * .05, baseline + size * .32, centreX + inner.width * .14, baseline + size * .24, centreX + inner.width * .27, baseline + size * .08);
        ctx.stroke();
      } else if (modification.type === 'bridge') {
        const span = Math.min(inner.width * .18, size * 1.35);
        ctx.fillRect(centreX - span / 2, baseline - size * .34, span, Math.max(2, size * .035));
      } else if (modification.type === 'feature') {
        ctx.beginPath(); ctx.arc(centreX + inner.width * .29, baseline - size * .50, size * .075, 0, Math.PI * 2); ctx.stroke();
      } else if (modification.type === 'offset') {
        ctx.fillRect(centreX + inner.width * .18, baseline - size * .66, size * .30, Math.max(2, size * .055));
      } else if (modification.type === 'monogram' && lines.length === 1 && title.length > 12) {
        ctx.font = fontString(Object.assign({}, profile, { weight: 800 }), size * .19);
        ctx.textAlign = 'center';
        ctx.fillText(modification.initials, centreX, baseline - size * .98);
      }
    });

    if (hasSubline) {
      ctx.font = `600 ${subSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.letterSpacing = `${subSize * .15}px`;
      ctx.fillStyle = face;
      ctx.globalAlpha = .72;
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = profile.material === 'vinyl' ? 1 : 3;
      ctx.fillText(String(location).trim().toUpperCase(), centreX, baseline + (lines.length - 1) * lineStep + subGap + subSize, inner.width);
    }
    ctx.restore();
  }

  const TREATMENT_BY_CATEGORY = {
    hairbeauty: 'metal', aesthetics: 'metal', health: 'glass', fitness: 'metal',
    automotive: 'vinyl', trades: 'vinyl', homegarden: 'metal', fooddrink: 'metal',
    professional: 'metal', creative: 'glass', pets: 'glass'
  };

  // Fixed after art direction against the actual bundled photographs. Logo
  // colour is part of the physical scene, not a customer-configurable theme.
  const HERO_BRAND_COLOURS = {
    hairbeauty: { face: '#1a1a1a', accent: '#4a4a4a' },
    aesthetics: { face: '#1a1a1a', accent: '#4a4a4a' },
    health: { face: '#344c45', accent: '#789b8c' },
    fitness: { face: '#f0eee7', accent: '#b8c1c6' },
    automotive: { face: '#f5f5ef', accent: '#236db4' },
    trades: { face: '#f7f3e7', accent: '#d59725' },
    homegarden: { face: '#465641', accent: '#a9b68d' },
    fooddrink: { face: '#a8743d', accent: '#e0bd79' },
    professional: { face: '#8c704d', accent: '#d5bd91' },
    creative: { face: '#25272a', accent: '#858e96' },
    pets: { face: '#714c60', accent: '#c48ea6' }
  };

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function resolvedProfile(key, settings) {
    const profile = Object.assign({}, BRAND_PROFILES[key] || BRAND_PROFILES.professional);
    const layout = settings.layout;
    if (layout === 'bold' || layout === 'studio') Object.assign(profile, { weight: 900, width: .84, tracking: .025, case: 'upper' });
    if (layout === 'luxe' || layout === 'serene') Object.assign(profile, { weight: 600, width: 1.02, tracking: .12 });
    if (layout === 'editorial') Object.assign(profile, { weight: 600, width: 1, tracking: .085 });
    if (settings.fontFamily) profile.family = `${settings.fontFamily}, ${profile.family}`;
    // The premium categories need the light, calligraphic contrast seen in the
    // reference, without relying on a downloaded font being ready in 30 sec.
    if (key === 'hairbeauty' || key === 'aesthetics') Object.assign(profile, { family: '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive', weight: 400, italic: false, tracking: 0, width: 1.03 });
    return profile;
  }

  function prepareWordmark(ctx, name, box, profile, treatment) {
    const title = displayName(String(name || 'Your Business').trim(), profile);
    const words = title.split(/\s+/);
    const lines = title.length > (treatment === 'vinyl' ? 18 : 20) && words.length > 1 ? splitName(words) : [title];
    let size = Math.round(box.height * (lines.length > 1 ? .31 : treatment === 'glass' ? .40 : .46));
    const min = Math.max(18, Math.round(box.height * .20));
    const font = () => `${profile.italic ? 'italic ' : ''}${profile.weight} ${size}px ${profile.family}`;
    while (size > min) {
      ctx.font = font();
      const tracking = size * profile.tracking;
      if (lines.every(line => trackedWidth(ctx, line, tracking) * profile.width <= box.width * (treatment === 'glass' ? .86 : .90))) break;
      size -= 2;
    }
    return { title, lines, size, tracking: size * profile.tracking, font: font(), lineStep: size * .92 };
  }

  function drawWordmarkLines(ctx, mark, cx, baseline, width, profile, fill, dx, dy, alpha, stroke) {
    ctx.font = mark.font;
    ctx.fillStyle = fill;
    ctx.globalAlpha = alpha;
    ctx._brandStroke = Boolean(stroke);
    if (stroke) {
      ctx.strokeStyle = stroke.colour;
      ctx.lineWidth = stroke.width;
    }
    mark.lines.forEach((line, index) => {
      ctx.save();
      ctx.translate(cx + dx, baseline + index * mark.lineStep + dy);
      ctx.scale(profile.width, 1);
      drawTrackedText(ctx, line, 0, 0, mark.tracking, width / profile.width);
      ctx.restore();
    });
    ctx._brandStroke = false;
  }

  function drawMetalTreatment(ctx, mark, area, profile, colours, scene, location) {
    const cx = area.x + area.width / 2;
    const titleHeight = mark.size * .74 + (mark.lines.length - 1) * mark.lineStep;
    const subSize = Math.max(10, Math.round(mark.size * .19));
    const baseline = area.y + (area.height - titleHeight - subSize * 1.7) / 2 + mark.size * .72;
    const direction = scene.light === 'upper-right' ? -1 : 1;
    const depth = profile.family.includes('Snell Roundhand') ? 1 : Math.max(2, Math.min(5, Math.round(mark.size * .045)));

    ctx.shadowColor = 'rgba(17,12,8,.40)';
    ctx.shadowBlur = Math.max(4, mark.size * .075);
    ctx.shadowOffsetX = direction * depth * 1.45;
    ctx.shadowOffsetY = depth * 1.8;
    for (let layer = depth; layer >= 1; layer--) {
      drawWordmarkLines(ctx, mark, cx, baseline, area.width, profile, colours.edge, direction * layer, layer, .96);
    }
    ctx.shadowColor = 'transparent';
    const face = ctx.createLinearGradient(0, baseline - mark.size, 0, baseline + mark.size * .18);
    face.addColorStop(0, colours.highlight);
    face.addColorStop(.18, colours.face);
    face.addColorStop(.52, colours.highlight);
    face.addColorStop(.67, colours.face);
    face.addColorStop(1, colours.edge);
    drawWordmarkLines(ctx, mark, cx, baseline, area.width, profile, face, 0, 0, .98, { colour: colourAlpha(colours.highlight, .55), width: Math.max(.55, mark.size * .008) });

    // A restrained baseline is the only decorative move, echoing fabricated
    // salon signage rather than adding generated-looking glyph ornaments.
    if ((profile.italic || profile.family.includes('Snell Roundhand')) && mark.lines.length === 1) {
      ctx.fillStyle = colours.face;
      ctx.globalAlpha = .88;
      ctx.fillRect(cx - area.width * .28, baseline + mark.size * .16, area.width * .59, Math.max(1.2, mark.size * .015));
    }
    drawSubline(ctx, location, cx, baseline + (mark.lines.length - 1) * mark.lineStep + mark.size * .43, area.width * .76, subSize, colours.face, .72);
  }

  function drawGlassTreatment(ctx, mark, area, profile, colours, scene, location) {
    const plaque = { x: area.x + area.width * .025, y: area.y + area.height * .04, width: area.width * .95, height: area.height * .92 };
    const radius = Math.max(5, plaque.height * .055);
    ctx.save();
    ctx.shadowColor = 'rgba(10,14,18,.34)';
    ctx.shadowBlur = Math.max(8, plaque.height * .09);
    ctx.shadowOffsetX = scene.light === 'upper-right' ? -4 : 4;
    ctx.shadowOffsetY = 7;
    roundedRect(ctx, plaque.x, plaque.y, plaque.width, plaque.height, radius);
    ctx.fillStyle = 'rgba(238,244,243,.20)';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const frost = ctx.createLinearGradient(plaque.x, plaque.y, plaque.x + plaque.width, plaque.y + plaque.height);
    frost.addColorStop(0, 'rgba(255,255,255,.34)');
    frost.addColorStop(.30, 'rgba(255,255,255,.08)');
    frost.addColorStop(.72, 'rgba(220,232,233,.17)');
    frost.addColorStop(1, 'rgba(255,255,255,.28)');
    roundedRect(ctx, plaque.x, plaque.y, plaque.width, plaque.height, radius);
    ctx.fillStyle = frost;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.66)';
    ctx.lineWidth = Math.max(1, plaque.height * .009);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(35,45,48,.18)';
    ctx.lineWidth = 1;
    roundedRect(ctx, plaque.x + 2, plaque.y + 2, plaque.width - 4, plaque.height - 4, Math.max(3, radius - 2));
    ctx.stroke();

    // Four metal stand-offs make the panel physically credible.
    const mountR = Math.max(2.2, plaque.height * .025);
    [[.045,.09],[.955,.09],[.045,.91],[.955,.91]].forEach(([px, py]) => {
      const mx = plaque.x + plaque.width * px, my = plaque.y + plaque.height * py;
      const metal = ctx.createRadialGradient(mx - mountR * .4, my - mountR * .5, .2, mx, my, mountR);
      metal.addColorStop(0, '#ffffff'); metal.addColorStop(.35, '#9ca3a3'); metal.addColorStop(1, '#3e4547');
      ctx.beginPath(); ctx.arc(mx, my, mountR, 0, Math.PI * 2); ctx.fillStyle = metal; ctx.fill();
      ctx.beginPath(); ctx.arc(mx - mountR * .25, my - mountR * .25, mountR * .20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    });

    const cx = plaque.x + plaque.width / 2;
    const titleHeight = mark.size * .74 + (mark.lines.length - 1) * mark.lineStep;
    const baseline = plaque.y + (plaque.height - titleHeight) / 2 + mark.size * .62;
    ctx.shadowColor = 'rgba(0,0,0,.24)';
    ctx.shadowBlur = 2.5;
    ctx.shadowOffsetY = 1.5;
    drawWordmarkLines(ctx, mark, cx, baseline, plaque.width * .78, profile, colours.face, 0, 0, .92, { colour: colourAlpha(colours.highlight, .34), width: Math.max(.5, mark.size * .007) });
    ctx.shadowColor = 'transparent';
    drawSubline(ctx, location, cx, baseline + (mark.lines.length - 1) * mark.lineStep + mark.size * .36, plaque.width * .66, Math.max(9, mark.size * .18), colours.face, .64);
    ctx.restore();
  }

  function drawVinylTreatment(ctx, mark, area, profile, colours, scene, location) {
    const badgeCx = area.x + area.width * .13;
    const badgeCy = area.y + area.height * .47;
    const badgeRadius = Math.min(area.height * .27, area.width * .09);
    const initials = mark.title.split(/\s+/).map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const textArea = { x: area.x + area.width * .25, y: area.y, width: area.width * .72, height: area.height };
    const vehicleMark = prepareWordmark(ctx, mark.title, textArea, profile, 'vinyl');
    const cx = textArea.x + textArea.width / 2;
    const titleHeight = vehicleMark.size * .74 + (vehicleMark.lines.length - 1) * vehicleMark.lineStep;
    const baseline = textArea.y + (textArea.height - titleHeight) / 2 + vehicleMark.size * .54;

    // Proper vehicle-brand lock-up: a separate cut-vinyl badge creates an
    // intentional left anchor and keeps the name centred on the unobstructed
    // cargo-door panel rather than across the whole photograph.
    ctx.shadowColor = 'rgba(0,0,0,.24)';
    ctx.shadowBlur = 1.4;
    ctx.shadowOffsetY = 1.2;
    ctx.beginPath(); ctx.arc(badgeCx, badgeCy, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(247,248,244,.94)'; ctx.fill();
    ctx.beginPath(); ctx.arc(badgeCx, badgeCy, badgeRadius * .78, 0, Math.PI * 2);
    ctx.fillStyle = colours.accent; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(badgeCx - badgeRadius * .46, badgeCy + badgeRadius * .38);
    ctx.lineTo(badgeCx + badgeRadius * .50, badgeCy - badgeRadius * .36);
    ctx.lineTo(badgeCx + badgeRadius * .22, badgeCy + badgeRadius * .42);
    ctx.closePath(); ctx.fillStyle = colourAlpha(colours.highlight, .48); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.font = `900 ${Math.max(11, badgeRadius * .66)}px Arial Narrow, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .96;
    ctx.fillText(initials || 'B', badgeCx, badgeCy + .5, badgeRadius * 1.25);

    ctx.shadowColor = 'rgba(0,0,0,.18)';
    ctx.shadowBlur = 1.2;
    ctx.shadowOffsetX = scene.light === 'upper-right' ? -1 : 1;
    ctx.shadowOffsetY = 1.3;
    drawWordmarkLines(ctx, vehicleMark, cx, baseline, textArea.width, profile, colours.face, 0, 0, .98);
    ctx.shadowColor = 'transparent';
    drawWordmarkLines(ctx, vehicleMark, cx, baseline, textArea.width, profile, colours.highlight, 0, -.45, .16);
    const ruleY = baseline + (vehicleMark.lines.length - 1) * vehicleMark.lineStep + vehicleMark.size * .16;
    ctx.fillStyle = colours.accent;
    ctx.globalAlpha = .94;
    ctx.beginPath();
    ctx.moveTo(cx - textArea.width * .38, ruleY);
    ctx.lineTo(cx + textArea.width * .32, ruleY);
    ctx.lineTo(cx + textArea.width * .38, ruleY - Math.max(3, vehicleMark.size * .055));
    ctx.lineTo(cx - textArea.width * .38, ruleY + Math.max(2, vehicleMark.size * .025));
    ctx.closePath(); ctx.fill();
    drawSubline(ctx, location, cx, ruleY + vehicleMark.size * .29, textArea.width * .74, Math.max(9, vehicleMark.size * .17), '#f7f8f4', .88);
  }

  function drawSubline(ctx, location, cx, baseline, maxWidth, size, colour, alpha) {
    if (!String(location || '').trim()) return;
    ctx.font = `600 ${size}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.letterSpacing = `${size * .14}px`;
    ctx.fillText(String(location).trim().toUpperCase(), cx, baseline, maxWidth);
  }

  function drawProceduralLockup(ctx, name, location, box, fallbackLight, options) {
    const settings = options || {};
    const key = sceneKey(settings.category);
    const scene = SCENES[key];
    const treatment = TREATMENT_BY_CATEGORY[key] || 'metal';
    const profile = resolvedProfile(key, settings);
    const area = { x: box.x + box.width * .035, y: box.y + box.height * .04, width: box.width * .93, height: box.height * .92 };
    const surface = readSurface(ctx, area, fallbackLight);
    const selected = HERO_BRAND_COLOURS[key] || { face: surface.light ? '#f1eee7' : '#292724', accent: '#9c8b72' };
    const colours = { face: selected.face, accent: selected.accent, edge: shadeColour(selected.face, -.48), highlight: shadeColour(selected.face, .72) };
    const mark = prepareWordmark(ctx, name, area, profile, treatment);

    ctx.save();
    if (treatment === 'glass') drawGlassTreatment(ctx, mark, area, profile, colours, scene, location);
    else if (treatment === 'vinyl') drawVinylTreatment(ctx, mark, area, profile, colours, scene, location);
    else drawMetalTreatment(ctx, mark, area, profile, colours, scene, location);
    ctx.restore();
  }

  // Safari does not encode WebP from a canvas: it ignores the requested type
  // and silently returns PNG. For a 1600x900 photograph that is ~2.1 MB of
  // base64 instead of ~120 KB — large enough to stall the iPhone preview once
  // it is inlined into the generated site's srcdoc. Probe once and fall back
  // to JPEG, which every browser encodes and which stays small for photos.
  // (The hero is fully opaque, so losing alpha costs nothing.)
  let exportType = null;
  const renderCache = new Map();
  function pickExportType() {
    if (exportType) return exportType;
    try {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      exportType = probe.toDataURL('image/webp').indexOf('data:image/webp') === 0 ? 'image/webp' : 'image/jpeg';
    } catch (error) {
      exportType = 'image/jpeg';
    }
    return exportType;
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the branded hero.')), pickExportType(), quality);
    });
  }

  // Converts the existing category composition into a restrained technical
  // drawing. It runs after the name/logo has been placed, so every outline
  // retains exactly the same branded position as the finished 3D hero.
  function applyOutlineTreatment(ctx, width, height) {
    const source = ctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);
    const input = source.data, pixels = output.data;
    const luminance = new Float32Array(width * height);
    for (let i = 0, p = 0; i < input.length; i += 4, p++) {
      luminance[p] = input[i] * .2126 + input[i + 1] * .7152 + input[i + 2] * .0722;
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const left = luminance[y * width + Math.max(0, x - 1)];
        const right = luminance[y * width + Math.min(width - 1, x + 1)];
        const up = luminance[Math.max(0, y - 1) * width + x];
        const down = luminance[Math.min(height - 1, y + 1) * width + x];
        const edge = Math.min(255, Math.abs(right - left) + Math.abs(down - up));
        const ink = edge > 36 ? Math.max(20, 255 - edge * 3.1) : 255;
        const index = p * 4;
        // Preserve a quiet BrightSite-blue trace where the original artwork
        // was already distinctly blue; all other detail is charcoal ink.
        const blue = input[index + 2] > input[index] * 1.16 && input[index + 2] > input[index + 1] * 1.05 && input[index + 2] > 115;
        pixels[index] = blue && edge > 22 ? 47 : ink;
        pixels[index + 1] = blue && edge > 22 ? 125 : ink;
        pixels[index + 2] = blue && edge > 22 ? 237 : ink;
        pixels[index + 3] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  }

  async function render(options) {
    const settings = options || {};
    const key = sceneKey(settings.category);
    const scene = SCENES[key];
    const cacheable = !settings.heroImage && !settings.logo && (!settings.output || settings.output === 'dataURL');
    const cacheKey = cacheable ? [key, settings.businessName, settings.location, settings.layout, settings.fontFamily, settings.outline ? 'outline' : 'colour', settings.width || 1600, settings.height || 900, settings.quality || .88].join('|') : null;
    if (cacheKey && renderCache.has(cacheKey)) return renderCache.get(cacheKey);
    const heroSource = settings.heroImage || new URL(scene.image, assetBase).href;
    const hero = await loadImage(heroSource);
    const canvas = document.createElement('canvas');
    canvas.width = Number(settings.width) || 1600;
    canvas.height = Number(settings.height) || 900;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    if (scene.filter) ctx.filter = scene.filter;
    ctx.drawImage(hero, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // The panel is the usable surface; clamp it inside the frame so no rounding
    // or custom size can push the lockup off the edge of the image.
    const p = scene.panel;
    const boxWidth = canvas.width * p.w;
    const boxHeight = canvas.height * p.h;
    const box = {
      x: Math.max(0, Math.min(canvas.width - boxWidth, canvas.width * p.cx - boxWidth / 2)),
      y: Math.max(0, Math.min(canvas.height - boxHeight, canvas.height * p.cy - boxHeight / 2)),
      width: boxWidth,
      height: boxHeight
    };
    const lightInk = scene.blend === 'screen';

    ctx.save();
    ctx.globalAlpha = scene.opacity;
    ctx.globalCompositeOperation = scene.blend;
    if (settings.logo) {
      let logo = await loadImage(settings.logo);
      if (global.LogoPlacement && typeof global.LogoPlacement.removeBackground === 'function') {
        try { logo = await global.LogoPlacement.removeBackground(logo); } catch (error) { /* fall back to the raw upload */ }
      }
      const logoWidth = logo.naturalWidth || logo.width;
      const logoHeight = logo.naturalHeight || logo.height;
      const fitted = fitInside(logoWidth, logoHeight, box.width, box.height);
      const layer = makeLogoLayer(logo, fitted.width, fitted.height, lightInk);
      const x = box.x + (box.width - fitted.width) / 2;
      const y = box.y + (box.height - fitted.height) / 2;
      ctx.filter = 'blur(0.25px)';
      ctx.drawImage(layer, x, y, fitted.width, fitted.height);
      // A faint second pass lets wall grain show through without looking pasted on.
      ctx.globalAlpha = .12;
      ctx.filter = 'blur(0.7px)';
      ctx.drawImage(layer, x, y + 1, fitted.width, fitted.height);
    } else {
      // The wordmark reads the surface it lands on, so it composites normally
      // rather than through the logo's blend mode.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      drawProceduralLockup(ctx, settings.businessName, settings.location, box, lightInk, {
        category: settings.category,
        layout: settings.layout,
        fontFamily: settings.fontFamily,
        signColour: settings.signColour,
        logoHint: settings.logoHint
      });
    }
    ctx.restore();

    if (settings.outline) applyOutlineTreatment(ctx, canvas.width, canvas.height);

    const output = settings.output || 'dataURL';
    const quality = Number.isFinite(settings.quality) ? settings.quality : .88;
    if (output === 'canvas') return canvas;
    if (output === 'blob') return canvasBlob(canvas, quality);
    if (output === 'objectURL') return URL.createObjectURL(await canvasBlob(canvas, quality));
    const dataURL = canvas.toDataURL(pickExportType(), quality);
    if (cacheKey) {
      renderCache.set(cacheKey, dataURL);
      if (renderCache.size > 16) renderCache.delete(renderCache.keys().next().value);
    }
    return dataURL;
  }

  function heroSource(category) {
    return new URL(SCENES[sceneKey(category)].image, assetBase).href;
  }

  global.HeroBrandCompositor = Object.freeze({ render, scenes: SCENES, sceneKey, heroSource, analyseName: (name, category) => analyseName(name, BRAND_PROFILES[sceneKey(category)] || BRAND_PROFILES.professional) });
})(window);
