import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Dimensions, Easing, Image, Keyboard, KeyboardAvoidingView, Modal, PanResponder,
  Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const DRAFT_KEY = 'brightsite_onboarding_draft';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// The dashboard chrome occupies roughly 258pt. Keep the website preview inset
// evenly on all sides, then let it use the rest of the available viewport.
const DASHBOARD_PREVIEW_INSET = 20;
const PHONE_FRAME_ASPECT_RATIO = 9 / 16;
const DASHBOARD_PREVIEW_MAX_HEIGHT = SCREEN_HEIGHT - 258 - DASHBOARD_PREVIEW_INSET * 2;
const DASHBOARD_PREVIEW_MAX_WIDTH = SCREEN_WIDTH - DASHBOARD_PREVIEW_INSET * 2;
const DASHBOARD_PREVIEW_HEIGHT = Math.min(DASHBOARD_PREVIEW_MAX_HEIGHT, DASHBOARD_PREVIEW_MAX_WIDTH / PHONE_FRAME_ASPECT_RATIO);
const DASHBOARD_PREVIEW_WIDTH = DASHBOARD_PREVIEW_HEIGHT * PHONE_FRAME_ASPECT_RATIO;
// Full-screen cards sit under the status bar / Dynamic Island; keep the dots and title below it.
const SAFE_TOP = Platform.OS === 'ios' ? 60 : 28;
const CARD_TRAVEL = SCREEN_WIDTH;
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
// in the app is the exact same row the website’s dashboard reads and writes,
// not a separate system. Checked that file’s own fetch calls to get these
// constants and request shapes right rather than inventing a parallel one.
const SUPABASE_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';
const UPLOAD_WORKER = 'https://brightsite-upload.notify-lead-worker.workers.dev';

// Catches typos (gmial.com) and made-up domains before an account is created.
const COMMON_EMAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com', 'sky.com', 'protonmail.com'];
const editDistance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const emailProblem = async (email: string): Promise<string | null> => {
  const m = /^[^\s@]+@([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(email);
  if (!m) return 'Enter a valid email address.';
  const domain = m[1].toLowerCase();
  if (!COMMON_EMAIL_DOMAINS.includes(domain)) {
    const near = COMMON_EMAIL_DOMAINS.find(d => editDistance(domain, d) <= 2);
    if (near) return `Did you mean ${email.split('@')[0]}@${near}?`;
  }
  try {
    const dns = await (await fetch(`https://cloudflare-dns.com/dns-query?type=MX&name=${encodeURIComponent(domain)}`, { headers: { accept: 'application/dns-json' } })).json();
    const hasMx = (dns.Answer || []).some((a: any) => a.type === 15);
    return dns.Status === 0 && hasMx ? null : 'That email address can’t receive mail. Check it’s spelled correctly.';
  } catch { return null; } // never block signup because the check itself failed
};
const R2_PUBLIC_URL = 'https://pub-38c2019362f64b6780e0b217ba84be8c.r2.dev';
const NOTIFY_API = 'https://brightsite-notify-lead.notify-lead-worker.workers.dev/';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

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

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

// Push to this customer's own phone(s) after they switch their site on or off, so every device they use knows.
function pushToSelf(pushToken: string | undefined, title: string, body: string) {
  if (!pushToken) return;
  void fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }) }).catch(() => {});
}

const ADMIN_API = 'https://api.brightsite.app/api/admin-businesses';
// Tells the other side about something new: a customer's message/site change pushes to admins,
// an admin's reply pushes to the customer. Fire-and-forget.
function pingAdminApi(token: string, payload: Record<string, any>) {
  void fetch(ADMIN_API, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
}

async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted' ? { status: existing } : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: 'brightsite' });
    return token.data;
  } catch { return null; }
}

async function savePushToken(accessToken: string, slug: string, token: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/businesses?select=data&id=eq.${encodeURIComponent(slug)}`, { headers: authHeaders(accessToken) });
    const rows = await res.json();
    const existing = Array.isArray(rows) && rows[0]?.data ? rows[0].data : {};
    await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ data: { ...existing, pushToken: token } }),
    });
  } catch { /* best-effort */ }
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

// Plain-text brief of everything a customer entered, ready to paste into Claude to build their site.
function businessBrief(biz: any): string {
  const r = biz?.data?.raw || biz?.data || {};
  const line = (label: string, value: any) => value ? `${label}: ${value}` : '';
  const list = (title: string, rows: string[]) => rows.length ? `\n${title}\n${rows.map(x => `- ${x}`).join('\n')}` : '';
  return [
    `BUSINESS BRIEF: ${r.name || biz?.id || 'Unnamed business'}`,
    line('Account ID', biz?.id),
    line('Build choice', r.buildChoice),
    line('Business type', r.tagline),
    line('Owner', r.fullName && r.fullName + (r.fullNameDisplay ? ' (show on website)' : '')),
    line('Owner email', r.ownerEmail),
    line('Business email', r.email),
    line('Phone', r.phone),
    line('Address', r.address),
    line('Existing website', r.website),
    line('Instagram', r.instagram),
    line('Facebook', r.facebook),
    line('Google reviews', r.googleLink),
    line('Trustpilot', r.trustpilotLink),
    line('Chosen domain', r.chosenDomain),
    line('Contact form', r.contactForm ? 'Yes' : ''),
    list('OPENING HOURS', r.hours || []),
    ...(r.serviceGroups || []).map((g: any) => list(`SERVICES: ${g.name}`, (g.items || []).map((it: string[]) => [it[0], it[2], it[1]].filter(Boolean).join(' | ')))),
    list('OFFERS', (r.offers || []).map((o: any) => `${o.name}: ${o.value}`)),
    (r.designerNotes || (r.notes && !/^Build choice:/.test(r.notes) ? r.notes : '')) ? `\nNOTES FOR DESIGNER\n${r.designerNotes || r.notes}` : '',
    list('REVIEWS', (r.reviewItems || []).map((x: any) => [x.title, x.description, x.name].filter(Boolean).join(' — '))),
    list('PHOTOS', [r.logoImage && `Logo: ${r.logoImage}`, r.heroImage && `Hero: ${r.heroImage}`, ...(r.gallery || []).map((u: string, i: number) => `Gallery ${i + 1}: ${u}`)].filter(Boolean)),
    r.design ? `\nDESIGN SETTINGS\n${JSON.stringify(r.design)}` : '',
  ].filter(Boolean).join('\n');
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
  { id: 'contact', title: 'Business details', icon: 'call-outline' },
  { id: 'hours', title: 'Opening hours', icon: 'time-outline' },
  { id: 'prices', title: 'Services & prices', icon: 'pricetag-outline' },
  { id: 'media', title: 'Photos & logo', icon: 'images-outline' },
  { id: 'extras', title: 'Offers & extras', icon: 'gift-outline' },
  { id: 'reviews', title: 'Reviews', icon: 'star-outline' },
];
const setupStepIndexes = Array.from({ length: 7 }, (_, i) => i + 1);
// ordered so the chip rows come out roughly even in width
// Mirrors api/_lib/plans.js: annual plans and Pro cover the first £12 of the domain.
function domainNote(pence: number, included: boolean) {
  if (!pence) return 'registration charged at checkout';
  const charge = included ? Math.max(0, pence - 1200) : pence;
  if (!charge) return 'free domain included with your plan';
  return `£${(charge / 100).toFixed(2)} today${included ? ' (£12 off with your plan)' : ' registration'}`;
}

// Same plans as pricing.html; "essential" is the Free plan.
const PLAN_OPTIONS = [
  { id: 'essential' as const, name: 'Free', note: 'Website built free · 1–5 pages', build: '£0', buildLabel: 'build', tag: null },
  { id: 'pro' as const, name: 'Pro', note: 'For websites over 5 pages', build: '£199', buildLabel: 'one-off build', tag: '5+ PAGES' },
];
const BUSINESS_TYPES = ['Hair & Beauty', 'Aesthetics', 'Fitness', 'Pets', 'Health & Wellness', 'Home & Garden', 'Food & Drink', 'Automotive', 'Trades', 'Professional Services', 'Creative', 'Other'];


function Field({ label, optional = false, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, inputRef, ...inputProps }: any) {
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}{optional && <Text style={s.fieldOptional}>  optional</Text>}</Text>
    <TextInput ref={inputRef} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.placeholder}
      keyboardType={keyboardType} multiline={multiline} rejectResponderTermination={false} style={[s.input, multiline && s.inputMultiline]} {...inputProps} />
  </View>;
}

const Intro = ({ children }: any) => <Text style={s.intro}>{children}</Text>;

type SheetField = { key: string; placeholder: string; multiline?: boolean; optional?: boolean };

// Bottom sheet for adding/editing one list item; Save stays disabled until every field has text.
function ItemSheet({ open, title, fields, initial, onSave, onDelete, onClose }: { open: boolean; title: string; fields: SheetField[]; initial: Record<string, string> | null; onSave: (item: Record<string, string>) => void; onDelete?: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { if (open) setDraft(initial || {}); }, [open]);
  const ready = fields.every(f => f.optional || (draft[f.key] || '').trim());
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.planModalOverlay}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={s.planModalBox}>
        <View style={s.planModalHeader}><Text style={s.planModalTitle}>{title}</Text><Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
        <View style={{ gap: 10, marginTop: 10 }}>
          {fields.map((f, i) => <TextInput key={f.key} value={draft[f.key] || ''} onChangeText={v => setDraft(d => ({ ...d, [f.key]: v }))} placeholder={f.placeholder} placeholderTextColor={C.placeholder} autoCapitalize="sentences" autoFocus={i === 0} multiline={f.multiline} style={[s.input, f.multiline && s.inputGrow]} />)}
        </View>
        <Pressable disabled={!ready} onPress={() => onSave(draft)} style={[s.planModalPayBtn, !ready && { opacity: .45 }]}><Text style={s.planModalPayBtnText}>Save</Text></Pressable>
        {onDelete && <Pressable onPress={onDelete} style={s.sheetDelete}><Text style={s.sheetDeleteText}>Remove</Text></Pressable>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function ItemList({ items, primary, secondary, addLabel, onOpen }: { items: Record<string, string>[]; primary: string; secondary: string; addLabel: string; onOpen: (index: number | null) => void }) {
  return <View>
    {items.map((item, i) => <Pressable key={i} onPress={() => onOpen(i)} style={({ pressed }) => [s.listRow, pressed && s.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={s.reviewRowText} numberOfLines={1}>{item[primary]}</Text>
        {!!item[secondary] && <Text style={s.listRowSub} numberOfLines={1}>{item[secondary]}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.inkMuted} />
    </Pressable>)}
    <Pressable onPress={() => onOpen(null)} style={s.addReviewBtn}><Ionicons name="add" size={16} color={DARK} /><Text style={s.addReviewText}>{addLabel}</Text></Pressable>
  </View>;
}

function Hours({ rows, setRows }: any) {
  return <>
    <View style={s.hoursCard}>{rows.map((row: any, i: number) =>
    <View style={[s.hoursRow, i === rows.length - 1 && s.hoursRowLast]} key={row.label}>
      <Text style={s.hoursDay}>{row.label.slice(0, 3)}</Text>
      <View style={s.hoursTimes}>{row.enabled ? <><TextInput value={row.start} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, start: v } : x))} style={s.timeInput} /><Text style={s.timeDash}>–</Text><TextInput value={row.end} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, end: v } : x))} style={s.timeInput} /></> : <><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View><Text style={s.timeDash}>–</Text><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View></>}</View>
      <View style={s.hoursSwitch}><Switch value={row.enabled} onValueChange={() => setRows(rows.map((x: any, n: number) => n === i ? { ...x, enabled: !x.enabled } : x))}
        trackColor={{ false: 'rgba(28,40,50,.18)', true: C.primary }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as any)} /></View></View>)}</View></>;
}

let cidSeed = 0;
const newCid = () => `c${Date.now()}${cidSeed++}`;
type ServiceRow = { name: string; duration: string; price: string };
const emptyRows = (): ServiceRow[] => [0, 1, 2].map(() => ({ name: '', duration: '', price: '' }));

// One sheet per category: its name plus a grid of service rows (name, time, price on one line).
function CategorySheet({ open, initial, onSave, onDelete, onClose }: { open: boolean; initial: { section: string; rows: ServiceRow[] } | null; onSave: (section: string, rows: ServiceRow[]) => void; onDelete?: () => void; onClose: () => void }) {
  const [section, setSection] = useState('');
  const [rows, setRows] = useState<ServiceRow[]>(emptyRows());
  useEffect(() => { if (open) { setSection(initial?.section || ''); setRows(initial?.rows.length ? [...initial.rows, { name: '', duration: '', price: '' }] : emptyRows()); } }, [open]);
  const setCell = (i: number, key: keyof ServiceRow, v: string) => setRows(r => r.map((x, n) => n === i ? { ...x, [key]: v } : x));
  const ready = !!section.trim() && rows.some(r => r.name.trim());
  return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.planModalOverlay}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[s.planModalBox, { maxHeight: SCREEN_HEIGHT * .85 }]}>
        <View style={s.planModalHeader}><Text style={s.planModalTitle}>{initial ? 'Edit category' : 'Add category'}</Text><Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          <TextInput value={section} onChangeText={setSection} placeholder="Category name, e.g. Massages" placeholderTextColor={C.placeholder} autoCapitalize="words" autoFocus={!initial} style={[s.input, { fontWeight: '700' }]} />
          {rows.map((r, i) => <View key={i} style={s.gridRow}>
            <TextInput value={r.name} onChangeText={v => setCell(i, 'name', v)} placeholder="Name" placeholderTextColor={C.placeholder} autoCapitalize="sentences" style={[s.gridCell, { flex: 1.8 }]} />
            <TextInput value={r.duration} onChangeText={v => setCell(i, 'duration', v)} placeholder="Time" placeholderTextColor={C.placeholder} style={[s.gridCell, { flex: 1 }]} />
            <TextInput value={r.price} onChangeText={v => setCell(i, 'price', v)} placeholder="Price" placeholderTextColor={C.placeholder} style={[s.gridCell, { flex: 1 }]} />
          </View>)}
          <Pressable onPress={() => setRows(r => [...r, { name: '', duration: '', price: '' }])} style={s.addService}><Ionicons name="add" size={16} color={C.primary} /><Text style={s.addServiceText}>Add more</Text></Pressable>
        </ScrollView>
        <Pressable disabled={!ready} onPress={() => onSave(section.trim(), rows.filter(r => r.name.trim()))} style={[s.planModalPayBtn, !ready && { opacity: .45 }]}><Text style={s.planModalPayBtnText}>Save</Text></Pressable>
        {onDelete && <Pressable onPress={onDelete} style={s.sheetDelete}><Text style={s.sheetDeleteText}>Remove category</Text></Pressable>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function Services({ items, setItems }: any) {
  const [editing, setEditing] = useState<{ cid: string | null } | null>(null);
  const cids: string[] = items.reduce((acc: string[], it: any) => acc.includes(it.cid) ? acc : [...acc, it.cid], []);
  // a never-filled placeholder category isn't shown
  const groups = cids.map(cid => ({ cid, rows: items.filter((it: any) => it.cid === cid) })).filter(g => g.rows[0].section.trim() || g.rows.some((r: any) => r.name.trim()));
  const current = editing?.cid ? groups.find(g => g.cid === editing.cid) : null;
  const save = (section: string, rows: ServiceRow[]) => {
    const cid = editing?.cid || newCid();
    const next = rows.map(r => ({ cid, section, ...r }));
    // swap the category's rows in place, and drop the empty placeholder row
    const out: any[] = [];
    let placed = false;
    for (const it of items) {
      if (it.cid === cid) { if (!placed) { out.push(...next); placed = true; } continue; }
      if (it.section.trim() || it.name.trim()) out.push(it);
    }
    setItems(placed ? out : [...out, ...next]);
    setEditing(null);
  };
  const remove = () => {
    const remaining = items.filter((it: any) => it.cid !== editing?.cid);
    setItems(remaining.length ? remaining : [{ cid: newCid(), section: '', name: '', duration: '', price: '' }]);
    setEditing(null);
  };
  return <View>
    {groups.map(g => {
      const count = g.rows.filter((r: any) => r.name.trim()).length;
      return <Pressable key={g.cid} onPress={() => setEditing({ cid: g.cid })} style={({ pressed }) => [s.listRow, pressed && s.pressed]}>
        <View style={{ flex: 1 }}>
          <Text style={s.reviewRowText} numberOfLines={1}>{g.rows[0].section || 'Untitled category'}</Text>
          <Text style={s.listRowSub} numberOfLines={1}>{count} service{count === 1 ? '' : 's'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.inkMuted} />
      </Pressable>;
    })}
    <Pressable onPress={() => setEditing({ cid: null })} style={s.addReviewBtn}><Ionicons name="add" size={16} color={DARK} /><Text style={s.addReviewText}>Add category</Text></Pressable>
    <CategorySheet open={!!editing} initial={current ? { section: current.rows[0].section, rows: current.rows.filter((r: any) => r.name.trim()).map((r: any) => ({ name: r.name, duration: r.duration || '', price: r.price || '' })) } : null}
      onSave={save} onDelete={current ? remove : undefined} onClose={() => setEditing(null)} />
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





function FlowBackdrop({ children, plain = false }: any) {
  // plain: full-screen cream page with no blue frame (login, choice and the card builder)
  if (plain) return <View style={{ flex: 1, backgroundColor: C.card }}>{children}</View>;
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
const DESKTOP_VIEW_W = SCREEN_WIDTH - 52;
const DESKTOP_VIEW_H = Math.round(DESKTOP_VIEW_W * 0.68);
// In-app analytics: page views and visitors per day from the site worker (owner or admin login).
function AnalyticsModal({ visible, slug, session, onClose }: { visible: boolean; slug: string; session: any; onClose: () => void }) {
  const [rangeDays, setRangeDays] = useState<number | 'all'>(30);
  const [days, setDays] = useState<{ views: number; visitors: number; pages?: Record<string, { views: number; seconds: number; timed: number }>; clicks?: Record<string, number>; forms?: number }[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!visible || !slug || !session?.access_token) return;
    setDays(null); setError('');
    fetch(`${UPLOAD_WORKER}/stats/${encodeURIComponent(slug)}?days=${rangeDays}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'failed'); return j; })
      .then(j => setDays(j.days || []))
      .catch(() => setError('Could not load analytics. Try again in a moment.'));
  }, [visible, slug, rangeDays]);
  const views = (days || []).reduce((t, d) => t + d.views, 0);
  const visitors = (days || []).reduce((t, d) => t + d.visitors, 0);
  const max = Math.max(1, ...(days || []).map(d => d.views));
  // per-page totals, contact clicks and form sends across the chosen range
  const pageMap: Record<string, { views: number; seconds: number; timed: number }> = {};
  const clickMap: Record<string, number> = {};
  let formSends = 0;
  (days || []).forEach(d => {
    Object.entries(d.pages || {}).forEach(([path, v]) => { const t = pageMap[path] || (pageMap[path] = { views: 0, seconds: 0, timed: 0 }); t.views += v.views || 0; t.seconds += v.seconds || 0; t.timed += v.timed || 0; });
    Object.entries(d.clicks || {}).forEach(([k, n]) => { clickMap[k] = (clickMap[k] || 0) + (n || 0); });
    formSends += d.forms || 0;
  });
  const pages = Object.entries(pageMap).map(([path, v]) => ({ path, ...v, avg: v.timed ? Math.round(v.seconds / v.timed) : 0 })).sort((a, b) => b.views - a.views);
  const longest = pages.filter(p => p.timed > 0).sort((a, b) => b.avg - a.avg)[0];
  const fmtTime = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
  const pageName = (path: string) => path === '/' ? 'Home' : path.replace(/^\//, '').replace(/[-_/]/g, ' ').replace(/^./, c => c.toUpperCase());
  const CLICK_LABELS: [string, string, any][] = [['phone', 'Phone calls', 'call-outline'], ['email', 'Emails', 'mail-outline'], ['whatsapp', 'WhatsApp', 'logo-whatsapp'], ['directions', 'Directions', 'navigate-outline'], ['social', 'Social links', 'share-social-outline']];
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: C.canvas, paddingTop: Platform.OS === 'ios' ? 54 : 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 }}>
        <Text style={{ fontFamily: FONT, fontSize: 22, fontWeight: '800', color: C.ink }}>Analytics</Text>
        <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={C.ink} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
        {([7, 30, 90, 'all'] as const).map(n => <Pressable key={n} onPress={() => setRangeDays(n)} style={[s.chip, rangeDays === n && s.chipOn]}><Text style={[s.chipText, rangeDays === n && s.chipTextOn]}>{n === 'all' ? 'All time' : `${n} days`}</Text></Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, padding: 20 }}>
        {[['Page views', views], ['Visitors', visitors]].map(([label, n]) => <View key={String(label)} style={[s.dashboardInfoCard, { flex: 1, marginBottom: 0 }]}><Text style={s.dashboardCardLabel}>{label}</Text><Text style={[s.dashboardCardTitle, { fontSize: 28 }]}>{Number(n).toLocaleString('en-GB')}</Text></View>)}
      </View>
      <View style={[s.dashboardInfoCard, { marginHorizontal: 20 }]}>
        {days === null && !error && <ActivityIndicator color={C.primary} />}
        {!!error && <Text style={s.dashboardCardText}>{error}</Text>}
        {days !== null && <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: days.length > 45 ? 1 : 3 }}>
            {days.map((d, i) => <View key={i} style={{ flex: 1, height: Math.max(d.views ? 3 : 1, (d.views / max) * 150), borderRadius: 3, backgroundColor: d.views ? C.primary : C.line, opacity: d.views ? 0.85 : 1 }} />)}
          </View>
          <Text style={[s.dashboardCardText, { marginTop: 10 }]}>{views ? `Peak day: ${max} view${max === 1 ? '' : 's'}` : 'No visits recorded yet. Once people visit the site they will appear here.'}</Text>
        </>}
      </View>
      {days !== null && <>
        <View style={[s.dashboardInfoCard, { marginHorizontal: 20 }]}>
          <Text style={s.dashboardCardLabel}>Pages</Text>
          {longest && <Text style={[s.dashboardCardTitle, { marginBottom: 6 }]}>Most time on {pageName(longest.path)} · avg {fmtTime(longest.avg)}</Text>}
          {pages.length === 0 && <Text style={s.dashboardCardText}>Page and time-on-page data appears as people browse the site.</Text>}
          {pages.slice(0, 8).map(pg => <View key={pg.path} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>
            <Text style={[s.dashboardCardText, { flex: 1, color: C.ink, fontWeight: '600', marginTop: 0 }]} numberOfLines={1}>{pageName(pg.path)}</Text>
            <Text style={[s.dashboardCardText, { marginTop: 0 }]}>{pg.views} view{pg.views === 1 ? '' : 's'}{pg.timed ? ` · ${fmtTime(pg.avg)}` : ''}</Text>
          </View>)}
        </View>
        <View style={[s.dashboardInfoCard, { marginHorizontal: 20 }]}>
          <Text style={s.dashboardCardLabel}>Contact clicks</Text>
          {CLICK_LABELS.map(([k, label, icon]) => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 }}>
            <Ionicons name={icon} size={18} color={C.primary} />
            <Text style={[s.dashboardCardText, { flex: 1, color: C.ink, fontWeight: '600', marginTop: 0 }]}>{label}</Text>
            <Text style={[s.dashboardCardTitle, { fontSize: 17 }]}>{clickMap[k] || 0}</Text>
          </View>)}
        </View>
        <View style={[s.dashboardInfoCard, { marginHorizontal: 20 }]}>
          <Text style={s.dashboardCardLabel}>Contact form</Text>
          <Text style={[s.dashboardCardTitle, { fontSize: 22 }]}>{formSends} send{formSends === 1 ? '' : 's'}</Text>
          <Text style={s.dashboardCardText}>Counted each time the form's send button is pressed.</Text>
        </View>
      </>}
      </ScrollView>
    </View>
  </Modal>;
}

