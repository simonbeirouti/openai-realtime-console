/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';

import { X, Zap } from 'react-feather';
import { Button } from 'src/components/ui/button';

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello! Welcome to Rafiki OS.`,
        
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const scrollToBottom = () => {
      const conversationEl = document.querySelector('[data-conversation-content]') as HTMLDivElement;
      if (!conversationEl) return;
      
      // Force scroll to bottom
      conversationEl.scrollTop = conversationEl.scrollHeight;
    };

    // Scroll immediately
    scrollToBottom();

    // Scroll after content updates (multiple attempts to handle dynamic content)
    const timeouts = [50, 150, 300].map(delay => 
      setTimeout(scrollToBottom, delay)
    );

    // Cleanup timeouts
    return () => timeouts.forEach(timeout => clearTimeout(timeout));
  }, [items]);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions, voice: 'shimmer' });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * Render the application
   */
  return (
    <div className="h-full flex flex-col overflow-hidden mx-2 font-mono text-base font-normal">
      <div className="h-full flex-grow flex-shrink overflow-hidden mx-4 mb-20">
        <div className="flex-grow flex flex-col overflow-hidden h-[calc(100vh-120px)]">
          <div className="flex-grow">
            <div 
              className="flex-1 overflow-y-auto p-6 min-h-0 max-h-[calc(100vh-200px)] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-black/20 scrollbar-thumb-rounded"
              data-conversation-content
            >
              {!items.length && (
                <div className="flex flex-col justify-center items-center h-[80vh] text-center p-8 bg-white">
                  <h2 className="text-5xl font-semibold mb-6 text-center">
                    Karibu kwa Rafiki
                  </h2>
                  <p className="text-gray-500 mb-10 text-2xl text-center">
                    Msaidizi wako wa AI
                  </p>
                </div>
              )}
              {items.map((conversationItem, i) => {
                return (
                  <div 
                    className="flex flex-col gap-2 mb-6 p-4 my-2 rounded-lg bg-white/5"
                    key={conversationItem.id}
                  >
                    <div className={`text-lg pl-2 ${
                      conversationItem.role === 'user' ? 'text-[#0099ff]' : 'text-[#009900]'
                    }`}>
                      <div>
                        {(conversationItem.role || conversationItem.type).replaceAll(
                          '_',
                          ' '
                        )}
                      </div>
                    </div>
                    <div className={`flex-grow text-zinc-900 p-5 rounded-xl text-lg leading-relaxed max-w-[90%] ${
                      conversationItem.role === 'user' 
                        ? 'ml-auto bg-[#e8f5ff]' 
                        : 'mr-auto bg-[#f0fff4]'
                    }`}>
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'user' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              (conversationItem.formatted.audio?.length
                                ? '(awaiting transcript)'
                                : conversationItem.formatted.text ||
                                  '(item sent)')}
                          </div>
                      )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'assistant' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              conversationItem.formatted.text ||
                              '(truncated)'}
                          </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-8 bg-[var(--background)] flex justify-center">
            {!isConnected ? (
              <Button
                className="w-full max-w-[28rem] mx-auto flex items-center justify-center gap-2 py-6 text-2xl"
                onClick={() => {
                  connectConversation();
                  changeTurnEndType('server_vad');
                }}
                variant="default"
              >
                <Zap className="h-6 w-6" />
                Ongea na Rafiki
              </Button>
            ) : (
              <Button
                className="w-full max-w-[28rem] mx-auto flex items-center justify-center gap-2 py-6 text-2xl"
                onClick={disconnectConversation}
                variant="outline"
              >
                <X className="h-6 w-6" />
                Maliza Mazungumzo
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
