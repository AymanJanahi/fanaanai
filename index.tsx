/*
 * Fanaan AI Dashboard
 * Central logic for routing, page initialization, and API interactions.
 */
import { GoogleGenAI, Modality } from "@google/genai";

// Import page content as raw HTML strings
import homeContent from './pages/home.html?raw';
import veoContent from './pages/veo.html?raw';
import geminiImagesContent from './pages/gemini-images.html?raw';
import huggingfaceVideoContent from './pages/huggingface-video.html?raw';
import huggingfaceImagesContent from './pages/huggingface-images.html?raw';
import groqTextContent from './pages/groq-text.html?raw';
import groqTtsContent from './pages/groq-tts.html?raw';
import claudeTextContent from './pages/claude-text.html?raw';
import chatgptTextContent from './pages/chatgpt-text.html?raw';
import deepseekTextContent from './pages/deepseek-text.html?raw';
import openrouterContent from './pages/openrouter.html?raw';
import apiKeysContent from './pages/api-keys.html?raw';
import notFoundContent from './pages/not-found.html?raw';

// --- TYPE DEFINITIONS & GLOBAL DECLARATIONS ---

// FIX: Moved the AIStudio interface into the `declare global` block to ensure it has a single, global definition. This resolves the error about subsequent property declarations needing the same type by preventing module-scoped type conflicts for `window.aistudio`.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}

interface Route {
  path: string;
  content: string;
  title: string;
  init?: () => Promise<void> | void;
}

// --- UTILITY FUNCTIONS ---

/**
 * Gets an API key from local storage.
 * @param keyName The name of the key to retrieve.
 * @returns The key value or null if not found.
 */
const getApiKey = (keyName: string): string | null => {
  return localStorage.getItem(keyName);
};

/**
 * Sends a webhook with the result of a generation.
 * @param payload The data to send.
 */
const sendWebhook = async (payload: object) => {
  const webhookUrl = getApiKey('n8nWebhookUrl');
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }
};

/**
 * Handles generic text streaming from various API providers.
 * @param endpoint The API endpoint URL.
 * @param apiKey The API key.
 * @param body The request body.
 * @param responseEl The HTML element to stream the response into.
 * @param generateButton The button that triggered the generation.
 * @param onComplete Callback function when streaming is complete.
 */
const streamTextResponse = async (
  endpoint: string,
  apiKey: string,
  body: object,
  responseEl: HTMLElement,
  generateButton: HTMLButtonElement,
  onComplete: (fullText: string) => void
) => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    responseEl.innerHTML = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr.trim() === '[DONE]') continue;
          try {
            const chunk = JSON.parse(jsonStr);
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              fullText += text;
              // Naive HTML sanitation
              responseEl.textContent = fullText;
            }
          } catch (e) {
            // Ignore JSON parsing errors for incomplete chunks
          }
        }
      }
    }
    onComplete(fullText);
  } catch (error) {
    console.error('Streaming Error:', error);
    responseEl.textContent = error instanceof Error ? error.message : 'An unknown error occurred.';
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = 'Generate';
  }
};

/**
 * Handles text streaming specifically for the Anthropic (Claude) API.
 */
const streamClaudeResponse = async (
    apiKey: string,
    body: object,
    responseEl: HTMLElement,
    generateButton: HTMLButtonElement,
    onComplete: (fullText: string) => void
) => {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({ ...body, stream: true }),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        responseEl.innerHTML = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).split('\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    try {
                        const json = JSON.parse(line.substring(5));
                        if (json.type === 'content_block_delta' && json.delta.type === 'text_delta') {
                            fullText += json.delta.text;
                            responseEl.textContent = fullText;
                        }
                    } catch (e) {
                        // Ignore parsing errors
                    }
                }
            }
        }
        onComplete(fullText);
    } catch (error) {
        console.error('Claude Streaming Error:', error);
        responseEl.textContent = error instanceof Error ? error.message : 'An unknown error occurred.';
    } finally {
        generateButton.disabled = false;
        generateButton.innerHTML = 'Generate';
    }
};