// The client's real website (uploaded site / live address) in the phone or desktop frame.
function RealSitePreview({ url, label, desktop, onPress }: { url: string; label?: string; desktop: boolean; onPress: () => void }) {
  const scale = DESKTOP_VIEW_W / DESKTOP_WIDTH;
  const host = label || url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  // Both views stay mounted and load once, so switching phone/desktop is instant and the page is cached by the web view.
  const web = { source: { uri: url }, scrollEnabled: false, startInLoadingState: true, cacheEnabled: true, cacheMode: 'LOAD_CACHE_ELSE_NETWORK' as const };
  return <>
    <Pressable onPress={onPress} style={[s.phoneFrame, !!desktop && { display: 'none' }]}>
      <View pointerEvents="none" style={{ overflow: 'hidden', flex: 1, backgroundColor: '#fff' }}><WebView {...web} style={{ flex: 1 }} /></View>
    </Pressable>
    <Pressable onPress={onPress} style={[s.desktopFrame, !desktop && { display: 'none' }]}>
      <View style={s.desktopBar}><View style={s.previewDots}><View style={[s.previewDot, { backgroundColor: '#FF5F57' }]} /><View style={[s.previewDot, { backgroundColor: '#FEBC2E' }]} /><View style={[s.previewDot, { backgroundColor: '#28C840' }]} /></View><View style={s.desktopAddress}><Ionicons name="lock-closed" size={9} color={C.inkMuted} /><Text style={s.desktopBarUrl} numberOfLines={1}>{host}</Text></View></View>
      <View pointerEvents="none" style={{ height: DESKTOP_VIEW_H, overflow: 'hidden', backgroundColor: '#fff' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: DESKTOP_WIDTH, height: DESKTOP_VIEW_H / scale, transform: [{ scale }], transformOrigin: 'top left' }}>
          <WebView {...web} style={{ flex: 1 }} />
        </View>
      </View>
    </Pressable>
  </>;
}

function DeviceToggle({ mode, setMode, dark = false, disabled = false }: { mode: 'mobile' | 'desktop'; setMode: (m: 'mobile' | 'desktop') => void; dark?: boolean; disabled?: boolean }) {
  return <View style={[s.deviceToggle, dark && s.deviceToggleDark, disabled && { opacity: .45 }]} pointerEvents={disabled ? 'none' : 'auto'}>
    {(['mobile', 'desktop'] as const).map(m => <Pressable key={m} disabled={disabled} onPress={() => setMode(m)} style={[s.deviceToggleBtn, mode === m && (dark ? s.deviceToggleBtnOnDark : s.deviceToggleBtnOn)]} accessibilityLabel={`${m} preview`}>
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
  designer: ['Saving your details', 'Preparing your dashboard', 'Our designer is on it!', "You’ll get a notification when your preview is ready"],
};

function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

function welcomeText(fullName: string | undefined, buildChoice: string | null | undefined) {
  const designer = buildChoice === 'designer';
  return `Hey ${fullName?.trim().split(' ')[0] || 'there'}, welcome to BrightSite! ${designer ? 'I’m Tom, your designer.\n\n• I’m building your website now\n• You’ll get a notification when it’s ready to review\n• If I need anything else to build it, I’ll message you here\n• Got ideas or requests? Send them here as notes anytime' : 'I’m Tom, your support.\n\n• Your design is saved and ready\n• Hit Make Live whenever you want it online\n• You’ll get a notification if I need anything from you\n• Got ideas or requests? Send them here as notes anytime'}`;
}

function MessageThread({ session, slug, viewer, otherName, placeholder, intro }: { session: any; slug: string; viewer: 'customer' | 'admin'; otherName: string; placeholder: string; intro?: React.ReactNode }) {
  const [messageDraft, setMessageDraft] = useState('');
  const [messages, setMessages] = useState<{ id: string; sender: string; body: string; created_at: string }[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const lastMessageTs = useRef<string | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const scrollToLatest = (animated = true) => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated }));
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => { setKbOpen(true); setTimeout(() => scrollToLatest(), 60); });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { scrollToLatest(false); }, []);

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
    } catch { /* same best-effort polling as the website’s messages tab */ }
  };
  useEffect(() => {
    void loadMessagesNow();
    const timer = setInterval(() => { void loadMessagesNow(); }, 4000);
    return () => clearInterval(timer);
  }, [slug, session?.access_token]);

  const handleLongPressMessage = (m: { id: string; sender: string; body: string }) => {
    if (m.sender !== viewer || !session?.access_token) return;
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
    setMessages(current => [...current, { id: localId, sender: viewer, body: text, created_at: new Date().toISOString() }]);
    if (!body) setMessageDraft('');
    scrollToLatest();
    try {
      await postMessage(session.access_token, slug, text, viewer);
      pingAdminApi(session.access_token, viewer === 'admin' ? { action: 'push-customer', slug, text } : { action: 'notify-admin', kind: 'message', slug, text });
      await loadMessagesNow();
    } catch {
      setMessages(current => current.filter(m => m.id !== localId));
      if (!body) setMessageDraft(text);
      Alert.alert('Message not sent', 'Check your connection and try again.');
    }
    finally { setSendingMessage(false); }
  };

  // Hide DB copies of the welcome message — it's always shown via the intro bubble
  // our welcome is pinned as the intro bubble, and a database trigger also inserts an old welcome
  const visible = messages.filter(m => !(m.sender === 'admin' && ((m.body.startsWith('Hey ') && m.body.includes('welcome to BrightSite')) || m.body.startsWith('Welcome to BrightSite! 👋'))));
  return <>
    <ScrollView ref={scrollRef} contentContainerStyle={s.dashboardContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onContentSizeChange={() => scrollToLatest()}>
      {intro}
      {visible.map((m, i) => {
        const mine = m.sender === viewer;
        const pending = m.id.startsWith('local-');
        return <React.Fragment key={m.id}>
          <Pressable onLongPress={() => handleLongPressMessage(m)} style={[s.messageBubble, mine ? s.messageBubbleSent : s.messageBubbleReceived]}>
            {isImageMessage(m.body) ? <Image source={{ uri: m.body }} style={s.messageImage} resizeMode="cover" /> : <Text style={[s.messageText, mine && { color: '#fff' }]}>{m.body}</Text>}
          </Pressable>
          <Text style={[s.messageMeta, mine ? s.messageMetaSent : s.messageMetaReceived]}>{mine ? 'You' : otherName} · {pending ? 'Sending…' : `${dayLabel(m.created_at)}, ${timeLabel(m.created_at)}`}</Text>
        </React.Fragment>;
      })}
    </ScrollView>
    <View style={[s.messageInputFixed, kbOpen && { paddingBottom: 10 }]}>
      <Pressable onPress={() => void attachImage()} hitSlop={10} style={s.messageIconBtn} accessibilityLabel="Attach photo">
        <Ionicons name="image-outline" size={22} color={C.inkSoft} />
      </Pressable>
      <TextInput style={s.messageInputField} value={messageDraft} onChangeText={v => setMessageDraft(v.charAt(0).toUpperCase() + v.slice(1))} placeholder={placeholder} placeholderTextColor={C.placeholder} autoCapitalize="sentences" autoCorrect spellCheck keyboardType="default" enablesReturnKeyAutomatically multiline />
      <Pressable onPress={() => void sendMessage(undefined)} disabled={!messageDraft.trim() || sendingMessage} hitSlop={10} style={[s.messageSendBtn, (!messageDraft.trim() || sendingMessage) && { opacity: .35 }]} accessibilityLabel="Send message">
        {sendingMessage ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={21} color="#fff" />}
      </Pressable>
    </View>
  </>;
}

