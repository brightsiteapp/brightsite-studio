import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Easing, Image, ImageBackground, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder,
  Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { supabase } from './lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_TOP = Platform.OS === 'ios' ? 54 : 28;
const CARD_BOTTOM = 72;
const CARD_TRAVEL = SCREEN_HEIGHT - 190;
const FONT = Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' });
const BRAND = '#E2E8EB';
const DOMAIN_TLDS = ['.com', '.co.uk', '.net', '.org', '.io', '.co', '.uk', '.app'];
const DOMAIN_API = 'https://api.brightsite.app/api/check-domain';
const PAYMENT_API = 'https://api.brightsite.app/api/create-payment-intent';
// Replace with your Stripe publishable key from stripe.com/dashboard
const STRIPE_KEY = 'pk_live_YOUR_STRIPE_PUBLISHABLE_KEY';
const CARD = '#EFE4DB';
const FS_SLOT = (SCREEN_WIDTH - 32) / 5;
const DARK = '#1C2832';

type Step = { id: string; title: string; icon: keyof typeof Ionicons.glyphMap };
const steps: Step[] = [
  { id: 'login', title: 'Welcome to BrightSite', icon: 'sparkles-outline' },
  { id: 'business', title: 'Business information', icon: 'storefront-outline' },
  { id: 'contact', title: 'Contact details', icon: 'call-outline' },
  { id: 'hours', title: 'Opening hours', icon: 'time-outline' },
  { id: 'prices', title: 'Services & prices', icon: 'pricetag-outline' },
  { id: 'media', title: 'Photos & logo', icon: 'images-outline' },
  { id: 'reviews', title: 'Reviews', icon: 'star-outline' },
  { id: 'domain', title: 'Choose a domain', icon: 'globe-outline' },
  { id: 'choice', title: 'Build your website', icon: 'construct-outline' },
];
const setupStepIndexes = Array.from({ length: 8 }, (_, i) => i + 1);
const paletteGroups = [
  { name: 'Light', options: [['#B98B5F', '#F5EFE5', '#201B18'], ['#C78561', '#FFF5EC', '#2D1811'], ['#8E9B7A', '#F2F5EC', '#20321D'], ['#A47A57', '#F6F0E8', '#271C15'], ['#7697A6', '#EDF6F7', '#162D35'], ['#C59C7B', '#FCF8F2', '#302015']] },
  { name: 'Dark', options: [['#D6A56B', '#15110E', '#F3EADF'], ['#78BDCF', '#0C2028', '#E7F8FC'], ['#B2C798', '#142016', '#F2F6ED'], ['#CE8471', '#261412', '#FAEDEA'], ['#A19BDB', '#171529', '#F2F1FF'], ['#D7B179', '#211A11', '#FBF1DF']] },
  { name: 'Neon', options: [['#E8FF38', '#10140D', '#F4F8E8'], ['#5BEEFF', '#091A20', '#E8FCFF'], ['#FE77BF', '#21101D', '#FFEAF7'], ['#A8FF75', '#10200C', '#EFFFE7'], ['#FF8E4F', '#24140B', '#FFF0E7'], ['#A990FF', '#171126', '#F5F0FF']] },
  { name: 'Monotone', options: [['#B8B8B8', '#F1F1F1', '#1B1B1B'], ['#B9AFA6', '#F3F0ED', '#27221E'], ['#9EADB2', '#EFF2F3', '#1A2428'], ['#A9B19C', '#F1F3EE', '#20241C'], ['#B0A4A2', '#F4EFEE', '#29201F'], ['#9EA4AE', '#F0F2F5', '#1B2029']] },
  { name: 'Blush', options: [['#C4768A', '#FDF0F3', '#2A1419'], ['#D4879B', '#FEF5F7', '#311920'], ['#E29BB0', '#FFF0F5', '#301528'], ['#B87190', '#F9EEF3', '#281122'], ['#CF9FAF', '#FDF4F7', '#2E1821'], ['#A6637E', '#F6EBF0', '#241018']] },
  { name: 'Earthy', options: [['#B5704E', '#F7F0E8', '#2C1A0F'], ['#A8835E', '#F5EDE0', '#281609'], ['#9C8B6E', '#F4EDDE', '#241A0D'], ['#B99060', '#F8F1E4', '#2E1C0C'], ['#8E7A5E', '#F2EBD8', '#201508'], ['#C08262', '#F9EFE5', '#321B0D']] },
  { name: 'Jewel', options: [['#5B8DB8', '#EEF5FB', '#0D2035'], ['#7B6FAE', '#F2F0FA', '#1A1230'], ['#3D8E6C', '#EBF6F1', '#0C2A1E'], ['#B85C5C', '#FBF0F0', '#300F0F'], ['#8A6B2E', '#F9F4E8', '#2A1E08'], ['#4E8B8B', '#EBF6F6', '#0D2828']] },
];
const palettes = paletteGroups.flatMap(group => group.options);
const fonts = ['Editorial', 'Rounded', 'Modern', 'Thin', 'Classic'];
const HOME_SECTIONS_DEFAULT = ['Hero', 'About & Services', 'Reviews', 'Gallery', 'Contact'];
const SERVICES_SECTIONS_DEFAULT = ['Services List', 'Contact CTA'];
const CONTACT_SECTIONS_DEFAULT = ['Info & Hours', 'Map', 'Contact Form'];
const ALL_PAGE_SECTIONS = [...HOME_SECTIONS_DEFAULT, ...SERVICES_SECTIONS_DEFAULT, ...CONTACT_SECTIONS_DEFAULT];

const CATEGORY_PRESETS: Record<string, { topServices: string[]; about: string; heroTitle: string; heroBody: string }> = {
  'Hair': { topServices: ['Cuts & Styling', 'Colour', 'Treatments'], about: 'Personal service, honest advice and a finish made for real life.', heroTitle: 'Beautiful hair, beautifully yours.', heroBody: 'Thoughtful cuts, colour and styling in a calm modern salon.' },
  'Beauty': { topServices: ['Facials', 'Nails', 'Waxing'], about: 'A sanctuary of calm where you leave feeling your best self.', heroTitle: 'Feel beautiful, every day.', heroBody: 'Luxurious treatments tailored to you in a serene and welcoming space.' },
  'Restaurant': { topServices: ['Starters', 'Mains', 'Desserts'], about: 'Freshly prepared dishes made with locally sourced ingredients.', heroTitle: 'Honest food, made with love.', heroBody: 'Seasonal menus, warm service and a table worth coming back to.' },
  'Café': { topServices: ['Breakfast', 'Lunch', 'Drinks'], about: 'Good coffee, fresh food and a space worth staying in.', heroTitle: 'Your neighbourhood café.', heroBody: 'Freshly brewed coffee and handmade food from early morning.' },
  'Fitness': { topServices: ['Personal Training', 'Group Classes', 'Nutrition'], about: 'Expert coaching to help you reach your health and fitness goals.', heroTitle: 'Your best body starts here.', heroBody: 'Science-backed training, real results and a community that supports you.' },
  'Gym': { topServices: ['Memberships', 'Classes', 'PT Sessions'], about: 'A fully equipped gym with classes for every fitness level.', heroTitle: 'Push your limits.', heroBody: 'State-of-the-art equipment and expert trainers to help you achieve more.' },
  'Photography': { topServices: ['Portraits', 'Events', 'Commercial'], about: 'Capturing the moments that matter most in your most authentic light.', heroTitle: 'Your story, beautifully told.', heroBody: 'Natural light portraits, events and commercial photography.' },
  'Dental': { topServices: ['Check-ups', 'Whitening', 'Orthodontics'], about: 'Gentle, professional dental care for the whole family.', heroTitle: "A smile you’re proud of.", heroBody: 'Expert dental care delivered with warmth and attention to detail.' },
  'Plumbing': { topServices: ['Boiler Repair', 'Installation', 'Emergency'], about: 'Reliable, qualified plumbers for every job big or small.', heroTitle: 'Plumbing you can count on.', heroBody: 'Fast, professional service from fully qualified engineers.' },
  'Cleaning': { topServices: ['Domestic', 'Commercial', 'Deep Clean'], about: 'Professional cleaning services for homes and businesses.', heroTitle: 'Spotlessly clean, every time.', heroBody: 'Reliable, thorough cleaning using eco-friendly products.' },
};
function getPreset(category: string) {
  const key = Object.keys(CATEGORY_PRESETS).find(k =>
    (category || '').toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes((category || '').toLowerCase())
  );
  return key ? CATEGORY_PRESETS[key] : { topServices: ['Our Services', 'Consultations', 'Packages'], about: 'Professional, friendly service tailored to your needs.', heroTitle: 'Welcome.', heroBody: "We’re here to help." };
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, ...inputProps }: any) {
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="rgba(218,232,244,.35)"
      keyboardType={keyboardType} multiline={multiline} style={[s.input, multiline && s.inputMultiline]} {...inputProps} />
  </View>;
}

const Intro = ({ children }: any) => <Text style={s.intro}>{children}</Text>;

function Hours({ rows, setRows }: any) {
  return <View style={s.hoursCard}>{rows.map((row: any, i: number) =>
    <View style={[s.hoursRow, i === rows.length - 1 && s.hoursRowLast]} key={row.label}>
      <Text style={s.hoursDay}>{row.label.slice(0, 3)}</Text>
      <View style={s.hoursTimes}>{row.enabled ? <><TextInput value={row.start} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, start: v } : x))} style={s.timeInput} /><Text style={s.timeDash}>–</Text><TextInput value={row.end} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, end: v } : x))} style={s.timeInput} /></> : <><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View><Text style={s.timeDash}>–</Text><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View></>}</View>
      <View style={s.hoursSwitch}><Switch value={row.enabled} onValueChange={() => setRows(rows.map((x: any, n: number) => n === i ? { ...x, enabled: !x.enabled } : x))}
        trackColor={{ false: '#B8C2C9', true: DARK }} thumbColor="#F7FCFF" /></View></View>)}</View>;
}

function Services({ items, setItems }: any) {
  const update = (i: number, key: string, value: string) => setItems(items.map((item: any, n: number) => n === i ? { ...item, [key]: value } : item));
  const remove = (i: number) => { if (items.length > 1) setItems(items.filter((_: any, n: number) => n !== i)); };
  const addService = () => setItems([...items, { section: items[items.length - 1]?.section || '', name: '', duration: '', price: '' }]);
  const addSection = () => setItems([...items, { section: '', name: '', duration: '', price: '' }]);
  return <View>
    {items.map((item: any, i: number) => {
      const isNewSection = i === 0 || item.section !== items[i - 1].section;
      return <View key={i}>
        {isNewSection && i > 0 && <View style={s.sectionDivider} />}
        {isNewSection && <Field label="Service section name" value={item.section} onChangeText={(v: string) => update(i, 'section', v)} placeholder="e.g. Cutting & styling" />}
        <View style={s.serviceRow}>
          <TextInput value={item.name} onChangeText={v => update(i, 'name', v)} placeholder="Service" placeholderTextColor="rgba(218,232,244,.35)" style={[s.serviceInput, { flex: 1.6 }]} />
          <TextInput value={item.duration} onChangeText={v => update(i, 'duration', v)} placeholder="Time" placeholderTextColor="rgba(218,232,244,.35)" style={[s.serviceInput, { flex: 1 }]} />
          <TextInput value={item.price} onChangeText={v => update(i, 'price', v)} placeholder="Price" placeholderTextColor="rgba(218,232,244,.35)" style={[s.serviceInput, { flex: .8 }]} />
          <Pressable onPress={() => remove(i)} style={s.serviceDelete}><Ionicons name="close" size={13} color="rgba(220,232,242,.42)" /></Pressable>
        </View>
      </View>;
    })}
    <Pressable onPress={addService} style={s.addService}><Ionicons name="add" size={16} color={BRAND} /><Text style={s.addServiceText}>Add service</Text></Pressable>
    <Pressable onPress={addSection} style={[s.addService, s.addSectionBtn]}><Ionicons name="add" size={16} color={BRAND} /><Text style={s.addServiceText}>Add section</Text></Pressable>
  </View>;
}

function Upload({ icon, title, subtitle, value, onChange, multiple = false, fill = false, h = 160 }: any) {
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: multiple, quality: .82 });
    if (!result.canceled) onChange(multiple ? result.assets.map(asset => asset.uri) : result.assets[0]?.uri);
  };
  const preview = Array.isArray(value) ? value[0] : value;
  return <Pressable onPress={chooseImage} style={({ pressed }) => [s.upload, fill && { padding: 0, height: h }, pressed && s.pressed]}>
    {preview ? <Image source={{ uri: preview }} style={fill ? s.uploadPreviewFill : s.uploadPreview} resizeMode="cover" /> : fill ? <Ionicons name="add" size={26} color="#2563EB" /> : <><View style={s.uploadIcon}><Ionicons name={icon} size={22} color="#2563EB" /></View><Text style={s.uploadTitle}>{title}</Text><Text style={s.uploadSub}>{subtitle}</Text></>}
  </Pressable>;
}

