import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Dimensions, Easing, Image, ImageBackground, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder,
  Linking, Platform, Pressable, ScrollView, SectionList, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { supabase } from './lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// The dashboard chrome occupies roughly 258pt. Keep the website preview inset
// evenly on all sides, then let it use the rest of the available viewport.
const DASHBOARD_PREVIEW_INSET = 20;
const PHONE_FRAME_ASPECT_RATIO = 9 / 16;
const DASHBOARD_PREVIEW_MAX_HEIGHT = SCREEN_HEIGHT - 258 - DASHBOARD_PREVIEW_INSET * 2;
const DASHBOARD_PREVIEW_MAX_WIDTH = SCREEN_WIDTH - DASHBOARD_PREVIEW_INSET * 2;
const DASHBOARD_PREVIEW_HEIGHT = Math.min(DASHBOARD_PREVIEW_MAX_HEIGHT, DASHBOARD_PREVIEW_MAX_WIDTH / PHONE_FRAME_ASPECT_RATIO);
const DASHBOARD_PREVIEW_WIDTH = DASHBOARD_PREVIEW_HEIGHT * PHONE_FRAME_ASPECT_RATIO;
const CARD_TOP = Platform.OS === 'ios' ? 54 : 28;
const CARD_BOTTOM = 72;
const CARD_TRAVEL = SCREEN_HEIGHT - 190;
const FONT = Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' });
const C = {
  primary: '#3B82F6', primaryPressed: '#2563EB', primarySoft: 'rgba(59,130,246,.10)', primaryBorder: 'rgba(59,130,246,.38)',
  ink: '#1C2832', inkSoft: 'rgba(28,40,50,.72)', inkMuted: 'rgba(28,40,50,.52)', placeholder: 'rgba(28,40,50,.38)',
  line: 'rgba(28,40,50,.14)', lineStrong: 'rgba(28,40,50,.24)', field: 'rgba(255,255,255,.6)',
  canvas: '#F4EDE6', surface: '#FFFFFF', card: '#EFE4DB',
  success: '#1F8A54', successSoft: 'rgba(31,138,84,.12)', warning: '#B26A00', warningSoft: 'rgba(178,106,0,.12)', danger: '#B42318', dangerSoft: 'rgba(180,35,24,.10)',
};
const BRAND = C.primary;
const DOMAIN_TLDS = ['.com', '.co.uk', '.net', '.org', '.io', '.co', '.uk', '.app'];
const DOMAIN_API = 'https://api.brightsite.app/api/check-domain';
const PAYMENT_SHEET_API = 'https://api.brightsite.app/api/create-payment-sheet';
const CONFIRM_PAYMENT_API = 'https://api.brightsite.app/api/confirm-app-payment';
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51UFf7iGqCP7G2YApFHjoKMHkxsEIrf0SJiBpxeTR2MRZ4zs26OQ5jjBClWu8OvZXGXAZvMectFW0zLEuGFFKC7CA008zYaYMzc';
// Same Supabase project, R2 bucket and Cloudflare worker the account
// dashboard (account/dashboard.html) uses — so a business created or edited
// in the app is the exact same row the website's dashboard reads and writes,
// not a separate system. Checked that file's own fetch calls to get these
// constants and request shapes right rather than inventing a parallel one.
const SUPABASE_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';
const UPLOAD_WORKER = 'https://brightsite-upload.notify-lead-worker.workers.dev';
const R2_PUBLIC_URL = 'https://pub-38c2019362f64b6780e0b217ba84be8c.r2.dev';
const NOTIFY_API = 'https://brightsite-notify-lead.notify-lead-worker.workers.dev/';

function slugify(value: string) {
  return (value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function guessMime(uri: string) {
  const ext = (uri.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

function authHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, ...extra };
}

async function uploadMediaToR2(accessToken: string, slug: string, type: string, uri?: string): Promise<string | null> {
  if (!uri) return null;
  if (/^https?:\/\//.test(uri)) return uri;
  try {
    const blob = await (await fetch(uri)).blob();
    const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
    const key = `${slug}/${type}_${Date.now()}.${ext}`;
    const res = await fetch(`${UPLOAD_WORKER}/upload`, {
      method: 'POST',
      headers: { 'x-file-name': key, 'Content-Type': guessMime(uri), Authorization: `Bearer ${accessToken}` },
      body: blob,
    });
    if (!res.ok) return null;
    const d = await res.json();
    return `${R2_PUBLIC_URL}/${d.key || key}`;
  } catch {
    return null;
  }
}

async function notifyStage(stage: string, businessName: string, email: string, slug: string) {
  const fd = new FormData();
  fd.append('Stage', stage);
  fd.append('Business', businessName);
  fd.append('Email', email);
  fd.append('Slug', slug);
  try { await fetch(NOTIFY_API, { method: 'POST', body: fd as any }); } catch {}
}

async function fetchMessages(accessToken: string, slug: string, afterTs?: string) {
  let url = `${SUPABASE_URL}/rest/v1/messages?select=id,business_id,sender,body,created_at&business_id=eq.${encodeURIComponent(slug)}&order=created_at.asc`;
  if (afterTs) url += `&created_at=gt.${encodeURIComponent(afterTs)}`;
  const res = await fetch(url, { headers: authHeaders(accessToken) });
  if (!res.ok) throw new Error('Could not load messages');
  return res.json() as Promise<{ id: string; sender: string; body: string; created_at: string }[]>;
}

async function postMessage(accessToken: string, slug: string, body: string, sender = 'customer') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ business_id: slug, sender, body }),
  });
  if (!res.ok) throw new Error('Message could not be sent.');
}

async function editMessage(accessToken: string, id: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error('Message could not be edited.');
}

async function deleteMessageRow(accessToken: string, id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error('Message could not be deleted.');
}