/**
 * Generic initializer for all text generation pages.
 */
const initTextGenerationPage = (
    formId: string,
    responseId: string,
    apiKeyName: string,
    endpoint: string,
    isClaude: boolean = false,
) => {
    const form = document.getElementById(formId) as HTMLFormElement;
    const responseEl = document.getElementById(responseId) as HTMLDivElement;
    if (!form || !responseEl) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const model = formData.get('model') as string;
        const prompt = formData.get('prompt') as string;
        const useWebhook = (form.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked;
        const generateButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
        const apiKey = getApiKey(apiKeyName);

        if (!apiKey) {
            responseEl.textContent = `Error: ${apiKeyName} not found. Please set it in the API Keys page.`;
            return;
        }
        if (!prompt.trim()) {
            responseEl.textContent = 'Error: Prompt cannot be empty.';
            return;
        }

        generateButton.disabled = true;
        generateButton.innerHTML = `<div class="spinner"></div> Generating...`;
        responseEl.innerHTML = '<div class="animate-pulse bg-gray-700 rounded h-6 w-3/4"></div>';

        const body = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
        };

        const onComplete = (fullText: string) => {
            if (useWebhook) {
                sendWebhook({
                    source: formId,
                    success: true,
                    model: model,
                    prompt: prompt,
                    response: fullText,
                });
            }
        };

        if (isClaude) {
            await streamClaudeResponse(apiKey, body, responseEl, generateButton, onComplete);
        } else {
            await streamTextResponse(endpoint, apiKey, body, responseEl, generateButton, onComplete);
        }
    });
};


// --- PAGE INITIALIZERS ---

function initHomePage() {
  // No dynamic logic needed for the home page currently
}

