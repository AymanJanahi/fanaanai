import { GoogleGenAI, Modality } from '@google/genai';
import './index.css';
import homeContent from './pages/home.html?raw';
import veoContent from './pages/veo.html?raw';
import geminiImagesContent from './pages/gemini-images.html?raw';
import groqTextContent from './pages/groq-text.html?raw';
import groqTtsContent from './pages/groq-tts.html?raw';
import groqImagesContent from './pages/groq-images.html?raw';
import claudeTextContent from './pages/claude-text.html?raw';
import chatgptTextContent from './pages/chatgpt-text.html?raw';
import deepseekTextContent from './pages/deepseek-text.html?raw';
import openrouterContent from './pages/openrouter.html?raw';
import apiKeysContent from './pages/api-keys.html?raw';
import notFoundContent from './pages/not-found.html?raw';

// FIX: Replaced inline object with a named interface `AIStudio` to resolve type conflicts for `window.aistudio`.
// Type definitions for window.aistudio
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        aistudio: AIStudio;
    }
}

// Type definitions for API keys
type ApiKeys = {
  n8nWebhookUrl: string | null;
  googleGenAIKey: string | null;
  groqKey: string | null;
  openAIKey: string | null;
  anthropicKey: string | null;
  openRouterKey: string | null;
  deepSeekKey: string | null;
};

// --- ROUTER & NAVIGATION ---
type RouteConfig = {
    content: string;
    init: () => void;
};