function DashboardHome({ tab, setTab, data, domain, suffix, services, hours, contactForm, websiteStatus, onMakeLive, onTakeOffline, onGoLive, onSignOut, onEditInfo, onPaid, saveError, planAnnual, planPro, media, isPaying, buildChoice, session, slug, onAdminBack, onDomainChosen, ownedDomain = '', adminBiz, liveUrl = '', infoComplete, onSendToDesigner, playReveal, onRevealDone, previewLink = '' }: any) {
  // After sending to the designer: a full-screen preview card, the B fades in, then the text,
  // then the card shrinks into its place on the dashboard.
  const buildCardRef = useRef<View>(null);
  const revealB = useRef(new Animated.Value(0)).current;
  const revealText = useRef(new Animated.Value(0)).current;
  const revealShrink = useRef(new Animated.Value(0)).current;
  const revealFade = useRef(new Animated.Value(1)).current;
  const revealIn = useRef(new Animated.Value(0)).current; // dark card fading in over the cream page
  const revealBackdrop = useRef(new Animated.Value(1)).current; // cream cover hiding the dashboard until the card shrinks
  const [revealRect, setRevealRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [revealing, setRevealing] = useState(!!playReveal);
  useEffect(() => {
    if (!playReveal) return;
    [revealB, revealText, revealShrink, revealIn].forEach(v => v.setValue(0)); revealFade.setValue(1); revealBackdrop.setValue(1);
    setRevealing(true);
    const t = setTimeout(() => buildCardRef.current?.measureInWindow((x, y, w, h) => {
      setRevealRect({ x, y, w, h });
      Animated.sequence([
        Animated.timing(revealIn, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.delay(200),
        Animated.timing(revealB, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.delay(150),
        Animated.timing(revealText, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.delay(900),
        Animated.parallel([
          Animated.timing(revealShrink, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
          Animated.timing(revealBackdrop, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        ]),
        Animated.timing(revealFade, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start(() => { setRevealing(false); onRevealDone?.(); });
    }), 60);
    return () => clearTimeout(t);
  }, [playReveal]);
  // Red dot on Messages when there's a message from Tom the customer hasn't seen yet.
  const [hasUnread, setHasUnread] = useState(false);
  const seenKey = `bs_msgs_seen_${slug || ''}`;
  useEffect(() => {
    if (!session?.access_token || !slug) return;
    let alive = true;
    const check = async () => {
      if (tab === 'Messages') return;
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?select=sender,created_at&business_id=eq.${encodeURIComponent(slug)}&order=created_at.desc&limit=20`, { headers: authHeaders(session.access_token) });
        const rows = res.ok ? await res.json() : [];
        const seen = (await AsyncStorage.getItem(seenKey)) || '';
        if (alive) setHasUnread(Array.isArray(rows) && rows.some((m: any) => m.sender !== 'customer' && m.created_at > seen));
      } catch { /* offline: leave the dot as it is */ }
    };
    void check();
    const timer = setInterval(check, 30000);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') void check(); });
    return () => { alive = false; clearInterval(timer); sub.remove(); };
  }, [session?.access_token, slug, tab]);
  useEffect(() => {
    if (tab !== 'Messages' || !slug) return;
    const markSeen = () => { void AsyncStorage.setItem(seenKey, new Date().toISOString()).catch(() => {}); };
    setHasUnread(false);
    markSeen();
    return markSeen; // also on leaving, so messages read while on the tab don't show a dot afterwards
  }, [tab, slug]);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [showPassword, setShowPassword] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  // the Website tab fits the screen, so it rubber-bands and springs back instead of scrolling
  const websiteDrag = useRef(new Animated.Value(0)).current;
  const websiteBounce = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => websiteDrag.setValue(g.dy * .35),
    onPanResponderRelease: () => Animated.timing(websiteDrag, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(),
    onPanResponderTerminate: () => Animated.timing(websiteDrag, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(),
  }), []);
  const siteUrl = data.website?.trim() || `https://${domain}${suffix}`;
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [domainPriceLabel, setDomainPriceLabel] = useState<string | null>(null);
  const [domainPence, setDomainPence] = useState(0);
  const [domainPriceLoading, setDomainPriceLoading] = useState(false);
  const [planStep, setPlanStep] = useState<'domain' | 'plan'>('domain');
  const [liveDomain, setLiveDomain] = useState(domain || '');
  const [liveSuffix, setLiveSuffix] = useState(suffix || '.co.uk');
  const [domainError, setDomainError] = useState('');
  const [domainAvailable, setDomainAvailable] = useState(false);
  const [subNote, setSubNote] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  useEffect(() => {
    if (!isPaying || adminBiz || !session?.access_token || !slug) return;
    fetch(ADMIN_API, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'my-subscription', slug }) })
      .then(r => r.json()).then(j => { const sub = j?.subscription; if (sub?.renews) setSubNote(` · ${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${new Date(sub.renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`); })
      .catch(() => {});
  }, [isPaying, slug]);
  const [buyMode, setBuyMode] = useState(false); // Account page: buying just a domain, no plan yet
  const openPlanModal = () => {
    setBuyMode(false);
    setPlanStep(ownedDomain ? 'plan' : 'domain');
    setDomainError('');
    setDomainAvailable(false);
    setShowPlanModal(true);
  };
  const checkLiveDomain = async () => {
    const name = liveDomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!name) { setDomainError('Type the name you want first.'); return; }
    setLiveDomain(name);
    setDomainPriceLoading(true); setDomainError(''); setDomainAvailable(false);
    try {
      const res = await fetch(`${DOMAIN_API}?domain=${encodeURIComponent(name + liveSuffix)}`);
      const result = await res.json();
      if (!res.ok || !result.available) throw new Error(result.error || 'That domain is taken. Try another name or ending.');
      setDomainPriceLabel(result.priceLabel || null);
      setDomainPence(Number(result.pricePence) || 0);
      setDomainAvailable(true);
    } catch (error: any) { setDomainError(error.message || 'Couldn’t check that domain right now.'); }
    finally { setDomainPriceLoading(false); }
  };
  const confirmDomain = () => { onDomainChosen?.(liveDomain, liveSuffix); setPlanStep('plan'); };
  const openBuyDomain = () => { setBuyMode(true); setPlanStep('domain'); setDomainError(''); setDomainAvailable(false); setShowPlanModal(true); };
  const buyDomain = async () => {
    setDomainPriceLoading(true); setDomainError('');
    try {
      const email = session?.user?.email || data.contactEmail || data.email;
      const res = await fetch('https://api.brightsite.app/api/create-domain-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: liveDomain + liveSuffix, email, slug, ui_mode: 'hosted' }) });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Could not open checkout.');
      await Linking.openURL(json.url);
      setShowPlanModal(false);
    } catch (error: any) { setDomainError(error.message || 'Could not open checkout.'); }
    finally { setDomainPriceLoading(false); }
  };
  const [annual, setAnnual] = useState(!!planAnnual);
  const [planChoice, setPlanChoice] = useState<'essential' | 'pro'>('essential');
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  // Referral code: a valid one makes the domain free. Checked on the server before paying.
  const [referralCode, setReferralCode] = useState('');
  const [referralApplied, setReferralApplied] = useState('');
  const [referralNote, setReferralNote] = useState<{ ok: boolean; text: string } | null>(null);
  const checkReferral = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;
    setReferralNote({ ok: false, text: 'Checking code…' });
    try {
      const r = await fetch('https://api.brightsite.app/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ check_referral: true, referral: code }) });
      const j = await r.json();
      if (j.valid) { setReferralApplied(code); setReferralNote({ ok: true, text: 'Code applied: your domain is free.' }); }
      else { setReferralApplied(''); setReferralNote({ ok: false, text: 'That code isn’t valid.' }); }
    } catch { setReferralNote({ ok: false, text: 'Couldn’t check the code. Try again.' }); }
  };
  const handlePay = async () => {
    setPayBusy(true); setPayError('');
    try {
      const email = session?.user?.email || data.contactEmail || data.email;
      const res = await fetch(PAYMENT_SHEET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planChoice, billing: annual ? 'annual' : 'monthly', email, slug, domain: !ownedDomain && liveDomain ? liveDomain + liveSuffix : '', referral: referralApplied || undefined }),
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
      if (confirm.ok) { onPaid?.(annual, planChoice === 'pro'); Alert.alert('Publishing your website', "We’re setting everything up. This usually takes around 5 minutes while your domain registers. You’ll get a notification as soon as it’s live!"); }
      else Alert.alert('Payment received', "Thanks! We’re finishing setting up your website and will message you as soon as it’s live.");
    } catch (err: any) {
      try {
        const email = session?.user?.email || data.contactEmail || data.email;
        const fb = await fetch('https://api.brightsite.app/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planChoice, billing: annual ? 'annual' : 'monthly', email, slug, domain: !ownedDomain && liveDomain ? liveDomain + liveSuffix : '', ui_mode: 'hosted', referral: referralApplied || undefined }),
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
      if (row?.data?.published) onMakeLive?.();
    } catch { /* webhook may not have landed yet — the user can just reopen the app */ }
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && isReadyRef.current) void checkIfNowLive(); });
    return () => sub.remove();
  }, [session?.access_token, slug]);

  useEffect(() => {
    if (!slug) return;
    const channel = supabase.channel(`business-${slug}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'businesses', filter: `id=eq.${slug}` }, (payload) => {
        if (payload.new?.data?.published && isReadyRef.current) onMakeLive?.();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [slug]);

  const isLive = websiteStatus === 'live';
  const isTodo = websiteStatus === 'todo';
  const isLoadingSite = websiteStatus === 'loading';
  const isBuilding = websiteStatus === 'building' || isTodo || isLoadingSite;
  const isReady = websiteStatus === 'ready';
  const isPublishing = websiteStatus === 'publishing';
  const isReadyRef = useRef(isReady || isPublishing);
  useEffect(() => { isReadyRef.current = isReady || isPublishing; }, [isReady, isPublishing]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const buildPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(buildPulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(buildPulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  useEffect(() => {
    if (!isPublishing) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isPublishing]);
  const status = isLive ? { label: 'Live', color: C.success, bg: C.successSoft }
    : isTodo ? { label: 'Add your info', color: C.warning, bg: C.warningSoft }
    : isBuilding ? { label: 'Being built', color: C.warning, bg: C.warningSoft }
    : isPublishing ? { label: 'Publishing...', color: C.primary, bg: C.primarySoft }
    : isPaying ? { label: 'Offline', color: C.danger, bg: C.dangerSoft }
    : { label: 'Ready to publish', color: C.primary, bg: C.primarySoft };
  const confirmOffline = () => Alert.alert('Take your website offline?', 'Visitors won’t be able to see it until you put it live again. Your plan and content stay as they are.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Take offline', style: 'destructive', onPress: () => onTakeOffline?.() },
  ]);
  // Live site opens its real address; otherwise the uploaded preview opens in the browser; the in-app mock-up is the fallback.
  const realUrl = (isLive && liveUrl) || previewLink || '';
  // Opens exactly what the preview shows: the live address once live, otherwise the uploaded preview.
  const openPreview = () => { const u = realUrl || (isLive ? siteUrl : ''); if (u) void Linking.openURL(/^https?:/.test(u) ? u : `https://${u}`); };
  const goLive = () => { if (isPaying) void onGoLive?.(); else void openPlanModal(); };
  const confirmSignOut = () => Alert.alert('Log out?', 'Your website and details stay saved to your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: () => onSignOut?.() },
  ]);
  const domainLabel = domain ? `${domain}${suffix}` : 'Not chosen yet';

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="dark" />
    <View style={s.dashboardScreen}>
      {adminBiz
        ? <>
          <View style={[s.dashboardBrandRow, { paddingBottom: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Logo height={17} /><View style={aS.adminBadge}><Text style={aS.adminBadgeText}>ADMIN</Text></View></View>
            <Pressable hitSlop={10} onPress={onAdminBack} style={[s.adminBackBtn, { marginRight: 0, marginLeft: 0 }]}><Ionicons name="chevron-back" size={15} color={C.primary} /><Text style={s.adminBackText}>Dashboard</Text></Pressable>
          </View>
          <View style={[s.dashboardBrandRow, { paddingBottom: 14, gap: 10 }]}>
            <Text style={{ flex: 1, fontFamily: FONT, fontSize: 20, fontWeight: '800', color: C.ink }} numberOfLines={1}>{adminBiz.data?.name || adminBiz.data?.businessName || adminBiz.id}</Text>
            {!isLoadingSite && <View style={[s.statusPill, { backgroundColor: status.bg }]}><Animated.View style={[s.statusDot, { backgroundColor: status.color, opacity: isPublishing ? pulseAnim : 1 }]} /><Text style={[s.statusPillText, { color: status.color }]}>{status.label}</Text></View>}
          </View>
        </>
        : <View style={s.dashboardBrandRow}>
          <Logo height={17} />
          {onAdminBack && <Pressable hitSlop={10} onPress={onAdminBack} style={s.adminBackBtn}><Ionicons name="chevron-back" size={15} color={C.primary} /><Text style={s.adminBackText}>Admin</Text></Pressable>}
          {!isLoadingSite && <View style={[s.statusPill, { backgroundColor: status.bg }]}><Animated.View style={[s.statusDot, { backgroundColor: status.color, opacity: isPublishing ? pulseAnim : 1 }]} /><Text style={[s.statusPillText, { color: status.color }]}>{status.label}</Text></View>}
        </View>}
      <View style={s.dashboardTabsTop}>{['Website', 'Messages', 'Account'].map(name => <Pressable key={name} onPress={() => setTab(name)} style={[s.dashboardTab, tab === name && s.dashboardTabOn]}><Text style={[s.dashboardTabText, tab === name && s.dashboardTabTextOn]}>{name}</Text>{name === 'Messages' && hasUnread && tab !== 'Messages' && <View style={s.unreadDot} accessibilityLabel="New message" />}</Pressable>)}</View>
      {!!saveError && <View style={s.saveBanner}><Ionicons name="alert-circle" size={16} color={C.danger} /><Text style={s.saveBannerText}>{saveError}</Text></View>}
      {tab === 'Messages' ? (adminBiz
        ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><MessageThread key={adminBiz.id} session={session} slug={adminBiz.id} viewer="admin" otherName={(adminBiz.data?.fullName || adminBiz.data?.name || 'Customer').trim().split(' ')[0]} placeholder="Message…" intro={<>
            <View style={[s.messageBubble, s.messageBubbleSent]}><Text style={[s.messageText, { color: '#fff' }]}>{welcomeText(adminBiz.data?.fullName, adminBiz.data?.buildChoice || (/Build choice: designer/i.test(adminBiz.data?.notes || '') ? 'designer' : null))}</Text></View>
            <Text style={[s.messageMeta, s.messageMetaSent]}>You · Welcome message</Text>
          </>} /></KeyboardAvoidingView>
        : <MessageThread session={session} slug={slug} viewer="customer" otherName="Tom" placeholder="Message Tom…" intro={<>
          <View style={[s.messageBubble, s.messageBubbleReceived]}><Text style={s.messageText}>{welcomeText(data.fullName, buildChoice)}</Text></View>
          <Text style={[s.messageMeta, s.messageMetaReceived]}>Tom · BrightSite</Text>
        </>} />) :
      <ScrollView key={tab} scrollEnabled={tab !== 'Website'} contentContainerStyle={s.dashboardContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {tab === 'Account' && adminBiz && <>
          <AdminAccountPanel biz={adminBiz} session={session} isLive={isLive} />
        </>}
        {tab === 'Account' && !adminBiz && <>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Plan</Text>
            <Text style={s.dashboardCardTitle}>{isPaying ? `${planPro ? 'Pro' : 'Free'} plan · ${planAnnual ? 'Annual' : 'Monthly'}` : 'No plan yet'}</Text>
            <Text style={s.dashboardCardText}>{isPaying ? (planAnnual ? '£16/month hosting, billed £192 yearly' : '£19/month hosting') + subNote : 'Choose a plan when you tap Make Live.'}</Text>
          </View>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Domain</Text>
            <Text style={s.dashboardCardTitle}>{ownedDomain || domainLabel}</Text>
            <Text style={s.dashboardCardText}>{isLive ? 'Connected to your website' : ownedDomain ? 'Bought. Connects when your website goes live' : domain ? 'Connects when your website goes live' : 'Buy one now or choose it when you go live'}</Text>
            {!ownedDomain && !isPaying && !onAdminBack && <Pressable onPress={openBuyDomain} style={s.cardLink} hitSlop={8}><Ionicons name="globe-outline" size={15} color={C.primary} /><Text style={s.cardLinkText}>Buy a domain</Text></Pressable>}
          </View>
          <View style={s.dashboardInfoCard}>
            <Text style={s.dashboardCardLabel}>Login email</Text>
            <Text style={s.dashboardCardTitle}>{session?.user?.email || data.email || '—'}</Text>
            <Pressable onPress={() => setShowPassword(true)} style={s.cardLink} hitSlop={8}><Ionicons name="key-outline" size={15} color={C.primary} /><Text style={s.cardLinkText}>Change password</Text></Pressable>
          </View>
          <ChangePasswordModal visible={showPassword} onClose={() => setShowPassword(false)} />
          <Pressable onPress={confirmSignOut} style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}><Ionicons name="log-out-outline" size={17} color={C.danger} /><Text style={[s.secondaryBtnText, { color: C.danger }]}>Log out</Text></Pressable>
        </>}
        {tab === 'Website' && <Animated.View {...websiteBounce.panHandlers} style={{ transform: [{ translateY: websiteDrag }] }}>
          <View style={[s.dashboardWebsiteHead, { zIndex: 20 }]}>
            {adminBiz
              ? <View style={{ flexDirection: 'row', alignItems: 'center', width: (SCREEN_WIDTH - 40) / 2 - 43 }}>
                  <Pressable onPress={() => void Linking.openURL(`https://brightsite.app/account/admin.html?client=${encodeURIComponent(adminBiz.id)}&upload=1`)} accessibilityLabel="Upload website" style={({ pressed }) => [s.dashboardEdit, { paddingHorizontal: 12 }, pressed && s.pressed]}><Ionicons name="cloud-upload-outline" size={15} color={C.ink} /><Text style={s.dashboardEditText}>Upload</Text></Pressable>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                  <Pressable onPress={() => void Share.share({ message: businessBrief(adminBiz), title: 'Business brief' })} accessibilityLabel="Copy all business info" style={({ pressed }) => [s.dashboardEdit, { paddingHorizontal: 11 }, pressed && s.pressed]}><Ionicons name="copy-outline" size={15} color={C.ink} /></Pressable>
                  </View>
                </View>
              : (isReady || isLive || isPublishing) && !isBuilding
              ? isLive
                ? <Pressable onPress={confirmOffline} style={({ pressed }) => [s.dashboardEdit, pressed && s.pressed]}>
                    <Ionicons name="cloud-offline-outline" size={14} color={C.inkMuted} />
                    <Text style={[s.dashboardEditText, { color: C.inkMuted }]}>Take Offline</Text>
                  </Pressable>
                : isPublishing
                  ? <Animated.View style={[s.makeLiveBtn, { opacity: pulseAnim }]}>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5 }} />
                      <Text style={s.makeLiveBtnText}>Publishing...</Text>
                    </Animated.View>
                  : <Pressable onPress={goLive} style={({ pressed }) => [s.makeLiveBtn, pressed && s.pressed]}>
                      <Ionicons name="rocket-outline" size={13} color="#fff" />
                      <Text style={s.makeLiveBtnText}>Make Live</Text>
                    </Pressable>
              : isTodo
                ? <Pressable disabled={!infoComplete} onPress={() => onSendToDesigner?.()} style={({ pressed }) => [s.makeLiveBtn, !infoComplete && { opacity: .45 }, pressed && s.pressed]}>
                    <Ionicons name="paper-plane-outline" size={13} color="#fff" />
                    <Text style={s.makeLiveBtnText}>Send to designer</Text>
                  </Pressable>
                : isBuilding
                  // shown while the designer builds the site so customers know what's next; unlocks once it's ready
                  ? <View style={[s.makeLiveBtn, { opacity: .45 }]} accessibilityState={{ disabled: true }}>
                      <Ionicons name="rocket-outline" size={13} color="#fff" />
                      <Text style={s.makeLiveBtnText}>Make Live</Text>
                    </View>
                  : <View />}
            <View style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' as any }}><DeviceToggle mode={previewMode} setMode={setPreviewMode} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* analytics unlock once the site is live; they open the analytics view on the web dashboard */}
              <Pressable disabled={!isLive && !adminBiz} onPress={() => setShowAnalytics(true)} accessibilityLabel="Analytics" style={({ pressed }) => [s.dashboardEdit, { paddingHorizontal: 11 }, !isLive && !adminBiz && { opacity: .45 }, pressed && s.pressed]}>
                <Ionicons name="stats-chart" size={15} color={C.primary} />
              </Pressable>
            <View>
              <Pressable onPress={() => isBuilding || adminBiz ? onEditInfo?.() : setShowEditMenu(v => !v)} style={({ pressed }) => [s.dashboardEdit, pressed && s.pressed]}>
                <Ionicons name="create-outline" size={15} color={C.ink} /><Text style={s.dashboardEditText}>Edit</Text>
                {!isBuilding && !adminBiz && <Ionicons name={showEditMenu ? 'chevron-up' : 'chevron-down'} size={14} color={C.inkMuted} />}
              </Pressable>
              {showEditMenu && <View style={s.editMenu}>
                <Pressable onPress={() => { setShowEditMenu(false); onEditInfo?.(); }} style={({ pressed }) => [s.editMenuItem, pressed && { backgroundColor: C.primarySoft }]}>
                  <Ionicons name="storefront-outline" size={17} color={C.primary} /><View><Text style={s.editMenuTitle}>Business info</Text><Text style={s.editMenuSub}>Details, hours, services and photos</Text></View>
                </Pressable>
              </View>}
            </View>
            </View>
          </View>
          {isBuilding
            ? <View style={[s.buildingWrap, { height: DASHBOARD_PREVIEW_HEIGHT + DASHBOARD_PREVIEW_INSET * 2, justifyContent: 'center' }]}>
              <View ref={buildCardRef} collapsable={false} style={previewMode === 'desktop' && !playReveal ? [s.desktopFrame, s.buildingPhone, { alignSelf: 'stretch', width: '100%', height: (SCREEN_WIDTH - 32) * 0.68, borderWidth: 6, padding: 0, marginTop: 18 }] : [s.phoneFrame, s.buildingPhone]}>
                <View style={{ flex: 1, width: DASHBOARD_PREVIEW_WIDTH - 40, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={[s.buildingGlow, isTodo && s.todoGlow, { opacity: buildPulse.interpolate({ inputRange: [0, 1], outputRange: [.35, 1] }), transform: [{ scale: buildPulse.interpolate({ inputRange: [0, 1], outputRange: [.92, 1] }) }] }]}><View style={[s.buildingGlowInner, isTodo && s.todoGlowInner]}><Image source={require('./assets/brightsite-b-white.png')} resizeMode="contain" style={s.buildingLogo} /></View></Animated.View>
                {!isLoadingSite && <Text style={[s.buildingText, { color: '#fff', marginTop: 28 }]}>{isTodo ? 'Let’s build your website' : 'Building your preview'}</Text>}
                {!isLoadingSite && <Text style={[s.buildingSub, { color: 'rgba(255,255,255,.6)' }]}>{isTodo ? 'Fill in your info cards. The more you add, the better your site. Then send it to your designer.' : 'We’ll send you a notification as soon as it’s ready to review.'}</Text>}
                </View>
              </View>
            </View>
            : <>
            <View style={[s.buildingWrap, { height: DASHBOARD_PREVIEW_HEIGHT + DASHBOARD_PREVIEW_INSET * 2, justifyContent: 'center' }]}>
              {realUrl
                ? <RealSitePreview url={realUrl} label={domain ? `${domain}${suffix}` : slug ? `${slug}.brightsite.app` : 'yourwebsite.co.uk'} desktop={previewMode === 'desktop'} onPress={openPreview} />
                : <View style={[previewMode === 'desktop' ? s.desktopFrame : s.phoneFrame, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}><Text style={[s.buildingSub, { color: 'rgba(255,255,255,.6)', textAlign: 'center' }]}>Your website preview appears here once it's ready.</Text></View>}
            </View>
            </>}
        </Animated.View>}
      </ScrollView>}
    </View>
    <AnalyticsModal visible={showAnalytics} slug={adminBiz ? adminBiz.id : slug} session={session} onClose={() => setShowAnalytics(false)} />
    <Modal visible={showPlanModal} transparent animationType="slide" onRequestClose={() => setShowPlanModal(false)}>
      <View style={s.planModalOverlay}>
        <View style={s.planModalBox}>
          {planStep === 'domain' ? <>
          <View style={s.planModalHeader}><Text style={s.planModalTitle}>{buyMode ? 'Buy a domain' : 'Choose your domain'}</Text><Pressable onPress={() => setShowPlanModal(false)} hitSlop={10}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          <Text style={s.planModalSub}>This is the web address people will type to find you.</Text>
          <TextInput value={liveDomain} onChangeText={v => { setLiveDomain(v); setDomainAvailable(false); setDomainError(''); }} placeholder="yourbusiness" placeholderTextColor={C.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="search" onSubmitEditing={() => void checkLiveDomain()} style={[s.input, { marginTop: 14 }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            {DOMAIN_TLDS.map(t => <Pressable key={t} onPress={() => { setLiveSuffix(t); setDomainAvailable(false); setDomainError(''); }} style={[s.chip, liveSuffix === t && s.chipOn]}><Text style={[s.chipText, liveSuffix === t && s.chipTextOn]}>{t}</Text></Pressable>)}
          </ScrollView>
          {!!domainError && <Text style={s.domainError}>{domainError}</Text>}
          {domainAvailable && <View style={s.domainResult}><Ionicons name="checkmark-circle" size={24} color={C.success || '#1f9d55'} /><View style={{ flex: 1 }}><Text style={s.domainName}>{liveDomain}{liveSuffix}</Text><Text style={s.domainPrice}>Available{domainPriceLabel ? ` — ${domainPriceLabel}` : ''}</Text></View></View>}
          <Pressable disabled={domainPriceLoading || !liveDomain.trim()} onPress={() => domainAvailable ? (buyMode ? void buyDomain() : confirmDomain()) : void checkLiveDomain()} style={[s.planModalPayBtn, (domainPriceLoading || !liveDomain.trim()) && { opacity: .5 }]}>
            {domainPriceLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.planModalPayBtnText}>{domainAvailable ? (buyMode ? 'Buy domain' : 'Continue') : 'Check availability'}</Text>}
          </Pressable>
          </> : <>
          <View style={s.planModalHeader}><Pressable onPress={() => ownedDomain ? setShowPlanModal(false) : setPlanStep('domain')} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable><Text style={[s.planModalTitle, { flex: 1, marginLeft: 6 }]}>Choose your plan</Text><Pressable onPress={() => setShowPlanModal(false)} hitSlop={10}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          <View style={s.billingToggle}>
            {([false, true] as const).map(isAnnual => <Pressable key={String(isAnnual)} onPress={() => setAnnual(isAnnual)} style={[s.billingOption, annual === isAnnual && s.billingOptionOn]}>
              <Text style={[s.billingText, annual === isAnnual && s.billingTextOn]}>{isAnnual ? 'Annual' : 'Monthly'}</Text>
              {isAnnual && <Text style={[s.billingSave, annual && { color: '#fff' }]}>save £36</Text>}
            </Pressable>)}
          </View>
          {PLAN_OPTIONS.map(opt => <Pressable key={opt.id} onPress={() => setPlanChoice(opt.id)} style={[s.planModalOption, planChoice === opt.id && s.planModalOptionOn]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              {opt.tag && <View style={s.savePill}><Text style={s.savePillText}>{opt.tag}</Text></View>}
              <Text style={s.planModalOptionName}>{opt.name}</Text>
              <Text style={s.planModalOptionNote}>{opt.note}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.planModalOptionPrice}>{opt.build}</Text>
              <Text style={s.planModalOptionNote}>{opt.buildLabel}</Text>
            </View>
          </Pressable>)}
          <Text style={s.planModalTotal}>{planChoice === 'pro' ? '£199 build fee today, then ' : ''}{annual ? '£192/yr hosting (£16/mo)' : '£19/mo hosting'} · cancel any time</Text>
          <View style={s.planModalFeeNote}>
            <Ionicons name="globe-outline" size={14} color={C.primary} />
            <Text style={s.planModalFeeText}>
              {ownedDomain ? `${ownedDomain}: already yours, nothing to pay for your domain` : `${liveDomain}${liveSuffix}: ${domainPriceLoading ? 'checking price…' : domainNote(domainPence, annual || planChoice === 'pro')}`}
            </Text>
          </View>
          {!!liveDomain && !ownedDomain && <View style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 }}>Have a referral code?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={referralCode} onChangeText={v => { setReferralCode(v.toUpperCase()); setReferralApplied(''); setReferralNote(null); }} placeholder="Enter code" placeholderTextColor={C.placeholder} autoCapitalize="characters" autoCorrect={false} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontFamily: FONT, fontSize: 15, color: C.ink, backgroundColor: C.field }} />
              <Pressable onPress={() => void checkReferral()} style={({ pressed }) => [{ height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, pressed && s.pressed]}>
                <Text style={{ fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#fff' }}>Apply</Text>
              </Pressable>
            </View>
            {!!referralNote && <Text style={{ fontFamily: FONT, fontSize: 13, marginTop: 6, color: referralNote.ok ? C.success : C.danger }}>{referralNote.text}</Text>}
          </View>}
          {!!payError && <Text style={{ fontFamily: FONT, fontSize: 12, color: C.danger, marginTop: 8 }}>{payError}</Text>}
          <Pressable onPress={() => void handlePay()} disabled={payBusy} style={[s.planModalPayBtn, payBusy && { opacity: .6 }]}>
            {payBusy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="lock-closed" size={15} color="#fff" /><Text style={s.planModalPayBtnText}>Pay securely</Text></>}
          </Pressable>
          </>}
        </View>
      </View>
    </Modal>
    {revealing && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 998, elevation: 998, backgroundColor: C.card, opacity: revealBackdrop }]} />}
    {revealing && <Animated.View pointerEvents="none" style={[s.revealCard, revealRect ? {
      left: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [0, revealRect.x] }),
      top: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [0, revealRect.y] }),
      width: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_WIDTH, revealRect.w] }),
      height: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_HEIGHT, revealRect.h] }),
      borderRadius: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }),
      borderWidth: revealShrink.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }),
      opacity: Animated.multiply(revealIn, revealFade),
    } : { left: 0, top: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT, opacity: 0 }]}>
      <Animated.View style={[s.buildingGlow, { opacity: revealB, transform: [{ scale: revealB.interpolate({ inputRange: [0, 1], outputRange: [.85, 1] }) }] }]}><View style={s.buildingGlowInner}><Image source={require('./assets/brightsite-b-white.png')} resizeMode="contain" style={s.buildingLogo} /></View></Animated.View>
      <Animated.Text style={[s.buildingText, { color: '#fff', marginTop: 28, opacity: revealText }]}>Building your preview</Animated.Text>
      <Animated.Text style={[s.buildingSub, { color: 'rgba(255,255,255,.6)', opacity: revealText }]}>We’ll send you a notification as soon as it’s ready to review.</Animated.Text>
    </Animated.View>}
  </KeyboardAvoidingView>;
}


