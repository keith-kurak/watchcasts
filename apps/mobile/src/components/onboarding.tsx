import { useMaterialColors } from '@expo/ui/jetpack-compose';
import Onboarding from '@blazejkustra/react-native-onboarding';
import { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import splashColors from '../../splash-colors.json';
import { Image } from './image';

/** How long step 2 holds on the phone list before crossfading to the watch's downloads. */
const CROSSFADE_DELAY_MS = 2500;
const CROSSFADE_MS = 700;

/**
 * The one-time introduction, shown on first launch.
 *
 * An intro panel and three steps, one per thing you have to do: subscribe, send, listen.
 * The steps use real screenshots of the app rather than illustrations (see
 * assets/images/onboarding). The watch shots are masked to circles there, because a square
 * screenshot of a round display reads as a bug.
 *
 * The library draws every step image with `contain` inside a fixed 300x600 box, so how big
 * a shot renders is decided entirely by how much of its own canvas the content fills. The
 * phone shots sit on a canvas 25% taller than themselves, which keeps them clear of the
 * step panel that overlaps the bottom of that box.
 */
export function AppOnboarding({ onDone }: { onDone: () => void }) {
  const m = useMaterialColors();
  // -1 is the intro; 0-2 are the steps. The library owns this, and reports it here so the
  // backdrop and the step 2 crossfade can follow along.
  const [step, setStep] = useState(-1);

  return (
    /*
      The library lays its panels out in normal flow, so on its own it appears *above* the
      app rather than over it. This wrapper is what makes it an overlay. zIndex sits below
      the splash overlay's 1000 so the splash still plays first and then reveals this,
      rather than the onboarding appearing on top of the launch animation.
    */
    <View style={styles.overlay}>
      <Onboarding
        // The library's defaults are iOS system colours — #007AFF and friends. Mapping them
        // onto the Material palette keeps the flow looking like the app it introduces, and
        // means it follows the wallpaper like everything else.
        colors={{
          background: {
            primary: m.primary,
            secondary: m.surface,
            label: m.surfaceContainerHighest,
            accent: m.secondaryContainer,
          },
          text: {
            primary: m.onSurface,
            secondary: m.onSurfaceVariant,
            contrast: m.onPrimary,
          },
        }}
        onStepChange={setStep}
        // Replaces the plain colour block the library would otherwise draw behind the step
        // images. On the intro there is no image to put in it, and an empty full-bleed
        // rectangle of `primary` looks like a rendering failure rather than a design.
        background={() => <Backdrop color={m.primary} showLogo={step < 0} />}
        introPanel={{
          title: 'Simple podcasts for watch people',
          subtitle:
            `Subscribe to shows, download episodes to your phone or WearOS device, and play. That's it.`,
          button: 'Next',
          // The logo lives in the backdrop above, not here. A function still counts as an
          // image to the library, which is what stops it from promoting step 1's screenshot
          // onto the intro; returning null keeps the panel itself text-only.
          image: () => null,
        }}
        steps={[
          {
            label: 'Step 1',
            title: 'Subscribe to a few shows',
            description:
              `Add podcasts with RSS or Apple Podcasts links. Or import a bunch of once with an OPML file.`,
            buttonLabel: 'Next',
            image: require('@/assets/images/onboarding/step-subscriptions.png'),
            position: 'top',
          },
          {
            label: 'Step 2',
            title: 'Send an episode to your watch',
            description:
              'Tap the watch icon to download to your watch, tap the phone icon to download to your phone.',
            buttonLabel: 'Next',
            // Two screenshots in one slot, so this step is drawn by StepTwoCrossfade below
            // rather than from a single composited asset. Every step has to name an image,
            // so this one names a transparent pixel.
            image: require('@/assets/images/onboarding/blank.png'),
            position: 'top',
          },
          {
            label: 'Step 3',
            title: 'Listen to some shows',
            description:
              'Play episodes 100% offline on your watch or phone. Increase the speed, skip ahead. Long press on episodes on the watch to queue up a playlist.',
            buttonLabel: 'Start listening',
            image: require('@/assets/images/onboarding/step-watch.png'),
            position: 'top',
          },
        ]}
        // Both paths write the same flag. Skipping is a decision, and re-showing this on the
        // next launch would ignore it.
        onComplete={onDone}
        onSkip={onDone}
      />
      {step === 1 && <StepTwoCrossfade />}
    </View>
  );
}

/**
 * What sits behind the step screenshots: a flat sheet of `primary` that the library
 * animates from a rounded card on the intro out to full bleed on the steps.
 *
 * On the intro it also carries the app logo, so the card has a subject. This is the only
 * place the launcher icon appears in the flow, and it uses the same foreground asset and
 * the same two background colours as the native splash — the first thing you see after the
 * splash animation is the mark it just handed over from.
 */
function Backdrop({ color, showLogo }: { color: string; showLogo: boolean }) {
  const scheme = useColorScheme();

  return (
    /*
      The library rounds the wrapper it puts this in but does not clip it, so the radius has
      to be repeated here to have any effect. 12 is the value it animates away to 0 as the
      card spills out to full bleed, which only the intro ever shows.
    */
    <View
      style={[styles.backdrop, { backgroundColor: color, borderRadius: showLogo ? 12 : 0 }]}
    >
      {showLogo && (
        <View
          style={[
            styles.logo,
            { backgroundColor: scheme === 'dark' ? splashColors.dark : splashColors.light },
          ]}
        >
          {/*
            The foreground carries the adaptive-icon safe-zone padding, so the duck sits
            well inside the tile without any inset of our own.
          */}
          <Image
            style={styles.logoImage}
            contentFit="contain"
            source={require('@/assets/images/android-icon-foreground.png')}
          />
        </View>
      )}
    </View>
  );
}

/**
 * Step 2's artwork: the phone's episode list, which after a beat crossfades to the watch's
 * download list — the two halves of "send an episode", in sequence rather than side by
 * side, so each one is drawn at full width instead of half.
 *
 * Positioned to land exactly where the library puts a step image: a 300x600 box, centred,
 * `insets.top + 16` from the top. It draws over the library's own (blank) image for this
 * step, and passes touches through to the step panel below it.
 */
function StepTwoCrossfade() {
  const insets = useSafeAreaInsets();
  const [showSecond, setShowSecond] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSecond(true), CROSSFADE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View pointerEvents="none" style={[styles.crossfade, { top: insets.top + 16 }]}>
      {/*
        The first shot stays mounted underneath rather than fading out, so the overlap is a
        dissolve into a full image instead of a moment where both are half transparent and
        the backdrop shows through.
      */}
      <Image
        style={styles.crossfadeImage}
        contentFit="contain"
        source={require('@/assets/images/onboarding/step-send-tap.png')}
      />
      {showSecond && (
        <Animated.View entering={FadeIn.duration(CROSSFADE_MS)} style={styles.crossfadeImage}>
          <Image
            style={styles.crossfadeImage}
            contentFit="contain"
            source={require('@/assets/images/onboarding/step-send-progress.png')}
          />
        </Animated.View>
      )}
    </View>
  );
}

const LOGO_SIZE = 176;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    // Roughly the squircle radius Android masks the launcher icon with, so the tile reads
    // as the app icon rather than as a photo.
    borderRadius: LOGO_SIZE * 0.25,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  crossfade: {
    position: 'absolute',
    alignSelf: 'center',
    width: 300,
    height: 600,
  },
  crossfadeImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
