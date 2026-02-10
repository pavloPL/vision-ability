/**
 * NHSWebViewWithVoice.tsx
 *
 * This is the core component for Option 1: Enhanced WebView.
 * It wraps the NHS App website in a WebView and overlays voice controls.
 *
 * NO NHS API onboarding required. Works today.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  AccessibilityInfo,
  Vibration,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as Speech from 'expo-speech';
// import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

// ============================================================
// TYPES
// ============================================================

interface ExtractedPage {
  url: string;
  title: string;
  type: 'messages-list' | 'message-detail' | 'prescriptions' | 'login' | 'unknown';
  content: PageContent;
}

interface PageContent {
  headings: string[];
  messages?: MessageItem[];
  prescriptions?: PrescriptionItem[];
  bodyText?: string[];
  forms?: FormField[];
}

interface MessageItem {
  from: string;
  date: string;
  preview: string;
  unread: boolean;
  linkIndex: number; // index for clicking
}

interface PrescriptionItem {
  name: string;
  dose: string;
  status: 'available' | 'requested' | 'dispensed';
  requestButtonIndex: number;
}

interface FormField {
  label: string;
  type: string;
  value: string;
  fieldIndex: number;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

// ============================================================
// JAVASCRIPT INJECTED INTO THE WEBVIEW
// ============================================================

/**
 * This JS runs inside the WebView on every page load.
 * It extracts the page content and sends it back to React Native
 * via window.ReactNativeWebView.postMessage().
 *
 * The selectors below are based on the NHS App website structure.
 * They may need updating if NHS changes their HTML.
 */
const CONTENT_EXTRACTION_JS = `
(function() {
  // Wait for page to fully render
  setTimeout(() => {
    const url = window.location.href;
    const title = document.title;

    // Detect page type from URL
    let type = 'unknown';
    if (url.includes('/messages') && !url.includes('/messages/')) type = 'messages-list';
    if (url.includes('/messages/')) type = 'message-detail';
    if (url.includes('/prescriptions')) type = 'prescriptions';
    if (url.includes('login.nhs.uk')) type = 'login';

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(t => t.length > 0);

    // Extract messages (if on messages page)
    let messages = null;
    if (type === 'messages-list') {
      // NHS App uses various selectors - try common patterns
      const msgElements = document.querySelectorAll(
        '[class*="message"], [class*="Message"], [data-testid*="message"], .nhsuk-card'
      );
      messages = Array.from(msgElements).map((el, index) => {
        const fromEl = el.querySelector('[class*="from"], [class*="sender"], h3, strong');
        const dateEl = el.querySelector('[class*="date"], time, [class*="meta"]');
        const previewEl = el.querySelector('[class*="preview"], [class*="body"], p');
        return {
          from: fromEl?.textContent?.trim() || 'Unknown sender',
          date: dateEl?.textContent?.trim() || '',
          preview: previewEl?.textContent?.trim() || '',
          unread: el.classList.contains('unread') ||
                  el.querySelector('[class*="unread"]') !== null ||
                  el.getAttribute('aria-label')?.includes('unread') || false,
          linkIndex: index,
        };
      });
    }

    // Extract message body (if reading a specific message)
    let bodyText = null;
    if (type === 'message-detail') {
      const mainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      const paragraphs = mainContent.querySelectorAll('p');
      bodyText = Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(t => t.length > 0 && t.length < 1000);
    }

    // Extract prescriptions
    let prescriptions = null;
    if (type === 'prescriptions') {
      const rxElements = document.querySelectorAll(
        '[class*="prescription"], [class*="medication"], .nhsuk-card'
      );
      prescriptions = Array.from(rxElements).map((el, index) => {
        const nameEl = el.querySelector('[class*="name"], h3, strong');
        const doseEl = el.querySelector('[class*="dose"], [class*="dosage"], p');
        const statusEl = el.querySelector('[class*="status"], [class*="tag"], .nhsuk-tag');
        const requestBtn = el.querySelector('button, [class*="request"]');

        let status = 'available';
        const statusText = (statusEl?.textContent || '').toLowerCase();
        if (statusText.includes('requested')) status = 'requested';
        if (statusText.includes('dispensed')) status = 'dispensed';

        return {
          name: nameEl?.textContent?.trim() || 'Unknown medication',
          dose: doseEl?.textContent?.trim() || '',
          status: status,
          requestButtonIndex: requestBtn ? index : -1,
        };
      });
    }

    // Detect form fields (for login page assistance)
    let forms = null;
    if (type === 'login') {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      forms = Array.from(inputs).map((input, index) => {
        const label = document.querySelector('label[for="' + input.id + '"]');
        return {
          label: label?.textContent?.trim() || input.getAttribute('aria-label') || input.name || 'Field',
          type: input.type,
          value: input.value,
          fieldIndex: index,
        };
      });
    }

    // Send extracted data back to React Native
    const data = {
      url, title, type,
      content: {
        headings,
        messages,
        prescriptions,
        bodyText,
        forms,
      }
    };

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'page-content',
      data: data
    }));
  }, 1500); // Wait 1.5s for page to render
})();
`;