function AppInner({ onSignedOut }: { onSignedOut: () => void }) {
  const [index, setIndex] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [resetModal, setResetModal] = useState(false);
  const [resetSession, setResetSession] = useState<{ access_token: string; refresh_token: string } | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSession, setAuthSession] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [complete, setComplete] = useState<Set<number>>(new Set());
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
  const [domainReady, setDomainReady] = useState(false);
  const [contactForm, setContactForm] = useState(false);
  const [tab, setTab] = useState('Website');
  const [appScreen, setAppScreen] = useState<'onboarding' | 'choose' | 'loading' | 'dashboard' | 'admin'>('onboarding');
  const [chooseMode, setChooseMode] = useState<'pick' | 'auto'>('pick');
  const [autoPending, setAutoPending] = useState(false);
  const [adminBusinesses, setAdminBusinesses] = useState<any[]>([]);
  const [adminFilter, setAdminFilter] = useState<'all' | 'new' | 'build' | 'pending' | 'live'>('all');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminTab, setAdminTab] = useState<'businesses' | 'messages' | 'notifications'>('businesses');
  const [adminActiveThread, setAdminActiveThread] = useState<any>(null);
  const [adminAllMessages, setAdminAllMessages] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminViewingBusiness, setAdminViewingBusiness] = useState<any>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [buildChoice, setBuildChoice] = useState<'designer' | 'template' | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<'loading' | 'todo' | 'building' | 'ready' | 'publishing' | 'live'>('loading');
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, fresh) => { if (fresh) setSession(fresh); });
    return () => sub.subscription.unsubscribe();
  }, []);
  const [slug, setSlug] = useState<string | null>(null);
  const [data, setData] = useState({ email: '', password: '', businessName: '', category: '', fullName: '', contactEmail: '', phone: '', website: '', instagram: '', facebook: '', address: '', reviewLink: '', reviewSource: null as null | 'Google' | 'Trustpilot', googleLink: '', trustpilotLink: '', ownerEmail: '', sameEmail: true, designerNotes: '' });
  const [planAnnual, setPlanAnnual] = useState(false);
  const [planPro, setPlanPro] = useState(false);
  const [saveError, setSaveError] = useState('');
  const businessRecord = useRef<Record<string, any>>({});
  const [showFullName, setShowFullName] = useState(false);
  const fieldRefs = useRef<Record<string, TextInput | null>>({});
  const [typeSheet, setTypeSheet] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [sheet, setSheet] = useState<{ kind: 'review' | 'offer'; index: number | null } | null>(null);
  const [hours, setHours] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ label, start: '9:00', end: i === 3 ? '19:00' : '17:30', enabled: i < 6 })));
  const [services, setServices] = useState([{ cid: newCid(), section: '', name: '', duration: '', price: '' }]);
  const [reviewsList, setReviewsList] = useState<{ title: string; description: string; name: string }[]>([]);
  const [offers, setOffers] = useState<{ name: string; value: string }[]>([]);
  const motion = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingFades = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const designReveal = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const step = steps[Math.min(index, steps.length - 1)];

  const hydrateFromRecord = (record: Record<string, any>, accountEmail: string) => {
    businessRecord.current = record;
    const raw = record.raw || {};
    setData(current => ({
      ...current,
      businessName: raw.name || record.name || '',
      category: raw.tagline || '',
      fullName: raw.fullName || '',
      ownerEmail: raw.ownerEmail || '',
      // older web saves kept customer notes in `notes`, which otherwise holds the build-choice marker
      designerNotes: raw.designerNotes || (raw.notes && !/^Build choice:/.test(raw.notes) ? raw.notes : ''),
      sameEmail: raw.sameEmail !== false,
      contactEmail: raw.email || accountEmail,
      phone: raw.phone || '',
      website: raw.website || '',
      instagram: raw.instagram || '',
      facebook: raw.facebook || '',
      address: raw.address || '',
      reviewLink: raw.reviewLink || '',
      reviewSource: raw.reviewSource || null,
      googleLink: raw.googleLink || (raw.reviewSource === 'Google' ? raw.reviewLink || '' : ''),
      trustpilotLink: raw.trustpilotLink || (raw.reviewSource === 'Trustpilot' ? raw.reviewLink || '' : ''),
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
    if (Array.isArray(raw.offers)) setOffers(raw.offers);
    setMedia({ logo: raw.logoImage, hero: raw.heroImage, gallery: Array.isArray(raw.gallery) ? raw.gallery : [] });
    // customDomain can hold the free brightsite.app address; only a real domain counts here
    const chosen = String([record.customDomain, record.domain, raw.chosenDomain].find((x: any) => x && !/brightsite\.app/i.test(String(x))) || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const dot = chosen.indexOf('.');
    if (dot > 0) { setDomain(chosen.slice(0, dot)); setSuffix(chosen.slice(dot)); setDomainReady(true); }
    else { setDomain(''); setSuffix('.co.uk'); setDomainReady(false); } // don't carry the previous client's domain over
    const design = raw.design || {};
    setContactForm(!!(raw.contactForm ?? design.contactForm));
    setPlanAnnual(!!raw.chosenAnnual);
    setPlanPro(raw.chosenPlan === 'pro');
    const isDesigner = raw.buildChoice === 'designer' || /Build choice: designer/.test(raw.notes || '');
    setBuildChoice(isDesigner ? 'designer' : 'template');
    const hasPreview = !!(record.demoUrl || record.previewUrl || record.liveUrl);
    const todo = !hasPreview && !record.published && !(raw.sentToDesigner || raw.draft === false);
    setWebsiteStatus(todo ? 'todo' : record.published ? 'live' : record.needsPublish && !record.published ? 'publishing' : isDesigner && !hasPreview ? 'building' : 'ready');
    if (slugOf(record) && !todo) checkSiteLive(slugOf(record), record, isDesigner);
  };

  // The pill only says Live while the site worker is really serving the site.
  const slugOf = (record: any) => record?.slug || slug;
  const checkSiteLive = async (id: string, record: any, isDesigner: boolean) => {
    try {
      const st = await (await fetch(`${UPLOAD_WORKER}/status/${encodeURIComponent(id)}`)).json();
      // Sites published before the site worker (hosted elsewhere) keep their saved status.
      if (!st.hasSite && record.published && record.liveUrl && !/sites\.brightsite\.app/.test(record.liveUrl)) return;
      if (st.live) { setWebsiteStatus('live'); if (st.url) businessRecord.current = { ...businessRecord.current, liveUrl: st.url }; return; }
      // Published sites served from their own address (e.g. name.brightsite.app) count as live when that address really answers.
      const addr = [record.liveUrl, record.customDomain].find((u: any) => /^https?:\/\//.test(String(u || '')));
      if (record.published && addr) {
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
        const ok = await fetch(addr, { signal: ctl.signal }).then(r => r.ok).catch(() => false);
        clearTimeout(timer);
        if (ok) { setWebsiteStatus('live'); businessRecord.current = { ...businessRecord.current, liveUrl: addr }; return; }
      }
      if (record.published) setWebsiteStatus(st.hasSite ? 'publishing' : 'building');
      else if (record.planActive && !record.manuallyOffline) setWebsiteStatus(st.hasSite ? 'publishing' : 'building');
      else if (isDesigner && !st.hasSite && !(record.demoUrl || record.previewUrl)) setWebsiteStatus('building');
    } catch {}
  };

  const workerPublish = async (id: string, live: boolean) => {
    const res = await fetch(`${UPLOAD_WORKER}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      // send the connected custom domain too, so the first go-live connects it
      body: JSON.stringify({ slug: id, live, domain: live && businessRecord.current?.domainConnected ? (businessRecord.current.customDomain || '') : '' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Could not update your website');
    return json as { live: boolean; url: string | null };
  };

  const saveBusiness = async (id: string, patch: { raw?: Record<string, any>; [key: string]: any }, auth: any = session) => {
    const previous = businessRecord.current;
    const record = { ...previous, ...patch, slug: id, name: patch.raw?.name || previous.raw?.name || data.businessName, raw: { ...(previous.raw || {}), ...(patch.raw || {}) }, updatedAt: new Date().toISOString() };
    const row = await upsertBusiness(auth, id, record.name, record);
    businessRecord.current = row?.data || record;
    return row;
  };


  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    onSignedOut();
  };

  const ADMIN_EMAIL = 'brightsiteapp@gmail.com';

  const adminStatusOf = (b: any): 'new' | 'build' | 'pending' | 'live' => {
    const d = b.data || {};
    if (d.published) return 'live';
    if (d.previewUrl || d.demoUrl || d.liveUrl) return 'pending';
    if (d.buildChoice === 'designer' || /Build choice: designer/i.test(d.notes || '')) return 'build';
    return 'new';
  };


  const loadAdminData = async (sess: any) => {
    setAdminLoading(true);
    try {
      const [bizRes, msgRes] = await Promise.all([
        fetch('https://api.brightsite.app/api/admin-businesses', { headers: { Authorization: `Bearer ${sess.access_token}` } }),
        fetch(`${SUPABASE_URL}/rest/v1/messages?select=id,business_id,sender,body,created_at&order=created_at.desc&limit=2000`, { headers: authHeaders(sess.access_token) }),
      ]);
      if (bizRes.ok) { const rows = await bizRes.json(); setAdminBusinesses(Array.isArray(rows) ? rows : []); }
      if (msgRes.ok) { const msgs = await msgRes.json(); setAdminAllMessages(Array.isArray(msgs) ? msgs : []); }
    } catch {}
    finally { setAdminLoading(false); }
  };

  const adminThreadMessages = (bizId: string) => adminAllMessages.filter((m: any) => m.business_id === bizId).slice().reverse();

  const adminThreadUnread = (bizId: string) => {
    const msgs = adminThreadMessages(bizId);
    if (!msgs.length) return false;
    return msgs[msgs.length - 1].sender === 'customer';
  };

  const adminBusinessesWithMessages = () => {
    const bizIds = [...new Set(adminAllMessages.map((m: any) => m.business_id))];
    return bizIds.map(id => {
      const biz = adminBusinesses.find(b => b.id === id);
      const lastMsg = adminAllMessages.find((m: any) => m.business_id === id);
      return { id, biz, lastMsg };
    }).filter(x => x.biz).sort((a, b) => new Date(b.lastMsg?.created_at || 0).getTime() - new Date(a.lastMsg?.created_at || 0).getTime());
  };

  const adminOpenBusiness = (biz: any) => {
    const email = biz.data?.contactEmail || biz.data?.email || '';
    hydrateFromRecord(biz.data || {}, email);
    setSlug(biz.id);
    setAdminViewingBusiness(biz);
    setAppScreen('dashboard');
  };

  const adminBackFromBusiness = () => {
    setAdminViewingBusiness(null);
    setAppScreen('admin');
  };

  const loadAccountDestination = async (authedSession: any) => {
    const email = authedSession?.user?.email || data.email.trim();
    setAuthSession(true);
    setSession(authedSession);
    if (email.toLowerCase() === ADMIN_EMAIL) {
      setAppScreen('admin');
      // register this phone for admin alerts (new clients, messages, payments)
      registerPushToken().then(t => { if (t) pingAdminApi(authedSession.access_token, { action: 'register-admin-push', token: t }); }).catch(() => {});
      void loadAdminData(authedSession);
      return;
    }
    setData(current => ({ ...current, email, contactEmail: current.contactEmail || email }));
    const { data: rows, error } = await supabase
      .from('businesses')
      .select('id,data,user_id')
      .eq('user_id', authedSession.user.id)
      .limit(10);
    if (error) throw error;
    const realRow = rows?.find((row: any) => !(row.data && row.data.stub)) || rows?.[0];
    const serverDraft = realRow?.data?.raw?.draft ? realRow : null;
    if (realRow && !(realRow.data && realRow.data.stub) && !serverDraft) {
      setSlug(realRow.id);
      hydrateFromRecord(realRow.data || {}, email);
      registerPushToken().then(token => {
        if (token && token !== realRow.data?.pushToken) savePushToken(authedSession.access_token, realRow.id, token);
      });
      Keyboard.dismiss();
      setAppScreen('dashboard');
      return;
    }
    // Unsent signup saved on the server: load it, then let a newer on-phone draft (with local photos) win.
    if (serverDraft) {
      setSlug(serverDraft.id);
      hydrateFromRecord(serverDraft.data, email);
    }
    // No sent business record — restore any saved draft
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.data) setData((cur: any) => ({ ...cur, ...draft.data }));
        if (draft.hours) setHours(draft.hours);
        if (draft.services) setServices(draft.services);
        if (draft.reviewsList) setReviewsList(draft.reviewsList);
        if (draft.offers) setOffers(draft.offers);
        if (typeof draft.contactForm === 'boolean') setContactForm(draft.contactForm);
        if (draft.media) setMedia(draft.media);
        if (draft.domain) setDomain(draft.domain);
        if (typeof draft.index === 'number' && draft.index > 0) {
          // drafts saved before the domain step was removed can point past the last card
          const resumeAt = Math.min(draft.index, steps.length - 1);
          setIndex(resumeAt);
          motion.setValue(resumeAt * CARD_TRAVEL);
          return;
        }
      }
    } catch {}
    if (serverDraft) {
      const resumeAt = Math.min(Math.max(1, serverDraft.data.raw.draftIndex || 1), steps.length - 1);
      setIndex(resumeAt);
      motion.setValue(resumeAt * CARD_TRAVEL);
      setAppScreen('onboarding');
      return;
    }
    setIndex(1);
    motion.setValue(CARD_TRAVEL);
    setChooseMode('pick');
    setAppScreen('choose');
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

  // Auto-save draft while user is in the onboarding flow (logged in, no business yet)
  useEffect(() => {
    if (!authSession || appScreen !== 'onboarding' || editingInfo) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ data, hours, services, reviewsList, offers, contactForm, media, domain, index })).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [data, hours, services, reviewsList, offers, contactForm, media, domain, index, authSession, appScreen, editingInfo]);

  useEffect(() => {
    const handleUrl = (url: string) => {
      if (!url.includes('reset-password')) return;
      const hash = url.split('#')[1] || '';
      const params = Object.fromEntries(hash.split('&').map(p => { const [k, ...v] = p.split('='); return [k, decodeURIComponent(v.join('='))]; }));
      const access = params['access_token'];
      const refresh = params['refresh_token'];
      if (access && refresh) { setResetSession({ access_token: access, refresh_token: refresh }); setResetModal(true); }
    };
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);


  const minimumInfoComplete = (stepId = step.id) => {
    switch (stepId) {
      case 'login': return /\S+@\S+\.\S+/.test(data.email.trim()) && data.password.length >= 8;
      case 'business': return !!data.fullName.trim() && !!data.businessName.trim() && !!data.category.trim();
      case 'contact': return /\S+@\S+\.\S+/.test(data.contactEmail.trim()) || data.phone.replace(/\D/g, '').length >= 7;
      case 'hours': return hours.some(row => row.enabled && row.start.trim() && row.end.trim());
      case 'prices': return services.some(it => it.name.trim()) && services.every(it => !it.name.trim() || it.section.trim());
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
    Keyboard.dismiss();
    setValidationMessage('');
    setDeckDirection(forward ? 1 : -1);
    transitioning.current = true;
    setStepEditMode(false);
    // colour the rail as soon as the move starts; the last card has no next step so it counts once reached
    if (forward) setComplete(old => new Set([...old, index, ...(next === steps.length - 1 ? [next] : [])]));
    Animated.timing(motion, { toValue: next * CARD_TRAVEL, duration: 420, easing: Easing.bezier(.18, .78, .22, 1), useNativeDriver: true }).start(() => {
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
    if (authMode === 'signup') {
      const problem = await emailProblem(credentials.email);
      if (problem) { setAuthBusy(false); setAuthStatus(''); setValidationMessage(problem); return; }
    }
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
  const googleSignIn = async () => {
    Keyboard.dismiss();
    setAuthBusy(true);
    setAuthStatus('');
    try {
      const redirectTo = makeRedirectUri({ scheme: 'app.brightsite.mobile', path: 'auth-callback' });
      const { data: oauthData, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !oauthData.url) { setAuthStatus('Google sign-in failed. Try again.'); return; }
      const result = await WebBrowser.openAuthSessionAsync(oauthData.url, redirectTo);
      if (result.type !== 'success' || !result.url) { setAuthStatus(''); return; }

      // Try PKCE code exchange
      try {
        const { data: exData, error: exErr } = await supabase.auth.exchangeCodeForSession(result.url);
        if (!exErr && exData.session) { await loadAccountDestination(exData.session); return; }
      } catch {}

      // Fallback: tokens in URL hash (implicit flow)
      const hash = result.url.split('#')[1] || '';
      if (hash) {
        const params = Object.fromEntries(hash.split('&').map(p => { const [k, ...v] = p.split('='); return [k, decodeURIComponent(v.join('='))]; }));
        const access = params['access_token'];
        const refresh = params['refresh_token'];
        if (access && refresh) {
          const { data: sd, error: se } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          if (!se && sd.session) { await loadAccountDestination(sd.session); return; }
        }
      }

      // Last resort: brief wait then check session
      await new Promise(r => setTimeout(r, 800));
      const { data: sd } = await supabase.auth.getSession();
      if (sd.session) { await loadAccountDestination(sd.session); return; }

      setAuthStatus('Sign-in didn\'t complete. Please try again.');
    } catch {
      setAuthStatus('Google sign-in failed. Try again.');
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

  // draft: saves progress mid-signup (photos included) without notifying anyone or clearing the local draft
  const syncOnboardingToBackend = async (choice: 'designer' | 'template', opts: { draft?: boolean } = {}): Promise<boolean> => {
    if (!session?.user?.id) return false;
    const draft = !!opts.draft;
    // the stored session can be hours old; getSession refreshes an expired token first
    const { data: fresh } = await supabase.auth.getSession();
    const authed = fresh.session || session;
    if (!draft) setSaveError('');
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
      ownerEmail: data.ownerEmail.trim(),
      designerNotes: data.designerNotes.trim(),
      sameEmail: data.sameEmail,
      fullNameDisplay: showFullName,
      address: data.address,
      notes: `Build choice: ${choice}`,
      buildChoice: choice,
      googleLink: data.googleLink.trim(),
      trustpilotLink: data.trustpilotLink.trim(),
      // older site templates read one link, so prefer Trustpilot (it shows a badge)
      reviewLink: data.trustpilotLink.trim() || data.googleLink.trim(),
      reviewSource: data.trustpilotLink.trim() ? 'Trustpilot' : data.googleLink.trim() ? 'Google' : null,
      reviewItems,
      offers,
      reviewQuotes: reviewItems.map(r => [r.title, r.description, r.name].filter(Boolean).join(' — ')),
      hours: hoursStructured.map(d => `${d.day}: ${d.open ? `${d.from || '?'}–${d.to || '?'}` : 'Closed'}`),
      hoursStructured,
      serviceGroups: Object.values(groups),
      contactForm,
      logoImage: logoImage || undefined,
      heroImage: heroImage || undefined,
      gallery: gallery.filter((url): url is string => !!url),
      chosenDomain: domainReady ? domain + suffix : undefined,
    });
    // Admin editing a client: save through the admin API (never the client's own row via this login).
    if (adminViewingBusiness) {
      try {
        const remote = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : undefined);
        const { notes: _n, buildChoice: _b, ...raw } = buildRaw(remote(media.logo) || null, remote(media.hero) || null, media.gallery.map(u => remote(u) || null)) as any;
        const res = await fetch(ADMIN_API, { method: 'POST', headers: { Authorization: `Bearer ${authed.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-raw', slug: adminViewingBusiness.id, raw }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setAdminViewingBusiness((b: any) => ({ ...b, data: j.data }));
        setAdminBusinesses(list => list.map(x => x.id === adminViewingBusiness.id ? { ...x, data: j.data } : x));
        return true;
      } catch (err: any) { if (!draft) setSaveError(err.message || 'Could not save.'); return false; }
    }
    // A slug owned by another account is rejected by the RPC, so try a few suffixed variants.
    for (let attempt = 0; attempt < 4; attempt++) {
      const chosenSlug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        // the upload worker only accepts photos for a business this user already owns, so create the row first
        if (!slug) {
          const remote = (u?: string) => (u && /^https?:\/\//.test(u) ? u : null);
          await saveBusiness(chosenSlug, { raw: { ...buildRaw(remote(media.logo), remote(media.hero), media.gallery.map(remote)), draft: true } }, authed);
        }
        const [logoImage, heroImage, ...galleryImages] = await Promise.all([
          uploadMediaToR2(authed.access_token, chosenSlug, 'logo', media.logo),
          uploadMediaToR2(authed.access_token, chosenSlug, 'hero', media.hero),
          ...media.gallery.map((uri, i) => uploadMediaToR2(authed.access_token, chosenSlug, `gallery_${i}`, uri)),
        ]);
        const raw = { ...buildRaw(logoImage, heroImage, galleryImages), draft, draftIndex: draft ? index : undefined, ...(draft || editingInfo ? {} : { sentToDesigner: true }) };
        await saveBusiness(chosenSlug, { raw }, authed);
        setSlug(chosenSlug);
        // swap each uploaded photo's phone copy for its Cloudflare URL without touching photos added meanwhile
        const uploaded = new Map<string, string>();
        [[media.logo, logoImage], [media.hero, heroImage], ...media.gallery.map((u, i) => [u, galleryImages[i]])].forEach(([from, to]) => { if (from && to) uploaded.set(from, to); });
        const swap = (u?: string) => (u && uploaded.get(u)) || u;
        setMedia(cur => ({ logo: swap(cur.logo), hero: swap(cur.hero), gallery: cur.gallery.map(u => swap(u) as string) }));
        if (draft) return true;
        const failedUploads = [media.logo && !logoImage, media.hero && !heroImage, ...media.gallery.map((u, i) => u && !galleryImages[i])].filter(Boolean).length;
        if (failedUploads) setSaveError(`${failedUploads} photo${failedUploads > 1 ? 's' : ''} couldn’t upload. You can add them again from Edit.`);
        if (!editingInfo) {
          await notifyStage('new_signup', data.businessName || 'Unnamed business', data.contactEmail || data.email, chosenSlug);
          // Register push token and send welcome message via server
          const pushToken = await registerPushToken();
          if (pushToken) savePushToken(authed.access_token, chosenSlug, pushToken).catch(() => {});
          fetch('https://api.brightsite.app/api/send-welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authed.access_token}` },
            body: JSON.stringify({ slug: chosenSlug, fullName: data.fullName, buildChoice: choice, pushToken: pushToken || undefined }),
          }).catch(() => {});
        }
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        return true;
      } catch (err: any) {
        if (err?.conflict && !slug) continue;
        console.error('[sync] could not save business', err);
        if (!draft) setSaveError('We couldn’t save your details. Check your connection — we’ll try again when you tap Save.');
        return false;
      }
    }
    if (!draft) setSaveError('We couldn’t save your details. Please try again.');
    return false;
  };

  // Mid-signup, save progress to the server whenever they change card, so it survives a new phone or reinstall.
  const draftPill = useRef(new Animated.Value(0)).current;
  const draftBusy = useRef(false);
  const lastDraftIndex = useRef(index);
  // Saves progress to the server and flashes the "All changes saved" pill. Runs on every card change
  // and, a moment after they stop typing, on any edit, so nothing depends on swiping to save.
  const syncDraftNow = () => {
    if (!authSession || appScreen !== 'onboarding' || editingInfo || index < 1 || !data.businessName.trim() || draftBusy.current) return;
    draftBusy.current = true;
    void syncOnboardingToBackend(buildChoice || 'designer', { draft: true }).then(ok => {
      draftBusy.current = false;
      if (!ok) return;
      draftPill.setValue(0);
      Animated.sequence([
        Animated.timing(draftPill, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(draftPill, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
    });
  };
  useEffect(() => {
    const moved = lastDraftIndex.current !== index;
    lastDraftIndex.current = index;
    if (moved) syncDraftNow();
  }, [index]);
  const draftEditSkip = useRef(true);
  useEffect(() => {
    if (draftEditSkip.current) { draftEditSkip.current = false; return; } // not on first render
    const timer = setTimeout(syncDraftNow, 2500);
    return () => clearTimeout(timer);
  }, [data, hours, services, reviewsList, offers, contactForm, media]);

  const autoSaveBusy = useRef(false);
  const autoSaveSkip = useRef(true);
  useEffect(() => {
    if (!editingInfo) { autoSaveSkip.current = true; return; }
    // skip the render that opens the editor so opening alone doesn't save
    if (autoSaveSkip.current) { autoSaveSkip.current = false; return; }
    const t = setTimeout(async () => {
      if (autoSaveBusy.current) return;
      autoSaveBusy.current = true;
      await syncOnboardingToBackend(buildChoice || 'designer');
      autoSaveBusy.current = false;
    }, 1200);
    return () => clearTimeout(t);
  }, [editingInfo, data, hours, services, reviewsList, offers, contactForm]);

  const sendToDesigner = () => { void syncOnboardingToBackend('designer'); setBuildChoice('designer'); setWebsiteStatus('building'); setTab('Website'); setPlayReveal(true); setAppScreen('dashboard'); };
  const [playReveal, setPlayReveal] = useState(false);

  // Details filled in on the website: send them from the dashboard without re-running the cards.
  const sendFromDashboard = async () => {
    if (!slug || !session) return;
    try {
      await saveBusiness(slug, { raw: { draft: false, sentToDesigner: true, buildChoice: 'designer' } });
      setBuildChoice('designer');
      setWebsiteStatus('building');
      fetch('https://api.brightsite.app/api/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ slug, fullName: data.fullName, buildChoice: 'designer' }),
      }).catch(() => {});
    } catch { Alert.alert('Something went wrong', 'We couldn’t send your details. Please try again.'); }
  };
  const SECTION_KEYS = ['business', 'details', 'hours', 'prices', 'media', 'extras', 'reviews'];
  const infoComplete = SECTION_KEYS.every(k => businessRecord.current.raw?.sectionDoneClicked?.[k]);

  // runs after setData has committed so the sync sees the pasted links
  useEffect(() => {
    if (!autoPending) return;
    setAutoPending(false);
    void syncOnboardingToBackend('designer');
    setAppScreen('loading');
  }, [autoPending]);

  useEffect(() => { if (editingInfo) setComplete(new Set(setupStepIndexes)); }, [editingInfo]);

  useEffect(() => {
    if (steps[index]?.id === 'contact' && data.sameEmail && (data.ownerEmail || data.email)) setData(d => ({ ...d, contactEmail: d.ownerEmail || d.email }));
  }, [index]);


  const setLive = async (live: boolean) => {
    if (!slug || !session) return false;
    try {
      if (live) {
        try {
          const wasOffline = !!businessRecord.current.manuallyOffline;
          const res = await workerPublish(slug, true);
          await saveBusiness(slug, { published: true, manuallyOffline: false, needsPublish: false, liveUrl: res.url });
          setWebsiteStatus('live');
          if (session?.access_token) pingAdminApi(session.access_token, { action: 'notify-admin', kind: 'online', slug });
          pushToSelf(businessRecord.current.pushToken, wasOffline ? 'Your website is back online' : 'Your website is live! 🎉', res.url ? `It’s live again at ${String(res.url).replace(/^https?:\/\//, '')}` : 'It’s live again.');
        } catch (err: any) {
          await saveBusiness(slug, { published: false, manuallyOffline: false, needsPublish: true });
          setWebsiteStatus('publishing');
          Alert.alert('Publishing your website', /No website uploaded/.test(err?.message || '') ? 'Your website is still being built. It will go live as soon as it’s ready.' : 'We’ll finish publishing shortly. You’ll get a notification as soon as it’s live!');
        }
      } else {
        await workerPublish(slug, false);
        await saveBusiness(slug, { published: false, manuallyOffline: true });
        setWebsiteStatus('ready');
        if (session?.access_token) pingAdminApi(session.access_token, { action: 'notify-admin', kind: 'offline', slug });
        pushToSelf(businessRecord.current.pushToken, 'Your website is offline', 'You took it offline. Tap Make Live whenever you want it back.');
      }
      return true;
    } catch { Alert.alert('Something went wrong', 'We couldn\'t update your website. Please try again.'); return false; }
  };

  useEffect(() => {
    if (appScreen !== 'loading') return;
    loadingProgress.setValue(0);
    designReveal.setValue(0);
    loadingFades.forEach(value => value.setValue(0));
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
        setWebsiteStatus('building');
        setTab('Messages');
        setAppScreen('dashboard');
      });
    });
    return () => checklist.stop();
  }, [appScreen, buildChoice]);

  useEffect(() => {
    if (validationMessage) setValidationMessage('');
  }, [data, hours, services, domainReady, designReady]);

  const SWIPE_LOCK_STEPS = ['photos'];
  const [stepEditMode, setStepEditMode] = useState(false);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => {
      if (keyboardVisible || stepEditMode) return false;
      // cards move sideways, so a mostly-horizontal drag anywhere changes card without fighting vertical scrolling
      return Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    },
    // capture phase too, so a sideways drag that starts on a text box or scroll view still moves the card
    onMoveShouldSetPanResponderCapture: (_, g) => !keyboardVisible && !stepEditMode && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: revealRail,
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > Math.abs(g.dy)) {
        const pastEdge = (g.dx > 0 && index <= (authSession ? 1 : 0)) || (g.dx < 0 && index >= steps.length - 1);
        if (Math.abs(g.dx) > 12 && !pastEdge) setDeckDirection(g.dx < 0 ? 1 : -1);
        // rubber-band past the first and last card instead of stopping dead
        motion.setValue(index * CARD_TRAVEL - (pastEdge ? g.dx * .22 : g.dx));
      }
    },
    onPanResponderRelease: (_, g) => {
      const atStart = index <= (authSession ? 1 : 0), atEnd = index >= steps.length - 1;
      if (!atEnd && (g.dx < -48 || g.vx < -.55)) go(index + 1); else if (!atStart && (g.dx > 48 || g.vx > .55)) go(index - 1); else Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
      hideRailSoon();
    },
    onPanResponderTerminate: () => {
      Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
      hideRailSoon();
    },
  }), [index, step.id, stepEditMode, data, hours, services, domainReady, designReady, keyboardVisible]);

  const railPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: revealRail,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_, g) => {
      if (g.dx < -42) go(index + 1);
      else if (g.dx > 42) go(index - 1);
      hideRailSoon();
    },
  }), [index, data, hours, services, domainReady, designReady]);

  const content = (contentStep = step) => {
    switch (contentStep.id) {
      case 'login': return <><Text style={s.heroTitle}>{authMode === 'signup' ? 'Your business website, sorted.' : 'Welcome back.'}</Text>
        <Intro>{authMode === 'signup' ? 'Answer a few quick questions and we’ll build a professional website for you. Takes about 10 minutes.' : 'Log in to continue managing your website.'}</Intro>
        <View style={s.authModes}><Pressable onPress={() => { setAuthMode('signup'); setAuthStatus(''); }} style={[s.authMode, authMode === 'signup' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'signup' && s.authModeTextOn]}>Sign up</Text></Pressable><Pressable onPress={() => { setAuthMode('login'); setAuthStatus(''); }} style={[s.authMode, authMode === 'login' && s.authModeOn]}><Text style={[s.authModeText, authMode === 'login' && s.authModeTextOn]}>Log in</Text></Pressable></View>
        <Field label="Email" value={data.email} onChangeText={(v: string) => setData((d: any) => ({ ...d, email: v }))} placeholder="you@business.co.uk" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" returnKeyType="next" />
        <Field label="Password" value={data.password} onChangeText={(v: string) => setData((d: any) => ({ ...d, password: v }))} placeholder="At least 8 characters" secureTextEntry textContentType={authMode === 'signup' ? 'newPassword' : 'password'} returnKeyType="done" onSubmitEditing={() => void authenticate()} />
        {!!authStatus && <Text style={s.authStatus}>{authStatus}</Text>}
        {authMode === 'login' && <Pressable hitSlop={8} onPress={async () => {
          const email = data.email.trim().toLowerCase();
          if (!/\S+@\S+\.\S+/.test(email)) { setAuthStatus('Enter your email address first.'); return; }
          setAuthStatus('Sending reset link…');
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://brightsite.app/account/reset-password' });
          setAuthStatus(error ? 'Couldn\'t send a reset email. Try again.' : 'Check your inbox for a reset link.');
        }} style={s.forgotLink}><Text style={s.forgotText}>Forgot password?</Text></Pressable>}
        <Pressable disabled={authBusy || authChecking} onPress={() => void authenticate()} style={({ pressed }) => [s.authSubmit, pressed && s.pressed, (authBusy || authChecking) && s.authSubmitDisabled]}>{authBusy || authChecking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.authSubmitText}>{authMode === 'signup' ? 'Create account' : 'Log in'}</Text>}</Pressable>
        <View style={s.orRow}><View style={s.orLine} /><Text style={s.orText}>or</Text><View style={s.orLine} /></View>
        <Pressable disabled={authBusy || authChecking} onPress={() => void googleSignIn()} style={({ pressed }) => [s.googleBtn, pressed && s.pressed, (authBusy || authChecking) && s.authSubmitDisabled]}>
          <Image source={require('./assets/google-g.png')} style={{ width: 18, height: 18 }} />
          <Text style={s.googleBtnText}>Continue with Google</Text>
        </Pressable></>;
      case 'business': return <><Intro>Tell us the essentials. Anything you leave blank simply won’t appear on your website.</Intro>
        <Field label="Full name" value={data.fullName} onChangeText={(v: string) => setData((d: any) => ({ ...d, fullName: v }))} placeholder="e.g. Jane Smith" textContentType="name" autoComplete="name" autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.businessName?.focus()} />
        <Pressable onPress={() => setShowFullName(!showFullName)} style={s.nameDisplay} hitSlop={8}><View style={[s.checkbox, showFullName && s.checkboxOn]}>{showFullName && <Ionicons name="checkmark" size={13} color="#fff" />}</View><Text style={s.nameDisplayText}>Display full name on website</Text></Pressable>
        <Field label="Email" value={data.ownerEmail || data.email} onChangeText={(v: string) => setData((d: any) => ({ ...d, ownerEmail: v, ...(d.sameEmail ? { contactEmail: v } : {}) }))} placeholder="you@email.com" keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.businessName?.focus()} />
        <Pressable onPress={() => { const on = !data.sameEmail; setData({ ...data, sameEmail: on, ...(on ? { contactEmail: data.ownerEmail || data.email } : {}) }); }} style={s.nameDisplay} hitSlop={8}><View style={[s.checkbox, data.sameEmail && s.checkboxOn]}>{data.sameEmail && <Ionicons name="checkmark" size={13} color="#fff" />}</View><Text style={s.nameDisplayText}>Same as business email</Text></Pressable>
        <Field label="Business name" inputRef={(r: any) => { fieldRefs.current.businessName = r; }} value={data.businessName} onChangeText={(v: string) => setData((d: any) => ({ ...d, businessName: v }))} placeholder="e.g. Sisko Hair" textContentType="organizationName" autoCapitalize="words" returnKeyType="done" />
        <Text style={s.fieldLabel}>Business type</Text>
        <View style={s.chipWrap}>
          {BUSINESS_TYPES.map(type => {
            // "Other" opens a sheet for a custom type and then shows what they typed
            const custom = type === 'Other' && !!data.category && !BUSINESS_TYPES.includes(data.category);
            const on = data.category === type || custom;
            return <Pressable key={type} onPress={() => { Keyboard.dismiss(); if (type === 'Other') setTypeSheet(true); else setData((d: any) => ({ ...d, category: type })); }} style={[s.chip, s.typeChip, on && s.chipOn]}>
            <Text style={[s.chipText, s.typeChipText, on && s.chipTextOn]}>{custom ? data.category : type}</Text>
          </Pressable>; })}
        </View></>;
      case 'contact': return <><Intro>Add whichever ways customers should contact you. Leave anything blank to skip it.</Intro>
        <Field label="Email" value={data.contactEmail} onChangeText={(v: string) => setData((d: any) => ({ ...d, contactEmail: v }))} placeholder="you@business.co.uk" keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.phone?.focus()} />
        <Field label="Phone" optional inputRef={(r: any) => { fieldRefs.current.phone = r; }} value={data.phone} onChangeText={(v: string) => setData((d: any) => ({ ...d, phone: v }))} placeholder="e.g. 07700 900123" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />
        <Field label="Address" optional inputRef={(r: any) => { fieldRefs.current.address = r; }} value={data.address} onChangeText={(v: string) => setData((d: any) => ({ ...d, address: v }))} placeholder="e.g. 12 High Street, London" textContentType="fullStreetAddress" autoComplete="street-address" autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.instagram?.focus()} />
        <Field label="Instagram" optional inputRef={(r: any) => { fieldRefs.current.instagram = r; }} value={data.instagram} onChangeText={(v: string) => setData((d: any) => ({ ...d, instagram: v }))} placeholder="@yourbusiness" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.facebook?.focus()} />
        <Field label="Facebook" optional inputRef={(r: any) => { fieldRefs.current.facebook = r; }} value={data.facebook} onChangeText={(v: string) => setData((d: any) => ({ ...d, facebook: v }))} placeholder="facebook.com/yourbusiness" keyboardType="url" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.website?.focus()} />
        <Field label="Existing website" optional inputRef={(r: any) => { fieldRefs.current.website = r; }} value={data.website} onChangeText={(v: string) => setData((d: any) => ({ ...d, website: v }))} placeholder="yoursite.com" keyboardType="url" textContentType="URL" autoCapitalize="none" autoCorrect={false} returnKeyType="done" /></>;
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
          {media.gallery.length < 16 && <>
            {Array.from({ length: (GALLERY_COLS - media.gallery.length % GALLERY_COLS) % GALLERY_COLS }).map((_, i) => <View key={`sp${i}`} style={[galleryTileSize(galleryWidth), { opacity: 0 }]} />)}
            <Pressable style={[s.galleryAdd, galleryTileSize(galleryWidth)]} onPress={async () => {
              const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted) return;
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: .82 });
              if (!result.canceled) setMedia(current => ({ ...current, gallery: [...current.gallery, ...result.assets.map(a => a.uri)].slice(0, 16) }));
            }}><Ionicons name="add" size={26} color={C.primary} /></Pressable>
          </>}
        </View></>;
      case 'reviews': return <><Intro>Add customer reviews for your website. Each one is optional.</Intro>
        <ItemList items={reviewsList} primary="title" secondary="description" addLabel="Add review" onOpen={i => setSheet({ kind: 'review', index: i })} />
        <View style={{ marginTop: 14, gap: 10 }}>
          <TextInput value={data.googleLink} onChangeText={v => setData(d => { const n = { ...d, googleLink: v }; const tp = n.trustpilotLink.trim(), g = n.googleLink.trim(); return { ...n, reviewLink: tp || g, reviewSource: tp ? 'Trustpilot' : g ? 'Google' : null }; })} placeholder="Google reviews link" placeholderTextColor={C.placeholder} keyboardType="url" autoCapitalize="none" autoCorrect={false} style={s.input} />
          <TextInput value={data.trustpilotLink} onChangeText={v => setData(d => { const n = { ...d, trustpilotLink: v }; const tp = n.trustpilotLink.trim(), g = n.googleLink.trim(); return { ...n, reviewLink: tp || g, reviewSource: tp ? 'Trustpilot' : g ? 'Google' : null }; })} placeholder="Trustpilot link" placeholderTextColor={C.placeholder} keyboardType="url" autoCapitalize="none" autoCorrect={false} style={s.input} />
        </View>
        {!editingInfo && <Pressable onPress={sendToDesigner} style={({ pressed }) => [s.primaryBtn, s.sendGlow, { marginTop: 24 }, pressed && s.pressed]}>
          <Text style={s.primaryBtnText}>Send to designer</Text>
        </Pressable>}
        </>;
      case 'extras': return <><Intro>Add any offers, rewards or gift cards you want on your website. Leave it blank to skip.</Intro>
        <ItemList items={offers} primary="name" secondary="value" addLabel="Add offer" onOpen={i => setSheet({ kind: 'offer', index: i })} />
        <Pressable onPress={() => setContactForm(!contactForm)} style={s.formChoice}><View style={s.formChoiceIcon}><Ionicons name="mail-outline" size={22} color={C.primary} /></View><View style={{ flex: 1 }}><Text style={s.formChoiceTitle}>Add a contact form</Text><Text style={s.formChoiceText}>Messages will arrive in your BrightSite dashboard.</Text></View><Switch value={contactForm} onValueChange={setContactForm} trackColor={{ false: 'rgba(28,40,50,.18)', true: C.primary }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as any)} /></Pressable>
        <Text style={[s.fieldLabel, { marginTop: 22, marginBottom: 0 }]}>Notes</Text>
        <TextInput value={data.designerNotes} onChangeText={v => setData(d => ({ ...d, designerNotes: v }))} placeholder="Add any notes for your designer. Paste in any info or descriptions you want included." placeholderTextColor={C.placeholder} multiline autoCapitalize="sentences" style={[s.input, s.notesBox]} /></>;
    }
  };

  if (resetModal) return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.loginStage}>
      <View style={[s.card, s.loginCard]}>
        <View style={s.loginHeader}><Logo height={20} /></View>
        <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          <Text style={s.heroTitle}>Set new password</Text>
          <Intro>Choose a new password for your account.</Intro>
          <Field label="New password" value={resetPw} onChangeText={setResetPw} secureTextEntry placeholder="At least 8 characters" textContentType="newPassword" autoFocus />
          <Field label="Confirm password" value={resetConfirm} onChangeText={setResetConfirm} secureTextEntry placeholder="Repeat your new password" textContentType="newPassword" onSubmitEditing={async () => {
            if (resetPw.length < 8) { setResetMsg('Password must be at least 8 characters.'); return; }
            if (resetPw !== resetConfirm) { setResetMsg('Those passwords don\'t match.'); return; }
            if (!resetSession) return;
            setResetBusy(true);
            await supabase.auth.setSession(resetSession);
            const { error } = await supabase.auth.updateUser({ password: resetPw });
            setResetBusy(false);
            if (error) { setResetMsg('Couldn\'t update your password. Please try again.'); return; }
            setResetModal(false); setResetPw(''); setResetConfirm(''); setResetMsg(''); setResetSession(null);
            setAuthMode('login'); setAuthStatus('Password updated — log in with your new password.');
          }} />
          {!!resetMsg && <Text style={s.authStatus}>{resetMsg}</Text>}
          <Pressable disabled={resetBusy} onPress={async () => {
            if (resetPw.length < 8) { setResetMsg('Password must be at least 8 characters.'); return; }
            if (resetPw !== resetConfirm) { setResetMsg('Those passwords don\'t match.'); return; }
            if (!resetSession) return;
            setResetBusy(true);
            await supabase.auth.setSession(resetSession);
            const { error } = await supabase.auth.updateUser({ password: resetPw });
            setResetBusy(false);
            if (error) { setResetMsg('Couldn\'t update your password. Please try again.'); return; }
            setResetModal(false); setResetPw(''); setResetConfirm(''); setResetMsg(''); setResetSession(null);
            setAuthMode('login'); setAuthStatus('Password updated — log in with your new password.');
          }} style={({ pressed }) => [s.authSubmit, { marginTop: 12 }, pressed && s.pressed, resetBusy && s.authSubmitDisabled]}>
            {resetBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.authSubmitText}>Save password</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </FlowBackdrop>;

  if (index === 0 && appScreen === 'onboarding') return <FlowBackdrop plain>
    <StatusBar style="dark" />
    <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28 }}>
      <View style={s.loginHeader}><Logo height={20} /><Image source={require('./assets/brightsite-icon.png')} style={s.loginAppIcon} /></View>
      <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
        {content(steps[0])}
      </ScrollView>
    </View>
  </FlowBackdrop>;

  if (appScreen === 'admin') {
    const STATUS_COLORS: Record<string, string> = { new: '#6B7680', build: C.danger, pending: C.warning, live: C.success };
    const STATUS_LABELS: Record<string, string> = { new: 'New', build: 'Build', pending: 'Pending', live: 'Live' };
    const filteredBiz = adminBusinesses.filter(b => {
      if (adminFilter !== 'all' && adminStatusOf(b) !== adminFilter) return false;
      if (adminSearch) { const q = adminSearch.toLowerCase(); const d = b.data || {}; return (d.name || '').toLowerCase().includes(q) || (b.id || '').toLowerCase().includes(q); }
      return true;
    }).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

    const tabCounts: Record<string, number> = { all: adminBusinesses.length, new: 0, build: 0, pending: 0, live: 0 };
    adminBusinesses.forEach(b => { tabCounts[adminStatusOf(b)]++; });

    const threadsWithMessages = adminBusinessesWithMessages();
    const totalUnread = threadsWithMessages.filter(t => adminThreadUnread(t.id)).length;

    return <FadeIn>
      <View style={{ flex: 1, backgroundColor: C.canvas }}>
        <StatusBar style="dark" />
        <View style={s.dashboardScreen}>
        <View style={s.dashboardBrandRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Logo height={17} />
            <View style={aS.adminBadge}><Text style={aS.adminBadgeText}>ADMIN</Text></View>
          </View>
          <Pressable hitSlop={8} onPress={async () => { await supabase.auth.signOut(); onSignedOut(); }} style={aS.signOutBtn}><Text style={aS.signOutText}>Sign out</Text></Pressable>
        </View>
        <View style={s.dashboardTabsTop}>
          {([['businesses', 'Accounts'], ['messages', 'Messages'], ['notifications', 'Activity']] as const).map(([key, label]) => {
            const active = adminTab === key;
            const badge = key === 'messages' ? totalUnread : 0;
            return <Pressable key={key} onPress={() => { setAdminTab(key); if (key !== 'messages') setAdminActiveThread(null); }} style={[s.dashboardTab, active && s.dashboardTabOn]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.dashboardTabText, active && s.dashboardTabTextOn]}>{label}</Text>
                {badge > 0 && <View style={[aS.tabBadge, active && { backgroundColor: '#fff' }]}><Text style={[aS.tabBadgeText, active && { color: C.primary }]}>{badge}</Text></View>}
              </View>
            </Pressable>;
          })}
        </View>

        {adminTab === 'businesses' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={aS.filterRow}>
            {(['all', 'new', 'build', 'pending', 'live'] as const).map(f => (
              <Pressable key={f} onPress={() => setAdminFilter(f)} style={[aS.filterTab, adminFilter === f && aS.filterTabOn]}>
                {f !== 'all' && <View style={[aS.filterDot, { backgroundColor: STATUS_COLORS[f] }]} />}
                <Text style={[aS.filterTabText, adminFilter === f && aS.filterTabTextOn]}>{f === 'all' ? 'All' : STATUS_LABELS[f]} <Text style={[aS.filterCount, adminFilter === f && { color: 'rgba(255,255,255,.75)' }]}>{tabCounts[f]}</Text></Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* Search */}
          <View style={aS.searchWrap}><Ionicons name="search-outline" size={16} color={C.inkMuted} /><TextInput style={aS.searchInput} value={adminSearch} onChangeText={setAdminSearch} placeholder="Search name…" placeholderTextColor={C.placeholder} autoCorrect={false} autoCapitalize="none" /></View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={aS.bizList} showsVerticalScrollIndicator={false}>
            {adminLoading && <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />}
            {!adminLoading && filteredBiz.length === 0 && <Text style={aS.emptyText}>No accounts found</Text>}
            {filteredBiz.map(biz => {
              const st = adminStatusOf(biz);
              const d = biz.data || {};
              const name = d.name || d.businessName || biz.id;
              const updated = biz.updatedAt ? timeAgo(biz.updatedAt) : '';
              const hasUnread = adminThreadUnread(biz.id);
              return <Pressable key={biz.id} onPress={() => adminOpenBusiness(biz)} style={({ pressed }) => [aS.bizCard, pressed && s.pressed]}>
                <View style={[aS.bizStatusBar, { backgroundColor: STATUS_COLORS[st] }]} />
                <View style={aS.bizCardInner}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[aS.bizName, { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>{biz?.data?.raw?.draft && <Text style={aS.draftTag}>Draft</Text>}</View>
                    <View style={aS.bizMeta}>
                      <View style={[aS.bizStatusDot, { backgroundColor: STATUS_COLORS[st] }]} />
                      <Text style={[aS.bizStatusText, { color: STATUS_COLORS[st] }]}>{STATUS_LABELS[st]}</Text>
                      {!!updated && <Text style={aS.bizTime}>· {updated}</Text>}
                    </View>
                  </View>
                  {(d.liveUrl || d.previewUrl || d.demoUrl) && <Pressable hitSlop={8} onPress={() => Linking.openURL(d.liveUrl || d.previewUrl || d.demoUrl)} style={aS.bizAction}><Ionicons name="globe-outline" size={16} color={C.inkMuted} /></Pressable>}
                  <Pressable hitSlop={8} onPress={() => { setAdminActiveThread(biz); setAdminTab('messages'); }} style={aS.bizAction}>
                    {hasUnread && <View style={aS.bizUnreadDot} />}
                    <Ionicons name="chatbubble-outline" size={16} color={hasUnread ? C.primary : C.inkMuted} />
                  </Pressable>
                </View>
              </Pressable>;
            })}
            {!adminLoading && <Text style={aS.showingText}>Showing {filteredBiz.length} account{filteredBiz.length !== 1 ? 's' : ''}</Text>}
          </ScrollView>
        </>}

        {adminTab === 'messages' && <>
          {!adminActiveThread ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={aS.bizList} showsVerticalScrollIndicator={false}>
              {threadsWithMessages.length === 0 && <Text style={aS.emptyText}>No messages yet</Text>}
              {threadsWithMessages.map(({ id, biz, lastMsg }) => {
                const unread = adminThreadUnread(id);
                const name = biz?.data?.name || biz?.data?.businessName || id;
                return <Pressable key={id} onPress={() => setAdminActiveThread(biz)} style={({ pressed }) => [aS.threadCard, pressed && s.pressed]}>
                  <View style={[aS.threadAvatar, unread && { backgroundColor: C.primary }]}><Text style={aS.threadAvatarText}>{(name[0] || '?').toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={aS.threadTop}><Text style={aS.threadName} numberOfLines={1}>{name}</Text>{biz?.data?.raw?.draft && <Text style={aS.draftTag}>Draft</Text>}<Text style={aS.threadTime}>{lastMsg ? timeAgo(lastMsg.created_at) : ''}</Text></View>
                    <Text style={[aS.threadPreview, unread && { color: C.ink, fontWeight: '600' }]} numberOfLines={1}>{lastMsg?.body || ''}</Text>
                  </View>
                  {unread && <View style={aS.threadUnread} />}
                </Pressable>;
              })}
            </ScrollView>
          ) : (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={aS.threadHeader}><Pressable onPress={() => { setAdminActiveThread(null); if (session) void loadAdminData(session); }} style={[aS.threadBack, { flex: 1 }]}><Ionicons name="chevron-back" size={20} color={C.ink} /><Text style={aS.threadBackText}>{adminActiveThread?.data?.name || adminActiveThread?.data?.businessName || adminActiveThread?.id}</Text></Pressable><Pressable onPress={() => void Share.share({ message: businessBrief(adminActiveThread), title: 'Business brief' })} hitSlop={8} style={aS.briefBtn} accessibilityLabel="Copy all business info"><Ionicons name="copy-outline" size={15} color="#fff" /><Text style={aS.briefBtnText}>Copy info</Text></Pressable></View>
              <MessageThread key={adminActiveThread?.id} session={session} slug={adminActiveThread?.id} viewer="admin" otherName={(adminActiveThread?.data?.fullName || adminActiveThread?.data?.name || 'Customer').trim().split(' ')[0]} placeholder="Message…" intro={<>
                <View style={[s.messageBubble, s.messageBubbleSent]}><Text style={[s.messageText, { color: '#fff' }]}>{welcomeText(adminActiveThread?.data?.fullName, adminActiveThread?.data?.buildChoice || (/Build choice: designer/i.test(adminActiveThread?.data?.notes || '') ? 'designer' : null))}</Text></View>
                <Text style={[s.messageMeta, s.messageMetaSent]}>You · Welcome message</Text>
              </>} />
            </KeyboardAvoidingView>
          )}
        </>}

        {adminTab === 'notifications' && <ScrollView style={{ flex: 1 }} contentContainerStyle={aS.bizList} showsVerticalScrollIndicator={false}>
          {adminBusinesses.slice().sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()).slice(0, 40).map(biz => {
            const st = adminStatusOf(biz);
            const name = biz.data?.name || biz.data?.businessName || biz.id;
            const icon = ({ new: 'person-add-outline', build: 'hammer-outline', pending: 'time-outline', live: 'checkmark-circle-outline' } as any)[st];
            const desc = ({ new: 'Signed up', build: 'Submitted to build', pending: 'Preview ready — awaiting payment', live: 'Live and paying' } as any)[st];
            return <Pressable key={biz.id} onPress={() => adminOpenBusiness(biz)} style={({ pressed }) => [aS.notifRow, pressed && s.pressed]}>
              <View style={[aS.notifIcon, { backgroundColor: STATUS_COLORS[st] + '18' }]}><Ionicons name={icon} size={18} color={STATUS_COLORS[st]} /></View>
              <View style={{ flex: 1 }}><Text style={aS.notifName} numberOfLines={1}>{name}</Text><Text style={aS.notifDesc}>{desc}</Text></View>
              <Text style={aS.notifTime}>{biz.updatedAt ? timeAgo(biz.updatedAt) : ''}</Text>
            </Pressable>;
          })}
        </ScrollView>}

        </View>
      </View>
    </FadeIn>;
  }

  if (appScreen === 'dashboard') return <FadeIn>
    <DashboardHome previewLink={businessRecord.current?.demoUrl || businessRecord.current?.previewUrl || ''} playReveal={playReveal} onRevealDone={() => setPlayReveal(false)} onAdminBack={adminViewingBusiness ? adminBackFromBusiness : undefined} tab={tab} setTab={setTab} data={data} domain={domain} suffix={suffix} services={services} hours={hours} contactForm={contactForm} websiteStatus={websiteStatus} session={session} slug={slug || slugify(domainReady ? domain : data.businessName)} onMakeLive={() => setWebsiteStatus('live')} onPaid={(isAnnual: boolean, isPro: boolean) => { businessRecord.current = { ...businessRecord.current, planActive: true }; setPlanAnnual(isAnnual); setPlanPro(isPro); setWebsiteStatus('publishing'); }} infoComplete={infoComplete} onSendToDesigner={sendFromDashboard} onEditInfo={() => { setEditingInfo(websiteStatus !== 'todo'); setIndex(1); motion.setValue(CARD_TRAVEL); setDeckDirection(0); setAppScreen('onboarding'); }} onTakeOffline={() => setLive(false)} onGoLive={() => setLive(true)} onSignOut={adminViewingBusiness ? adminBackFromBusiness : signOut} saveError={saveError} planAnnual={planAnnual} planPro={planPro} media={media} isPaying={!!businessRecord.current.planActive} buildChoice={buildChoice} onDomainChosen={(d: string, sfx: string) => { setDomain(d); setSuffix(sfx); setDomainReady(true); }} adminBiz={adminViewingBusiness} liveUrl={businessRecord.current?.liveUrl || (/^https?:/.test(businessRecord.current?.customDomain || '') ? businessRecord.current.customDomain : '')} ownedDomain={businessRecord.current?.domainRegistered ? (businessRecord.current?.customDomain || businessRecord.current?.domain || '') : ''} />
  </FadeIn>;


  if (appScreen === 'choose') {
    const canSend = !!data.fullName.trim() && (!!data.googleLink.trim() || !!data.facebook.trim() || !!data.website.trim());
    return <View style={{ flex: 1, backgroundColor: C.card }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28 }}>
        <View style={s.loginHeader}><Logo height={20} /><Image source={require('./assets/brightsite-icon.png')} style={s.loginAppIcon} /></View>
        {chooseMode === 'pick' ? <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingBottom: 110 }}>
          <Text style={[s.heroTitle, { textAlign: 'center', marginBottom: 0 }]}>How would you like to build your website?</Text>
          <Text style={{ fontFamily: FONT, fontSize: 17, lineHeight: 24, color: C.inkSoft, textAlign: 'center', marginTop: 2, marginBottom: 18 }}>You can change anything later.</Text>
          <View style={{ gap: 14 }}>
            <Pressable onPress={() => setChooseMode('auto')} style={({ pressed }) => [s.pathCard, s.pathCardWhite, pressed && s.pressed]}>
              <Text style={[s.pathTitle, { color: C.ink }]}>Automatic</Text>
              <Text style={[s.pathText, { color: C.ink }]}>Share your Google, Facebook or website link and our designer builds it for you.</Text>
            </Pressable>
            <Pressable onPress={() => { setIndex(1); motion.setValue(CARD_TRAVEL); setAppScreen('onboarding'); }} style={({ pressed }) => [s.pathCard, s.pathCardWhite, pressed && s.pressed]}>
              <Image source={require('./assets/brightbuilder-blue.png')} resizeMode="contain" style={{ width: 19*1543/137, height: 19, marginBottom: 8 }} />
              <Text style={[s.pathTitle, { color: C.ink }]}>Seven. Simple. Steps.</Text>
              <Text style={[s.pathText, { color: C.ink }]}>Under 10 minutes. Enter your details, hours, services and photos yourself.</Text>
            </Pressable>
          </View>
        </View> : <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          <>
              <Pressable onPress={() => setChooseMode('pick')} hitSlop={10} style={s.chooseBack}><Text style={s.chooseBackText}>‹ Back</Text></Pressable>
              <Text style={s.heroTitle}>Share your links</Text>
              <Intro>Add your name and at least one link. Our designer will take it from there.</Intro>
              <Field label="Full name" value={data.fullName} onChangeText={(v: string) => setData((d: any) => ({ ...d, fullName: v }))} placeholder="e.g. Jane Smith" textContentType="name" autoComplete="name" autoCapitalize="words" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.autoGoogle?.focus()} />
              <Field label="Google Business link" optional inputRef={(r: any) => { fieldRefs.current.autoGoogle = r; }} value={data.googleLink} onChangeText={(v: string) => setData(d => { const n = { ...d, googleLink: v }; const tp = n.trustpilotLink.trim(), g = n.googleLink.trim(); return { ...n, reviewLink: tp || g, reviewSource: tp ? 'Trustpilot' : g ? 'Google' : null }; })} placeholder="https://g.page/your-business" keyboardType="url" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.autoFacebook?.focus()} />
              <Field label="Facebook link" optional inputRef={(r: any) => { fieldRefs.current.autoFacebook = r; }} value={data.facebook} onChangeText={(v: string) => setData((d: any) => ({ ...d, facebook: v }))} placeholder="facebook.com/yourbusiness" keyboardType="url" autoCapitalize="none" autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => fieldRefs.current.autoWebsite?.focus()} />
              <Field label="Existing website" optional inputRef={(r: any) => { fieldRefs.current.autoWebsite = r; }} value={data.website} onChangeText={(v: string) => setData((d: any) => ({ ...d, website: v }))} placeholder="yoursite.com" keyboardType="url" textContentType="URL" autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
              <Text style={s.sendHint}>{canSend ? 'Ready to go!' : 'Add your name and at least one link'}</Text>
              <Pressable disabled={!canSend} onPress={() => { Keyboard.dismiss(); setBuildChoice('designer'); setAutoPending(true); }} style={({ pressed }) => [s.primaryBtn, s.sendGlow, !canSend && s.sendGlowOff, pressed && s.pressed]}>
                <Text style={s.primaryBtnText}>Send to designer</Text>
              </Pressable>
          </>
        </ScrollView>}
      </View>
    </View>;
  }

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

  return <FlowBackdrop plain>
    <StatusBar style="dark" />
    <View style={{ flex: 1 }}>
      <View style={s.stage}>
        {steps.filter((deckStep, deckIndex) => deckStep.id !== 'login' && Math.abs(deckIndex - index) <= 2).map((deckStep) => {
          const deckIndex = steps.findIndex(stepItem => stepItem.id === deckStep.id);
          const distance = deckIndex - index;
          const isActive = distance === 0;
          const cardPosition = Animated.subtract(deckIndex * CARD_TRAVEL, motion);
          // The card leaving the foreground takes a small lead. This clears its
          // edge before the next card reaches it, rather than blending through it.
          const travelPosition = isActive && deckDirection !== 0 ? Animated.multiply(cardPosition, 1.06) : cardPosition;
          const cardScale = cardPosition.interpolate({ inputRange: [-CARD_TRAVEL, 0, CARD_TRAVEL], outputRange: [.93, 1, .93], extrapolate: 'clamp' });
          return <Animated.View key={deckStep.id} pointerEvents={isActive ? 'auto' : 'none'} {...(isActive ? pan.panHandlers : {})} style={[s.card, s.deckCard, isActive ? s.deckCardActive : s.deckCardBehind, { zIndex: isActive ? 22 : 20 - Math.abs(distance), transform: [{ translateX: travelPosition }, { scale: cardScale }] }]}>

            {deckStep.id === 'business' && isActive && !editingInfo && <Pressable onPress={() => { Keyboard.dismiss(); setChooseMode('pick'); setAppScreen('choose'); }} hitSlop={12} style={[s.chooseBack, { position: 'absolute', top: SAFE_TOP + 24, left: 26, zIndex: 120, marginBottom: 0 }]} accessibilityLabel="Back"><Text style={s.chooseBackText}>‹ Back</Text></Pressable>}
            <View style={s.cardHeader}><Text style={s.cardTitle}>{deckStep.title}</Text><View style={s.cardHeaderActions}>
              {deckIndex > 0 && <Text style={s.count}>{deckIndex}/{setupStepIndexes.length}</Text>}
              {!editingInfo && isActive && SWIPE_LOCK_STEPS.includes(deckStep.id) && <Pressable onPress={() => setStepEditMode(v => !v)} hitSlop={10} style={stepEditMode ? s.saveTickBtn : s.editStepBtn}>{stepEditMode ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Text style={s.editStepText}>Edit</Text>}</Pressable>}
              {editingInfo && !(stepEditMode && isActive && SWIPE_LOCK_STEPS.includes(deckStep.id)) && <Pressable disabled={savingInfo} onPress={async () => {
                setSavingInfo(true); await syncOnboardingToBackend(buildChoice || 'designer'); setSavingInfo(false); setEditingInfo(false); setAppScreen('dashboard');
              }} style={s.saveTickBtn} accessibilityLabel="Save changes">{savingInfo ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}</Pressable>}
            </View></View>
            <ScrollView style={s.cardScroll} contentContainerStyle={[s.content, deckStep.id === 'login' && s.loginContent, deckStep.id === 'hours' && s.hoursContent]}
              scrollEnabled={SWIPE_LOCK_STEPS.includes(deckStep.id) ? stepEditMode : (!['hours', 'business', 'contact'].includes(deckStep.id) || keyboardVisible)}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
              {content(deckStep)}
            </ScrollView>
            <View pointerEvents="box-none" style={s.fixedPrompt}>
              {!!validationMessage && isActive && <Text pointerEvents="none" style={s.validationText}>{validationMessage}</Text>}
              {isActive && !editingInfo && deckStep.id !== 'reviews' && <View pointerEvents="none" style={s.swipeRow}><Text style={s.swipeHint}>Swipe to continue</Text></View>}
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
          <Animated.View pointerEvents="none" style={[s.railActive, { opacity: motion.interpolate({ inputRange: [Math.max(0, actual - 1) * CARD_TRAVEL, (actual - .85) * CARD_TRAVEL, (actual + .85) * CARD_TRAVEL, (actual + 1) * CARD_TRAVEL], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }), transform: [{ scale: dotScale.interpolate({ inputRange: [1, 1.75], outputRange: [0, 1], extrapolate: 'clamp' }) }] }]}><Ionicons name={item.icon} size={15} color="#fff" /></Animated.View>
        </View>;
      })}</Animated.View>
    </View>
    <Animated.View pointerEvents="none" style={[s.savedPill, { opacity: draftPill, transform: [{ translateY: draftPill.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
      <Ionicons name="checkmark-circle" size={14} color="#fff" /><Text style={s.savedPillText}>All changes saved</Text>
    </Animated.View>
    <ItemSheet open={typeSheet} title="Your business type" fields={[{ key: 'type', placeholder: 'e.g. Dog grooming' }]}
      initial={data.category && !BUSINESS_TYPES.includes(data.category) ? { type: data.category } : null}
      onSave={item => { setData(d => ({ ...d, category: item.type.trim() })); setTypeSheet(false); }} onClose={() => setTypeSheet(false)} />
    {(() => {
      const isReview = sheet?.kind === 'review';
      const list: Record<string, string>[] = isReview ? reviewsList : offers;
      const save = (next: any[]) => isReview ? setReviewsList(next) : setOffers(next);
      const index = sheet?.index ?? null;
      return <ItemSheet open={!!sheet} title={isReview ? (index === null ? 'Add review' : 'Edit review') : (index === null ? 'Add offer' : 'Edit offer')}
        fields={isReview ? [{ key: 'title', placeholder: 'Review title, e.g. Amazing service' }, { key: 'description', placeholder: 'Review and name', multiline: true }] : [{ key: 'name', placeholder: 'Offer, e.g. Loyalty card' }, { key: 'value', placeholder: 'Discount or price, e.g. 10% off' }]}
        initial={index === null ? null : list[index]}
        onSave={item => { save(index === null ? [...list, item] : list.map((x, n) => n === index ? { ...x, ...item } : x)); setSheet(null); }}
        onDelete={index === null ? undefined : () => { save(list.filter((_, n) => n !== index)); setSheet(null); }}
        onClose={() => setSheet(null)} />;
    })()}
  </FlowBackdrop>;
}

// A copy of the native splash (same blue, same 240-wide logo, centred) shown as the app opens,
// so the dot on the i can glow twice before it fades into the app.
const SPLASH_LOGO_W = 240;
const SPLASH_K = SPLASH_LOGO_W / 515; // the white logo is 515x72; its i-dot is centred at (400, 8), ~18 wide
function SplashGlow({ onDone }: { onDone: () => void }) {
  const glow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // one flash: the dot brightens with a soft light bleeding off it, then settles and the splash fades
    Animated.sequence([
      Animated.delay(60),
      Animated.timing(glow, { toValue: 1, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(onDone);
  }, []);
  const dot = 18 * SPLASH_K;
  // light sources the exact size of the dot, so only their soft shadows show beyond it
  const light = (color: string, radius: number) => <Animated.View style={{ position: 'absolute', left: 400 * SPLASH_K - dot / 2, top: 8 * SPLASH_K - dot / 2, width: dot, height: dot, borderRadius: dot / 2,
    backgroundColor: '#fff', shadowColor: color, shadowOpacity: 1, shadowRadius: radius, shadowOffset: { width: 0, height: 0 },
    opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }} />;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10000, elevation: 10000, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', opacity: fade }]}>
    <View style={{ width: SPLASH_LOGO_W, height: 72 * SPLASH_K }}>
      <Image source={require('./assets/brightsite-logo-white.png')} style={{ width: SPLASH_LOGO_W, height: 72 * SPLASH_K }} />
      {light('#BFD6FF', 40)}
      {light('#DCE9FF', 28)}
      {light('#DCE9FF', 28)}
      {light('#FFFFFF', 18)}
      {light('#FFFFFF', 12)}
      {light('#FFFFFF', 8)}
      {light('#FFFFFF', 4)}
    </View>
  </Animated.View>;
}

export default function App() {
  const [generation, setGeneration] = useState(0);
  const [splash, setSplash] = useState(true);
  useEffect(() => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); }, []);
  return <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.app.brightsite.mobile" urlScheme="app.brightsite.mobile">
    <View style={{ flex: 1 }}>
      <AppInner key={generation} onSignedOut={() => setGeneration(g => g + 1)} />
      {splash && <SplashGlow onDone={() => setSplash(false)} />}
    </View>
  </StripeProvider>;
}

const s = StyleSheet.create({
  stage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 72, paddingHorizontal: 0 },
  loginStage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 20, paddingHorizontal: 18 }, loginCard: { flex: 1 },
  loginHeader: { minHeight: 78, paddingLeft: 26, paddingRight: 18, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, loginAppIcon: { width: 48, height: 48, borderRadius: 15, shadowColor: '#1C69E8', shadowOpacity: .28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  card: { flex: 1, zIndex: 2, borderRadius: 30, backgroundColor: CARD, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', shadowColor: '#000', shadowOpacity: .62, shadowRadius: 31, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  deckCard: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 0, borderWidth: 0, paddingTop: SAFE_TOP + 22 },
  deckCardActive: { shadowOpacity: 0, elevation: 0 }, deckCardBehind: { shadowOpacity: 0, elevation: 0 },
  cardHeader: { minHeight: 72, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, elevation: 100 },
  cardScroll: { flex: 1, zIndex: 1, elevation: 1, overflow: 'hidden' },
  cardTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', letterSpacing: -.5, color: C.ink }, count: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkMuted },
  content: { paddingTop: 24, paddingLeft: 30, paddingRight: 24, paddingBottom: 84 }, loginContent: { flex: 1, paddingTop: 12, paddingBottom: 18 }, intro: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: C.inkSoft, marginBottom: 20 },
  fieldWrap: { marginBottom: 16 }, fieldLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.inkSoft, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: C.ink, backgroundColor: C.field, borderWidth: 1, borderColor: C.line, outlineWidth: 0 },
  inputGrow: { paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  nameDisplay: { marginTop: -3, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.lineStrong, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: BRAND, borderColor: BRAND },
  nameDisplayText: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: C.inkSoft }, pressed: { transform: [{ scale: .96 }], opacity: .86 },
  heroTitle: { fontFamily: FONT, fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -.8, color: C.ink, marginBottom: 8 },
  authModes: { height: 44, padding: 4, borderRadius: 14, flexDirection: 'row', backgroundColor: 'rgba(28,40,50,.08)', marginBottom: 16 }, authMode: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, authModeOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }, authModeText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.inkMuted }, authModeTextOn: { color: C.ink }, authStatus: { marginTop: -2, fontFamily: FONT, fontSize: 13, lineHeight: 18, fontWeight: '600', color: C.danger, textAlign: 'center' },
  authSubmit: { height: 52, marginTop: 12, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, authSubmitDisabled: { opacity: .62 }, authSubmitText: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#fff' }, forgotLink: { alignSelf: 'flex-end', marginTop: 6 }, forgotText: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: C.primary }, orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14 }, orLine: { flex: 1, height: 1, backgroundColor: C.line }, orText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', color: C.inkMuted, marginHorizontal: 10 }, googleBtn: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }, googleBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: C.ink }, hoursContent: { padding: 0 }, hoursIntro: { paddingHorizontal: 30, paddingTop: 24 }, hoursCard: { minHeight: SCREEN_HEIGHT * .57, overflow: 'hidden' },
  hoursRow: { flex: 1, minHeight: 58, paddingLeft: 30, paddingRight: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.lineStrong }, hoursRowLast: { borderBottomWidth: 0 }, hoursDay: { width: 43, fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#1C2832' }, hoursTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, timeInput: { width: 66, height: 36, borderRadius: 10, paddingHorizontal: 8, backgroundColor: C.field, color: C.ink, fontFamily: FONT, fontSize: 14, textAlign: 'center', borderWidth: 1, borderColor: C.line, outlineWidth: 0 }, timeInputOff: { width: 66, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }, timeOffText: { fontFamily: FONT, color: C.inkMuted, fontSize: 13 }, timeDash: { fontFamily: FONT, fontSize: 13, color: C.inkSoft }, hoursSwitch: { width: 52, alignItems: 'flex-end' },
  upload: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, overflow: 'hidden' },
  uploadPreview: { width: 52, height: 52, borderRadius: 15, marginBottom: 9 }, uploadPreviewFill: { width: '100%', height: '100%' },
  uploadIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,.12)', marginBottom: 10 },
  saveTickBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editStepBtn: { paddingHorizontal: 14, height: 30, borderRadius: 15, backgroundColor: C.field, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  editStepText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.ink },
  uploadTitle: { fontFamily: FONT, fontWeight: '800', fontSize: 14, color: '#1C2832' }, uploadSub: { fontFamily: FONT, fontSize: 11, color: C.inkSoft, marginTop: 3 }, swipeHint: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center' },
  fixedPrompt: { position: 'absolute', left: 18, right: 18, bottom: 14, zIndex: 120, elevation: 120, alignItems: 'center', gap: 7 }, swipeRow: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.7)' }, validationText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.danger, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.dangerSoft, overflow: 'hidden' },
  addService: { marginTop: 14, height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primaryBorder, backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addServiceText: { fontFamily: FONT, fontWeight: '700', fontSize: 14, color: C.ink }, site: { overflow: 'hidden' },
  previewDots: { position: 'absolute', left: 11, flexDirection: 'row', gap: 4 }, previewDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.35)' }, previewAddress: { fontFamily: FONT, fontSize: 8, color: 'rgba(255,255,255,.54)' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end', cursor: 'default' as any },
  modalBox: { backgroundColor: C.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 42 : 24 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonCancel: { backgroundColor: 'rgba(0,0,0,.06)' },
  modalButtonSave: { backgroundColor: C.primary },
  modalButtonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' },
  dot: { width: 20, height: 20, borderRadius: 10 }, selected: { borderColor: BRAND, backgroundColor: 'rgba(59,130,246,.12)' }, fontOption: { paddingVertical: 10, borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' }, fontOptionText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', textAlign: 'center', color: C.ink },
  domainError: { marginTop: 10, fontFamily: FONT, fontSize: 13, lineHeight: 18, color: C.danger }, domainResult: { marginTop: 14, padding: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.successSoft, borderWidth: 1, borderColor: 'rgba(31,138,84,.3)' }, domainName: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#1C2832' }, domainPrice: { fontFamily: FONT, fontSize: 13, color: C.success, fontWeight: '600', marginTop: 2 },
  formChoice: { marginTop: 22, padding: 17, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.45)', borderWidth: 1, borderColor: 'rgba(28,40,50,.16)' }, formChoiceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,.12)' }, formChoiceTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#1C2832' }, formChoiceText: { fontFamily: FONT, fontSize: 13, color: C.inkSoft, marginTop: 3, lineHeight: 18 },
  rail: { position: 'absolute', top: SAFE_TOP + 2, left: '25%', right: '25%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 140, elevation: 140 }, railButton: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, railActive: { position: 'absolute', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderWidth: 0, shadowColor: C.primary, shadowOpacity: .45, shadowRadius: 8, elevation: 8 }, railDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A1E22', borderWidth: 1, borderColor: 'rgba(0,0,0,.32)', shadowColor: '#000', shadowOpacity: .2, shadowRadius: 2 }, railDotOn: { backgroundColor: C.primary, borderColor: '#A9C8FF', shadowColor: C.primary, shadowOpacity: .45, shadowRadius: 5 },
  reviewRowText: { fontFamily: FONT, fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#1C2832' },
  addReviewBtn: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.primaryBorder, backgroundColor: C.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 },
  addReviewText: { fontFamily: FONT, fontWeight: '700', fontSize: 14, color: C.ink },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, marginTop: 8, marginBottom: 12 },
  galleryItem: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#EFE4DB' },
  galleryThumb: { width: '100%', height: '100%' },
  galleryAdd: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: C.field },
  adminBackBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: C.primarySoft, marginLeft: 'auto', marginRight: 8 },
  adminBackText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.primary },
  dashboardScreen: { flex: 1, paddingTop: Platform.OS === 'ios' ? 58 : 32 },
  dashboardBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  dashboardTabsTop: { flexDirection: 'row', marginHorizontal: 20, padding: 4, borderRadius: 14, backgroundColor: 'rgba(28,40,50,.07)', marginBottom: 18 },
  unreadDot: { position: 'absolute', top: 7, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: '#DC2626', borderWidth: 2, borderColor: C.canvas },