async function initVeoPage() {
    const keyInfoDiv = document.getElementById('veo-key-info') as HTMLDivElement;
    const pageContentDiv = document.getElementById('veo-page-content') as HTMLDivElement;
    const selectKeyButton = document.getElementById('veo-select-key-button') as HTMLButtonElement;
    const form = document.getElementById('veo-form') as HTMLFormElement;
    const statusEl = document.getElementById('veo-status') as HTMLDivElement;
    const videoContainer = document.getElementById('veo-video-container') as HTMLDivElement;
    const videoPreview = document.getElementById('veo-video-preview') as HTMLVideoElement;
    const downloadLink = document.getElementById('veo-download-link') as HTMLAnchorElement;

    if (!form || !keyInfoDiv || !pageContentDiv || !selectKeyButton || !statusEl) return;
    
    const sessionKey = 'googleGenAiApiKeySelected';

    const showForm = () => {
        keyInfoDiv.classList.add('hidden');
        pageContentDiv.classList.remove('hidden');
    };

    const showKeyPrompt = () => {
        keyInfoDiv.classList.remove('hidden');
        pageContentDiv.classList.add('hidden');
        sessionStorage.removeItem(sessionKey);
    };

    if (!window.aistudio || typeof window.aistudio.hasSelectedApiKey !== 'function') {
        const keyInfoContent = keyInfoDiv.querySelector('p');
        const keyInfoTitle = keyInfoDiv.querySelector('h3');
        if (keyInfoTitle) keyInfoTitle.textContent = "Service Unavailable";
        if (keyInfoContent) keyInfoContent.textContent = "The API key selection service could not be loaded. Please ensure you are in the correct environment and reload the page.";
        selectKeyButton.classList.add('hidden');
        showKeyPrompt();
        return;
    }
    
    const hasKey = sessionStorage.getItem(sessionKey) === 'true' || await window.aistudio.hasSelectedApiKey();

    if (hasKey) {
        sessionStorage.setItem(sessionKey, 'true');
        showForm();
    } else {
        showKeyPrompt();
    }

    selectKeyButton.addEventListener('click', async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            sessionStorage.setItem(sessionKey, 'true');
            showForm();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const originalPrompt = formData.get('prompt') as string;
        const model = formData.get('model') as string;
        const length = formData.get('length') as string;
        const resolution = formData.get('resolution') as '720p' | '1080p';
        const aspectRatio = formData.get('aspectRatio') as '16:9' | '9:16';
        const useWebhook = (document.getElementById('veo-webhook-toggle') as HTMLInputElement).checked;
        const generateButton = document.getElementById('veo-generate-button') as HTMLButtonElement;

        const prompt = `A ${length} second video of ${originalPrompt}`;

        generateButton.disabled = true;
        videoContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');
        statusEl.innerHTML = `<div class="spinner"></div><span>Generating... this may take a few minutes.</span>`;
        statusEl.classList.remove('hidden');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            let operation = await ai.models.generateVideos({
                model: model,
                prompt: prompt,
                config: { numberOfVideos: 1, resolution, aspectRatio },
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation });
            }

            const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) throw new Error('Video generation failed to return a URI.');

            const videoUrl = `${videoUri}&key=${process.env.API_KEY!}`;
            const response = await fetch(videoUrl);
            const videoBlob = await response.blob();
            const blobUrl = URL.createObjectURL(videoBlob);
            videoPreview.src = blobUrl;
            videoPreview.controls = true;
            videoPreview.play().catch(e => console.error("Autoplay was prevented:", e));
            downloadLink.href = blobUrl;
            downloadLink.download = `fanaan-ai-veo-${Date.now()}.mp4`;
            videoContainer.classList.remove('hidden');
            downloadLink.classList.remove('hidden');
            statusEl.classList.add('hidden');


            if (useWebhook) {
                sendWebhook({
                    source: 'veo', success: true, prompt: originalPrompt,
                    videoUrl: blobUrl, // Note: blobUrl is temporary
                });
            }
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'An unknown error occurred.';
            statusEl.innerHTML = `<span class="text-red-400">Error: ${message}</span>`;
            if (message.includes("Requested entity was not found")) {
                showKeyPrompt();
                statusEl.innerHTML = `<span class="text-red-400">Error: Invalid API Key. Please select a valid key.</span>`;
            }
        } finally {
            generateButton.disabled = false;
        }
    });
}

async function initGeminiImagesPage() {
    const keyInfoDiv = document.getElementById('gemini-key-info') as HTMLDivElement;
    const pageContentDiv = document.getElementById('gemini-page-content') as HTMLDivElement;
    const selectKeyButton = document.getElementById('gemini-select-key-button') as HTMLButtonElement;
    const form = document.getElementById('gemini-image-form') as HTMLFormElement;
    const statusEl = document.getElementById('gemini-image-status') as HTMLDivElement;

    if (!form || !keyInfoDiv || !pageContentDiv || !selectKeyButton || !statusEl) return;

    const sessionKey = 'googleGenAiApiKeySelected';

    const showForm = () => {
        keyInfoDiv.classList.add('hidden');
        pageContentDiv.classList.remove('hidden');
    };

    const showKeyPrompt = () => {
        keyInfoDiv.classList.remove('hidden');
        pageContentDiv.classList.add('hidden');
        sessionStorage.removeItem(sessionKey);
    };

    if (!window.aistudio || typeof window.aistudio.hasSelectedApiKey !== 'function') {
        const keyInfoContent = keyInfoDiv.querySelector('p');
        const keyInfoTitle = keyInfoDiv.querySelector('h3');
        if (keyInfoTitle) keyInfoTitle.textContent = "Service Unavailable";
        if (keyInfoContent) keyInfoContent.textContent = "The API key selection service could not be loaded. Please ensure you are in the correct environment and reload the page.";
        selectKeyButton.classList.add('hidden');
        showKeyPrompt();
        return;
    }
    
    const hasKey = sessionStorage.getItem(sessionKey) === 'true' || await window.aistudio.hasSelectedApiKey();

    if (hasKey) {
        sessionStorage.setItem(sessionKey, 'true');
        showForm();
    } else {
        showKeyPrompt();
    }

    selectKeyButton.addEventListener('click', async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            sessionStorage.setItem(sessionKey, 'true');
            showForm();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const prompt = formData.get('prompt') as string;
        const useWebhook = (document.getElementById('gemini-image-webhook-toggle') as HTMLInputElement).checked;
        const generateButton = document.getElementById('gemini-image-generate-button') as HTMLButtonElement;
        const container = document.getElementById('gemini-image-container') as HTMLDivElement;
        const preview = document.getElementById('gemini-image-preview') as HTMLImageElement;
        
        generateButton.disabled = true;
        container.classList.add('hidden');
        statusEl.innerHTML = `<div class="spinner"></div><span>Generating...</span>`;
        statusEl.classList.remove('hidden');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1 },
            });
            const base64Image = response.generatedImages[0].image.imageBytes;
            const imageUrl = `data:image/png;base64,${base64Image}`;
            preview.src = imageUrl;
            container.classList.remove('hidden');
            statusEl.classList.add('hidden');
            
            if (useWebhook) sendWebhook({ source: 'gemini-images', success: true, prompt, imageUrl });

        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'An unknown error occurred.';
            statusEl.innerHTML = `<span class="text-red-400">Error: ${message}</span>`;
            if (message.includes("Requested entity was not found")) {
                showKeyPrompt();
                statusEl.innerHTML = `<span class="text-red-400">Error: Invalid API Key. Please select a valid key.</span>`;
            }
        } finally {
            generateButton.disabled = false;
        }
    });
}


