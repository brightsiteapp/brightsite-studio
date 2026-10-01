import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Easing, Image, ImageBackground, Keyboard, LayoutAnimation, PanResponder,
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
// A deep, softened sheet rather than a conventional outlined app panel.
const CARD = 'rgba(37,42,47,.20)';

type Step = { id: string; title: string; icon: keyof typeof Ionicons.glyphMap };
const steps: Step[] = [
  { id: 'login', title: 'Welcome to BrightSite', icon: 'sparkles-outline' },
  { id: 'business', title: 'Business information', icon: 'storefront-outline' },
  { id: 'contact', title: 'Contact details', icon: 'call-outline' },
  { id: 'hours', title: 'Opening hours', icon: 'time-outline' },
  { id: 'prices', title: 'Services & prices', icon: 'pricetag-outline' },
  { id: 'media', title: 'Photos & logo', icon: 'images-outline' },
  { id: 'reviews', title: 'Reviews', icon: 'star-outline' },
  { id: 'design', title: 'Design Editor', icon: 'layers-outline' },
  { id: 'domain', title: 'Choose a domain', icon: 'globe-outline' },
  { id: 'plan', title: 'Choose your plan', icon: 'card-outline' },
  { id: 'dashboard', title: 'Your website', icon: 'checkmark-circle-outline' },
];
const setupStepIndexes = Array.from({ length: 9 }, (_, i) => i + 1);
const paletteGroups = [
  { name: 'Light', options: [['#B98B5F', '#F5EFE5', '#201B18'], ['#C78561', '#FFF5EC', '#2D1811'], ['#8E9B7A', '#F2F5EC', '#20321D'], ['#A47A57', '#F6F0E8', '#271C15'], ['#7697A6', '#EDF6F7', '#162D35'], ['#C59C7B', '#FCF8F2', '#302015']] },
  { name: 'Dark', options: [['#D6A56B', '#15110E', '#F3EADF'], ['#78BDCF', '#0C2028', '#E7F8FC'], ['#B2C798', '#142016', '#F2F6ED'], ['#CE8471', '#261412', '#FAEDEA'], ['#A19BDB', '#171529', '#F2F1FF'], ['#D7B179', '#211A11', '#FBF1DF']] },
  { name: 'Neon', options: [['#E8FF38', '#10140D', '#F4F8E8'], ['#5BEEFF', '#091A20', '#E8FCFF'], ['#FE77BF', '#21101D', '#FFEAF7'], ['#A8FF75', '#10200C', '#EFFFE7'], ['#FF8E4F', '#24140B', '#FFF0E7'], ['#A990FF', '#171126', '#F5F0FF']] },
  { name: 'Monotone', options: [['#B8B8B8', '#F1F1F1', '#1B1B1B'], ['#B9AFA6', '#F3F0ED', '#27221E'], ['#9EADB2', '#EFF2F3', '#1A2428'], ['#A9B19C', '#F1F3EE', '#20241C'], ['#B0A4A2', '#F4EFEE', '#29201F'], ['#9EA4AE', '#F0F2F5', '#1B2029']] },
];
const palettes = paletteGroups.flatMap(group => group.options);
const fonts = ['Editorial', 'Rounded', 'Modern'];

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, ...inputProps }: any) {
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="rgba(218,232,244,.35)"
      keyboardType={keyboardType} multiline={multiline} style={[s.input, multiline && s.inputMultiline]} {...inputProps} />
  </View>;
}

function Button({ label, onPress, secondary = false }: any) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondaryButton, pressed && s.pressed]}>
    <Text style={[s.buttonText, secondary && { color: '#DDF3FC' }]}>{label}</Text>
    {!secondary && <Ionicons name="arrow-up" size={17} color="#03111C" />}
  </Pressable>;
}
const Intro = ({ children }: any) => <Text style={s.intro}>{children}</Text>;

function Hours({ rows, setRows }: any) {
  return <View style={s.hoursCard}>{rows.map((row: any, i: number) =>
    <View style={[s.hoursRow, i === rows.length - 1 && s.hoursRowLast]} key={row.label}>
      <Text style={s.hoursDay}>{row.label.slice(0, 3)}</Text>
      <View style={s.hoursTimes}>{row.enabled ? <><TextInput value={row.start} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, start: v } : x))} style={s.timeInput} /><Text style={s.timeDash}>–</Text><TextInput value={row.end} onChangeText={v => setRows(rows.map((x: any, n: number) => n === i ? { ...x, end: v } : x))} style={s.timeInput} /></> : <><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View><Text style={s.timeDash}>–</Text><View style={s.timeInputOff}><Text style={s.timeOffText}>—</Text></View></>}</View>
      <View style={s.hoursSwitch}><Switch value={row.enabled} onValueChange={() => setRows(rows.map((x: any, n: number) => n === i ? { ...x, enabled: !x.enabled } : x))}
        trackColor={{ false: '#324254', true: BRAND }} thumbColor="#F7FCFF" /></View></View>)}</View>;
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

function Upload({ icon, title, subtitle, value, onChange, multiple = false, fill = false }: any) {
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: multiple, quality: .82 });
    if (!result.canceled) onChange(multiple ? result.assets.map(asset => asset.uri) : result.assets[0]?.uri);
  };
  const preview = Array.isArray(value) ? value[0] : value;
  return <Pressable onPress={chooseImage} style={({ pressed }) => [s.upload, fill && s.uploadFill, pressed && s.pressed]}>
    {preview ? <Image source={{ uri: preview }} style={fill ? s.uploadPreviewFill : s.uploadPreview} /> : <><View style={s.uploadIcon}><Ionicons name={icon} size={22} color={BRAND} /></View><Text style={s.uploadTitle}>{title}</Text><Text style={s.uploadSub}>{subtitle}</Text></>}
  </Pressable>;
}

function SitePreview({ palette, font, template, editing }: any) {
  const colors = palettes[palette];
  const hero = template === 0 ? require('./assets/hair-beauty-hero.jpg') : require('./assets/sisko-preview.webp');
  return <View style={[s.site, { backgroundColor: colors[1] }]}>
    <View style={s.previewBrowser}><View style={s.previewDots}><View style={s.previewDot} /><View style={s.previewDot} /><View style={s.previewDot} /></View><Text style={s.previewAddress}>siskohair.co.uk</Text></View>
    <ImageBackground source={hero} style={s.siteHero}>
      <LinearGradient colors={['rgba(5,7,9,.08)', 'rgba(5,7,9,.84)']} style={StyleSheet.absoluteFill} />
      <View style={s.siteTop}><Text style={s.siteKicker}>SISKO</Text><View style={s.siteNav}><Text style={s.siteNavText}>HOME</Text><Text style={s.siteNavText}>SERVICES</Text><Text style={s.siteNavText}>CONTACT</Text><Ionicons name="menu" size={18} color="#fff" /></View></View>
      <View style={s.siteCopy}><Text style={[s.siteHeadline, font === 1 && s.rounded, font === 2 && s.modern, editing && s.editing]}>Beautiful hair, beautifully yours.</Text>
        <Text style={[s.siteBody, editing && s.editing]}>Thoughtful cuts, colour and styling in a calm modern salon.</Text>
        <View style={[s.siteCta, { borderColor: colors[0] }]}><Text style={s.siteCtaText}>BOOK AN APPOINTMENT</Text></View></View>
    </ImageBackground>
    <View style={s.siteSection}><Text style={[s.siteSectionTitle, { color: colors[2] }, editing && s.editing]}>Hair that feels like you</Text>
      <Text style={[s.siteSectionBody, { color: colors[2] }, editing && s.editing]}>Personal service, honest advice and a finish made for real life.</Text>
      <View style={s.swatches}>{colors.map(c => <View key={c} style={[s.swatch, { backgroundColor: c }]} />)}</View></View>
  </View>;
}