function SitePreview({ palette, font, page = 0, onPageChange, editing, siteTexts = {}, onEditText,
  businessName = '', category = '', servicesData = [], hoursData = [],
  contactData = {} as any, contactForm = true,
  homeSections = HOME_SECTIONS_DEFAULT, servicesSections = SERVICES_SECTIONS_DEFAULT, contactSections = CONTACT_SECTIONS_DEFAULT,
}: any) {
  const colors = palettes[palette];
  const [accent, bg, textColor] = colors;
  const preset = getPreset(category);
  const titleFamily = font === 0 ? Platform.select({ ios: 'Didot', android: 'serif', default: 'serif' }) : FONT;
  const fw: any = font === 1 ? '800' : font === 2 ? '300' : font === 3 ? '200' : font === 4 ? '900' : undefined;
  const fo: any = { fontFamily: FONT, ...(fw && { fontWeight: fw }), ...(font === 2 && { letterSpacing: 1.2 }), ...(font === 3 && { letterSpacing: 1.8 }), ...(font === 4 && { letterSpacing: -0.5 }) };
  const tf: any = { ...fo, fontFamily: titleFamily };
  const tx = (key: string, fallback: string) => (siteTexts as any)[key] || fallback;
  const ep = (key: string) => editing ? () => onEditText?.(key) : undefined;
  const biz = businessName || 'Business';
  const topSvcs = servicesData?.filter((sv: any) => sv.name).slice(0, 3).map((sv: any) => sv.name);
  const displaySvcs = topSvcs?.length ? topSvcs : preset.topServices;

  const renderHome = (name: string) => {
    switch (name) {
      case 'Hero': return <ImageBackground key="Hero" source={require('./assets/hair-beauty-hero.jpg')} style={s.siteHero}>
        <LinearGradient colors={['rgba(5,7,9,.08)', 'rgba(5,7,9,.84)']} style={StyleSheet.absoluteFill} />
        <View style={s.siteTop}>
          <Text style={[s.siteKicker, fo, editing && s.editing]} onPress={ep('brand')}>{tx('brand', biz.toUpperCase())}</Text>
          <View style={s.siteNav}><Text style={[s.siteNavText, fo]}>SERVICES</Text><Text style={[s.siteNavText, fo]}>CONTACT</Text><Ionicons name="menu" size={18} color="#fff" /></View>
        </View>
        <View style={s.siteCopy}>
          <Text style={[s.siteHeadline, tf, editing && s.editing]} onPress={ep('headline')}>{tx('headline', preset.heroTitle)}</Text>
          <Text style={[s.siteBody, fo, editing && s.editing]} onPress={ep('heroBody')}>{tx('heroBody', preset.heroBody)}</Text>
          <View style={[s.siteCta, { borderColor: accent }]}><Text style={[s.siteCtaText, fo]}>BOOK NOW</Text></View>
        </View>
      </ImageBackground>;
      case 'About & Services': return <View key="About & Services" style={s.siteAboutServRow}>
        <View style={s.siteAboutCol}>
          <Text style={[s.siteSectionTitle, tf, { color: textColor }, editing && s.editing]} onPress={ep('aboutTitle')}>{tx('aboutTitle', biz)}</Text>
          <Text style={[s.siteSectionBody, fo, { color: textColor }, editing && s.editing]} onPress={ep('aboutBody')}>{tx('aboutBody', preset.about)}</Text>
        </View>
        <View style={s.siteSvcsCol}>
          {displaySvcs.map((sv: string, i: number) => <View key={i} style={[s.siteServiceCard, { borderColor: accent + '55' }]}>
            <Text style={[s.siteServiceName, fo, { color: accent }]}>{sv}</Text>
            <Text style={[s.siteServiceLink, fo, { color: textColor }]}>View →</Text>
          </View>)}
        </View>
      </View>;
      case 'Reviews': return <View key="Reviews" style={[s.siteReviewsSection, { backgroundColor: accent + '14' }]}>
        <Text style={[s.siteReviewsSectionTitle, tf, { color: textColor }]}>What clients say</Text>
        <View style={s.siteStars}>{[0,1,2,3,4].map(i => <Ionicons key={i} name="star" size={7} color={accent} />)}</View>
        <Text style={[s.siteReviewText, fo, { color: textColor }]}>"Amazing results every time."</Text>
        <Text style={[s.siteReviewAuthor, fo, { color: textColor }]}>— Sarah M.</Text>
        {contactData.reviewSource === 'Trustpilot' && <View style={[s.siteTrustBadge, { borderColor: textColor + '33' }]}>
          <Text style={[s.siteTrustTitle, fo, { color: textColor }]}>Rated Excellent on Trustpilot</Text>
          <View style={[s.siteStars, { marginTop: 4 }]}>{[0,1,2,3,4].map(i => <Ionicons key={i} name="star" size={9} color="#00B67A" />)}</View>
          {!!contactData.reviewLink && <Text style={[s.siteTrustLink, fo, { color: accent }]}>See our reviews →</Text>}
        </View>}
      </View>;
      case 'Gallery': return <View key="Gallery" style={s.siteGallerySection}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
          {Array.from({ length: 6 }, (_, i) => <View key={i} style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: i % 2 === 0 ? accent + (i === 0 ? 'FF' : 'AA') : textColor + '33' }} />)}
        </View>
      </View>;
      case 'Contact': return <View key="Contact" style={[s.siteContactCta, { borderTopColor: accent + '33' }]}>
        <Text style={[s.siteContactCtaTitle, tf, { color: textColor }]}>Ready to book?</Text>
        <View style={[s.siteCtaFilled, { backgroundColor: accent }]}><Text style={[s.siteCtaFilledText, fo]}>Book Now</Text></View>
      </View>;
      default: return null;
    }
  };

  const renderServices = (name: string) => {
    const allSvcs = servicesData?.filter((sv: any) => sv.name) || [];
    const listItems = allSvcs.length ? allSvcs : preset.topServices.map((n: string) => ({ name: n, duration: '', price: '' }));
    switch (name) {
      case 'Services List': return <View key="Services List" style={s.siteSvcsListSection}>
        <Text style={[s.siteSectionTitle, tf, { color: textColor }]}>Our Services</Text>
        {listItems.map((sv: any, i: number) => <View key={i} style={[s.siteSvcRow, { borderBottomColor: accent + '22' }]}>
          <View style={{ flex: 1 }}><Text style={[s.siteSvcRowName, fo, { color: textColor }]}>{sv.name || sv}</Text>
            {!!sv.duration && <Text style={[s.siteSvcRowDetail, fo, { color: textColor }]}>{sv.duration}</Text>}</View>
          <Text style={[s.siteSvcRowPrice, fo, { color: accent }]}>{sv.price || '—'}</Text>
        </View>)}
      </View>;
      case 'Contact CTA': return <View key="Contact CTA" style={[s.siteContactCta, { borderTopColor: accent + '33' }]}>
        <View style={[s.siteCtaFilled, { backgroundColor: accent }]}><Text style={[s.siteCtaFilledText, fo]}>Contact Us</Text></View>
      </View>;
      default: return null;
    }
  };

  const renderContact = (name: string) => {
    switch (name) {
      case 'Info & Hours': return <View key="Info & Hours" style={s.siteContactInfoRow}>
        <View style={s.siteContactInfoCol}>
          <Text style={[s.siteContactInfoTitle, tf, { color: textColor }]}>Contact</Text>
          {!!contactData.phone && <View style={s.siteContactItem}><Ionicons name="call-outline" size={8} color={accent} /><Text style={[s.siteContactItemText, fo, { color: textColor }]}>{contactData.phone}</Text></View>}
          {!!contactData.email && <View style={s.siteContactItem}><Ionicons name="mail-outline" size={8} color={accent} /><Text style={[s.siteContactItemText, fo, { color: textColor }]}>{contactData.email}</Text></View>}
          {!!contactData.address && <View style={s.siteContactItem}><Ionicons name="location-outline" size={8} color={accent} /><Text style={[s.siteContactItemText, fo, { color: textColor }]}>{contactData.address}</Text></View>}
          {!!contactData.instagram && <View style={s.siteContactItem}><Ionicons name="logo-instagram" size={8} color={accent} /><Text style={[s.siteContactItemText, fo, { color: textColor }]}>{contactData.instagram}</Text></View>}
        </View>
        <View style={s.siteHoursCol}>
          <Text style={[s.siteContactInfoTitle, tf, { color: textColor }]}>Hours</Text>
          {(hoursData.length ? hoursData : ['Mon','Tue','Wed','Thu','Fri'].map((d: string) => ({ label: d, start: '9:00', end: '17:30', enabled: true }))).slice(0, 5).map((row: any, i: number) => <View key={i} style={s.siteHoursRow}>
            <Text style={[s.siteHoursDay, fo, { color: textColor }]}>{(row.label || row).slice(0, 3)}</Text>
            <Text style={[s.siteHoursTime, fo, { color: textColor }]}>{row.enabled ? `${row.start}–${row.end}` : 'Closed'}</Text>
          </View>)}
        </View>
      </View>;
      case 'Map': return <View key="Map" style={[s.siteMockMap, { backgroundColor: accent + '14', borderColor: accent + '28' }]}>
        <Ionicons name="location" size={18} color={accent} />
        <View><Text style={[s.siteMockMapAddr, fo, { color: textColor }]}>{contactData.address || 'Your business location'}</Text>
          <Text style={[s.siteMockMapSub, fo, { color: textColor }]}>Google Maps</Text></View>
      </View>;
      case 'Contact Form': return contactForm
        ? <View key="Contact Form" style={s.siteFormSection}>
            <Text style={[s.siteSectionTitle, tf, { color: textColor }]}>Send a message</Text>
            {['Your name', 'Your email'].map((ph, i) => <View key={i} style={[s.siteFormField, { borderColor: accent + '44' }]}><Text style={[s.siteFormPh, fo, { color: textColor }]}>{ph}</Text></View>)}
            <View style={[s.siteFormField, { borderColor: accent + '44', minHeight: 36 }]}><Text style={[s.siteFormPh, fo, { color: textColor }]}>Message</Text></View>
            <View style={[s.siteCtaFilled, { backgroundColor: accent, alignSelf: 'stretch', marginTop: 6 }]}><Text style={[s.siteCtaFilledText, fo]}>Send Message</Text></View>
          </View>
        : <View key="Contact Form" style={[s.siteContactCta, { borderTopColor: accent + '33' }]}>
            <View style={[s.siteCtaFilled, { backgroundColor: accent }]}><Text style={[s.siteCtaFilledText, fo]}>Contact Us</Text></View>
          </View>;
      default: return null;
    }
  };

  return <View style={[s.site, { backgroundColor: bg }]}>
    <View style={s.previewBrowserWrap}>
      <View style={s.previewBrowser}><View style={s.previewDots}><View style={s.previewDot} /><View style={s.previewDot} /><View style={s.previewDot} /></View><Text style={s.previewAddress}>{biz.toLowerCase().replace(/\s+/g, '')}.co.uk</Text></View>
      <View style={[s.previewPageNav, { borderBottomColor: accent + '33' }]}>
        {['Home', 'Services', 'Contact'].map((name, i) => <Pressable key={name} onPress={() => onPageChange?.(i)} style={[s.previewPageTab, page === i && { borderBottomColor: accent, borderBottomWidth: 2 }]}>
          <Text style={[s.previewPageTabText, fo, page === i && { color: accent }]}>{name}</Text>
        </Pressable>)}
      </View>
    </View>
    {page === 0 && <View>{homeSections.map((n: string) => renderHome(n))}</View>}
    {page === 1 && <View>{servicesSections.map((n: string) => renderServices(n))}</View>}
    {page === 2 && <View>{contactSections.map((n: string) => renderContact(n))}</View>}
  </View>;
}