dashboardTab: { flex: 1, minHeight: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dashboardTabOn: { backgroundColor: C.primary },
  dashboardTabText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.inkMuted },
  dashboardTabTextOn: { color: '#fff' },
  dashboardContent: { paddingHorizontal: 20, paddingBottom: 48 },
  dashboardInfoCard: { padding: 18, borderRadius: 16, backgroundColor: C.surface, marginBottom: 12 },
  dashboardCardLabel: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, marginBottom: 4 },
  dashboardCardTitle: { fontFamily: FONT, fontSize: 17, fontWeight: '800', color: C.ink },
  dashboardCardText: { fontFamily: FONT, fontSize: 14, color: C.inkSoft, marginTop: 3 },
  dashboardWebsiteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dashboardEdit: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  dashboardEditText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.ink },
  phoneFrame: { width: DASHBOARD_PREVIEW_WIDTH, height: DASHBOARD_PREVIEW_HEIGHT, alignSelf: 'center', borderRadius: 28, borderWidth: 7, borderColor: '#141A1E', overflow: 'hidden', marginVertical: DASHBOARD_PREVIEW_INSET, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  makeLiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: C.primary },
  makeLiveBtnText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#fff' },
  messageMeta: { fontFamily: FONT, fontSize: 11, fontWeight: '600', color: C.inkMuted, marginTop: 5, marginBottom: 14 },
  messageMetaSent: { alignSelf: 'flex-end', marginRight: 4 },
  messageMetaReceived: { alignSelf: 'flex-start', marginLeft: 4 },
  messageBubble: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 22, maxWidth: '80%', backgroundColor: C.surface, shadowColor: '#1C2832', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  messageImage: { width: 180, height: 180, borderRadius: 12 },
  messageBubbleReceived: { alignSelf: 'flex-start', borderBottomLeftRadius: 7 },
  messageText: { fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: C.ink },
  messageInputFixed: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingHorizontal: 14, paddingBottom: Platform.OS === 'ios' ? 30 : 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong, backgroundColor: C.surface },
  messageBubbleSent: { backgroundColor: C.primary, alignSelf: 'flex-end', borderBottomRightRadius: 7, shadowColor: C.primary, shadowOpacity: 0.28 },
  messageInputField: { flex: 1, minHeight: 40, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 20, backgroundColor: 'rgba(28,40,50,.06)', fontFamily: FONT, fontSize: 15, color: C.ink },
  revealCard: { position: 'absolute', zIndex: 999, elevation: 999, backgroundColor: '#141A1E', borderColor: '#141A1E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
buildingWrap: { alignItems: 'center', paddingBottom: 24 },
  buildingPhone: { backgroundColor: '#141A1E', alignItems: 'center', justifyContent: 'center' },
  // with no background, iOS traces the B's own shape, so the shadow reads as a blue glowing outline
  buildingLogo: { width: 64, height: 70 },
  buildingGlow: { shadowColor: '#3B82F6', shadowOpacity: 1, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } },
  buildingGlowInner: { shadowColor: '#7FB2FF', shadowOpacity: 1, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
  todoGlow: { shadowColor: '#F59E0B' },
  todoGlowInner: { shadowColor: '#FFD27F' },
  buildingText: { fontFamily: FONT, fontSize: 18, fontWeight: '800', color: C.ink },
  buildingSub: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: C.inkSoft, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  planModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,10,16,.6)' },
  planModalBox: { backgroundColor: C.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  planModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planModalTitle: { fontFamily: FONT, fontSize: 20, fontWeight: '800', color: '#1C2832' },
  planModalSub: { fontFamily: FONT, fontSize: 14, color: C.inkSoft, marginBottom: 12 },
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
  fullLoadingKicker: { fontFamily: FONT, fontSize: 11, fontWeight: '700', letterSpacing: 3, color: 'rgba(255,255,255,.75)', textAlign: 'center' },
  fullLoadingName: { fontFamily: FONT, fontSize: 30, lineHeight: 36, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 18 },
  fullLoadingList: { gap: 12 },
  fullLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  fullLoadingLine: { flex: 1, fontFamily: FONT, fontSize: 15, fontWeight: '600', color: '#fff' },
  fullLoadingTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.25)', overflow: 'hidden', marginTop: 10 },
  fullLoadingFill: { height: '100%', borderRadius: 2, backgroundColor: '#fff' },
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
  fieldOptional: { fontWeight: '600', color: C.inkMuted, fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 16 },
  typeChip: { paddingHorizontal: 9, paddingVertical: 8, flexGrow: 1, justifyContent: 'center' },
  typeChipText: { fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.field, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontFamily: FONT, fontSize: 14, fontWeight: '600', color: C.ink },
  chipTextOn: { color: '#fff' },
  sendGlow: { marginTop: 6, borderWidth: 2, borderColor: 'rgba(147,197,253,.95)', shadowColor: '#3B82F6', shadowOpacity: .75, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  sendGlowOff: { opacity: .45, shadowOpacity: 0, borderColor: 'transparent', elevation: 0 },
  sendHint: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  pathCard: { height: 158, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'center' },
pathCardBlue: { backgroundColor: C.primary, shadowColor: '#1D4ED8', shadowOpacity: .28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
pathCardWhite: { backgroundColor: '#fff', shadowColor: '#1C2832', shadowOpacity: .1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  pathTitle: { fontFamily: FONT, fontSize: 21, fontWeight: '800', letterSpacing: -.5, color: C.ink, marginBottom: 8, textAlign: 'center' },
  pathText: { fontFamily: FONT, fontSize: 16, lineHeight: 22, fontWeight: '500', color: C.ink, textAlign: 'center' },
  chooseBack: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 14 },
  chooseBackText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.primary },
  // the lowercase i from the BrightSite wordmark: round dot over a rounded stem
  listRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  gridRow: { flexDirection: 'row', gap: 6 },
  gridCell: { minHeight: 44, borderRadius: 11, paddingHorizontal: 10, fontFamily: FONT, fontSize: 14, color: C.ink, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  notesBox: { marginTop: 7, minHeight: 220, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  billingToggle: { flexDirection: 'row', gap: 4, padding: 4, marginTop: 12, marginBottom: 10, borderRadius: 14, backgroundColor: 'rgba(28,40,50,.07)' },
  billingOption: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  billingOptionOn: { backgroundColor: C.primary },
  billingText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.inkSoft },
  billingTextOn: { color: '#fff' },
  billingSave: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: C.success },
  planModalTotal: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: C.inkSoft, marginTop: 6, textAlign: 'center' },