// JS to click a specific message link by index
const clickMessageJS = (index: number) => `
  (function() {
    const links = document.querySelectorAll(
      '[class*="message"] a, [class*="Message"] a, .nhsuk-card a'
    );
    if (links[${index}]) {
      links[${index}].click();
    }
  })();
`;

// JS to click the prescription request button by medication index
const clickRequestButtonJS = (index: number) => `
  (function() {
    const cards = document.querySelectorAll(
      '[class*="prescription"], [class*="medication"], .nhsuk-card'
    );
    const card = cards[${index}];
    if (card) {
      const btn = card.querySelector('button, [class*="request"]');
      if (btn) btn.click();
    }
  })();
`;

// JS to highlight text being read (karaoke-style)
const highlightTextJS = (paragraphIndex: number) => `
  (function() {
    // Remove previous highlights
    document.querySelectorAll('.va-highlight').forEach(el => {
      el.style.background = 'none';
      el.classList.remove('va-highlight');
    });
    // Highlight current paragraph
    const main = document.querySelector('main') || document.body;
    const paragraphs = main.querySelectorAll('p');
    if (paragraphs[${paragraphIndex}]) {
      paragraphs[${paragraphIndex}].style.background = '#fff9c4';
      paragraphs[${paragraphIndex}].classList.add('va-highlight');
      paragraphs[${paragraphIndex}].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  })();
`;

// ============================================================
// VOICE HELPERS
// ============================================================

async function speak(text: string, onDone?: () => void): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-GB',
      rate: 0.9,       // Slightly slower for accessibility
      pitch: 1.0,
      onDone: () => {
        onDone?.();
        resolve();
      },
    });
  });
}