function SectionDragList({ sections, setSections, sectionVisible, onToggle }: any) {
  const ITEM_H = 50;
  const [activeName, setActiveName] = useState<string | null>(null);
  const itemDys = useRef(Object.fromEntries(ALL_PAGE_SECTIONS.map(n => [n, new Animated.Value(0)]))).current;
  const currentIdxRef = useRef<Record<string, number>>({});
  const sectionsRef = useRef(sections);
  const hoverRef = useRef<number | null>(null);
  sectionsRef.current = sections;
  sections.forEach((name: string, i: number) => { currentIdxRef.current[name] = i; });

  const resetAll = () => { ALL_PAGE_SECTIONS.forEach(n => itemDys[n].setValue(0)); hoverRef.current = null; };

  const pans = useMemo(() => Object.fromEntries(ALL_PAGE_SECTIONS.map(name => [name, PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => { hoverRef.current = currentIdxRef.current[name]; setActiveName(name); },
    // Animated.event links gesture.dy directly to itemDys[name] — moves immediately, no re-render needed
    onPanResponderMove: Animated.event([null, { dy: itemDys[name] }], {
      useNativeDriver: false,
      listener: ((_: any, g: any) => {
        const fromIdx = currentIdxRef.current[name];
        const secs = sectionsRef.current;
        const newHover = Math.max(0, Math.min(secs.length - 1, fromIdx + Math.round(g.dy / ITEM_H)));
        if (newHover !== hoverRef.current) {
          hoverRef.current = newHover;
          secs.forEach((sName: string, i: number) => {
            if (sName === name) return;
            let target = 0;
            if (fromIdx < newHover && i > fromIdx && i <= newHover) target = -ITEM_H;
            if (fromIdx > newHover && i < fromIdx && i >= newHover) target = ITEM_H;
            Animated.spring(itemDys[sName], { toValue: target, useNativeDriver: false, damping: 20, stiffness: 220 }).start();
          });
        }
      }) as any,
    }),
    onPanResponderRelease: (_, g) => {
      const secs = sectionsRef.current;
      const fromIdx = currentIdxRef.current[name];
      const to = Math.max(0, Math.min(secs.length - 1, fromIdx + Math.round(g.dy / ITEM_H)));
      resetAll(); setActiveName(null);
      if (to !== fromIdx) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const next = [...secs]; const [item] = next.splice(fromIdx, 1); next.splice(to, 0, item); setSections(next);
      }
    },
    onPanResponderTerminate: () => { resetAll(); setActiveName(null); },
  })])), []);

  return <View>
    {sections.map((name: string, i: number) => {
      const isActive = activeName === name;
      return <Animated.View key={name} style={[s.sectionOption, {
        transform: [{ translateY: itemDys[name] }],
        zIndex: isActive ? 10 : 1, opacity: isActive ? 0.88 : 1,
        backgroundColor: isActive ? 'rgba(255,255,255,.35)' : 'transparent',
        borderRadius: isActive ? 12 : 0,
      }]}>
        <Pressable onPress={() => onToggle(i)} style={s.sectionEye}>
          <Ionicons name={sectionVisible[name] !== false ? 'eye-outline' : 'eye-off-outline'} size={21} color={sectionVisible[name] !== false ? '#436172' : 'rgba(67,97,114,.28)'} />
        </Pressable>
        <Text style={s.sectionText}>{name}</Text>
        <Animated.View {...pans[name].panHandlers} style={s.sectionDragHandle}>
          <Ionicons name="reorder-three" size={24} color="#436172" />
        </Animated.View>
      </Animated.View>;
    })}
  </View>;
}

function DesignTools({ active, setActive, palette, setPalette, font, setFont, setEditing,
  homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections }: any) {
  const items = [{ id: 'colour', icon: 'color-palette-outline' }, { id: 'font', icon: 'text-outline' }, { id: 'edit', icon: 'create-outline' }];
  const [paletteSection, setPaletteSection] = useState(0);
  const [sectionVisible, setSectionVisible] = useState<Record<string, boolean>>({});
  const [editPage, setEditPage] = useState(0);
  const pageSections = [homeSections, servicesSections, contactSections];
  const setPageSections = [setHomeSections, setServicesSections, setContactSections];
  const curSections = pageSections[editPage];
  const setCurSections = setPageSections[editPage];
  const handleToggle = (idx: number) => {
    const name = curSections[idx]; setSectionVisible((v: any) => ({ ...v, [name]: v[name] === false ? true : false }));
  };
  return <View style={s.tools}>
    <View style={s.toolStack}>{items.map(item => {
      const open = active === item.id;
      return (
        <View key={item.id} style={s.toolSlot}><Pressable onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const next = active === item.id ? null : item.id;
          setActive(next);
          setEditing(next === 'edit');
        }} style={({ pressed }) => [s.toolButton, open && s.toolActive, pressed && s.pressed]}>
          <Ionicons name={item.icon as any} size={19} color={open ? '#fff' : '#2E6C87'} />
        </Pressable></View>
      );
    })}</View>
    {active && <BlurView intensity={58} tint="light" style={s.toolPanel}>
      <Text style={s.toolTitle}>{active === 'colour' ? 'Colour' : active === 'font' ? 'Font' : 'Edit site'}</Text>
      {active === 'colour' && <View style={s.paletteWrap}><Text style={s.paletteHeadingText}>{paletteGroups[paletteSection].name}</Text><ScrollView style={s.paletteScroll} onScroll={event => { const next = Math.min(paletteGroups.length - 1, Math.floor(event.nativeEvent.contentOffset.y / 286)); if (next !== paletteSection) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPaletteSection(next); } }} scrollEventThrottle={16}>{paletteGroups.map((group, groupIndex) => <View key={group.name} style={s.paletteGroup}>{group.options.map((colors, i) => { const paletteIndex = paletteGroups.slice(0, groupIndex).reduce((total, section) => total + section.options.length, 0) + i; return <Pressable key={colors.join()} onPress={() => setPalette(paletteIndex)} style={[s.option, palette === paletteIndex && s.selected]}>{colors.map(c => <View key={c} style={[s.dot, { backgroundColor: c }]} />)}</Pressable>; })}</View>)}</ScrollView></View>}
      {active === 'font' && fonts.map((name, i) => <Pressable key={name} onPress={() => setFont(i)} style={[s.fontOption, font === i && s.selected]}><Text style={s.fontOptionText}>{name}</Text></Pressable>)}
      {active === 'edit' && <>
        <View style={s.editPageTabs}>
          {['Home', 'Svcs', 'Contact'].map((name, i) => <Pressable key={name} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setEditPage(i); }} style={[s.editPageTab, editPage === i && s.editPageTabOn]}>
            <Text style={[s.editPageTabText, editPage === i && s.editPageTabTextOn]}>{name}</Text>
          </Pressable>)}
        </View>
        <SectionDragList sections={curSections} setSections={setCurSections} sectionVisible={sectionVisible} onToggle={handleToggle} />
      </>}
    </BlurView>}
  </View>;
}

function TextEditModal({ visible, value, label, onSave, onClose }: any) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value, visible]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={s.modalBox}>
          <Text style={s.modalLabel}>{label}</Text>
          <TextInput style={s.modalInput} value={draft} onChangeText={setDraft} multiline autoFocus placeholderTextColor="rgba(0,0,0,.35)" />
          <View style={s.modalButtons}>
            <Pressable onPress={onClose} style={[s.modalButton, s.modalButtonCancel]}><Text style={s.modalButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={() => { onSave(draft); onClose(); }} style={[s.modalButton, s.modalButtonSave]}><Text style={[s.modalButtonText, { color: '#fff' }]}>Save</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
}

function FlowBackdrop({ children }: any) {
  return <View style={{ flex: 1, backgroundColor: '#2563EB' }}>
    <LinearGradient colors={['#6FA8FF', '#3B82F6', '#1D4FD0']} locations={[0, .45, 1]} style={StyleSheet.absoluteFill} />
    {children}
  </View>;
}

const LOADING_MESSAGES = {
  template: ['Choosing a layout', 'Setting the tone', 'Matching your details', 'Almost ready'],
  designer: ['Saving your details', 'Preparing your dashboard', 'Getting things ready', 'Almost there'],
};

function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

function DashboardHome({ tab, setTab, data, domain, suffix, palette, font, services, hours, contactForm, homeSections, servicesSections, contactSections, onEdit, websiteStatus, onMakeLive, onTakeOffline }: any) {
  const siteUrl = data.website?.trim() || `https://${domain}${suffix}`;
  const [showLiveDropdown, setShowLiveDropdown] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handlePay = async () => {
    setPayBusy(true); setPayError('');
    try {
      const res = await fetch(PAYMENT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: annual ? 'annual' : 'monthly', domain: domain + suffix }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not set up payment.');
      const { error: initErr } = await initPaymentSheet({ merchantDisplayName: 'BrightSite', paymentIntentClientSecret: json.clientSecret, allowsDelayedPaymentMethods: false });
      if (initErr) throw new Error(initErr.message);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) { if (presentErr.code !== 'Canceled') setPayError(presentErr.message); return; }
      setShowPlanModal(false);
      onMakeLive?.();
    } catch (err: any) { setPayError(err.message || 'Payment failed. Please try again.'); }
    finally { setPayBusy(false); }
  };

  const isLive = websiteStatus === 'live';
  const isBuilding = websiteStatus === 'building';
  const isReady = websiteStatus === 'ready';

  return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.dashboardScreen}>
      <View style={s.dashboardBrandRow}>
        <Text style={s.dashboardBrand}>BRIGHTSITE</Text>
        {isLive && <Text style={s.dashboardLive}>● LIVE</Text>}
      </View>
      <View style={s.dashboardTabsTop}>{['Account', 'Website', 'Messages'].map(name => <Pressable key={name} onPress={() => setTab(name)} style={[s.dashboardTab, tab === name && s.dashboardTabOn]}><Text style={[s.dashboardTabText, tab === name && s.dashboardTabTextOn]}>{name}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={s.dashboardContent} showsVerticalScrollIndicator={false}>
        {tab === 'Account' && <>
          <Text style={s.dashboardTitle}>Your account</Text>
          <Text style={s.dashboardIntro}>Everything for {data.businessName || 'your business'} in one place.</Text>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>YOUR PLAN</Text><Text style={s.dashboardCardTitle}>{isLive ? (annual ? 'Annual Plan' : 'Monthly Plan') : 'Free Plan'}</Text><Text style={s.dashboardCardText}>{isLive ? (annual ? '£17/month · £204/year' : '£19/month') : 'Activate to go live'}</Text></View>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>YOUR DOMAIN</Text><Text style={s.dashboardCardTitle}>{domain}{suffix}</Text><Text style={s.dashboardCardText}>Connected to your website</Text></View>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>ACCOUNT EMAIL</Text><Text style={s.dashboardCardTitle}>{data.email || data.contactEmail || 'Add an email address'}</Text></View>
        </>}
        {tab === 'Website' && <>
          <View style={s.dashboardWebsiteHead}>
            <View>
              {isLive && <Text style={s.dashboardLive}>● LIVE</Text>}
              {isBuilding && <Text style={[s.dashboardLive, { color: '#F0A030' }]}>⏳ BUILDING</Text>}
              {isReady && <Text style={[s.dashboardLive, { color: '#4B9BFF' }]}>● READY TO PUBLISH</Text>}
              <Text style={s.dashboardTitle}>Your website</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {!isBuilding && <Pressable onPress={onEdit} style={s.dashboardEdit}><Ionicons name="create-outline" size={15} color="#fff" /><Text style={s.dashboardEditText}>Edit</Text></Pressable>}
              {isLive && <Pressable onPress={() => setShowLiveDropdown(!showLiveDropdown)} style={[s.dashboardEdit, { backgroundColor: '#3CAB6A' }]}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />
                <Text style={s.dashboardEditText}>Live</Text>
                <Ionicons name="chevron-down" size={12} color="#fff" />
              </Pressable>}
              {showLiveDropdown && <View style={s.liveDropdown}>
                <Pressable onPress={() => { setShowLiveDropdown(false); onTakeOffline?.(); }} style={s.liveDropdownItem}><Ionicons name="cloud-offline-outline" size={14} color="#C04040" /><Text style={s.liveDropdownText}>Take offline</Text></Pressable>
              </View>}
            </View>
          </View>
          <Text style={s.dashboardIntro}>{isBuilding ? 'Your designer preview is being built. This usually takes 1–2 days.' : 'Tap your homepage to open it, or edit its design.'}</Text>
          {isBuilding
            ? <View style={s.buildingCard}><ActivityIndicator size="large" color="#4B9BFF" style={{ marginBottom: 14 }} /><Text style={s.buildingText}>Building your preview…</Text><Text style={s.buildingSub}>Tom will send you a message when it’s ready to review.</Text></View>
            : <Pressable onPress={() => isLive ? void Linking.openURL(siteUrl) : undefined} style={s.phoneFrame}>
                <View pointerEvents="none" style={s.phoneScale}><SitePreview palette={palette} font={font} page={0} editing={false} businessName={data.businessName} category={data.category} servicesData={services} hoursData={hours} contactData={{ email: data.contactEmail, phone: data.phone, address: data.address, instagram: data.instagram, facebook: data.facebook, reviewSource: data.reviewSource, reviewLink: data.reviewLink }} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} /></View>
                {isLive && <View style={s.previewOpenBadge}><Ionicons name="open-outline" size={12} color="#fff" /><Text style={s.previewOpenText}>Open {domain}{suffix}</Text></View>}
              </Pressable>
          }
          {(isReady || isBuilding) && !isLive && <Pressable onPress={() => { if (isReady) setShowPlanModal(true); }} style={[s.makeLiveBtn, !isReady && s.makeLiveBtnDisabled]}>
            <Ionicons name="rocket-outline" size={18} color={isReady ? '#fff' : 'rgba(255,255,255,.4)'} />
            <Text style={[s.makeLiveBtnText, !isReady && { color: 'rgba(255,255,255,.4)' }]}>{isBuilding ? 'Make Live (pending review)' : 'Make Live'}</Text>
          </Pressable>}
          {isReady && !isLive && <Pressable onPress={() => setTab('Messages')} style={s.requestChangesBtn}>
            <Ionicons name="chatbubble-outline" size={15} color="#4B9BFF" />
            <Text style={s.requestChangesText}>Request Changes</Text>
          </Pressable>}
        </>}
        {tab === 'Messages' && <>
          <Text style={s.dashboardTitle}>Messages</Text>
          <View style={s.messageBubble}><Text style={s.messageSender}>Tom · BrightSite</Text><Text style={s.messageText}>Welcome to BrightSite, {data.businessName || 'there'}! I’m Tom. Your website is live, and you can message me here whenever you need a hand.</Text></View>
          <View style={s.messageInput}><Text style={s.messagePlaceholder}>Message BrightSite…</Text><Ionicons name="arrow-up-circle" size={24} color="#2878FF" /></View>
        </>}
      </ScrollView>
    </View>
    <Modal visible={showPlanModal} transparent animationType="slide" onRequestClose={() => setShowPlanModal(false)}>
      <View style={s.planModalOverlay}>
        <View style={s.planModalBox}>
          <View style={s.planModalHeader}><Text style={s.planModalTitle}>Choose your plan</Text><Pressable onPress={() => setShowPlanModal(false)} hitSlop={10}><Ionicons name="close" size={22} color="#1C2832" /></Pressable></View>
          <Text style={s.planModalSub}>Your website is free. You only pay for hosting.</Text>
          <View style={s.planModalDomain}><Ionicons name="globe-outline" size={14} color="#4B9BFF" /><Text style={s.planModalDomainText}>{domain}{suffix}</Text></View>
          <Pressable onPress={() => setAnnual(false)} style={[s.planModalOption, !annual && s.planModalOptionOn]}>
            <View><Text style={s.planModalOptionName}>Monthly</Text><Text style={s.planModalOptionNote}>Cancel any time</Text></View>
            <Text style={s.planModalOptionPrice}>£19<Text style={{ fontSize: 12 }}>/mo</Text></Text>
          </Pressable>
          <Pressable onPress={() => setAnnual(true)} style={[s.planModalOption, annual && s.planModalOptionOn]}>
            <View><View style={s.savePill}><Text style={s.savePillText}>SAVE £24</Text></View><Text style={s.planModalOptionName}>Annual</Text><Text style={s.planModalOptionNote}>Billed £204 yearly</Text></View>
            <Text style={s.planModalOptionPrice}>£17<Text style={{ fontSize: 12 }}>/mo</Text></Text>
          </Pressable>
          {!!payError && <Text style={{ fontFamily: FONT, fontSize: 12, color: '#C04040', marginTop: 8 }}>{payError}</Text>}
          <Pressable onPress={() => void handlePay()} disabled={payBusy} style={[s.planModalPayBtn, payBusy && { opacity: .6 }]}>
            {payBusy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="lock-closed" size={15} color="#fff" /><Text style={s.planModalPayBtnText}>Continue to secure payment</Text></>}
          </Pressable>
        </View>
      </View>
    </Modal>
  </FlowBackdrop>;
}

