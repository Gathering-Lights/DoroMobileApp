import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform, KeyboardAvoidingView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // For icons like microphone, phone, etc.
import * as Speech from 'expo-speech'; // For Text-to-Speech
import { WebView } from 'react-native-webview'; // For Speech-to-Text via Web Speech API
import * as Contacts from 'expo-contacts'; // For accessing phone contacts
import { Audio } from 'expo-av'; // For requesting native microphone permission

// HTML content for the WebView to handle Speech-to-Text
// This HTML will no longer call getUserMedia on load.
// It will expose a function to trigger SpeechRecognition.start()
const speechRecognitionHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Speech Recognition</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background-color: transparent; /* Make background transparent */
        overflow: hidden; /* Hide scrollbars */
      }
    </style>
  </head>
  <body>
    <script>
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      let recognition = null;
      let isRecognitionActive = false;

      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false; // Listen for a single phrase
        recognition.interimResults = false; // Only return final results
        recognition.lang = 'en-US'; // Set language to US English

        recognition.onstart = () => {
          isRecognitionActive = true;
          console.log('WebView: Speech recognition started.');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_start' }));
        };

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          console.log('WebView: Speech result:', transcript);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_result', transcript: transcript }));
        };

        recognition.onerror = (event) => {
          isRecognitionActive = false;
          console.error('WebView: Speech recognition error:', event.error);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_error', error: event.error }));
        };

        recognition.onend = () => {
          isRecognitionActive = false;
          console.log('WebView: Speech recognition ended.');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_end' }));
        };

        // Function exposed to React Native to start recognition
        window.startWebViewSpeechRecognition = () => {
          if (recognition && !isRecognitionActive) {
            try {
              console.log('WebView: Attempting to start recognition via exposed function.');
              recognition.start(); // This will implicitly trigger getUserMedia
            } catch (e) {
              console.error('WebView: Error starting recognition (exposed func):', e.message);
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_error', error: e.message }));
            }
          } else {
            console.log('WebView: Recognition already active or not initialized (exposed func).');
          }
        };

        // Function exposed to React Native to stop recognition
        window.stopWebViewSpeechRecognition = () => {
          if (recognition && isRecognitionActive) {
            console.log('WebView: Attempting to stop recognition via exposed function.');
            recognition.stop();
          }
        };

      } else {
        console.log('WebView: Web Speech API not supported.');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'no_speech_api' }));
      }
    </script>
  </body>
  </html>