function stopSpeaking() {
  Speech.stop();
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function NHSWebViewWithVoice() {
  const webViewRef = useRef<WebView>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [currentPage, setCurrentPage] = useState<ExtractedPage | null>(null);
  const [statusText, setStatusText] = useState('Loading...');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ---- Handle page content extracted from WebView ----
  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'page-content') return;

      const page: ExtractedPage = msg.data;
      setCurrentPage(page);

      // Detect login success
      if (page.url.includes('nhsapp.service.nhs.uk') && !page.url.includes('login')) {
        setIsLoggedIn(true);
      }

      // Announce page content via voice
      await announcePageContent(page);

    } catch (e) {
      console.error('Failed to parse WebView message:', e);
    }
  }, []);

  // ---- Announce page content based on type ----
  async function announcePageContent(page: ExtractedPage) {
    setVoiceState('speaking');
    Vibration.vibrate(50); // Haptic feedback

    switch (page.type) {
      case 'login':
        setStatusText('NHS Login page');
        await speak(
          'NHS Login page. ' +
          (page.content.forms?.map(f => `${f.label} field ${f.value ? 'is filled' : 'is empty'}`).join('. ') || '') +
          '. Say "Continue" to log in.'
        );
        break;

      case 'messages-list':
        const msgs = page.content.messages || [];
        const unread = msgs.filter(m => m.unread);
        setStatusText(`${msgs.length} messages, ${unread.length} unread`);

        let announcement = `You have ${msgs.length} messages. `;
        if (unread.length > 0) {
          announcement += `${unread.length} are unread. `;
        }
        // Read first 3 message previews
        msgs.slice(0, 3).forEach((m, i) => {
          announcement += `${m.unread ? 'New message' : 'Message'} from ${m.from}, ${m.date}. ${m.preview.substring(0, 60)}. `;
        });
        announcement += 'Say "read first", "read second", or "next" to continue.';
        await speak(announcement);
        break;

      case 'message-detail':
        const body = page.content.bodyText || [];
        setStatusText(`Reading message...`);

        // Read message progressively, paragraph by paragraph
        for (let i = 0; i < body.length; i++) {
          // Highlight current paragraph in WebView
          webViewRef.current?.injectJavaScript(highlightTextJS(i));
          setStatusText(`Reading paragraph ${i + 1} of ${body.length}`);
          await speak(body[i]);
        }
        await speak('End of message. Say "reply", "go back", or "summary".');
        break;

      case 'prescriptions':
        const rxs = page.content.prescriptions || [];
        setStatusText(`${rxs.length} prescriptions`);

        let rxAnnouncement = `You have ${rxs.length} prescriptions. `;
        rxs.forEach(rx => {
          rxAnnouncement += `${rx.name}, ${rx.dose}. Status: ${rx.status}. `;
        });
        const available = rxs.filter(r => r.status === 'available');
        if (available.length > 0) {
          rxAnnouncement += `${available.length} available to request. Say "request" followed by the medication name.`;
        }
        await speak(rxAnnouncement);
        break;

      default:
        // Generic page — read headings and first few paragraphs
        setStatusText(page.title);
        const text = [
          ...page.content.headings.slice(0, 2),
          ...(page.content.bodyText || []).slice(0, 3)
        ].join('. ');
        await speak(text || 'Page loaded. Say "help" for available commands.');
        break;
    }

    setVoiceState('idle');
  }

  // ---- Handle voice commands ----
  async function handleVoiceCommand(transcript: string) {
    const command = transcript.toLowerCase().trim();
    setVoiceState('processing');

    // Messages commands
    if (command.includes('read') && command.includes('first') && currentPage?.content.messages) {
      webViewRef.current?.injectJavaScript(clickMessageJS(0));
    }
    else if (command.includes('read') && command.includes('second') && currentPage?.content.messages) {
      webViewRef.current?.injectJavaScript(clickMessageJS(1));
    }
    else if (command.includes('read') && command.includes('third') && currentPage?.content.messages) {
      webViewRef.current?.injectJavaScript(clickMessageJS(2));
    }

    // Prescription commands
    else if (command.includes('request') && currentPage?.content.prescriptions) {
      const rxs = currentPage.content.prescriptions;
      const match = rxs.find(rx =>
        command.includes(rx.name.toLowerCase().split(' ')[0]) && rx.status === 'available'
      );
      if (match) {
        await speak(
          `Requesting ${match.name}, ${match.dose}. This usually takes 2 to 3 working days. Say "yes" to confirm or "cancel".`
        );
        // Wait for confirmation... (simplified here)
        // In production: listen for "yes" → clickRequestButtonJS(match.requestButtonIndex)
      } else {
        await speak('I couldn\'t find that medication. Please say the medication name clearly.');
      }
    }

    // Navigation commands
    else if (command === 'go back' || command === 'back') {
      webViewRef.current?.goBack();
    }
    else if (command === 'messages') {
      webViewRef.current?.injectJavaScript(
        `window.location.href = 'https://www.nhsapp.service.nhs.uk/patient/messages';`
      );
    }
    else if (command === 'prescriptions') {
      webViewRef.current?.injectJavaScript(
        `window.location.href = 'https://www.nhsapp.service.nhs.uk/patient/prescriptions';`
      );
    }
    else if (command === 'continue' && currentPage?.type === 'login') {
      webViewRef.current?.injectJavaScript(
        `document.querySelector('button[type="submit"], input[type="submit"]')?.click();`
      );
    }

    // Utility commands
    else if (command === 'repeat') {
      if (currentPage) await announcePageContent(currentPage);
    }
    else if (command === 'stop') {
      stopSpeaking();
    }
    else if (command === 'help') {
      await speak(
        'Available commands: Read first, Read second, Read third message. ' +
        'Request prescription name. Go back. Messages. Prescriptions. ' +
        'Repeat. Stop. Help.'
      );
    }
    else {
      await speak('I didn\'t understand. Say "help" for available commands.');
    }

    setVoiceState('idle');
  }

  // ---- URL change detection ----
  const handleNavigationChange = useCallback((navState: any) => {
    // Re-extract content when URL changes
    webViewRef.current?.injectJavaScript(CONTENT_EXTRACTION_JS);
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={styles.container}>
      {/* WebView — the real NHS App website */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: 'https://www.nhsapp.service.nhs.uk/' }}
          style={styles.webView}
          onMessage={handleWebViewMessage}
          onLoadEnd={() => {
            webViewRef.current?.injectJavaScript(CONTENT_EXTRACTION_JS);
          }}
          onNavigationStateChange={handleNavigationChange}
          javaScriptEnabled={true}
          domStorageEnabled={true}   // Keep NHS Login session
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          // Accessibility
          accessibilityLabel="NHS App website content"
          accessibilityRole="none" // We handle accessibility via voice overlay
        />
      </View>

      {/* Voice Overlay — floats on top of WebView */}
      <View style={styles.voiceOverlay}>
        {/* Status bar */}
        <View style={styles.statusBar}>
          <Text style={styles.statusIcon}>
            {voiceState === 'speaking' ? '🔊' :
             voiceState === 'listening' ? '🎤' :
             voiceState === 'processing' ? '⏳' : '💤'}
          </Text>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        {/* Quick action buttons (also accessible via voice) */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary]}
            onPress={() => {/* Start listening */}}
            accessibilityLabel="Tap to speak a command"
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>🎤 Speak</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => currentPage && announcePageContent(currentPage)}
            accessibilityLabel="Repeat what's on screen"
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>🔄 Repeat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => webViewRef.current?.goBack()}
            accessibilityLabel="Go back to previous page"
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={stopSpeaking}
            accessibilityLabel="Stop speaking"
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>⏹ Stop</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  voiceOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 94, 184, 0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 34, // Safe area
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  statusIcon: {
    fontSize: 22,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minHeight: 44, // Accessibility minimum touch target
  },
  actionPrimary: {
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
    borderColor: '#4CAF50',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