savedPill: { position: 'absolute', top: SAFE_TOP + 86, alignSelf: 'center', zIndex: 200, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(28,40,50,.82)' },
  savedPillText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: '#fff' },
  listRowSub: { fontFamily: FONT, fontSize: 13, color: C.inkMuted, marginTop: 2 },
  sheetDelete: { alignItems: 'center', paddingTop: 14 },
  sheetDeleteText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.danger },
  deviceToggle: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(28,40,50,.07)' },
  deviceToggleDark: { backgroundColor: 'rgba(255,255,255,.12)' },
  deviceToggleBtn: { alignItems: 'center', justifyContent: 'center', width: 36, height: 34, borderRadius: 9 },
  deviceToggleBtnOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  deviceToggleBtnOnDark: { backgroundColor: '#fff' },
  desktopFrame: { alignSelf: 'stretch', marginHorizontal: 0, borderRadius: 12, overflow: 'hidden', marginBottom: 18, backgroundColor: '#fff', borderWidth: 6, borderColor: '#141A1E', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  desktopBar: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9ECEF' },
  desktopBarUrl: { fontFamily: FONT, fontSize: 11, color: C.inkSoft, flexShrink: 1 },
  desktopAddress: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#fff', maxWidth: '62%' },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  cardLinkText: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: C.primary },
  editMenu: { position: 'absolute', top: 46, right: 0, width: 250, padding: 6, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: .14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12, zIndex: 50 },
  editMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10 },
  editMenuTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '700', color: C.ink },
  editMenuSub: { fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 1 },
});