function DesignEditorFullscreen({ palette, setPalette, font, setFont, siteTexts, setSiteTexts, homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections, data, services, hours, contactForm, onBack, onConfirm }: any) {
  const [tool, setTool] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [editingText, setEditingText] = useState<{ key: string; label: string } | null>(null);
  return <View style={{ flex: 1, backgroundColor: '#070D12' }}>
    <StatusBar style="light" />
    <TextEditModal visible={!!editingText} value={editingText ? (siteTexts[editingText.key] ?? '') : ''} label={editingText?.label || ''} onSave={(v: string) => setSiteTexts((t: any) => ({ ...t, [editingText!.key]: v }))} onClose={() => setEditingText(null)} />
    <View style={s.fsBrowserBar}>
      <View style={s.fsSlot}><Pressable onPress={onBack} style={s.fsBackBtn}><Ionicons name="chevron-back" size={22} color="#2563EB" /></Pressable></View>
      <View style={s.fsBrowserRight}>
        <DesignTools active={tool} setActive={setTool} palette={palette} setPalette={setPalette} font={font} setFont={setFont} setEditing={setEditing} homeSections={homeSections} setHomeSections={setHomeSections} servicesSections={servicesSections} setServicesSections={setServicesSections} contactSections={contactSections} setContactSections={setContactSections} />
        <View style={s.fsSlot}><Pressable onPress={onConfirm} style={s.fsTickBtn}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </Pressable></View>
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <SitePreview palette={palette} font={font} page={previewPage} onPageChange={setPreviewPage} editing={editing} siteTexts={siteTexts} onEditText={(key: string) => { const labels: Record<string, string> = { headline: 'Hero headline', heroBody: 'Hero subtext', aboutTitle: 'About title', aboutBody: 'About description', brand: 'Brand name' }; setEditingText({ key, label: labels[key] || key }); }} businessName={data.businessName} category={data.category} servicesData={services} hoursData={hours} contactData={{ email: data.contactEmail, phone: data.phone, address: data.address, instagram: data.instagram, facebook: data.facebook, reviewSource: data.reviewSource, reviewLink: data.reviewLink }} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} />
    </ScrollView>
  </View>;
}