async function initHuggingFaceVideoPage() {
    const form = document.getElementById('hf-video-form') as HTMLFormElement;
    if (!form) return;
    
    const modeTextBtn = document.getElementById('hf-video-mode-text') as HTMLButtonElement;
    const modeImageBtn = document.getElementById('hf-video-mode-image') as HTMLButtonElement;
    const modelSelect = document.getElementById('hf-video-model') as HTMLSelectElement;
    const promptContainer = document.getElementById('hf-video-prompt-container') as HTMLDivElement;
    const imageContainer = document.getElementById('hf-video-image-container') as HTMLDivElement;
    const statusEl = document.getElementById('hf-video-status') as HTMLDivElement;
    const videoContainer = document.getElementById('hf-video-container') as HTMLDivElement;
    const videoPreview = document.getElementById('hf-video-preview') as HTMLVideoElement;
    const downloadLink = document.getElementById('hf-video-download-link') as HTMLAnchorElement;

    const models = {
        'text-to-video': [{ id: 'cerspense/zeroscope-v2-576w', name: 'Zeroscope v2 576w' }],
        'image-to-video': [{ id: 'stabilityai/stable-video-diffusion-img2vid-xt', name: 'Stable Video Diffusion' }]
    };

    let currentMode: 'text-to-video' | 'image-to-video' = 'text-to-video';

    const updateFormForMode = () => {
        modelSelect.innerHTML = '';
        models[currentMode].forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });

        if (currentMode === 'text-to-video') {
            modeTextBtn.classList.replace('bg-gray-700', 'bg-indigo-600');
            modeImageBtn.classList.replace('bg-indigo-600', 'bg-gray-700');
            promptContainer.classList.remove('hidden');
            imageContainer.classList.add('hidden');
        } else {
            modeImageBtn.classList.replace('bg-gray-700', 'bg-indigo-600');
            modeTextBtn.classList.replace('bg-indigo-600', 'bg-gray-700');
            promptContainer.classList.add('hidden');
            imageContainer.classList.remove('hidden');
        }
    };
    
    modeTextBtn.addEventListener('click', () => { currentMode = 'text-to-video'; updateFormForMode(); });
    modeImageBtn.addEventListener('click', () => { currentMode = 'image-to-video'; updateFormForMode(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('huggingFaceKey');
        if (!apiKey) {
            statusEl.textContent = 'Error: Hugging Face API key not set.';
            statusEl.classList.remove('hidden');
            return;
        }
        
        const generateButton = document.getElementById('hf-video-generate-button') as HTMLButtonElement;
        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        videoContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');

        try {
            const formData = new FormData(form);
            const model = formData.get('model') as string;
            let data: any;
            if (currentMode === 'image-to-video') {
                const imageFile = formData.get('image') as File;
                if (!imageFile || imageFile.size === 0) throw new Error('Please select an image file.');
                data = imageFile;
            } else {
                data = { inputs: formData.get('prompt') };
            }

            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: data instanceof File ? data : JSON.stringify(data),
            });

            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
            
            const videoBlob = await response.blob();
            const blobUrl = URL.createObjectURL(videoBlob);
            videoPreview.src = blobUrl;
            downloadLink.href = blobUrl;
            videoContainer.classList.remove('hidden');
            downloadLink.classList.remove('hidden');

            if ((document.getElementById('hf-video-webhook-toggle') as HTMLInputElement).checked) {
                sendWebhook({ source: 'hf-video', success: true, mode: currentMode, model });
            }

        } catch (error) {
            console.error(error);
            statusEl.textContent = error instanceof Error ? error.message : 'An unknown error occurred.';
        } finally {
            generateButton.disabled = false;
             if (!statusEl.textContent?.startsWith("Error")) {
                statusEl.classList.add('hidden');
            }
        }
    });

    updateFormForMode();
}