`;

// Main App component
const App = () => {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('Hello! I am Doro. How can I help you today?');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [webViewMicPermissionGranted, setWebViewMicPermissionGranted] = useState(false); // Tracks WebView mic permission
  const [nativeMicPermissionGranted, setNativeMicPermissionGranted] = useState(false); // Tracks native app mic permission
  const [contactsPermissionGranted, setContactsPermissionGranted] = useState(false); // Tracks Contacts permission
  const scrollViewRef = useRef(null);
  const webViewRef = useRef(null);

  // Speak initial greeting when component mounts
  useEffect(() => {
    Speech.speak(response, {
      onDone: () => setIsSpeaking(false),
      onError: (error) => {
        console.error('Initial greeting speech error:', error);
        setIsSpeaking(false);
      },
    });
  }, []);

  // Request Native Microphone and Contacts permissions when component mounts
  useEffect(() => {
    (async () => {
      // Request Native Microphone Permission
      const { status: micStatus } = await Audio.requestPermissionsAsync();
      if (micStatus === 'granted') {
        setNativeMicPermissionGranted(true);
        console.log('App: Native microphone permission granted.');
      } else {
        setNativeMicPermissionGranted(false);
        Alert.alert(
          "Microphone Permission Required",
          "Doro needs microphone access to listen to your commands. Please enable it in your phone's settings.",
          [{ text: "OK" }]
        );
        console.warn('App: Native microphone permission denied.');
      }

      // Request Contacts Permission
      const { status: contactsStatus } = await Contacts.requestPermissionsAsync();
      if (contactsStatus === 'granted') {
        setContactsPermissionGranted(true);
        console.log('App: Contacts permission granted.');
      } else {
        setContactsPermissionGranted(false);
        Alert.alert(
          "Contacts Permission Required",
          "Doro needs access to your contacts to call people by name. Please enable contacts permission in your phone's settings.",
          [{ text: "OK" }]
        );
        console.warn('App: Contacts permission denied.');
      }
    })();
  }, []); // Run once on mount

  // Scroll to the bottom of the chat display when new messages appear
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [response, command]);

  // Handle permission requests from the WebView
  const onWebViewPermissionRequest = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    const { url, permissions, resources } = nativeEvent; // 'resources' might contain the specific media type

    console.log('App: onPermissionRequest triggered for URL:', url);
    console.log('App: Permissions requested:', permissions);
    console.log('App: Resources requested:', resources); // Check this for 'microphone'

    // Check if the request is for microphone and if native mic permission is granted
    if (permissions.includes('microphone') || (resources && resources.includes('microphone'))) {
      if (nativeMicPermissionGranted) {
        syntheticEvent.preventDefault(); // Prevent default browser prompt
        nativeEvent.grant(); // Grant the permission
        setWebViewMicPermissionGranted(true); // Update state
        console.log('App: WebView microphone permission granted via onPermissionRequest.');
      } else {
        syntheticEvent.preventDefault();
        nativeEvent.deny();
        setWebViewMicPermissionGranted(false);
        console.warn('App: WebView microphone permission denied because native mic permission is not granted.');
        Alert.alert(
          "Microphone Permission Required",
          "Doro needs native microphone access to enable voice commands. Please enable it in your phone's settings.",
          [{ text: "OK" }]
        );
      }
    }
  };

  // Handle messages from the WebView (Speech-to-Text results and internal WebView status)
  const onWebViewMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    console.log('App: Received message from WebView:', data.type); // Log all incoming messages
    switch (data.type) {
      case 'speech_start':
        setIsListening(true);
        setResponse('Listening...');
        setIsLoading(false);
        break;
      case 'speech_result':
        const transcript = data.transcript;
        setCommand(transcript);
        processCommand(transcript);
        break;
      case 'speech_error':
        console.error('App: WebView Speech recognition error:', data.error);
        setIsListening(false);
        setIsLoading(false);
        setResponse(`Sorry, I couldn't understand that. Error: ${data.error}. Please try again.`);
        Speech.speak(`Sorry, I couldn't understand that. Error: ${data.error}. Please try again.`, {
          onDone: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
        break;
      case 'speech_end':
        setIsListening(false);
        setIsLoading(false);
        break;
      case 'no_speech_api':
        setResponse('Speech recognition is not supported in this WebView environment.');
        setIsLoading(false);
        setIsListening(false);
        break;
      default:
        break;
    }
  };

  // Function to start speech recognition via WebView
  const startListening = () => {
    console.log('App: Microphone button pressed.');
    // Check both native and WebView microphone permissions
    if (nativeMicPermissionGranted && webViewRef.current) {
      setCommand(''); // Clear previous command
      setResponse('Starting listening...'); // Indicate starting state
      setIsLoading(true); // Show loading indicator
      // Inject JavaScript into WebView to trigger speech recognition
      webViewRef.current.injectJavaScript(`
        if (window.startWebViewSpeechRecognition) {
          window.startWebViewSpeechRecognition();
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'speech_error', error: 'WebView function not ready.' }));
        }
      `);
    } else {
      let message = "Doro cannot listen right now.";
      if (!nativeMicPermissionGranted) {
        message += " Native microphone permission is denied. Please enable it in settings.";
      } else {
        message += " WebView microphone permission is not yet granted or Web Speech API is not ready.";
      }
      setResponse(message);
      Alert.alert(
        "Microphone Not Ready",
        message,
        [{ text: "OK" }]
      );
      setIsLoading(false); // Stop loading immediately if permissions not granted
    }
  };

  // Function to stop speech recognition via WebView
  const stopListening = () => {
    if (webViewRef.current) {
      console.log('App: Stopping listening.');
      webViewRef.current.injectJavaScript(`
        if (window.stopWebViewSpeechRecognition) {
          window.stopWebViewSpeechRecognition();
        }
      `);
      setIsListening(false);
      setIsLoading(false);
    }
  };

  // Function to process the user's command and generate Doro's response
  const processCommand = async (cmd) => {
    const lowerCmd = cmd.toLowerCase();
    let newResponse = '';

    if (lowerCmd.includes('hello') || lowerCmd.includes('hi doro')) {
      newResponse = 'Hello there! How can I assist you?';
    } else if (lowerCmd.includes('call')) {
      const callMatch = lowerCmd.match(/call\s+(.+)/);
      if (callMatch && callMatch[1]) {
        const target = callMatch[1].trim(); // Could be a name or a number

        // Check if it's likely a phone number (contains digits)
        const phoneNumberDigits = target.replace(/\D/g, '');
        if (phoneNumberDigits.length >= 7 && /^\d+$/.test(phoneNumberDigits)) { // More robust number check
          newResponse = `Attempting to call ${target}... (Opening dialer. Please tap 'Call' to confirm.)`;
          Linking.openURL(`tel:${phoneNumberDigits}`).catch(err => {
            console.error('Failed to open dialer for number:', err);
            setResponse(`Could not open dialer for ${target}. Please check the number.`);
            Speech.speak(`Could not open dialer for ${target}. Please check the number.`, {
              onDone: () => setIsSpeaking(false),
              onError: () => setIsSpeaking(false),
            });
          });
        } else if (contactsPermissionGranted) {
          // Attempt to find contact by name
          newResponse = `Searching for ${target} in your contacts...`;
          setResponse(newResponse); // Update response while searching
          Speech.speak(newResponse, {
            onDone: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
          });

          try {
            const { data } = await Contacts.getContactsAsync({
              fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
              name: target, // Filter by name
            });

            if (data.length > 0) {
              const foundContact = data[0]; // Take the first match
              if (foundContact.phoneNumbers && foundContact.phoneNumbers.length > 0) {
                const numberToCall = foundContact.phoneNumbers[0].number;
                newResponse = `Found ${foundContact.name}. Calling ${numberToCall}... (Opening dialer. Please tap 'Call' to confirm.)`;
                Linking.openURL(`tel:${numberToCall}`).catch(err => {
                  console.error('Failed to open dialer for contact:', err);
                  setResponse(`Could not open dialer for ${foundContact.name}.`);
                  Speech.speak(`Could not open dialer for ${foundContact.name}.`, {
                    onDone: () => setIsSpeaking(false),
                    onError: () => setIsSpeaking(false),
                  });
                });
              } else {
                newResponse = `Found ${foundContact.name}, but no phone number available.`;
              }
            } else {
              newResponse = `Could not find a contact named ${target}. Please try again or say the number.`;
            }
          } catch (error) {
            console.error('Error fetching contacts:', error);
            newResponse = `An error occurred while searching contacts: ${error.message}.`;
          }
        } else {
          newResponse = `To call by name, I need contacts permission. Please enable it in settings.`;
          Alert.alert(
            "Contacts Permission Required",
            "Doro needs access to your contacts to call people by name. Please enable contacts permission in your phone's settings.",
            [{ text: "OK" }]
          );
        }
      } else {
        newResponse = 'Whom would you like me to call? Please say "call [name or number]".';
      }
    } else { // Removed 'open' commands to focus on calling
      newResponse = "I'm currently focused on making calls. How can I help you with a call?";
    }

    setResponse(newResponse);
    setIsLoading(false);
    Speech.speak(newResponse, {
      onDone: () => setIsSpeaking(false),
      onError: (error) => {
        console.error('Speech synthesis error:', error);
        setIsSpeaking(false);
      },
    });
  };

  // Handle manual text input
  const handleTextInputSubmit = () => {
    if (command.trim()) {
      processCommand(command);
    }
  };

  // Determine if the mic button should be disabled
  // It requires both native mic permission AND the WebView's mic permission
  const isMicButtonDisabled = isSpeaking || isLoading || !nativeMicPermissionGranted || !webViewMicPermissionGranted;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Hidden WebView for Speech Recognition */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: speechRecognitionHtml }}
        onMessage={onWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // NEW: Handle permission requests from the WebView
        onPermissionRequest={onWebViewPermissionRequest}
        // Add onLoad and onLoadEnd to debug WebView loading
        onLoad={() => console.log('App: WebView finished loading HTML content.')}
        onLoadEnd={() => console.log('App: WebView finished loading (including subframes).')}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('App: WebView error:', nativeEvent.description);
        }}
        style={styles.hiddenWebView} // Style to hide it from view
      />

      <View style={styles.header}>
        <Text style={styles.headerText}>Doro</Text>
        <Ionicons name="phone-portrait-outline" size={32} color="#fff" />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
      >
        {/* Doro's response bubble */}
        <View style={styles.doroBubble}>
          <Text style={styles.doroText}>{response}</Text>
        </View>

        {/* User's command bubble (only if command is present) */}
        {command ? (
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{command}</Text>
          </View>
        ) : null}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={command}
          onChangeText={setCommand}
          placeholder="Type your command or speak..."
          placeholderTextColor="#9ca3af"
          onSubmitEditing={handleTextInputSubmit}
          editable={!isListening && !isSpeaking && !isLoading} // Disable input while listening/speaking/loading
        />
        <TouchableOpacity
          style={[
            styles.micButton,
            isMicButtonDisabled ? styles.micButtonDisabled : null,
            isListening ? styles.micButtonActive : null,
          ]}
          onPress={isListening ? stopListening : startListening}
          disabled={isMicButtonDisabled} // Use the derived state
        >
          {isListening ? (
            <Ionicons name="mic-off" size={28} color="#fff" />
          ) : (
            <Ionicons name="mic" size={28} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {/* Debugging indicator for microphone permission */}
      <View style={styles.permissionStatusContainer}>
        <Text style={styles.permissionStatusText}>
          Native Mic: {nativeMicPermissionGranted ? 'Granted ✅' : 'Denied ❌'}
        </Text>
        <Text style={styles.permissionStatusText}>
          WebView Mic: {webViewMicPermissionGranted ? 'Granted ✅' : 'Denied ❌'}
        </Text>
        <Text style={styles.permissionStatusText}>
          Contacts: {contactsPermissionGranted ? 'Granted ✅' : 'Denied ❌'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

// Styles for the React Native components
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e0f2fe', // Light blue background
  },
  header: {
    backgroundColor: '#4f46e5', // Indigo-600
    paddingVertical: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 8, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'System', // Default system font
  },
  chatArea: {
    flex: 1,
    padding: 15,
  },
  chatContent: {
    paddingBottom: 20, // Add some padding at the bottom for scrolling
  },
  doroBubble: {
    backgroundColor: '#bfdbfe', // Blue-200
    padding: 15,
    borderRadius: 15,
    borderBottomLeftRadius: 0,
    alignSelf: 'flex-start',
    maxWidth: '80%',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  doroText: {
    fontSize: 16,
    color: '#1e3a8a', // Blue-900
  },
  userBubble: {
    backgroundColor: '#e9d5ff', // Purple-200
    padding: 15,
    borderRadius: 15,
    borderBottomRightRadius: 0,
    alignSelf: 'flex-end',
    maxWidth: '80%',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  userText: {
    fontSize: 16,
    color: '#581c87', // Purple-900
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6366F1',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  textInput: {
    flex: 1,
    height: 50,
    backgroundColor: '#f3f4f6', // Gray-100
    borderRadius: 25,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#374151', // Gray-700
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#d1d5db', // Gray-300
  },
  micButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#6366F1', // Indigo-500
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  micButtonActive: {
    backgroundColor: '#ef4444', // Red-500 for active listening
    // Add a pulsing animation for active state if desired
  },
  micButtonDisabled: {
    opacity: 0.6,
    backgroundColor: '#9ca3af', // Gray-400 when disabled
  },
  hiddenWebView: {
    width: 1, // Make it very small
    height: 1, // Make it very small
    position: 'absolute', // Position it off-screen
    left: -1000,
    top: -1000,
  },
  permissionStatusContainer: {
    padding: 8,
    backgroundColor: '#e0e0e0',
    borderTopWidth: 1,
    borderColor: '#d0d0d0',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap', // Allow text to wrap if too long
  },
  permissionStatusText: {
    fontSize: 11, // Smaller font for status
    color: '#444',
    marginHorizontal: 5,
    marginBottom: 2,
  },
});

export default App;