const routes: { [key: string]: RouteConfig } = {
  '#home': { content: homeContent, init: initializeHomePage },
  '#veo': { content: veoContent, init: initializeVeoPage },
  '#gemini-images': { content: geminiImagesContent, init: initializeGeminiImagesPage },
  '#groq-text': { content: groqTextContent, init: () => initializeTextGenerationPage({
      pageId: 'groq-text',
      formId: 'groq-text-form',
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKeyName: 'groqKey',
      constructPayload: (model, prompt) => ({
        messages: [{ role: 'user', content: prompt }],
        model: model,
      }),
    })
  },
  '#groq-tts': { content: groqTtsContent, init: initializeGroqTtsPage },
  '#groq-images': { content: groqImagesContent, init: initializeGroqImagesPage },
  '#claude-text': { content: claudeTextContent, init: () => initializeTextGenerationPage({
      pageId: 'claude-text',
      formId: 'claude-text-form',
      apiUrl: 'https://api.anthropic.com/v1/messages', // Note: This is a placeholder. A proxy might be needed for CORS.
      apiKeyName: 'anthropicKey',
      constructPayload: (model, prompt) => ({
        model: model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      // Anthropic API requires specific headers
      extraHeaders: {
        'x-api-key': getApiKey('anthropicKey') || '',
        'anthropic-version': '2023-06-01'
      }
    })
  },
  '#chatgpt-text': { content: chatgptTextContent, init: () => initializeTextGenerationPage({
      pageId: 'chatgpt-text',
      formId: 'chatgpt-text-form',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeyName: 'openAIKey',
      constructPayload: (model, prompt) => ({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  },
  '#deepseek-text': { content: deepseekTextContent, init: () => initializeTextGenerationPage({
      pageId: 'deepseek-text',
      formId: 'deepseek-text-form',
      apiUrl: 'https://api.deepseek.com/chat/completions',
      apiKeyName: 'deepSeekKey',
      constructPayload: (model, prompt) => ({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  },
  '#openrouter': { content: openrouterContent, init: () => initializeTextGenerationPage({
      pageId: 'openrouter',
      formId: 'openrouter-form',
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKeyName: 'openRouterKey',
      constructPayload: (model, prompt) => ({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  },
  '#api-keys': { content: apiKeysContent, init: initializeApiKeysPage },
};

function navigate() {
  const hash = window.location.hash || '#home';
  const contentRoot = document.getElementById('content-root');
  if (!contentRoot) return;

  const routeConfig = routes[hash] || { content: notFoundContent, init: () => {} };

  contentRoot.innerHTML = routeConfig.content;
  // Use setTimeout to ensure the DOM is ready for initialization scripts
  setTimeout(() => {
    if (routeConfig.init) {
        routeConfig.init();
    }
  }, 0);

  // Update active link styling
  document.querySelectorAll('.nav-link').forEach(link => {
    const anchor = link as HTMLAnchorElement;
    if (anchor.hash === hash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// --- API KEY MANAGEMENT ---

function getApiKey(keyName: keyof ApiKeys): string | null {
    return localStorage.getItem(keyName);
}

function saveApiKeys() {
    const keys: ApiKeys = {
        n8nWebhookUrl: (document.getElementById('n8nWebhookUrl') as HTMLInputElement).value,
        googleGenAIKey: (document.getElementById('googleGenAIKey') as HTMLInputElement).value,
        groqKey: (document.getElementById('groqKey') as HTMLInputElement).value,
        openAIKey: (document.getElementById('openAIKey') as HTMLInputElement).value,
        anthropicKey: (document.getElementById('anthropicKey') as HTMLInputElement).value,
        openRouterKey: (document.getElementById('openRouterKey') as HTMLInputElement).value,
        deepSeekKey: (document.getElementById('deepSeekKey') as HTMLInputElement).value,
    };

    for (const key in keys) {
        localStorage.setItem(key, keys[key as keyof ApiKeys] || '');
    }
}


// --- WEBHOOKS ---
async function sendWebhook(service: string, status: string, data: object) {
    const webhookUrl = getApiKey('n8nWebhookUrl');
    if (!webhookUrl) return;

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service,
                status,
                ...data,
                timestamp: new Date().toISOString(),
            }),
        });
    } catch (error) {
        console.error('Webhook failed:', error);
    }
}

// --- PAGE INITIALIZERS ---

function initializeSidebar() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const body = document.body;
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    if (isCollapsed) {
        body.classList.add('sidebar-collapsed');
    }

    sidebarToggle?.addEventListener('click', () => {
        body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', body.classList.contains('sidebar-collapsed').toString());
    });
}

function initializeHomePage() {
  // No specific JS needed for the homepage currently
}

function initializeApiKeysPage() {
    const keyIds: (keyof ApiKeys)[] = ['n8nWebhookUrl', 'googleGenAIKey', 'groqKey', 'openAIKey', 'anthropicKey', 'openRouterKey', 'deepSeekKey'];
    keyIds.forEach(id => {
        const input = document.getElementById(id) as HTMLInputElement;
        if (input) {
            input.value = getApiKey(id) || '';
        }
    });

    document.getElementById('save-keys-button')?.addEventListener('click', () => {
        saveApiKeys();
        const statusEl = document.getElementById('api-keys-status');
        if (statusEl) {
            statusEl.textContent = 'Saved successfully!';
            statusEl.classList.remove('hidden');
            setTimeout(() => statusEl.classList.add('hidden'), 3000);
        }
    });

    document.getElementById('clear-keys-button')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all keys?')) {
            keyIds.forEach(id => {
                localStorage.removeItem(id);
                const input = document.getElementById(id) as HTMLInputElement;
                if(input) input.value = '';
            });
            const statusEl = document.getElementById('api-keys-status');
            if (statusEl) {
                statusEl.textContent = 'Cleared successfully!';
                statusEl.classList.remove('hidden');
                setTimeout(() => statusEl.classList.add('hidden'), 3000);
            }
        }
    });

    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', (event) => {
            const btn = event.currentTarget as HTMLButtonElement;
            const input = btn.previousElementSibling as HTMLInputElement;
            if (input.type === 'password') {
                input.type = 'text';
                btn.innerHTML = eyeIcon;
            } else {
                input.type = 'password';
                btn.innerHTML = eyeOffIcon;
            }
        });
    });
    
    const toggleAllBtn = document.getElementById('toggle-all-keys-visibility');
    toggleAllBtn?.addEventListener('click', () => {
        const firstKeyInput = document.getElementById('googleGenAIKey') as HTMLInputElement | null;
        // Determine the action based on the visibility of the first key. Default to "show" if not found.
        const shouldShow = firstKeyInput ? firstKeyInput.type === 'password' : true;

        document.querySelectorAll('.api-key-input-wrapper').forEach(wrapper => {
            const input = wrapper.querySelector('input');
            const toggle = wrapper.querySelector('.password-toggle');
            if (input && toggle) {
                input.type = shouldShow ? 'text' : 'password';
                toggle.innerHTML = shouldShow ? eyeIcon : eyeOffIcon;
            }
        });
        
        if(toggleAllBtn) {
            toggleAllBtn.textContent = shouldShow ? 'Hide All' : 'Show All';
        }
    });
}

async function initializeVeoPage() {
    const form = document.getElementById('veo-form') as HTMLFormElement;
    const generateButton = document.getElementById('veo-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('veo-status');
    const statusTextEl = statusEl?.querySelector('span');
    const videoContainer = document.getElementById('veo-video-container');
    const videoPreview = document.getElementById('veo-video-preview') as HTMLVideoElement;
    const downloadLink = document.getElementById('veo-download-link') as HTMLAnchorElement;

    const selectKeyButton = document.getElementById('veo-select-key-button') as HTMLButtonElement;
    const keyInfoDiv = document.getElementById('veo-key-info') as HTMLDivElement;
    const pageContentDiv = document.getElementById('veo-page-content') as HTMLDivElement;

    const checkApiKey = async () => {
        if (await window.aistudio.hasSelectedApiKey()) {
            keyInfoDiv.classList.add('hidden');
            pageContentDiv.classList.remove('hidden');
            return true;
        } else {
            keyInfoDiv.classList.remove('hidden');
            pageContentDiv.classList.add('hidden');
            return false;
        }
    };
    
    selectKeyButton?.addEventListener('click', async () => {
        await window.aistudio.openSelectKey();
        keyInfoDiv.classList.add('hidden');
        pageContentDiv.classList.remove('hidden');
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!await checkApiKey()) {
             alert('Please select a Google GenAI API key first.');
             return;
        }
        
        const apiKey = process.env.API_KEY; 
        if (!apiKey) {
            alert('API key not found. Please try selecting a key again.');
            await checkApiKey();
            return;
        }

        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        const resolution = formData.get('resolution') as '1080p' | '720p';
        const aspectRatio = formData.get('aspectRatio') as '16:9' | '9:16';

        generateButton.disabled = true;
        videoContainer?.classList.add('hidden');
        statusEl?.classList.remove('hidden');

        const progressMessages = [
            "Initializing request...", "Warming up the Veo model...", "Generating video frames...", 
            "Compositing video...", "Finalizing output...", "This is taking longer than usual..."
        ];
        let messageIndex = 0;
        if(statusTextEl) statusTextEl.textContent = progressMessages[messageIndex];
        const progressInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % progressMessages.length;
            if(statusTextEl) statusTextEl.textContent = progressMessages[messageIndex];
        }, 8000);

        try {
            const ai = new GoogleGenAI({ apiKey });
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                config: { numberOfVideos: 1, resolution, aspectRatio }
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation });
            }

            const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (videoUri) {
                const fullVideoUrl = `${videoUri}&key=${apiKey}`;
                videoPreview.src = fullVideoUrl;
                downloadLink.href = fullVideoUrl;
                videoContainer?.classList.remove('hidden');

                const webhookToggle = document.getElementById('veo-webhook-toggle') as HTMLInputElement;
                if (webhookToggle?.checked) {
                    sendWebhook('Veo', 'success', { prompt, videoUrl: fullVideoUrl });
                }
            } else {
                throw new Error('Video generation finished but no video URI was returned.');
            }
        } catch (error) {
            let message = 'Error generating video.';
            if (error instanceof Error) {
                message = error.message;
                if (message.includes('Requested entity was not found')) {
                    message = 'API Key is invalid or not found. Please select a valid key.';
                    await checkApiKey();
                }
            }
            if(statusTextEl) statusTextEl.textContent = message;
            console.error(error);
        } finally {
            clearInterval(progressInterval);
            statusEl?.classList.add('hidden');
            generateButton.disabled = false;
        }
    });

    checkApiKey();
}