async function initHuggingFaceImagesPage() {
    const form = document.getElementById('hf-image-form') as HTMLFormElement;
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('huggingFaceKey');
        if (!apiKey) {
             (document.getElementById('hf-image-status') as HTMLDivElement).textContent = 'Error: Hugging Face API key not set.';
             (document.getElementById('hf-image-status') as HTMLDivElement).classList.remove('hidden');
            return;
        }

        const formData = new FormData(form);
        const model = formData.get('model') as string;
        const prompt = formData.get('prompt') as string;
        const useWebhook = (document.getElementById('hf-image-webhook-toggle') as HTMLInputElement).checked;
        const generateButton = document.getElementById('hf-image-generate-button') as HTMLButtonElement;
        const statusEl = document.getElementById('hf-image-status') as HTMLDivElement;
        const container = document.getElementById('hf-image-container') as HTMLDivElement;
        const preview = document.getElementById('hf-image-preview') as HTMLImageElement;

        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        container.classList.add('hidden');

        try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: prompt }),
            });

            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);

            const imageBlob = await response.blob();
            const blobUrl = URL.createObjectURL(imageBlob);
            preview.src = blobUrl;
            container.classList.remove('hidden');
            if (useWebhook) sendWebhook({ source: 'hf-images', success: true, model, prompt, imageUrl: blobUrl });

        } catch (error) {
            console.error(error);
            statusEl.textContent = error instanceof Error ? error.message : 'An unknown error occurred.';
        } finally {
            generateButton.disabled = false;
            if (!statusEl.textContent?.startsWith("Error")) {
                statusEl.classList.add('hidden');
            }
        }
    });
}

