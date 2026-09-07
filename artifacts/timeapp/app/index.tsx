import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth, useSignIn, useSignUp } from '@clerk/expo';
import {
  getGetTimeAppHistoryQueryKey,
  getGetTimeAppMeQueryKey,
  useGetTimeAppHistory,
  useGetTimeAppMe,
  useStartTimeAppBreak,
  useStartTimeAppWork,
  useStopTimeAppBreak,
  useStopTimeAppWork,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
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

type Palette = ReturnType<typeof useColors>;

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

function LoginScreen({ colors }: { colors: Palette }) {
  const insets = useSafeAreaInsets();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [verificationSent, setVerificationSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    Keyboard.dismiss();
    if (!identifier.trim() || !password.trim()) {
      setError('Bitte E-Mail-Adresse und Passwort eingeben.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (mode === 'signup') {
        const result = await signUp.password({
          emailAddress: identifier.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message || 'Die Registrierung konnte nicht gestartet werden.');
          return;
        }
        await signUp.verifications.sendEmailCode();
        setVerificationSent(true);
      } else {
        const result = await signIn.password({
          emailAddress: identifier.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message || 'E-Mail-Adresse oder Passwort ist nicht korrekt.');
          return;
        }
        if (signIn.status === 'complete') {
          await signIn.finalize({ navigate: () => undefined });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setError('Für dieses Konto ist eine zusätzliche Bestätigung erforderlich.');
        }
      }
    } catch {
      setError('Die Anmeldung ist momentan nicht möglich. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  };

  const verifySignup = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: verificationCode });
      if (result.error) {
        setError(result.error.message || 'Der Bestätigungscode ist nicht korrekt.');
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize({ navigate: () => undefined });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setError('Der Bestätigungscode konnte nicht geprüft werden.');
    } finally {
      setLoading(false);
    }
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
         <Text style={[styles.pageTitle, { color: colors.foreground }]}>
           {mode === 'login' ? 'Mitarbeiter-Anmeldung' : 'Mitarbeiterkonto erstellen'}
         </Text>
        <Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>
           {mode === 'login'
             ? 'Melden Sie sich an, um Ihre Arbeitszeit zu erfassen.'
             : 'Erstellen Sie ein persönliches Konto für TIMEAPP.'}
        </Text>

        <View style={styles.form}>
           <Text style={[styles.fieldLabel, { color: colors.foreground }]}>E-Mail-Adresse</Text>
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

           {mode === 'login' ? <View style={styles.labelRow}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Passwort</Text>
            <Pressable
              testID="timeapp-forgot-password"
               onPress={() => Alert.alert('Passwort vergessen?', 'Bitte nutzen Sie die Passwort-Wiederherstellung in Ihrem Clerk-Konto oder wenden Sie sich an Ihre Personalabteilung.')}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>Passwort vergessen?</Text>
            </Pressable>
           </View> : <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 18 }]}>Passwort</Text>}
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

           {verificationSent ? (
             <>
               <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 18 }]}>Bestätigungscode</Text>
               <IconInput
                 icon="check-circle"
                 value={verificationCode}
                 onChangeText={setVerificationCode}
                 placeholder="Code aus Ihrer E-Mail"
                 focused={focused === 'code'}
                 onFocus={() => setFocused('code')}
                 onBlur={() => setFocused(null)}
                 colors={colors}
                 keyboardType="default"
               />
             </>
           ) : null}

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
             onPress={verificationSent ? verifySignup : submit}
             disabled={loading}
            style={({ pressed }) => [
              styles.loginButton,
               { backgroundColor: colors.primary, opacity: loading ? 0.55 : pressed ? 0.82 : 1 },
            ]}
          >
             <Text style={styles.loginButtonText}>
               {verificationSent ? 'CODE BESTÄTIGEN' : mode === 'login' ? 'ANMELDEN' : 'REGISTRIEREN'}
             </Text>
             <Feather name={verificationSent ? 'check' : 'arrow-right'} size={19} color={colors.white} />
          </Pressable>
        </View>

         <Pressable
           onPress={() => {
             setMode(mode === 'login' ? 'signup' : 'login');
             setVerificationSent(false);
             setError('');
           }}
           style={styles.authSwitch}
         >
           <Text style={[styles.authSwitchText, { color: colors.mutedForeground }]}>
             {mode === 'login' ? 'Noch kein Konto?' : 'Bereits registriert?'}{' '}
           </Text>
           <Text style={[styles.authSwitchLink, { color: colors.primary }]}>
             {mode === 'login' ? 'Konto erstellen' : 'Anmelden'}
           </Text>
         </Pressable>

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
  const queryClient = useQueryClient();
  const dashboard = useGetTimeAppMe({
    query: { queryKey: getGetTimeAppMeQueryKey(), refetchInterval: 15_000 },
  });
  const history = useGetTimeAppHistory(undefined, {
    query: { queryKey: getGetTimeAppHistoryQueryKey(), refetchInterval: 60_000 },
  });
  const startWorkMutation = useStartTimeAppWork();
  const stopWorkMutation = useStopTimeAppWork();
  const startBreakMutation = useStartTimeAppBreak();
  const stopBreakMutation = useStopTimeAppBreak();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = dashboard.data?.clock;
  const running = clock?.status === 'on_duty' || clock?.status === 'on_break';
  const onBreak = clock?.status === 'on_break';
  const displayedSeconds = clock?.todayNetSeconds ?? 0;
  const greeting = now.getHours() < 12 ? 'Guten Morgen' : now.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetTimeAppMeQueryKey() });
    void queryClient.invalidateQueries({ queryKey: history.queryKey });
  };

  const showMutationError = () => {
    Alert.alert('Aktion nicht möglich', 'Der Zeitstatus konnte nicht gespeichert werden. Bitte erneut versuchen.');
  };

  const startWork = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startWorkMutation.mutate(undefined, {
      onSuccess: refresh,
      onError: showMutationError,
    });
  };

  const stopWork = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopWorkMutation.mutate(undefined, {
      onSuccess: (result) => {
        refresh();
        Alert.alert('Arbeitszeit beendet', `Heute erfasst: ${formatDuration(result.clock.todayNetSeconds)}`);
      },
      onError: showMutationError,
    });
  };

  const toggleBreak = () => {
    const mutation = onBreak ? stopBreakMutation : startBreakMutation;
    mutation.mutate(undefined, {
      onSuccess: refresh,
      onError: showMutationError,
    });
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
         <Text style={styles.employeeName}>{employeeName || 'Mitarbeiter'}</Text>
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
               {onBreak ? 'Pause läuft' : running ? 'Arbeitszeit läuft' : 'Noch nicht eingestempelt'}
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

           {running ? (
             <Pressable
               testID="timeapp-toggle-break"
               accessibilityRole="button"
               accessibilityLabel={onBreak ? 'Pause beenden' : 'Pause starten'}
               onPress={toggleBreak}
               style={({ pressed }) => [
                 styles.clockButton,
                 { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
               ]}
             >
               <View style={styles.buttonIconCircle}>
                 <Feather name={onBreak ? 'play' : 'pause'} size={18} color={colors.primary} />
               </View>
               <View style={styles.buttonCopy}>
                 <Text style={styles.clockButtonTitle}>{onBreak ? 'PAUSE BEENDEN' : 'PAUSE STARTEN'}</Text>
                 <Text style={styles.clockButtonCaption}>{onBreak ? 'Arbeitszeit fortsetzen' : 'Pause jetzt erfassen'}</Text>
               </View>
               <Feather name="chevron-right" size={22} color="#D7F2E3" />
             </Pressable>
           ) : null}
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

        <View style={[styles.hoursCard, { backgroundColor: colors.surface }]}>
          <View style={styles.hoursCardHeader}>
            <View>
              <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>AUSWERTUNG</Text>
              <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Woche & Monat</Text>
            </View>
            <Feather name="bar-chart-2" size={22} color={colors.primary} />
          </View>
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Diese Woche</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                {formatDuration(dashboard.data?.week.totalWorkSeconds ?? 0)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Dieser Monat</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                {formatDuration(dashboard.data?.month.totalWorkSeconds ?? 0)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.historyCard, { backgroundColor: colors.surface }]}>
          <View style={styles.hoursCardHeader}>
            <View>
              <Text style={[styles.cardEyebrow, { color: colors.mutedForeground }]}>VERLAUF</Text>
              <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Letzte Arbeitstage</Text>
            </View>
            <Feather name="list" size={21} color={colors.primary} />
          </View>
          {(history.data?.entries ?? []).slice(0, 5).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <View style={styles.historyRowCopy}>
                <Text style={[styles.historyDate, { color: colors.foreground }]}>
                  {new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(entry.date))}
                </Text>
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.startedAt))}
                  {' – '}
                  {entry.endedAt ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.endedAt)) : 'läuft'}
                </Text>
              </View>
              <Text style={[styles.historyDuration, { color: colors.primary }]}>{formatDuration(entry.netSeconds)}</Text>
            </View>
          ))}
          {(history.data?.entries ?? []).length === 0 ? (
            <Text style={[styles.emptyHistory, { color: colors.mutedForeground }]}>Noch keine Arbeitstage erfasst.</Text>
          ) : null}
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
  const { isSignedIn, signOut } = useAuth();
  const dashboard = useGetTimeAppMe({
    query: { queryKey: getGetTimeAppMeQueryKey(), enabled: Boolean(isSignedIn) },
  });
  const employeeName = dashboard.data?.employee.displayName ?? '';

  const content = useMemo(
    () =>
      isSignedIn ? (
        <DashboardScreen
          employeeName={employeeName}
          onLogout={() => void signOut()}
          colors={colors}
        />
      ) : (
        <LoginScreen colors={colors} />
      ),
    [colors, employeeName, isSignedIn, signOut],
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
  authSwitch: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  authSwitchText: {
    fontSize: 12,
  },
  authSwitchLink: {
    fontSize: 12,
    fontWeight: '700',
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  summaryDivider: {
    width: 1,
    height: 42,
    backgroundColor: '#D9E1E4',
  },
  historyCard: {
    marginHorizontal: 22,
    marginTop: 21,
    borderRadius: 18,
    padding: 20,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3F3',
  },
  historyRowCopy: {
    gap: 4,
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  historyDuration: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHistory: {
    fontSize: 12,
    marginTop: 18,
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