async function initializeGeminiImagesPage() {
    const form = document.getElementById('gemini-image-form') as HTMLFormElement;
    const generateButton = document.getElementById('gemini-image-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('gemini-image-status');
    const imageContainer = document.getElementById('gemini-image-container');
    const imagePreview = document.getElementById('gemini-image-preview') as HTMLImageElement;

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('googleGenAIKey');
        if (!apiKey) {
            alert('Google GenAI API key not set.');
            return;
        }

        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;

        generateButton.disabled = true;
        imageContainer?.classList.add('hidden');
        statusEl?.classList.remove('hidden');

        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                  numberOfImages: 1,
                  outputMimeType: 'image/jpeg',
                  aspectRatio: '1:1',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                imagePreview.src = imageUrl;
                imageContainer?.classList.remove('hidden');

                const webhookToggle = document.getElementById('gemini-image-webhook-toggle') as HTMLInputElement;
                if (webhookToggle?.checked) {
                    sendWebhook('Gemini Images', 'success', { prompt, imageUrl: 'base64_image_data' });
                }
            } else {
                 throw new Error('No image was generated by the API.');
            }
        } catch (error) {
            if(statusEl) {
                const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                statusEl.textContent = `Error: ${message}`;
            }
            console.error(error);
        } finally {
            statusEl?.classList.add('hidden');
            generateButton.disabled = false;
        }
    });
}

