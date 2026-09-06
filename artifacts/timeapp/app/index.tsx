import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

type ClockState = {
  employeeName: string;
  running: boolean;
  startedAt: number | null;
  todaySeconds: number;
};

type Palette = ReturnType<typeof useColors>;

const STORAGE_KEY = 'timeapp-clock-state';

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours} Std. ${minutes.toString().padStart(2, '0')} Min.`;
}

function BrandMark({ colors, compact = false }: { colors: Palette; compact?: boolean }) {
  return (
    <View style={compact ? [styles.mark, styles.markCompact, { backgroundColor: colors.brandMid }] : [styles.mark, { backgroundColor: colors.brandMid }]}>
      <View style={[styles.markFace, compact && styles.markFaceCompact, { borderColor: colors.white }]}>
        <View style={[styles.markHandHour, { backgroundColor: colors.white }]} />
        <View style={[styles.markHandMinute, { backgroundColor: colors.success }]} />
        <View style={[styles.markDot, { backgroundColor: colors.success }]} />
      </View>
    </View>
  );
}

function IconInput({
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  showPassword,
  onTogglePassword,
  focused,
  onFocus,
  onBlur,
  colors,
  keyboardType,
}: {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  colors: Palette;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View
      style={[
        styles.inputShell,
        {
          backgroundColor: colors.surface,
          borderColor: focused ? colors.primary : colors.border,
        },
      ]}
    >
      <Feather name={icon} size={19} color={focused ? colors.primary : colors.mutedForeground} />
      <TextInput
        testID={`timeapp-input-${icon}`}
        style={[styles.input, { color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType={secureTextEntry ? 'done' : 'next'}
      />
      {onTogglePassword ? (
        <Pressable
          testID="timeapp-toggle-password"
          hitSlop={12}
          onPress={onTogglePassword}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={19} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LoginScreen({
  onLogin,
  colors,
}: {
  onLogin: (name: string) => void;
  colors: Palette;
}) {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState('');

  const submit = () => {
    Keyboard.dismiss();
    if (!identifier.trim() || !password.trim()) {
      setError('Bitte E-Mail oder Mitarbeiter-ID und Passwort eingeben.');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onLogin(identifier.toLowerCase().includes('max') ? 'Max Mustermann' : 'Anna Müller');
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      bottomOffset={32}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.loginHero, { backgroundColor: colors.brandDeep, paddingTop: insets.top + 28 }]}>
        <View style={styles.heroGlow} />
        <BrandMark colors={colors} />
        <Text style={styles.wordmark}>TIMEAPP</Text>
        <Text style={[styles.heroSubtitle, { color: '#C5D8D8' }]}>Arbeitszeit. Einfach im Blick.</Text>
      </View>

      <View style={styles.loginContent}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>MITARBEITER-PORTAL</Text>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Mitarbeiter-Anmeldung</Text>
        <Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>
          Melden Sie sich an, um Ihre Arbeitszeit zu erfassen.
        </Text>

        <View style={styles.form}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>E-Mail oder Mitarbeiter-ID</Text>
          <IconInput
            icon="user"
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setError('');
            }}
            placeholder="z. B. anna.mueller@firma.de"
            focused={focused === 'identifier'}
            onFocus={() => setFocused('identifier')}
            onBlur={() => setFocused(null)}
            colors={colors}
            keyboardType="email-address"
          />

          <View style={styles.labelRow}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Passwort</Text>
            <Pressable
              testID="timeapp-forgot-password"
              onPress={() => Alert.alert('Passwort vergessen?', 'Wenden Sie sich bitte an Ihre Personalabteilung, um Ihr Passwort zurückzusetzen.')}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>Passwort vergessen?</Text>
            </Pressable>
          </View>
          <IconInput
            icon="lock"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError('');
            }}
            placeholder="Ihr Passwort"
            focused={focused === 'password'}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            colors={colors}
            secureTextEntry={!showPassword}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((current) => !current)}
          />

          {error ? (
            <View style={[styles.errorRow, { backgroundColor: colors.dangerSoft }]}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            testID="timeapp-login"
            accessibilityRole="button"
            accessibilityLabel="Anmelden"
            onPress={submit}
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Text style={styles.loginButtonText}>ANMELDEN</Text>
            <Feather name="arrow-right" size={19} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.securityNote}>
          <Feather name="shield" size={16} color={colors.mutedForeground} />
          <Text style={[styles.securityText, { color: colors.mutedForeground }]}>
            Sicherer Zugang für Mitarbeitende
          </Text>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function DashboardScreen({
  employeeName,
  onLogout,
  colors,
}: {
  employeeName: string;
  onLogout: () => void;
  colors: Palette;
}) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(7 * 3600 + 42 * 60);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const saved = JSON.parse(stored) as ClockState;
          setRunning(saved.running);
          setStartedAt(saved.startedAt);
          setTodaySeconds(saved.todaySeconds);
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: ClockState = { employeeName, running, startedAt, todaySeconds };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [employeeName, hydrated, running, startedAt, todaySeconds]);

  const activeSeconds = running && startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
  const displayedSeconds = todaySeconds + activeSeconds;
  const greeting = now.getHours() < 12 ? 'Guten Morgen' : now.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';

  const startWork = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStartedAt(Date.now());
    setRunning(true);
  };

  const stopWork = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTodaySeconds((current) => current + activeSeconds);
    setStartedAt(null);
    setRunning(false);
    Alert.alert('Arbeitszeit beendet', `Heute erfasst: ${formatDuration(displayedSeconds)}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.dashboardHeader, { backgroundColor: colors.brandDeep, paddingTop: insets.top + 18 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <BrandMark colors={colors} compact />
            <Text style={styles.headerWordmark}>TIMEAPP</Text>
          </View>
          <Pressable
            testID="timeapp-logout"
            onPress={onLogout}
            hitSlop={10}
            style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Abmelden"
          >
            <Feather name="log-out" size={18} color="#D5E3E3" />
          </Pressable>
        </View>
        <Text style={styles.greeting}>{greeting},</Text>
        <Text style={styles.employeeName}>{employeeName}</Text>
        <View style={styles.headerDateRow}>
          <Feather name="calendar" size={14} color="#AFC6C6" />
          <Text style={styles.headerDate}>{formatDate(now)}</Text>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.dashboardScroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        bottomOffset={24}
      >
        <View style={styles.timeCard}>
          <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>AKTUELLE UHRZEIT</Text>
          <Text style={[styles.currentTime, { color: colors.foreground }]}>{formatTime(now)}</Text>
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: running ? colors.success : colors.mutedForeground }]} />
            <Text style={[styles.liveLabel, { color: running ? colors.success : colors.mutedForeground }]}>
              {running ? 'Arbeitszeit läuft' : 'Noch nicht eingestempelt'}
            </Text>
          </View>
        </View>

        <View style={styles.actionGroup}>
          <Pressable
            testID="timeapp-start-work"
            accessibilityRole="button"
            accessibilityLabel="Arbeit starten"
            disabled={running}
            onPress={startWork}
            style={({ pressed }) => [
              styles.clockButton,
              { backgroundColor: colors.success, opacity: running ? 0.45 : pressed ? 0.82 : 1 },
            ]}
          >
            <View style={styles.buttonIconCircle}>
              <Feather name="play" size={20} color={colors.success} />
            </View>
            <View style={styles.buttonCopy}>
              <Text style={styles.clockButtonTitle}>ARBEIT STARTEN</Text>
              <Text style={styles.clockButtonCaption}>Arbeitszeit beginnt jetzt</Text>
            </View>
            <Feather name="chevron-right" size={22} color="#D7F2E3" />
          </Pressable>

          <Pressable
            testID="timeapp-stop-work"
            accessibilityRole="button"
            accessibilityLabel="Arbeit beenden"
            disabled={!running}
            onPress={stopWork}
            style={({ pressed }) => [
              styles.clockButton,
              { backgroundColor: colors.danger, opacity: !running ? 0.45 : pressed ? 0.82 : 1 },
            ]}
          >
            <View style={styles.buttonIconCircle}>
              <Feather name="square" size={17} color={colors.danger} />
            </View>
            <View style={styles.buttonCopy}>
              <Text style={styles.clockButtonTitle}>ARBEIT BEENDEN</Text>
              <Text style={styles.clockButtonCaption}>Arbeitszeit jetzt stoppen</Text>
            </View>
            <Feather name="chevron-right" size={22} color="#F7D9D9" />
          </Pressable>
        </View>

        <View style={[styles.hoursCard, { backgroundColor: colors.surface }]}>
          <View style={styles.hoursCardHeader}>
            <View>
              <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>DEIN ARBEITSTAG</Text>
              <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Heutige Arbeitszeit</Text>
            </View>
            <View style={[styles.hoursIcon, { backgroundColor: colors.successSoft }]}>
              <Feather name="clock" size={20} color={colors.success} />
            </View>
          </View>
          <Text style={[styles.hoursValue, { color: colors.foreground }]}>{formatDuration(displayedSeconds)}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.success, width: `${Math.min(100, (displayedSeconds / (8 * 3600)) * 100)}%` }]} />
          </View>
          <View style={styles.hoursMeta}>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Zielzeit 8 Std.</Text>
            <Text style={[styles.metaText, { color: colors.success }]}>{Math.max(0, 8 * 3600 - displayedSeconds) > 0 ? 'Im Plan' : 'Ziel erreicht'}</Text>
          </View>
        </View>

        <View style={styles.footerNote}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Änderungen werden automatisch gespeichert.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