// Same SECURITY DEFINER RPC the website dashboard saves through, so ownership checks match.
async function upsertBusiness(session: any, id: string, name: string, record: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_business`, {
    method: 'POST',
    headers: authHeaders(session.access_token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_id: id, p_name: name, p_user_id: session.user.id, p_data: record, p_updated_at: record.updatedAt }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json.message || `Save failed (${res.status})`);
    err.conflict = /another account/i.test(json.message || '');
    throw err;
  }
  return json;
}

function dayLabel(iso: string) {
  const d = new Date(iso); const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function isImageMessage(body: string) {
  return /^https?:\/\//.test(body) && (body.includes(R2_PUBLIC_URL) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(body));
}
// Replace with your Stripe publishable key from stripe.com/dashboard
const CARD = '#EFE4DB';
const FS_SLOT = (SCREEN_WIDTH - 32) / 5;
const DARK = '#1C2832';
const GALLERY_COLS = 4;
const GALLERY_GAP = 8;
// Deck card insets (6+6) plus card content padding (24+24) = 60 total
function galleryTileSize(containerWidth: number) {
  const size = containerWidth ? Math.floor((containerWidth - GALLERY_GAP * (GALLERY_COLS - 1)) / GALLERY_COLS) : 80;
  return { width: size, height: size };
}

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
const BUSINESS_TYPES = ['Hair & Beauty', 'Aesthetics', 'Health & Wellness', 'Fitness', 'Automotive', 'Trades', 'Home & Garden', 'Food & Drink', 'Professional Services', 'Creative', 'Pets', 'Other'];
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
  'Aesthetics': { topServices: ['Skin Treatments', 'Injectables', 'Consultations'], about: 'Advanced aesthetic treatments delivered with care, safety and natural-looking results.', heroTitle: 'Look like you, only refreshed.', heroBody: 'Expert aesthetic treatments in a calm, clinical setting.' },
  'Health': { topServices: ['Treatments', 'Therapies', 'Consultations'], about: 'Caring, qualified practitioners focused on how you feel day to day.', heroTitle: 'Feel better, live better.', heroBody: 'Professional care that puts your wellbeing first.' },
  'Automotive': { topServices: ['Servicing', 'Repairs', 'MOT'], about: 'Honest, reliable work on your vehicle with clear prices and no surprises.', heroTitle: 'Keeping you on the road.', heroBody: 'Trusted servicing and repairs from experienced technicians.' },
  'Trades': { topServices: ['Installations', 'Repairs', 'Free Quotes'], about: 'Qualified, insured and proud of a job done properly the first time.', heroTitle: 'Quality work, done right.', heroBody: 'Reliable local tradespeople with fair, upfront pricing.' },
  'Home': { topServices: ['Garden Design', 'Maintenance', 'Landscaping'], about: 'Making homes and gardens look their best, season after season.', heroTitle: 'Love where you live.', heroBody: 'Friendly, reliable home and garden services near you.' },
  'Food': { topServices: ['Menu', 'Takeaway', 'Private Hire'], about: 'Freshly prepared food made with good ingredients and real care.', heroTitle: 'Good food, made with love.', heroBody: 'Fresh, seasonal food and a warm welcome every time.' },
  'Professional': { topServices: ['Consultations', 'Advice', 'Ongoing Support'], about: 'Clear, expert advice from people who take the time to understand you.', heroTitle: 'Expertise you can trust.', heroBody: 'Professional services built around your goals.' },
  'Creative': { topServices: ['Projects', 'Commissions', 'Packages'], about: 'Creative work with a clear eye for detail and a personal approach.', heroTitle: 'Ideas, beautifully made.', heroBody: 'Thoughtful creative work that tells your story.' },
  'Pets': { topServices: ['Grooming', 'Walking', 'Boarding'], about: 'Caring for your pets like they’re our own.', heroTitle: 'Happy pets, happy owners.', heroBody: 'Trusted, loving care for your four-legged family.' },
  'Cleaning': { topServices: ['Domestic', 'Commercial', 'Deep Clean'], about: 'Professional cleaning services for homes and businesses.', heroTitle: 'Spotlessly clean, every time.', heroBody: 'Reliable, thorough cleaning using eco-friendly products.' },
};
function getPreset(category: string) {
  const key = category?.trim() && Object.keys(CATEGORY_PRESETS).find(k =>
    (category || '').toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes((category || '').toLowerCase())
  );
  return key ? CATEGORY_PRESETS[key] : { topServices: ['Our Services', 'Consultations', 'Packages'], about: 'Professional, friendly service tailored to your needs.', heroTitle: 'Quality you can count on.', heroBody: 'Friendly, professional service from a local business that cares.' };
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, ...inputProps }: any) {
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.placeholder}
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
        trackColor={{ false: 'rgba(28,40,50,.18)', true: C.primary }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as any)} /></View></View>)}</View>;
}

let cidSeed = 0;
const newCid = () => `c${Date.now()}${cidSeed++}`;
function Services({ items, setItems }: any) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapse = (cid: string) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCollapsed(c => ({ ...c, [cid]: !c[cid] })); };
  const update = (i: number, key: string, value: string) => setItems(items.map((item: any, n: number) => n === i ? { ...item, [key]: value } : item));
  const remove = (i: number) => {
    const cid = items[i].cid;
    if (items.filter((it: any) => it.cid === cid).length <= 1) return;
    Alert.alert('Remove this service?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => setItems(items.filter((_: any, n: number) => n !== i)) }]);
  };
  const removeSection = (cid: string) => {
    Alert.alert('Remove this category?', 'This removes every service in it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
      const remaining = items.filter((it: any) => it.cid !== cid);
      setItems(remaining.length ? remaining : [{ cid: newCid(), section: '', name: '', duration: '', price: '' }]);
    } }]);
  };
  const addServiceTo = (cid: string, afterIndex: number) => {
    setCollapsed(c => ({ ...c, [cid]: false }));
    const next = [...items];
    next.splice(afterIndex + 1, 0, { cid, section: items[afterIndex].section, name: '', duration: '', price: '' });
    setItems(next);
  };
  const addSection = () => { const cid = newCid(); setCollapsed(c => ({ ...c, [cid]: false })); setItems([...items, { cid, section: '', name: '', duration: '', price: '' }]); };
  const cids = items.reduce((acc: string[], it: any) => { if (!acc.length || acc[acc.length - 1] !== it.cid) acc.push(it.cid); return acc; }, [] as string[]);
  return <View>
    {cids.map((cid: string, ci: number) => {
      const sectionItems = items.map((it: any, idx: number) => ({ ...it, _idx: idx })).filter((it: any) => it.cid === cid);
      const svcCount = sectionItems.filter((it: any) => it.name).length;
      const isOpen = !collapsed[cid];
      const sectionName = sectionItems[0]?.section || '';
      return <View key={cid} style={[ci > 0 && { marginTop: 14 }, { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line }]}>
        <Pressable onPress={() => toggleCollapse(cid)} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={C.inkSoft} style={{ marginRight: 6 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT, fontWeight: '700', fontSize: 15, color: C.ink }}>{sectionName || (ci === 0 ? 'Category' : `Category ${ci + 1}`)}</Text>
            {!isOpen && <Text style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{svcCount} service{svcCount !== 1 ? 's' : ''}</Text>}
          </View>
          {ci > 0 && <Pressable onPress={() => removeSection(cid)} hitSlop={8} accessibilityLabel="Remove category"><Ionicons name="trash-outline" size={17} color={C.danger} /></Pressable>}
        </Pressable>
        {isOpen && <View style={{ marginTop: 12 }}>
          <Field label="Category name" value={sectionName} onChangeText={(v: string) => setItems(items.map((it: any) => it.cid === cid ? { ...it, section: v } : it))} placeholder={ci === 0 ? 'e.g. Massages' : 'e.g. Waxing'} />
          <View style={[s.serviceHeadRow, { marginTop: 10 }]}><Text style={[s.serviceHead, { flex: 1.9 }]}>Service</Text><Text style={[s.serviceHead, { flex: 1.2 }]}>Time</Text><Text style={[s.serviceHead, { flex: .95 }]}>Price</Text><View style={{ width: 28 }} /></View>
          {sectionItems.map((item: any) => <View key={item._idx} style={s.serviceRow}>
            <TextInput value={item.name} onChangeText={v => update(item._idx, 'name', v)} placeholder="e.g. Haircut" placeholderTextColor={C.placeholder} style={[s.serviceInput, { flex: 1.9 }]} />
            <TextInput value={item.duration} onChangeText={v => update(item._idx, 'duration', v)} placeholder="45 mins" placeholderTextColor={C.placeholder} style={[s.serviceInput, { flex: 1.2 }]} />
            <TextInput value={item.price} onChangeText={v => update(item._idx, 'price', v)} placeholder="£30" placeholderTextColor={C.placeholder} style={[s.serviceInput, { flex: .95 }]} />
            <Pressable onPress={() => remove(item._idx)} style={s.serviceDelete} hitSlop={8} accessibilityLabel="Remove service"><Ionicons name="close" size={16} color={C.inkMuted} /></Pressable>
          </View>)}
          <Pressable onPress={() => addServiceTo(cid, sectionItems[sectionItems.length - 1]._idx)} style={s.addService}><Ionicons name="add" size={16} color={C.primary} /><Text style={s.addServiceText}>Add service</Text></Pressable>
        </View>}
      </View>;
    })}
    <Pressable onPress={addSection} style={[s.addService, s.addSectionBtn]}><Ionicons name="add" size={16} color={C.ink} /><Text style={s.addServiceText}>Add category</Text></Pressable>
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
    {preview ? <Image source={{ uri: preview }} style={fill ? s.uploadPreviewFill : s.uploadPreview} resizeMode="cover" /> : fill ? <Ionicons name="add" size={26} color={C.primary} /> : <><View style={s.uploadIcon}><Ionicons name={icon} size={22} color={C.primary} /></View><Text style={s.uploadTitle}>{title}</Text><Text style={s.uploadSub}>{subtitle}</Text></>}
  </Pressable>;
}

function SitePreview({ palette, font, page = 0, onPageChange, editing, siteTexts = {}, onEditText,
  businessName = '', category = '', servicesData = [], hoursData = [],
  contactData = {} as any, contactForm = true,
  homeSections = HOME_SECTIONS_DEFAULT, servicesSections = SERVICES_SECTIONS_DEFAULT, contactSections = CONTACT_SECTIONS_DEFAULT, media = { gallery: [] } as any, desktop = false,
}: any) {
  const colors = palettes[palette];
  const [accent, bg, textColor] = colors;
  const preset = getPreset(category);
  const titleFamily = font === 0 ? Platform.select({ ios: 'Didot', android: 'serif', default: 'serif' }) : FONT;
  const fw: any = font === 1 ? '800' : font === 2 ? '300' : font === 3 ? '200' : font === 4 ? '900' : undefined;
  const fo: any = { fontFamily: FONT, ...(fw && { fontWeight: fw }), ...(font === 2 && { letterSpacing: 1.2 }), ...(font === 3 && { letterSpacing: 1.8 }), ...(font === 4 && { letterSpacing: -0.5 }) };
  const tf: any = { ...fo, fontFamily: titleFamily };
  const tx = (key: string, fallback: string) => (siteTexts as any)[key] || fallback;
  const biz = businessName || 'Business';
  const fallbacks: Record<string, string> = { brand: biz.toUpperCase(), headline: preset.heroTitle, heroBody: preset.heroBody, aboutTitle: biz, aboutBody: preset.about };
  const ep = (key: string) => editing ? () => onEditText?.(key, tx(key, fallbacks[key] || '')) : undefined;
  const topSvcs = servicesData?.filter((sv: any) => sv.name).slice(0, 3).map((sv: any) => sv.name);
  const displaySvcs = topSvcs?.length ? topSvcs : preset.topServices;

  const eyebrow = (text: string) => <Text style={[s.siteEyebrow, fo, { color: accent }]}>{text}</Text>;

  const renderHome = (name: string) => {
    switch (name) {
      case 'Hero': return <View key="Hero" style={{ backgroundColor: bg }}>
        <View style={[s.siteTop, { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: bg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>{!!media.logo && <Image source={{ uri: media.logo }} style={s.siteLogo} />}<Text style={[s.siteKicker, fo, { color: textColor }, editing && s.editing]} onPress={ep('brand')} numberOfLines={1}>{tx('brand', biz.toUpperCase())}</Text></View>
          <Ionicons name="menu" size={18} color={textColor} />
        </View>
        <Image source={media.hero ? { uri: media.hero } : require('./assets/hair-beauty-hero.jpg')} style={[s.siteHeroImg, desktop && s.siteHeroImgDesktop]} resizeMode="cover" />
        <View style={[s.siteHeroCopy, { backgroundColor: bg }]}>
          <Text style={[s.siteEyebrow, fo, { color: accent, textAlign: 'center', marginBottom: 8 }]}>{contactData.address ? contactData.address.split(',').slice(-2).join(' · ').trim() || category : category}</Text>
          <Text style={[s.siteHeadline, tf, { color: textColor, textAlign: 'center' }, editing && s.editing]} onPress={ep('headline')}>{tx('headline', preset.heroTitle)}</Text>
          <Text style={[s.siteBody, fo, { color: textColor, opacity: .65, textAlign: 'center', marginTop: 6 }, editing && s.editing]} onPress={ep('heroBody')}>{tx('heroBody', preset.heroBody)}</Text>
          <View style={[s.heroButtons, { justifyContent: 'center', marginTop: 14 }]}>
            <View style={[s.siteCtaFilled, { backgroundColor: textColor }]}><Text style={[s.siteCtaFilledText, fo, { color: bg }]}>Book Now</Text></View>
            <View style={[s.siteCta, { borderColor: textColor, marginTop: 0 }]}><Text style={[s.siteCtaText, fo, { color: textColor }]}>View Treatments</Text></View>
          </View>
        </View>
      </View>;
      case 'About & Services': return <View key="About & Services" style={[s.siteSection, { backgroundColor: bg }]}>
        {desktop ? <View style={s.siteAboutDesktopRow}>
          <View style={{ flex: 1 }}>
            {eyebrow(`Welcome to ${biz}`)}
            <Text style={[s.siteSectionTitle, tf, { color: textColor }, editing && s.editing]} onPress={ep('aboutTitle')}>{tx('aboutTitle', `${category || 'Everything'}, all under one roof`)}</Text>
            <Text style={[s.siteSectionBody, fo, { color: textColor }, editing && s.editing]} onPress={ep('aboutBody')}>{tx('aboutBody', preset.about)}</Text>
            <View style={[s.heroButtons, { marginTop: 10 }]}>
              <View style={[s.siteCta, { borderColor: textColor }]}><Text style={[s.siteCtaText, fo, { color: textColor }]}>Browse Treatments</Text></View>
            </View>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {displaySvcs.map((sv: string, i: number) => <View key={i} style={[s.siteAboutCard, { borderColor: textColor + '14' }]}>
              <Text style={[s.siteAboutCardLabel, fo, { color: accent }]}>Most Popular</Text>
              <Text style={[s.siteAboutCardTitle, fo, { color: textColor }]}>{sv}</Text>
              <Text style={[s.siteAboutCardCta, fo, { color: accent }]}>View treatments</Text>
            </View>)}
          </View>
        </View> : <View>
          {eyebrow(`Welcome to ${biz}`)}
          <Text style={[s.siteSectionTitle, tf, { color: textColor }, editing && s.editing]} onPress={ep('aboutTitle')}>{tx('aboutTitle', `${category || 'Everything'}, all under one roof`)}</Text>
          <Text style={[s.siteSectionBody, fo, { color: textColor }, editing && s.editing]} onPress={ep('aboutBody')}>{tx('aboutBody', preset.about)}</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {displaySvcs.map((sv: string, i: number) => <View key={i} style={[s.siteAboutCard, { borderColor: textColor + '14' }]}>
              <Text style={[s.siteAboutCardLabel, fo, { color: accent }]}>Most Popular</Text>
              <Text style={[s.siteAboutCardTitle, fo, { color: textColor }]}>{sv}</Text>
              <Text style={[s.siteAboutCardCta, fo, { color: accent }]}>View treatments</Text>
            </View>)}
          </View>
        </View>}
      </View>;
      case 'Reviews': return <View key="Reviews" style={[s.siteSection, { backgroundColor: accent + '14' }]}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          {eyebrow('Client Reviews')}
          <Text style={[s.siteSectionTitle, tf, { color: textColor, textAlign: 'center' }]}>What our clients say</Text>
        </View>
        <View style={desktop ? s.siteReviewGrid : { gap: 8 }}>
          {[{ text: '"Amazing results every time. Highly recommend."', name: 'Sarah M.', type: category || 'Facial' },
            { text: '"Wonderful experience and great service."', name: 'Linda B.', type: 'Treatment' },
            { text: '"Blown away! I look and feel fantastic."', name: 'Carol H.', type: category || 'Facial' }].map((r, i) => <View key={i} style={[s.siteReviewCard, { backgroundColor: bg }]}>
            <View style={s.siteStars}>{[0,1,2,3,4].map(j => <Ionicons key={j} name="star" size={8} color={accent} />)}</View>
            <Text style={[s.siteReviewText, fo, { color: textColor }]}>{r.text}</Text>
            <Text style={[s.siteReviewAuthor, fo, { color: textColor }]}>{r.name}<Text style={{ color: accent, fontSize: 6 }}>  {r.type}</Text></Text>
          </View>)}
        </View>
        {contactData.reviewSource === 'Trustpilot' && <View style={[s.siteTrustBadge, { borderColor: textColor + '33', marginTop: 10 }]}>
          <Text style={[s.siteTrustTitle, fo, { color: textColor }]}>Rated Excellent on Trustpilot</Text>
          <View style={[s.siteStars, { marginTop: 4 }]}>{[0,1,2,3,4].map(i => <Ionicons key={i} name="star" size={9} color="#00B67A" />)}</View>
          {!!contactData.reviewLink && <Text style={[s.siteTrustLink, fo, { color: accent }]}>See our reviews</Text>}
        </View>}
      </View>;
      case 'Gallery': return <View key="Gallery" style={[s.siteSection, { backgroundColor: bg }]}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          {eyebrow('Gallery')}
          <Text style={[s.siteSectionTitle, tf, { color: textColor, textAlign: 'center' }]}>Inside the studio</Text>
        </View>
        <View style={s.siteGalleryGrid}>
          {media.gallery?.length ? media.gallery.slice(0, 6).map((uri: string, i: number) => <Image key={uri} source={{ uri }} style={[s.siteGalleryImg, i < 2 && desktop && { flex: 1 }]} />) : Array.from({ length: 6 }, (_, i) => <View key={i} style={[s.siteGalleryImg, { backgroundColor: i % 2 === 0 ? accent + '44' : textColor + '14' }]} />)}
        </View>
      </View>;
      case 'Contact': return <View key="Contact" style={[s.siteSection, s.siteCTABand, { backgroundColor: textColor }]}>
        {eyebrow('Ready when you are')}
        <Text style={[s.siteSectionTitle, tf, { color: '#fff' }]}>Book your appointment</Text>
        <Text style={[s.siteSectionBody, fo, { color: 'rgba(255,255,255,.7)' }]}>Get in touch to find a time that works for you.</Text>
        <View style={[s.heroButtons, { marginTop: 6 }]}>
          <View style={[s.siteCtaFilled, { backgroundColor: '#fff' }]}><Text style={[s.siteCtaFilledText, fo, { color: textColor }]}>Book Now</Text></View>
          <View style={[s.siteCta, { borderColor: 'rgba(255,255,255,.6)' }]}><Text style={[s.siteCtaText, fo]}>Get in Touch</Text></View>
        </View>
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
      case 'Info & Hours': return <View key="Info & Hours" style={[s.siteSection, { backgroundColor: accent + '14' }]}>
        {eyebrow('Find Us')}
        <View style={s.siteContactInfoRow}>
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
      {!desktop && <View style={s.previewBrowser}><View style={s.previewDots}><View style={s.previewDot} /><View style={s.previewDot} /><View style={s.previewDot} /></View><Text style={s.previewAddress}>{biz.toLowerCase().replace(/\s+/g, '')}.co.uk</Text></View>}
      <View style={[s.previewPageNav, { borderBottomColor: accent + '33' }]}>
        {['Home', 'Services', 'Contact'].map((name, i) => <Pressable key={name} onPress={() => onPageChange?.(i)} style={[s.previewPageTab, page === i && { borderBottomColor: accent, borderBottomWidth: 2 }]}>
          <Text style={[s.previewPageTabText, fo, page === i && { color: accent }]}>{name}</Text>
        </Pressable>)}
      </View>
    </View>
    {page === 0 && <View>{homeSections.map((n: string) => renderHome(n))}{renderFooter()}</View>}
    {page === 1 && <View>{servicesSections.map((n: string) => renderServices(n))}{renderFooter()}</View>}
    {page === 2 && <View>{contactSections.map((n: string) => renderContact(n))}{renderFooter()}</View>}
  </View>;

  function renderFooter() {
    return <View style={[s.siteFooter, { backgroundColor: textColor }]}>
      {!!media.logo && <Image source={{ uri: media.logo }} style={[s.siteLogo, { tintColor: '#fff', marginBottom: 6 }]} />}
      <Text style={[fo, { color: 'rgba(255,255,255,.5)', fontSize: 7 }]}>{biz}</Text>
      <View style={s.siteFooterCols}>
        <View style={{ flex: 1 }}>
          <Text style={[fo, { color: 'rgba(255,255,255,.4)', fontSize: 6, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }]}>Pages</Text>
          {['Home', 'Treatments', 'Contact'].map(p => <Text key={p} style={[fo, { color: 'rgba(255,255,255,.6)', fontSize: 7, marginBottom: 2 }]}>{p}</Text>)}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[fo, { color: 'rgba(255,255,255,.4)', fontSize: 6, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }]}>Get in touch</Text>
          {!!contactData.phone && <Text style={[fo, { color: 'rgba(255,255,255,.6)', fontSize: 7, marginBottom: 2 }]}>{contactData.phone}</Text>}
          {!!contactData.address && <Text style={[fo, { color: 'rgba(255,255,255,.6)', fontSize: 7 }]}>{contactData.address}</Text>}
        </View>
      </View>
      <Text style={[fo, { color: 'rgba(255,255,255,.3)', fontSize: 6, marginTop: 10 }]}>{'©'} 2026 {biz}. All rights reserved.</Text>
    </View>;
  }
}

function GalleryGrid({ gallery, setGallery, containerWidth }: any) {
  const tile = containerWidth ? Math.floor((containerWidth - GALLERY_GAP * (GALLERY_COLS - 1)) / GALLERY_COLS) : 80;
  const STEP = tile + GALLERY_GAP;
  const posOf = (i: number) => ({ x: (i % GALLERY_COLS) * STEP, y: Math.floor(i / GALLERY_COLS) * STEP });
  const cellRef = useRef<Record<string, { x: Animated.Value; y: Animated.Value }>>({});
  const galleryRef = useRef(gallery);
  galleryRef.current = gallery;
  const hoverRef = useRef<number | null>(null);
  const [draggingUri, setDraggingUri] = useState<string | null>(null);
  const getCell = (uri: string) => {
    if (!cellRef.current[uri]) cellRef.current[uri] = { x: new Animated.Value(0), y: new Animated.Value(0) };
    return cellRef.current[uri];
  };
  const resetAllCells = () => { galleryRef.current.forEach((uri: string) => { const c = getCell(uri); c.x.setValue(0); c.y.setValue(0); }); };
  const removePhoto = (uri: string) => {
    Alert.alert('Remove this photo?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => setGallery(galleryRef.current.filter((u: string) => u !== uri)) }]);
  };
  const pans = useMemo(() => Object.fromEntries(gallery.map((uri: string) => {
    const cell = getCell(uri);
    return [uri, PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        hoverRef.current = galleryRef.current.indexOf(uri);
        setDraggingUri(uri);
      },
      onPanResponderMove: Animated.event([null, { dx: cell.x, dy: cell.y }], {
        useNativeDriver: false,
        listener: ((_: any, g: any) => {
          const list = galleryRef.current;
          const fromIdx = list.indexOf(uri);
          const colDelta = Math.round(g.dx / STEP);
          const rowDelta = Math.round(g.dy / STEP);
          const newHover = Math.max(0, Math.min(list.length - 1, fromIdx + rowDelta * GALLERY_COLS + colDelta));
          if (newHover !== hoverRef.current) {
            hoverRef.current = newHover;
            list.forEach((otherUri: string, i: number) => {
              if (otherUri === uri) return;
              let target = i;
              if (fromIdx < newHover && i > fromIdx && i <= newHover) target = i - 1;
              else if (fromIdx > newHover && i < fromIdx && i >= newHover) target = i + 1;
              const from = posOf(i);
              const to = posOf(target);
              const otherCell = getCell(otherUri);
              Animated.spring(otherCell.x, { toValue: to.x - from.x, useNativeDriver: false, damping: 20, stiffness: 220 }).start();
              Animated.spring(otherCell.y, { toValue: to.y - from.y, useNativeDriver: false, damping: 20, stiffness: 220 }).start();
            });
          }
        }) as any,
      }),
      onPanResponderRelease: () => {
        const list = galleryRef.current;
        const fromIdx = list.indexOf(uri);
        const toIdx = Math.max(0, Math.min(list.length - 1, hoverRef.current ?? fromIdx));
        setDraggingUri(null);
        resetAllCells();
        if (toIdx !== fromIdx) {
          const next = [...list];
          const [item] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, item);
          setGallery(next);
        }
      },
      onPanResponderTerminate: () => { setDraggingUri(null); resetAllCells(); },
    })];
  })), [gallery]);

  return <>
    {gallery.map((uri: string) => {
      const cell = getCell(uri);
      const isDragging = draggingUri === uri;
      return <Animated.View key={uri} {...(pans[uri]?.panHandlers || {})} style={[s.galleryItem, { width: tile, height: tile }, {
        transform: [{ translateX: cell.x }, { translateY: cell.y }, { scale: isDragging ? 1.08 : 1 }],
        zIndex: isDragging ? 10 : 1, opacity: isDragging ? 0.75 : 1,
        shadowColor: '#000', shadowOpacity: isDragging ? .3 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: isDragging ? 8 : 0,
      }]}>
        <Pressable onPress={() => removePhoto(uri)} style={{ flex: 1 }}><Image source={{ uri }} style={s.galleryThumb} /></Pressable>
      </Animated.View>;
    })}
  </>;
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
    onPanResponderGrant: () => { if (name === 'Hero') return; hoverRef.current = currentIdxRef.current[name]; setActiveName(name); },
    // Animated.event links gesture.dy directly to itemDys[name] — moves immediately, no re-render needed
    onPanResponderMove: Animated.event([null, { dy: itemDys[name] }], {
      useNativeDriver: false,
      listener: ((_: any, g: any) => {
        const fromIdx = currentIdxRef.current[name];
        const secs = sectionsRef.current;
        const minIdx = secs[0] === 'Hero' ? 1 : 0;
        const newHover = Math.max(minIdx, Math.min(secs.length - 1, fromIdx + Math.round(g.dy / ITEM_H)));
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
      const minIdx = secs[0] === 'Hero' ? 1 : 0;
      const to = Math.max(minIdx, Math.min(secs.length - 1, fromIdx + Math.round(g.dy / ITEM_H)));
      resetAll(); setActiveName(null);
      if (to !== fromIdx) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const next = [...secs]; const [item] = next.splice(fromIdx, 1); next.splice(to, 0, item); setSections(next);
      }
    },
    onPanResponderTerminate: () => { resetAll(); setActiveName(null); },
  })])), []);

  return <View>
    {sections.filter((name: string) => name !== 'Hero').map((name: string) => {
      const isActive = activeName === name;
      return <Animated.View key={name} style={[s.sectionOption, {
        transform: [{ translateY: itemDys[name] }],
        zIndex: isActive ? 10 : 1, opacity: isActive ? 0.88 : 1,
        backgroundColor: isActive ? 'rgba(255,255,255,.35)' : 'transparent',
        borderRadius: isActive ? 12 : 0,
      }]}>
        <Pressable onPress={() => onToggle(name)} style={s.sectionEye}>
          <Ionicons name={sectionVisible[name] !== false ? 'eye-outline' : 'eye-off-outline'} size={21} color={sectionVisible[name] !== false ? '#436172' : 'rgba(67,97,114,.28)'} />
        </Pressable>
        <Text style={s.sectionText}>{name}</Text>
        <Animated.View {...pans[name].panHandlers} style={s.sectionDragHandle}>
          <Ionicons name="reorder-three" size={24} color={C.inkSoft} />
        </Animated.View>
      </Animated.View>;
    })}
  </View>;
}

function DesignTools({ landscape = false, active, setActive, palette, setPalette, font, setFont, setEditing,
  homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections }: any) {
  const items = [{ id: 'colour', icon: 'color-palette-outline' }, { id: 'font', icon: 'text-outline' }, { id: 'edit', icon: 'create-outline' }];
  const [sectionVisible, setSectionVisible] = useState<Record<string, boolean>>({});
  const [editPage, setEditPage] = useState(0);
  const pageSections = [homeSections, servicesSections, contactSections];
  const setPageSections = [setHomeSections, setServicesSections, setContactSections];
  const curSections = pageSections[editPage];
  const setCurSections = setPageSections[editPage];
  const handleToggle = (name: string) => {
    setSectionVisible((v: any) => ({ ...v, [name]: v[name] === false ? true : false }));
  };
  return <View style={landscape ? s.toolsLandscape : s.tools}>
    <View style={s.toolStack}>{items.map(item => {
      const open = active === item.id;
      return (
        <View key={item.id} style={landscape ? s.toolSlotLandscape : s.toolSlot}><Pressable onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const next = active === item.id ? null : item.id;
          setActive(next);
          setEditing(next === 'edit');
        }} style={({ pressed }) => [s.toolButton, landscape && s.toolButtonSmall, open && s.toolActive, pressed && s.pressed]}>
          <Ionicons name={item.icon as any} size={19} color={open ? '#fff' : C.primary} />
        </Pressable></View>
      );
    })}</View>
    {active && !landscape && <BlurView intensity={58} tint="light" style={s.toolPanel}>
      <Text style={s.toolTitle}>{active === 'colour' ? 'Colour' : active === 'font' ? 'Font' : 'Edit site'}</Text>
      {active === 'colour' && <View style={s.paletteWrap}><SectionList
        style={s.paletteScroll}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        sections={paletteGroups.map((group, groupIndex) => ({ title: group.name, data: group.options.map((colors, i) => ({ colors, paletteIndex: paletteGroups.slice(0, groupIndex).reduce((t, g) => t + g.options.length, 0) + i })) }))}
        keyExtractor={(item) => item.colors.join()}
        renderSectionHeader={({ section }) => <Text style={[s.paletteHeadingText, s.paletteStickyHeader]}>{section.title}</Text>}
        renderItem={({ item }) => <Pressable onPress={() => setPalette(item.paletteIndex)} style={[s.option, palette === item.paletteIndex && s.selected]}>{item.colors.map(c => <View key={c} style={[s.dot, { backgroundColor: c }]} />)}</Pressable>}
        SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
      /></View>}
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

function LandscapeToolStrip({ active, palette, setPalette, font, setFont, homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections }: any) {
  const [editPage, setEditPage] = useState(0);
  const pages = [[homeSections, setHomeSections], [servicesSections, setServicesSections], [contactSections, setContactSections]];
  const [secs, setSecs] = pages[editPage];
  const move = (name: string, dir: -1 | 1) => {
    const i = secs.indexOf(name);
    const firstMovableIndex = secs[0] === 'Hero' ? 1 : 0;
    const j = i + dir; if (j < firstMovableIndex || j >= secs.length) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = [...secs]; [next[i], next[j]] = [next[j], next[i]]; setSecs(next);
  };
  return <View style={s.stripPanel}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stripContent}>
      {active === 'colour' && paletteGroups.map((group, g) => <View key={group.name} style={s.stripGroup}>
        <Text style={s.stripGroupLabel}>{group.name}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>{group.options.map((colors, i) => {
          const idx = paletteGroups.slice(0, g).reduce((t, x) => t + x.options.length, 0) + i;
          return <Pressable key={colors.join()} onPress={() => setPalette(idx)} style={[s.stripChip, palette === idx && s.stripChipOn]}>{colors.map(c => <View key={c} style={[s.dot, { width: 16, height: 16 }, { backgroundColor: c }]} />)}</Pressable>;
        })}</View>
      </View>)}
      {active === 'font' && fonts.map((name, i) => <Pressable key={name} onPress={() => setFont(i)} style={[s.stripChip, { paddingHorizontal: 18 }, font === i && s.stripChipOn]}><Text style={s.fontOptionText}>{name}</Text></Pressable>)}
      {active === 'edit' && <>
        <View style={[s.editPageTabs, { marginBottom: 0, alignSelf: 'center' }]}>{['Home', 'Services', 'Contact'].map((name, i) => <Pressable key={name} onPress={() => setEditPage(i)} style={[s.editPageTab, { paddingHorizontal: 12 }, editPage === i && s.editPageTabOn]}><Text style={[s.editPageTabText, editPage === i && s.editPageTabTextOn]}>{name}</Text></Pressable>)}</View>
        {secs.filter((name: string) => name !== 'Hero').map((name: string, visibleIndex: number, visibleSections: string[]) => <View key={name} style={[s.stripChip, { gap: 4, paddingHorizontal: 6 }]}>
          <Pressable onPress={() => move(name, -1)} hitSlop={6} disabled={visibleIndex === 0} style={{ opacity: visibleIndex === 0 ? .3 : 1, padding: 4 }}><Ionicons name="chevron-back" size={16} color={C.inkSoft} /></Pressable>
          <Text style={s.fontOptionText}>{name}</Text>
          <Pressable onPress={() => move(name, 1)} hitSlop={6} disabled={visibleIndex === visibleSections.length - 1} style={{ opacity: visibleIndex === visibleSections.length - 1 ? .3 : 1, padding: 4 }}><Ionicons name="chevron-forward" size={16} color={C.inkSoft} /></Pressable>
        </View>)}
        <Text style={s.stripHint}>Tap text on the page to edit it</Text>
      </>}
    </ScrollView>
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
  return <View style={{ flex: 1, backgroundColor: C.primary }}>
    <LinearGradient colors={['#7DB0FA', '#3B82F6', '#2563EB']} locations={[0, .45, 1]} style={StyleSheet.absoluteFill} />
    {children}
  </View>;
}

const LOGO = require('./assets/brightsite-logo.png');
const LOGO_RATIO = 515 / 72;
function Logo({ height = 18, tint }: { height?: number; tint?: string }) {
  return <Image source={LOGO} accessibilityLabel="BrightSite" style={{ height, width: height * LOGO_RATIO, ...(tint ? { tintColor: tint } : null) }} resizeMode="contain" />;
}

const DESKTOP_WIDTH = 960;
const MOBILE_WIDTH = 390;
const DESKTOP_VIEW_W = SCREEN_WIDTH - 52;
const DESKTOP_VIEW_H = Math.round(DESKTOP_VIEW_W * 0.68);
function ScaledView({ virtualWidth, width, children }: { virtualWidth: number; width: number; children: React.ReactNode }) {
  const [innerHeight, setInnerHeight] = useState(0);
  const scale = width / virtualWidth;
  return <View style={{ width, height: innerHeight * scale, overflow: 'hidden' }}>
    <View onLayout={e => setInnerHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', top: 0, left: 0, width: virtualWidth, transform: [{ scale }], transformOrigin: 'top left' }}>{children}</View>
  </View>;
}

function DeviceToggle({ mode, setMode, dark = false }: { mode: 'mobile' | 'desktop'; setMode: (m: 'mobile' | 'desktop') => void; dark?: boolean }) {
  return <View style={[s.deviceToggle, dark && s.deviceToggleDark]}>
    {(['mobile', 'desktop'] as const).map(m => <Pressable key={m} onPress={() => setMode(m)} style={[s.deviceToggleBtn, mode === m && (dark ? s.deviceToggleBtnOnDark : s.deviceToggleBtnOn)]} accessibilityLabel={`${m} preview`}>
      <Ionicons name={m === 'mobile' ? 'phone-portrait-outline' : 'desktop-outline'} size={16} color={mode === m ? C.ink : dark ? 'rgba(255,255,255,.55)' : C.inkMuted} />
    </Pressable>)}
  </View>;
}

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (visible) { setPw(''); setConfirm(''); setMsg(''); } }, [visible]);
  const save = async () => {
    if (pw.length < 8) { setMsg('Use at least 8 characters.'); return; }
    if (pw !== confirm) { setMsg('Those passwords don’t match.'); return; }
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg(/different from the old/i.test(error.message) ? 'Choose a password you haven’t used before.' : 'Couldn’t change your password. Please try again.'); return; }
    onClose();
    Alert.alert('Password changed', 'Use your new password next time you log in.');
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={s.modalBox}>
          <Text style={s.planModalTitle}>Change password</Text>
          <View style={{ height: 14 }} />
          <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry textContentType="newPassword" placeholder="At least 8 characters" autoFocus />
          <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" onSubmitEditing={() => void save()} />
          {!!msg && <Text style={[s.authStatus, { marginBottom: 10 }]}>{msg}</Text>}
          <View style={s.modalButtons}>
            <Pressable onPress={onClose} style={[s.modalButton, s.modalButtonCancel]}><Text style={s.modalButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={() => void save()} disabled={busy} style={[s.modalButton, s.modalButtonSave, busy && { opacity: .6 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.modalButtonText, { color: '#fff' }]}>Save</Text>}</Pressable>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
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

function DashboardHome({ tab, setTab, data, domain, suffix, palette, font, services, hours, contactForm, homeSections, servicesSections, contactSections, onEdit, websiteStatus, onMakeLive, onTakeOffline, onGoLive, onSignOut, onEditInfo, onPaid, saveError, planAnnual, media, isPaying, buildChoice, session, slug }: any) {
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [showPassword, setShowPassword] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const siteUrl = data.website?.trim() || `https://${domain}${suffix}`;
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [domainPriceLabel, setDomainPriceLabel] = useState<string | null>(null);
  const [domainPriceLoading, setDomainPriceLoading] = useState(false);
  const openPlanModal = async () => {
    setShowPlanModal(true);
    setDomainPriceLoading(true);
    try {
      const res = await fetch(`${DOMAIN_API}?domain=${encodeURIComponent(domain + suffix)}`);
      const result = await res.json();
      setDomainPriceLabel(res.ok && result.priceLabel ? result.priceLabel : null);
    } catch { setDomainPriceLabel(null); }
    finally { setDomainPriceLoading(false); }
  };
  const [annual, setAnnual] = useState(!!planAnnual);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [messages, setMessages] = useState<{ id: string; sender: string; body: string; created_at: string }[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const lastMessageTs = useRef<string | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const scrollToLatest = (animated = true) => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => { setKbOpen(true); if (tab === 'Messages') setTimeout(() => scrollToLatest(), 60); });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, [tab]);
  useEffect(() => { if (tab === 'Messages') scrollToLatest(false); }, [tab]);

  const loadMessagesNow = async () => {
    if (!session?.access_token || !slug) return;
    try {
      const rows = await fetchMessages(session.access_token, slug, lastMessageTs.current);
      if (rows.length) {
        lastMessageTs.current = rows[rows.length - 1].created_at;
        setMessages(current => {
          const ids = new Set(current.map(m => m.id));
          const pending = current.filter(m => m.id.startsWith('local-') && !rows.some(r => r.sender === m.sender && r.body === m.body));
          return [...current.filter(m => !m.id.startsWith('local-')), ...rows.filter(r => !ids.has(r.id)), ...pending];
        });
      }
    } catch { /* same best-effort polling as the website's messages tab */ }
  };
  useEffect(() => {
    if (tab !== 'Messages') return;
    void loadMessagesNow();
    const timer = setInterval(() => { void loadMessagesNow(); }, 4000);
    return () => clearInterval(timer);
  }, [tab, slug, session?.access_token]);

  const handleLongPressMessage = (m: { id: string; sender: string; body: string }) => {
    if (m.sender !== 'customer' || !session?.access_token) return;
    const isImage = isImageMessage(m.body);
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];
    if (!isImage) {
      options.push({
        text: 'Edit',
        onPress: () => {
          if (Platform.OS === 'ios') {
            (Alert as any).prompt('Edit message', '', (newBody: string) => {
              const trimmed = (newBody || '').trim();
              if (!trimmed || !session?.access_token) return;
              editMessage(session.access_token, m.id, trimmed)
                .then(() => setMessages(current => current.map(row => row.id === m.id ? { ...row, body: trimmed } : row)))
                .catch(() => {});
            }, 'plain-text', m.body);
          } else {
            setMessageDraft(m.body);
          }
        },
      });
    }
    options.push({
      text: 'Delete', style: 'destructive', onPress: () => {
        if (!session?.access_token) return;
        deleteMessageRow(session.access_token, m.id)
          .then(() => setMessages(current => current.filter(row => row.id !== m.id)))
          .catch(() => {});
      },
    });
    Alert.alert('Message', undefined, options);
  };
  const attachImage = async () => {
    if (!session?.access_token || !slug) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .82 });
    if (result.canceled || !result.assets[0]) return;
    const url = await uploadMediaToR2(session.access_token, slug, `msg_${Date.now()}`, result.assets[0].uri);
    if (url) void sendMessage(url);
    else Alert.alert('Photo not sent', 'That photo couldn’t upload. Please try again.');
  };
  const sendMessage = async (body?: string) => {
    const text = (body ?? messageDraft).trim();
    if (!text || sendingMessage || !session?.access_token || !slug) return;
    setSendingMessage(true);
    const localId = `local-${Date.now()}`;
    setMessages(current => [...current, { id: localId, sender: 'customer', body: text, created_at: new Date().toISOString() }]);
    if (!body) setMessageDraft('');
    scrollToLatest();
    try {
      await postMessage(session.access_token, slug, text, 'customer');
      await loadMessagesNow();
    } catch {
      setMessages(current => current.filter(m => m.id !== localId));
      if (!body) setMessageDraft(text);
      Alert.alert('Message not sent', 'Check your connection and try again.');
    }
    finally { setSendingMessage(false); }
  };

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const handlePay = async () => {
    setPayBusy(true); setPayError('');
    try {
      const email = session?.user?.email || data.contactEmail || data.email;
      const res = await fetch(PAYMENT_SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'essential', billing: annual ? 'annual' : 'monthly', email, slug, domain: domain ? domain + suffix : '' }),
      });
      const json = await res.json();
      if (!res.ok || !json.paymentIntentClientSecret) throw new Error(json.error || 'Could not set up payment.');
      const init = await initPaymentSheet({
        merchantDisplayName: 'BrightSite',
        customerId: json.customerId,
        customerEphemeralKeySecret: json.ephemeralKey,
        paymentIntentClientSecret: json.paymentIntentClientSecret,
        defaultBillingDetails: { email },
        returnURL: 'app.brightsite.mobile://stripe-redirect',
        appearance: { colors: { primary: C.primary }, shapes: { borderRadius: 12 } },
      });
      if (init.error) throw new Error(init.error.message);
      const result = await presentPaymentSheet();
      if (result.error) { if (result.error.code !== 'Canceled') setPayError(result.error.message); return; }
      setShowPlanModal(false);
      const confirm = await fetch(CONFIRM_PAYMENT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionId: json.subscriptionId }) });
      if (confirm.ok) { onPaid?.(annual); Alert.alert('You’re live! 🎉', `Your website is now online${domain ? ` at ${domain}${suffix}` : ''}. It can take a few minutes for a new domain to start working.`); }
      else Alert.alert('Payment received', 'Thanks! We’re finishing setting up your website and will message you as soon as it’s live.');
    } catch (err: any) {
      try {
        const email = session?.user?.email || data.contactEmail || data.email;
        const fb = await fetch('https://api.brightsite.app/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: 'essential', billing: annual ? 'annual' : 'monthly', email, slug, domain: domain ? domain + suffix : '', ui_mode: 'hosted' }),
        });
        const fbJson = await fb.json();
        if (fb.ok && fbJson.url) { await Linking.openURL(fbJson.url); setShowPlanModal(false); return; }
      } catch { /* fallback also failed */ }
      setPayError(err.message || 'Payment failed. Please try again.');
    }
    finally { setPayBusy(false); }
  };

  const checkIfNowLive = async () => {
    if (!session?.access_token || !slug) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/businesses?select=data&id=eq.${encodeURIComponent(slug)}`, { headers: authHeaders(session.access_token) });
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.data?.published || row?.data?.planActive) onMakeLive?.();
    } catch { /* webhook may not have landed yet — the user can just reopen the app */ }
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && (isReadyRef.current)) void checkIfNowLive(); });
    return () => sub.remove();
  }, [session?.access_token, slug]);

  const isLive = websiteStatus === 'live';
  const isBuilding = websiteStatus === 'building';
  const isReady = websiteStatus === 'ready';
  const isReadyRef = useRef(isReady);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  const status = isLive ? { label: 'Live', color: C.success, bg: C.successSoft }
    : isBuilding ? { label: 'Being built', color: C.warning, bg: C.warningSoft }
    : isPaying ? { label: 'Offline', color: C.danger, bg: C.dangerSoft }
    : { label: 'Ready to publish', color: C.primary, bg: C.primarySoft };
  const confirmOffline = () => Alert.alert('Take your website offline?', 'Visitors won’t be able to see it until you put it live again. Your plan and content stay as they are.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Take offline', style: 'destructive', onPress: () => onTakeOffline?.() },
  ]);
  const goLive = () => { if (isPaying) void onGoLive?.(); else void openPlanModal(); };
  const confirmSignOut = () => Alert.alert('Log out?', 'Your website and details stay saved to your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: () => onSignOut?.() },
  ]);
  const domainLabel = domain ? `${domain}${suffix}` : 'Not chosen yet';

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="dark" />
    <View style={s.dashboardScreen}>
      <View style={s.dashboardBrandRow}>
        <Logo height={17} />
        <View style={[s.statusPill, { backgroundColor: status.bg }]}><View style={[s.statusDot, { backgroundColor: status.color }]} /><Text style={[s.statusPillText, { color: status.color }]}>{status.label}</Text></View>
      </View>
      <View style={s.dashboardTabsTop}>{['Website', 'Messages', 'Account'].map(name => <Pressable key={name} onPress={() => setTab(name)} style={[s.dashboardTab, tab === name && s.dashboardTabOn]}><Text style={[s.dashboardTabText, tab === name && s.dashboardTabTextOn]}>{name}</Text></Pressable>)}</View>
      {!!saveError && <View style={s.saveBanner}><Ionicons name="alert-circle" size={16} color={C.danger} /><Text style={s.saveBannerText}>{saveError}</Text></View>}
      <ScrollView ref={scrollRef} contentContainerStyle={s.dashboardContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onContentSizeChange={() => { if (tab === 'Messages') scrollToLatest(); }}>
        {tab === 'Account' && <>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Plan</Text>
            <Text style={s.dashboardCardTitle}>{isPaying ? (planAnnual ? 'Essential · Annual' : 'Essential · Monthly') : 'No plan yet'}</Text>
            <Text style={s.dashboardCardText}>{isPaying ? (planAnnual ? '£17/month, billed £204 yearly' : '£19/month') : 'Choose a plan when you’re ready to go live.'}</Text>
          </View>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Domain</Text>
            <Text style={s.dashboardCardTitle}>{domainLabel}</Text>
            <Text style={s.dashboardCardText}>{isLive ? 'Connected to your website' : domain ? 'Connects when your website goes live' : 'You can choose one when you go live'}</Text>
          </View>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Login email</Text>
            <Text style={s.dashboardCardTitle}>{session?.user?.email || data.email || '—'}</Text>
            <Pressable onPress={() => setShowPassword(true)} style={s.cardLink} hitSlop={8}><Ionicons name="key-outline" size={15} color={C.primary} /><Text style={s.cardLinkText}>Change password</Text></Pressable>
          </View>
          <ChangePasswordModal visible={showPassword} onClose={() => setShowPassword(false)} />
          <Pressable onPress={confirmSignOut} style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}><Ionicons name="log-out-outline" size={17} color={C.danger} /><Text style={[s.secondaryBtnText, { color: C.danger }]}>Log out</Text></Pressable>
        </>}
        {tab === 'Website' && <>
          <View style={[s.dashboardWebsiteHead, { zIndex: 20 }]}>
            {(isReady || isLive) && !isBuilding
              ? <Pressable onPress={isLive ? confirmOffline : goLive} style={({ pressed }) => [s.makeLiveBtn, isLive && s.makeLiveBtnLive, pressed && s.pressed]}>
                  <Ionicons name={isLive ? 'cloud-offline-outline' : 'rocket-outline'} size={13} color="#fff" />
                  <Text style={s.makeLiveBtnText}>{isLive ? 'Take Offline' : 'Make Live'}</Text>
                </Pressable>
              : <View />}
            {!isBuilding && <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' as any }}><DeviceToggle mode={previewMode} setMode={setPreviewMode} /></View>}
            <View>
              <Pressable onPress={() => isBuilding ? onEditInfo?.() : setShowEditMenu(v => !v)} style={({ pressed }) => [s.dashboardEdit, pressed && s.pressed]}>
                <Ionicons name="create-outline" size={15} color={C.ink} /><Text style={s.dashboardEditText}>{isBuilding ? 'Edit info' : 'Edit'}</Text>
                {!isBuilding && <Ionicons name={showEditMenu ? 'chevron-up' : 'chevron-down'} size={14} color={C.inkMuted} />}
              </Pressable>
              {showEditMenu && <View style={s.editMenu}>
                <Pressable onPress={() => { setShowEditMenu(false); onEditInfo?.(); }} style={({ pressed }) => [s.editMenuItem, pressed && { backgroundColor: C.primarySoft }]}>
                  <Ionicons name="storefront-outline" size={17} color={C.primary} /><View><Text style={s.editMenuTitle}>Business info</Text><Text style={s.editMenuSub}>Details, hours, services and photos</Text></View>
                </Pressable>
              </View>}
            </View>
          </View>
          {isBuilding
            ? <View style={s.buildingCard}><ActivityIndicator size="large" color={C.primary} style={{ marginBottom: 14 }} /><Text style={s.buildingText}>Building your preview</Text><Text style={s.buildingSub}>You’ll get a message here as soon as it’s ready to review.</Text></View>
            : <>
              {previewMode === 'desktop' ? <Pressable onPress={() => isLive ? void Linking.openURL(siteUrl) : onEdit?.()} style={s.desktopFrame}>
                <View style={s.desktopBar}><View style={s.previewDots}><View style={s.previewDot} /><View style={s.previewDot} /><View style={s.previewDot} /></View><Text style={s.desktopBarUrl} numberOfLines={1}>{domain ? `${domain}${suffix}` : 'yourwebsite.co.uk'}</Text></View>
                <View pointerEvents="none" style={{ height: DESKTOP_VIEW_H, overflow: 'hidden' }}>
                  <ScaledView virtualWidth={DESKTOP_WIDTH} width={DESKTOP_VIEW_W}><SitePreview desktop palette={palette} font={font} page={0} editing={false} businessName={data.businessName} category={data.category} servicesData={services} hoursData={hours} media={media} contactData={{ email: data.contactEmail, phone: data.phone, address: data.address, instagram: data.instagram, facebook: data.facebook, reviewSource: data.reviewSource, reviewLink: data.reviewLink }} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} /></ScaledView>
                </View>
                {isLive && <View style={s.previewOpenBadge}><Ionicons name="open-outline" size={12} color="#fff" /><Text style={s.previewOpenText}>Open site</Text></View>}
              </Pressable>
              : <Pressable onPress={() => isLive ? void Linking.openURL(siteUrl) : onEdit?.()} style={s.phoneFrame}>
                <View pointerEvents="none" style={{ overflow: 'hidden', flex: 1 }}>
                  <ScaledView virtualWidth={MOBILE_WIDTH} width={DASHBOARD_PREVIEW_WIDTH - 14}><SitePreview palette={palette} font={font} page={0} editing={false} businessName={data.businessName} category={data.category} servicesData={services} hoursData={hours} media={media} contactData={{ email: data.contactEmail, phone: data.phone, address: data.address, instagram: data.instagram, facebook: data.facebook, reviewSource: data.reviewSource, reviewLink: data.reviewLink }} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} /></ScaledView>
                </View>
                {isLive && <View style={s.previewOpenBadge}><Ionicons name="open-outline" size={12} color="#fff" /><Text style={s.previewOpenText}>Open site</Text></View>}
              </Pressable>}
            </>}
        </>}
        {tab === 'Messages' && <>
          <View style={[s.messageBubble, s.messageBubbleReceived]}><Text style={s.messageText}>{`Hey ${data.fullName?.trim().split(' ')[0] || 'there'}, welcome to BrightSite! My name is Tom and I’ll be your ${buildChoice === 'designer' ? 'designer and support' : 'support'}. ${buildChoice === 'designer' ? 'I’m working on your preview now, so let me know if you have any requests or questions.' : 'Love your design! Let me know if you have any requests or questions.'} When you’re ready, just hit Make Live to put your website online!`}</Text></View>
          <Text style={[s.messageMeta, s.messageMetaReceived]}>Tom · BrightSite</Text>
          {messages.filter(m => !(m.sender === 'admin' && m.body.startsWith('Welcome to BrightSite'))).map((m, i) => {
            const mine = m.sender === 'customer';
            const showDay = i === 0 || dayLabel(m.created_at) !== dayLabel(messages[i - 1].created_at);
            const lastOfRun = i === messages.length - 1 || messages[i + 1].sender !== m.sender || dayLabel(messages[i + 1].created_at) !== dayLabel(m.created_at);
            const pending = m.id.startsWith('local-');
            return <React.Fragment key={m.id}>
              {showDay && <Text style={s.messageDay}>{dayLabel(m.created_at)}</Text>}
              <Pressable onLongPress={() => handleLongPressMessage(m)} style={[s.messageBubble, mine ? s.messageBubbleSent : s.messageBubbleReceived, !lastOfRun && { marginBottom: 3 }]}>
                {isImageMessage(m.body) ? <Image source={{ uri: m.body }} style={s.messageImage} resizeMode="cover" /> : <Text style={[s.messageText, mine && { color: '#fff' }]}>{m.body}</Text>}
              </Pressable>
              {lastOfRun && <Text style={[s.messageMeta, mine ? s.messageMetaSent : s.messageMetaReceived]}>{mine ? 'You' : 'Tom'} · {pending ? 'Sending…' : timeLabel(m.created_at)}</Text>}
            </React.Fragment>;
          })}
        </>}
      </ScrollView>
      {tab === 'Messages' && <View style={[s.messageInputFixed, kbOpen && { paddingBottom: 10 }]}>
        <Pressable onPress={() => void attachImage()} hitSlop={10} style={s.messageIconBtn} accessibilityLabel="Attach photo">
          <Ionicons name="image-outline" size={22} color={C.inkSoft} />
        </Pressable>
        <TextInput style={s.messageInputField} value={messageDraft} onChangeText={setMessageDraft} placeholder="Message Tom…" placeholderTextColor={C.placeholder} autoCapitalize="sentences" autoCorrect spellCheck keyboardType="default" enablesReturnKeyAutomatically multiline />
        <Pressable onPress={() => void sendMessage(undefined)} disabled={!messageDraft.trim() || sendingMessage} hitSlop={10} style={[s.messageSendBtn, (!messageDraft.trim() || sendingMessage) && { opacity: .35 }]} accessibilityLabel="Send message">
          {sendingMessage ? <ActivityIndicator size="small" color={C.ink} /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
        </Pressable>
      </View>}
    </View>
    <Modal visible={showPlanModal} transparent animationType="slide" onRequestClose={() => setShowPlanModal(false)}>
      <View style={s.planModalOverlay}>
        <View style={s.planModalBox}>
          <View style={s.planModalHeader}><Text style={s.planModalTitle}>Choose your plan</Text><Pressable onPress={() => setShowPlanModal(false)} hitSlop={10}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          <Text style={s.planModalSub}>Your website is free. You only pay for hosting.</Text>
          <View style={s.planModalDomain}><Ionicons name="globe-outline" size={14} color={C.primary} /><Text style={s.planModalDomainText}>{domain}{suffix}</Text></View>
          <View style={s.planModalFeeNote}>
            <Ionicons name="information-circle-outline" size={14} color={C.inkMuted} />
            <Text style={s.planModalFeeText}>
              {domainPriceLoading ? 'Checking domain registration price…' : domainPriceLabel ? `Plus ${domainPriceLabel} to register ${domain}${suffix} (charged today, renews yearly).` : `A separate domain registration fee for ${domain}${suffix} is charged at checkout.`}
            </Text>
          </View>
          <Pressable onPress={() => setAnnual(false)} style={[s.planModalOption, !annual && s.planModalOptionOn]}>
            <View><Text style={s.planModalOptionName}>Monthly</Text><Text style={s.planModalOptionNote}>Cancel any time</Text></View>
            <Text style={s.planModalOptionPrice}>£19<Text style={{ fontSize: 12 }}>/mo</Text></Text>
          </Pressable>
          <Pressable onPress={() => setAnnual(true)} style={[s.planModalOption, annual && s.planModalOptionOn]}>
            <View><View style={s.savePill}><Text style={s.savePillText}>SAVE £24</Text></View><Text style={s.planModalOptionName}>Annual</Text><Text style={s.planModalOptionNote}>Billed £204 yearly</Text></View>
            <Text style={s.planModalOptionPrice}>£17<Text style={{ fontSize: 12 }}>/mo</Text></Text>
          </Pressable>
          {!!payError && <Text style={{ fontFamily: FONT, fontSize: 12, color: C.danger, marginTop: 8 }}>{payError}</Text>}
          <Pressable onPress={() => void handlePay()} disabled={payBusy} style={[s.planModalPayBtn, payBusy && { opacity: .6 }]}>
            {payBusy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="lock-closed" size={15} color="#fff" /><Text style={s.planModalPayBtnText}>Pay securely</Text></>}
          </Pressable>
        </View>
      </View>
    </Modal>
  </KeyboardAvoidingView>;
}

function DesignEditorFullscreen({ media, palette, setPalette, font, setFont, siteTexts, setSiteTexts, homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections, data, services, hours, contactForm, onBack, onConfirm }: any) {
  const [tool, setTool] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [editingText, setEditingText] = useState<{ key: string; label: string; current: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const { width: winW, height: winH } = useWindowDimensions();
  const landscape = winW > winH;
  useEffect(() => {
    void ScreenOrientation.lockAsync(previewMode === 'desktop' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [previewMode]);
  useEffect(() => () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); }, []);
  const urlLabel = `${(data.businessName || 'yourwebsite').toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`;
  const toolProps = { active: tool, setActive: setTool, palette, setPalette, font, setFont, setEditing, homeSections, setHomeSections, servicesSections, setServicesSections, contactSections, setContactSections };
  const preview = (desktop: boolean) => <SitePreview desktop={desktop} palette={palette} font={font} page={previewPage} onPageChange={setPreviewPage} editing={editing} siteTexts={siteTexts} onEditText={(key: string, current: string) => { const labels: Record<string, string> = { headline: 'Hero headline', heroBody: 'Hero subtext', aboutTitle: 'About title', aboutBody: 'About description', brand: 'Brand name' }; setEditingText({ key, label: labels[key] || key, current }); }} businessName={data.businessName} category={data.category} servicesData={services} hoursData={hours} contactData={{ email: data.contactEmail, phone: data.phone, address: data.address, instagram: data.instagram, facebook: data.facebook, reviewSource: data.reviewSource, reviewLink: data.reviewLink }} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} media={media} />;
  const frameW = landscape ? winW - 120 : DESKTOP_VIEW_W;
  const desktopFrame = <View style={[s.desktopFrame, { marginBottom: 0, width: frameW + 12, alignSelf: 'center' }, landscape && { flex: 1 }]}>
    <View style={s.desktopBar}><View style={s.previewDots}><View style={s.previewDot} /><View style={s.previewDot} /><View style={s.previewDot} /></View><Text style={s.desktopBarUrl} numberOfLines={1}>{urlLabel}</Text></View>
    <ScrollView style={landscape ? { flex: 1 } : { height: DESKTOP_VIEW_H }} showsVerticalScrollIndicator={false}><ScaledView virtualWidth={DESKTOP_WIDTH} width={frameW}>{preview(true)}</ScaledView></ScrollView>
  </View>;
  const editModal = <TextEditModal visible={!!editingText} value={editingText ? (siteTexts[editingText.key] || editingText.current) : ''} label={editingText?.label || ''} onSave={(v: string) => setSiteTexts((t: any) => ({ ...t, [editingText!.key]: v }))} onClose={() => setEditingText(null)} />;

  if (landscape) return <View style={{ flex: 1, backgroundColor: '#070D12' }}>
    <StatusBar hidden />
    {editModal}
    <View style={s.landBar}>
      <Pressable onPress={onBack} style={[s.fsBackBtn, s.toolButtonSmall]} accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={C.primary} /></Pressable>
      <DesignTools landscape {...toolProps} />
      <View style={{ flex: 1 }} />
      <DeviceToggle dark mode={previewMode} setMode={setPreviewMode} />
      <Pressable onPress={onConfirm} style={[s.fsTickBtn, s.toolButtonSmall]} accessibilityLabel="Save design"><Ionicons name="checkmark" size={20} color="#fff" /></Pressable>
    </View>
    {!!tool && <LandscapeToolStrip {...toolProps} />}
    <View style={{ flex: 1, zIndex: 0, paddingHorizontal: 54, paddingBottom: 14, paddingTop: 6 }}>{desktopFrame}</View>
  </View>;

  return <View style={{ flex: 1, backgroundColor: '#070D12' }}>
    <StatusBar style="light" />
    {editModal}
    <View style={s.fsBrowserBar}>
      <View style={s.fsSlot}><Pressable onPress={onBack} style={s.fsBackBtn}><Ionicons name="chevron-back" size={22} color={C.primary} /></Pressable></View>
      <View style={s.fsBrowserRight}>
        <DesignTools {...toolProps} />
        <View style={s.fsSlot}><Pressable onPress={onConfirm} style={s.fsTickBtn}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </Pressable></View>
      </View>
    </View>
    <View style={s.editorToggleRow}><DeviceToggle dark mode={previewMode} setMode={setPreviewMode} /></View>
    {previewMode === 'desktop'
      ? <View style={s.editorDesktopStage}>{desktopFrame}</View>
      : <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>{preview(false)}</ScrollView>}
  </View>;
}

function AppInner({ onSignedOut }: { onSignedOut: () => void }) {
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
  const railOpacity = useRef(new Animated.Value(.32)).current;
  const revealRail = () => { if (railTimer.current) clearTimeout(railTimer.current); Animated.timing(railOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start(); };
  const hideRailSoon = () => { railTimer.current = setTimeout(() => { Animated.timing(railOpacity, { toValue: .32, duration: 120, useNativeDriver: true }).start(); }, 900); };
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [designReady, setDesignReady] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [media, setMedia] = useState<{ logo?: string; hero?: string; gallery: string[] }>({ gallery: [] });
  const [domain, setDomain] = useState('');
  const [suffix, setSuffix] = useState('.co.uk');
  const [showSuffixes, setShowSuffixes] = useState(false);
  const [domainReady, setDomainReady] = useState(false);
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainQuote, setDomainQuote] = useState<{ domain: string; priceLabel: string } | null>(null);
  const [domainError, setDomainError] = useState('');
  const [contactForm, setContactForm] = useState(false);
  const [tab, setTab] = useState('Website');
  const [siteTexts, setSiteTexts] = useState<Record<string, string>>({});
  const [homeSections, setHomeSections] = useState([...HOME_SECTIONS_DEFAULT]);
  const [servicesSections, setServicesSections] = useState([...SERVICES_SECTIONS_DEFAULT]);
  const [contactSections, setContactSections] = useState([...CONTACT_SECTIONS_DEFAULT]);
  const [appScreen, setAppScreen] = useState<'onboarding' | 'loading' | 'design-editor' | 'dashboard'>('onboarding');
  const [editFrom, setEditFrom] = useState<'onboarding' | 'dashboard'>('onboarding');
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [buildChoice, setBuildChoice] = useState<'designer' | 'template' | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<'building' | 'ready' | 'live'>('building');
  const [session, setSession] = useState<any>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [data, setData] = useState({ email: '', password: '', businessName: '', category: '', fullName: '', contactEmail: '', phone: '', website: '', instagram: '', facebook: '', address: '', reviewLink: '', reviewSource: null as null | 'Google' | 'Trustpilot' });
  const [planAnnual, setPlanAnnual] = useState(false);
  const [saveError, setSaveError] = useState('');
  const businessRecord = useRef<Record<string, any>>({});
  const [showFullName, setShowFullName] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [openReview, setOpenReview] = useState<number | null>(null);
  const [hours, setHours] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ label, start: '9:00', end: i === 3 ? '19:00' : '17:30', enabled: i < 6 })));
  const [services, setServices] = useState([{ cid: newCid(), section: '', name: '', duration: '', price: '' }]);
  const [reviewsList, setReviewsList] = useState<{ title: string; description: string; name: string }[]>([]);
  const motion = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingFades = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const designReveal = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const step = steps[index];

  const hydrateFromRecord = (record: Record<string, any>, accountEmail: string) => {
    businessRecord.current = record;
    const raw = record.raw || {};
    setData(current => ({
      ...current,
      businessName: raw.name || record.name || '',
      category: raw.tagline || '',
      fullName: raw.fullName || '',
      contactEmail: raw.email || accountEmail,
      phone: raw.phone || '',
      website: raw.website || '',
      instagram: raw.instagram || '',
      facebook: raw.facebook || '',
      address: raw.address || '',
      reviewLink: raw.reviewLink || '',
      reviewSource: raw.reviewSource || null,
    }));
    setShowFullName(!!raw.fullNameDisplay);
    if (Array.isArray(raw.hoursStructured) && raw.hoursStructured.length) {
      setHours(raw.hoursStructured.map((h: any) => ({ label: h.day, start: h.from || '', end: h.to || '', enabled: !!h.open })));
    }
    if (Array.isArray(raw.serviceGroups) && raw.serviceGroups.length) {
      const rows = raw.serviceGroups.flatMap((g: any) => { const cid = newCid(); return (g.items || []).map((it: any) => ({ cid, section: g.name || 'Services', name: it[0] || '', price: it[1] || '', duration: it[2] || '' })); });
      if (rows.length) setServices(rows);
    }
    if (Array.isArray(raw.reviewItems)) setReviewsList(raw.reviewItems);
    setMedia({ logo: raw.logoImage, hero: raw.heroImage, gallery: Array.isArray(raw.gallery) ? raw.gallery : [] });
    const chosen = record.customDomain || record.domain || raw.chosenDomain || '';
    const dot = chosen.indexOf('.');
    if (dot > 0) { setDomain(chosen.slice(0, dot)); setSuffix(chosen.slice(dot)); setDomainReady(true); }
    const design = raw.design || {};
    if (typeof design.palette === 'number' && palettes[design.palette]) setPalette(design.palette);
    if (typeof design.font === 'number' && fonts[design.font]) setFont(design.font);
    if (design.siteTexts) setSiteTexts(design.siteTexts);
    if (Array.isArray(design.homeSections)) setHomeSections(design.homeSections);
    if (Array.isArray(design.servicesSections)) setServicesSections(design.servicesSections);
    if (Array.isArray(design.contactSections)) setContactSections(design.contactSections);
    setContactForm(!!(raw.contactForm ?? design.contactForm));
    setPlanAnnual(!!raw.chosenAnnual);
    const isDesigner = raw.buildChoice === 'designer' || /Build choice: designer/.test(raw.notes || '');
    setBuildChoice(isDesigner ? 'designer' : 'template');
    const hasPreview = !!(record.demoUrl || record.previewUrl || record.liveUrl);
    setWebsiteStatus(record.published ? 'live' : isDesigner && !hasPreview ? 'building' : 'ready');
  };

  const saveBusiness = async (id: string, patch: { raw?: Record<string, any>; [key: string]: any }) => {
    const previous = businessRecord.current;
    const record = { ...previous, ...patch, slug: id, name: patch.raw?.name || previous.raw?.name || data.businessName, raw: { ...(previous.raw || {}), ...(patch.raw || {}) }, updatedAt: new Date().toISOString() };
    const row = await upsertBusiness(session, id, record.name, record);
    businessRecord.current = row?.data || record;
    return row;
  };

  const designSnapshot = () => ({ palette, font, siteTexts, homeSections, servicesSections, contactSections, contactForm });

  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    onSignedOut();
  };

  const loadAccountDestination = async (authedSession: any) => {
    const email = authedSession?.user?.email || data.email.trim();
    setAuthSession(true);
    setSession(authedSession);
    setData(current => ({ ...current, email, contactEmail: current.contactEmail || email }));
    const { data: rows, error } = await supabase
      .from('businesses')
      .select('id,data,user_id')
      .eq('user_id', authedSession.user.id)
      .limit(10);
    if (error) throw error;
    const realRow = rows?.find((row: any) => !(row.data && row.data.stub)) || rows?.[0];
    if (realRow && !(realRow.data && realRow.data.stub)) {
      setSlug(realRow.id);
      hydrateFromRecord(realRow.data || {}, email);
      Keyboard.dismiss();
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
      case 'business': return !!data.fullName.trim() && !!data.businessName.trim() && !!data.category.trim();
      case 'contact': return /\S+@\S+\.\S+/.test(data.contactEmail.trim()) || data.phone.replace(/\D/g, '').length >= 7;
      case 'hours': return hours.some(row => row.enabled && row.start.trim() && row.end.trim());
      case 'prices': return services.some(it => it.name.trim()) && services.every(it => !it.name.trim() || it.section.trim());
      case 'domain': return domainReady;
      case 'choice': return false;
      default: return true;
    }
  };
  const missingInfoText = () => ({
    login: 'Add a valid email and an 8 character password first',
    business: 'Add your full name, business name and business type first',
    contact: 'Add an email address or phone number first',
    hours: 'Keep at least one day open and add its times',
    prices: 'Add at least one service, and give each category a name',
    domain: 'Check and select an available domain first',
    choice: 'Choose an option above to continue',
  } as Record<string, string>)[step.id] || 'Complete the required details first';
  const transitionTo = (to: number) => {
    const next = Math.max(authSession ? 1 : 0, Math.min(steps.length - 1, to));
    if (next === index || transitioning.current) return;
    const forward = next > index;
    if (steps[next].id === 'domain' && !domain.trim()) setDomain(slugify(data.businessName).replace(/-/g, ''));
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

  const syncOnboardingToBackend = async (choice: 'designer' | 'template') => {
    if (!session?.user?.id) return;
    setSaveError('');
    const baseSlug = slug || slugify(domainReady ? domain : data.businessName) || `site-${session.user.id.slice(0, 8)}`;
    const hoursStructured = hours.map(h => ({ day: h.label, open: h.enabled, from: h.start, to: h.end }));
    const groups: Record<string, { name: string; items: [string, string, string][] }> = {};
    services.filter(item => item.name.trim()).forEach(item => {
      const key = item.cid;
      if (!groups[key]) groups[key] = { name: item.section.trim() || 'Services', items: [] };
      groups[key].items.push([item.name, item.price, item.duration || '']);
    });
    const reviewItems = reviewsList.filter(r => r.title.trim() || r.description.trim());
    const buildRaw = (logoImage: string | null, heroImage: string | null, gallery: (string | null)[]) => ({
      name: data.businessName,
      tagline: data.category,
      phone: data.phone,
      email: data.contactEmail || data.email,
      website: data.website,
      instagram: data.instagram,
      facebook: data.facebook,
      fullName: data.fullName,
      fullNameDisplay: showFullName,
      address: data.address,
      notes: `Build choice: ${choice}`,
      buildChoice: choice,
      reviewLink: data.reviewLink || '',
      reviewSource: data.reviewSource,
      reviewItems,
      reviewQuotes: reviewItems.map(r => [r.title, r.description, r.name].filter(Boolean).join(' — ')),
      hours: hoursStructured.map(d => `${d.day}: ${d.open ? `${d.from || '?'}–${d.to || '?'}` : 'Closed'}`),
      hoursStructured,
      serviceGroups: Object.values(groups),
      contactForm,
      logoImage: logoImage || undefined,
      heroImage: heroImage || undefined,
      gallery: gallery.filter((url): url is string => !!url),
      chosenDomain: domainReady ? domain + suffix : undefined,
      design: designSnapshot(),
    });
    // A slug owned by another account is rejected by the RPC, so try a few suffixed variants.
    for (let attempt = 0; attempt < 4; attempt++) {
      const chosenSlug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const [logoImage, heroImage, ...galleryImages] = await Promise.all([
          uploadMediaToR2(session.access_token, chosenSlug, 'logo', media.logo),
          uploadMediaToR2(session.access_token, chosenSlug, 'hero', media.hero),
          ...media.gallery.map((uri, i) => uploadMediaToR2(session.access_token, chosenSlug, `gallery_${i}`, uri)),
        ]);
        const raw = buildRaw(logoImage, heroImage, galleryImages);
        await saveBusiness(chosenSlug, { raw });
        setSlug(chosenSlug);
        setMedia({ logo: raw.logoImage, hero: raw.heroImage, gallery: raw.gallery });
        const failedUploads = [media.logo && !logoImage, media.hero && !heroImage, ...media.gallery.map((u, i) => u && !galleryImages[i])].filter(Boolean).length;
        if (failedUploads) setSaveError(`${failedUploads} photo${failedUploads > 1 ? 's' : ''} couldn’t upload. You can add them again from Edit.`);
        if (!editingInfo) await notifyStage('new_signup', data.businessName || 'Unnamed business', data.contactEmail || data.email, chosenSlug);
        return;
      } catch (err: any) {
        if (err?.conflict && !slug) continue;
        console.error('[sync] could not save business', err);
        setSaveError('We couldn’t save your details. Check your connection — we’ll try again when you tap Save.');
        return;
      }
    }
    setSaveError('We couldn’t save your details. Please try again.');
  };

  const saveDesign = async () => {
    if (!slug || !session) return;
    try { await saveBusiness(slug, { raw: { design: designSnapshot(), contactForm }, needsPublish: websiteStatus === 'live' }); setSaveError(''); }
    catch { setSaveError('Your design changes couldn’t be saved. Please try again.'); }
  };

  const setLive = async (live: boolean) => {
    if (!slug || !session) return false;
    try {
      await saveBusiness(slug, live ? { published: true, manuallyOffline: false, needsPublish: false } : { published: false, manuallyOffline: true });
      setWebsiteStatus(live ? 'live' : 'ready');
      return true;
    } catch { Alert.alert('Something went wrong', 'We couldn’t update your website. Please try again.'); return false; }
  };

  useEffect(() => {
    if (appScreen !== 'loading') return;
    loadingProgress.setValue(0);
    designReveal.setValue(0);
    loadingFades.forEach(value => value.setValue(0));
    const isTemplate = buildChoice === 'template';
    // One continuous Animated sequence, not four independent setTimeouts —
    // a run of unlinked timers each firing its own Animated.timing is fragile
    // under Fast Refresh and easy to leave half-run if the effect is ever
    // re-entered, which is what made only the first checklist line animate in.
    const checklist = Animated.sequence([0, 1, 2, 3].map(i => Animated.sequence([
      Animated.delay(i === 0 ? 520 : 580),
      Animated.parallel([
        Animated.timing(loadingFades[i], { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(loadingProgress, { toValue: (i + 1) / 4, duration: 460, useNativeDriver: false }),
      ]),
    ])));
    checklist.start(() => {
      setDesignReady(true);
      Animated.timing(designReveal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        if (isTemplate) {
          setAppScreen('design-editor');
        } else {
          setWebsiteStatus('building');
          setAppScreen('dashboard');
        }
      });
    });
    return () => checklist.stop();
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
      const inFooter = g.y0 > SCREEN_HEIGHT - CARD_BOTTOM - 48;
      return (inHeader || inFooter) && Math.abs(g.dy) > 12;
    },
    onPanResponderGrant: revealRail,
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx)) {
        const minIndex = authSession ? 1 : 0;
        if (g.dy > 0 && index <= minIndex) return;
        if (Math.abs(g.dy) > 12) setDeckDirection(g.dy < 0 ? 1 : -1);
        motion.setValue(index * CARD_TRAVEL - g.dy);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -48 || g.vy < -.55) go(index + 1); else if (g.dy > 48 || g.vy > .55) go(index - 1); else Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
      hideRailSoon();
    },
    onPanResponderTerminate: () => {
      Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
      hideRailSoon();
    },
  }), [index, step.id, data, hours, services, domainReady, designReady, keyboardVisible]);

  const railPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: revealRail,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_, g) => {
      if (g.dy < -42) go(index + 1);
      else if (g.dy > 42) go(index - 1);
      hideRailSoon();
    },
  }), [index, data, hours, services, domainReady, designReady]);

  const content = (contentStep = step) => {
    switch (contentStep.id) {
      case 'login': return <><Text style={s.heroTitle}>{authMode === 'signup' ? 'Your business website, sorted.' : 'Welcome back.'}</Text>
        <Intro>{authMode === 'signup' ? 'Answer a few quick questions and we’ll build a professional website for you. Takes about 10 minutes.' : 'Log in to continue managing your website.'}</Intro>
        <View style={s.authModes}><Pressable onPress={() => { setAuthMode('signup'); setAuthStatus(''); }} style={[s.authMode, authMode === 'signup' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'signup' && s.authModeTextOn]}>Sign up</Text></Pressable><Pressable onPress={() => { setAuthMode('login'); setAuthStatus(''); }} style={[s.authMode, authMode === 'login' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'login' && s.authModeTextOn]}>Log in</Text></Pressable></View>
        <Field label="Email" value={data.email} onChangeText={(v: string) => setData({ ...data, email: v })} placeholder="you@business.co.uk" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
        <Field label="Password" value={data.password} onChangeText={(v: string) => setData({ ...data, password: v })} placeholder="At least 8 characters" secureTextEntry textContentType={authMode === 'signup' ? 'newPassword' : 'password'} returnKeyType="done" onSubmitEditing={() => void authenticate()} />
        {!!authStatus && <Text style={s.authStatus}>{authStatus}</Text>}
        <Pressable disabled={authBusy || authChecking} onPress={() => void authenticate()} style={({ pressed }) => [s.authSubmit, pressed && s.pressed, (authBusy || authChecking) && s.authSubmitDisabled]}>{authBusy || authChecking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.authSubmitText}>{authMode === 'signup' ? 'Create account' : 'Log in'}</Text>}</Pressable></>;
      case 'business': return <><Intro>Tell us the essentials. Anything you leave blank simply won’t appear on your website.</Intro>
        <Field label="Full name" value={data.fullName} onChangeText={(v: string) => setData({ ...data, fullName: v })} placeholder="e.g. Jane Smith" />
        <Pressable onPress={() => setShowFullName(!showFullName)} style={s.nameDisplay} hitSlop={8}><View style={[s.checkbox, showFullName && s.checkboxOn]}>{showFullName && <Ionicons name="checkmark" size={13} color="#fff" />}</View><Text style={s.nameDisplayText}>Display full name on website</Text></Pressable>
        <Field label="Business name" value={data.businessName} onChangeText={(v: string) => setData({ ...data, businessName: v })} />
        <Text style={s.fieldLabel}>Business type</Text>
        <Pressable onPress={() => { Keyboard.dismiss(); setShowTypes(true); }} style={({ pressed }) => [s.input, s.selectInput, pressed && { opacity: .8 }]}>
          <Text style={[s.selectText, !data.category && { color: C.placeholder }]}>{data.category || 'Select your business type'}</Text>
          <Ionicons name="chevron-down" size={18} color={C.inkMuted} />
        </Pressable>
        <View style={{ height: 16 }} />
        <Modal visible={showTypes} transparent animationType="slide" onRequestClose={() => setShowTypes(false)}>
          <Pressable style={s.modalOverlay} onPress={() => setShowTypes(false)}>
            <Pressable onPress={() => {}} style={s.modalBox}>
              <Text style={s.modalLabel}>Business type</Text>
              <ScrollView style={{ maxHeight: SCREEN_HEIGHT * .55 }}>
                {BUSINESS_TYPES.map(type => <Pressable key={type} onPress={() => { setData({ ...data, category: type }); setShowTypes(false); }} style={[s.typeRow, data.category === type && s.typeRowOn]}>
                  <Text style={[s.typeRowText, data.category === type && { color: C.primary }]}>{type}</Text>
                  {data.category === type && <Ionicons name="checkmark" size={18} color={C.primary} />}
                </Pressable>)}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
        <Field label="Address" value={data.address} onChangeText={(v: string) => setData({ ...data, address: v })} placeholder="e.g. 12 High Street, London" /></>;
      case 'contact': return <><Intro>Add whichever ways customers should contact you.</Intro>
        <Field label="Email" value={data.contactEmail} onChangeText={(v: string) => setData({ ...data, contactEmail: v })} keyboardType="email-address" />
        <Field label="Phone (optional)" value={data.phone} onChangeText={(v: string) => setData({ ...data, phone: v })} keyboardType="phone-pad" />
        <Field label="Existing website (optional)" value={data.website} onChangeText={(v: string) => setData({ ...data, website: v })} placeholder="https://yoursite.com" />
        <Field label="Instagram (optional)" value={data.instagram} onChangeText={(v: string) => setData({ ...data, instagram: v })} placeholder="@yourbusiness" />
        <Field label="Facebook (optional)" value={data.facebook} onChangeText={(v: string) => setData({ ...data, facebook: v })} placeholder="facebook.com/yourbusiness" /></>;
      case 'hours': return <><View style={s.hoursIntro}><Intro>Switch off days you’re closed. Times can be changed later.</Intro></View><Hours rows={hours} setRows={setHours} /></>;
      case 'prices': return <><Intro>Add a category (e.g. Massages), then the services in it with their prices.</Intro><Services items={services} setItems={setServices} /></>;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[s.fieldLabel, { marginBottom: 0 }]}>Gallery</Text>
          <Text style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted }}>{media.gallery.length}/16</Text>
        </View>
        <View style={s.galleryGrid} onLayout={(e: any) => setGalleryWidth(e.nativeEvent.layout.width)}>
          <GalleryGrid gallery={media.gallery} setGallery={(gallery: string[]) => setMedia(current => ({ ...current, gallery }))} containerWidth={galleryWidth} />
          {media.gallery.length < 16 && <Pressable style={[s.galleryAdd, galleryTileSize(galleryWidth)]} onPress={async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) return;
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: .82 });
            if (!result.canceled) setMedia(current => ({ ...current, gallery: [...current.gallery, ...result.assets.map(a => a.uri)].slice(0, 16) }));
          }}><Ionicons name="add" size={26} color={C.primary} /></Pressable>}
        </View></>;
      case 'reviews': return <><Intro>Add customer reviews for your website. Each one is optional.</Intro>
        {reviewsList.map((review, i) => {
          const open = openReview === i;
          const label = review.title.trim() || 'New review';
          return <View key={i} style={[s.reviewCard, open && s.reviewCardOpen]}>
            <Pressable onPress={() => setOpenReview(open ? null : i)} style={s.reviewRow}>
              <Text style={s.reviewRowText} numberOfLines={1}>{label}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={DARK} />
            </Pressable>
            {open && <View style={s.reviewFields}>
              <Field label="Review title" value={review.title} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, title: v } : r))} placeholder="e.g. Amazing service" />
              <Field label="Review" value={review.description} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, description: v } : r))} multiline />
              <Field label="Customer name" value={review.name} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, name: v } : r))} placeholder="e.g. Jane Smith" />
              <View style={s.reviewActionsRow}>
                <Pressable onPress={() => { Alert.alert('Remove this review?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { setReviewsList(reviewsList.filter((_, n) => n !== i)); setOpenReview(null); } }]); }} style={s.reviewDeleteBtn}><Ionicons name="trash-outline" size={15} color="#A3261F" /><Text style={s.reviewDeleteText}>Remove</Text></Pressable>
                <Pressable onPress={() => setOpenReview(null)} style={s.reviewDoneBtn}><Text style={s.reviewDoneText}>Done</Text></Pressable>
              </View>
            </View>}
          </View>;
        })}
        <Pressable onPress={() => { setReviewsList([...reviewsList, { title: '', description: '', name: '' }]); setOpenReview(reviewsList.length); }} style={s.addReviewBtn}>
          <Ionicons name="add" size={16} color={DARK} /><Text style={s.addReviewText}>Add review</Text>
        </Pressable>
        <View style={s.reviewSourceCard}>
          <Text style={s.reviewSourceTitle}>Review profile links</Text>
          <Text style={s.reviewSourceSub}>Paste your review page link so visitors can see your rating.</Text>
          <Field label="Google Business link" value={data.reviewSource === 'Google' ? data.reviewLink : ''} onChangeText={(v: string) => setData({ ...data, reviewLink: v, reviewSource: v.trim() ? 'Google' : (data.reviewSource === 'Google' ? null : data.reviewSource) })} placeholder="https://g.page/your-business" />
          <Field label="Trustpilot link" value={data.reviewSource === 'Trustpilot' ? data.reviewLink : ''} onChangeText={(v: string) => setData({ ...data, reviewLink: v, reviewSource: v.trim() ? 'Trustpilot' : (data.reviewSource === 'Trustpilot' ? null : data.reviewSource) })} placeholder="https://uk.trustpilot.com/review/..." />
        </View>
        <Pressable onPress={() => setContactForm(!contactForm)} style={s.formChoice}><View style={s.formChoiceIcon}><Ionicons name="mail-outline" size={22} color={C.primary} /></View><View style={{ flex: 1 }}><Text style={s.formChoiceTitle}>Add a contact form</Text><Text style={s.formChoiceText}>Messages will arrive in your BrightSite dashboard.</Text></View><Switch value={contactForm} onValueChange={setContactForm} trackColor={{ false: 'rgba(28,40,50,.18)', true: C.primary }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as any)} /></Pressable></>;
      case 'choice': if (editingInfo) return <View style={s.choiceWrap}>
        <Text style={s.choiceHeading}>All done?</Text>
        <Text style={s.choiceSub}>Save your changes and they’ll update on your website.</Text>
        <Pressable disabled={savingInfo} onPress={async () => { setSavingInfo(true); await syncOnboardingToBackend(buildChoice || 'template'); setSavingInfo(false); setEditingInfo(false); setTab('Website'); setAppScreen('dashboard'); }} style={({ pressed }) => [s.primaryBtn, pressed && s.pressed, savingInfo && { opacity: .6 }]}>
          {savingInfo ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.primaryBtnText}>Save changes</Text></>}
        </Pressable>
      </View>;
      return <View style={s.choiceWrap}>
        <Text style={s.choiceHeading}>You're all set!</Text>
        <Text style={s.choiceSub}>Your details have been sent to our designer. Your preview will be ready in 1–2 days.</Text>
        <Pressable onPress={() => { void syncOnboardingToBackend('designer'); setBuildChoice('designer'); setAppScreen('loading'); }} style={s.choiceCard}>
          <View style={[s.choiceIcon, { backgroundColor: C.successSoft }]}><Ionicons name="person-outline" size={26} color={C.success} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.choiceCardTitle}>Send to Designer</Text>
            <Text style={s.choiceCardText}>Tom builds your website for you. Preview ready in 1–2 days.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.inkMuted} />
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
          <TextInput style={s.domainInput} value={domain} placeholder="yourbusiness" placeholderTextColor={C.placeholder} autoCorrect={false} onChangeText={(value) => { setDomain(value); clearDomainQuote(); }} autoCapitalize="none" /><View style={{ position: 'relative' }}><Pressable onPress={() => setShowSuffixes(!showSuffixes)} style={s.suffixButton} hitSlop={6}><Text style={s.domainSuffix}>{suffix}</Text><Ionicons name={showSuffixes ? 'chevron-up' : 'chevron-down'} size={14} color={C.ink} /></Pressable>
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

  if (index === 0 && appScreen === 'onboarding') return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.loginStage}>
      <View style={[s.card, s.loginCard]}>
        
        <View style={s.loginHeader}><Logo height={20} /><Image source={require('./assets/brightsite-icon.png')} style={s.loginAppIcon} /></View>
        <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          {content(steps[0])}
        </ScrollView>
      </View>
    </View>
  </FlowBackdrop>;

  if (appScreen === 'dashboard') return <FadeIn><DashboardHome tab={tab} setTab={setTab} data={data} domain={domain} suffix={suffix} palette={palette} font={font} services={services} hours={hours} contactForm={contactForm} homeSections={homeSections} servicesSections={servicesSections} contactSections={contactSections} websiteStatus={websiteStatus} session={session} slug={slug || slugify(domainReady ? domain : data.businessName)} onMakeLive={() => setWebsiteStatus('live')} onPaid={(isAnnual: boolean) => { businessRecord.current = { ...businessRecord.current, planActive: true, published: true }; setPlanAnnual(isAnnual); setWebsiteStatus('live'); }} onEditInfo={() => { setEditingInfo(true); setIndex(1); motion.setValue(CARD_TRAVEL); setDeckDirection(0); setAppScreen('onboarding'); }} onTakeOffline={() => setLive(false)} onGoLive={() => setLive(true)} onSignOut={signOut} saveError={saveError} planAnnual={planAnnual} media={media} isPaying={!!businessRecord.current.planActive} buildChoice={buildChoice} onEdit={() => { setEditFrom('dashboard'); setAppScreen('design-editor'); }} /></FadeIn>;

  if (appScreen === 'design-editor') return <FadeIn><DesignEditorFullscreen palette={palette} setPalette={setPalette} font={font} setFont={setFont} siteTexts={siteTexts} setSiteTexts={setSiteTexts} homeSections={homeSections} setHomeSections={setHomeSections} servicesSections={servicesSections} setServicesSections={setServicesSections} contactSections={contactSections} setContactSections={setContactSections} data={data} services={services} hours={hours} contactForm={contactForm} onBack={() => {
    if (editFrom === 'dashboard') { setAppScreen('dashboard'); return; }
    setAppScreen('onboarding');
    setIndex(steps.findIndex(item => item.id === 'domain'));
    motion.setValue(steps.findIndex(item => item.id === 'domain') * CARD_TRAVEL);
  }} media={media} onConfirm={() => { if (websiteStatus !== 'live') setWebsiteStatus('ready'); void saveDesign(); setTab('Website'); setAppScreen('dashboard'); }} /></FadeIn>;

  if (appScreen === 'loading') {
    const messages = buildChoice === 'template' ? LOADING_MESSAGES.template : LOADING_MESSAGES.designer;
    return <FlowBackdrop>
      <StatusBar style="light" />
      <Animated.View style={[s.fullLoading, { opacity: designReveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <View style={{ alignItems: 'center', marginBottom: 36 }}><Logo height={30} tint="#fff" /></View>
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
          return <Animated.View key={deckStep.id} pointerEvents={isActive ? 'auto' : 'none'} {...(isActive ? pan.panHandlers : {})} style={[s.card, s.deckCard, isActive ? s.deckCardActive : s.deckCardBehind, { zIndex: isActive ? 22 : 20 - Math.abs(distance), transform: [{ translateY: travelPosition }, { scale: cardScale }] }]}>

            <View style={s.cardHeader}><Text style={s.cardTitle}>{editingInfo && deckStep.id === 'choice' ? 'Save changes' : deckStep.title}</Text>{editingInfo ? <Pressable onPress={() => { setEditingInfo(false); setAppScreen('dashboard'); }} hitSlop={10} style={s.closeEditBtn} accessibilityLabel="Close without saving"><Ionicons name="close" size={20} color={C.ink} /></Pressable> : deckIndex > 0 && <Text style={s.count}>{deckIndex}/{setupStepIndexes.length}</Text>}</View>
            <ScrollView style={s.cardScroll} contentContainerStyle={[s.content, deckStep.id === 'login' && s.loginContent, deckStep.id === 'hours' && s.hoursContent]}
              scrollEnabled={!['hours', 'business', 'contact'].includes(deckStep.id) || keyboardVisible}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
              {content(deckStep)}
            </ScrollView>
            <View pointerEvents="none" style={s.fixedPrompt}>
              {!!validationMessage && isActive && <Text style={s.validationText}>{validationMessage}</Text>}
              <View style={s.swipeRow}>{deckStep.id === 'login' && (authBusy || authChecking) ? <ActivityIndicator size="small" color={C.ink} /> : <Ionicons name="arrow-up" size={14} color={C.ink} />}<Text style={s.swipeHint}>{deckStep.id === 'login' ? authChecking ? 'Checking your account…' : authBusy ? authMode === 'signup' ? 'Creating your account…' : 'Logging you in…' : authMode === 'signup' ? 'Swipe up to create account' : 'Swipe up to log in' : deckStep.id === 'choice' ? (editingInfo ? 'Tap Save changes above' : 'Tap to continue') : deckStep.id === 'domain' && domainReady ? 'Swipe up to send to designer' : 'Swipe up to save'}</Text></View>
            </View>
          </Animated.View>;
        })}
      </View>
      <Animated.View style={[s.rail, { opacity: railOpacity }]} {...railPan.panHandlers}>{setupStepIndexes.map((actual) => {
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
      })}</Animated.View>
    </View>
  </FlowBackdrop>;
}

export default function App() {
  const [generation, setGeneration] = useState(0);
  useEffect(() => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); }, []);
  return <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.app.brightsite.mobile" urlScheme="app.brightsite.mobile">
    <AppInner key={generation} onSignedOut={() => setGeneration(g => g + 1)} />
  </StripeProvider>;
}

const s = StyleSheet.create({
  stage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 72, paddingHorizontal: 0 },
  loginStage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 20, paddingHorizontal: 18 }, loginCard: { flex: 1 },
  loginHeader: { minHeight: 78, paddingLeft: 26, paddingRight: 18, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, loginAppIcon: { width: 48, height: 48, borderRadius: 15, shadowColor: '#1C69E8', shadowOpacity: .28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  card: { flex: 1, zIndex: 2, borderRadius: 30, backgroundColor: CARD, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', shadowColor: '#000', shadowOpacity: .62, shadowRadius: 31, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  deckCard: { position: 'absolute', top: CARD_TOP, bottom: CARD_BOTTOM, left: 6, right: 6 },
  deckCardActive: { shadowColor: '#13306B', shadowOpacity: .3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 }, deckCardBehind: { shadowOpacity: .12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardHeader: { minHeight: 72, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, elevation: 100 },
  cardScroll: { flex: 1, zIndex: 1, elevation: 1, overflow: 'hidden' },
  cardTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', letterSpacing: -.5, color: C.ink }, count: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkMuted },
  content: { paddingTop: 24, paddingLeft: 30, paddingRight: 24, paddingBottom: 84 }, loginContent: { flex: 1, paddingTop: 12, paddingBottom: 18 }, intro: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: C.inkSoft, marginBottom: 20 },
  fieldWrap: { marginBottom: 16 }, fieldLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkSoft, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: C.ink, backgroundColor: C.field, borderWidth: 1, borderColor: C.line, outlineWidth: 0 },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  nameDisplay: { marginTop: -3, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.lineStrong, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: BRAND, borderColor: BRAND },
  nameDisplayText: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: C.inkSoft }, pressed: { transform: [{ scale: .96 }], opacity: .86 },
  heroTitle: { fontFamily: FONT, fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -.8, color: C.ink, marginBottom: 8 },
  authModes: { height: 44, padding: 4, borderRadius: 14, flexDirection: 'row', backgroundColor: 'rgba(28,40,50,.08)', marginBottom: 16 }, authMode: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, authModeOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }, authModeText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.inkMuted }, authModeTextOn: { color: C.ink }, authStatus: { marginTop: -2, fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '600', color: C.danger, textAlign: 'center' },
  authSubmit: { height: 52, marginTop: 12, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, authSubmitDisabled: { opacity: .62 }, authSubmitText: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#fff' }, hoursContent: { padding: 0 }, hoursIntro: { paddingHorizontal: 30, paddingTop: 24 }, hoursCard: { minHeight: SCREEN_HEIGHT * .57, overflow: 'hidden' },
  hoursRow: { flex: 1, minHeight: 58, paddingLeft: 30, paddingRight: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.lineStrong }, hoursRowLast: { borderBottomWidth: 0 }, hoursDay: { width: 43, fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#1C2832' }, hoursTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, timeInput: { width: 66, height: 36, borderRadius: 10, paddingHorizontal: 8, backgroundColor: C.field, color: C.ink, fontFamily: FONT, fontSize: 14, textAlign: 'center', borderWidth: 1, borderColor: C.line, outlineWidth: 0 }, timeInputOff: { width: 66, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }, timeOffText: { fontFamily: FONT, color: C.inkMuted, fontSize: 13 }, timeDash: { fontFamily: FONT, fontSize: 13, color: C.inkSoft }, hoursSwitch: { width: 52, alignItems: 'flex-end' },
  upload: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, overflow: 'hidden' },
  uploadPreview: { width: 52, height: 52, borderRadius: 15, marginBottom: 9 }, uploadPreviewFill: { width: '100%', height: '100%' },
  uploadIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,.12)', marginBottom: 10 },
  uploadTitle: { fontFamily: FONT, fontWeight: '800', fontSize: 14, color: '#1C2832' }, uploadSub: { fontFamily: FONT, fontSize: 11, color: C.inkSoft, marginTop: 3 }, swipeHint: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center' },
  cardFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, zIndex: 110, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  fixedPrompt: { position: 'absolute', left: 18, right: 18, bottom: 14, zIndex: 120, elevation: 120, alignItems: 'center', gap: 7 }, swipeRow: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.7)' }, validationText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.danger, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.dangerSoft, overflow: 'hidden' },
  serviceRow: { flexDirection: 'row', gap: 10, marginTop: 5, alignItems: 'center' }, serviceInput: { minWidth: 0, height: 48, borderRadius: 12, paddingHorizontal: 10, fontFamily: FONT, fontSize: 14, color: C.ink, backgroundColor: C.field, borderWidth: 1, borderColor: C.line, outlineWidth: 0 }, serviceDelete: { width: 28, height: 48, alignItems: 'center', justifyContent: 'center' }, sectionDelete: { width: 28, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.lineStrong, marginVertical: 16 }, addService: { marginTop: 14, height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primaryBorder, backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addSectionBtn: { marginTop: 8, borderColor: C.lineStrong, backgroundColor: 'transparent' }, addServiceText: { fontFamily: FONT, fontWeight: '700', fontSize: 14, color: C.ink }, site: { overflow: 'hidden' },
  previewBrowserWrap: { backgroundColor: 'rgba(8,15,20,.9)' },
  previewBrowser: { height: 29, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  previewDots: { position: 'absolute', left: 11, flexDirection: 'row', gap: 4 }, previewDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.35)' }, previewAddress: { fontFamily: FONT, fontSize: 8, color: 'rgba(255,255,255,.54)' },
  previewPageNav: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  previewPageTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  previewPageTabText: { fontFamily: FONT, fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,.45)', letterSpacing: .5 },
  siteHero: { height: SCREEN_HEIGHT * .36, padding: 18, justifyContent: 'space-between' },
  siteHeroImg: { width: '100%', height: 260 },
  siteHeroImgDesktop: { height: 520 },
  siteHeroCopy: { paddingHorizontal: 28, paddingVertical: 28 },
  siteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, siteKicker: { fontFamily: FONT, fontSize: 14, letterSpacing: 2, fontWeight: '700' }, siteNav: { flexDirection: 'row', alignItems: 'center', gap: 10 }, siteNavText: { fontFamily: FONT, fontSize: 12, letterSpacing: .7, color: 'rgba(255,255,255,.78)' }, siteCopy: { maxWidth: '76%' },
  siteHeadline: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 38, lineHeight: 44, marginBottom: 10 },
  siteBody: { fontFamily: FONT, fontSize: 16, lineHeight: 24 }, editing: { borderWidth: 1, borderColor: BRAND, borderRadius: 4, padding: 2 },
  siteCta: { marginTop: 0, alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 22, borderWidth: 1.5 }, siteCtaText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', letterSpacing: 1.4 },
  siteCtaFilled: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 6, alignItems: 'center', alignSelf: 'flex-start' }, siteCtaFilledText: { fontFamily: FONT, fontSize: 14, fontWeight: '800' }, siteSectionTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 30, lineHeight: 36, marginBottom: 8 }, siteSectionBody: { fontFamily: FONT, fontSize: 15, lineHeight: 22, opacity: .68 },
  siteEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' as any, marginBottom: 8 },
  heroButtons: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  heroTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  heroTag: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.15)' },
  heroTagText: { fontSize: 11, color: 'rgba(255,255,255,.8)', letterSpacing: .4 },
  siteSection: { padding: 28 },
  siteAboutDesktopRow: { flexDirection: 'row', gap: 24 },
  siteAboutCard: { padding: 18, borderRadius: 12, borderWidth: 1 },
  siteAboutCardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' as any, marginBottom: 5 },
  siteAboutCardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 7 },
  siteAboutCardCta: { fontSize: 13, fontWeight: '600' },
  siteReviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  siteReviewCard: { flex: 1, minWidth: '28%', padding: 16, borderRadius: 12 },
  siteGalleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  siteCTABand: { alignItems: 'center', paddingVertical: 40 },
  siteFooter: { padding: 28, paddingBottom: 32 },
  siteFooterCols: { flexDirection: 'row', gap: 24, marginTop: 16 },
  siteReviewsSection: { padding: 28 },
  siteTrustBadge: { marginTop: 16, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14, alignItems: 'flex-start' },
  siteTrustTitle: { fontSize: 16, fontWeight: '700' },
  siteTrustLink: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  siteStars: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  siteReviewText: { fontFamily: FONT, fontSize: 14, lineHeight: 20, fontStyle: 'italic', marginBottom: 6 },
  siteReviewAuthor: { fontFamily: FONT, fontSize: 12, opacity: .6 },
  siteContactCta: { padding: 28, borderTopWidth: 1, alignItems: 'center', gap: 14 },
  siteContactCtaTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 26 },
  siteSvcsListSection: { padding: 28 },
  siteSvcRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  siteSvcRowName: { fontFamily: FONT, fontSize: 15, fontWeight: '700' },
  siteSvcRowDetail: { fontFamily: FONT, fontSize: 12, opacity: .55, marginTop: 2 },
  siteSvcRowPrice: { fontFamily: FONT, fontSize: 15, fontWeight: '800' },
  siteContactInfoRow: { flexDirection: 'row', padding: 24, gap: 16 },
  siteContactInfoCol: { flex: 1 }, siteHoursCol: { flex: 1 },
  siteContactInfoTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 20, marginBottom: 10 },
  siteContactItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  siteContactItemText: { fontFamily: FONT, fontSize: 13, lineHeight: 18, flex: 1 },
  siteHoursRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  siteHoursDay: { fontFamily: FONT, fontSize: 13, fontWeight: '700', width: 36 },
  siteHoursTime: { fontFamily: FONT, fontSize: 13, opacity: .7 },
  siteMockMap: { margin: 24, marginTop: 0, borderRadius: 14, borderWidth: 1, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  siteMockMapAddr: { fontFamily: FONT, fontSize: 14, fontWeight: '700' },
  siteMockMapSub: { fontFamily: FONT, fontSize: 12, opacity: .5, marginTop: 2 },
  siteFormSection: { padding: 24 },
  siteFormField: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10, minHeight: 48 },
  siteFormPh: { fontFamily: FONT, fontSize: 14, opacity: .45 },
  editPageTabs: { flexDirection: 'row', marginBottom: 8, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(66,104,125,.18)' },
  editPageTab: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  editPageTabOn: { backgroundColor: 'rgba(59,130,246,.18)' },
  editPageTabText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: C.inkSoft },
  editPageTabTextOn: { color: C.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end', cursor: 'default' as any },
  modalBox: { backgroundColor: C.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 42 : 24 },
  modalLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkSoft, marginBottom: 8 },
  modalInput: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, fontFamily: FONT, fontSize: 16, color: C.ink, backgroundColor: '#fff', minHeight: 90, textAlignVertical: 'top', marginBottom: 16, outlineWidth: 0 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonCancel: { backgroundColor: 'rgba(0,0,0,.06)' },
  modalButtonSave: { backgroundColor: C.primary },
  modalButtonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' },
  tools: { position: 'relative', zIndex: 30, width: FS_SLOT * 3, alignItems: 'center' }, toolStack: { alignSelf: 'stretch', alignItems: 'center', flexDirection: 'row' }, toolSlot: { width: FS_SLOT, alignItems: 'center' },
  toolButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, toolActive: { backgroundColor: C.primary },
  toolPanel: { position: 'absolute', top: 49, right: 0, width: 186, maxHeight: 400, padding: 12, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,.92)', shadowColor: '#174E66', shadowOpacity: .18, shadowRadius: 18, zIndex: 200, elevation: 200 }, paletteWrap: { gap: 5 }, paletteScroll: { maxHeight: 274 }, paletteGroup: { paddingBottom: 12 }, paletteHeadingText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', letterSpacing: .8, color: C.inkSoft, textTransform: 'uppercase' }, paletteStickyHeader: { backgroundColor: 'rgba(255,255,255,.95)', paddingVertical: 6, marginBottom: 2 },
  toolTitle: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: C.ink, textAlign: 'center', marginBottom: 9 }, option: { minHeight: 44, borderRadius: 16, paddingHorizontal: 9, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' },
  dot: { width: 20, height: 20, borderRadius: 10 }, selected: { borderColor: BRAND, backgroundColor: 'rgba(59,130,246,.12)' }, fontOption: { paddingVertical: 10, borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' }, fontOptionText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', textAlign: 'center', color: C.ink },
  sectionOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,40,50,.18)' }, sectionText: { flex: 1, fontFamily: FONT, fontSize: 12, fontWeight: '600', color: '#1C2832', marginHorizontal: 8 },
  sectionEye: { padding: 7 }, sectionDragHandle: { padding: 7 },
  domainSearch: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderColor: C.line }, domainInput: { flex: 1, minHeight: 54, paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: '#1C2832', outlineWidth: 0 }, suffixButton: { height: 54, paddingLeft: 8, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 3 }, domainSuffix: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#1C2832' }, suffixDropdown: { position: 'absolute', top: 58, right: 0, zIndex: 99, minWidth: 130, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, shadowColor: '#000', shadowOpacity: .14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10, overflow: 'hidden' }, suffixDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16 }, suffixDropdownDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }, suffixDropdownItemOn: { backgroundColor: 'rgba(59,130,246,.12)' }, suffixDropdownText: { fontFamily: FONT, fontSize: 15, fontWeight: '600', color: C.ink },
  check: { marginTop: 12, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }, checkText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#fff' },
  checkDisabled: { opacity: .58 }, domainError: { marginTop: 10, fontFamily: FONT, fontSize: 13, lineHeight: 18, color: C.danger }, domainResult: { marginTop: 14, padding: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.successSoft, borderWidth: 1, borderColor: 'rgba(31,138,84,.3)' }, domainName: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#1C2832' }, domainPrice: { fontFamily: FONT, fontSize: 13, color: C.success, fontWeight: '600', marginTop: 2 },
  formChoice: { marginTop: 22, padding: 17, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.45)', borderWidth: 1, borderColor: 'rgba(28,40,50,.16)' }, formChoiceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,.12)' }, formChoiceTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' }, formChoiceText: { fontFamily: FONT, fontSize: 13, color: C.inkSoft, marginTop: 3, lineHeight: 18 },
  rail: { position: 'absolute', left: 12, top: '25%', bottom: '25%', justifyContent: 'space-between', alignItems: 'center', zIndex: 140, elevation: 140 }, railButton: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, railActive: { position: 'absolute', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderWidth: 0, shadowColor: C.primary, shadowOpacity: .45, shadowRadius: 8, elevation: 8 }, railDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A1E22', borderWidth: 1, borderColor: 'rgba(0,0,0,.32)', shadowColor: '#000', shadowOpacity: .2, shadowRadius: 2 }, railDotOn: { backgroundColor: C.primary, borderColor: '#A9C8FF', shadowColor: C.primary, shadowOpacity: .45, shadowRadius: 5 },
  reviewCard: { marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(28,40,50,.18)', backgroundColor: 'rgba(255,255,255,.45)', overflow: 'hidden' },
  reviewCardOpen: { borderColor: C.primaryBorder },
  reviewRow: { minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reviewRowText: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '600', color: '#1C2832' },
  reviewFields: { paddingHorizontal: 14, paddingBottom: 14 },
  reviewActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }, reviewDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }, reviewDeleteText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.danger }, reviewDoneBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: C.primary },
  reviewDoneText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: '#fff' },
  reviewSourceCard: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(28,40,50,.18)', backgroundColor: 'rgba(255,255,255,.45)' },
  reviewSourceTitle: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#1C2832' },
  reviewSourceSub: { fontFamily: FONT, fontSize: 12, lineHeight: 17, color: C.inkSoft, marginTop: 3, marginBottom: 10 },
  reviewSourceRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(28,40,50,.2)', marginBottom: 8 },
  reviewSourceRowOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  reviewSourceName: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '600', color: '#1C2832' },
  reviewSourceAction: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.primary },
  addReviewBtn: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primaryBorder, backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 },
  addReviewText: { fontFamily: FONT, fontWeight: '700', fontSize: 14, color: C.ink },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 8, marginBottom: 12 },
  galleryItem: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#EFE4DB' },
  galleryThumb: { width: '100%', height: '100%' },
  galleryAdd: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: C.field },
  dashboardScreen: { flex: 1, paddingTop: Platform.OS === 'ios' ? 58 : 32 },
  dashboardBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  dashboardBrand: { fontFamily: FONT, fontSize: 18, fontWeight: '800', letterSpacing: -.3, color: C.ink },
  dashboardTabsTop: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 14, backgroundColor: 'rgba(28,40,50,.07)', marginBottom: 18 },
  dashboardTab: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dashboardTabOn: { backgroundColor: C.primary },
  dashboardTabText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.inkMuted },
  dashboardTabTextOn: { color: '#fff' },
  dashboardContent: { paddingHorizontal: 20, paddingBottom: 48 },
  dashboardTitle: { fontFamily: FONT, fontSize: 26, fontWeight: '800', letterSpacing: -.6, color: C.ink, marginBottom: 6 },
  dashboardIntro: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: C.inkSoft, marginBottom: 18 },
  dashboardInfoCard: { padding: 18, borderRadius: 16, backgroundColor: C.surface, marginBottom: 12 },
  dashboardCardLabel: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, marginBottom: 4 },
  dashboardCardTitle: { fontFamily: FONT, fontSize: 17, fontWeight: '800', color: C.ink },
  dashboardCardText: { fontFamily: FONT, fontSize: 14, color: C.inkSoft, marginTop: 3 },
  dashboardWebsiteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dashboardEdit: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  dashboardEditText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.ink },
  phoneFrame: { width: DASHBOARD_PREVIEW_WIDTH, height: DASHBOARD_PREVIEW_HEIGHT, alignSelf: 'center', borderRadius: 28, borderWidth: 7, borderColor: '#141A1E', overflow: 'hidden', marginVertical: DASHBOARD_PREVIEW_INSET, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  makeLiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: C.primary },
  makeLiveBtnLive: { backgroundColor: C.danger },
  makeLiveBtnText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#fff' },
  messageDay: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, textAlign: 'center', marginTop: 14, marginBottom: 10 },
  messageMeta: { fontFamily: FONT, fontSize: 11, color: C.inkMuted, marginTop: 3, marginBottom: 12 },
  messageMetaSent: { alignSelf: 'flex-end', marginRight: 4 },
  messageMetaReceived: { alignSelf: 'flex-start', marginLeft: 4 },
  messageBubble: { padding: 12, paddingHorizontal: 15, borderRadius: 18, maxWidth: '82%', backgroundColor: C.surface },
  messageImage: { width: 180, height: 180, borderRadius: 12 },
  messageBubbleReceived: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  messageSender: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: C.primary, marginBottom: 4 },
  messageText: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: C.ink },
  messageInputFixed: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingHorizontal: 14, paddingBottom: Platform.OS === 'ios' ? 30 : 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong, backgroundColor: C.surface },
  messageBubbleSent: { backgroundColor: C.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  messageInputField: { flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 20, backgroundColor: 'rgba(28,40,50,.06)', fontFamily: FONT, fontSize: 15, color: C.ink },
  choiceWrap: { gap: 0, paddingTop: 4 },
  choiceHeading: { fontFamily: FONT, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -.6, color: '#1C2832', marginBottom: 8 },
  choiceSub: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: C.inkSoft, marginBottom: 18 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, marginBottom: 12, shadowColor: '#000', shadowOpacity: .06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  choiceIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  choiceCardTitle: { fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#1C2832' },
  choiceCardText: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: C.inkSoft, marginTop: 3 },
  buildingCard: { alignItems: 'center', padding: 28, borderRadius: 18, backgroundColor: C.surface, marginTop: 6, marginBottom: 12 },
  buildingText: { fontFamily: FONT, fontSize: 17, fontWeight: '800', color: C.ink },
  buildingSub: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: C.inkSoft, textAlign: 'center', marginTop: 6 },
  previewOpenBadge: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  previewOpenText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#fff' },
  planModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,10,16,.6)' },
  planModalBox: { backgroundColor: C.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  planModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planModalTitle: { fontFamily: FONT, fontSize: 20, fontWeight: '800', color: '#1C2832' },
  planModalSub: { fontFamily: FONT, fontSize: 14, color: C.inkSoft, marginBottom: 12 },
  planModalDomain: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(59,130,246,.12)', marginBottom: 14 },
  planModalDomainText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.primary },
  planModalFeeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 14 },
  planModalFeeText: { flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 18, color: C.inkSoft },
  planModalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', marginBottom: 10 },
  planModalOptionOn: { borderColor: C.primary, backgroundColor: '#F3F7FF' },
  planModalOptionName: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: '#1C2832' },
  planModalOptionNote: { fontFamily: FONT, fontSize: 13, color: C.inkMuted, marginTop: 2 },
  planModalOptionPrice: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#1C2832' },
  savePill: { alignSelf: 'flex-start', backgroundColor: C.success, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, marginBottom: 4 },
  savePillText: { fontFamily: FONT, fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: .4 },
  planModalPayBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 14, backgroundColor: C.primary, marginTop: 14 },
  planModalPayBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#fff' },
  fullLoading: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  fullLoadingBrand: { fontFamily: FONT, fontSize: 34, fontWeight: '900', letterSpacing: 1, color: '#fff', textAlign: 'center', marginBottom: 36 },
  fullLoadingKicker: { fontFamily: FONT, fontSize: 11, fontWeight: '700', letterSpacing: 3, color: 'rgba(255,255,255,.75)', textAlign: 'center' },
  fullLoadingName: { fontFamily: FONT, fontSize: 30, lineHeight: 36, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 18 },
  fullLoadingList: { gap: 12 },
  fullLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  fullLoadingLine: { flex: 1, fontFamily: FONT, fontSize: 15, fontWeight: '600', color: '#fff' },
  fullLoadingTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', overflow: 'hidden', marginTop: 10 },
  fullLoadingFill: { height: '100%', borderRadius: 2, backgroundColor: '#fff' },
  fsBrowserBar: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 56 : 30, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#0E1A24', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  fsBackBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  fsTickBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  fsBrowserRight: { width: FS_SLOT * 4, flexDirection: 'row', alignItems: 'center' }, fsSlot: { width: FS_SLOT, alignItems: 'center' },
  dashboardLogo: { width: 30, height: 30, borderRadius: 9 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontFamily: FONT, fontSize: 12, fontWeight: '800' },
  saveBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: C.dangerSoft },
  saveBannerText: { flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '600', color: C.danger },
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 14, backgroundColor: C.primary, marginTop: 4 },
  primaryBtnText: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#fff' },
  secondaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginTop: 10 },
  secondaryBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: C.ink },
  messageIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  messageSendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  siteLogo: { width: 18, height: 18, borderRadius: 4 },
  siteGalleryImg: { width: '31.5%', aspectRatio: 1, borderRadius: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  serviceHeadRow: { flexDirection: 'row', gap: 10, marginTop: -4, marginBottom: 2 },
  serviceHead: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, paddingLeft: 4 },
  selectInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontFamily: FONT, fontSize: 16, color: C.ink },
  typeRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: 12 },
  typeRowOn: { backgroundColor: C.primarySoft },
  typeRowText: { fontFamily: FONT, fontSize: 16, fontWeight: '600', color: C.ink },
  deviceToggle: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(28,40,50,.07)' },
  deviceToggleDark: { backgroundColor: 'rgba(255,255,255,.12)' },
  deviceToggleBtn: { alignItems: 'center', justifyContent: 'center', width: 36, height: 34, borderRadius: 9 },
  deviceToggleBtnOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  deviceToggleBtnOnDark: { backgroundColor: '#fff' },
  deviceToggleText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkMuted },
  desktopFrame: { alignSelf: 'stretch', marginHorizontal: 0, borderRadius: 12, overflow: 'hidden', marginBottom: 18, backgroundColor: '#fff', borderWidth: 6, borderColor: '#141A1E', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  desktopBar: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9ECEF' },
  desktopBarUrl: { fontFamily: FONT, fontSize: 11, color: C.inkMuted, maxWidth: '60%' },
  editorToggleRow: { alignItems: 'center', paddingVertical: 10, backgroundColor: '#0E1A24' },
  editorDesktop: { borderRadius: 10, overflow: 'hidden' },
  siteHeroDesktop: { height: 520, padding: 40 },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  cardLinkText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.primary },
  editMenu: { position: 'absolute', top: 46, right: 0, width: 250, padding: 6, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12, zIndex: 50 },
  editMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10 },
  editMenuTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: C.ink },
  editMenuSub: { fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 1 },
  closeEditBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(28,40,50,.08)' },
  editorDesktopStage: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  toolsLandscape: { flexDirection: 'row', alignItems: 'center' },
  toolSlotLandscape: { marginHorizontal: 5 },
  toolButtonSmall: { width: 38, height: 38, borderRadius: 19 },
  landBar: { zIndex: 30, elevation: 30, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 54, paddingVertical: 8, backgroundColor: '#0E1A24', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.08)' },
  stripPanel: { zIndex: 20, elevation: 20, backgroundColor: 'rgba(255,255,255,.96)', borderBottomWidth: 1, borderBottomColor: C.line },
  stripContent: { alignItems: 'center', gap: 10, paddingHorizontal: 54, paddingVertical: 8 },
  stripGroup: { gap: 4 },
  stripGroupLabel: { fontFamily: FONT, fontSize: 10, fontWeight: '800', letterSpacing: .8, color: C.inkSoft, textTransform: 'uppercase' },
  stripChip: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  stripChipOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  stripHint: { fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginLeft: 6 },
});