async function initializeGroqTtsPage() {
    const form = document.getElementById('groq-tts-form') as HTMLFormElement;
    const modelSelect = document.getElementById('groq-tts-model') as HTMLSelectElement;
    const voiceSelect = document.getElementById('groq-tts-voice') as HTMLSelectElement;
    const generateButton = document.getElementById('groq-tts-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('groq-tts-status');
    const audioContainer = document.getElementById('groq-tts-audio-container');
    const audioPreview = document.getElementById('groq-tts-audio-preview') as HTMLAudioElement;

    type VoicesMap = {
        [key: string]: { [key: string]: string[] }
    };

    const ttsVoices: VoicesMap = {
        'playai-tts': {
            Male: [ 'Atlas-PlayAI', 'Basil-PlayAI', 'Briggs-PlayAI', 'Calum-PlayAI', 'Chip-PlayAI', 'Cillian-PlayAI', 'Fritz-PlayAI', 'Mason-PlayAI', 'Mikail-PlayAI', 'Mitch-PlayAI', 'Quinn-PlayAI', 'Thunder-PlayAI' ],
            Female: [ 'Arista-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Deedee-PlayAI', 'Gail-PlayAI', 'Indigo-PlayAI', 'Mamaw-PlayAI' ]
        },
        'playai-tts-arabic': {
            Male: ['Ahmad-PlayAI', 'Khalid-PlayAI', 'Nasser-PlayAI'],
            Female: ['Amira-PlayAI']
        }
    };

    function populateVoices(model: string) {
        if (!voiceSelect || !ttsVoices[model]) return;
        voiceSelect.innerHTML = '';
        const voices = ttsVoices[model];
        
        for (const gender in voices) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = gender;
            voices[gender].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice.replace('-PlayAI', '');
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        }
    }

    if (modelSelect) {
      populateVoices(modelSelect.value);
      modelSelect.addEventListener('change', () => populateVoices(modelSelect.value));
    }

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('groqKey');
        if (!apiKey) {
            alert('Groq API key not set.');
            return;
        }

        const formData = new FormData(form);
        const text = formData.get('text') as string;
        const voice = formData.get('voice') as string;
        const model = formData.get('model') as string;

        if (!text || !voice || !model) {
            alert('Please select a model, a voice, and enter some text.');
            return;
        }

        generateButton.disabled = true;
        audioContainer?.classList.add('hidden');
        statusEl?.classList.remove('hidden');
        
        if (audioPreview.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPreview.src);
        }

        try {
            const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    input: text,
                    voice: voice
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            audioPreview.src = audioUrl;
            audioPreview.load();
            audioContainer?.classList.remove('hidden');

            const webhookToggle = document.getElementById('groq-tts-webhook-toggle') as HTMLInputElement;
            if (webhookToggle?.checked) {
                sendWebhook('Groq TTS', 'success', { text, voice, model });
            }
        } catch (error) {
            if(statusEl) {
                const span = statusEl.querySelector('span');
                const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                if (span) span.textContent = `Error: ${message}`;
            }
            console.error(error);
        } finally {
            statusEl?.classList.add('hidden');
            generateButton.disabled = false;
        }
    });
}