async function initGroqTtsPage() {
    const form = document.getElementById('groq-tts-form') as HTMLFormElement;
    if (!form) return;

    const modelSelect = document.getElementById('groq-tts-model') as HTMLSelectElement;
    const voiceSelect = document.getElementById('groq-tts-voice') as HTMLSelectElement;
    const statusEl = document.getElementById('groq-tts-status') as HTMLDivElement;
    const audioContainer = document.getElementById('groq-tts-audio-container') as HTMLDivElement;
    const audioPreview = document.getElementById('groq-tts-audio-preview') as HTMLAudioElement;
    const downloadLink = document.getElementById('groq-tts-download-link') as HTMLAnchorElement;

    const voices = {
        "playai-tts": {
            male: ["Basil-PlayAI", "Briggs-PlayAI", "Calum-PlayAI", "Chip-PlayAI", "Cillian-PlayAI", "Fritz-PlayAI", "Mason-PlayAI", "Mikail-PlayAI", "Mitch-PlayAI", "Thunder-PlayAI"],
            female: ["Arista-PlayAI", "Atlas-PlayAI", "Celeste-PlayAI", "Cheyenne-PlayAI", "Deedee-PlayAI", "Gail-PlayAI", "Indigo-PlayAI", "Mamaw-PlayAI", "Quinn-PlayAI"]
        },
        "playai-tts-arabic": {
            male: ["Ahmad-PlayAI", "Khalid-PlayAI", "Nasser-PlayAI"],
            female: ["Amira-PlayAI"]
        }
    };
    
    const populateVoices = () => {
        const selectedModel = modelSelect.value as keyof typeof voices;
        voiceSelect.innerHTML = '';
        for (const gender in voices[selectedModel]) {
            const group = document.createElement('optgroup');
            group.label = gender.charAt(0).toUpperCase() + gender.slice(1);
            voices[selectedModel][gender as keyof typeof voices[typeof selectedModel]].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice;
                option.textContent = voice.replace('-PlayAI', '');
                group.appendChild(option);
            });
            voiceSelect.appendChild(group);
        }
    };
    
    modelSelect.addEventListener('change', populateVoices);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = getApiKey('groqKey');
        if (!apiKey) {
            statusEl.textContent = 'Error: Groq API key not set.';
            statusEl.classList.remove('hidden');
            return;
        }

        const generateButton = document.getElementById('groq-tts-generate-button') as HTMLButtonElement;
        generateButton.disabled = true;
        statusEl.classList.remove('hidden');
        audioContainer.classList.add('hidden');
        downloadLink.classList.add('hidden');

        try {
            const formData = new FormData(form);
            const model = formData.get('model') as string;
            const voice = formData.get('voice') as string;
            const text = formData.get('text') as string;
            
            const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model, input: text, voice })
            });

            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);

            const audioBlob = await response.blob();
            const blobUrl = URL.createObjectURL(audioBlob);
            audioPreview.src = blobUrl;
            downloadLink.href = blobUrl;
            audioContainer.classList.remove('hidden');
            downloadLink.classList.remove('hidden');

            if ((document.getElementById('groq-tts-webhook-toggle') as HTMLInputElement).checked) {
                sendWebhook({ source: 'groq-tts', success: true, model, voice, text });
            }

        } catch (error) {
            console.error(error);
            statusEl.textContent = error instanceof Error ? error.message : 'An unknown error occurred.';
        } finally {
            generateButton.disabled = false;
             if (!statusEl.textContent?.startsWith("Error")) {
                statusEl.classList.add('hidden');
            }
        }
    });
    
    populateVoices();
}

function initApiKeysPage() {
    const form = document.getElementById('api-keys-form') as HTMLFormElement;
    if (!form) return;

    const keyInputs = Array.from(form.querySelectorAll('input')).filter(el => el.type !== 'checkbox');
    const statusEl = document.getElementById('api-keys-status') as HTMLParagraphElement;

    // Load saved keys
    keyInputs.forEach(input => {
        const savedValue = localStorage.getItem(input.id);
        if (savedValue) {
            input.value = savedValue;
        }
    });
    
    // Save keys
    document.getElementById('save-keys-button')?.addEventListener('click', () => {
        keyInputs.forEach(input => {
            if (input.value) {
                localStorage.setItem(input.id, input.value);
            } else {
                localStorage.removeItem(input.id);
            }
        });
        statusEl.textContent = 'Saved!';
        statusEl.classList.remove('hidden');
        setTimeout(() => statusEl.classList.add('hidden'), 2000);
    });

    // Clear keys
    document.getElementById('clear-keys-button')?.addEventListener('click', () => {
        keyInputs.forEach(input => {
            localStorage.removeItem(input.id);
            input.value = '';
        });
    });

    // Toggle single password visibility
    form.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetInput = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement;
            const isPassword = targetInput.type === 'password';
            targetInput.type = isPassword ? 'text' : 'password';
        });
    });

    // Toggle all passwords visibility
    document.getElementById('toggle-all-keys-visibility')?.addEventListener('click', (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const isShowing = button.textContent === 'Hide All';
        form.querySelectorAll<HTMLInputElement>('input[type="password"], input[type="text"]').forEach(input => {
             if (input.id !== 'n8nWebhookUrl') input.type = isShowing ? 'password' : 'text';
        });
        button.textContent = isShowing ? 'Show All' : 'Hide All';
    });
}