export default function TimeAppScreen() {
  const colors = useColors();
  const [loggedIn, setLoggedIn] = useState(false);
  const [employeeName, setEmployeeName] = useState('Anna Müller');

  const content = useMemo(
    () =>
      loggedIn ? (
        <DashboardScreen
          employeeName={employeeName}
          onLogout={() => setLoggedIn(false)}
          colors={colors}
        />
      ) : (
        <LoginScreen
          onLogin={(name) => {
            setEmployeeName(name);
            setLoggedIn(true);
          }}
          colors={colors}
        />
      ),
    [colors, employeeName, loggedIn],
  );

  return content;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loginHero: {
    minHeight: 286,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#1C5660',
    opacity: 0.48,
    top: -112,
    right: -86,
  },
  mark: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  markCompact: {
    width: 34,
    height: 34,
    borderRadius: 11,
    marginBottom: 0,
  },
  markFace: {
    width: 39,
    height: 39,
    borderRadius: 20,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markFaceCompact: {
    width: 19,
    height: 19,
    borderWidth: 1.5,
  },
  markHandHour: {
    position: 'absolute',
    width: 2.5,
    height: 10,
    borderRadius: 2,
    top: 9,
  },
  markHandMinute: {
    position: 'absolute',
    width: 2.5,
    height: 13,
    borderRadius: 2,
    transform: [{ rotate: '55deg' }],
    top: 7,
  },
  markDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  wordmark: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 4.2,
  },
  heroSubtitle: {
    marginTop: 9,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  loginContent: {
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  pageTitle: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  pageIntro: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
  },
  form: {
    marginTop: 28,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  forgotText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputShell: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  loginButton: {
    height: 57,
    borderRadius: 15,
    paddingHorizontal: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 26,
  },
  securityText: {
    fontSize: 12,
  },
  dashboardHeader: {
    paddingHorizontal: 22,
    paddingBottom: 25,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 29,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerWordmark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4853',
  },
  greeting: {
    color: '#AFC6C6',
    fontSize: 14,
    fontWeight: '500',
  },
  employeeName: {
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 2,
  },
  headerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 13,
  },
  headerDate: {
    color: '#AFC6C6',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  dashboardScroll: {
    flex: 1,
  },
  timeCard: {
    marginHorizontal: 22,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  cardEyebrow: {
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  currentTime: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 6,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionGroup: {
    paddingHorizontal: 22,
    gap: 12,
    marginTop: 18,
  },
  clockButton: {
    minHeight: 78,
    borderRadius: 17,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  buttonIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCopy: {
    flex: 1,
  },
  clockButtonTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.75,
  },
  clockButtonCaption: {
    color: '#D7E8E1',
    fontSize: 11,
    marginTop: 4,
  },
  hoursCard: {
    marginHorizontal: 22,
    marginTop: 21,
    borderRadius: 18,
    padding: 20,
  },
  hoursCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hoursTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 5,
  },
  hoursIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursValue: {
    fontSize: 29,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 25,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 17,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  hoursMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 22,
  },
  footerText: {
    fontSize: 11,
  },
});