function DesignTools({ active, setActive, palette, setPalette, font, setFont, editing, setEditing }: any) {
  const items = [{ id: 'colour', icon: 'color-palette-outline' }, { id: 'font', icon: 'text-outline' }, { id: 'edit', icon: 'create-outline' }];
  const [paletteSection, setPaletteSection] = useState(0);
  return <View style={s.tools}>
    <View style={s.toolStack}>{items.map(item => {
      const open = active === item.id;
      return (
        <Pressable key={item.id} onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const next = active === item.id ? null : item.id;
          setActive(next);
          setEditing(next === 'edit');
        }} style={({ pressed }) => [s.toolButton, open && s.toolActive, pressed && s.pressed]}>
          <Ionicons name={item.icon as any} size={19} color={open ? '#fff' : '#2E6C87'} />
        </Pressable>
      );
    })}</View>
    {active && <BlurView intensity={58} tint="light" style={s.toolPanel}>
      <Text style={s.toolTitle}>{active === 'colour' ? 'Colour' : active === 'font' ? 'Font' : 'Edit site'}</Text>
      {active === 'colour' && <View style={s.paletteWrap}><Text style={s.paletteHeadingText}>{paletteGroups[paletteSection].name}</Text><ScrollView style={s.paletteScroll} onScroll={event => { const next = Math.min(paletteGroups.length - 1, Math.floor(event.nativeEvent.contentOffset.y / 286)); if (next !== paletteSection) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPaletteSection(next); } }} scrollEventThrottle={16}>{paletteGroups.map((group, groupIndex) => <View key={group.name} style={s.paletteGroup}>{group.options.map((colors, i) => { const paletteIndex = paletteGroups.slice(0, groupIndex).reduce((total, section) => total + section.options.length, 0) + i; return <Pressable key={colors.join()} onPress={() => setPalette(paletteIndex)} style={[s.option, palette === paletteIndex && s.selected]}>{colors.map(c => <View key={c} style={[s.dot, { backgroundColor: c }]} />)}</Pressable>; })}</View>)}</ScrollView></View>}
      {active === 'font' && fonts.map((name, i) => <Pressable key={name} onPress={() => setFont(i)} style={[s.fontOption, font === i && s.selected]}><Text style={s.fontOptionText}>{name}</Text></Pressable>)}
      {active === 'edit' && ['Hero', 'About', 'Services', 'Gallery'].map(name => <View key={name} style={s.sectionOption}>
        <Ionicons name="reorder-three" size={18} color="#436172" /><Text style={s.sectionText}>{name}</Text><Ionicons name="eye-outline" size={17} color="#436172" /></View>)}
    </BlurView>}
  </View>;
}

function Tutorial({ close }: any) {
  return <BlurView intensity={42} tint="dark" style={s.tutorial}>
    <Ionicons name="swap-horizontal" size={27} color="#EAF8FF" /><Text style={s.tutorialTitle}>Swipe to explore designs</Text>
    <Text style={s.tutorialBody}>Use the controls to change colour, font and content.</Text>
    <Pressable onPress={close} style={s.gotIt}><Text style={s.gotItText}>Got it</Text></Pressable>
  </BlurView>;
}

function FlowBackdrop({ children }: any) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 11500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 11500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [drift]);
  const topMove = { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-34, 38] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 26] }) }] };
  const bottomMove = { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [28, -36] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [24, -18] }) }] };
  return <LinearGradient colors={['#04091E', '#0A1E59', '#061340']} locations={[0, .54, 1]} style={{ flex: 1 }}>
    <Animated.View pointerEvents="none" style={[s.backdropGlowTop, topMove]}><LinearGradient colors={['rgba(255,255,255,.24)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /></Animated.View>
    <Animated.View pointerEvents="none" style={[s.backdropGlowBottom, bottomMove]}><LinearGradient colors={['rgba(255,255,255,.16)', 'rgba(255,255,255,0)']} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} /></Animated.View>
    {children}
  </LinearGradient>;
}