// --- ROUTER & APP INITIALIZATION ---

const routes: Record<string, Route> = {
    'home': { path: 'home', content: homeContent, title: 'Home', init: initHomePage },
    'veo': { path: 'veo', content: veoContent, title: 'Generate Video (Veo)', init: initVeoPage },
    'gemini-images': { path: 'gemini-images', content: geminiImagesContent, title: 'Generate Images (Gemini)', init: initGeminiImagesPage },
    'huggingface-video': { path: 'huggingface-video', content: huggingfaceVideoContent, title: 'Generate Video (Hugging Face)', init: initHuggingFaceVideoPage },
    'huggingface-images': { path: 'huggingface-images', content: huggingfaceImagesContent, title: 'Generate Images (Hugging Face)', init: initHuggingFaceImagesPage },
    'groq-text': { path: 'groq-text', content: groqTextContent, title: 'Generate Text (Groq)', init: () => initTextGenerationPage('groq-text-form', 'groq-text-response', 'groqKey', 'https://api.groq.com/openai/v1/chat/completions') },
    'groq-tts': { path: 'groq-tts', content: groqTtsContent, title: 'Generate Speech (Groq)', init: initGroqTtsPage },
    'claude-text': { path: 'claude-text', content: claudeTextContent, title: 'Generate Text (Claude)', init: () => initTextGenerationPage('claude-text-form', 'claude-text-response', 'anthropicKey', 'https://api.anthropic.com/v1/messages', true) },
    'chatgpt-text': { path: 'chatgpt-text', content: chatgptTextContent, title: 'Generate Text (ChatGPT)', init: () => initTextGenerationPage('chatgpt-text-form', 'chatgpt-text-response', 'openAIKey', 'https://api.openai.com/v1/chat/completions') },
    'deepseek-text': { path: 'deepseek-text', content: deepseekTextContent, title: 'Generate Text (DeepSeek)', init: () => initTextGenerationPage('deepseek-text-form', 'deepseek-text-response', 'deepSeekKey', 'https://api.deepseek.com/chat/completions') },
    'openrouter': { path: 'openrouter', content: openrouterContent, title: 'Generate Text (OpenRouter)', init: () => initTextGenerationPage('openrouter-form', 'openrouter-response', 'openRouterKey', 'https://openrouter.ai/api/v1/chat/completions') },
    'api-keys': { path: 'api-keys', content: apiKeysContent, title: 'API Keys', init: initApiKeysPage },
};

const contentEl = document.getElementById('content') as HTMLElement;
const navLinks = document.querySelectorAll('.nav-link');

async function router() {
  const hash = window.location.hash.substring(1) || 'home';
  const route: Route = routes[hash] || { path: 'not-found', content: notFoundContent, title: 'Not Found' };
  
  document.title = `Fanaan AI | ${route.title}`;
  contentEl.innerHTML = route.content;

  if (route.init && typeof route.init === 'function') {
    await route.init();
  }

  // Update active nav link
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${hash}`);
  });
}

function initSidebar() {
    const toggleButton = document.getElementById('sidebar-toggle');
    const layout = document.querySelector('.dashboard-layout');
    toggleButton?.addEventListener('click', () => {
        layout?.classList.toggle('sidebar-collapsed');
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  window.addEventListener('hashchange', router);
  router(); // Initial page load
});
