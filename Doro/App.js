import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // For icons like microphone, phone, etc.
import * as Speech from 'expo-speech'; // For Text-to-Speech
import Voice from '@react-native-voice/voice'; // For Speech-to-Text

// Main App component
const App = () => {
  const [command, setCommand] = useState(''); // Stores the user's spoken or typed command
  const [response, setResponse] = useState('Hello! I am Doro. How can I help you today?'); // Stores Doro's response
  const [isListening, setIsListening] = useState(false); // Tracks if speech recognition is active
  const [isSpeaking, setIsSpeaking] = useState(false); // Tracks if Doro is speaking
  const [isLoading, setIsLoading] = useState(false); // For showing loading indicator during speech processing
  const scrollViewRef = useRef(null); // Ref for scrolling to the latest message

  // --- Speech-to-Text (Voice Recognition) Setup ---
  useEffect(() => {
    // Event listener for when speech recognition starts
    Voice.onSpeechStart = () => {
      setIsListening(true);
      setResponse('Listening...');
      setIsLoading(false); // Hide loading if it was active
    };

    // Event listener for when a speech result is received
    Voice.onSpeechResults = (event) => {
      const transcript = event.value[0]; // Get the most confident transcript
      setCommand(transcript);
      processCommand(transcript);
    };

    // Event listener for speech recognition errors
    Voice.onSpeechError = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setIsLoading(false);
      setResponse(`Sorry, I couldn't understand that. Error: ${event.error.message}. Please try again.`);
      // Speak the error message
      Speech.speak(`Sorry, I couldn't understand that. Error: ${event.error.message}. Please try again.`, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    };

    // Event listener for when speech recognition ends
    Voice.onSpeechEnd = () => {
      setIsListening(false);
      setIsLoading(false);
    };

    // Clean up Voice listeners on component unmount
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // --- Text-to-Speech Setup ---
  useEffect(() => {
    // Event listener for when speech synthesis starts
    Speech.onStart = () => setIsSpeaking(true);
    // Event listener for when speech synthesis ends
    Speech.onDone = () => setIsSpeaking(false);
    // Event listener for speech synthesis errors
    Speech.onError = () => setIsSpeaking(false);
  }, []);

  // Function to start speech recognition
  const startListening = async () => {
    try {
      setCommand(''); // Clear previous command
      setResponse('Listening...'); // Indicate listening state
      setIsLoading(true); // Show loading indicator
      await Voice.start('en-US'); // Start listening in US English
    } catch (e) {
      console.error('Error starting speech recognition:', e);
      setIsListening(false);
      setIsLoading(false);
      setResponse(`Failed to start listening: ${e.message}.`);
      Speech.speak(`Failed to start listening: ${e.message}.`, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  // Function to stop speech recognition
  const stopListening = async () => {
    try {
      await Voice.stop();
      setIsListening(false);
      setIsLoading(false);
    } catch (e) {
      console.error('Error stopping speech recognition:', e);
      setIsListening(false);
      setIsLoading(false);
      setResponse(`Failed to stop listening: ${e.message}.`);
      Speech.speak(`Failed to stop listening: ${e.message}.`, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  // Function to process the user's command and generate Doro's response
  const processCommand = async (cmd) => {
    const lowerCmd = cmd.toLowerCase();
    let newResponse = '';

    if (lowerCmd.includes('hello') || lowerCmd.includes('hi doro')) {
      newResponse = 'Hello there! How can I assist you?';
    } else if (lowerCmd.includes('call')) {
      const contactMatch = lowerCmd.match(/call\s+(.+)/);
      if (contactMatch && contactMatch[1]) {
        const contact = contactMatch[1].trim();
        newResponse = `Attempting to call ${contact}... (This will open your phone's dialer if a number is detected.)`;
        // Attempt to open the phone dialer
        const phoneNumber = contact.replace(/\D/g, ''); // Extract digits only
        if (phoneNumber.length > 0) {
          Linking.openURL(`tel:${phoneNumber}`).catch(err => {
            console.error('Failed to open dialer:', err);
            setResponse(`Could not open dialer for ${contact}. Please check the number.`);
            Speech.speak(`Could not open dialer for ${contact}. Please check the number.`, {
              onDone: () => setIsSpeaking(false),
              onError: () => setIsSpeaking(false),
            });
          });
        } else {
          newResponse = `Could not find a valid number for ${contact}. Please specify a number or a contact with a known number.`;
        }
      } else {
        newResponse = 'Whom would you like me to call? Please say "call [name or number]".';
      }
    } else if (lowerCmd.includes('open')) {
      const appMatch = lowerCmd.match(/open\s+(.+)/);
      if (appMatch && appMatch[1]) {
        const appName = appMatch[1].trim();
        // This is a simplified simulation. Actual app opening requires deep linking
        // which varies greatly by app and platform.
        newResponse = `Simulating opening ${appName}... (Actual app launch depends on deep link availability.)`;
        // Example of deep linking (e.g., to open YouTube app)
        if (appName.includes('youtube')) {
          Linking.openURL('vnd.youtube://').catch(() => {
            Linking.openURL('https://m.youtube.com'); // Fallback to web
          });
        } else if (appName.includes('settings')) {
          // Open device settings (Android specific, may vary)
          if (Platform.OS === 'android') {
            Linking.openSettings().catch(() => {
              console.log('Could not open Android settings directly.');
            });
          } else {
            newResponse += " Opening settings is not directly supported on iOS via deep link.";
          }
        } else {
          newResponse += " I can only simulate opening common apps or use specific deep links.";
        }
      } else {
        newResponse = 'Which application would you like me to open? Please say "open [app name]".';
      }
    } else if (lowerCmd.includes('what is the time') || lowerCmd.includes('current time')) {
      const now = new Date();
      newResponse = `The current time is ${now.toLocaleTimeString()}.`;
    } else if (lowerCmd.includes('what is the date') || lowerCmd.includes('current date')) {
      const now = new Date();
      newResponse = `Today's date is ${now.toLocaleDateString()}.`;
    } else if (lowerCmd.includes('thank you') || lowerCmd.includes('thanks')) {
      newResponse = 'You\'re welcome! Is there anything else?';
    } else if (lowerCmd.includes('goodbye') || lowerCmd.includes('bye')) {
      newResponse = 'Goodbye! Have a great day!';
    } else {
      newResponse = "I'm not sure how to handle that command. Can you please rephrase?";
    }

    setResponse(newResponse); // Update the displayed response
    setIsLoading(false); // Hide loading indicator
    // Speak the response
    Speech.speak(newResponse, {
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Handle manual text input
  const handleTextInputSubmit = () => {
    if (command.trim()) {
      processCommand(command);
    }
  };

  // Scroll to the bottom of the chat display when new messages appear
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [response, command]); // Trigger scroll when response or command changes

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
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
            isListening || isSpeaking || isLoading ? styles.micButtonDisabled : null,
            isListening ? styles.micButtonActive : null,
          ]}
          onPress={isListening ? stopListening : startListening}
          disabled={isSpeaking || isLoading} // Disable button while Doro is speaking or loading
        >
          {isListening ? (
            <Ionicons name="mic-off" size={28} color="#fff" />
          ) : (
            <Ionicons name="mic" size={28} color="#fff" />
          )}
        </TouchableOpacity>
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
});

export default App;
