import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/expo';
import {
  getGetTimeAppHistoryQueryKey,
  getGetTimeAppCompanyMemberScheduleQueryKey,
  getGetTimeAppScheduleQueryKey,
  getGetTimeAppLeaveRequestsQueryKey,
  getGetTimeAppCompanyLeaveRequestsQueryKey,
  getGetTimeAppMeQueryKey,
  getGetTimeAppCompanyMembersQueryKey,
  getGetTimeAppCompanyReportsQueryKey,
  getGetTimeAppBillingPlansQueryKey,
  resolveTimeAppEmployeeIdentifier,
  useCreateTimeAppBillingCheckout,
  useCreateTimeAppBillingPortal,
  useCreateTimeAppCompany,
  useCreateTimeAppCompanyMember,
  useDeleteTimeAppCompanyMember,
  useGetTimeAppBillingPlans,
  useGetTimeAppCompanyMembers,
  useGetTimeAppCompanyReports,
  useGetTimeAppHistory,
  useGetTimeAppSchedule,
  useGetTimeAppLeaveRequests,
  useGetTimeAppCompanyLeaveRequests,
  useGetTimeAppCompanyMemberSchedule,
  useGetTimeAppMe,
  useResetTimeAppCompanyMemberTemporaryPassword,
  useStartTimeAppBreak,
  useStartTimeAppWork,
  useStopTimeAppBreak,
  useStopTimeAppWork,
  useUpdateTimeAppCompanyMemberStatus,
  useUpdateTimeAppCompanyMemberSchedule,
  useCreateTimeAppLeaveRequest,
  useReviewTimeAppCompanyLeaveRequest,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
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
import { billingActionForSubscription } from '@/lib/billingAction';
import { validatePasswordChange } from '@/lib/passwordChange';

type Palette = ReturnType<typeof useColors>;
type ScheduleDayForm = {
  weekday: number;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  isVacation: boolean;
  absenceType: 'vacation' | 'sick' | null;
};
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function weekTitle(weekStart?: string | Date) {
  if (!weekStart) return 'Aktuelle Kalenderwoche';
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const format = (date: Date) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date);
  return `${format(start)} – ${format(end)}`;
}

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

function shortDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${value}T12:00:00.000Z`));
}

const LEAVE_STATUS = {
  pending: { label: 'Ausstehend', color: 'warning' },
  approved: { label: 'Genehmigt', color: 'success' },
  rejected: { label: 'Abgelehnt', color: 'danger' },
} as const;

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

function LoginScreen({ colors, onOwnerCreated }: { colors: Palette; onOwnerCreated: () => void }) {
  const insets = useSafeAreaInsets();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [identifier, setIdentifier] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'employee' | 'owner-login' | 'owner-signup'>('employee');
  const [verificationSent, setVerificationSent] = useState(false);
  const [loginVerificationSent, setLoginVerificationSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    Keyboard.dismiss();
    const ownerMode = mode !== 'employee';
    if ((!ownerMode && (!companyCode.trim() || !employeeId.trim())) || (ownerMode && !identifier.trim()) || !password.trim()) {
      setError(ownerMode ? 'Bitte E-Mail-Adresse und Passwort eingeben.' : 'Bitte Firmen-Code, Mitarbeiter-ID und Passwort eingeben.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (mode === 'owner-signup') {
        if (!companyName.trim()) {
          setError('Bitte den Firmennamen angeben.');
          return;
        }
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
        const loginIdentifier =
          mode === 'employee'
            ? (
                await resolveTimeAppEmployeeIdentifier({
                  companyCode: companyCode.trim(),
                  employeeId: employeeId.trim(),
                })
              ).identifier
            : undefined;
        const result = await signIn.password({
          ...(mode === 'employee'
            ? { identifier: loginIdentifier! }
            : { emailAddress: identifier.trim() }),
          password,
        });
        if (result.error) {
          setError(result.error.message || 'E-Mail-Adresse oder Passwort ist nicht korrekt.');
          return;
        }
        if (signIn.status === 'complete') {
          await signIn.finalize({ navigate: () => undefined });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (signIn.status === 'needs_client_trust') {
          const currentSignIn = clerk.client.signIn;
          const emailFactor = currentSignIn.supportedSecondFactors?.find(
            (factor) => factor.strategy === 'email_code',
          );
          if (!emailFactor || !('emailAddressId' in emailFactor)) {
            setError('Für dieses Konto ist keine E-Mail-Bestätigung verfügbar.');
            return;
          }
          await currentSignIn.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setLoginVerificationSent(true);
        } else {
          setError('Für dieses Konto ist eine zusätzliche Bestätigung erforderlich.');
        }
      }
    } catch {
      setError(
        mode === 'employee'
          ? 'Firmenname oder Firmen-Code, Mitarbeiter-ID und Passwort prüfen.'
          : 'Die Anmeldung ist momentan nicht möglich. Bitte erneut versuchen.',
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await clerk.client.signIn.attemptSecondFactor({
        strategy: 'email_code',
        code: verificationCode,
      });
      if (result.status !== 'complete' || !result.createdSessionId) {
        setError('Der Bestätigungscode ist nicht korrekt.');
        return;
      }
      await clerk.setActive({ session: result.createdSessionId });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Der Bestätigungscode konnte nicht geprüft werden.');
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
        onOwnerCreated();
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
        <Text style={styles.wordmark}>ZEITAPP</Text>
        <Text style={[styles.heroSubtitle, { color: '#C5D8D8' }]}>Arbeitszeit. Einfach im Blick.</Text>
      </View>

      <View style={styles.loginContent}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>MITARBEITER-PORTAL</Text>
         <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            {mode === 'employee' ? 'Mitarbeiter-Anmeldung' : mode === 'owner-login' ? 'Inhaber-Anmeldung' : 'Firmenkonto erstellen'}
         </Text>
        <Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>
            {mode === 'employee'
             ? 'Melden Sie sich an, um Ihre Arbeitszeit zu erfassen.'
              : mode === 'owner-login' ? 'Melden Sie sich mit Ihrer E-Mail-Adresse an.' : 'Erstellen Sie Ihr Inhaberkonto und richten Sie Ihre Firma ein.'}
        </Text>

        <View style={styles.form}>
            {mode === 'employee' ? <>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Firmenname oder Firmen-Code</Text>
              <IconInput icon="briefcase" value={companyCode} onChangeText={setCompanyCode} placeholder="z. B. Vobusoft oder ZA-ABC123" focused={focused === 'company'} onFocus={() => setFocused('company')} onBlur={() => setFocused(null)} colors={colors} />
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 18 }]}>Mitarbeiter-ID</Text>
              <IconInput icon="user" value={employeeId} onChangeText={setEmployeeId} placeholder="z. B. EMP-ABC123" focused={focused === 'employee'} onFocus={() => setFocused('employee')} onBlur={() => setFocused(null)} colors={colors} />
            </> : <>
            {mode === 'owner-signup' ? <>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Firmenname</Text>
              <IconInput icon="briefcase" value={companyName} onChangeText={setCompanyName} placeholder="Ihre Firma" focused={focused === 'companyName'} onFocus={() => setFocused('companyName')} onBlur={() => setFocused(null)} colors={colors} />
            </> : null}
            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: mode === 'owner-signup' ? 18 : 0 }]}>E-Mail-Adresse</Text>
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
            /></>}

            {mode !== 'owner-signup' ? <View style={styles.labelRow}>
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

            {verificationSent || loginVerificationSent ? (
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
             onPress={verificationSent ? verifySignup : loginVerificationSent ? verifyLogin : submit}
             disabled={loading}
            style={({ pressed }) => [
              styles.loginButton,
               { backgroundColor: colors.primary, opacity: loading ? 0.55 : pressed ? 0.82 : 1 },
            ]}
          >
             <Text style={styles.loginButtonText}>
                 {verificationSent || loginVerificationSent ? 'CODE BESTÄTIGEN' : mode === 'owner-signup' ? 'KONTO ERSTELLEN' : 'ANMELDEN'}
             </Text>
              <Feather name={verificationSent || loginVerificationSent ? 'check' : 'arrow-right'} size={19} color={colors.white} />
          </Pressable>
        </View>

         <Pressable
            onPress={() => {
              setMode(mode === 'employee' ? 'owner-login' : 'employee');
             setVerificationSent(false);
              setLoginVerificationSent(false);
             setError('');
           }}
           style={styles.authSwitch}
         >
           <Text style={[styles.authSwitchText, { color: colors.mutedForeground }]}>
              {mode === 'employee' ? 'Firmeninhaber?' : 'Mitarbeiter?'}{' '}
           </Text>
           <Text style={[styles.authSwitchLink, { color: colors.primary }]}>
              {mode === 'employee' ? 'Inhaber anmelden' : 'Mitarbeiter anmelden'}
           </Text>
         </Pressable>
          {mode !== 'employee' ? <Pressable onPress={() => { setMode(mode === 'owner-login' ? 'owner-signup' : 'owner-login'); setVerificationSent(false); setLoginVerificationSent(false); setError(''); }} style={styles.authSwitch}>
            <Text style={[styles.authSwitchText, { color: colors.mutedForeground }]}>{mode === 'owner-login' ? 'Neue Firma?' : 'Bereits Inhaber?'}</Text>
            <Text style={[styles.authSwitchLink, { color: colors.primary }]}>{mode === 'owner-login' ? ' Firmenkonto erstellen' : ' Anmelden'}</Text>
          </Pressable> : null}

        <View style={styles.securityNote}>
          <Feather name="shield" size={16} color={colors.mutedForeground} />
          <Text style={[styles.securityText, { color: colors.mutedForeground }]}>
             Sicherer Zugang für Mitarbeitende und Inhaber
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
  role,
  hasActiveSubscription,
  hasTeamAccess,
  isDevelopmentMode,
}: {
  employeeName: string;
  onLogout: () => void;
  colors: Palette;
  role: 'owner' | 'manager' | 'employee';
  hasActiveSubscription: boolean;
  hasTeamAccess: boolean;
  isDevelopmentMode: boolean;
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
            <Text style={styles.headerWordmark}>ZEITAPP</Text>
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
        {isDevelopmentMode ? <View style={[styles.subscriptionNotice, { backgroundColor: colors.successSoft }]}><Feather name="tool" size={17} color={colors.primary} /><Text style={[styles.errorText, { color: colors.primary }]}>Development-Modus: Team-Funktionen sind in dieser Preview ohne aktives Firmenabo freigeschaltet.</Text></View> : null}
        {!hasTeamAccess ? <View style={[styles.subscriptionNotice, { backgroundColor: colors.dangerSoft }]}><Feather name="alert-triangle" size={17} color={colors.danger} /><Text style={[styles.errorText, { color: colors.danger }]}>{role === 'owner' ? 'Das Firmenabo ist nicht aktiv. Wählen Sie unten einen Tarif, um ZEITAPP für Ihr Team freizuschalten.' : 'Das Firmenabo ist nicht aktiv. Bitte wenden Sie sich an den Firmeninhaber.'}</Text></View> : null}
        {role === 'owner' && !hasTeamAccess ? null : <>
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

        {role !== 'owner' ? <WeeklyScheduleViewer colors={colors} /> : null}
        {role !== 'owner' ? <LeaveRequestPanel colors={colors} /> : null}
        {role !== 'owner' ? <PasswordChangePanel colors={colors} /> : null}

        <View style={styles.footerNote}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Änderungen werden automatisch gespeichert.
          </Text>
        </View>
        </>}
        {role === 'owner' || role === 'manager' ? <ManagementPanel role={role} colors={colors} hasActiveSubscription={hasActiveSubscription} hasTeamAccess={hasTeamAccess} /> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function ScheduleDays({ days, colors, editable, onChange }: {
  days: ScheduleDayForm[];
  colors: Palette;
  editable?: boolean;
  onChange?: (days: ScheduleDayForm[]) => void;
}) {
  const changeDay = (index: number, patch: Partial<ScheduleDayForm>) => {
    onChange?.(days.map((day, current) => current === index ? { ...day, ...patch } : day));
  };
  return <View style={styles.scheduleDays}>
    {days.map((day, index) => <View key={day.weekday} style={[styles.scheduleDay, { borderColor: colors.border }]}>
      <View style={styles.scheduleDayTop}>
        <Text style={[styles.historyDate, { color: colors.foreground }]}>{WEEKDAYS[index]}</Text>
        {day.absenceType ? <Text style={[styles.scheduleStatus, { color: day.absenceType === 'sick' ? colors.danger : colors.primary }]}>{day.absenceType === 'sick' ? 'KRANK' : 'URLAUB'}</Text> : editable ? <Pressable
          onPress={() => changeDay(index, day.isWorking
            ? { isWorking: false, startTime: null, endTime: null, breakMinutes: 0 }
            : { isWorking: true, startTime: '08:00', endTime: '16:30', breakMinutes: 30 })}
          style={[styles.scheduleToggle, { backgroundColor: day.isWorking ? colors.successSoft : colors.surfaceAlt }]}
        ><Text style={[styles.metaText, { color: day.isWorking ? colors.primary : colors.mutedForeground }]}>{day.isWorking ? 'ARBEIT' : 'FREI'}</Text></Pressable>
          : <Text style={[styles.scheduleStatus, { color: day.isWorking ? colors.success : colors.mutedForeground }]}>{day.isWorking ? 'Arbeit' : 'Frei'}</Text>}
      </View>
      {day.absenceType ? <Text style={[styles.metaText, { color: day.absenceType === 'sick' ? colors.danger : colors.primary }]}>{day.absenceType === 'sick' ? 'Krankmeldung · keine Arbeitszeit' : 'Genehmigter Urlaub · keine Arbeitszeit'}</Text> : day.isWorking ? editable ? <View style={styles.scheduleInputs}>
        <TextInput value={day.startTime ?? ''} onChangeText={(value) => changeDay(index, { startTime: value })} placeholder="08:00" placeholderTextColor={colors.mutedForeground} style={[styles.scheduleInput, { borderColor: colors.border, color: colors.foreground }]} />
        <Text style={{ color: colors.mutedForeground }}>–</Text>
        <TextInput value={day.endTime ?? ''} onChangeText={(value) => changeDay(index, { endTime: value })} placeholder="16:30" placeholderTextColor={colors.mutedForeground} style={[styles.scheduleInput, { borderColor: colors.border, color: colors.foreground }]} />
        <TextInput value={String(day.breakMinutes)} onChangeText={(value) => changeDay(index, { breakMinutes: Number(value.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" placeholder="30" placeholderTextColor={colors.mutedForeground} style={[styles.scheduleBreakInput, { borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Min. Pause</Text>
      </View> : <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{day.startTime} – {day.endTime}{day.breakMinutes ? ` · ${day.breakMinutes} Min. Pause` : ''}</Text> : null}
    </View>)}
  </View>;
}

function LeaveRequestPanel({ colors }: { colors: Palette }) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [description, setDescription] = useState('');
  const [absenceType, setAbsenceType] = useState<'vacation' | 'sick'>('vacation');
  const queryClient = useQueryClient();
  const requests = useGetTimeAppLeaveRequests({
    query: {
      queryKey: getGetTimeAppLeaveRequestsQueryKey(),
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    },
  });
  const create = useCreateTimeAppLeaveRequest();
  const submit = () => {
    create.mutate({ data: { startDate, endDate, type: absenceType, description: description.trim() || undefined } }, {
      onSuccess: () => {
        setDescription('');
        void queryClient.invalidateQueries({ queryKey: getGetTimeAppLeaveRequestsQueryKey() });
        Alert.alert(absenceType === 'sick' ? 'Krankmeldung gesendet' : 'Urlaubsantrag gesendet', 'Die Abwesenheit wurde zur Prüfung eingereicht.');
      },
      onError: (error) => {
        const apiError = (error as { data?: { error?: string } })?.data?.error;
        Alert.alert('Antrag nicht möglich', apiError ?? 'Der Urlaubsantrag konnte nicht erstellt werden.');
      },
    });
  };
  return <View style={[styles.hoursCard, { backgroundColor: colors.surface }]}>
    <View style={styles.hoursCardHeader}>
      <View><Text style={[styles.cardEyebrow, { color: colors.primary }]}>URLAUB & ABWESENHEIT</Text><Text style={[styles.hoursTitle, { color: colors.foreground }]}>{absenceType === 'sick' ? 'Krank melden' : 'Urlaub beantragen'}</Text></View>
      <Feather name="sun" size={22} color={colors.primary} />
    </View>
    <View style={styles.rolePicker}>
      <Pressable onPress={() => setAbsenceType('vacation')} style={[styles.roleOption, { borderColor: absenceType === 'vacation' ? colors.primary : colors.border, backgroundColor: absenceType === 'vacation' ? colors.successSoft : colors.surface }]}><Text style={[styles.metaText, { color: absenceType === 'vacation' ? colors.primary : colors.mutedForeground }]}>URLAUB</Text></Pressable>
      <Pressable onPress={() => setAbsenceType('sick')} style={[styles.roleOption, { borderColor: absenceType === 'sick' ? colors.danger : colors.border, backgroundColor: absenceType === 'sick' ? colors.dangerSoft : colors.surface }]}><Text style={[styles.metaText, { color: absenceType === 'sick' ? colors.danger : colors.mutedForeground }]}>KRANK MELDEN</Text></Pressable>
    </View>
    <View style={styles.leaveDateRow}>
      <View style={styles.leaveDateField}><Text style={[styles.metaText, { color: colors.mutedForeground }]}>VON</Text><TextInput {...(Platform.OS === 'web' ? { type: 'date' } as never : {})} value={startDate} onChangeText={setStartDate} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mutedForeground} style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]} /></View>
      <View style={styles.leaveDateField}><Text style={[styles.metaText, { color: colors.mutedForeground }]}>BIS</Text><TextInput {...(Platform.OS === 'web' ? { type: 'date' } as never : {})} value={endDate} onChangeText={setEndDate} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.mutedForeground} style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]} /></View>
    </View>
    <TextInput value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="Optionale Beschreibung" placeholderTextColor={colors.mutedForeground} style={[styles.leaveDescription, { borderColor: colors.border, color: colors.foreground }]} />
    <Pressable disabled={create.isPending} onPress={submit} style={[styles.smallButton, { backgroundColor: absenceType === 'sick' ? colors.danger : colors.primary, opacity: create.isPending ? 0.6 : 1 }]}><Text style={styles.loginButtonText}>{create.isPending ? 'WIRD GESENDET …' : absenceType === 'sick' ? 'KRANKMELDUNG SENDEN' : 'URLAUB BEANTRAGEN'}</Text></Pressable>
    <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 18 }]}>MEINE ABWESENHEITEN</Text>
    {(requests.data?.requests ?? []).map((request) => {
      const status = request.type === 'sick' && request.status === 'approved'
        ? { label: 'Bestätigt', color: 'success' as const }
        : LEAVE_STATUS[request.status];
      const statusColor = status.color === 'success' ? colors.success : status.color === 'danger' ? colors.danger : colors.primary;
      return <View key={request.id} style={[styles.leaveRequestRow, { borderColor: colors.border }]}>
        <View style={styles.memberCopy}><Text style={[styles.historyDate, { color: colors.foreground }]}>{request.type === 'sick' ? 'KRANK' : 'URLAUB'} · {shortDate(request.startDate)} – {shortDate(request.endDate)}</Text><Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.description || 'Keine Beschreibung'}</Text></View>
        <View style={[styles.leaveStatusPill, { backgroundColor: `${statusColor}1A` }]}><Text style={[styles.metaText, { color: statusColor }]}>{status.label}</Text></View>
      </View>;
    })}
    {!requests.isLoading && (requests.data?.requests.length ?? 0) === 0 ? <Text style={[styles.emptyHistory, { color: colors.mutedForeground }]}>Noch keine Urlaubsanträge vorhanden.</Text> : null}
  </View>;
}

function LeaveRequestManagement({ colors }: { colors: Palette }) {
  const queryClient = useQueryClient();
  const requests = useGetTimeAppCompanyLeaveRequests({
    query: {
      queryKey: getGetTimeAppCompanyLeaveRequestsQueryKey(),
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    },
  });
  const review = useReviewTimeAppCompanyLeaveRequest();
  const pending = (requests.data?.requests ?? []).filter((request) => request.status === 'pending');
  const decide = (requestId: number, status: 'approved' | 'rejected') => {
    review.mutate({ requestId, data: { status } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTimeAppCompanyLeaveRequestsQueryKey() });
        void queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).includes('/schedule'),
        });
      },
      onError: (error) => {
        const apiError = (error as { data?: { error?: string } })?.data?.error;
        Alert.alert('Entscheidung nicht möglich', apiError ?? 'Der Antrag konnte nicht bearbeitet werden.');
      },
    });
  };
  return <View style={[styles.scheduleEditor, { borderColor: colors.border }]}>
    {pending.map((request) => <View key={request.id} style={[styles.leaveAdminRow, { borderColor: colors.border }]}>
      <Text style={[styles.historyDate, { color: colors.foreground }]}>{request.displayName} · {request.type === 'sick' ? 'KRANK' : 'URLAUB'}</Text>
      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{request.employeeId} · {shortDate(request.startDate)} – {shortDate(request.endDate)}</Text>
      {request.description ? <Text style={[styles.metaText, { color: colors.foreground, marginTop: 4 }]}>{request.description}</Text> : null}
      <View style={styles.leaveActions}>
        <Pressable disabled={review.isPending} onPress={() => decide(request.id, 'approved')} style={[styles.leaveAction, { backgroundColor: colors.successSoft }]}><Text style={[styles.metaText, { color: colors.success }]}>{request.type === 'sick' ? 'BESTÄTIGEN' : 'GENEHMIGEN'}</Text></Pressable>
        <Pressable disabled={review.isPending} onPress={() => decide(request.id, 'rejected')} style={[styles.leaveAction, { backgroundColor: colors.dangerSoft }]}><Text style={[styles.metaText, { color: colors.danger }]}>ABLEHNEN</Text></Pressable>
      </View>
    </View>)}
    {!requests.isLoading && pending.length === 0 ? <Text style={[styles.emptyHistory, { color: colors.mutedForeground }]}>Keine ausstehenden Urlaubsanträge.</Text> : null}
  </View>;
}

function WeeklyScheduleViewer({ colors }: { colors: Palette }) {
  const schedule = useGetTimeAppSchedule(undefined, { query: { queryKey: getGetTimeAppScheduleQueryKey(), refetchInterval: 10_000, refetchOnWindowFocus: true } });
  return <View style={[styles.hoursCard, { backgroundColor: colors.surface }]}>
    <View style={styles.hoursCardHeader}>
      <View><Text style={[styles.cardEyebrow, { color: colors.primary }]}>WOCHENPLAN</Text><Text style={[styles.hoursTitle, { color: colors.foreground }]}>{weekTitle(schedule.data?.weekStart)}</Text></View>
      <Feather name="calendar" size={22} color={colors.primary} />
    </View>
    {schedule.isError ? <Text style={[styles.inlineError, { color: colors.danger }]}>Der Wochenplan konnte nicht geladen werden.</Text>
      : schedule.data ? <ScheduleDays days={schedule.data.days as ScheduleDayForm[]} colors={colors} />
        : <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Wochenplan wird geladen …</Text>}
  </View>;
}

function WeeklyScheduleEditor({ role, members, colors }: {
  role: 'owner' | 'manager';
  members: Array<{ userId: string; displayName: string; role: string }>;
  colors: Palette;
}) {
  const eligible = members.filter((member) => member.role !== 'owner' && (role === 'owner' || member.role === 'employee'));
  const [selectedUserId, setSelectedUserId] = useState('');
  const [days, setDays] = useState<ScheduleDayForm[]>([]);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!eligible.some((member) => member.userId === selectedUserId)) setSelectedUserId(eligible[0]?.userId ?? '');
  }, [eligible, selectedUserId]);
  const schedule = useGetTimeAppCompanyMemberSchedule(selectedUserId, { query: { queryKey: getGetTimeAppCompanyMemberScheduleQueryKey(selectedUserId), enabled: Boolean(selectedUserId) } });
  const update = useUpdateTimeAppCompanyMemberSchedule();
  useEffect(() => {
    if (schedule.data) setDays(schedule.data.days as ScheduleDayForm[]);
  }, [schedule.data]);
  const save = () => {
    if (!selectedUserId || !schedule.data) return;
    update.mutate({ userId: selectedUserId, data: { weekStart: schedule.data.weekStart, days } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetTimeAppCompanyMemberScheduleQueryKey(selectedUserId) });
        Alert.alert('Wochenplan gespeichert', 'Der Mitarbeiter sieht die Änderung automatisch.');
      },
      onError: (error) => {
        const apiError = (error as { data?: { error?: string } })?.data?.error;
        Alert.alert('Nicht möglich', apiError ?? 'Der Wochenplan konnte nicht gespeichert werden.');
      },
    });
  };
  return <View style={[styles.scheduleEditor, { borderColor: colors.border }]}>
    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>MITARBEITER AUSWÄHLEN</Text>
    <View style={styles.scheduleMemberPicker}>
      {eligible.map((member) => <Pressable key={member.userId} onPress={() => setSelectedUserId(member.userId)} style={[styles.scheduleMemberOption, { borderColor: selectedUserId === member.userId ? colors.primary : colors.border, backgroundColor: selectedUserId === member.userId ? colors.successSoft : colors.surface }]}>
        <Text style={[styles.metaText, { color: selectedUserId === member.userId ? colors.primary : colors.mutedForeground }]}>{member.displayName}</Text>
      </Pressable>)}
    </View>
    {schedule.data && days.length === 7 ? <>
      <Text style={[styles.hoursTitle, { color: colors.foreground, marginTop: 14 }]}>{weekTitle(schedule.data.weekStart)}</Text>
      <ScheduleDays days={days} colors={colors} editable onChange={setDays} />
      <Pressable disabled={update.isPending} onPress={save} style={[styles.smallButton, { backgroundColor: colors.primary, opacity: update.isPending ? 0.6 : 1 }]}><Text style={styles.loginButtonText}>{update.isPending ? 'WIRD GESPEICHERT …' : 'WOCHENPLAN SPEICHERN'}</Text></Pressable>
    </> : <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 12 }]}>{eligible.length ? 'Wochenplan wird geladen …' : 'Keine verwaltbaren Mitarbeiter vorhanden.'}</Text>}
  </View>;
}

function clerkPasswordError(error: unknown) {
  const errors = (error as { errors?: Array<{ longMessage?: string; message?: string; code?: string }> })?.errors;
  const first = errors?.[0];
  if (first?.code === 'form_password_incorrect') {
    return 'Das aktuelle Passwort ist nicht korrekt.';
  }
  return first?.longMessage || first?.message || 'Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.';
}

function PasswordChangePanel({ colors }: { colors: Palette }) {
  const { user } = useUser();
  const [expanded, setExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const validationError = validatePasswordChange(currentPassword, newPassword, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!user) {
      setError('Das Clerk-Benutzerkonto ist noch nicht geladen.');
      return;
    }

    setPending(true);
    setError('');
    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: true,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setExpanded(false);
      Alert.alert('Passwort geändert', 'Ihr neues Passwort wurde sicher bei Clerk gespeichert.');
    } catch (changeError) {
      setError(clerkPasswordError(changeError));
    } finally {
      setPending(false);
    }
  };

  return <View style={[styles.passwordCard, { backgroundColor: colors.surface }]}>
    <View style={styles.passwordCardHeader}>
      <View style={[styles.hoursIcon, { backgroundColor: colors.successSoft }]}>
        <Feather name="lock" size={19} color={colors.primary} />
      </View>
      <View style={styles.passwordCardCopy}>
        <Text style={[styles.cardEyebrow, { color: colors.primary }]}>SICHERHEIT</Text>
        <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Passwort ändern</Text>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Ändern Sie Ihr temporäres Passwort in ein persönliches Passwort.</Text>
      </View>
    </View>
    {!expanded ? <Pressable
      testID="zeitapp-open-password-change"
      accessibilityRole="button"
      onPress={() => setExpanded(true)}
      style={[styles.smallButton, { backgroundColor: colors.primary }]}
    >
      <Text style={styles.loginButtonText}>PASSWORT ÄNDERN</Text>
    </Pressable> : <>
      <TextInput
        testID="zeitapp-current-password"
        style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]}
        placeholder="Aktuelles Passwort"
        placeholderTextColor={colors.mutedForeground}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        testID="zeitapp-new-password"
        style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]}
        placeholder="Neues Passwort (mind. 15 Zeichen)"
        placeholderTextColor={colors.mutedForeground}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        testID="zeitapp-confirm-password"
        style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]}
        placeholder="Neues Passwort wiederholen"
        placeholderTextColor={colors.mutedForeground}
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        autoCapitalize="none"
      />
      {error ? <Text style={[styles.inlineError, { color: colors.danger }]}>{error}</Text> : null}
      <View style={styles.passwordActions}>
        <Pressable
          disabled={pending}
          onPress={() => { setExpanded(false); setError(''); }}
          style={[styles.passwordSecondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>ABBRECHEN</Text>
        </Pressable>
        <Pressable
          testID="zeitapp-submit-password-change"
          disabled={pending}
          onPress={() => void submit()}
          style={[styles.passwordPrimaryButton, { backgroundColor: colors.primary, opacity: pending ? 0.6 : 1 }]}
        >
          <Text style={styles.loginButtonText}>{pending ? 'WIRD GESPEICHERT …' : 'SICHER SPEICHERN'}</Text>
        </Pressable>
      </View>
    </>}
  </View>;
}

function OwnerOnboarding({ colors, onComplete }: { colors: Palette; onComplete: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const createCompany = useCreateTimeAppCompany();
  const submit = () => {
    if (!name.trim()) {
      setError('Bitte den Firmennamen angeben.');
      return;
    }
    createCompany.mutate({ data: { name: name.trim() } }, {
      onSuccess: onComplete,
      onError: (mutationError) => {
        const apiData = (mutationError as { data?: { error?: unknown } }).data;
        const apiMessage = typeof apiData?.error === 'string' ? apiData.error : null;
        setError(apiMessage ?? 'Die Firma konnte nicht eingerichtet werden. Bitte erneut versuchen.');
      },
    });
  };
  return <KeyboardAwareScrollViewCompat style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.centerContent}>
    <BrandMark colors={colors} />
    <Text style={[styles.pageTitle, { color: colors.foreground }]}>Firma einrichten</Text>
    <Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>Fast geschafft: Geben Sie Ihrer Firma einen Namen. Ihren Firmen-Code erstellt ZEITAPP automatisch.</Text>
    <View style={styles.form}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Firmenname</Text>
      <IconInput icon="briefcase" value={name} onChangeText={setName} placeholder="Ihre Firma" focused={focused} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} colors={colors} />
      {error ? <Text style={[styles.inlineError, { color: colors.danger }]}>{error}</Text> : null}
      <Pressable testID="zeitapp-create-company" onPress={submit} disabled={createCompany.isPending} style={[styles.loginButton, { backgroundColor: colors.primary, opacity: createCompany.isPending ? .6 : 1 }]}><Text style={styles.loginButtonText}>FIRMA ERSTELLEN</Text><Feather name="arrow-right" size={19} color={colors.white} /></Pressable>
    </View>
  </KeyboardAwareScrollViewCompat>;
}

function ManagementPanel({ role, colors, hasActiveSubscription, hasTeamAccess }: { role: 'owner' | 'manager'; colors: Palette; hasActiveSubscription: boolean; hasTeamAccess: boolean }) {
  const queryClient = useQueryClient();
  const members = useGetTimeAppCompanyMembers({ query: { queryKey: getGetTimeAppCompanyMembersQueryKey() } });
  const reports = useGetTimeAppCompanyReports({ period: 'week' }, { query: { queryKey: getGetTimeAppCompanyReportsQueryKey({ period: 'week' }) } });
  const plans = useGetTimeAppBillingPlans({ query: { queryKey: getGetTimeAppBillingPlansQueryKey(), enabled: role === 'owner' } });
  const createMember = useCreateTimeAppCompanyMember();
  const resetTemporaryPassword = useResetTimeAppCompanyMemberTemporaryPassword();
  const updateMember = useUpdateTimeAppCompanyMemberStatus();
  const deleteMember = useDeleteTimeAppCompanyMember();
  const checkout = useCreateTimeAppBillingCheckout();
  const portal = useCreateTimeAppBillingPortal();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'employee' | 'manager'>('employee');
  const [createdCredentials, setCreatedCredentials] = useState<{
    companyCode: string;
    member: { employeeId: string };
    temporaryPassword: string;
  } | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetTimeAppCompanyMembersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetTimeAppCompanyReportsQueryKey({ period: 'week' }) });
  };
  const openUrl = async (url: string | null) => {
    if (!url) { Alert.alert('Nicht verfügbar', 'Es konnte keine Zahlungsseite erstellt werden.'); return; }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(url);
      return;
    }
    if (!(await Linking.canOpenURL(url))) {
      Alert.alert('Nicht verfügbar', 'Die Zahlungsseite konnte nicht geöffnet werden.');
      return;
    }
    await Linking.openURL(url);
  };
  const browserReturnUrl = (result: 'success' | 'cancel') =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/timeapp/?checkout=${result}`
      : undefined;
  const showBillingError = (error: unknown, fallback: string) => {
    const data = (error as { data?: { error?: unknown } })?.data;
    Alert.alert('Nicht möglich', typeof data?.error === 'string' ? data.error : fallback);
  };
  const startCheckout = (priceId: string) => {
    checkout.mutate({
      data: {
        priceId,
        successUrl: browserReturnUrl('success'),
        cancelUrl: browserReturnUrl('cancel'),
      },
    }, {
      onSuccess: (result) => void openUrl(result.url),
      onError: (error) => showBillingError(error, 'Checkout konnte nicht gestartet werden.'),
    });
  };
  const manageBilling = () => {
    if (billingActionForSubscription(hasActiveSubscription) === 'checkout') {
      const plan = plans.data?.plans?.[0];
      if (!plan) {
        Alert.alert('Tarif nicht verfügbar', 'Der ZeitApp Firmenabo-Tarif konnte nicht geladen werden. Bitte versuchen Sie es erneut.');
        return;
      }
      startCheckout(plan.priceId);
      return;
    }
    portal.mutate({
      data: { returnUrl: browserReturnUrl('success') },
    }, {
      onSuccess: (result) => void openUrl(result.url),
      onError: (error) => showBillingError(error, 'Kundenportal konnte nicht geöffnet werden.'),
    });
  };
  const billingPending = checkout.isPending || portal.isPending;
  const showCredentials = (result: { companyCode: string; member: { employeeId: string }; temporaryPassword: string }) => {
    setCreatedCredentials(result);
    Alert.alert(
      'Temporäre Zugangsdaten',
      `Firmen-Code: ${result.companyCode}\nMitarbeiter-ID: ${result.member.employeeId}\nTemporäres Passwort: ${result.temporaryPassword}\n\nDie Zugangsdaten werden zusätzlich direkt im Formular angezeigt.`,
    );
  };
  const resetPassword = (member: { userId: string; displayName: string }) => {
    Alert.alert(
      'Temporäres Passwort zurücksetzen?',
      `Für ${member.displayName} wird ein neues temporäres Passwort erstellt. Das bisherige Passwort funktioniert danach nicht mehr.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Zurücksetzen',
          onPress: () => resetTemporaryPassword.mutate(
            { userId: member.userId },
            {
              onSuccess: showCredentials,
              onError: () => Alert.alert('Nicht möglich', 'Das temporäre Passwort konnte nicht zurückgesetzt werden.'),
            },
          ),
        },
      ],
    );
  };
  return <View style={styles.adminWrap}>
    {hasTeamAccess ? <View style={[styles.hoursCard, { backgroundColor: colors.surface, marginHorizontal: 0 }]}>
      <Text style={[styles.cardEyebrow, { color: colors.primary }]}>VERWALTUNG</Text>
      <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Team & Berichte</Text>
      {members.isError || reports.isError ? <Text style={[styles.inlineError, { color: colors.danger }]}>Teamdaten konnten nicht geladen werden. Bitte aktualisieren Sie die Seite.</Text> : null}
      <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 14 }]}>MITGLIEDER</Text>
      {(members.data?.members ?? []).map((member) => <View key={member.userId} style={styles.memberRow}>
        <View style={styles.memberCopy}><Text style={[styles.historyDate, { color: colors.foreground }]}>{member.displayName}</Text><Text style={[styles.metaText, { color: colors.mutedForeground }]}>{member.employeeId} · {member.role} · {member.status}</Text></View>
        {member.role !== 'owner' ? <View style={styles.memberActions}>
          {(role === 'owner' || member.role === 'employee') ? <Pressable accessibilityRole="button" accessibilityLabel={`Temporäres Passwort für ${member.displayName} zurücksetzen`} disabled={resetTemporaryPassword.isPending} onPress={() => resetPassword(member)}><Feather name="key" size={18} color={colors.primary} /></Pressable> : null}
          <Pressable onPress={() => updateMember.mutate({ userId: member.userId, data: { active: member.status !== 'active' } }, { onSuccess: refresh })}><Feather name={member.status === 'active' ? 'pause-circle' : 'play-circle'} size={19} color={colors.primary} /></Pressable>
          <Pressable onPress={() => Alert.alert('Mitglied löschen?', `${member.displayName} und alle Zeitdaten werden gelöscht.`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: () => deleteMember.mutate({ userId: member.userId }, { onSuccess: refresh }) }])}><Feather name="trash-2" size={18} color={colors.danger} /></Pressable>
        </View> : null}
      </View>)}
      <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 17 }]}>WOCHENPLAN</Text>
      <WeeklyScheduleEditor role={role} members={members.data?.members ?? []} colors={colors} />
      <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 17 }]}>ABWESENHEITSANTRÄGE</Text>
      <LeaveRequestManagement colors={colors} />
      <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 17 }]}>MITGLIED HINZUFÜGEN</Text>
      <TextInput style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]} placeholder="Name" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} />
      <TextInput style={[styles.smallInput, { borderColor: colors.border, color: colors.foreground }]} placeholder="E-Mail-Adresse" placeholderTextColor={colors.mutedForeground} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {role === 'owner' ? <View style={styles.rolePicker}>
        {(['employee', 'manager'] as const).map((candidate) => <Pressable key={candidate} onPress={() => setNewRole(candidate)} style={[styles.roleOption, { borderColor: newRole === candidate ? colors.primary : colors.border, backgroundColor: newRole === candidate ? colors.successSoft : colors.surface }]}><Text style={[styles.metaText, { color: newRole === candidate ? colors.primary : colors.mutedForeground }]}>{candidate === 'employee' ? 'MITARBEITER' : 'MANAGER'}</Text></Pressable>)}
      </View> : null}
      <Pressable onPress={() => createMember.mutate({ data: { displayName: name, email, role: role === 'owner' ? newRole : 'employee' } }, { onSuccess: (result) => { setName(''); setEmail(''); setNewRole('employee'); refresh(); showCredentials(result); }, onError: () => Alert.alert('Nicht möglich', 'Das Mitglied konnte nicht erstellt werden.') })} style={[styles.smallButton, { backgroundColor: colors.primary }]}><Text style={styles.loginButtonText}>MITGLIED HINZUFÜGEN</Text></Pressable>
      {createdCredentials ? <View testID="zeitapp-created-member-credentials" style={[styles.credentialsCard, { backgroundColor: colors.successSoft, borderColor: colors.primary }]}>
        <View style={styles.credentialsHeader}>
          <Feather name="key" size={17} color={colors.primary} />
          <Text style={[styles.credentialsTitle, { color: colors.primary }]}>TEMPORÄRE ZUGANGSDATEN</Text>
        </View>
        <Text style={[styles.credentialsLabel, { color: colors.mutedForeground }]}>Firmen-Code</Text>
        <Text selectable style={[styles.credentialsValue, { color: colors.foreground }]}>{createdCredentials.companyCode}</Text>
        <Text style={[styles.credentialsLabel, { color: colors.mutedForeground }]}>Mitarbeiter-ID</Text>
        <Text selectable style={[styles.credentialsValue, { color: colors.foreground }]}>{createdCredentials.member.employeeId}</Text>
        <Text style={[styles.credentialsLabel, { color: colors.mutedForeground }]}>Temporäres Passwort</Text>
        <Text selectable style={[styles.credentialsPassword, { color: colors.foreground }]}>{createdCredentials.temporaryPassword}</Text>
        <Text style={[styles.credentialsHint, { color: colors.mutedForeground }]}>Bitte geben Sie diese Daten sicher an den Mitarbeiter weiter. Das Passwort ist seinem neuen Konto bereits zugeordnet.</Text>
      </View> : null}
      <Text style={[styles.metaText, { color: colors.mutedForeground, marginTop: 20 }]}>WOCHENBERICHT</Text>
      {(reports.data?.reports ?? []).map((report) => <View key={report.userId} style={styles.memberRow}><Text style={[styles.historyDate, { color: colors.foreground }]}>{report.displayName}</Text><Text style={[styles.historyDuration, { color: colors.primary }]}>{formatDuration(report.totalWorkSeconds)}</Text></View>)}
    </View> : null}
    {role === 'owner' ? <View style={[styles.hoursCard, { backgroundColor: colors.surface, marginHorizontal: 0 }]}>
      <Text style={[styles.cardEyebrow, { color: colors.primary }]}>ABRECHNUNG</Text>
      <Text style={[styles.hoursTitle, { color: colors.foreground }]}>Tarif & Zahlung</Text>
      {plans.isError ? <Text style={[styles.inlineError, { color: colors.danger }]}>Tarife konnten nicht geladen werden.</Text> : null}
      {(plans.data?.plans ?? []).map((plan) => <Pressable key={plan.id} disabled={billingPending} onPress={() => startCheckout(plan.priceId)} style={[styles.planRow, { borderColor: colors.border, opacity: billingPending ? 0.6 : 1 }]}><View><Text style={[styles.historyDate, { color: colors.foreground }]}>{plan.name ?? 'ZEITAPP Tarif'}</Text><Text style={[styles.metaText, { color: colors.mutedForeground }]}>{plan.description ?? 'Monatlicher Tarif'}</Text></View><Feather name="arrow-right" size={18} color={colors.primary} /></Pressable>)}
      <Pressable testID="zeitapp-manage-billing" accessibilityRole="button" accessibilityLabel={hasActiveSubscription ? 'Zahlung verwalten' : 'Firmenabo starten'} disabled={billingPending || (!hasActiveSubscription && plans.isLoading)} onPress={manageBilling} style={({ pressed }) => [styles.smallButton, { backgroundColor: hasActiveSubscription ? colors.brandMid : colors.primary, opacity: billingPending || (!hasActiveSubscription && plans.isLoading) ? 0.6 : pressed ? 0.82 : 1 }]}><Text style={styles.loginButtonText}>{billingPending ? 'BITTE WARTEN …' : hasActiveSubscription ? 'ZAHLUNG VERWALTEN' : '14 TAGE KOSTENLOS TESTEN'}</Text></Pressable>
    </View> : null}
  </View>;
}

export default function ZeitAppScreen() {
  const colors = useColors();
  const { isSignedIn, signOut } = useAuth();
  const queryClient = useQueryClient();
  const dashboard = useGetTimeAppMe({
    query: {
      queryKey: getGetTimeAppMeQueryKey(),
      enabled: Boolean(isSignedIn),
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchInterval: isSignedIn ? 15_000 : false,
    },
  });
  const employeeName = dashboard.data?.employee.displayName ?? '';
  const [newOwner, setNewOwner] = useState(false);
  const role = dashboard.data?.employee.role;
  const dashboardError = dashboard.error as { status?: number; data?: { code?: string } } | null;
  const subscriptionBlocked = dashboardError?.status === 402 || dashboardError?.data?.code === 'SUBSCRIPTION_REQUIRED';

  useEffect(() => {
    if (!isSignedIn || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refreshDashboard = () => void dashboard.refetch();
    window.addEventListener('pageshow', refreshDashboard);
    window.addEventListener('focus', refreshDashboard);
    return () => {
      window.removeEventListener('pageshow', refreshDashboard);
      window.removeEventListener('focus', refreshDashboard);
    };
  }, [dashboard.refetch, isSignedIn]);

  const content = useMemo(
    () =>
      isSignedIn && newOwner ? <OwnerOnboarding colors={colors} onComplete={() => { setNewOwner(false); void queryClient.invalidateQueries({ queryKey: getGetTimeAppMeQueryKey() }); }} /> : isSignedIn && dashboard.isLoading ? <View style={[styles.screen, styles.statusScreen, { backgroundColor: colors.background }]}><Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>ZEITAPP wird geladen …</Text></View> : isSignedIn && dashboard.isError ? <View style={[styles.screen, styles.statusScreen, { backgroundColor: colors.background }]}><Feather name={subscriptionBlocked ? 'credit-card' : 'alert-circle'} size={30} color={colors.danger} /><Text style={[styles.pageTitle, { color: colors.foreground }]}>{subscriptionBlocked ? 'Firmenabo nicht aktiv' : 'Kein Firmenkonto'}</Text><Text style={[styles.pageIntro, { color: colors.mutedForeground }]}>{subscriptionBlocked ? 'Für diese Firma ist kein aktives Abonnement vorhanden. Bitte wenden Sie sich an den Firmeninhaber.' : 'Ihr Konto ist keiner Firma zugeordnet oder der Zugang ist nicht aktiv.'}</Text>{!subscriptionBlocked ? <Pressable onPress={() => setNewOwner(true)} style={[styles.smallButton, styles.statusButton, { backgroundColor: colors.primary }]}><Text style={styles.loginButtonText}>FIRMA EINRICHTEN</Text></Pressable> : null}<Pressable onPress={() => void signOut()} style={[styles.smallButton, styles.statusButton, { backgroundColor: colors.brandMid }]}><Text style={styles.loginButtonText}>ABMELDEN</Text></Pressable></View> : isSignedIn ? (
        <>
        <DashboardScreen
          employeeName={employeeName}
          onLogout={() => void signOut()}
          colors={colors}
          role={role ?? 'employee'}
          hasActiveSubscription={dashboard.data?.company.hasActiveSubscription ?? false}
          hasTeamAccess={dashboard.data?.company.hasTeamAccess ?? false}
          isDevelopmentMode={dashboard.data?.company.isDevelopmentMode ?? false}
        />
        </>
      ) : (
        <LoginScreen colors={colors} onOwnerCreated={() => setNewOwner(true)} />
      ),
    [colors, dashboard.data?.company.hasActiveSubscription, dashboard.data?.company.hasTeamAccess, dashboard.data?.company.isDevelopmentMode, dashboard.isError, dashboard.isLoading, employeeName, isSignedIn, newOwner, queryClient, role, signOut, subscriptionBlocked],
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
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  statusScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  inlineError: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  subscriptionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 22,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  adminWrap: {
    marginHorizontal: 22,
    marginTop: 4,
    gap: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D7E0E2',
  },
  memberCopy: {
    flex: 1,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 13,
    marginLeft: 12,
  },
  smallInput: {
    height: 43,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    marginTop: 9,
  },
  smallButton: {
    alignItems: 'center',
    borderRadius: 11,
    marginTop: 11,
    paddingVertical: 13,
  },
  credentialsCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 12,
    padding: 14,
  },
  credentialsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  credentialsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  credentialsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 7,
  },
  credentialsValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  credentialsPassword: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  credentialsHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
  passwordCard: {
    borderRadius: 18,
    padding: 18,
  },
  passwordCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  passwordCardCopy: {
    flex: 1,
    gap: 3,
  },
  passwordActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 11,
  },
  passwordSecondaryButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 11,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  passwordPrimaryButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 2,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  scheduleEditor: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  scheduleMemberPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  scheduleMemberOption: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scheduleDays: {
    marginTop: 10,
  },
  scheduleDay: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  scheduleDayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleToggle: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scheduleStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleInputs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  scheduleInput: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    width: 62,
  },
  scheduleBreakInput: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    width: 48,
  },
  leaveDateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  leaveDateField: {
    flex: 1,
  },
  leaveDescription: {
    borderWidth: 1,
    borderRadius: 9,
    minHeight: 76,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  leaveRequestRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
  },
  leaveStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  leaveAdminRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
  },
  leaveActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  leaveAction: {
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  statusButton: {
    width: '100%',
    maxWidth: 320,
  },
  rolePicker: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  roleOption: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 11,
    padding: 12,
    marginTop: 11,
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