function AppInner() {
  const [index, setIndex] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSession, setAuthSession] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [complete, setComplete] = useState<Set<number>>(new Set());
  const [palette, setPalette] = useState(0);
  const [font, setFont] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [deckDirection, setDeckDirection] = useState<-1 | 0 | 1>(0);
  const [designReady, setDesignReady] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [media, setMedia] = useState<{ logo?: string; hero?: string; gallery: string[] }>({ gallery: [] });
  const [domain, setDomain] = useState('siskohair');
  const [suffix, setSuffix] = useState('.co.uk');
  const [showSuffixes, setShowSuffixes] = useState(false);
  const [domainReady, setDomainReady] = useState(false);
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainQuote, setDomainQuote] = useState<{ domain: string; priceLabel: string } | null>(null);
  const [domainError, setDomainError] = useState('');
  const [contactForm, setContactForm] = useState(true);
  const [tab, setTab] = useState('Website');
  const [siteTexts, setSiteTexts] = useState<Record<string, string>>({});
  const [homeSections, setHomeSections] = useState([...HOME_SECTIONS_DEFAULT]);
  const [servicesSections, setServicesSections] = useState([...SERVICES_SECTIONS_DEFAULT]);
  const [contactSections, setContactSections] = useState([...CONTACT_SECTIONS_DEFAULT]);
  const [appScreen, setAppScreen] = useState<'onboarding' | 'loading' | 'design-editor' | 'dashboard'>('onboarding');
  const [editFrom, setEditFrom] = useState<'onboarding' | 'dashboard'>('onboarding');
  const [buildChoice, setBuildChoice] = useState<'designer' | 'template' | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<'building' | 'ready' | 'live'>('building');
  const [data, setData] = useState({ email: '', password: '', businessName: 'Sisko Hairdressing', category: 'Hair & Beauty', fullName: '', contactEmail: '', phone: '', website: '', instagram: '', facebook: '', address: '', services: 'Cut & finish', price: '£45', reviews: '', reviewLink: '', reviewSource: null as null | 'Google' | 'Trustpilot' });
  const [showFullName, setShowFullName] = useState(false);
  const [openReview, setOpenReview] = useState<number | null>(null);
  const [hours, setHours] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ label, start: '9:00', end: i === 3 ? '19:00' : '17:30', enabled: i < 6 })));
  const [services, setServices] = useState([{ section: 'Cutting & styling', name: 'Cut & finish', duration: '45 mins', price: '£45' }]);
  const [reviewsList, setReviewsList] = useState<{ title: string; description: string; name: string }[]>([]);
  const motion = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingFades = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const designReveal = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const step = steps[index];

  const loadAccountDestination = async (session: any) => {
    const email = session?.user?.email || data.email.trim();
    setAuthSession(true);
    setData(current => ({ ...current, email, contactEmail: current.contactEmail || email }));
    const { data: rows, error } = await supabase
      .from('businesses')
      .select('id,data,user_id')
      .eq('user_id', session.user.id)
      .limit(10);
    if (error) throw error;
    const hasWebsite = !!rows?.some((row: any) => !(row.data && row.data.stub));
    if (hasWebsite) {
      Keyboard.dismiss();
      setWebsiteStatus('ready');
      setAppScreen('dashboard');
      return;
    }
    setIndex(1);
    motion.setValue(CARD_TRAVEL);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!mounted || !sessionData.session) return;
      try { await loadAccountDestination(sessionData.session); }
      catch { if (mounted) setAuthStatus('Please log in again to continue.'); }
    }).finally(() => { if (mounted) setAuthChecking(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);


  const minimumInfoComplete = (stepId = step.id) => {
    switch (stepId) {
      case 'login': return /\S+@\S+\.\S+/.test(data.email.trim()) && data.password.length >= 8;
      case 'business': return !!data.businessName.trim() && !!data.category.trim();
      case 'contact': return /\S+@\S+\.\S+/.test(data.contactEmail.trim()) || data.phone.replace(/\D/g, '').length >= 7;
      case 'hours': return hours.some(row => row.enabled && row.start.trim() && row.end.trim());
      case 'prices': return services.some(item => item.name.trim() && item.price.trim());
      case 'domain': return domainReady;
      case 'choice': return false;
      default: return true;
    }
  };
  const missingInfoText = () => ({
    login: 'Add a valid email and an 8 character password first',
    business: 'Add your business name and business type first',
    contact: 'Add an email address or phone number first',
    hours: 'Keep at least one day open and add its times',
    prices: 'Add at least one service and its price first',
    domain: 'Check and select an available domain first',
    choice: 'Choose an option above to continue',
  } as Record<string, string>)[step.id] || 'Complete the required details first';
  const transitionTo = (to: number) => {
    const next = Math.max(authSession ? 1 : 0, Math.min(steps.length - 1, to));
    if (next === index || transitioning.current) return;
    const forward = next > index;
    Keyboard.dismiss();
    setValidationMessage('');
    setDeckDirection(forward ? 1 : -1);
    transitioning.current = true;
    Animated.timing(motion, { toValue: next * CARD_TRAVEL, duration: 420, easing: Easing.bezier(.18, .78, .22, 1), useNativeDriver: true }).start(() => {
      if (forward) setComplete(old => new Set([...old, index]));
      setIndex(next);
      setDeckDirection(0);
      transitioning.current = false;
    });
  };
  const authenticate = async () => {
    if (authBusy || authChecking) return;
    if (!minimumInfoComplete('login')) {
      setValidationMessage(missingInfoText());
      return;
    }
    Keyboard.dismiss();
    setAuthBusy(true);
    setAuthStatus(authMode === 'signup' ? 'Creating your account…' : 'Logging you in…');
    const credentials = { email: data.email.trim().toLowerCase(), password: data.password };
    const result = authMode === 'signup'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    if (result.error) {
      const message = /invalid login credentials/i.test(result.error.message)
        ? 'That email or password isn’t right.'
        : /already registered|already exists/i.test(result.error.message)
          ? 'That email already has an account. Try logging in instead.'
          : result.error.message;
      setAuthStatus(message);
      setAuthBusy(false);
      return;
    }
    if (!result.data.session) {
      setAuthStatus('Account created — check your email to confirm it, then log in.');
      setAuthMode('login');
      setAuthBusy(false);
      return;
    }
    try {
      setAuthStatus('');
      await loadAccountDestination(result.data.session);
    } catch {
      setAuthStatus('You’re logged in, but we couldn’t load your account. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };
  const go = (to: number) => {
    const requested = Math.max(0, Math.min(steps.length - 1, to));
    const next = Math.max(index - 1, Math.min(index + 1, requested));
    if (next === index || transitioning.current) return;
    const forward = next > index;
    if (forward && step.id === 'login' && !authSession) { void authenticate(); return; }
    if (forward && !minimumInfoComplete()) {
      setValidationMessage(missingInfoText());
      Animated.sequence([
        Animated.timing(motion, { toValue: index * CARD_TRAVEL + 10, duration: 70, useNativeDriver: true }),
        Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 13, stiffness: 270, useNativeDriver: true }),
      ]).start();
      return;
    }
    transitionTo(next);
  };

  useEffect(() => {
    if (appScreen !== 'loading') return;
    loadingProgress.setValue(0);
    designReveal.setValue(0);
    loadingFades.forEach(value => value.setValue(0));
    const isTemplate = buildChoice === 'template';
    const timers = [520, 1100, 1720, 2350].map((delay, i) => setTimeout(() => {
      Animated.parallel([
        Animated.timing(loadingFades[i], { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(loadingProgress, { toValue: (i + 1) / 4, duration: 460, useNativeDriver: false }),
      ]).start();
    }, delay));
    const done = setTimeout(() => {
      setDesignReady(true);
      Animated.timing(designReveal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        if (isTemplate) {
          setAppScreen('design-editor');
        } else {
          setWebsiteStatus('building');
          setAppScreen('dashboard');
        }
      });
    }, 3250);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [appScreen, buildChoice]);

  useEffect(() => {
    if (validationMessage) setValidationMessage('');
  }, [data, hours, services, domainReady, designReady]);

  const pan = useMemo(() => PanResponder.create({
    // Only allow card swipes from the header strip or the bottom prompt zone,
    // so scrolling the site preview or form content never triggers a card transition.
    onMoveShouldSetPanResponder: (_, g) => {
      if (keyboardVisible) return false;
      const inHeader = g.y0 < CARD_TOP + 80;
      const inFooter = g.y0 > SCREEN_HEIGHT - CARD_BOTTOM - 70;
      return (inHeader || inFooter) && Math.abs(g.dy) > 12;
    },
    
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx)) {
        if (Math.abs(g.dy) > 12) setDeckDirection(g.dy < 0 ? 1 : -1);
        motion.setValue(index * CARD_TRAVEL - g.dy);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -48 || g.vy < -.55) go(index + 1); else if (g.dy > 48 || g.vy > .55) go(index - 1); else Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
    },
    onPanResponderTerminate: () => Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0)),
  }), [index, step.id, data, hours, services, domainReady, designReady, keyboardVisible]);

  const railPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, 
    onPanResponderMove: () => {},
    onPanResponderRelease: (_, g) => {
      if (g.dy < -42) go(index + 1);
      else if (g.dy > 42) go(index - 1);
    },
  }), [index, data, hours, services, domainReady, designReady]);

  const content = (contentStep = step) => {
    switch (contentStep.id) {
      case 'login': return <><Text style={s.heroTitle}>{authMode === 'signup' ? 'Your dream website in 10 minutes with FlowBuilder™' : 'Welcome back.'}</Text>
        <Intro>{authMode === 'signup' ? 'Create your BrightSite account to begin.' : 'Log in to continue managing your website.'}</Intro>
        <View style={s.authModes}><Pressable onPress={() => { setAuthMode('signup'); setAuthStatus(''); }} style={[s.authMode, authMode === 'signup' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'signup' && s.authModeTextOn]}>Sign up</Text></Pressable><Pressable onPress={() => { setAuthMode('login'); setAuthStatus(''); }} style={[s.authMode, authMode === 'login' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'login' && s.authModeTextOn]}>Log in</Text></Pressable></View>
        <Field label="Email" value={data.email} onChangeText={(v: string) => setData({ ...data, email: v })} placeholder="you@business.co.uk" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
        <Field label="Password" value={data.password} onChangeText={(v: string) => setData({ ...data, password: v })} placeholder="At least 8 characters" secureTextEntry textContentType={authMode === 'signup' ? 'newPassword' : 'password'} returnKeyType="done" onSubmitEditing={() => void authenticate()} />
        {!!authStatus && <Text style={s.authStatus}>{authStatus}</Text>}
        <Pressable disabled={authBusy || authChecking} onPress={() => void authenticate()} style={({ pressed }) => [s.authSubmit, pressed && s.pressed, (authBusy || authChecking) && s.authSubmitDisabled]}>{authBusy || authChecking ? <ActivityIndicator size="small" color="#24282B" /> : <Text style={s.authSubmitText}>{authMode === 'signup' ? 'Create account' : 'Log in'}</Text>}</Pressable></>;
      case 'business': return <><Intro>Tell us the essentials. Anything you leave blank simply won’t appear on your website.</Intro>
        <Field label="Full name (optional)" value={data.fullName} onChangeText={(v: string) => setData({ ...data, fullName: v })} placeholder="e.g. Jane Smith" />
        <Pressable onPress={() => setShowFullName(!showFullName)} style={s.nameDisplay} hitSlop={8}><View style={[s.checkbox, showFullName && s.checkboxOn]}>{showFullName && <Ionicons name="checkmark" size={13} color="#071923" />}</View><Text style={s.nameDisplayText}>Display full name on website</Text></Pressable>
        <Field label="Business name" value={data.businessName} onChangeText={(v: string) => setData({ ...data, businessName: v })} />
        <Field label="Business type" value={data.category} onChangeText={(v: string) => setData({ ...data, category: v })} />
        <Field label="Address" value={data.address} onChangeText={(v: string) => setData({ ...data, address: v })} placeholder="e.g. 12 High Street, London" /></>;
      case 'contact': return <><Intro>Add whichever ways customers should contact you.</Intro>
        <Field label="Email" value={data.contactEmail} onChangeText={(v: string) => setData({ ...data, contactEmail: v })} keyboardType="email-address" />
        <Field label="Phone (optional)" value={data.phone} onChangeText={(v: string) => setData({ ...data, phone: v })} keyboardType="phone-pad" />
        <Field label="Existing website (optional)" value={data.website} onChangeText={(v: string) => setData({ ...data, website: v })} placeholder="https://yoursite.com" />
        <Field label="Instagram (optional)" value={data.instagram} onChangeText={(v: string) => setData({ ...data, instagram: v })} placeholder="@yourbusiness" />
        <Field label="Facebook (optional)" value={data.facebook} onChangeText={(v: string) => setData({ ...data, facebook: v })} placeholder="facebook.com/yourbusiness" /></>;
      case 'hours': return <><View style={s.hoursIntro}><Intro>Switch off days you’re closed. Times can be changed later.</Intro></View><Hours rows={hours} setRows={setHours} /></>;
      case 'prices': return <><Intro>Add your sections and services. Anything left blank will stay off your website.</Intro><Services items={services} setItems={setServices} /></>;
      case 'media': return <><Intro>Add the images you want to use. Everything here is optional and can be changed later.</Intro>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { marginBottom: 7 }]}>Logo</Text>
            <Upload icon="image-outline" title="Logo" subtitle="Logo" value={media.logo} onChange={(logo: string) => setMedia(current => ({ ...current, logo }))} fill h={110} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { marginBottom: 7 }]}>Hero image</Text>
            <Upload icon="image-outline" title="Hero image" subtitle="Hero image" value={media.hero} onChange={(hero: string) => setMedia(current => ({ ...current, hero }))} fill h={110} />
          </View>
        </View>
        <Text style={s.fieldLabel}>Gallery</Text>
        <View style={s.galleryGrid}>
          {media.gallery.map((uri, i) => <View key={i} style={s.galleryItem}><Image source={{ uri }} style={s.galleryThumb} /></View>)}
          {media.gallery.length < 20 && <Pressable style={s.galleryAdd} onPress={async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) return;
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: .82 });
            if (!result.canceled) setMedia(current => ({ ...current, gallery: [...current.gallery, ...result.assets.map(a => a.uri)].slice(0, 20) }));
          }}><Ionicons name="add" size={26} color="#2563EB" /></Pressable>}
        </View></>;
      case 'reviews': return <><Intro>Add customer reviews for your website. Each one is optional.</Intro>
        {reviewsList.map((review, i) => {
          const open = openReview === i;
          const label = review.title.trim() || `Review ${i + 1}`;
          return <View key={i} style={[s.reviewCard, open && s.reviewCardOpen]}>
            <Pressable onPress={() => setOpenReview(open ? null : i)} style={s.reviewRow}>
              <Text style={s.reviewRowText} numberOfLines={1}>{label}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DARK} />
            </Pressable>
            {open && <View style={s.reviewFields}>
              <Field label="Review title (optional)" value={review.title} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, title: v } : r))} placeholder="e.g. Amazing service" />
              <Field label="Review (optional)" value={review.description} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, description: v } : r))} multiline />
              <Field label="Customer name (optional)" value={review.name} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, name: v } : r))} placeholder="e.g. Jane Smith" />
              <Pressable onPress={() => setOpenReview(null)} style={s.reviewDoneBtn}><Text style={s.reviewDoneText}>Done</Text></Pressable>
            </View>}
          </View>;
        })}
        <Pressable onPress={() => { setReviewsList([...reviewsList, { title: '', description: '', name: '' }]); setOpenReview(reviewsList.length); }} style={s.addReviewBtn}>
          <Ionicons name="add" size={16} color={DARK} /><Text style={s.addReviewText}>Add review</Text>
        </Pressable>
        <View style={s.reviewSourceCard}>
          <Text style={s.reviewSourceTitle}>Show reviews from</Text>
          <Text style={s.reviewSourceSub}>Connect an existing profile so visitors see your full rating.</Text>
          {(['Google', 'Trustpilot'] as const).map(source => <Pressable key={source} onPress={() => setData({ ...data, reviewSource: data.reviewSource === source ? null : source })} style={[s.reviewSourceRow, data.reviewSource === source && s.reviewSourceRowOn]}>
            <Ionicons name={source === 'Google' ? 'logo-google' : 'star-outline'} size={16} color={DARK} />
            <Text style={s.reviewSourceName}>{source === 'Google' ? 'Google Reviews' : 'Trustpilot'}</Text>
            <Text style={s.reviewSourceAction}>{data.reviewSource === source ? 'Cancel' : 'Connect'}</Text>
          </Pressable>)}
          {data.reviewSource && <Field label={`${data.reviewSource} profile link`} value={data.reviewLink} onChangeText={(v: string) => setData({ ...data, reviewLink: v })} placeholder={data.reviewSource === 'Google' ? 'Paste your Google Business link' : 'Paste your Trustpilot link'} />}
        </View>
        <Pressable onPress={() => setContactForm(!contactForm)} style={[s.formChoice, contactForm && s.formChoiceOn]}><View style={s.formChoiceIcon}><Ionicons name="mail-outline" size={22} color={contactForm ? '#fff' : DARK} /></View><View style={{ flex: 1 }}><Text style={s.formChoiceTitle}>Add a contact form</Text><Text style={s.formChoiceText}>Messages will arrive in your BrightSite dashboard.</Text></View><Switch value={contactForm} onValueChange={setContactForm} trackColor={{ false: '#B8C2C9', true: DARK }} thumbColor="#F7FCFF" /></Pressable></>;
      case 'choice': return <View style={s.choiceWrap}>
        <Text style={s.choiceHeading}>How would you like to build your website?</Text>
        <Text style={s.choiceSub}>Either way, you can always make changes later.</Text>
        <Pressable onPress={() => { setBuildChoice('template'); setAppScreen('loading'); }} style={s.choiceCard}>
          <View style={[s.choiceIcon, { backgroundColor: 'rgba(34,188,231,.14)' }]}><Ionicons name="layers-outline" size={26} color="#4BD4F8" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.choiceCardTitle}>Build with Template</Text>
            <Text style={s.choiceCardText}>Choose a design, pick your colours and font — goes live today.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(220,238,248,.4)" />
        </Pressable>
        <Pressable onPress={() => { setBuildChoice('designer'); setAppScreen('loading'); }} style={s.choiceCard}>
          <View style={[s.choiceIcon, { backgroundColor: 'rgba(120,190,120,.14)' }]}><Ionicons name="person-outline" size={26} color="#79D7A2" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.choiceCardTitle}>Send to Designer</Text>
            <Text style={s.choiceCardText}>Tom builds your website for you. Preview ready in 1–2 days.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(220,238,248,.4)" />
        </Pressable>
      </View>;
      case 'domain': {
        const clearDomainQuote = () => { setDomainReady(false); setDomainQuote(null); setDomainError(''); };
        const checkDomain = async () => {
          const name = domain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (!name) { setDomainError('Add a domain name first.'); return; }
          setDomainChecking(true); clearDomainQuote();
          try {
            const response = await fetch(`${DOMAIN_API}?domain=${encodeURIComponent(name + suffix)}`);
            const result = await response.json();
            if (!response.ok || !result.available || !result.priceLabel) throw new Error(result.error || 'That domain is not available.');
            setDomainQuote({ domain: result.domain, priceLabel: result.priceLabel });
            setDomainReady(true);
          } catch (error: any) { setDomainError(error.message || 'Couldn’t check that domain right now.'); }
          finally { setDomainChecking(false); }
        };
        return <><Intro>Find the right home for your website. The live registration price comes straight from the registry before payment.</Intro><View style={s.domainSearch}>
          <TextInput style={s.domainInput} value={domain} onChangeText={(value) => { setDomain(value); clearDomainQuote(); }} autoCapitalize="none" /><View style={{ position: 'relative' }}><Pressable onPress={() => setShowSuffixes(!showSuffixes)} style={s.suffixButton} hitSlop={6}><Text style={s.domainSuffix}>{suffix}</Text><Ionicons name={showSuffixes ? 'chevron-up' : 'chevron-down'} size={14} color="#1C2832" /></Pressable>
          {showSuffixes && <View style={s.suffixDropdown}>
            {DOMAIN_TLDS.map((item, i) => <Pressable key={item} onPress={() => { setSuffix(item); setShowSuffixes(false); clearDomainQuote(); }} style={[s.suffixDropdownItem, i < DOMAIN_TLDS.length - 1 && s.suffixDropdownDivider, suffix === item && s.suffixDropdownItemOn]}>
              <Text style={s.suffixDropdownText}>{item}</Text>
              {suffix === item && <Ionicons name="checkmark" size={14} color={DARK} />}
            </Pressable>)}
          </View>}</View></View>
          <Pressable disabled={domainChecking} onPress={checkDomain} style={[s.check, domainChecking && s.checkDisabled]}><Text style={s.checkText}>{domainChecking ? 'Checking live price…' : 'Check availability'}</Text></Pressable>
          {!!domainError && <Text style={s.domainError}>{domainError}</Text>}
          {domainReady && domainQuote && <Animated.View style={s.domainResult}><Ionicons name="checkmark-circle" size={24} color={DARK} /><View style={{ flex: 1 }}><Text style={s.domainName}>{domainQuote.domain}</Text><Text style={s.domainPrice}>Available — {domainQuote.priceLabel}</Text></View></Animated.View>}</>;
      }
    }
  };

  if (index === 0) return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.loginStage}>
      <View style={[s.card, s.loginCard]}>
        
        <View style={s.loginHeader}><Text style={s.cardTitle}>Welcome to BrightSite</Text><Image source={require('./assets/brightsite-icon.png')} style={s.loginAppIcon} /></View>
        <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          {content(steps[0])}
        </ScrollView>
      </View>
    </View>
  </FlowBackdrop>;

  if (appScreen === 'dashboard') return <FadeIn><DashboardHome tab={tab} setTab={setTab} data={data} domain={domain} suffix={suffix} palette={palette} font={font} services={services} hours={hours} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} websiteStatus={websiteStatus} onMakeLive={() => setWebsiteStatus('live')} onTakeOffline={() => setWebsiteStatus('ready')} onEdit={() => { setEditFrom('dashboard'); setAppScreen('design-editor'); }} /></FadeIn>;

  if (appScreen === 'design-editor') return <FadeIn><DesignEditorFullscreen palette={palette} setPalette={setPalette} font={font} setFont={setFont} siteTexts={siteTexts} setSiteTexts={setSiteTexts} homeSections={homeSections} setHomeSections={setHomeSections} servicesSections={servicesSections} setServicesSections={setServicesSections} contactSections={contactSections} setContactSections={setContactSections} data={data} services={services} hours={hours} contactForm={contactForm} onBack={() => {
    if (editFrom === 'dashboard') { setAppScreen('dashboard'); return; }
    setAppScreen('onboarding');
    setIndex(steps.findIndex(item => item.id === 'domain'));
    motion.setValue(steps.findIndex(item => item.id === 'domain') * CARD_TRAVEL);
  }} onConfirm={() => { setWebsiteStatus('ready'); setTab('Website'); setAppScreen('dashboard'); }} /></FadeIn>;

  if (appScreen === 'loading') {
    const messages = buildChoice === 'template' ? LOADING_MESSAGES.template : LOADING_MESSAGES.designer;
    return <FlowBackdrop>
      <StatusBar style="light" />
      <Animated.View style={[s.fullLoading, { opacity: designReveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Text style={s.fullLoadingBrand}>BRIGHTSITE</Text>
        <Text style={s.fullLoadingKicker}>GETTING YOUR WEBSITE STARTED</Text>
        <Text style={s.fullLoadingName}>{(data.businessName || 'YOUR BUSINESS').toUpperCase()}</Text>
        <View style={s.fullLoadingList}>{messages.map((message, i) => <Animated.View key={message} style={[s.fullLoadingRow, { opacity: loadingFades[i] }]}><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.fullLoadingLine}>{message}</Text></Animated.View>)}</View>
        <View style={s.fullLoadingTrack}><Animated.View style={[s.fullLoadingFill, { width: loadingProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></View>
      </Animated.View>
    </FlowBackdrop>;
  }

  return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={{ flex: 1 }}>
      <View style={s.stage}>
        {steps.filter((deckStep, deckIndex) => deckStep.id !== 'login' && Math.abs(deckIndex - index) <= 2).map((deckStep) => {
          const deckIndex = steps.findIndex(stepItem => stepItem.id === deckStep.id);
          const distance = deckIndex - index;
          const isActive = distance === 0;
          const isIncoming = distance === deckDirection;
          const cardPosition = Animated.subtract(deckIndex * CARD_TRAVEL, motion);
          // The card leaving the foreground takes a small lead. This clears its
          // edge before the next card reaches it, rather than blending through it.
          const travelPosition = isActive && deckDirection !== 0 ? Animated.multiply(cardPosition, 1.06) : cardPosition;
          const cardScale = cardPosition.interpolate({ inputRange: [-CARD_TRAVEL, 0, CARD_TRAVEL], outputRange: [.93, 1, .93], extrapolate: 'clamp' });
          return <Animated.View key={deckStep.id} pointerEvents={isActive ? 'auto' : 'none'} {...(isActive ? pan.panHandlers : {})} style={[s.card, s.deckCard, isActive ? s.deckCardActive : s.deckCardBehind, { zIndex: isIncoming ? 22 : isActive ? 21 : 20 - Math.abs(distance), transform: [{ translateY: travelPosition }, { scale: cardScale }] }]}>
            
            <View style={s.cardHeader}><Text style={s.cardTitle}>{deckStep.title}</Text>{deckIndex > 0 && <Text style={s.count}>{deckIndex}/{setupStepIndexes.length}</Text>}</View>
            <ScrollView style={s.cardScroll} contentContainerStyle={[s.content, deckStep.id === 'login' && s.loginContent, deckStep.id === 'hours' && s.hoursContent]}
              scrollEnabled={deckStep.id !== 'hours' || keyboardVisible}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
              {content(deckStep)}
            </ScrollView>
            <View pointerEvents="none" style={s.fixedPrompt}>
              {!!validationMessage && isActive && <Text style={s.validationText}>{validationMessage}</Text>}
              <View style={s.swipeRow}>{deckStep.id === 'login' && (authBusy || authChecking) ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={14} color="#000" />}<Text style={s.swipeHint}>{deckStep.id === 'login' ? authChecking ? 'Checking your account…' : authBusy ? authMode === 'signup' ? 'Creating your account…' : 'Logging you in…' : authMode === 'signup' ? 'Swipe up to create account' : 'Swipe up to log in' : deckStep.id === 'choice' ? 'Pick an option above' : 'Swipe up to save'}</Text></View>
            </View>
          </Animated.View>;
        })}
      </View>
      <View style={s.rail} {...railPan.panHandlers}>{setupStepIndexes.map((actual) => {
        const item = steps[actual], done = complete.has(actual);
        const dotScale = motion.interpolate({
          inputRange: [Math.max(0, actual - 1) * CARD_TRAVEL, actual * CARD_TRAVEL, (actual + 1) * CARD_TRAVEL],
          outputRange: [1, 1.75, 1],
          extrapolate: 'clamp',
        });
        return <View key={item.id} style={s.railButton}>
          <Animated.View style={[s.railDot, done && s.railDotOn, { transform: [{ scale: dotScale }] }]} />
          <Animated.View pointerEvents="none" style={[s.railActive, { opacity: dotScale.interpolate({ inputRange: [1, 1.75], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: dotScale.interpolate({ inputRange: [1, 1.75], outputRange: [0, 1], extrapolate: 'clamp' }) }] }]}><Ionicons name={item.icon} size={15} color="#fff" /></Animated.View>
        </View>;
      })}</View>
    </View>
  </FlowBackdrop>;
}

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_KEY}>
      <AppInner />
    </StripeProvider>
  );
}

const s = StyleSheet.create({
  backdropGlowTop: { position: 'absolute', width: '88%', height: '42%', top: '-9%', left: '-18%', borderRadius: 400, opacity: .86, overflow: 'hidden' }, backdropGlowBottom: { position: 'absolute', width: '94%', height: '46%', bottom: '-12%', right: '-24%', borderRadius: 440, opacity: .74, overflow: 'hidden' },
  stage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 72, paddingHorizontal: 0 },
  loginStage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 20, paddingHorizontal: 18 }, loginCard: { flex: 1 },
  loginHeader: { minHeight: 78, paddingLeft: 26, paddingRight: 18, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, loginAppIcon: { width: 48, height: 48, borderRadius: 15, shadowColor: '#1C69E8', shadowOpacity: .28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  previousPeek: { position: 'absolute', top: -34, left: 34, right: 34, height: 98, borderRadius: 30, backgroundColor: 'rgba(255,255,255,.05)', shadowColor: '#000', shadowOpacity: .16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  previousCard: { position: 'absolute', zIndex: 1, top: -(SCREEN_HEIGHT - 216), left: 34, right: 34, height: SCREEN_HEIGHT - 126, borderRadius: 26, backgroundColor: 'rgba(255,255,255,.06)', shadowColor: '#000', shadowOpacity: .34, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, overflow: 'hidden' },
  card: { flex: 1, zIndex: 2, borderRadius: 30, backgroundColor: CARD, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', shadowColor: '#000', shadowOpacity: .62, shadowRadius: 31, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  deckCard: { position: 'absolute', top: CARD_TOP, bottom: CARD_BOTTOM, left: 6, right: 6 },
  deckCardActive: { shadowColor: '#01070B', shadowOpacity: .7, shadowRadius: 38, shadowOffset: { width: 0, height: 22 }, elevation: 26 }, deckCardBehind: { shadowOpacity: .3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  cardHeader: { minHeight: 72, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, elevation: 100 }, designCardHeader: { minHeight: 64, paddingTop: 13, paddingBottom: 10, paddingRight: 14 },
  cardScroll: { flex: 1, zIndex: 1, elevation: 1, overflow: 'hidden' },
  cardTitle: { fontFamily: FONT, fontSize: 21, fontWeight: '700', letterSpacing: -.4, color: '#1C2832' }, count: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(28,40,50,.7)' },
  content: { padding: 24, paddingBottom: 76 }, loginContent: { flex: 1, paddingTop: 12, paddingBottom: 18 }, intro: { fontFamily: FONT, fontSize: 14, lineHeight: 21, color: 'rgba(28,40,50,.7)', marginBottom: 18 },
  fieldWrap: { marginBottom: 16 }, fieldLabel: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(28,40,50,.7)', marginBottom: 7 },
  uploadLabel: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(28,40,50,.7)', marginTop: 6, letterSpacing: 0.3 },
  uploadLabelSub: { fontFamily: FONT, fontSize: 11, color: 'rgba(28,40,50,.5)', marginTop: 1 },
  input: { minHeight: 50, borderRadius: 16, paddingHorizontal: 16, fontFamily: FONT, fontSize: 15, color: '#1C2832', backgroundColor: 'rgba(255,255,255,.42)', borderWidth: 1, borderColor: 'rgba(28,40,50,.16)', outlineWidth: 0 },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  nameDisplay: { marginTop: -3, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(28,40,50,.5)', backgroundColor: 'rgba(255,255,255,.55)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: BRAND, borderColor: BRAND },
  nameDisplayText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(28,40,50,.7)' },
  button: { minHeight: 52, paddingHorizontal: 20, borderRadius: 18, backgroundColor: '#E5F9FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: BRAND, shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  buttonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#061824' }, secondaryButton: { backgroundColor: 'rgba(255,255,255,.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, pressed: { transform: [{ scale: .96 }], opacity: .86 },
  logo: { width: 52, height: 52, borderRadius: 18, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: BRAND, shadowOpacity: .35, shadowRadius: 20 },
  logoText: { fontFamily: FONT, fontSize: 29, fontWeight: '900', color: '#fff' }, logoDot: { position: 'absolute', width: 7, height: 7, borderRadius: 5, backgroundColor: '#fff', top: 8, right: 10 },
  heroTitle: { fontFamily: FONT, fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -.9, color: '#1C2832', marginBottom: 8 },
  authModes: { height: 42, padding: 4, borderRadius: 15, flexDirection: 'row', backgroundColor: 'rgba(15,18,21,.28)', marginBottom: 14 }, authMode: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, authModeOn: { backgroundColor: 'rgba(255,255,255,.9)' }, authModeText: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: 'rgba(28,40,50,.7)' }, authModeTextOn: { color: '#25292C' }, authStatus: { marginTop: -3, fontFamily: FONT, fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#8A4A12', textAlign: 'center' },
  authSubmit: { height: 48, marginTop: 10, borderRadius: 16, backgroundColor: '#F6F2E9', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } }, authSubmitDisabled: { opacity: .62 }, authSubmitText: { fontFamily: FONT, fontSize: 14, fontWeight: '900', color: '#24282B' },
  rowsCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' }, hoursContent: { padding: 0 }, hoursIntro: { paddingHorizontal: 24, paddingTop: 24 }, hoursCard: { minHeight: SCREEN_HEIGHT * .57, overflow: 'hidden' },
  hoursRow: { flex: 1, minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.14)' }, hoursRowLast: { borderBottomWidth: 0 }, hoursDay: { width: 43, fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#1C2832' }, hoursTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, timeInput: { width: 63, height: 34, borderRadius: 10, paddingHorizontal: 8, backgroundColor: 'transparent', color: '#1C2832', fontFamily: FONT, fontSize: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', outlineWidth: 0 }, timeInputOff: { width: 63, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(28,40,50,.22)' }, timeOffText: { fontFamily: FONT, color: 'rgba(28,40,50,.5)', fontSize: 13 }, timeDash: { fontFamily: FONT, fontSize: 13, color: 'rgba(28,40,50,.7)' }, hoursSwitch: { width: 52, alignItems: 'flex-end' }, closedText: { flex: 1, fontFamily: FONT, fontSize: 12, color: 'rgba(28,40,50,.5)' },
  toggleLabel: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#ECF6FA' }, toggleValue: { fontFamily: FONT, fontSize: 12, color: 'rgba(28,40,50,.7)', marginTop: 2 },
  inline: { flexDirection: 'row', gap: 10 },
  upload: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 16, backgroundColor: '#EFE4DB', borderWidth: 1, borderColor: '#1C2832', overflow: 'hidden' },
  uploadPreview: { width: 52, height: 52, borderRadius: 15, marginBottom: 9 }, uploadPreviewFill: { width: '100%', height: '100%' },
  uploadIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,188,231,.12)', marginBottom: 10 },
  uploadTitle: { fontFamily: FONT, fontWeight: '800', fontSize: 14, color: '#1C2832' }, uploadSub: { fontFamily: FONT, fontSize: 11, color: 'rgba(28,40,50,.7)', marginTop: 3 },
  continue: { marginTop: 24, gap: 16 }, skip: { fontFamily: FONT, fontSize: 12, color: 'rgba(28,40,50,.7)', textAlign: 'center' }, loginSwipe: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, designSwipe: { paddingVertical: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, swipeHint: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#000', textAlign: 'center' },
  fixedPrompt: { position: 'absolute', left: 18, right: 18, bottom: 14, zIndex: 120, elevation: 120, alignItems: 'center', gap: 7 }, swipeRow: { minHeight: 31, paddingHorizontal: 13, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, }, validationText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: '#A3261F', textAlign: 'center', paddingHorizontal: 12 },
  serviceRow: { flexDirection: 'row', gap: 7, marginTop: 5, alignItems: 'center' }, serviceInput: { height: 48, borderRadius: 14, paddingHorizontal: 10, fontFamily: FONT, fontSize: 12, color: '#1C2832', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', outlineWidth: 0 }, serviceActions: { flexDirection: 'row', gap: 8 }, serviceDelete: { width: 28, height: 48, alignItems: 'center', justifyContent: 'center' }, sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,.14)', marginVertical: 16 }, addService: { marginTop: 13, height: 42, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(226,232,235,.42)', backgroundColor: 'rgba(255,255,255,.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addSectionBtn: { marginTop: 8, borderColor: 'rgba(226,232,235,.2)', backgroundColor: 'transparent' }, addServiceText: { fontFamily: FONT, fontWeight: '800', fontSize: 12, color: '#1C2832' },
  loading: { position: 'absolute', inset: 0, minHeight: SCREEN_HEIGHT * .65, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44 }, loadingWordmark: { flexDirection: 'row', position: 'relative', marginBottom: 26 }, loadingBrand: { fontFamily: FONT, letterSpacing: 1.6, fontWeight: '900', fontSize: 17, color: '#F7FCFF' }, loadingBrandDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#4B9BFF', right: 32, top: -1 },
  loadingTitle: { fontFamily: FONT, fontSize: 25, lineHeight: 31, fontWeight: '800', color: '#F5FBFE', textAlign: 'center' }, loadingText: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: 'rgba(221,237,246,.58)', textAlign: 'center', marginTop: 10 }, loadingSteps: { alignSelf: 'stretch', gap: 10, marginTop: 27 }, loadingStep: { flexDirection: 'row', alignItems: 'center', gap: 9, opacity: .36 }, loadingStepOn: { opacity: 1 }, loadingStepText: { fontFamily: FONT, fontSize: 12, color: 'rgba(222,238,247,.6)' }, loadingStepTextOn: { color: '#EAF9FE', fontWeight: '700' },
  track: { width: '100%', height: 5, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.1)', marginTop: 28, overflow: 'hidden' }, fill: { height: 5, backgroundColor: BRAND, borderRadius: 5 },
  design: { minHeight: SCREEN_HEIGHT * .76, position: 'relative' }, designPreview: {}, site: { overflow: 'hidden' },
  previewBrowserWrap: { backgroundColor: 'rgba(8,15,20,.9)' },
  previewBrowser: { height: 29, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  previewDots: { position: 'absolute', left: 11, flexDirection: 'row', gap: 4 }, previewDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.35)' }, previewAddress: { fontFamily: FONT, fontSize: 8, color: 'rgba(255,255,255,.54)' },
  previewPageNav: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  previewPageTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  previewPageTabText: { fontFamily: FONT, fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,.45)', letterSpacing: .5 },
  siteHero: { height: SCREEN_HEIGHT * .36, padding: 18, justifyContent: 'space-between' },
  siteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, siteKicker: { fontFamily: FONT, fontSize: 11, letterSpacing: 2, fontWeight: '700', color: '#fff' }, siteNav: { flexDirection: 'row', alignItems: 'center', gap: 10 }, siteNavText: { fontFamily: FONT, fontSize: 7, letterSpacing: .7, color: 'rgba(255,255,255,.78)' }, siteCopy: { maxWidth: '76%' },
  siteHeadline: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 24, lineHeight: 28, color: '#fff', marginBottom: 7 }, rounded: { fontFamily: FONT, fontWeight: '800', letterSpacing: -1 }, modern: { fontFamily: FONT, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 20 },
  siteBody: { fontFamily: FONT, fontSize: 10, lineHeight: 15, color: 'rgba(255,255,255,.76)' }, editing: { borderWidth: 1, borderColor: BRAND, borderRadius: 4, padding: 2 },
  siteCta: { marginTop: 10, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1 }, siteCtaText: { fontFamily: FONT, fontSize: 7, fontWeight: '800', letterSpacing: 1.4, color: '#fff' },
  siteCtaFilled: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center', alignSelf: 'flex-start' }, siteCtaFilledText: { fontFamily: FONT, fontSize: 8, fontWeight: '800', color: '#fff' },
  siteSection: { padding: 16 }, siteSectionTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 16, marginBottom: 5 }, siteSectionBody: { fontFamily: FONT, fontSize: 9, lineHeight: 14, opacity: .68 },
  siteAboutServRow: { flexDirection: 'row', padding: 14, paddingTop: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,.08)' },
  siteAboutCol: { flex: 1.2 }, siteSvcsCol: { flex: 1, gap: 6 },
  siteServiceCard: { padding: 9, borderRadius: 9, borderWidth: 1 },
  siteServiceName: { fontFamily: FONT, fontSize: 7, fontWeight: '800', letterSpacing: .3 },
  siteServiceLink: { fontFamily: FONT, fontSize: 6, marginTop: 4, opacity: .6 },
  siteReviewsSection: { padding: 16 },
  siteTrustBadge: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, alignItems: 'flex-start' },
  siteTrustTitle: { fontSize: 11, fontWeight: '700' },
  siteTrustLink: { fontSize: 10, fontWeight: '600', marginTop: 6 },
  siteReviewsSectionTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 14, marginBottom: 7 },
  siteStars: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  siteReviewText: { fontFamily: FONT, fontSize: 9, lineHeight: 13, fontStyle: 'italic', marginBottom: 4 },
  siteReviewAuthor: { fontFamily: FONT, fontSize: 7, opacity: .6 },
  siteGallerySection: { padding: 14 },
  siteContactCta: { padding: 16, borderTopWidth: 1, alignItems: 'center', gap: 10 },
  siteContactCtaTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 16 },
  siteSvcsListSection: { padding: 14 },
  siteSvcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  siteSvcRowName: { fontFamily: FONT, fontSize: 9, fontWeight: '700' },
  siteSvcRowDetail: { fontFamily: FONT, fontSize: 7, opacity: .55, marginTop: 2 },
  siteSvcRowPrice: { fontFamily: FONT, fontSize: 9, fontWeight: '800' },
  siteContactInfoRow: { flexDirection: 'row', padding: 14, gap: 10 },
  siteContactInfoCol: { flex: 1 }, siteHoursCol: { flex: 1 },
  siteContactInfoTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 13, marginBottom: 7 },
  siteContactItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  siteContactItemText: { fontFamily: FONT, fontSize: 7, lineHeight: 11, flex: 1 },
  siteHoursRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  siteHoursDay: { fontFamily: FONT, fontSize: 7, fontWeight: '700', width: 24 },
  siteHoursTime: { fontFamily: FONT, fontSize: 7, opacity: .7 },
  siteMockMap: { margin: 14, marginTop: 0, borderRadius: 10, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  siteMockMapAddr: { fontFamily: FONT, fontSize: 8, fontWeight: '700' },
  siteMockMapSub: { fontFamily: FONT, fontSize: 7, opacity: .5, marginTop: 2 },
  siteFormSection: { padding: 14 },
  siteFormField: { borderWidth: 1, borderRadius: 7, padding: 8, marginBottom: 6, minHeight: 26 },
  siteFormPh: { fontFamily: FONT, fontSize: 7, opacity: .45 },
  editPageTabs: { flexDirection: 'row', marginBottom: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(66,104,125,.18)' },
  editPageTab: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  editPageTabOn: { backgroundColor: 'rgba(34,188,231,.18)' },
  editPageTabText: { fontFamily: FONT, fontSize: 9, fontWeight: '700', color: '#345568' },
  editPageTabTextOn: { color: '#2878A0' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end', cursor: 'default' as any },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 42 : 24 },
  modalLabel: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(0,0,0,.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  modalInput: { borderWidth: 1, borderColor: 'rgba(0,0,0,.14)', borderRadius: 12, padding: 14, fontFamily: FONT, fontSize: 15, color: '#1A1A1A', minHeight: 80, textAlignVertical: 'top', marginBottom: 16, outlineWidth: 0 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonCancel: { backgroundColor: 'rgba(0,0,0,.06)' },
  modalButtonSave: { backgroundColor: '#1C2832' },
  modalButtonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' }, tutorial: { position: 'absolute', left: 24, right: 24, top: '33%', borderRadius: 27, overflow: 'hidden', padding: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.4)' },
  tutorialTitle: { fontFamily: FONT, fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 8 }, tutorialBody: { fontFamily: FONT, fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,.65)', textAlign: 'center', marginTop: 5 },
  gotIt: { marginTop: 16, minWidth: 118, paddingVertical: 10, borderRadius: 99, backgroundColor: 'rgba(222,247,255,.88)', alignItems: 'center' }, gotItText: { fontFamily: FONT, fontWeight: '800', color: '#123042' },
  templateDots: { position: 'absolute', bottom: 13, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 }, templateDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.35)' }, templateDotOn: { width: 21, backgroundColor: '#fff' },
  tools: { position: 'relative', zIndex: 30, width: FS_SLOT * 3, alignItems: 'center' }, toolStack: { alignSelf: 'stretch', alignItems: 'center', flexDirection: 'row' }, toolSlot: { width: FS_SLOT, alignItems: 'center' },
  toolButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', shadowColor: '#207EA0', shadowOpacity: .18, shadowRadius: 12 }, toolActive: { backgroundColor: BRAND, shadowOpacity: .34, shadowRadius: 20 }, toolButtonText: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: '#fff' },
  toolPanel: { position: 'absolute', top: 49, right: 0, width: 186, maxHeight: 400, padding: 12, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: '#fff', shadowColor: '#174E66', shadowOpacity: .18, shadowRadius: 18, zIndex: 200, elevation: 200 }, paletteWrap: { gap: 5 }, paletteScroll: { maxHeight: 274 }, paletteGroup: { paddingBottom: 12 }, paletteHeading: { paddingTop: 5, paddingBottom: 4 }, paletteHeadingText: { fontFamily: FONT, fontSize: 10, fontWeight: '900', letterSpacing: .8, color: '#345568', textTransform: 'uppercase' },
  toolTitle: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#28495B', textAlign: 'center', marginBottom: 9 }, option: { minHeight: 44, borderRadius: 16, paddingHorizontal: 9, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' },
  dot: { width: 20, height: 20, borderRadius: 10 }, selected: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.12)' }, fontOption: { paddingVertical: 10, borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' }, fontOptionText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', textAlign: 'center', color: '#345568' },
  sectionOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(66,104,125,.18)' }, sectionText: { flex: 1, fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#345568', marginHorizontal: 8 },
  sectionEye: { padding: 7 }, sectionDragHandle: { padding: 7 },
  domainSearch: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(28,40,50,.22)' }, domainInput: { flex: 1, minHeight: 54, paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: '#1C2832', outlineWidth: 0 }, suffixButton: { height: 54, paddingLeft: 8, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 3 }, domainSuffix: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#1C2832' }, suffixDropdown: { position: 'absolute', top: 58, right: 0, zIndex: 99, minWidth: 120, backgroundColor: '#1A2128', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', shadowColor: '#000', shadowOpacity: .4, shadowRadius: 12, elevation: 10, overflow: 'hidden' }, suffixDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16 }, suffixDropdownDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' }, suffixDropdownItemOn: { backgroundColor: 'rgba(75,155,255,.12)' }, suffixDropdownText: { fontFamily: FONT, fontSize: 15, fontWeight: '600', color: '#E5EBEE' },
  check: { marginTop: 12, paddingVertical: 15, borderRadius: 17, alignItems: 'center', backgroundColor: 'rgba(34,188,231,.15)', borderWidth: 1, borderColor: 'rgba(34,188,231,.35)' }, checkText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#DDF8FF' },
  checkDisabled: { opacity: .58 }, domainError: { marginTop: 10, fontFamily: FONT, fontSize: 12, lineHeight: 17, color: '#A3261F' }, domainResult: { marginTop: 14, padding: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(34,188,231,.09)', borderWidth: 1, borderColor: 'rgba(34,188,231,.3)' }, domainName: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#1C2832' }, domainPrice: { fontFamily: FONT, fontSize: 11, color: '#76D8F2', marginTop: 2 },
  formChoice: { padding: 17, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, formChoiceOn: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.1)' }, formChoiceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,188,231,.14)' }, formChoiceTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' }, formChoiceText: { fontFamily: FONT, fontSize: 11, color: 'rgba(28,40,50,.7)', marginTop: 3, lineHeight: 16 }, formNote: { fontFamily: FONT, fontSize: 12, color: 'rgba(28,40,50,.7)', textAlign: 'center', marginTop: 18 },
  planHeading: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#EAF8FD', marginTop: 25, marginBottom: 10 }, plan: { minHeight: 118, padding: 18, borderRadius: 23, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.11)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, planOn: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.1)' },
  planName: { fontFamily: FONT, fontSize: 18, fontWeight: '800', color: '#1C2832' }, planNote: { fontFamily: FONT, fontSize: 11, color: 'rgba(28,40,50,.7)', marginTop: 4 }, planPrice: { fontFamily: FONT, fontSize: 25, fontWeight: '900', color: '#1C2832' }, planSmall: { fontSize: 10 }, save: { fontFamily: FONT, fontSize: 8, fontWeight: '900', color: '#07202B', backgroundColor: BRAND, padding: 5, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
  secure: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 18 }, secureText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#DDF7FF' },
  summary: { padding: 17, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', marginBottom: 20 }, summaryLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }, summaryLabel: { fontFamily: FONT, fontSize: 12, color: 'rgba(28,40,50,.7)' }, summaryValue: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: '#1C2832' },
  total: { marginTop: 7, paddingTop: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.16)' }, totalLabel: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#fff' }, totalValue: { fontFamily: FONT, fontSize: 18, fontWeight: '900', color: BRAND },
  dashHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }, live: { fontFamily: FONT, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: BRAND, marginBottom: 7 }, dashTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#F2FAFD' }, editPill: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.08)' }, editPillText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#DFF8FF' },
  browser: { height: 390, borderRadius: 23, overflow: 'hidden', backgroundColor: '#0D1721' }, browserBar: { height: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1C2A37' }, browserDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.32)' }, dashImage: { width: '100%', height: '100%' },
  publishOverlay: { position: 'absolute', left: 0, right: 0, top: 32, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,14,20,.62)' }, spinner: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,.18)', borderTopColor: BRAND, marginBottom: 13 }, publishText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#1C2832' },
  tabs: { marginTop: 18, padding: 5, borderRadius: 18, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.06)' }, tab: { flex: 1, paddingVertical: 11, borderRadius: 14, alignItems: 'center' }, tabOn: { backgroundColor: 'rgba(34,188,231,.18)' }, tabText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(222,238,247,.5)' }, tabTextOn: { color: '#DFF9FF' },
  nextPeek: { position: 'absolute', zIndex: 1, bottom: -(SCREEN_HEIGHT - 126) + 90, left: 34, right: 34, height: SCREEN_HEIGHT - 126, borderRadius: 26, backgroundColor: 'rgba(8,18,28,.54)', shadowColor: '#020A10', shadowOpacity: .34, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, overflow: 'hidden' },
  nextPeekTap: { paddingHorizontal: 22, paddingTop: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nextLabel: { fontFamily: FONT, fontSize: 8, fontWeight: '900', color: BRAND, marginTop: 5 }, nextTitle: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#EFF9FC' },
  rail: { position: 'absolute', left: 12, top: '25%', bottom: '25%', justifyContent: 'space-between', alignItems: 'center', zIndex: 140, elevation: 140 }, railHidden: { opacity: 0 }, railButton: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, railNear: { width: 18, height: 18, borderRadius: 9 }, railFar: { width: 18, height: 18, borderRadius: 9 }, railDone: {}, railActive: { position: 'absolute', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4B9BFF', borderWidth: 0, shadowColor: '#4B9BFF', shadowOpacity: .45, shadowRadius: 8, elevation: 8 }, railDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A1E22', borderWidth: 1, borderColor: 'rgba(0,0,0,.32)', shadowColor: '#000', shadowOpacity: .2, shadowRadius: 2 }, railDotOn: { backgroundColor: '#4B9BFF', borderColor: '#A9C8FF', shadowColor: '#4B9BFF', shadowOpacity: .45, shadowRadius: 5 },
  reviewCard: { marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(28,40,50,.18)', backgroundColor: 'rgba(255,255,255,.45)', overflow: 'hidden' },
  reviewCardOpen: { borderColor: 'rgba(75,212,248,.45)' },
  reviewRow: { minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reviewRowText: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '600', color: '#1C2832' },
  reviewFields: { paddingHorizontal: 14, paddingBottom: 14 },
  reviewDoneBtn: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(75,212,248,.18)' },
  reviewDoneText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: '#4BD4F8' },
  reviewSourceCard: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(28,40,50,.18)', backgroundColor: 'rgba(255,255,255,.45)' },
  reviewSourceTitle: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#1C2832' },
  reviewSourceSub: { fontFamily: FONT, fontSize: 12, lineHeight: 17, color: 'rgba(28,40,50,.7)', marginTop: 3, marginBottom: 10 },
  reviewSourceRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(28,40,50,.2)', marginBottom: 8 },
  reviewSourceRowOn: { borderColor: 'rgba(75,212,248,.45)' },
  reviewSourceName: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '600', color: '#1C2832' },
  reviewSourceAction: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#1C6FD0' },
  addReviewBtn: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(28,40,50,.3)', backgroundColor: 'rgba(255,255,255,.45)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 },
  addReviewText: { fontFamily: FONT, fontWeight: '800', fontSize: 12, color: '#1C2832' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  galleryItem: { width: (SCREEN_WIDTH - 96) / 2, height: (SCREEN_WIDTH - 96) / 2, borderRadius: 14, overflow: 'hidden' },
  galleryThumb: { width: '100%', height: '100%' },
  galleryAdd: { width: (SCREEN_WIDTH - 96) / 2, height: (SCREEN_WIDTH - 96) / 2, borderRadius: 14, borderWidth: 1, borderColor: '#1C2832', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE4DB'},
  planDomain: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14, borderRadius: 14, backgroundColor: 'rgba(34,188,231,.1)', borderWidth: 1, borderColor: 'rgba(34,188,231,.28)', marginBottom: 16 },
  planDomainText: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#DDF8FF' },
  paymentSuccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  paymentSuccessTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#1C2832', textAlign: 'center' },
  paymentSuccessText: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: 'rgba(28,40,50,.7)', textAlign: 'center' },
  payButton: { marginTop: 20, height: 52, paddingHorizontal: 20, borderRadius: 18, backgroundColor: '#E5F9FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payButtonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#061824' },
  dashboardScreen: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28 },
  dashboardBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 12 },
  dashboardBrand: { fontFamily: FONT, fontSize: 11, fontWeight: '900', letterSpacing: 1.6, color: '#1C2832' },
  dashboardLive: { fontFamily: FONT, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#3CAB6A' },
  dashboardTabsTop: { flexDirection: 'row', paddingHorizontal: 18, gap: 6, marginBottom: 20 },
  dashboardTab: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(0,0,0,.06)' },
  dashboardTabOn: { backgroundColor: '#1C2832' },
  dashboardTabText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(28,40,50,.48)' },
  dashboardTabTextOn: { color: '#fff' },
  dashboardContent: { paddingHorizontal: 22, paddingBottom: 48 },
  dashboardTitle: { fontFamily: FONT, fontSize: 24, fontWeight: '800', letterSpacing: -.5, color: '#141A1E', marginBottom: 6 },
  dashboardIntro: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: 'rgba(20,26,30,.55)', marginBottom: 18 },
  dashboardInfoCard: { padding: 18, borderRadius: 18, backgroundColor: '#fff', marginBottom: 12, shadowColor: '#000', shadowOpacity: .07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  dashboardCardLabel: { fontFamily: FONT, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: 'rgba(20,26,30,.42)', marginBottom: 5 },
  dashboardCardTitle: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#141A1E' },
  dashboardCardText: { fontFamily: FONT, fontSize: 12, color: 'rgba(20,26,30,.48)', marginTop: 3 },
  dashboardWebsiteHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  dashboardEdit: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1C2832' },
  dashboardEditText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#fff' },
  phoneFrame: { height: 420, borderRadius: 20, overflow: 'hidden', marginBottom: 16, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  phoneScale: {},
  messageBubble: { padding: 16, borderRadius: 18, backgroundColor: '#fff', marginBottom: 12, shadowColor: '#000', shadowOpacity: .06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  messageSender: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#1C2832', marginBottom: 6 },
  messageText: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: '#2C3E4A' },
  messageInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,.1)', marginTop: 8 },
  messagePlaceholder: { fontFamily: FONT, fontSize: 14, color: 'rgba(28,40,50,.38)' },

  choiceWrap: { gap: 0, paddingTop: 4 },
  choiceHeading: { fontFamily: FONT, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -.6, color: '#1C2832', marginBottom: 8 },
  choiceSub: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: 'rgba(28,40,50,.7)', marginBottom: 18 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)', marginBottom: 12 },
  choiceIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  choiceCardTitle: { fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#1C2832' },
  choiceCardText: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: 'rgba(28,40,50,.7)', marginTop: 3 },
  buildingCard: { alignItems: 'center', padding: 28, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', marginTop: 6 },
  buildingText: { fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#1C2832' },
  buildingSub: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: 'rgba(28,40,50,.7)', textAlign: 'center', marginTop: 6 },
  makeLiveBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 18, backgroundColor: '#2878FF', marginTop: 16 },
  makeLiveBtnDisabled: { backgroundColor: 'rgba(255,255,255,.06)' },
  makeLiveBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#fff' },
  requestChangesBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(75,155,255,.4)', marginTop: 10 },
  requestChangesText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#4B9BFF' },
  liveDropdown: { position: 'absolute', top: 40, right: 0, minWidth: 150, backgroundColor: '#fff', borderRadius: 14, padding: 6, zIndex: 50, elevation: 10, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  liveDropdownItem: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10 },
  liveDropdownText: { fontFamily: FONT, fontSize: 14, fontWeight: '600', color: '#C04040' },
  previewOpenBadge: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  previewOpenText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#fff' },
  planModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,10,16,.6)' },
  planModalBox: { backgroundColor: '#F7FBFE', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 },
  planModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planModalTitle: { fontFamily: FONT, fontSize: 20, fontWeight: '800', color: '#1C2832' },
  planModalSub: { fontFamily: FONT, fontSize: 13, color: '#5B6B78', marginBottom: 12 },
  planModalDomain: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(75,155,255,.12)', marginBottom: 14 },
  planModalDomainText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: '#2878FF' },
  planModalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: '#D5E0EA', backgroundColor: '#fff', marginBottom: 10 },
  planModalOptionOn: { borderColor: '#2878FF', backgroundColor: '#F0F6FF' },
  planModalOptionName: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: '#1C2832' },
  planModalOptionNote: { fontFamily: FONT, fontSize: 12, color: '#5B6B78', marginTop: 2 },
  planModalOptionPrice: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#1C2832' },
  savePill: { alignSelf: 'flex-start', backgroundColor: '#3CAB6A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, marginBottom: 4 },
  savePillText: { fontFamily: FONT, fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: .4 },
  planModalPayBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 18, backgroundColor: '#2878FF', marginTop: 14 },
  planModalPayBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#fff' },
  fullLoading: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  fullLoadingBrand: { fontFamily: FONT, fontSize: 34, fontWeight: '900', letterSpacing: 1, color: '#fff', textAlign: 'center', marginBottom: 36 },
  fullLoadingKicker: { fontFamily: FONT, fontSize: 11, fontWeight: '700', letterSpacing: 3, color: 'rgba(255,255,255,.75)', textAlign: 'center' },
  fullLoadingName: { fontFamily: FONT, fontSize: 30, lineHeight: 36, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 18 },
  fullLoadingTitle: { fontFamily: FONT, fontSize: 26, fontWeight: '800', letterSpacing: -.6, color: '#F3F8FC' },
  fullLoadingList: { gap: 12 },
  fullLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  fullLoadingLine: { flex: 1, fontFamily: FONT, fontSize: 15, fontWeight: '600', color: '#fff' },
  fullLoadingTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', overflow: 'hidden', marginTop: 10 },
  fullLoadingFill: { height: '100%', borderRadius: 2, backgroundColor: '#fff' },
  fsBrowserBar: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 30, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#0E1A24', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  fsBackBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  fsTickBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  fsBrowserUrl: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.07)' },
  fsBrowserUrlText: { flexShrink: 1, fontFamily: FONT, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,.82)' },
  fsBrowserRight: { width: FS_SLOT * 4, flexDirection: 'row', alignItems: 'center' }, fsSlot: { width: FS_SLOT, alignItems: 'center' },
});