async function initializeGroqImagesPage() {
    const form = document.getElementById('groq-image-form') as HTMLFormElement;
    const generateButton = document.getElementById('groq-image-generate-button') as HTMLButtonElement;
    const statusEl = document.getElementById('groq-image-status');
    const imageContainer = document.getElementById('groq-image-container');
    const imagePreview = document.getElementById('groq-image-preview') as HTMLImageElement;

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('googleGenAIKey');
        if (!apiKey) {
            alert('Google GenAI API key not set. This page uses it as Groq does not have an image API.');
            return;
        }

        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;

        generateButton.disabled = true;
        imageContainer?.classList.add('hidden');
        statusEl?.classList.remove('hidden');

        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: {
                parts: [{ text: prompt }],
              },
              config: {
                  responseModalities: [Modality.IMAGE],
              },
            });

            let imageUrl = '';
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                break;
              }
            }
            
            if (imageUrl) {
                imagePreview.src = imageUrl;
                imageContainer?.classList.remove('hidden');

                const webhookToggle = document.getElementById('groq-image-webhook-toggle') as HTMLInputElement;
                if (webhookToggle?.checked) {
                    sendWebhook('Groq Images', 'success', { prompt, imageUrl: 'base64_image_data' });
                }
            } else {
                throw new Error('No image was generated by the API.');
            }
        } catch (error) {
            if(statusEl) {
                const span = statusEl.querySelector('span');
                const message = error instanceof Error ? error.message : 'An unknown error occurred.';
                if(span) span.textContent = `Error: ${message}`;
            }
            console.error(error);
        } finally {
            statusEl?.classList.add('hidden');
            generateButton.disabled = false;
        }
    });
}


// A generic initializer for all text generation pages
interface TextGenConfig {
    pageId: string;
    formId: string;
    apiUrl: string;
    apiKeyName: keyof ApiKeys;
    constructPayload: (model: string, prompt: string) => object;
    extraHeaders?: HeadersInit;
}

function initializeTextGenerationPage(config: TextGenConfig) {
    const form = document.getElementById(config.formId) as HTMLFormElement;
    const generateButton = document.getElementById(`${config.pageId}-generate-button`) as HTMLButtonElement;
    const responseContainer = document.getElementById(`${config.pageId}-response`);

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey(config.apiKeyName);
        if (!apiKey) {
            alert(`API key for ${config.apiKeyName} not set.`);
            return;
        }

        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        const model = formData.get('model') as string;
        if (!prompt || !model) {
            alert('Please select a model and enter a prompt.');
            return;
        }

        generateButton.disabled = true;
        if(responseContainer) {
            responseContainer.innerHTML = `
                <div class="space-y-4 animate-pulse">
                    <div class="h-4 bg-gray-600 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-600 rounded"></div>
                    <div class="h-4 bg-gray-600 rounded w-5/6"></div>
                </div>`;
        }
        
        try {
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                ...config.extraHeaders
            };
            
            // Remove Authorization if extraHeaders already contains a different auth method (like x-api-key)
            if (config.extraHeaders && Object.keys(config.extraHeaders).some(k => k.toLowerCase() === 'x-api-key')) {
                delete (headers as any)['Authorization'];
            }

            const response = await fetch(config.apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(config.constructPayload(model, prompt)),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // Handle variations in API response structures
            const text = data.choices?.[0]?.message?.content || data.content?.[0]?.text || 'No content found.';

            if(responseContainer) {
                responseContainer.innerHTML = `<pre class="whitespace-pre-wrap word-wrap break-word">${text}</pre>`;
            }

            const webhookToggle = document.getElementById(`${config.pageId}-webhook-toggle`) as HTMLInputElement;
            if (webhookToggle?.checked) {
                sendWebhook(config.pageId, 'success', { prompt, model, response: text });
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'An unknown error occurred.';
            if(responseContainer) {
                responseContainer.innerHTML = `<p class="text-red-400">Error: ${message}</p>`;
            }
            console.error(error);
        } finally {
            generateButton.disabled = false;
        }
    });
}


// --- APP INITIALIZATION ---

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', () => {
  initializeSidebar();
  navigate();
});