function DashboardHome({ tab, setTab, data, domain, suffix, palette, font, template, onEdit }: any) {
  const siteUrl = data.website?.trim() || `https://${domain}${suffix}`;
  return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.dashboardScreen}>
      <View style={s.dashboardBrandRow}><Text style={s.dashboardBrand}>BRIGHTSITE</Text><Text style={s.dashboardLive}>● LIVE</Text></View>
      <View style={s.dashboardTabsTop}>{['Account', 'Website', 'Messages'].map(name => <Pressable key={name} onPress={() => setTab(name)} style={[s.dashboardTab, tab === name && s.dashboardTabOn]}><Text style={[s.dashboardTabText, tab === name && s.dashboardTabTextOn]}>{name}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={s.dashboardContent} showsVerticalScrollIndicator={false}>
        {tab === 'Account' && <><Text style={s.dashboardTitle}>Your account</Text><Text style={s.dashboardIntro}>Everything for {data.businessName || 'your business'} in one place.</Text>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>YOUR PLAN</Text><Text style={s.dashboardCardTitle}>Free website plan</Text><Text style={s.dashboardCardText}>£19/month hosting</Text></View>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>YOUR DOMAIN</Text><Text style={s.dashboardCardTitle}>{domain}{suffix}</Text><Text style={s.dashboardCardText}>Connected to your website</Text></View>
          <View style={s.dashboardInfoCard}><Text style={s.dashboardCardLabel}>ACCOUNT EMAIL</Text><Text style={s.dashboardCardTitle}>{data.email || data.contactEmail || 'Add an email address'}</Text></View></>}
        {tab === 'Website' && <><View style={s.dashboardWebsiteHead}><View><Text style={s.dashboardLive}>● LIVE</Text><Text style={s.dashboardTitle}>Your website</Text></View><Pressable onPress={onEdit} style={s.dashboardEdit}><Ionicons name="create-outline" size={15} color="#fff" /><Text style={s.dashboardEditText}>Edit</Text></Pressable></View>
          <Text style={s.dashboardIntro}>Tap your homepage to open it, or edit its design and content.</Text>
          <Pressable onPress={() => void Linking.openURL(siteUrl)} style={s.phoneFrame}><View pointerEvents="none" style={s.phoneScale}><SitePreview palette={palette} font={font} template={template} editing={false} /></View></Pressable></>}
        {tab === 'Messages' && <><Text style={s.dashboardTitle}>Messages</Text><View style={s.messageBubble}><Text style={s.messageSender}>Tom · BrightSite</Text><Text style={s.messageText}>Welcome to BrightSite, {data.businessName || 'there'}! I’m Tom. Your website is live, and you can message me here whenever you need a hand.</Text></View><View style={s.messageInput}><Text style={s.messagePlaceholder}>Message BrightSite…</Text><Ionicons name="arrow-up-circle" size={24} color="#2878FF" /></View></>}
      </ScrollView>
    </View>
  </FlowBackdrop>;
}

export default function App() {
  const [index, setIndex] = useState(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSession, setAuthSession] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [complete, setComplete] = useState<Set<number>>(new Set());
  const [tutorial, setTutorial] = useState(true);
  const [palette, setPalette] = useState(0);
  const [font, setFont] = useState(0);
  const [template, setTemplate] = useState(0);
  const [tool, setTool] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showRail, setShowRail] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [deckDirection, setDeckDirection] = useState<-1 | 0 | 1>(0);
  const [loadingStage, setLoadingStage] = useState(0);
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
  const [annual, setAnnual] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [contactForm, setContactForm] = useState(true);
  const [tab, setTab] = useState('Website');
  const [data, setData] = useState({ email: '', password: '', businessName: 'Sisko Hairdressing', category: 'Hair & Beauty', fullName: '', contactEmail: '', phone: '', website: '', instagram: '', facebook: '', address: '', services: 'Cut & finish', price: '£45', reviews: '', reviewLink: '' });
  const [showFullName, setShowFullName] = useState(false);
  const [hours, setHours] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ label, start: '9:00', end: i === 3 ? '19:00' : '17:30', enabled: i < 6 })));
  const [services, setServices] = useState([{ section: 'Cutting & styling', name: 'Cut & finish', duration: '45 mins', price: '£45' }]);
  const [reviewsList, setReviewsList] = useState([{ title: '', description: '', name: '' }]);
  const motion = useRef(new Animated.Value(0)).current;
  const templateMotion = useRef(new Animated.Value(0)).current;
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingFades = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const designReveal = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = steps[index];

  const loadAccountDestination = async (session: any, animate = false) => {
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
      setIndex(steps.length - 1);
      motion.setValue((steps.length - 1) * CARD_TRAVEL);
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

  const revealRail = () => {
    if (railTimer.current) clearTimeout(railTimer.current);
    setShowRail(true);
  };
  const hideRailSoon = () => {
    if (railTimer.current) clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => setShowRail(false), 900);
  };

  const minimumInfoComplete = (stepId = step.id) => {
    switch (stepId) {
      case 'login': return /\S+@\S+\.\S+/.test(data.email.trim()) && data.password.length >= 8;
      case 'business': return !!data.businessName.trim() && !!data.category.trim();
      case 'contact': return /\S+@\S+\.\S+/.test(data.contactEmail.trim()) || data.phone.replace(/\D/g, '').length >= 7;
      case 'hours': return hours.some(row => row.enabled && row.start.trim() && row.end.trim());
      case 'prices': return services.some(item => item.name.trim() && item.price.trim());
      case 'design': return designReady;
      case 'domain': return domainReady;
      default: return true;
    }
  };
  const missingInfoText = () => ({
    login: 'Add a valid email and an 8 character password first',
    business: 'Add your business name and business type first',
    contact: 'Add an email address or phone number first',
    hours: 'Keep at least one day open and add its times',
    prices: 'Add at least one service and its price first',
    design: 'Your designs are still being prepared',
    domain: 'Check and select an available domain first',
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
      await loadAccountDestination(result.data.session, true);
    } catch {
      setAuthStatus('You’re logged in, but we couldn’t load your account. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };
  const go = (to: number) => {
    // A gesture can only move to the adjacent card, so no card can be skipped.
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
  const changeTemplate = (direction: number) => {
    Animated.timing(templateMotion, { toValue: direction < 0 ? -SCREEN_HEIGHT : SCREEN_HEIGHT, duration: 180, useNativeDriver: true }).start(() => {
      setTemplate(value => (value + (direction < 0 ? 1 : -1) + 2) % 2);
      templateMotion.setValue(direction < 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT);
      Animated.spring(templateMotion, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 190 }).start();
    });
  };
  useEffect(() => {
    if (step.id !== 'design' || designReady) return;
    setLoadingStage(0);
    loadingProgress.setValue(0);
    designReveal.setValue(0);
    loadingFades.forEach(value => value.setValue(0));
    const timers = [520, 1100, 1720, 2350].map((delay, i) => setTimeout(() => {
      setLoadingStage(i + 1);
      Animated.parallel([
        Animated.timing(loadingFades[i], { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(loadingProgress, { toValue: (i + 1) / 4, duration: 460, useNativeDriver: false }),
      ]).start();
    }, delay));
    const done = setTimeout(() => {
      setDesignReady(true);
      Animated.timing(designReveal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, 3250);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [step.id]);

  useEffect(() => {
    if (validationMessage) setValidationMessage('');
  }, [data, hours, services, domainReady, designReady]);

  const pan = useMemo(() => PanResponder.create({
    // Keep the card still while the keyboard is up so the inner ScrollView can
    // bring a focused field above it.
    onMoveShouldSetPanResponder: (_, g) => !keyboardVisible && (Math.abs(g.dy) > 16 || step.id === 'design' && Math.abs(g.dx) > 16),
    onPanResponderGrant: revealRail,
    onPanResponderMove: (_, g) => {
      if (step.id === 'design' && Math.abs(g.dx) > Math.abs(g.dy)) templateMotion.setValue(g.dx);
      else if (Math.abs(g.dy) > Math.abs(g.dx)) {
        if (Math.abs(g.dy) > 12) setDeckDirection(g.dy < 0 ? 1 : -1);
        motion.setValue(index * CARD_TRAVEL - g.dy);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (step.id === 'design' && Math.abs(g.dx) > 65 && Math.abs(g.dx) > Math.abs(g.dy)) { changeTemplate(g.dx); motion.setValue(index * CARD_TRAVEL); return; }
      if (step.id === 'design' && Math.abs(g.dx) > Math.abs(g.dy)) { Animated.spring(templateMotion, { toValue: 0, useNativeDriver: true }).start(); return; }
      if (g.dy < -48 || g.vy < -.55) go(index + 1); else if (g.dy > 48 || g.vy > .55) go(index - 1); else Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0));
      hideRailSoon();
    },
    onPanResponderTerminate: () => Animated.spring(motion, { toValue: index * CARD_TRAVEL, damping: 20, stiffness: 210, useNativeDriver: true }).start(() => setDeckDirection(0)),
  }), [index, step.id, data, hours, services, domainReady, designReady, keyboardVisible]);

  const railPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: revealRail,
    onPanResponderMove: () => {},
    onPanResponderRelease: (_, g) => {
      if (g.dy < -42) go(index + 1);
      else if (g.dy > 42) go(index - 1);
      hideRailSoon();
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
        <Pressable onPress={() => setShowFullName(!showFullName)} style={s.nameDisplay}><View style={[s.checkbox, showFullName && s.checkboxOn]}>{showFullName && <Ionicons name="checkmark" size={13} color="#071923" />}</View><Text style={s.nameDisplayText}>Display full name on website</Text></Pressable>
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
      case 'media': return <><Intro>Add the images you want to use. Everything here is optional and can be changed later.</Intro><View style={s.uploadGrid}>
        <Upload icon="image-outline" title="Logo" subtitle={media.logo ? 'Tap to change' : 'PNG or JPG'} value={media.logo} onChange={(logo: string) => setMedia(current => ({ ...current, logo }))} fill />
        <Upload icon="add" title="Hero image" subtitle={media.hero ? 'Tap to change' : 'Your main photo'} value={media.hero} onChange={(hero: string) => setMedia(current => ({ ...current, hero }))} fill /></View>
        <Text style={s.fieldLabel}>Gallery</Text>
        <View style={s.galleryGrid}>
          {media.gallery.map((uri, i) => <View key={i} style={s.galleryItem}><Image source={{ uri }} style={s.galleryThumb} /></View>)}
          {media.gallery.length < 20 && <Pressable style={s.galleryAdd} onPress={async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) return;
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: .82 });
            if (!result.canceled) setMedia(current => ({ ...current, gallery: [...current.gallery, ...result.assets.map(a => a.uri)].slice(0, 20) }));
          }}><Ionicons name="add" size={26} color="rgba(218,232,244,.5)" /></Pressable>}
        </View></>;
      case 'reviews': return <><Intro>Add customer reviews for your website. Each is optional — leave blank and swipe on, or add more below.</Intro>
        {reviewsList.map((review, i) => <View key={i} style={s.reviewCard}>
          <Field label="Review title (optional)" value={review.title} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, title: v } : r))} placeholder="e.g. Amazing service" />
          <Field label="Review (optional)" value={review.description} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, description: v } : r))} multiline />
          <Field label="Customer name (optional)" value={review.name} onChangeText={(v: string) => setReviewsList(reviewsList.map((r, n) => n === i ? { ...r, name: v } : r))} placeholder="e.g. Jane Smith" />
        </View>)}
        <Pressable onPress={() => setReviewsList([...reviewsList, { title: '', description: '', name: '' }])} style={s.addReviewBtn}>
          <Ionicons name="add" size={16} color={BRAND} /><Text style={s.addReviewText}>Add another review</Text>
        </Pressable>
        <Pressable onPress={() => setContactForm(!contactForm)} style={[s.formChoice, contactForm && s.formChoiceOn]}><View style={s.formChoiceIcon}><Ionicons name="mail-outline" size={22} color={contactForm ? '#fff' : BRAND} /></View><View style={{ flex: 1 }}><Text style={s.formChoiceTitle}>Add a contact form</Text><Text style={s.formChoiceText}>Messages will arrive in your BrightSite dashboard.</Text></View><Switch value={contactForm} onValueChange={setContactForm} trackColor={{ false: '#324254', true: BRAND }} thumbColor="#F7FCFF" /></Pressable></>;
      case 'design': return <View style={s.design}>
        <Animated.View pointerEvents={designReady ? 'auto' : 'none'} style={[s.designPreview, { opacity: designReveal }]}><Animated.View style={{ transform: [{ translateX: templateMotion }] }}><SitePreview palette={palette} font={font} template={template} editing={editing} /></Animated.View>
          <View style={s.templateDots}><View style={[s.templateDot, template === 0 && s.templateDotOn]} /><View style={[s.templateDot, template === 1 && s.templateDotOn]} /></View>
          {tutorial && designReady && <Tutorial close={() => setTutorial(false)} />}</Animated.View>
        <Animated.View pointerEvents="none" style={[s.loading, { opacity: designReveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}><View style={s.loadingWordmark}><Text style={s.loadingBrand}>BRIGHTSITE</Text><View style={s.loadingBrandDot} /></View>
          <Text style={s.loadingTitle}>Creating {data.businessName || 'your'} design options</Text><Text style={s.loadingText}>We’re shaping your details into a website that feels like your business.</Text>
          <View style={s.loadingSteps}>{['Choosing a layout', 'Setting the tone', 'Matching your details', 'Almost ready'].map((item, i) => <Animated.View key={item} style={[s.loadingStep, i < loadingStage && s.loadingStepOn, { opacity: loadingFades[i], transform: [{ translateY: loadingFades[i].interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }] }]}><Ionicons name={i < loadingStage ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={i < loadingStage ? '#79D7A2' : 'rgba(218,235,244,.32)'} /><Text style={[s.loadingStepText, i < loadingStage && s.loadingStepTextOn]}>{item}</Text></Animated.View>)}</View>
          <View style={s.track}><Animated.View style={[s.fill, { width: loadingProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /></View></Animated.View>
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
          <TextInput style={s.domainInput} value={domain} onChangeText={(value) => { setDomain(value); clearDomainQuote(); }} autoCapitalize="none" /><Pressable onPress={() => setShowSuffixes(!showSuffixes)} style={s.suffixButton}><Text style={s.domainSuffix}>{suffix}</Text><Ionicons name="chevron-down" size={14} color="#C7E4F0" /></Pressable></View>
          {showSuffixes && <View style={s.suffixes}>{DOMAIN_TLDS.map(item => <Pressable key={item} onPress={() => { setSuffix(item); setShowSuffixes(false); clearDomainQuote(); }} style={[s.suffixOption, suffix === item && s.suffixOptionOn]}><Text style={s.suffixOptionText}>{item}</Text></Pressable>)}</View>}
          <Pressable disabled={domainChecking} onPress={checkDomain} style={[s.check, domainChecking && s.checkDisabled]}><Text style={s.checkText}>{domainChecking ? 'Checking live price…' : 'Check availability'}</Text></Pressable>
          {!!domainError && <Text style={s.domainError}>{domainError}</Text>}
          {domainReady && domainQuote && <Animated.View style={s.domainResult}><Ionicons name="checkmark-circle" size={24} color={BRAND} /><View style={{ flex: 1 }}><Text style={s.domainName}>{domainQuote.domain}</Text><Text style={s.domainPrice}>Available — {domainQuote.priceLabel}</Text></View></Animated.View>}</>;
      }
      case 'plan': return paymentComplete ? <View style={s.paymentSuccess}><Ionicons name="checkmark-circle" size={48} color="#79D7A2" /><Text style={s.paymentSuccessTitle}>Your website is ready</Text><Text style={s.paymentSuccessText}>Payment is complete. Swipe up to open your BrightSite dashboard.</Text></View> : <><Intro>Your website is free. You only pay for hosting.</Intro>
        {domainReady && <View style={s.planDomain}><Ionicons name="globe-outline" size={15} color="#DDF8FF" /><Text style={s.planDomainText}>{domain}{suffix}</Text></View>}
        <Pressable onPress={() => setAnnual(false)} style={[s.plan, !annual && s.planOn]}><View><Text style={s.planName}>Monthly</Text><Text style={s.planNote}>Cancel any time</Text></View><Text style={s.planPrice}>£19<Text style={s.planSmall}>/month</Text></Text></Pressable>
        <Pressable onPress={() => setAnnual(true)} style={[s.plan, annual && s.planOn]}><View><Text style={s.save}>SAVE £24</Text><Text style={s.planName}>Annual</Text><Text style={s.planNote}>Billed £204 yearly</Text></View><Text style={s.planPrice}>£17<Text style={s.planSmall}>/month</Text></Text></Pressable>
        <Pressable onPress={() => setPaymentComplete(true)} style={s.payButton}><Ionicons name="lock-closed" size={16} color="#1B2226" /><Text style={s.payButtonText}>Continue to secure payment</Text></Pressable></>;
      case 'dashboard': return <><View style={s.dashHead}><View><Text style={s.live}>PUBLISHING</Text><Text style={s.dashTitle}>Your website is nearly live</Text></View>
        <Pressable style={s.editPill}><Ionicons name="create-outline" size={16} color="#DFF8FF" /><Text style={s.editPillText}>Edit</Text></Pressable></View>
        <View style={s.browser}><View style={s.browserBar}><View style={s.browserDot} /><View style={s.browserDot} /><View style={s.browserDot} /></View>
        <Image source={require('./assets/sisko-preview.webp')} resizeMode="cover" style={s.dashImage} /><View style={s.publishOverlay}><View style={s.spinner} /><Text style={s.publishText}>Publishing your website…</Text></View></View>
        <View style={s.tabs}>{['Account', 'Website', 'Messages'].map(x => <Pressable key={x} onPress={() => setTab(x)} style={[s.tab, tab === x && s.tabOn]}><Text style={[s.tabText, tab === x && s.tabTextOn]}>{x}</Text></Pressable>)}</View></>;
    }
  };

  if (index === 0) return <FlowBackdrop>
    <StatusBar style="dark" />
    <View style={s.loginStage}>
      <View style={[s.card, s.loginCard]}>
        <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.loginHeader}><Text style={s.cardTitle}>Welcome to BrightSite</Text><Image source={require('./assets/brightsite-icon.png')} style={s.loginAppIcon} /></View>
        <ScrollView contentContainerStyle={[s.content, s.loginContent]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          {content(steps[0])}
        </ScrollView>
      </View>
    </View>
  </FlowBackdrop>;

  if (index === steps.length - 1 && paymentComplete) return <DashboardHome tab={tab} setTab={setTab} data={data} domain={domain} suffix={suffix} palette={palette} font={font} template={template} onEdit={() => {
    const designIndex = steps.findIndex(item => item.id === 'design');
    setIndex(designIndex);
    motion.setValue(designIndex * CARD_TRAVEL);
  }} />;

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
            <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[s.cardHeader, deckStep.id === 'design' && s.designCardHeader]}><Text style={s.cardTitle}>{deckStep.title}</Text>{deckStep.id === 'design' && designReady ? <DesignTools active={tool} setActive={setTool} palette={palette} setPalette={setPalette} font={font} setFont={setFont} editing={editing} setEditing={setEditing} /> : deckIndex > 0 && deckStep.id !== 'dashboard' && <Text style={s.count}>{deckIndex}/10</Text>}</View>
            <ScrollView style={s.cardScroll} contentContainerStyle={[s.content, deckStep.id === 'login' && s.loginContent, deckStep.id === 'design' && { padding: 0 }, deckStep.id === 'hours' && s.hoursContent]}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
              {content(deckStep)}
            </ScrollView>
            {deckStep.id !== 'dashboard' && <View pointerEvents="none" style={s.fixedPrompt}>
              {!!validationMessage && isActive && <Text style={s.validationText}>{validationMessage}</Text>}
              <View style={s.swipeRow}>{deckStep.id === 'login' && (authBusy || authChecking) ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={14} color="rgba(255,255,255,.7)" />}<Text style={s.swipeHint}>{deckStep.id === 'login' ? authChecking ? 'Checking your account…' : authBusy ? authMode === 'signup' ? 'Creating your account…' : 'Logging you in…' : authMode === 'signup' ? 'Swipe up to create account' : 'Swipe up to log in' : deckStep.id === 'plan' ? 'Swipe up to continue to secure payment' : deckStep.id === 'design' ? designReady ? 'Swipe up to use this design' : 'Creating your design…' : 'Swipe up to save'}</Text></View>
            </View>}
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

const s = StyleSheet.create({
  backdropGlowTop: { position: 'absolute', width: '88%', height: '42%', top: '-9%', left: '-18%', borderRadius: 400, opacity: .86, overflow: 'hidden' }, backdropGlowBottom: { position: 'absolute', width: '94%', height: '46%', bottom: '-12%', right: '-24%', borderRadius: 440, opacity: .74, overflow: 'hidden' },
  stage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 72, paddingHorizontal: 18 },
  loginStage: { flex: 1, paddingTop: Platform.OS === 'ios' ? 54 : 28, paddingBottom: 20, paddingHorizontal: 18 }, loginCard: { flex: 1 },
  loginHeader: { minHeight: 78, paddingLeft: 26, paddingRight: 18, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, loginAppIcon: { width: 48, height: 48, borderRadius: 15, shadowColor: '#1C69E8', shadowOpacity: .28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  previousPeek: { position: 'absolute', top: -34, left: 34, right: 34, height: 98, borderRadius: 30, backgroundColor: 'rgba(8,18,28,.35)', shadowColor: '#18364A', shadowOpacity: .16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  previousCard: { position: 'absolute', zIndex: 1, top: -(SCREEN_HEIGHT - 216), left: 34, right: 34, height: SCREEN_HEIGHT - 126, borderRadius: 26, backgroundColor: 'rgba(8,18,28,.54)', shadowColor: '#020A10', shadowOpacity: .34, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, overflow: 'hidden' },
  card: { flex: 1, zIndex: 2, borderRadius: 30, backgroundColor: CARD, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)', shadowColor: '#000', shadowOpacity: .62, shadowRadius: 31, shadowOffset: { width: 0, height: 18 }, elevation: 18 },
  deckCard: { position: 'absolute', top: CARD_TOP, bottom: CARD_BOTTOM, left: 18, right: 18 },
  deckCardActive: { shadowColor: '#01070B', shadowOpacity: .7, shadowRadius: 38, shadowOffset: { width: 0, height: 22 }, elevation: 26 }, deckCardBehind: { shadowOpacity: .3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  cardHeader: { minHeight: 72, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, elevation: 100 }, designCardHeader: { minHeight: 64, paddingTop: 13, paddingBottom: 10, paddingRight: 14 },
  cardScroll: { flex: 1, zIndex: 1, elevation: 1, overflow: 'hidden' },
  cardTitle: { fontFamily: FONT, fontSize: 21, fontWeight: '700', letterSpacing: -.4, color: '#F3F8FC' }, count: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(220,238,248,.55)' },
  content: { padding: 24, paddingBottom: 76 }, loginContent: { flex: 1, paddingTop: 12, paddingBottom: 18 }, intro: { fontFamily: FONT, fontSize: 14, lineHeight: 21, color: 'rgba(225,239,248,.65)', marginBottom: 18 },
  fieldWrap: { marginBottom: 16 }, fieldLabel: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(223,239,248,.72)', marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 16, paddingHorizontal: 16, fontFamily: FONT, fontSize: 15, color: '#F7FCFF', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)', outlineWidth: 0 },
  inputMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
  nameDisplay: { marginTop: -3, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(226,242,250,.35)', backgroundColor: 'rgba(255,255,255,.06)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: BRAND, borderColor: BRAND },
  nameDisplayText: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(223,239,248,.68)' },
  button: { minHeight: 52, paddingHorizontal: 20, borderRadius: 18, backgroundColor: '#E5F9FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: BRAND, shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  buttonText: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#061824' }, secondaryButton: { backgroundColor: 'rgba(255,255,255,.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, pressed: { transform: [{ scale: .96 }], opacity: .86 },
  logo: { width: 52, height: 52, borderRadius: 18, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: BRAND, shadowOpacity: .35, shadowRadius: 20 },
  logoText: { fontFamily: FONT, fontSize: 29, fontWeight: '900', color: '#fff' }, logoDot: { position: 'absolute', width: 7, height: 7, borderRadius: 5, backgroundColor: '#fff', top: 8, right: 10 },
  heroTitle: { fontFamily: FONT, fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -.9, color: '#F7FBFE', marginBottom: 8 },
  authModes: { height: 42, padding: 4, borderRadius: 15, flexDirection: 'row', backgroundColor: 'rgba(15,18,21,.28)', marginBottom: 14 }, authMode: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, authModeOn: { backgroundColor: 'rgba(255,255,255,.9)' }, authModeText: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,.62)' }, authModeTextOn: { color: '#25292C' }, authStatus: { marginTop: -3, fontFamily: FONT, fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#FFE1B5', textAlign: 'center' },
  authSubmit: { height: 48, marginTop: 10, borderRadius: 16, backgroundColor: '#F6F2E9', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } }, authSubmitDisabled: { opacity: .62 }, authSubmitText: { fontFamily: FONT, fontSize: 14, fontWeight: '900', color: '#24282B' },
  rowsCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' }, hoursContent: { padding: 0 }, hoursIntro: { paddingHorizontal: 24, paddingTop: 24 }, hoursCard: { minHeight: SCREEN_HEIGHT * .57, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.045)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  hoursRow: { flex: 1, minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.14)' }, hoursRowLast: { borderBottomWidth: 0 }, hoursDay: { width: 43, fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#ECF6FA' }, hoursTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, timeInput: { width: 63, height: 34, borderRadius: 10, paddingHorizontal: 8, backgroundColor: 'transparent', color: '#F7FCFF', fontFamily: FONT, fontSize: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', outlineWidth: 0 }, timeInputOff: { width: 63, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, timeOffText: { fontFamily: FONT, color: 'rgba(235,243,247,.30)', fontSize: 13 }, timeDash: { fontFamily: FONT, fontSize: 13, color: 'rgba(220,236,245,.58)' }, hoursSwitch: { width: 52, alignItems: 'flex-end' }, closedText: { flex: 1, fontFamily: FONT, fontSize: 12, color: 'rgba(220,236,245,.48)' },
  toggleLabel: { fontFamily: FONT, fontSize: 14, fontWeight: '700', color: '#ECF6FA' }, toggleValue: { fontFamily: FONT, fontSize: 12, color: 'rgba(219,235,245,.55)', marginTop: 2 },
  inline: { flexDirection: 'row', gap: 10 }, uploadGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  upload: { flex: 1, minHeight: 130, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', overflow: 'hidden' }, uploadFill: { height: 188, padding: 0, flex: 0 },
  uploadPreview: { width: 52, height: 52, borderRadius: 15, marginBottom: 9 }, uploadPreviewFill: { width: '100%', height: '100%' },
  uploadIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,188,231,.12)', marginBottom: 10 },
  uploadTitle: { fontFamily: FONT, fontWeight: '800', fontSize: 14, color: '#F0F8FC' }, uploadSub: { fontFamily: FONT, fontSize: 11, color: 'rgba(222,238,247,.5)', marginTop: 3 },
  continue: { marginTop: 24, gap: 16 }, skip: { fontFamily: FONT, fontSize: 12, color: 'rgba(219,235,245,.5)', textAlign: 'center' }, loginSwipe: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, designSwipe: { paddingVertical: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, swipeHint: { fontFamily: FONT, fontSize: 12, fontWeight: '700', color: 'rgba(235,243,247,.76)', textAlign: 'center' },
  fixedPrompt: { position: 'absolute', left: 18, right: 18, bottom: 14, zIndex: 120, elevation: 120, alignItems: 'center', gap: 7 }, swipeRow: { minHeight: 31, paddingHorizontal: 13, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(25,29,33,.72)' }, validationText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: '#FFD1D1', textAlign: 'center', paddingHorizontal: 12 },
  serviceRow: { flexDirection: 'row', gap: 7, marginTop: 5, alignItems: 'center' }, serviceInput: { height: 48, borderRadius: 14, paddingHorizontal: 10, fontFamily: FONT, fontSize: 12, color: '#F7FCFF', backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.30)', outlineWidth: 0 }, serviceActions: { flexDirection: 'row', gap: 8 }, serviceDelete: { width: 28, height: 48, alignItems: 'center', justifyContent: 'center' }, sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,.14)', marginVertical: 16 }, addService: { marginTop: 13, height: 42, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(226,232,235,.42)', backgroundColor: 'rgba(255,255,255,.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, addSectionBtn: { marginTop: 8, borderColor: 'rgba(226,232,235,.2)', backgroundColor: 'transparent' }, addServiceText: { fontFamily: FONT, fontWeight: '800', fontSize: 12, color: '#F2F6F8' },
  loading: { position: 'absolute', inset: 0, minHeight: SCREEN_HEIGHT * .65, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44 }, loadingWordmark: { flexDirection: 'row', position: 'relative', marginBottom: 26 }, loadingBrand: { fontFamily: FONT, letterSpacing: 1.6, fontWeight: '900', fontSize: 17, color: '#F7FCFF' }, loadingBrandDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#4B9BFF', right: 32, top: -1 },
  loadingTitle: { fontFamily: FONT, fontSize: 25, lineHeight: 31, fontWeight: '800', color: '#F5FBFE', textAlign: 'center' }, loadingText: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: 'rgba(221,237,246,.58)', textAlign: 'center', marginTop: 10 }, loadingSteps: { alignSelf: 'stretch', gap: 10, marginTop: 27 }, loadingStep: { flexDirection: 'row', alignItems: 'center', gap: 9, opacity: .36 }, loadingStepOn: { opacity: 1 }, loadingStepText: { fontFamily: FONT, fontSize: 12, color: 'rgba(222,238,247,.6)' }, loadingStepTextOn: { color: '#EAF9FE', fontWeight: '700' },
  track: { width: '100%', height: 5, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.1)', marginTop: 28, overflow: 'hidden' }, fill: { height: 5, backgroundColor: BRAND, borderRadius: 5 },
  design: { minHeight: SCREEN_HEIGHT * .76, position: 'relative' }, designPreview: { minHeight: SCREEN_HEIGHT * .76 }, site: { overflow: 'hidden', minHeight: SCREEN_HEIGHT * .76 }, previewBrowser: { height: 29, paddingHorizontal: 11, backgroundColor: 'rgba(8,15,20,.9)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, previewDots: { position: 'absolute', left: 11, flexDirection: 'row', gap: 4 }, previewDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.35)' }, previewAddress: { fontFamily: FONT, fontSize: 8, color: 'rgba(255,255,255,.54)' }, siteHero: { height: SCREEN_HEIGHT * .49, padding: 20, justifyContent: 'space-between' },
  siteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, siteKicker: { fontFamily: FONT, fontSize: 12, letterSpacing: 3, fontWeight: '700', color: '#fff' }, siteNav: { flexDirection: 'row', alignItems: 'center', gap: 10 }, siteNavText: { fontFamily: FONT, fontSize: 7, letterSpacing: .7, color: 'rgba(255,255,255,.78)' }, siteCopy: { maxWidth: '76%' },
  siteHeadline: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 30, lineHeight: 34, color: '#fff', marginBottom: 10 }, rounded: { fontFamily: FONT, fontWeight: '800', letterSpacing: -1 }, modern: { fontFamily: FONT, fontWeight: '400', letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 24 },
  siteBody: { fontFamily: FONT, fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,.76)' }, editing: { borderWidth: 1, borderColor: BRAND, borderRadius: 5, padding: 3 },
  siteCta: { marginTop: 15, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1 }, siteCtaText: { fontFamily: FONT, fontSize: 8, fontWeight: '800', letterSpacing: 1.4, color: '#fff' },
  siteSection: { minHeight: 170, padding: 22 }, siteSectionTitle: { fontFamily: Platform.select({ ios: 'Didot', android: 'serif' }), fontSize: 22, marginBottom: 8 }, siteSectionBody: { fontFamily: FONT, fontSize: 11, lineHeight: 17, opacity: .68, maxWidth: '78%' },
  swatches: { flexDirection: 'row', marginTop: 18, gap: 7 }, swatch: { width: 24, height: 24, borderRadius: 12 }, tutorial: { position: 'absolute', left: 24, right: 24, top: '33%', borderRadius: 27, overflow: 'hidden', padding: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.4)' },
  tutorialTitle: { fontFamily: FONT, fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 8 }, tutorialBody: { fontFamily: FONT, fontSize: 11, lineHeight: 16, color: 'rgba(255,255,255,.65)', textAlign: 'center', marginTop: 5 },
  gotIt: { marginTop: 16, minWidth: 118, paddingVertical: 10, borderRadius: 99, backgroundColor: 'rgba(222,247,255,.88)', alignItems: 'center' }, gotItText: { fontFamily: FONT, fontWeight: '800', color: '#123042' },
  templateDots: { position: 'absolute', bottom: 13, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 }, templateDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.35)' }, templateDotOn: { width: 21, backgroundColor: '#fff' },
  tools: { position: 'relative', zIndex: 30, alignItems: 'flex-end' }, toolStack: { gap: 6, alignItems: 'center', flexDirection: 'row' },
  toolButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(240,250,255,.72)', borderWidth: 1, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#207EA0', shadowOpacity: .18, shadowRadius: 12 }, toolActive: { backgroundColor: BRAND, shadowOpacity: .34, shadowRadius: 20 }, toolButtonText: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: '#fff' },
  toolPanel: { position: 'absolute', top: 49, right: 0, width: 142, maxHeight: 370, padding: 12, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: '#fff', shadowColor: '#174E66', shadowOpacity: .18, shadowRadius: 18, zIndex: 200, elevation: 200 }, paletteWrap: { gap: 5 }, paletteScroll: { maxHeight: 274 }, paletteGroup: { paddingBottom: 12 }, paletteHeading: { paddingTop: 5, paddingBottom: 4 }, paletteHeadingText: { fontFamily: FONT, fontSize: 10, fontWeight: '900', letterSpacing: .8, color: '#345568', textTransform: 'uppercase' },
  toolTitle: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#28495B', textAlign: 'center', marginBottom: 9 }, option: { minHeight: 39, borderRadius: 16, paddingHorizontal: 9, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' },
  dot: { width: 20, height: 20, borderRadius: 10 }, selected: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.12)' }, fontOption: { paddingVertical: 10, borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(66,104,125,.15)' }, fontOptionText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', textAlign: 'center', color: '#345568' },
  sectionOption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(66,104,125,.18)' }, sectionText: { flex: 1, fontFamily: FONT, fontSize: 10, color: '#345568' },
  domainSearch: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' }, domainInput: { flex: 1, minHeight: 54, paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: '#fff', outlineWidth: 0 }, suffixButton: { height: 54, paddingLeft: 8, paddingRight: 13, flexDirection: 'row', alignItems: 'center', gap: 3 }, domainSuffix: { fontFamily: FONT, fontSize: 16, fontWeight: '800', color: '#E5EBEE' }, suffixes: { flexDirection: 'row', gap: 6, marginTop: 9 }, suffixOption: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)' }, suffixOptionOn: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,.16)' }, suffixOptionText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#F0F5F7' },
  check: { marginTop: 12, paddingVertical: 15, borderRadius: 17, alignItems: 'center', backgroundColor: 'rgba(34,188,231,.15)', borderWidth: 1, borderColor: 'rgba(34,188,231,.35)' }, checkText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#DDF8FF' },
  checkDisabled: { opacity: .58 }, domainError: { marginTop: 10, fontFamily: FONT, fontSize: 12, lineHeight: 17, color: '#FFB6B6' }, domainResult: { marginTop: 14, padding: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(34,188,231,.09)', borderWidth: 1, borderColor: 'rgba(34,188,231,.3)' }, domainName: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#F0FBFF' }, domainPrice: { fontFamily: FONT, fontSize: 11, color: '#76D8F2', marginTop: 2 },
  formChoice: { padding: 17, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, formChoiceOn: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.1)' }, formChoiceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,188,231,.14)' }, formChoiceTitle: { fontFamily: FONT, fontSize: 15, fontWeight: '800', color: '#F3FAFD' }, formChoiceText: { fontFamily: FONT, fontSize: 11, color: 'rgba(220,236,245,.58)', marginTop: 3, lineHeight: 16 }, formNote: { fontFamily: FONT, fontSize: 12, color: 'rgba(220,236,245,.52)', textAlign: 'center', marginTop: 18 },
  planHeading: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#EAF8FD', marginTop: 25, marginBottom: 10 }, plan: { minHeight: 118, padding: 18, borderRadius: 23, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.11)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, planOn: { borderColor: BRAND, backgroundColor: 'rgba(34,188,231,.1)' },
  planName: { fontFamily: FONT, fontSize: 18, fontWeight: '800', color: '#F3FAFD' }, planNote: { fontFamily: FONT, fontSize: 11, color: 'rgba(220,236,245,.55)', marginTop: 4 }, planPrice: { fontFamily: FONT, fontSize: 25, fontWeight: '900', color: '#F5FCFF' }, planSmall: { fontSize: 10 }, save: { fontFamily: FONT, fontSize: 8, fontWeight: '900', color: '#07202B', backgroundColor: BRAND, padding: 5, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
  secure: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 18 }, secureText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#DDF7FF' },
  summary: { padding: 17, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)', marginBottom: 20 }, summaryLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }, summaryLabel: { fontFamily: FONT, fontSize: 12, color: 'rgba(221,237,246,.65)' }, summaryValue: { fontFamily: FONT, fontSize: 12, fontWeight: '800', color: '#F0F8FC' },
  total: { marginTop: 7, paddingTop: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.16)' }, totalLabel: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#fff' }, totalValue: { fontFamily: FONT, fontSize: 18, fontWeight: '900', color: BRAND },
  dashHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }, live: { fontFamily: FONT, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: BRAND, marginBottom: 7 }, dashTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#F2FAFD' }, editPill: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,.08)' }, editPillText: { fontFamily: FONT, fontSize: 11, fontWeight: '800', color: '#DFF8FF' },
  browser: { height: 390, borderRadius: 23, overflow: 'hidden', backgroundColor: '#0D1721' }, browserBar: { height: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1C2A37' }, browserDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.32)' }, dashImage: { width: '100%', height: '100%' },
  publishOverlay: { position: 'absolute', left: 0, right: 0, top: 32, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,14,20,.62)' }, spinner: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,.18)', borderTopColor: BRAND, marginBottom: 13 }, publishText: { fontFamily: FONT, fontSize: 13, fontWeight: '800', color: '#F0FAFD' },
  tabs: { marginTop: 18, padding: 5, borderRadius: 18, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.06)' }, tab: { flex: 1, paddingVertical: 11, borderRadius: 14, alignItems: 'center' }, tabOn: { backgroundColor: 'rgba(34,188,231,.18)' }, tabText: { fontFamily: FONT, fontSize: 11, fontWeight: '700', color: 'rgba(222,238,247,.5)' }, tabTextOn: { color: '#DFF9FF' },
  nextPeek: { position: 'absolute', zIndex: 1, bottom: -(SCREEN_HEIGHT - 126) + 90, left: 34, right: 34, height: SCREEN_HEIGHT - 126, borderRadius: 26, backgroundColor: 'rgba(8,18,28,.54)', shadowColor: '#020A10', shadowOpacity: .34, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, overflow: 'hidden' },
  nextPeekTap: { paddingHorizontal: 22, paddingTop: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nextLabel: { fontFamily: FONT, fontSize: 8, fontWeight: '900', color: BRAND, marginTop: 5 }, nextTitle: { flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#EFF9FC' },
  rail: { position: 'absolute', left: 8, top: '25%', bottom: '25%', justifyContent: 'space-between', alignItems: 'center', zIndex: 140, elevation: 140 }, railHidden: { opacity: 0 }, railButton: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, railNear: { width: 18, height: 18, borderRadius: 9 }, railFar: { width: 18, height: 18, borderRadius: 9 }, railDone: {}, railActive: { position: 'absolute', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4B9BFF', borderWidth: 0, shadowColor: '#4B9BFF', shadowOpacity: .45, shadowRadius: 8, elevation: 8 }, railDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A1E22', borderWidth: 1, borderColor: 'rgba(0,0,0,.32)', shadowColor: '#000', shadowOpacity: .2, shadowRadius: 2 }, railDotOn: { backgroundColor: '#4B9BFF', borderColor: '#A9C8FF', shadowColor: '#4B9BFF', shadowOpacity: .45, shadowRadius: 5 },
  reviewCard: { marginBottom: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.12)' },
  addReviewBtn: { height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(226,232,235,.42)', backgroundColor: 'rgba(255,255,255,.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 },
  addReviewText: { fontFamily: FONT, fontWeight: '800', fontSize: 12, color: '#F2F6F8' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  galleryItem: { width: (SCREEN_WIDTH - 96) / 2, height: (SCREEN_WIDTH - 96) / 2, borderRadius: 14, overflow: 'hidden' },
  galleryThumb: { width: '100%', height: '100%' },
  galleryAdd: { width: (SCREEN_WIDTH - 96) / 2, height: (SCREEN_WIDTH - 96) / 2, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.25)', alignItems: 'center', justifyContent: 'center' },
  planDomain: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14, borderRadius: 14, backgroundColor: 'rgba(34,188,231,.1)', borderWidth: 1, borderColor: 'rgba(34,188,231,.28)', marginBottom: 16 },
  planDomainText: { fontFamily: FONT, fontSize: 14, fontWeight: '800', color: '#DDF8FF' },
  paymentSuccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  paymentSuccessTitle: { fontFamily: FONT, fontSize: 22, fontWeight: '800', color: '#F5FCFF', textAlign: 'center' },
  paymentSuccessText: { fontFamily: FONT, fontSize: 13, lineHeight: 19, color: 'rgba(221,237,246,.62)', textAlign: 'center' },
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
});