const adminApiCall = (session: any, slug: string, payload: Record<string, any>) => fetch(ADMIN_API, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ...payload }) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; });

// Admin-only account controls, laid out like the client's Account cards. Inputs pop up when an option is tapped.
function AdminAccountPanel({ biz, session, isLive }: { biz: any; session: any; isLive: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [prompt, setPrompt] = useState<null | 'email' | 'password' | 'domain'>(null);
  const [domainNow, setDomainNow] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const d = biz.data || {};
  const api = (payload: Record<string, any>) => adminApiCall(session, biz.id, payload);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setMsg(''); try { await fn(); if (ok) setMsg(ok); } catch (e: any) { if (!/valid domain/i.test(e.message || '')) setMsg(e.message || 'Something went wrong'); } setBusy(false); };
  const loadInfo = () => api({ action: 'account-info' }).then(setInfo).catch(e => setMsg(e.message));
  useEffect(() => { void loadInfo(); }, [biz.id]);
  const sub = info?.subscription;
  const link = (icon: any, label: string, onPress: () => void, danger = false) =>
    <Pressable disabled={busy} onPress={onPress} style={s.cardLink} hitSlop={8}><Ionicons name={icon} size={15} color={danger ? C.danger : C.primary} /><Text style={[s.cardLinkText, danger && { color: C.danger }]}>{label}</Text></Pressable>;
  const submit = () => {
    const v = value.trim();
    if (prompt === 'domain' && !/^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(v)) return; // not a domain yet: stay on the pop-up, no warning
    if (prompt === 'email' && v) void run(async () => { await api({ action: 'update-login', email: v }); await loadInfo(); }, 'Login email changed.');
    else if (prompt === 'domain' && v) void run(async () => {
      const r = await api({ domain: v });
      setDomainNow(v.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''));
      setMsg(r.connected ? 'Connected. The site loads on this domain within a few minutes.' : `Almost there. At their registrar set the nameservers to: ${(r.nameservers || []).join(', ')}. It connects automatically after that.`);
    });
    else if (prompt === 'password') { if (v.length < 8) { setMsg('Password must be 8+ characters.'); } else void run(async () => { await api({ action: 'update-login', password: v }); }, 'Password set. Let them know.'); }
    setPrompt(null); setValue('');
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const shownDomain = domainNow ?? (d.customDomain || d.domain || '');
  const realDomain = /brightsite\.app/i.test(shownDomain) ? '' : shownDomain;
  return <View>
    <View style={s.dashboardInfoCard}>
      <Text style={s.dashboardCardLabel}>Domain</Text>
      <Text style={s.dashboardCardTitle}>{realDomain || 'No domain yet'}</Text>
      <Text style={s.dashboardCardText}>{realDomain ? (isLive || d.domainConnected ? 'Connected to the website' : 'Waiting for nameservers / connects when live') : 'Connect one they already own'}</Text>
      {link('add-circle-outline', realDomain ? 'Change domain' : 'Add domain', () => { setValue(''); setPrompt('domain'); })}
    </View>
    <View style={s.dashboardInfoCard}>
      <Text style={s.dashboardCardLabel}>Plan</Text>
      {sub && !sub.error ? <>
        <Text style={s.dashboardCardTitle}>{sub.amount != null ? `£${(sub.amount / 100).toFixed(2)}` : ''}{sub.interval ? ` / ${sub.interval}` : ''} · {sub.status}</Text>
        <Text style={s.dashboardCardText}>{[sub.renews ? `${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${when(sub.renews)}` : '', sub.card].filter(Boolean).join(' · ')}</Text>
        {sub.status !== 'canceled' && (sub.cancelAtPeriodEnd
          ? link('refresh-outline', 'Keep plan (undo cancel)', () => void run(async () => { await api({ action: 'cancel-plan', undo: true }); await loadInfo(); }))
          : link('close-circle-outline', 'Cancel at end of period', () => Alert.alert('Cancel plan?', 'Their site goes offline when the billing period ends.', [{ text: 'No', style: 'cancel' }, { text: 'Cancel plan', style: 'destructive', onPress: () => void run(async () => { await api({ action: 'cancel-plan' }); await loadInfo(); }) }]), true))}
      </> : <Text style={s.dashboardCardTitle}>{info ? (d.planActive ? 'Paid' : 'No plan yet') : 'Loading…'}</Text>}
    </View>
    <View style={s.dashboardInfoCard}>
      <Text style={s.dashboardCardLabel}>Login email</Text>
      <Text style={s.dashboardCardTitle}>{info ? (info.login?.email || 'No login') : 'Loading…'}</Text>
      {!!info?.login?.lastSignIn && <Text style={s.dashboardCardText}>Last signed in {timeAgo(info.login.lastSignIn)}</Text>}
      {link('mail-outline', 'Change email', () => { setValue(''); setPrompt('email'); })}
      {link('key-outline', 'Set password', () => { setValue(''); setPrompt('password'); })}
      {link('paper-plane-outline', 'Email reset link', () => Alert.alert('Send reset link?', `This emails ${info?.login?.email || 'the client'} a link to reset their password.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: () => void run(async () => { const r = await api({ action: 'send-reset' }); setMsg(`Reset link sent to ${r.email}.`); }) }]))}
    </View>
    {!!msg && <Text style={[s.dashboardCardText, { paddingHorizontal: 4 }]}>{msg}</Text>}
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => setPrompt(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.planModalOverlay}>
        <View style={s.planModalBox}>
          <View style={s.planModalHeader}><Text style={s.planModalTitle}>{prompt === 'email' ? 'Change login email' : prompt === 'domain' ? 'Add domain' : 'Set password'}</Text><Pressable onPress={() => setPrompt(null)} hitSlop={10}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          <TextInput autoFocus value={value} onChangeText={setValue} placeholder={prompt === 'email' ? 'New login email' : prompt === 'domain' ? 'e.g. willowbeauty.co.uk' : 'New password (8+ characters)'} placeholderTextColor={C.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType={prompt === 'email' ? 'email-address' : prompt === 'domain' ? 'url' : 'default'} onSubmitEditing={submit} style={aS.admInput} />
          <Pressable onPress={submit} style={({ pressed }) => [s.planModalPayBtn, { marginTop: 14 }, pressed && s.pressed]}><Text style={s.planModalPayBtnText}>Save</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const aS = StyleSheet.create({
  admPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  admPill: { minHeight: 38, paddingHorizontal: 15, borderRadius: 999, justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  admPillPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  admPillText: { fontFamily: FONT, fontSize: 13.5, fontWeight: '700', color: C.ink },
  admStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 12 },
  admBody: { padding: 20, gap: 12 },
  admCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16 },
  admK: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: C.inkMuted, marginBottom: 3 },
  admV: { fontFamily: FONT, fontSize: 15.5, fontWeight: '700', color: C.ink },
  admNote: { fontFamily: FONT, fontSize: 13, color: C.inkMuted, marginTop: 4 },
  admInput: { fontFamily: FONT, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, height: 44, marginTop: 12, backgroundColor: C.canvas },
  adminBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: C.primarySoft },
  adminBadgeText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: C.primary, letterSpacing: .6 },
  signOutBtn: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  signOutText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: C.ink },
  filterRow: { paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' },
  filterTab: { flexDirection: 'row', alignItems: 'center', height: 34, paddingHorizontal: 13, borderRadius: 999, marginRight: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 6 },
  filterTabOn: { backgroundColor: C.ink, borderColor: C.ink },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterTabText: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: C.ink },
  filterTabTextOn: { color: '#fff' },
  filterCount: { fontWeight: '500', color: C.inkMuted },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, minHeight: 46, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, gap: 8 },
  searchInput: { flex: 1, fontFamily: FONT, fontSize: 15, color: C.ink, paddingVertical: 10 },
  bizList: { paddingHorizontal: 20, paddingBottom: 40 },
  bizCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, marginBottom: 8, overflow: 'hidden' },
  bizStatusBar: { width: 4 },
  bizCardInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingLeft: 14, paddingRight: 10, gap: 6 },
  bizMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  bizName: { fontFamily: FONT, fontSize: 16, fontWeight: '600', color: C.ink },
  bizTime: { fontFamily: FONT, fontSize: 13, color: C.inkMuted },
  bizStatusDot: { width: 7, height: 7, borderRadius: 4 },
  bizStatusText: { fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  bizAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(28,40,50,.06)', alignItems: 'center', justifyContent: 'center' },
  bizUnreadDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, borderWidth: 1.5, borderColor: '#fff' },
  emptyText: { textAlign: 'center', marginTop: 60, fontFamily: FONT, fontSize: 15, lineHeight: 21, color: C.inkSoft },
  showingText: { textAlign: 'center', marginTop: 14, fontFamily: FONT, fontSize: 12, fontWeight: '500', color: C.inkMuted },
  threadCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 12 },
  threadAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  threadAvatarText: { fontFamily: FONT, fontSize: 16, fontWeight: '600', color: C.primary },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  threadName: { fontFamily: FONT, fontSize: 16, fontWeight: '600', color: C.ink, flex: 1, marginRight: 8 },
  draftTag: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: C.inkMuted, backgroundColor: 'rgba(28,40,50,.08)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', marginRight: 8 },
  threadTime: { fontFamily: FONT, fontSize: 12, fontWeight: '500', color: C.inkMuted },
  threadPreview: { fontFamily: FONT, fontSize: 14, color: C.inkSoft },
  threadUnread: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary },
  threadHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  threadBack: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  briefBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.primary },
  briefBtnText: { fontFamily: FONT, fontSize: 13, fontWeight: '700', color: '#fff' },
  threadBackText: { fontFamily: FONT, fontSize: 17, fontWeight: '600', color: C.ink, flex: 1 },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 12 },
  notifIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifName: { fontFamily: FONT, fontSize: 16, fontWeight: '600', color: C.ink },
  notifDesc: { fontFamily: FONT, fontSize: 14, color: C.inkSoft, marginTop: 2 },
  notifTime: { fontFamily: FONT, fontSize: 12, fontWeight: '500', color: C.inkMuted },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#fff' },
});
